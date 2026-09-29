// scripts/usa-reference/us1-sql.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { topLevelTransactionStatements } from "../migration-preflight.mjs";
import { renderUs1Sql } from "./render-us1-sql.mjs";
import { REF_QUERIES } from "./us1-queries.mjs";
import { FORWARD_PATH, PREIMAGE_PATH, SPEC_PATH } from "./us1-spec-lib.mjs";

const lf = (s) => s.replace(/\r\n/g, "\n");
const json = async (p) => JSON.parse(await readFile(p, "utf8"));

test("the committed forward migration is exactly the render of the committed spec", async () => {
  const want = renderUs1Sql({ template: lf(await readFile("scripts/usa-reference/us1-cleanup.sql.template", "utf8")), spec: await json(SPEC_PATH), preimage: await json(PREIMAGE_PATH) });
  assert.equal(lf(await readFile(FORWARD_PATH, "utf8")), want);
});

test("the forward migration has no transaction statement (D24), carries every reference query, and no leftover placeholder", async () => {
  const sql = await readFile(FORWARD_PATH, "utf8");
  assert.deepEqual(topLevelTransactionStatements(sql), []);
  for (const [, q] of REF_QUERIES) assert.ok(sql.includes(q), q.slice(0, 60));
  assert.ok(!/__US1_[A-Z_]+__/.test(sql));
  assert.equal(sql.split('"anchor_id": "ef4ebc71-aadf-4792-abae-300698f7b09f"').length, 2, "the anchor appears once");
});

test("a spec that contains its own dollar-quote tag is refused", () => {
  assert.throws(() => renderUs1Sql({ template: "x __US1_SPEC__", spec: { a: "$spec$" }, preimage: {} }), /\$spec\$/);
});
