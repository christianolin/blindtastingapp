# Wine map performance, round 2: design

Date 2026-09-20. Base `master` at `a6cfb22` (worktree `blindtastingapp-mapperf`, branch `mapperf`). Owner, verbatim: "keep improving the performance of the map. It still has some lag issues certain places."

This round is **client-side only**: no migration, no RPC, no tile rebuild, no manifest change, no Anthropic API call. It follows the 2026-09-19 dark-mode work (`docs/superpowers/specs/2026-09-19-map-dark-mode.md`) and Plan A's zoom-lag fix, and keeps every rule those left behind: fixed palette tables, `next/dynamic` with `ssr: false`, the `setStyle`/`transformStyle` contract, and **never a changing `mapStyle` prop**.

## 1. The measured baseline

Main session, production `blindrapp.vercel.app`, Pixel-8 viewport 375x812, warm cache, fast desktop CPU. Treat every millisecond as 4–6x on a real phone.

| What | Number |
|---|---|
| Idle and pan/zoom frames (Bourgogne z13/z16, Bordeaux, Champagne, Languedoc, Toscana) | 17 ms everywhere, 0 long tasks |
| `jumpTo` -> idle | ~350 ms |
| Grape filter (Chardonnay): style content | `["in", ["get","key"], ["literal", [598 keys]]]` on 15 layers = 8,985 key entries |
| Grape filter: cost to apply | one **61 ms long task** |
| Style layers | 97 total: 82 Carto (62 line, 20 symbol) vs 15 wine |
| Rendered features, France z5 | basemap 32 / wine 36 |
| Rendered features, Bourgogne z9 | basemap 254 / wine 27 |
| Rendered features, Côte de Nuits z12 | basemap 186 / wine 21, of which **129 are road features** |
| Rendered features, Vosne z15 | basemap 21 / wine 10 |
| Theme swap light -> dark | 540 ms to idle; network negligible (style.json 31 ms, sprites 4 ms, no new tiles) but **four long tasks 52 + 101 + 110 + 87 = 350 ms** |
| `/knowledge/map` POSTs in one session | 32, median 788 ms, max 1234 ms — the active-tasting banner's 20 s poll for a viewer with **no** active tasting |

The camera machinery is already smooth. Shard mounting and hysteresis are fine and are **not** touched here.

## 2. The four changes

- **C1 Object-lookup grape gate.** Replace the linear `in`-over-an-array membership test with an O(1) object lookup, built once per key set.
- **C2 Leaner basemap.** Cut the Carto layer count from 82 to 68 and zoom-gate the surviving road layers to z10+, in the one data-shaped `basemapTweaks` rule that both `onLoad` and a theme swap apply. The zoom gate, not the count, is the win: no road renders below z10 at all.
- **C3 Cheaper theme swap.** Cache the tuned basemap style per theme in module memory, hand `setStyle` a pre-tuned `StyleSpecification` object instead of a URL, and skip MapLibre's style validation on the swap.
- **C4 Quieter page polling.** Keep the 20 s cadence while the viewer has an active tasting; back off to 120 s when the last read said there is nothing active. The cadence rule is pure and tested, not inline in the component.

Each is independently reversible (§8).

---

## 3. C1 — the grape gate

### 3.1 The site

`src/app/knowledge/map/tile-wine-map.tsx`, `keyGate` (~l.1233):

```ts
const keyGate = useMemo(
  () =>
    visibleKeys == null
      ? null
      : ([
          "any",
          ["==", ["get", "tier"], 0],
          ["in", ["get", "key"], ["literal", visibleKeys]],
        ] as unknown as boolean),
  [visibleKeys],
);
```

`keyGate` is composed into five filters, all in the same file and all unchanged by this work:

| Filter | Layers it feeds |
|---|---|
| `gatedWorldFilter` | `world-labels` |
| `worldCountryFilter` | `world-fills`, `world-outlines` |
| `worldRegionFilter` | `world-region-fills`, `world-region-outlines` |
| `shardFilterFor(key)` | `shard-fills-<key>`, `shard-outlines-<key>`, `shard-labels-<key>` |
| `selectedGate` | `world-selected-casing`, `world-selected-ring`, `shard-selected-casing-<key>`, `shard-selected-ring-<key>` |

`visibleKeys` comes from `grapeVisibleKeys` (`src/lib/wine-map/grape-filter.ts`) — a tree walk, so the keys are distinct — and `null` means "no filter", which must stay an always-true expression and never `undefined` (the documented "only France until I toggle the grape filter" bug).

