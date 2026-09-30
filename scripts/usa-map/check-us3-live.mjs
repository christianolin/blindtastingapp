// The read-only US-3 check for each sitting (plan 2026-09-30-usa-wine-map-us3
// Task 21). One `begin read only` ... `rollback` transaction; writes nothing.
// It says which state live is in: not started; catalog applied (DRAFT, maybe
// staged); promoted, where it runs the rehearsal's checks against live.
//
//   node --env-file=.env.local scripts/usa-map/check-us3-live.mjs --batch core|rest
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { loadLinks2 } from "./render-us3-sql.mjs";
import { compareHunk } from "./splice-boundary-expectations.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, shortlists } from "./us2-checks.mjs";
import { batchFacts, CHILDREN, CLICK_KEYS, EXPECTED_EDGES, caRelationships, clickResolution, placeDetails, promotedFacts } from "./us3-checks.mjs";
import { loadWave } from "./waves.mjs";

const argv = process.argv.slice(2);
const batch = argv.includes("--batch") ? argv[argv.indexOf("--batch") + 1] : null;
if (!["core", "rest"].includes(batch)) { console.error("usage: check-us3-live.mjs --batch core|rest"); process.exit(2); }
const wave = await loadWave(`us3-${batch}`);
const EXPECTED_PATH = `data/wine-map/review/usa-us3-${batch}-expected-boundaries.json`;
const links = batch === "core" ? await loadLinks2() : null;
const problems = [];
let promoted = false;

await withReadOnly(async (c) => {
  const recorded = async (v) => (await c.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const versions = {};
  for (const [what, v] of Object.entries(wave.versions)) versions[what] = await recorded(v);
  const f = await batchFacts(c, wave);
  console.log(`recorded: ${JSON.stringify(versions)}`);
  console.log(`facts: ${JSON.stringify(f)}`);
  if (f.places === 0) {
    if (versions.catalog) problems.push("the catalog is recorded but no place of this batch exists");
    console.log(`US-3 ${batch}: not started`);
    return;
  }
  if (f.verified === 0) {
    if (f.places !== wave.places.length) problems.push(`${f.places} places, expected ${wave.places.length}`);
    if (!versions.catalog) problems.push("places exist but the catalog is not recorded");
    if (f.draft_boundaries === 0 && !f.fresh) problems.push("the neighbour cache is stale with nothing staged");
    console.log(`US-3 ${batch}: ${f.places} DRAFT places; staged boundaries ${f.draft_boundaries}; knowledge recorded ${versions.knowledge} (not promoted yet)`);
    return;
  }
  promoted = true;
  for (const [key, v] of Object.entries(promotedFacts(wave))) if (f[key] !== v) problems.push(`${key} = ${f[key]}, expected ${v}`);
  if (!versions.promote) problems.push("places are VERIFIED but the promote is not recorded");

  const details = await placeDetails(c, wave.places.map((p) => p.key));
  for (const [key, d] of Object.entries(details)) if (!d || !d.article || d.grapes === 0 || d.styles === 0) problems.push(`${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(c, Object.keys(CHILDREN[batch]));
  for (const [key, want] of Object.entries(CHILDREN[batch])) if (kids[key]?.children !== want) problems.push(`${key} has ${kids[key]?.children} children, expected ${want}`);
  const rels = await caRelationships(c);
  for (const e of EXPECTED_EDGES[batch]) if (!rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target)) problems.push(`missing ${JSON.stringify(e)}`);
  for (const r of await clickResolution(c, CLICK_KEYS[batch])) if (r.resolved !== r.key) problems.push(`a click on ${r.key} selects ${r.resolved}`);
  const sl = await shortlists(c);
  if (sl.California.source !== "map") problems.push(`California's shortlist comes from ${sl.California.source}`);
  console.log(`California shortlist: ${sl.California.grapes.join(", ")}`);

  const expected = JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  const off = compareHunk(expected, await expectationRows(c));
  if (off.length) problems.push(`boundary expectations differ from ${EXPECTED_PATH}: ${off.join(", ")}`);

  if (links && versions.links) {
    problems.push(...archetypeProblems(await archetypeFacts(c, links), links));
  } else if (links) {
    console.log("archetype links step 2: not recorded yet (sitting step 11)");
  }
});

if (problems.length) {
  console.error(`US-3 ${batch} LIVE CHECK FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(promoted ? `US-3 ${batch} LIVE CHECK OK` : `US-3 ${batch} LIVE CHECK: not promoted yet; the state above is consistent`);
}
