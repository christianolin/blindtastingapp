// Promotion: write tiles/manifest.json pointing at a VALIDATED (or, for
// rollback, RETIRED) release, then flip statuses in one transaction. The
// manifest is written BEFORE the DB flip; if the flip fails, re-running
// promote converges. Rollback = promote an earlier version explicitly.
//
//   node scripts/wine-map-tiles/promote.mjs [<version>] [--reveal-rule N]
//
// A release that would switch the size rule on (its shards carry a
// reveal_rule the ACTIVE release does not) is refused unless its version is
// named and `--reveal-rule N` says its draft was checked
// (lib.mjs revealRulePromoteRefusal).
import assert from "node:assert/strict";
import pg from "pg";
import {
  manifestForRelease,
  parsePromoteArgs,
  pgConfig,
  revealRulePromoteRefusal,
  sha256hex,
  storagePublicUrl,
  uploadObject,
} from "./lib.mjs";

const { version: requestedVersion, revealRule: approvedRule } = parsePromoteArgs(process.argv.slice(2));
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
  // Before anything is written: a release that would switch the size rule on
  // needs its draft checked first (review 2026-10-01).
  const active = await client.query(
    `select tile_checksums from wine_map_releases where status = 'ACTIVE' and id <> $1`,
    [row.id],
  );
  const refusal = revealRulePromoteRefusal({
    version: row.version,
    target: row.tile_checksums,
    active: active.rows[0]?.tile_checksums ?? (row.status === "ACTIVE" ? row.tile_checksums : null),
    approvedRule,
  });
  assert.equal(refusal, null, refusal ?? undefined);

  // lib.mjs manifestForRelease: every archive at its public URL, plus each
  // shard's reveal_rule when the release carries one (none before 2026-09-30,
  // so promoting an older release for a rollback turns the size rule off).
  const manifest = manifestForRelease({
    version: row.version,
    tileChecksums: row.tile_checksums,
    generatedAt: new Date().toISOString(),
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
