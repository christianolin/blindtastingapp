import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, delimiter } from "node:path";
import test, { after, before } from "node:test";
import pg from "pg";

assert.ok(process.env.DB_PASSWORD, "DB_PASSWORD is required");

const migrationPaths = (process.env.WINE_PLACE_CONTEXT_MIGRATIONS ?? "")
  .split(delimiter)
  .filter(Boolean);
const isMigrationDryRun = migrationPaths.length > 0;

const client = new pg.Client({
  host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
  port: Number(process.env.DB_PORT ?? 6543),
  user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
  database: process.env.DB_NAME ?? "postgres",
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

let savepointSequence = 0;
async function withRollback(callback) {
  if (!isMigrationDryRun) {
    await client.query("begin");
    try {
      return await callback();
    } finally {
      await client.query("rollback");
    }
  }
  const savepoint = `wine_place_context_${++savepointSequence}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    return await callback();
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

before(async () => {
  await client.connect();
  if (!isMigrationDryRun) return;
  await client.query("begin");
  for (const migrationPath of migrationPaths) {
    const match = /^(\d+)_([^/\\]+)\.sql$/.exec(basename(migrationPath));
    assert.ok(match, `Invalid migration filename: ${migrationPath}`);
    const existing = await client.query(
      "select 1 from supabase_migrations.schema_migrations where version = $1",
      [match[1]],
    );
    assert.equal(existing.rowCount, 0, `version ${match[1]} already recorded`);
    const sql = await readFile(migrationPath, "utf8");
    await client.query(sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, $3)`,
      [match[1], match[2], [sql]],
    );
  }
});

after(async () => {
  try {
    if (isMigrationDryRun) await client.query("rollback");
  } finally {
    await client.end();
  }
});

async function contextFor(key) {
  const result = await client.query("select get_wine_place_context($1) ctx", [key]);
  return result.rows[0].ctx;
}

test("bordeaux context has the full contract shape", async () => {
  const ctx = await contextFor("france.bordeaux");
  assert.equal(ctx.place.key, "france.bordeaux");
  assert.equal(ctx.place.name, "Bordeaux");
  assert.equal(ctx.place.kind, "REGION");
  assert.equal(ctx.place.tier, 1);
  assert.equal(typeof ctx.place.min_zoom, "number");
  assert.equal(typeof ctx.place.label_min_zoom, "number");
  assert.deepEqual(
    ctx.ancestors.map((a) => a.key),
    ["france"],
  );
  // Table-owning pooler role: RLS does not filter, so DRAFT places count.
  assert.equal(ctx.children.length, 9);
  assert.ok(ctx.children.every((c) => typeof c.min_zoom === "number"));
  assert.equal(ctx.article.editorial_status, "PUBLISHED");
  assert.equal(ctx.boundary.bbox.length, 4);
  assert.ok(ctx.boundary.label_lon > -6 && ctx.boundary.label_lon < 11);
  assert.ok(ctx.boundary.label_lat > 41 && ctx.boundary.label_lat < 52);
});

test("nested appellation ancestors are outermost first", async () => {
  const ctx = await contextFor("france.bordeaux.haut-medoc.margaux");
  assert.deepEqual(
    ctx.ancestors.map((a) => a.key),
    ["france", "france.bordeaux", "france.bordeaux.medoc", "france.bordeaux.haut-medoc"],
  );
  assert.equal(ctx.children.length, 0);
  assert.equal(ctx.place.kind, "APPELLATION");

  const graves = await contextFor("france.bordeaux.graves");
  assert.deepEqual(
    graves.children.map((c) => c.key),
    ["france.bordeaux.pessac-leognan", "france.bordeaux.sauternes"],
  );
});

test("unknown key returns null", async () => {
  assert.equal(await contextFor("nowhere.special"), null);
});

test("execute privileges are authenticated-only", async () => {
  const anon = await client.query(
    `select has_function_privilege('anon', 'get_wine_place_context(text)', 'execute') ok`,
  );
  assert.equal(anon.rows[0].ok, false);
  const authenticated = await client.query(
    `select has_function_privilege('authenticated', 'get_wine_place_context(text)', 'execute') ok`,
  );
  assert.equal(authenticated.rows[0].ok, true);
});

test("authenticated role sees verified content through RLS", async () => {
  await withRollback(async () => {
    await client.query("set local role authenticated");
    const ctx = await contextFor("france.bordeaux");
    assert.equal(ctx.place.key, "france.bordeaux");
    assert.ok(ctx.article, "article should be visible to authenticated");
    assert.ok(ctx.boundary, "boundary should be visible to authenticated");
    // After the Task 6 flip the 5 new appellations are VERIFIED, so the
    // authenticated role now sees all 9 Bordeaux children.
    assert.equal(ctx.children.length, 9);
  });
});

