import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { pgConfig } from "./wine-map-tiles/lib.mjs";

test("every Bordeaux classified estate links to an appellation", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select count(*)::int as n
      from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
      where d.key in ('medoc-1855','sauternes-1855','saint-emilion-grand-cru-classe','graves-cru-classe')
        and m.member_kind = 'ESTATE'
        and m.appellation_wine_place_id is null;
    `);
    assert.equal(rows[0].n, 0, "unlinked Bordeaux estates remain");
  } finally {
    await client.end();
  }
});

test("known châteaux resolve to the expected appellation", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select m.name, wp.canonical_key as key
      from wine_designation_members m
      join wine_places wp on wp.id = m.appellation_wine_place_id
      where m.name in ('Château Lafite Rothschild','Château Latour','Château Haut-Brion');
    `);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r.key]));
    assert.equal(byName["Château Lafite Rothschild"], "france.bordeaux.haut-medoc.pauillac");
    assert.equal(byName["Château Latour"], "france.bordeaux.haut-medoc.pauillac");
    assert.equal(byName["Château Haut-Brion"], "france.bordeaux.pessac-leognan");
  } finally {
    await client.end();
  }
});

test("sub-commune mappings resolve (Barsac/Sauternes, Graves, Haut-Médoc)", async () => {
  const client = new pg.Client(pgConfig());
  await client.connect();
  try {
    const { rows } = await client.query(`
      select wp.canonical_key as key, count(*)::int as n
      from wine_designation_members m
      join wine_places wp on wp.id = m.appellation_wine_place_id
      where wp.canonical_key in (
        'france.bordeaux.sauternes.barsac','france.bordeaux.sauternes',
        'france.bordeaux.pessac-leognan','france.bordeaux.haut-medoc'
      )
      group by wp.canonical_key;
    `);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.n]));
    assert.ok(byKey["france.bordeaux.sauternes.barsac"] >= 1, "no Barsac links");
    assert.ok(byKey["france.bordeaux.sauternes"] >= 1, "no Sauternes links");
    assert.ok(byKey["france.bordeaux.pessac-leognan"] >= 16, "Graves not linked");
    assert.ok(byKey["france.bordeaux.haut-medoc"] >= 5, "Haut-Médoc not linked");
  } finally {
    await client.end();
  }
});
