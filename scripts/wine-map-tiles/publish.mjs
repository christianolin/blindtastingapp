// Publish stage: record the release (BUILDING), upload both archives to
// immutable versioned paths, re-run the validation gates through the PUBLIC
// URLS (the real-PMTiles hosting acceptance), then mark VALIDATED. Any
// failure marks the release FAILED and exits 1; the manifest is untouched.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { FetchSource } from "pmtiles";
import {
  pgConfig,
  releaseObjectPath,
  sha256hex,
  storagePublicUrl,
  uploadObject,
  WORK_DIR,
} from "./lib.mjs";
import { validateArchives } from "./validate.mjs";

const release = JSON.parse(await readFile(path.join(WORK_DIR, "release.json"), "utf8"));
const names = ["world", ...Object.keys(release.shards)];
const archives = {};
for (const name of names) {
  const body = await readFile(path.join(WORK_DIR, `${name}.pmtiles`));
  archives[name] = {
    body,
    path: releaseObjectPath(release.version, `${name}.pmtiles`),
    bytes: body.byteLength,
    checksum_sha256: sha256hex(body),
  };
}

// tile_checksums persists each shard's bbox/zoom so promote.mjs can emit v2
// manifest metadata even on the rollback/explicit-version path, where
// release.json is not on disk.
const tileChecksums = {
  world: {
    path: archives.world.path,
    bytes: archives.world.bytes,
    checksum_sha256: archives.world.checksum_sha256,
  },
};
for (const key of Object.keys(release.shards)) {
  tileChecksums[key] = {
    path: archives[key].path,
    bytes: archives[key].bytes,
    checksum_sha256: archives[key].checksum_sha256,
    bbox: release.shards[key].bbox,
    min_zoom: release.shards[key].min_zoom,
    max_zoom: release.shards[key].max_zoom,
  };
}

const client = new pg.Client(pgConfig());
await client.connect();
let releaseId;
try {
  const inserted = await client.query(
    `insert into wine_map_releases (version, status, tile_checksums, feature_counts, build_inputs)
     values ($1, 'BUILDING', $2, $3, $4)
     returning id`,
    [
      release.version,
      JSON.stringify(tileChecksums),
      JSON.stringify(release.counts),
      JSON.stringify({
        git_sha: release.git_sha,
        node: release.node,
        tippecanoe: "2.79.0",
        generated_at: release.generated_at,
      }),
    ],
  );
  releaseId = inserted.rows[0].id;

  try {
    for (const name of names) {
      await uploadObject(archives[name].path, archives[name].body, {
        contentType: "application/octet-stream",
        cacheControlSeconds: 31536000,
        upsert: false,
      });
      console.log(`Uploaded ${archives[name].path} (${archives[name].bytes} bytes).`);
    }

    // Remote read-back through the public URLs: proves range requests work
    // on a REAL PMTiles archive before this release can ever be promoted.
    const remoteSources = {};
    for (const name of names) {
      remoteSources[name] = new FetchSource(storagePublicUrl(archives[name].path));
    }
    const { gates, featureCounts } = await validateArchives(remoteSources, release);
    for (const gate of gates) console.log(`REMOTE GATE ${gate}`);

    const ranged = await fetch(storagePublicUrl(archives.world.path), {
      headers: { Range: "bytes=0-16383", Origin: "https://blindrapp.vercel.app" },
    });
    assert.equal(ranged.status, 206, "expected 206 for ranged archive read");
    const acao = ranged.headers.get("access-control-allow-origin");
    assert.ok(acao === "*" || acao === "https://blindrapp.vercel.app", "missing CORS header");

    await client.query(
      `update wine_map_releases
       set status = 'VALIDATED', validation_report = $2
       where id = $1`,
      [
        releaseId,
        JSON.stringify({ gates, feature_counts: featureCounts, remote: { ranged_status: 206, cors: acao } }),
      ],
    );
    console.log(`Release ${release.version} VALIDATED.`);
  } catch (error) {
    try {
      await client.query(
        `update wine_map_releases set status = 'FAILED', validation_report = $2 where id = $1`,
        [releaseId, JSON.stringify({ error: String(error?.message ?? error) })],
      );
    } catch (updateError) {
      // Never let the bookkeeping failure mask the root cause.
      console.error(`could not mark release FAILED: ${updateError.message}`);
    }
    throw error;
  }
} finally {
  await client.end();
}
