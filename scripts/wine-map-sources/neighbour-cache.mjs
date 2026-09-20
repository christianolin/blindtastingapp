// The map's "nearby" chips are served from a precomputed cache
// (public.wine_place_neighbours, migration 20260920090000). ANY write to
// wine_places or wine_place_boundaries invalidates it: a statement-level
// trigger clears public.wine_place_neighbours_state.fresh, and while that flag
// is false get_wine_place_context falls back to measuring polygons on every
// click — correct, but back to the latency the cache exists to remove (a
// country click 65 ms instead of 1 ms; the worst key in the catalogue 454 ms
// instead of 1 ms).
//
// Every script in this folder that commits against live is a catalogue writer,
// so every one of them leaves the cache stale. They cannot rebuild it in the
// same transaction the way a migration does — build-germany-einzellagen.mjs
// commits once per place, and the rebuild costs ~65 s — so the rule for a
// pipeline run is: ONE refresh, as the LAST step of the batch, in its own
// transaction.
//
//   node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs
//
// warnIfNeighbourCacheStale() is what makes that rule hard to forget: a
// committing script calls it right after its commit and the operator is told,
// in the script's own output, that the cache is now stale and what to run. It
// costs one indexed single-row read, it never throws, and it says nothing at
// all on a database where the migration is not applied yet.

const REFRESH_COMMAND =
  "node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs";

let announced = false;
let lastCheckedAt = 0;
const RECHECK_MS = 10_000;

/** Reset the once-per-process latches. Tests only. */
export function resetNeighbourCacheWarning() {
  announced = false;
  lastCheckedAt = 0;
}

/**
 * Read the freshness flag. Returns `null` when the cache does not exist yet
 * (the migration is not applied on this database) or the read failed — the
 * callers of this module are pipeline scripts whose real work has already
 * committed, so a problem here must never become their exit code.
 */
export async function readNeighbourCacheState(client) {
  try {
    const result = await client.query(
      "select fresh, built_at from public.wine_place_neighbours_state where only_row",
    );
    if (result.rowCount !== 1) return null;
    return { fresh: result.rows[0].fresh === true, builtAt: result.rows[0].built_at };
  } catch {
    return null;
  }
}

/**
 * Print a banner, once per process, if this run has left the map's nearby
 * cache stale. Safe to call after every commit, including inside a loop: the
 * flag and the 10 s throttle keep it to one round trip.
 */
export async function warnIfNeighbourCacheStale(client) {
  if (announced) return false;
  const now = Date.now();
  if (now - lastCheckedAt < RECHECK_MS) return false;
  lastCheckedAt = now;

  const state = await readNeighbourCacheState(client);
  if (state === null || state.fresh) return false;

  announced = true;
  console.warn(
    [
      "",
      "!! the map's nearby-chip cache (wine_place_neighbours) is now STALE.",
      "!! get_wine_place_context is back to measuring polygons per click:",
      "!! correct, but ~65x slower on a country. Rebuild it when this BATCH",
      "!! is finished writing (not per script, not per transaction):",
      `!!   ${REFRESH_COMMAND}`,
      "",
    ].join("\n"),
  );
  return true;
}

/**
 * Rebuild the cache, as the owner (the pipeline scripts connect as postgres;
 * no other role may execute the function). Returns { refreshed: false } when
 * the cache is already fresh and `force` is not set, so it is safe to call at
 * the end of any run — including a dry one that wrote nothing.
 *
 * Deliberately issues NO begin/commit of its own. On an idle connection the
 * single statement is its own transaction, which is what a batch wants; called
 * with a transaction already open it simply joins it, which is the stronger
 * same-transaction form a migration uses. An explicit `commit` here would end
 * the caller's transaction instead of its own, which is a trap not worth
 * leaving lying around.
 *
 * Throws when the function refuses to publish (a negative return), which means
 * the rebuilt list held a row an ordinary reader could not see. Nothing needs
 * rolling back in that case: the function leaves `fresh` false, and while that
 * flag is false get_wine_place_context ignores the table entirely.
 */
export async function refreshNeighbourCache(client, { force = false } = {}) {
  const before = await readNeighbourCacheState(client);
  if (before === null) {
    return { refreshed: false, reason: "absent" };
  }
  if (before.fresh && !force) {
    return { refreshed: false, reason: "already-fresh", builtAt: before.builtAt };
  }

  // ~65 s over 3,257 places, which is close enough to a two-minute default to
  // be worth saying out loud. Transactional when a transaction is open, so a
  // caller that rolls back gets its own timeout back with it.
  await client.query("set statement_timeout = '600s'");
  try {
    const result = await client.query("select public.refresh_wine_place_neighbours() as rows");
    const rows = Number(result.rows[0].rows);
    if (!Number.isFinite(rows) || rows < 0) {
      throw new Error(
        "refresh_wine_place_neighbours() refused to publish the cache (returned " +
          `${result.rows[0].rows}); it is left stale, which is slow and still correct`,
      );
    }
    announced = false;
    return { refreshed: true, rows };
  } finally {
    await client.query("reset statement_timeout").catch(() => undefined);
  }
}

export { REFRESH_COMMAND };
