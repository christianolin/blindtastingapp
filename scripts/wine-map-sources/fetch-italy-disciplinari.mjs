// Download the current Italian disciplinari di produzione from MASAF and
// extract them to text.
//
// The ministry publishes every DOP wine specification in force as three 7z
// archives — A-D, E-N, O-Z — linked from its "Elenchi e disciplinari vini DOP e
// IGP" page. 410 PDFs in total. This is the authoritative national text, and it
// supersedes the two sources tried before it:
//
//   catalogoviti.politicheagricole.it  served ~75 denominations, 8 of our 61.
//   eAmbrosia single documents         complete, but the single document is the
//                                      EU's SUMMARY. It compresses partial
//                                      inclusions, it lags the national text
//                                      (the attached Riviera del Garda document
//                                      still delimits the pre-2017 zone), and it
//                                      carries transcription errors of its own.
//
// The archive links are read off the index page rather than hardcoded: the
// ServeAttachment URLs carry a content hash and change whenever the ministry
// republishes.
//
// Requires pdftotext (poppler) and py7zr (`python -m pip install py7zr`) on the
// machine. Both are extraction tools, not build dependencies — this script is
// run by hand when the disciplinari are re-pulled, not in CI.
//
// Usage: node scripts/wine-map-sources/fetch-italy-disciplinari.mjs [--refresh]
import { mkdir, readdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WORK = path.resolve(".tiles-build", "italy-audit");
const PDFS = path.join(WORK, "masaf");
const TEXT = path.join(WORK, "disciplinari");
const INDEX_PAGE =
  "https://www.masaf.gov.it/flex/cm/pages/ServeBLOB.php/L/IT/IDPagina/4625";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";

const refresh = process.argv.includes("--refresh");
const curl = (args) =>
  execFileSync("curl", ["-sL", "-A", UA, ...args], { stdio: "pipe", maxBuffer: 128 << 20 });

await mkdir(PDFS, { recursive: true });
await mkdir(TEXT, { recursive: true });

// ---- 1. the archive links --------------------------------------------------
const page = curl([INDEX_PAGE]).toString("utf8");
const archives = [];
for (const m of page.matchAll(/<a[^>]+href="([^"]*ServeAttachment[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
  const label = m[2].replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
  if (/^Disciplinari DOP/i.test(label)) archives.push({ label, url: m[1].replace(/&amp;/g, "&") });
}
if (archives.length !== 3) {
  console.error(`expected 3 "Disciplinari DOP" archives on the index page, found ${archives.length}.`);
  console.error("The page layout has changed — check " + INDEX_PAGE);
  process.exit(1);
}

// ---- 2. download and unpack ------------------------------------------------
for (const [i, a] of archives.entries()) {
  const file = path.join(WORK, `disc-${i}.7z`);
  if (refresh || !existsSync(file)) {
    process.stdout.write(`  fetching ${a.label} ... `);
    curl([a.url, "-o", file]);
    console.log(`${(await stat(file)).size.toLocaleString()} bytes`);
  }
  execFileSync("python", ["-c", `
import py7zr, sys
with py7zr.SevenZipFile(sys.argv[1]) as z:
    names = [n for n in z.getnames() if n.lower().endswith('.pdf')]
    z.extract(path=sys.argv[2], targets=names)
print(len(names))
`, file, PDFS], { stdio: "pipe" });
}

// ---- 3. pdftotext ----------------------------------------------------------
let converted = 0, skipped = 0;
for (const dir of await readdir(PDFS)) {
  const full = path.join(PDFS, dir);
  if (!(await stat(full)).isDirectory()) continue;
  for (const pdf of await readdir(full)) {
    if (!pdf.toLowerCase().endsWith(".pdf")) continue;
    const out = path.join(TEXT, `${pdf.replace(/\.pdf$/i, "")}.txt`);
    if (!refresh && existsSync(out)) { skipped++; continue; }
    try {
      execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", path.join(full, pdf), out], { stdio: "pipe" });
      converted++;
    } catch {
      console.error(`  !! pdftotext failed on ${pdf}`);
    }
  }
}

const manifest = (await readdir(TEXT)).filter((f) => f.endsWith(".txt")).sort();
await writeFile(path.join(WORK, "disciplinari-manifest.json"),
  JSON.stringify({ fetched_on: new Date().toISOString().slice(0, 10), source: INDEX_PAGE, count: manifest.length, names: manifest.map((f) => f.replace(/\.txt$/, "")) }, null, 1));
console.log(`\n${manifest.length} disciplinari in ${TEXT} (${converted} converted, ${skipped} already present)`);
