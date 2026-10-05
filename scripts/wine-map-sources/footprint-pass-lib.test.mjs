import assert from "node:assert/strict";
import test from "node:test";
import {
  BUILDING_WINDOW, REVISION_SUFFIX, ROLLBACK_RUNNER, WAVES, flagsOf, inScope, rejectPath, renderPromoteSql,
  renderRejectReleaseSql, renderReport, renderRevertSql, renderUnstageSql, renderedPaths, revealDiff, revealOf,
  approvalLine, paramReach, sittingGate, summarize, waveOf, wavesFor,
} from "./footprint-pass-lib.mjs";

test("waves run worst first: Mittelrhein, then the rest of Germany, then the other countries", () => {
  assert.equal(WAVES[0], "germany.mittelrhein");
  assert.ok(WAVES.indexOf("germany") > WAVES.indexOf("germany.rheinhessen"));
  assert.ok(WAVES.indexOf("france") > WAVES.indexOf("germany"));
  assert.equal(waveOf("germany.pfalz.suedl-weinstrasse.x"), "germany.pfalz");
  assert.equal(waveOf("germany.rheingau.johannisberg"), "germany");
  assert.equal(waveOf("austria.x"), "*");
  assert.deepEqual(wavesFor("all").at(-1), "*");
  assert.deepEqual(wavesFor("germany.pfalz"), ["germany.pfalz"]);
  assert.equal(inScope("germany.pfalzgraf", "germany.pfalz"), false, "a scope is a key prefix by segment");
});

const okFacts = {
  ownerApproval: "owner 2026-10-05: approved previews", migrationVersion: "20261004090000", migrationRecorded: true,
  functionLive: true, draftBoundaries: 0, buildingReleases: 0, priorPromote: null, priorPromoted: true, staleInputs: 0, changed: 3,
};

test("the sitting gate passes only with approval, Migration A live, no DRAFTs, no tiles run, fresh inputs", () => {
  assert.deepEqual(sittingGate(okFacts), []);
  const refusals = sittingGate({ ...okFacts, ownerApproval: null, migrationRecorded: false, functionLive: false, draftBoundaries: 2,
    buildingReleases: 1, priorPromote: "x", priorPromoted: false, staleInputs: 4, changed: 0 });
  assert.equal(refusals.length, 8);
  assert.match(refusals.join("\n"), /owner approval/);
  assert.match(refusals.join("\n"), /DRAFT/);
  assert.match(refusals.join("\n"), /BUILDING/);
});

test("flags: parent conflict over 2 % outside, overlap without an edge over 1 %", () => {
  assert.deepEqual(flagsOf({ area_m2_before: 1000, outside_parent_raw_m2: 21, raw_overlap_m2: 11 }), ["parent_conflict", "overlap_without_edge"]);
  assert.deepEqual(flagsOf({ area_m2_before: 1000, outside_parent_raw_m2: 20, raw_overlap_m2: 10 }), []);
});

const square = (x, y, d) => [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]];
const row = (polys) => ({
  id: "p", canonical_key: "germany.x.y", display_tier: 4, kind: "SITE", primary_parent_id: "q", min_zoom: 5,
  geometry: JSON.stringify({ type: "MultiPolygon", coordinates: polys }),
  label_point: JSON.stringify({ type: "Point", coordinates: [8.0005, 49.0005] }),
});

test("the reveal diff: scattered specks that waited arrive with their place once merged", () => {
  const specks = [square(8, 49, 0.001), square(8.0011, 49, 0.0001), square(8.0013, 49, 0.0001)];
  const merged = [square(8, 49, 0.0015)];
  const before = revealOf(row(specks));
  assert.equal(before.parts, 3);
  assert.ok(before.waiting >= 1, "the tiny pieces wait for a later zoom");
  const d = revealDiff(row(specks), row(merged));
  assert.equal(d.waiting_after, 0);
  assert.ok(d.zoom_after <= d.zoom_before);
  assert.equal(revealOf({ ...row(merged), display_tier: 1 }), null, "countries and regions are exempt");
});

