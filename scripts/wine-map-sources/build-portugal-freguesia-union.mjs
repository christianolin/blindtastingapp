// Portugal freguesia-union dissolver. Reads the pinned CAOP 2025 freguesias and
// concelhos files and, for each footprint, selects members by an explicit
// concordance (statute name -> CAOP unit, scoped to its concelho), dissolves
// them, drops interior rings, simplifies, rounds 5dp and writes
// data/wine-map/portugal-freguesias-dissolved.geojson.
//
// Why explicit and not fuzzy: freguesia names repeat across concelhos
// (Ribalonga in both Alijó and Carrazeda de Ansiães, Fonte Longa in both
// Carrazeda and Mêda), and the 2013 amalgamations mean a statute name is often
// a component of a "União das freguesias de …" unit rather than a unit itself.
// A silent wrong match puts a wrong shape on the map, so anything that does not
// resolve to exactly one unit aborts.
//
// Usage: node scripts/wine-map-sources/build-portugal-freguesia-union.mjs \
//          data/wine-map/portugal-subregion-membership.json
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const cfg = JSON.parse(await readFile(process.argv[2], "utf8"));
const FREG = JSON.parse(await readFile(".tiles-build/portugal/freguesias-caop.geojson", "utf8"));
const CONC = JSON.parse(await readFile(".tiles-build/portugal/concelhos-caop.geojson", "utf8"));

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/['’`.,()]/g, " ").replace(/\s+/g, " ").trim();

const fregByConcelho = new Map();
for (const f of FREG.features) {
  const key = norm(f.properties.concelho);
  if (!fregByConcelho.has(key)) fregByConcelho.set(key, []);
  fregByConcelho.get(key).push(f);
}
const concByName = new Map(CONC.features.map((f) => [norm(f.properties.name), f]));

// Candidate names a CAOP unit answers to: its own name, its simplified name,
// and — for an amalgamated unit — each component the statute might name.
const aliases = (unit) => {
  const name = unit.properties.name;
  const out = new Set([name, unit.properties.simplified]);
  const stripped = name.replace(/^Uni[ãa]o das freguesias (de |do |da |dos |das )?/i, "");
  out.add(stripped);
  const paren = stripped.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (paren) {
    const [, head, inner] = paren;
    out.add(head);
    for (const part of inner.split(/\s+e\s+/)) {
      out.add(part.trim());
      out.add(`${head} (${part.trim()})`);
    }
  }
  for (const part of stripped.split(/\s+e\s+/)) out.add(part.trim());
  return [...out].filter(Boolean);
};

const r5 = (x) => Math.round(x * 1e5) / 1e5;
const MIN_PART_AREA_DEG2 = 1e-5; // ~0.1 km2 at these latitudes
const shoelace = (r) => {
  let a = 0;
  for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2);
};

const dissolve = (slug) => {
  const tmpIn = `.tiles-build/portugal/_${slug}-fin.geojson`;
  const tmpOut = `.tiles-build/portugal/_${slug}-fout.geojson`;
  execSync(`npx mapshaper "${tmpIn}" -dissolve2 -simplify percentage=6% keep-shapes -o precision=0.00001 "${tmpOut}"`, { stdio: "pipe" });
  return tmpOut;
};

const outFeatures = [];
let hadError = false;

// A footprint declared as `union_of` is built from members already resolved for
// its children — the Douro region IS its three sub-regions, and deriving it that
// way means the region and its parts can never disagree.
const resolved = new Map();

