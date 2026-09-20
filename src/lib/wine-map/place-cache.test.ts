// The wiring, end to end: the real fetchers behind the real module-level
// caches, driven by a recording stub client. What this pins is the thing the
// owner actually feels — a revisited place costs ZERO requests — and the
// request count of a first visit.
//
// The module is a singleton, so every test starts with clearWinePlaceCaches().
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearWinePlaceCaches,
  loadArchetypesForPlace,
  loadPlaceStyles,
  loadWinePlaceContext,
  peekArchetypesForPlace,
  peekPlaceStyles,
  peekWinePlaceContext,
  prefetchWinePlace,
  warmWinePlace,
  winePlacePrefetchesInFlight,
} from "./place-cache";
import { stubClient, type StubResult } from "../testing/stub-postgrest";

function context(key: string) {
  return {
    place: { id: `id-${key}`, key, name: key, kind: "REGION", tier: 2, min_zoom: 5, label_min_zoom: 6 },
    ancestors: [],
    children: [],
    article: null,
    boundary: null,
    grapes: [],
    styles: [],
    designations: [],
    nearby: [],
    dual_labels: [],
    classified_members: [],
  };
}

function mapClient(options?: { contextFor?: (key: string) => StubResult }) {
  return stubClient({
    rpcs: {
      get_wine_place_context: (args) => {
        const key = (args as { p_place_key: string }).p_place_key;
        return (
          options?.contextFor?.(key) ?? { data: context(key), error: null }
        );
      },
    },
    tables: {
      wine_archetype_placements: () => ({ data: [], error: null }),
      wine_place_styles: () => ({
        data: [{ style: "WHITE", colour: null, note: null, sort_order: 0 }],
        error: null,
      }),
    },
  });
}

/** Everything one place selection asks for. */
async function selectPlace(
  client: Parameters<typeof loadWinePlaceContext>[0],
  key: string,
) {
  return Promise.all([
    loadWinePlaceContext(client, key),
    loadArchetypesForPlace(client, key),
    loadPlaceStyles(client, key),
  ]);
}

describe("the wine-map place cache", () => {
  beforeEach(() => {
    clearWinePlaceCaches();
  });

  it("a first visit costs exactly three requests", async () => {
    const { client, calls } = mapClient();
    await selectPlace(client, "france.savoie");
    expect(calls.rpcs.map((r) => r.fn)).toEqual(["get_wine_place_context"]);
    expect(calls.queries.map((q) => q.table).sort()).toEqual([
      "wine_archetype_placements",
      "wine_place_styles",
    ]);
  });

  it("a REVISIT costs ZERO requests and returns the same references", async () => {
    const { client, calls } = mapClient();
    const first = await selectPlace(client, "france.savoie");
    await selectPlace(client, "france.bourgogne");
    const again = await selectPlace(client, "france.savoie");

    expect(calls.rpcs).toHaveLength(2); // savoie, bourgogne — not savoie twice
    expect(calls.queries).toHaveLength(4);
    expect(again[0]).toBe(first[0]);
    expect(again[1]).toBe(first[1]);
    expect(again[2]).toBe(first[2]);
  });

  it("peek answers a visited place synchronously, and undefined for a new one", async () => {
    const { client } = mapClient();
    expect(peekWinePlaceContext("france.savoie")).toBeUndefined();
    expect(peekArchetypesForPlace("france.savoie")).toBeUndefined();
    expect(peekPlaceStyles("france.savoie")).toBeUndefined();

    await selectPlace(client, "france.savoie");

    expect(peekWinePlaceContext("france.savoie")).not.toBeUndefined();
    expect(peekArchetypesForPlace("france.savoie")).toEqual([]);
    expect(peekPlaceStyles("france.savoie")).toEqual([
      { style: "WHITE", colour: null, note: null },
    ]);
  });

  it("an empty archetype list is a cache HIT, not a miss", async () => {
    const { client, calls } = mapClient();
    await loadArchetypesForPlace(client, "france.savoie");
    await loadArchetypesForPlace(client, "france.savoie");
    expect(calls.queries).toHaveLength(1);
  });

  it("a null context — 'not on the map yet' — is never cached", async () => {
    const { client, calls } = mapClient({
      contextFor: () => ({ data: null, error: null }),
    });
    expect(await loadWinePlaceContext(client, "nowhere")).toBeNull();
    expect(await loadWinePlaceContext(client, "nowhere")).toBeNull();
    expect(calls.rpcs).toHaveLength(2);
    expect(peekWinePlaceContext("nowhere")).toBeUndefined();
  });

  it("a failed context is never cached: the next selection retries", async () => {
    let calls = 0;
    const { client } = stubClient({
      rpcs: {
        get_wine_place_context: (args) => {
          calls += 1;
          return calls === 1
            ? { data: null, error: { message: "network" } }
            : { data: context((args as { p_place_key: string }).p_place_key), error: null };
        },
      },
    });
    await expect(loadWinePlaceContext(client, "k")).rejects.toThrow("network");
    expect(peekWinePlaceContext("k")).toBeUndefined();
    await expect(loadWinePlaceContext(client, "k")).resolves.not.toBeNull();
    expect(calls).toBe(2);
  });

  it("a click during a prefetch shares the in-flight request instead of doubling it", async () => {
    const { client, calls } = mapClient();
    const warming = prefetchWinePlace(client, "france.bourgogne");
    expect(winePlacePrefetchesInFlight()).toBe(1);
    const clicked = selectPlace(client, "france.bourgogne");
    await Promise.all([warming, clicked]);
    expect(winePlacePrefetchesInFlight()).toBe(0);
    expect(calls.rpcs).toHaveLength(1);
    expect(calls.queries).toHaveLength(2);
  });

  it("clearWinePlaceCaches() (an account change) makes the next selection fetch again", async () => {
    const { client, calls } = mapClient();
    await selectPlace(client, "france.savoie");
    clearWinePlaceCaches();
    expect(peekWinePlaceContext("france.savoie")).toBeUndefined();
    await selectPlace(client, "france.savoie");
    expect(calls.rpcs).toHaveLength(2);
    expect(calls.queries).toHaveLength(4);
  });

  it("caps at 50 places: the 51st evicts the oldest", async () => {
    const { client, calls } = mapClient();
    for (let i = 0; i < 51; i += 1) {
      await loadWinePlaceContext(client, `place-${i}`);
    }
    expect(calls.rpcs).toHaveLength(51);
    expect(peekWinePlaceContext("place-0")).toBeUndefined();
    expect(peekWinePlaceContext("place-50")).not.toBeUndefined();
    await loadWinePlaceContext(client, "place-0");
    expect(calls.rpcs).toHaveLength(52);
  });

  it("the 50 most recently USED survive, not the 50 most recently added", async () => {
    const { client } = mapClient();
    await loadWinePlaceContext(client, "keep-me");
    for (let i = 0; i < 48; i += 1) {
      await loadWinePlaceContext(client, `filler-${i}`);
    }
    // Re-reading promotes it, so the next two additions evict fillers instead.
    await loadWinePlaceContext(client, "keep-me");
    await loadWinePlaceContext(client, "extra-1");
    await loadWinePlaceContext(client, "extra-2");
    expect(peekWinePlaceContext("keep-me")).not.toBeUndefined();
    expect(peekWinePlaceContext("filler-0")).toBeUndefined();
  });
});

