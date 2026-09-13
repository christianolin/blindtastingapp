import { describe, expect, it } from "vitest";
import { appellationHint, appellationPlaceholder, escapeLike, findSelfNamedAppellation, justTheRegionOption } from "./self-named-appellation";

describe("the self-named appellation (spec §C.5 A7, RC5)", () => {
  it("justTheRegionOption", () => {
    expect(justTheRegionOption({ id: "r", name: "Bourgogne" }, [{ id: "a1", name: "Bourgogne Aligoté AOC" }, { id: "a2", name: "Bourgogne AOC" }])).toEqual({ id: "a2", name: "Bourgogne AOC" });
    expect(justTheRegionOption({ id: "r", name: "Langhe" }, [{ id: "a1", name: "Barolo DOCG" }])).toBeNull();
  });
  it("page cap: 1364 unordered rows with the self-named row after row 1000", async () => {
    const rows = Array.from({ length: 1364 }, (_, i) => ({ id: `x${i}`, name: `Bourgogne Village ${String(i).padStart(4, "0")} AOC` }));
    rows.splice(1200, 0, { id: "self", name: "Bourgogne AOC" });
    expect(await findSelfNamedAppellation({ id: "r", name: "Bourgogne" }, async (from, to) => rows.slice(from, to + 1))).toEqual({ id: "self", name: "Bourgogne AOC" });
  });
  it("more than 25 earlier-sorting names never hide it", async () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, name: `Côtes du Rhône Villages ${i} AOC` })), { id: "self", name: "Rhône AOC" }];
    expect(await findSelfNamedAppellation({ id: "r", name: "Rhône" }, async (from, to) => rows.slice(from, to + 1), 25)).toEqual({ id: "self", name: "Rhône AOC" });
  });
  it("placeholder, hint and escaping", () => {
    expect([appellationPlaceholder(true), appellationPlaceholder(false)]).toEqual(["Just the region", "Pick one"]);
    const base = "Ordered by the region above when there is one; a plain list when there is not. Nothing is selected for you.";
    expect(appellationHint(null, false)).toBe(base);
    expect(appellationHint("Langhe", false)).toBe(`${base} Langhe has no region-wide appellation — pick the one on the label.`);
    expect(appellationHint("Bourgogne", true)).toBe(base);
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
});
