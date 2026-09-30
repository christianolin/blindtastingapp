// The read-only US-4 check (plan 2026-09-30-usa-wine-map-us4 Task 13). One
// `begin read only` ... `rollback` transaction; writes nothing. It says which
// state live is in: not started; catalog applied (DRAFT, maybe staged);
// promoted, where it runs the rehearsal's checks against live.
//
//   node --env-file=.env.local scripts/usa-map/check-us4-live.mjs
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { compareHunk } from "./splice-boundary-expectations.mjs";
import { archetypeFacts, archetypeProblems, expectationRows, shortlists } from "./us2-checks.mjs";
import {
  CHILDREN, CLICK_KEYS, clickResolution, EXPECTED_EDGES, placeDetails, promotedFacts, scopeRelationships, waveFacts, willametteLink,
} from "./us4-checks.mjs";
import { loadWave } from "./waves.mjs";

if (process.argv.length > 2) { console.error("usage: check-us4-live.mjs"); process.exit(2); }
const wave = await loadWave("us4");
const link = await willametteLink();
const EXPECTED_PATH = "data/wine-map/review/usa-us4-expected-boundaries.json";
const LEADS = { Washington: "Cabernet Sauvignon", Oregon: "Pinot Noir", "New York": "Riesling" };
const problems = [];
let promoted = false;

await withReadOnly(async (c) => {
  const recorded = async (v) => (await c.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const versions = {};
  for (const [what, v] of Object.entries(wave.versions)) versions[what] = await recorded(v);
  const f = await waveFacts(c, wave);
  console.log(`recorded: ${JSON.stringify(versions)}`);
  console.log(`facts: ${JSON.stringify(f)}`);
  problems.push(...archetypeProblems(await archetypeFacts(c, [link]), [link]));
  if (f.other_states !== 0 || f.deferred !== 0) problems.push(`other_states ${f.other_states}, deferred ${f.deferred}: expected 0 and 0`);
  if (f.places === 0) {
    if (versions.catalog) problems.push("the catalog is recorded but no place of this wave exists");
    console.log("US-4: not started");
    return;
  }
  if (f.verified === 0) {
    if (f.places !== wave.places.length) problems.push(`${f.places} places, expected ${wave.places.length}`);
    if (!versions.catalog) problems.push("places exist but the catalog is not recorded");
    if (f.draft_boundaries === 0 && !f.fresh) problems.push("the neighbour cache is stale with nothing staged");
    console.log(`US-4: ${f.places} DRAFT places; staged boundaries ${f.draft_boundaries}; knowledge recorded ${versions.knowledge} (not promoted yet)`);
    return;
  }
  promoted = true;
  for (const [key, v] of Object.entries(promotedFacts(wave))) {
    if (!isDeepStrictEqual(f[key], v)) problems.push(`${key} = ${JSON.stringify(f[key])}, expected ${JSON.stringify(v)}`);
  }
  if (!versions.promote) problems.push("places are VERIFIED but the promote is not recorded");

  const details = await placeDetails(c, wave.places.map((p) => p.key));
  for (const [key, d] of Object.entries(details)) if (!d || !d.article || d.grapes === 0 || d.styles === 0) problems.push(`${key}: ${JSON.stringify(d)}`);
  const kids = await placeDetails(c, Object.keys(CHILDREN));
  for (const [key, want] of Object.entries(CHILDREN)) if (kids[key]?.children !== want) problems.push(`${key} has ${kids[key]?.children} children, expected ${want}`);
  const rels = await scopeRelationships(c);
  if (rels.length !== wave.after.scopeEdges) problems.push(`${rels.length} relationships under the three states, expected ${wave.after.scopeEdges}`);
  for (const e of EXPECTED_EDGES) if (!rels.some((r) => r.type === e.type && r.source === e.source && r.target === e.target)) problems.push(`missing ${JSON.stringify(e)}`);
  for (const r of await clickResolution(c, CLICK_KEYS)) if (r.resolved !== r.key) problems.push(`a click on ${r.key} selects ${r.resolved}`);
  const sl = await shortlists(c);
  for (const [state, lead] of Object.entries(LEADS)) {
    if (sl[state].source !== "map") problems.push(`${state}'s shortlist comes from ${sl[state].source}`);
    if (sl[state].grapes[0] !== lead) problems.push(`${state}'s shortlist leads with ${sl[state].grapes[0]}, not ${lead}`);
    console.log(`${state} shortlist: ${sl[state].grapes.join(", ")}`);
  }

  const expected = JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  const off = compareHunk(expected, await expectationRows(c));
  if (off.length) problems.push(`boundary expectations differ from ${EXPECTED_PATH}: ${off.join(", ")}`);
});

if (problems.length) {
  console.error(`US-4 LIVE CHECK FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else {
  console.log(promoted ? "US-4 LIVE CHECK OK" : "US-4 LIVE CHECK: not promoted yet; the state above is consistent");
}
