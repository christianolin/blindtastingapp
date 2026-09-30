// node scripts/usa-map/order-usa-profiles.mjs --wave <us3-core|us3-rest|us4>
// Rewrites the wave's knowledge file with its places in wave order (a pure reorder).
import { readFile, writeFile } from "node:fs/promises";
import { sortToWaveOrder } from "./usa-us3-knowledge.mjs";
import { loadWave, WAVES } from "./waves.mjs";

const name = process.argv[process.argv.indexOf("--wave") + 1];
const allowed = WAVES.filter((w) => w !== "us2");
if (!allowed.includes(name)) { console.error(`usage: order-usa-profiles.mjs --wave <${allowed.join("|")}>`); process.exit(2); }
const wave = await loadWave(name);
const source = JSON.parse(await readFile(wave.knowledgeSource, "utf8"));
await writeFile(wave.knowledgeSource, `${JSON.stringify(sortToWaveOrder(source, wave), null, 2)}\n`);
console.log(`ordered ${Object.keys(source.places).length} places in ${wave.knowledgeSource}`);
