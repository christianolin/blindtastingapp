// The single source of the incomplete-glass wording (D7; spec §B.3 "Where the
// phrases appear", §C.7 step 2, §C.8), as amended by the blind-tasting ledger:
// Start warns about an incomplete glass instead of refusing it, and revealing one
// stays refused. A glass is incomplete while it has no answer key. The field nouns
// come from describeMissing, so they live in one place.
// Pure: relative imports only (vitest has no "@/" alias).
import { COMPLETE_WINE_FIELDS } from "./complete";
import { describeMissing } from "./describe";
import type { WineFieldKey } from "./types";

export type IncompleteGlass = { wineId: string; glass: number; missing: WineFieldKey[] };

/** One row of the `tasting_incomplete_glasses` RPC (spec §E.3). */
type IncompleteGlassRow = { wine_id: string; glass: number; missing: readonly string[] };

/**
 * Maps the RPC rows. Keys outside COMPLETE_WINE_FIELDS are dropped and the rest
 * keep contract order. A glass with no key left needs every field: the RPC sends an
 * empty list for a glass with no draft row (a failed second write, spec §C.8), and a
 * draft whose keys are all unknown is no more finished than that.
 */
export function toIncompleteGlasses(rows: readonly IncompleteGlassRow[]): IncompleteGlass[] {
  return rows.map((row) => {
    const missing = COMPLETE_WINE_FIELDS.filter((field) => row.missing.includes(field));
    return {
      wineId: row.wine_id,
      glass: row.glass,
      missing: missing.length > 0 ? missing : [...COMPLETE_WINE_FIELDS],
    };
  });
}

// "needs a vintage"; an empty list reads as every field, as in toIncompleteGlasses.
function needs(missing: readonly WineFieldKey[]): string {
  return describeMissing(missing.length > 0 ? missing : COMPLETE_WINE_FIELDS);
}

/**
 * Start's inline warning. Start never waits for an incomplete glass:
 * "Glass 3 still needs a vintage — finish it before you reveal it."
 * Several glasses join with " · " and end "— finish them before you reveal them."
 * null when every glass is complete.
 */
export function startWarning(rows: readonly IncompleteGlass[]): string | null {
  if (rows.length === 0) return null;
  const glasses = rows.map((row) => `Glass ${row.glass} still ${needs(row.missing)}`).join(" · ");
  return rows.length === 1
    ? `${glasses} — finish it before you reveal it.`
    : `${glasses} — finish them before you reveal them.`;
}

/** The reveal refusal for one glass: "Finish glass 3's details before revealing"; null once it is complete. */
export function revealRefusal(rows: readonly IncompleteGlass[], wineId: string): string | null {
  const row = rows.find((r) => r.wineId === wineId);
  return row ? `Finish glass ${row.glass}'s details before revealing` : null;
}

/** The adder's flight-page row line: "needs a vintage — tap Edit to finish". */
export function flightRowNeeds(missing: readonly WineFieldKey[]): string {
  return `${needs(missing)} — tap Edit to finish`;
}

/** The locked-in notice while scoring waits on an incomplete glass (ASYNC + IMMEDIATE, spec §C.8). */
export function pendingAnswerNotice(glass: number): string {
  return `Your answer shows once glass ${glass}'s details are finished.`;
}
