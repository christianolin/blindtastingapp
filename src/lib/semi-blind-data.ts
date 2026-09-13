// The semi-blind reads (BT-S1; spec §10.3 item 1, §10.4 (b); ledger B9). The
// only place the app calls `get_semi_blind_candidates`, `get_semi_blind_board`
// and `get_semi_blind_revealed_picks` — a server-only module so nothing in a
// client bundle can carry the reasoning below out of context.
//
// Rule 1: every one of these RPCs speaks in opaque per-tasting candidate keys,
// never a wine id for an unrevealed candidate, and this module never reads
// the answer-key table or the guess row's picked-wine column itself — there
// would be nothing to read: M9b drops both from the client roles. A card is
// exactly what the RPC chose to hand this caller (see
// `semi-blind-candidates.ts` and `semi-blind-board.ts` for the shaping and
// sorting rules); this module only gets the JSON off the wire, checks its
// shape, and maps snake_case to camel.
//
// These three RPCs are VOLATILE (`get_semi_blind_candidates` and
// `get_semi_blind_revealed_picks` mint keys through `ensure_semi_blind_keys`
// on the way in), so they are called as ordinary POST RPCs — never
// `rpc(..., { get: true })`, and never from inside a read-only transaction.
//
// A malformed or errored RPC payload is logged and read as null (candidates,
// board) or as an empty list (revealed picks) — never thrown. A tasting page
// staying up with a missing list is better than a hard 500 for every viewer.
import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  buildCandidateCard,
  sortCandidates,
  type CandidateCard,
  type CandidateInput,
} from "@/lib/semi-blind-candidates";
import {
  boardFromRpc,
  type Board,
  type BoardGlass,
  type SemiBlindBoardJson,
} from "@/lib/semi-blind-board";
import type { VintageKind } from "@/lib/supabase/database.types";

// ── get_semi_blind_candidates ────────────────────────────────────────────────

type RawCandidateCard = {
  key: string;
  producer: string | null;
  wine_name: string | null;
  vintage_kind: VintageKind | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  appellation: string | null;
  grape: string | null;
  /** List-order glass number, null unless that candidate's glass is revealed. */
  revealed_glass: number | null;
};

type RawCandidatesPayload = {
  cards: RawCandidateCard[];
  pending: number | null;
};

const VINTAGE_KINDS: readonly VintageKind[] = ["YEAR", "NV", "TAWNY"];

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isRawCandidateCard(value: unknown): value is RawCandidateCard {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.key === "string" &&
    isNullableString(v.producer) &&
    isNullableString(v.wine_name) &&
    (v.vintage_kind === null || VINTAGE_KINDS.includes(v.vintage_kind as VintageKind)) &&
    isNullableNumber(v.vintage_year) &&
    isNullableNumber(v.vintage_tawny_years) &&
    isNullableString(v.appellation) &&
    isNullableString(v.grape) &&
    isNullableNumber(v.revealed_glass)
  );
}

function isRawCandidatesPayload(value: unknown): value is RawCandidatesPayload {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.cards) && v.cards.every(isRawCandidateCard) && isNullableNumber(v.pending);
}

export type SemiBlindCandidates = {
  /** Sorted by `sortCandidates` — never pour order (rule 1). */
  cards: CandidateCard[];
  /** Glasses with no answer key yet. Only ever non-null for the host, or for
   *  anyone once the tasting has started (spec §10.4 b). */
  pending: number | null;
  /** Revealed glasses only, keyed by the same opaque key as `cards`. */
  revealedGlassByKey: Record<string, number>;
};

/**
 * The semi-blind list's data (SB1). Null for an INVITED/DECLINED viewer, a
 * non-participant, a BLIND tasting, or a tasting that does not exist —
 * `can_see_semi_blind_list` inside the RPC decides all of that; this module
 * never re-derives it. Also null on an RPC error or a malformed payload
 * (logged either way).
 */
