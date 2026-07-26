// Classification members (wine_designation_members) invariants: per-system
// counts, tier composition, ESTATE/SITE linkage rules, publication status,
// and the Burgundy drift guard against wine_place_designations.
// Env: DB_PASSWORD (+ optional DB_PORT=5432). Read-only.
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

before(async () => {
  await client.connect();
});

after(async () => {
  await client.end();
});

test("designation catalogue: 9 systems, member-bearing ones grouped", async () => {
  const systems = await client.query(
    `select key, editorial_status, display_group
       from wine_designations order by key`,
  );
  assert.equal(systems.rowCount, 9);
  const byKey = new Map(systems.rows.map((r) => [r.key, r]));
  for (const key of [
    "medoc-1855",
    "sauternes-1855",
    "saint-emilion-grand-cru-classe",
    "graves-cru-classe",
  ]) {
    assert.equal(byKey.get(key)?.display_group, "Bordeaux", key);
  }
  assert.equal(byKey.get("burgundy-grand-cru")?.display_group, "Burgundy");
  assert.equal(byKey.get("alsace-grand-cru")?.display_group, "Alsace");
  assert.equal(byKey.get("alsace-grand-cru")?.editorial_status, "PUBLISHED");
  // Member-less systems stay out of the Classifications section.
  for (const key of ["burgundy-village", "burgundy-premier-cru", "cru-bourgeois-medoc"]) {
    assert.equal(byKey.get(key)?.display_group, null, key);
  }
});

test("per-system member counts and totals", async () => {
  const counts = await client.query(
    `select d.key, count(*)::int n
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      group by d.key order by d.key`,
  );
  assert.deepEqual(
    Object.fromEntries(counts.rows.map((r) => [r.key, r.n])),
    {
      "alsace-grand-cru": 51,
      "burgundy-grand-cru": 33,
      "graves-cru-classe": 16,
      "medoc-1855": 61,
      "saint-emilion-grand-cru-classe": 85,
      "sauternes-1855": 27,
    },
  );
  const totals = await client.query(
    `select count(*)::int total,
            count(*) filter (where member_kind = 'ESTATE')::int estates,
            count(*) filter (where member_kind = 'SITE')::int sites,
            count(*) filter (where editorial_status <> 'PUBLISHED')::int unpublished
       from wine_designation_members`,
  );
  assert.deepEqual(totals.rows[0], {
    total: 273,
    estates: 189,
    sites: 84,
    unpublished: 0,
  });
});

test("tier composition per classification", async () => {
  const tiers = await client.query(
    `select d.key, m.tier, m.tier_rank, count(*)::int n
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      group by d.key, m.tier, m.tier_rank
      order by d.key, m.tier_rank`,
  );
  const rows = tiers.rows.map((r) => [r.key, r.tier, r.tier_rank, r.n]);
  assert.deepEqual(rows, [
    ["alsace-grand-cru", "Grand Cru", 1, 51],
    ["burgundy-grand-cru", "Grand Cru", 1, 33],
    ["graves-cru-classe", "Cru Classé", 1, 16],
    ["medoc-1855", "Premier Cru", 1, 5],
    ["medoc-1855", "Deuxième Cru", 2, 14],
    ["medoc-1855", "Troisième Cru", 3, 14],
    ["medoc-1855", "Quatrième Cru", 4, 10],
    ["medoc-1855", "Cinquième Cru", 5, 18],
    ["saint-emilion-grand-cru-classe", "Premier Grand Cru Classé A", 1, 2],
    ["saint-emilion-grand-cru-classe", "Premier Grand Cru Classé B", 2, 12],
    ["saint-emilion-grand-cru-classe", "Grand Cru Classé", 3, 71],
    ["sauternes-1855", "Premier Cru Supérieur", 1, 1],
    ["sauternes-1855", "Premier Cru", 2, 11],
    ["sauternes-1855", "Deuxième Cru", 3, 15],
  ]);
});

test("ESTATE members: producer link deferred, commune always present", async () => {
  const bad = await client.query(
    `select count(*)::int n from wine_designation_members
      where member_kind = 'ESTATE'
        and (producer_id is not null or commune is null or wine_place_id is not null)`,
  );
  assert.equal(bad.rows[0].n, 0);
});

test("SITE members: Burgundy + Alsace linked (except La Grande Rue)", async () => {
  const burgundy = await client.query(
    `select m.name, m.wine_place_id
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      where d.key = 'burgundy-grand-cru' order by m.name`,
  );
  assert.equal(burgundy.rowCount, 33);
  const unlinked = burgundy.rows.filter((r) => r.wine_place_id === null);
  assert.deepEqual(
    unlinked.map((r) => r.name),
    ["La Grande Rue"],
  );

  const alsace = await client.query(
    `select count(*)::int n, count(wine_place_id)::int linked
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      where d.key = 'alsace-grand-cru'`,
  );
  assert.deepEqual(alsace.rows[0], { n: 51, linked: 51 });
});

test("Burgundy drift guard: members agree with wine_place_designations", async () => {
  // Every linked member place must be a VERIFIED bourgogne grand_cru place
  // that also carries the burgundy-grand-cru wine_place_designations link
  // (the member list is the canonical-appellation subset of those links).
  const orphans = await client.query(
    `select m.name
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      where d.key = 'burgundy-grand-cru' and m.wine_place_id is not null
        and not exists (
          select 1 from wine_place_designations pd
           where pd.designation_id = m.designation_id
             and pd.wine_place_id = m.wine_place_id
        )`,
  );
  assert.deepEqual(orphans.rows, []);

  // And the member set is exactly the canonical GC appellations: grand_cru
  // places whose primary parent is not itself grand_cru.
  const canonical = await client.query(
    `select count(*)::int n
       from wine_places p
       join wine_places parent on parent.id = p.primary_parent_id
      where p.canonical_key like 'france.bourgogne.%'
        and p.appellation_level = 'grand_cru'
        and p.publication_status = 'VERIFIED'
        and parent.appellation_level is distinct from 'grand_cru'`,
  );
  const linked = await client.query(
    `select count(*)::int n
       from wine_designation_members m
       join wine_designations d on d.id = m.designation_id
      where d.key = 'burgundy-grand-cru' and m.wine_place_id is not null`,
  );
  assert.equal(linked.rows[0].n, canonical.rows[0].n);
});

test("no duplicate member names within a system", async () => {
  const dupes = await client.query(
    `select designation_id, name, count(*)::int n
       from wine_designation_members
      group by designation_id, name having count(*) > 1`,
  );
  assert.deepEqual(dupes.rows, []);
});
