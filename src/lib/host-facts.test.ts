import { describe, expect, it } from "vitest";
import { glassFacts, type FactRow } from "./host-facts";

const row = (participant_id: string, over: Partial<FactRow> = {}): FactRow => ({
  participant_id, primary_grape_id: null, appellation_id: null,
  locked_at: "2026-09-13T19:00:00Z", scored_at: null, ...over,
});
const names: Record<string, string> = { barolo: "Barolo DOCG", barbaresco: "Barbaresco DOCG" };
const base = {
  answer: { primary_grape_id: "nebbiolo", appellation_id: "barbaresco" },
  eligibleIds: new Set(["p1", "p2", "p3", "p4"]),
  nameOf: (id: string) => names[id] ?? null,
};
const rows = [
  row("p1", { primary_grape_id: "nebbiolo", appellation_id: "barolo" }),
  row("p2", { primary_grape_id: "nebbiolo", appellation_id: "barolo" }),
  row("p3", { primary_grape_id: "sangiovese", appellation_id: "barbaresco", locked_at: null }), // an unlocked draft
  row("p4", { primary_grape_id: "nebbiolo", appellation_id: "barbaresco", locked_at: null, scored_at: "2026-09-13T19:05:00Z" }),
  row("host", { primary_grape_id: "nebbiolo" }), // not eligible
];

describe("glassFacts (B6 'This glass', D15 reveal-8)", () => {
  it("nothing before any reveal", () => {
    expect(glassFacts({ ...base, revealedKeys: [], rows })).toEqual([]);
  });
  it("the grape fact once grapes are revealed, over locked or scored eligible rows", () => {
    expect(glassFacts({ ...base, revealedKeys: ["country", "region", "grapes"], rows })).toEqual([
      { label: "Got the grape", value: "3 of 4" },
    ]);
  });
  it("appellation facts once the appellation is revealed", () => {
    expect(glassFacts({ ...base, revealedKeys: ["country", "region", "appellation"], rows })).toEqual([
      { label: "Got the appellation", value: "1 of 4" },
      { label: "Most said", value: "Barolo DOCG" },
    ]);
  });
  it("no appellation facts when the wine has none; nothing without an answer", () => {
    expect(glassFacts({ ...base, answer: { primary_grape_id: "nebbiolo", appellation_id: null }, revealedKeys: ["appellation", "grapes"], rows }))
      .toEqual([{ label: "Got the grape", value: "3 of 4" }]);
    expect(glassFacts({ ...base, answer: null, revealedKeys: ["grapes"], rows })).toEqual([]);
  });
});

// Edges beyond the plan's block (BT-P4): the console polls, so a fact must not
// flicker with row order.
describe("glassFacts edges", () => {
  it("a tied 'Most said' does not depend on row order", () => {
    const tied = [row("p1", { appellation_id: "barolo" }), row("p2", { appellation_id: "barbaresco" })];
    const a = glassFacts({ ...base, revealedKeys: ["appellation"], rows: tied });
    const b = glassFacts({ ...base, revealedKeys: ["appellation"], rows: [...tied].reverse() });
    expect(a).toEqual(b);
    expect(a).toContainEqual({ label: "Most said", value: "Barbaresco DOCG" });
  });
  it("no 'Most said' when nobody counted named an appellation, or its name is unknown", () => {
    expect(glassFacts({ ...base, revealedKeys: ["appellation"], rows: [row("p1")] })).toEqual([
      { label: "Got the appellation", value: "0 of 4" },
    ]);
    expect(
      glassFacts({ ...base, revealedKeys: ["appellation"], rows: [row("p1", { appellation_id: "unknown" })] }),
    ).toEqual([{ label: "Got the appellation", value: "0 of 4" }]);
  });
});

describe("glassFacts with nobody eligible", () => {
  it("returns nothing, so the console empty state (Nobody is guessing this glass.) shows instead of 0 of 0", () => {
    expect(glassFacts({ ...base, eligibleIds: new Set<string>(), revealedKeys: ["grapes", "appellation"], rows })).toEqual([]);
  });
});
