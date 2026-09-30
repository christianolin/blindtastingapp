// node scripts/usa-map/order-us3-profiles.mjs --batch core|rest
// Rewrites the batch's knowledge file with its places in wave order (a pure reorder).
import { readFile, writeFile } from "node:fs/promises";
import { sortToWaveOrder } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";

const batch = process.argv[process.argv.indexOf("--batch") + 1];
if (!["core", "rest"].includes(batch)) { console.error("usage: order-us3-profiles.mjs --batch core|rest"); process.exit(2); }
const wave = await loadWave(`us3-${batch}`);
const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
await writeFile(wave.knowledgeSource, `${JSON.stringify(sortToWaveOrder(source, wave), null, 2)}\n`);
console.log(`ordered ${Object.keys(source.places).length} places in ${wave.knowledgeSource}`);
