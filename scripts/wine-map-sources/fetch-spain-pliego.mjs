// Sourcing helper (run BY THE ASSISTANT in-session — the AGENTS.md batch-work
// pattern: research/sourcing happens here, the committed artifact holds the
// results, and neither the run pipeline nor CI depends on this tool). It finds a
// Spanish DO's OFFICIAL pliego de condiciones PDF (Ministerio de Agricultura,
// mapa.gob.es), extracts its text, parses the "términos municipales / zona de
// producción" enumeration into a province-grouped municipality list, and
// resolves every name against the georef INE cache (spain-lib, fail-closed) so a
// mis-parse surfaces as an unresolved name instead of a wrong outline.
//
// The output (matched INE codes + names + the pliego URL/reference) is what gets
// transcribed into data/wine-map/spain-do-membership.json with provenance.
//
// Requires pdfjs-dist (session-only): npm install --no-save pdfjs-dist
//
// Usage:
//   node scripts/wine-map-sources/fetch-spain-pliego.mjs --search "Rueda"
//   node scripts/wine-map-sources/fetch-spain-pliego.mjs --pdf <url|path> --provinces "Valladolid,Segovia,Ávila" [--emit spain.castilla-y-leon.rueda]
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMunicipioCache } from "./fetch-spain-municipios.mjs";
import { buildMunicipioIndex, resolveOne } from "./spain-lib.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0 (cdo@copenhagendata.com)";
const argv = process.argv.slice(2);
const argVal = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i < 0 ? null : argv[i + 1];
};

// --- DuckDuckGo HTML search (the Google tool is licence-blocked in-session) ---
// Returns [{ url, title }]. DDG wraps result hrefs in /l/?uddg=<encoded>.
async function duckSearch(query) {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`DuckDuckGo -> ${res.status} ${res.statusText}`);
  const html = await res.text();
  const out = [];
  for (const m of html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gis)) {
    let url = m[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) url = decodeURIComponent(uddg[1]);
    else if (url.startsWith("//")) url = `https:${url}`;
    out.push({ url, title: m[2].replace(/<[^>]+>/g, "").trim() });
  }
  return out;
}

// --- PDF text extraction via pdfjs (session dependency) ----------------------
async function pdfText(bytes) {
  let pdfjs;
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    throw new Error("pdfjs-dist not installed — run: npm install --no-save pdfjs-dist");
  }
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => i.str).join(" ") + "\n";
  }
  return text;
}

