// The global-state pieces decide what renders for every visitor, so each one is
// pinned by a truth table through BOTH expression engines: the standalone
// @maplibre/maplibre-gl-style-spec, and the copy bundled in maplibre-gl, which
// is what the app runs and which reads a never-set name as `undefined` once any
// other name is set (see testing/bundled-style-engine.ts). Each expression is
// compiled ONCE against a shared state object that is then mutated between
// evaluations — exactly how MapLibre runs it after setGlobalStateProperty.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createExpression,
  featureFilter,
  latest,
  validateStyleMin,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { bundledStyleEngine } from "../testing/bundled-style-engine";
import { keyLookupMap } from "./key-gate";
import { LOCAL_TO_ENGLISH } from "./localize-names";
import {
  deepStateName,
  depthTerm,
  desiredGlobalState,
  grapeGateExpression,
  GS,
  labelTextField,
} from "./map-state";

type Props = Record<string, unknown>;
type State = Record<string, unknown>;
type Engine = {
  name: string;
  filter(expression: unknown, state: State): (props: Props) => boolean;
  textField(state: State): (name: string) => string;
};

const standalone: Engine = {
  name: "standalone style-spec",
  filter: (expression, state) => {
    const compiled = featureFilter(expression as never, state);
    return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props } as never);
  },
  textField: (state) => {
    const spec = (latest as unknown as Record<string, Record<string, unknown>>).layout_symbol["text-field"];
    const parsed = createExpression(labelTextField(), spec as never, state);
    if (parsed.result !== "success") throw new Error(JSON.stringify(parsed.value));
    const expression = parsed.value;
    return (name) => String(expression.evaluate({ zoom: 8 }, { type: 1, properties: { name } } as never));
  },
};

const bundled: Engine = {
  name: "bundled maplibre-gl",
  filter: (expression, state) => {
    const compiled = bundledStyleEngine().featureFilter(expression, state);
    return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props });
  },
  textField: (state) => {
    const engine = bundledStyleEngine();
    const parsed = engine.createExpression(labelTextField(), engine.v8Spec.layout_symbol["text-field"], state);
    if (parsed.result !== "success") throw new Error(JSON.stringify(parsed.value));
    const expression = parsed.value;
    return (name) => String(expression.evaluate({ zoom: 8 }, { type: 1, properties: { name } }));
  },
};

const ENGINES = [standalone, bundled];

/** Replace the contents of a shared state object in place. */
function setState(state: State, next: State) {
  for (const name of Object.keys(state)) delete state[name];
  Object.assign(state, next);
}

const VISIBLE = [
  "france.bourgogne.cote-de-nuits.vosne-romanee",
  "france.bourgogne.cote-de-nuits.gevrey-chambertin",
];
const FEATURES: Record<string, Props> = {
  "key in the set": { key: VISIBLE[0], tier: 3 },
  "key not in the set": { key: "france.bordeaux.medoc.pauillac", tier: 3 },
  "country, not in the set": { key: "spain", tier: 0 },
  "region, not in the set": { key: "france.bourgogne", tier: 1 },
  "no key": { tier: 2 },
  "null key": { key: null, tier: 2 },
  "numeric key": { key: 42, tier: 2 },
  "key 'constructor'": { key: "constructor", tier: 2 },
  "key '__proto__'": { key: "__proto__", tier: 2 },
  "key 'toString'": { key: "toString", tier: 2 },
};
const PASSES_WHEN_ON = new Set(["key in the set", "country, not in the set"]);

// "partial" is the state the bundled engine reads as undefined: other names
// are set, this one never was.
const GATE_OFF: Record<string, State> = {
  "never set": {},
  partial: { [GS.local]: true, [GS.selKey]: "france.bourgogne" },
  null: { [GS.keys]: null, [GS.local]: false },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("grapeGateExpression", () => {
  for (const engine of ENGINES) {
    it(`${engine.name}: off shows every place, on shows the set plus countries`, () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const state: State = {};
      const gate = engine.filter(grapeGateExpression(), state);
      const on = { [GS.keys]: keyLookupMap(VISIBLE), [GS.local]: true };
      // Off, on, off again: the same compiled filter must follow every flip.
      for (const [label, next] of [
        ...Object.entries(GATE_OFF),
        ["set", on] as const,
        ...Object.entries(GATE_OFF).map(([name, s]) => [`${name} again`, s] as const),
      ]) {
        setState(state, next);
        const filterOn = label === "set";
        for (const [name, props] of Object.entries(FEATURES)) {
          const expected = filterOn ? PASSES_WHEN_ON.has(name) : true;
          expect(gate(props), `${label}: ${name}`).toBe(expected);
        }
      }
      // Not one feature took MapLibre's throw-and-default path to its answer.
      expect(warn).not.toHaveBeenCalled();
    });
  }

  it("an empty key set hides everything but the countries", () => {
    for (const engine of ENGINES) {
      const gate = engine.filter(grapeGateExpression(), { [GS.keys]: keyLookupMap([]) });
      expect(gate(FEATURES["key in the set"]), engine.name).toBe(false);
      expect(gate(FEATURES["country, not in the set"]), engine.name).toBe(true);
    }
  });

  it("a prototype-named key that IS in the set still passes", () => {
    for (const engine of ENGINES) {
      const gate = engine.filter(grapeGateExpression(), {
        [GS.keys]: keyLookupMap([...VISIBLE, "constructor"]),
      });
      expect(gate({ key: "constructor", tier: 2 }), engine.name).toBe(true);
    }
  });
});

