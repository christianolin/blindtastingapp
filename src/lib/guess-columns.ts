import type { Database } from "./supabase/database.types";

// The explicit `guesses` read list (spec §10.4 (e)).
//
// M9b revokes table-wide SELECT on `guesses` from the client roles and grants
// back exactly these 27 columns. The one column left out is
// `guessed_wine_id`: a semi-blind pick is a wine id, and wine ids map to pour
// positions, so reading it back would turn a guest's own matches into the
// answer key. Every `from("guesses").select(...)` passes this list, or a
// narrower explicit one, and never "*" — once M9b is live a "*" select is
// refused outright.
//
// A string literal rather than a joined array, so postgrest-js keeps parsing
// the select string and inferring the row type at the call site.

export const GUESS_READ_COLUMNS =
  "id, wine_id, participant_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, country_points, region_points, appellation_points, primary_grape_points, secondary_grape_points, producer_points, type_designation_points, vintage_points, total_points, scored_at, submitted_at, updated_at, reveal_step, locked_at";

/** The same columns as an array, in grant order. */
export const GUESS_READ_COLUMN_LIST: readonly string[] = Object.freeze(
  GUESS_READ_COLUMNS.split(", "),
);

// Compile-time guard: every name in the list must be a real `guesses` column
// in the hand-written types, so a typo or a renamed column fails `tsc`
// instead of failing a select at runtime.
type ColumnsOf<S extends string, Found extends string = never> =
  S extends `${infer Column}, ${infer Rest}` ? ColumnsOf<Rest, Found | Column> : Found | S;
type GuessRow = Database["public"]["Tables"]["guesses"]["Row"];
type OnlyGuessColumns<T extends keyof GuessRow> = T;

/** One column a client may select from `guesses`. */
export type GuessReadColumn = OnlyGuessColumns<ColumnsOf<typeof GUESS_READ_COLUMNS>>;