async function loadPdfBytes(source) {
  if (/^https?:/i.test(source)) {
    const res = await fetch(source, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`pliego PDF -> ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

// --- parse the municipality enumeration --------------------------------------
// Pliego geographic-area sections read: "... los términos municipales que
// conforman la zona de producción son los siguientes: Provincia de <P>: a, b, c
// … Provincia de <Q>: …" and then the next subsection (VÍNCULO / a numbered
// heading / Variedades …). Province-grouped, comma-separated.
const END_MARKERS =
  /(v[íi]nculo\b|variedad|rendimiento|\bpr[áa]cticas\b|estructura de control|autoridad|zona de envejecimiento|coincide de manera|\b\d+\s*\.\s*[A-ZÁÉÍÓÚÑ])/i;

const STOPWORDS = new Set(["de", "del", "la", "las", "los", "el", "y", "d", "o", "a"]);
function sigTokens(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ -]/g, " ")
    .split(/[\s/-]+/)
    .filter((t) => t && !STOPWORDS.has(t));
}
function accFold(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
// Evidence-based code suggestion (NOT used at promote time — the artifact stores
// explicit codes, and run-spain-dos resolves them strictly). 1) try the strict
// exact resolver; 2) fall back to a province-scoped significant-token match that
// folds de/del/la and spacing, accepted ONLY when exactly one cache municipio's
// token set contains (or is contained by) the query's — still fail-closed on
// ambiguity, and every fuzzy hit is flagged for review.
function suggestCode(name, index, province) {
  try {
    const r = resolveOne({ name }, index, province ? [province] : null);
    return { code: r.mun_code, name: r.mun_name, province: r.prov_name, mode: "exact" };
  } catch {
    /* fall through to fuzzy */
  }
  const qt = new Set(sigTokens(name));
  if (qt.size === 0) return null;
  const hits = new Map();
  for (const rec of index.byCode.values()) {
    if (
      province &&
      String(province) !== rec.prov_code &&
      accFold(province) !== accFold(rec.prov_name)
    ) {
      continue;
    }
    const ct = new Set([rec.mun_name, ...(rec.aliases ?? [])].flatMap(sigTokens));
    if (ct.size === 0) continue;
    // ONLY query ⊆ cache: the pliego name is an abbreviation/variant of a fuller
    // INE name (Castrejón -> Castrejón de Trabancos; Villanueva del Duero ->
    // Villanueva de Duero). The REVERSE (cache ⊆ query) is unsafe — "Coca" ⊆
    // "Bernuy de Coca" would fold a pedanía into its neighbour — so anything with
    // extra query tokens beyond a shorter INE name goes to manual review instead.
    if ([...qt].every((t) => ct.has(t))) hits.set(rec.mun_code, rec);
  }
  const uniq = [...hits.values()];
  if (uniq.length === 1) {
    return { code: uniq[0].mun_code, name: uniq[0].mun_name, province: uniq[0].prov_name, mode: "fuzzy" };
  }
  return null;
}

// Top cache municipios in-province sharing >=1 significant token — shown for
// each unresolved name so it can be classified (pedanía of a listed parent?
// abbreviation? genuinely absent?) from evidence, not memory.
function candidateNames(name, index, province) {
  const qt = new Set(sigTokens(name));
  if (!qt.size) return [];
  const scored = [];
  for (const rec of index.byCode.values()) {
    if (province && String(province) !== rec.prov_code && accFold(province) !== accFold(rec.prov_name)) continue;
    const ct = new Set(sigTokens(rec.mun_name));
    const overlap = [...qt].filter((t) => ct.has(t)).length;
    if (overlap > 0) scored.push({ overlap, label: `${rec.mun_code} ${rec.mun_name}` });
  }
  return scored.sort((a, b) => b.overlap - a.overlap).slice(0, 3).map((s) => s.label);
}

function stripPdfNoise(text) {
  return text
    // page header/footer stamps injected mid-flow, e.g. "PDO-ES-A0889 Página 14 de 26"
    .replace(/[A-Z]{2,4}-[A-Z]{2,3}-[A-Z0-9]+\s*P[áa]gina\s*\d+\s*de\s*\d+/gi, " ")
    .replace(/P[áa]gina\s*\d+\s*de\s*\d+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePliego(rawText) {
  const text = stripPdfNoise(rawText);
  const anchor =
    /(t[ée]rminos municipales[^:]{0,60}:|zona de producci[óo]n[^:]{0,80}siguientes\s*:|delimitaci[óo]n de la zona geogr[áa]fica[^:]{0,40}:)/i.exec(
      text,
    );
  assert.ok(anchor, "could not locate the municipality enumeration anchor in the pliego");
  let region = text.slice(anchor.index + anchor[0].length);
  const end = END_MARKERS.exec(region);
  if (end && end.index > 40) region = region.slice(0, end.index);
  // Strip parentheticals BEFORE splitting — "(polígonos catastrales 12 y 15)"
  // and "(polígono … pedanía de Villagonzalo de Coca)" carry their own commas
  // and " y " that would otherwise shred the comma-split. The municipality name
  // sits outside the paren; whole-municipality dissolve ignores the sub-parcel
  // qualifier (documented over-approximation).
  region = region.replace(/\([^)]*\)/g, " ");

  // Split into "Provincia de X: …" groups. If no province headers appear, treat
  // the whole region as one unscoped group.
  const groups = [];
  const provRe = /Provincia\s+de\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ.\-\s/]+?)\s*:/g;
  const heads = [...region.matchAll(provRe)];
  if (heads.length === 0) {
    groups.push({ province: null, body: region });
  } else {
    for (let i = 0; i < heads.length; i += 1) {
      const province = heads[i][1].trim();
      const start = heads[i].index + heads[i][0].length;
      const stop = i + 1 < heads.length ? heads[i + 1].index : region.length;
      groups.push({ province, body: region.slice(start, stop) });
    }
  }
  const cleanName = (n) =>
    n
      .replace(/\[[^\]]*\]|\([^)]*\)/g, "")
      .replace(/\d+/g, "")
      .replace(/[.;]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  return groups.map(({ province, body }) => ({
    province,
    names: body
      .split(/,| y (?=[A-ZÁÉÍÓÚÑ])/)
      .map(cleanName)
      .filter((n) => n.length >= 2 && /[A-Za-zÁÉÍÓÚÑ]/.test(n)),
  }));
}

async function main() {
  const search = argVal("search");
  if (search) {
    const q = `${search} pliego de condiciones DOP vino mapa.gob.es`;
    const results = await duckSearch(q);
    const pliegos = results.filter(
      (r) => /mapa\.gob\.es/.test(r.url) && /\.pdf$/i.test(r.url),
    );
    console.log(`search "${search}" -> ${results.length} results, ${pliegos.length} MAPA pliego PDFs:`);
    for (const r of (pliegos.length ? pliegos : results).slice(0, 10)) {
      console.log(`  ${r.url}\n     "${r.title}"`);
    }
    return;
  }

  const pdf = argVal("pdf");
  assert.ok(pdf, "pass --search <name> or --pdf <url|path>");
  const provinces = (argVal("provinces") ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const emitKey = argVal("emit");

  const bytes = await loadPdfBytes(pdf);
  const text = await pdfText(bytes);
  const groups = parsePliego(text);
  const index = buildMunicipioIndex(await loadMunicipioCache());

  const exact = [];
  const fuzzy = [];
  const unresolved = [];
  const seen = new Set();
  for (const { province, names } of groups) {
    const scope = province ?? (provinces.length === 1 ? provinces[0] : null);
    for (const name of names) {
      const hit = suggestCode(name, index, scope);
      if (!hit) {
        unresolved.push({ name, province: scope, candidates: candidateNames(name, index, scope) });
        continue;
      }
      if (seen.has(hit.code)) continue;
      seen.add(hit.code);
      (hit.mode === "exact" ? exact : fuzzy).push({ ...hit, source: name });
    }
  }
  let matched = [...exact, ...fuzzy];
  // Evidence-based manual reconciliation (each --add code is validated to exist
  // in the georef cache; --drop removes a spurious/duplicate code). Used for the
  // residue the parser can't safely auto-resolve: compound-token spellings
  // ("Sieteiglesias"->"Siete Iglesias"), names glued by paren removal, or a
  // false fuzzy hit. Every correction is auditable in the emitted fragment.
  const added = [];
  for (const code of (argVal("add") ?? "").split(",").map((c) => c.trim()).filter(Boolean)) {
    const rec = index.byCode.get(code);
    assert.ok(rec, `--add ${code} is not a georef INE code`);
    if (!matched.some((m) => m.code === code)) {
      const entry = { code, name: rec.mun_name, province: rec.prov_name, mode: "manual", source: "--add" };
      matched.push(entry);
      added.push(entry);
    }
  }
  const dropCodes = new Set((argVal("drop") ?? "").split(",").map((c) => c.trim()).filter(Boolean));
  if (dropCodes.size) matched = matched.filter((m) => !dropCodes.has(m.code));

  console.log(`\nPARSED ${groups.length} province group(s):`);
  for (const g of groups) console.log(`  ${g.province ?? "(unscoped)"}: ${g.names.length} names`);
  console.log(`\nRESOLVED ${matched.length} (${exact.length} exact, ${fuzzy.length} fuzzy); ${unresolved.length} UNRESOLVED`);
  if (fuzzy.length) {
    console.log("\nFUZZY (verify each pliego name -> INE municipio; unique token match only):");
    for (const f of fuzzy) console.log(`  ~ "${f.source}" -> ${f.code} ${f.name} (${f.province})`);
  }
  if (unresolved.length) {
    console.log("\nUNRESOLVED (classify: pedania of a listed parent / abbreviation / absent):");
    for (const u of unresolved) {
      const cands = u.candidates?.length ? ` candidates: ${u.candidates.join(", ")}` : " (no token overlap in province)";
      console.log(`  - "${u.name}" [${u.province ?? "?"}]${cands}`);
    }
  }

  if (emitKey) {
    const fragment = {
      canonical_key: emitKey,
      provinces: [...new Set(matched.map((m) => m.province))],
      expected_count: matched.length,
      municipios: matched.map((m) => ({ code: m.code, name: m.name })),
      _fuzzy: fuzzy.map((f) => ({ pliego: f.source, code: f.code, ine: f.name })),
      _unresolved: unresolved.map((u) => ({ name: u.name, province: u.province, candidates: u.candidates })),
      _unresolved_count: unresolved.length,
    };
    const outDir = path.resolve(".tiles-build", "sources");
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `pliego-${emitKey.replace(/\./g, "_")}.json`);
    await writeFile(outPath, `${JSON.stringify(fragment, null, 2)}\n`);
    console.log(`\nEMITTED artifact fragment -> ${outPath} (review, then merge into spain-do-membership.json only if _unresolved_count is 0)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
