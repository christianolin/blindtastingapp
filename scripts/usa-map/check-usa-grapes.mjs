// Read-only: every grape a wave's knowledge names resolves in the live catalog
// (or is one of the file's new_grapes). node scripts/usa-map/check-usa-grapes.mjs --wave <name>
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { loadWave, WAVES } from "./waves.mjs";

const name = process.argv[process.argv.indexOf("--wave") + 1];
if (!WAVES.includes(name)) { console.error(`usage: check-usa-grapes.mjs --wave <${WAVES.join("|")}>`); process.exit(2); }
const s = JSON.parse(await readFile((await loadWave(name)).knowledgeSource, "utf8"));
const names = [...new Set(Object.values(s.places).flatMap((p) => (p.grapes ?? []).map((g) => g.name)))];
const newNames = (s.new_grapes ?? []).map((g) => g.name);
const result = await withReadOnly(async (c) => {
  const { rows } = await c.query("select name from public.grapes where name = any($1::text[])", [names]);
  const have = new Set(rows.map((r) => r.name));
  return { missing: names.filter((n) => !have.has(n) && !newNames.includes(n)), new_but_live: newNames.filter((n) => have.has(n)) };
});
console.log(JSON.stringify({ grapes: names.length, ...result }));
if (result.missing.length) process.exitCode = 1;
