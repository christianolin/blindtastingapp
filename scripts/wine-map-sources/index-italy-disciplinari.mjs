// Build a name -> id index of the MASAF Catalogo Viti disciplinari.
//
// catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=<id> serves a
// denomination's disciplinare as a PDF. The ids are ordered alphabetically by
// denomination name (2069 CIRCEO, 2070 CIRO, 2072 COLLI ALBANI) but are sparse,
// so the band has to be crawled once. The result is cached to disk; the audit
// script reads the index rather than re-crawling.
//
// Only page 1 of each PDF is extracted, which is where the denomination name
// sits — enough to index without paying to parse the whole document.
//
// Usage: node scripts/wine-map-sources/index-italy-disciplinari.mjs [from] [to]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const WORK = path.resolve(".tiles-build", "italy-audit");
const INDEX = path.join(WORK, "disciplinare-index.json");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) blindtasting-wine-map/1.0";
const BASE = "http://catalogoviti.politicheagricole.it/scheda_denom.php?t=dsc&q=";

const from = Number(process.argv[2] ?? 2000);
const to = Number(process.argv[3] ?? 2350);

await mkdir(WORK, { recursive: true });
const index = existsSync(INDEX) ? JSON.parse(await readFile(INDEX, "utf8")) : {};

const tmpPdf = path.join(WORK, "_probe.pdf");
let added = 0, empty = 0;
for (let q = from; q <= to; q++) {
  if (index[q] !== undefined) continue;
  try {
    execFileSync("curl", ["-sL", "-A", UA, `${BASE}${q}`, "-o", tmpPdf], { stdio: "pipe" });
    // -l 1: first page only. The denomination name is in the title block.
    const txt = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", "-l", "1", tmpPdf, "-"], {
      stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 << 20,
    }).toString("utf8");
    const m = txt.match(/«([^»]{2,60})»/);
    if (m) {
      index[q] = m[1].trim();
      added++;
      process.stdout.write(`  ${q} ${index[q]}\n`);
    } else {
      index[q] = null;
      empty++;
    }
  } catch {
    index[q] = null;
    empty++;
  }
  if ((q - from) % 25 === 24) await writeFile(INDEX, JSON.stringify(index, null, 1));
}

await writeFile(INDEX, JSON.stringify(index, null, 1));
const named = Object.values(index).filter(Boolean).length;
console.log(`\nindexed ${named} denominations (${added} new this run, ${empty} empty ids) -> ${INDEX}`);
