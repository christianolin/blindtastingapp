import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { topLevelTransactionStatements as find } from "./migration-preflight.mjs";

test("finds top-level begin and commit with their lines", () => {
  assert.deepEqual(find("begin;\ncreate table t ();\ncommit;\n"), [
    { line: 1, statement: "begin" },
    { line: 3, statement: "commit" },
  ]);
});

test("every spelling of a transaction statement is found", () => {
  for (const sql of [
    "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;", "start transaction;", "end;",
    "abort;", "rollback;", "COMMIT", "  \n  begin work;",
  ]) {
    assert.equal(find(sql).length, 1, sql);
  }
});

test("plpgsql bodies, comments and strings are not top level", () => {
  assert.deepEqual(find("do $$ begin perform 1; end $$;"), []);
  assert.deepEqual(find("create function f() returns void language plpgsql as $fn$\nbegin\n  commit;\nend\n$fn$;"), []);
  assert.deepEqual(find("-- begin;\n/* commit; /* nested; */ rollback; */ select 'begin; commit;';"), []);
  assert.deepEqual(find("select E'it\\'s; commit;' as x;"), []);
  assert.deepEqual(find('select 1 as "begin";'), []);
  assert.deepEqual(find("select $1::text;"), []);
});

test("a SQL-standard BEGIN ATOMIC body is not a transaction", () => {
  const sql = "create function f() returns int language sql\nbegin atomic\n  select 1;\nend;\nselect f();\ncommit;";
  assert.deepEqual(find(sql), [{ line: 6, statement: "commit" }]);
});

test("the Baden-Württemberg promote is refused at its begin and commit", () => {
  const sql = readFileSync("supabase/migrations/20260916120000_germany_baden_wuerttemberg_promote.sql", "utf8");
  assert.deepEqual(find(sql).map(({ line }) => line), [41, 171]);
});
