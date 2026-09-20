// Rebuild the map's precomputed nearby-chip cache after a catalogue batch.
//
//   node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs
//   node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs --force
//   node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs --check
//
// Run it ONCE, as the last step of a run that wrote wine_places or
// wine_place_boundaries — see neighbour-cache.mjs for why the per-transaction
// rule a migration follows does not fit a pipeline script. Without --force it
// is a no-op when the cache is already fresh, so it is safe to end any run
// with, including one that wrote nothing. --check reports and writes nothing,
// exiting 1 when the cache is stale.
//
// Takes ~65 s over 3,257 places. It holds the one state row for its duration,
// so a catalogue write that starts while it runs waits for it.
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";
import { readNeighbourCacheState, refreshNeighbourCache } from "./neighbour-cache.mjs";

const force = process.argv.includes("--force");
const checkOnly = process.argv.includes("--check");

const client = new pg.Client(pgConfig());
client.on("notice", (n) => console.log(n.message));
await client.connect();
try {
  const before = await readNeighbourCacheState(client);
  if (before === null) {
    console.log(
      "wine_place_neighbours_state is not present: migration 20260920090000 is not applied here. Nothing to do.",
    );
    process.exitCode = checkOnly ? 1 : 0;
  } else if (checkOnly) {
    console.log(`cache fresh=${before.fresh} built_at=${before.builtAt ?? "never"}`);
    process.exitCode = before.fresh ? 0 : 1;
  } else {
    const started = Date.now();
    const result = await refreshNeighbourCache(client, { force });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.refreshed) {
      console.log(`REFRESHED ${result.rows} neighbour rows in ${seconds}s`);
    } else {
      console.log(
        `cache already fresh (built ${before.builtAt ?? "never"}); nothing rebuilt. Use --force to rebuild anyway.`,
      );
    }
  }
} catch (error) {
  console.error(`FAILED ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