describe("depthTerm", () => {
  const TIERS = [0, 1, 2, 3, 4];
  const DEEP = deepStateName("france");
  const OFF: Record<string, State> = {
    "never set": {},
    partial: { [deepStateName("italy")]: true },
    null: { [DEEP]: null },
    false: { [DEEP]: false },
  };

  it("names one global-state value per country", () => {
    expect(deepStateName("france")).toBe("wm_deep_france");
    expect(JSON.stringify(depthTerm("italy"))).toContain('"wm_deep_italy"');
  });

  for (const engine of ENGINES) {
    it(`${engine.name}: region level unless the country's flag is exactly true`, () => {
      const state: State = {};
      const term = engine.filter(depthTerm("france"), state);
      for (const [label, next] of [...Object.entries(OFF), ["true", { [DEEP]: true }] as const]) {
        setState(state, next);
        for (const tier of TIERS) {
          const expected = label === "true" || tier <= 1;
          expect(term({ key: `france.x${tier}`, tier }), `${label}, tier ${tier}`).toBe(expected);
        }
      }
    });
  }
});

describe("labelTextField", () => {
  const NAMES = [...Object.keys(LOCAL_TO_ENGLISH), "Chablis", "Bordeaux"];
  const ENGLISH: Record<string, State> = {
    "never set": {},
    partial: { [GS.keys]: null },
    null: { [GS.local]: null },
    false: { [GS.local]: false },
  };

  for (const engine of ENGINES) {
    it(`${engine.name}: English unless local is exactly true`, () => {
      const state: State = {};
      const text = engine.textField(state);
      for (const [label, next] of [...Object.entries(ENGLISH), ["true", { [GS.local]: true }] as const]) {
        setState(state, next);
        for (const name of NAMES) {
          const expected = label === "true" ? name : (LOCAL_TO_ENGLISH[name] ?? name);
          expect(text(name), `${label}: ${name}`).toBe(expected);
        }
      }
    });
  }
});

describe("desiredGlobalState", () => {
  const base = {
    visibleKeys: null,
    english: true,
    selectedKey: null,
    deepCountries: [],
    knownCountries: [],
  };

  it("writes every name with an explicit value, never leaving one unset", () => {
    expect(desiredGlobalState(base)).toEqual({
      wm_keys: null,
      wm_local: false,
      wm_has_sel: false,
      wm_sel_key: null,
    });
  });

  it("turns the visible keys into one lookup object per key array", () => {
    const keys = [...VISIBLE];
    const first = desiredGlobalState({ ...base, visibleKeys: keys });
    const again = desiredGlobalState({ ...base, visibleKeys: keys, selectedKey: VISIBLE[0] });
    expect(first[GS.keys]).toEqual(keyLookupMap(keys));
    // Same array, same object: MapStateSync skips it by identity.
    expect(again[GS.keys]).toBe(first[GS.keys]);
    const other = desiredGlobalState({ ...base, visibleKeys: [...VISIBLE] });
    expect(other[GS.keys]).not.toBe(first[GS.keys]);
    expect(other[GS.keys]).toEqual(first[GS.keys]);
  });

  it("carries the language and the selection", () => {
    const state = desiredGlobalState({ ...base, english: false, selectedKey: "france.bourgogne" });
    expect(state[GS.local]).toBe(true);
    expect(state[GS.hasSel]).toBe(true);
    expect(state[GS.selKey]).toBe("france.bourgogne");
  });

  it("writes a deep flag for every known country, true only for the deep ones", () => {
    const state = desiredGlobalState({
      ...base,
      knownCountries: ["france", "italy", "spain"],
      deepCountries: ["italy", "portugal"],
    });
    expect(state).toMatchObject({
      wm_deep_france: false,
      wm_deep_italy: true,
      wm_deep_spain: false,
      // Asked to be deep though no shard names it yet: harmless, and it keeps
      // All mode's "every country true" literal.
      wm_deep_portugal: true,
    });
    expect(Object.values(state).every((value) => value !== undefined)).toBe(true);
  });
});

describe("the pieces are valid MapLibre style", () => {
  it("passes validateStyleMin with no state block declared", () => {
    const style = {
      version: 8,
      glyphs: "https://example.test/{fontstack}/{range}.pbf",
      sources: {
        "wine-world": { type: "vector", url: "pmtiles://tiles.test/world.pmtiles" },
        "wine-shard-bourgogne": { type: "vector", url: "pmtiles://tiles.test/bourgogne.pmtiles", promoteId: "key" },
      },
      layers: [
        {
          id: "world-labels",
          type: "symbol",
          source: "wine-world",
          "source-layer": "labels",
          filter: grapeGateExpression(),
          layout: { "text-field": labelTextField() },
        },
        {
          id: "shard-fills-bourgogne",
          type: "fill",
          source: "wine-shard-bourgogne",
          "source-layer": "places",
          filter: ["all", grapeGateExpression(), depthTerm("france")],
        },
      ],
    } as unknown as StyleSpecification;
    expect(validateStyleMin(style)).toEqual([]);
  });
});
