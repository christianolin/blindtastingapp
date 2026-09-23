# Wine map: smooth by default — "One country | All countries" — design

Date 2026-09-23. Base `master` at `cd9acd5` (includes the 2026-09-20 perf round). Branch `map-detail-modes`, worktree `../blindtastingapp-mapdetail`.

Owner, verbatim: "implement a 'simple map' mode to improve performance that will be the default … the current map usually lags when you zoom in the first time"; "the lag happens when you start zooming in and it needs to load subregions"; "We need to do it right … the UX [must be] smooth and not laggy but give the option to see everything at once if you want and have a good pc." The app is live on Vercel with daily users.

Owner decisions (2026-09-23):
- D1 The light mode is the default for everyone; switching is one tap and is remembered per browser (never in the URL).
- D2 Approach "Focused + Everything", surfaced as **One country | All countries**.
- D3 All countries is available on every device with one plain warning: **"Uses more resources and can cause lag."** No device-specific wording.
- D4 Selecting a place keeps the selected label bigger, darkest and first; other labels no longer shrink or change collision priority on selection (their colour still dims as today).
- D5 The owner uses the production site on a Windows desktop and an iPhone (Safari and Chrome — both WebKit).
- D6 Ship straight to production ("just go to production"), staged, each stage verified, reverted on any failure.

Evidence behind this design (spikes and a five-lens adversarial review with a skeptic pass) lives in the session scratchpad; the load-bearing numbers are restated here.

---

## 1. The measured problem

Production build, Windows, Chrome 152, 455x628 map canvas (the 1440-wide three-column layout):

| Gesture | Today |
|---|---|
| First zoom past z5 from the z4.4 opening view (36-44 shards mount) | **one 1.2-1.5 s long task** + a 115-130 ms first render; warm = cold |
| Same, Full view (~1400x850) | 66-67 shards mount (not measured; larger) |
| Unmount on zoom-out below z5 | ~110 ms task (react-maplibre `getStyle()` per Source) |

Cause (verified in MapLibre 5.24 source and by a replay harness):
1. `map.addLayer`/`addSource` always run `Style._validate`, which calls `this.serialize()` on the **whole style** — cost grows with the square of the style size. react-map-gl's `<Source>`/`<Layer>` go through exactly these calls; neither the `validateStyle` map option nor a `setStyle` diff avoids it.
2. Every shard fill and outline layer carries a **~38 KB** `areaColor` expression (a 934-slug palette `match` plus `REGION_MATCH` twice), so each serialize is ~3.6 MB of JSON with 44 shards mounted.
3. Secondary: a focus-country flip is `setFilter` on 3 layers per shard (3.3 s for 201 layers), the ramp latch is a data-driven `setPaintProperty` on every layer (1.1 s), and a selection rewrites paint and layout on every mounted layer — each validated, each reloading its source.

Replay of all 67 shards (201 layers) on a fresh map: public API + full expressions **3101 ms**; `validate:false` only 558 ms; small expressions only 228 ms; **`validate:false` + small expressions 13 ms** (no long task, worst frame 24 ms, idle 324 ms). A focus switch written as one global-state value read by static filters: **1-2 ms**.

A one-country mode on today's engine still freezes (France 311 ms, Italy 543 ms): the fix must be in the engine; the mode then makes the default genuinely lighter.

## 2. Goals, non-goals, acceptance

Goals
- **G1 No freeze.** No main-thread long task attributable to the map during: first zoom z4.4→5.5; zoom into Bourgogne to z13; a tree selection; a grape pick/clear; Local/English; One↔All; a theme flip; a country-chip tap.
- **G2 One country (default).** Full depth (tier ≥ 2) for one country at a time; other countries at region level. Which country: a chip tap, else the selected place's country while it is on screen, else the country of the wine region under the map centre, else today's share-of-view rule.
- **G3 All countries (opt-in).** Full depth for every country at once. Warning shown while it is on.
- **G4 Country chips** in the toolbar: tap = focus that country (and fly there if it is not in view). They show which country has detail.
- **G5 Live safety.** Deep links (`?place=`) unchanged; tile manifest untouched (schema v2); every stage revertible by one `git revert`; an error boundary turns any residual engine throw into the existing "Retry map" card instead of a white page.

Non-goals (this round): tile pipeline or manifest changes; MapLibre 6; worker-count, fadeDuration, pixelRatio or pmtiles-cache changes; basemap changes; device auto-detection; palette entries for the six German shards that have none.