for (const [slug, spec] of Object.entries(cfg.footprints)) {
  const members = [];
  const problems = [];

  for (const child of spec.union_of ?? []) {
    const kids = resolved.get(child);
    if (!kids) { problems.push(`union_of references ${child}, which is not built before it`); continue; }
    members.push(...kids);
  }

  for (const name of spec.whole_concelhos ?? []) {
    const f = concByName.get(norm(name));
    if (!f) { problems.push(`concelho not found: ${name}`); continue; }
    members.push(f);
  }

  for (const [concelho, wanted] of Object.entries(spec.freguesias ?? {})) {
    const units = fregByConcelho.get(norm(concelho));
    if (!units) { problems.push(`concelho not found: ${concelho}`); continue; }
    for (const want of wanted) {
      const mapped = cfg.concordance?.[concelho]?.[want] ?? want;
      const hits = units.filter((u) => aliases(u).some((a) => norm(a) === norm(mapped)));
      if (hits.length === 0) problems.push(`${concelho} / ${want}${mapped === want ? "" : ` (-> ${mapped})`}: no CAOP unit`);
      else if (hits.length > 1) problems.push(`${concelho} / ${want}: ambiguous -> ${hits.map((h) => h.properties.name).join(" | ")}`);
      else members.push(hits[0]);
    }
  }

  if (problems.length) {
    console.error(`[${slug}] UNRESOLVED:`);
    problems.forEach((p) => console.error(`    ${p}`));
    hadError = true;
    continue;
  }

  // De-duplicate: an amalgamated unit can legitimately be named by two of the
  // statute's pre-2013 names (Provesende and Gouvães do Douro are one unit now).
  const unique = [...new Map(members.map((f) => [f.properties.dtmnfr ?? f.properties.dtmn, f])).values()];
  resolved.set(slug, unique);

  const tmpIn = `.tiles-build/portugal/_${slug}-fin.geojson`;
  await writeFile(tmpIn, JSON.stringify({
    type: "FeatureCollection",
    features: unique.map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })),
  }));
  const tmpOut = dissolve(slug);
  const dis = JSON.parse(await readFile(tmpOut, "utf8"));
  const g = dis.type === "GeometryCollection" ? dis.geometries[0]
    : dis.type === "FeatureCollection" ? dis.features[0].geometry
    : dis.type === "Feature" ? dis.geometry : dis;

  const rings = (poly) => [poly[0].map(([a, b]) => [r5(a), r5(b)])];
  const all = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map(rings);
  const polys = all.filter((p) => shoelace(p[0]) >= MIN_PART_AREA_DEG2);
  if (polys.length === 0) polys.push(all.sort((a, b) => shoelace(b[0]) - shoelace(a[0]))[0]);
  if (polys.length !== all.length) console.log(`[${slug}] dropped ${all.length - polys.length} sliver part(s)`);

  const verts = polys.flat(2);
  outFeatures.push({
    type: "Feature",
    properties: {
      name: slug,
      units: unique.length,
      statute_names: Object.values(spec.freguesias ?? {}).reduce((n, l) => n + l.length, 0),
      whole_concelhos: (spec.whole_concelhos ?? []).length,
      legal: spec.legal ?? null,
      partial: spec.partial ?? {},
    },
    geometry: { type: "MultiPolygon", coordinates: polys },
  });
  console.log(`[${slug}] units=${unique.length} parts=${polys.length} verts=${verts.length}`);
}

if (hadError) {
  console.error("ABORT: unresolved members — fix the concordance before writing the artifact.");
  process.exit(1);
}

// Each wave writes its own artifact so an earlier wave's pinned checksum
// stays valid; the config names it.
const outPath = cfg._output ?? "data/wine-map/portugal-freguesias-dissolved.geojson";
await writeFile(outPath, JSON.stringify({
  type: "FeatureCollection",
  _provenance: {
    authority: "Direção-Geral do Território — CAOP 2025 (freguesia and concelho geometry) / DL 173/2009 and Portaria 296/2010 (membership)",
    licence: "CC BY 4.0",
    attribution: "Direção-Geral do Território",
    method: "freguesia-union: CAOP 2025 freguesias dissolved per the freguesia lists in the statutes, resolved through an explicit concordance (data/wine-map/portugal-subregion-membership.json). mapshaper 6% Visvalingam simplify with keep-shapes, interior rings dropped, 5dp, parts under ~0.1 km2 dropped. Where a statute names a freguesia only in part, or names individual quintas, the whole present-day unit is included and the exception is recorded in properties.partial.",
    caveat: "DL 173/2009 states that the Douro outlines correspond to the administrative boundaries in force in 1921, so present-day freguesia geometry approximates the legal area even before the 2013 amalgamations.",
    reviewed_at: "2026-09-10",
  },
  features: outFeatures,
}));
console.log(`WROTE ${outPath} (${outFeatures.length} features)`);
