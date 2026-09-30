// The read-only US-2 check for the sitting (plan 2026-09-29-usa-wine-map-us2
// Task 14; runbook docs/superpowers/plans/2026-09-29-usa-wine-map-us2-sitting.md).
// One `begin read only` ... `rollback` transaction; writes nothing. It knows
// the three states live can be in and says which one it found:
//   - no united-states place: "not promoted yet" (before the catalog);
//   - 16 DRAFT places: the catalog (and perhaps the knowledge) is applied, the
//     boundaries may be staged; checks the cache is fresh unless a stage is
//     pending, and stops there;
//   - promoted: the rehearsal's checks, against live: 16 VERIFIED, 16 current
//     VALIDATED, 1 relationship, cache fresh, 16 keys locked, 10 outlines; an
//     article, grapes and styles for the country, each state and Central
//     Valley; the four shortlists from the map; the boundary-expectations hunk
//     equal to the committed usa-us2-expected-boundaries.json; and, once the
//     archetype links are recorded, the three typical wines on their places.
// Exit 0 with "US-2 LIVE CHECK OK" (or the pre-promote state line), 1 with the
// differences.
//
//   node --env-file=.env.local scripts/usa-map/check-us2-live.mjs
import { readFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { loadLinks } from "./render-us2-sql.mjs";
import { compareHunk } from "./splice-boundary-expectations.mjs";
import {
  archetypeFacts, archetypeProblems, contexts, expectationRows, postPromoteFacts, shortlists,
} from "./us2-checks.mjs";
import { US2_VERSIONS } from "./us2-wave.mjs";

const EXPECTED_PATH = "data/wine-map/review/usa-us2-expected-boundaries.json";
const links = await loadLinks();
const problems = [];
let promoted = false;

await withReadOnly(async (c) => {
  const recorded = async (v) => (await c.query("select 1 from supabase_migrations.schema_migrations where version = $1", [v])).rowCount > 0;
  const facts = await postPromoteFacts(c);
  const versions = {};
  for (const k of ["catalog", "knowledge", "promote", "links"]) versions[k] = await recorded(US2_VERSIONS[k]);
  console.log(`recorded: ${JSON.stringify(versions)}`);
  console.log(`facts: ${JSON.stringify(facts)}`);

  if (facts.places === 0) {
    if (versions.catalog) problems.push("the catalog is recorded but no united-states place exists");
    console.log("united-states places: 0 (not promoted yet)");
    return;
  }
  if (facts.verified === 0) {
    if (facts.places !== 16) problems.push(`${facts.places} united-states places, expected 16`);
    if (!versions.catalog) problems.push("united-states places exist but the catalog is not recorded");
    if (facts.draft_boundaries === 0 && !facts.fresh) problems.push("the neighbour cache is stale with nothing staged");
    console.log(`united-states places: ${facts.places} DRAFT; staged boundaries: ${facts.draft_boundaries}; cache fresh: ${facts.fresh}; knowledge recorded: ${versions.knowledge} (not promoted yet)`);
    return;
  }

  promoted = true;
  const want = { places: 16, verified: 16, current_validated: 16, draft_boundaries: 0, relationships: 1, fresh: true, locked: 16, outline: 10 };
  for (const [k, v] of Object.entries(want)) if (facts[k] !== v) problems.push(`${k} = ${facts[k]}, expected ${v}`);
  if (!versions.promote) problems.push("places are VERIFIED but the promote is not recorded");

  const ctx = await contexts(c);
  for (const [key, x] of Object.entries(ctx)) {
    if (!x || !x.article || x.grapes === 0 || x.styles === 0) problems.push(`${key}: context ${JSON.stringify(x)}`);
  }
  if (ctx["united-states"]?.children !== 4) problems.push(`united-states has ${ctx["united-states"]?.children} children, expected 4`);
  if (ctx["united-states.california"]?.children !== 5) problems.push(`California has ${ctx["united-states.california"]?.children} children, expected 5`);
  console.log(`contexts: ${JSON.stringify(ctx)}`);

  const sl = await shortlists(c);
  for (const [state, s] of Object.entries(sl)) if (s.source !== "map") problems.push(`${state} shortlist comes from ${s.source}`);
  console.log(`shortlists: ${JSON.stringify(sl)}`);

  const expected = JSON.parse(await readFile(EXPECTED_PATH, "utf8"));
  const off = compareHunk(expected, await expectationRows(c));
  if (off.length) problems.push(`boundary expectations differ from ${EXPECTED_PATH}: ${off.join(", ")}`);

  if (versions.links) {
    const arch = await archetypeFacts(c, links);
    problems.push(...archetypeProblems(arch, links));
    console.log(`archetypes: ${JSON.stringify(arch.archetypes)}; room: ${JSON.stringify(arch.room)}`);
  } else {
    console.log("archetype links: not recorded yet (sitting step 11)");
  }
});

if (problems.length) {
  console.error(`US-2 LIVE CHECK FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exitCode = 1;
} else if (promoted) {
  console.log("US-2 LIVE CHECK OK");
} else {
  console.log("US-2 LIVE CHECK: not promoted yet; the state above is consistent");
}
