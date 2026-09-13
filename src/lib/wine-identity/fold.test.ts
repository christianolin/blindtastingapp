import { describe, expect, it } from "vitest";
import { foldName, foldWords, isTitleOnly, normaliseCru, stripDesignationSuffix } from "./fold";

it.each([
  ["Château La Fleur-Pétrus", "chateaulafleurpetrus"],
  ["Clos du Mont-Olivet", "closdumontolivet"],
  ["Bourgogne Aligoté", "bourgognealigote"],
  ["Weißburgunder", "weissburgunder"],
  ["  ", ""],
])("foldName(%s) mirrors f_search_norm → %s", (s, out) => expect(foldName(s)).toBe(out));

it("foldWords keeps single spaces", () => expect(foldWords("Saint-Émilion  Grand Cru AOC")).toBe("saint emilion grand cru aoc"));
it("normaliseCru rewrites 1er cru", () => expect(normaliseCru("Puligny-Montrachet 1er Cru")).toBe("puligny montrachet premier cru"));

describe("stripDesignationSuffix removes one geographic designation word only", () => {
  it.each([
    ["Barbaresco DOCG", "barbaresco"],
    ["Saint-Émilion Grand Cru AOC", "saint emilion grand cru"],
    ["Rioja DOCa", "rioja"],
    ["Puglia IGP", "puglia"],
    ["Mosel Qualitätswein", "mosel qualitatswein"],
    ["Vin de France", "vin de france"],
  ])("%s → %s", (s, out) => expect(stripDesignationSuffix(s)).toBe(out));
});

it.each([["Domaine", true], ["Bodegas", true], ["Château", true], ["Château Palmer", false], ["", false]] as const)(
  "isTitleOnly(%s) = %s", (n, v) => expect(isTitleOnly(n)).toBe(v));
