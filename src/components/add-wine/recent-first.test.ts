import { describe, expect, it } from "vitest";
import { recentFirst } from "./recent-first";

describe("recentFirst — wines your circle added in the last day lead the catalog hits", () => {
  it("puts the recent rows first, newest first, and drops their duplicates from the page", () => {
    const hits = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const recent = [{ id: "c" }, { id: "z" }];
    expect(recentFirst(recent, hits).map((r) => r.id)).toEqual(["c", "z", "a", "b"]);
  });
  it("keeps the page as it is with nothing recent", () => {
    const hits = [{ id: "a" }, { id: "b" }];
    expect(recentFirst([], hits)).toEqual(hits);
  });
  it("never lists one wine twice", () => {
    expect(recentFirst([{ id: "a" }, { id: "a" }], [{ id: "a" }]).map((r) => r.id)).toEqual(["a"]);
  });
});
