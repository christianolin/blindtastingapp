import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { rollbackArgs, rollbackRefusal } from "./apply-rollback.mjs";
import { US2_ROLLBACK_FILES } from "./us2-wave.mjs";

test("runs the US rollback files, and nothing else", () => {
  for (const f of Object.values(US2_ROLLBACK_FILES)) assert.equal(rollbackRefusal(f), null, f);
  for (const f of [
    "supabase/migrations/20260930104747_usa_us2_promote.sql",
    "scripts/usa-map/20260930124747_usa_us2_unstage.sql",
    "scripts/usa-map/render-us2-sql.mjs",
    "scripts/usa-map/../usa-map/../x.sql",
  ]) assert.match(rollbackRefusal(f), /is not a rollback file/, f);
});

test("runs the fp-1 footprint pass's rollback files too (review 2026-10-04), and nothing else under footprints", async () => {
  const { renderedPaths, rejectPath } = await import("../wine-map-sources/footprint-pass-lib.mjs");
  for (const wave of ["germany.mittelrhein", "germany", "united-states", "*"]) {
    const p = renderedPaths(wave, "20261005090000");
    assert.equal(rollbackRefusal(p.unstage), null, p.unstage);
    assert.equal(rollbackRefusal(p.revert), null, p.revert);
    assert.match(rollbackRefusal(p.promote), /is not a rollback file/, "the promote is a migration");
    const rj = rejectPath(wave, "20261005T101500Z");
    assert.equal(rollbackRefusal(rj), null, rj);
  }
  for (const f of [
    "scripts/wine-map-sources/footprints/footprints_germany_mittelrhein_promote.sql",
    "scripts/wine-map-sources/footprints/20261005090000_footprints_germany_unstage.sql",
    "scripts/wine-map-sources/footprints/footprints_germany_unstage.sql.bak",
    "scripts/wine-map-sources/footprints/../footprints/x_revert.sql",
    "supabase/migrations/20261005090000_footprints_germany_mittelrhein_promote.sql",
  ]) assert.match(rollbackRefusal(f), /is not a rollback file/, f);
});

test("flags: --check, --dry or none; anything else refuses (a typo of --dry never applies)", () => {
  assert.deepEqual(rollbackArgs(["f.sql", "--check"]), { file: "f.sql", mode: "check" });
  assert.deepEqual(rollbackArgs(["f.sql", "--dry"]), { file: "f.sql", mode: "dry" });
  assert.deepEqual(rollbackArgs(["f.sql"]), { file: "f.sql", mode: "apply" });
  assert.throws(() => rollbackArgs(["f.sql", "--dyr"]), /unknown flag --dyr/);
  assert.throws(() => rollbackArgs([]), /usage/);
  assert.throws(() => rollbackArgs(["f.sql", "--dry", "x"]), /usage/);
});

test("the runner never writes migration history", async () => {
  const src = await readFile("scripts/usa-map/apply-rollback.mjs", "utf8");
  assert.ok(!/insert into supabase_migrations/i.test(src));
  for (const f of Object.values(US2_ROLLBACK_FILES)) {
    const sql = await readFile(f, "utf8");
    assert.match(sql, /apply-rollback\.mjs/, `${f} names its runner`);
    assert.ok(!/insert into supabase_migrations/i.test(sql), `${f} records nothing`);
  }
});
