// The record's per-glass row shape (S13, S13b; spec §11.3 item 14; ledger
// B10; map RECORD-06, RECORD-07, RECORD-08, RECORD-09, RECORD-10,
// RECORD-15). One pure branch per case so `record-view.tsx` never has to
// re-derive which of these five shapes a glass is in — it only resolves the
// display strings and hands them here.
//
// Rule 1: a glass that is not fully revealed (or whose answer key could not
// be read — the fail-closed "no_answer_key" case `result-math.ts`'s
// `partition` already produces) carries nothing beyond its number. A
// joined-after glass (B4) carries no identity either, even though the wine
// itself is public once revealed — only "you joined after this glass" and a
// 0, nothing this taster could have seen.
//
// The "hosted" shape (identity, no marks, no points) is not only for the
// literal host-provides host: `record-view.tsx` also uses it for a
// bring-your-own contributor's OWN bottle (RECORD-06 gap (e), "your own BYO
// bottle has no marks") and for a genuine spectator with no guess of their
// own — anyone this tasting never asked to guess this particular glass — by
// passing `viewerRole: "spectator"` for that one row even when their overall
// role for the tasting is "competitor". Pure: relative runtime imports only.

import type { Mark } from "./result-math";

export type RecordRowGlass = {
  /** List-order position, 1-based ("Glass 3"). */
  number: number;
  /** `wines.is_revealed`. The only "fully revealed" signal (Rule 1). */
  isRevealed: boolean;
  /** The bring-your-own contributor's display name, when this glass has one. */
  contributor: string | null;
  /** `wines.created_at > tastings.started_at` — a glass added mid-pour. */
  addedWhilePouring: boolean;
};

export type RecordRowAnswer = {
  producer: string;
  wineName: string | null;
  vintage: string;
  appellation: string | null;
  region: string;
  /** Primary grape, or "{primary} / {secondary}" when the wine has a second. */
  grape: string;
};

/**
 * The viewer's role for THIS glass, not necessarily their role for the whole
 * tasting: `record-view.tsx` passes "spectator" for a competitor's own
 * bring-your-own bottle too (see module comment).
 */
export type RecordViewerRole = "competitor" | "host-provides-host" | "spectator";

export type RecordRowInput = {
  glass: RecordRowGlass;
  /** Null exactly when the answer key could not be read for a revealed glass (Rule 1, fail-closed). */
  answer: RecordRowAnswer | null;
  /** The six C R A G P V marks, in `MARK_CATEGORIES` order. Ignored outside the "blind" branch. */
  marks: readonly Mark[];
  /** This taster's points on the glass (0 with no row); ignored for "hosted" and forced to 0 for "joined-after". */
  points: number;
  /** The most common pick's label, shown on a semi-blind miss; ignored otherwise. */
  pickLabel: string | null;
  mode: "BLIND" | "SEMI_BLIND";
  viewerRole: RecordViewerRole;
  /** B4: this glass was revealed before the viewer joined. */
  joinedAfter: boolean;
};

export type RecordRow =
  | { kind: "never-revealed"; glass: number }
  | { kind: "joined-after"; glass: number; points: number }
  | {
      kind: "blind";
      glass: number;
      identity: string;
      meta: string;
      provenance: string | null;
      marks: readonly Mark[];
      points: number;
    }
  | {
      kind: "semi-blind";
      glass: number;
      identity: string;
      meta: string;
      provenance: string | null;
      hit: boolean;
      pickLabel: string | null;
      points: number;
    }
  | {
      kind: "hosted";
      glass: number;
      identity: string;
      meta: string;
      provenance: string | null;
    };

const isText = (value: string | null | undefined): value is string =>
  value != null && value.trim() !== "";

/** "{producer}, {wine name} {vintage}" — the comma-name half drops for a nameless wine (D3). */
function recordIdentity(answer: RecordRowAnswer): string {
  const namePart = isText(answer.wineName) ? `, ${answer.wineName.trim()}` : "";
  return `${answer.producer}${namePart} ${answer.vintage}`.trim();
}

/** "{appellation} · {region} · {grape}" — a missing appellation just drops its slot. */
function recordMeta(answer: RecordRowAnswer): string {
  return [answer.appellation, answer.region, answer.grape].filter(isText).join(" · ");
}

/** "{contributor} brought it" (bring-your-own) or "added while pouring", else null. */
function recordProvenance(glass: RecordRowGlass): string | null {
  if (isText(glass.contributor)) return `${glass.contributor} brought it`;
  if (glass.addedWhilePouring) return "added while pouring";
  return null;
}

export function recordRowModel(input: RecordRowInput): RecordRow {
  const glass = input.glass.number;

  if (!input.glass.isRevealed || !input.answer) {
    return { kind: "never-revealed", glass };
  }

  if (input.joinedAfter) {
    return { kind: "joined-after", glass, points: 0 };
  }

  const identity = recordIdentity(input.answer);
  const meta = recordMeta(input.answer);
  const provenance = recordProvenance(input.glass);

  // Identity-only for anyone with no personal marks on this glass: the
  // host-provides host, a genuine spectator, or (per-row) a competitor's own
  // bottle — checked ahead of the mode branch so a host-provides host of a
  // semi-blind tasting never gets a meaningless hit/miss mark either.
  if (input.viewerRole === "host-provides-host" || input.viewerRole === "spectator") {
    return { kind: "hosted", glass, identity, meta, provenance };
  }

  if (input.mode === "SEMI_BLIND") {
    return {
      kind: "semi-blind",
      glass,
      identity,
      meta,
      provenance,
      hit: input.points > 0,
      points: input.points,
      pickLabel: input.pickLabel,
    };
  }

  return {
    kind: "blind",
    glass,
    identity,
    meta,
    provenance,
    marks: input.marks,
    points: input.points,
  };
}