Acceptance (production build via the `start` config, desktop, 455x628 and ~1400x850 full view):
- A1 Longest task ≤ 50 ms and no frame > 100 ms for each G1 gesture (median of 3 cold runs), measured with long-task/LoAF observers and rAF deltas.
- A2 A selection reloads at most the world source plus the previous and the new selected place's shard sources (counted by wrapping `style._reloadSource`) — never the other mounted shards.
- A3 Visual parity for Phase 1 (screenshots light+dark: France z5.5, Bourgogne z9 and z13 with a climat selected, Alsace/Baden z9, Mosel z12, Champagne z10, Toscana z8, Baden z6) — identical except the accepted changes in §9.
- A4 The whole vitest suite passes; lint and `next build` pass.
- A5 After each production deploy: the live site loads the map, first zoom has no long task in the smoke run, a deep link rings its place, no new console errors.
- iPhone: the `?debugPerf=1` meter (§7.4) lets the owner record frame timings on the phone; target no frame > 100 ms for the scripted gestures.

## 3. Architecture overview

```
TileWineMapExplorer (explorer shell, React state: selection, tree, grape, lang, detail mode, chip country)
  ├─ toolbar: Filter · grape · N places · Local|English            (existing row)
  ├─ toolbar: [One country | All countries] · status line           (Phase 2)
  ├─ toolbar: country chips (scroller)                              (Phase 2)
  └─ ErrorBoundary → TileWineMap (next/dynamic ssr:false)
        ├─ react-map-gl <Map>, world <Source> + world layers (static props)
        ├─ ShardController (imperative, validate:false)  ← shardLayerSpecs (pure)
        ├─ MapStateSync: one desired-state snapshot → global state + feature-state
        └─ status → onDetailStatus(...) up to the explorer
```

Pure modules (vitest-covered, no maplibre value imports): `shard-specs.ts` (colour + layer specs), `map-state.ts` (desired global state, selection feature-state sets), `mount-policy.ts` (which shards to mount), `focus.ts` (focus country rule), `camera-fit.ts` (chip camera box). Imperative modules take a narrow `MapLike` interface so a fake map drives their tests.

Phases (each its own commit series and production deploy):
- **Phase 1a — small colours + staggered mounts + safety net.** No visible change.
- **Phase 1b — static layers: global state + feature-state.** No visible change except D4.
- **Phase 1c — imperative shard controller.** No visible change.
- **Phase 2 — One country | All countries, chips, status line, centre focus.**

## 4. Phase 1a — small colour expressions, staggered mounts, safety net

### 4.1 Per-shard colour expression
Every live feature's `region` equals its shard key, so a shard's colour expression needs only its own region and its own area slugs. New pure builders in `src/lib/wine-map/shard-specs.ts`:
- `regionHue(region, palette)` — today's per-region arm: `palette.regions[region]` → the 6-step tint `match` on `tint`; a region the palette does not name → `palette.fallback` **flat** (today's fallback is flat; baden, franken, rheingau, wuerttemberg, saale-unstrut and hessische-bergstrasse take this path).
- `shardColorExpression({ region, areaSlugs, ramp, palette })` — today's `fillColorExpression` with `REGION_MATCH` replaced by `regionHue(region)` (in both the `step` default and the area fallback) and `paletteArms` built from **that shard's** slugs; `ramp` is a per-shard constant, so the `let ramp` binding disappears and each palette arm is either the classification shade family (ramp) or the tint-only family.
- `worldRegionColor(palette)` = today's `REGION_MATCH` (world features carry no `area_key`/`group`, so the area arms never match there — checked on all 72 world features, 0 mismatches).
- `areaSlugsByShard(tree)` buckets each node's `areaSlugsFromTree` contribution by `shardKeyFor(node.key)` (mirroring `scripts/wine-map-tiles/lib.mjs`); the union equals `areaSlugsFromTree(tree)` (pinned by a test).
- Parity is proven by a vitest sweep through MapLibre's own expression engine: for every (region, slug, tint, classification, zoom ∈ {5, 7.99, 8, 10, 13}, ramp, theme) the per-shard expression evaluates to the same colour as today's expression. (A one-off sweep over all live features already gave 0 mismatches in 97,560 evaluations.)
- Sizes: median ~2 KB, max ~7 KB per shard (from ~38 KB).

`fill-opacity` keeps today's shape with the shard's ramp constant.

### 4.2 Staggered mounting
`syncMountedShards` still computes the target set exactly as today. The rendered set grows by at most **3 new shards per animation frame** (removals apply at once), in today's alphabetical order, the selected shard first. With small expressions the measured worst batch is 16 ms. (Phase 1c replaces this with the controller's time-budgeted batches, §6.)

