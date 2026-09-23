// The selection's feature-state sets replace the old per-layer key/parent_id
// expressions, so they must name exactly the features those expressions
// matched: `sel` = key == selectedKey; `child` = parent_id == the selection's
// id; `rel` = children, siblings (parent_id == the selection's parent id) and
// the parent itself (id == the selection's parent id). Ids follow the tile
// routing: world ids are the `region` property (a country's own key, else the
// region slug), shard ids are the canonical key.
import { describe, expect, it } from "vitest";
import { FIXTURE_TREE } from "./__fixtures__/place-tree";
import { selectionFeatureStates, type SelectionStates } from "./selection-state";

const BOURGOGNE = "wine-shard-bourgogne";
const BORDEAUX = "wine-shard-bordeaux";
const WORLD = "wine-world";
const VOSNE = "france.bourgogne.cote-de-nuits.vosne-romanee";

function plain(states: SelectionStates) {
  return Object.fromEntries(
    [...states].map(([source, features]) => [source, Object.fromEntries(features)]),
  );
}

const select = (selectedKey: string | null) =>
  plain(selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey, fallback: null }));

describe("selectionFeatureStates from the tree", () => {
  it("nothing selected: no state anywhere", () => {
    expect(select(null)).toEqual({});
  });

  it("a country: itself on the world source, its regions as children in both archives", () => {
    expect(select("france")).toEqual({
      [WORLD]: {
        france: { sel: true },
        bourgogne: { child: true, rel: true },
        bordeaux: { child: true, rel: true },
      },
      [BOURGOGNE]: { "france.bourgogne": { child: true, rel: true } },
      [BORDEAUX]: { "france.bordeaux": { child: true, rel: true } },
    });
  });

  it("a region: both copies selected, the country and sibling regions related", () => {
    expect(select("france.bourgogne")).toEqual({
      [WORLD]: {
        bourgogne: { sel: true },
        france: { rel: true },
        bordeaux: { rel: true },
      },
      [BOURGOGNE]: {
        "france.bourgogne": { sel: true },
        "france.bourgogne.cote-de-nuits": { child: true, rel: true },
        "france.bourgogne.cote-de-beaune": { child: true, rel: true },
      },
      [BORDEAUX]: { "france.bordeaux": { rel: true } },
    });
  });

  it("a district: shard-only children, the region related in both archives", () => {
    expect(select("france.bourgogne.cote-de-nuits")).toEqual({
      [WORLD]: { bourgogne: { rel: true } },
      [BOURGOGNE]: {
        "france.bourgogne.cote-de-nuits": { sel: true },
        [VOSNE]: { child: true, rel: true },
        "france.bourgogne.cote-de-nuits.gevrey-chambertin": { child: true, rel: true },
        "france.bourgogne": { rel: true },
        "france.bourgogne.cote-de-beaune": { rel: true },
      },
    });
  });

  it("a village: climats as children, the district and the next village related", () => {
    expect(select(VOSNE)).toEqual({
      [BOURGOGNE]: {
        [VOSNE]: { sel: true },
        [`${VOSNE}.la-tache`]: { child: true, rel: true },
        [`${VOSNE}.les-suchots`]: { child: true, rel: true },
        "france.bourgogne.cote-de-nuits": { rel: true },
        "france.bourgogne.cote-de-nuits.gevrey-chambertin": { rel: true },
      },
    });
  });

  it("a leaf: no children, its siblings and parent related", () => {
    expect(select(`${VOSNE}.la-tache`)).toEqual({
      [BOURGOGNE]: {
        [`${VOSNE}.la-tache`]: { sel: true },
        [`${VOSNE}.les-suchots`]: { rel: true },
        [VOSNE]: { rel: true },
      },
    });
  });

  it("a key the tree does not know (a newer tile release): the selection alone", () => {
    expect(select("france.bourgogne.cote-de-nuits.nowhere")).toEqual({
      [BOURGOGNE]: { "france.bourgogne.cote-de-nuits.nowhere": { sel: true } },
    });
  });

  it("only ever sets sel, child and rel", () => {
    for (const key of [null, "france", "france.bourgogne", VOSNE, "italy.toscana.chianti"]) {
      const states = selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey: key, fallback: null });
      for (const features of states.values()) {
        for (const flags of features.values()) {
          for (const [name, value] of Object.entries(flags)) {
            expect(["sel", "child", "rel"]).toContain(name);
            expect(value).toBe(true);
          }
        }
      }
    }
  });
});

describe("selectionFeatureStates without the tree", () => {
  it("uses the place context's children and parent; siblings stay plain", () => {
    const states = selectionFeatureStates({
      roots: null,
      selectedKey: VOSNE,
      fallback: {
        childKeys: [`${VOSNE}.la-tache`, `${VOSNE}.les-suchots`],
        parentKey: "france.bourgogne.cote-de-nuits",
      },
    });
    expect(plain(states)).toEqual({
      [BOURGOGNE]: {
        [VOSNE]: { sel: true },
        [`${VOSNE}.la-tache`]: { child: true, rel: true },
        [`${VOSNE}.les-suchots`]: { child: true, rel: true },
        "france.bourgogne.cote-de-nuits": { rel: true },
      },
    });
  });

  it("places a region and its country by key depth", () => {
    const states = selectionFeatureStates({
      roots: null,
      selectedKey: "italy.toscana",
      fallback: { childKeys: ["italy.toscana.chianti"], parentKey: "italy" },
    });
    expect(plain(states)).toEqual({
      [WORLD]: { toscana: { sel: true }, italy: { rel: true } },
      "wine-shard-toscana": {
        "italy.toscana": { sel: true },
        "italy.toscana.chianti": { child: true, rel: true },
      },
    });
  });

  it("falls back when the loaded tree does not contain the key", () => {
    const states = selectionFeatureStates({
      roots: FIXTURE_TREE,
      selectedKey: "france.bourgogne.cote-de-nuits.new-village",
      fallback: { childKeys: [], parentKey: "france.bourgogne.cote-de-nuits" },
    });
    expect(plain(states)).toEqual({
      [BOURGOGNE]: {
        "france.bourgogne.cote-de-nuits.new-village": { sel: true },
        "france.bourgogne.cote-de-nuits": { rel: true },
      },
    });
  });

  it("with neither tree nor context: the selection alone", () => {
    const states = selectionFeatureStates({ roots: null, selectedKey: "france", fallback: null });
    expect(plain(states)).toEqual({ [WORLD]: { france: { sel: true } } });
  });
});
