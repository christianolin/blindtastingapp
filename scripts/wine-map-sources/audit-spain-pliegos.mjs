// Audit the committed Spanish DO membership against the pliegos it cites.
//
// Why this exists: spain-do-membership.json's own readme warns that the build
// guards "CANNOT detect a plausible-but-incomplete list" — expected_count is
// set by the same pass that writes the list, so an omission matches itself.
// That failure was then found in the wild: the Priorat and Montsant pliegos
// both include El Molar as a partial (polígono-level) inclusion and both of
// our lists dropped it, while correctly keeping Falset, the partial listed
// just before it.
//
// Method: for each DO, download its cited pliego, extract the text, isolate
// the delimitation section, and look for INE municipality names — restricted
// to that DO's own provinces — which appear in the pliego but not in our
// list. Province scoping is what makes this tractable: an unrestricted name
// scan over 8,217 municipios matches half the dictionary on common words.
//
// This reports candidates for a human to judge; it does not edit anything. A
// hit is not automatically a miss (a pliego often names neighbouring
// municipios when describing boundaries), which is exactly why the output is
// a review list rather than a patch.
//
// WHY THERE IS NO GEOMETRIC GUARD FOR THIS. Every false inclusion this audit
// found — Bocigas and Velilla (Ribera del Duero), Ulea (Bullas), Cea (Tierra de
// Leon) — showed up as a small DETACHED part of the footprint, which made a
// "flag small, distant parts" guard look obvious. It was measured before being
// built, and it does not work. Detached parts are normal for Spanish DOs:
// Vinos de Madrid is legitimately two clusters (the smaller 38% of its area),
// Rias Baixas has 127 parts across five separate subzones, and Costers del
// Segre has a legitimate single-municipality island. A 0.02% area-share
// threshold — sitting in the gap between the false inclusions and Alicante's
// offshore islets — trips 29 of the 69 current DOs. Distance discriminates even
// worse: the false Ulea part sat ~1 km from the main body while Alicante's
// genuine islets are 12 km out.
//
// The thing that separates a false inclusion from a legitimate island is not
// its shape, it is that the municipality is absent from the statute. That is a
// membership check, which is what this script does. Geometry cannot stand in
// for reading the pliego.
//
// Requires pdftotext on PATH (poppler).
//
// Usage: node scripts/wine-map-sources/audit-spain-pliegos.mjs [--only <substr>] [--all]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { loadMunicipioCache } from "./fetch-spain-municipios.mjs";

const MEMBERSHIP = "data/wine-map/spain-do-membership.json";
const WORK = path.resolve(".tiles-build", "spain-audit");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";

const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const all = argv.includes("--all");

