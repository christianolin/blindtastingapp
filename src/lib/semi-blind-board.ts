// The semi-blind matching board (ledger B9 "Matching"; spec §10.3 items 2
// and 6, §10.4 (b)–(c)).
//
// Semi-blind is a permutation: each glass holds at most one candidate, and a
// candidate sits on at most one open glass. This module is the client twin of
// `assign_semi_blind_match` and `clear_semi_blind_match`, so the board can show
// an assignment the moment it is made and revert it if the server refuses.
// The database stays the authority. Every refusal here mirrors a check in
// those functions, in the same order, and a refusal the client did not predict
// still comes back from the server (mapped by `matchRefusalSentence`).
//
// Rule 1: the board speaks in opaque candidate keys only. A glass is a wine id
// the viewer already sees as a row; a candidate is never a wine id. The only
// key-to-glass pairs it holds are the ones the server has already made
// public (revealed glasses) or the viewer has legitimately learned (their own
// scored glasses, `known`).
//
// Pure: no imports.

export type BoardGlass = {
  wineId: string;
  /** List-order glass number ("Glass 3"), never the stored position. */
  glass: number;
  isRevealed: boolean;
  revealStep: number;
  /** A bring-your-own bottle the viewer contributed: not theirs to match. */
  ownBottle: boolean;
};

/** The viewer's own guess row on one glass. `key` null: nothing assigned. */
export type BoardRow = {
  key: string | null;
  locked: boolean;
  scored: boolean;
  totalPoints: number | null;
};

export type Board = {
  /** Every glass of the tasting, in list order. */
  glasses: readonly BoardGlass[];
  /** The viewer's rows, by glass wine id. */
  mine: Readonly<Record<string, BoardRow>>;
  /** Revealed glasses only: the key of the wine each one turned out to be. */
  revealedKeyByGlass: Readonly<Record<string, string>>;
  /** Revealed glasses only: how the eligible table's picks split. */
  splitByGlass: Readonly<Record<string, readonly { key: string; count: number }[]>>;
  /** Keys of the wines the viewer brought. */
  ownBottleKeys: readonly string[];
  /** Unrevealed glasses the viewer has scored (ASYNC IMMEDIATE): their true key. */
  knownKeyByGlass: Readonly<Record<string, string>>;
};

/** `get_semi_blind_board`'s payload (M9a). */
export type SemiBlindBoardJson = {
  mine: {
    glass_wine_id: string;
    key: string | null;
    locked: boolean;
    scored: boolean;
    total_points: number | null;
  }[];
  revealed: { glass_wine_id: string; key: string }[];
  split: { glass_wine_id: string; key: string; count: number }[];
  own_bottles: string[];
  known: { glass_wine_id: string; key: string }[];
};

export type AssignOutcome =
  | { ok: true; board: Board; swappedWith: string | null }
  | { ok: false; reason: "locked-holder"; holderGlass: number }
  | { ok: false; reason: "revealed" | "not-in-pool" | "glass-locked" | "glass-closed" };

export type GlassRowState =
  | "open-empty"
  | "open-assigned"
  | "locked"
  | "not-poured"
  | "revealed"
  | "own-bottle";

// Glass ids are uuids, but a record lookup should still never fall through to
// Object.prototype.
function rowOf(board: Board, glassWineId: string): BoardRow | undefined {
  return Object.prototype.hasOwnProperty.call(board.mine, glassWineId)
    ? board.mine[glassWineId]
    : undefined;
}

function glassOf(board: Board, glassWineId: string): BoardGlass | undefined {
  return board.glasses.find((glass) => glass.wineId === glassWineId);
}

// A row holds its key only while it is unscored. That is the server's holder
// (`scored_at is null`) and the partial unique index's scope: once a glass is
// scored the viewer has learned whether the pick was right, so the wine they
// picked there is free to go on another glass.
function holds(row: BoardRow | undefined): row is BoardRow & { key: string } {
  return row != null && row.key != null && !row.scored;
}

/**
 * The board from `get_semi_blind_board`. A null payload — the viewer may not
 * see the list (INVITED, DECLINED, an outsider) — is an empty board over the
 * same glasses.
 */
export function boardFromRpc(
  glasses: readonly BoardGlass[],
  json: SemiBlindBoardJson | null,
): Board {
  const mine: Record<string, BoardRow> = {};
  const revealedKeyByGlass: Record<string, string> = {};
  const splitByGlass: Record<string, { key: string; count: number }[]> = {};
  const knownKeyByGlass: Record<string, string> = {};
  if (json == null) {
    return { glasses, mine, revealedKeyByGlass, splitByGlass, ownBottleKeys: [], knownKeyByGlass };
  }
  for (const row of json.mine) {
    mine[row.glass_wine_id] = {
      key: row.key,
      locked: row.locked,
      scored: row.scored,
      totalPoints: row.total_points,
    };
  }
  for (const row of json.revealed) revealedKeyByGlass[row.glass_wine_id] = row.key;
  for (const row of json.split) {
    const counts = splitByGlass[row.glass_wine_id] ?? (splitByGlass[row.glass_wine_id] = []);
    counts.push({ key: row.key, count: row.count });
  }
  for (const row of json.known) knownKeyByGlass[row.glass_wine_id] = row.key;
  return {
    glasses,
    mine,
    revealedKeyByGlass,
    splitByGlass,
    ownBottleKeys: [...json.own_bottles],
    knownKeyByGlass,
  };
}

