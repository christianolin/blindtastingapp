// View rules for the room's candidate list and Your call card (training-room
// spec §3.3, §5.8): the laptop column's top five and Show all, the
// before-answers country groups, the "Unlikely from what you've said" group,
// the Your call options and the vintage picker's groups and ids. Pure,
// relative imports only, so vitest pins it.
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type PickerGroup,
} from "../../app/tastings/[id]/play/ladder-types";
import { foldName } from "../wine-identity/fold";
import { TRAINING_COPY, tawnyAgeOption } from "./copy";
import type { RankedCandidate, VintageGuess } from "./types";

/** Rows the laptop column shows before Show all. */
export const PANEL_LIMIT = 5;

export type PanelGroup = { key: string; heading: string | null; rows: RankedCandidate[] };
export type PanelView = { before: boolean; groups: PanelGroup[]; total: number; hidden: number };

/** Nothing answered yet that any candidate can be measured on, and nothing capped. */
export function isBeforeAnswers(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}

/**
 * The list as groups, in the matcher's order. Before any answer the groups are
 * countries (the matcher already sorts un-numbered candidates by country then
 * name); after, the uncapped rows come first without a heading and the capped
 * ones follow under "Unlikely from what you've said".
 */
export function panelView(
  ranked: readonly RankedCandidate[],
  expanded: boolean,
  limit: number = PANEL_LIMIT,
): PanelView {
  const before = isBeforeAnswers(ranked);
  const rows = expanded ? [...ranked] : ranked.slice(0, limit);
  const groups: PanelGroup[] = [];
  for (const r of rows) {
    const key = before ? `country:${r.candidate.country.name}` : r.capped ? "unlikely" : "likely";
    const heading = before ? r.candidate.country.name : r.capped ? TRAINING_COPY.unlikelyGroup : null;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, heading, rows: [r] });
  }
  return { before, groups, total: ranked.length, hidden: ranked.length - rows.length };
}

/**
 * Whether closing a candidate's laptop popover hands focus back to its row:
 * only on a fine pointer (where it took focus as it opened), and not when a
 * press or focus elsewhere closed it — focus is already where the taster went.
 * `reason` is base-ui's close reason ("escape-key", "outside-press", …).
 */
export function detailReturnsFocus(reason: string | null, fine: boolean): boolean {
  return fine && reason !== "outside-press" && reason !== "focus-out";
}

/**
 * Whether a request to close a candidate's laptop popover is a press on the
 * row that owns it. That row toggles its popover itself (its own click closes
 * it), so this outside press — base-ui's, which lands before the row's click —
 * must not close it too, or the click would open it again at once. `anchor` is
 * the owning row (null: none), `target` the press's target node.
 */
export function pressOnOwningRow<T>(
  reason: string,
  anchor: { contains(node: T): boolean } | null,
  target: T | null,
): boolean {
  return reason === "outside-press" && anchor !== null && target !== null && anchor.contains(target);
}

/** Your call's list without a search: the top five. */
export const CALL_LIMIT = 5;
/** Your call's search results. */
export const CALL_SEARCH_LIMIT = 20;

/**
 * The candidates Your call offers: the ranking's top five (plus the current
 * pick when it sits further down), or — with a query — every candidate whose
 * name, appellation, region or country contains it, accents and punctuation
 * folded, in ranking order.
 */
export function yourCallOptions(
  ranked: readonly RankedCandidate[],
  query: string,
  pickedId: string | null,
): RankedCandidate[] {
  const key = foldName(query);
  if (key !== "") {
    return ranked
      .filter((r) =>
        [r.candidate.name, r.candidate.appellation.name, r.candidate.region.name, r.candidate.country.name].some(
          (n) => foldName(n).includes(key),
        ),
      )
      .slice(0, CALL_SEARCH_LIMIT);
  }
  const top = ranked.slice(0, CALL_LIMIT);
  if (pickedId && !top.some((r) => r.candidate.id === pickedId)) {
    const picked = ranked.find((r) => r.candidate.id === pickedId);
    if (picked) return [...top, picked];
  }
  return top;
}

/** The vintage picker's groups, as the guess ladder's own (guess-ladder.tsx,
    "vintage"): the years given, NV, then the tawny presets and "Other age…". */
export function vintagePickerGroups(years: readonly number[], tawny: readonly number[]): PickerGroup[] {
  return [
    {
      heading: TRAINING_COPY.vintageYearGroup,
      options: years.map((y) => ({ id: vintageYearId(y), name: String(y) })),
    },
    {
      heading: TRAINING_COPY.vintageNvGroup,
      options: [{ id: VINTAGE_NV_ID, name: TRAINING_COPY.vintageNv, sub: TRAINING_COPY.vintageNvGroup }],
    },
    {
      heading: TRAINING_COPY.vintageTawnyGroup,
      options: [
        ...tawny.map((n) => ({ id: vintageTawnyId(n), name: tawnyAgeOption(n) })),
        { id: VINTAGE_TAWNY_OTHER_ID, name: TRAINING_COPY.vintageOtherAge },
      ],
    },
  ];
}

/** The guess ladder's vintage picker row a guess sits on ("" = none). */
export function vintagePickerValue(v: VintageGuess, tawnyPresets: readonly number[]): string {
  if (v === null) return "";
  if (v.kind === "YEAR") return vintageYearId(v.year);
  if (v.kind === "NV") return VINTAGE_NV_ID;
  return tawnyPresets.includes(v.years) ? vintageTawnyId(v.years) : VINTAGE_TAWNY_OTHER_ID;
}

export type VintagePick = { vintage: VintageGuess } | { otherTawny: true };

/** A picked row as a guess; "Other age…" asks for a typed age instead. */
export function vintageFromPickerId(id: string | null): VintagePick {
  if (id === null) return { vintage: null };
  if (id === VINTAGE_NV_ID) return { vintage: { kind: "NV" } };
  if (id === VINTAGE_TAWNY_OTHER_ID) return { otherTawny: true };
  if (id.startsWith("year:")) {
    const year = Number(id.slice(5));
    return Number.isInteger(year) ? { vintage: { kind: "YEAR", year } } : { vintage: null };
  }
  if (id.startsWith("tawny:")) {
    const years = Number(id.slice(6));
    return Number.isInteger(years) ? { vintage: { kind: "TAWNY", years } } : { vintage: null };
  }
  return { vintage: null };
}

/** A typed tawny age: whole years 1–100, as the ladder's "Other age…" accepts. */
export function tawnyYearsFromInput(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
}