### 4.3 Safety net
- `MapErrorBoundary` around the dynamic `TileWineMap`: on error it renders the existing "The map tiles are unavailable right now — Retry map" card; Retry remounts the map (key bump). Also catches a `ChunkLoadError` from `next/dynamic` after a deploy.
- Tree load becomes tri-state (`loading | ready | failed`) with one automatic retry after 2 s; a failed tree shows a small "Couldn't load the place list — Retry" in the tree card. A failed tree never blanks the map: shards with an unknown country render full depth in region colours (today's behaviour).

### 4.4 Perf probe
`?debugPerf=1` adds a small overlay to the map card: live worst-frame/long-task readout, and **Run test**, which plays a fixed gesture script (easeTo zoom 4.4→5.5 over France; flyTo Bourgogne z9; zoom to z13; tree-equivalent selection of a climat; zoom back out), then shows a table (worst frame, frames > 50/100 ms, long tasks where supported, time to idle, sources reloaded) and a **Copy results** button (JSON with user agent, dpr, canvas size, cores). Long tasks/LoAF are used where the browser has them; Safari/WebKit falls back to rAF frame deltas. Nothing renders without the query parameter.

## 5. Phase 1b — static layer specs via global state and feature-state

After this phase no React prop change rewrites a shard or world layer's filter, paint or layout; every dynamic input is one global-state write or a few feature-state writes.

### 5.1 Global state (names are prefixed `wm_`)
| Name | Type | Read by | Write moments |
|---|---|---|---|
| `wm_keys` | object `{key:true}` or null | every wine filter (grape gate) | grape pick/clear |
| `wm_local` | boolean | `text-field` on every label layer | Local/English |
| `wm_deep_<country>` | boolean | depth term of that country's shard filters | focus change, mode change |
| `wm_has_sel` | boolean | fill-opacity and label paint (dim the unrelated) | first selection of the session (never cleared) |
| `wm_sel_key` | string or null | selection ring/casing and selected-label filters | every selection |
| `wm_tick` | constant 1 | nothing | after imperative batches (marks the style dirty) |

Exact null-safe shapes (verified in the bundled engine; pinned by truth-table tests covering never-set, null, and set):
- Grape gate: `["any", ["!", ["to-boolean", ["global-state","wm_keys"]]], ["==", ["get","tier"], 0], ["==", ["get", ["string", ["get","key"], ""], ["global-state","wm_keys"]], true]]`. Never `has`, never a `coalesce` to `{}`.
- Depth term for a shard of known country C: `["any", ["==", ["global-state","wm_deep_C"], true], ["<=", ["get","tier"], 1]]`. Unknown country: no depth term (full depth, today's "left alone"). Per-country names mean a focus flip reloads only the two countries' shards, and All mode (all flags true) never reloads on pans.
- Label text: `["case", ["==", ["global-state","wm_local"], true], ["get","name"], <englishTextFieldExpression>]` (unset = English, today's default).

### 5.2 Selection through feature-state
Paint emphasis moves to feature-state, which reloads nothing:
- Shard sources get `promoteId: "key"`; the world source keeps `promoteId: "region"` (a tier-1 feature's id is its region slug, a country's is its key).
- States: `sel` (the selected place), `child` (its children), `rel` (children, siblings, parent). Sets come from the loaded tree (fallback when the tree is missing: children and parent from the place context). Keys are bucketed by shard; each mounted shard gets its bucket, and a shard that mounts later gets its bucket on mount. Old states are removed on change; everything is re-sent after a style rebuild (`styleEpoch`), like the handoff.
- `fill-opacity` focus: `case(fs sel → selected, fs child → base, gs wm_has_sel → base × 0.45, base)` inside today's zoom interpolation.
- Label paint (`text-color`, `text-opacity`, `text-halo-width`): `case(fs sel → selected, fs rel → related, gs wm_has_sel → distant, plain)` — the same values as today's `labelPaint`.
- Label **layout** no longer varies by selection (D4): every label layer uses the no-selection `text-size` and `symbol-sort-key`. The selected place's label is drawn by one extra symbol layer on the selected place's source (`*-selected-label`, filter `key == wm_sel_key`, size +2.5, selected colours, top of the style so it is placed first and wins collisions); the ordinary copy hides behind it by collision.
- Ring/casing filters read `wm_sel_key`. A selection therefore reloads only the world source and the previous/new selected place's shard sources (A2).
- `wm_has_sel` flips at most once per session (the explorer never clears a selection), so the one paint recompile it causes lands on the first selection only.

### 5.3 One writer, always safe
`MapStateSync` keeps the desired state in a ref (every React change writes the ref first) and one idempotent `apply(map)`:
- runs on `onLoad`, synchronously inside every `style.load` listener (wrapped in try/catch — a throw there would turn a successful theme diff into MapLibre's full rebuild), and after React changes;
- only writes when the style is ready: a readiness flag cleared on `styledataloading` and set on `load`/`style.load`, plus try/catch around each call (never `isStyleLoaded()`, which is false while tiles load);
- skips values equal to `map.getGlobalState()[name]` (deep equality), keeps an "applied" record keyed by the `map.style` object so a full rebuild resends everything;
- never puts a `state` block in any style handed to `setStyle` (a test asserts `withWineLayers` output has none).

### 5.4 Handoff readiness latch
Reloads (grape, language, focus, selection) make `isSourceLoaded` false for a moment, which today briefly re-shows a region's world copy (double opacity). Readiness becomes a latch per mount: a shard counts as ready once it has loaded **while its bbox intersects the view**, and stays ready until it is unmounted. The vacuous-load case (mounted by the 50% pad but off screen) is still excluded.

### 5.5 Ramp latch
Unchanged rule (a region joins when a scan sees ≥ 2 of grand_cru / premier_cru / communal among its features; live data: bourgogne, champagne), but joining now rewrites only that shard's fill-color, fill-opacity and line-color.

## 6. Phase 1c — imperative shard controller

`ShardController` (`src/lib/wine-map/shard-controller.ts`) replaces the per-shard `<Source>`/`<Layer>` JSX:
- **Specs**: built lazily at add time by the pure `shardLayerSpecs(key, shard, inputs)` from a ref holding the **landed** theme, ramp set, country map and `noFills`. Specs are fresh objects, never mutated after add; every generated spec is validated in vitest with `validateStyleMin` (runtime validation is off).
- **Add**: shards are added in batches bounded by an **8 ms time budget per animation frame** (measured ~0.2 ms per shard on the desktop, so all 67 fit in one frame there; a slow phone spreads them over a few frames), the selected shard first, then alphabetical. Each shard is added in one synchronous step: `map.style.addSource(id, spec, {validate:false})`, then its fill, outline and label layers with `map.style.addLayer(spec, beforeId, {validate:false})`; `beforeId` is the first overlay layer (selected casing/ring/label) so overlays stay on top; world layers must already exist (the controller waits for `world-labels`). Each shard is transactional: on any throw its partial layers and source are removed, it is marked failed for the session (logged once) and never counted ready. After the batch: `map.setGlobalStateProperty("wm_tick", 1)` (public API; always calls `_update(true)`, reloads nothing).
- **Remove**: overlay layers first, then labels, outlines, fills, source — direct `removeLayer`/`removeSource` (no `getStyle()` clone).
- **Overlays**: selected casing, ring and selected-label for the selected place's shard; moved when the selected shard changes.
- **Truth from the map**: what is mounted is read from `getSource`/`getLayer`, so StrictMode double effects and re-runs are no-ops; a full rebuild (`styledataloading` → `style.load`) triggers a re-add of anything missing and a colour re-apply for the landed theme (fill-color, line-color on outlines/casing/ring, text-color/halo-color on labels) with `{validate:false}`.
- **Hover**: the `onMouseMove` hover query is replaced by an rAF-throttled `mousemove` listener that returns while the map is moving and only sets the cursor.
- react-map-gl keeps the `<Map>`, the world source and its layers (their props are now static), events and `interactiveLayerIds` (which already tolerates ids that do not exist yet).

## 7. Phase 2 — One country | All countries

### 7.1 Controls (toolbar above the map; nothing new on the map canvas)
- **Row 2**: a two-option radio group, `aria-label="Map detail"`: **One country** | **All countries** (one tap). Selected state shown by shape as well as colour (ring + semibold; dark-mode contrast ≥ 3:1). The All option's `aria-describedby` points at the warning text.
- **Status line** (same row, wraps below on narrow widths; reserved height so the map never jumps; `role="status"`, polite):
  - tree loading: empty
  - tree failed: "Subregion detail couldn't load. Retry"
  - One country, no focus: "Zoom in on a country, or tap one below, to see its subregions."
  - One country, focus F below F's first subregion zoom: "Zoom in to see {F}'s subregions."
  - One country, focus F with depth visible: "Subregions: {F}." — plus " Other countries show regions only." when another country is in view.
  - All countries: "Subregions for all countries. Uses more resources and can cause lag."
  - after a fallback (7.5): "Switched to One country after a problem last time."
- **Row 3**: country chips — tree roots with `kind === "COUNTRY"`, sorted by displayed name (`Intl.Collator`, active label language), `lang` set on local names; one line, horizontal scroll with an edge fade, roving tabindex; the focus chip scrolled into view with `scroller.scrollTo` (never `scrollIntoView`). The focus chip is marked (Layers glyph, ring, sr-only ", subregions shown") only while subregions are actually visible. While a grape filter is on, each chip shows its count of visible places and zero-count chips are dimmed.
- Full view's map height subtracts the reserved row heights.

### 7.2 Mode state
`detail: "one" | "all"`, persisted per browser with `safe-storage` flags (`wine-map-all-countries`), read through a hydration-safe external store (server snapshot "one"). Written to the map as the `wm_deep_<country>` flags: All → every country true; One → only the focus country true.

### 7.3 Focus and chips
- **Focus country** (One mode), evaluated on `moveend`:
  1. `chipCountry` — set by a chip tap; cleared by the next real selection or when that country leaves the view;
  2. the selected place's country while it is on screen (today's rule);
  3. the country of the wine region under the map centre (`queryRenderedFeatures` at the centre point on the region fill layers; country from the shard→country map) — fixes today's border artefacts (e.g. Germany chosen while centred on Colmar);
  4. today's 0.6/0.45 share-of-view rule with hysteresis.
- **Chip tap**: sets `chipCountry` (focus without selecting — the details panel and `?place=` stay). Camera: if zoom ≥ 5 and the country's wine ground intersects the view, no move; otherwise fly (cameraRequest with a nonce, so a re-tap re-flies) to the union of that country's shard bboxes, dropping outlier shards (centre farther than 3× the median centre distance — e.g. Madeira), with a minimum zoom of 5.5 so its regions and first subregions load on landing. In All mode the chip only flies.
- `TileWineMap` reports `{ focusCountry, depthVisible, countriesInView, ready }` upward on `moveend` (`depthVisible` = zoom ≥ the focus country's smallest tier-2 `min_zoom`, from the tree).

### 7.4 Mount policy (makes One country genuinely lighter)
- One: the selected shard; the focus country's shards in view (50% pad) at z ≥ 5; any other shard in view at z ≥ 8 (for crisp region outlines where the z0-7 world archive would be overzoomed); 150% keep hysteresis.
- All: today's rule (every shard in view at z ≥ 5).

### 7.5 Guard rails for All
- A `webglcontextlost` event drops to One country for the session and shows the fallback status line.
- Crash-loop sentinel: before applying All, set `wine-map-all-pending`; clear it at the first `idle`. If a page load finds it set, start in One country (the saved choice stays All until the user changes it) and show the fallback line.

## 8. Failure modes

| Failure | Behaviour |
|---|---|
| Place tree fails | one retry; shards render full depth in region colours; chips absent; status explains with Retry |
| A shard spec throws on add | that shard is rolled back and skipped for the session; world copy keeps drawing the region |
| Style not loaded / full rebuild | writes queue in the desired-state snapshot; re-applied on `style.load` |
| Any uncaught throw in the map | error boundary → "Retry map" card; tree and details keep working |
| Manifest missing a shard's fields / older release | no manifest changes in this round; the tree remains the source of shard→country |
| WebGL context lost in All | drop to One for the session |

## 9. Accepted visible changes
- D4: non-selected labels keep their no-selection size and collision priority when a place is selected.
- Phase 2: the focus rule prefers the country under the map centre; the new controls and status line; One country mode does not mount other countries' shards below z8 (the world archive draws their regions, identical up to z7).

## 10. Verification and rollout
Per phase, before deploy: `npx vitest run`, `npx eslint` on touched files, `npx tsc --noEmit`, `next build`; a production run (`start` config) in the in-app browser with the §2 protocol and the A3 screenshot set; failure injection (block the tree RPC, block one shard archive, flip the theme during the first zoom). Deploy = fast-forward `master` and push; then the A5 smoke test on the live site with a minted demo session; any failure → `git revert` of that phase and push.

## 11. Follow-ups (not in this round)
Additive manifest fields (per-shard `country`, `ramped`, `deep_min_zoom`; countries' wine-ground bbox) so no client depends on the tree; palette entries and labels for the six German shards without them; fadeDuration and pixelRatio A/B on the iPhone; keeping shards mounted below z5; grouping archives by max zoom.
