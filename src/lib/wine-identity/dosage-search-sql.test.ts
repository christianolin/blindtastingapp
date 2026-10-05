// search_catalog_wines' dosage spellings (20261003101200) must be dosage.ts's own, so
// the catalog search and the add-wine sheet's tasted-row filter find the same wines.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DOSAGE_NAMES, dosageSearchTerms } from "./dosage";

const MIGRATION = path.join(
  process.cwd(),
  "supabase/migrations/20261003101200_dosage_training_and_search.sql",
);

describe("search_catalog_wines' dosage spellings", () => {
  const sql = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const cases = new Map(
    [...sql.matchAll(/^\s*when '([^']+)' then '((?:[^']|'')*)'$/gm)].map((m) => [m[1], m[2].replace(/''/g, "'")]),
  );

  it("names each of the seven dosages once", () => {
    expect([...cases.keys()]).toEqual([...DOSAGE_NAMES]);
  });

  it.each([...DOSAGE_NAMES])("%s searches by exactly dosageSearchTerms", (name) => {
    expect(cases.get(name)).toBe(dosageSearchTerms(name).join(" "));
  });

  it("widens the training designation category to the dosage, in both places", () => {
    expect(sql.match(/in \(v_wine\.type_designation_id,\s+v_wine\.dosage_designation_id\)/g)).toHaveLength(2);
    expect(sql).toContain("when v_wine.type_designation_id is null and v_wine.dosage_designation_id is null then null");
  });
});