const review = {
  _provenance: { wave: "germany.mittelrhein", owner_approval: "owner, 2026-10-05", version: "fp-1" },
  places: [
    { key: "a", place_id: "11111111-1111-1111-1111-111111111111", current_boundary_id: "22222222-2222-2222-2222-222222222222",
      current_sha256: "aa", output_sha256: "bb", changed: true },
    { key: "b", place_id: "33333333-3333-3333-3333-333333333333", current_boundary_id: "44444444-4444-4444-4444-444444444444",
      current_sha256: "cc", output_sha256: "cc", changed: false },
  ],
};

test("the promote re-asserts, flips, checks the post-state and refreshes the cache in one block", () => {
  const sql = renderPromoteSql(review);
  assert.match(sql, /do not hand-edit/);
  assert.match(sql, /11111111-1111-1111-1111-111111111111/);
  assert.doesNotMatch(sql, /33333333/, "an unchanged place is never in the promote");
  for (const step of ["changed since approval", "exactly one approved staged row", "fail the stamp checks", "flipped", "post-state", "refresh_wine_place_neighbours() refused"]) {
    assert.ok(sql.includes(step), step);
  }
  assert.ok(sql.indexOf("set is_current = false") < sql.indexOf("set quality_status = 'VALIDATED', is_current = true"), "demote before promote");
  assert.ok(sql.includes(`like '%${REVISION_SUFFIX}'`));
  assert.throws(() => renderPromoteSql({ ...review, places: [review.places[1]] }), /no changed place/);
});

test("unstage deletes only non-current staged rows; revert restores the recorded inputs; both refresh", () => {
  const un = renderUnstageSql(review);
  assert.match(un, /already current: use the revert file/);
  assert.match(un, /delete from public\.wine_place_boundaries/);
  assert.match(un, /not b\.is_current/);
  assert.match(un, /refresh_wine_place_neighbours\(\) < 0/);
  const rv = renderRevertSql(review);
  assert.match(rv, /recorded input row\(s\) missing/);
  assert.match(rv, /set is_current = true/);
  assert.match(rv, /refresh_wine_place_neighbours\(\) < 0/);
  assert.deepEqual(renderedPaths("germany.mittelrhein", "20261005090000"), {
    promote: "supabase/migrations/20261005090000_footprints_germany_mittelrhein_promote.sql",
    unstage: "scripts/wine-map-sources/footprints/footprints_germany_mittelrhein_unstage.sql",
    revert: "scripts/wine-map-sources/footprints/footprints_germany_mittelrhein_revert.sql",
  });
});

test("the report counts changes per country and lists refusals", () => {
  const m = (pb, pa, ab, aa) => ({ parts_before: pb, parts_after: pa, area_m2_before: ab, area_m2_after: aa, holes_before: 0, holes_after: 0,
    vertices_before: 10, vertices_after: 8, dropped_parts: 0, new_overlap_m2: 0, outside_parent_new_m2: 0, protected_lost_m2: 0,
    outside_parent_raw_m2: 0, raw_overlap_m2: 0 });
  const records = [
    { key: "germany.a", changed: true, status: "cleaned", rung: "full", metrics: m(4, 1, 100, 102), flags: [] },
    { key: "germany.b", changed: false, status: "unchanged", rung: "full", metrics: m(1, 1, 100, 100), flags: [] },
    { key: "france.c", changed: false, status: "skipped:grow", rung: "none", metrics: m(9, 1, 100, 130), flags: [] },
  ];
  const s = summarize(records);
  assert.equal(s[0].country, "germany");
  assert.equal(s[0].changed, 1);
  assert.equal(s.find((x) => x.country === "france").skipped, 1);
  const md = renderReport({ provenance: { generated_at: "t", via: "inline", waves: ["germany"], postgis: "3", geos: "3" }, records });
  assert.match(md, /\*\*changed: 1\*\*/);
  assert.match(md, /`france\.c`: \*\*skipped:grow\*\*/);
});

test("the promote re-checks tiles runs first and runs the independent check before the refresh (review 2026-10-04)", () => {
  const sql = renderPromoteSql(review);
  assert.ok(sql.indexOf("status = 'BUILDING'") < sql.indexOf("changed since approval"), "the BUILDING re-check comes first");
  assert.match(sql, new RegExp(`interval '${BUILDING_WINDOW}'`));
  for (const kind of ["new_ground_on_neighbour", "outside_parent", "descendant_ground_lost"]) assert.ok(sql.includes(kind), kind);
  const flip = sql.indexOf("set quality_status = 'VALIDATED', is_current = true");
  const check = sql.indexOf("independent check failure(s)");
  assert.ok(flip > 0 && check > flip, "the independent check reads the flipped rows");
  assert.ok(check < sql.indexOf("v_refreshed := public.refresh_wine_place_neighbours()"), "and refuses before the refresh");
  assert.match(sql, /jsonb_to_recordset\(v_expect\) e\(place_id uuid, current_boundary_id uuid, output_sha text\)/);
  assert.doesNotMatch(sql, /area_m2_before[^\n]*rederiv/i);
});

