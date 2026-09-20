// The three things the map asks for once on mount — the place tree, the grape
// list and the grape links — behind the same module-level cache as a place
// selection. They are the same answer for every viewer and change only by
// migration, so the refresh boundary is a page load.
//
// The module is a singleton, so every test starts with clearWinePlaceCaches().
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWinePlaceCaches,
  loadGrapeOptions,
  loadPlaceGrapeLinks,
  loadWinePlaceTree,
} from "./place-cache";
import { stubClient, type RecordedQuery } from "../testing/stub-postgrest";

const TREE = [
  { id: "id-fr", key: "france", name: "France", kind: "COUNTRY", tier: 0, parent_key: null, has_children: true },
  { id: "id-bg", key: "france.bourgogne", name: "Bourgogne", kind: "REGION", tier: 1, parent_key: "france", has_children: false },
];

function mapClient(options?: { treeError?: string }) {
  return stubClient({
    rpcs: {
      get_wine_place_tree: () =>
        options?.treeError
          ? { data: null, error: { message: options.treeError } }
          : { data: TREE, error: null },
    },
    tables: {
      grapes: () => ({ data: [{ id: "g1", name: "Chardonnay" }], error: null }),
      wine_place_grapes: (query: RecordedQuery) =>
        (query.range?.[0] ?? 0) === 0
          ? { data: [{ wine_place_id: "id-bg", grape_id: "g1" }], error: null }
          : { data: [], error: null },
    },
  });
}

describe("the map's mount data", () => {
  beforeEach(() => {
    clearWinePlaceCaches();
  });

  it("a second mount asks for the tree ZERO times and gets the same nodes back", async () => {
    const { client, calls } = mapClient();

    const first = await loadWinePlaceTree(client);
    const second = await loadWinePlaceTree(client);

    expect(calls.rpcs.map((r) => r.fn)).toEqual(["get_wine_place_tree"]);
    expect(second).toBe(first);
    expect(first.map((node) => node.key)).toEqual(["france"]);
    expect(first[0].children.map((node) => node.key)).toEqual([
      "france.bourgogne",
    ]);
  });

  it("two mounts racing share ONE tree request rather than issuing two", async () => {
    const { client, calls } = mapClient();

    const [a, b] = await Promise.all([
      loadWinePlaceTree(client),
      loadWinePlaceTree(client),
    ]);

    expect(calls.rpcs).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("a failed tree is never cached: the next mount tries again", async () => {
    const failing = mapClient({ treeError: "tree down" });
    await expect(loadWinePlaceTree(failing.client)).rejects.toThrow("tree down");
    await expect(loadWinePlaceTree(failing.client)).rejects.toThrow("tree down");
    expect(failing.calls.rpcs).toHaveLength(2);
  });

  it("the grape list and the grape links are cached the same way", async () => {
    const { client, calls } = mapClient();

    const options = await loadGrapeOptions(client);
    const links = await loadPlaceGrapeLinks(client);
    const optionsAgain = await loadGrapeOptions(client);
    const linksAgain = await loadPlaceGrapeLinks(client);

    expect(optionsAgain).toBe(options);
    expect(linksAgain).toBe(links);
    expect(links.get("id-bg")).toEqual(new Set(["g1"]));
    // One `grapes` request, and one round of `wine_place_grapes` pages.
    expect(calls.queries.filter((q) => q.table === "grapes")).toHaveLength(1);
    expect(
      calls.queries.filter((q) => q.table === "wine_place_grapes"),
    ).toHaveLength(4);
  });

  it("an account change empties the mount data too, not just the places", async () => {
    const { client, calls } = mapClient();
    await loadWinePlaceTree(client);
    await loadGrapeOptions(client);
    await loadPlaceGrapeLinks(client);

    clearWinePlaceCaches();

    await loadWinePlaceTree(client);
    await loadGrapeOptions(client);
    await loadPlaceGrapeLinks(client);

    expect(calls.rpcs).toHaveLength(2);
    expect(calls.queries.filter((q) => q.table === "grapes")).toHaveLength(2);
    expect(
      calls.queries.filter((q) => q.table === "wine_place_grapes"),
    ).toHaveLength(8);
  });
});
