// The training room's reveal (spec §3.4): a note pick that goes back to the
// page that opened the sheet instead of opening NewNoteModal, and never draws
// a cellar bottle down — a bottle poured blind was opened by someone else.
// The provider (add-wine-context.tsx) and the adds hook (use-sheet-adds.ts)
// call these; they live here so vitest can pin them.
//
// Pure: type-only imports, so vitest (no `@/` alias) can load it.
import type { AddWineDestination, NotePick } from "./types";

/** A note destination opened by the training room's "Reveal the bottle". */
export function isRevealDestination(destination: AddWineDestination | null): boolean {
  return destination?.kind === "note" && destination.reveal === true;
}

/** A reveal pick with the draw-down switched off; any other pick unchanged. */
export function revealSafePick(pick: NotePick, destination: AddWineDestination | null): NotePick {
  return isRevealDestination(destination) ? { ...pick, consume: false } : pick;
}

export type NotePickRoute =
  | { kind: "ignore" }
  | { kind: "hand-back"; pick: NotePick }
  | { kind: "open-note"; pick: NotePick };

/**
 * Where a sheet's note pick goes. `seq` is the open that picked, `currentSeq`
 * the provider's latest open: a pick from a replaced open is dropped. The
 * current open hands the pick back when it passed `onNotePick` (never
 * consuming), and otherwise opens the note as Taste & rate always has.
 */
export function routeNotePick(p: {
  seq: number;
  currentSeq: number;
  pick: NotePick;
  handBack: boolean;
}): NotePickRoute {
  if (p.seq !== p.currentSeq) return { kind: "ignore" };
  if (p.handBack) return { kind: "hand-back", pick: { ...p.pick, consume: false } };
  return { kind: "open-note", pick: p.pick };
}
