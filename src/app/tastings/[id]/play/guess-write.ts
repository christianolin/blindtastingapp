// Per-field-group guess writes (spec §8.3 items 5–6; ledger B7). Each ladder
// pick upserts only its own group of `guesses` columns, so a failed save
// reverts only that group and the other groups carry on.
//
// Pure — no React, no Supabase, no server-only — so vitest pins the groups and
// the ranges, and the server action (BT-Y1's `saveGuessFields`) runs
// `groupPayload` again on whatever the client sent: the server never trusts
// the client's shape. Runtime imports are relative only (vitest has no `@/`).
import { VINTAGE_YEAR_MIN, vintageYearMax } from "../../../../lib/wine-identity/complete";
import type { GuessRow, LadderField } from "./ladder-types";

export type GuessFieldGroup = "origin" | "grapes" | "producer" | "designation" | "vintage";

/** The `guesses` columns each group writes — nothing else is ever sent. A
 *  region pick sets its country (T6), so origin travels as one group. */
export const GROUP_COLUMNS: Readonly<Record<GuessFieldGroup, readonly (keyof GuessRow)[]>> = {
  origin: ["country_id", "region_id", "appellation_id"],
  grapes: ["primary_grape_id", "secondary_grape_id"],
  producer: ["producer_id"],
  designation: ["type_designation_id"],
  vintage: ["vintage_kind", "vintage_year", "vintage_tawny_years"],
};

export function groupForField(field: LadderField): GuessFieldGroup {
  switch (field) {
    case "country":
    case "region":
    case "appellation":
      return "origin";
    case "primary_grape":
    case "secondary_grape":
      return "grapes";
    case "producer":
      return "producer";
    case "type_designation":
      return "designation";
    case "vintage":
      return "vintage";
  }
}

/** The refusal of a malformed vintage group (plan copy). */
export const INVALID_VINTAGE = "Choose a vintage from the list.";

// Tawny ages follow the answer key's rule (add-wine F1, 1–100). complete.ts
// keeps those bounds private; the year range is imported from it.
const TAWNY_YEARS_MIN = 1;
const TAWNY_YEARS_MAX = 100;

/** The picker's tawny shortcuts; "Other age…" takes any age in range. */
const TAWNY_STEPS = [10, 20, 30, 40] as const;

/** A usable id, or null: blanks and non-strings never reach the database. */
function idOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function vintagePayload(row: GuessRow, now: Date): { values: Partial<GuessRow> } | { error: string } {
  switch (row.vintage_kind) {
    case "YEAR":
      return inRange(row.vintage_year, VINTAGE_YEAR_MIN, vintageYearMax(now))
        ? { values: { vintage_kind: "YEAR", vintage_year: row.vintage_year, vintage_tawny_years: null } }
        : { error: INVALID_VINTAGE };
    case "TAWNY":
      return inRange(row.vintage_tawny_years, TAWNY_YEARS_MIN, TAWNY_YEARS_MAX)
        ? { values: { vintage_kind: "TAWNY", vintage_year: null, vintage_tawny_years: row.vintage_tawny_years } }
        : { error: INVALID_VINTAGE };
    case "NV":
      return { values: { vintage_kind: "NV", vintage_year: null, vintage_tawny_years: null } };
    case null:
      // A skip clears the whole vintage.
      return { values: { vintage_kind: null, vintage_year: null, vintage_tawny_years: null } };
    default:
      return { error: INVALID_VINTAGE };
  }
}

/**
 * The values one group writes, taken from `row` — exactly `GROUP_COLUMNS[group]`
 * and nothing more. YEAR needs 1900..(UTC year + 1); TAWNY needs 1..100; NV and
 * a skip clear both numbers.
 */
export function groupPayload(
  group: GuessFieldGroup,
  row: GuessRow,
  now: Date,
): { values: Partial<GuessRow> } | { error: string } {
  switch (group) {
    case "origin":
      return {
        values: {
          country_id: idOrNull(row.country_id),
          region_id: idOrNull(row.region_id),
          appellation_id: idOrNull(row.appellation_id),
        },
      };
    case "grapes":
      return {
        values: {
          primary_grape_id: idOrNull(row.primary_grape_id),
          secondary_grape_id: idOrNull(row.secondary_grape_id),
        },
      };
    case "producer":
      return { values: { producer_id: idOrNull(row.producer_id) } };
    case "designation":
      return { values: { type_designation_id: idOrNull(row.type_designation_id) } };
    case "vintage":
      return vintagePayload(row, now);
  }
}

/** The vintage picker's lists: years from next UTC year down to 1900, and the
 *  tawny shortcuts. */
export function vintageOptions(now: Date): { years: number[]; tawny: number[] } {
  const years: number[] = [];
  for (let year = vintageYearMax(now); year >= VINTAGE_YEAR_MIN; year--) years.push(year);
  return { years, tawny: [...TAWNY_STEPS] };
}
