import { describe, expect, it } from "vitest";
import { makeWineLabeler } from "./wine-label";

type Row = { id: string; position: number; contributor_participant_id: string | null };
type Source = "HOST_PROVIDES" | "PARTICIPANT_CONTRIBUTED";

const wine = (id: string, position: number, contributor: string | null = null): Row => ({
  id,
  position,
  contributor_participant_id: contributor,
});

/** Labels in the order the rows were given. */
const labelsOf = (rows: Row[], source: Source, names = new Map<string, string>()) =>
  rows.map(makeWineLabeler(rows, source, names));

describe("makeWineLabeler — host provides", () => {
  it("numbers by list order when stored positions have gaps", () => {
    const rows = [wine("a", 1), wine("b", 3), wine("c", 7)];
    expect(labelsOf(rows, "HOST_PROVIDES")).toEqual(["Wine 1", "Wine 2", "Wine 3"]);
  });

  it("sorts unsorted input by position before numbering", () => {
    const rows = [wine("c", 9), wine("a", 2), wine("b", 5)];
    expect(labelsOf(rows, "HOST_PROVIDES")).toEqual(["Wine 3", "Wine 1", "Wine 2"]);
  });

  it("counts from 1 whatever the first stored position is", () => {
    expect(labelsOf([wine("a", 0), wine("b", 1)], "HOST_PROVIDES")).toEqual([
      "Wine 1",
      "Wine 2",
    ]);
    // moveWine parks a wine at a negative slot mid-swap.
    expect(labelsOf([wine("b", 2), wine("a", -1)], "HOST_PROVIDES")).toEqual([
      "Wine 2",
      "Wine 1",
    ]);
  });

  it("does not reorder or mutate the rows it was given", () => {
    const rows = [wine("c", 9), wine("a", 2)];
    makeWineLabeler(rows, "HOST_PROVIDES", new Map());
    expect(rows.map((r) => r.id)).toEqual(["c", "a"]);
  });

  it("ignores contributors when the host provides the wines", () => {
    const rows = [wine("b", 4, "p-anna"), wine("a", 2)];
    const names = new Map([["p-anna", "Anna"]]);
    expect(labelsOf(rows, "HOST_PROVIDES", names)).toEqual(["Wine 2", "Wine 1"]);
  });

  it("falls back to the stored position for a wine outside the list", () => {
    const label = makeWineLabeler([wine("a", 1)], "HOST_PROVIDES", new Map());
    expect(label(wine("z", 12))).toBe("Wine 12");
  });
});

describe("makeWineLabeler — bring your own", () => {
  const names = new Map([
    ["p-gustav", "Gustav"],
    ["p-anna", "Anna"],
  ]);

  it("numbers several bottles from one contributor in serving order", () => {
    const rows = [
      wine("g2", 8, "p-gustav"),
      wine("a1", 2, "p-anna"),
      wine("g1", 3, "p-gustav"),
      wine("g3", 20, "p-gustav"),
    ];
    expect(labelsOf(rows, "PARTICIPANT_CONTRIBUTED", names)).toEqual([
      "Gustav's wine #2",
      "Anna's wine",
      "Gustav's wine #1",
      "Gustav's wine #3",
    ]);
  });

  it("names an unknown contributor Someone", () => {
    expect(labelsOf([wine("x", 1, "p-ghost")], "PARTICIPANT_CONTRIBUTED", names)).toEqual([
      "Someone's wine",
    ]);
  });

  it("numbers a bottle with no contributor by list order", () => {
    const rows = [wine("h", 9), wine("p", 4, "p-anna")];
    expect(labelsOf(rows, "PARTICIPANT_CONTRIBUTED", names)).toEqual(["Wine 2", "Anna's wine"]);
  });
});
