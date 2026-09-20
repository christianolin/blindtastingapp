// Prefetch-on-intent for the wine map's details panel (spec
// docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.4).
//
// A short hover or keyboard focus on a place row is a good-enough signal that
// the place is about to be selected, and the three requests behind a selection
// take ~500 ms — long enough that starting them during the dwell usually makes
// the click feel instant. Pure so the whole rule is unit-tested; ./use-place-
// prefetch is the browser half that owns the timer.
//
// The touch guarantee is the important one: a phone has no hover, so a "hover"
// there is really the tap itself and prefetching would just double the work.
// `pointerFine` comes from `(hover: hover) and (pointer: fine)` — a media
// query, never a user-agent sniff.

/** How long a pointer must rest on a row before we believe it. */
export const PREFETCH_DWELL_MS = 120;

/** Sweeping the mouse down a long tree must not fan out: at most this many
    places may be warming at once. */
export const MAX_PREFETCH_IN_FLIGHT = 2;

export type PrefetchEnv = {
  /** The place being hovered or focused. */
  key: string | null;
  /** What the panel already shows. */
  selectedKey: string | null;
  /** `(hover: hover) and (pointer: fine)` — false on every touch device. */
  pointerFine: boolean;
  /** The cache already holds this key's context. */
  cached: boolean;
  /** Prefetches started and not yet settled. */
  inFlight: number;
};

/**
 * False for: no key; a coarse or hoverless pointer; the already-selected
 * place; an already-cached place; and once MAX_PREFETCH_IN_FLIGHT is reached.
 */
export function shouldPrefetch(env: PrefetchEnv): boolean {
  if (!env.key) return false;
  if (!env.pointerFine) return false;
  if (env.key === env.selectedKey) return false;
  if (env.cached) return false;
  if (env.inFlight >= MAX_PREFETCH_IN_FLIGHT) return false;
  return true;
}