export async function getSemiBlindCandidates(tastingId: string): Promise<SemiBlindCandidates | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_semi_blind_candidates", {
    p_tasting_id: tastingId,
  });
  if (error) {
    console.error("get_semi_blind_candidates RPC failed", { tastingId, error });
    return null;
  }
  if (data === null) return null;
  if (!isRawCandidatesPayload(data)) {
    console.error("get_semi_blind_candidates: malformed payload", { tastingId, data });
    return null;
  }

  const revealedGlassByKey: Record<string, number> = {};
  const inputs: CandidateInput[] = data.cards.map((card) => {
    if (card.revealed_glass != null) revealedGlassByKey[card.key] = card.revealed_glass;
    return {
      key: card.key,
      producer: card.producer,
      wineName: card.wine_name,
      vintageKind: card.vintage_kind,
      vintageYear: card.vintage_year,
      vintageTawnyYears: card.vintage_tawny_years,
      appellation: card.appellation,
      grape: card.grape,
    };
  });

  return {
    cards: sortCandidates(inputs.map(buildCandidateCard)),
    pending: data.pending,
    revealedGlassByKey,
  };
}

// ── get_semi_blind_board ─────────────────────────────────────────────────────

function isSemiBlindBoardJson(value: unknown): value is SemiBlindBoardJson {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.mine) &&
    Array.isArray(v.revealed) &&
    Array.isArray(v.split) &&
    Array.isArray(v.own_bottles) &&
    Array.isArray(v.known)
  );
}

/**
 * The caller's own matching board (SB2, SB3): `boardFromRpc` over
 * `get_semi_blind_board`'s payload, mapped onto `glasses` (list order, from
 * the caller's own `wines` read — never re-derived here). A null RPC result,
 * an error or a malformed payload all read as `boardFromRpc(glasses, null)`
 * — an empty board over the same glasses, same as an INVITED/DECLINED
 * viewer's "may not see the list" case.
 */
export async function getSemiBlindBoard(
  tastingId: string,
  glasses: readonly BoardGlass[],
): Promise<Board> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_semi_blind_board", {
    p_tasting_id: tastingId,
  });
  if (error) {
    console.error("get_semi_blind_board RPC failed", { tastingId, error });
    return boardFromRpc(glasses, null);
  }
  if (data === null) return boardFromRpc(glasses, null);
  if (!isSemiBlindBoardJson(data)) {
    console.error("get_semi_blind_board: malformed payload", { tastingId, data });
    return boardFromRpc(glasses, null);
  }
  return boardFromRpc(glasses, data);
}

// ── get_semi_blind_revealed_picks ────────────────────────────────────────────

export type SemiBlindRevealedPick = {
  glassWineId: string;
  participantId: string;
  correct: boolean;
  /** The picked wine's opaque candidate key; null when nothing was picked. */
  pickKey: string | null;
  /** "{producer}, {wine name} {vintage}" when the picked wine is revealed or
   *  the caller saw the list (host or JOINED participant); null otherwise. */
  pickLabel: string | null;
};

/**
 * Per revealed glass of a SEMI_BLIND tasting, who matched and what they
 * picked (§11, the record, `/u/[id]/tastings/[tastingId]`). Rows only for
 * glasses the caller can already read under `wines`/`tastings` RLS; an
 * ineligible row (a host-provides host's blank row, a contributor's own,
 * a non-JOINED row) still comes back — callers filter with
 * `eligibleForGlass`, the same rule BT-R2/BT-R3 apply elsewhere. Never
 * null: an RPC error reads as no rows, same as nothing revealed yet.
 */
export async function getSemiBlindRevealedPicks(tastingId: string): Promise<SemiBlindRevealedPick[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_semi_blind_revealed_picks", {
    p_tasting_id: tastingId,
  });
  if (error) {
    console.error("get_semi_blind_revealed_picks RPC failed", { tastingId, error });
    return [];
  }
  return (data ?? []).map((row) => ({
    glassWineId: row.glass_wine_id,
    participantId: row.participant_id,
    correct: row.correct,
    pickKey: row.pick_key,
    pickLabel: row.pick_label,
  }));
}
