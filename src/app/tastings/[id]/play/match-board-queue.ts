// Pure serialisation + error-classification helpers for the semi-blind match
// board's assign/clear calls (BT-S3; review V2-6-07: "match-board assigns
// are not serialised"). Kept dependency-free (no React, no Supabase) so the
// ordering and classification rules are pinned by match-board-queue.test.ts;
// match-board.tsx wires `createSerialQueue()` to the real assignMatch/
// clearMatch calls and `isTransientMatchError()` to the real server reply.

/**
 * A tiny FIFO promise queue. `enqueue(task)` runs `task` only once every
 * task enqueued before it has settled (resolved or rejected) — so at most
 * one task is ever in flight. This is what serialises assignMatch/clearMatch
 * (plan refinement 25 / BT-S2): without it, two overlapping calls from the
 * same participant (assign glass 1, then glass 2, before the first reply
 * lands) can race the database — a deadlock between the participant's own
 * two row locks taken in a different order (40P01), or a unique-constraint
 * race on `guesses_one_open_glass_per_candidate` (23505). actions.ts already
 * retries each once, but a client that never lets its own calls overlap in
 * the first place needs no retry to begin with. A task that throws or
 * rejects never blocks the tasks queued after it.
 */
export function createSerialQueue(): (task: () => Promise<void>) => void {
  let tail: Promise<void> = Promise.resolve();
  return (task: () => Promise<void>) => {
    tail = tail.then(task, task).catch(() => {});
  };
}

// assign_semi_blind_match / clear_semi_blind_match's error, once it survives
// actions.ts's own single retry, is either a real refusal (e.g. "Glass 2 ·
// locked", already turned into a sentence by matchErrorMessage) or
// Postgres's own raw text for a transient concurrency artifact — a deadlock
// (40P01) or a unique violation (23505). That raw text is meaningless to a
// viewer, so it gets no sentence here at all (plan refinement 25 / BT-S2:
// "40P01 and 23505 mean refresh or retry, never a sentence") — the caller
// still calls router.refresh() to reconcile, just without showing this
// string.
const TRANSIENT_PREFIXES = ["deadlock detected", "duplicate key value violates unique constraint"];

export function isTransientMatchError(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return TRANSIENT_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
