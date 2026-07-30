// Global search RPC: search_all across wines, places, grapes, producers.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
before(async () => {
  await client.connect();
});
after(async () => {
  await client.end();
});

async function search(q, limit = 8) {
  return (await client.query("select * from search_all($1, $2)", [q, limit])).rows;
}

test("finds a grape by name", async () => {
  const rows = await search("Chardonnay");
  const grape = rows.find((r) => r.kind === "grape");
  assert.ok(grape, "expected a grape result");
  assert.match(grape.label, /Chardonnay/i);
  assert.equal(grape.href_key, grape.label);
});

test("finds a place by name", async () => {
  const rows = await search("Champagne");
  const place = rows.find((r) => r.kind === "place");
  assert.ok(place, "expected a place result");
  assert.ok(place.href_key, "place carries a canonical_key href");
});

test("caps each kind at the limit", async () => {
  const rows = await search("a", 2);
  for (const kind of ["wine", "place", "grape", "producer"]) {
    const n = rows.filter((r) => r.kind === kind).length;
    assert.ok(n <= 2, `${kind} count ${n} exceeds limit`);
  }
});

test("returns the uniform (kind,label,href_key) shape", async () => {
  const rows = await search("Bordeaux", 3);
  assert.ok(rows.length > 0, "expected some results for Bordeaux");
  for (const r of rows) {
    assert.ok(["wine", "place", "grape", "producer"].includes(r.kind));
    assert.ok(r.label);
    assert.ok(r.href_key);
  }
});