/**
 * Put `key` on a glass, as `assign_semi_blind_match` will. A key held by
 * another open glass swaps: that glass receives this glass's previous key, or
 * becomes empty. `swappedWith` is the holder's glass whenever there was one,
 * exactly as the RPC reports it.
 */
export function applyAssignment(board: Board, glassWineId: string, key: string): AssignOutcome {
  // 'matching is closed' / 'you cannot match this glass'
  const target = glassOf(board, glassWineId);
  if (!target || target.ownBottle || target.isRevealed || target.revealStep > 0) {
    return { ok: false, reason: "glass-closed" };
  }

  // 'that wine is not in your pool': revealed, brought by the viewer, or
  // proven by the viewer's own scored glass. Revealed gets its own reason so
  // the board can say so.
  if (Object.values(board.revealedKeyByGlass).includes(key)) {
    return { ok: false, reason: "revealed" };
  }
  if (board.ownBottleKeys.includes(key) || Object.values(board.knownKeyByGlass).includes(key)) {
    return { ok: false, reason: "not-in-pool" };
  }

  // 'this glass is locked in'
  const mine = rowOf(board, glassWineId);
  if (mine && (mine.locked || mine.scored)) return { ok: false, reason: "glass-locked" };

  // 'glass locked', with the holder in the error detail
  let holder: { glass: BoardGlass; row: BoardRow } | null = null;
  for (const glass of board.glasses) {
    if (glass.wineId === glassWineId) continue;
    const row = rowOf(board, glass.wineId);
    if (holds(row) && row.key === key) {
      holder = { glass, row };
      break;
    }
  }
  if (holder && holder.row.locked) {
    return { ok: false, reason: "locked-holder", holderGlass: holder.glass.glass };
  }

  // Clear the holder, set this glass, then hand the holder this glass's
  // previous key — the RPC's order, so the unique index never sees a duplicate.
  const next: Record<string, BoardRow> = { ...board.mine };
  if (holder) next[holder.glass.wineId] = { ...holder.row, key: null };
  next[glassWineId] = mine
    ? { ...mine, key }
    : { key, locked: false, scored: false, totalPoints: null };
  if (holder && mine && mine.key != null) {
    next[holder.glass.wineId] = { ...holder.row, key: mine.key };
  }
  return {
    ok: true,
    board: { ...board, mine: next },
    swappedWith: holder ? holder.glass.wineId : null,
  };
}

/**
 * Take the key off a glass, as `clear_semi_blind_match` will: only the
 * viewer's own unlocked, unscored row on an unrevealed glass. Anything the
 * RPC would refuse or skip returns the board unchanged.
 */
export function clearAssignment(board: Board, glassWineId: string): Board {
  const glass = glassOf(board, glassWineId);
  const row = rowOf(board, glassWineId);
  if (
    !glass ||
    glass.isRevealed ||
    glass.revealStep > 0 ||
    !row ||
    row.locked ||
    row.scored ||
    row.key == null
  ) {
    return board;
  }
  return { ...board, mine: { ...board.mine, [glassWineId]: { ...row, key: null } } };
}

/**
 * The cards still to place ("Still unassigned"): every card except those the
 * viewer holds on an open glass, revealed wines, the viewer's own bottles and
 * wines the viewer has proven. Keeps the cards' own order (`sortCandidates`).
 */
export function poolFor<T extends { key: string }>(cards: readonly T[], board: Board): T[] {
  const gone = new Set<string>([
    ...Object.values(board.revealedKeyByGlass),
    ...board.ownBottleKeys,
    ...Object.values(board.knownKeyByGlass),
  ]);
  for (const glass of board.glasses) {
    const row = rowOf(board, glass.wineId);
    if (holds(row)) gone.add(row.key);
  }
  return cards.filter((card) => !gone.has(card.key));
}

/**
 * "{assigned} of {total} matched": over the whole flight except the viewer's
 * own bottles, counting glasses that carry an assignment. Matches, never
 * points (SB-11).
 */
export function matchedCount(board: Board): { assigned: number; total: number } {
  let assigned = 0;
  let total = 0;
  for (const glass of board.glasses) {
    if (glass.ownBottle) continue;
    total += 1;
    if (rowOf(board, glass.wineId)?.key != null) assigned += 1;
  }
  return { assigned, total };
}

/**
 * How one glass row renders. `pouredThroughIndex` is `pouredThrough()` from
 * `pour-pointer.ts` (a list index) in LIVE guided pacing, and null otherwise,
 * when every glass is open.
 *
 * Precedence: the viewer's own bottle always reads "Your bottle" (they have
 * nothing to match on it, revealed or not); then revealed; then anything the
 * viewer holds, locked or not; pacing only dims a glass the viewer has not
 * touched. A glass with a step reveal in progress is not a semi-blind state
 * (only guided LIVE blind tastings step-reveal) and gets no case of its own.
 */
export function glassRowState(
  board: Board,
  glassWineId: string,
  pouredThroughIndex: number | null,
): GlassRowState {
  const index = board.glasses.findIndex((glass) => glass.wineId === glassWineId);
  const glass = index >= 0 ? board.glasses[index] : undefined;
  const row = rowOf(board, glassWineId);
  if (glass?.ownBottle) return "own-bottle";
  if (glass?.isRevealed) return "revealed";
  if (row && (row.locked || row.scored)) return "locked";
  if (row?.key != null) return "open-assigned";
  if (pouredThroughIndex != null && index > pouredThroughIndex) return "not-poured";
  return "open-empty";
}
