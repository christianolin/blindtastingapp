// The place tree's load state, kept apart from the tree itself.
//
// The explorer used to turn a failed get_wine_place_tree into `tree = []`,
// which every consumer — the tree card, the map's shard→country and area-slug
// props — could not tell from "still loading", and nothing on screen said
// anything had gone wrong. Now: loading → ready, or one automatic retry after
// TREE_AUTO_RETRY_MS and then failed, from which a manual Retry starts again.
// A failed tree never blanks the map: shards with no known country still
// render full depth in region colours, as they do before the tree lands.
//
// Pure: the explorer runs it through useReducer and starts one request per
// attempt (treeFetchDelay says when).

export type TreeLoad = { state: "loading" | "ready" | "failed"; attempt: number };

export type TreeLoadEvent = { type: "resolved" } | { type: "rejected" } | { type: "retry" };

/** The one automatic retry waits this long, so a blip has time to clear. */
export const TREE_AUTO_RETRY_MS = 2000;

export const INITIAL_TREE_LOAD: TreeLoad = { state: "loading", attempt: 0 };

// Attempt 1 is the automatic retry; 0 is the first request and 2+ are manual.
const AUTO_RETRY_ATTEMPT = 1;

export function treeLoadReducer(s: TreeLoad, e: TreeLoadEvent): TreeLoad {
  switch (e.type) {
    case "resolved":
      return s.state === "ready" ? s : { state: "ready", attempt: s.attempt };
    case "rejected":
      // A rejection only means something while a request is out; a stale one
      // arriving after a success must not undo it.
      if (s.state !== "loading") return s;
      return s.attempt === 0
        ? { state: "loading", attempt: AUTO_RETRY_ATTEMPT }
        : { state: "failed", attempt: s.attempt };
    case "retry":
      // Only a failed load can be retried by hand; a Retry while a request is
      // already out (a double tap) is a no-op.
      return s.state === "failed" ? { state: "loading", attempt: s.attempt + 1 } : s;
  }
}

/** How long to wait before starting the request for `attempt`: only the
    automatic retry waits. */
export function treeFetchDelay(attempt: number): number {
  return attempt === AUTO_RETRY_ATTEMPT ? TREE_AUTO_RETRY_MS : 0;
}
