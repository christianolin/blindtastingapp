import { describe, expect, it } from "vitest";
import { GUESS_READ_COLUMNS, GUESS_READ_COLUMN_LIST } from "./guess-columns";

describe("GUESS_READ_COLUMNS (M9b's SELECT grant)", () => {
  it("is exactly the 27 columns clients may select, in grant order", () => {
    expect(GUESS_READ_COLUMNS.split(", ")).toEqual([
      "id", "wine_id", "participant_id",
      "country_id", "region_id", "appellation_id", "primary_grape_id", "secondary_grape_id",
      "producer_id", "type_designation_id", "vintage_kind", "vintage_year", "vintage_tawny_years",
      "country_points", "region_points", "appellation_points", "primary_grape_points",
      "secondary_grape_points", "producer_points", "type_designation_points", "vintage_points",
      "total_points", "scored_at", "submitted_at", "updated_at", "reveal_step", "locked_at",
    ]);
    expect(GUESS_READ_COLUMN_LIST).toHaveLength(27);
  });
});