test("burgundy depth chain resolves to the climat level", async () => {
  const bourgogne = await contextFor("france.bourgogne");
  // Owner-role connection sees DRAFT places too: Côte de Beaune joins the
  // list at its 3D-1 catalog apply, ahead of its boundary flip.
  assert.deepEqual(
    bourgogne.children.map((c) => c.key),
    ["france.bourgogne.cote-de-nuits", "france.bourgogne.cote-de-beaune"],
  );

  const district = await contextFor("france.bourgogne.cote-de-nuits");
  // All eight Côte de Nuits villages after wave 5b.
  assert.equal(district.children.length, 8);

  const vosne = await contextFor("france.bourgogne.cote-de-nuits.vosne-romanee");
  assert.deepEqual(
    vosne.ancestors.map((a) => a.key),
    ["france", "france.bourgogne", "france.bourgogne.cote-de-nuits"],
  );
  assert.equal(vosne.place.kind, "APPELLATION");
  // 7 grands crus + the premier-cru group.
  assert.equal(vosne.children.length, 8);

  const group = await contextFor(
    "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru",
  );
  assert.equal(group.children.length, 14);

  const suchots = await contextFor(
    "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots",
  );
  assert.deepEqual(
    suchots.ancestors.map((a) => a.key),
    [
      "france",
      "france.bourgogne",
      "france.bourgogne.cote-de-nuits",
      "france.bourgogne.cote-de-nuits.vosne-romanee",
      "france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru",
    ],
  );
  assert.equal(suchots.children.length, 0);
  assert.equal(suchots.place.kind, "SITE");
});

test("place tree returns every verified place with parent links", async () => {
  const result = await client.query("select get_wine_place_tree() tree");
  const tree = result.rows[0].tree;
  assert.equal(tree.length, 114);
  const byKey = new Map(tree.map((node) => [node.key, node]));
  assert.equal(byKey.get("france").parent_key, null);
  assert.equal(
    byKey.get("france.bourgogne.cote-de-nuits.vosne-romanee").parent_key,
    "france.bourgogne.cote-de-nuits",
  );
  assert.ok(byKey.get("france.bourgogne").has_children);
  assert.equal(
    byKey.get("france.bourgogne.cote-de-nuits.vosne-romanee.premier-cru.les-suchots").has_children,
    false,
  );

  const anon = await client.query(
    `select has_function_privilege('anon', 'get_wine_place_tree()', 'execute') ok`,
  );
  assert.equal(anon.rows[0].ok, false);
  const authenticated = await client.query(
    `select has_function_privilege('authenticated', 'get_wine_place_tree()', 'execute') ok`,
  );
  assert.equal(authenticated.rows[0].ok, true);
});

test("context v2 carries knowledge keys and dual-label edges", async () => {
  const bordeaux = await contextFor("france.bordeaux");
  // Additive v2 contract — arrays exist regardless of content volume.
  for (const key of ["grapes", "styles", "designations", "nearby", "dual_labels"]) {
    assert.ok(Array.isArray(bordeaux[key]), `${key} should be an array`);
  }
  assert.ok("soils" in bordeaux.article, "article should carry soils");

  const beze = await contextFor(
    "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze",
  );
  assert.deepEqual(
    beze.dual_labels.map((d) => [d.key, d.direction]),
    [
      [
        "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin",
        "MAY_BE_SOLD_AS",
      ],
    ],
  );
  const chambertin = await contextFor(
    "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin",
  );
  assert.deepEqual(
    chambertin.dual_labels.map((d) => [d.key, d.direction]),
    [
      [
        "france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin-clos-de-beze",
        "ALSO_SOLD_AS_THIS",
      ],
    ],
  );

  // Nearby: neighbours within ~10 km; never ancestors, children, or own
  // descendants.
  const vosne = await contextFor("france.bourgogne.cote-de-nuits.vosne-romanee");
  assert.ok(vosne.nearby.length > 0 && vosne.nearby.length <= 5);
  const nearbyKeys = vosne.nearby.map((n) => n.key);
  assert.ok(!nearbyKeys.includes("france.bourgogne.cote-de-nuits"));
  assert.ok(!nearbyKeys.includes("france.bourgogne"));
  assert.ok(
    nearbyKeys.every(
      (k) => !k.startsWith("france.bourgogne.cote-de-nuits.vosne-romanee."),
    ),
  );
});
