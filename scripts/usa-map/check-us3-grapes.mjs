// Read-only: every grape a batch's knowledge names resolves in the live catalog
// (or is one of the file's new_grapes). node scripts/usa-map/check-us3-grapes.mjs --batch core|rest
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { US3_KNOWLEDGE } from "./us3-wave.mjs";

const batch = process.argv[process.argv.indexOf("--batch") + 1];
if (!US3_KNOWLEDGE[batch]) { console.error("usage: check-us3-grapes.mjs --batch core|rest"); process.exit(2); }
const s = JSON.parse(await readFile(US3_KNOWLEDGE[batch], "utf8"));
const names = [...new Set(Object.values(s.places).flatMap((p) => (p.grapes ?? []).map((g) => g.name)))];
const missing = await withReadOnly(async (c) => {
  const { rows } = await c.query("select name from public.grapes where name = any($1::text[])", [names]);
  const have = new Set(rows.map((r) => r.name));
  return names.filter((n) => !have.has(n) && !(s.new_grapes ?? []).some((g) => g.name === n));
});
console.log(JSON.stringify({ grapes: names.length, missing }));
if (missing.length) process.exitCode = 1;