### 3.2 Why the array is slow

`In.evaluate` (`@maplibre/maplibre-gl-style-spec/src/expression/definitions/in.ts`) ends in `haystack.indexOf(needle) >= 0` — a linear scan of all 598 keys per feature, per layer, per tile parse. Fifteen layers over the same source-layer means fifteen scans of the same feature.

### 3.3 The new shape

```ts
["any",
  ["==", ["get", "tier"], 0],
  ["==", ["get", ["string", ["get", "key"], ""], ["literal", keyMap]], true]]
```

with `keyMap = Object.fromEntries(keys.map((k) => [k, true]))` built **once per key set** (a `useMemo` on `visibleKeys`), not per layer.

Three deliberate details, each verified against the bundled style-spec source rather than assumed:

1. **Two-argument `get` is valid.** `compound_expression.ts` registers `get` with two overloads, `[[StringType], …]` and `[[StringType, ObjectType], …]`, and the two-argument one evaluates `obj[key]`, returning `null` for a missing key (`function get(key, obj) { const v = obj[key]; return typeof v === 'undefined' ? null : v; }`). `isValue` accepts a plain object literal, so `["literal", keyMap]` parses.
2. **`["string", ["get","key"], ""]`, not a bare `["get","key"]`.** The first argument of the two-argument `get` is typed `StringType`, and `ParsingContext.parse` wraps a `value`-typed argument in an **assertion** that *throws* at runtime for a non-string. A feature with no `key`, a null `key` or a numeric `key` would then hit `StyleExpression.evaluate`'s catch, log a `console.warn` and return the filter default. The result is still `false`, but the warning is noise and the throw is not free. `["string", x, ""]` returns the fallback instead of throwing (`Assertion.evaluate` only throws on the *last* argument).
3. **`["==", …, true]`, not `["to-boolean", …]`.** A plain object inherits `Object.prototype`, so `keyMap["constructor"]` is the `Object` function — truthy. `["to-boolean", …]` would let a feature keyed `constructor`, `toString` or `__proto__` through the gate; `["==", …, true]` compares with JS `===` (`comparison.ts`'s `eq`) and is false for anything that is not the literal `true` we put there. This was measured, not reasoned about (§3.5): the `to-boolean` form disagreed with the array form on exactly those three keys.

`["any", …]` short-circuits (`compound_expression.ts`: `for (const arg of args) if (arg.evaluate(ctx)) return true;`), so a tier-0 feature never reaches the lookup at all — identical to today.

### 3.4 Where it lives

A new pure module `src/lib/wine-map/key-gate.ts` exports

```ts
export type KeyGateExpression = readonly unknown[];
export function keyLookupMap(keys: readonly string[]): Record<string, true>;
export function keyGateExpression(keys: readonly string[] | null): KeyGateExpression | null;
```

so the built expression can be unit-tested against MapLibre's real expression engine without a DOM. `keyLookupMap` uses `Object.fromEntries`, not `map[key] = true`: assignment would silently drop a key spelled `__proto__` (the setter, not a data property), while `Object.fromEntries` defines own properties. `tile-wine-map.tsx` keeps its `useMemo` and the `as unknown as boolean` cast at the call site; nothing else about the five composed filters changes.

### 3.5 Equivalence, proven by test

`src/lib/wine-map/key-gate.test.ts` compiles **both** the old array gate and the new one with the style-spec's own `featureFilter` and asserts they agree on a table of features:

| Feature | Expected |
|---|---|
| key in the set, tier 3 | true |
| key in the set, last entry, tier 2 | true |
| key not in the set, tier 3 | false |
| tier 0, key not in the set | true |
| tier 0, key in the set | true |
| no `key` property | false |
| `key: null` | false |
| `key: 42` | false |
| `key: ""` | false |
| `key: "constructor"` | false |
| `key: "toString"` | false |
| `key: "__proto__"` | false |
| no `tier` property, key in the set | true |

Plus: `keyGateExpression(null)` returns `null` (the no-filter state stays the caller's always-true `PASS_FILTER`, never `undefined`); a prototype-named key that IS in the set still renders (the `Object.fromEntries` pin); an empty set hides everything but the country outline; evaluating a missing/null/numeric key raises no `console.warn` (the `["string", …, ""]` pin — without it the answer is still `false`, so only the warning catches the regression); the gate composes into all five of the map's filters and still behaves and validates in each position; the key set appears exactly once in the built expression (a statement about the expression, not about the live style — see §3.6); and `validateStyleMin` accepts it on a real layer.

Mutation-checked: swapping `["==", …, true]` for `to-boolean`, and dropping the `["string", …, ""]` wrapper, each fail exactly one case and nothing else.

### 3.6 Expected win

Bench (`node --experimental-strip-types`, the SHIPPED `keyGateExpression` compiled with the style-spec's own `featureFilter`; 633-key set out of 1,900 places, 120 recurring feature keys per tile, 200 tiles x 15 layers = 360,000 evaluations, three rounds):

| Gate | Time |
|---|---|
| `in` over an array | 1281 / 1232 / 1193 ms |
| `get` over an object (shipped) | 60 / 42 / 39 ms |
| `match` over labels (rejected, §3.7) | ~35 ms, same order |

**~20–30x** on the evaluation path. Against the baseline's 61 ms long task for applying the filter: the parse/validate half of that is unchanged (a 598-entry object literal is the same size as a 598-entry array literal), so expect the long task to fall but not vanish — the durable win is in the worker, on every tile parsed while a filter is on. Re-measure per §7.

**What this does NOT change: the size of the live style.** MapLibre's `Style.setFilter` deep-clones the filter for every layer it sets (`layer.setFilter(clone(filter))`), so picking a grape still installs **15 independent copies** of the 598-key map — exactly as the array version installed 15 copies of the 598-element array. The §1 baseline row "8,985 key entries in the style" is therefore **unchanged by C1, by design**. Do not read a flat `JSON.stringify(map.getStyle()).length` or a key-entry count as "C1 did not land"; that number never could move. The `useMemo` buys one build per key set instead of one per composed filter, and the shape buys per-feature evaluation time. That is the whole claim.

### 3.7 Rejected alternative

`["match", ["string", ["get","key"], ""], keys, true, false]` is the same speed (Match builds a label->index object at parse time). It is rejected because `Match.parse` *errors* on a duplicate label, which would turn a future filter source that can repeat a key into a blank map, and because it hides the key set inside a positional argument instead of a named map.

---

## 4. C2 — the leaner basemap

### 4.1 The site

`src/lib/wine-map/basemap.ts`, the single `basemapTweaks(layers)` rule. `onLoad` applies it to the live style with `removeLayer` / `setLayerZoomRange`; `tuneBasemapStyle` applies it to an incoming style spec. The two can never disagree, which is what keeps a theme swap's diff from re-adding what `onLoad` removed. `src/lib/wine-map/__fixtures__/carto-styles.json` is a trimmed copy of both real Carto styles (retrieved 2026-09-19): 93 layers each, the **same 93 ids** in both, differing only in the position of `waterway_label`.

Today's rule removes every layer whose `source-layer` is in `PRUNED_BASEMAP_SOURCE_LAYERS` (`housenumber`, `poi`, `transportation_name`, `aeroway`, `building`) — 11 layers — and pushes the 15 `place` symbol layers to z7+. 93 - 11 = **82 layers survive**.

### 4.2 What is left, and what it costs

Of the 82: 49 are the `transportation` source-layer (15 tunnel, 19 road, 13 bridge, 2 rail). The Côte de Nuits z12 measurement — 129 road features of 186 basemap features — is that. The cost is not only pixels: **every style layer that names a source-layer runs a full filter pass over that source-layer's features in every tile the worker parses**, whether or not a feature survives. Forty-nine passes over the transportation features of every tile is the bulk of basemap parse time.

MapLibre's tile worker calls `layer.isHidden(tileZoom, true)` and `continue`s **before** it builds the layer's bucket or runs its filter over a single feature (`WorkerTile.parse`). So **zoom-gating saves exactly what deletion saves, at the gated zooms** — and deleting a layer Carto already starts at z15 saves nothing at all below z15. Gating is therefore the default and removal the exception.

### 4.3 Why removal is the exception (revised 2026-09-20, review round)

The first draft of this section removed 29 ids, including all 15 `tunnel_*` layers and the six z15 service/path layers. Both were wrong, and the fixtures say so.

**Carto splits every road class into three layers with mutually exclusive filters,** and no layer draws a state other than its own:

| State | Filter |
|---|---|
| surface | `["!has","brunnel"]` |
| bridge | `["==","brunnel","bridge"]` |
| tunnel | `["==","brunnel","tunnel"]` |

`road_mot_fill_noramp` is `["all",["==","class","motorway"],["!=","ramp",1],["!has","brunnel"]]` and `bridge_mot_fill` requires `brunnel = bridge`, so a **tunnelled stretch matches nothing once `tunnel_mot_fill` is gone**: the motorway stops at one portal and restarts at the other. `rail` carries `["!=","brunnel","tunnel"]`, so the same holds for railways. The A7 at Tain-l'Hermitage, the Vosges crossings, the Mosel and Douro rail tunnels would each read as a broken map rather than a simpler one. The old justification — "six of them start at z5–z8, so they cost from country zoom up" — was also moot once `BASEMAP_ROAD_MIN_ZOOM` gates them to z10 anyway.

**The six service/path layers already start at z15 in both Carto styles,** so per §4.2 the worker never touches them at z4–z14, the zooms the baseline measured as heavy. Deleting them could only take effect at z15–z16 (21 basemap features against 10 wine features — the lightest row in the table) and what it deletes is not only footpaths: `road_path` is `["all",["in","class","path","track"],["!has","brunnel"]]`, and `track` is the OSM class for **vineyard access roads**, while `service` is the lanes between parcels. At a climat — Vosne-Romanée, Gevrey-Chambertin — those chemins are the only ground reference for where La Tâche ends and Romanée-Conti begins.

Both are kept and gated.

### 4.4 The rule

Two additions to the existing data-shaped rule, keeping it one source of truth:

**(a) `REMOVED_BASEMAP_LAYER_IDS` — 9 ids removed outright.** Both Carto styles carry the same ids, so one list covers Positron and Dark Matter.

| Family | Count | Ids | Why |
|---|---|---|---|
| Motorway ramps | 6 | `road_pri_case_ramp`, `road_trunk_case_ramp`, `road_mot_case_ramp`, `road_pri_fill_ramp`, `road_trunk_fill_ramp`, `road_mot_fill_ramp` | Interchange spaghetti, all at z12 — exactly the Côte de Nuits zoom that measured 129 road features. A ramp is its own slip road (`["==","ramp",1]`), never a segment of the mainline (`["!=","ramp",1]`), so dropping these leaves no gap. |
| Rail hatching | 2 | `rail_dash`, `tunnel_rail_dash` | A second pass over features `rail` / `tunnel_rail` already draw, purely for the cross-hatch. Both go together, or a railway would be hatched inside tunnels and plain outside them. The rail lines themselves stay, solid and continuous. |
| Cemeteries and stadiums | 1 | `landuse` | A fill layer whose whole filter is `class in (cemetery, stadium)`. `landuse_residential` stays — village extents are real context. |

**(b) `BASEMAP_ROAD_MIN_ZOOM = 10`,** applied as `minzoom = max(own minzoom, 10)` to every surviving layer whose `source-layer` is `transportation` — all 41 of them. Nine actually move:

| Layer | Was | Now |
|---|---|---|
| `road_mot_case_noramp` | 5 | 10 |
| `road_trunk_case_noramp` | 5 | 10 |
| `bridge_mot_case` | 5 | 10 |
| `bridge_trunk_case` | 5 | 10 |
| `tunnel_mot_case` | 5 | 10 |
| `tunnel_trunk_case` | 5 | 10 |
| `road_pri_case_noramp` | 7 | 10 |
| `bridge_pri_case` | 8 | 10 |
| `tunnel_pri_case` | 8 | 10 |

The other thirty-two already start at z10 or later and are unchanged. Carto draws a road's *casing* two or three zooms before its *fill*, so below z10 a motorway is the casing alone; gating the casing to z10 means **no road layer renders at all below z10** — country and region zoom become land, water, boundaries and place names. That is the Bourgogne z9 number (254 basemap features) this is aimed at.

### 4.5 What is deliberately kept

Water (`water`, `water_shadow`, `waterway`, the four `watername_*` labels — rivers are wine geography: Gironde, Mosel, Douro), land cover (`landcover`, `landuse_residential`, both `park_*`), every boundary (`boundary_country_inner`, `boundary_country_outline`, `boundary_state`, `boundary_county`), all 15 `place` labels at their existing z7+ gate, `background`, and from z10 up the **whole** road network — surface, bridge and tunnel alike — plus `rail`, and from their own z15 the service roads and `path`/`track` layers.

### 4.6 Accepted visual changes

- No roads below z10.
- Motorway on/off ramps are gone; the motorway itself is not, and neither is any tunnel or bridge segment of it.
- Railways draw as a solid line rather than cross-hatched, inside tunnels and out.
- Cemetery and stadium fills are gone.

### 4.6b Two rules the implementation added

Both came out of the tests rather than the design, and both are derived rules, not new hand-written lists.

**A zoom range is emitted only when it moves a layer.** The floors are still z10 for roads and z7 for place labels, but a layer already above its floor is now left out of `zoomRanges` entirely. `map.setLayerZoomRange` calls `_update(true)` whatever it is handed, and `Style.setLayerZoomRange`'s own early-return (`layer.minzoom === minzoom && layer.maxzoom === maxzoom`) is defeated for the 15 Carto layers that carry no `maxzoom`, because `maxzoom ?? 24` is a change from `undefined`. It then runs `_updateLayer`, which marks the layer's source `'reload'` and **pauses its tile manager** — during the map's first paint. 56 ranges used to be emitted; 40 of them changed nothing. Now 11 are: the 9 road casings and 2 place labels.

**A floor that reaches a layer's own ceiling removes it instead of gating it.** MapLibre hides a layer at `zoom >= maxzoom` (`StyleLayer.isHidden`), so `minzoom >= maxzoom` can never draw at any zoom. Five Carto place layers are exactly that under the z7 floor — `place_country_1` (z2–7), `place_continent` (z0–2) and the three small-city dots `place_city_dot_r{7,4,2}` (z4–7, z5–7, z6–7). Keeping them gated left five dead layers that every style diff still walks and every serialize still copies. Removing them is **invisible by construction**: the floor had already silenced them. The rule follows `PLACE_LABEL_MIN_ZOOM`, so moving that constant re-decides which layers qualify rather than stranding a hardcoded list.

### 4.7 Counts and tests

`93 - 11 (source-layer prune) - 9 (id prune) - 5 (dead under the place-label floor) = 68 layers`, both styles. The three rules do not overlap.

`src/lib/wine-map/basemap.test.ts` (which already runs against the real Carto fixtures) gains:

- the exact 25 removed ids (9 by id, 11 by source-layer, 5 by the floor) and the exact 11 re-zoomed ids, asserted for **both** Positron and Dark Matter, plus that every layer left out of `zoomRanges` is already at or above its floor;
- `tuneBasemapStyle` leaves both styles with the same **68** ids;
- **a brunnel-family guard**: grouping every `transportation` layer by its id with the `tunnel_`/`bridge_`/`road_` prefix and Carto's `_noramp` spelling normalised away, the removal decision must be **unanimous within a family** — so keeping `road_mot_fill_noramp` while dropping `tunnel_mot_fill` fails with `mot_fill: removed tunnel_mot_fill but kept road_mot_fill_noramp, bridge_mot_fill`. A `_ramp` layer keeps its suffix and forms its own family, which is why the six ramps pass; `rail_dash`/`tunnel_rail_dash` pass as a family that is unanimously removed;
- **a village-zoom guard**: the six service/path layers are asserted to start at z15 in both styles, to survive, to be left out of `zoomRanges` (already above the floor) and to still read z15 in the tuned style — plus that `road_path`'s filter really does name `track`;
- a guard that no `water`, `water_name`, `waterway`, `place`, `boundary` or `background` layer is ever dropped — except a place label the z7 floor has already made unrenderable — and that none of them is zoom-gated by the road rule;
- every surviving `transportation` layer has `minzoom >= 10` and every surviving place label `minzoom >= 7`, listed or not, and no surviving layer has `minzoom >= maxzoom`;
- `basemapTweaks` still touches none of our own layers, and now cannot: a layer on a wine source is skipped before any rule is consulted, pinned with decoys spelled like Carto layers;
- `tuneBasemapStyle` is idempotent (the swap tunes an already-tuned style);
- three flips in a row keep 68 basemap layers, keep every removed id out, keep every road at z10+ and every place label at z7+, and leave our layers last in mount order;
- the existing diff assertions stay green: `setStyle`, `addSource`, `removeSource` and `setLayerZoomRange` never appear, the only re-created layer is `waterway_label`, no command names a wine id, and `validateStyleMin` of the swap target is `[]`.

Mutation-checked: dropping `landuse` from the id list fails 4 cases; `BASEMAP_ROAD_MIN_ZOOM = 0` fails 2; removing the wine-source skip fails the decoy case; **re-adding `tunnel_mot_fill` to the removal list fails the brunnel-family guard by name, and re-adding `road_path` fails both it and the village-zoom guard.**

### 4.8 Expected win

82 -> 68 style layers; 49 -> 41 transportation layers, and **0 of those render below z10** — which is where the win actually is, not in the layer count. At z4–z9 the basemap becomes land, water, boundaries and place labels, so Bourgogne z9's 254 basemap features should fall by nearly the whole road share. Côte de Nuits z12's 129 road features should drop by the ramps. The theme swap's long-task total falls with the 14 removed layers plus C3's pre-tuned style (§5.4); the layer-count half of that win is smaller than the first draft claimed, and C3 is now the larger half.

---

## 5. C3 — the theme swap

### 5.1 What happens today

`swapBasemap` (`tile-wine-map.tsx` ~l.586) calls

```ts
map.setStyle(BASEMAP_STYLE_URL[next], {
  diff: true,
  transformStyle: (prev, incoming) => withWineLayers(prev, tuneBasemapStyle(incoming)),
});
```

Read in `maplibre-gl/dist/maplibre-gl-dev.js`: `setStyle` -> `_diffStyle` (fetches the URL) -> `_updateDiff` -> `Style.setState`, which serializes the current style, runs `transformStyle`, **validates the whole next style unless `validate` is false**, deep-clones it, diffs it, applies the operations, and fires `style.load` only when there was at least one operation.

The existing test shows the only layer re-created by the diff is `waterway_label`; everything else is per-layer property work. So the 350 ms of long tasks is per-layer work across ~82 basemap layers, plus one full style validation of the whole next style.

(The committed fixture is trimmed — it carries `paint` only for `background`, `landcover`, `landuse` and `water` — so it cannot be used to count the real diff's operations. Its layer *ids*, *types*, *source-layers*, *filters*, *layouts* and *zoom ranges* are genuine, which is what §4 and the diff-shape assertions rely on. Quantifying the swap is a browser measurement, §7.4.)

### 5.2 The change

1. **Fewer layers** (C2) cuts the per-layer work by ~35% for free.
2. **A module-memory cache of the tuned style per theme.** New in `basemap.ts`:
   ```ts
   export function cachedBasemapStyle(theme: Theme): StyleSpecification | null;
   export async function loadBasemapStyle(
     theme: Theme,
     fetchImpl?: (url: string) => Promise<Response>,
   ): Promise<StyleSpecification>;
   export function resetBasemapStyleCache(): void; // tests only
   ```
   `loadBasemapStyle` fetches `BASEMAP_STYLE_URL[theme]` once, runs `tuneBasemapStyle` on it, stores it, and de-duplicates concurrent callers through a pending-promise map. A second swap to a theme already loaded does **no fetch and no JSON parse**. `fetchImpl` is only a test seam; the default is `(url) => globalThis.fetch(url)`, called as a method of the global rather than detached. At most two fetches ever happen per tab: the map's own first style comes through react-map-gl's `mapStyle` URL, so the cache is cold for both themes until each is first flipped to.
3. **`setStyle` gets the cached object, not the URL.** `Map.setStyle` accepts `StyleSpecification | string`, and the object branch of `_diffStyle` calls `_updateDiff` directly. The diff therefore never sees an untuned layer.
4. **`validate: false`.** `StyleOptions.validate` is a documented MapLibre option ("Disabling validation is a performance optimization that should only be used if you have previously validated the values"). We have: `basemap.test.ts` runs `validateStyleMin` on exactly the style a swap produces, against the real Carto fixtures, and asserts `[]`.

`transformStyle` stays exactly as it is — `withWineLayers(prev, tuneBasemapStyle(incoming))` — which is the CLAUDE.md contract. `tuneBasemapStyle` is idempotent (a removed layer is not there to remove again; `max(10, 10) === 10`), so running it on an already-tuned cached style is a no-op. `mapStyle` on `<Map>` stays frozen at `initialTheme`.

### 5.3 Safety

- **The cache is never mutated.** `Style.setState` deep-clones `nextState` before touching it, and `withWineLayers` / `tuneBasemapStyle` both return fresh objects rather than mutating their input (pinned by the existing `deepFreeze` test).
- **A stale reply never applies.** `swapBasemap` already writes `requestedBasemapRef.current = next` before dispatching; the async path re-checks that ref before calling `setStyle`, so a flip back while a fetch is in flight drops the older reply. MapLibre's own `_diffStyleRequest.abort()` did this before. The same guard checks the map ref still points at the same map, because a reply can land after unmount and `setStyle` on a removed map throws.
- **A failed fetch falls back to today's behaviour**: `map.setStyle(BASEMAP_STYLE_URL[next], …)` with the same options, so MapLibre fires `error`, no `style.load` fires, `paintTheme` stays put (the map stays wholly on its old theme, D8 of the dark-mode spec), and flipping away and back retries — unchanged, and since nothing was cached that retry really does re-fetch. The fallback is the second argument of `.then(apply, onError)`, not a trailing `.catch`, so a throw from `apply` itself can never trigger a second `setStyle`.
- **`validate: false` is not a cliff.** If a style were ever invalid, `setState` would throw inside the operations and `_updateDiff`'s catch falls back to `_updateStyle`, which still runs `transformStyle` with the previous style and so still carries the wine layers across.

### 5.4 Expected win

The 31 ms style.json fetch and its parse disappear from the second and later swaps; the first swap is unchanged in network terms. The four long tasks (52 + 101 + 110 + 87 = 350 ms) should fall with the layer count plus the dropped validation pass — target under 250 ms total, i.e. under ~1 s frozen on a phone instead of ~1.4 s. Re-measure per §7.

### 5.5 Tests

`basemap.test.ts` gains: a fetch stub that counts calls and proves the second `loadBasemapStyle` for the same theme makes none; that what comes back is already tuned (68 ids, no removed id, the road gate applied) and equals `tuneBasemapStyle` of the raw body; that the two themes are kept apart; that two concurrent calls share one fetch; that a non-ok response and a body that is not a style both reject and leave the cache empty so a later call retries; and that the cached object is not mutated by a `withWineLayers` round trip.

Mutation-checked: deleting the `tunedStyles.set` line fails 3 cases.

---

## 6. C4 — the banner poll

### 6.1 The site

`src/components/active-tasting-banner.tsx` holds `const POLL_MS = 20_000` and a `window.setInterval(check, POLL_MS)`. `check` calls the `"use server"` `pollActiveTastings`, which the baseline measured at a median 788 ms of server time — 32 POSTs to `/knowledge/map` in one session, for a viewer with **nothing** active. The rules module `src/lib/active-tasting/select.ts` already owns `shouldPoll`, `bannerView` and `newerSnapshot`; the cadence belongs there too.

### 6.2 The rule

```ts
export const POLL_ACTIVE_MS = 20_000;
export const POLL_IDLE_MS = 120_000;

/** D12b: 20 s while there is a tasting to return to, 120 s when the last
    read found none. A tasting that starts elsewhere still appears at once
    on focus or on returning to the tab. */
export function pollIntervalMs(items: ActiveTastingItem[]): number {
  return items.length > 0 ? POLL_ACTIVE_MS : POLL_IDLE_MS;
}
```

The component reads `pollIntervalMs(snapshot.items)` instead of the constant and adds it to the effect's dependency list, so the interval re-arms the moment a poll turns an empty snapshot into a non-empty one (or back). Everything else is untouched: `shouldPoll` still decides *whether* to poll, the `visibilityState` guard, the `inFlight` guard, the `focus` and `visibilitychange` listeners, the `wasPaused` immediate re-check and the D13 "a failed poll keeps what is shown" behaviour all stay exactly as they are.

Why this is safe: the strip's whole job when `items` is empty is to show nothing. The only thing a poll can discover in that state is a tasting that has just started or been scheduled — and both arrive with a full page render (`initial`), on focus, or on returning to the tab. A viewer sitting on the map with the tab focused and a tasting starting on another device waits at most 120 s instead of 20 s; a viewer who *has* a tasting is unaffected.

### 6.3 Tests

`src/lib/active-tasting/select.test.ts` gains cases for `pollIntervalMs`: empty -> 120 s, one item -> 20 s, several items -> 20 s, that `POLL_ACTIVE_MS` is still 20 s, and that it is less than `POLL_IDLE_MS`. Mutation-checked: returning either constant unconditionally fails the case.

One detail in the component: `intervalMs` is a *number*, so although `polled` is a new object on every successful poll, the effect only re-runs when the cadence actually changes. And `wasPaused` is false on that re-run, so re-arming the interval does not fire an extra immediate check.

### 6.4 Expected win

On a page a viewer leaves open (the map is the obvious one), POSTs drop from 3/min to 0.5/min — from ~2.4 s of server time per minute to ~0.4 s, and the same reduction in main-thread work for the server-action round trip and React re-render. In the measured session that is 32 POSTs down to about 6.

---

## 7. What the main session should re-measure

Against the §1 numbers, on the same device and viewport:

1. **Grape filter.** Pick Chardonnay on `/knowledge/map`. Expect: the style now carries `["==", ["get", ["string", ["get","key"], ""], ["literal", {…598}]], true]` on the same 15 layers; the long task to apply it well under 61 ms; and — the real point — pan/zoom around Bourgogne **with the filter on** should stay at 17 ms frames where before it degraded. **The key-entry count stays ~8,985 and the style stays the same size** — MapLibre clones the filter per layer either way (§3.6). Check the expression shape and the frame times, never the byte count.
2. **Rendered features.** `queryRenderedFeatures` counts at France z5, Bourgogne z9, Côte de Nuits z12, Vosne z15, split basemap vs wine. Expect the basemap side to fall hard at z9 and z12 (0 road features below z10), and z15 to be roughly unchanged.
3. **Style layer count.** `map.getStyle().layers.length` — expect 68 basemap + the wine layers, against 82 + 15 before. The number to watch at z4-z12 is rendered FEATURES, not this count: the road gate is what removes work there.
4. **Theme swap.** Light -> dark -> light -> dark, timing to idle and the long-task list each time. Expect: swap 1 fetches, swaps 2+ do not; long tasks total under ~250 ms against 350 ms; and the palette, camera, selection, grape filter and Local/English choice all survive every swap exactly as before.
5. **Page chatter.** Sit on `/knowledge/map` for five minutes signed in with no active tasting; count POSTs to `/knowledge/map`. Expect ~3, not ~15. Then with a tasting running, confirm the strip still updates within ~20 s.
6. **Visual check** of §4.6: water, rivers, borders and place names unchanged; roads absent below z10 and present from z10; no lost region fills, outlines, labels or selection ring.

## 8. Rollback

Each change is one edit, independently revertible:

- **C1** — `keyGateExpression` returns the old `["in", …]` arm. One line in `src/lib/wine-map/key-gate.ts`; the five composed filters and every call site are untouched.
- **C2** — empty `REMOVED_BASEMAP_LAYER_IDS` and set `BASEMAP_ROAD_MIN_ZOOM = 0`; `basemapTweaks` falls back to today's rule exactly.
- **C3** — `swapBasemap` passes `BASEMAP_STYLE_URL[next]` and drops `validate: false`; the cache functions become dead code.
- **C4** — `pollIntervalMs` returns `POLL_ACTIVE_MS` unconditionally.

## 9. Not done here, and why

- **The shard mounting and hysteresis machinery** is measurably fine (17 ms frames, 0 long tasks) and is not touched.
- **Dropping `water_shadow`** would remove a second full fill pass over water polygons, but water is explicitly context we keep, and the change is visible. Not worth it.
- **A `beforeId` so wine layers sit under the basemap labels** would change collision order, which `world-labels` depends on (see its comment). Out of scope.
- **Pre-fetching the opposite theme's style on idle** would make even the first swap fetch-free, but it spends a request on every map page load for a theme most viewers never pick. Rejected.
- **Tuning the basemap before the map is created.** `onLoad` fires after MapLibre has rendered the first visible tiles, so the very first screenful is parsed against all 93 Carto layers and only then trimmed to 68. Fixing that means either fetching the style before creating the map (a round trip in front of first paint, and a loading state the component does not have) or tuning on `styledata`, which fires repeatedly and would need its own guard. The zoom it would help is France z4–z5, where the baseline measured 32 basemap features — the smallest number in the table. Left alone deliberately; revisit only if a measurement puts real time there.
- **The notifications bell's own 15 s poll** (`src/components/notifications-bell.tsx`, `getPendingInvites`) is a second timer on every page with the header. It is out of scope here — it was not in the measured baseline — but it is the obvious next candidate for the same treatment.
- **Tile-side changes** (fewer wine features, coarser geometry, a different `display_tier` split) are a tile rebuild, which this round rules out.