const norm = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// "Puebla de Sanabria, La" -> also "La Puebla de Sanabria"; pliegos use either.
const variants = (name) => {
  const out = new Set([name]);
  const m = String(name).match(/^(.*),\s*(El|La|Los|Las|L'|A|O|Os|As)$/i);
  if (m) out.add(`${m[2]} ${m[1]}`);
  const m2 = String(name).match(/^(El|La|Los|Las|A|O)\s+(.*)$/i);
  if (m2) out.add(`${m2[2]}, ${m2[1]}`);
  return [...out];
};

const membership = JSON.parse(await readFile(MEMBERSHIP, "utf8"));
const cache = await loadMunicipioCache();
const municipios = cache.municipios ?? cache;

// INE province code -> its municipality names.
const byProv = new Map();
for (const m of municipios) {
  const prov = String(m.prov_code ?? m.province_code ?? "").padStart(2, "0");
  if (!byProv.has(prov)) byProv.set(prov, []);
  for (const a of m.aliases ?? [m.mun_name]) byProv.get(prov).push(a);
}

const targets = membership.denominations.filter((d) => {
  if (only) return d.canonical_key.includes(only);
  if (all) return true;
  return /parte|pol[ií]gono|pago|partial|over-approx/i.test(d.provenance?.note ?? "");
});

await mkdir(WORK, { recursive: true });
console.log(`auditing ${targets.length} DO(s)\n`);

const findings = [];
for (const d of targets) {
  const key = d.canonical_key;
  const url = d.provenance?.url ?? "";
  if (!/\.pdf($|\?)/i.test(url)) {
    findings.push({ key, status: "NO_PDF_CITED", detail: url || "(no url)" });
    console.log(`${key}\n  !! citation is not a pliego PDF: ${url || "(none)"}\n`);
    continue;
  }
  const pdf = path.join(WORK, `${key.replace(/\./g, "_")}.pdf`);
  const txt = pdf.replace(/\.pdf$/, ".txt");
  try {
    if (!existsSync(txt)) {
      execFileSync("curl", ["-sL", "-A", UA, url, "-o", pdf], { stdio: "pipe" });
      execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdf, txt], { stdio: "pipe" });
    }
  } catch {
    findings.push({ key, status: "FETCH_FAILED", detail: url });
    console.log(`${key}\n  !! could not fetch/extract ${url}\n`);
    continue;
  }
  const text = await readFile(txt, "utf8");

  // Isolate the delimitation section: from the geographic-area heading to the
  // next numbered section. Falling back to the whole document would flood the
  // scan with names from the descriptive/history prose.
  const startRe = /(DELIMITACI[ÓO]N DEL [ÁA]REA GEOGR[ÁA]FICA|ZONA DE PRODUCCI[ÓO]N|[ÁA]REA GEOGR[ÁA]FICA DELIMITADA)/i;
  const si = text.search(startRe);
  const block = si >= 0 ? text.slice(si, si + 14000) : text.slice(0, 14000);
  // Keep commas and newlines: they are what delimit an enumeration, and
  // stripping them is what allowed substrings to match.
  const nb = block
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9,;:.()\n ]/g, " ").replace(/[ \t]+/g, " ");

  const ourNames = new Set((d.municipios ?? []).flatMap((m) => variants(m.name ?? "")).map(norm));
  const provs = (d.provinces ?? []).map((p) => String(p).padStart(2, "0"));
  const pool = provs.flatMap((p) => byProv.get(p) ?? []);

  const candidates = [];
  for (const name of new Set(pool)) {
    const nn = norm(name);
    // Short names produce noise ("Toro" inside "Toronjil"); require a word
    // boundary and a reasonable length.
    if (nn.length < 5) continue;
    if (ourNames.has(nn)) continue;
    // The name must stand as its own list item, delimited by punctuation, a
    // line break or the conjunction "y". Plain word boundaries were not
    // enough: they matched "Tabara" inside "Faramontanos de Tabara", "Valls"
    // inside "Valls del Riu Corb", and "Grado" inside the word "grado" in a
    // results table — none of them members.
    const hit = variants(name).some((v) =>
      new RegExp(
        `(?:^|[,;:.()]|\\by\\b|\\n)\\s*${norm(v).replace(/ /g, "\\s+")}\\s*(?:$|[,;:.()]|\\by\\b|\\n)`,
      ).test(nb));
    if (hit) candidates.push(name);
  }

  const status = candidates.length ? "REVIEW" : "ok";
  findings.push({ key, status, ours: d.municipios.length, candidates });
  console.log(`${key}  (${d.municipios.length} in our list)`);
  if (candidates.length) {
    console.log(`  ?? named in the pliego's delimitation but NOT in our list:`);
    console.log(`     ${candidates.join(", ")}`);
  } else {
    console.log("  no unlisted municipality names found in the delimitation section");
  }
  console.log("");
}

await writeFile(path.join(WORK, "findings.json"), JSON.stringify(findings, null, 2));
const review = findings.filter((f) => f.status === "REVIEW");
const broken = findings.filter((f) => f.status !== "ok" && f.status !== "REVIEW");
console.log(`\n${findings.length} audited: ${findings.length - review.length - broken.length} clean, ${review.length} need review, ${broken.length} unverifiable.`);
if (broken.length) broken.forEach((b) => console.log(`  ${b.status}: ${b.key}`));