test("the rollback files name their runner, and a Gate B rejection marks only a VALIDATED draft FAILED", () => {
  for (const sql of [renderUnstageSql(review), renderRevertSql(review)]) assert.ok(sql.includes(ROLLBACK_RUNNER));
  assert.match(ROLLBACK_RUNNER, /scripts\/usa-map\/apply-rollback\.mjs/);
  const rj = renderRejectReleaseSql(review, "20261005T101500Z");
  assert.ok(rj.includes(ROLLBACK_RUNNER));
  assert.match(rj, /set status = 'FAILED'/);
  assert.match(rj, /where version = '20261005T101500Z' and status = 'VALIDATED'/);
  assert.match(rj, /only a VALIDATED draft is rejected/);
  assert.equal(rejectPath("germany.mittelrhein", "20261005T101500Z"),
    "scripts/wine-map-sources/footprints/footprints_germany_mittelrhein_reject_20261005t101500z.sql");
  assert.throws(() => rejectPath("germany.mittelrhein", "latest"), /not a release version/);
  assert.throws(() => renderRejectReleaseSql(review, "x'; drop table y; --"), /not a release version/);
});

test("closure re-run after the crumb cap change (5,000 -> 1,000 m², owner 2026-10-04): which places it reaches", () => {
  const was = { version: "fp-1", crumb_min_m2: 1000, crumb_share: 0.005, crumb_max_m2: 5000 };
  const now = { ...was, crumb_max_m2: 1000 };
  assert.equal(paramReach(was, was, { crumb_floor_m2: 3000 }), null, "same parameters: nothing to follow");
  assert.deepEqual(paramReach(was, now, { crumb_floor_m2: 5000 }), { from: 5000, to: 1000 });
  assert.deepEqual(paramReach(was, now, { crumb_floor_m2: 2603.4 }), { from: 2603.4, to: 1000 });
  assert.deepEqual(paramReach(was, now, { crumb_floor_m2: 1000 }), { from: 1000, to: 1000 }, "a small place's floor was 1,000 already: seeded");
  assert.deepEqual(paramReach(was, now, {}), { from: null, to: null }, "no prior floor: recomputed");
  // raising a bound past a clamped floor cannot be told from the record
  assert.deepEqual(paramReach(was, { ...was, crumb_max_m2: 8000 }, { crumb_floor_m2: 5000 }), { from: 5000, to: null });
  assert.deepEqual(paramReach(was, { ...was, crumb_max_m2: 8000 }, { crumb_floor_m2: 3000 }), { from: 3000, to: 3000 });
  assert.deepEqual(paramReach(now, was, { crumb_floor_m2: 1000 }), { from: 1000, to: null }, "back to 5,000 from a constant floor: recomputed");
  assert.throws(() => paramReach(was, { ...was, gap_m: 25 }, { crumb_floor_m2: 1000 }), /full --dry/);
});

test("the promote's approval comment stays on one line", () => {
  const NL = String.fromCharCode(10);
  const CR = String.fromCharCode(13);
  assert.equal(approvalLine(null), "(none)");
  assert.equal(approvalLine(`a${NL}b`), "a b");
  assert.equal(approvalLine({ text: `owner: "Yes, go ahead"${CR}${NL}--x` }), 'owner: "Yes, go ahead" --x');
  const sql = renderPromoteSql({ ...review, _provenance: { ...review._provenance, owner_approval: { text: `ok${NL}drop table x;` } } });
  assert.ok(!sql.includes(`${NL}drop table x;`));
});

