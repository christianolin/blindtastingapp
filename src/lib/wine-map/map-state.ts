// The wine map's dynamic inputs as MapLibre global state (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.1). Every shard and world layer spec is static for the session; what used
// to be rewritten on every mounted layer — the grape gate, Local/English, the
// focus country's depth, the selected place — is one named value the static
// expressions read. For a filter or layout reference MapLibre only reloads the
// sources whose layers name the value that changed (Style
// _applyGlobalStateChanges); it never re-validates or re-sends a layer.
//
// Null safety differs between the two engines, and every piece here is written
// to read "off" for never-set, undefined and null alike:
//  - the standalone @maplibre/maplibre-gl-style-spec reads an unset name as
//    null;
//  - the copy bundled in maplibre-gl 5.24 (what the app runs) reads it as
//    `undefined` once any OTHER name is set, and `coalesce` passes undefined
//    straight through.
// Booleans are therefore compared `== true` (never `== null`), and the grape
// gate's first arm is a truthiness test. map-state.test.ts runs every truth
// table through both engines.
import { keyLookupMap } from "./key-gate";
import { englishTextFieldExpression } from "./localize-names";

/** Global-state names. Prefixed so they can never meet a basemap's own. */
export const GS = {
  /** The grape filter's visible-key lookup object, or null for no filter. */
  keys: "wm_keys",
  /** true = native local names; unset/false/null = English (the default). */
  local: "wm_local",
  /** true from the first selection of the session on (never cleared). */
  hasSel: "wm_has_sel",
  /** The selected canonical key, or null. */
  selKey: "wm_sel_key",
  /** A constant 1 the shard controller (Phase 1c) writes to mark the style
      dirty; no layer reads it, so the write reloads nothing. */
  tick: "wm_tick",
} as const;

/** One depth flag per country (canonical_key segment 0), so a focus flip
    reloads only the two countries' shards and All mode (every flag true)
    never reloads on a pan. */
export function deepStateName(country: string): string {
  return `wm_deep_${country}`;
}

/**
 * The grape gate: "render only the visible keys; keep the country outline
 * (tier 0) as context". key-gate.ts's O(1) object lookup, with the object read
 * from global state.
 *
 * The first arm is what keeps the map from blanking with no filter on. The
 * two-argument `get` asserts its object argument, and that assertion throws
 * for null or undefined — MapLibre then returns the filter default, false, for
 * every non-country feature (the old "only France" bug). `any` stops at the
 * first true arm, so `!to-boolean` passes every feature before the lookup
 * runs. A coalesce to `{}` would hide everything instead, and `has` would let
 * "constructor" through; the lookup keeps key-gate's `== true`.
 */
export function grapeGateExpression(): unknown[] {
  return [
    "any",
    ["!", ["to-boolean", ["global-state", GS.keys]]],
    ["==", ["get", "tier"], 0],
    ["==", ["get", ["string", ["get", "key"], ""], ["global-state", GS.keys]], true],
  ];
}

/** Subregion depth for one country's shards: full depth while its flag is
    true, region level (tier <= 1) otherwise — unset included. A shard whose
    country is unknown gets no depth term at all (full depth, as today). */
export function depthTerm(country: string): unknown[] {
  return [
    "any",
    ["==", ["global-state", deepStateName(country)], true],
    ["<=", ["get", "tier"], 1],
  ];
}

/** Every label layer's text-field: local names only when wm_local is
    explicitly true, so an unset or wiped state keeps the app's English
    default. */
export function labelTextField(): unknown[] {
  return [
    "case",
    ["==", ["global-state", GS.local], true],
    ["get", "name"],
    englishTextFieldExpression(),
  ];
}

export type DesiredGlobalState = Record<string, unknown>;

// One lookup object per visible-key array. The explorer memoizes visibleKeys,
// so a selection or a focus change hands MapStateSync the SAME object and it
// skips the value by identity instead of deep-comparing ~600 keys.
const lookups = new WeakMap<readonly string[], Record<string, true>>();
function lookupFor(keys: readonly string[]): Record<string, true> {
  let lookup = lookups.get(keys);
  if (!lookup) {
    lookup = keyLookupMap(keys);
    lookups.set(keys, lookup);
  }
  return lookup;
}

/**
 * Every global-state value the static layers read, with nothing left unset:
 * no-filter and no-selection are explicit nulls/falses, never an absent name,
 * so the two engines above can never disagree. A deep flag is written for
 * every known country (and any country asked to be deep), true only for
 * `deepCountries`.
 */
export function desiredGlobalState(input: {
  visibleKeys: readonly string[] | null;
  english: boolean;
  selectedKey: string | null;
  deepCountries: readonly string[];
  knownCountries: readonly string[];
}): DesiredGlobalState {
  const state: DesiredGlobalState = {
    [GS.keys]: input.visibleKeys ? lookupFor(input.visibleKeys) : null,
    [GS.local]: !input.english,
    [GS.hasSel]: input.selectedKey !== null,
    [GS.selKey]: input.selectedKey,
  };
  const deep = new Set(input.deepCountries);
  for (const country of new Set([...input.knownCountries, ...input.deepCountries])) {
    state[deepStateName(country)] = deep.has(country);
  }
  return state;
}
