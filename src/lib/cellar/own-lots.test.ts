import { describe, expect, it } from "vitest";
import { stripLine, stripSummary, stripTitle, type OwnLot } from "./own-lots";

const lot = (o: Partial<OwnLot> & { id: string }): OwnLot => ({
  quantity: 1,
  purchasedQuantity: 1,
  storageLocation: null,
  purchasedOn: null,
  createdAt: "2024-01-01T00:00:00Z",
  ...o,
});

describe("stripSummary", () => {
  it("one lot: the W2 strip", () => {
    const s = stripSummary([
      lot({
        id: "a",
        quantity: 3,
        purchasedQuantity: 6,
        storageLocation: "Cellar, rack B",
        purchasedOn: "2023-11-05",
      }),
    ]);
    expect(s).toEqual({
      bottles: 3,
      place: "Cellar, rack B",
      drunk: 3,
      bought: 6,
      addedMonth: "Nov 2023",
      lotsWord: "one lot",
      firstLotId: "a",
    });
    expect(stripTitle(s!)).toBe("You own 3 bottles");
    expect(stripLine(s!, { phone: false })).toBe(
      "Cellar, rack B · 3 of 6 drunk · added Nov 2023 · one lot",
    );
    expect(stripLine(s!, { phone: true })).toBe(
      "Cellar, rack B · 3 of 6 drunk · added Nov 2023",
    );
  });

  it("several lots: the dominant place, summed counts, the oldest lot's month and id", () => {
    const s = stripSummary([
      lot({
        id: "old",
        quantity: 1,
        purchasedQuantity: 1,
        storageLocation: "Kitchen",
        purchasedOn: "2022-03-01",
        createdAt: "2022-03-01T00:00:00Z",
      }),
      lot({
        id: "new",
        quantity: 4,
        purchasedQuantity: 4,
        storageLocation: "Rack A",
        createdAt: "2024-06-01T00:00:00Z",
      }),
    ]);
    expect(s).toEqual({
      bottles: 5,
      place: "Rack A",
      drunk: 0,
      bought: 5,
      addedMonth: "Mar 2022",
      lotsWord: "two lots",
      firstLotId: "old",
    });
    expect(stripLine(s!, { phone: false })).toBe(
      "Rack A · added Mar 2022 · two lots",
    );
  });

  it("no place, one bottle", () => {
    const s = stripSummary([lot({ id: "a" })]);
    expect(s?.place).toBeNull();
    expect(stripTitle(s!)).toBe("You own 1 bottle");
    expect(stripLine(s!, { phone: false })).toBe("added Jan 2024 · one lot");
  });

  it("null with no lots", () => {
    expect(stripSummary([])).toBeNull();
  });
});
