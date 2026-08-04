import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

test("get_wine_place_context lists classified growths for Pauillac", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(
      "select get_wine_place_context('france.bordeaux.haut-medoc.pauillac') as ctx;",
    );
    const names = (rows[0].ctx.classified_members ?? []).map((m) => m.name);
    assert.ok(names.includes("Château Lafite Rothschild"), "Lafite missing");
    assert.ok(names.includes("Château Latour"), "Latour missing");
    assert.ok(names.includes("Château Mouton Rothschild"), "Mouton missing");
    assert.ok(names.length >= 18, `expected >=18 growths, got ${names.length}`);
  } finally {
    await client.end();
  }
});

test("a place with no classification returns an empty array", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(
      "select get_wine_place_context('france.bordeaux.pomerol') as ctx;",
    );
    assert.deepEqual(rows[0].ctx.classified_members, []);
  } finally {
    await client.end();
  }
});
