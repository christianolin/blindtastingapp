// Spain DO membership resolver — the fail-closed name/code -> INE mun_code
// mapping the whole Spain run leans on. A DO's official municipality list (from
// its BOE pliego de condiciones) is compiled in data/wine-map/spain-do-membership.json;
// this library resolves each entry against the georef municipio cache
// (fetch-spain-municipios.mjs) and REFUSES to guess: any municipality that
// doesn't resolve to exactly one INE code halts the DO rather than shipping a
// wrong outline. This is the exact hazard flagged in the plan — membership must
// come from pliegos, not recall — so the resolver fails closed on every
// ambiguity and every mismatch.
//
// Two matching modes, both fail-closed:
//   - code-first  ({ code, name }): the INE code is authoritative; when a name
//     is also given it's validated for consistency (catches a transcription
//     typo). Recommended for bilingual comunidades (Galicia/Cataluña/Valencia/
//     País Vasco), where the georef name is the co-official form and a Castilian
//     pliego name would not match by text.
//   - name-only  ({ name }): resolved accent-insensitively, province-scoped,
//     against every co-official spelling; 0 or >1 matches throw. Fine for
//     Castilian-only comunidades (Castilla y León, La Rioja, …).
import assert from "node:assert/strict";

// Lowercase + strip diacritics. Ñ -> n is intentional: pliego vs dataset differ
// on ñ/n often enough that folding it widens correct matches without creating
// realistic collisions between distinct municipality names.
function stripAccentsLower(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function collapse(value) {
  return value.replace(/['\u2019\u2018`´]/g, " ").replace(/\s+/g, " ").trim();
}

// Every normalized comparison key for a municipality name. Handles:
//  - accents/case (stripAccentsLower),
//  - the INE comma-inverted article form: "Coruña, A" / "Rioja, La" -> the
//    natural "a coruña" / "la rioja",
//  - bilingual slash forms: "Donostia/San Sebastián" -> the whole plus each side.
// Returns a de-duplicated array; a record is indexed under all of its keys so a
// query matching any one of them resolves.
export function nameKeys(raw) {
  const base = collapse(stripAccentsLower(raw));
  if (!base) return [];
  const slashParts = base.split("/").map((part) => collapse(part)).filter(Boolean);
  const variants = slashParts.length > 1 ? [base, ...slashParts] : [base];
  const keys = new Set();
  for (const variant of variants) {
    keys.add(variant);
    // ", <article>" (Castilian el/la/los/las or co-official a/o/as/os/l/es/sa)
    const inverted = /^(.*),\s*([a-z']{1,3})$/.exec(variant);
    if (inverted) keys.add(collapse(`${inverted[2]} ${inverted[1]}`));
  }
  return [...keys];
}

// { byCode: Map<mun_code, record>, byKey: Map<nameKey, record[]> } over the
// georef cache. A record appears under every key its name + aliases produce.
export function buildMunicipioIndex(cache) {
  assert.ok(cache && Array.isArray(cache.municipios), "invalid municipio cache");
  const byCode = new Map();
  const byKey = new Map();
  for (const record of cache.municipios) {
    byCode.set(record.mun_code, record);
    const names = [record.mun_name, ...(record.aliases ?? [])].filter(Boolean);
    for (const key of new Set(names.flatMap(nameKeys))) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(record);
    }
  }
  return { byCode, byKey };
}

function provinceMatch(record, provinces) {
  if (!provinces || provinces.length === 0) return true;
  return provinces.some(
    (p) =>
      String(p) === record.prov_code ||
      stripAccentsLower(p) === stripAccentsLower(record.prov_name),
  );
}

function nameMatchesRecord(name, record) {
  const want = new Set(nameKeys(name));
  const have = [record.mun_name, ...(record.aliases ?? [])]
    .filter(Boolean)
    .flatMap(nameKeys);
  return have.some((key) => want.has(key));
}

// Resolve one { code?, name? } spec to exactly one georef record or throw.
export function resolveOne(spec, index, provinces = null) {
  const { byCode, byKey } = index;
  const label = spec.name ? `"${spec.name}"` : `code ${spec.code}`;
  if (spec.code) {
    const record = byCode.get(spec.code);
    assert.ok(record, `mun_code ${spec.code} (${spec.name ?? "?"}) not in georef cache`);
    assert.ok(
      !spec.name || nameMatchesRecord(spec.name, record),
      `mun_code ${spec.code} is "${record.mun_name}" but the artifact calls it "${spec.name}" — transcription mismatch`,
    );
    assert.ok(
      provinceMatch(record, provinces),
      `mun_code ${spec.code} (${record.mun_name}) is province ${record.prov_code}/${record.prov_name}, outside declared ${JSON.stringify(provinces)}`,
    );
    return record;
  }
  assert.ok(spec.name, "membership spec needs a code or a name");
  const hits = new Map();
  for (const key of nameKeys(spec.name)) {
    for (const record of byKey.get(key) ?? []) {
      if (provinceMatch(record, provinces)) hits.set(record.mun_code, record);
    }
  }
  const list = [...hits.values()];
  assert.equal(
    list.length,
    1,
    `municipio ${label}${provinces ? ` in provinces ${JSON.stringify(provinces)}` : ""} ` +
      `resolved to ${list.length} matches — need exactly 1 (fail-closed)` +
      (list.length > 1
        ? ` [${list.map((r) => `${r.mun_code} ${r.mun_name}/${r.prov_name}`).join(", ")}]`
        : ""),
  );
  return list[0];
}

// Flatten an entry's several accepted shapes into [{ code?, name? }]:
//   entry.municipios: [{code,name} | {code} | {name} | "Name"]
//   entry.municipio_names: ["Name", …]
//   entry.mun_codes: ["43001", …]
function specsOf(entry) {
  const specs = [];
  for (const item of entry.municipios ?? []) {
    if (typeof item === "string") specs.push({ name: item });
    else specs.push({ code: item.code, name: item.name });
  }
  for (const name of entry.municipio_names ?? []) specs.push({ name });
  for (const code of entry.mun_codes ?? []) specs.push({ code });
  return specs;
}

// Resolve a whole DO entry to its deduped georef records, fail-closed on any
// unresolved/ambiguous/duplicate municipality and on an expected-count mismatch.
export function resolveMembership(entry, index) {
  const provinces = entry.provinces ?? null;
  const specs = specsOf(entry);
  assert.ok(specs.length > 0, `${entry.canonical_key}: no municipalities listed`);
  const byCode = new Map();
  for (const spec of specs) {
    const record = resolveOne(spec, index, provinces);
    assert.ok(
      !byCode.has(record.mun_code),
      `${entry.canonical_key}: municipio ${record.mun_code} (${record.mun_name}) listed twice`,
    );
    byCode.set(record.mun_code, record);
  }
  const records = [...byCode.values()];
  if (entry.expected_count != null) {
    assert.equal(
      records.length,
      entry.expected_count,
      `${entry.canonical_key}: resolved ${records.length} municipios but expected_count is ${entry.expected_count}`,
    );
  }
  return records;
}
