// The context fallback feeds selectionFeatureStates when the tree is missing,
// and must never describe a place other than the one selected.
import { describe, expect, it } from "vitest";
import { fallbackFromContext } from "./selection-state";

const VOSNE = "france.bourgogne.cote-de-nuits.vosne-romanee";
const context = {
  place: { key: VOSNE },
  children: [{ key: `${VOSNE}.la-tache` }, { key: `${VOSNE}.les-suchots` }],
  ancestors: [{ key: "france" }, { key: "france.bourgogne" }, { key: "france.bourgogne.cote-de-nuits" }],
};

describe("fallbackFromContext", () => {
  it("gives the selection's children and its nearest ancestor", () => {
    expect(fallbackFromContext(context, VOSNE)).toEqual({
      childKeys: [`${VOSNE}.la-tache`, `${VOSNE}.les-suchots`],
      parentKey: "france.bourgogne.cote-de-nuits",
    });
  });

  it("is null while the context still describes the previous selection", () => {
    expect(fallbackFromContext(context, "france.bourgogne.cote-de-beaune")).toBeNull();
  });

  it("is null with no context or no selection", () => {
    expect(fallbackFromContext(null, VOSNE)).toBeNull();
    expect(fallbackFromContext(context, null)).toBeNull();
  });

  it("a country has no parent", () => {
    expect(
      fallbackFromContext({ place: { key: "france" }, children: [{ key: "france.bourgogne" }], ancestors: [] }, "france"),
    ).toEqual({ childKeys: ["france.bourgogne"], parentKey: null });
  });
});
