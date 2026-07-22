// Regenerates data/wine-map/boundary-expectations.json from the LIVE
// current-boundary set. Run ONLY after a reviewed flip (the JSON pins the
// reviewed state; the foundation suite asserts live equals it). The git diff
// of the JSON is part of the flip's review evidence.
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const client = new pg.Client(pgConfig());
await client.connect();
const { rows } = await client.query(
  `select p.canonical_key, b.boundary_method, s.source_feature_id,
          snapshot.normalized_checksum_sha256,
          snapshot.raw_snapshot_uri,
          snapshot.raw_checksum_sha256,
          snapshot.provenance_note is not null documented
     from wine_place_boundaries b
     join wine_places p on p.id = b.wine_place_id
     join wine_boundary_source_snapshots snapshot
       on snapshot.id = b.source_snapshot_id
     join wine_boundary_sources s on s.id = snapshot.source_id
    where b.is_current
    order by p.canonical_key`,
);
await client.end();

await writeFile(
  new URL("../../data/wine-map/boundary-expectations.json", import.meta.url),
  `${JSON.stringify(rows, null, 2)}\n`,
);
console.log(`WROTE boundary-expectations.json with ${rows.length} current boundaries`);
