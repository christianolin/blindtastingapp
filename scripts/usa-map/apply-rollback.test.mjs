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
  ]) assert.match(rollbackRefusal(f), /is not a US rollback file/, f);
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
