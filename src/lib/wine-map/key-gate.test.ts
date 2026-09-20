// The grape gate's shape is a performance decision with a correctness floor:
// it must agree with the array-membership gate it replaces on EVERY feature,
// including the ones that used to be shrugged off (no key, a null key, a key
// that happens to name an Object.prototype member). These cases compile both
// gates with MapLibre's own expression engine — the same `featureFilter` the
// tile worker runs — and compare them feature by feature, so equivalence is
// measured rather than argued.
//
// Why the shape is what it is (see the spec, 2026-09-20-wine-map-performance §3.3):
//   - two-argument `get` over an object literal is O(1); `in` over an array is
//     a linear scan, whose cost grows with the key set while the object's does
//     not — through this same engine, 360,000 evaluations of features outside
//     the set measured 121/258/667/1,653 ms for 50/200/598/2000 keys against a
//     flat 37-45 ms (see key-gate.ts for the table and the hit-rate caveat);
//   - the inner key goes through `["string", ..., ""]` because the two-argument
//     `get` types its first argument as a string and MapLibre wraps a
//     value-typed argument in an assertion that THROWS on a null or numeric
//     key (caught, warned once, defaulted — but not free and not quiet);
//   - the result is compared with `["==", ..., true]`, never `to-boolean`,
//     because a plain object inherits Object.prototype: `keyMap.constructor`
//     is truthy, so `to-boolean` would let a feature keyed "constructor",
//     "toString" or "__proto__" through the gate. The last three cases below
//     fail against a `to-boolean` gate; that is the point of them.
import { describe, expect, it, vi } from "vitest";
import { featureFilter, validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { keyGateExpression, keyLookupMap } from "./key-gate";

// A realistic key set: the tree walk's output for one grape, scattered through
// a larger catalogue rather than a contiguous block.
const ALL_KEYS = Array.from(
  { length: 120 },
  (_, i) => `france.bourgogne.cote-de-nuits.place-${i}`,
);
const KEYS = ALL_KEYS.filter((_, i) => i % 3 === 1);

/** The gate this replaces, kept here as the oracle. */
function arrayGate(keys: readonly string[]) {
  return ["any", ["==", ["get", "tier"], 0], ["in", ["get", "key"], ["literal", [...keys]]]];
}

type Props = Record<string, unknown>;
const evaluate = (gate: unknown, props: Props) =>
  featureFilter(gate as never).filter({ zoom: 12 }, {
    type: 1,
    properties: props,
  } as never);

describe("keyGateExpression", () => {
  it("1. is null with no key set, so the caller keeps its always-true filter", () => {
    // Never `undefined`: react-map-gl feeds the filter prop straight into
    // addLayer and MapLibre rejects undefined, which silently unmounts the
    // layer (the "only France until I toggle the grape filter" bug).
    expect(keyGateExpression(null)).toBeNull();
  });

  it("2. agrees with the array gate on every feature, including the awkward ones", () => {
    const next = keyGateExpression(KEYS)!;
    const old = arrayGate(KEYS);
    const cases: { name: string; props: Props; expected: boolean }[] = [
      { name: "key in the set, tier 3", props: { key: KEYS[0], tier: 3 }, expected: true },
      {
        name: "last key in the set, tier 2",
        props: { key: KEYS[KEYS.length - 1], tier: 2 },
        expected: true,
      },
      {
        name: "key not in the set",
        props: { key: "france.bordeaux.medoc.pauillac", tier: 3 },
        expected: false,
      },
      { name: "tier 0, key not in the set", props: { key: "spain", tier: 0 }, expected: true },
      { name: "tier 0, key in the set", props: { key: KEYS[3], tier: 0 }, expected: true },
      { name: "no key property", props: { tier: 2 }, expected: false },
      { name: "null key", props: { key: null, tier: 2 }, expected: false },
      { name: "numeric key", props: { key: 42, tier: 2 }, expected: false },
      { name: "empty key", props: { key: "", tier: 2 }, expected: false },
      { name: "key 'constructor'", props: { key: "constructor", tier: 2 }, expected: false },
      { name: "key 'toString'", props: { key: "toString", tier: 2 }, expected: false },
      { name: "key '__proto__'", props: { key: "__proto__", tier: 2 }, expected: false },
      { name: "key 'hasOwnProperty'", props: { key: "hasOwnProperty", tier: 2 }, expected: false },
      { name: "no tier property, key in the set", props: { key: KEYS[1] }, expected: true },
    ];
    for (const c of cases) {
      expect(evaluate(next, c.props), `${c.name} (new)`).toBe(c.expected);
      expect(evaluate(old, c.props), `${c.name} (old oracle)`).toBe(c.expected);
    }
  });

  it("2b. evaluates an odd key without MapLibre warning about it", () => {
    // Pins the ["string", ..., ""] wrapper. Without it the inner key goes
    // through MapLibre's implicit string ASSERTION, which throws per feature
    // on a missing, null or numeric `key`; StyleExpression.evaluate catches
    // that, warns once and returns the filter default — so the answer is
    // still false and case 2 above would still pass. The warning is the tell.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const gate = keyGateExpression(KEYS)!;
      for (const props of [{ tier: 2 }, { key: null, tier: 2 }, { key: 42, tier: 2 }]) {
        expect(evaluate(gate, props)).toBe(false);
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("3. lets every key of the set through and nothing else", () => {
    const gate = keyGateExpression(KEYS)!;
    for (const key of ALL_KEYS) {
      expect(evaluate(gate, { key, tier: 2 }), key).toBe(KEYS.includes(key));
    }
  });

  it("4. an empty set hides everything but the country outline", () => {
    const gate = keyGateExpression([])!;
    expect(evaluate(gate, { key: KEYS[0], tier: 2 })).toBe(false);
    expect(evaluate(gate, { key: "france", tier: 0 })).toBe(true);
    expect(evaluate(arrayGate([]), { key: KEYS[0], tier: 2 })).toBe(false);
  });

  it("5. a prototype-named key IN the set still renders, as it did before", () => {
    // Object.fromEntries defines an own property, which shadows the inherited
    // accessor — so these behave like any other key. (No real canonical key
    // looks like this; the case is here so a future switch to `map[key] = ...`
    // assignment, where `__proto__` is silently dropped, fails loudly.)
    for (const odd of ["constructor", "__proto__", "toString"]) {
      const gate = keyGateExpression([...KEYS, odd])!;
      expect(evaluate(gate, { key: odd, tier: 2 }), odd).toBe(true);
      expect(evaluate(arrayGate([...KEYS, odd]), { key: odd, tier: 2 }), odd).toBe(true);
    }
  });

  it("6. the country tier short-circuits: the lookup is never reached for tier 0", () => {
    const gate = keyGateExpression(KEYS)! as unknown[];
    expect(gate[0]).toBe("any");
    expect(gate[1]).toEqual(["==", ["get", "tier"], 0]);
  });

  it("7. pins the expression's shape: one object literal, every value `true`", () => {
    // Shape only, and deliberately not a claim about the live style. MapLibre
    // deep-clones a filter for every layer it sets (Style.setFilter calls
    // `layer.setFilter(clone(filter))`), so the key map lands in the style
    // once per layer either way — exactly as the array it replaces did, and a
    // count of key entries in `map.getStyle()` is unchanged by this work. The
    // win is per-feature evaluation, which cases 2 and 3 are what pin.
    const gate = keyGateExpression(KEYS)! as unknown[];
    const literal = JSON.stringify(gate).match(/"literal"/g) ?? [];
    expect(literal).toHaveLength(1);
    const map = keyLookupMap(KEYS);
    expect(Object.keys(map)).toEqual([...KEYS]);
    expect(Object.values(map).every((v) => v === true)).toBe(true);
    // The literal is an object, not an array — the whole point of the shape.
    const lookup = (gate[2] as unknown[])[1] as unknown[];
    expect(lookup[0]).toBe("get");
    const literalNode = lookup[2] as ["literal", unknown];
    expect(Array.isArray(literalNode[1])).toBe(false);
    expect(literalNode[1]).toEqual(map);
  });

  it("8. composes into all five of the map's filters and still behaves", () => {
    // Mirrors tile-wine-map.tsx's compositions exactly (gatedWorldFilter,
    // worldCountryFilter, worldRegionFilter, shardFilterFor, selectedGate).
    // The gate sits in a different position in each, so this is where a shape
    // that only works bare — or that MapLibre will not accept inside `all` —
    // would show up.
    const gate = keyGateExpression(KEYS)!;
    const PASS = ["boolean", true];
    const selected = ["==", ["get", "key"], KEYS[2]];
    const composed = {
      gatedWorld: gate,
      worldCountry: ["all", ["==", ["get", "tier"], 0], gate],
      worldRegion: ["all", [">=", ["get", "tier"], 1], gate],
      shardOutsideFocus: ["all", gate, ["<=", ["get", "tier"], 1]],
      shardInFocus: gate,
      selectedGate: ["all", selected, gate],
    };
    const style = {
      version: 8,
      sources: { "wine-world": { type: "vector", url: "pmtiles://tiles.test/world.pmtiles" } },
      layers: Object.entries(composed).map(([id, filter]) => ({
        id,
        type: "line",
        source: "wine-world",
        "source-layer": "places",
        filter,
      })),
    } as unknown as StyleSpecification;
    expect(validateStyleMin(style)).toEqual([]);

    const inSet = { key: KEYS[2], tier: 3 };
    const outOfSet = { key: "france.bordeaux", tier: 3 };
    const country = { key: "france", tier: 0 };
    const regionInSet = { key: KEYS[4], tier: 1 };
    expect(evaluate(composed.gatedWorld, inSet)).toBe(true);
    expect(evaluate(composed.gatedWorld, outOfSet)).toBe(false);
    // The country wash: tier 0 only, and the gate never hides it.
    expect(evaluate(composed.worldCountry, country)).toBe(true);
    expect(evaluate(composed.worldCountry, inSet)).toBe(false);
    // Regions: tier >= 1 and in the set.
    expect(evaluate(composed.worldRegion, regionInSet)).toBe(true);
    expect(evaluate(composed.worldRegion, country)).toBe(false);
    expect(evaluate(composed.worldRegion, outOfSet)).toBe(false);
    // A shard outside the focus country stops at region level.
    expect(evaluate(composed.shardOutsideFocus, regionInSet)).toBe(true);
    expect(evaluate(composed.shardOutsideFocus, inSet)).toBe(false);
    expect(evaluate(composed.shardInFocus, inSet)).toBe(true);
    // The selection ring draws on the selected key only, and the gate can hide it.
    expect(evaluate(composed.selectedGate, inSet)).toBe(true);
    expect(evaluate(composed.selectedGate, { key: KEYS[3], tier: 3 })).toBe(false);
    expect(evaluate(["all", ["==", ["get", "key"], outOfSet.key], gate], outOfSet)).toBe(false);
    // PASS_FILTER is what the caller uses in the gate's place when no filter
    // is on; it must let everything through, which is why null is not enough.
    expect(evaluate(PASS, outOfSet)).toBe(true);
  });

  it("9. is a valid filter on a real layer", () => {
    const style = {
      version: 8,
      sources: { "wine-world": { type: "vector", url: "pmtiles://tiles.test/world.pmtiles" } },
      layers: [
        {
          id: "world-region-fills",
          type: "fill",
          source: "wine-world",
          "source-layer": "places",
          filter: keyGateExpression(KEYS),
        },
      ],
    } as unknown as StyleSpecification;
    expect(validateStyleMin(style)).toEqual([]);
  });

  it("10. holds at the real scale the measurement came from: 598 keys on 15 layers", () => {
    // Selecting Chardonnay is the measured worst case: 598 canonical keys, put
    // on all 15 wine layers at once — 8,985 key entries in the live style, and
    // the 61 ms long task this shape is here to remove. Equivalence has to hold
    // at that size, not just at the 40-key size the cases above use, and the
    // style MapLibre ends up with has to stay valid at it.
    const many = Array.from({ length: 598 }, (_, i) => `france.r${i % 23}.d${i % 7}.place-${i}`);
    const outside = Array.from({ length: 120 }, (_, i) => `italy.r${i % 9}.place-${i}`);
    expect(new Set(many).size).toBe(598);

    const gate = keyGateExpression(many)!;
    const old = arrayGate(many);
    for (const key of [...many, ...outside]) {
      const expected = many.includes(key);
      expect(evaluate(gate, { key, tier: 3 }), key).toBe(expected);
      expect(evaluate(old, { key, tier: 3 }), `${key} (oracle)`).toBe(expected);
    }
    // The country wash still shows through a filter that hides everything else.
    expect(evaluate(gate, { key: "spain", tier: 0 })).toBe(true);

    const style = {
      version: 8,
      sources: {
        "wine-world": { type: "vector", url: "pmtiles://tiles.test/world.pmtiles" },
        "wine-shard-bourgogne": { type: "vector", url: "pmtiles://tiles.test/bourgogne.pmtiles" },
      },
      layers: Array.from({ length: 15 }, (_, i) => ({
        id: `wine-layer-${i}`,
        type: i % 3 === 0 ? "fill" : i % 3 === 1 ? "line" : "symbol",
        source: i < 8 ? "wine-world" : "wine-shard-bourgogne",
        "source-layer": i % 3 === 2 ? "labels" : "places",
        ...(i % 3 === 2 ? { layout: { "text-field": ["get", "name"] } } : {}),
        filter: gate,
      })),
    } as unknown as StyleSpecification;
    expect(validateStyleMin(style)).toEqual([]);
    // One built expression, shared by every layer — built once per key set in
    // the caller's useMemo, not once per layer per render.
    for (const layer of style.layers) {
      expect((layer as { filter: unknown }).filter).toBe(gate);
    }
  });

  it("11. is one object per call and survives a duplicated key list", () => {
    // The tree walk can name a place twice (a plot reachable through two
    // parents). An array gate shrugged that off; so must this one, and the
    // lookup must still hold one entry per distinct key.
    const dupes = [...KEYS, ...KEYS, KEYS[0]];
    const gate = keyGateExpression(dupes)!;
    expect(Object.keys(keyLookupMap(dupes))).toEqual([...new Set(dupes)]);
    for (const key of ALL_KEYS) {
      expect(evaluate(gate, { key, tier: 2 }), key).toBe(KEYS.includes(key));
    }
    // A fresh map each call: two gates never share a mutable object.
    const a = keyLookupMap(KEYS);
    const b = keyLookupMap(KEYS);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
