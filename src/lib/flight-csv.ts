// The flight CSV export and Save all's "which glasses still need a note"
// rule (S13; spec §11.3 items 16-17; ledger B10; Q5). Pure: the route
// (`export.csv/route.ts`) and the action (`record-actions.ts`) only load
// data — resolving ids to display names, gathering the viewer's own points —
// and call these; the shape and gating rules live here so they are tested.
//
// Rule 1: a glass that is not fully revealed carries NOTHING beyond its
// number and whether it was revealed, even when the caller's loader still
// holds an answer or a contributor name for it (the loader may hold answers
// for glasses this viewer cannot see identities for yet, since it does not
// always re-check `isRevealed` before building its map) — every other
// column, "brought by" and "your points" included, is left blank. Once a
// glass reveals, who brought it and what it scored are no longer secrets,
// but keeping the never-revealed row's shape uniform (only two cells ever
// populated) is what makes it impossible for a loader bug elsewhere to leak
// an identity through this row by accident.

import type { TastingStatus, WineSourceMode } from "@/lib/supabase/database.types";
import type { CsvCell } from "./csv";

export type CsvViewerRole = "host-provides-host" | "host" | "competitor" | "other";

export type CsvAnswer = {
  producer: string;
  wineName: string | null;
  vintage: string;
  country: string;
  region: string;
  appellation: string | null;
  primaryGrape: string;
  secondaryGrape: string | null;
  typeDesignation: string | null;
};

export type CsvGlass = {
  glass: number;
  wineId: string;
  isRevealed: boolean;
  broughtBy: string | null;
  viewerPoints: number | null;
};

/**
 * The 404 rule (spec §11.3 item 17, on the `calendar.ics` pattern): only the
 * host and a JOINED participant, only once the tasting is CLOSED. `"other"`
 * covers everyone else — INVITED, DECLINED, a signed-in stranger who can read
 * the tasting row because a wine is revealed, or signed out.
 */
export function exportAllowed(input: {
  status: TastingStatus;
  viewerRole: CsvViewerRole;
}): boolean {
  return input.status === "CLOSED" && input.viewerRole !== "other";
}

const IDENTITY_HEADER: readonly CsvCell[] = [
  "glass",
  "revealed",
  "producer",
  "wine name",
  "vintage",
  "country",
  "region",
  "appellation",
  "primary grape",
  "secondary grape",
  "type designation",
];

/**
 * The CSV's rows, header first. "brought by" is added only in bring-your-own
 * (whether or not this viewer brought a glass themselves); "your points" is
 * added for anyone but the host-provides host, who never competes.
 */
export function flightCsvRows(input: {
  glasses: readonly CsvGlass[];
  answersByWineId: ReadonlyMap<string, CsvAnswer>;
  viewer: { role: CsvViewerRole; wineSource: WineSourceMode };
}): CsvCell[][] {
  const showBroughtBy = input.viewer.wineSource === "PARTICIPANT_CONTRIBUTED";
  const showPoints = input.viewer.role !== "host-provides-host";

  const header: CsvCell[] = [...IDENTITY_HEADER];
  if (showBroughtBy) header.push("brought by");
  if (showPoints) header.push("your points");

  const rows: CsvCell[][] = [header];
  for (const glass of input.glasses) {
    const answer = glass.isRevealed ? (input.answersByWineId.get(glass.wineId) ?? null) : null;
    const row: CsvCell[] = [
      glass.glass,
      glass.isRevealed ? "yes" : "no",
      answer?.producer ?? "",
      answer?.wineName ?? "",
      answer?.vintage ?? "",
      answer?.country ?? "",
      answer?.region ?? "",
      answer?.appellation ?? "",
      answer?.primaryGrape ?? "",
      answer?.secondaryGrape ?? "",
      answer?.typeDesignation ?? "",
    ];
    if (showBroughtBy) row.push(glass.isRevealed ? (glass.broughtBy ?? "") : "");
    if (showPoints) row.push(glass.isRevealed ? (glass.viewerPoints ?? "") : "");
    rows.push(row);
  }
  return rows;
}

/**
 * Save all (Q5): the fully revealed glasses this taster has no note on yet,
 * so a second tap — nothing changed in between — saves nothing.
 */
export function glassesNeedingNotes(
  revealedWineIds: readonly string[],
  notedWineIds: ReadonlySet<string>,
): string[] {
  return revealedWineIds.filter((id) => !notedWineIds.has(id));
}