test("the closure's reach covers the mitred closing: mitre_limit x gap_m / 2, plus slack", async () => {
  const { cleanedReachM } = await import("./footprint-pass-lib.mjs");
  assert.equal(cleanedReachM(), 31, "fp-1: join=mitre mitre_limit=3, gap 20 m -> 30 m + 1 m");
  assert.ok(cleanedReachM() > 12, "the old fixed 12 m fell short of a mitred corner");
  assert.equal(cleanedReachM({ gap_m: 20, buffer_style: "join=round" }), 11);
  assert.equal(cleanedReachM({ gap_m: 20, buffer_style: "join=mitre" }), 51, "PostGIS's default mitre limit is 5");
});

test("--stage refuses a review that is not one full, committed run (seeded records from other code)", async () => {
  const { codeRefusals } = await import("./footprint-pass-lib.mjs");
  const c = "851c21c5601662b5d19fde11b9419b04e99dfab2";
  const rec = (key, commit = c) => ({ key, computed_commit: commit, changed: true });
  const full = { _provenance: { code: { commit: c, dirty: [] } }, places: [rec("a"), rec("b")] };
  assert.deepEqual(codeRefusals(full), []);
  assert.match(codeRefusals({ _provenance: {}, places: [] })[0], /no code commit/);
  const seeded = { _provenance: { code: { commit: c, dirty: [] }, closure: { from: "review3" } },
    places: [rec("a"), rec("germany.mosel.x.wiltingen-hoelle", "ad3d0f2aaaaaaaa"), rec("c", null)] };
  const r = codeRefusals(seeded).join("\n");
  assert.match(r, /closure re-run/);
  assert.match(r, /2 record\(s\) were not computed by this run's code 851c21c \(from ad3d0f2, \(none\), e\.g\. germany\.mosel\.x\.wiltingen-hoelle\)/);
  assert.match(codeRefusals({ ...full, _provenance: { code: { commit: c, dirty: ["scripts/wine-map-sources/footprint-sql.mjs"] } } })[0], /not committed/);
  assert.match(codeRefusals({ ...full, _provenance: { ...full._provenance, partial: { keys: ["a"], limit: null } } })[0], /--keys/);
  assert.deepEqual(codeRefusals({ ...full, _provenance: { ...full._provenance, partial: { keys: null, limit: null, wave: "germany.pfalz" } } }), []);
});

test("the report names the code a run was computed by", () => {
  const md = renderReport({ provenance: { generated_at: "t", via: "inline", waves: ["france"], postgis: "3.3.7", geos: "3.14",
    code: { commit: "abc1234", branch: "map-footprints", dirty: [] } }, records: [] });
  assert.match(md, /Code: map-footprints @ abc1234; a full run/);
});

test("closure F2 measures given-up ground exactly: no grid, no lost_m2 floor (the 8 stale seeds of review4)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = (await readFile(new URL("./footprint-pass.mjs", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  const lost = /const LOST_SQL = `([\s\S]*?)`;/.exec(src)[1];
  // a gridded ST_Difference (gridSize 1e-6) collapsed the sub-grid slivers along each
  // stale seed's shared edge: empty for 4 of the 8, 57-187 m away for the other 4
  assert.match(lost, /ST_Difference\(b\.display_geometry, \$2::extensions\.geometry\)/);
  const reach = /const REACH_SQL = `([\s\S]*?)`;/.exec(src)[1];
  assert.match(reach, /\$\{REACH_M\}/);
  assert.doesNotMatch(reach, /geography, 12\)/);
  const f2 = /\/\/ F2: ground a prior output gave up[\s\S]*?closure start/.exec(src)[0];
  assert.doesNotMatch(f2, /metrics?.lost_m2/);
  assert.match(f2, /LOST_SQL/);
});

test("a statement timeout is retried once, first in a new transaction with SLOW_FACTOR x the timeout", async () => {
  const { retryOnTimeout, SLOW_FACTOR } = await import("./footprint-pass-lib.mjs");
  const slow = new Set();
  const lines = [];
  const log = (x) => lines.push(x);
  assert.equal(retryOnTimeout({ code: "57014" }, 7, slow, "united-states.california.north-coast", 90000, log), true);
  assert.ok(slow.has(7));
  assert.match(lines[0], /360 s statement timeout/);
  assert.equal(SLOW_FACTOR, 4);
  assert.equal(retryOnTimeout({ code: "57014" }, 7, slow, "x", 90000, log), false, "only once: then it is an error record");
  assert.equal(retryOnTimeout({ code: "XX000" }, 8, slow, "x", 90000, log), false, "any other error is recorded at once");
});
