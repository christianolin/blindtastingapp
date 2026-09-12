// Audit the recovered Italian comune membership against the MASAF disciplinari.
//
// The Italian equivalent of audit-spain-pliegos.mjs. That audit found seven
// wrong DOs in Spain, including three cases of a name lifted from descriptive
// text — a river, a pedanía, a unidad poblacional — matched against the
// municipality register. Italy has never had the equivalent check: until
// data/wine-map/italy-doc-membership.json existed there was nothing to check.
//
// Source: catalogoviti.politicheagricole.it serves each denomination's
// disciplinare as a PDF at scheda_denom.php?t=dsc&q=<id>. The ids are
// alphabetical but sparse, so index-italy-disciplinari.mjs crawls the band once
// and caches a name -> id map that this script reads.
//
// Method, and its limits. An Italian disciplinare names its comuni in a
// "zona di produzione" sentence ("comprende in tutto i territori dei comuni di
// X e Y e in parte i territori dei comuni di Z"), but then usually delimits the
// zone by physical geography — ridgelines, roads, contour heights — exactly as
// the Alentejo Portaria does. So the comune sentence is what can be checked
// mechanically; the metes-and-bounds cannot. This script therefore reports
// ISTAT comune names that appear in the disciplinare's opening zone section but
// not in our list, scoped to the footprint's own region, for a human to judge.
// A hit is a candidate, not a verdict: disciplinari name neighbouring comuni
// when describing where a boundary runs, which is precisely how "Ulea" — a
// river in the Bullas pliego — became a false member in Spain.
//
// Usage: node scripts/wine-map-sources/audit-italy-disciplinari.mjs [--only <substr>]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WORK = path.resolve(".tiles-build", "italy-audit");
const INDEX = path.join(WORK, "disciplinare-index.json");
const MEMBERSHIP = "data/wine-map/italy-doc-membership.json";
const COMUNI = ".tiles-build/sicily/it-comuni.geojson";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";
const BASE = "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

const norm = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]/g, "");
// Keep punctuation and newlines when normalising a block: they delimit an
// enumeration, and stripping them lets substrings match (the Spanish audit
// matched "Tabara" inside "Faramontanos de Tabara" before this was fixed).
const normBlock = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9,;:.()\n ]/g, " ").replace(/[ \t]+/g, " ");

if (!existsSync(INDEX)) {
  console.error(`no disciplinare index at ${INDEX} — run index-italy-disciplinari.mjs first`);
  process.exit(1);
}
const index = JSON.parse(await readFile(INDEX, "utf8"));
const byName = new Map();
for (const [id, name] of Object.entries(index)) {
  if (name) byName.set(norm(name), Number(id));
}

const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const comuni = JSON.parse(await readFile(COMUNI, "utf8"));
const comuniByRegion = new Map();
for (const f of comuni.features) {
  const r = f.properties.reg_name;
  if (!comuniByRegion.has(r)) comuniByRegion.set(r, []);
  comuniByRegion.get(r).push(f.properties.name);
}

// "montefalco-sagrantino" -> candidate denomination names to look up.
const lookupNames = (key) => {
  const slug = key.split("/")[1];
  const spaced = slug.replace(/-/g, " ");
  const out = new Set([spaced]);
  // Sub-denominations are filed under their base name ("montefalco-sagrantino"
  // is inside the MONTEFALCO disciplinare).
  const words = spaced.split(" ");
  for (let i = words.length - 1; i >= 1; i--) out.add(words.slice(0, i).join(" "));
  return [...out];
};

await mkdir(WORK, { recursive: true });
const findings = [];
const targets = Object.entries(membership.footprints).filter(([k]) => !only || k.includes(only));
console.log(`auditing ${targets.length} footprint(s)\n`);

for (const [key, fp] of targets) {
  let id = null, matchedName = null;
  for (const cand of lookupNames(key)) {
    const hit = byName.get(norm(cand));
    if (hit) { id = hit; matchedName = cand; break; }
  }
  if (!id) {
    findings.push({ key, status: "NO_DISCIPLINARE_FOUND" });
    console.log(`${key}\n  !! no disciplinare matched in the index\n`);
    continue;
  }

  const pdf = path.join(WORK, `${key.replace(/[/]/g, "_")}.pdf`);
  const txt = pdf.replace(/\.pdf$/, ".txt");
  try {
    if (!existsSync(txt)) {
      execFileSync("curl", ["-sL", "-A", UA, `${BASE}${id}`, "-o", pdf], { stdio: "pipe" });
      execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, txt], { stdio: "pipe" });
    }
  } catch {
    findings.push({ key, status: "FETCH_FAILED", id });
    console.log(`${key}\n  !! could not fetch/extract id ${id}\n`);
    continue;
  }
  const text = await readFile(txt, "utf8");

  // The zone section: from the "zona di produzione" heading far enough to cover
  // the comune sentence, stopping well before the metes-and-bounds prose runs
  // into unrelated articles.
  const si = text.search(/zona di produzione|base ampelografica|delimitazione/i);
  const block = normBlock(si >= 0 ? text.slice(si, si + 6000) : text.slice(0, 6000));

  const ourNames = new Set(fp.comuni.map((c) => norm(c.name)));
  const pool = comuniByRegion.get(fp.region) ?? [];
  const candidates = [];
  for (const name of new Set(pool)) {
    const nn = norm(name);
    if (nn.length < 5 || ourNames.has(nn)) continue;
    const re = new RegExp(
      `(?:^|[,;:.()]|\\be\\b|\\n)\\s*${name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, "\\s+")}\\s*(?:$|[,;:.()]|\\be\\b|\\n)`,
    );
    if (re.test(block)) candidates.push(name);
  }

  const status = candidates.length ? "REVIEW" : "ok";
  findings.push({ key, status, id, matchedName, ours: fp.comuni.length, candidates });
  console.log(`${key}  (id ${id}, ${fp.comuni.length} comuni)`);
  console.log(candidates.length
    ? `  ?? in the disciplinare's zone section but NOT in our list:\n     ${candidates.join(", ")}`
    : "  no unlisted comune names found in the zone section");
  console.log("");
}

await writeFile(path.join(WORK, "findings.json"), JSON.stringify(findings, null, 2));
const review = findings.filter((f) => f.status === "REVIEW").length;
const broken = findings.filter((f) => f.status !== "ok" && f.status !== "REVIEW").length;
console.log(`\n${findings.length} audited: ${findings.length - review - broken} clean, ${review} need review, ${broken} unresolved.`);
