import { describe, expect, it } from "vitest";
import { friendsLine, notesLine, ratingSpread, spreadLine } from "./rating-spread";

const notes = [
  { score: 97, authorId: "a" },
  { score: 86, authorId: "b" },
  { score: 92, authorId: "c" },
  { score: 95, authorId: "b" },
  { score: null, authorId: "d" },
];

describe("ratingSpread", () => {
  it("averages the scored notes and finds the ends and the friends", () => {
    expect(ratingSpread(notes, new Set(["b", "d"]))).toEqual({ avg: 92.5, count: 4, highest: 97, lowest: 86, byFriends: 2 });
  });
  it("is empty with no scored notes", () => {
    expect(ratingSpread([{ score: null, authorId: "a" }], new Set())).toEqual({ avg: null, count: 0, highest: null, lowest: null, byFriends: 0 });
  });
  it("rounds the average to one decimal", () => {
    expect(ratingSpread([{ score: 90, authorId: "a" }, { score: 91, authorId: "b" }, { score: 91, authorId: "c" }], new Set()).avg).toBe(90.7);
  });
});

describe("lines", () => {
  const s = ratingSpread(notes, new Set(["b"]));
  it("notes, spread on both widths, friends", () => {
    expect(notesLine(s)).toBe("4 notes");
    expect(spreadLine(s, { phone: false })).toBe("4 notes · highest 97 · lowest 86");
    expect(spreadLine(s, { phone: true })).toBe("4 notes · 86 to 97");
    expect(friendsLine(s)).toBe("2 by friends");
    expect(friendsLine({ ...s, byFriends: 1 })).toBe("1 by a friend");
    expect(friendsLine({ ...s, byFriends: 0 })).toBeNull();
  });
  it("one note collapses the ends", () => {
    const one = ratingSpread([{ score: 88, authorId: "a" }], new Set());
    expect(spreadLine(one, { phone: false })).toBe("1 note · 88");
    expect(spreadLine(one, { phone: true })).toBe("1 note · 88");
    expect(spreadLine(ratingSpread([], new Set()), { phone: false })).toBeNull();
  });
});