describe("warmWinePlace — starting the selection from the click", () => {
  beforeEach(() => {
    clearWinePlaceCaches();
  });

  it("starts all three requests without waiting for an effect", async () => {
    const { client, calls } = mapClient();

    warmWinePlace(client, "france.savoie");

    expect(calls.rpcs.map((r) => r.fn)).toEqual(["get_wine_place_context"]);
    expect(calls.queries.map((q) => q.table).sort()).toEqual([
      "wine_archetype_placements",
      "wine_place_styles",
    ]);
  });

  it("the effects that follow JOIN those requests instead of doubling them", async () => {
    const { client, calls } = mapClient();

    warmWinePlace(client, "france.savoie");
    await selectPlace(client, "france.savoie");

    // Three requests in total, not six.
    expect(calls.rpcs).toHaveLength(1);
    expect(calls.queries).toHaveLength(2);
  });

  it("does not consume a prefetch slot — a real selection is never rationed", () => {
    const { client } = mapClient();
    warmWinePlace(client, "france.savoie");
    expect(winePlacePrefetchesInFlight()).toBe(0);
  });

  it("swallows a failure rather than raising an unhandled rejection", async () => {
    const { client } = mapClient({
      contextFor: () => ({ data: null, error: { message: "boom" } }),
    });

    expect(() => warmWinePlace(client, "france.savoie")).not.toThrow();
    // The effect still sees the failure and can show its error state.
    await expect(
      loadWinePlaceContext(client, "france.savoie"),
    ).rejects.toThrow("boom");
  });

  it("a warmed place is a cache hit, so the click after it renders in one pass", async () => {
    const { client, calls } = mapClient();

    await Promise.all([
      loadWinePlaceContext(client, "france.savoie"),
      loadArchetypesForPlace(client, "france.savoie"),
      loadPlaceStyles(client, "france.savoie"),
    ]);
    const before = calls.rpcs.length + calls.queries.length;

    warmWinePlace(client, "france.savoie");

    expect(peekWinePlaceContext("france.savoie")).not.toBeUndefined();
    expect(calls.rpcs.length + calls.queries.length).toBe(before);
  });
});
