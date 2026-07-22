// Promotion: write tiles/manifest.json pointing at a VALIDATED (or, for
// rollback, RETIRED) release, then flip statuses in one transaction. The
// manifest is written BEFORE the DB flip; if the flip fails, re-running
// promote converges. Rollback = promote an earlier version explicitly.
import assert from "node:assert/strict";
import pg from "pg";
import {
  attributionDisplayMap,
  buildManifest,
  pgConfig,
  sha256hex,
  storagePublicUrl,
  uploadObject,
} from "./lib.mjs";

const requestedVersion = process.argv[2] ?? null;
const client = new pg.Client(pgConfig());
await client.connect();
try {
  const target = requestedVersion
    ? await client.query(
        `select id, version, status, tile_checksums from wine_map_releases where version = $1`,
        [requestedVersion],
      )
    : await client.query(
        `select id, version, status, tile_checksums from wine_map_releases
         where status = 'VALIDATED' order by created_at desc limit 1`,
      );
  assert.equal(target.rows.length, 1, "no promotable release found");
  const row = target.rows[0];
  assert.ok(
    ["VALIDATED", "RETIRED", "ACTIVE"].includes(row.status),
    `release ${row.version} is ${row.status}; cannot promote a FAILED/BUILDING release`,
  );

  const shards = {};
  for (const [key, entry] of Object.entries(row.tile_checksums)) {
    if (key === "world") continue;
    shards[key] = {
      url: storagePublicUrl(entry.path),
      checksum_sha256: entry.checksum_sha256,
      bytes: entry.bytes,
      bbox: entry.bbox,
      min_zoom: entry.min_zoom,
      max_zoom: entry.max_zoom,
    };
  }
  const manifest = buildManifest({
    version: row.version,
    generatedAt: new Date().toISOString(),
    world: {
      url: storagePublicUrl(row.tile_checksums.world.path),
      checksum_sha256: row.tile_checksums.world.checksum_sha256,
      bytes: row.tile_checksums.world.bytes,
    },
    shards,
    attribution: attributionDisplayMap(),
  });
  const body = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await uploadObject("tiles/manifest.json", body, {
    contentType: "application/json",
    cacheControlSeconds: 60,
    upsert: true,
  });
  const manifestChecksum = sha256hex(body);

  await client.query("begin");
  await client.query(
    `update wine_map_releases set status = 'RETIRED' where status = 'ACTIVE' and id <> $1`,
    [row.id],
  );
  await client.query(
    `update wine_map_releases
     set status = 'ACTIVE', promoted_at = now(), manifest_url = $2, manifest_checksum_sha256 = $3
     where id = $1`,
    [row.id, storagePublicUrl("tiles/manifest.json"), manifestChecksum],
  );
  await client.query("commit");

  // A fresh query string busts the storage CDN edge cache (max-age=60), so
  // this verifies the just-uploaded object rather than a stale cached copy.
  const readBack = await fetch(
    `${storagePublicUrl("tiles/manifest.json")}?readback=${Date.now()}`,
    { cache: "no-store" },
  );
  const readBody = Buffer.from(await readBack.arrayBuffer());
  assert.equal(readBack.status, 200, "manifest read-back failed");
  assert.equal(sha256hex(readBody), manifestChecksum, "manifest checksum mismatch after upload");
  console.log(`PROMOTED ${row.version} (manifest ${manifestChecksum.slice(0, 12)}…).`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
