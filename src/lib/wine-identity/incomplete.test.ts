import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPLETE_WINE_FIELDS } from "./complete";
import * as incomplete from "./incomplete";
import { flightRowNeeds, pendingAnswerNotice, revealRefusal, startWarning, toIncompleteGlasses } from "./incomplete";

const rows = toIncompleteGlasses([
  { wine_id: "w3", glass: 3, missing: ["vintage"] },
  { wine_id: "w5", glass: 5, missing: ["vintage", "primaryGrape", "bogus"] },
]);

describe("incomplete-glass wording (D7)", () => {
  it("drops unknown keys", () => expect(rows[1].missing).toEqual(["vintage", "primaryGrape"]));
  it("treats an empty key list as every field", () =>
    expect(toIncompleteGlasses([{ wine_id: "w1", glass: 1, missing: [] }])[0].missing).toEqual([...COMPLETE_WINE_FIELDS]));
  it("treats a list with no known key left as every field", () =>
    expect(toIncompleteGlasses([{ wine_id: "w2", glass: 2, missing: ["bogus"] }])[0].missing).toEqual([...COMPLETE_WINE_FIELDS]));
  it("warns at Start glass by glass instead of refusing it (blind-tasting amendment 2)", () => {
    expect(startWarning(rows.slice(0, 1))).toBe("Glass 3 still needs a vintage — finish it before you reveal it.");
    expect(startWarning(rows)).toBe(
      "Glass 3 still needs a vintage · Glass 5 still needs a vintage and a grape — finish them before you reveal them.",
    );
    expect(startWarning([])).toBeNull();
  });
  it("exports no Start refusal any more", () => expect(incomplete).not.toHaveProperty("startRefusal"));
  it("refuses a reveal only for that glass", () => {
    expect(revealRefusal(rows, "w3")).toBe("Finish glass 3's details before revealing");
    expect(revealRefusal(rows, "w9")).toBeNull();
  });
  it("words the flight row and the locked-in notice", () => {
    expect(flightRowNeeds(["vintage"])).toBe("needs a vintage — tap Edit to finish");
    expect(flightRowNeeds(["vintage", "primaryGrape"])).toBe("needs a vintage and a grape — tap Edit to finish");
    expect(pendingAnswerNotice(3)).toBe("Your answer shows once glass 3's details are finished.");
  });
});

it("SQL names no field key, so flipping D3 changes no SQL (spec §B.3, §E.3)", () => {
  const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260912102000_wine_identity_drafts.sql"), "utf8");
  for (const key of COMPLETE_WINE_FIELDS) expect(sql).not.toContain(`'${key}'`);
});
