# Wine map "One country | All countries" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Knowledge wine map's first-zoom freeze for every user and add a light-by-default "One country | All countries" detail switch with country chips.

**Architecture:** Shrink each region shard's colour expression to its own region (byte-identical colours), make every shard/world layer spec static by moving dynamic inputs (selection, focus, grape filter, label language) into MapLibre global state and feature-state, then mount shard layers imperatively with `map.style.addLayer(..., {validate:false})` through a `ShardController`. Phase 2 adds the persisted detail mode, focus rule, chips and a status line on top of that engine. Four production deploys: 1a, 1b, 1c, 2.

**Tech Stack:** Next.js 16 App Router (client components), React 19, TypeScript, MapLibre GL JS 5.24.0 via react-map-gl 8.1.1 (`@vis.gl/react-maplibre`), pmtiles 4.4.1, vitest 3 with `@maplibre/maplibre-gl-style-spec` (expression engine in tests), Tailwind, shadcn/base-ui.

**Spec:** `docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md`

## Global Constraints

- Work only in the worktree `C:\Users\Public\repos\blindtastingapp-mapdetail` on branch `map-detail-modes`. Never touch `C:\Users\Public\repos\blindtastingapp` (the owner's checkout; it has an uncommitted `package.json` the owner owns).
- Commit with the repository identity: prefix every `git commit` with `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com` and end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git add -A`; add the files the task names.
- Tests: `npx vitest run <path>` for one file, `npx vitest run` for all (157 files / 3354 tests passing at base). Types: `npx tsc --noEmit`. Lint: `npx eslint <files>`.
- Never pass a changing `mapStyle` to `<Map>`; theme swaps stay in `swapBasemap` (`setStyle(style, {diff:true, validate:false, transformStyle})`). Never add a `state` block to any style handed to `setStyle`.
- Map components load only via `next/dynamic` with `ssr:false`. New pure modules under `src/lib/wine-map/` import maplibre **types only** (`import type`), never values.
- Never pass `undefined` as a layer `filter` or `layout` (MapLibre silently drops the layer): use `PASS_FILTER`, `LAYER_VISIBLE`, `LAYER_HIDDEN`.
- Every wine source id is `wine-world` or starts with `wine-shard-` (`basemap.ts` `isWineSourceId`), or `withWineLayers` drops it on a theme flip.
- Global-state names are exactly: `wm_keys`, `wm_local`, `wm_has_sel`, `wm_sel_key`, `wm_tick`, and `wm_deep_<country>` (country slug = canonical_key segment 0).
- Feature-state flags are exactly `sel`, `child`, `rel` (selection) and the existing `handed` (world handoff). Shard sources use `promoteId: "key"`; the world source keeps `promoteId: "region"`.
- Null-safe expression shapes (verified in the bundled engine) are the ones in the spec §5.1; never `has`, never `coalesce` to `{}`, never `["==", gs, null]` as the grape guard.
- UI copy, exact: switch options **"One country"** / **"All countries"**, group `aria-label="Map detail"`; warning **"Uses more resources and can cause lag."**; status strings exactly as in Task 21.
- Persistence keys, exact: `wine-map-all-countries` (flag set = All), `wine-map-all-pending` (crash-loop sentinel). Through `src/lib/safe-storage.ts` (`readFlag`/`writeFlag`/`clearFlag`) only.
- No Anthropic API calls, no database migrations, no tile pipeline or manifest changes, no MapLibre upgrade.
- Deploy tasks (6, 13, 17, 24) are run by the main session only (browser + git push), never by an implementer subagent.

## Review Focus

- **Tree never arrives (RPC fails or is slow).** Expected: the map still mounts shards and shows full-depth detail in region colours, deep links still ring their place, no chip row errors; a Retry is visible. Pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (`shardFilter(null)` keeps full depth) and Task 18 (`mountTarget` with empty `shardCountries`, mount-target.test.ts case 7).
- **Style rebuild / not-yet-loaded style while state changes** (cold `?place=` deep link resolving before Carto's style.json; MapLibre's full-rebuild fallback on a theme flip). Expected: no throw escapes, and selection ring, grape filter, focus depth and label language are all restored after `style.load`. Pinned in Task 9 (MapStateSync fake-map tests) and Task 15 (controller rebuild test).
- **Grape filter off (null/never set) vs on.** Expected: filter off shows every place (the "only France" blank-map bug must never return); `constructor`/`__proto__` keys never pass. Pinned in Task 7 truth tables.
- **Selecting places rapidly across shards and countries** (tree clicks, map taps, Nearby chips, global-search deep links). Expected: exactly one place ringed and emphasised, no stale `sel`/`rel` feature-state left on the previous shard, the `deepLinkAction` watermark untouched. Pinned in Task 8 (selection sets) and Task 9 (state removal diff).
- **Switching One ↔ All, Local ↔ English, light ↔ dark while shards are still mounting.** Expected: the landed mode/language/theme applies to every shard including ones added after the switch. Pinned in Task 15 (controller re-apply) and Task 20 (mode store).

---

## File Structure

New pure modules (vitest-covered, type-only maplibre imports):
- `src/lib/wine-map/shard-specs.ts` — colour expressions (region hue, per-shard area palette, world region colour), fill/outline/label paint and layout builders, per-shard area slugs. Grows in 1b (static feature-state/global-state forms) and 1c (`shardLayerSpecs`).
- `src/lib/wine-map/mount-policy.ts` — `nextMountStep` (1a staggering) and `mountTarget` (2: One/All mount rule).
- `src/lib/wine-map/tree-load.ts` — tree load state machine (`loading | ready | failed`, one retry).
- `src/lib/wine-map/perf-stats.ts` — frame/long-task statistics for the probe.
- `src/lib/wine-map/map-state.ts` — global-state names, null-safe expression pieces, `desiredGlobalState`.
- `src/lib/wine-map/selection-state.ts` — selection feature-state sets bucketed by source.
- `src/lib/wine-map/handoff.ts` — readiness latch.
- `src/lib/wine-map/focus.ts` — focus-country rule.
- `src/lib/wine-map/camera-fit.ts` — chip camera box with outlier rejection.
- `src/lib/wine-map/detail-status.ts` — status line model (exact copy).
- `src/lib/wine-map/detail-mode.ts` — persisted One/All store + crash-loop sentinel logic.
- `src/lib/wine-map/country-chips.ts` — chip list (countries only, collator order, grape counts).

New imperative modules (fake-map tests):
- `src/lib/wine-map/map-state-sync.ts` — `MapStateSync`: desired global state + selection feature-state, readiness-guarded, rebuild-safe.
- `src/lib/wine-map/shard-controller.ts` — `ShardController`: imperative shard source/layer lifecycle.

New components:
- `src/app/knowledge/map/map-error-boundary.tsx` — error boundary with the "Retry map" card.
- `src/app/knowledge/map/perf-probe.tsx` — `?debugPerf=1` overlay.
- `src/app/knowledge/map/map-detail-controls.tsx` — One/All radiogroup + status line.
- `src/app/knowledge/map/country-chips.tsx` — chip row.

Modified:
- `src/app/knowledge/map/tile-wine-map.tsx` — consumes the above; shard JSX removed in 1c.
- `src/app/knowledge/map/tile-wine-map-explorer.tsx` — tree state, error boundary, detail mode, chips, status plumbing.
- `CLAUDE.md` — Task 25.

## Interface Contracts (shared across tasks)

```ts
// src/lib/wine-map/shard-specs.ts
export type Bbox = [number, number, number, number];
export type ColorExpression = unknown[] | string;
export const AREA_PALETTE_ZOOM = 8;
export const SHADE_TINT_FALLBACK = 2;                       // today's coalesce default for `tint`
export function regionHue(region: string, palette: MapPalette): ColorExpression;
export function worldRegionColor(palette: MapPalette): ColorExpression;          // today's REGION_MATCH
export function shardColorExpression(input: {
  region: string; areaSlugs: readonly string[]; ramp: boolean; palette: MapPalette;
}): ColorExpression;
export function areaSlugsByShard(roots: readonly WinePlaceTreeNode[]): Record<string, string[]>;
// 1b adds (static, feature-state/global-state based):
export function staticFillPaint(input: { color: ColorExpression; ramp: boolean; worldHandoff: boolean }): Record<string, unknown>;
export function staticOutlinePaint(input: { color: ColorExpression; worldHandoff: boolean }): Record<string, unknown>;
export function staticLabelLayout(): Record<string, unknown>;
export function staticLabelPaint(input: { palette: MapPalette; worldHandoff: boolean }): Record<string, unknown>;
export function selectedLabelLayout(): Record<string, unknown>;
export function selectedLabelPaint(input: { palette: MapPalette; worldHandoff: boolean }): Record<string, unknown>;
export function shardFilter(country: string | null): unknown[];                 // ["all", grapeGate, depthTerm?]
export function selectedPlaceFilter(): unknown[];                               // ["all", grapeGate, key == wm_sel_key]
// 1c adds:
export type ShardSpecInputs = {
  country: string | null; areaSlugs: readonly string[]; ramp: boolean;
  palette: MapPalette; fillsVisible: boolean;
};
export type ShardLayerSpecs = { sourceId: string; source: VectorSourceSpecification; layers: LayerSpecification[] };
export function shardLayerSpecs(key: string, url: string, inputs: ShardSpecInputs): ShardLayerSpecs;
export function shardOverlaySpecs(key: string, palette: MapPalette): LayerSpecification[]; // casing, ring, selected-label

// src/lib/wine-map/mount-policy.ts
export function nextMountStep(current: readonly string[], target: readonly string[],
  opts: { maxAdds: number; first: string | null }): string[];                 // sorted
export type MountInput = {
  shards: readonly (readonly [string, { bbox?: Bbox }])[]; view: Bbox; zoom: number;
  selectedShard: string | null; prev: ReadonlySet<string>;
  detail: "one" | "all"; focusCountry: string | null; shardCountries: Readonly<Record<string, string>>;
};
export const SHARD_MIN_ZOOM = 5;
export const NEIGHBOUR_MIN_ZOOM = 8;
export function mountTarget(input: MountInput): string[];                      // sorted

// src/lib/wine-map/tree-load.ts
export type TreeLoad = { state: "loading" | "ready" | "failed"; attempt: number };
export function treeLoadReducer(s: TreeLoad, e: { type: "resolved" } | { type: "rejected" } | { type: "retry" }): TreeLoad;
export const TREE_AUTO_RETRY_MS = 2000;

// src/lib/wine-map/perf-stats.ts
export type FrameStats = { frames: number; worst: number; over50: number; over100: number; p95: number };
export function frameStats(deltas: readonly number[]): FrameStats;

// src/lib/wine-map/map-state.ts
export const GS = { keys: "wm_keys", local: "wm_local", hasSel: "wm_has_sel", selKey: "wm_sel_key", tick: "wm_tick" } as const;
export function deepStateName(country: string): string;                        // `wm_deep_${country}`
export function grapeGateExpression(): unknown[];
export function depthTerm(country: string): unknown[];
export function labelTextField(): unknown[];
export type DesiredGlobalState = Record<string, unknown>;
export function desiredGlobalState(input: {
  visibleKeys: readonly string[] | null; english: boolean; selectedKey: string | null;
  deepCountries: readonly string[]; knownCountries: readonly string[];
}): DesiredGlobalState;

// src/lib/wine-map/selection-state.ts
export type SelectionFlags = { sel?: true; child?: true; rel?: true };
export type SelectionStates = Map<string /* source id */, Map<string /* feature id */, SelectionFlags>>;
export function selectionFeatureStates(input: {
  roots: readonly WinePlaceTreeNode[] | null; selectedKey: string | null;
  fallback: { childKeys: readonly string[]; parentKey: string | null } | null;
}): SelectionStates;

// src/lib/wine-map/map-state-sync.ts
export type SyncMap = {
  style: object | undefined;
  getGlobalState(): Record<string, unknown>;
  setGlobalStateProperty(name: string, value: unknown): unknown;
  getSource(id: string): unknown;
  setFeatureState(target: { source: string; sourceLayer: string; id: string }, state: Record<string, unknown>): unknown;
  removeFeatureState(target: { source: string; sourceLayer: string; id: string }, key?: string): unknown;
  on(type: string, fn: (...a: unknown[]) => void): unknown;
  off(type: string, fn: (...a: unknown[]) => void): unknown;
};
export class MapStateSync {
  constructor(map: SyncMap);
  setDesired(next: { global: DesiredGlobalState; selection: SelectionStates }): void; // then apply()
  apply(): void;                // idempotent, never throws
  dispose(): void;
}

// src/lib/wine-map/handoff.ts
export function latchReady(prev: ReadonlySet<string>, mounted: readonly string[],
  probe: (key: string) => { added: boolean; loaded: boolean; inView: boolean }): string[]; // sorted

// src/lib/wine-map/shard-controller.ts
export type ControllerMap = SyncMap & {
  style: { addSource(id: string, spec: unknown, o: { validate: false }): void;
           addLayer(spec: unknown, before: string | undefined, o: { validate: false }): void;
           setPaintProperty(layer: string, name: string, value: unknown, o: { validate: false }): void;
           setFilter(layer: string, filter: unknown, o: { validate: false }): void } | undefined;
  getLayer(id: string): unknown; removeLayer(id: string): unknown; removeSource(id: string): unknown;
};
export class ShardController {
  constructor(map: ControllerMap, opts: { now?: () => number; raf?: (cb: () => void) => number; cancelRaf?: (h: number) => void; budgetMs?: number });
  setDesired(next: { keys: readonly string[]; urls: Readonly<Record<string, string>>; selectedShard: string | null;
                     inputs: (key: string) => ShardSpecInputs; palette: MapPalette }): void;
  isAdded(key: string): boolean;
  onStyleRebuilt(): void;       // re-add missing, re-apply colours
  reapplyPaint(): void;         // theme/ramp/country changed
  dispose(): void;
}

// src/lib/wine-map/focus.ts
export const COUNTRY_FOCUS_SHARE = 0.6;
export const COUNTRY_RELEASE_SHARE = 0.45;
export function nextFocusCountry(input: {
  chipCountry: string | null; selectedCountry: string | null; countriesInView: readonly string[];
  centreCountry: string | null; shares: Readonly<Record<string, number>>; prev: string | null;
}): string | null;

// src/lib/wine-map/camera-fit.ts
export const CHIP_MIN_ZOOM = 5.5;
export function countryCameraBox(bboxes: readonly Bbox[]): Bbox | null;
export type CameraRequest = { bbox: Bbox; minZoom: number; nonce: number };

// src/lib/wine-map/detail-status.ts
export function detailStatus(input: {
  tree: "loading" | "ready" | "failed"; detail: "one" | "all"; fellBack: boolean;
  focusName: string | null; depthVisible: boolean; otherCountriesInView: boolean;
}): { text: string; retry: boolean };

// src/lib/wine-map/detail-mode.ts
export type DetailMode = "one" | "all";
export const DETAIL_ALL_KEY = "wine-map-all-countries";
export const DETAIL_PENDING_KEY = "wine-map-all-pending";
export function initialDetailMode(read: (key: string) => boolean): { mode: DetailMode; fellBack: boolean };
export function useDetailMode(): { mode: DetailMode; fellBack: boolean; setMode(m: DetailMode): void;
                                   dropToOne(): void; confirmHealthy(): void };

// src/lib/wine-map/country-chips.ts
export type CountryChip = { key: string; label: string; lang: string | undefined; count: number | null };
export function countryChips(roots: readonly WinePlaceTreeNode[], opts: { english: boolean; visibleKeys: readonly string[] | null }): CountryChip[];

// TileWineMap → explorer
export type DetailReport = { focusCountry: string | null; depthCountries: string[]; countriesInView: string[] };
```

---

### Contract changes made while drafting (these supersede the block above)

The tasks below were drafted against the real code and, for Phase 1a and 1c, replayed in a scratch copy of the repo. Where a task's own **Interfaces** block differs from the contracts above, the task's block wins. The phase introductions below restate each phase's additions; Phase 1a's, which has no introduction of its own, are:

**Review Focus, "Tree never arrives".** Replace "Pinned in Task 4 (tree state reducer) and Task 12 (mount policy with empty `shardCountries`)" with "Pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (`shardFilter(null)` keeps full depth) and Task 18 (`mountTarget` with empty `shardCountries`)". Task 12 is the readiness latch. The empty-`shardCountries` pin is `mount-target.test.ts` case 7 in Task 18.

**Skeleton Task 5 requirement.** The script is seven gestures. The selection step becomes two: "a selection via the `onSelect` prop of `france.bourgogne.cote-de-nuits.vosne-romanee` → idle; a second selection of `france.bourgogne.cote-de-nuits.gevrey-chambertin` (same shard, `"map"` source, no camera move) → idle". Add `maplibre-internals.test.ts` (Task 5 Step 5) to the task's files.

**Skeleton Tasks 6, 13, 17 and 24 (main-session checklists).**
- Task 6: the master baseline covers "the same seven gestures".
- Task 13: replace "count reloads per selection (A2) with the probe's reload counter" with this. A2 is read from probe row 6 (the second selection) only. Its `reloadedSources` must be at most `wine-world` plus one or two `wine-shard-*`, and its `reloadsCounted` must be `true`. Row 5 is the visit's first selection. It flips `wm_has_sel` false → true, so it is expected to reload every mounted source (spec §5.2). Do not judge it by A2. Record its worst frame, >50 and long-task columns: G1 ("a tree selection has no long task") is judged on both row 5 and row 6.
- Tasks 17 and 24: they inherit this through "As Task 13" / "As Task 17". Say so explicitly, so row 6 is the A2 reading in every phase.

**Interface Contracts: what Phase 1a actually produces.** Fold these into the skeleton's block. Each is also stated in its task's Interfaces.
- `shard-specs.ts` (Task 1):
  - `classificationExpr` and `areaExpr`, moved from `tile-wine-map.tsx`.
  - `paletteShadeExpression(color: string, palette: MapPalette, ramp: boolean): unknown[]`.
  - `worldRegionColor` is cached per palette.
- `shard-specs.ts` (Task 2): `shardColorsFor(input: { keys: readonly string[]; slugsByShard: Readonly<Record<string, readonly string[]>>; ramp: boolean; palette: MapPalette }): Record<string, ColorExpression>`.
- `fill-palette.ts` (Task 1):
  - adds `visitAreaSlugs(roots, visit)`;
  - keeps `areaSlugsFromTree(roots: readonly WinePlaceTreeNode[]): string[]`, with the same output as today.
- `tile-wine-map.tsx` (Task 2):
  - module-private `buildFillPaint(selectedKey, selectedId, color: ColorExpression, ramp: boolean, hide: unknown[] | null)` and `buildOutlinePaint(color)`;
  - the prop `areaSlugs?: string[]` becomes `areaSlugsByShard?: Record<string, string[]>`.
- `mount-policy.ts` (Task 3):
  - `nextMountStep` sorts with `localeCompare`, and returns `current` itself when a step changes nothing;
  - `MOUNTS_PER_FRAME = 3` is module-private in `tile-wine-map.tsx`.
- `tree-load.ts` (Task 4):
  - adds `TreeLoadEvent`, `INITIAL_TREE_LOAD` and `treeFetchDelay(attempt: number): number`;
  - attempt 0 is the first request, 1 the single automatic retry, 2+ manual retries.
- `map-error-boundary.tsx` (Task 4): `MapUnavailableCard`, `isChunkLoadError`, and `MapErrorBoundary` with props `{ resetKey: number; onRetry: () => void; children: ReactNode }`.
- `perf-stats.ts` (Task 5): the full list in Task 5's Interfaces. It adds, beyond `FrameStats`/`frameStats`:
  - `FrameSample`, `TaskSample`, `deltasBetween`, `trimToWindow`, `longTaskEntryType`;
  - `GestureMetrics`, `gestureMetrics`, `ProbeStep`, `PROBE_SCRIPT` (seven steps), `PROBE_IDLE_TIMEOUT_MS`;
  - `ReloadCountable`, `ReloadCounter` (with `hooked(): boolean`), `installReloadCounter`, `sourcesReloaded`;
  - `IdleWaitable`, `waitForIdle`.
- `perf-probe.tsx` (Task 5): `PerfProbe({ getMap, onSelect })`. Every copied gesture carries `reloadsCounted`.
- File Structure: add `src/lib/wine-map/maplibre-internals.test.ts`. This is the one place a MapLibre upgrade fails loudly. It pins `maplibre-gl` to `5.24.x`, because `package.json` still allows `^5.24.0`, and lists each internal in use. Phases 1b and 1c should add their own lines to its header list, and a check where they can: `style._loaded` (MapStateSync), the dev bundle's chunk markers (bundled-style-engine), and `Style#addLayer`'s add-then-throw order (ShardController). This guard replaces an exact version pin in `package.json`, which no task makes. Pinning there too is the owner's call.


---

## Phase 1a — small colours, staggered mounts, safety net (no visible change)

All code below was written and checked against a copy of the worktree at `cd9acd5` before it went into this plan: every new and touched test file passes, `npx tsc --noEmit` and `npx eslint` are clean after each task, and the full suite then runs 163 files (157 at base + the 6 new test files). The copy has no `supabase/`, `docs/` or `public/`, so 11 base test files that read migrations, email docs or emoji assets could not run there. None of them touches the map. In the worktree all 163 are expected to pass. The parity sweep in Task 1 compares 110,600 (feature, zoom, theme, ramp) colours through MapLibre's own expression engine in ~0.3 s.

Line endings: `tile-wine-map.tsx` and `tile-wine-map-explorer.tsx` are CRLF in the worktree's working copy (`core.autocrlf=true`). Make the edits below with the Edit tool (it matches across line endings); a hand-rolled script doing byte-exact string replacement must normalise `\r\n` first.

Line numbers for `tile-wine-map.tsx` / `tile-wine-map-explorer.tsx` are for the file as it stands when the task starts (Task 2: base `cd9acd5`; Tasks 3-5: after the previous tasks). The old snippets are exact; the line numbers are for orientation.

### Task 1: Per-shard colour expressions (`shard-specs.ts`)

**Files:**
- Create: `src/lib/wine-map/shard-specs.ts`
- Create: `src/lib/wine-map/shard-specs.test.ts`
- Modify: `src/lib/wine-map/fill-palette.ts:28-73` (split `areaSlugsFromTree` into a per-node walk `visitAreaSlugs` plus the same flat list)
- Test: `src/lib/wine-map/shard-specs.test.ts`, `src/lib/wine-map/fill-palette.test.ts` (unchanged, regression)

`tile-wine-map.tsx` is NOT touched here: this task gives the colour builders their new home and proves them against a verbatim copy of today's code; Task 2 switches the map over and deletes the old copies.

**Interfaces:**
- Consumes: `paletteArms(slugs, size)` (`fill-palette.ts`), `classificationShades`, `SHADE_STEPS`, `shiftLightness`, `MAP_PALETTES`, `type MapPalette` (`map-palette.ts`), `shardKeyFor(key): string | null` (`shard.ts`), `type WinePlaceTreeNode` (`tree.ts`).
- Produces (`shard-specs.ts`):
  ```ts
  export type Bbox = [number, number, number, number];
  export type ColorExpression = unknown[] | string;
  export const AREA_PALETTE_ZOOM = 8;
  export const SHADE_TINT_FALLBACK = 2;
  export const classificationExpr: unknown[];              // moved from tile-wine-map.tsx
  export const areaExpr: unknown[];                        // moved from tile-wine-map.tsx
  export function regionHue(region: string, palette: MapPalette): ColorExpression;
  export function worldRegionColor(palette: MapPalette): ColorExpression; // today's REGION_MATCH, cached per palette
  export function paletteShadeExpression(color: string, palette: MapPalette, ramp: boolean): unknown[];
  export function shardColorExpression(input: {
    region: string; areaSlugs: readonly string[]; ramp: boolean; palette: MapPalette;
  }): ColorExpression;
  export function areaSlugsByShard(roots: readonly WinePlaceTreeNode[]): Record<string, string[]>;
  ```
- Produces (`fill-palette.ts`):
  ```ts
  export function visitAreaSlugs(
    roots: readonly WinePlaceTreeNode[],
    visit: (node: WinePlaceTreeNode, slugs: readonly string[]) => void,
  ): void;
  export function areaSlugsFromTree(roots: readonly WinePlaceTreeNode[]): string[]; // same output as today
  ```

- [ ] **Step 1: Write the failing test**

Create `src/lib/wine-map/shard-specs.test.ts`. The oracle block is today's `regionMatchExpression`, `REGION_MATCH`, `classificationExpr`, `areaExpr`, `rampExpression`, `paletteShadeExpression` and `fillColorExpression`, copied verbatim (code, not comments) from `src/app/knowledge/map/tile-wine-map.tsx:185-351` at `cd9acd5`. Do not "tidy" it: it is the definition of today's colours.

```ts
// Per-shard colour expressions must paint every feature exactly the colour the
// old catalogue-wide expression painted it. That is measured here, not argued:
// the old expression is copied below VERBATIM from tile-wine-map.tsx (as it
// stood at cd9acd5) as the oracle, and both are compiled and evaluated by
// MapLibre's own expression engine for every region in both palettes, every
// area slug of a realistic tree, every tint, classification, zoom band, ramp
// state and theme.
import { describe, expect, it } from "vitest";
import {
  createExpression,
  latest,
  type StyleExpression,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Theme } from "../theme";
import { areaSlugsFromTree, paletteArms } from "./fill-palette";
import {
  classificationShades,
  MAP_PALETTES,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";
import * as specs from "./shard-specs";
import type { WinePlaceTreeNode } from "./tree";

// ---- The oracle: tile-wine-map.tsx at cd9acd5, verbatim ----------------------
const AREA_PALETTE_ZOOM = 8;
function regionMatchExpression(palette: MapPalette) {
  return [
    "match",
    ["get", "region"],
    ...Object.entries(palette.regions).flatMap(([key, color]) => [
      key,
      [
        "match",
        ["to-number", ["coalesce", ["get", "tint"], 2]],
        ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
        color,
      ],
    ]),
    palette.fallback,
  ];
}
const REGION_MATCH: Record<Theme, unknown[]> = {
  light: regionMatchExpression(MAP_PALETTES.light),
  dark: regionMatchExpression(MAP_PALETTES.dark),
};
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];
const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}
function paletteShadeExpression(color: string, palette: MapPalette) {
  const shades = classificationShades(color, palette);
  const tinted = [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], 2]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(shades.base, step)]),
    shades.base,
  ];
  return [
    "case",
    ["var", "ramp"],
    [
      "match",
      classificationExpr,
      "grand_cru",
      shades.grand_cru,
      "premier_cru",
      shades.premier_cru,
      tinted,
    ],
    tinted,
  ];
}
function fillColorExpression(areaSlugs: string[], rampedRegions: string[], theme: Theme) {
  const palette = MAP_PALETTES[theme];
  const regionMatch = REGION_MATCH[theme];
  const arms = paletteArms(areaSlugs, palette.districts.length);
  const present = palette.districts.map((_, i) => arms[i].length > 0);
  const paletteIndex = present.some(Boolean)
    ? [
        "match",
        areaExpr,
        ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
        -1,
      ]
    : -1;
  const areaMatch = present.some(Boolean)
    ? [
        "match",
        ["var", "pi"],
        ...palette.districts.flatMap((color, i) =>
          present[i] ? [i, paletteShadeExpression(color, palette)] : [],
        ),
        regionMatch,
      ]
    : regionMatch;
  return [
    "let",
    "pi",
    paletteIndex,
    "ramp",
    rampExpression(rampedRegions),
    ["step", ["zoom"], regionMatch, AREA_PALETTE_ZOOM, areaMatch],
  ] as unknown as string;
}
// ---- end of the oracle -------------------------------------------------------

const FILL_COLOR = latest.paint_fill["fill-color"] as StylePropertySpecification;

/** Compiles through the engine the tile worker runs; throws on a parse error
    exactly as addLayer({validate:false}) would. */
function compile(expression: unknown): StyleExpression {
  const compiled = createExpression(expression, FILL_COLOR);
  if (compiled.result !== "success") {
    throw new Error(compiled.value.map((error) => error.message).join("; "));
  }
  return compiled.value;
}

function colorAt(
  expression: StyleExpression,
  zoom: number,
  properties: Record<string, unknown>,
): string {
  return String(expression.evaluate({ zoom }, { type: 3, properties } as never));
}

function node(
  key: string,
  tier: number,
  children: WinePlaceTreeNode[] = [],
): WinePlaceTreeNode {
  return {
    id: `id-${key}`,
    key,
    name: key.split(".").at(-1) ?? key,
    kind: tier === 0 ? "COUNTRY" : tier === 1 ? "REGION" : "APPELLATION",
    tier,
    parent_key: key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : null,
    has_children: children.length > 0,
    children,
  };
}

// The catalogue's real shapes: Burgundy's district → village → climat depth,
// Champagne's village keyed off the region but parented onto its sub-region,
// Bordeaux districts with appellations beneath, a Tuscan subzone, a region with
// no areas at all (Baden, which the palette does not name either), and a
// VERIFIED place whose parent is unpublished, so the tree makes it a root.
const TREE: WinePlaceTreeNode[] = [
  node("france", 0, [
    node("france.bourgogne", 1, [
      node("france.bourgogne.cote-de-nuits", 2, [
        node("france.bourgogne.cote-de-nuits.gevrey-chambertin", 3, [
          node("france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin", 4),
        ]),
        node("france.bourgogne.cote-de-nuits.vosne-romanee", 3, [
          node("france.bourgogne.cote-de-nuits.vosne-romanee.la-tache", 4),
        ]),
      ]),
      node("france.bourgogne.cote-de-beaune", 2, [
        node("france.bourgogne.cote-de-beaune.meursault", 3),
      ]),
    ]),
    node("france.champagne", 1, [
      node("france.champagne.montagne-de-reims", 2, [node("france.champagne.ay", 4)]),
    ]),
    node("france.bordeaux", 1, [
      node("france.bordeaux.medoc", 2, [
        node("france.bordeaux.medoc.pauillac", 3),
        node("france.bordeaux.medoc.margaux", 3),
      ]),
    ]),
  ]),
  node("germany", 0, [node("germany.baden", 1)]),
  node("italy", 0, [
    node("italy.toscana", 1, [
      node("italy.toscana.chianti", 2, [node("italy.toscana.chianti.chianti-classico", 3)]),
    ]),
  ]),
  node("france.bordeaux.graves.pessac-leognan", 3),
];

const THEMES: Theme[] = ["light", "dark"];
// Every region either palette names, plus Baden, which neither does.
const REGIONS = [
  ...new Set([
    ...Object.keys(MAP_PALETTES.light.regions),
    ...Object.keys(MAP_PALETTES.dark.regions),
    "baden",
  ]),
].sort();
const ALL_SLUGS = areaSlugsFromTree(TREE);
const BY_SHARD = specs.areaSlugsByShard(TREE);
const TINTS: (number | undefined)[] = [0, 1, 2, 3, 4, 5, undefined];
const CLASSES: Record<string, unknown>[] = [
  { classification: "grand_cru" },
  { classification: "premier_cru" },
  { classification: "communal" },
  // Tiles from before `classification` existed carry `level` only.
  { level: "grand_cru" },
  {},
];
const ZOOMS = [5, 7.99, 8, 10, 13];

/** Every feature shape a shard of `region` can carry: no area, an area the
    tree does not know (a newer tile release), and each of the shard's own
    slugs as `area_key` and as a bare `group` (older tiles). */
function featuresFor(region: string): Record<string, unknown>[] {
  const own = BY_SHARD[region] ?? [];
  const areas: Record<string, unknown>[] = [
    {},
    { area_key: "no-such-area" },
    ...own.map((slug) => ({ area_key: slug })),
    ...own.map((slug) => ({ group: slug })),
  ];
  const features: Record<string, unknown>[] = [];
  for (const area of areas) {
    for (const tint of TINTS) {
      for (const cls of CLASSES) {
        features.push({
          region,
          tier: 3,
          ...area,
          ...cls,
          ...(tint === undefined ? {} : { tint }),
        });
      }
    }
  }
  return features;
}

describe("shardColorExpression — parity with the catalogue-wide expression", () => {
  it("paints every feature of every region the same colour, in both themes, ramped or not", () => {
    const mismatches: string[] = [];
    let checks = 0;
    for (const theme of THEMES) {
      for (const ramp of [false, true]) {
        const oracle = compile(fillColorExpression(ALL_SLUGS, ramp ? REGIONS : [], theme));
        for (const region of REGIONS) {
          const shard = compile(
            specs.shardColorExpression({
              region,
              areaSlugs: BY_SHARD[region] ?? [],
              ramp,
              palette: MAP_PALETTES[theme],
            }),
          );
          for (const properties of featuresFor(region)) {
            for (const zoom of ZOOMS) {
              checks += 1;
              const want = colorAt(oracle, zoom, properties);
              const got = colorAt(shard, zoom, properties);
              if (want !== got && mismatches.length < 5) {
                mismatches.push(
                  `${theme} ramp=${ramp} z${zoom} ${JSON.stringify(properties)}: ${want} vs ${got}`,
                );
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    // The sweep really ran: 65 regions x 4 theme/ramp states x 5 zooms x at
    // least 70 feature shapes each.
    expect(checks).toBeGreaterThan(90_000);
  });

  it("keeps a region the palette does not name FLAT, never tint-ramped", () => {
    // Today's region match falls through to the bare fallback for baden and
    // the five other German shards the palette does not name. A tinted
    // fallback would make those regions change colour at the world→shard
    // handoff.
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      expect(specs.regionHue("baden", palette)).toBe(palette.fallback);
      expect(specs.regionHue("constructor", palette)).toBe(palette.fallback);
      expect(specs.regionHue("bourgogne", palette)).toEqual([
        "match",
        ["to-number", ["coalesce", ["get", "tint"], specs.SHADE_TINT_FALLBACK]],
        ...SHADE_STEPS.flatMap((step, i) => [
          i,
          shiftLightness(palette.regions.bourgogne, step),
        ]),
        palette.regions.bourgogne,
      ]);
    }
  });

  it("is the region hue alone for a shard with no area slugs, and it compiles", () => {
    // baden, franken, navarra, wuerttemberg and saale-unstrut carry only their
    // region polygon; every shard is in this state before the tree loads. An
    // arm-less `match` would not compile (and under validate:false it throws).
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      for (const region of ["baden", "navarra"]) {
        const expression = specs.shardColorExpression({
          region,
          areaSlugs: [],
          ramp: true,
          palette,
        });
        expect(expression).toEqual(specs.regionHue(region, palette));
        expect(() => compile(expression)).not.toThrow();
      }
    }
  });

  it("never carries `undefined` (JSON round-trips unchanged)", () => {
    for (const region of REGIONS) {
      const expression = specs.shardColorExpression({
        region,
        areaSlugs: BY_SHARD[region] ?? [],
        ramp: true,
        palette: MAP_PALETTES.dark,
      });
      expect(JSON.parse(JSON.stringify(expression))).toEqual(expression);
    }
  });
});

describe("worldRegionColor", () => {
  it("is today's REGION_MATCH, byte for byte, and the same object on every call", () => {
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      expect(specs.worldRegionColor(palette)).toEqual(REGION_MATCH[theme]);
      expect(specs.worldRegionColor(palette)).toBe(specs.worldRegionColor(palette));
    }
  });

  it("paints world features exactly as the catalogue-wide expression did", () => {
    // The world archive carries countries (tier 0) and regions (tier 1), never
    // an area_key or group; tier-1 classification is null or "regional", so
    // neither the area palette nor the ramp ever applied there.
    const mismatches: string[] = [];
    for (const theme of THEMES) {
      const oracle = compile(fillColorExpression(ALL_SLUGS, REGIONS, theme));
      const world = compile(specs.worldRegionColor(MAP_PALETTES[theme]));
      for (const region of REGIONS) {
        for (const tier of [0, 1]) {
          for (const tint of TINTS) {
            for (const cls of [{}, { classification: "regional" }]) {
              const properties = {
                region,
                tier,
                ...cls,
                ...(tint === undefined ? {} : { tint }),
              };
              for (const zoom of ZOOMS) {
                if (colorAt(oracle, zoom, properties) !== colorAt(world, zoom, properties)) {
                  mismatches.push(`${theme} z${zoom} ${JSON.stringify(properties)}`);
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("areaSlugsByShard", () => {
  it("buckets every slug under the shard its place routes to", () => {
    expect(BY_SHARD.bourgogne).toEqual([
      "cote-de-beaune",
      "cote-de-nuits",
      "gevrey-chambertin",
      "meursault",
      "vosne-romanee",
    ]);
    // Aÿ is keyed off the region (group "ay") but parented onto its
    // sub-region, whose slug is its area.
    expect(BY_SHARD.champagne).toEqual(["ay", "montagne-de-reims"]);
    // The orphan root still lands in its own shard's bucket.
    expect(BY_SHARD.bordeaux).toEqual(["graves", "margaux", "medoc", "pauillac", "pessac-leognan"]);
    expect(BY_SHARD.toscana).toEqual(["chianti", "chianti-classico"]);
    // No areas, no entry: the map treats a missing shard as "no slugs".
    expect(BY_SHARD.baden).toBeUndefined();
  });

  it("loses nothing: the union of the buckets is areaSlugsFromTree", () => {
    const union = [...new Set(Object.values(BY_SHARD).flat())].sort();
    expect(union).toEqual(areaSlugsFromTree(TREE));
  });

  it("is empty for an empty tree", () => {
    expect(specs.areaSlugsByShard([])).toEqual({});
  });
});

describe("shard colour expression size", () => {
  // A realistic Bourgogne: its six districts, the Hautes-Côtes and 47 village
  // appellations, each its own area slug — the largest area list of any shard.
  const VILLAGES: Record<string, string[]> = {
    "cote-de-nuits": [
      "marsannay", "fixin", "gevrey-chambertin", "morey-saint-denis",
      "chambolle-musigny", "vougeot", "flagey-echezeaux", "vosne-romanee",
      "nuits-saint-georges", "hautes-cotes-de-nuits",
    ],
    "cote-de-beaune": [
      "ladoix", "aloxe-corton", "pernand-vergelesses", "savigny-les-beaune",
      "chorey-les-beaune", "beaune", "pommard", "volnay", "monthelie",
      "auxey-duresses", "meursault", "saint-romain", "puligny-montrachet",
      "chassagne-montrachet", "saint-aubin", "santenay", "maranges",
      "hautes-cotes-de-beaune",
    ],
    chablis: ["chablis", "petit-chablis"],
    "cote-chalonnaise": ["bouzeron", "rully", "mercurey", "givry", "montagny"],
    maconnais: [
      "pouilly-fuisse", "pouilly-vinzelles", "pouilly-loche", "saint-veran",
      "vire-clesse", "macon",
    ],
    "grand-auxerrois": [
      "irancy", "saint-bris", "chitry", "coulanges-la-vineuse", "epineuil",
      "tonnerre", "vezelay",
    ],
  };
  const BOURGOGNE = [
    node("france", 0, [
      node(
        "france.bourgogne",
        1,
        Object.entries(VILLAGES).map(([district, villages]) =>
          node(
            `france.bourgogne.${district}`,
            2,
            villages.map((village) => node(`france.bourgogne.${district}.${village}`, 3)),
          ),
        ),
      ),
    ]),
  ];

  it("stays under 8 KB for the largest shard, ramped, in both themes", () => {
    const slugs = specs.areaSlugsByShard(BOURGOGNE).bourgogne;
    expect(slugs.length).toBeGreaterThanOrEqual(50);
    for (const theme of THEMES) {
      const expression = specs.shardColorExpression({
        region: "bourgogne",
        areaSlugs: slugs,
        ramp: true,
        palette: MAP_PALETTES[theme],
      });
      expect(JSON.stringify(expression).length).toBeLessThan(8 * 1024);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/wine-map/shard-specs.test.ts`
Expected: FAIL — `Error: Cannot find module './shard-specs' imported from '…/src/lib/wine-map/shard-specs.test.ts'` (the whole file fails to load; 0 tests run).

- [ ] **Step 3: Split `areaSlugsFromTree` into a per-node walk**

`areaSlugsByShard` needs each node's own contribution (to bucket it by the node's shard), not one flat list. The derivation is unchanged; `areaSlugsFromTree` becomes a fold over the walk, so `fill-palette.test.ts` keeps pinning it.

In `src/lib/wine-map/fill-palette.ts`, replace:

```ts
/** Every value the `area_key` and `group` tile properties can take, derived
    from the place tree exactly the way scripts/wine-map-tiles/export.mjs
    derives them for the tiles:
    - `group` is the third canonical-key segment (a region's top areas — medoc,
      graves, cote-de-nuits), present on every key of three or more segments.
    - `area_key` is the last segment of the place's AREA: for a tier >= 2 place,
      its nearest tier-3 ancestor-or-self (a Burgundy village, so climats
      inherit the village hue), else its tier-2 ancestor-or-self (a district,
      or a Champagne sub-region, whose villages hang off the region by key but
      parent onto the sub-region — hence the walk is by parent, never by key
      segment); a place with neither falls back to its `group`.
    Both are collected, since the map's area expression coalesces `area_key`
    then `group` (tiles from before `area_key` existed carry only the latter).
    Sorted and de-duplicated, so an unchanged tree yields an equal list. */
export function areaSlugsFromTree(roots: WinePlaceTreeNode[]): string[] {
  const slugs = new Set<string>();
  // Explicit stack (node + its ancestor chain, nearest first) rather than
  // recursion: the tree has a few thousand nodes and the chain is what the
  // area walk reads.
  const stack: { node: WinePlaceTreeNode; lineage: WinePlaceTreeNode[] }[] =
    roots.map((node) => ({ node, lineage: [] }));
  while (stack.length > 0) {
    const { node, lineage } = stack.pop()!;
    const segments = node.key.split(".");
    const group = segments.length >= 3 ? segments[2] : null;
    let area: WinePlaceTreeNode | null = null;
    if (node.tier >= 2) {
      let tier2: WinePlaceTreeNode | null = null;
      for (const cursor of [node, ...lineage]) {
        if (cursor.tier === 3) {
          area = cursor;
          break;
        }
        if (cursor.tier === 2) tier2 = cursor;
        if (cursor.tier < 2) break;
      }
      area ??= tier2;
    }
    const areaKey = area ? lastSegment(area.key) : group;
    if (areaKey) slugs.add(areaKey);
    if (group) slugs.add(group);
    const childLineage = [node, ...lineage];
    for (const child of node.children) stack.push({ node: child, lineage: childLineage });
  }
  return [...slugs].sort();
}
```

with:

```ts
/** Walks the place tree and hands `visit` each node's OWN contribution to the
    `area_key` and `group` tile properties, derived exactly the way
    scripts/wine-map-tiles/export.mjs derives them for the tiles:
    - `group` is the third canonical-key segment (a region's top areas — medoc,
      graves, cote-de-nuits), present on every key of three or more segments.
    - `area_key` is the last segment of the place's AREA: for a tier >= 2 place,
      its nearest tier-3 ancestor-or-self (a Burgundy village, so climats
      inherit the village hue), else its tier-2 ancestor-or-self (a district,
      or a Champagne sub-region, whose villages hang off the region by key but
      parent onto the sub-region — hence the walk is by parent, never by key
      segment); a place with neither falls back to its `group`.
    Per node rather than one flat list so a caller can bucket the slugs by the
    shard that carries the node (shard-specs' areaSlugsByShard). A node with
    neither value (a country, a region) is visited with an empty list. */
export function visitAreaSlugs(
  roots: readonly WinePlaceTreeNode[],
  visit: (node: WinePlaceTreeNode, slugs: readonly string[]) => void,
): void {
  // Explicit stack (node + its ancestor chain, nearest first) rather than
  // recursion: the tree has a few thousand nodes and the chain is what the
  // area walk reads.
  const stack: { node: WinePlaceTreeNode; lineage: WinePlaceTreeNode[] }[] =
    roots.map((node) => ({ node, lineage: [] }));
  while (stack.length > 0) {
    const { node, lineage } = stack.pop()!;
    const segments = node.key.split(".");
    const group = segments.length >= 3 ? segments[2] : null;
    let area: WinePlaceTreeNode | null = null;
    if (node.tier >= 2) {
      let tier2: WinePlaceTreeNode | null = null;
      for (const cursor of [node, ...lineage]) {
        if (cursor.tier === 3) {
          area = cursor;
          break;
        }
        if (cursor.tier === 2) tier2 = cursor;
        if (cursor.tier < 2) break;
      }
      area ??= tier2;
    }
    const areaKey = area ? lastSegment(area.key) : group;
    const own: string[] = [];
    if (areaKey) own.push(areaKey);
    if (group && group !== areaKey) own.push(group);
    visit(node, own);
    const childLineage = [node, ...lineage];
    for (const child of node.children) stack.push({ node: child, lineage: childLineage });
  }
}

/** Every value the `area_key` and `group` tile properties can take (see
    visitAreaSlugs for how each is derived). Both are collected, since the
    map's area expression coalesces `area_key` then `group` (tiles from before
    `area_key` existed carry only the latter). Sorted and de-duplicated, so an
    unchanged tree yields an equal list. */
export function areaSlugsFromTree(roots: readonly WinePlaceTreeNode[]): string[] {
  const slugs = new Set<string>();
  visitAreaSlugs(roots, (_node, own) => {
    for (const slug of own) slugs.add(slug);
  });
  return [...slugs].sort();
}
```

- [ ] **Step 4: Create `shard-specs.ts`**

```ts
// The wine map's colour expressions, built per region shard.
//
// Every live tile feature's `region` property equals the key of the shard
// that carries it (shard = canonical_key segment 1, scripts/wine-map-tiles
// lib.mjs shardKeyFor), so a shard's fill and outline colour never needs the
// other regions' hues or any other region's area slugs. The one catalogue-wide
// expression every shard layer used to share — a 934-slug palette `match` plus
// the full region `match` twice — was ~38 KB, and MapLibre's addLayer
// serializes the WHOLE style to validate each add, so that size was paid again
// for every layer already mounted: the first-zoom freeze (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §1). Built from the shard's own region and slugs, the same colours come out
// of an expression of ~2 KB (7 KB at most), byte-identical per feature —
// shard-specs.test.ts proves it against the old expression through MapLibre's
// own engine.
//
// Pure: no maplibre value import (type-only at most), so vitest evaluates these
// expressions through @maplibre/maplibre-gl-style-spec directly.
import type { WinePlaceTreeNode } from "./tree";
import { paletteArms, visitAreaSlugs } from "./fill-palette";
import {
  classificationShades,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";
import { shardKeyFor } from "./shard";

/** [west, south, east, north], as the manifest and the place context carry it. */
export type Bbox = [number, number, number, number];

/** A MapLibre colour value: a data-driven expression or a plain colour. */
export type ColorExpression = unknown[] | string;

/** Zoom at which the fill colour steps from the region hue to the per-area /
    classification palette. The legend keys off the same number so it never
    advertises colours the map is not painting yet. */
export const AREA_PALETTE_ZOOM = 8;

/** The `tint` a feature without one reads as — the middle of the 0..5 ramp,
    as the tiles have always been coloured. */
export const SHADE_TINT_FALLBACK = 2;

/** Classification source: the `classification` tile property (appellation
    level, or Champagne's échelle village rating), falling back to `level` for
    tiles from before the property existed. It drives the fill-intensity ramp —
    stronger, more saturated shades of the area hue for higher classifications
    (darker in light, brighter in dark) — leaving gold reserved for selection. */
export const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];

/** Hue-grouping unit: village-level in Burgundy, sub-region in Champagne (the
    `area_key` tile property), falling back to the district group for tiles
    from before the property existed. */
export const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];

// One colour spread across the tint ramp. At vineyard zoom a dozen
// neighbouring sites in one hue read as a single block; each place carries a
// stable `tint` (0..5, hashed from its key in the tile build), and the ramp
// separates neighbours while the family still reads as one.
function tintRamp(color: string): unknown[] {
  return [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], SHADE_TINT_FALLBACK]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
    color,
  ];
}

/** One region's own hue arm: its palette colour across the tint ramp, or the
    palette's fallback FLAT when the palette does not name the region. Flat is
    today's behaviour for baden, franken, rheingau, wuerttemberg, saale-unstrut
    and hessische-bergstrasse — tinting it would make those regions jump from
    flat (world copy) to tinted (shard copy) at the handoff. */
export function regionHue(region: string, palette: MapPalette): ColorExpression {
  // Own properties only: the table is a plain object literal, so a lookup of
  // "constructor" would otherwise find Object.prototype's.
  return Object.prototype.hasOwnProperty.call(palette.regions, region)
    ? tintRamp(palette.regions[region])
    : palette.fallback;
}

// Built once per palette object and handed back by reference, so a theme flip
// is the only thing that changes what the world layers read.
const worldColors = new WeakMap<MapPalette, ColorExpression>();

/** The world archive's region colour: every region's hue arm, keyed by the
    feature's `region`. World features carry no `area_key`/`group` (72 live
    features checked, tier 0 and 1 only), so the area palette never applied
    there and this is the whole of what they paint. */
export function worldRegionColor(palette: MapPalette): ColorExpression {
  let expression = worldColors.get(palette);
  if (!expression) {
    expression = [
      "match",
      ["get", "region"],
      ...Object.entries(palette.regions).flatMap(([key, color]) => [
        key,
        tintRamp(color),
      ]),
      palette.fallback,
    ];
    worldColors.set(palette, expression);
  }
  return expression;
}

/** The shade family of one palette colour: where the shard's region is on the
    classification ramp, grand cru strongest (darkest in light, brightest in
    dark), premier cru mid, everything else across the tint ramp; otherwise the
    tint ramp alone. `ramp` is a per-shard constant, so this is one family or
    the other — never the old per-feature `case` on a `ramp` variable. */
export function paletteShadeExpression(
  color: string,
  palette: MapPalette,
  ramp: boolean,
): unknown[] {
  const shades = classificationShades(color, palette);
  // Within an area, sites that share a classification would otherwise render
  // in one identical colour; the tint ramp separates them. Cru shades stay
  // exact, because there intensity carries real meaning.
  const tinted = tintRamp(shades.base);
  return ramp
    ? [
        "match",
        classificationExpr,
        "grand_cru",
        shades.grand_cru,
        "premier_cru",
        shades.premier_cru,
        tinted,
      ]
    : tinted;
}

/** One shard's fill and outline colour. Below AREA_PALETTE_ZOOM every feature
    is its region hue; from there each area (Burgundy village, Champagne
    sub-region, Bordeaux district) gets its palette colour — a `match` from slug
    to palette index with one arm per colour, then from index to that colour's
    shade family — and a slug the list does not know (a tile release newer than
    the loaded tree) keeps the region hue. A shard with no area slugs at all
    (baden, franken, navarra, wuerttemberg and saale-unstrut carry only their
    region polygon, and every shard before the tree has loaded) is its region
    hue at every zoom: an arm-less `match` would not compile, and under
    validate:false it would throw rather than be dropped. */
export function shardColorExpression(input: {
  region: string;
  areaSlugs: readonly string[];
  ramp: boolean;
  palette: MapPalette;
}): ColorExpression {
  const { region, areaSlugs, ramp, palette } = input;
  const hue = regionHue(region, palette);
  const arms = paletteArms(areaSlugs, palette.districts.length);
  if (!arms.some((slugs) => slugs.length > 0)) return hue;
  const paletteIndex = [
    "match",
    areaExpr,
    ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
    -1,
  ];
  const areaMatch = [
    "match",
    ["var", "pi"],
    ...palette.districts.flatMap((color, i) =>
      arms[i].length ? [i, paletteShadeExpression(color, palette, ramp)] : [],
    ),
    hue,
  ];
  // The zoom step must stay the top-level expression (a `let` around it is
  // fine — MapLibre looks through `let` for the zoom curve).
  return [
    "let",
    "pi",
    paletteIndex,
    ["step", ["zoom"], hue, AREA_PALETTE_ZOOM, areaMatch],
  ];
}

/** Every shard's own area slugs: each node's area_key/group contribution,
    bucketed by the shard its canonical key routes to (shardKeyFor, which
    mirrors scripts/wine-map-tiles/lib.mjs) — not by walking each region's
    subtree, which would drop a place whose parent is unpublished (the tree
    makes it a root). The union of the buckets is exactly areaSlugsFromTree.
    Each list is sorted and de-duplicated; shards with no slugs are absent. */
export function areaSlugsByShard(
  roots: readonly WinePlaceTreeNode[],
): Record<string, string[]> {
  const buckets = new Map<string, Set<string>>();
  visitAreaSlugs(roots, (node, own) => {
    if (own.length === 0) return;
    const shard = shardKeyFor(node.key);
    if (!shard) return;
    let bucket = buckets.get(shard);
    if (!bucket) buckets.set(shard, (bucket = new Set()));
    for (const slug of own) bucket.add(slug);
  });
  // Object.fromEntries defines own properties, so no shard key can land on
  // the prototype.
  return Object.fromEntries(
    [...buckets.entries()].map(([shard, slugs]) => [shard, [...slugs].sort()]),
  );
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/wine-map/shard-specs.test.ts src/lib/wine-map/fill-palette.test.ts`
Expected: PASS — `shard-specs.test.ts` 10 tests, `fill-palette.test.ts` 11 tests (unchanged). If the parity test reports mismatches, the first five are listed with theme, ramp, zoom and feature properties — fix the builder, never the oracle.

- [ ] **Step 6: Types and lint**

Run: `npx tsc --noEmit` — expected: no output, exit 0.
Run: `npx eslint src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs.test.ts src/lib/wine-map/fill-palette.ts` — expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs.test.ts src/lib/wine-map/fill-palette.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): per-shard colour expressions in shard-specs" -m "Each region shard's fill/outline colour built from its own region hue and area slugs (~2 KB, 7 KB max) instead of the ~38 KB catalogue-wide expression. Parity with today's expression is proven through MapLibre's expression engine for every region, slug, tint, classification, zoom band, ramp state and theme; an unpaletted region's hue stays flat." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Wire per-shard colours into `TileWineMap`

**Files:**
- Modify: `src/lib/wine-map/shard-specs.ts` (append `shardColorsFor`)
- Modify: `src/lib/wine-map/shard-specs.test.ts` (append a `describe`)
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` — imports `17-20`, `37-44`; `148-151` (`AREA_PALETTE_ZOOM`), `170-172` (`NO_SLUGS`), `185-224` (`REGION_MATCH`, `classificationExpr`), `236-352` (`areaExpr` … `fillColorExpression`), `353-363` and `382-387` (`buildFillPaint`), `521` and `542-546` (props), `1161-1219` (colour/paint memos), `1692-1702` (shard layer paint)
- Modify: `src/app/knowledge/map/tile-wine-map-explorer.tsx` — `50`, `220-224`, `658`

**Interfaces:**
- Consumes (Task 1): `AREA_PALETTE_ZOOM`, `classificationExpr`, `worldRegionColor`, `shardColorExpression`, `regionHue`, `areaSlugsByShard`, `type ColorExpression`.
- Produces:
  ```ts
  // shard-specs.ts
  export function shardColorsFor(input: {
    keys: readonly string[];
    slugsByShard: Readonly<Record<string, readonly string[]>>;
    ramp: boolean;
    palette: MapPalette;
  }): Record<string, ColorExpression>;
  // tile-wine-map.tsx (module-private)
  function buildFillPaint(selectedKey: string | null, selectedId: string | null,
    color: ColorExpression, ramp: boolean, hide: unknown[] | null): { "fill-antialias": false; "fill-color": string; "fill-opacity": number };
  function buildOutlinePaint(color: ColorExpression): { "line-color": string; "line-width": number };
  // TileWineMap prop: `areaSlugs?: string[]` is replaced by
  areaSlugsByShard?: Record<string, string[]>;
  ```

- [ ] **Step 1: Write the failing test**

Append to `src/lib/wine-map/shard-specs.test.ts` (it reuses the file's `compile`, `colorAt`, `THEMES`, `REGIONS`, `TINTS`, `ZOOMS` and `BY_SHARD`):

```ts
describe("shardColorsFor — the map's per-shard colour table", () => {
  it("builds each shard from its own slugs, and a shard with none from its region hue", () => {
    const palette = MAP_PALETTES.light;
    const table = specs.shardColorsFor({
      keys: ["bourgogne", "baden", "loire"],
      slugsByShard: BY_SHARD,
      ramp: false,
      palette,
    });
    expect(Object.keys(table)).toEqual(["bourgogne", "baden", "loire"]);
    expect(table.bourgogne).toEqual(
      specs.shardColorExpression({
        region: "bourgogne",
        areaSlugs: BY_SHARD.bourgogne,
        ramp: false,
        palette,
      }),
    );
    // Not in the tree fixture: no areas, region hue at every zoom.
    expect(table.loire).toEqual(specs.regionHue("loire", palette));
    expect(table.baden).toBe(palette.fallback);
  });

  it("applies the ramp to every key it is given", () => {
    const palette = MAP_PALETTES.dark;
    const ramped = specs.shardColorsFor({
      keys: ["bourgogne"],
      slugsByShard: BY_SHARD,
      ramp: true,
      palette,
    });
    const plain = specs.shardColorsFor({
      keys: ["bourgogne"],
      slugsByShard: BY_SHARD,
      ramp: false,
      palette,
    });
    expect(JSON.stringify(ramped.bourgogne)).toContain('"grand_cru"');
    expect(JSON.stringify(plain.bourgogne)).not.toContain('"grand_cru"');
  });

  it("keeps odd keys as own entries and never reads a slug list off the prototype", () => {
    const table = specs.shardColorsFor({
      keys: ["constructor"],
      slugsByShard: BY_SHARD,
      ramp: true,
      palette: MAP_PALETTES.light,
    });
    expect(Object.prototype.hasOwnProperty.call(table, "constructor")).toBe(true);
    expect(table.constructor).toBe(MAP_PALETTES.light.fallback);
  });

  it("keeps the world→shard handoff invisible: a region paints the same from either archive", () => {
    // The world region layers now read worldRegionColor while each shard reads
    // its own expression. A region polygon (tier 1, no area) must come out the
    // same colour from both, at every zoom and tint, or the region would
    // change colour the moment its shard loads.
    const mismatches: string[] = [];
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      const world = compile(specs.worldRegionColor(palette));
      for (const ramp of [false, true]) {
        const table = specs.shardColorsFor({ keys: REGIONS, slugsByShard: BY_SHARD, ramp, palette });
        for (const region of REGIONS) {
          const shard = compile(table[region]);
          for (const tint of TINTS) {
            const properties = { region, tier: 1, ...(tint === undefined ? {} : { tint }) };
            for (const zoom of ZOOMS) {
              if (colorAt(world, zoom, properties) !== colorAt(shard, zoom, properties)) {
                mismatches.push(`${theme} ramp=${ramp} z${zoom} ${JSON.stringify(properties)}`);
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/wine-map/shard-specs.test.ts`
Expected: FAIL — the four new tests fail with `TypeError: specs.shardColorsFor is not a function`; the ten Task 1 tests still pass.

- [ ] **Step 3: Add `shardColorsFor`**

Append to `src/lib/wine-map/shard-specs.ts`:

```ts
/** Each named shard's colour expression, keyed by shard. `slugsByShard` is
    areaSlugsByShard's output — a shard it does not name has no areas (yet),
    and paints its region hue. `ramp` applies to every key given: the map calls
    this once for the plain shards and once for the ramped ones, so a region
    joining the ramp latch rebuilds only its own entry and every other shard
    keeps the very same expression object. */
export function shardColorsFor(input: {
  keys: readonly string[];
  slugsByShard: Readonly<Record<string, readonly string[]>>;
  ramp: boolean;
  palette: MapPalette;
}): Record<string, ColorExpression> {
  const { keys, slugsByShard, ramp, palette } = input;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      shardColorExpression({
        region: key,
        // Own properties only, as in regionHue.
        areaSlugs: Object.prototype.hasOwnProperty.call(slugsByShard, key)
          ? slugsByShard[key]
          : [],
        ramp,
        palette,
      }),
    ]),
  );
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/wine-map/shard-specs.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Switch `TileWineMap` to the per-shard colours**

All edits in `src/app/knowledge/map/tile-wine-map.tsx`.

(a) Imports, lines 17-20. Replace:

```tsx
import {
  latchRampedRegions,
  paletteArms,
} from "@/lib/wine-map/fill-palette";
```

with:

```tsx
import { latchRampedRegions } from "@/lib/wine-map/fill-palette";
import {
  AREA_PALETTE_ZOOM,
  classificationExpr,
  shardColorsFor,
  worldRegionColor,
  type ColorExpression,
} from "@/lib/wine-map/shard-specs";
```

(b) Imports, lines 37-44. Replace:

```tsx
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "@/lib/wine-map/map-palette";
```

with:

```tsx
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
  type MapPalette,
} from "@/lib/wine-map/map-palette";
```

(c) Lines 148-151: delete the local constant (it now comes from `shard-specs`). Replace:

```tsx
// Zoom at which fillColorExpression steps from the region hue to the per-area /
// classification palette. The legend keys off the same number so it never
// advertises colours the map is not painting yet.
const AREA_PALETTE_ZOOM = 8;

// Below this zoom no region shard is mounted.
```

with:

```tsx
// Below this zoom no region shard is mounted.
```

(d) Lines 170-172. Replace:

```tsx
// Default for the areaSlugs prop. A module constant, not a `= []` default:
// a fresh array per render would re-key every memo below it on every render.
const NO_SLUGS: string[] = [];
```

with:

```tsx
// Default for the areaSlugsByShard prop. A module constant, not a `= {}`
// default: a fresh object per render would re-key every memo below it on
// every render.
const NO_SLUGS_BY_SHARD: Record<string, string[]> = {};
```

(e) Lines 185-224: delete `regionMatchExpression`, `REGION_MATCH` and the local `classificationExpr`. Replace:

```tsx
// Region hue spread across the tint ramp. Built ONCE per palette at module
// load, never per render: a theme flip swaps which table the paint reads, and
// that is the only time the reference changes.
function regionMatchExpression(palette: MapPalette) {
  return [
    "match",
    ["get", "region"],
    ...Object.entries(palette.regions).flatMap(([key, color]) => [
      key,
      [
        "match",
        ["to-number", ["coalesce", ["get", "tint"], 2]],
        ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
        color,
      ],
    ]),
    palette.fallback,
  ];
}
const REGION_MATCH: Record<Theme, unknown[]> = {
  light: regionMatchExpression(MAP_PALETTES.light),
  dark: regionMatchExpression(MAP_PALETTES.dark),
};

// Classification source: the `classification` tile property (appellation
// level, or Champagne's échelle village rating), falling back to `level`
// for tiles from before the property existed. It drives the fill-intensity
// ramp — stronger, more saturated shades of the area hue for higher
// classifications (darker in light, brighter in dark) — leaving gold reserved
// for selection alone.
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];

// The no-filter state for layers whose filter is sometimes absent. MapLibre
```

with:

```tsx
// The no-filter state for layers whose filter is sometimes absent. MapLibre
```

(f) Lines 236-352: delete `areaExpr`, `rampExpression`, `paletteShadeExpression` and `fillColorExpression`, and add the shared outline paint builder. Replace:

```tsx
// District hues (districtColor), their classification shades and the tint ramp
// live in lib/wine-map/map-palette, one fixed table per theme, keyed by the
// same slug hash so the fill expression's palette arms and the legend swatches
// cannot drift apart.

// Hue-grouping unit: village-level in Burgundy, sub-region in Champagne
// (the `area_key` tile property), falling back to the district group for
// tiles from before the property existed.
const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];

// Selection no longer recolours the shape — places keep their true palette
// colour and selection reads as a gold outline ring drawn above everything
// (plus a slight opacity lift in fillPaint). The world layers' region colour is
// REGION_MATCH[paintTheme], read inside the component.

// "Is this feature's region one where the classification ramp applies?" —
// bound as the `ramp` variable of the fill-colour and fill-opacity `let`s.
// The ramp is RELATIVE: it only applies where at least two classification
// levels exist — an all-grand-cru region like Alsace has nothing to be darker
// THAN, so its vineyards keep the plain area hue (owner: "darkest doesn't make
// sense there"). Which regions qualify is discovered once per session by the
// idle-time scan (latchRampedRegions), not re-decided per viewport.
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}

// The shade family of one palette colour, evaluated against the feature:
// grand cru strongest (darkest in light, brightest in dark), premier cru mid,
// everything else spread across the tint ramp — but only where `ramp` holds;
// otherwise the tint ramp alone.
function paletteShadeExpression(color: string, palette: MapPalette) {
  const shades = classificationShades(color, palette);
  // Within an area, sites that share a classification used to render in
  // one identical colour — a whole Großlage of Einzellagen as a single
  // brown mass, with no way to see where one ends and the next begins.
  // Spread them across a lightness ramp of the area's own hue using the
  // stable per-place `tint`, so neighbours separate while the area still
  // reads as one group. This is the plain/village case only: the cru
  // shades stay exact, because there intensity carries real meaning.
  const tinted = [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], 2]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(shades.base, step)]),
    shades.base,
  ];
  return [
    "case",
    ["var", "ramp"],
    [
      "match",
      classificationExpr,
      "grand_cru",
      shades.grand_cru,
      "premier_cru",
      shades.premier_cru,
      tinted,
    ],
    tinted,
  ];
}

// Camera ("zoom") expressions must sit at the top level of a paint property
// (a `let` around it is fine — MapLibre looks through `let` for the zoom
// curve), so the zoom step wraps the selection cases rather than the reverse.
//
// `areaSlugs` is the WHOLE catalogue (every `area_key`/`group` value the tiles
// can carry, derived from the place tree by areaSlugsFromTree), not the areas
// scanned so far: the table is built once and the expression never changes
// for the session except for a region joining the ramp. Two levels keep it
// small — a `match` from slug to palette index with one arm per palette
// colour (MapLibre lets an arm carry a list of labels), then a `match` from
// index to that colour's shade family — instead of one arm per slug with its
// own copy of the shade family, which is what made the old table's size a
// problem (and forced a cap on it).
// `theme` picks one of the two fixed tables — both keyed alike, so the arms
// are the same and only the colours differ; a theme flip is the only other
// thing that rebuilds this.
function fillColorExpression(areaSlugs: string[], rampedRegions: string[], theme: Theme) {
  // From z8 every area (Burgundy village, Champagne sub-region, Bordeaux
  // district) gets its own hue, and WITHIN the hue classification reads as
  // intensity: grand cru strongest, premier cru mid, village land plain.
  // Region hue covers a slug the catalogue does not know (a tile release
  // newer than the loaded tree) exactly as it covered unscanned areas before.
  const palette = MAP_PALETTES[theme];
  const regionMatch = REGION_MATCH[theme];
  const arms = paletteArms(areaSlugs, palette.districts.length);
  const present = palette.districts.map((_, i) => arms[i].length > 0);
  const paletteIndex = present.some(Boolean)
    ? [
        "match",
        areaExpr,
        ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
        -1,
      ]
    : -1;
  const areaMatch = present.some(Boolean)
    ? [
        "match",
        ["var", "pi"],
        ...palette.districts.flatMap((color, i) =>
          present[i] ? [i, paletteShadeExpression(color, palette)] : [],
        ),
        regionMatch,
      ]
    : regionMatch;
  return [
    "let",
    "pi",
    paletteIndex,
    "ramp",
    rampExpression(rampedRegions),
    ["step", ["zoom"], regionMatch, AREA_PALETTE_ZOOM, areaMatch],
  ] as unknown as string;
}
```

with:

```tsx
// Every colour a wine polygon paints comes from lib/wine-map/shard-specs:
// shardColorExpression per region shard (that shard's own region hue and area
// slugs, with the classification ramp as a per-shard constant) and
// worldRegionColor for the world archive. District hues, their classification
// shades and the tint ramp live in lib/wine-map/map-palette, one fixed table
// per theme, keyed by the same slug hash so the fill expression's palette arms
// and the legend swatches cannot drift apart.
//
// Selection does not recolour a shape — places keep their true palette colour
// and selection reads as a gold outline ring drawn above everything (plus a
// slight opacity lift in the fill paint).
//
// The ramp is RELATIVE: it only applies where at least two classification
// levels exist — an all-grand-cru region like Alsace has nothing to be darker
// THAN, so its vineyards keep the plain area hue (owner: "darkest doesn't make
// sense there"). Which regions qualify is discovered once per session by the
// idle-time scan (latchRampedRegions), not re-decided per viewport.

// Shared by the shard outlines and the world archive's region outlines, so a
// region drawn from either source is pixel-identical. Outlines follow the fill
// palette (classification colours at village zoom) so deep levels aren't ringed
// in the region hue.
function buildOutlinePaint(color: ColorExpression) {
  return {
    "line-color": color as unknown as string,
    "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
  };
}
```

(g) `buildFillPaint`, lines 353-363. Replace:

```tsx
// The fill paint every wine polygon layer shares. `hide` is the world archive's
// handed-off multiplier (WORLD_HANDED_FACTOR) or null for a shard layer; it has
// to be folded into each zoom stop's output, because the zoom interpolation
// must stay the top-level expression.
function buildFillPaint(
  selectedKey: string | null,
  selectedId: string | null,
  areaColor: string,
  rampedRegions: string[],
  hide: unknown[] | null,
) {
```

with:

```tsx
// The fill paint every wine polygon layer shares. `color` is that layer's
// colour (one shard's own expression, or the world archive's region colour);
// `ramp` is whether its region is on the classification ramp — a constant per
// layer, since a shard holds one region (the world archive passes false: its
// regions carry no classification the ramp reads). `hide` is the world
// archive's handed-off multiplier (WORLD_HANDED_FACTOR) or null for a shard
// layer; it has to be folded into each zoom stop's output, because the zoom
// interpolation must stay the top-level expression.
function buildFillPaint(
  selectedKey: string | null,
  selectedId: string | null,
  color: ColorExpression,
  ramp: boolean,
  hide: unknown[] | null,
) {
```

(h) Inside `buildFillPaint`, lines 382-387. Replace:

```tsx
    "fill-antialias": false,
    "fill-color": areaColor,
    "fill-opacity": [
      "let",
      "ramp",
      rampExpression(rampedRegions),
      [
```

with:

```tsx
    "fill-antialias": false,
    "fill-color": color as unknown as string,
    "fill-opacity": [
      "let",
      "ramp",
      ramp,
      [
```

(i) Props, line 521. Replace `  areaSlugs = NO_SLUGS,` with `  areaSlugsByShard = NO_SLUGS_BY_SHARD,`. Then lines 542-546, replace:

```tsx
  /** Every `area_key`/`group` value the tiles can carry, derived from the
      place tree (areaSlugsFromTree). The fill palette's slug->colour table is
      built from this whole list once, so it never changes with the viewport.
      Empty until the tree loads: region hues only, as before the first scan. */
  areaSlugs?: string[];
```

with:

```tsx
  /** shard key -> every `area_key`/`group` value that shard's tiles can
      carry, derived from the place tree (areaSlugsByShard). Each shard's fill
      palette is built from its own list once, so it never changes with the
      viewport. Empty until the tree loads: region hues only, as before the
      first scan. */
  areaSlugsByShard?: Record<string, string[]>;
```

(j) The colour and paint memos, lines 1161-1219. Replace:

```tsx
  // fillColorExpression only steps from regionMatch to the per-area/
  // classification palette at z8, so below that the legend's Areas and
  // Classification chips described colours that appeared nowhere on the map —
  // a Gevrey-Chambertin swatch in district red while every polygon on
  // screen was still Bourgogne petrol. Same threshold as the step.
  const areaPaletteLive = viewInfo.zoom >= AREA_PALETTE_ZOOM;

  // The one colour expression every wine fill and outline layer uses. Keyed on
  // the catalogue's slug list (changes once, when the tree loads), the ramp
  // latch (at most once per region per session) and the landed theme (a rare,
  // user-initiated flip) — never on the viewport.
  const areaColor = useMemo(
    () => fillColorExpression(areaSlugs, rampedRegions, paintTheme),
    [areaSlugs, rampedRegions, paintTheme],
  );
  // The world country and region layers' plain region hue; a module-level
  // table per theme, so the reference only changes on a flip.
  const regionColor = REGION_MATCH[paintTheme] as unknown as string;

  // Selection-aware paint. The zoom interpolation fades fills — the selected
  // parent included — as children appear, while outlines and labels persist
  // (spec: "the selected parent's fill fades while its outline and single
  // label remain").
  const fillPaint = useMemo(
    () => buildFillPaint(selectedKey, selectedId, areaColor, rampedRegions, null),
    [selectedKey, selectedId, areaColor, rampedRegions],
  );
  // The world archive's copy of the same paint, with the handed-off multiplier
  // folded in (see the effect on handedOffShards).
  const worldRegionFillPaint = useMemo(
    () =>
      buildFillPaint(
        selectedKey,
        selectedId,
        areaColor,
        rampedRegions,
        WORLD_HANDED_FACTOR,
      ),
    [selectedKey, selectedId, areaColor, rampedRegions],
  );

  // Shared by the shard outlines and the world archive's region outlines, so a
  // region drawn from either source is pixel-identical.
  const outlinePaint = useMemo(
    () => ({
      // Outlines follow the fill palette (classification colours at village
      // zoom) so deep levels aren't ringed in region teal.
      "line-color": areaColor,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]] as unknown as number,
    }),
    [areaColor],
  );
  const worldRegionOutlinePaint = useMemo(
    () => ({
      ...outlinePaint,
      "line-opacity": WORLD_HANDED_FACTOR as unknown as number,
    }),
    [outlinePaint],
  );
```

with:

```tsx
  // The fill colour only steps from the region hue to the per-area/
  // classification palette at z8, so below that the legend's Areas and
  // Classification chips described colours that appeared nowhere on the map —
  // a Gevrey-Chambertin swatch in district red while every polygon on
  // screen was still Bourgogne petrol. Same threshold as the step.
  const areaPaletteLive = viewInfo.zoom >= AREA_PALETTE_ZOOM;

  // One colour expression per shard, from that shard's own region and area
  // slugs (lib/wine-map/shard-specs) — ~2 KB each instead of one ~38 KB
  // catalogue-wide expression on every layer, which MapLibre re-serialized
  // with the whole style on every addLayer (the first-zoom freeze). Keyed on
  // the tree's slug lists (change once, when the tree loads), the ramp latch
  // (at most once per region per session) and the landed theme (a rare,
  // user-initiated flip) — never on the viewport. Split by ramp so a region
  // joining the latch rebuilds only its own expression; every other shard
  // keeps the same object, which react-map-gl's paint diff skips on identity.
  const plainShardColors = useMemo(
    () =>
      shardColorsFor({
        keys: shardEntries.map(([key]) => key),
        slugsByShard: areaSlugsByShard,
        ramp: false,
        palette,
      }),
    [shardEntries, areaSlugsByShard, palette],
  );
  const rampedShardColors = useMemo(
    () =>
      shardColorsFor({
        keys: rampedRegions,
        slugsByShard: areaSlugsByShard,
        ramp: true,
        palette,
      }),
    [rampedRegions, areaSlugsByShard, palette],
  );
  const rampedSet = useMemo(() => new Set(rampedRegions), [rampedRegions]);

  // Selection-aware paint, per shard. The zoom interpolation fades fills — the
  // selected parent included — as children appear, while outlines and labels
  // persist (spec: "the selected parent's fill fades while its outline and
  // single label remain"). Built once per input change, never per render: every
  // Layer re-renders on each `styledata`, and a fresh object would send
  // react-map-gl into a deep compare of each expression every time.
  const shardFillPaints = useMemo(
    () =>
      Object.fromEntries(
        shardEntries.map(([key]) => {
          const ramp = rampedSet.has(key);
          const color = ramp ? rampedShardColors[key] : plainShardColors[key];
          return [key, buildFillPaint(selectedKey, selectedId, color, ramp, null)];
        }),
      ),
    [shardEntries, rampedSet, rampedShardColors, plainShardColors, selectedKey, selectedId],
  );
  const shardOutlinePaints = useMemo(
    () =>
      Object.fromEntries(
        shardEntries.map(([key]) => [
          key,
          buildOutlinePaint(
            rampedSet.has(key) ? rampedShardColors[key] : plainShardColors[key],
          ),
        ]),
      ),
    [shardEntries, rampedSet, rampedShardColors, plainShardColors],
  );

  // The world archive's country and region colour: every region's hue, one
  // cached expression per theme, so the reference only changes on a flip.
  // World features carry no area slugs, so this paints them exactly as the
  // shard expressions paint the same region (shard-specs.test.ts).
  const regionColor = worldRegionColor(palette) as unknown as string;
  // The world archive's copy of the fill paint, with the handed-off multiplier
  // folded in (see the effect on handedOffShards).
  const worldRegionFillPaint = useMemo(
    () =>
      buildFillPaint(selectedKey, selectedId, regionColor, false, WORLD_HANDED_FACTOR),
    [selectedKey, selectedId, regionColor],
  );
  const worldRegionOutlinePaint = useMemo(
    () => ({
      ...buildOutlinePaint(regionColor),
      "line-opacity": WORLD_HANDED_FACTOR as unknown as number,
    }),
    [regionColor],
  );
```

(k) The shard layers' paint, lines 1692-1702. Replace:

```tsx
              filter={shardFilterFor(key)}
              paint={fillPaint}
              layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            />
            <Layer
              id={`shard-outlines-${key}`}
              type="line"
              source-layer="places"
              filter={shardFilterFor(key)}
              paint={outlinePaint}
            />
```

with:

```tsx
              filter={shardFilterFor(key)}
              paint={shardFillPaints[key]}
              layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            />
            <Layer
              id={`shard-outlines-${key}`}
              type="line"
              source-layer="places"
              filter={shardFilterFor(key)}
              paint={shardOutlinePaints[key]}
            />
```

The world layers need no JSX change: `world-fills`/`world-outlines` keep `regionColor`, and `world-region-fills`/`world-region-outlines` keep `worldRegionFillPaint`/`worldRegionOutlinePaint`, which now read `worldRegionColor(palette)` instead of the catalogue-wide `areaColor` (identical colours on world features, pinned in Task 1's "paints world features exactly as the catalogue-wide expression did").

Check: `grep -n "areaColor\|REGION_MATCH\|fillColorExpression\|rampExpression\|paletteArms\|SHADE_STEPS\|shiftLightness\|fillPaint}\|outlinePaint}" src/app/knowledge/map/tile-wine-map.tsx` prints nothing.

- [ ] **Step 6: Pass per-shard slugs from the explorer**

In `src/app/knowledge/map/tile-wine-map-explorer.tsx`:

Line 50, replace `import { areaSlugsFromTree } from "@/lib/wine-map/fill-palette";` with `import { areaSlugsByShard } from "@/lib/wine-map/shard-specs";`.

Lines 220-224, replace:

```tsx
  // The whole catalogue's area slugs, for the map's fixed fill palette — built
  // once from the same tree, so the colour table never depends on what the
  // viewport has happened to scan. Empty until the tree lands (region hues
  // only, as before).
  const areaSlugs = useMemo(() => areaSlugsFromTree(tree ?? []), [tree]);
```

with:

```tsx
  // Each shard's own area slugs, for that shard's fixed fill palette — built
  // once from the same tree, so the colour table never depends on what the
  // viewport has happened to scan, and a shard's colour expression carries only
  // its own areas. Empty until the tree lands (region hues only, as before).
  const slugsByShard = useMemo(() => areaSlugsByShard(tree ?? []), [tree]);
```

Line 658, replace `                areaSlugs={areaSlugs}` with `                areaSlugsByShard={slugsByShard}`.

- [ ] **Step 7: Tests, types, lint**

Run: `npx vitest run src/lib/wine-map` — expected: PASS, 16 files / 182 tests.
Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs.test.ts` — expected: exit 0.

- [ ] **Step 8: Manual verification (main session, browser)**

On `/knowledge/map` (dev server or the `start` config), light and dark, compare with the same views on `master`: France z5.5, Bourgogne z9 and z13 (village hues, grand/premier cru shades after the ramp latches on idle), Champagne z10, Baden z6 and z9 (flat neutral grey, no tint banding), Toscana z8. Watch one region at z5 as its shard loads: its colour must not change at the moment the world copy hands off. Expected: pixel-identical; no console errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs.test.ts src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "perf(map): each shard layer carries only its own colour expression" -m "Shard fill/outline layers read shardColorsFor (their own region hue and area slugs, ramp as a per-shard constant); the world region layers read worldRegionColor. Removes the ~38 KB catalogue-wide expression that MapLibre re-serialized with the whole style on every addLayer. No visual change." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Staggered shard mounting (`mount-policy.ts` `nextMountStep`)

**Files:**
- Create: `src/lib/wine-map/mount-policy.ts`
- Create: `src/lib/wine-map/mount-policy.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` (after Task 2) — import at line 40; after `SHARD_MIN_ZOOM` (line 155); the `mountedShards` state (lines 558-561); the target computation at the end of `syncMountedShards` (lines 637-653)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  // mount-policy.ts
  export function nextMountStep(current: readonly string[], target: readonly string[],
    opts: { maxAdds: number; first: string | null }): string[];
  // sorted with localeCompare (TileWineMap's shardEntries order); returns `current`
  // itself when the step changes nothing
  // tile-wine-map.tsx (module-private)
  const MOUNTS_PER_FRAME = 3;
  ```
  Task 18 adds `MountInput`, `SHARD_MIN_ZOOM`, `NEIGHBOUR_MIN_ZOOM` and `mountTarget` to this same file.

- [ ] **Step 1: Write the failing test**

Create `src/lib/wine-map/mount-policy.test.ts`:

```ts
// The rendered shard set walks toward the target a few shards per frame, so
// the first zoom past z5 never mounts 36-67 sources in one task. These pin the
// step's rules: removals at once, a bounded number of additions, the selected
// shard first, shard order, and identity on a no-op so setState bails out.
import { describe, expect, it } from "vitest";
import { nextMountStep } from "./mount-policy";

// Real shard keys, including the hyphenated ones whose order depends on the
// comparator (TileWineMap sorts shard keys with localeCompare).
const FRANCE = [
  "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
  "jura", "languedoc-roussillon", "loire", "provence", "rhone", "savoie",
  "sud-ouest",
];

/** Steps until nothing changes, returning every intermediate set. */
function walk(
  current: string[],
  target: string[],
  opts: { maxAdds: number; first: string | null },
): string[][] {
  const steps: string[][] = [];
  let at = current;
  for (let i = 0; i < 100; i += 1) {
    const next = nextMountStep(at, target, opts);
    if (next === at) return steps;
    steps.push(next);
    at = next;
  }
  throw new Error("never settled");
}

describe("nextMountStep", () => {
  it("adds at most maxAdds shards per step, in shard order, until it reaches the target", () => {
    const steps = walk([], FRANCE, { maxAdds: 3, first: null });
    expect(steps).toEqual([
      ["alsace", "beaujolais", "bordeaux"],
      ["alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse"],
      [
        "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
        "jura", "languedoc-roussillon", "loire",
      ],
      [
        "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
        "jura", "languedoc-roussillon", "loire", "provence", "rhone", "savoie",
      ],
      FRANCE,
    ]);
  });

  it("mounts the selected shard in the first step, ahead of the others", () => {
    const step = nextMountStep([], FRANCE, { maxAdds: 3, first: "savoie" });
    expect(step).toEqual(["alsace", "beaujolais", "savoie"]);
  });

  it("ignores a `first` that is already mounted or not wanted", () => {
    expect(
      nextMountStep(["savoie"], FRANCE, { maxAdds: 2, first: "savoie" }),
    ).toEqual(["alsace", "beaujolais", "savoie"]);
    expect(
      nextMountStep([], ["alsace", "loire"], { maxAdds: 1, first: "toscana" }),
    ).toEqual(["alsace"]);
  });

  it("removes every unwanted shard at once, whatever the add budget", () => {
    const current = ["alsace", "bordeaux", "bourgogne", "loire", "rhone"];
    expect(nextMountStep(current, ["bourgogne"], { maxAdds: 3, first: null })).toEqual([
      "bourgogne",
    ]);
    expect(nextMountStep(current, [], { maxAdds: 0, first: null })).toEqual([]);
  });

  it("removes and adds in the same step", () => {
    const step = nextMountStep(
      ["alsace", "bordeaux"],
      ["bordeaux", "corse", "jura", "loire", "rhone", "savoie"],
      { maxAdds: 3, first: null },
    );
    expect(step).toEqual(["bordeaux", "corse", "jura", "loire"]);
  });

  it("returns `current` itself when the step changes nothing", () => {
    const current = ["bordeaux", "bourgogne"];
    expect(nextMountStep(current, ["bourgogne", "bordeaux"], { maxAdds: 3, first: null })).toBe(
      current,
    );
    // Zero budget and nothing to remove: also a no-op.
    expect(nextMountStep(current, [...current, "loire"], { maxAdds: 0, first: null })).toBe(
      current,
    );
  });

  it("sorts with localeCompare, the order TileWineMap renders shards in", () => {
    const target = ["la-rioja", "languedoc-roussillon", "castilla-y-leon", "castilla-la-mancha"];
    const step = nextMountStep([], target, { maxAdds: 10, first: null });
    expect(step).toEqual([...target].sort((a, b) => a.localeCompare(b)));
  });

  it("ignores duplicates in the target", () => {
    expect(
      nextMountStep([], ["loire", "loire", "alsace"], { maxAdds: 3, first: null }),
    ).toEqual(["alsace", "loire"]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/wine-map/mount-policy.test.ts`
Expected: FAIL — `Error: Cannot find module './mount-policy' imported from '…/src/lib/wine-map/mount-policy.test.ts'`.

- [ ] **Step 3: Implement `nextMountStep`**

Create `src/lib/wine-map/mount-policy.ts`:

```ts
// Which region shards the tile map mounts, and how fast it gets there.
//
// Pure: no DOM, no maplibre value import, so vitest covers the rules.

// Shard order everywhere on the map: the manifest's keys sorted with
// localeCompare, exactly as TileWineMap's `shardEntries` sorts them, so a
// step's result lines up with the target it walks toward.
const byKey = (a: string, b: string) => a.localeCompare(b);

/**
 * One step of the rendered shard set toward the target set.
 *
 * Mounting a shard is a <Source> plus its layers, and every MapLibre addLayer
 * validates by serializing the whole style — so the first zoom past z5, which
 * used to mount 36-67 shards in one commit, was one long frozen task. The
 * target is still decided in one go; the rendered set now walks toward it:
 * - removals apply at once (an unmounted shard is off screen by definition, so
 *   dropping it early is invisible and frees work);
 * - at most `maxAdds` new shards join per step, `first` (the selected shard)
 *   ahead of the rest, the rest in shard order;
 * - the result is in shard order, and is `current` itself when the step
 *   changes nothing, so a setState with it bails out.
 */
export function nextMountStep(
  current: readonly string[],
  target: readonly string[],
  opts: { maxAdds: number; first: string | null },
): string[] {
  const wanted = new Set(target);
  const kept = current.filter((key) => wanted.has(key));
  const have = new Set(kept);
  const pending = [...new Set(target)].filter((key) => !have.has(key)).sort(byKey);
  const firstAt = opts.first === null ? -1 : pending.indexOf(opts.first);
  if (firstAt > 0) {
    pending.splice(firstAt, 1);
    pending.unshift(opts.first as string);
  }
  const next = [...kept, ...pending.slice(0, Math.max(0, opts.maxAdds))].sort(byKey);
  const unchanged =
    next.length === current.length && next.every((key, i) => key === current[i]);
  // Same reference on a no-op step: callers compare by identity.
  return unchanged ? (current as string[]) : next;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/wine-map/mount-policy.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Walk the rendered set toward the target in `TileWineMap`**

All edits in `src/app/knowledge/map/tile-wine-map.tsx`.

(a) Line 40. Replace:

```tsx
import { keyGateExpression } from "@/lib/wine-map/key-gate";
```

with:

```tsx
import { keyGateExpression } from "@/lib/wine-map/key-gate";
import { nextMountStep } from "@/lib/wine-map/mount-policy";
```

(b) After `SHARD_MIN_ZOOM` (line 155). Replace:

```tsx
const SHARD_MIN_ZOOM = 5;

// MapLibre keeps 500 tiles by default
```

with:

```tsx
const SHARD_MIN_ZOOM = 5;

// How many shards may START mounting in one animation frame. Each mount is a
// <Source> plus its layers, and every MapLibre addLayer validates by
// serializing the whole style, so the first zoom past z5 — 36-67 shards in one
// commit — was a single 1.2-1.5 s frozen task. Three per frame keeps each
// frame's batch short (worst measured 16 ms with per-shard colours) while the
// full set still lands within a fraction of a second.
const MOUNTS_PER_FRAME = 3;

// MapLibre keeps 500 tiles by default
```

(c) The `mountedShards` state (lines 558-561 when this task starts; step (b) moved them down 8 lines), inside the "Viewport-gated mounting" comment block. Replace:

```tsx
  // Hysteresis: mount at 50% padding, unmount only once past 150%, so panning
  // never thrashes sources.
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // Which country owns the view
```

with:

```tsx
  // Hysteresis: mount at 50% padding, unmount only once past 150%, so panning
  // never thrashes sources.
  //
  // Staggered: syncMountedShards decides the TARGET set in one go, and the
  // rendered set, mountedShards, walks toward it — removals at once, at most
  // MOUNTS_PER_FRAME new shards per animation frame, the selected shard first
  // (nextMountStep). The first step runs synchronously, so a small change
  // (a selection, a pan that adds one or two shards) lands exactly as before.
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // The last target, and the shard to mount ahead of the rest.
  const mountTargetRef = useRef<string[]>([]);
  const mountFirstRef = useRef<string | null>(null);
  // Mirror of the last mountedShards this component set. Each step is computed
  // from it rather than inside a setState updater, whose result a frame
  // callback cannot read back to decide whether another frame is needed.
  const renderedShardsRef = useRef<string[]>([]);
  const mountFrameRef = useRef<number | null>(null);
  const advanceMounts = useCallback(() => {
    if (mountFrameRef.current !== null) {
      window.cancelAnimationFrame(mountFrameRef.current);
      mountFrameRef.current = null;
    }
    const step = () => {
      mountFrameRef.current = null;
      const next = nextMountStep(renderedShardsRef.current, mountTargetRef.current, {
        maxAdds: MOUNTS_PER_FRAME,
        first: mountFirstRef.current,
      });
      if (next !== renderedShardsRef.current) {
        renderedShardsRef.current = next;
        setMountedShards(next);
      }
      // Every step keeps only target shards, so equal length means arrived.
      if (next.length < mountTargetRef.current.length) {
        mountFrameRef.current = window.requestAnimationFrame(step);
      }
    };
    step();
  }, []);
  useEffect(
    () => () => {
      if (mountFrameRef.current !== null) window.cancelAnimationFrame(mountFrameRef.current);
    },
    [],
  );
  // Which country owns the view
```

(d) The end of `syncMountedShards`. Replace:

```tsx
    const zoom = map.getZoom();
    setMountedShards((prev) => {
      const prevSet = new Set(prev);
      const next = shardEntries
        .filter(
          ([key, shard]) =>
            key === selectedShard ||
            (zoom >= SHARD_MIN_ZOOM &&
              (hit(shard.bbox, 0.5) ||
                (prevSet.has(key) && hit(shard.bbox, 1.5)))),
        )
        .map(([key]) => key);
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
  }, [shardEntries, selectedShard, shardCountries]);
```

with:

```tsx
    const zoom = map.getZoom();
    // Hysteresis reads the previous TARGET, not what has rendered so far: a
    // shard still queued for a later frame already won its place at the 50%
    // pad, and keeps it until past 150% exactly as a mounted one would.
    const prevSet = new Set(mountTargetRef.current);
    mountTargetRef.current = shardEntries
      .filter(
        ([key, shard]) =>
          key === selectedShard ||
          (zoom >= SHARD_MIN_ZOOM &&
            (hit(shard.bbox, 0.5) ||
              (prevSet.has(key) && hit(shard.bbox, 1.5)))),
      )
      .map(([key]) => key);
    mountFirstRef.current = selectedShard;
    advanceMounts();
  }, [shardEntries, selectedShard, shardCountries, advanceMounts]);
```

Nothing else changes: `mountedShards` is still the rendered set every consumer reads (`mountedSet`, `recomputeReady`, `scanView`, `interactiveLayerIds`, the shard JSX), and the existing effect `useEffect(() => { syncMountedShards(); }, [syncMountedShards])` still re-targets on a selection.

- [ ] **Step 6: Types and lint**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/app/knowledge/map/tile-wine-map.tsx src/lib/wine-map/mount-policy.ts src/lib/wine-map/mount-policy.test.ts` — expected: exit 0 (the frame callback's `setMountedShards` is not an effect-body setState).

- [ ] **Step 7: Manual verification (main session, browser)**

Production run (`start` config), DevTools Performance recording at the 1440-wide layout: from the z4.4 opening view zoom once to z5.5 over France. Expected: the shards mount over ~12-20 consecutive frames (3 per frame) instead of one 1.2-1.5 s task; no region shows a hole (the world copy keeps drawing each region until its shard has loaded). Then a cold `?place=france.bourgogne.cote-de-nuits.vosne-romanee.la-tache`: the ring appears as soon as the shard's tiles land (the selected shard is in the first, synchronous step).

- [ ] **Step 8: Commit**

```bash
git add src/lib/wine-map/mount-policy.ts src/lib/wine-map/mount-policy.test.ts src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "perf(map): stagger shard mounts, three per frame" -m "syncMountedShards still decides the target set in one go; the rendered set walks toward it (removals at once, at most three new shards per animation frame, the selected shard first), so the first zoom past z5 no longer mounts 36-67 sources in one task." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Safety net — error boundary and tree load state

**Files:**
- Create: `src/lib/wine-map/tree-load.ts`
- Create: `src/lib/wine-map/tree-load.test.ts`
- Create: `src/app/knowledge/map/map-error-boundary.tsx`
- Create: `src/app/knowledge/map/map-error-boundary.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map-explorer.tsx` (after Task 2) — lines 3-10 (react import), 50-51 (imports), 145 (`tree` state), 158-171 (tree effect), 258-261 (`retryManifest`), 537-539 (tree card), 648-679 (map area)
- Test (no change, confirms the cache contract): `src/lib/wine-map/mount-cache.test.ts` — "a failed tree is never cached: the next mount tries again" already pins that `loadWinePlaceTree` (`place-cache.ts`, via `createKeyedCache`) drops a rejected promise, so `place-cache.ts` needs no change.

**Interfaces:**
- Consumes: `loadWinePlaceTree(supabase)` (`place-cache.ts`).
- Produces:
  ```ts
  // tree-load.ts
  export type TreeLoad = { state: "loading" | "ready" | "failed"; attempt: number };
  export type TreeLoadEvent = { type: "resolved" } | { type: "rejected" } | { type: "retry" };
  export const TREE_AUTO_RETRY_MS = 2000;
  export const INITIAL_TREE_LOAD: TreeLoad;               // { state: "loading", attempt: 0 }
  export function treeLoadReducer(s: TreeLoad, e: TreeLoadEvent): TreeLoad;
  export function treeFetchDelay(attempt: number): number; // TREE_AUTO_RETRY_MS for attempt 1, else 0
  // map-error-boundary.tsx
  export function MapUnavailableCard(props: { onRetry: () => void }): JSX.Element;
  export function isChunkLoadError(error: unknown): boolean;
  export class MapErrorBoundary extends Component<{ resetKey: number; onRetry: () => void; children: ReactNode },
    { error: Error | null; resetKey: number }> {}
  ```
  Attempt numbering: 0 = the first request, 1 = the single automatic retry (after `TREE_AUTO_RETRY_MS`), 2+ = manual retries.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/wine-map/tree-load.test.ts`:

```ts
// The place tree is an 811 KB RPC; on a flaky phone network it fails. These pin
// what the explorer does about it: one automatic retry after a pause, then a
// visible failure with a manual Retry — never a silent `tree = []` that reads
// exactly like "still loading".
import { describe, expect, it } from "vitest";
import {
  INITIAL_TREE_LOAD,
  TREE_AUTO_RETRY_MS,
  treeFetchDelay,
  treeLoadReducer,
  type TreeLoad,
  type TreeLoadEvent,
} from "./tree-load";

function run(events: TreeLoadEvent["type"][], from: TreeLoad = INITIAL_TREE_LOAD): TreeLoad {
  return events.reduce((s, type) => treeLoadReducer(s, { type } as TreeLoadEvent), from);
}

describe("treeLoadReducer", () => {
  it("starts loading, on the first attempt, with no delay", () => {
    expect(INITIAL_TREE_LOAD).toEqual({ state: "loading", attempt: 0 });
    expect(treeFetchDelay(INITIAL_TREE_LOAD.attempt)).toBe(0);
  });

  it("loading → ready", () => {
    expect(run(["resolved"])).toEqual({ state: "ready", attempt: 0 });
  });

  it("retries exactly once automatically, after TREE_AUTO_RETRY_MS", () => {
    const afterFirstFailure = run(["rejected"]);
    expect(afterFirstFailure).toEqual({ state: "loading", attempt: 1 });
    expect(TREE_AUTO_RETRY_MS).toBe(2000);
    expect(treeFetchDelay(afterFirstFailure.attempt)).toBe(TREE_AUTO_RETRY_MS);
    // ...and the retry succeeding is an ordinary ready.
    expect(run(["rejected", "resolved"])).toEqual({ state: "ready", attempt: 1 });
  });

  it("fails once the automatic retry has failed too", () => {
    expect(run(["rejected", "rejected"])).toEqual({ state: "failed", attempt: 1 });
  });

  it("a manual retry from failed loads again at once, and a second failure stays failed", () => {
    const retried = run(["rejected", "rejected", "retry"]);
    expect(retried).toEqual({ state: "loading", attempt: 2 });
    expect(treeFetchDelay(retried.attempt)).toBe(0);
    expect(run(["rejected", "rejected", "retry", "rejected"])).toEqual({
      state: "failed",
      attempt: 2,
    });
    expect(run(["rejected", "rejected", "retry", "resolved"])).toEqual({
      state: "ready",
      attempt: 2,
    });
  });

  it("ignores a retry that is not from failed (a double tap, or while ready)", () => {
    const loading = run(["rejected"]);
    expect(treeLoadReducer(loading, { type: "retry" })).toBe(loading);
    const ready = run(["resolved"]);
    expect(treeLoadReducer(ready, { type: "retry" })).toBe(ready);
  });

  it("never lets a stale rejection undo a success", () => {
    const ready = run(["resolved"]);
    expect(treeLoadReducer(ready, { type: "rejected" })).toBe(ready);
    expect(treeLoadReducer(ready, { type: "resolved" })).toBe(ready);
  });
});
```

Create `src/app/knowledge/map/map-error-boundary.test.ts` (vitest runs in node, so the boundary is tested through its static lifecycle methods; the `.tsx` import works through the repo's tsconfig `jsx: react-jsx`):

```ts
// The map's error boundary, through its static lifecycle methods (vitest runs
// in node with no DOM, so nothing is rendered): an error switches the map area
// to the Retry card, a new resetKey switches it back, and a failed code-split
// chunk is told apart from an ordinary crash, since only a page load fixes it.
import { describe, expect, it } from "vitest";
import { isChunkLoadError, MapErrorBoundary } from "./map-error-boundary";

describe("MapErrorBoundary", () => {
  it("records the error that reached it", () => {
    const error = new Error("Style is not done loading.");
    expect(MapErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it("wraps a non-Error throw so the fallback always has an Error", () => {
    const state = MapErrorBoundary.getDerivedStateFromError("boom");
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe("boom");
  });

  it("clears the error when the explorer bumps resetKey (Retry)", () => {
    const error = new Error("x");
    expect(
      MapErrorBoundary.getDerivedStateFromProps(
        { resetKey: 1, onRetry: () => {}, children: null },
        { error, resetKey: 0 },
      ),
    ).toEqual({ error: null, resetKey: 1 });
  });

  it("keeps the error while resetKey is unchanged", () => {
    const error = new Error("x");
    expect(
      MapErrorBoundary.getDerivedStateFromProps(
        { resetKey: 3, onRetry: () => {}, children: null },
        { error, resetKey: 3 },
      ),
    ).toBeNull();
  });
});

describe("isChunkLoadError", () => {
  it("recognises webpack's ChunkLoadError", () => {
    const error = new Error("Loading chunk 482 failed.\n(error: https://x/_next/static/chunks/482.js)");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed."))).toBe(true);
  });

  it("recognises Turbopack's chunk failure", () => {
    expect(
      isChunkLoadError(
        new Error(
          "Failed to load chunk /_next/static/chunks/0f1e2d.js from module 81234: TypeError: Failed to fetch",
        ),
      ),
    ).toBe(true);
  });

  it("does not mistake an ordinary crash, or a non-Error, for one", () => {
    expect(isChunkLoadError(new Error("Style is not done loading."))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed.")).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/wine-map/tree-load.test.ts src/app/knowledge/map/map-error-boundary.test.ts`
Expected: FAIL — `Error: Cannot find module './tree-load' imported from …` and `Error: Cannot find module './map-error-boundary' imported from …` (2 failed suites).

- [ ] **Step 3: Implement the reducer**

Create `src/lib/wine-map/tree-load.ts`:

```ts
// The place tree's load state, kept apart from the tree itself.
//
// The explorer used to turn a failed get_wine_place_tree into `tree = []`,
// which every consumer — the tree card, the map's shard→country and area-slug
// props — could not tell from "still loading", and nothing on screen said
// anything had gone wrong. Now: loading → ready, or one automatic retry after
// TREE_AUTO_RETRY_MS and then failed, from which a manual Retry starts again.
// A failed tree never blanks the map: shards with no known country still
// render full depth in region colours, as they do before the tree lands.
//
// Pure: the explorer runs it through useReducer and starts one request per
// attempt (treeFetchDelay says when).

export type TreeLoad = { state: "loading" | "ready" | "failed"; attempt: number };

export type TreeLoadEvent = { type: "resolved" } | { type: "rejected" } | { type: "retry" };

/** The one automatic retry waits this long, so a blip has time to clear. */
export const TREE_AUTO_RETRY_MS = 2000;

export const INITIAL_TREE_LOAD: TreeLoad = { state: "loading", attempt: 0 };

// Attempt 1 is the automatic retry; 0 is the first request and 2+ are manual.
const AUTO_RETRY_ATTEMPT = 1;

export function treeLoadReducer(s: TreeLoad, e: TreeLoadEvent): TreeLoad {
  switch (e.type) {
    case "resolved":
      return s.state === "ready" ? s : { state: "ready", attempt: s.attempt };
    case "rejected":
      // A rejection only means something while a request is out; a stale one
      // arriving after a success must not undo it.
      if (s.state !== "loading") return s;
      return s.attempt === 0
        ? { state: "loading", attempt: AUTO_RETRY_ATTEMPT }
        : { state: "failed", attempt: s.attempt };
    case "retry":
      // Only a failed load can be retried by hand; a Retry while a request is
      // already out (a double tap) is a no-op.
      return s.state === "failed" ? { state: "loading", attempt: s.attempt + 1 } : s;
  }
}

/** How long to wait before starting the request for `attempt`: only the
    automatic retry waits. */
export function treeFetchDelay(attempt: number): number {
  return attempt === AUTO_RETRY_ATTEMPT ? TREE_AUTO_RETRY_MS : 0;
}
```

- [ ] **Step 4: Implement the boundary**

Create `src/app/knowledge/map/map-error-boundary.tsx` (relative imports only, so its test loads in vitest; the card is the manifest-failure card moved here so both failures share one copy of the text):

```tsx
"use client";

// The safety net around the tile map. Before it, nothing under src/app caught
// a render or effect error, so one throw from MapLibre (or a failed
// next/dynamic chunk after a deploy) replaced the WHOLE page — tree, details
// and all — with Next's "This page couldn't load". Now the map area alone
// falls back to the same card the manifest failure shows, and Retry remounts
// the map. Errors thrown inside MapLibre's own event listeners or animation
// frames never reach React and are not caught here; those paths guard
// themselves.
//
// Only relative imports: map-error-boundary.test.ts loads this file in vitest,
// which has no "@/" alias.
import { Component, type ErrorInfo, type ReactNode } from "react";

/** The map area's "no map" card: a failed manifest, or a crashed map. */
export function MapUnavailableCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border text-center">
      <p className="text-sm text-muted-foreground">
        The map tiles are unavailable right now — navigation below still works.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Retry map
      </button>
    </div>
  );
}

/** A code-split chunk that failed to load — typically a tab still running the
    previous deployment asking for a chunk the new one no longer serves.
    Webpack names it ChunkLoadError ("Loading chunk 123 failed."); Turbopack
    throws a plain Error ("Failed to load chunk /_next/static/…"). */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "ChunkLoadError" ||
    /^Failed to load chunk /.test(error.message) ||
    /^Loading (CSS )?chunk \S+ failed/i.test(error.message)
  );
}

type Props = {
  /** Bumped by onRetry; a new value clears the error and renders children again. */
  resetKey: number;
  /** Remount the map (the explorer bumps resetKey and the map's own key). */
  onRetry: () => void;
  children: ReactNode;
};

type State = { error: Error | null; resetKey: number };

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  // A new resetKey is the Retry landing: clear the error so the children —
  // remounted under their own new key — get another try.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey
      ? null
      : { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[wine-map] the map crashed; showing the Retry card", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // React.lazy (which next/dynamic wraps) keeps a rejected import rejected,
    // so remounting would only rethrow the same chunk error; a page load is
    // what fetches the current deployment's chunks.
    return (
      <MapUnavailableCard
        onRetry={isChunkLoadError(error) ? () => window.location.reload() : this.props.onRetry}
      />
    );
  }
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run src/lib/wine-map/tree-load.test.ts src/app/knowledge/map/map-error-boundary.test.ts src/lib/wine-map/mount-cache.test.ts`
Expected: PASS — 7 + 7 + 5 tests.

- [ ] **Step 6: Wire both into the explorer**

All edits in `src/app/knowledge/map/tile-wine-map-explorer.tsx`.

(a) Lines 3-10. Replace:

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
```

with:

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
```

(b) Lines 50-51. Replace:

```tsx
import { areaSlugsByShard } from "@/lib/wine-map/shard-specs";
import { WineMapTree } from "./wine-map-tree";
```

with:

```tsx
import { areaSlugsByShard } from "@/lib/wine-map/shard-specs";
import {
  INITIAL_TREE_LOAD,
  treeFetchDelay,
  treeLoadReducer,
} from "@/lib/wine-map/tree-load";
import { MapErrorBoundary, MapUnavailableCard } from "./map-error-boundary";
import { WineMapTree } from "./wine-map-tree";
```

(c) Line 145. Replace:

```tsx
  const [tree, setTree] = useState<WinePlaceTreeNode[] | null>(null);
```

with:

```tsx
  const [tree, setTree] = useState<WinePlaceTreeNode[] | null>(null);
  // Loading, ready or failed, kept apart from `tree` itself (null both while
  // loading and after a failure). A failure used to set tree=[], which the
  // tree card and every map prop derived from the tree could not tell from
  // "still loading", and nothing on screen said anything had gone wrong.
  const [treeLoad, dispatchTree] = useReducer(treeLoadReducer, INITIAL_TREE_LOAD);
```

(d) The tree effect, lines 158-171. Replace:

```tsx
  useEffect(() => {
    let cancelled = false;
    loadWinePlaceTree(supabase)
      .then((roots) => {
        if (!cancelled) setTree(roots);
      })
      .catch(() => {
        // The map and details still work without the sidebar.
        if (!cancelled) setTree([]);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);
```

with:

```tsx
  // One request per attempt: the first at once, the single automatic retry
  // after TREE_AUTO_RETRY_MS, a manual Retry at once. The place cache never
  // keeps a rejected tree (mount-cache.test.ts pins that), so every attempt
  // really goes back to the server.
  const treeLoading = treeLoad.state === "loading";
  const treeAttempt = treeLoad.attempt;
  useEffect(() => {
    if (!treeLoading) return;
    let cancelled = false;
    const start = () => {
      loadWinePlaceTree(supabase).then(
        (roots) => {
          if (cancelled) return;
          setTree(roots);
          dispatchTree({ type: "resolved" });
        },
        () => {
          // The map and details still work without the tree; the tree card
          // says so, with a Retry, once the automatic retry has failed too.
          if (!cancelled) dispatchTree({ type: "rejected" });
        },
      );
    };
    const delay = treeFetchDelay(treeAttempt);
    const timer = delay > 0 ? window.setTimeout(start, delay) : null;
    if (timer === null) start();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [supabase, treeLoading, treeAttempt]);
```

On failure `tree` now stays `null` (it used to become `[]`): `shardCountries` and `slugsByShard` still derive from `tree ?? []`, so the map gets exactly the props it got before (unknown shards render full depth in region colours), and the grape filter's `visibleKeys` is `null` (no filtering) rather than an empty set that hid every place.

(e) `retryManifest`, lines 258-261. Replace:

```tsx
  const retryManifest = useCallback(() => {
    setManifestError(null);
    setManifestAttempt((attempt) => attempt + 1);
  }, []);
```

with:

```tsx
  const retryManifest = useCallback(() => {
    setManifestError(null);
    setManifestAttempt((attempt) => attempt + 1);
  }, []);
  // Bumped by the error boundary's Retry: a new key remounts TileWineMap from
  // scratch (a fresh MapLibre instance) and clears the boundary's error.
  const [mapKey, setMapKey] = useState(0);
  const remountMap = useCallback(() => setMapKey((key) => key + 1), []);
```

(f) The tree card, lines 537-539. Replace:

```tsx
                {tree === null ? (
                  <div className="h-full animate-pulse rounded-md bg-muted" />
                ) : (
```

with:

```tsx
                {treeLoad.state === "failed" ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border text-center">
                    <p className="text-sm text-muted-foreground">
                      Couldn&apos;t load the place list.
                    </p>
                    <button
                      type="button"
                      onClick={() => dispatchTree({ type: "retry" })}
                      className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Retry
                    </button>
                  </div>
                ) : tree === null ? (
                  <div className="h-full animate-pulse rounded-md bg-muted" />
                ) : (
```

(g) The map area, lines 648-679. Replace:

```tsx
            {manifest ? (
              <TileWineMap
                manifest={manifest}
                selectedKey={selectedKey}
                selectedId={context?.place.id ?? null}
                selectedParentId={context?.ancestors.at(-1)?.id ?? null}
                cameraTarget={cameraTarget}
                onSelect={select}
                visibleKeys={visibleKeys}
                shardCountries={shardCountries}
                areaSlugsByShard={slugsByShard}
                expanded={expanded}
                onToggleExpanded={() => setExpanded((value) => !value)}
                english={english}
              />
            ) : manifestError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border text-center">
                <p className="text-sm text-muted-foreground">
                  The map tiles are unavailable right now — navigation below
                  still works.
                </p>
                <button
                  type="button"
                  onClick={retryManifest}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Retry map
                </button>
              </div>
            ) : (
```

with:

```tsx
            {manifest ? (
              // Any render or effect error inside the map (or a failed
              // next/dynamic chunk after a deploy) lands here instead of
              // replacing the whole page.
              <MapErrorBoundary resetKey={mapKey} onRetry={remountMap}>
                <TileWineMap
                  key={mapKey}
                  manifest={manifest}
                  selectedKey={selectedKey}
                  selectedId={context?.place.id ?? null}
                  selectedParentId={context?.ancestors.at(-1)?.id ?? null}
                  cameraTarget={cameraTarget}
                  onSelect={select}
                  visibleKeys={visibleKeys}
                  shardCountries={shardCountries}
                  areaSlugsByShard={slugsByShard}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((value) => !value)}
                  english={english}
                />
              </MapErrorBoundary>
            ) : manifestError ? (
              <MapUnavailableCard onRetry={retryManifest} />
            ) : (
```

- [ ] **Step 7: Types and lint**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/app/knowledge/map/tile-wine-map-explorer.tsx src/app/knowledge/map/map-error-boundary.tsx src/app/knowledge/map/map-error-boundary.test.ts src/lib/wine-map/tree-load.ts src/lib/wine-map/tree-load.test.ts` — expected: exit 0.

- [ ] **Step 8: Manual verification (main session, browser)**

1. DevTools → Network → block request URL pattern `*get_wine_place_tree*`, reload `/knowledge/map`. Expected: the tree card pulses for ~2 s (first failure + automatic retry), then shows "Couldn't load the place list." and a Retry button; the map still loads and zooming into Bourgogne past z9 still shows villages and climats (full depth, region-level colours); `?place=france.bourgogne.cote-de-nuits.vosne-romanee` still rings its place and fills the details panel. Unblock, press Retry: the tree appears and colours switch to the area palette.
2. Block the JS chunk that carries `TileWineMap` (on a normal load, the `/_next/static/chunks/*.js` file in the Network panel whose response contains `pmtiles://`; block that exact URL), then reload. Expected: the map area shows "The map tiles are unavailable right now — navigation below still works." with "Retry map"; the tree and details keep working; the console shows `[wine-map] the map crashed; showing the Retry card`. Unblock and press Retry map: the page reloads and the map appears.
3. Normal load: no new console errors; the map and tree look exactly as before.

- [ ] **Step 9: Commit**

```bash
git add src/lib/wine-map/tree-load.ts src/lib/wine-map/tree-load.test.ts src/app/knowledge/map/map-error-boundary.tsx src/app/knowledge/map/map-error-boundary.test.ts src/app/knowledge/map/tile-wine-map-explorer.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "fix(map): error boundary around the map and a visible tree-load failure" -m "MapErrorBoundary turns a render/effect throw or a failed next/dynamic chunk into the existing Retry map card instead of a white page (Retry remounts the map; a chunk error reloads). The place tree loads through a loading/ready/failed reducer with one automatic retry after 2 s and a Retry in the tree card; a failed tree no longer reads as 'still loading'." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `?debugPerf=1` probe

**Files:**
- Create: `src/lib/wine-map/perf-stats.ts`
- Create: `src/lib/wine-map/perf-stats.test.ts`
- Create: `src/lib/wine-map/maplibre-internals.test.ts`
- Create: `src/app/knowledge/map/perf-probe.tsx`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` (after Task 3) — imports (line 50), after `clickDebugEnabled` (lines 131-134), after the `debugClick` memo (lines 851-852), after `</Map>` (line 1691)

**Interfaces:**
- Consumes: `onSelect(key, source?)` (TileWineMap prop), `mapRef.current?.getMap()` (react-map-gl `MapRef`).
- Produces (`perf-stats.ts`):
  ```ts
  export type FrameSample = { at: number; delta: number };
  export type TaskSample = { at: number; duration: number };
  export type FrameStats = { frames: number; worst: number; over50: number; over100: number; p95: number };
  export function frameStats(deltas: readonly number[]): FrameStats;
  export function deltasBetween(frames: readonly FrameSample[], from: number, to: number): number[];
  export function trimToWindow(samples: { at: number }[], now: number, windowMs: number): void;
  export function longTaskEntryType(supported: readonly string[]): "long-animation-frame" | "longtask" | null;
  export type GestureMetrics = FrameStats & { longTasks: number | null; worstTask: number | null; toIdle: number; reloads: number };
  export function gestureMetrics(input: { frames: readonly FrameSample[]; tasks: readonly TaskSample[] | null;
    from: number; to: number; reloads: number }): GestureMetrics;
  export type ProbeStep =
    | { name: string; kind: "jump" | "ease" | "fly"; center: [number, number]; zoom: number; durationMs: number }
    | { name: string; kind: "select"; key: string };
  export const PROBE_SCRIPT: readonly ProbeStep[];
  export const PROBE_IDLE_TIMEOUT_MS = 20_000;
  export type ReloadCountable = { style?: unknown; on(type: string, listener: (...args: unknown[]) => void): unknown;
    off(type: string, listener: (...args: unknown[]) => void): unknown };
  export type ReloadCounter = { count(): number; bySource(): Record<string, number>; hooked(): boolean; restore(): void };
  export function installReloadCounter(map: ReloadCountable): ReloadCounter;
  export function sourcesReloaded(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): string[];
  export type IdleWaitable = { on(...): unknown; off(...): unknown; triggerRepaint(): void };
  export function waitForIdle(map: IdleWaitable, timeoutMs: number): Promise<{ timedOut: boolean }>;
  ```
- Produces (`perf-probe.tsx`): `export function PerfProbe(props: { getMap: () => maplibregl.Map | null; onSelect: (key: string, source?: "map" | "ui") => void }): JSX.Element`. Each copied gesture carries `reloadsCounted: boolean` beside `reloads` / `reloadedSources`; false means the counter could not hook this MapLibre and the reload columns are not a measurement (the table prints "n/a").
- Produces (`maplibre-internals.test.ts`): a guard, no exports. It pins the installed `maplibre-gl` to `5.24.x` and checks that the shipped bundle still defines and calls `Style#_reloadSource`. Later phases add a line to its header list, and a check where they can, for every internal they start using (1b: `style._loaded`; 1b's bundled-style-engine: the dev bundle's chunk markers; 1c: `Style#addLayer`'s add-then-throw order).
- The script has TWO selections (rows 5 and 6). From Phase 1b on, row 5 is the visit's first selection. It flips `wm_has_sel` false → true, so it reloads EVERY mounted source. That is accepted in spec §5.2 and recorded, not judged by A2. Tasks 13, 17 and 24 read A2 from row 6 only. Row 6's `reloadedSources` must be at most `wine-world` plus one or two `wine-shard-*`, and row 6's `reloadsCounted` must be true. Those tasks also record row 5's frame columns (worst, >50, long tasks), so G1's "a tree selection has no long task" is judged on both a first and a later selection. A1 uses the frame columns of every row.

- [ ] **Step 1: Write the failing test**

Create `src/lib/wine-map/perf-stats.test.ts`:

```ts
// The probe's arithmetic and its two map hooks, with fakes: frame statistics,
// windowing, which long-task API to trust, per-gesture metrics, the reload
// counter (including a full style rebuild) and the idle wait (including the
// timeout). The overlay itself (perf-probe.tsx) is checked in the browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deltasBetween,
  frameStats,
  gestureMetrics,
  installReloadCounter,
  longTaskEntryType,
  PROBE_SCRIPT,
  sourcesReloaded,
  trimToWindow,
  waitForIdle,
  type FrameSample,
} from "./perf-stats";
import { shardKeyFor } from "./shard";

describe("frameStats", () => {
  it("counts hitches and freezes and takes the nearest-rank p95", () => {
    // 17 smooth frames, one 40 ms stutter, one 60 ms hitch, one 120 ms freeze.
    const deltas = [...Array<number>(17).fill(16.7), 40, 60, 120];
    expect(frameStats(deltas)).toEqual({
      frames: 20,
      worst: 120,
      over50: 2,
      over100: 1,
      // ceil(0.95 * 20) = 19th smallest.
      p95: 60,
    });
  });

  it("is all zeros with no frames", () => {
    expect(frameStats([])).toEqual({ frames: 0, worst: 0, over50: 0, over100: 0, p95: 0 });
  });

  it("does not count a frame of exactly 50 or 100 ms as over", () => {
    expect(frameStats([50, 100])).toMatchObject({ over50: 1, over100: 0, worst: 100 });
  });
});

describe("deltasBetween / trimToWindow", () => {
  const frames: FrameSample[] = [
    { at: 1000, delta: 16 },
    { at: 1016, delta: 16 },
    { at: 1100, delta: 84 },
    { at: 1117, delta: 17 },
  ];

  it("keeps the frames that ended inside (from, to]", () => {
    expect(deltasBetween(frames, 1000, 1100)).toEqual([16, 84]);
  });

  it("drops samples older than the window, in place", () => {
    const samples = frames.map((f) => ({ ...f }));
    trimToWindow(samples, 1117, 50);
    expect(samples.map((s) => s.at)).toEqual([1100, 1117]);
    trimToWindow(samples, 5000, 50);
    expect(samples).toEqual([]);
  });
});

describe("longTaskEntryType", () => {
  it("prefers Long Animation Frames, then long tasks, then nothing (WebKit)", () => {
    expect(longTaskEntryType(["longtask", "long-animation-frame", "paint"])).toBe(
      "long-animation-frame",
    );
    expect(longTaskEntryType(["longtask", "paint"])).toBe("longtask");
    expect(longTaskEntryType(["mark", "measure", "paint"])).toBeNull();
  });
});

describe("gestureMetrics", () => {
  const frames: FrameSample[] = [
    { at: 90, delta: 16 },
    { at: 116, delta: 26 },
    { at: 250, delta: 134 },
    { at: 266, delta: 16 },
    { at: 900, delta: 16 },
  ];

  it("summarises one gesture's frames, long tasks, time to idle and reloads", () => {
    expect(
      gestureMetrics({
        frames,
        tasks: [
          { at: 50, duration: 300 },
          { at: 120, duration: 134 },
          { at: 400, duration: 60 },
        ],
        from: 100,
        to: 500,
        reloads: 3,
      }),
    ).toEqual({
      frames: 3,
      worst: 134,
      over50: 1,
      over100: 1,
      p95: 134,
      longTasks: 2,
      worstTask: 134,
      toIdle: 400,
      reloads: 3,
    });
  });

  it("reports long tasks as n/a (null) where the browser has no API", () => {
    const metrics = gestureMetrics({ frames, tasks: null, from: 100, to: 500, reloads: 0 });
    expect(metrics.longTasks).toBeNull();
    expect(metrics.worstTask).toBeNull();
  });

  it("reports zero, not null, when the API exists and nothing was long", () => {
    const metrics = gestureMetrics({ frames, tasks: [], from: 100, to: 500, reloads: 0 });
    expect(metrics.longTasks).toBe(0);
    expect(metrics.worstTask).toBe(0);
  });
});

describe("PROBE_SCRIPT", () => {
  it("is the spec's fixed gesture list, in order", () => {
    expect(PROBE_SCRIPT.map((step) => step.kind)).toEqual([
      "jump", "ease", "fly", "ease", "select", "select", "ease",
    ]);
    expect(PROBE_SCRIPT[0]).toMatchObject({ zoom: 4.4, center: [2.4, 46.6] });
    expect(PROBE_SCRIPT[1]).toMatchObject({ zoom: 5.5, durationMs: 1000 });
    expect(PROBE_SCRIPT[2]).toMatchObject({ zoom: 9, durationMs: 1500 });
    expect(PROBE_SCRIPT[3]).toMatchObject({ zoom: 13 });
    expect(PROBE_SCRIPT[4]).toMatchObject({
      key: "france.bourgogne.cote-de-nuits.vosne-romanee",
    });
    expect(PROBE_SCRIPT[5]).toMatchObject({
      key: "france.bourgogne.cote-de-nuits.gevrey-chambertin",
    });
    expect(PROBE_SCRIPT[6]).toMatchObject({ zoom: 4.4 });
  });

  it("selects twice, two places in one shard, so the second row measures A2", () => {
    // The first selection of a visit flips wm_has_sel and reloads every
    // mounted source (Phase 1b on); only a later selection shows the
    // steady-state cost, and in the same shard it may reload at most the
    // world source and that one shard.
    const keys = PROBE_SCRIPT.flatMap((step) => (step.kind === "select" ? [step.key] : []));
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.map(shardKeyFor)).toEqual(["bourgogne", "bourgogne"]);
  });
});

/** A map with the parts the counter and the idle wait touch. */
function fakeMap() {
  class FakeStyle {
    reloaded: string[] = [];
    _reloadSource(id: string) {
      this.reloaded.push(id);
    }
  }
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const map = {
    style: new FakeStyle() as FakeStyle | undefined,
    repaints: 0,
    on(type: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    off(type: string, fn: (...args: unknown[]) => void) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
    triggerRepaint() {
      map.repaints += 1;
    },
    FakeStyle,
  };
  return map;
}

describe("installReloadCounter", () => {
  it("counts every reload per source and still reloads", () => {
    const map = fakeMap();
    const style = map.style!;
    const counter = installReloadCounter(map);
    expect(counter.hooked()).toBe(true);
    style._reloadSource("wine-world");
    style._reloadSource("wine-shard-bourgogne");
    style._reloadSource("wine-world");
    expect(counter.count()).toBe(3);
    expect(counter.bySource()).toEqual({ "wine-world": 2, "wine-shard-bourgogne": 1 });
    // The real method still ran, with `this` intact.
    expect(style.reloaded).toEqual(["wine-world", "wine-shard-bourgogne", "wine-world"]);
  });

  it("follows a full rebuild to the new style object", () => {
    const map = fakeMap();
    const counter = installReloadCounter(map);
    map.style = new map.FakeStyle();
    // Between the swap and style.load the new style is not wrapped yet.
    expect(counter.hooked()).toBe(false);
    map.fire("style.load");
    expect(counter.hooked()).toBe(true);
    map.style._reloadSource("wine-shard-alsace");
    expect(counter.count()).toBe(1);
  });

  it("restore puts every style back and stops listening", () => {
    const map = fakeMap();
    const first = map.style!;
    const counter = installReloadCounter(map);
    map.style = new map.FakeStyle();
    map.fire("style.load");
    const second = map.style;
    counter.restore();
    expect(counter.hooked()).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(first, "_reloadSource")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(second, "_reloadSource")).toBe(false);
    first._reloadSource("wine-world");
    expect(counter.count()).toBe(0);
    expect(map.listenerCount("style.load")).toBe(0);
  });

  it("does nothing on a map without a style yet, and hooks the style once it loads", () => {
    const map = fakeMap();
    map.style = undefined;
    const counter = installReloadCounter(map);
    expect(counter.count()).toBe(0);
    expect(counter.hooked()).toBe(false);
    map.style = new map.FakeStyle();
    map.fire("style.load");
    expect(counter.hooked()).toBe(true);
    expect(() => counter.restore()).not.toThrow();
  });

  it("is not hooked on a MapLibre whose Style has no _reloadSource", () => {
    // A later MapLibre that renamed the internal: the counter must say so
    // (the probe prints "n/a") rather than report 0 reloads, which would
    // pass A2 without measuring anything.
    const map = fakeMap();
    const renamed = { reloaded: [] as string[] };
    const counter = installReloadCounter({
      style: renamed,
      on: (type, fn) => map.on(type, fn),
      off: (type, fn) => map.off(type, fn),
    });
    expect(counter.hooked()).toBe(false);
    expect(counter.count()).toBe(0);
    expect("_reloadSource" in renamed).toBe(false);
    counter.restore();
    expect(map.listenerCount("style.load")).toBe(0);
  });
});

describe("sourcesReloaded", () => {
  it("lists the sources whose count went up, sorted", () => {
    expect(
      sourcesReloaded(
        { "wine-world": 2, "wine-shard-bourgogne": 1 },
        { "wine-world": 2, "wine-shard-bourgogne": 2, "wine-shard-alsace": 1 },
      ),
    ).toEqual(["wine-shard-alsace", "wine-shard-bourgogne"]);
  });
});

describe("waitForIdle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves at the next idle, asks for a repaint, and unsubscribes", async () => {
    vi.useFakeTimers();
    const map = fakeMap();
    const idle = waitForIdle(map, 20_000);
    expect(map.repaints).toBe(1);
    map.fire("idle");
    await expect(idle).resolves.toEqual({ timedOut: false });
    expect(map.listenerCount("idle")).toBe(0);
    // The timeout was cleared: nothing left to fire.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives up after the timeout and unsubscribes", async () => {
    vi.useFakeTimers();
    const map = fakeMap();
    const idle = waitForIdle(map, 20_000);
    vi.advanceTimersByTime(20_000);
    await expect(idle).resolves.toEqual({ timedOut: true });
    expect(map.listenerCount("idle")).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/wine-map/perf-stats.test.ts`
Expected: FAIL — `Error: Cannot find module './perf-stats' imported from '…/src/lib/wine-map/perf-stats.test.ts'`.

- [ ] **Step 3: Implement `perf-stats.ts`**

```ts
// The numbers behind the wine map's `?debugPerf=1` probe (perf-probe.tsx):
// frame and long-task statistics, the fixed gesture script, a counter of
// MapLibre source reloads, and an idle wait.
//
// The probe exists so the same measurement can be taken on the owner's own
// phone as on a desktop: WebKit (every iPhone browser) has neither the
// Long Tasks nor the Long Animation Frames API, so the frame intervals seen by
// requestAnimationFrame are the one signal every browser gives.
//
// Pure: no DOM and no maplibre value import. The map is reached through narrow
// structural types, so vitest drives the reload counter and the idle wait with
// fakes.

/** One requestAnimationFrame interval: `at` is the frame's timestamp, `delta`
    the time since the previous frame, both in performance.now() milliseconds. */
export type FrameSample = { at: number; delta: number };

/** One long task or long animation frame: `at` is its startTime. */
export type TaskSample = { at: number; duration: number };

export type FrameStats = {
  frames: number;
  worst: number;
  over50: number;
  over100: number;
  p95: number;
};

/** Frame-interval statistics. A 60 Hz frame is ~16.7 ms; over 50 ms is a
    visible hitch, over 100 ms the freeze the owner reported. p95 is the
    nearest-rank percentile, so it is always one of the measured intervals. */
export function frameStats(deltas: readonly number[]): FrameStats {
  if (deltas.length === 0) return { frames: 0, worst: 0, over50: 0, over100: 0, p95: 0 };
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    frames: deltas.length,
    worst: sorted[sorted.length - 1],
    over50: deltas.filter((delta) => delta > 50).length,
    over100: deltas.filter((delta) => delta > 100).length,
    p95: sorted[Math.ceil(0.95 * sorted.length) - 1],
  };
}

/** The intervals of the frames that ENDED inside (from, to]. */
export function deltasBetween(
  frames: readonly FrameSample[],
  from: number,
  to: number,
): number[] {
  return frames.filter((f) => f.at > from && f.at <= to).map((f) => f.delta);
}

/** Drops samples older than `windowMs` before `now`, in place. Samples are
    pushed in time order, so the old ones are always at the front. */
export function trimToWindow(samples: { at: number }[], now: number, windowMs: number): void {
  let drop = 0;
  while (drop < samples.length && samples[drop].at < now - windowMs) drop += 1;
  if (drop > 0) samples.splice(0, drop);
}

/** Which long-task entry type to observe: Long Animation Frames where the
    browser has them (they include rendering, which is where a map spends its
    frame), else classic long tasks, else none (WebKit) — never both, which
    would count one stall twice. */
export function longTaskEntryType(
  supported: readonly string[],
): "long-animation-frame" | "longtask" | null {
  if (supported.includes("long-animation-frame")) return "long-animation-frame";
  if (supported.includes("longtask")) return "longtask";
  return null;
}

export type GestureMetrics = FrameStats & {
  /** Long tasks that started inside the gesture; null where the browser has
      no long-task API. */
  longTasks: number | null;
  worstTask: number | null;
  /** From the gesture's start to the map's `idle`. */
  toIdle: number;
  reloads: number;
};

export function gestureMetrics(input: {
  frames: readonly FrameSample[];
  tasks: readonly TaskSample[] | null;
  from: number;
  to: number;
  reloads: number;
}): GestureMetrics {
  const { frames, tasks, from, to, reloads } = input;
  const inside = tasks ? tasks.filter((t) => t.at >= from && t.at <= to) : null;
  return {
    ...frameStats(deltasBetween(frames, from, to)),
    longTasks: inside ? inside.length : null,
    worstTask: inside ? inside.reduce((worst, t) => Math.max(worst, t.duration), 0) : null,
    toIdle: to - from,
    reloads,
  };
}

/** The fixed gesture script, so runs stay comparable across phases and
    devices: the opening view, the first zoom past z5 (the owner's lag), a fly
    into Burgundy, a zoom to climat level, two selections, and back out.

    Two selections, because from Phase 1b on the first selection of a visit
    flips `wm_has_sel` from false to true, and every wine layer's paint reads
    it: MapLibre reloads EVERY mounted source for that one change (accepted,
    spec §5.2). The second selection, a sibling village in the same shard,
    is the steady-state cost A2 judges: at most `wine-world` plus the old and
    new selected shard. */
export type ProbeStep =
  | {
      name: string;
      kind: "jump" | "ease" | "fly";
      center: [number, number];
      zoom: number;
      durationMs: number;
    }
  | { name: string; kind: "select"; key: string };

const FRANCE: [number, number] = [2.4, 46.6];
const BOURGOGNE: [number, number] = [4.84, 47.05];
const VOSNE_ROMANEE: [number, number] = [4.955, 47.16];

export const PROBE_SCRIPT: readonly ProbeStep[] = [
  { name: "Open France z4.4", kind: "jump", center: FRANCE, zoom: 4.4, durationMs: 0 },
  { name: "First zoom to z5.5", kind: "ease", center: FRANCE, zoom: 5.5, durationMs: 1000 },
  { name: "Fly to Bourgogne z9", kind: "fly", center: BOURGOGNE, zoom: 9, durationMs: 1500 },
  { name: "Zoom to z13, Vosne", kind: "ease", center: VOSNE_ROMANEE, zoom: 13, durationMs: 1500 },
  { name: "Select Vosne-Romanée", kind: "select", key: "france.bourgogne.cote-de-nuits.vosne-romanee" },
  { name: "Select Gevrey-Chambertin", kind: "select", key: "france.bourgogne.cote-de-nuits.gevrey-chambertin" },
  { name: "Zoom out to z4.4", kind: "ease", center: FRANCE, zoom: 4.4, durationMs: 1500 },
];

/** A gesture that has not reached `idle` by then is recorded as timed out
    rather than hanging the run (a tile that never loads, a hidden tab). */
export const PROBE_IDLE_TIMEOUT_MS = 20_000;

/** The map as the reload counter needs it: its current style object, and the
    `style.load` event that replaces that object on a full rebuild. */
export type ReloadCountable = {
  style?: unknown;
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  off(type: string, listener: (...args: unknown[]) => void): unknown;
};

export type ReloadCounter = {
  count(): number;
  bySource(): Record<string, number>;
  /** Whether the style in use right now is wrapped. False on a MapLibre whose
      Style has no `_reloadSource` — the probe then shows "n/a", never a 0
      that would pass A2 without measuring anything. */
  hooked(): boolean;
  restore(): void;
};

type ReloadingStyle = { _reloadSource?: (this: unknown, id: string) => unknown };

/**
 * Counts MapLibre source reloads — every filter, layout or data-driven paint
 * change on a source's layers makes the style reload that source's tiles, and
 * that re-parse is the cost a selection or a grape pick pays. Wraps the
 * (internal) Style#_reloadSource, which MapLibre 5.24 calls as
 * `this._reloadSource(id)` from Style#update and the global-state path, and
 * re-wraps the new style after a full rebuild. Probe mode only; `restore`
 * puts every wrapped style back. maplibre-internals.test.ts fails if the
 * installed bundle stops calling it that way.
 */
export function installReloadCounter(map: ReloadCountable): ReloadCounter {
  const perSource = new Map<string, number>();
  let total = 0;
  const wrapped: {
    style: ReloadingStyle;
    own: boolean;
    original: (this: unknown, id: string) => unknown;
  }[] = [];
  const wrap = () => {
    const style = map.style as ReloadingStyle | undefined;
    if (!style || typeof style._reloadSource !== "function") return;
    if (wrapped.some((w) => w.style === style)) return;
    const original = style._reloadSource;
    const own = Object.prototype.hasOwnProperty.call(style, "_reloadSource");
    style._reloadSource = function (this: unknown, id: string) {
      total += 1;
      perSource.set(id, (perSource.get(id) ?? 0) + 1);
      return original.call(this, id);
    };
    wrapped.push({ style, own, original });
  };
  wrap();
  map.on("style.load", wrap);
  return {
    count: () => total,
    bySource: () => Object.fromEntries(perSource),
    hooked: () => wrapped.some((w) => w.style === map.style),
    restore() {
      map.off("style.load", wrap);
      for (const w of wrapped) {
        if (w.own) w.style._reloadSource = w.original;
        else delete w.style._reloadSource;
      }
      wrapped.length = 0;
    },
  };
}

/** The sources whose reload count went up between two bySource() readings. */
export function sourcesReloaded(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): string[] {
  return Object.keys(after)
    .filter((id) => after[id] > (before[id] ?? 0))
    .sort();
}

export type IdleWaitable = {
  on(type: string, listener: (...args: unknown[]) => void): unknown;
  off(type: string, listener: (...args: unknown[]) => void): unknown;
  triggerRepaint(): void;
};

/** Resolves at the map's next `idle` (camera still, every tile loaded,
    nothing pending), or after `timeoutMs` with timedOut. A map that is
    already idle fires no further `idle` until something renders, so this
    asks for one repaint. */
export function waitForIdle(
  map: IdleWaitable,
  timeoutMs: number,
): Promise<{ timedOut: boolean }> {
  return new Promise((resolve) => {
    const finish = (timedOut: boolean) => {
      map.off("idle", onIdle);
      clearTimeout(timer);
      resolve({ timedOut });
    };
    const onIdle = () => finish(false);
    map.on("idle", onIdle);
    const timer = setTimeout(() => finish(true), timeoutMs);
    map.triggerRepaint();
  });
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run src/lib/wine-map/perf-stats.test.ts`
Expected: PASS — 19 tests.

- [ ] **Step 5: Pin the MapLibre internal the counter wraps**

`installReloadCounter` wraps `Style#_reloadSource`, a private method. `package.json` allows `^5.24.0`, so a later `npm install` can bring in a minor version that renames it. The counter then stays unhooked. Step 3's `hooked()` makes the probe print "n/a" in that case, and this guard makes the suite fail as well. Create `src/lib/wine-map/maplibre-internals.test.ts`:

```ts
// The wine map leans on MapLibre internals that no semver promise covers, and
// package.json allows `^5.24.0`, so `npm install` can move the minor version
// under it. This file fails loudly when that happens, instead of letting a
// renamed internal fail silently in production or in a measurement.
//
// Internals in use (re-verify each against the new version's src/ before
// raising the pin below):
// - Style#_reloadSource(id) — perf-stats.ts's reload counter (the probe's
//   A2 column). Checked here in the shipped bundle as well.
// Later phases add their own lines here as they start relying on one.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), "node_modules/maplibre-gl/package.json"), "utf8"),
) as { version: string; main: string };

// The bundle the app actually ships (package.json `main`), not the dev one.
const bundle = readFileSync(
  path.join(process.cwd(), "node_modules/maplibre-gl", pkg.main),
  "utf8",
);

/** The next `span` characters of the bundle from `marker`, or "" when the
    marker is gone. */
function after(marker: string, span: number): string {
  const at = bundle.indexOf(marker);
  return at === -1 ? "" : bundle.slice(at, at + span);
}

describe("MapLibre internals the wine map relies on", () => {
  it("is the minor version they were verified against", () => {
    // A failure here is not a bug: read the list at the top of this file
    // against the new version, then update this line.
    expect(pkg.version).toMatch(/^5\.24\./);
  });

  it("Style still reloads a source through _reloadSource(id)", () => {
    // The method itself…
    expect(bundle).toMatch(/[;}]_reloadSource\([\w$]+\)\{this\.tileManagers\[/);
    // …called from Style#update for a filter/layout/data-driven paint change…
    expect(after('"reload"===', 60)).toContain("this._reloadSource(");
    // …and from the global-state path (setGlobalStateProperty).
    expect(after('this.dispatcher.broadcast("UGS"', 120)).toContain("this._reloadSource(");
  });
});
```

The three bundle checks match `dist/maplibre-gl.js` 5.24.0 as shipped: `…clearTiles();}_reloadSource(e){this.tileManagers[e].resume()…`, `if("reload"===t)this._reloadSource(e)`, and `this.dispatcher.broadcast("UGS",i);for(const e in this.tileManagers)t.has(e)&&(this._reloadSource(e)…`.

Run: `npx vitest run src/lib/wine-map/maplibre-internals.test.ts`
Expected: PASS — 2 tests. This is a guard on the installed package, so it has no red step at 5.24.0. It goes red on a 5.25+ install, or if `_reloadSource` leaves either call path.

- [ ] **Step 6: Create the overlay**

Create `src/app/knowledge/map/perf-probe.tsx`. It drives the real map instance handed in through `getMap` (TileWineMap passes `mapRef.current?.getMap()`), waits for MapLibre's `idle` after every gesture with `PROBE_IDLE_TIMEOUT_MS`, and observes long tasks only when `PerformanceObserver.supportedEntryTypes` lists them (WebKit falls back to the rAF frame columns):

```tsx
"use client";

// `?debugPerf=1`: a small overlay on the map card that measures the map where
// it actually runs — the owner's iPhone included, where there is no DevTools
// timeline. A live readout (worst frame and hitches over the last 10 s, long
// tasks where the browser reports them), and **Run test**, which plays the
// fixed gesture script (lib/wine-map/perf-stats PROBE_SCRIPT) on the real map
// and tabulates each gesture; **Copy results** puts the run on the clipboard as
// JSON with the device facts that make two runs comparable.
//
// TileWineMap renders this only when the query parameter is present, so
// nothing here runs — no rAF loop, no observer, no wrapper — for anyone else.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  deltasBetween,
  frameStats,
  gestureMetrics,
  installReloadCounter,
  longTaskEntryType,
  PROBE_IDLE_TIMEOUT_MS,
  PROBE_SCRIPT,
  sourcesReloaded,
  trimToWindow,
  waitForIdle,
  type FrameSample,
  type GestureMetrics,
  type ProbeStep,
  type TaskSample,
} from "@/lib/wine-map/perf-stats";

// The live readout covers the last 10 s. Samples are kept longer so a slow
// gesture (up to the 20 s idle timeout) never loses its first frames.
const LIVE_WINDOW_MS = 10_000;
const KEEP_MS = PROBE_IDLE_TIMEOUT_MS + LIVE_WINDOW_MS;
const READOUT_EVERY_MS = 500;
// Long-task entries are delivered asynchronously; give the observer this long
// after `idle` to report the gesture's last frames before reading them.
const OBSERVER_SETTLE_MS = 250;

// `reloadsCounted` false: the reload counter could not hook this MapLibre, so
// `reloads` is not a measurement (shown as "n/a", never as 0).
type Row = GestureMetrics & {
  name: string;
  timedOut: boolean;
  reloadsCounted: boolean;
  reloadedSources: string[];
};

function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = (left: number) => {
      if (left === 0) resolve();
      else requestAnimationFrame(() => tick(left - 1));
    };
    tick(count);
  });
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function playStep(
  map: MapLibreMap,
  step: ProbeStep,
  onSelect: (key: string, source?: "map" | "ui") => void,
) {
  // `essential`: under prefers-reduced-motion MapLibre would otherwise jump
  // instead of animating, and the run would measure a different gesture.
  switch (step.kind) {
    case "jump":
      map.jumpTo({ center: step.center, zoom: step.zoom });
      return;
    case "ease":
      map.easeTo({ center: step.center, zoom: step.zoom, duration: step.durationMs, essential: true });
      return;
    case "fly":
      map.flyTo({ center: step.center, zoom: step.zoom, duration: step.durationMs, essential: true });
      return;
    case "select":
      // "map" source: the explorer never moves the camera for a map-originated
      // selection, so this measures the selection's own paint and reload cost
      // at every canvas size — the tree's path differs only by a possible fly.
      onSelect(step.key, "map");
      return;
  }
}

const ms = (value: number | null) => (value === null ? "n/a" : String(Math.round(value)));

export function PerfProbe({
  getMap,
  onSelect,
}: {
  /** The live MapLibre instance (react-map-gl's MapRef.getMap()), or null
      before the map exists. */
  getMap: () => MapLibreMap | null;
  onSelect: (key: string, source?: "map" | "ui") => void;
}) {
  const framesRef = useRef<FrameSample[]>([]);
  const tasksRef = useRef<TaskSample[]>([]);
  // Read once: the entry types never change within a page load.
  const [taskApi] = useState(() =>
    longTaskEntryType(
      typeof PerformanceObserver === "undefined"
        ? []
        : (PerformanceObserver.supportedEntryTypes ?? []),
    ),
  );
  const [live, setLive] = useState({ worst: 0, over50: 0, tasks: null as number | null });
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  // Every frame interval, continuously.
  useEffect(() => {
    let handle = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      if (last !== null) framesRef.current.push({ at: now, delta: now - last });
      last = now;
      trimToWindow(framesRef.current, now, KEEP_MS);
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  // Long tasks / long animation frames, where the browser reports them.
  useEffect(() => {
    if (!taskApi) return;
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tasksRef.current.push({ at: entry.startTime, duration: entry.duration });
        }
        trimToWindow(tasksRef.current, performance.now(), KEEP_MS);
      });
      observer.observe({ type: taskApi, buffered: false });
    } catch {
      // An observer the browser refuses just means no long-task column.
      observer = null;
    }
    return () => observer?.disconnect();
  }, [taskApi]);

  // The live readout.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      const stats = frameStats(deltasBetween(framesRef.current, now - LIVE_WINDOW_MS, now));
      setLive({
        worst: stats.worst,
        over50: stats.over50,
        tasks: taskApi
          ? tasksRef.current.filter((t) => t.at >= now - LIVE_WINDOW_MS).length
          : null,
      });
    }, READOUT_EVERY_MS);
    return () => window.clearInterval(id);
  }, [taskApi]);

  const run = useCallback(async () => {
    const map = getMap();
    if (!map) {
      setNote("The map is not ready yet.");
      return;
    }
    setRunning(true);
    setRows([]);
    setReport(null);
    setShowReport(false);
    setNote(null);
    const reloads = installReloadCounter(map);
    if (!reloads.hooked()) {
      setNote("No reload counts: this MapLibre has no Style#_reloadSource.");
    }
    const done: Row[] = [];
    try {
      for (const step of PROBE_SCRIPT) {
        const reloadsBefore = reloads.count();
        const sourcesBefore = reloads.bySource();
        const from = performance.now();
        playStep(map, step, onSelect);
        // Two frames so the camera is moving (or React has committed the
        // selection) before listening for idle — otherwise the idle of the
        // frame before the gesture could end it at once.
        await frames(2);
        const { timedOut } = await waitForIdle(map, PROBE_IDLE_TIMEOUT_MS);
        const to = performance.now();
        await pause(OBSERVER_SETTLE_MS);
        done.push({
          name: step.name,
          timedOut,
          reloadsCounted: reloads.hooked(),
          reloadedSources: sourcesReloaded(sourcesBefore, reloads.bySource()),
          ...gestureMetrics({
            frames: framesRef.current,
            tasks: taskApi ? tasksRef.current : null,
            from,
            to,
            reloads: reloads.count() - reloadsBefore,
          }),
        });
        setRows([...done]);
      }
      const canvas = map.getCanvas();
      setReport(
        JSON.stringify(
          {
            ranAt: new Date().toISOString(),
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio,
            canvas: { width: canvas.clientWidth, height: canvas.clientHeight },
            cores: navigator.hardwareConcurrency ?? null,
            longTaskApi: taskApi,
            gestures: done,
          },
          null,
          2,
        ),
      );
    } finally {
      reloads.restore();
      setRunning(false);
    }
  }, [getMap, onSelect, taskApi]);

  const copy = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setNote("Copied.");
    } catch {
      // Clipboard refused (permissions, an old WebKit): show the JSON so it
      // can be selected by hand.
      setNote("Copy failed — select the text below.");
      setShowReport(true);
    }
  }, [report]);

  return (
    <div className="absolute left-2 top-[112px] z-10 w-[300px] max-w-[calc(100%-1rem)] rounded-md border border-border bg-background/90 p-2 text-[11px] leading-tight text-foreground shadow-sm backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">Perf probe</span>
        <span className="tabular-nums text-muted-foreground">
          10 s: worst {ms(live.worst)} ms · &gt;50 ms {live.over50} · long{" "}
          {live.tasks ?? "n/a"}
        </span>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="rounded border border-border px-2 py-0.5 font-medium disabled:opacity-50"
        >
          {running ? "Running…" : "Run test"}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!report}
          className="rounded border border-border px-2 py-0.5 font-medium disabled:opacity-50"
        >
          Copy results
        </button>
      </div>
      <p className="mt-1 text-muted-foreground">
        Cold numbers: run once per page load, before touching the map.
      </p>
      {note ? <p className="mt-1 text-muted-foreground">{note}</p> : null}
      {rows.length > 0 ? (
        <table className="mt-1.5 w-full tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-normal">Gesture</th>
              <th className="text-right font-normal">Worst</th>
              <th className="text-right font-normal">&gt;50</th>
              <th className="text-right font-normal">&gt;100</th>
              <th className="text-right font-normal">Long</th>
              <th className="text-right font-normal">Idle</th>
              <th className="text-right font-normal">Rel.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="pr-1">{row.name}</td>
                <td className="text-right">{ms(row.worst)}</td>
                <td className="text-right">{row.over50}</td>
                <td className="text-right">{row.over100}</td>
                <td className="text-right">
                  {row.longTasks === null ? "n/a" : `${row.longTasks} (${ms(row.worstTask)})`}
                </td>
                <td className="text-right">
                  {ms(row.toIdle)}
                  {row.timedOut ? "+" : ""}
                </td>
                <td className="text-right">{row.reloadsCounted ? row.reloads : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {report && showReport ? (
        <textarea
          readOnly
          value={report}
          className="mt-1.5 h-24 w-full rounded border border-border bg-background p-1 font-mono text-[10px]"
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: Render it from `TileWineMap` behind the query parameter**

All edits in `src/app/knowledge/map/tile-wine-map.tsx`.

(a) Line 50. Replace:

```tsx
import { cn } from "@/lib/utils";
```

with:

```tsx
import { cn } from "@/lib/utils";
import { PerfProbe } from "./perf-probe";
```

(b) After `clickDebugEnabled`, lines 131-134. Replace:

```tsx
function clickDebugEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugClick") === "1";
}
```

with:

```tsx
function clickDebugEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugClick") === "1";
}

// `?debugPerf=1` shows the perf probe (perf-probe.tsx): a live worst-frame and
// long-task readout plus a scripted gesture run whose numbers can be copied off
// a phone. Off by default; nothing records or renders without the param.
function perfProbeEnabled() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debugPerf") === "1";
}
```

(c) Lines 851-852. Replace:

```tsx
  const noFills = useMemo(() => fillsDisabled(), []);
  const debugClick = useMemo(() => clickDebugEnabled(), []);
```

with:

```tsx
  const noFills = useMemo(() => fillsDisabled(), []);
  const debugClick = useMemo(() => clickDebugEnabled(), []);
  const perfProbe = useMemo(() => perfProbeEnabled(), []);
  // The probe's handle on the live MapLibre instance; read when a run starts,
  // so it always drives the map that exists then.
  const getProbeMap = useCallback(() => mapRef.current?.getMap() ?? null, []);
```

(d) After the map, line 1691. Replace:

```tsx
      </Map>
      <div className="absolute bottom-2 left-2 max-w-[75%] rounded-md border border-border bg-background/85 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm">
```

with:

```tsx
      </Map>
      {perfProbe ? <PerfProbe getMap={getProbeMap} onSelect={onSelect} /> : null}
      <div className="absolute bottom-2 left-2 max-w-[75%] rounded-md border border-border bg-background/85 text-[11px] leading-tight text-muted-foreground backdrop-blur-sm">
```

- [ ] **Step 8: Types and lint**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/perf-probe.tsx src/lib/wine-map/perf-stats.ts src/lib/wine-map/perf-stats.test.ts src/lib/wine-map/maplibre-internals.test.ts` — expected: exit 0.
Run: `npx vitest run` — expected: PASS, 163 files (157 at base + `shard-specs`, `mount-policy`, `tree-load`, `map-error-boundary`, `perf-stats`, `maplibre-internals`).

- [ ] **Step 9: Manual verification (main session, browser)**

1. `/knowledge/map` without the parameter: no overlay renders, and `document.body.innerText.includes("Perf probe")` is false in the console.
2. `/knowledge/map?debugPerf=1` in desktop Chrome, on a fresh page load:
   - A small "Perf probe" box sits top-left under the zoom/compass buttons. Its live line updates every half second ("10 s: worst … ms · >50 ms … · long …"). In Chrome, "long" is a number.
   - Press Run test. The map plays the seven gestures in order:
     1. Open France at z4.4.
     2. Ease to z5.5.
     3. Fly to Bourgogne at z9.
     4. Ease to z13 over Vosne-Romanée.
     5. Select Vosne-Romanée. The gold ring appears and the camera does not move.
     6. Select Gevrey-Chambertin. The camera does not move. The ring moves off Vosne-Romanée; Gevrey's ring may sit off-screen to the north. This row measures paint and reload cost, not the camera.
     7. Ease back to z4.4.
   - One table row appears per gesture as each reaches idle. The Rel. column shows a number on every row, never "n/a", and no "No reload counts" note appears.
   - Copy results puts JSON on the clipboard. It holds `userAgent`, `devicePixelRatio`, `canvas`, `cores` and `longTaskApi: "long-animation-frame"`. Each gesture holds `worst`, `over50`, `over100`, `p95`, `longTasks`, `worstTask`, `toIdle`, `reloads`, `reloadsCounted`, `reloadedSources` and `timedOut`.
3. How to read the two selection rows, here and in Tasks 13, 17 and 24:
   - Row 5 ("Select Vosne-Romanée") is the visit's first selection. From Phase 1b on it flips `wm_has_sel` false → true, and MapLibre reloads EVERY mounted source. Its `reloadedSources` then lists `wine-world` and every mounted `wine-shard-*`. That is expected, accepted in spec §5.2, and not an A2 failure. Record its frame columns anyway: G1 is judged on this row too.
   - A2 is read from row 6 ("Select Gevrey-Chambertin") only. Its `reloadedSources` must be at most `wine-world` plus one or two `wine-shard-*`, both selections sitting in `wine-shard-bourgogne`. Its `reloadsCounted` must be `true`.
   - In this phase (1a), selection paint still uses literal keys, so both rows show today's cost. Record them as the baseline.
4. Phone width (375), and the owner's iPhone when available: the box fits inside the map, Run test completes, the Long column reads "n/a" on WebKit, and Copy results either copies the JSON or shows it in a text box.
5. Keep this run's copied JSON for Task 6. `master` has no probe, so Task 6 takes its baseline for the same seven gestures from a DevTools Performance recording: longest task, and frames over 50 and 100 ms.

- [ ] **Step 10: Commit**

```bash
git add src/lib/wine-map/perf-stats.ts src/lib/wine-map/perf-stats.test.ts src/lib/wine-map/maplibre-internals.test.ts src/app/knowledge/map/perf-probe.tsx src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): ?debugPerf=1 frame and long-task probe" -m "A small overlay with a live worst-frame / long-task readout and a scripted gesture run (first zoom, fly to Bourgogne, z13, two selections in one shard, zoom out) that tabulates frames over 50/100 ms, long tasks where the browser has the API, time to idle and MapLibre source reloads, and copies the run as JSON. Renders and records nothing without the query parameter. The second selection is the steady-state reload reading; the first one flips wm_has_sel from Phase 1b on." -m "maplibre-internals.test.ts pins maplibre-gl to 5.24.x and checks the shipped bundle still reloads through Style#_reloadSource, the internal the reload counter wraps; an unhooked counter shows n/a, never 0." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Phase 1a verification and production deploy (main session)
Checklist: full vitest, tsc, eslint on touched files, `next build`; production run (`start` config) with the perf protocol at 1440x900 and full view; A3 screenshot set light/dark against the frozen baseline server (`baseline-start`, port 3200, commit cd9acd5); the probe's seven gestures run on both; failure injection (block `get_wine_place_tree`); then fast-forward `master` to the branch head, `git push origin master`, wait for the Vercel deployment, smoke test on the live site (A5); on failure `git revert` + push.

---

## Phase 1b — static layer specs (global state + feature-state)

Phase 1b's outcome: after it, no React prop change rewrites a shard or world layer's filter, paint or layout. The grape gate, Local/English, the focus country's depth and the selected key are MapLibre global state (`wm_*`), the selection's emphasis is feature-state (`sel`/`child`/`rel`), and one `MapStateSync` writes both. The only visible change is D4 (other labels no longer change size or collision priority when something is selected).

Assumptions about the Phase 1a code these tasks edit (verify before starting; each task that edits `tile-wine-map.tsx` names its anchors):
- `src/lib/wine-map/shard-specs.ts` exists (Task 1) and defines, at module level, `classificationExpr` (moved verbatim from `tile-wine-map.tsx`), `type ColorExpression`, `type Bbox`, and imports `type MapPalette`. If Task 1 gave `classificationExpr` another name, use that name in Task 10's code.
- `TileWineMap` takes `areaSlugsByShard` (Task 2, default `NO_SLUGS_BY_SHARD`), still has `shardEntries`, `mountedShards`, `mountedSet`, `selectedShard`, `rampedRegions`, `palette`, `focusCountry`, `noFills`, and has Task 2's colour memos `plainShardColors` / `rampedShardColors` / `rampedSet` (built with `shardColorsFor`) followed by its selection-keyed `shardFillPaints` / `shardOutlinePaints` / `regionColor` / `worldRegionFillPaint` / `worldRegionOutlinePaint`, all between the lines `const areaPaletteLive = viewInfo.zoom >= AREA_PALETTE_ZOOM;` and `const attribution = useMemo(`. At module level Task 2 left the comment block `// Every colour a wine polygon paints comes from lib/wine-map/shard-specs: …`, then `buildOutlinePaint` and its re-commented `buildFillPaint(selectedKey, selectedId, color, ramp, hide)`, directly above the base file's `selectedFilter` … `labelPaint`.
- Files in the worktree have CRLF line endings (`core.autocrlf=true`). Snippets below are shown with LF; the Edit tool matches either, but a shell `sed` will not.

Review Focus pins in this phase: grape filter off vs on, `constructor`/`__proto__` — Task 7 (both engines, never-set/partial/null/set); style not loaded / full rebuild / write before load — Task 9; rapid selections across shards and countries, no stale `sel`/`rel`, `handed` untouched — Tasks 8 and 9; tree never arrives — pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (`shardFilter(null)` keeps full depth) and Task 18 (`mountTarget` with empty `shardCountries`), with Task 11's `fallbackFromContext` test adding that a stale context is ignored. **Skeleton fix:** the skeleton's Review Focus line "Tree never arrives" must read "Pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (shardFilter(null) keeps full depth) and Task 18 (mountTarget with empty shardCountries)" — it names Task 12, which is the readiness latch.

**Contract changes (fold into the skeleton's Interface Contracts block, so the assembled plan has one source of truth):**
```ts
// TileWineMap props (Task 11): `selectedId` and `selectedParentId` are REMOVED.
// The skeleton's Task 11 text says "`tree` prop and `selectedChildKeys`"; the
// drafts use a whole fallback object instead of a bare child list, because the
// fallback also needs the parent key:
tree?: readonly WinePlaceTreeNode[] | null;
selectionFallback?: { childKeys: string[]; parentKey: string | null } | null;

// src/lib/wine-map/selection-state.ts (Task 11 addition)
export function fallbackFromContext(
  context: { place: { key: string }; children: readonly { key: string }[]; ancestors: readonly { key: string }[] } | null,
  selectedKey: string | null,
): { childKeys: string[]; parentKey: string | null } | null;

// src/lib/wine-map/shard-specs.ts (Task 10 addition; moved from tile-wine-map.tsx)
export const WORLD_HANDED_FACTOR: unknown[];

// src/lib/wine-map/handoff.ts (Task 12 additions)
export type ShardProbe = { added: boolean; loaded: boolean; inView: boolean };
export function bboxInView(bbox: Bbox | undefined, view: Bbox): boolean;

// Test-only modules (Tasks 7 and 8)
// src/lib/testing/bundled-style-engine.ts
export function bundledStyleEngine(): BundledStyleEngine; // featureFilter, createExpression, v8Spec of maplibre-gl's own bundle
// src/lib/wine-map/__fixtures__/place-tree.ts
export const FIXTURE_PLACES: FixturePlace[];
export const FIXTURE_TREE: WinePlaceTreeNode[];
export function fixturePlace(key: string): FixturePlace;
export function tileProps(key: string): Record<string, unknown>;
```
`shardColorsFor` (Task 2) stays in use through 1b: Task 11 builds the static shard paints from Task 2's `plainShardColors`/`rampedShardColors` memos, so only a newly ramped shard's paint objects change identity.

Test helpers used across this phase: `src/lib/testing/bundled-style-engine.ts` (Task 7) evaluates expressions with the style-spec copy **bundled inside maplibre-gl** — the engine production runs — because it reads a never-set global-state name as `undefined` (once any other name is set) where the standalone `@maplibre/maplibre-gl-style-spec` reads `null`. Every truth table that decides what renders runs through both engines. `src/lib/wine-map/__fixtures__/place-tree.ts` (Task 8) is a small realistic tree plus the tile properties the pipeline writes for it; its country keys are the live English canonical keys (`france`, `italy`), as in Phases 1a, 1c and 2. `src/lib/testing/maplibre-internals.test.ts` (Task 7) is the tripwire for every MapLibre 5.24 internal the whole plan leans on (the dev bundle's chunk markers, `Style#_reloadSource`, `Style#_checkLoaded`, `Style#_loaded`, `Map#_updateDiff`): it fails loudly if `maplibre-gl` moves off 5.24 (package.json allows `^5.24.0`) or a patch renames one of them, so Phase 1a's probe and Phase 1c's controller need no copy of it.

### Task 7: `map-state.ts` — global-state names, null-safe pieces, desired state

**Files:**
- Create: `src/lib/testing/bundled-style-engine.ts`
- Create: `src/lib/wine-map/map-state.ts`
- Test: `src/lib/wine-map/map-state.test.ts`
- Test: `src/lib/testing/maplibre-internals.test.ts` (a tripwire for the MapLibre 5.24 internals this plan relies on)

**Interfaces:**
- Consumes: `keyLookupMap(keys: readonly string[]): Record<string, true>` (`key-gate.ts`), `englishTextFieldExpression(): unknown` (`localize-names.ts`).
- Produces (contract):
  ```ts
  export const GS = { keys: "wm_keys", local: "wm_local", hasSel: "wm_has_sel", selKey: "wm_sel_key", tick: "wm_tick" } as const;
  export function deepStateName(country: string): string;          // `wm_deep_${country}`
  export function grapeGateExpression(): unknown[];
  export function depthTerm(country: string): unknown[];
  export function labelTextField(): unknown[];
  export type DesiredGlobalState = Record<string, unknown>;
  export function desiredGlobalState(input: {
    visibleKeys: readonly string[] | null; english: boolean; selectedKey: string | null;
    deepCountries: readonly string[]; knownCountries: readonly string[];
  }): DesiredGlobalState;
  ```
- Produces (test helper, not in the skeleton): `bundledStyleEngine(): BundledStyleEngine` with `featureFilter(filter, globalState?)`, `createExpression(expression, propertySpec?, globalState?)`, `v8Spec` — the shared chunk of `maplibre-gl/dist/maplibre-gl-dev.js`.

Verified API details: standalone `featureFilter(filter, globalState?)` returns `{ filter(globals, feature) }`; `createExpression(expression, propertySpec?, globalState?)` returns `{ result: "success", value: StyleExpression }` whose `evaluate(globals, feature?, featureState?)` reads the SAME `globalState` object on every call (`addGlobalState(globals, this._globalState)`), so mutating that object between evaluations is exactly how MapLibre runs after `setGlobalStateProperty`. The bundled chunk exports `featureFilter`, `createExpression` and `v8Spec` (not `createPropertyExpression`).

- [ ] **Step 1: Write the bundled-engine test helper**

```ts
// The expression engine maplibre-gl actually ships, for tests.
//
// maplibre-gl's dist bundle carries its OWN copy of the style-spec, and it is
// not identical to the standalone @maplibre/maplibre-gl-style-spec package the
// other wine-map tests import: in 5.24.0 the bundled `global-state` expression
// returns `getOwn(state, key)` with no `?? null`, so a name that was never set
// reads as `undefined` once any OTHER name is set, while the standalone
// package reads null. `coalesce` passes undefined through and `==` is `===`,
// so an expression that is null-safe in one engine can be wrong in the other.
// Truth tables that decide what renders run through both.
//
// The dev bundle is an AMD-style file: `define('shared', ['exports'], f)` holds
// the style-spec and the rest of the shared code, `define('worker', ...)` the
// worker. Only the shared chunk is evaluated, with a stub `define`, the same
// way the bundle's own loader hands it an exports object.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

type Globals = { zoom: number };
type Feature = { type: 1 | 2 | 3; properties: Record<string, unknown>; id?: unknown };

export type BundledStyleEngine = {
  featureFilter(
    filter: unknown,
    globalState?: Record<string, unknown>,
  ): { filter(globals: Globals, feature: Feature): boolean };
  createExpression(
    expression: unknown,
    propertySpec?: unknown,
    globalState?: Record<string, unknown>,
  ):
    | {
        result: "success";
        value: {
          evaluate(globals: Globals, feature?: Feature, featureState?: Record<string, unknown>): unknown;
        };
      }
    | { result: "error"; value: { message: string }[] };
  v8Spec: Record<string, Record<string, unknown>>;
};

let engine: BundledStyleEngine | null = null;

export function bundledStyleEngine(): BundledStyleEngine {
  if (engine) return engine;
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("maplibre-gl/dist/maplibre-gl-dev.js"), "utf8");
  const start = source.indexOf("define('shared'");
  const end = source.indexOf("define('worker'");
  if (start < 0 || end <= start) {
    throw new Error("maplibre-gl's dev bundle no longer has a 'shared' chunk; update this loader");
  }
  const factories: Record<string, (exports: Record<string, unknown>) => void> = {};
  const define = (
    name: string,
    _deps: unknown,
    factory: (exports: Record<string, unknown>) => void,
  ) => {
    factories[name] = factory;
  };
  // The chunk reads `self` as its global object, as it would in a worker.
  const scope = globalThis as { self?: unknown };
  scope.self ??= globalThis;
  new Function("define", source.slice(start, end))(define);
  const shared: Record<string, unknown> = {};
  factories.shared(shared);
  for (const name of ["featureFilter", "createExpression", "v8Spec"]) {
    if (!(name in shared)) throw new Error(`maplibre-gl's shared chunk no longer exports ${name}`);
  }
  engine = shared as unknown as BundledStyleEngine;
  return engine;
}
```

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/wine-map/map-state.test.ts`
Expected: FAIL — `Error: Cannot find module './map-state' imported from '…/src/lib/wine-map/map-state.test.ts'`.

- [ ] **Step 4: Write the implementation**

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/wine-map/map-state.test.ts`
Expected: PASS, 14 tests. (The first bundled-engine case takes ~1 s: it evaluates the 3 MB dev bundle's shared chunk once per file.) These tables are the ones that catch the dangerous shapes: swapping the gate's first arm for `["==", gs, null]`, or the text-field test for a `coalesce`, passes in the standalone engine and FAILS in the bundled one.

- [ ] **Step 6: Add the MapLibre internals tripwire**

The bundled engine above, the `?debugPerf=1` reload counter (Task 5), MapStateSync's deferral (Task 9) and the shard controller (Phase 1c) each lean on a MapLibre 5.24 internal that no public API offers, while `package.json` allows `^5.24.0`. This test is the loud failure for an `npm update` that moves one of them; every other test would stay green. Create `src/lib/testing/maplibre-internals.test.ts`:

```ts
// A tripwire, not a behaviour test. The wine map leans on a few MapLibre
// internals that no public API offers, each verified against 5.24.0's source:
//   - the dev bundle's `define('shared'` / `define('worker'` chunks, which
//     bundled-style-engine.ts evaluates to run the expression engine
//     production runs (its global-state reads differ from the standalone
//     style-spec package's);
//   - Style#_reloadSource, which the ?debugPerf=1 probe wraps to count reloads;
//   - Style#_checkLoaded, whose "Style is not done loading." throw
//     MapStateSync defers around;
//   - Style#_loaded, which react-maplibre's <Layer> and the shard controller
//     read before adding anything;
//   - Map#_updateDiff, whose catch falls back to the full style rebuild that
//     MapStateSync re-sends everything after.
// package.json allows ^5.24.0, so `npm update` could move any of them with
// every other test still green. This fails first and says what to re-verify.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(require.resolve("maplibre-gl/package.json"), "utf8")) as {
  version: string;
};
const bundle = readFileSync(require.resolve("maplibre-gl/dist/maplibre-gl-dev.js"), "utf8");

describe("the MapLibre internals the wine map relies on", () => {
  it("is still the 5.24 line they were verified against", () => {
    expect(
      pkg.version,
      "maplibre-gl moved off 5.24: re-verify the internals listed at the top of this file, then widen the pattern",
    ).toMatch(/^5\.24\./);
  });

  it.each([
    ["define('shared'", "bundled-style-engine.ts's shared chunk"],
    ["define('worker'", "bundled-style-engine.ts's end-of-chunk marker"],
    ["_reloadSource(", "the debugPerf probe's reload counter"],
    ["_checkLoaded()", "MapStateSync's not-loaded deferral"],
    ["style._loaded", "the style-ready read before adding layers"],
    ["_updateDiff(", "the theme diff's full-rebuild fallback"],
  ])("the dev bundle still has %s (%s)", (needle) => {
    expect(bundle.includes(needle)).toBe(true);
  });
});
```

Run: `npx vitest run src/lib/testing/maplibre-internals.test.ts`
Expected: PASS, 7 tests — at once, by design (5.24.0 is installed). Check it can fail: change `/^5\.24\./` to `/^5\.25\./`, re-run, expect FAIL with `maplibre-gl moved off 5.24: re-verify the internals listed at the top of this file, then widen the pattern`, then restore `/^5\.24\./` and re-run (PASS).

- [ ] **Step 7: Types and lint**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/lib/wine-map/map-state.ts src/lib/wine-map/map-state.test.ts src/lib/testing/bundled-style-engine.ts src/lib/testing/maplibre-internals.test.ts` — expected: no problems.

- [ ] **Step 8: Commit**

```bash
git add src/lib/wine-map/map-state.ts src/lib/wine-map/map-state.test.ts src/lib/testing/bundled-style-engine.ts src/lib/testing/maplibre-internals.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): null-safe global-state pieces for static wine layers" -m "Grape gate, depth term and label text-field read wm_* global state; truth tables run through the standalone style-spec and the engine maplibre-gl ships. A tripwire test fails on a maplibre-gl bump off 5.24 or a renamed internal the map relies on." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `selection-state.ts` — selection feature-state sets

**Files:**
- Create: `src/lib/wine-map/__fixtures__/place-tree.ts`
- Create: `src/lib/wine-map/selection-state.ts`
- Test: `src/lib/wine-map/selection-state.test.ts`

**Interfaces:**
- Consumes: `buildWinePlaceTree(payload)`, `type WinePlaceTreeNode` (`tree.ts`); `shardKeyFor(key): string | null` (`shard.ts`); `shardSourceId(key)`, `WORLD_SOURCE_ID` (`basemap.ts`, value imports of a types-only module — safe for vitest and for the server).
- Produces (contract):
  ```ts
  export type SelectionFlags = { sel?: true; child?: true; rel?: true };
  export type SelectionStates = Map<string /* source id */, Map<string /* feature id */, SelectionFlags>>;
  export function selectionFeatureStates(input: {
    roots: readonly WinePlaceTreeNode[] | null; selectedKey: string | null;
    fallback: { childKeys: readonly string[]; parentKey: string | null } | null;
  }): SelectionStates;
  ```
- Produces (fixture): `FIXTURE_PLACES`, `FIXTURE_TREE`, `fixturePlace(key)`, `tileProps(key)`.

Semantics pinned (they replace today's expressions exactly): `sel` = `key == selectedKey`; `child` = `parent_id == selectedId` (direct children); `rel` = children ∪ siblings (`parent_id == selectedParentId`) ∪ the parent (`id == selectedParentId`); a root (country) has no siblings, as `selectedParentId` null made none today. Ids follow `archiveForPlace` in `scripts/wine-map-tiles/lib.mjs`: tier 0 → world only (id = key, the tile's `region` fallback), tier 1 → world (id = region slug) AND its shard (id = key), tier ≥ 2 → shard only. The tree's `parent_key` and the tiles' `parent_id` both come from `primary_parent_id` (`get_wine_place_tree` RPC and `export.mjs`), so the sets match the tiles.

- [ ] **Step 1: Write the shared fixture**

```ts
// A small but realistic slice of the verified place catalogue, as the tree RPC
// returns it and as the tile pipeline writes it: two countries, three regions,
// Burgundy down to its climats. Shared by the selection-state and static-spec
// tests so both read the same parent links.
import { shardKeyFor } from "../shard";
import { buildWinePlaceTree } from "../tree";

export type FixturePlace = {
  id: string;
  key: string;
  name: string;
  kind: string;
  tier: number;
  parent_key: string | null;
  /** Tile-only: the classification property the fill ramp reads. */
  classification: string | null;
};

export const FIXTURE_PLACES: FixturePlace[] = [
  { id: "id-france", key: "france", name: "France", kind: "COUNTRY", tier: 0, parent_key: null, classification: null },
  { id: "id-bourgogne", key: "france.bourgogne", name: "Bourgogne", kind: "REGION", tier: 1, parent_key: "france", classification: null },
  { id: "id-cdn", key: "france.bourgogne.cote-de-nuits", name: "Côte de Nuits", kind: "SUBREGION", tier: 2, parent_key: "france.bourgogne", classification: null },
  { id: "id-vr", key: "france.bourgogne.cote-de-nuits.vosne-romanee", name: "Vosne-Romanée", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-nuits", classification: "communal" },
  { id: "id-lt", key: "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache", name: "La Tâche", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-nuits.vosne-romanee", classification: "grand_cru" },
  { id: "id-ls", key: "france.bourgogne.cote-de-nuits.vosne-romanee.les-suchots", name: "Les Suchots", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-nuits.vosne-romanee", classification: "premier_cru" },
  { id: "id-gc", key: "france.bourgogne.cote-de-nuits.gevrey-chambertin", name: "Gevrey-Chambertin", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-nuits", classification: "communal" },
  { id: "id-cdb", key: "france.bourgogne.cote-de-beaune", name: "Côte de Beaune", kind: "SUBREGION", tier: 2, parent_key: "france.bourgogne", classification: null },
  { id: "id-meu", key: "france.bourgogne.cote-de-beaune.meursault", name: "Meursault", kind: "APPELLATION", tier: 3, parent_key: "france.bourgogne.cote-de-beaune", classification: "communal" },
  { id: "id-perrieres", key: "france.bourgogne.cote-de-beaune.meursault.les-perrieres", name: "Les Perrières", kind: "SITE", tier: 4, parent_key: "france.bourgogne.cote-de-beaune.meursault", classification: "premier_cru" },
  { id: "id-bordeaux", key: "france.bordeaux", name: "Bordeaux", kind: "REGION", tier: 1, parent_key: "france", classification: null },
  { id: "id-medoc", key: "france.bordeaux.medoc", name: "Médoc", kind: "SUBREGION", tier: 2, parent_key: "france.bordeaux", classification: null },
  { id: "id-italy", key: "italy", name: "Italia", kind: "COUNTRY", tier: 0, parent_key: null, classification: null },
  { id: "id-toscana", key: "italy.toscana", name: "Toscana", kind: "REGION", tier: 1, parent_key: "italy", classification: null },
  { id: "id-chianti", key: "italy.toscana.chianti", name: "Chianti", kind: "APPELLATION", tier: 2, parent_key: "italy.toscana", classification: null },
];

export const FIXTURE_TREE = buildWinePlaceTree(
  FIXTURE_PLACES.map((place) => ({
    id: place.id,
    key: place.key,
    name: place.name,
    kind: place.kind,
    tier: place.tier,
    parent_key: place.parent_key,
    has_children: FIXTURE_PLACES.some((other) => other.parent_key === place.key),
  })),
);

export function fixturePlace(key: string): FixturePlace {
  const place = FIXTURE_PLACES.find((p) => p.key === key);
  if (!place) throw new Error(`no fixture place ${key}`);
  return place;
}

/** A place's feature properties as scripts/wine-map-tiles/lib.mjs
    tileProperties writes them (the fields paint and filters read). */
export function tileProps(key: string): Record<string, unknown> {
  const place = fixturePlace(key);
  const parent = place.parent_key ? fixturePlace(place.parent_key) : null;
  return {
    id: place.id,
    key: place.key,
    name: place.name,
    tier: place.tier,
    parent_id: parent?.id ?? null,
    region: shardKeyFor(place.key) ?? place.key,
    classification: place.classification,
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/wine-map/selection-state.test.ts`
Expected: FAIL — `Error: Cannot find module './selection-state' imported from '…/src/lib/wine-map/selection-state.test.ts'`.

- [ ] **Step 4: Write the implementation**

```ts
// Which features the selection emphasises, as MapLibre feature-state (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.2). Paint reads three flags:
//   sel   — the selected place (fill pops, darkest label);
//   child — its direct children (keep full fill presence: you drill into them);
//   rel   — children, siblings and the parent (labels stay at full presence).
// Everything else fades once wm_has_sel is on. These replace the old per-layer
// `["==", ["get","key"], selectedKey]` / `parent_id` expressions, which made
// every selection rewrite the paint and layout of every mounted layer (and
// reload every source). A feature-state write reloads nothing.
//
// The sets come from the loaded place tree, whose parent links are the same
// primary_parent links the tiles' `parent_id` was exported from. Without the
// tree (still loading, failed, or a tile release newer than it) the place
// context's children and parent stand in; siblings then stay plain.
//
// Feature ids follow the tile pipeline's routing (archiveForPlace in
// scripts/wine-map-tiles/lib.mjs): tier 0 lives in the world archive only,
// tier 1 in the world archive AND its region's shard, tier >= 2 in the shard
// only. Shard sources promote `key`; the world source promotes `region`, which
// is the region slug for a region and the country's own key for a country.
import { shardSourceId, WORLD_SOURCE_ID } from "./basemap";
import { shardKeyFor } from "./shard";
import type { WinePlaceTreeNode } from "./tree";

export type SelectionFlags = { sel?: true; child?: true; rel?: true };
export type SelectionStates = Map<string /* source id */, Map<string /* feature id */, SelectionFlags>>;

type Located = { node: WinePlaceTreeNode; parent: WinePlaceTreeNode | null };

// One index per loaded tree (the explorer holds a single roots array for the
// session), so a selection is a Map lookup, not a walk of ~3,900 nodes.
const indexes = new WeakMap<readonly WinePlaceTreeNode[], Map<string, Located>>();
function indexTree(roots: readonly WinePlaceTreeNode[]): Map<string, Located> {
  let index = indexes.get(roots);
  if (index) return index;
  index = new Map();
  const stack: Located[] = roots.map((node) => ({ node, parent: null }));
  while (stack.length > 0) {
    const entry = stack.pop()!;
    index.set(entry.node.key, entry);
    for (const child of entry.node.children) stack.push({ node: child, parent: entry.node });
  }
  indexes.set(roots, index);
  return index;
}

/** A key's display tier when only the key is known (the context fallback):
    countries have one segment, regions two, everything deeper is a shard
    feature. */
function tierFromKey(key: string): number {
  return Math.min(key.split(".").length - 1, 2);
}

function flag(states: SelectionStates, sourceId: string, id: string, name: keyof SelectionFlags) {
  let bucket = states.get(sourceId);
  if (!bucket) states.set(sourceId, (bucket = new Map()));
  const flags = bucket.get(id) ?? {};
  flags[name] = true;
  bucket.set(id, flags);
}

function mark(states: SelectionStates, key: string, tier: number, name: keyof SelectionFlags) {
  const shard = shardKeyFor(key);
  if (tier <= 1) flag(states, WORLD_SOURCE_ID, shard ?? key, name);
  if (tier >= 1 && shard) flag(states, shardSourceId(shard), key, name);
}

export function selectionFeatureStates(input: {
  roots: readonly WinePlaceTreeNode[] | null;
  selectedKey: string | null;
  fallback: { childKeys: readonly string[]; parentKey: string | null } | null;
}): SelectionStates {
  const states: SelectionStates = new Map();
  const { roots, selectedKey, fallback } = input;
  if (!selectedKey) return states;
  const located = roots ? indexTree(roots).get(selectedKey) : undefined;
  if (located) {
    const { node, parent } = located;
    mark(states, node.key, node.tier, "sel");
    for (const child of node.children) {
      mark(states, child.key, child.tier, "child");
      mark(states, child.key, child.tier, "rel");
    }
    if (parent) {
      mark(states, parent.key, parent.tier, "rel");
      for (const sibling of parent.children) {
        if (sibling !== node) mark(states, sibling.key, sibling.tier, "rel");
      }
    }
    return states;
  }
  mark(states, selectedKey, tierFromKey(selectedKey), "sel");
  if (fallback) {
    for (const key of fallback.childKeys) {
      mark(states, key, tierFromKey(key), "child");
      mark(states, key, tierFromKey(key), "rel");
    }
    if (fallback.parentKey) mark(states, fallback.parentKey, tierFromKey(fallback.parentKey), "rel");
  }
  return states;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/wine-map/selection-state.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 6: Types and lint**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/lib/wine-map/selection-state.ts src/lib/wine-map/selection-state.test.ts src/lib/wine-map/__fixtures__/place-tree.ts` — expected: no problems.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wine-map/selection-state.ts src/lib/wine-map/selection-state.test.ts src/lib/wine-map/__fixtures__/place-tree.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): selection emphasis as feature-state sets" -m "sel/child/rel per source and promoted id, from the place tree with a place-context fallback." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `MapStateSync` (`map-state-sync.ts`)

**Files:**
- Create: `src/lib/wine-map/map-state-sync.ts`
- Test: `src/lib/wine-map/map-state-sync.test.ts`
- Modify: `src/lib/wine-map/basemap.test.ts` (one new case in `describe("the style diff a swap produces")`, before the case `"a swapped-in basemap is trimmed and gated exactly as the first one was"`)

**Interfaces:**
- Consumes: `type DesiredGlobalState`, `desiredGlobalState` (Task 7, tests only); `type SelectionFlags`, `type SelectionStates`, `selectionFeatureStates` (Task 8); `keyLookupMap` (tests).
- Produces (contract):
  ```ts
  export type SyncMap = {
    style: object | undefined;
    getGlobalState(): Record<string, unknown>;
    setGlobalStateProperty(name: string, value: unknown): unknown;
    getSource(id: string): unknown;
    setFeatureState(target: { source: string; sourceLayer: string; id: string }, state: Record<string, unknown>): unknown;
    removeFeatureState(target: { source: string; sourceLayer: string; id: string }, key?: string): unknown;
    on(type: string, fn: (...a: unknown[]) => void): unknown;
    off(type: string, fn: (...a: unknown[]) => void): unknown;
  };
  export class MapStateSync {
    constructor(map: SyncMap);
    setDesired(next: { global: DesiredGlobalState; selection: SelectionStates }): void; // then apply()
    apply(): void;   // idempotent, never throws
    dispose(): void;
  }
  ```
  A `maplibregl.Map` is assignable to `SyncMap` as is (checked with `tsc`).

MapLibre 5.24 facts this relies on (read in `node_modules/maplibre-gl/src`): `Style.setGlobalStateProperty` and `set/removeFeatureState` call `_checkLoaded()` and throw "Style is not done loading." before the style JSON lands; `setGlobalStateProperty(name, null)` stores `null` (no stylesheet `state`), and skips a deep-equal value; the full-rebuild fallback (`Map._updateDiff` catch → `_updateStyle`) makes a new `Style` whose `_globalState = {}` and whose sources are new objects with no feature-state, firing `styledataloading` then, a frame later, `style.load`; the diff path fires `style.load` synchronously inside `setState` and keeps the style object, its global state and its sources; `removeFeatureState(target)` with no key wipes every flag on that feature (the world source's `handed` included). A metadata `sourcedata` event (`sourceDataType: "metadata"`) fires once a newly added source has loaded its TileJSON.

- [ ] **Step 1: Write the failing test**

```ts
// MapStateSync against a fake map that behaves like MapLibre 5.24 where it
// matters: global-state and feature-state writes throw until the style has
// loaded; a full rebuild replaces map.style with a new object whose global
// state is empty and whose sources are new objects with no feature-state; a
// diff swap keeps all three. Every case is one a live visitor can reach — a
// cold deep link before Carto's style lands, a theme flip that falls back to a
// rebuild, a shard mounting after the selection, a fast run of selections.
import { describe, expect, it } from "vitest";
import { keyLookupMap } from "./key-gate";
import { desiredGlobalState } from "./map-state";
import { MapStateSync, type SyncMap } from "./map-state-sync";
import { FIXTURE_TREE } from "./__fixtures__/place-tree";
import { selectionFeatureStates } from "./selection-state";

type Target = { source: string; sourceLayer: string; id: string };
type Listener = (...a: unknown[]) => void;
type Call =
  | { op: "global"; name: string; value: unknown }
  | { op: "set"; target: Target; state: Record<string, unknown> }
  | { op: "remove"; target: Target; key: string | undefined };

class FakeMap implements SyncMap {
  style: object | undefined = { generation: 0 };
  loaded = true;
  calls: Call[] = [];
  private globalState: Record<string, unknown> = {};
  private readonly sources = new Map<string, object>();
  private readonly featureStates = new Map<string, Record<string, unknown>>();
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(sourceIds: string[]) {
    for (const id of sourceIds) this.sources.set(id, { id });
  }

  private checkLoaded() {
    if (!this.loaded) throw new Error("Style is not done loading.");
  }
  getGlobalState() {
    return this.globalState;
  }
  setGlobalStateProperty(name: string, value: unknown) {
    this.checkLoaded();
    this.calls.push({ op: "global", name, value });
    this.globalState[name] = value;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  setFeatureState(target: Target, state: Record<string, unknown>) {
    this.checkLoaded();
    if (!this.sources.has(target.source)) return;
    this.calls.push({ op: "set", target, state });
    const key = `${target.source}|${target.sourceLayer}|${target.id}`;
    this.featureStates.set(key, { ...this.featureStates.get(key), ...state });
  }
  removeFeatureState(target: Target, key?: string) {
    this.checkLoaded();
    this.calls.push({ op: "remove", target, key });
    const id = `${target.source}|${target.sourceLayer}|${target.id}`;
    const state = this.featureStates.get(id);
    if (!state) return;
    if (key === undefined) this.featureStates.delete(id);
    else delete state[key];
  }
  on(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  off(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  fire(type: string, event: unknown = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }

  /** Feature-state as MapLibre would read it for paint. */
  stateOf(source: string, sourceLayer: string, id: string) {
    return this.featureStates.get(`${source}|${sourceLayer}|${id}`) ?? {};
  }
  addSource(id: string) {
    this.sources.set(id, { id, generation: Math.random() });
  }
  /** Unmount + remount: a new source object, its feature-state gone. */
  recreateSource(id: string) {
    for (const key of [...this.featureStates.keys()]) {
      if (key.startsWith(`${id}|`)) this.featureStates.delete(key);
    }
    this.addSource(id);
  }
  /** MapLibre's full-rebuild fallback: a new Style, not loaded for a frame. */
  startRebuild() {
    this.style = { generation: Math.random() };
    this.loaded = false;
    this.globalState = {};
    this.featureStates.clear();
    for (const id of [...this.sources.keys()]) this.addSource(id);
    this.fire("styledataloading");
  }
  land() {
    this.loaded = true;
    this.fire("style.load");
  }
}

const WORLD = "wine-world";
const BOURGOGNE = "wine-shard-bourgogne";
const BORDEAUX = "wine-shard-bordeaux";
const VOSNE = "france.bourgogne.cote-de-nuits.vosne-romanee";

function snapshot(selectedKey: string | null, extra: Partial<Parameters<typeof desiredGlobalState>[0]> = {}) {
  return {
    global: desiredGlobalState({
      visibleKeys: null,
      english: true,
      selectedKey,
      deepCountries: ["france"],
      knownCountries: ["france", "italy"],
      ...extra,
    }),
    selection: selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey, fallback: null }),
  };
}

const globals = (map: FakeMap) => map.calls.filter((c) => c.op === "global");

describe("MapStateSync", () => {
  it("writes every global-state name and the selection, on both source-layers", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    new MapStateSync(map).setDesired(snapshot(VOSNE));
    expect(map.getGlobalState()).toEqual({
      wm_keys: null,
      wm_local: false,
      wm_has_sel: true,
      wm_sel_key: VOSNE,
      wm_deep_france: true,
      wm_deep_italy: false,
    });
    for (const sourceLayer of ["places", "labels"]) {
      expect(map.stateOf(BOURGOGNE, sourceLayer, VOSNE)).toEqual({ sel: true });
      expect(map.stateOf(BOURGOGNE, sourceLayer, `${VOSNE}.la-tache`)).toEqual({ child: true, rel: true });
      expect(map.stateOf(BOURGOGNE, sourceLayer, "france.bourgogne.cote-de-nuits")).toEqual({ rel: true });
    }
  });

  it("re-sends nothing that has not changed, even as a new but equal object", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    const keys = ["france.bourgogne", VOSNE];
    sync.setDesired(snapshot(VOSNE, { visibleKeys: keys }));
    const before = map.calls.length;
    sync.setDesired(snapshot(VOSNE, { visibleKeys: keys }));
    sync.apply();
    // A different array with the same keys builds a fresh lookup object; it is
    // compared with the map's value and not written.
    sync.setDesired(snapshot(VOSNE, { visibleKeys: [...keys] }));
    expect(map.calls.length).toBe(before);
    expect(map.getGlobalState().wm_keys).toEqual(keyLookupMap(keys));
  });

  it("a write before the style has loaded is deferred to load, not lost", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    map.loaded = false;
    const sync = new MapStateSync(map);
    expect(() => sync.setDesired(snapshot(VOSNE))).not.toThrow();
    expect(map.calls).toEqual([]);
    map.loaded = true;
    map.fire("load");
    expect(map.getGlobalState().wm_sel_key).toBe(VOSNE);
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({ sel: true });
  });

  it("holds writes between styledataloading and style.load, then applies the latest", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne"));
    map.startRebuild();
    map.calls = [];
    sync.setDesired(snapshot(VOSNE, { english: false }));
    expect(map.calls).toEqual([]);
    map.land();
    expect(map.getGlobalState()).toMatchObject({ wm_sel_key: VOSNE, wm_local: true });
    expect(map.stateOf(BOURGOGNE, "labels", VOSNE)).toEqual({ sel: true });
  });

  it("a full rebuild re-sends everything, though nothing changed in React", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne", { visibleKeys: [VOSNE] }));
    const applied = { ...map.getGlobalState() };
    map.startRebuild();
    map.land();
    expect(map.getGlobalState()).toEqual(applied);
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ sel: true });
    expect(map.stateOf(WORLD, "labels", "france")).toEqual({ rel: true });
    expect(map.stateOf(BOURGOGNE, "places", "france.bourgogne")).toEqual({ sel: true });
    expect(map.stateOf(BORDEAUX, "places", "france.bordeaux")).toEqual({ rel: true });
  });

  it("a diff-path style.load (same style, same sources) writes nothing", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    new MapStateSync(map).setDesired(snapshot(VOSNE));
    map.calls = [];
    map.fire("style.load");
    expect(map.calls).toEqual([]);
  });

  it("clears the previous selection's flags by name, never key-less, and keeps `handed`", () => {
    const map = new FakeMap([WORLD, BOURGOGNE, BORDEAUX]);
    // The handoff effect's own flag on Bourgogne's world copy.
    map.setFeatureState({ source: WORLD, sourceLayer: "places", id: "bourgogne" }, { handed: true });
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot("france.bourgogne"));
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ handed: true, sel: true });
    for (const next of ["france.bordeaux.medoc", VOSNE, "italy"]) sync.setDesired(snapshot(next));
    expect(map.stateOf(WORLD, "places", "bourgogne")).toEqual({ handed: true });
    // Exactly one selected place is left, on both of its source-layers.
    expect(map.stateOf(WORLD, "places", "italy")).toEqual({ sel: true });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    expect(map.stateOf(BORDEAUX, "places", "france.bordeaux.medoc")).toEqual({});
    for (const call of map.calls) {
      if (call.op !== "remove") continue;
      expect(["sel", "child", "rel"]).toContain(call.key);
    }
  });

  it("a shard that mounts after the selection gets its flags when its metadata lands", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    map.addSource(BOURGOGNE);
    map.fire("sourcedata", { sourceId: BOURGOGNE, sourceDataType: "content" });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({});
    map.fire("sourcedata", { sourceId: BOURGOGNE, sourceDataType: "metadata" });
    expect(map.stateOf(BOURGOGNE, "places", VOSNE)).toEqual({ sel: true });
  });

  it("a shard that unmounts and remounts gets its flags again", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(VOSNE));
    map.recreateSource(BOURGOGNE);
    sync.apply();
    expect(map.stateOf(BOURGOGNE, "labels", VOSNE)).toEqual({ sel: true });
  });

  it("resets a name it wrote that the snapshot stops carrying", () => {
    const map = new FakeMap([WORLD]);
    const sync = new MapStateSync(map);
    sync.setDesired(snapshot(null));
    expect(map.getGlobalState().wm_deep_italy).toBe(false);
    sync.setDesired(snapshot(null, { knownCountries: ["france"] }));
    expect(map.getGlobalState().wm_deep_italy).toBeNull();
    expect(globals(map).filter((c) => c.name === "wm_deep_italy")).toHaveLength(2);
  });

  it("never throws out of apply() or the style.load listener", () => {
    const boom = () => {
      throw new Error("boom");
    };
    const listeners = new Map<string, Listener>();
    const map: SyncMap = {
      get style(): object {
        throw new Error("boom");
      },
      getGlobalState: boom,
      setGlobalStateProperty: boom,
      getSource: boom,
      setFeatureState: boom,
      removeFeatureState: boom,
      on: (type, fn) => listeners.set(type, fn),
      off: (type) => listeners.delete(type),
    };
    const sync = new MapStateSync(map);
    expect(() => sync.setDesired(snapshot(VOSNE))).not.toThrow();
    expect(() => sync.apply()).not.toThrow();
    expect(() => listeners.get("style.load")!()).not.toThrow();
    expect(() => listeners.get("sourcedata")!({ sourceId: BOURGOGNE, sourceDataType: "metadata" })).not.toThrow();
  });

  it("dispose() removes its listeners and stops writing", () => {
    const map = new FakeMap([WORLD, BOURGOGNE]);
    const sync = new MapStateSync(map);
    expect(map.listenerCount()).toBe(4);
    sync.dispose();
    expect(map.listenerCount()).toBe(0);
    sync.setDesired(snapshot(VOSNE));
    map.fire("style.load");
    expect(map.calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Add the no-`state`-block guard to `basemap.test.ts`**

In `src/lib/wine-map/basemap.test.ts`, inside `describe("the style diff a swap produces", () => {`, insert this case immediately before the line `  it("a swapped-in basemap is trimmed and gated exactly as the first one was", () => {`:

```ts
  it("never carries a state block, so a flip leaves the map's global state alone", () => {
    // The wine map keeps its grape filter, language, focus depth and selection
    // in MapLibre global state (map-state.ts), set at runtime by MapStateSync.
    // Style.serialize() omits `state`, so as long as nothing here adds one the
    // diff emits no setGlobalState and the live values survive a flip. A
    // `state` block would reset every one of them on each flip, and make
    // setGlobalStateProperty(name, null) fall back to its stale default.
    let style = liveStyle(positron);
    for (const incoming of [darkMatter, positron]) {
      const next = withWineLayers(style, tuneBasemapStyle(incoming));
      expect("state" in next).toBe(false);
      const names = diff(style, next).map((c) => c.command as string);
      expect(names).not.toContain("setGlobalState");
      style = next;
    }
  });
```

- [ ] **Step 3: Run them to verify the new test fails**

Run: `npx vitest run src/lib/wine-map/map-state-sync.test.ts src/lib/wine-map/basemap.test.ts`
Expected: `map-state-sync.test.ts` FAILS — `Error: Cannot find module './map-state-sync' imported from '…/src/lib/wine-map/map-state-sync.test.ts'`; `basemap.test.ts` PASSES (27 tests — the new case is a guard that pins today's behaviour: `withWineLayers` never adds a `state` block, so a theme diff never emits `setGlobalState`).

- [ ] **Step 4: Write the implementation**

```ts
// The one writer of the wine map's global state and selection feature-state
// (spec docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.3). React never calls setGlobalStateProperty or setFeatureState itself:
// every change lands in the desired snapshot first, and one idempotent apply()
// reconciles the map with it.
//
// Why one writer, and why a snapshot rather than a queue of writes:
//  - Writes throw while the style is not loaded ("Style is not done
//    loading."), which is the case between the map's creation and Carto's
//    style.json landing — exactly when a cold ?place= deep link resolves — and
//    again for a frame after MapLibre's full-rebuild fallback (a theme diff
//    that failed), when map.style is a brand-new, unloaded Style. A throw from
//    a React effect would take the page down.
//  - That rebuild starts with EMPTY global state and fresh sources (feature
//    state gone), while React's values have not changed, so nothing would
//    re-send them. Re-applying the whole snapshot on every style.load
//    restores them; on the ordinary diff path the style and sources survive
//    and apply() finds nothing to do.
//  - The readiness flag is cleared on `styledataloading` and set on `load` /
//    `style.load`. Never map.isStyleLoaded(): it is false whenever a tile is
//    loading, including straight after our own write reloads a source.
//
// Writes are skipped when unchanged: a global-state value against what this
// style last took (by reference) and then against map.getGlobalState() (deep),
// feature-state against what this source object last took. A rebuilt style or
// a re-created source is a new object, so both records reset with it.
// Selection flags are only ever removed BY NAME: the world source also carries
// the handoff's `handed` flag, which a key-less removeFeatureState would wipe.
import type { DesiredGlobalState } from "./map-state";
import type { SelectionFlags, SelectionStates } from "./selection-state";

type FeatureTarget = { source: string; sourceLayer: string; id: string };

export type SyncMap = {
  style: object | undefined;
  getGlobalState(): Record<string, unknown>;
  setGlobalStateProperty(name: string, value: unknown): unknown;
  getSource(id: string): unknown;
  setFeatureState(target: FeatureTarget, state: Record<string, unknown>): unknown;
  removeFeatureState(target: FeatureTarget, key?: string): unknown;
  on(type: string, fn: (...a: unknown[]) => void): unknown;
  off(type: string, fn: (...a: unknown[]) => void): unknown;
};

// Every wine source carries both source-layers, and a place's polygon and its
// label share one promoted id.
const SOURCE_LAYERS = ["places", "labels"] as const;
const FLAGS = ["sel", "child", "rel"] as const;

/** Structural equality for the JSON-shaped values global state holds.
    null and undefined differ, as they do in MapLibre's own deepEqual: an
    explicit null must still be written over a never-set name. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  const bRecord = b as Record<string, unknown>;
  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue((a as Record<string, unknown>)[key], bRecord[key]),
  );
}

type AppliedSource = { source: unknown; states: Map<string, SelectionFlags> };

export class MapStateSync {
  private readonly map: SyncMap;
  private desired: { global: DesiredGlobalState; selection: SelectionStates } = {
    global: {},
    selection: new Map(),
  };
  // Constructed from onLoad, when the style has loaded; a write that throws
  // anyway is caught and retried on the next apply().
  private ready = true;
  private disposed = false;
  private appliedStyle: object | undefined = undefined;
  private readonly appliedGlobal = new Map<string, unknown>();
  private readonly appliedSelection = new Map<string, AppliedSource>();

  private readonly onStyleLoading = () => {
    this.ready = false;
  };
  // Synchronous, inside the event: a style.load listener that throws turns a
  // successful theme diff into MapLibre's full rebuild, so apply() must not.
  private readonly onStyleLoaded = () => {
    this.ready = true;
    this.apply();
  };
  // A shard source that mounted after the last apply() (or was re-created)
  // gets its bucket once its metadata lands. Once per source load, and a
  // no-op diff when nothing is missing.
  private readonly onSourceData = (event: unknown) => {
    const e = event as { sourceDataType?: string; sourceId?: string } | undefined;
    if (e?.sourceDataType !== "metadata" || !e.sourceId) return;
    if (this.desired.selection.has(e.sourceId)) this.apply();
  };

  constructor(map: SyncMap) {
    this.map = map;
    map.on("styledataloading", this.onStyleLoading);
    map.on("style.load", this.onStyleLoaded);
    map.on("load", this.onStyleLoaded);
    map.on("sourcedata", this.onSourceData);
  }

  setDesired(next: { global: DesiredGlobalState; selection: SelectionStates }): void {
    this.desired = next;
    this.apply();
  }

  /** Idempotent and never throws. */
  apply(): void {
    if (this.disposed || !this.ready) return;
    try {
      const style = this.map.style;
      if (!style) return;
      if (style !== this.appliedStyle) {
        this.appliedStyle = style;
        this.appliedGlobal.clear();
        this.appliedSelection.clear();
      }
      this.applyGlobal();
      this.applySelection();
    } catch {
      // Not loaded after all, or a source vanished mid-pass. Whatever was not
      // recorded as applied is retried by the next apply() or style.load.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.map.off("styledataloading", this.onStyleLoading);
    this.map.off("style.load", this.onStyleLoaded);
    this.map.off("load", this.onStyleLoaded);
    this.map.off("sourcedata", this.onSourceData);
  }

  private applyGlobal() {
    const wanted = this.desired.global;
    const current = this.map.getGlobalState();
    for (const [name, value] of Object.entries(wanted)) {
      if (this.appliedGlobal.has(name) && this.appliedGlobal.get(name) === value) continue;
      if (!(name in current) || !sameValue(current[name], value)) {
        this.map.setGlobalStateProperty(name, value);
      }
      this.appliedGlobal.set(name, value);
    }
    // A name this sync wrote that the snapshot no longer carries goes back to
    // null rather than keeping a stale value.
    for (const name of [...this.appliedGlobal.keys()]) {
      if (name in wanted) continue;
      this.map.setGlobalStateProperty(name, null);
      this.appliedGlobal.delete(name);
    }
  }

  private applySelection() {
    const wanted = this.desired.selection;
    for (const sourceId of new Set([...wanted.keys(), ...this.appliedSelection.keys()])) {
      const source = this.map.getSource(sourceId);
      if (!source) {
        // Not mounted (or unmounted): its feature-state went with it. Sent in
        // full once the source exists.
        this.appliedSelection.delete(sourceId);
        continue;
      }
      const record = this.appliedSelection.get(sourceId);
      const before = record && record.source === source ? record.states : new Map<string, SelectionFlags>();
      const after = wanted.get(sourceId) ?? new Map<string, SelectionFlags>();
      for (const [id, flags] of before) {
        const keep = after.get(id);
        for (const name of FLAGS) {
          if (!flags[name] || keep?.[name]) continue;
          for (const sourceLayer of SOURCE_LAYERS) {
            this.map.removeFeatureState({ source: sourceId, sourceLayer, id }, name);
          }
        }
      }
      for (const [id, flags] of after) {
        const had = before.get(id);
        const add: Record<string, true> = {};
        for (const name of FLAGS) if (flags[name] && !had?.[name]) add[name] = true;
        if (Object.keys(add).length === 0) continue;
        for (const sourceLayer of SOURCE_LAYERS) {
          this.map.setFeatureState({ source: sourceId, sourceLayer, id }, add);
        }
      }
      if (after.size > 0) this.appliedSelection.set(sourceId, { source, states: after });
      else this.appliedSelection.delete(sourceId);
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/wine-map/map-state-sync.test.ts src/lib/wine-map/basemap.test.ts`
Expected: PASS, 12 + 27 tests.

- [ ] **Step 6: Types and lint**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/lib/wine-map/map-state-sync.ts src/lib/wine-map/map-state-sync.test.ts src/lib/wine-map/basemap.test.ts` — expected: no problems.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wine-map/map-state-sync.ts src/lib/wine-map/map-state-sync.test.ts src/lib/wine-map/basemap.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): MapStateSync, one rebuild-safe writer of wine-map state" -m "Desired snapshot applied on load and every style.load, skipped when unchanged, never throwing; selection flags removed by name so the handoff's handed flag survives." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: Static paint/layout/filter builders in `shard-specs.ts`

**Files:**
- Modify: `src/lib/wine-map/shard-specs.ts` (one import line at the top; a new section appended at the end of the file)
- Test: `src/lib/wine-map/shard-specs-static.test.ts`

**Interfaces:**
- Consumes: `GS`, `grapeGateExpression`, `depthTerm`, `labelTextField` (Task 7); `classificationExpr`, `type ColorExpression`, `type MapPalette` (already in `shard-specs.ts` from Task 1); tests also use `shardColorExpression`, `worldRegionColor` (Task 1), `selectionFeatureStates` (Task 8), `desiredGlobalState` (Task 7), the Task 8 fixture and the Task 7 bundled engine.
- Produces (contract):
  ```ts
  export function staticFillPaint(input: { color: ColorExpression; ramp: boolean; worldHandoff: boolean }): Record<string, unknown>;
  export function staticOutlinePaint(input: { color: ColorExpression; worldHandoff: boolean }): Record<string, unknown>;
  export function staticLabelLayout(): Record<string, unknown>;
  export function staticLabelPaint(input: { palette: MapPalette; worldHandoff: boolean }): Record<string, unknown>;
  export function selectedLabelLayout(): Record<string, unknown>;
  export function selectedLabelPaint(input: { palette: MapPalette; worldHandoff: boolean }): Record<string, unknown>;
  export function shardFilter(country: string | null): unknown[];   // ["all", grapeGate, depthTerm?]
  export function selectedPlaceFilter(): unknown[];                 // ["all", grapeGate, key == wm_sel_key]
  ```
- Produces (addition): `export const WORLD_HANDED_FACTOR` — moved here from `tile-wine-map.tsx` (Task 11 deletes the old copy).

Verified: the style spec lists `feature-state` among the parameters of `fill-opacity`, `line-opacity`, `text-color`, `text-opacity` and `text-halo-width`, but NOT of `text-size` or `symbol-sort-key` (layout: `zoom`, `feature` only) — which is why label size/order cannot follow a feature-state selection and D4 moves the selected label to its own layer.

- [ ] **Step 1: Write the failing test**

`buildFillPaint`, `rampExpression`, `classificationExpr`, `WORLD_HANDED_FACTOR`, `relatedExpression`, `LABEL_TIER_SIZE`, `labelLayout` and `labelPaint` are copied verbatim from `tile-wine-map.tsx` at `cd9acd5` (lines 178-183, 215-220, 258-262, 357-413, 427-508) as the oracle.

```ts
// The static paint and layout builders against the per-selection builders they
// replace. Today's buildFillPaint, labelLayout and labelPaint (with the
// helpers they use) are copied below VERBATIM from tile-wine-map.tsx as it
// stood at cd9acd5, and serve as the oracle: for every fixture feature, every
// selection state, several zooms, ramp on and off and the world handoff on and
// off, the old expression (literal selectedKey/Id/ParentId baked in) and the
// new one (feature-state from selectionFeatureStates plus the wm_has_sel
// global) must evaluate to the same value — through the standalone style-spec
// AND the engine maplibre-gl ships. The one accepted difference, D4 (label size
// and collision order no longer move with the selection), is asserted as such.
import { describe, expect, it } from "vitest";
import {
  createExpression,
  featureFilter,
  latest,
  validateStyleMin,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { bundledStyleEngine } from "../testing/bundled-style-engine";
import { englishTextFieldExpression } from "./localize-names";
import { MAP_PALETTES, type MapPalette } from "./map-palette";
import { desiredGlobalState } from "./map-state";
import { selectionFeatureStates } from "./selection-state";
import {
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  shardColorExpression,
  shardFilter,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
} from "./shard-specs";
import { FIXTURE_PLACES, FIXTURE_TREE, fixturePlace, tileProps } from "./__fixtures__/place-tree";

// ---------------------------------------------------------------------------
// Oracle: tile-wine-map.tsx at cd9acd5, verbatim.
// ---------------------------------------------------------------------------
const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}
function buildFillPaint(
  selectedKey: string | null,
  selectedId: string | null,
  areaColor: string,
  rampedRegions: string[],
  hide: unknown[] | null,
) {
  const sel = ["==", ["get", "key"], selectedKey ?? ""];
  const child = ["==", ["get", "parent_id"], selectedId ?? "__none__"];
  const hasSelection = selectedKey !== null;
  // Focus wrapper per zoom stop: the selection pops, its direct children
  // keep full presence (you drill into them), everything else fades to
  // 45% of its normal opacity. The selected fill still relaxes at deep
  // zoom so children render readably on top of it.
  const focus = (selectedOpacity: number, base: unknown) => {
    const focused = hasSelection
      ? ["case", sel, selectedOpacity, child, base, ["*", base, 0.45]]
      : ["case", sel, selectedOpacity, base];
    return hide ? ["*", focused, hide] : focused;
  };
  return {
    // Every fill already has a dedicated `line` outline layer drawn over it,
    // so MapLibre's built-in fill antialiasing is a redundant second edge
    // pass per fill layer. Turning it off removes that pass outright; the
    // outline layer keeps edges crisp, so it reads the same.
    "fill-antialias": false,
    "fill-color": areaColor,
    "fill-opacity": [
      "let",
      "ramp",
      rampExpression(rampedRegions),
      [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
        9,
        // Classification intensity: grand cru plots read solid, premier cru
        // firm, village land a light wash — the darkness ramp IS the
        // classification signal (paired with the shaded fill hue). Where the
        // region's ramp is off every level sits at one uniform mid opacity.
        focus(0.3, [
          "match",
          classificationExpr,
          "grand_cru",
          ["case", ["var", "ramp"], 0.65, 0.4],
          "premier_cru",
          ["case", ["var", "ramp"], 0.45, 0.4],
          "communal",
          ["case", ["var", "ramp"], 0.18, 0.4],
          ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
        ]),
      ],
    ] as unknown as number,
  };
}
function relatedExpression(
  selectedId: string | null,
  selectedParentId: string | null,
) {
  return [
    "any",
    ["==", ["get", "parent_id"], selectedId ?? "__none__"],
    ["==", ["get", "parent_id"], selectedParentId ?? "__none__"],
    ["==", ["get", "id"], selectedParentId ?? "__none__"],
  ];
}
const LABEL_TIER_SIZE = [
  "match", ["get", "tier"], 0, 16, 1, 15, 2, 13.5, 3, 12, 4, 11, 10,
];
function labelLayout(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  english: boolean,
) {
  const base = {
    "text-field": (english
      ? englishTextFieldExpression()
      : ["get", "name"]) as unknown as string,
    "text-transform": [
      "match", ["get", "tier"], 0, "uppercase", 1, "uppercase", "none",
    ] as unknown as "none",
    "text-letter-spacing": [
      "match", ["get", "tier"], 0, 0.1, 1, 0.08, 0.02,
    ] as unknown as number,
  };
  if (!selectedKey) {
    return {
      ...base,
      "text-size": LABEL_TIER_SIZE as unknown as number,
      "symbol-sort-key": ["-", 10, ["get", "tier"]] as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    ...base,
    "text-size": [
      "+", LABEL_TIER_SIZE, ["case", sel, 2.5, related, 0, -0.5],
    ] as unknown as number,
    "symbol-sort-key": [
      "case", sel, -2, related, -1, ["-", 10, ["get", "tier"]],
    ] as unknown as number,
  };
}
function labelPaint(
  selectedKey: string | null,
  selectedId: string | null,
  selectedParentId: string | null,
  palette: MapPalette,
) {
  const { label } = palette;
  if (!selectedKey) {
    return {
      "text-color": label.text,
      "text-opacity": 1 as unknown as number,
      "text-halo-color": label.halo,
      "text-halo-width": 1.7 as unknown as number,
    };
  }
  const sel = ["==", ["get", "key"], selectedKey];
  const related = relatedExpression(selectedId, selectedParentId);
  return {
    "text-color": [
      "case", sel, label.selected, related, label.related, label.distant,
    ] as unknown as string,
    "text-opacity": ["case", sel, 1, related, 0.95, 0.8] as unknown as number,
    "text-halo-color": label.halo,
    "text-halo-width": ["case", sel, 2.2, related, 1.7, 1.3] as unknown as number,
  };
}
// ---------------------------------------------------------------------------

type State = Record<string, unknown>;
type Evaluate = (zoom: number, props: Record<string, unknown>, featureState: State) => unknown;
type Engine = {
  name: string;
  compile(group: string, property: string, value: unknown, state: State): Evaluate;
};

function normalize(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1e6) / 1e6;
  // Color and Formatted both print their value.
  if (value !== null && typeof value === "object") return String(value);
  return value;
}

const standalone: Engine = {
  name: "standalone style-spec",
  compile(group, property, value, state) {
    const spec = (latest as unknown as Record<string, Record<string, unknown>>)[group][property];
    const parsed = createExpression(value, spec as never, state);
    if (parsed.result !== "success") throw new Error(`${property}: ${JSON.stringify(parsed.value)}`);
    const expression = parsed.value;
    return (zoom, props, featureState) =>
      normalize(expression.evaluate({ zoom }, { type: 3, properties: props } as never, featureState));
  },
};
const bundled: Engine = {
  name: "bundled maplibre-gl",
  compile(group, property, value, state) {
    const engine = bundledStyleEngine();
    const parsed = engine.createExpression(value, engine.v8Spec[group][property], state);
    if (parsed.result !== "success") throw new Error(`${property}: ${JSON.stringify(parsed.value)}`);
    const expression = parsed.value;
    return (zoom, props, featureState) =>
      normalize(expression.evaluate({ zoom }, { type: 3, properties: props }, featureState));
  },
};
const ENGINES = [standalone, bundled];

const ZOOMS = [5, 7, 9, 12];
const SHARD = "wine-shard-bourgogne";
const WORLD = "wine-world";
const SHARD_KEYS = FIXTURE_PLACES.map((p) => p.key).filter((key) => key.startsWith("france.bourgogne"));
const WORLD_KEYS = FIXTURE_PLACES.filter((p) => p.tier <= 1).map((p) => p.key);
const SELECTIONS: (string | null)[] = [
  null,
  "france",
  "france.bourgogne",
  "france.bourgogne.cote-de-nuits",
  "france.bourgogne.cote-de-nuits.vosne-romanee",
  "france.bourgogne.cote-de-nuits.vosne-romanee.la-tache",
  "italy.toscana",
];
// Every way "nothing selected" can reach the engine: never written, other
// names written but not this one (undefined in the bundled engine), false.
const NO_SELECTION: State[] = [{}, { wm_local: false, wm_keys: null }, { wm_has_sel: false }];

function oldIds(selectedKey: string | null) {
  if (!selectedKey) return { selectedId: null, selectedParentId: null };
  const place = fixturePlace(selectedKey);
  return {
    selectedId: place.id,
    selectedParentId: place.parent_key ? fixturePlace(place.parent_key).id : null,
  };
}

/** What the new layers see for one feature under one selection. */
function newInputs(selectedKey: string | null, source: string, key: string) {
  const states = selectionFeatureStates({ roots: FIXTURE_TREE, selectedKey, fallback: null });
  const id = source === WORLD ? (tileProps(key).region as string) : key;
  const featureState = { ...(states.get(source)?.get(id) ?? {}) } as State;
  const globals: State[] = selectedKey
    ? [desiredGlobalState({ visibleKeys: null, english: true, selectedKey, deepCountries: [], knownCountries: [] })]
    : NO_SELECTION;
  return { featureState, globals };
}

type Case = { source: string; keys: string[]; handed: boolean[] };
const CASES: Case[] = [
  { source: SHARD, keys: SHARD_KEYS, handed: [false] },
  { source: WORLD, keys: WORLD_KEYS, handed: [false, true] },
];

describe("staticFillPaint matches buildFillPaint", () => {
  for (const engine of ENGINES) {
    it(`${engine.name}: fill-opacity for every feature, selection, zoom, ramp and handoff`, () => {
      let checked = 0;
      for (const { source, keys, handed } of CASES) {
        const world = source === WORLD;
        for (const rampOn of world ? [false] : [false, true]) {
          const newPaint = staticFillPaint({ color: "#000000", ramp: rampOn, worldHandoff: world });
          for (const selectedKey of SELECTIONS) {
            const { selectedId } = oldIds(selectedKey);
            const oldPaint = buildFillPaint(
              selectedKey,
              selectedId,
              "#000000",
              rampOn ? ["bourgogne"] : [],
              world ? WORLD_HANDED_FACTOR : null,
            );
            const before = engine.compile("paint_fill", "fill-opacity", oldPaint["fill-opacity"], {});
            for (const key of keys) {
              const props = tileProps(key);
              const { featureState, globals } = newInputs(selectedKey, source, key);
              for (const state of globals) {
                const after = engine.compile("paint_fill", "fill-opacity", newPaint["fill-opacity"], state);
                for (const isHanded of handed) {
                  const fs = isHanded ? { ...featureState, handed: true } : featureState;
                  for (const zoom of ZOOMS) {
                    expect(after(zoom, props, fs), `${source} ${key} sel=${selectedKey} z${zoom} ramp=${rampOn} handed=${isHanded}`).toBe(
                      before(zoom, props, fs),
                    );
                    checked += 1;
                  }
                }
              }
            }
          }
        }
      }
      expect(checked).toBeGreaterThan(500);
    });
  }

  it("keeps the fill colour it is given and drops the antialias pass", () => {
    const color = ["get", "anything"];
    const paint = staticFillPaint({ color, ramp: true, worldHandoff: false });
    expect(paint["fill-color"]).toBe(color);
    expect(paint["fill-antialias"]).toBe(false);
  });
});

describe("staticLabelPaint matches labelPaint", () => {
  const PROPS = ["text-color", "text-opacity", "text-halo-color", "text-halo-width"] as const;
  for (const engine of ENGINES) {
    for (const theme of ["light", "dark"] as const) {
      it(`${engine.name}, ${theme}: every label paint property`, () => {
        const palette = MAP_PALETTES[theme];
        for (const { source, keys, handed } of CASES) {
          const world = source === WORLD;
          const newPaint = staticLabelPaint({ palette, worldHandoff: world });
          for (const selectedKey of SELECTIONS) {
            const { selectedId, selectedParentId } = oldIds(selectedKey);
            const plain = labelPaint(selectedKey, selectedId, selectedParentId, palette);
            // World labels multiply opacity by the handoff factor (tile-wine-map.tsx worldLabelPaint).
            const oldPaint: Record<string, unknown> = world
              ? { ...plain, "text-opacity": ["*", plain["text-opacity"], WORLD_HANDED_FACTOR] }
              : plain;
            for (const property of PROPS) {
              const before = engine.compile("paint_symbol", property, oldPaint[property], {});
              for (const key of keys) {
                const props = tileProps(key);
                const { featureState, globals } = newInputs(selectedKey, source, key);
                for (const state of globals) {
                  const after = engine.compile("paint_symbol", property, newPaint[property], state);
                  for (const isHanded of handed) {
                    const fs = isHanded ? { ...featureState, handed: true } : featureState;
                    expect(after(9, props, fs), `${property} ${source} ${key} sel=${selectedKey} handed=${isHanded}`).toBe(
                      before(9, props, fs),
                    );
                  }
                }
              }
            }
          }
        }
      });
    }
  }

  it("the selected label paint is the old selected weight, hidden with its world region", () => {
    for (const engine of ENGINES) {
      for (const theme of ["light", "dark"] as const) {
        const palette = MAP_PALETTES[theme];
        const selected = labelPaint("france.bourgogne", "id-bourgogne", "id-france", palette);
        const shardPaint = selectedLabelPaint({ palette, worldHandoff: false });
        const worldPaint = selectedLabelPaint({ palette, worldHandoff: true });
        const props = tileProps("france.bourgogne");
        for (const property of ["text-color", "text-opacity", "text-halo-color", "text-halo-width"]) {
          const want = engine.compile("paint_symbol", property, selected[property as keyof typeof selected], {})(9, props, {});
          expect(engine.compile("paint_symbol", property, shardPaint[property], {})(9, props, {}), property).toBe(want);
          expect(engine.compile("paint_symbol", property, worldPaint[property], {})(9, props, {}), property).toBe(want);
        }
        const handedOpacity = engine.compile("paint_symbol", "text-opacity", worldPaint["text-opacity"], {});
        expect(handedOpacity(9, props, { handed: true })).toBe(0);
      }
    }
  });
});

describe("label layout (D4: selection no longer moves size or collision order)", () => {
  const LAYOUT_PROPS = ["text-size", "symbol-sort-key", "text-transform", "text-letter-spacing"] as const;

  it("every ordinary label keeps its no-selection layout under any selection", () => {
    for (const engine of ENGINES) {
      const layout = staticLabelLayout();
      const noSelection = labelLayout(null, null, null, true);
      for (const property of LAYOUT_PROPS) {
        const after = engine.compile("layout_symbol", property, layout[property], {});
        const before = engine.compile("layout_symbol", property, noSelection[property], {});
        for (const key of [...SHARD_KEYS, ...WORLD_KEYS]) {
          expect(after(9, tileProps(key), {}), `${property} ${key}`).toBe(before(9, tileProps(key), {}));
        }
      }
    }
  });

  it("the selected label layer carries exactly the old selected size and sort key", () => {
    for (const engine of ENGINES) {
      const layout = selectedLabelLayout();
      for (const selectedKey of SELECTIONS.filter((k): k is string => k !== null)) {
        const { selectedId, selectedParentId } = oldIds(selectedKey);
        const old = labelLayout(selectedKey, selectedId, selectedParentId, true);
        const props = tileProps(selectedKey);
        for (const property of LAYOUT_PROPS) {
          const want = engine.compile("layout_symbol", property, old[property], {})(9, props, {});
          expect(engine.compile("layout_symbol", property, layout[property], {})(9, props, {}), `${property} ${selectedKey}`).toBe(want);
        }
      }
    }
  });

  it("what D4 changes, pinned: a distant label no longer shrinks or drops back", () => {
    const selectedKey = "france.bourgogne.cote-de-nuits.vosne-romanee";
    const { selectedId, selectedParentId } = oldIds(selectedKey);
    const old = labelLayout(selectedKey, selectedId, selectedParentId, true);
    const layout = staticLabelLayout();
    const distant = tileProps("france.bourgogne.cote-de-beaune.meursault");
    const size = (value: unknown) => standalone.compile("layout_symbol", "text-size", value, {})(9, distant, {});
    const sort = (value: unknown) => standalone.compile("layout_symbol", "symbol-sort-key", value, {})(9, distant, {});
    expect(size(old["text-size"])).toBe(11.5);
    expect(size(layout["text-size"])).toBe(12);
    expect(sort(old["symbol-sort-key"])).toBe(7);
    expect(sort(layout["symbol-sort-key"])).toBe(7);
    const related = tileProps("france.bourgogne.cote-de-nuits.gevrey-chambertin");
    const sortRelated = (value: unknown) =>
      standalone.compile("layout_symbol", "symbol-sort-key", value, {})(9, related, {});
    expect(sortRelated(old["symbol-sort-key"])).toBe(-1);
    expect(sortRelated(layout["symbol-sort-key"])).toBe(7);
  });

  it("text-field follows wm_local exactly as labelLayout followed `english`", () => {
    for (const engine of ENGINES) {
      const field = staticLabelLayout()["text-field"];
      for (const english of [true, false]) {
        const before = engine.compile("layout_symbol", "text-field", labelLayout(null, null, null, english)["text-field"], {});
        const after = engine.compile("layout_symbol", "text-field", field, { wm_local: !english });
        for (const name of ["Bourgogne", "Toscana", "Italia", "Meursault"]) {
          expect(after(9, { name }, {}), `${name} english=${english}`).toBe(before(9, { name }, {}));
        }
      }
    }
  });
});

describe("staticOutlinePaint", () => {
  it("is today's outline paint, with the handoff factor on the world copy only", () => {
    const color = worldRegionColor(MAP_PALETTES.light);
    expect(staticOutlinePaint({ color, worldHandoff: false })).toEqual({
      "line-color": color,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
    });
    expect(staticOutlinePaint({ color, worldHandoff: true })).toEqual({
      "line-color": color,
      "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
      "line-opacity": WORLD_HANDED_FACTOR,
    });
  });
});

describe("the builders make a valid style", () => {
  for (const theme of ["light", "dark"] as const) {
    it(`${theme}: validateStyleMin accepts every builder output`, () => {
      const palette = MAP_PALETTES[theme];
      const worldColor = worldRegionColor(palette);
      const shardColor = shardColorExpression({
        region: "bourgogne",
        areaSlugs: ["cote-de-nuits", "vosne-romanee", "meursault"],
        ramp: true,
        palette,
      });
      const layer = (id: string, type: string, source: string, sourceLayer: string, rest: object) => ({
        id,
        type,
        source,
        "source-layer": sourceLayer,
        ...rest,
      });
      const style = {
        version: 8,
        glyphs: "https://example.test/{fontstack}/{range}.pbf",
        sources: {
          [WORLD]: { type: "vector", url: "pmtiles://tiles.test/world.pmtiles", promoteId: "region" },
          [SHARD]: { type: "vector", url: "pmtiles://tiles.test/bourgogne.pmtiles", promoteId: "key" },
        },
        layers: [
          layer("world-region-fills", "fill", WORLD, "places", {
            filter: shardFilter(null),
            paint: staticFillPaint({ color: worldColor, ramp: false, worldHandoff: true }),
          }),
          layer("world-region-outlines", "line", WORLD, "places", {
            paint: staticOutlinePaint({ color: worldColor, worldHandoff: true }),
          }),
          layer("world-selected-ring", "line", WORLD, "places", { filter: selectedPlaceFilter() }),
          layer("world-labels", "symbol", WORLD, "labels", {
            layout: staticLabelLayout(),
            paint: staticLabelPaint({ palette, worldHandoff: true }),
          }),
          layer("world-selected-label", "symbol", WORLD, "labels", {
            filter: selectedPlaceFilter(),
            layout: selectedLabelLayout(),
            paint: selectedLabelPaint({ palette, worldHandoff: true }),
          }),
          layer("shard-fills-bourgogne", "fill", SHARD, "places", {
            filter: shardFilter("france"),
            paint: staticFillPaint({ color: shardColor, ramp: true, worldHandoff: false }),
          }),
          layer("shard-outlines-bourgogne", "line", SHARD, "places", {
            filter: shardFilter("france"),
            paint: staticOutlinePaint({ color: shardColor, worldHandoff: false }),
          }),
          layer("shard-labels-bourgogne", "symbol", SHARD, "labels", {
            filter: shardFilter("france"),
            layout: staticLabelLayout(),
            paint: staticLabelPaint({ palette, worldHandoff: false }),
          }),
          layer("shard-selected-label-bourgogne", "symbol", SHARD, "labels", {
            filter: selectedPlaceFilter(),
            layout: selectedLabelLayout(),
            paint: selectedLabelPaint({ palette, worldHandoff: false }),
          }),
        ],
      } as unknown as StyleSpecification;
      expect(validateStyleMin(style)).toEqual([]);
    });
  }
});

describe("the filters", () => {
  type Filter = (props: Record<string, unknown>) => boolean;
  const FILTER_ENGINES: { name: string; compile(filter: unknown, state: State): Filter }[] = [
    {
      name: "standalone style-spec",
      compile: (filter, state) => {
        const compiled = featureFilter(filter as never, state);
        return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props } as never);
      },
    },
    {
      name: "bundled maplibre-gl",
      compile: (filter, state) => {
        const compiled = bundledStyleEngine().featureFilter(filter, state);
        return (props) => compiled.filter({ zoom: 9 }, { type: 3, properties: props });
      },
    },
  ];

  it("shardFilter: an unknown country keeps full depth; a known one follows its flag", () => {
    const deep = tileProps("france.bourgogne.cote-de-nuits.vosne-romanee");
    for (const engine of FILTER_ENGINES) {
      expect(engine.compile(shardFilter(null), {})(deep), engine.name).toBe(true);
      expect(engine.compile(shardFilter("france"), { wm_local: true })(deep), engine.name).toBe(false);
      expect(engine.compile(shardFilter("france"), { wm_deep_france: true })(deep), engine.name).toBe(true);
      expect(engine.compile(shardFilter("france"), {})(tileProps("france.bourgogne")), engine.name).toBe(true);
    }
  });

  it("selectedPlaceFilter: only the selected key, and never a keyless feature", () => {
    const key = "france.bourgogne.cote-de-nuits";
    for (const engine of FILTER_ENGINES) {
      const on = engine.compile(selectedPlaceFilter(), { wm_sel_key: key, wm_keys: null });
      expect(on(tileProps(key)), engine.name).toBe(true);
      expect(on(tileProps("france.bourgogne")), engine.name).toBe(false);
      for (const state of [{}, { wm_sel_key: null }, { wm_local: true }]) {
        const off = engine.compile(selectedPlaceFilter(), state);
        const label = `${engine.name} ${JSON.stringify(state)}`;
        expect(off({ tier: 3 }), label).toBe(false);
        expect(off({ key: null, tier: 3 }), label).toBe(false);
        expect(off(tileProps(key)), label).toBe(false);
      }
    }
  });

  it("selectedPlaceFilter: the grape gate can hide the ring", () => {
    const key = "france.bourgogne.cote-de-nuits";
    const hidden = FILTER_ENGINES[0].compile(selectedPlaceFilter(), {
      wm_sel_key: key,
      wm_keys: { "france.bourgogne": true },
    });
    expect(hidden(tileProps(key))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/wine-map/shard-specs-static.test.ts`
Expected: FAIL — every case errors with `TypeError: (0 , __vi_import_…__.staticFillPaint) is not a function` (or the same for `staticLabelPaint`, `staticLabelLayout`, `selectedLabelLayout`, `staticOutlinePaint`, `shardFilter`, `selectedPlaceFilter`).

- [ ] **Step 3: Add the import to `shard-specs.ts`**

Add this line with the other relative imports at the top of `src/lib/wine-map/shard-specs.ts`:

```ts
import { depthTerm, grapeGateExpression, GS, labelTextField } from "./map-state";
```

- [ ] **Step 4: Append the static builders to the end of `shard-specs.ts`**

```ts
// Static layer specs (Phase 1b; spec §5.2). Nothing below changes with the
// selection, the grape filter, Local/English or the focus country: those are
// read from global state (map-state.ts) and feature-state (selection-state.ts).
// A selection used to rewrite the paint and layout of every mounted layer —
// each call validated, each one reloading its source; now it is a few
// feature-state writes plus one wm_sel_key write that only the world source's
// and the selected shard's overlay layers read.

/** The world archive's handed-off multiplier: 0 once the region's own shard
    has loaded (feature-state `handed`, set by TileWineMap's handoff effect),
    1 otherwise. Folded into fill, line and text opacity instead of a filter,
    so a handoff rewrites no layer. */
export const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];

const IS_SELECTED = ["boolean", ["feature-state", "sel"], false];
const IS_CHILD = ["boolean", ["feature-state", "child"], false];
const IS_RELATED = ["boolean", ["feature-state", "rel"], false];
// Something is selected: everything unrelated fades. On from the first
// selection of the session, since the explorer never clears one.
const HAS_SELECTION = ["==", ["global-state", GS.hasSel], true];

/** The fill paint every wine polygon layer shares. `ramp` is the shard's
    classification-ramp constant (the world archive passes false: its features
    carry no cru levels); `worldHandoff` folds WORLD_HANDED_FACTOR into each
    zoom stop, since the zoom interpolation must stay the top-level
    expression. */
export function staticFillPaint(input: {
  color: ColorExpression;
  ramp: boolean;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { color, ramp, worldHandoff } = input;
  // The selection pops, its direct children keep full presence (you drill
  // into them), everything else fades to 45% once something is selected. The
  // selected fill still relaxes at deep zoom so children read on top of it.
  const focus = (selectedOpacity: number, base: unknown) => {
    const focused = [
      "case",
      IS_SELECTED,
      selectedOpacity,
      IS_CHILD,
      base,
      HAS_SELECTION,
      ["*", base, 0.45],
      base,
    ];
    return worldHandoff ? ["*", focused, WORLD_HANDED_FACTOR] : focused;
  };
  return {
    // Every fill has its own outline layer, so the built-in antialias pass is
    // a redundant second edge.
    "fill-antialias": false,
    "fill-color": color,
    "fill-opacity": [
      "interpolate",
      ["linear"],
      ["zoom"],
      5,
      focus(0.6, ["min", 0.5, ["*", 0.16, ["get", "tier"]]]),
      9,
      // Classification intensity where the region ramps (grand cru solid,
      // premier cru firm, village land a light wash); one uniform mid opacity
      // where it does not.
      focus(0.3, [
        "match",
        classificationExpr,
        "grand_cru",
        ramp ? 0.65 : 0.4,
        "premier_cru",
        ramp ? 0.45 : 0.4,
        "communal",
        ramp ? 0.18 : 0.4,
        ["min", 0.5, ["*", 0.08, ["get", "tier"]]],
      ]),
    ],
  };
}

/** Outlines follow the fill palette, so deep levels are not ringed in the
    region hue. Shared by the shard outlines and the world region outlines, so
    a region drawn from either archive is pixel-identical. */
export function staticOutlinePaint(input: {
  color: ColorExpression;
  worldHandoff: boolean;
}): Record<string, unknown> {
  return {
    "line-color": input.color,
    "line-width": ["min", 2, ["+", 0.5, ["*", 0.4, ["get", "tier"]]]],
    ...(input.worldHandoff ? { "line-opacity": WORLD_HANDED_FACTOR } : {}),
  };
}

// Typography hierarchy: regions largest (uppercase, spaced), then steadily
// smaller through subregions, appellations and crus.
const LABEL_TIER_SIZE = ["match", ["get", "tier"], 0, 16, 1, 15, 2, 13.5, 3, 12, 4, 11, 10];

function labelLayoutBase(): Record<string, unknown> {
  return {
    "text-field": labelTextField(),
    "text-transform": ["match", ["get", "tier"], 0, "uppercase", 1, "uppercase", "none"],
    "text-letter-spacing": ["match", ["get", "tier"], 0, 0.1, 1, 0.08, 0.02],
  };
}

/** Every ordinary label layer. Size and collision priority no longer move
    with the selection (owner decision D4): feature-state cannot reach layout,
    and a global-state layout read would reload every label source on every
    selection. The selected place's own label is drawn by the
    selectedLabelLayout layer, and this copy of it loses to that one by
    collision. */
export function staticLabelLayout(): Record<string, unknown> {
  return {
    ...labelLayoutBase(),
    "text-size": LABEL_TIER_SIZE,
    "symbol-sort-key": ["-", 10, ["get", "tier"]],
  };
}

/** The selected place's label, one layer on its own source: 2.5 larger than
    its tier and first in collision order — what the selected label always
    got. */
export function selectedLabelLayout(): Record<string, unknown> {
  return {
    ...labelLayoutBase(),
    "text-size": ["+", LABEL_TIER_SIZE, 2.5],
    "symbol-sort-key": -2,
  };
}

/** Labels are never hidden by selection; it drives three weights instead:
    selected loudest, related (children, siblings, the parent) full presence,
    distant places lighter — and every label plain while nothing is selected. */
export function staticLabelPaint(input: {
  palette: MapPalette;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { label } = input.palette;
  const weigh = (selected: unknown, related: unknown, distant: unknown, plain: unknown) => [
    "case",
    IS_SELECTED,
    selected,
    IS_RELATED,
    related,
    HAS_SELECTION,
    distant,
    plain,
  ];
  const opacity = weigh(1, 0.95, 0.8, 1);
  return {
    "text-color": weigh(label.selected, label.related, label.distant, label.text),
    "text-opacity": input.worldHandoff ? ["*", opacity, WORLD_HANDED_FACTOR] : opacity,
    "text-halo-color": label.halo,
    "text-halo-width": weigh(2.2, 1.7, 1.3, 1.7),
  };
}

/** The selected label's paint: the "selected" weight, constant. The world
    copy still hides once its region is handed off, so it never draws beside
    the shard's own. */
export function selectedLabelPaint(input: {
  palette: MapPalette;
  worldHandoff: boolean;
}): Record<string, unknown> {
  const { label } = input.palette;
  return {
    "text-color": label.selected,
    "text-opacity": input.worldHandoff ? WORLD_HANDED_FACTOR : 1,
    "text-halo-color": label.halo,
    "text-halo-width": 2.2,
  };
}

/** A shard's fills, outlines and labels: the grape gate, plus region-level
    depth unless its country's wm_deep_ flag is on. A shard whose country is
    unknown (tree not loaded, or a shard newer than it) stays at full depth,
    as it always has. Never undefined: MapLibre silently drops a layer whose
    filter is. */
export function shardFilter(country: string | null): unknown[] {
  return country
    ? ["all", grapeGateExpression(), depthTerm(country)]
    : ["all", grapeGateExpression()];
}

/** The selection ring, its casing and the selected label: the selected key
    only, still subject to the grape gate. The feature's key is asserted to a
    string with an "" fallback, so a keyless feature can never equal a null
    wm_sel_key. Only these overlay layers read wm_sel_key, which is what keeps
    a selection's reloads to the world source and the selected place's shard. */
export function selectedPlaceFilter(): unknown[] {
  return [
    "all",
    grapeGateExpression(),
    ["==", ["string", ["get", "key"], ""], ["global-state", GS.selKey]],
  ];
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/wine-map/shard-specs-static.test.ts src/lib/wine-map/shard-specs.test.ts`
Expected: PASS — 18 tests in `shard-specs-static.test.ts` (the fill sweep alone checks > 500 old/new pairs per engine), and Task 1's `shard-specs.test.ts` unchanged. Mutation check worth doing once by hand: swap `IS_CHILD` for `IS_RELATED` in `staticFillPaint`, or write `HAS_SELECTION` as `["boolean", ["global-state", GS.hasSel]]` — both must turn the parity cases red; revert.

- [ ] **Step 6: Types and lint**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs-static.test.ts` — expected: no problems.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs-static.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): static paint, layout and filter builders for wine layers" -m "Selection emphasis from feature-state and wm_has_sel, pinned against today's buildFillPaint/labelLayout/labelPaint in both engines; D4 pinned explicitly." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Wire static specs + `MapStateSync` into `TileWineMap`

**Files:**
- Modify: `src/lib/wine-map/selection-state.ts` (append `fallbackFromContext`)
- Test: `src/lib/wine-map/selection-fallback.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` (imports; module constants and the `shardPaintTable` helper; the Task 2 / base module builders from `buildOutlinePaint` to `labelPaint`, deleted; props; paint memos below Task 2's colour memos; filters; state sync with its Fast Refresh recreate; `onLoad`; `interactiveLayerIds`; the world and shard `<Source>` JSX)
- Modify: `src/app/knowledge/map/tile-wine-map-explorer.tsx` (import, one memo, two props)

**Interfaces:**
- Consumes: everything Tasks 7-10 produce; `worldRegionColor`, `AREA_PALETTE_ZOOM`, `type ColorExpression` (Task 1); `shardColorsFor` and Task 2's `plainShardColors` / `rampedShardColors` / `rampedSet` memos and `NO_SLUGS_BY_SHARD` prop default (Task 2, all kept as they are).
- Produces:
  ```ts
  // selection-state.ts (addition)
  export function fallbackFromContext(
    context: { place: { key: string }; children: readonly { key: string }[]; ancestors: readonly { key: string }[] } | null,
    selectedKey: string | null,
  ): { childKeys: string[]; parentKey: string | null } | null;
  // TileWineMap props: `selectedId` and `selectedParentId` are REMOVED; added:
  tree?: readonly WinePlaceTreeNode[] | null;
  selectionFallback?: { childKeys: string[]; parentKey: string | null } | null;
  ```

Every JSX layer prop that changes (after this task every one of them is a module constant or a memo keyed only on the theme, the area slugs, the ramp latch or the shard→country map):

| Layer | Prop | Before (after Phase 1a) | After |
|---|---|---|---|
| world `<Source>` | `promoteId` | `"region"` | `"region"` (unchanged; now also carries `sel`/`child`/`rel`) |
| `world-fills` | `filter` | `worldCountryFilter` memo (grape-gated) | `WORLD_COUNTRY_FILTER` (tier 0; the gate always passed tier 0) |
| `world-outlines` | `filter` | `worldCountryFilter` | `WORLD_COUNTRY_FILTER` |
| `world-region-fills` | `filter` / `paint` | `worldRegionFilter` / `buildFillPaint(selectedKey, selectedId, …)` | `WORLD_REGION_FILTER` / `staticFillPaint({ color: regionColor, ramp: false, worldHandoff: true })` |
| `world-region-outlines` | `filter` / `paint` | `worldRegionFilter` / Task 2's outline | `WORLD_REGION_FILTER` / `staticOutlinePaint({ color: regionColor, worldHandoff: true })` |
| `world-selected-casing`, `world-selected-ring` | `filter` | `selectedGate` | `SELECTED_PLACE_FILTER` |
| `world-labels` | `filter` / `layout` / `paint` | `gatedWorldFilter` / `labelLayout(selectedKey, selectedId, selectedParentId, english)` / selection-keyed `worldLabelPaint` | `GRAPE_GATE` / `LABEL_LAYOUT` / `staticLabelPaint({ palette, worldHandoff: true })` |
| `world-selected-label` | new, after `world-labels` | — | `SELECTED_PLACE_FILTER` / `SELECTED_LABEL_LAYOUT` / `selectedLabelPaint({ palette, worldHandoff: true })` |
| shard `<Source>` | `promoteId` | none | `"key"` |
| `shard-fills-<key>` | `filter` / `paint` | `shardFilterFor(key)` / Task 2's selection-keyed `shardFillPaints[key]` | `shardFilters[key]` / `shardPaints[key].fill` (from Task 2's colour memos, via `staticFillPaint`) |
| `shard-outlines-<key>` | `filter` / `paint` | `shardFilterFor(key)` / Task 2's `shardOutlinePaints[key]` | `shardFilters[key]` / `shardPaints[key].outline` (via `staticOutlinePaint`) |
| `shard-selected-casing-<key>`, `shard-selected-ring-<key>` | `filter` | `selectedGate` | `SELECTED_PLACE_FILTER` |
| `shard-labels-<key>` | `filter` / `layout` / `paint` | `shardFilterFor(key)` / `labelLayout(…)` / selection-keyed `shardLabelPaint` | `shardFilters[key]` / `LABEL_LAYOUT` / `staticLabelPaint({ palette, worldHandoff: false })` |
| `shard-selected-label-<key>` | new, selected shard only, after `shard-labels-<key>` | — | `SELECTED_PLACE_FILTER` / `SELECTED_LABEL_LAYOUT` / `selectedLabelPaint({ palette, worldHandoff: false })` |
| `<Map>` | `interactiveLayerIds` | … `"world-labels"`, shard labels | + `"world-selected-label"`, + `` `shard-selected-label-${selectedShard}` `` |

The world source keeps both kinds of feature-state on the same ids: the handoff effect sets/removes only `handed`; `MapStateSync` sets/removes only `sel`/`child`/`rel`, always by name. Neither calls `removeFeatureState` without a key. The handoff effect is not edited.

What a selection now costs: `wm_sel_key` is read only by the world source's ring, casing and selected label and by the selected shard's overlays, so a selection reloads the world source plus the previous/new selected shard (whose overlay layers are added/removed) — never the other mounted shards (A2). Emphasis is feature-state (no reload). The first selection of a session also flips `wm_has_sel`, read by every layer's paint: one validated recompile + reload of every mounted source, once.

- [ ] **Step 1: Write the failing test for the context fallback**

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/wine-map/selection-fallback.test.ts`
Expected: FAIL — `TypeError: (0 , __vi_import_0__.fallbackFromContext) is not a function`.

- [ ] **Step 3: Append `fallbackFromContext` to `selection-state.ts`**

```ts
/** The place context's stand-in for the tree — for the selection it belongs
    to only. The explorer keeps showing the previous place's context while the
    next one loads, and that place's children must not light up under the new
    selection. */
export function fallbackFromContext(
  context: {
    place: { key: string };
    children: readonly { key: string }[];
    ancestors: readonly { key: string }[];
  } | null,
  selectedKey: string | null,
): { childKeys: string[]; parentKey: string | null } | null {
  if (!context || !selectedKey || context.place.key !== selectedKey) return null;
  return {
    childKeys: context.children.map((child) => child.key),
    parentKey: context.ancestors.at(-1)?.key ?? null,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/lib/wine-map/selection-fallback.test.ts src/lib/wine-map/selection-state.test.ts`
Expected: PASS, 4 + 12 tests.

- [ ] **Step 5: `tile-wine-map.tsx` — imports**

Replace
```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```
with
```ts
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
```

Replace
```ts
import maplibregl, { type StyleSpecification } from "maplibre-gl";
```
with
```ts
import maplibregl, { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
```

Replace
```ts
import {
  englishName,
  englishTextFieldExpression,
} from "@/lib/wine-map/localize-names";
```
with
```ts
import { englishName } from "@/lib/wine-map/localize-names";
```

Replace
```ts
import { keyGateExpression } from "@/lib/wine-map/key-gate";
```
with
```ts
import { desiredGlobalState, grapeGateExpression } from "@/lib/wine-map/map-state";
import { MapStateSync } from "@/lib/wine-map/map-state-sync";
import { selectionFeatureStates } from "@/lib/wine-map/selection-state";
import type { WinePlaceTreeNode } from "@/lib/wine-map/tree";
```

Replace the `@/lib/wine-map/shard-specs` import Task 2 added (`classificationExpr` loses its last user, `buildFillPaint`, in Step 6; `shardColorsFor` and `type ColorExpression` stay in use)
```ts
import {
  AREA_PALETTE_ZOOM,
  classificationExpr,
  shardColorsFor,
  worldRegionColor,
  type ColorExpression,
} from "@/lib/wine-map/shard-specs";
```
with
```ts
import {
  AREA_PALETTE_ZOOM,
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  shardColorsFor,
  shardFilter,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
  type ColorExpression,
} from "@/lib/wine-map/shard-specs";
```

Replace the `@/lib/wine-map/map-palette` import as Task 2 left it (`type MapPalette` loses its last user, `labelPaint`, in Step 6)
```ts
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
  type MapPalette,
} from "@/lib/wine-map/map-palette";
```
with
```ts
import {
  classificationShades,
  districtColor,
  MAP_PALETTES,
} from "@/lib/wine-map/map-palette";
```

- [ ] **Step 6: `tile-wine-map.tsx` — module level**

Delete this block (it moved to `shard-specs.ts` in Task 10):
```ts
// Multiplier for the world archive's region layers: 0 once the region's own
// shard has loaded (feature-state `handed`, set by the effect on
// handedOffShards), 1 otherwise. Applied to fill/line/text opacity in place of
// a filter, so a handoff never rewrites a layer — see the world Source below.
const WORLD_HANDED_FACTOR = [
  "case",
  ["boolean", ["feature-state", "handed"], false],
  0,
  1,
];

```

Replace (no layer needs `PASS_FILTER` any more: every filter carries at least the grape gate)
```ts
// The no-filter state for layers whose filter is sometimes absent. MapLibre
// rejects `undefined` in addLayer (the layer then never mounts), so "no
// filter" must be an always-true expression instead.
const PASS_FILTER = ["boolean", true] as unknown as boolean;

// Same trap as PASS_FILTER, one property over: react-map-gl feeds `layout`
```
with
```ts
// MapLibre rejects an `undefined` filter in addLayer (the layer then never
// mounts), which is why every wine filter below carries at least the grape
// gate. The same trap, one property over: react-map-gl feeds `layout`
```

Replace
```ts
const LAYER_VISIBLE = { visibility: "visible" } as const;
const LAYER_HIDDEN = { visibility: "none" } as const;
```
with
```ts
const LAYER_VISIBLE = { visibility: "visible" } as const;
const LAYER_HIDDEN = { visibility: "none" } as const;

// Every wine layer's filter, layout and paint is static for the session
// (lib/wine-map/shard-specs). The grape filter, Local/English, the focus
// country's depth and the selection are MapLibre global state and
// feature-state, written by one MapStateSync (lib/wine-map/map-state-sync).
// Built once here; react-map-gl compares props by identity and then deep
// equality, so after a layer mounts none of these is ever re-sent.
type FillPaint = NonNullable<Extract<LayerSpecification, { type: "fill" }>["paint"]>;
type LinePaint = NonNullable<Extract<LayerSpecification, { type: "line" }>["paint"]>;
type SymbolPaint = NonNullable<Extract<LayerSpecification, { type: "symbol" }>["paint"]>;
type SymbolLayout = NonNullable<Extract<LayerSpecification, { type: "symbol" }>["layout"]>;
// Every world label; the grape gate is the only thing that ever narrows it.
const GRAPE_GATE = grapeGateExpression() as unknown as boolean;
// Tier 0 only — the country wash. It used to carry the grape gate too, which
// passes tier 0 unconditionally, so the gate never changed what it drew.
const WORLD_COUNTRY_FILTER = ["==", ["get", "tier"], 0] as unknown as boolean;
// Every region (tier >= 1), grape-gated. A handed-off region is zeroed by
// feature-state, not filtered.
const WORLD_REGION_FILTER = [
  "all",
  [">=", ["get", "tier"], 1],
  grapeGateExpression(),
] as unknown as boolean;
// The selected place only: its ring, its casing and its label.
const SELECTED_PLACE_FILTER = selectedPlaceFilter() as unknown as boolean;
const LABEL_LAYOUT = staticLabelLayout() as SymbolLayout;
const SELECTED_LABEL_LAYOUT = selectedLabelLayout() as SymbolLayout;

// One static fill/outline pair per shard, from a shardColorsFor table (whose
// `ramp` it shares). Object.fromEntries, not assignment: a shard key is an own
// entry here whatever it is called.
function shardPaintTable(
  colors: Readonly<Record<string, ColorExpression>>,
  ramp: boolean,
): Record<string, { fill: FillPaint; outline: LinePaint }> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      {
        fill: staticFillPaint({ color, ramp, worldHandoff: false }) as FillPaint,
        outline: staticOutlinePaint({ color, worldHandoff: false }) as LinePaint,
      },
    ]),
  );
}
```

Delete the module-level declarations `buildOutlinePaint`, `buildFillPaint`, `selectedFilter`, `relatedExpression`, `LABEL_TIER_SIZE`, `labelLayout` and `labelPaint`, each with the comment block directly above it. In the file as Phase 1a leaves it they are one contiguous run: start at Task 2's line `// Shared by the shard outlines and the world archive's region outlines, so a` (the comment above `buildOutlinePaint`) and delete through `labelPaint`'s closing `}` and the blank line after it — the run covers `buildOutlinePaint`, `buildFillPaint` with its Task 2 comment (`` // The fill paint every wine polygon layer shares. `color` is that layer's ``), `selectedFilter`, `relatedExpression`, `LABEL_TIER_SIZE`, `labelLayout` and `labelPaint`. Keep Task 2's block directly above the run, `// Every colour a wine polygon paints comes from lib/wine-map/shard-specs: …` down to `// idle-time scan (latchRampedRegions), not re-decided per viewport.`; it is still accurate. Afterwards that block's last line is followed by one blank line and then `export function TileWineMap({`.

Leave `NO_SLUGS_BY_SHARD` (Task 2) alone: it is still the `areaSlugsByShard` prop's default.

- [ ] **Step 7: `tile-wine-map.tsx` — props**

Replace
```ts
  selectedKey,
  selectedId,
  selectedParentId,
  cameraTarget,
```
with
```ts
  selectedKey,
  cameraTarget,
```

Replace
```ts
  english = false,
}: {
```
with
```ts
  english = false,
  tree = null,
  selectionFallback = null,
}: {
```

Delete
```ts
  /** The selected place's id — lets label/fade rules target its children. */
  selectedId: string | null;
  /** The selected place's parent id — keeps sibling labels visible. */
  selectedParentId: string | null;
```

Replace
```ts
  english?: boolean;
}) {
```
with
```ts
  english?: boolean;
  /** The verified place tree, when it has loaded: the selection's children,
      siblings and parent for the map's emphasis (lib/wine-map/selection-state). */
  tree?: readonly WinePlaceTreeNode[] | null;
  /** The place context's children and parent, for the emphasis while the tree
      is missing; null when there is none for the current selection. */
  selectionFallback?: { childKeys: string[]; parentKey: string | null } | null;
}) {
```

- [ ] **Step 8: `tile-wine-map.tsx` — static paint memos**

Task 2's `plainShardColors`, `rampedShardColors` and `rampedSet` memos stay exactly as they are. Replace everything from Task 2's comment line `  // Selection-aware paint, per shard. The zoom interpolation fades fills — the` (directly below `rampedSet`) up to (not including) the line `  const attribution = useMemo(` — Task 2's `shardFillPaints`, `shardOutlinePaints`, `regionColor`, `worldRegionFillPaint` and `worldRegionOutlinePaint`, then the base file's `shardLabelPaint`, `worldLabelPaint`, casing and ring memos — with:

```tsx
  // Static paint (lib/wine-map/shard-specs). Nothing here moves with the
  // selection any more: the selected place, its children and its relatives are
  // feature-state, and "something is selected" is the wm_has_sel global — all
  // written by MapStateSync. So these re-key only on what shapes a colour: the
  // landed theme, the catalogue's area slugs (once, when the tree lands) and
  // the ramp latch (at most once per region per session).
  //
  // One fill/outline pair per shard, from the two colour tables above. The
  // plain table rebuilds only when the tree lands or the theme flips; a region
  // joining the ramp latch rebuilds only the ramped one, so every other shard
  // keeps the very same paint objects and react-map-gl's paint diff skips them
  // on identity.
  const plainShardPaints = useMemo(
    () => shardPaintTable(plainShardColors, false),
    [plainShardColors],
  );
  const rampedShardPaints = useMemo(
    () => shardPaintTable(rampedShardColors, true),
    [rampedShardColors],
  );
  const shardPaints = useMemo(
    () =>
      Object.fromEntries(
        shardEntries.map(([key]) => [
          key,
          rampedSet.has(key) ? rampedShardPaints[key] : plainShardPaints[key],
        ]),
      ),
    [shardEntries, rampedSet, rampedShardPaints, plainShardPaints],
  );
  // The world archive's country and region colour: every region's hue, one
  // cached expression per theme, so the reference only changes on a flip.
  // World features carry no area slugs, so this paints them exactly as the
  // shard expressions paint the same region (shard-specs.test.ts).
  const regionColor = worldRegionColor(palette) as unknown as string;
  // The world archive's copy of the shard paint, with the handed-off
  // multiplier folded in (see the effect on handedOffShards).
  const worldRegionFillPaint = useMemo(
    () => staticFillPaint({ color: regionColor, ramp: false, worldHandoff: true }) as FillPaint,
    [regionColor],
  );
  const worldRegionOutlinePaint = useMemo(
    () => staticOutlinePaint({ color: regionColor, worldHandoff: true }) as LinePaint,
    [regionColor],
  );
  // Label paint: the selected / related / distant weights come from
  // feature-state, so there is one object per theme. World labels also vanish
  // with their handed-off region.
  const shardLabelPaint = useMemo(
    () => staticLabelPaint({ palette, worldHandoff: false }) as SymbolPaint,
    [palette],
  );
  const worldLabelPaint = useMemo(
    () => staticLabelPaint({ palette, worldHandoff: true }) as SymbolPaint,
    [palette],
  );
  const shardSelectedLabelPaint = useMemo(
    () => selectedLabelPaint({ palette, worldHandoff: false }) as SymbolPaint,
    [palette],
  );
  const worldSelectedLabelPaint = useMemo(
    () => selectedLabelPaint({ palette, worldHandoff: true }) as SymbolPaint,
    [palette],
  );
  // The selection ring and the keyline casing under it, world and shard alike.
  const selectedCasingPaint = useMemo(
    () => ({ "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 }),
    [palette],
  );
  const selectedRingPaint = useMemo(
    () => ({ "line-color": palette.selectedRing, "line-width": 2.5 }),
    [palette],
  );
```

After this step nothing calls `buildFillPaint`, `buildOutlinePaint`, `labelPaint` or `labelLayout` (deleted in Step 6), and `shardColorsFor` still feeds every shard's colour through Task 2's memos.

- [ ] **Step 9: `tile-wine-map.tsx` — filters**

Replace everything from the line `  // World layers carry the country (tier 0) and every region. A region whose` up to (not including) the line `  // Legend regions follow the viewport once the first scan lands; the` — the `keyGate`, `gatedWorldFilter`, `worldCountryFilter`, `worldRegionFilter`, `shardFilterFor` and `selectedGate` block — with:

```tsx
  // World layers carry the country (tier 0) and every region. A region whose
  // shard has loaded is hidden through feature-state (see the effect on
  // handedOffShards), and the grape gate, the focus country's depth and the
  // selection are global state (lib/wine-map/map-state), so every world filter
  // is a module constant. A region whose shard is not loaded is drawn from the
  // world archive by the region layers, which reuse the shard paint exactly —
  // which is what lets the map open with zero shard archives (see
  // SHARD_MIN_ZOOM) without changing a pixel.
  //
  // Subregion depth, one country at a time: a shard outside the focus country
  // renders only its regions (tier <= 1), so neighbours stay on the map as
  // context instead of every country exploding into subregions at once. The
  // rule is that country's wm_deep_<country> flag, read by each of its shards'
  // filters; a shard whose country the tree does not name is left at full
  // depth rather than blanked. So these filters change only when the tree
  // lands, and a focus change is one global-state write that reloads just the
  // two countries' shards — it used to setFilter three layers on every mounted
  // shard.
  const shardFilters = useMemo(
    () =>
      Object.fromEntries(
        shardEntries.map(([key]) => [
          key,
          // Own properties only: a shard key never reads a country off the
          // object prototype.
          shardFilter(
            Object.prototype.hasOwnProperty.call(shardCountries, key)
              ? shardCountries[key]
              : null,
          ) as unknown as boolean,
        ]),
      ),
    [shardEntries, shardCountries],
  );
```

- [ ] **Step 10: `tile-wine-map.tsx` — the state sync**

Immediately after the `focusCountry` memo, i.e. after
```ts
    return viewportCountry;
  }, [selectedKey, viewportCountries, viewportCountry]);
```
insert:

```tsx
  // The one writer of every global-state value and of the selection's
  // feature-state (lib/wine-map/map-state-sync), created in onLoad. React only
  // ever changes the desired snapshot: a value computed before the map existed
  // (a ?place= deep link, the stored language) is applied at load, a style
  // rebuild re-sends all of it, and no write can throw into React.
  const stateSyncRef = useRef<MapStateSync | null>(null);
  const knownCountries = useMemo(
    () => [...new Set(Object.values(shardCountries))].sort(),
    [shardCountries],
  );
  const desiredGlobal = useMemo(
    () =>
      desiredGlobalState({
        visibleKeys,
        english,
        selectedKey,
        deepCountries: focusCountry ? [focusCountry] : [],
        knownCountries,
      }),
    [visibleKeys, english, selectedKey, focusCountry, knownCountries],
  );
  const selectionStates = useMemo(
    () => selectionFeatureStates({ roots: tree, selectedKey, fallback: selectionFallback }),
    [tree, selectedKey, selectionFallback],
  );
  const desiredStateRef = useRef({ global: desiredGlobal, selection: selectionStates });
  // A layout effect, not a passive one: react-map-gl applies filter and layer
  // changes during render, and MapLibre sends them to the worker on its next
  // frame. Writing the global state before that frame means those parses
  // already see it — the tree landing (new depth terms), or a selection's new
  // ring and label layers, parse once with the right values instead of once
  // with stale ones and again after a passive effect caught up.
  useLayoutEffect(() => {
    desiredStateRef.current = { global: desiredGlobal, selection: selectionStates };
    stateSyncRef.current?.setDesired(desiredStateRef.current);
  }, [desiredGlobal, selectionStates]);
  // A shard that just mounted has no selection flags yet (its source did not
  // exist at the last apply); a no-op when nothing is missing.
  useEffect(() => {
    stateSyncRef.current?.apply();
  }, [mountedShards]);
  useEffect(() => {
    // Normally onLoad creates the sync. But Fast Refresh (dev) cleans up and
    // re-runs every effect while the MapLibre instance survives, and onLoad
    // never fires again — without this the sync would stay disposed and the
    // map would stop following the selection, grape and language until a
    // reload.
    const map = mapRef.current?.getMap();
    if (map && mapReadyRef.current && !stateSyncRef.current) {
      stateSyncRef.current = new MapStateSync(map);
      stateSyncRef.current.setDesired(desiredStateRef.current);
    }
    return () => {
      stateSyncRef.current?.dispose();
      stateSyncRef.current = null;
    };
  }, []);
```

(On first mount the map has not loaded, so the setup half does nothing and onLoad creates the sync. Under Fast Refresh React runs every cleanup, then every setup in order: the layout effect above has already refreshed `desiredStateRef`, so the recreated sync starts from the current snapshot.)

- [ ] **Step 11: `tile-wine-map.tsx` — create the sync in `onLoad`**

Replace
```ts
          mapReadyRef.current = true;
```
with
```ts
          mapReadyRef.current = true;
          // The one global-state and feature-state writer. It applies what
          // React has already computed (a deep link's selection, the stored
          // language) at once, and again after every style.load.
          stateSyncRef.current?.dispose();
          stateSyncRef.current = new MapStateSync(e.target);
          stateSyncRef.current.setDesired(desiredStateRef.current);
```
(It sits before the existing `e.target.on("style.load", …)` and `swapBasemap(latestThemeRef.current)`, so a cached-style flip that lands synchronously already has the sync's listener.)

- [ ] **Step 12: `tile-wine-map.tsx` — `interactiveLayerIds`**

Replace
```tsx
          "world-labels",
          ...mountedShards.map((key) => `shard-labels-${key}`),
        ]}
```
with
```tsx
          "world-labels",
          ...mountedShards.map((key) => `shard-labels-${key}`),
          // The selected place's own label: its ordinary copy loses to it by
          // collision, so this is what a click on that name lands on.
          "world-selected-label",
          ...(selectedShard ? [`shard-selected-label-${selectedShard}`] : []),
        ]}
```
(react-maplibre filters the list through `map.getLayer` before querying, so an id that is not mounted yet is harmless.)

- [ ] **Step 13: `tile-wine-map.tsx` — the world and shard sources**

Replace everything from the line ``        {/* promoteId: the `region` property becomes the feature id, for the`` through the line `        ))}` that closes the shard `.map(...)` — the line just before `      </Map>` — with:

```tsx
        {/* promoteId: the `region` property becomes the feature id, for the
            handoff's feature-state (a region's polygon in `places` and each
            of its island labels in `labels` all carry it; a country's tier-0
            row carries its own key, which no shard key ever equals). The
            selection's sel/child/rel flags (lib/wine-map/selection-state)
            ride on the same ids next to `handed`; MapStateSync and the
            handoff effect each remove only their own flags, by name. */}
        <Source
          id={WORLD_SOURCE_ID}
          type="vector"
          url={`pmtiles://${manifest.world.url}`}
          promoteId="region"
        >
          {/* The world archive carries the country plus every region, so
              selecting France shows all its regions. A region already served
              by a loaded shard is drawn at opacity 0 (feature-state `handed`)
              rather than filtered out, so the handoff rewrites no layer. The
              hidden copy still costs a draw — one full-tile fill pass per
              handed-off region under the view — and still hit-tests and
              scans; both resolve to the same key/tier as the shard's copy.
              Every filter, layout and paint below is static for the session
              (module constants and palette-keyed memos). */}
          <Layer
            id="world-fills"
            type="fill"
            source-layer="places"
            // The country wash fades to 0.02 opacity by z9 — invisible, but
            // still a full-viewport translucent blend every frame on top of
            // every region/appellation/site fill beneath it. Stop drawing it
            // once it stops being perceptible. Outlines are unaffected, and
            // regions are drawn by their shard (which viewport gating
            // guarantees is mounted whenever one is on screen).
            maxzoom={8}
            filter={WORLD_COUNTRY_FILTER}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            paint={{
              // See staticFillPaint: the outline layer supplies the edge, so
              // the built-in fill antialias pass is redundant work.
              "fill-antialias": false,
              "fill-color": regionColor,
              "fill-opacity": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                ["case", ["==", ["get", "tier"], 0], 0.1, 0.35],
                6,
                ["case", ["==", ["get", "tier"], 0], 0.04, 0.28],
                9,
                ["case", ["==", ["get", "tier"], 0], 0.02, 0.12],
              ] as unknown as number,
            }}
          />
          <Layer
            id="world-outlines"
            type="line"
            source-layer="places"
            filter={WORLD_COUNTRY_FILTER}
            paint={{
              "line-color": regionColor,
              "line-width": ["case", ["==", ["get", "tier"], 0], 1, 1.5] as unknown as number,
            }}
          />
          {/* Regions no loaded shard is covering, drawn with the shards' own
              fill and outline paint. Below SHARD_MIN_ZOOM no shard is mounted at
              all, so these are what render the regions — identical pixels, but
              from one already-open archive instead of 54. */}
          <Layer
            id="world-region-fills"
            type="fill"
            source-layer="places"
            filter={WORLD_REGION_FILTER}
            paint={worldRegionFillPaint}
            layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
          />
          <Layer
            id="world-region-outlines"
            type="line"
            source-layer="places"
            filter={WORLD_REGION_FILTER}
            paint={worldRegionOutlinePaint}
          />
          <Layer
            id="world-selected-casing"
            type="line"
            source-layer="places"
            filter={SELECTED_PLACE_FILTER}
            paint={selectedCasingPaint}
          />
          <Layer
            id="world-selected-ring"
            type="line"
            source-layer="places"
            filter={SELECTED_PLACE_FILTER}
            paint={selectedRingPaint}
          />
          {/* A handed-off region's world label is invisible (text-opacity 0)
              but still occupies its collision box, so it must LOSE that
              collision to the shard's own label. MapLibre places symbol
              layers from the TOP of the style down (PauseablePlacement starts
              at order.length - 1), and the first placed wins — so the loser
              has to sit BELOW the shard label layers. It does: the world
              Source mounts first and every shard's layers are appended above
              it when the shard mounts, so no beforeId is needed. Do not move
              this layer above the shards' labels to "give it priority"; that
              would let the invisible copy blank the visible one. */}
          <Layer
            id="world-labels"
            type="symbol"
            source-layer="labels"
            filter={GRAPE_GATE}
            layout={LABEL_LAYOUT}
            paint={worldLabelPaint}
          />
          {/* A selected country or region's own label, larger and first in
              collision (D4: the ordinary label layers no longer change size
              or order with the selection). Directly above world-labels, so
              it beats the ordinary copy of itself, and still below every
              shard layer, so while its region is handed off its invisible
              copy loses to the shard's selected label exactly as world-labels
              loses to shard-labels. */}
          <Layer
            id="world-selected-label"
            type="symbol"
            source-layer="labels"
            filter={SELECTED_PLACE_FILTER}
            layout={SELECTED_LABEL_LAYOUT}
            paint={worldSelectedLabelPaint}
          />
        </Source>
        {shardEntries
          .filter(([key]) => mountedSet.has(key))
          .map(([key, shard]) => (
          // promoteId="key": a shard feature's id is its canonical key, which
          // is what the selection's feature-state names.
          <Source
            key={key}
            id={shardSourceId(key)}
            type="vector"
            url={`pmtiles://${shard.url}`}
            promoteId="key"
          >
            <Layer
              id={`shard-fills-${key}`}
              type="fill"
              source-layer="places"
              filter={shardFilters[key]}
              paint={shardPaints[key].fill}
              layout={noFills ? LAYER_HIDDEN : LAYER_VISIBLE}
            />
            <Layer
              id={`shard-outlines-${key}`}
              type="line"
              source-layer="places"
              filter={shardFilters[key]}
              paint={shardPaints[key].outline}
            />
            {/* Only the owning shard can match the selected key — on every
                other shard these overlays are filtered to nothing, so
                mounting them here alone is pixel-identical and drops ~160
                layers. They are the only shard layers that read wm_sel_key,
                so a selection reloads this shard and no other. */}
            {key === selectedShard && (
              <Layer
                id={`shard-selected-casing-${key}`}
                type="line"
                source-layer="places"
                filter={SELECTED_PLACE_FILTER}
                paint={selectedCasingPaint}
              />
            )}
            {key === selectedShard && (
              <Layer
                id={`shard-selected-ring-${key}`}
                type="line"
                source-layer="places"
                filter={SELECTED_PLACE_FILTER}
                paint={selectedRingPaint}
              />
            )}
            <Layer
              id={`shard-labels-${key}`}
              type="symbol"
              source-layer="labels"
              filter={shardFilters[key]}
              layout={LABEL_LAYOUT}
              paint={shardLabelPaint}
            />
            {/* The selected place's label: larger, darkest, and above this
                shard's own labels so it is placed first and its ordinary copy
                loses by collision. Added after the shard's other layers, so a
                selection in an already-mounted shard puts it at the top of the
                style. (A shard mounted later stacks above it, as the ring
                always has; Phase 1c's controller keeps overlays on top.) */}
            {key === selectedShard && (
              <Layer
                id={`shard-selected-label-${key}`}
                type="symbol"
                source-layer="labels"
                filter={SELECTED_PLACE_FILTER}
                layout={SELECTED_LABEL_LAYOUT}
                paint={shardSelectedLabelPaint}
              />
            )}
          </Source>
        ))}
```

- [ ] **Step 14: `tile-wine-map-explorer.tsx`**

Add the import after `import { deepLinkAction } from "@/lib/wine-map/deep-link";`:
```ts
import { fallbackFromContext } from "@/lib/wine-map/selection-state";
```

Insert immediately before the line `  const article =`:
```ts
  // The map's selection emphasis while the tree is missing (loading, failed,
  // or older than the tiles): the context's children and parent — and only
  // once the context describes the current selection, not the previous one.
  const selectionFallback = useMemo(
    () => fallbackFromContext(context, selectedKey),
    [context, selectedKey],
  );

```

In the `<TileWineMap … />` element replace (keep the element's indentation)
```tsx
                selectedId={context?.place.id ?? null}
                selectedParentId={context?.ancestors.at(-1)?.id ?? null}
```
with
```tsx
                tree={tree}
                selectionFallback={selectionFallback}
```
(`tree` is the explorer's loaded roots array, `WinePlaceTreeNode[] | null`, as Task 4 leaves it.)

- [ ] **Step 15: Leftover check, types, lint, full suite**

Run: `git grep -n -E "selectedId|selectedParentId|keyGate|shardFilterFor|selectedGate|gatedWorldFilter|worldCountryFilter|worldRegionFilter|PASS_FILTER|buildFillPaint|buildOutlinePaint|shardFillPaints|shardOutlinePaints|classificationExpr|labelLayout\(|labelPaint\(|relatedExpression|selectedFilter\(|englishTextFieldExpression|shardColorExpression" -- src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx`
Expected: no output.
Run: `git grep -n -E "shardColorsFor|NO_SLUGS_BY_SHARD|plainShardColors|rampedShardColors" -- src/app/knowledge/map/tile-wine-map.tsx`
Expected: the import, the `areaSlugsByShard = NO_SLUGS_BY_SHARD,` default and its declaration, Task 2's two colour memos, and their uses in `plainShardPaints`/`rampedShardPaints` — Task 2's colour path is still live.
Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx src/lib/wine-map/selection-state.ts src/lib/wine-map/selection-fallback.test.ts` — expected: no problems.
Run: `npx vitest run` — expected: the whole suite passes (base count + this phase's new tests).

- [ ] **Step 16: Manual verification (main session, production build via the `start` config)**

With a signed-in session on `/knowledge/map`:
1. `?place=france.bourgogne.cote-de-nuits.vosne-romanee`: after the camera lands (≈ z12) the gold ring and a larger, darkest "Vosne-Romanée" label show; La Tâche/Les Suchots fills keep full presence while Côte de Beaune's fade; distant labels are dimmer in colour but the SAME size as before selecting (D4); no duplicate "Vosne-Romanée" label.
2. Tap Gevrey-Chambertin, then a Champagne village, then Italy (key `italy`; "Italia" with Local names) in the tree: exactly one place ringed and emphasised each time; no leftover emphasis in Bourgogne after the Champagne pick.
3. With Bourgogne handed off (z7, its world copy hidden), select "Bourgogne" in the tree: one "BURGUNDY"/"BOURGOGNE" label, not two, and no double outline — `handed` survived the selection flags.
4. Toggle Local ↔ English with 20+ shards mounted (France z6): every region and subregion label switches, world and shard alike.
5. Pick Chardonnay, then clear the grape: the filter narrows, and clearing shows every place again (never "only France").
6. Flip light ↔ dark with a place selected: ring, emphasis, grape filter and language all persist.
7. Forced rebuild: open with `?debugClick=1`, run `window.__wineMap.style.setState = () => { throw new Error("x") }` in the console, flip the theme: after the rebuild lands, selection ring, emphasis, grape filter, focus depth and language are all still right.
8. Console: no `Expected value to be of type`, `Style is not done loading` or `The source '…' does not exist` messages.
9. Reloads per selection (A2), first AND later. Fresh page, `/knowledge/map?debugClick=1`, zoom to Bourgogne z9 (Bourgogne, Champagne, Jura and more mounted) and wait for the map to settle (Bourgogne's ramp latch lands on that idle and reloads its shard once — it must not fall inside the count). In the console, wrap the reload path before selecting anything:
   ```js
   const s = window.__wineMap.style, orig = s._reloadSource, seen = [];
   s._reloadSource = function (id) { seen.push(id); return orig.call(this, id); };
   ```
   - Select Gevrey-Chambertin in the tree, wait for the map to settle, run `[...new Set(seen)].sort()`: expected every mounted `wine-shard-*` plus `wine-world`. This is the session's first selection, which flips `wm_has_sel` (read by every layer's paint): the one accepted full reload (spec §5.2).
   - `seen.length = 0`, select Vosne-Romanée, settle, run the same line: expected exactly `["wine-shard-bourgogne", "wine-world"]`.
   - `seen.length = 0`, select a Champagne village, settle: expected exactly `["wine-shard-bourgogne", "wine-shard-champagne", "wine-world"]` (the old selected shard drops its overlays, the new one adds them). Any other shard in the list fails A2.
10. G1 for a selection, first AND later, through the probe's own selection gesture (Run test selects Vosne-Romanée with no camera move):
   - Page A, fresh `/knowledge/map?debugPerf=1`: Run test; record the selection row. It is the session's first selection, so it carries the one-off `wm_has_sel` reload: `reloadedSources` lists every mounted source. Judge its `longTasks`/`worst` against Phase 1a's row for the same gesture.
   - Page B, fresh `/knowledge/map?debugPerf=1&place=france.bourgogne.cote-de-nuits.gevrey-chambertin`: wait until Gevrey-Chambertin is ringed (the deep link was the first selection), then Run test; record the selection row. It is a later selection: expected `reloadedSources` exactly `wine-shard-bourgogne` and `wine-world`, and no long task.
   Both rows go into Task 13's results.
11. Fast Refresh (the `dev` config, not `start`): open `/knowledge/map?place=france.bourgogne.cote-de-nuits.vosne-romanee`, then add a blank line to `src/app/knowledge/map/tile-wine-map.tsx` and save (remove it again afterwards; never commit it). After the refresh, select Gevrey-Chambertin, toggle Local ↔ English and pick a grape: the ring, labels and filter all follow. (Without the recreate in Step 10's dispose effect, the sync would stay disposed here until a full reload.)

- [ ] **Step 17: Commit**

```bash
git add src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx src/lib/wine-map/selection-state.ts src/lib/wine-map/selection-fallback.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): static wine layers driven by global state and feature-state" -m "Grape gate, Local/English, focus depth and the selected key are wm_* global state; selection emphasis is feature-state; the selected label is its own layer (D4). MapStateSync is the only writer." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Readiness latch (`handoff.ts`)

**Files:**
- Create: `src/lib/wine-map/handoff.ts`
- Test: `src/lib/wine-map/handoff.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx` (one import; the readiness comment and `recomputeReady`; one effect after `flushReady`)

**Interfaces:**
- Consumes: `type Bbox` (Task 1, `shard-specs.ts`).
- Produces (contract): `export function latchReady(prev: ReadonlySet<string>, mounted: readonly string[], probe: (key: string) => { added: boolean; loaded: boolean; inView: boolean }): string[]; // sorted`
- Produces (addition): `export type ShardProbe = { added: boolean; loaded: boolean; inView: boolean };` and `export function bboxInView(bbox: Bbox | undefined, view: Bbox): boolean;` (no bbox → in view, as the mount rule treats a v1 manifest).

- [ ] **Step 1: Write the failing test**

```ts
// The handoff latch decides whether a region is drawn by the world archive or
// by its own shard. Wrong one way it leaves a hole (the world copy hidden over
// a shard with no tiles yet); wrong the other it draws the region twice.
import { describe, expect, it } from "vitest";
import { bboxInView, latchReady, type ShardProbe } from "./handoff";

const probes = (table: Record<string, Partial<ShardProbe>>) => (key: string): ShardProbe => ({
  added: true,
  loaded: false,
  inView: true,
  ...table[key],
});

describe("latchReady", () => {
  it("a mounted shard that has loaded in view is ready", () => {
    expect(latchReady(new Set(), ["bourgogne"], probes({ bourgogne: { loaded: true } }))).toEqual(["bourgogne"]);
  });

  it("a shard still fetching is not ready", () => {
    expect(latchReady(new Set(), ["bourgogne"], probes({}))).toEqual([]);
  });

  it("a vacuous load — loaded because nothing of it is on screen — is not ready", () => {
    const probe = probes({ alsace: { loaded: true, inView: false } });
    expect(latchReady(new Set(), ["alsace"], probe)).toEqual([]);
  });

  it("stays ready through a reload while mounted (grape, language, focus, selection)", () => {
    const probe = probes({ bourgogne: { loaded: false, inView: true }, champagne: { loaded: false, inView: false } });
    expect(latchReady(new Set(["bourgogne", "champagne"]), ["bourgogne", "champagne"], probe)).toEqual([
      "bourgogne",
      "champagne",
    ]);
  });

  it("drops a shard as soon as it is unmounted, so a remount has to load in view again", () => {
    let ready = latchReady(new Set(["bourgogne", "jura"]), ["jura"], probes({ jura: { loaded: true } }));
    expect(ready).toEqual(["jura"]);
    // Remounted: a new, empty source. Not ready until it has loaded in view.
    ready = latchReady(new Set(ready), ["bourgogne", "jura"], probes({ jura: { loaded: true } }));
    expect(ready).toEqual(["jura"]);
    ready = latchReady(new Set(ready), ["bourgogne", "jura"], probes({ bourgogne: { loaded: true }, jura: { loaded: true } }));
    expect(ready).toEqual(["bourgogne", "jura"]);
  });

  it("a shard whose source is missing is never ready, even one that was", () => {
    const probe = probes({ bourgogne: { added: false, loaded: true } });
    expect(latchReady(new Set(["bourgogne"]), ["bourgogne"], probe)).toEqual([]);
  });

  it("returns a sorted list, whatever order the mount list is in", () => {
    const probe = probes({ rhone: { loaded: true }, alsace: { loaded: true }, jura: { loaded: true } });
    expect(latchReady(new Set(), ["rhone", "alsace", "jura"], probe)).toEqual(["alsace", "jura", "rhone"]);
  });

  it("walks the whole pan: off screen, scrolled in, reloaded, unmounted", () => {
    let ready: string[] = [];
    const step = (mounted: string[], table: Record<string, Partial<ShardProbe>>) => {
      ready = latchReady(new Set(ready), mounted, probes(table));
      return ready;
    };
    expect(step(["loire"], { loire: { loaded: true, inView: false } })).toEqual([]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual([]);
    expect(step(["loire"], { loire: { loaded: true, inView: true } })).toEqual(["loire"]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual(["loire"]);
    expect(step(["loire"], { loire: { loaded: false, inView: false } })).toEqual(["loire"]);
    expect(step([], {})).toEqual([]);
    expect(step(["loire"], { loire: { loaded: false, inView: true } })).toEqual([]);
  });
});

describe("bboxInView", () => {
  const view: [number, number, number, number] = [2, 45, 6, 48];

  it("overlapping, touching and containing boxes are in view", () => {
    expect(bboxInView([4, 46, 5, 47], view)).toBe(true);
    expect(bboxInView([0, 40, 10, 50], view)).toBe(true);
    expect(bboxInView([6, 48, 7, 49], view)).toBe(true);
  });

  it("a box entirely beside the view is not", () => {
    expect(bboxInView([7, 45, 8, 48], view)).toBe(false);
    expect(bboxInView([2, 49, 6, 50], view)).toBe(false);
  });

  it("a shard with no bbox counts as in view", () => {
    expect(bboxInView(undefined, view)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/wine-map/handoff.test.ts`
Expected: FAIL — `Error: Cannot find module './handoff' imported from '…/src/lib/wine-map/handoff.test.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
// When the world archive hands a region over to its own shard (spec
// docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md
// §5.4). The world copy of a region is hidden (feature-state `handed`) only
// once its shard can draw it, and mounting a shard only STARTS its pmtiles
// fetch — hide the world copy then and the region is a hole until the round
// trip ends.
//
// This used to be a live reading of isSourceLoaded, which goes false on every
// reload — and a grape pick, a Local/English toggle, a focus change and the
// first selection all reload sources. Each one briefly un-handed the region,
// so its world copy drew again on top of the shard (double opacity, a doubled
// outline, a second label). Readiness is now a latch per mount:
//  - a shard becomes ready once it has loaded WHILE its bbox intersects the
//    view. Not merely loaded: a shard mounted by the 50% pad while its region
//    is still off screen needs no tiles, so MapLibre calls it loaded at once,
//    and handing over then would leave a hole when the region scrolls in;
//  - it stays ready while mounted, whatever isSourceLoaded says after that;
//  - it drops out when unmounted (its tiles went with the source) or when its
//    source is missing, and must load in view again after a remount.
// The caller runs this for every committed mount list, so an unmount and a
// remount can never both slip between two readings.
import type { Bbox } from "./shard-specs";

export type ShardProbe = { added: boolean; loaded: boolean; inView: boolean };

export function latchReady(
  prev: ReadonlySet<string>,
  mounted: readonly string[],
  probe: (key: string) => ShardProbe,
): string[] {
  const ready: string[] = [];
  for (const key of mounted) {
    const { added, loaded, inView } = probe(key);
    if (!added) continue;
    if (prev.has(key) || (loaded && inView)) ready.push(key);
  }
  return ready.sort();
}

/** Does a shard's bbox touch the view? A shard with no bbox (the transitional
    v1 manifest) always counts as in view, as the mount rule treats it. */
export function bboxInView(bbox: Bbox | undefined, view: Bbox): boolean {
  if (!bbox) return true;
  const [minX, minY, maxX, maxY] = bbox;
  const [west, south, east, north] = view;
  return maxX >= west && minX <= east && maxY >= south && minY <= north;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/wine-map/handoff.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Wire it into `tile-wine-map.tsx`**

Replace
```ts
import { MapStateSync } from "@/lib/wine-map/map-state-sync";
```
with
```ts
import { MapStateSync } from "@/lib/wine-map/map-state-sync";
import { bboxInView, latchReady } from "@/lib/wine-map/handoff";
```

Replace everything from the line `  // This must be a LIVE reading, not a latch. Two ways a latched "ready" lies:` through the end of `recomputeReady` (the line `  }, [mountedShards]);` that closes it) with:

```tsx
  // Readiness is a LATCH per mount (lib/wine-map/handoff, latchReady): a shard
  // is ready once it has loaded while its bbox touches the view, and stays
  // ready until it is unmounted. It used to be a live isSourceLoaded reading,
  // which goes false on every reload — and a grape pick, a Local/English
  // toggle, a focus change and the first selection all reload sources — so
  // each of them briefly un-handed its regions and drew them twice (double
  // opacity, a doubled outline, a second label). The two ways a latch could
  // lie are both closed:
  //   - Re-mount. Unmounting a Source removes its tiles. An unmounted shard
  //     drops out of the latch, and the effect after flushReady reads every
  //     committed mount list, so a remount must load in view all over again.
  //   - Vacuous load. A shard mounted by the 50% pad while its region is still
  //     off screen needs no tiles, so MapLibre reports it loaded at once;
  //     loaded only counts while its bbox intersects the view.
  const [readyShards, setReadyShards] = useState<string[]>([]);
  const recomputeReady = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const bounds = map.getBounds();
    const view: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    // Probed here rather than inside the state updater, so the updater stays
    // pure. globalThis: `Map` in this module is the react-map-gl component.
    const probes = new globalThis.Map(
      mountedShards.map((key) => {
        const id = shardSourceId(key);
        let added = false;
        let loaded = false;
        try {
          added = Boolean(map.getSource(id));
          loaded = added && map.isSourceLoaded(id);
        } catch {
          // Style mid-rebuild: neither added nor loaded this time round.
        }
        const inView = bboxInView(manifest.shards[key]?.bbox, view);
        return [key, { added, loaded, inView }] as const;
      }),
    );
    setReadyShards((prev) => {
      const next = latchReady(new Set(prev), mountedShards, (key) => probes.get(key)!);
      return prev.length === next.length && prev.every((k, i) => k === next[i]) ? prev : next;
    });
  }, [mountedShards, manifest]);
```

(The paragraph above it, starting `// Mounting a shard <Source> only STARTS its cold pmtiles header fetch.`, stays: it still explains why readiness exists at all.)

Replace
```ts
    recomputeReadyRef.current();
  }, []);
  useEffect(
    () => () => {
      if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
```
with
```ts
    recomputeReadyRef.current();
  }, []);
  // Every committed mount list is read once, straight away: an unmount and a
  // remount can then never both slip between two readings of the latch.
  useEffect(() => {
    flushReady();
  }, [mountedShards, flushReady]);
  useEffect(
    () => () => {
      if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
```

- [ ] **Step 6: Types, lint, suite**

Run: `npx tsc --noEmit` — expected: no output.
Run: `npx eslint src/lib/wine-map/handoff.ts src/lib/wine-map/handoff.test.ts src/app/knowledge/map/tile-wine-map.tsx` — expected: no problems.
Run: `npx vitest run src/lib/wine-map` — expected: PASS.

- [ ] **Step 7: Manual verification (main session, production build)**

At France z7 with Bourgogne, Champagne and Alsace handed off (no double outlines): pick a grape, clear it, toggle Local ↔ English, and select then re-select places in Bourgogne — region fills must never flash to double opacity and no region label may appear twice during the reloads. Zoom out below z5 and back in: each region is drawn by its world copy until its shard's tiles have loaded (no hole, no gold ring around an empty region on a tree selection of an unmounted shard). Pan a mounted-but-off-screen shard (e.g. Jura from Bourgogne at z8) into view: the world copy keeps drawing it until the shard's tiles land.

- [ ] **Step 8: Commit**

```bash
git add src/lib/wine-map/handoff.ts src/lib/wine-map/handoff.test.ts src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "fix(map): latch shard readiness so reloads never double-draw regions" -m "A shard is handed off once it has loaded in view and stays so until unmounted; grape, language, focus and selection reloads no longer re-show the world copy." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


### Task 13: Phase 1b verification and production deploy (main session)

Run by the main session only (browser + push), never by an implementer subagent. Nothing is written to the repository in this task except, on failure, the revert.

**Files:** none modified (on failure only: a `git revert` of this phase's commits).

**Interfaces:**
- Consumes: the Phase 1b commits of Tasks 7-12 on `map-detail-modes`; the `?debugPerf=1` probe (Task 5) and its selection gesture; `window.__wineMap` (`?debugClick=1`); Task 6's `master` baseline screenshots (A3) and its probe rows (A1).
- Produces: a results record for this phase (gates, probe rows first/later selection, A2 reload lists, screenshots) kept in the session's scratchpad and summarised to the owner; a fast-forwarded `origin/master`.

- [ ] **Step 1: Gates (A4)**

Run in `C:\Users\Public\repos\blindtastingapp-mapdetail`:
- `npx vitest run` — expected: every file passes (157 files / 3354 tests at base, plus Phase 1a's and this phase's new ones: `map-state`, `maplibre-internals`, `selection-state`, `selection-fallback`, `map-state-sync`, `shard-specs` additions, `basemap` addition, `handoff`).
- `npx tsc --noEmit` — expected: no output.
- `npx eslint src/lib/testing/bundled-style-engine.ts src/lib/testing/maplibre-internals.test.ts src/lib/wine-map/map-state.ts src/lib/wine-map/map-state.test.ts src/lib/wine-map/__fixtures__/place-tree.ts src/lib/wine-map/selection-state.ts src/lib/wine-map/selection-state.test.ts src/lib/wine-map/selection-fallback.test.ts src/lib/wine-map/map-state-sync.ts src/lib/wine-map/map-state-sync.test.ts src/lib/wine-map/basemap.test.ts src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-specs.test.ts src/lib/wine-map/handoff.ts src/lib/wine-map/handoff.test.ts src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx` — expected: no problems.
- `npm run build` — expected: `next build` completes with no type or lint error.

- [ ] **Step 2: Production run**

Start the `start` launch config (after Step 1's build) and open `/knowledge/map` at 1440x900 with a signed-in session minted as CLAUDE.md describes (`auth.admin.generateLink` magiclink + `verifyOtp` → `/auth/confirm-hash?next=/knowledge/map#access_token=…`; never a typed password). Keep the console open for the whole task.

- [ ] **Step 3: Behaviour checklist**

Run Task 11 Step 16 items 1-10 and Task 12 Step 7, in light and then dark. Add, with 40+ shards mounted (fresh page with `?debugClick=1`, centre on Switzerland at z5.5 so France, Italy, Germany and Spain are in view, and wait for the staggered mounts to finish; `Object.keys(window.__wineMap.getStyle().sources).filter((id) => id.startsWith("wine-shard-")).length` must be ≥ 40 — if it is not, zoom out towards z5.1, never below z5, where nothing mounts):
- toggle Local ↔ English: every label switches, world and shard alike;
- pick Chardonnay, then clear it: narrows, then every place returns (never "only France");
- flip light ↔ dark with Vosne-Romanée selected: ring, emphasis, grape and language persist;
- the forced rebuild (Task 11 Step 16 item 7): all of it survives.
Expected: no console error at any point.

- [ ] **Step 4: Perf protocol (A1) and reloads per selection (A2)**

With `?debugPerf=1`, three cold runs of Run test (a fresh tab each); record the median per gesture and compare with Task 6's Phase 1a rows. The selection row of these runs is the session's FIRST selection (the one-off `wm_has_sel` reload). Then do Task 11 Step 16 item 10's page B three times: its selection row is a LATER selection — expected `reloadedSources` exactly `wine-shard-bourgogne`, `wine-world` and no long task. G1's "a tree selection has no long task" is judged on both rows; record both. A2 also from Task 11 Step 16 item 9 (the cross-shard case: exactly `wine-shard-bourgogne`, `wine-shard-champagne`, `wine-world`).

- [ ] **Step 5: Screenshots (A3)**

Light and dark, same framing as Task 6's `master` baseline: France z5.5, Bourgogne z9, Bourgogne z13 with a climat selected, Alsace/Baden z9, Mosel z12, Champagne z10, Toscana z8, Baden z6. Expected: identical to the baseline except D4 (with a selection, other labels keep their no-selection size and collision order; the selected label is larger and darkest).

- [ ] **Step 6: Failure injection**

- Block `get_wine_place_tree` (DevTools request blocking on `rpc/get_wine_place_tree`), reload with `?place=france.bourgogne.cote-de-nuits.vosne-romanee`: shards mount and show full depth in region colours; the place is ringed and its children emphasised (context fallback); the tree card offers Retry.
- Block `bourgogne.pmtiles`, zoom into Bourgogne z9: the world copy keeps drawing Bourgogne (never handed off), no hole, no console error beyond the blocked request.
- Flip the theme during the first zoom (z4.4 → z5.5): no throw; after it settles, selection, grape, focus depth and language are right.

- [ ] **Step 7: Deploy**

Never touch `C:\Users\Public\repos\blindtastingapp` (master is checked out there, with the owner's uncommitted `package.json`), so the fast-forward is a push of the worktree's branch head to `origin/master`. First record the commit Phase 1b sits on (Phase 1a's deployed head) in the results record — Step 8's revert needs it:
```bash
git -C C:/Users/Public/repos/blindtastingapp-mapdetail fetch origin
git -C C:/Users/Public/repos/blindtastingapp-mapdetail rev-parse origin/master
git -C C:/Users/Public/repos/blindtastingapp-mapdetail merge-base --is-ancestor origin/master HEAD && echo fast-forward-ok
git -C C:/Users/Public/repos/blindtastingapp-mapdetail push origin HEAD:master
```
Expected: a hash (record it as the Phase 1b base), `fast-forward-ok`, then a plain push (never `--force`). If `origin/master` has moved and the check prints nothing, stop and ask the owner. Then wait for the Vercel production deployment of that commit: `gh api "repos/{owner}/{repo}/commits/$(git -C C:/Users/Public/repos/blindtastingapp-mapdetail rev-parse HEAD)/status" --jq .state` prints `success`.

- [ ] **Step 8: Live smoke test (A5)**

On `https://blindrapp.vercel.app/knowledge/map?debugPerf=1` with a minted demo session: the map loads; Run test's first-zoom row has no long task; `?place=france.bourgogne.cote-de-nuits.vosne-romanee` rings its place; no new console errors.

On any failure, revert the whole phase in one commit (identity prefix and trailer as in Global Constraints; `--no-commit` so the trailer lands in a single commit rather than an amend), with `BASE` set to the Phase 1b base hash recorded in Step 7:
```bash
git -C C:/Users/Public/repos/blindtastingapp-mapdetail revert --no-commit "$BASE..HEAD"
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git -C C:/Users/Public/repos/blindtastingapp-mapdetail commit -m "revert(map): Phase 1b static layer specs" -m "The live A5 smoke test failed after the Phase 1b deploy; the phase is reverted whole." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C C:/Users/Public/repos/blindtastingapp-mapdetail push origin HEAD:master
```
Then tell the owner which A5 check failed, with its console output.

---

## Phase 1c — imperative shard controller

Phase 1c removes the last whole-style serialize from the hot path: the region shards stop being react-map-gl `<Source>`/`<Layer>` JSX (whose `map.addSource`/`map.addLayer` always run `Style._validate` → `serialize()` of the whole style) and are mounted by `ShardController` through `map.style.addSource(id, spec, {validate:false})` / `map.style.addLayer(spec, before, {validate:false})`.

Verified in `node_modules/maplibre-gl/src` (5.24.0) for this phase:
- `Style.addSource(id, source, options = {})` (style.ts:1010): `_checkLoaded()` (throws "Style is not done loading." while `_loaded` is false), **throws** `Source "<id>" already exists.` on a duplicate, skips `_validate` when `options.validate === false` (style.ts:1757), fires nothing itself; `tileManager.onAdd` starts the header fetch, whose `data`/metadata event reaches the map as `sourcedata`.
- `Style.addLayer(layerObject, before?, options = {})` (style.ts:1095): `_checkLoaded()`; a duplicate id or a missing `before` **fires an ErrorEvent and returns without adding** (no throw); with a missing source it splices the id into `_order`/`_layers` **first** and then throws a TypeError in `_updateLayer` (style.ts:1496-1500) — left there, `Style.update` faults every frame on `this.tileManagers[layer.source].used` (style.ts:781).
- `Style.setPaintProperty(layer, name, value, options)` / `Style.setFilter(layer, filter, options)` (style.ts:1349, 1282): deep-equal no-op for an unchanged value; `{validate:false}` skips validation (style_layer.ts:289, style.ts:1301).
- None of the `Style.*` writers marks the map dirty. `Map.setGlobalStateProperty(name, value)` (ui/map.ts:869-872) is `this.style.setGlobalStateProperty(...)` then **`return this._update(true)` unconditionally**; `Style.setGlobalStateProperty` deep-equal-skips an unchanged value (style.ts:345), and a name no layer reads reloads nothing (style.ts:381-421). Hence one `setGlobalStateProperty("wm_tick", 1)` per batch.
- `map.removeLayer`/`map.removeSource`/`map.moveLayer` (ui/map.ts:2869, 2430, 2851) call `_update(true)` themselves; `Style.removeSource` fires an ErrorEvent (no throw) while a layer still reads the source; `map.getLayersOrder()` (ui/map.ts:2902) returns a copy of `_order`.
- A full rebuild (`_updateStyle`, ui/map.ts:2111) replaces `map.style` with a new, unloaded `Style` built from `transformStyle(prev.serialize(), next)` — so `withWineLayers` carries every imperatively added shard source and layer across; `style.load` fires once the new style is loaded.
- react-maplibre 8.1.1: `<Layer>` creates itself during render with `map.addLayer(options, undefined)` (appended at the top) once `map.style._loaded` and its source exist, and removes itself in effect cleanup; `<Source>` re-renders on a `setTimeout(0)` after `styledata`. So the world layers appear some time after `load`, and StrictMode/Fast Refresh can re-create one on top — the controller waits for `world-labels` and puts any `world-*` layer found above a shard layer back below the shards, in the world layers' own order. Removing the `onMouseMove` prop stops react-maplibre's per-mousemove `queryRenderedFeatures` (maplibre.ts:551-575: hover tracking only runs when a hover prop is set); `interactiveLayerIds` still filters through `map.getLayer` before querying on click (maplibre.ts:538-548).
- A vector source whose header cannot be fetched (vector_tile_source.ts `load()`: `this._loaded = true; // let's pretend it's loaded so the source will be ignored`, then an `ErrorEvent` with no `tile`) is flagged `_sourceErrored` by its TileManager (tile_manager.ts:109-111), and `TileManager.loaded()` returns true for it (tile_manager.ts:154): `isSourceLoaded` calls an unreadable archive LOADED. A single tile error is an `ErrorEvent` carrying `{tile}` (tile_manager.ts:197). Both reach the map with the `sourceId` the TileManager adds.
- `@maplibre/maplibre-gl-style-spec` 24.10: `featureFilter(filter, globalState?)`, `validateStyleMin(style)`; `validateStyleMin` rejects an empty `match` ("Expected at least 4 arguments") and duplicate `match` labels ("Branch labels must be unique"), so the build-time validation below has teeth.

All code in Tasks 14-16 was run in a scratch harness with the worktree's `node_modules` and the real Carto fixture, first against stubs of the Phase 1a/1b contracts and then against a Phase 1b build of the repo (the real `map-state.ts`, `map-state-sync.ts`, 1b's `shard-specs.ts` builders and 1b's `tile-wine-map.tsx` with Task 16's code applied): the 45 new tests pass (10 + 24 + the guard's 5 + 6), plus Phase 1a's 2 guard tests and the 4 engine-guard cases; `tsc --noEmit` (strict) and ESLint with the repo's `eslint.config.mjs` are clean on every touched file, `tile-wine-map.tsx` included. A MapLibre `Map` (`e.target`, and `mapRef.current?.getMap()`) is assignable to both `ControllerMap` and `HoverMap` without a cast. The new tests were mutation-checked: the old one-layer `keepWorldBelow` fails case 19; ignoring a palette change fails cases 14 and 23; not listening for `error` (or not telling a tile's error from the archive's) fails case 24; dropping shard sources from `withWineLayers` fails Task 14's case 10. Every "replace"/"delete" quote in Task 16 was checked verbatim against base cd9acd5 and the current Phase 1a/1b drafts (1a Task 3 Step 5 ends mid-line at `// Which country owns the view`; the quote here carries the whole line).

**For the assembled plan (skeleton notes).** Fold these into the skeleton's Interface Contracts so there is one source of truth:
- `shard-specs.ts` also exports `shardLayerIds(key)`, `shardOverlayIds(key)`, `selectionCasingPaint(palette)`, `selectionRingPaint(palette)` (Task 14).
- `shard-controller.ts`: `ControllerMap` adds `moveLayer(id, before?)` and `getLayersOrder()`; `setDesired`'s parameter is the named type `ShardDesired`; the constructor's `opts` is optional. React never calls `reapplyPaint()`: `setDesired` rewrites paint (and, for a country change, filters) for exactly the shards whose inputs changed, and `onStyleRebuilt()` repaints everything only after a real rebuild (Task 15).
- New module `src/lib/wine-map/hover-cursor.ts` (`HoverPoint`, `HoverMap`, `hoverIsClickable`, `installHoverCursor`) and a new source-text guard `src/app/knowledge/map/tile-wine-map-engine.test.ts`. Task 15 extends Phase 1a Task 5's `src/lib/wine-map/maplibre-internals.test.ts` (as its contract asks) with a react-maplibre 8.1 pin and the controller's internals. Note for assembly: Phase 1b Task 7 also creates a tripwire, `src/lib/testing/maplibre-internals.test.ts`, overlapping 1a's; keep one file. If it is 1b's, Task 15 Step 5's header lines and `describe` block go there unchanged (they need only `readFileSync`, `path` and vitest's `describe`/`expect`/`it`; add `import path from "node:path";` if that file lacks it).
- `interactiveLayerIds` changes shape, not content: it becomes a memo (the list Task 11 left, selected labels included) so the hover cursor can read the same list.
- A blocked or missing shard archive: MapLibre 5.24 marks the source errored and `isSourceLoaded` then reports it LOADED, so at base and through Phase 1b the readiness latch hands the region to an empty shard (a hole). Phase 1b Task 13 Step 6 expects "the world copy keeps drawing Bourgogne"; that holds from Task 15 on (its unreadable-archive rule, case 24), not at 1b. Task 13's expectation should read "a hole where Bourgogne was, as at base; no throw".
- Review Focus, "light ↔ dark while shards are still mounting" is pinned by Task 15 case 23 (a flip with four shards still queued). The "Tree never arrives" line should read: pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (`shardFilter(null)` keeps full depth) and Task 18 (`mountTarget` with empty `shardCountries`). Task 12 is the readiness latch, not the mount policy.

---

### Task 14: `shardLayerSpecs` / `shardOverlaySpecs`

**Files:**
- Modify: `src/lib/wine-map/shard-specs.ts` — add imports at the top (merge with any existing import from the same module) and append one block at the end of the file, after the Task 10 builders.
- Test: `src/lib/wine-map/shard-layer-specs.test.ts` (create; separate from Task 1/10's `shard-specs.test.ts` so the phases never edit the same test file). Its case 10 reads the existing Carto fixture `src/lib/wine-map/__fixtures__/carto-styles.json` (the one `basemap.test.ts` uses).

**Interfaces:**
- Consumes (Tasks 1 and 10, same module): `shardColorExpression({ region, areaSlugs, ramp, palette }): ColorExpression`, `staticFillPaint({ color, ramp, worldHandoff })`, `staticOutlinePaint({ color, worldHandoff })`, `staticLabelLayout()`, `staticLabelPaint({ palette, worldHandoff })`, `selectedLabelLayout()`, `selectedLabelPaint({ palette, worldHandoff })`, `shardFilter(country: string | null): unknown[]`, `selectedPlaceFilter(): unknown[]`. From `./basemap`: `shardSourceId(key: string): string`; in the test also the existing `tuneBasemapStyle`, `withWineLayers` and `WORLD_SOURCE_ID`. From `./map-palette`: `type MapPalette`, `MAP_PALETTES` (test). From `./map-state` (Task 7, test only): `deepStateName(country: string): string`.
- Produces (skeleton contract):
  ```ts
  export type ShardSpecInputs = { country: string | null; areaSlugs: readonly string[]; ramp: boolean; palette: MapPalette; fillsVisible: boolean };
  export type ShardLayerSpecs = { sourceId: string; source: VectorSourceSpecification; layers: LayerSpecification[] };
  export function shardLayerSpecs(key: string, url: string, inputs: ShardSpecInputs): ShardLayerSpecs; // url = manifest archive URL, no protocol
  export function shardOverlaySpecs(key: string, palette: MapPalette): LayerSpecification[];     // casing, ring, selected-label
  ```
  Additive (listed in contract_changes): `shardLayerIds(key: string): { fills: string; outlines: string; labels: string }`, `shardOverlayIds(key: string): { casing: string; ring: string; label: string }`, `selectionCasingPaint(palette: MapPalette): LineLayerSpecification["paint"]`, `selectionRingPaint(palette: MapPalette): LineLayerSpecification["paint"]` (Task 16 points the world ring at the same two builders, so world and shard rings cannot drift).

- [ ] **Step 1: Write the failing test**

Create `src/lib/wine-map/shard-layer-specs.test.ts`:

```ts
// The specs ShardController adds with {validate:false}. MapLibre no longer
// validates them at runtime (that validation was the whole-style serialize
// behind the first-zoom freeze), so this file is the validation: every shard
// of a real manifest, in both themes, ramped or not, with and without a known
// country, fills on and off, has to pass validateStyleMin — the same check
// basemap.test.ts runs over a swapped basemap.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  diff,
  featureFilter,
  validateStyleMin,
  type LayerSpecification,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { tuneBasemapStyle, withWineLayers, WORLD_SOURCE_ID } from "./basemap";
import { MAP_PALETTES } from "./map-palette";
import { deepStateName } from "./map-state";
import {
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  selectionCasingPaint,
  selectionRingPaint,
  shardColorExpression,
  shardFilter,
  shardLayerIds,
  shardLayerSpecs,
  shardOverlayIds,
  shardOverlaySpecs,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  type ShardSpecInputs,
} from "./shard-specs";

// Every shard of release 20260916T213650Z, and the country the place tree puts
// it in (tree roots are countries, their children the regions).
const SHARD_COUNTRY: Record<string, string> = {
  abruzzo: "italy", ahr: "germany", alentejo: "portugal", alsace: "france",
  andalucia: "spain", aragon: "spain", asturias: "spain", baden: "germany",
  bairrada: "portugal", baleares: "spain", basilicata: "italy", beaujolais: "france",
  bordeaux: "france", bourgogne: "france", calabria: "italy", campania: "italy",
  "castilla-la-mancha": "spain", "castilla-y-leon": "spain", cataluna: "spain",
  champagne: "france", corse: "france", dao: "portugal", douro: "portugal",
  "emilia-romagna": "italy", extremadura: "spain", franken: "germany", friuli: "italy",
  galicia: "spain", "hessische-bergstrasse": "germany", jura: "france",
  "la-rioja": "spain", "languedoc-roussillon": "france", lazio: "italy",
  liguria: "italy", loire: "france", lombardia: "italy", madeira: "portugal",
  madrid: "spain", marche: "italy", minho: "portugal", mittelrhein: "germany",
  molise: "italy", mosel: "germany", murcia: "spain", nahe: "germany",
  navarra: "spain", "pais-vasco": "spain", "peninsula-de-setubal": "portugal",
  pfalz: "germany", piemonte: "italy", provence: "france", puglia: "italy",
  rheingau: "germany", rheinhessen: "germany", rhone: "france",
  "saale-unstrut": "germany", sardegna: "italy", savoie: "france", sicilia: "italy",
  "sud-ouest": "france", toscana: "italy", "trentino-alto-adige": "italy",
  umbria: "italy", valencia: "spain", "valle-d-aosta": "italy", veneto: "italy",
  wuerttemberg: "germany",
};
const SHARDS = Object.keys(SHARD_COUNTRY).sort();
const url = (key: string) =>
  `https://tiles.test/wine-map-tiles/tiles/releases/20260916T213650Z/${key}.pmtiles`;

// Realistic per-shard area slugs: a dozen district/village slugs each, with
// Bourgogne's real ones, so the palette `match` has several arms (and the
// duplicate-label check in validation has something to catch).
function slugsFor(key: string): string[] {
  if (key === "bourgogne") {
    return [
      "chablis", "cote-chalonnaise", "cote-de-beaune", "cote-de-nuits", "grand-auxerrois",
      "maconnais", "vosne-romanee", "gevrey-chambertin", "meursault", "pommard",
    ];
  }
  return Array.from({ length: 12 }, (_, i) => `${key}-area-${i}`);
}

function inputs(key: string, over: Partial<ShardSpecInputs> = {}): ShardSpecInputs {
  return {
    country: SHARD_COUNTRY[key] ?? null,
    areaSlugs: slugsFor(key),
    ramp: false,
    palette: MAP_PALETTES.light,
    fillsVisible: true,
    ...over,
  };
}

function styleOf(sources: Record<string, unknown>, layers: unknown[]): StyleSpecification {
  return { version: 8, sources, layers } as unknown as StyleSpecification;
}

describe("shardLayerSpecs", () => {
  it("1. keeps every id the JSX mounted, in fills, outlines, labels order", () => {
    const specs = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne"));
    expect(specs.sourceId).toBe("wine-shard-bourgogne");
    expect(specs.source).toEqual({
      type: "vector",
      url: `pmtiles://${url("bourgogne")}`,
      promoteId: "key",
    });
    expect(specs.layers.map((l) => [l.id, l.type, (l as { "source-layer"?: string })["source-layer"]]))
      .toEqual([
        ["shard-fills-bourgogne", "fill", "places"],
        ["shard-outlines-bourgogne", "line", "places"],
        ["shard-labels-bourgogne", "symbol", "labels"],
      ]);
    for (const layer of specs.layers) {
      expect((layer as { source?: string }).source).toBe("wine-shard-bourgogne");
    }
    expect(shardLayerIds("bourgogne")).toEqual({
      fills: "shard-fills-bourgogne",
      outlines: "shard-outlines-bourgogne",
      labels: "shard-labels-bourgogne",
    });
  });

  it("2. builds each layer from the shared static builders, with no world handoff", () => {
    const i = inputs("bourgogne", { ramp: true, palette: MAP_PALETTES.dark });
    const color = shardColorExpression({ region: "bourgogne", areaSlugs: i.areaSlugs, ramp: true, palette: i.palette });
    const [fills, outlines, labels] = shardLayerSpecs("bourgogne", url("bourgogne"), i).layers as {
      paint?: unknown; layout?: unknown; filter?: unknown;
    }[];
    expect(fills.paint).toEqual(staticFillPaint({ color, ramp: true, worldHandoff: false }));
    expect(outlines.paint).toEqual(staticOutlinePaint({ color, worldHandoff: false }));
    expect(labels.layout).toEqual(staticLabelLayout());
    expect(labels.paint).toEqual(staticLabelPaint({ palette: MAP_PALETTES.dark, worldHandoff: false }));
    for (const layer of [fills, outlines, labels]) expect(layer.filter).toEqual(shardFilter("france"));
  });

  it("3. an unknown country gets no depth term: full depth, as before the tree", () => {
    const known = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne")).layers[0] as { filter: unknown };
    const unknown = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne", { country: null }))
      .layers[0] as { filter: unknown };
    expect(unknown.filter).toEqual(shardFilter(null));
    const village = { type: 1, properties: { key: "france.bourgogne.cote-de-nuits.vosne-romanee", tier: 3 } };
    const region = { type: 1, properties: { key: "france.bourgogne", tier: 1 } };
    const run = (filter: unknown, state: Record<string, unknown>, feature: unknown) =>
      featureFilter(filter as never, state).filter({ zoom: 12 }, feature as never);
    // Unknown country: every tier renders whatever the global state says.
    expect(run(unknown.filter, {}, village)).toBe(true);
    // Known country: tier >= 2 only while that country's deep flag is on.
    expect(run(known.filter, {}, village)).toBe(false);
    expect(run(known.filter, {}, region)).toBe(true);
    expect(run(known.filter, { [deepStateName("france")]: true }, village)).toBe(true);
    expect(run(known.filter, { [deepStateName("italy")]: true }, village)).toBe(false);
  });

  it("4. hides fills through layout.visibility, never by leaving layout out", () => {
    const shown = shardLayerSpecs("alsace", url("alsace"), inputs("alsace")).layers;
    const hidden = shardLayerSpecs("alsace", url("alsace"), inputs("alsace", { fillsVisible: false })).layers;
    expect((shown[0] as { layout?: unknown }).layout).toEqual({ visibility: "visible" });
    expect((hidden[0] as { layout?: unknown }).layout).toEqual({ visibility: "none" });
    // Outlines and labels stay visible either way: ?debugFills=off drops fills only.
    for (const layer of hidden.slice(1)) {
      expect((layer as { layout?: { visibility?: string } }).layout?.visibility).not.toBe("none");
    }
  });

  it("5. returns a fresh, fully independent object tree on every call", () => {
    const i = inputs("bourgogne", { ramp: true });
    const a = shardLayerSpecs("bourgogne", url("bourgogne"), i);
    const b = shardLayerSpecs("bourgogne", url("bourgogne"), i);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.source).not.toBe(b.source);
    a.layers.forEach((layer, n) => {
      const other = b.layers[n] as Record<string, unknown>;
      const self = layer as Record<string, unknown>;
      expect(self).not.toBe(other);
      for (const part of ["paint", "layout", "filter"]) {
        if (self[part] !== undefined) expect(self[part]).not.toBe(other[part]);
      }
    });
    // Deep: scribbling over every nested array of one result leaves the next
    // call's untouched, so no builder constant is shared with a live layer.
    const scribble = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(scribble);
        value.push("scribbled");
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(scribble);
      }
    };
    scribble(a);
    expect(JSON.stringify(shardLayerSpecs("bourgogne", url("bourgogne"), i))).toBe(JSON.stringify(b));
  });

  it("6. every shard of the manifest validates, both themes, ramp, country and fills either way", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const ramp of [false, true]) {
        for (const treeLoaded of [true, false]) {
          for (const fillsVisible of [true, false]) {
            const sources: Record<string, unknown> = {};
            const layers: unknown[] = [];
            for (const key of SHARDS) {
              const specs = shardLayerSpecs(key, url(key), {
                // No tree: no country and no area slugs, which is also what a
                // shard newer than the loaded tree gets.
                country: treeLoaded ? SHARD_COUNTRY[key] : null,
                areaSlugs: treeLoaded ? slugsFor(key) : [],
                ramp,
                palette: MAP_PALETTES[theme],
                fillsVisible,
              });
              sources[specs.sourceId] = specs.source;
              layers.push(...specs.layers, ...shardOverlaySpecs(key, MAP_PALETTES[theme]));
            }
            const errors = validateStyleMin(styleOf(sources, layers));
            expect(errors, `${theme} ramp=${ramp} tree=${treeLoaded} fills=${fillsVisible}`).toEqual([]);
          }
        }
      }
    }
  });
});

describe("shardOverlaySpecs", () => {
  it("7. casing, ring and selected label on the shard's own source, in that order", () => {
    const overlays = shardOverlaySpecs("bourgogne", MAP_PALETTES.light);
    expect(overlays.map((l) => [l.id, l.type, (l as { "source-layer"?: string })["source-layer"]]))
      .toEqual([
        ["shard-selected-casing-bourgogne", "line", "places"],
        ["shard-selected-ring-bourgogne", "line", "places"],
        ["shard-selected-label-bourgogne", "symbol", "labels"],
      ]);
    expect(shardOverlayIds("bourgogne")).toEqual({
      casing: "shard-selected-casing-bourgogne",
      ring: "shard-selected-ring-bourgogne",
      label: "shard-selected-label-bourgogne",
    });
    for (const layer of overlays) {
      expect((layer as { source?: string }).source).toBe("wine-shard-bourgogne");
      expect((layer as { filter?: unknown }).filter).toEqual(selectedPlaceFilter());
    }
  });

  it("8. paints the ring and the label from the palette it is given", () => {
    for (const theme of ["light", "dark"] as const) {
      const palette = MAP_PALETTES[theme];
      const [casing, ring, label] = shardOverlaySpecs("mosel", palette) as {
        paint?: unknown; layout?: unknown;
      }[];
      expect(casing.paint).toEqual({ "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 });
      expect(casing.paint).toEqual(selectionCasingPaint(palette));
      expect(ring.paint).toEqual({ "line-color": palette.selectedRing, "line-width": 2.5 });
      expect(ring.paint).toEqual(selectionRingPaint(palette));
      expect(label.layout).toEqual(selectedLabelLayout());
      expect(label.paint).toEqual(selectedLabelPaint({ palette, worldHandoff: false }));
    }
  });

  it("9. fresh objects per call", () => {
    const a = shardOverlaySpecs("mosel", MAP_PALETTES.light);
    const b = shardOverlaySpecs("mosel", MAP_PALETTES.light);
    expect(a).toEqual(b);
    a.forEach((layer, n) => {
      expect(layer).not.toBe(b[n]);
      expect((layer as { filter?: unknown }).filter).not.toBe((b[n] as { filter?: unknown }).filter);
    });
  });
});

describe("a theme swap", () => {
  it("10. carries the controller's shards and overlays across untouched, in the order it left them", () => {
    // After a theme diff ShardController only re-checks: it relies on
    // withWineLayers handing every imperatively added shard source and layer,
    // overlays included, to the incoming basemap as they are, and on the diff
    // then leaving them alone. Built the way the controller leaves a style:
    // the world layers, each shard's base layers (selected first, then
    // alphabetical), and the selected shard's overlays on top.
    const { positron, darkMatter } = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/wine-map/__fixtures__/carto-styles.json"), "utf8"),
    ) as { positron: StyleSpecification; darkMatter: StyleSpecification };
    const light = tuneBasemapStyle(positron);
    const world = [
      "world-fills", "world-outlines", "world-region-fills", "world-region-outlines",
      "world-selected-casing", "world-selected-ring", "world-labels", "world-selected-label",
    ].map((id) =>
      id.includes("label")
        ? { id, type: "symbol", source: WORLD_SOURCE_ID, "source-layer": "labels" }
        : { id, type: "line", source: WORLD_SOURCE_ID, "source-layer": "places" },
    );
    const shards = ["bourgogne", "alsace", "mosel"].map((key) =>
      shardLayerSpecs(key, url(key), inputs(key, { ramp: key === "bourgogne" })),
    );
    const wineLayers = [
      ...world,
      ...shards.flatMap((specs) => specs.layers),
      ...shardOverlaySpecs("bourgogne", MAP_PALETTES.light),
    ] as LayerSpecification[];
    const live = {
      ...light,
      sources: {
        ...light.sources,
        [WORLD_SOURCE_ID]: { type: "vector", url: "pmtiles://https://tiles.test/world.pmtiles", promoteId: "region" },
        ...Object.fromEntries(shards.map((specs) => [specs.sourceId, specs.source])),
      },
      layers: [...light.layers, ...wineLayers],
    } as StyleSpecification;

    const next = withWineLayers(live, tuneBasemapStyle(darkMatter));
    expect(next.layers.slice(-wineLayers.length)).toEqual(wineLayers);
    for (const specs of shards) expect(next.sources[specs.sourceId]).toEqual(specs.source);
    const wineIds = [WORLD_SOURCE_ID, ...shards.map((specs) => specs.sourceId), ...wineLayers.map((l) => l.id)];
    const commands = diff(live, next);
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      const args = JSON.stringify(command.args);
      for (const id of wineIds) {
        expect(args.includes(JSON.stringify(id)), `${command.command} names ${id}`).toBe(false);
      }
    }
    expect(validateStyleMin(next)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/shard-layer-specs.test.ts`
Expected: FAIL, 10 failed, first error `TypeError: (0 , shardLayerSpecs) is not a function` (the new exports do not exist yet; the Phase 1a/1b exports it also imports do, and so do `tuneBasemapStyle`/`withWineLayers`).

- [ ] **Step 3: Implement**

Add to the imports at the top of `src/lib/wine-map/shard-specs.ts` (merge names into an existing `from "maplibre-gl"` type import if Task 1/10 already has one; `MapPalette` is already imported there as a type):

```ts
import type {
  FillLayerSpecification,
  FilterSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
  VectorSourceSpecification,
} from "maplibre-gl";
import { shardSourceId } from "./basemap";
```

Append at the end of `src/lib/wine-map/shard-specs.ts`:

```ts
// Phase 1c: the specs ShardController hands to map.style.addSource/addLayer
// with {validate:false}. MapLibre no longer checks them at runtime, so
// shard-layer-specs.test.ts runs validateStyleMin over every one of them
// instead, the way basemap.test.ts does for a swapped basemap.

/** Everything a shard's layers are built from. `country` null means the tree
    has not placed this shard (still loading, failed, or a newer release):
    no depth term, full depth, as before the tree. `areaSlugs` empty means
    region hue only. `fillsVisible` is read at add time only (?debugFills is
    fixed for the visit). */
export type ShardSpecInputs = {
  country: string | null;
  areaSlugs: readonly string[];
  ramp: boolean;
  palette: MapPalette;
  fillsVisible: boolean;
};

export type ShardLayerSpecs = {
  sourceId: string;
  source: VectorSourceSpecification;
  /** fills, outlines, labels — the order they are added in. */
  layers: LayerSpecification[];
};

/** A shard's base layer ids, exactly the ids the JSX mounted before 1c:
    scanView, interactiveLayerIds and ?debugClick all name them. */
export function shardLayerIds(key: string) {
  return {
    fills: `shard-fills-${key}`,
    outlines: `shard-outlines-${key}`,
    labels: `shard-labels-${key}`,
  };
}

/** The selected place's overlay layer ids on its own shard, bottom to top. */
export function shardOverlayIds(key: string) {
  return {
    casing: `shard-selected-casing-${key}`,
    ring: `shard-selected-ring-${key}`,
    label: `shard-selected-label-${key}`,
  };
}

/** The keyline under the gold ring (cream in light, near-black in dark).
    Shared by the world ring and every shard ring, so a selection looks the
    same whichever archive draws it. */
export function selectionCasingPaint(palette: MapPalette): LineLayerSpecification["paint"] {
  return { "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 };
}

/** The gold selection ring itself. */
export function selectionRingPaint(palette: MapPalette): LineLayerSpecification["paint"] {
  return { "line-color": palette.selectedRing, "line-width": 2.5 };
}

/** One shard's source and its fill, outline and label layers. `url` is the
    manifest's archive URL; the pmtiles protocol prefix is added here.

    Every call returns a new, fully independent object tree. MapLibre keeps
    the paint, layout and filter values addLayer is handed by reference (only
    setFilter clones), and the static builders may share constant
    sub-expressions between calls; one structuredClone per shard means nothing
    handed to the map is ever shared with anything else. */
export function shardLayerSpecs(key: string, url: string, inputs: ShardSpecInputs): ShardLayerSpecs {
  const sourceId = shardSourceId(key);
  const ids = shardLayerIds(key);
  const color = shardColorExpression({
    region: key,
    areaSlugs: inputs.areaSlugs,
    ramp: inputs.ramp,
    palette: inputs.palette,
  });
  const filter = shardFilter(inputs.country) as FilterSpecification;
  const layers: LayerSpecification[] = [
    {
      id: ids.fills,
      type: "fill",
      source: sourceId,
      "source-layer": "places",
      filter,
      layout: { visibility: inputs.fillsVisible ? "visible" : "none" },
      paint: staticFillPaint({ color, ramp: inputs.ramp, worldHandoff: false }) as FillLayerSpecification["paint"],
    },
    {
      id: ids.outlines,
      type: "line",
      source: sourceId,
      "source-layer": "places",
      filter,
      paint: staticOutlinePaint({ color, worldHandoff: false }) as LineLayerSpecification["paint"],
    },
    {
      id: ids.labels,
      type: "symbol",
      source: sourceId,
      "source-layer": "labels",
      filter,
      layout: staticLabelLayout() as SymbolLayerSpecification["layout"],
      paint: staticLabelPaint({ palette: inputs.palette, worldHandoff: false }) as SymbolLayerSpecification["paint"],
    },
  ];
  return structuredClone({
    sourceId,
    source: { type: "vector", url: `pmtiles://${url}`, promoteId: "key" },
    layers,
  });
}

/** The selected place's casing, ring and bigger label, on its own shard's
    source. ShardController keeps them at the very top of the style: the ring
    above every fill and outline, and the label placed first, so it wins every
    collision (D4). Fresh objects per call, as shardLayerSpecs. */
export function shardOverlaySpecs(key: string, palette: MapPalette): LayerSpecification[] {
  const source = shardSourceId(key);
  const ids = shardOverlayIds(key);
  const filter = selectedPlaceFilter() as FilterSpecification;
  return structuredClone<LayerSpecification[]>([
    {
      id: ids.casing,
      type: "line",
      source,
      "source-layer": "places",
      filter,
      paint: selectionCasingPaint(palette),
    },
    {
      id: ids.ring,
      type: "line",
      source,
      "source-layer": "places",
      filter,
      paint: selectionRingPaint(palette),
    },
    {
      id: ids.label,
      type: "symbol",
      source,
      "source-layer": "labels",
      filter,
      layout: selectedLabelLayout() as SymbolLayerSpecification["layout"],
      paint: selectedLabelPaint({ palette, worldHandoff: false }) as SymbolLayerSpecification["paint"],
    },
  ]);
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/shard-layer-specs.test.ts`
Expected: PASS, 10 passed (case 6 takes ~1.4 s: 16 styles × 67 shards × 6 layers through `validateStyleMin`). Case 10 needs no new code: it pins that the existing `withWineLayers` already carries imperatively added shards, which Task 16's theme-diff path depends on.

- [ ] **Step 5: Types and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit && npx eslint src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-layer-specs.test.ts`
Expected: no output from either.

- [ ] **Step 6: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-layer-specs.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(map): shard layer specs for imperative mounting

shardLayerSpecs/shardOverlaySpecs build one shard's source, fill/outline/
label layers and selection overlays from the static builders, with today's
ids. The controller adds them with validate:false, so every spec of the live
manifest is validated at build time instead (both themes, ramp, tree
present/absent, fills on/off). Also pins that a theme swap's withWineLayers
carries the imperatively added shards and overlays across in their order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 15: `ShardController`

**Files:**
- Create: `src/lib/wine-map/shard-controller.ts`
- Test: `src/lib/wine-map/shard-controller.test.ts` (create)
- Modify: `src/lib/wine-map/maplibre-internals.test.ts` (Phase 1a Task 5's MapLibre guard, which asks later phases to add their internals to it: three header lines, and one `describe` block appended at the end)

**Interfaces:**
- Consumes: `type SyncMap` (Task 9, `./map-state-sync`); `GS` (Task 7, `./map-state`; `GS.tick === "wm_tick"`); `shardSourceId`, `SHARD_SOURCE_PREFIX` (`./basemap`); `shardLayerSpecs`, `shardOverlaySpecs`, `shardLayerIds`, `shardOverlayIds`, `type ShardSpecInputs` (Task 14); `type MapPalette` (`./map-palette`).
- Produces:
  ```ts
  export type ControllerMap = SyncMap & {
    style: { addSource(id: string, spec: unknown, o: { validate: false }): void;
             addLayer(spec: unknown, before: string | undefined, o: { validate: false }): void;
             setPaintProperty(layer: string, name: string, value: unknown, o: { validate: false }): void;
             setFilter(layer: string, filter: unknown, o: { validate: false }): void } | undefined;
    getLayer(id: string): unknown; removeLayer(id: string): unknown; removeSource(id: string): unknown;
    moveLayer(id: string, before?: string): unknown;   // additive: world-below guard
    getLayersOrder(): string[];                        // additive: truth-from-the-map scan + ordering
  };
  export type ShardDesired = { keys: readonly string[]; urls: Readonly<Record<string, string>>;
    selectedShard: string | null; inputs: (key: string) => ShardSpecInputs; palette: MapPalette }; // named form of setDesired's param
  export class ShardController {
    constructor(map: ControllerMap, opts?: { now?: () => number; raf?: (cb: () => void) => number;
      cancelRaf?: (h: number) => void; budgetMs?: number });   // construct from onLoad
    setDesired(next: ShardDesired): void;   // schedules one frame; diffs paint/filters per shard automatically
    isAdded(key: string): boolean;
    onStyleRebuilt(): void;                 // never throws; full repaint only after a real rebuild (new Style object)
    reapplyPaint(): void;                   // unconditional rewrite of every mounted shard + overlays
    dispose(): void;
  }
  ```

Design notes the implementer must keep (each is a review finding):
- **Readiness** is style identity plus MapLibre's own flag: a run proceeds only when `map.style` is the object last seen loaded (set in the constructor, which runs from `onLoad`, and in `onStyleRebuilt`) and `style._loaded !== false` (the private flag react-maplibre itself guards on; a missing field reads as loaded, identity still covers the rebuild window). Never `isStyleLoaded()` (false whenever tiles are loading). A "Style is not done loading" throw stops the run without marking anything failed.
- **Truth from the map**: every run scans `getLayersOrder()` for `shard-(fills|outlines|labels)-<key>` and `shard-selected-(casing|ring|label)-<key>`; `isAdded` = source and all three base layers exist and the key is not failed. So a second `setDesired` with equal content writes nothing, and a second controller on the same map adopts what is there.
- **Paint/filter diff**: the controller records the `ShardSpecInputs` each mounted shard was written from; on a run, a shard whose `palette` (identity), `ramp` or `areaSlugs` (content) changed gets every paint property of its three layers re-set, and one whose `country` changed gets its three filters re-set — all through `map.style.*` with `{validate:false}` (MapLibre deep-equal-skips unchanged values). `fillsVisible` is add-time only.
- **Order**: shards are added selected-first, then `localeCompare` order (the JSX's order); base layers go in `before` the first `shard-selected-*` layer (or appended when there is none); overlays are appended at the very top right after their shard. When any `world-*` layer sits above the first `shard-*` layer, every existing world layer from the lowest misplaced one onward in the canonical `WORLD_ORDER` (the eight world ids, bottom to top) is moved, in that order, to just before the first shard layer (`map.moveLayer(id, firstShardLayer)`) — moving only the re-created layer would put a re-created `world-labels` above `world-selected-label` and lose the selected name its collision (D4).
- **Transactions**: a shard is source + three layers in one synchronous step; any throw (or a layer MapLibre refused silently, or a source that did not register) rolls back every id of that shard that exists, marks it failed for the visit, logs one `console.error`, and it is never retried. Overlays roll back the same way (ring skipped for that shard for the visit).
- **Unreadable archive**: a map `error` event naming a `wine-shard-*` source with no `tile` (the archive header failed: blocked, 404, offline) marks that shard failed the same way, and the next run removes it. Verified in 5.24 (`vector_tile_source.ts` `load()`, `tile_manager.ts`): such a source is set `_loaded = true` and `_sourceErrored`, so `isSourceLoaded` reports it LOADED and the readiness latch would hide the region's world copy over nothing — a hole, which base cd9acd5 shows today. A single tile's error carries `tile` and is left to MapLibre; errors of the basemap or `wine-world` are ignored.
- **Budget**: 8 ms per frame by default, at least one unit per frame; a unit is one add or one rewrite; removals and overlay moves are unbudgeted.
- **Dirty mark**: one `setGlobalStateProperty(GS.tick, 1)` at the end of any run that wrote through `map.style.*` (or removed anything).

- [ ] **Step 1: Write the failing test**

Create `src/lib/wine-map/shard-controller.test.ts`:

```ts
// ShardController against a fake map that behaves like MapLibre 5.24 where it
// matters: Style.addSource throws on a duplicate id; Style.addLayer fires an
// error (no throw, nothing added) for a duplicate id or a missing `before`,
// and for a layer whose source is missing inserts it into the order FIRST and
// then throws (the TypeError _updateLayer raises); removeSource refuses while
// a layer still reads the source; map.style is replaced by an unloaded object
// on a full rebuild. Layer order is modelled, so ordering is asserted rather
// than assumed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_PALETTES, type MapPalette } from "./map-palette";
import { GS } from "./map-state";
import { ShardController, type ControllerMap, type ShardDesired } from "./shard-controller";
import { shardFilter, shardLayerSpecs, shardOverlaySpecs } from "./shard-specs";

type Spec = {
  id: string;
  type: string;
  source?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  filter?: unknown;
};
type Call = [string, ...unknown[]];

const WORLD_LAYERS = [
  "world-fills",
  "world-outlines",
  "world-region-fills",
  "world-region-outlines",
  "world-selected-casing",
  "world-selected-ring",
  "world-labels",
  "world-selected-label",
];
const MUTATIONS = new Set([
  "addSource",
  "addLayer",
  "setPaintProperty",
  "setFilter",
  "removeLayer",
  "removeSource",
  "moveLayer",
  "setGlobalStateProperty",
]);

class FakeStyle {
  sources = new Map<string, unknown>();
  layers = new Map<string, Spec>();
  order: string[] = [];
  _loaded = true;
  constructor(private readonly host: FakeMap) {}

  addSource(id: string, spec: unknown, o: { validate: false }) {
    this.host.record(["addSource", id, o]);
    this.host.clock.t += this.host.addCostMs;
    if (this.host.notLoaded) throw new Error("Style is not done loading.");
    if (this.sources.has(id)) throw new Error(`Source "${id}" already exists.`);
    this.sources.set(id, spec);
  }

  addLayer(spec: Spec, before: string | undefined, o: { validate: false }) {
    this.host.record(["addLayer", spec.id, before, o]);
    if (this.host.throwOnAddLayer === spec.id) throw new Error(`boom ${spec.id}`);
    if (this.layers.has(spec.id) || this.host.refuseLayer === spec.id) {
      this.host.errors.push(`Layer "${spec.id}" refused`);
      return;
    }
    const index = before ? this.order.indexOf(before) : this.order.length;
    if (before && index === -1) {
      this.host.errors.push(`Cannot add layer "${spec.id}" before non-existing layer "${before}".`);
      return;
    }
    this.order.splice(index, 0, spec.id);
    this.layers.set(spec.id, { ...spec });
    if (this.host.throwAfterInsert === spec.id || (spec.source && !this.sources.has(spec.source))) {
      throw new TypeError("Cannot read properties of undefined (reading 'getSource')");
    }
  }

  setPaintProperty(layer: string, name: string, value: unknown, o: { validate: false }) {
    this.host.record(["setPaintProperty", layer, name, o]);
    const spec = this.layers.get(layer);
    if (!spec) return;
    spec.paint = { ...spec.paint, [name]: value };
  }

  setFilter(layer: string, filter: unknown, o: { validate: false }) {
    this.host.record(["setFilter", layer, o]);
    const spec = this.layers.get(layer);
    if (spec) spec.filter = filter;
  }
}

class FakeMap implements ControllerMap {
  style: FakeStyle | undefined;
  calls: Call[] = [];
  errors: string[] = [];
  globalState: Record<string, unknown> = {};
  clock = { t: 0 };
  addCostMs = 0;
  notLoaded = false;
  throwOnAddLayer: string | null = null;
  throwAfterInsert: string | null = null;
  refuseLayer: string | null = null;
  private listeners = new Map<string, Set<(...a: unknown[]) => void>>();

  constructor({ world = true } = {}) {
    this.style = new FakeStyle(this);
    this.style.order.push("background", "water");
    if (world) this.addWorldLayers();
  }

  record(call: Call) {
    this.calls.push(call);
  }
  mutations(): Call[] {
    return this.calls.filter(([name]) => MUTATIONS.has(name));
  }
  addWorldLayers() {
    const style = this.style!;
    style.sources.set("wine-world", { type: "vector" });
    for (const id of WORLD_LAYERS) {
      style.order.push(id);
      style.layers.set(id, { id, type: "line", source: "wine-world" });
    }
  }
  /** MapLibre's full-rebuild fallback: a new, unloaded Style built from the
      serialized old one (here: every layer `keep` accepts). */
  rebuild(keep: (id: string) => boolean) {
    const prev = this.style!;
    const next = new FakeStyle(this);
    next._loaded = false;
    next.order = prev.order.filter(keep);
    for (const id of next.order) next.layers.set(id, { ...prev.layers.get(id)! });
    for (const [id, spec] of prev.sources) {
      if (next.order.some((layer) => next.layers.get(layer)?.source === id)) next.sources.set(id, spec);
    }
    this.style = next;
  }

  getSource(id: string) {
    return this.style?.sources.get(id);
  }
  getLayer(id: string) {
    return this.style?.layers.get(id);
  }
  removeLayer(id: string) {
    this.record(["removeLayer", id]);
    const style = this.style!;
    if (!style.layers.delete(id)) return this;
    style.order.splice(style.order.indexOf(id), 1);
    return this;
  }
  removeSource(id: string) {
    this.record(["removeSource", id]);
    const style = this.style!;
    if ([...style.layers.values()].some((layer) => layer.source === id)) {
      this.errors.push(`Source "${id}" cannot be removed while a layer is using it.`);
      return this;
    }
    style.sources.delete(id);
    return this;
  }
  moveLayer(id: string, before?: string) {
    this.record(["moveLayer", id, before]);
    const order = this.style!.order;
    order.splice(order.indexOf(id), 1);
    order.splice(before ? order.indexOf(before) : order.length, 0, id);
    return this;
  }
  getLayersOrder() {
    return [...this.style!.order];
  }
  setGlobalStateProperty(name: string, value: unknown) {
    this.record(["setGlobalStateProperty", name, value]);
    this.globalState[name] = value;
    return this;
  }
  getGlobalState() {
    return this.globalState;
  }
  setFeatureState() {
    return this;
  }
  removeFeatureState() {
    return this;
  }
  on(type: string, fn: (...a: unknown[]) => void) {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn);
    return this;
  }
  off(type: string, fn: (...a: unknown[]) => void) {
    this.listeners.get(type)?.delete(fn);
    return this;
  }
  emit(type: string, event?: unknown) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
}

function frames() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      const handle = next++;
      pending.set(handle, cb);
      return handle;
    },
    cancelRaf: (handle: number) => {
      pending.delete(handle);
    },
    /** Runs the frame that is due; returns how many callbacks ran. */
    flush() {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb();
      return due.length;
    },
    /** Runs frames until nothing is scheduled; returns how many ran. */
    drain() {
      let count = 0;
      while (pending.size > 0 && count < 100) {
        this.flush();
        count += 1;
      }
      return count;
    },
    get pending() {
      return pending.size;
    },
  };
}

const URLS: Record<string, string> = Object.fromEntries(
  ["alsace", "bordeaux", "bourgogne", "champagne", "loire", "mosel", "toscana"].map((key) => [
    key,
    `https://tiles.test/${key}.pmtiles`,
  ]),
);
const COUNTRY: Record<string, string> = {
  alsace: "france", bordeaux: "france", bourgogne: "france", champagne: "france",
  loire: "france", mosel: "germany", toscana: "italy",
};
const SLUGS: Record<string, string[]> = {
  bourgogne: ["chablis", "cote-de-beaune", "cote-de-nuits", "gevrey-chambertin", "vosne-romanee"],
  champagne: ["cote-des-blancs", "montagne-de-reims", "vallee-de-la-marne"],
};

function desired(over: {
  keys?: string[];
  selectedShard?: string | null;
  theme?: "light" | "dark";
  ramped?: string[];
  tree?: boolean;
} = {}): ShardDesired {
  const palette: MapPalette = MAP_PALETTES[over.theme ?? "light"];
  const ramped = new Set(over.ramped ?? []);
  const tree = over.tree ?? true;
  return {
    keys: over.keys ?? ["bourgogne"],
    urls: URLS,
    selectedShard: over.selectedShard ?? null,
    palette,
    inputs: (key) => ({
      country: tree ? (COUNTRY[key] ?? null) : null,
      areaSlugs: tree ? (SLUGS[key] ?? []) : [],
      ramp: ramped.has(key),
      palette,
      fillsVisible: true,
    }),
  };
}

function setup(opts: { world?: boolean; budgetMs?: number; addCostMs?: number } = {}) {
  const map = new FakeMap({ world: opts.world ?? true });
  map.addCostMs = opts.addCostMs ?? 0;
  const f = frames();
  const controller = new ShardController(map, {
    now: () => map.clock.t,
    raf: f.raf,
    cancelRaf: f.cancelRaf,
    budgetMs: opts.budgetMs ?? 8,
  });
  return { map, frames: f, controller };
}

const idx = (map: FakeMap, id: string) => map.getLayersOrder().indexOf(id);
const base = (key: string) => [`shard-fills-${key}`, `shard-outlines-${key}`, `shard-labels-${key}`];
const overlays = (key: string) => [
  `shard-selected-casing-${key}`,
  `shard-selected-ring-${key}`,
  `shard-selected-label-${key}`,
];
const V = { validate: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShardController", () => {
  it("1. waits for the world layers, then adds every shard above them", () => {
    const { map, frames, controller } = setup({ world: false });
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    frames.drain();
    expect(map.getSource("wine-shard-bourgogne")).toBeUndefined();
    expect(map.mutations()).toEqual([]);

    // react-map-gl creates the world layers in a later render; styledata follows.
    map.addWorldLayers();
    map.emit("styledata");
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
    for (const world of WORLD_LAYERS) {
      expect(idx(map, world)).toBeLessThan(idx(map, "shard-fills-bourgogne"));
    }
  });

  it("2. adds one source and its three layers per shard, then marks the map dirty once", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "alsace"] }));
    expect(frames.flush()).toBe(1);
    expect(map.mutations()).toEqual([
      ["addSource", "wine-shard-alsace", V],
      ["addLayer", "shard-fills-alsace", undefined, V],
      ["addLayer", "shard-outlines-alsace", undefined, V],
      ["addLayer", "shard-labels-alsace", undefined, V],
      ["addSource", "wine-shard-bourgogne", V],
      ["addLayer", "shard-fills-bourgogne", undefined, V],
      ["addLayer", "shard-outlines-bourgogne", undefined, V],
      ["addLayer", "shard-labels-bourgogne", undefined, V],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    // The source spec is exactly what shardLayerSpecs builds from the inputs.
    expect(map.getSource("wine-shard-bourgogne")).toEqual(
      shardLayerSpecs("bourgogne", URLS.bourgogne, desired().inputs("bourgogne")).source,
    );
    expect(frames.pending).toBe(0);
  });

  it("3. keeps each frame within the time budget", () => {
    // 8 ms budget, 3 ms per add: three adds fit (0, 3, 6 ms), the fourth waits.
    const { map, frames, controller } = setup({ budgetMs: 8, addCostMs: 3 });
    controller.setDesired(desired({ keys: Object.keys(URLS) }));
    const perFrame: number[] = [];
    while (frames.pending > 0) {
      const before = map.mutations().filter(([n]) => n === "addSource").length;
      frames.flush();
      perFrame.push(map.mutations().filter(([n]) => n === "addSource").length - before);
    }
    expect(perFrame).toEqual([3, 3, 1]);
    // One dirty mark per batch, never per shard.
    expect(map.mutations().filter(([n]) => n === "setGlobalStateProperty")).toHaveLength(3);
    for (const key of Object.keys(URLS)) expect(controller.isAdded(key)).toBe(true);
  });

  it("4. adds the selected shard first, then alphabetically", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["toscana", "alsace", "mosel", "bourgogne"], selectedShard: "mosel" }));
    frames.drain();
    expect(map.mutations().filter(([n]) => n === "addSource").map(([, id]) => id)).toEqual([
      "wine-shard-mosel",
      "wine-shard-alsace",
      "wine-shard-bourgogne",
      "wine-shard-toscana",
    ]);
  });

  it("5. keeps the selection overlays on top; later shards go in below them", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    expect(map.getLayersOrder().slice(-6)).toEqual([...base("bourgogne"), ...overlays("bourgogne")]);

    controller.setDesired(desired({ keys: ["alsace", "bourgogne", "toscana"], selectedShard: "bourgogne" }));
    frames.drain();
    const order = map.getLayersOrder();
    expect(order.slice(-3)).toEqual(overlays("bourgogne"));
    for (const id of [...base("alsace"), ...base("toscana")]) {
      expect(idx(map, id)).toBeLessThan(idx(map, "shard-selected-casing-bourgogne"));
    }
    expect(map.calls).toContainEqual(["addLayer", "shard-fills-alsace", "shard-selected-casing-bourgogne", V]);
    // The overlays are exactly shardOverlaySpecs for the landed palette.
    expect(map.getLayer("shard-selected-ring-bourgogne")).toEqual(shardOverlaySpecs("bourgogne", MAP_PALETTES.light)[1]);
  });

  it("6. moves the overlays when the selection moves to another shard", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();
    expect(map.mutations()).toEqual([
      ["removeLayer", "shard-selected-label-bourgogne"],
      ["removeLayer", "shard-selected-ring-bourgogne"],
      ["removeLayer", "shard-selected-casing-bourgogne"],
      ["addLayer", "shard-selected-casing-alsace", undefined, V],
      ["addLayer", "shard-selected-ring-alsace", undefined, V],
      ["addLayer", "shard-selected-label-alsace", undefined, V],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    expect(map.getLayersOrder().slice(-3)).toEqual(overlays("alsace"));

    // Nothing selected: no overlays at all.
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: null }));
    frames.drain();
    expect(map.getLayersOrder().some((id) => id.startsWith("shard-selected-"))).toBe(false);
  });

  it("7. rolls a shard back when a layer throws, marks it failed and never retries it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.throwOnAddLayer = "shard-outlines-alsace";
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(map.getLayersOrder().filter((id) => id.includes("alsace"))).toEqual([]);
    expect(controller.isAdded("alsace")).toBe(false);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('"alsace"');

    // Never retried this visit, whatever triggers a run.
    map.throwOnAddLayer = null;
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    map.emit("styledata");
    controller.onStyleRebuilt();
    frames.drain();
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-alsace")).toEqual([]);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it("8. also removes a layer MapLibre inserted before throwing", () => {
    // A layer whose source is missing goes into the order and THEN throws; left
    // there it would fault every frame. The rollback checks every spec id.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.throwAfterInsert = "shard-labels-loire";
    controller.setDesired(desired({ keys: ["loire"] }));
    frames.drain();
    expect(map.getLayersOrder().filter((id) => id.includes("loire"))).toEqual([]);
    expect(map.getSource("wine-shard-loire")).toBeUndefined();
    expect(controller.isAdded("loire")).toBe(false);
  });

  it("9. treats a layer MapLibre refused with an error event as a failed add", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.refuseLayer = "shard-fills-champagne";
    controller.setDesired(desired({ keys: ["champagne", "mosel"] }));
    frames.drain();
    expect(map.getSource("wine-shard-champagne")).toBeUndefined();
    expect(controller.isAdded("champagne")).toBe(false);
    expect(controller.isAdded("mosel")).toBe(true);
  });

  it("10. removes overlays, then labels, outlines, fills, and the source last", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["alsace"], selectedShard: null }));
    frames.drain();
    expect(map.mutations()).toEqual([
      ["removeLayer", "shard-selected-label-bourgogne"],
      ["removeLayer", "shard-selected-ring-bourgogne"],
      ["removeLayer", "shard-selected-casing-bourgogne"],
      ["removeLayer", "shard-labels-bourgogne"],
      ["removeLayer", "shard-outlines-bourgogne"],
      ["removeLayer", "shard-fills-bourgogne"],
      ["removeSource", "wine-shard-bourgogne"],
      ["setGlobalStateProperty", GS.tick, 1],
    ]);
    expect(map.errors).toEqual([]);
    expect(controller.isAdded("bourgogne")).toBe(false);
  });

  it("11. does nothing while a rebuilt style loads, then re-adds what is missing and repaints", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    // Full rebuild: the new style carries bourgogne (transformStyle) but not alsace.
    map.rebuild((id) => !id.includes("alsace"));
    map.calls = [];
    map.emit("styledata");
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"] }));
    frames.drain();
    expect(map.mutations()).toEqual([]);

    map.style!._loaded = true;
    controller.onStyleRebuilt();
    frames.drain();
    expect(controller.isAdded("alsace")).toBe(true);
    const repainted = map.mutations().filter(([n]) => n === "setPaintProperty").map(([, layer, name]) => `${layer} ${name}`);
    expect(repainted).toEqual(expect.arrayContaining([
      "shard-fills-bourgogne fill-color",
      "shard-outlines-bourgogne line-color",
      "shard-labels-bourgogne text-color",
    ]));
  });

  it("12. a 'not done loading' throw stops the run without failing the shard", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    map.notLoaded = true;
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(false);
    expect(error).not.toHaveBeenCalled();
    map.notLoaded = false;
    controller.onStyleRebuilt();
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
  });

  it("13. reapplyPaint rewrites every mounted shard's colours without validation", () => {
    const { map, frames, controller } = setup();
    const next = desired({ keys: ["bourgogne", "mosel"], ramped: ["bourgogne"] });
    controller.setDesired(next);
    frames.drain();
    map.calls = [];
    controller.reapplyPaint();
    frames.drain();
    const writes = map.calls.filter(([n]) => n === "setPaintProperty");
    for (const key of ["bourgogne", "mosel"]) {
      const names = writes.filter(([, layer]) => String(layer).endsWith(`-${key}`)).map(([, layer, name]) => `${layer} ${name}`);
      expect(names).toEqual(expect.arrayContaining([
        `shard-fills-${key} fill-color`,
        `shard-fills-${key} fill-opacity`,
        `shard-outlines-${key} line-color`,
        `shard-labels-${key} text-color`,
        `shard-labels-${key} text-halo-color`,
      ]));
    }
    for (const call of writes) expect(call[3]).toEqual(V);
    // The ramped shard's fill-opacity is the ramped one.
    const fills = map.getLayer("shard-fills-bourgogne")!;
    expect(fills.paint?.["fill-opacity"]).toEqual(
      (shardLayerSpecs("bourgogne", URLS.bourgogne, next.inputs("bourgogne")).layers[0] as Spec).paint?.["fill-opacity"],
    );
  });

  it("14. a theme flip repaints every shard and the overlays with the landed palette", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    const dark = desired({ keys: ["bourgogne", "mosel"], selectedShard: "bourgogne", theme: "dark" });
    controller.setDesired(dark);
    frames.drain();
    for (const key of ["bourgogne", "mosel"]) {
      const expected = shardLayerSpecs(key, URLS[key], dark.inputs(key)).layers as Spec[];
      for (const layer of expected) expect(map.getLayer(layer.id)?.paint).toEqual(layer.paint);
    }
    expect(map.getLayer("shard-selected-casing-bourgogne")?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedCasing);
    expect(map.getLayer("shard-selected-ring-bourgogne")?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedRing);
    // Colours only: no filter moved and nothing was re-added.
    expect(map.mutations().filter(([n]) => n === "setFilter" || n === "addSource" || n === "addLayer")).toEqual([]);
  });

  it("15. a ramp joining rewrites only that shard", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"] }));
    frames.drain();
    map.calls = [];
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], ramped: ["bourgogne"] }));
    frames.drain();
    const touched = new Set(map.mutations().filter(([n]) => n === "setPaintProperty").map(([, layer]) => layer));
    expect([...touched].sort()).toEqual(base("bourgogne").sort());
  });

  it("16. the tree landing re-filters by country and recolours by area, without re-adding", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], tree: false }));
    frames.drain();
    expect(map.getLayer("shard-fills-bourgogne")?.filter).toEqual(shardFilter(null));
    map.calls = [];
    controller.setDesired(desired({ keys: ["bourgogne", "mosel"], tree: true }));
    frames.drain();
    for (const id of base("bourgogne")) {
      expect(map.calls).toContainEqual(["setFilter", id, V]);
      expect(map.getLayer(id)?.filter).toEqual(shardFilter("france"));
    }
    for (const id of base("mosel")) expect(map.getLayer(id)?.filter).toEqual(shardFilter("germany"));
    expect(map.calls).toContainEqual(["setPaintProperty", "shard-fills-bourgogne", "fill-color", V]);
    expect(map.mutations().filter(([n]) => n === "addSource" || n === "removeSource")).toEqual([]);
  });

  it("17. the same desired state again writes nothing", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne", ramped: ["bourgogne"] }));
    frames.drain();
    map.calls = [];
    // Fresh objects, equal content: a React re-render.
    controller.setDesired(desired({ keys: ["bourgogne", "alsace"], selectedShard: "bourgogne", ramped: ["bourgogne"] }));
    map.emit("styledata");
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("18. reads what is mounted from the map: a second controller adopts it", () => {
    const first = setup();
    first.controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    first.frames.drain();
    first.controller.dispose();

    const { map } = first;
    map.calls = [];
    const f = frames();
    const second = new ShardController(map, { now: () => 0, raf: f.raf, cancelRaf: f.cancelRaf });
    expect(second.isAdded("alsace")).toBe(true);
    second.setDesired(desired({ keys: ["bourgogne"], selectedShard: "bourgogne" }));
    f.drain();
    expect(map.mutations().filter(([n]) => n === "addSource" || n === "addLayer")).toEqual([]);
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(second.isAdded("bourgogne")).toBe(true);
  });

  it("19. moves a world layer re-created above the shards back below them, in world order", () => {
    for (const recreated of ["world-labels", "world-selected-label", "world-fills"]) {
      const { map, frames, controller } = setup();
      controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
      frames.drain();
      // react-map-gl re-creating a world layer (StrictMode/Fast Refresh) appends it.
      const order = map.style!.order;
      order.splice(order.indexOf(recreated), 1);
      order.push(recreated);
      map.emit("styledata");
      frames.drain();
      const firstShard = map.getLayersOrder().findIndex((id) => id.startsWith("shard-"));
      for (const world of WORLD_LAYERS) expect(idx(map, world), `${recreated}: ${world}`).toBeLessThan(firstShard);
      // The world block keeps its own order: world-selected-label directly
      // above world-labels, so the selected name wins its collision (D4).
      expect(map.getLayersOrder().filter((id) => id.startsWith("world-")), recreated).toEqual(WORLD_LAYERS);
      expect(idx(map, "world-labels")).toBeLessThan(idx(map, "world-selected-label"));
      expect(map.getLayersOrder().slice(-3)).toEqual(overlays("bourgogne"));
    }
  });

  it("20. skips a key with no archive url", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne", "atlantis"] }));
    frames.drain();
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(controller.isAdded("atlantis")).toBe(false);
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-atlantis")).toEqual([]);
  });

  it("21. a diff landing (same style object) re-checks without rewriting anything", () => {
    // withWineLayers carries the shard layers across a theme diff verbatim;
    // the landed palette arrives through the next setDesired instead.
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "bourgogne" }));
    frames.drain();
    map.calls = [];
    controller.onStyleRebuilt();
    expect(frames.pending).toBe(1);
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("22. dispose cancels the pending frame and stops listening", () => {
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["bourgogne"] }));
    expect(frames.pending).toBe(1);
    controller.dispose();
    expect(frames.pending).toBe(0);
    map.emit("styledata");
    map.emit("error", { sourceId: "wine-shard-bourgogne", error: new Error("Failed to fetch") });
    expect(frames.pending).toBe(0);
    frames.drain();
    expect(map.mutations()).toEqual([]);
  });

  it("23. a theme flip while shards are still being added reaches every shard, early and late", () => {
    // 8 ms budget, 3 ms per add: the first frame adds three shards, and the
    // flip lands with four still queued.
    const { map, frames, controller } = setup({ budgetMs: 8, addCostMs: 3 });
    const keys = Object.keys(URLS);
    controller.setDesired(desired({ keys, selectedShard: "bourgogne" }));
    frames.flush();
    expect(keys.filter((key) => controller.isAdded(key))).toEqual(["alsace", "bordeaux", "bourgogne"]);

    const dark = desired({ keys, theme: "dark", ramped: ["bourgogne"], selectedShard: "bourgogne" });
    controller.setDesired(dark);
    frames.drain();
    for (const key of keys) {
      expect(controller.isAdded(key), key).toBe(true);
      const expected = shardLayerSpecs(key, URLS[key], dark.inputs(key)).layers as Spec[];
      for (const layer of expected) expect(map.getLayer(layer.id)?.paint, layer.id).toEqual(layer.paint);
    }
    const [casing, ring, label] = shardOverlaySpecs("bourgogne", MAP_PALETTES.dark) as Spec[];
    expect(map.getLayer(casing.id)?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedCasing);
    expect(map.getLayer(ring.id)?.paint?.["line-color"]).toBe(MAP_PALETTES.dark.selectedRing);
    expect(map.getLayer(label.id)?.paint).toEqual(label.paint);
  });

  it("24. drops a shard whose archive cannot be read; a single tile's error is left alone", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { map, frames, controller } = setup();
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();

    // One tile of a shard fails (MapLibre's error event carries `tile`).
    map.emit("error", { sourceId: "wine-shard-alsace", tile: {}, error: new Error("tile 404") });
    frames.drain();
    expect(controller.isAdded("alsace")).toBe(true);

    // The archive header fails (blocked, 404, offline): MapLibre marks the
    // source errored and reports it loaded. Not ready, removed, not retried.
    map.calls = [];
    map.emit("error", { sourceId: "wine-shard-alsace", error: new Error("Failed to fetch") });
    expect(controller.isAdded("alsace")).toBe(false);
    frames.drain();
    expect(map.getSource("wine-shard-alsace")).toBeUndefined();
    expect(map.getLayersOrder().filter((id) => id.includes("alsace"))).toEqual([]);
    expect(map.mutations().at(-1)).toEqual(["setGlobalStateProperty", GS.tick, 1]);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('"alsace"');

    // Other sources' errors are not the controller's; the dropped shard stays out.
    map.emit("error", { sourceId: "carto", error: new Error("basemap") });
    map.emit("error", { sourceId: "wine-world", error: new Error("world") });
    map.emit("error", { error: new Error("no source") });
    controller.setDesired(desired({ keys: ["alsace", "bourgogne"], selectedShard: "alsace" }));
    frames.drain();
    expect(map.calls.filter(([n, id]) => n === "addSource" && id === "wine-shard-alsace")).toEqual([]);
    expect(controller.isAdded("bourgogne")).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/shard-controller.test.ts`
Expected: FAIL — `Error: Cannot find module './shard-controller' imported from '.../src/lib/wine-map/shard-controller.test.ts'` (no tests run).

- [ ] **Step 3: Implement**

Create `src/lib/wine-map/shard-controller.ts`:

```ts
// Region shards, mounted imperatively (spec 2026-09-23 §6).
//
// react-map-gl's <Source>/<Layer> go through map.addSource/map.addLayer, and
// both ALWAYS run Style._validate, which serializes the WHOLE style for every
// call — so mounting 40-67 shards on the first zoom past z5 cost a 1.2-1.5 s
// long task, growing with the square of the style. Style.addSource/addLayer
// take {validate:false}; with the small per-shard expressions that took the
// same 67 shards to 13 ms. What the runtime no longer validates is validated
// at build time instead (shard-layer-specs.test.ts).
//
// The rules this class keeps, each one a failure the review found:
//  - Truth comes from the map. Whether a shard is mounted is read from
//    getSource/getLayer and the layer order on every run, never from private
//    bookkeeping, so StrictMode double effects, a second controller on the
//    same map and a full style rebuild all converge on the same answer.
//  - A shard is added in ONE synchronous step (source + fills + outlines +
//    labels). A source without its layers reads as "loaded" and would hand
//    the world copy off to an empty shard.
//  - A shard that throws is rolled back completely — including a layer
//    MapLibre inserted before throwing, which would otherwise fault every
//    frame on its missing source — marked failed, logged once and never
//    retried this visit; the world archive keeps drawing its region.
//  - So is a shard whose archive cannot be read (blocked, 404, offline).
//    MapLibre marks such a source errored and then reports it LOADED, which
//    would hand its region over to a shard with nothing to draw.
//  - Nothing runs while the style is not loaded: in the frame after a full
//    rebuild map.style is a new, unloaded Style, and addSource would throw.
//    onStyleRebuilt (from the style.load listener) resumes.
//  - World layers stay below every shard layer (an invisible handed-off world
//    label above a shard label would win the collision and blank it), and the
//    selected place's casing, ring and label stay above everything.
//  - Adds are budgeted per animation frame (8 ms): all 67 fit in one frame on
//    a desktop, a slow phone spreads them over a few.
//  - After a batch, one setGlobalStateProperty(wm_tick, 1): Style.* writes do
//    not mark the map dirty, and that public call always runs _update(true)
//    while reloading nothing (no layer reads wm_tick).
import type { MapPalette } from "./map-palette";
import type { SyncMap } from "./map-state-sync";
import { GS } from "./map-state";
import { SHARD_SOURCE_PREFIX, shardSourceId } from "./basemap";
import {
  shardLayerIds,
  shardLayerSpecs,
  shardOverlayIds,
  shardOverlaySpecs,
  type ShardSpecInputs,
} from "./shard-specs";

type NoValidate = { validate: false };
const NO_VALIDATE: NoValidate = { validate: false };

type ControllerStyle = {
  addSource(id: string, spec: unknown, o: NoValidate): void;
  addLayer(spec: unknown, before: string | undefined, o: NoValidate): void;
  setPaintProperty(layer: string, name: string, value: unknown, o: NoValidate): void;
  setFilter(layer: string, filter: unknown, o: NoValidate): void;
};

/** The slice of a MapLibre map the controller drives. `style` is the live
    Style (replaced on a full rebuild); removals and moves go through the
    public map methods, which mark the map dirty themselves. */
export type ControllerMap = SyncMap & {
  style: ControllerStyle | undefined;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  moveLayer(id: string, before?: string): unknown;
  getLayersOrder(): string[];
};

export type ShardDesired = {
  /** Shards that should be mounted (mountedShards). Keys with no url, or that
      failed earlier this visit, are skipped. */
  keys: readonly string[];
  /** Shard key -> archive URL (manifest.shards[key].url, no protocol). */
  urls: Readonly<Record<string, string>>;
  /** The selected place's shard: added first, and owner of the overlays. */
  selectedShard: string | null;
  /** Read at add time and on every run, so a shard added from a queued batch
      after a theme flip or the tree landing is built from the current
      inputs, never the ones current when it was queued. */
  inputs: (key: string) => ShardSpecInputs;
  /** The landed theme's palette, for the overlays. */
  palette: MapPalette;
};

/** Added only once react-map-gl has created the world layers, so every shard
    layer lands above them. */
const WORLD_ANCHOR_LAYER = "world-labels";
const WORLD_LAYER_PREFIX = "world-";
/** The world layers bottom to top, as TileWineMap declares them. Their order
    among themselves matters too: world-selected-label must stay directly
    above world-labels, so the selected copy is placed first and wins its
    collision (D4). */
const WORLD_ORDER: readonly string[] = [
  "world-fills",
  "world-outlines",
  "world-region-fills",
  "world-region-outlines",
  "world-selected-casing",
  "world-selected-ring",
  "world-labels",
  "world-selected-label",
];
const SHARD_LAYER_PREFIX = "shard-";
const OVERLAY_PREFIX = "shard-selected-";
const BASE_LAYER_ID = /^shard-(?:fills|outlines|labels)-(.+)$/;
const OVERLAY_LAYER_ID = /^shard-selected-(?:casing|ring|label)-(.+)$/;
const DEFAULT_BUDGET_MS = 8;

function isNotLoaded(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Style is not done loading");
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a.every((value, i) => value === b[i]));
}

export class ShardController {
  private readonly map: ControllerMap;
  private readonly now: () => number;
  private readonly raf: (cb: () => void) => number;
  private readonly cancelRaf: (handle: number) => void;
  private readonly budgetMs: number;
  private desired: ShardDesired | null = null;
  /** The Style object last seen loaded; any other object is mid-rebuild. */
  private readyStyle: object | undefined;
  private frame: number | null = null;
  private disposed = false;
  /** Set by any Style.* write in the current run; one wm_tick per run. */
  private wrote = false;
  private readonly failed = new Set<string>();
  private readonly overlaysFailed = new Set<string>();
  /** The inputs each mounted shard's paint and filters were written from. */
  private readonly applied = new Map<string, ShardSpecInputs>();
  private appliedOverlay: { key: string; palette: MapPalette } | null = null;
  private readonly logged = new Set<string>();
  private readonly onStyleData = () => {
    if (this.desired) this.schedule();
  };
  // An archive whose header cannot be read leaves an errored source, which
  // MapLibre reports as loaded: the readiness latch would hide the region's
  // world copy over a shard with nothing to draw. Such a shard goes the way
  // of one that threw. A single tile's error carries `tile` and is left to
  // MapLibre; the basemap's and the world source's errors are not ours.
  private readonly onError = (event: unknown) => {
    const e = event as { sourceId?: unknown; tile?: unknown } | undefined;
    if (!e || e.tile !== undefined || typeof e.sourceId !== "string") return;
    if (!e.sourceId.startsWith(SHARD_SOURCE_PREFIX)) return;
    const key = e.sourceId.slice(SHARD_SOURCE_PREFIX.length);
    if (this.failed.has(key)) return;
    this.failed.add(key);
    console.error(
      `[wine-map] shard "${key}" could not be loaded and is skipped for this visit; the world map keeps drawing its region.`,
    );
    // The next run removes what is left of it (it is no longer a target).
    this.schedule();
  };

  /** Construct from onLoad (the style is loaded then). */
  constructor(
    map: ControllerMap,
    opts: {
      now?: () => number;
      raf?: (cb: () => void) => number;
      cancelRaf?: (handle: number) => void;
      budgetMs?: number;
    } = {},
  ) {
    this.map = map;
    this.now = opts.now ?? (() => performance.now());
    this.raf = opts.raf ?? ((cb) => requestAnimationFrame(cb));
    this.cancelRaf = opts.cancelRaf ?? ((handle) => cancelAnimationFrame(handle));
    this.budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
    this.readyStyle = map.style;
    // react-map-gl creates the world layers in a render after the style loads,
    // and may re-create one on top (StrictMode, Fast Refresh): every style
    // change fires styledata, and a run is cheap when there is nothing to do.
    map.on("styledata", this.onStyleData);
    map.on("error", this.onError);
  }

  setDesired(next: ShardDesired): void {
    this.desired = next;
    this.schedule();
  }

  /** Mounted with all three base layers, and not failed. What the handoff's
      readiness latch asks before it hides a region's world copy. */
  isAdded(key: string): boolean {
    if (this.failed.has(key)) return false;
    try {
      return this.present(key);
    } catch {
      return false;
    }
  }

  /** From the style.load listener: the landed style is the ready one again.
      After a full rebuild (a new Style object) every shard's paint and
      filters are rewritten once; on the usual diff path (same object, shard
      layers carried over verbatim) the next run only re-checks, and the
      landed palette arrives through setDesired. Either way whatever is
      missing is re-added on the next frame. Never throws — a throw in a
      style.load listener turns a good theme diff into a full rebuild. */
  onStyleRebuilt(): void {
    try {
      const style = this.map.style;
      if (style !== this.readyStyle) {
        this.readyStyle = style;
        this.reapplyPaint();
      } else {
        this.schedule();
      }
    } catch (error) {
      this.logOnce("rebuilt", error);
    }
  }

  /** Rewrite every mounted shard's paint and filters (and the overlays'),
      whatever was last applied. setDesired already rewrites exactly the
      shards whose inputs changed; this is the unconditional version. */
  reapplyPaint(): void {
    this.applied.clear();
    this.appliedOverlay = null;
    this.schedule();
  }

  /** Stops scheduling and listening. Leaves the layers alone: this runs on
      unmount, and map.remove() disposes of them with the style. */
  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) this.cancelRaf(this.frame);
    this.frame = null;
    try {
      this.map.off("styledata", this.onStyleData);
      this.map.off("error", this.onError);
    } catch {
      // The map is already gone.
    }
  }

  private schedule(): void {
    if (this.disposed || this.frame !== null) return;
    this.frame = this.raf(() => {
      this.frame = null;
      this.run();
    });
  }

  private loadedStyle(): ControllerStyle | null {
    const style = this.map.style;
    if (!style || style !== this.readyStyle) return null;
    // react-maplibre's own guard (source.ts, layer.ts). A missing field (a
    // fake, or a rename) reads as loaded; identity above still covers the
    // rebuild window.
    if ((style as { _loaded?: unknown })._loaded === false) return null;
    return style;
  }

  private present(key: string): boolean {
    const ids = shardLayerIds(key);
    return Boolean(
      this.map.getSource(shardSourceId(key)) &&
        this.map.getLayer(ids.fills) &&
        this.map.getLayer(ids.outlines) &&
        this.map.getLayer(ids.labels),
    );
  }

  /** Selected shard first (it carries the ring), then alphabetical — the
      order the JSX mounted them in, so border label collisions resolve as
      before. */
  private targetKeys(d: ShardDesired): string[] {
    const keys = [...new Set(d.keys)]
      .filter((key) => d.urls[key] !== undefined && !this.failed.has(key))
      .sort((a, b) => a.localeCompare(b));
    const selected = d.selectedShard;
    if (selected === null || !keys.includes(selected)) return keys;
    return [selected, ...keys.filter((key) => key !== selected)];
  }

  private run(): void {
    const d = this.desired;
    if (this.disposed || !d) return;
    const style = this.loadedStyle();
    if (!style) return;
    this.wrote = false;
    try {
      if (!this.map.getLayer(WORLD_ANCHOR_LAYER)) return;
      const target = this.targetKeys(d);
      const wanted = new Set(target);
      const base = new Set<string>();
      const owners = new Set<string>();
      for (const id of this.map.getLayersOrder()) {
        const b = BASE_LAYER_ID.exec(id);
        if (b) base.add(b[1]);
        const o = OVERLAY_LAYER_ID.exec(id);
        if (o) owners.add(o[1]);
      }
      // Removals are immediate and unbudgeted: they are cheap, and an
      // off-screen shard's layers cost every frame until they go.
      for (const key of base) if (!wanted.has(key)) this.removeShard(key);
      const owner = d.selectedShard !== null && wanted.has(d.selectedShard) ? d.selectedShard : null;
      for (const key of owners) if (key !== owner) this.removeOverlays(key);
      if (owner !== null && this.present(owner)) this.ensureOverlays(style, owner, d.palette);

      const start = this.now();
      let units = 0;
      for (const key of target) {
        if (units > 0 && this.now() - start >= this.budgetMs) {
          this.schedule();
          break;
        }
        if (this.present(key)) {
          const inputs = d.inputs(key);
          const was = this.applied.get(key);
          const paint = !was || was.palette !== inputs.palette || was.ramp !== inputs.ramp ||
            !sameList(was.areaSlugs, inputs.areaSlugs);
          const filter = !was || was.country !== inputs.country;
          if (!paint && !filter) continue;
          this.rewrite(style, key, d.urls[key], inputs, { paint, filter });
        } else if (this.addShard(style, key, d) && key === owner) {
          this.ensureOverlays(style, owner, d.palette);
        }
        units += 1;
      }
      this.keepWorldBelow();
    } catch (error) {
      // Not loaded after all: style.load -> onStyleRebuilt resumes.
      if (!isNotLoaded(error)) this.logOnce("run", error);
    } finally {
      if (this.wrote) this.tick();
    }
  }

  private addShard(style: ControllerStyle, key: string, d: ShardDesired): boolean {
    const inputs = d.inputs(key);
    const specs = shardLayerSpecs(key, d.urls[key], inputs);
    try {
      // Leftovers of a half-present shard; nothing to do in the normal case.
      this.removeShard(key);
      this.wrote = true;
      style.addSource(specs.sourceId, specs.source, NO_VALIDATE);
      if (!this.map.getSource(specs.sourceId)) throw new Error(`${specs.sourceId} was not added`);
      const before = this.firstOverlayId();
      for (const layer of specs.layers) {
        style.addLayer(layer, before, NO_VALIDATE);
        // A refused layer fires an error event rather than throwing.
        if (!this.map.getLayer(layer.id)) throw new Error(`${layer.id} was not added`);
      }
      this.applied.set(key, inputs);
      return true;
    } catch (error) {
      // Not this shard's fault: stop the run and let style.load resume it.
      if (isNotLoaded(error)) throw error;
      this.removeShard(key);
      this.failed.add(key);
      console.error(
        `[wine-map] shard "${key}" could not be added and is skipped for this visit; the world map keeps drawing its region.`,
        error,
      );
      return false;
    }
  }

  private rewrite(
    style: ControllerStyle,
    key: string,
    url: string,
    inputs: ShardSpecInputs,
    what: { paint: boolean; filter: boolean },
  ): void {
    this.wrote = true;
    try {
      for (const layer of shardLayerSpecs(key, url, inputs).layers) {
        if (what.paint) {
          for (const [name, value] of Object.entries(layer.paint ?? {})) {
            style.setPaintProperty(layer.id, name, value, NO_VALIDATE);
          }
        }
        if (what.filter && "filter" in layer && layer.filter !== undefined) {
          style.setFilter(layer.id, layer.filter, NO_VALIDATE);
        }
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`rewrite:${key}`, error);
    }
    // Recorded even after a failure, so a bad value is not retried every frame.
    this.applied.set(key, inputs);
  }

  private ensureOverlays(style: ControllerStyle, key: string, palette: MapPalette): void {
    if (this.overlaysFailed.has(key)) return;
    const specs = shardOverlaySpecs(key, palette);
    if (specs.every((layer) => this.map.getLayer(layer.id))) {
      const was = this.appliedOverlay;
      if (was && was.key === key && was.palette === palette) return;
      this.wrote = true;
      try {
        for (const layer of specs) {
          for (const [name, value] of Object.entries(layer.paint ?? {})) {
            style.setPaintProperty(layer.id, name, value, NO_VALIDATE);
          }
        }
      } catch (error) {
        if (isNotLoaded(error)) throw error;
        this.logOnce(`overlay-paint:${key}`, error);
      }
      this.appliedOverlay = { key, palette };
      return;
    }
    try {
      this.removeOverlays(key);
      this.wrote = true;
      // Appended: the top of the style, above every shard added so far and,
      // through firstOverlayId, every shard added later.
      for (const layer of specs) {
        style.addLayer(layer, undefined, NO_VALIDATE);
        if (!this.map.getLayer(layer.id)) throw new Error(`${layer.id} was not added`);
      }
      this.appliedOverlay = { key, palette };
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.removeOverlays(key);
      this.overlaysFailed.add(key);
      console.error(`[wine-map] the selection ring for shard "${key}" could not be added.`, error);
    }
  }

  /** Overlays first, then labels, outlines, fills, and the source last: a
      source cannot go while a layer still reads it. */
  private removeShard(key: string): void {
    this.removeOverlays(key);
    const ids = shardLayerIds(key);
    for (const id of [ids.labels, ids.outlines, ids.fills]) this.removeLayer(id);
    const source = shardSourceId(key);
    try {
      if (this.map.getSource(source)) {
        this.map.removeSource(source);
        this.wrote = true;
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`remove:${source}`, error);
    }
    this.applied.delete(key);
  }

  private removeOverlays(key: string): void {
    const ids = shardOverlayIds(key);
    for (const id of [ids.label, ids.ring, ids.casing]) this.removeLayer(id);
    if (this.appliedOverlay?.key === key) this.appliedOverlay = null;
  }

  private removeLayer(id: string): void {
    try {
      if (this.map.getLayer(id)) {
        this.map.removeLayer(id);
        this.wrote = true;
      }
    } catch (error) {
      if (isNotLoaded(error)) throw error;
      this.logOnce(`remove:${id}`, error);
    }
  }

  private firstOverlayId(): string | undefined {
    return this.map.getLayersOrder().find((id) => id.startsWith(OVERLAY_PREFIX));
  }

  /** Puts every world layer back below the first shard layer, in
      WORLD_ORDER. react-map-gl appends a re-created world layer at the very
      top, and moving only that one would land a re-created world-labels
      ABOVE world-selected-label, handing the selected name's collision to
      its ordinary copy. So from the lowest misplaced layer in WORLD_ORDER
      upward, every world layer that exists is moved, in that order, to just
      below the first shard layer; a misplaced world id WORLD_ORDER does not
      know follows them. */
  private keepWorldBelow(): void {
    const order = this.map.getLayersOrder();
    const first = order.findIndex((id) => id.startsWith(SHARD_LAYER_PREFIX));
    if (first < 0) return;
    const misplaced = order.slice(first + 1).filter((id) => id.startsWith(WORLD_LAYER_PREFIX));
    if (misplaced.length === 0) return;
    const ranks = misplaced.map((id) => WORLD_ORDER.indexOf(id)).filter((rank) => rank >= 0);
    const from = ranks.length > 0 ? Math.min(...ranks) : WORLD_ORDER.length;
    const present = new Set(order);
    const moves = [
      ...WORLD_ORDER.slice(from).filter((id) => present.has(id)),
      ...misplaced.filter((id) => !WORLD_ORDER.includes(id)),
    ];
    // Each move lands directly under the first shard layer, so moving them
    // bottom to top leaves them in that order.
    for (const id of moves) this.map.moveLayer(id, order[first]);
  }

  private tick(): void {
    try {
      this.map.setGlobalStateProperty(GS.tick, 1);
    } catch (error) {
      if (!isNotLoaded(error)) this.logOnce("tick", error);
    }
  }

  private logOnce(tag: string, error: unknown): void {
    if (this.logged.has(tag)) return;
    this.logged.add(tag);
    console.error(`[wine-map] shard controller: ${tag}`, error);
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/shard-controller.test.ts`
Expected: PASS, 24 passed. (Sanity checks done in the scratch harness: commenting out `this.keepWorldBelow()` fails case 19, and so does moving only the misplaced layer (`const moves = misplaced;`); replacing `before` with `undefined` fails case 5; dropping `was.palette !== inputs.palette` from the paint diff fails cases 14 and 23; removing `map.on("error", this.onError)`, or the `e.tile !== undefined` check, fails case 24.)

- [ ] **Step 5: Add the controller's MapLibre internals to the guard**

The controller reads `style._loaded`, matches the "Style is not done loading." message, relies on `Style.addLayer` inserting before it throws and refusing by event, on `{validate:false}` skipping `_validate`, and on `setGlobalStateProperty` repainting; the fake map models exactly 5.24, and the hover cursor exists because of how react-maplibre 8.1 gates hover queries. `package.json` allows `^5.24.0`, so a routine `npm update` could change any of it with every test still green. Phase 1a Task 5's `src/lib/wine-map/maplibre-internals.test.ts` already pins `maplibre-gl` to 5.24.x and asks later phases to add theirs (its contract names "1c: `Style#addLayer`'s add-then-throw order").

In its header, replace

```ts
// Later phases add their own lines here as they start relying on one.
```

with

```ts
// - Style#_loaded, the "Style is not done loading." message and the order
//   inside Style.addLayer (a duplicate id or a missing `before` fires an
//   ErrorEvent and adds nothing; a layer whose source is missing enters the
//   order BEFORE _updateLayer throws) — shard-controller.ts's readiness
//   check, its not-loaded test and its transactional rollback.
// - Style's {validate:false} skip in _validate, and Map#setGlobalStateProperty
//   calling _update(true) unconditionally — the controller's add path and its
//   one wm_tick dirty mark per batch.
// - @vis.gl/react-maplibre 8.1: <Layer> guards on style._loaded, and hover
//   queries run only while a hover prop is set (why TileWineMap sets the
//   cursor from hover-cursor.ts instead of an onMouseMove prop).
// These three are checked in the packages' src/ (shipped with them): an
// order inside a method cannot be read off the minified bundle.
// Later phases add their own lines here as they start relying on one.
```

and append at the end of the file, after the closing `});` of its `describe` block:

```ts
// Phase 1c: ShardController and the hover cursor.
const MODULES = path.join(process.cwd(), "node_modules");
const readModule = (file: string) => readFileSync(path.join(MODULES, file), "utf8");

/** The text of one method: from its signature up to the next one's. */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThan(-1);
  const end = source.indexOf(to, start + from.length);
  expect(end, to).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MapLibre internals the shard controller relies on", () => {
  it("react-maplibre is the minor version they were verified against", () => {
    const { version } = JSON.parse(readModule("@vis.gl/react-maplibre/package.json")) as {
      version: string;
    };
    expect(version, "re-verify the list at the top of this file, then move the pin").toMatch(/^8\.1\./);
  });

  it("Style keeps its loaded flag, its not-loaded message and the validate:false skip", () => {
    const style = readModule("maplibre-gl/src/style/style.ts");
    // The controller reads style._loaded directly (react-maplibre's own guard)
    // and tells a not-loaded throw from a real failure by its message.
    expect(style).toContain("_loaded: boolean;");
    expect(style).toContain("throw new Error('Style is not done loading.');");
    // {validate:false} skips _validate, whose serialize() of the whole style
    // was the first-zoom freeze.
    expect(style).toContain("if (options?.validate === false) {");
  });

  it("Style.addLayer refuses by event, and inserts a layer before it can throw", () => {
    const addLayer = between(
      readModule("maplibre-gl/src/style/style.ts"),
      "addLayer(layerObject: AddLayerObject",
      "moveLayer(id: string",
    );
    // A duplicate id or a missing `before` fires an ErrorEvent and adds
    // nothing, so the controller checks getLayer after every add.
    expect(addLayer).toContain("already exists on this map.");
    expect(addLayer).toContain("before non-existing layer");
    // The id enters the order BEFORE _updateLayer, which throws on a missing
    // source, so a rollback has to remove every id of the shard that exists.
    const inserted = addLayer.indexOf("this._order.splice(index, 0, id);");
    expect(inserted).toBeGreaterThan(-1);
    expect(inserted).toBeLessThan(addLayer.indexOf("this._updateLayer(layer);"));
  });

  it("Map.setGlobalStateProperty still repaints unconditionally", () => {
    // The controller's one wm_tick write per batch is its dirty mark:
    // Style.* writes do not schedule a render themselves.
    const body = between(
      readModule("maplibre-gl/src/ui/map.ts"),
      "setGlobalStateProperty(propertyName: string, value: any) {",
      "getGlobalState()",
    );
    expect(body).toContain("return this._update(true);");
  });

  it("react-maplibre guards on style._loaded and hover-queries only for hover props", () => {
    expect(readModule("@vis.gl/react-maplibre/src/components/layer.ts")).toContain("map.style._loaded");
    // Why TileWineMap has no onMouseMove prop: with one, every mousemove
    // queries every interactive layer.
    expect(readModule("@vis.gl/react-maplibre/src/maplibre/maplibre.ts")).toContain(
      "props.interactiveLayerIds && (props.onMouseMove || props.onMouseEnter || props.onMouseLeave)",
    );
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/maplibre-internals.test.ts`
Expected: PASS, 7 passed (Phase 1a's 2 plus these 5), with no new code: they pin facts already true of the installed maplibre-gl 5.24.0 and react-maplibre 8.1.1; every string above was read from `node_modules/maplibre-gl/src` and `node_modules/@vis.gl/react-maplibre/src`. To see the new pin bite, change `/^8\.1\./` to `/^8\.2\./`: it fails with `re-verify the list at the top of this file, then move the pin: expected '8.1.1' to match /^8\.2\./`; put it back.

- [ ] **Step 6: Types and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit && npx eslint src/lib/wine-map/shard-controller.ts src/lib/wine-map/shard-controller.test.ts src/lib/wine-map/maplibre-internals.test.ts`
Expected: no output. (`FakeMap implements ControllerMap` also pins that the fake is a structurally valid map; if Task 9's `SyncMap` differs from the skeleton, fix the fake to match it — never loosen `ControllerMap`.)

- [ ] **Step 7: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/lib/wine-map/shard-controller.ts src/lib/wine-map/shard-controller.test.ts src/lib/wine-map/maplibre-internals.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(map): ShardController mounts region shards with validate:false

Adds each shard (source + fills/outlines/labels) in one transactional step
through map.style.addSource/addLayer with validate:false, budgeted to 8 ms
per frame, selected shard first, overlays kept on top and world layers kept
below in their own order. Reads what is mounted from the map, waits out a
rebuilding style, rolls back and skips a shard that throws or whose
archive cannot be read (an errored source reads as loaded), rewrites
paint/filters only for shards whose inputs changed (a theme flip mid-batch
included), and marks the map dirty once per batch through
setGlobalStateProperty("wm_tick", 1). Not wired yet.

The MapLibre guard (maplibre-internals.test.ts) now also pins react-maplibre
8.1 and checks, in the packages' source, the internals the controller and
the hover cursor rely on, so a minor bump fails loudly instead of silently.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 16: Wire `ShardController` into `TileWineMap`

**Files:**
- Create: `src/lib/wine-map/hover-cursor.ts`
- Test: `src/lib/wine-map/hover-cursor.test.ts` (create)
- Test: `src/app/knowledge/map/tile-wine-map-engine.test.ts` (create; source-text guard, same approach as `map-chrome.test.ts`)
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`. Base (cd9acd5) line numbers are given for orientation only; Phases 1a/1b move them, so every edit below quotes the exact text it replaces as Phases 1a/1b leave it: Task 3's stagger (1a Task 3 Step 5), Task 11's imports, memos, filters, sync effects, `onLoad` statement, `interactiveLayerIds` and shard JSX (1b Task 11 Steps 5-13), and Task 12's `recomputeReady` probe (1b Task 12 Step 5). The `style.load` listener and the `onMouseMove` prop are still base code; no 1a/1b task edits them.

**Interfaces:**
- Consumes: `ShardController`, `type ShardDesired` (Task 15); `selectionCasingPaint`, `selectionRingPaint`, `type ShardSpecInputs` (Task 14); the explorer's existing props — `shardCountries`, `areaSlugsByShard` (Task 2); Task 11's `MapStateSync`, created in `onLoad` right after `mapReadyRef.current = true;` and carrying its own `styledataloading`/`load`/`style.load`/`sourcedata` listeners; Task 12's `recomputeReady` probe; the base `onSourceData={handleSourceData}` prop, which already schedules a readiness pass for every `wine-shard-*` source's events, JSX-mounted or not.
- Produces:
  ```ts
  // src/lib/wine-map/hover-cursor.ts (new, additive)
  export type HoverPoint = { x: number; y: number };
  export type HoverMap = { on(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
    off(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown; isMoving(): boolean; getZoom(): number;
    getLayer(id: string): unknown;
    queryRenderedFeatures(point: [number, number], options: { layers: string[] }): { properties?: Record<string, unknown> | null }[];
    getCanvas(): { style: { cursor: string } } };
  export function hoverIsClickable(features: readonly { properties?: Record<string, unknown> | null }[], zoom: number): boolean;
  export function installHoverCursor(map: HoverMap, opts: { layers: () => readonly string[];
    raf?: (cb: () => void) => number; cancelRaf?: (h: number) => void }): () => void;
  ```
  `TileWineMap`'s props are unchanged; the explorer is not touched.

Behavioural notes:
- `mountedShards` becomes the mount target again, set at once (as at base): the controller does the per-frame pacing now, so Task 3's stagger loop and its `nextMountStep` import go. `nextMountStep` stays exported and tested in `mount-policy.ts` (skeleton contract) but nothing calls it after this task.
- Theme, ramp, tree (country/area slugs) changes need no separate `reapplyPaint()` call from React: they change `shardDesired`, and `setDesired` rewrites paint (and, for a country change, filters with `setFilter({validate:false})`) for exactly the shards whose inputs changed. `onStyleRebuilt()` (from `style.load`) forces a full repaint only after MapLibre's full-rebuild fallback (a new `Style` object); on the usual theme diff the shard layers ride across verbatim and the landed palette arrives one React commit later through `setDesired` — the same commit that repaints the world layers.
- The world ring keeps its react-map-gl `<Layer>`s but takes its paint from the same `selectionCasingPaint`/`selectionRingPaint` builders as the shard overlays.
- A shard the controller adds gets its selection feature-state from `MapStateSync`'s own `sourcedata` metadata listener (Task 9), once its archive header lands. Task 11's `useEffect(() => { stateSyncRef.current?.apply(); }, [mountedShards])` is deleted: it now always runs in the commit, a frame before the controller has added the source, so it could only ever find the source missing.
- `interactiveLayerIds` becomes a memo holding exactly the list Task 11 left on the prop, the selected labels included (D4: the selected name is drawn only by `world-selected-label` / `shard-selected-label-<key>`, so without them a click on it would land on nothing or fall through to a bigger polygon). The hover cursor reads the same list through a ref.
- `onLoad` creates the controller and the hover listener; one effect disposes both on unmount and, like Task 11's `MapStateSync` effect, recreates them when Fast Refresh (dev) has run the cleanups while the MapLibre instance survived (`onLoad` never fires again then). The recreated controller adopts the shards already on the map (Task 15 case 18).
- What only the shard JSX read goes with it: Task 2's per-shard colour memos, Task 11's `shardPaintTable` and per-shard paint/label/filter memos, `mountedSet`, and the imports only they used.

- [ ] **Step 1: Write the failing hover test**

Create `src/lib/wine-map/hover-cursor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hoverIsClickable, installHoverCursor, type HoverMap, type HoverPoint } from "./hover-cursor";

type Feature = { properties?: Record<string, unknown> | null };

function fakeMap(features: Feature[] = [], opts: { zoom?: number; layers?: string[] } = {}) {
  const listeners = new Set<(e: { point: HoverPoint }) => void>();
  const present = new Set(opts.layers ?? ["world-region-fills", "shard-fills-bourgogne"]);
  const state = {
    moving: false,
    zoom: opts.zoom ?? 9,
    features,
    throwOnQuery: false,
    queries: [] as { point: [number, number]; layers: string[] }[],
    canvas: { style: { cursor: "" } },
  };
  const map: HoverMap = {
    on: (_type, fn) => listeners.add(fn),
    off: (_type, fn) => listeners.delete(fn),
    isMoving: () => state.moving,
    getZoom: () => state.zoom,
    getLayer: (id) => (present.has(id) ? { id } : undefined),
    queryRenderedFeatures: (point, options) => {
      if (state.throwOnQuery) throw new Error("Style is not done loading.");
      state.queries.push({ point, layers: options.layers });
      return state.features;
    },
    getCanvas: () => state.canvas,
  };
  const move = (x: number, y: number) => {
    for (const fn of [...listeners]) fn({ point: { x, y } });
  };
  return { map, state, move, listeners };
}

function frames() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    raf: (cb: () => void) => {
      const handle = next++;
      pending.set(handle, cb);
      return handle;
    },
    cancelRaf: (handle: number) => {
      pending.delete(handle);
    },
    flush() {
      const due = [...pending.values()];
      pending.clear();
      for (const cb of due) cb();
    },
    get pending() {
      return pending.size;
    },
  };
}

const LAYERS = ["world-region-fills", "world-labels", "shard-fills-bourgogne", "shard-fills-alsace"];

describe("hoverIsClickable", () => {
  it("mirrors the click resolver's tier-0 guard", () => {
    expect(hoverIsClickable([{ properties: { tier: 2 } }], 9)).toBe(true);
    expect(hoverIsClickable([{ properties: { tier: 0 } }], 6)).toBe(false);
    expect(hoverIsClickable([{ properties: { tier: 0 } }], 5)).toBe(true);
    expect(hoverIsClickable([{ properties: null }], 7)).toBe(false);
    expect(hoverIsClickable([], 4)).toBe(false);
  });
});

describe("installHoverCursor", () => {
  it("queries once per frame, at the latest point, over the layers that exist", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    for (let i = 0; i < 5; i += 1) move(10 + i, 20);
    expect(f.pending).toBe(1);
    f.flush();
    expect(state.queries).toEqual([
      { point: [14, 20], layers: ["world-region-fills", "shard-fills-bourgogne"] },
    ]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("does not query while the map is moving", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    state.canvas.style.cursor = "pointer";
    state.moving = true;
    move(1, 1);
    f.flush();
    expect(state.queries).toEqual([]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("clears the pointer over the country wash past z5, and over nothing", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 0 } }], { zoom: 6 });
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    state.canvas.style.cursor = "pointer";
    move(1, 1);
    f.flush();
    expect(state.canvas.style.cursor).toBe("");
    state.features = [];
    state.zoom = 4;
    move(2, 2);
    f.flush();
    expect(state.canvas.style.cursor).toBe("");
  });

  it("skips the query when no interactive layer exists yet, and survives a throwing one", () => {
    const { map, state, move } = fakeMap([{ properties: { tier: 3 } }], { layers: [] });
    const f = frames();
    installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    move(1, 1);
    f.flush();
    expect(state.queries).toEqual([]);
    expect(state.canvas.style.cursor).toBe("");

    const second = fakeMap([{ properties: { tier: 3 } }]);
    second.state.throwOnQuery = true;
    installHoverCursor(second.map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    second.move(1, 1);
    expect(() => f.flush()).not.toThrow();
    expect(second.state.canvas.style.cursor).toBe("");
  });

  it("the disposer cancels the pending frame and removes the listener", () => {
    const { map, state, move, listeners } = fakeMap([{ properties: { tier: 3 } }]);
    const f = frames();
    const dispose = installHoverCursor(map, { layers: () => LAYERS, raf: f.raf, cancelRaf: f.cancelRaf });
    move(1, 1);
    dispose();
    expect(f.pending).toBe(0);
    expect(listeners.size).toBe(0);
    move(2, 2);
    f.flush();
    expect(state.queries).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/hover-cursor.test.ts`
Expected: FAIL — `Error: Cannot find module './hover-cursor' imported from '.../src/lib/wine-map/hover-cursor.test.ts'`.

- [ ] **Step 3: Implement the hover module**

Create `src/lib/wine-map/hover-cursor.ts`:

```ts
// The map's pointer cursor, set from a throttled mousemove listener.
//
// It used to be react-map-gl's `onMouseMove` prop. Any hover prop makes
// react-map-gl run queryRenderedFeatures over every interactive layer (two per
// mounted shard plus the world ones) on EVERY mousemove, mid-pan included,
// just to decide between two cursors. Here: at most one query per animation
// frame, none while the map is moving (a drag or an ease owns the cursor
// then), and only over the interactive layers that exist.
// Pure: no imports; TileWineMap passes the MapLibre map.

export type HoverPoint = { x: number; y: number };

type HoverFeature = { properties?: Record<string, unknown> | null };

/** The slice of a MapLibre map the cursor needs. */
export type HoverMap = {
  on(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  off(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  isMoving(): boolean;
  getZoom(): number;
  getLayer(id: string): unknown;
  queryRenderedFeatures(point: [number, number], options: { layers: string[] }): HoverFeature[];
  getCanvas(): { style: { cursor: string } };
};

/** Mirrors onClick's tier-0 guard: past z5 a click on the country wash is
    discarded, so the country must not advertise a pointer there either. */
export function hoverIsClickable(features: readonly HoverFeature[], zoom: number): boolean {
  return features.some((feature) => {
    const tier = feature.properties?.tier;
    return (typeof tier === "number" ? tier : 0) > 0 || zoom <= 5;
  });
}

/** Installs the listener; returns its disposer. `layers` is read per frame,
    so it follows the mounted shards without re-installing. */
export function installHoverCursor(
  map: HoverMap,
  opts: {
    layers: () => readonly string[];
    raf?: (cb: () => void) => number;
    cancelRaf?: (handle: number) => void;
  },
): () => void {
  const raf = opts.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((handle: number) => cancelAnimationFrame(handle));
  let frame: number | null = null;
  let point: HoverPoint | null = null;
  const update = () => {
    frame = null;
    if (!point || map.isMoving()) return;
    let clickable = false;
    try {
      const layers = opts.layers().filter((id) => map.getLayer(id));
      clickable =
        layers.length > 0 &&
        hoverIsClickable(map.queryRenderedFeatures([point.x, point.y], { layers }), map.getZoom());
    } catch {
      // Style mid-rebuild: no pointer this frame.
    }
    map.getCanvas().style.cursor = clickable ? "pointer" : "";
  };
  const onMove = (e: { point: HoverPoint }) => {
    point = e.point;
    if (frame === null) frame = raf(update);
  };
  map.on("mousemove", onMove);
  return () => {
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.off("mousemove", onMove);
  };
}
```

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/lib/wine-map/hover-cursor.test.ts`
Expected: PASS, 6 passed.

- [ ] **Step 4: Write the failing wiring guard**

Create `src/app/knowledge/map/tile-wine-map-engine.test.ts`:

```ts
// Phase 1c moved the region shards out of react-map-gl JSX into
// ShardController (src/lib/wine-map/shard-controller.ts): <Source>/<Layer> go
// through map.addSource/addLayer, which validate by serializing the whole
// style on every call — the first-zoom freeze this work removed. Nothing else
// catches that path coming back (the map has no DOM test), so this pins it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CODE = readFileSync(
  path.join(process.cwd(), "src/app/knowledge/map/tile-wine-map.tsx"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("tile-wine-map.tsx engine wiring", () => {
  it("mounts no region shard through react-map-gl; ShardController does", () => {
    expect(CODE).not.toMatch(/id=\{shardSourceId\(/);
    expect(CODE).not.toMatch(/id=\{`shard-/);
    expect(CODE).toMatch(/new ShardController\(/);
  });

  it("resumes the controller from the style.load listener", () => {
    expect(CODE).toMatch(/\.onStyleRebuilt\(\)/);
  });

  it("sets the cursor from installHoverCursor, not a hover prop", () => {
    // Any hover prop makes react-map-gl query every interactive layer on every
    // mousemove, mid-pan included.
    expect(CODE).not.toMatch(/\bonMouse(?:Move|Enter|Leave)=/);
    expect(CODE).toMatch(/installHoverCursor\(/);
  });

  it("leaves mount pacing to the controller's frame budget", () => {
    expect(CODE).not.toMatch(/\bnextMountStep\b/);
  });
});
```

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/app/knowledge/map/tile-wine-map-engine.test.ts`
Expected: FAIL — the first three cases fail (`AssertionError: expected '"use client";…' not to match /id=\{shardSourceId\(/`, then `… to match /\.onStyleRebuilt\(\)/` and `… not to match /\bonMouse(?:Move|Enter|Leave)=/`); the fourth fails too while Task 3's `nextMountStep` import is still in the file (checked against base cd9acd5, which has no `nextMountStep`: 3 failed, 1 passed).

- [ ] **Step 5: Imports and refs in `tile-wine-map.tsx`**

Add these imports next to the other `@/lib/wine-map/*` imports:

```ts
import { installHoverCursor } from "@/lib/wine-map/hover-cursor";
import { ShardController, type ShardDesired } from "@/lib/wine-map/shard-controller";
```

Delete the import line Task 3 added (`nextMountStep` is its only name, and Step 6 removes its only caller):

```ts
import { nextMountStep } from "@/lib/wine-map/mount-policy";
```

Replace the `@/lib/wine-map/shard-specs` import as Task 11 left it

```ts
import {
  AREA_PALETTE_ZOOM,
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  shardColorsFor,
  shardFilter,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
  type ColorExpression,
} from "@/lib/wine-map/shard-specs";
```

with the list below. `shardColorsFor`, `shardFilter` and `type ColorExpression` go (their only users were Task 2's per-shard colour memos, Task 11's `shardPaintTable` and its per-shard paint and filter memos, all deleted in Step 10; `shardLayerSpecs` builds the colour and filter now), and the ring builders and the inputs type come in:

```ts
import {
  AREA_PALETTE_ZOOM,
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  selectionCasingPaint,
  selectionRingPaint,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  worldRegionColor,
  type ShardSpecInputs,
} from "@/lib/wine-map/shard-specs";
```

(If Task 11 kept another name in that import that the file still uses, keep it too: Step 12's `tsc` names a missing one and `eslint` an unused one.)

Replace (base line 553)

```ts
  const mapRef = useRef<MapRef>(null);
```

with

```ts
  const mapRef = useRef<MapRef>(null);
  // Mounts and unmounts the region shards (Phase 1c). Created in onLoad for
  // that map instance (recreated by an effect after a Fast Refresh), disposed
  // on unmount.
  const controllerRef = useRef<ShardController | null>(null);
  // Removes the hover cursor's mousemove listener; installed alongside.
  const disposeHoverRef = useRef<(() => void) | null>(null);
```

- [ ] **Step 6: Mount target straight to state; remove Task 3's stagger**

The controller paces the adds now (an 8 ms budget per frame), so everything Task 3 (1a Task 3 Step 5) added to this file goes, and `mountedShards` is the mount target again, exactly as at base. Three replacements.

(a) The per-frame constant. Replace

```tsx
const SHARD_MIN_ZOOM = 5;

// How many shards may START mounting in one animation frame. Each mount is a
// <Source> plus its layers, and every MapLibre addLayer validates by
// serializing the whole style, so the first zoom past z5 — 36-67 shards in one
// commit — was a single 1.2-1.5 s frozen task. Three per frame keeps each
// frame's batch short (worst measured 16 ms with per-shard colours) while the
// full set still lands within a fraction of a second.
const MOUNTS_PER_FRAME = 3;

// MapLibre keeps 500 tiles by default
```

with

```tsx
const SHARD_MIN_ZOOM = 5;

// MapLibre keeps 500 tiles by default
```

(b) The stagger state: the "Staggered: …" paragraph, the four refs (`mountTargetRef`, `mountFirstRef`, `renderedShardsRef`, `mountFrameRef`), `advanceMounts` and the unmount-cancel effect. Replace

```tsx
  // Hysteresis: mount at 50% padding, unmount only once past 150%, so panning
  // never thrashes sources.
  //
  // Staggered: syncMountedShards decides the TARGET set in one go, and the
  // rendered set, mountedShards, walks toward it — removals at once, at most
  // MOUNTS_PER_FRAME new shards per animation frame, the selected shard first
  // (nextMountStep). The first step runs synchronously, so a small change
  // (a selection, a pan that adds one or two shards) lands exactly as before.
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // The last target, and the shard to mount ahead of the rest.
  const mountTargetRef = useRef<string[]>([]);
  const mountFirstRef = useRef<string | null>(null);
  // Mirror of the last mountedShards this component set. Each step is computed
  // from it rather than inside a setState updater, whose result a frame
  // callback cannot read back to decide whether another frame is needed.
  const renderedShardsRef = useRef<string[]>([]);
  const mountFrameRef = useRef<number | null>(null);
  const advanceMounts = useCallback(() => {
    if (mountFrameRef.current !== null) {
      window.cancelAnimationFrame(mountFrameRef.current);
      mountFrameRef.current = null;
    }
    const step = () => {
      mountFrameRef.current = null;
      const next = nextMountStep(renderedShardsRef.current, mountTargetRef.current, {
        maxAdds: MOUNTS_PER_FRAME,
        first: mountFirstRef.current,
      });
      if (next !== renderedShardsRef.current) {
        renderedShardsRef.current = next;
        setMountedShards(next);
      }
      // Every step keeps only target shards, so equal length means arrived.
      if (next.length < mountTargetRef.current.length) {
        mountFrameRef.current = window.requestAnimationFrame(step);
      }
    };
    step();
  }, []);
  useEffect(
    () => () => {
      if (mountFrameRef.current !== null) window.cancelAnimationFrame(mountFrameRef.current);
    },
    [],
  );
  // Which country owns the view: the one whose shards cover most of the
```

with

```tsx
  // Hysteresis: mount at 50% padding, unmount only once past 150%, so panning
  // never thrashes sources.
  //
  // This is the mount TARGET, set in one go. ShardController
  // (lib/wine-map/shard-controller) adds the shards themselves, a few per
  // animation frame within its 8 ms budget, so nothing here staggers.
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // Which country owns the view: the one whose shards cover most of the
```

(c) The tail of `syncMountedShards`, including the "Hysteresis reads the previous TARGET" comment and `advanceMounts` in the dependency list. Replace

```tsx
    const zoom = map.getZoom();
    // Hysteresis reads the previous TARGET, not what has rendered so far: a
    // shard still queued for a later frame already won its place at the 50%
    // pad, and keeps it until past 150% exactly as a mounted one would.
    const prevSet = new Set(mountTargetRef.current);
    mountTargetRef.current = shardEntries
      .filter(
        ([key, shard]) =>
          key === selectedShard ||
          (zoom >= SHARD_MIN_ZOOM &&
            (hit(shard.bbox, 0.5) ||
              (prevSet.has(key) && hit(shard.bbox, 1.5)))),
      )
      .map(([key]) => key);
    mountFirstRef.current = selectedShard;
    advanceMounts();
  }, [shardEntries, selectedShard, shardCountries, advanceMounts]);
```

with the base code, byte for byte (Phase 2's Task 18 anchors on exactly this text, from `const hit = …` down):

```tsx
    const zoom = map.getZoom();
    setMountedShards((prev) => {
      const prevSet = new Set(prev);
      const next = shardEntries
        .filter(
          ([key, shard]) =>
            key === selectedShard ||
            (zoom >= SHARD_MIN_ZOOM &&
              (hit(shard.bbox, 0.5) ||
                (prevSet.has(key) && hit(shard.bbox, 1.5)))),
        )
        .map(([key]) => key);
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
  }, [shardEntries, selectedShard, shardCountries]);
```

Check: `git grep -n -E "MOUNTS_PER_FRAME|mountTargetRef|mountFirstRef|renderedShardsRef|mountFrameRef|advanceMounts|nextMountStep" -- src/app/knowledge/map/tile-wine-map.tsx` prints nothing. (`nextMountStep` stays exported and tested in `mount-policy.ts`; nothing calls it any more.)

- [ ] **Step 7: Readiness asks the controller**

In `recomputeReady`, inside the probe's `try` (Task 12), replace

```ts
          added = Boolean(map.getSource(id));
```

with

```ts
          // Added means the controller added the source AND all three layers:
          // a shard still queued behind the frame budget, or one that failed
          // and was rolled back, is never ready, so its world copy keeps drawing.
          added = controllerRef.current?.isAdded(key) ?? false;
```

The next line, `loaded = added && map.isSourceLoaded(id);`, stays as it is, and so do the `catch` and `inView`. Readiness is re-read on the shard's own events: the base `onSourceData={handleSourceData}` prop schedules a pass for every `wine-shard-*` source, whoever added it.

- [ ] **Step 8: Feed the controller**

Insert immediately before `const attribution = useMemo(` (base line 1248; after `noFills`, `rampedRegions`, `palette`, `selectedShard` and `shardEntries` are all declared):

```ts
  // Phase 1c: the region shards are mounted by ShardController with
  // {validate:false} instead of <Source>/<Layer> JSX, whose map.addSource/
  // addLayer serialize the whole style on every call (the first-zoom freeze).
  // React only describes what should be mounted and from which inputs; the
  // controller diffs that against the map on the next frame and rewrites
  // paint or filters only for shards whose inputs changed — a landed theme,
  // a ramp latch, the tree arriving with countries and area slugs.
  //
  // Subregion depth, one country at a time: a shard outside the focus country
  // renders only its regions (tier <= 1), so neighbours stay on the map as
  // context instead of every country exploding into subregions at once. The
  // rule is that country's wm_deep_<country> flag, read by each of its shards'
  // filters (shardFilter, from `country` below); a shard whose country the
  // tree does not name is left at full depth rather than blanked. So a
  // shard's filters change only when the tree lands, and a focus change is
  // one global-state write that reloads just the two countries' shards.
  const shardUrls = useMemo(
    () => Object.fromEntries(shardEntries.map(([key, shard]) => [key, shard.url])),
    [shardEntries],
  );
  const shardDesired = useMemo<ShardDesired>(
    () => ({
      keys: mountedShards,
      urls: shardUrls,
      selectedShard,
      palette,
      inputs: (key: string): ShardSpecInputs => ({
        // Own properties only: a shard key never reads a country or a slug
        // list off the object prototype.
        country: Object.prototype.hasOwnProperty.call(shardCountries, key)
          ? shardCountries[key]
          : null,
        areaSlugs: Object.prototype.hasOwnProperty.call(areaSlugsByShard, key)
          ? areaSlugsByShard[key]
          : [],
        ramp: rampedRegions.includes(key),
        palette,
        fillsVisible: !noFills,
      }),
    }),
    [mountedShards, shardUrls, selectedShard, palette, shardCountries, areaSlugsByShard, rampedRegions, noFills],
  );
  // onLoad reads this: the effect below may run before the map exists.
  const shardDesiredRef = useRef(shardDesired);
  useEffect(() => {
    shardDesiredRef.current = shardDesired;
    controllerRef.current?.setDesired(shardDesired);
  }, [shardDesired]);

  // Clicks (react-map-gl's interactiveLayerIds) and the hover cursor query the
  // same layers: this is the list Task 11 left on the prop, moved here so the
  // cursor can read it too. Ids of shards the controller has not added yet
  // are harmless: both filter the list through map.getLayer first.
  const interactiveLayerIds = useMemo(
    () => [
      ...(noFills
        ? [
            "world-outlines",
            "world-region-outlines",
            ...mountedShards.map((key) => `shard-outlines-${key}`),
          ]
        : [
            "world-fills",
            "world-region-fills",
            ...mountedShards.map((key) => `shard-fills-${key}`),
          ]),
      "world-labels",
      ...mountedShards.map((key) => `shard-labels-${key}`),
      // The selected place's own label: its ordinary copy loses to it by
      // collision, so this is what a click on that name lands on.
      "world-selected-label",
      ...(selectedShard ? [`shard-selected-label-${selectedShard}`] : []),
    ],
    [mountedShards, noFills, selectedShard],
  );
  const interactiveLayerIdsRef = useRef(interactiveLayerIds);
  useEffect(() => {
    interactiveLayerIdsRef.current = interactiveLayerIds;
  }, [interactiveLayerIds]);
  useEffect(() => {
    // onLoad creates the controller and the hover listener. But Fast Refresh
    // (dev) cleans up and re-runs every effect while the MapLibre instance
    // survives, and onLoad never fires again, so without this the shards
    // would stop following the view and the cursor would freeze until a
    // reload — the same reason the state sync above is recreated. A new
    // controller adopts the shards already on the map: it reads what is
    // mounted from the map, never from its own bookkeeping.
    const map = mapRef.current?.getMap();
    if (map && mapReadyRef.current) {
      if (!controllerRef.current) {
        controllerRef.current = new ShardController(map);
        controllerRef.current.setDesired(shardDesiredRef.current);
      }
      if (!disposeHoverRef.current) {
        disposeHoverRef.current = installHoverCursor(map, {
          layers: () => interactiveLayerIdsRef.current,
        });
      }
    }
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      disposeHoverRef.current?.();
      disposeHoverRef.current = null;
    };
  }, []);
```

(On first mount the map has not loaded, so the setup half does nothing and `onLoad` (Step 11) creates both. Under Fast Refresh React runs every cleanup, then every setup in order: the two ref-refreshing effects above run first, so the recreated controller starts from the current desired state. This mirrors Task 11's recreate effect for `MapStateSync`.)

Then delete the effect Task 11 (Step 10) put right after its `useLayoutEffect`. It runs in the commit that changes `mountedShards`, a frame before the controller adds the new sources, so its `apply()` can only find them missing; `MapStateSync`'s own `sourcedata` metadata listener is what gives a controller-added shard its selection flags. Delete exactly:

```tsx
  // A shard that just mounted has no selection flags yet (its source did not
  // exist at the last apply); a no-op when nothing is missing.
  useEffect(() => {
    stateSyncRef.current?.apply();
  }, [mountedShards]);
```

- [ ] **Step 9: One ring paint for world and shard**

Replace the last two memos of Task 11's Step 8 block (the same text as base lines 1238-1246; Task 11 re-emitted them unchanged)

```ts
  // The selection ring and the keyline casing under it, world and shard alike.
  const selectedCasingPaint = useMemo(
    () => ({ "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 }),
    [palette],
  );
  const selectedRingPaint = useMemo(
    () => ({ "line-color": palette.selectedRing, "line-width": 2.5 }),
    [palette],
  );
```

with

```ts
  // The world ring and keyline casing; the shard overlays are built from the
  // same two builders (shardOverlaySpecs), so both archives ring alike.
  const selectedCasingPaint = useMemo(() => selectionCasingPaint(palette), [palette]);
  const selectedRingPaint = useMemo(() => selectionRingPaint(palette), [palette]);
```

- [ ] **Step 10: Remove the shard JSX and the hover prop; use the memoised layer ids**

1. Delete Task 11's shard block inside `<Map>` (Step 13): everything from the line `        {shardEntries`, directly after the world `        </Source>`, through the line `        ))}` directly before `      </Map>`. It starts

```tsx
        {shardEntries
          .filter(([key]) => mountedSet.has(key))
          .map(([key, shard]) => (
```

and ends

```tsx
          </Source>
        ))}
```

The world `<Source>` and its layers stay.

2. Delete what only that block read.
   - The `mountedSet` memo (base line 781):

```tsx
  const mountedSet = useMemo(() => new Set(mountedShards), [mountedShards]);
```

   - The module-level helper Task 11 (Step 6) added after `SELECTED_LABEL_LAYOUT`, with its comment and the blank line before it:

```tsx

// One static fill/outline pair per shard, from a shardColorsFor table (whose
// `ramp` it shares). Object.fromEntries, not assignment: a shard key is an own
// entry here whatever it is called.
function shardPaintTable(
  colors: Readonly<Record<string, ColorExpression>>,
  ramp: boolean,
): Record<string, { fill: FillPaint; outline: LinePaint }> {
  return Object.fromEntries(
    Object.entries(colors).map(([key, color]) => [
      key,
      {
        fill: staticFillPaint({ color, ramp, worldHandoff: false }) as FillPaint,
        outline: staticOutlinePaint({ color, worldHandoff: false }) as LinePaint,
      },
    ]),
  );
}
```

   - Task 2's per-shard colour memos (1a Task 2 Step 5), from their comment through `rampedSet`, and the blank line after `rampedSet`. `rampedSet` has no other reader: the legend reads `rampedRegions`.

```tsx
  // One colour expression per shard, from that shard's own region and area
  // slugs (lib/wine-map/shard-specs) — ~2 KB each instead of one ~38 KB
  // catalogue-wide expression on every layer, which MapLibre re-serialized
  // with the whole style on every addLayer (the first-zoom freeze). Keyed on
  // the tree's slug lists (change once, when the tree loads), the ramp latch
  // (at most once per region per session) and the landed theme (a rare,
  // user-initiated flip) — never on the viewport. Split by ramp so a region
  // joining the latch rebuilds only its own expression; every other shard
  // keeps the same object, which react-map-gl's paint diff skips on identity.
  const plainShardColors = useMemo(
    () =>
      shardColorsFor({
        keys: shardEntries.map(([key]) => key),
        slugsByShard: areaSlugsByShard,
        ramp: false,
        palette,
      }),
    [shardEntries, areaSlugsByShard, palette],
  );
  const rampedShardColors = useMemo(
    () =>
      shardColorsFor({
        keys: rampedRegions,
        slugsByShard: areaSlugsByShard,
        ramp: true,
        palette,
      }),
    [rampedRegions, areaSlugsByShard, palette],
  );
  const rampedSet = useMemo(() => new Set(rampedRegions), [rampedRegions]);
```

   - The head of Task 11's Step 8 block and its three per-shard paint tables. Replace

```tsx
  // Static paint (lib/wine-map/shard-specs). Nothing here moves with the
  // selection any more: the selected place, its children and its relatives are
  // feature-state, and "something is selected" is the wm_has_sel global — all
  // written by MapStateSync. So these re-key only on what shapes a colour: the
  // landed theme, the catalogue's area slugs (once, when the tree lands) and
  // the ramp latch (at most once per region per session).
  //
  // One fill/outline pair per shard, from the two colour tables above. The
  // plain table rebuilds only when the tree lands or the theme flips; a region
  // joining the ramp latch rebuilds only the ramped one, so every other shard
  // keeps the very same paint objects and react-map-gl's paint diff skips them
  // on identity.
  const plainShardPaints = useMemo(
    () => shardPaintTable(plainShardColors, false),
    [plainShardColors],
  );
  const rampedShardPaints = useMemo(
    () => shardPaintTable(rampedShardColors, true),
    [rampedShardColors],
  );
  const shardPaints = useMemo(
    () =>
      Object.fromEntries(
        shardEntries.map(([key]) => [
          key,
          rampedSet.has(key) ? rampedShardPaints[key] : plainShardPaints[key],
        ]),
      ),
    [shardEntries, rampedSet, rampedShardPaints, plainShardPaints],
  );
```

   with

```tsx
  // Static paint (lib/wine-map/shard-specs). Nothing here moves with the
  // selection any more: the selected place, its children and its relatives are
  // feature-state, and "something is selected" is the wm_has_sel global — all
  // written by MapStateSync. The world layers' paint below re-keys only on the
  // landed theme. The region shards' paint (their area slugs, the ramp latch)
  // is built by ShardController from the same builders; see shardDesired.
```

   - From the same block, the two shard label memos (the comment above `shardLabelPaint`, "Label paint: the selected / related / distant weights …", stays: it now heads `worldLabelPaint`):

```tsx
  const shardLabelPaint = useMemo(
    () => staticLabelPaint({ palette, worldHandoff: false }) as SymbolPaint,
    [palette],
  );
```

```tsx
  const shardSelectedLabelPaint = useMemo(
    () => selectedLabelPaint({ palette, worldHandoff: false }) as SymbolPaint,
    [palette],
  );
```

   - Task 11's whole Step 9 block: everything from the line `  // World layers carry the country (tier 0) and every region. A region whose` down to and including the `shardFilters` memo, which ends

```tsx
          shardFilter(
            Object.prototype.hasOwnProperty.call(shardCountries, key)
              ? shardCountries[key]
              : null,
          ) as unknown as boolean,
        ]),
      ),
    [shardEntries, shardCountries],
  );
```

     The controller builds each shard's filter from `shardCountries` now (`shardDesired`'s `inputs`, with the same own-property guard). The depth half of that comment moved into `shardDesired`'s comment (Step 8); the world half is already said by the module-level `WORLD_COUNTRY_FILTER`/`WORLD_REGION_FILTER` comments and the world JSX comments.

   Everything the world layers read stays: `regionColor`, `worldRegionFillPaint`, `worldRegionOutlinePaint`, `worldLabelPaint`, `worldSelectedLabelPaint`, `selectedCasingPaint`, `selectedRingPaint`, the `FillPaint`/`LinePaint`/`SymbolPaint`/`SymbolLayout` types and the `WORLD_*`/`GRAPE_GATE`/`SELECTED_*`/`LABEL_LAYOUT`/`LAYER_*` constants; so does `NO_SLUGS_BY_SHARD` (the `areaSlugsByShard` prop's default). Check: `git grep -n -E "mountedSet|shardPaintTable|plainShardColors|rampedShardColors|rampedSet|plainShardPaints|rampedShardPaints|shardPaints|shardFilters|shardLabelPaint|shardSelectedLabelPaint|shardColorsFor|ColorExpression" -- src/app/knowledge/map/tile-wine-map.tsx` prints nothing.

3. Replace the `interactiveLayerIds` prop's array literal as Task 11 (Step 12) left it — the long comment above the prop stays —

```tsx
        interactiveLayerIds={[
          ...(noFills
            ? [
                "world-outlines",
                "world-region-outlines",
                ...mountedShards.map((key) => `shard-outlines-${key}`),
              ]
            : [
                "world-fills",
                "world-region-fills",
                ...mountedShards.map((key) => `shard-fills-${key}`),
              ]),
          "world-labels",
          ...mountedShards.map((key) => `shard-labels-${key}`),
          // The selected place's own label: its ordinary copy loses to it by
          // collision, so this is what a click on that name lands on.
          "world-selected-label",
          ...(selectedShard ? [`shard-selected-label-${selectedShard}`] : []),
        ]}
```

with the memo from Step 8, which holds exactly that list:

```tsx
        interactiveLayerIds={interactiveLayerIds}
```

4. In the `world-labels` comment Task 11 (Step 13) wrote, the reason it sits below the shard labels is now the controller. Replace

```tsx
              has to sit BELOW the shard label layers. It does: the world
              Source mounts first and every shard's layers are appended above
              it when the shard mounts, so no beforeId is needed. Do not move
              this layer above the shards' labels to "give it priority"; that
              would let the invisible copy blank the visible one. */}
```

with

```tsx
              has to sit BELOW the shard label layers. It does:
              ShardController adds shards only once world-labels exists,
              always above the world layers, and moves any world layer
              react-map-gl re-creates on top back below them, in this order.
              Do not move this layer above the shards' labels to "give it
              priority"; that would let the invisible copy blank the visible
              one. */}
```

5. Delete the hover prop (base lines 1549-1560; still base code, no 1a/1b task edits it):

```tsx
        onMouseMove={(e) => {
          const map = mapRef.current;
          if (!map) return;
          // Mirror onClick's tier-0 guard. Without it the country fill made
          // most of France's surface advertise a pointer at z5-8 for a click
          // that is then deliberately discarded.
          const zoom = map.getZoom();
          const clickable = (e.features ?? []).some(
            (f) => ((f.properties as { tier?: number } | null)?.tier ?? 0) > 0 || zoom <= 5,
          );
          map.getCanvas().style.cursor = clickable ? "pointer" : "";
        }}
```

- [ ] **Step 11: Create the controller and the hover listener in `onLoad`; resume on `style.load`**

In `onLoad`, Task 11 (Step 11) left these lines right after `mapReadyRef.current = true;`:

```ts
          // The one global-state and feature-state writer. It applies what
          // React has already computed (a deep link's selection, the stored
          // language) at once, and again after every style.load.
          stateSyncRef.current?.dispose();
          stateSyncRef.current = new MapStateSync(e.target);
          stateSyncRef.current.setDesired(desiredStateRef.current);
```

Directly after the last of them, and before `          e.target.on("style.load", () => {`, insert:

```ts
          // Region shards (Phase 1c). One controller per map instance; it waits
          // for react-map-gl's world layers itself, and starts from the latest
          // desired state (the effect that feeds it may already have run).
          controllerRef.current?.dispose();
          controllerRef.current = new ShardController(e.target);
          controllerRef.current.setDesired(shardDesiredRef.current);
          // Hover cursor: at most one query per frame, none mid-gesture.
          disposeHoverRef.current?.();
          disposeHoverRef.current = installHoverCursor(e.target, {
            layers: () => interactiveLayerIdsRef.current,
          });
```

The `style.load` listener right after that is still the base code (no 1a/1b task edits it; `MapStateSync` registers its own `style.load` listener in its constructor). Replace

```ts
          e.target.on("style.load", () => {
            setPaintTheme(landingBasemapRef.current);
            setStyleEpoch((n) => n + 1);
          });
```

with

```ts
          e.target.on("style.load", () => {
            // The controller records the landed style and schedules its
            // re-add (and, after a full rebuild, its repaint) for the next
            // frame. MapStateSync's own style.load listener was registered
            // earlier in this onLoad, so it fires first: the landed global
            // state and selection flags are already applied when those shards
            // go in. onStyleRebuilt never throws; the try is this listener's
            // rule regardless — a throw in a style.load listener turns a good
            // theme diff into MapLibre's full rebuild.
            try {
              controllerRef.current?.onStyleRebuilt();
            } catch {
              // Nothing to recover: the next setDesired runs the controller again.
            }
            setPaintTheme(landingBasemapRef.current);
            setStyleEpoch((n) => n + 1);
          });
```

The skeleton's "`onStyleRebuilt()` then `MapStateSync.apply()`" order does not arise: `MapStateSync` applies from its own, earlier listener, and the controller only schedules, so their relative order inside `style.load` changes nothing.

`e.target` is a MapLibre `Map`, which is structurally a `ControllerMap` and a `HoverMap` (checked with `tsc` in the scratch harness) — no cast.

- [ ] **Step 12: Run the tests, types and lint**

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run src/app/knowledge/map/tile-wine-map-engine.test.ts src/lib/wine-map/hover-cursor.test.ts`
Expected: PASS, 10 passed.

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx vitest run`
Expected: every file passes (the base 157 files / 3354 tests plus everything Phases 1a-1c added; no failures).

Run: `cd /c/Users/Public/repos/blindtastingapp-mapdetail && npx tsc --noEmit && npx eslint src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-engine.test.ts src/lib/wine-map/hover-cursor.ts src/lib/wine-map/hover-cursor.test.ts`
Expected: no output. Any "declared but never read" / `no-unused-vars` report is a leftover of the deleted shard JSX or stagger — delete it (Step 10.2) and re-run.

- [ ] **Step 13: Manual verification (main session, in the browser)**

Run the dev server (`npm run dev`, or the `start` config for timings), sign in, open `/knowledge/map?debugClick=1`, then check:
1. **Layer order.** In the console: `__wineMap.getLayersOrder().filter((id) => /^(world|shard)-/.test(id))` — every `world-*` id comes before every `shard-*` id, and the world ids read `world-fills, world-outlines, world-region-fills, world-region-outlines, world-selected-casing, world-selected-ring, world-labels, world-selected-label`. Select Vosne-Romanée from the tree: the last three ids are `shard-selected-casing-bourgogne`, `shard-selected-ring-bourgogne`, `shard-selected-label-bourgogne`.
2. **First zoom.** Reload at the opening view (z4.4), zoom once to ~z5.5 over France: subregions appear across France, no visible hitch; the console shows no `[wine-map]` errors, no "Style is not done loading", no "already exists".
3. **Ring stays on top.** With Vosne-Romanée selected, pan south until Beaujolais mounts: the gold ring and the bigger label stay above the newly mounted shard's fills.
4. **Selection moves.** Select Montagne de Reims (Champagne): the ring moves; `__wineMap.getLayer("shard-selected-ring-bourgogne")` is `undefined`; `__wineMap.getLayer("shard-selected-ring-champagne")` exists.
5. **Theme flip** (header theme menu) with ~10 shards mounted and a selection: shard fills, outlines, labels and the ring switch palettes together with the world layers within a frame or two; flip back — same.
6. **Local/English and grape filter** in Full view at z5.5 (40+ shards): labels switch language on every shard; picking and clearing a grape filters and restores every shard.
7. **`?debugFills=off`**: shard fills are hidden, outlines and labels draw, clicking a region still selects it.
8. **Hover**: pointer over a region at z6, no pointer over the bare country wash at z6, pointer over it at z5; while dragging, the cursor does not flicker. DevTools Performance during a 3-second pan with the mouse moving: no `queryRenderedFeatures` in the pan's frames.
9. **Forced rebuild**: with a place selected and a grape picked, run `__wineMap.style.setState = () => { throw new Error("forced") }` then flip the theme. The map rebuilds (a MapLibre "Rebuilding the style from scratch" warning is expected); afterwards every mounted shard is present and in the new palette, the ring is on the selected place, the grape filter still applies, and `__wineMap.getLayersOrder()` still has world before shard before overlays.
10. **Leave and return** to `/knowledge/map` three times through the app nav: no console errors, and shards mount again each time.
11. **The selected name is clickable.** With Vosne-Romanée selected at z12, hover its bigger label: pointer. Click it: the `[wine-map click]` log lists a feature on `shard-selected-label-bourgogne` and the selection stays Vosne-Romanée (it does not fall through to Côte de Nuits or Bourgogne). Select Bourgogne from the tree and zoom out to z6 (its world copy handed off or not): clicking the "BOURGOGNE" label still selects Bourgogne.
12. **Selection flags reach shards added later.** At the z4.4 opening view (no shard mounted) select Italia from the tree, then zoom to z6.5 over Toscana: as each region's shard takes over from its world copy, the region's own fill keeps the same wash (it is a child of the selection, flag `child`) — no region dims at the handoff; only the subregions below it are faded. Then, looking at Bourgogne at z9, select Montagne de Reims from the tree: once the Champagne shard is in, the place is ringed and its siblings' labels (Vallée de la Marne, Côte des Blancs) keep their related weight while more distant labels dim. Both rely on `MapStateSync`'s own `sourcedata` listener, now that Step 8 deleted the `apply()`-on-`mountedShards` effect.
13. **Fast Refresh** (the `dev` config only): open `/knowledge/map?debugClick=1&place=france.bourgogne.cote-de-nuits.vosne-romanee`, add a blank line to `src/app/knowledge/map/tile-wine-map.tsx` and save (remove it afterwards; never commit it). After the refresh, zoom out to z6 and pan to Italy: Italian shards mount (`__wineMap.getLayersOrder().some((id) => id === "shard-fills-toscana")` is `true`), the pointer still changes over a region, and `__wineMap.getLayersOrder().filter((id) => /^shard-(fills|outlines|labels)-/.test(id)).length` is exactly three times the number of `wine-shard-*` sources — no shard added twice by the recreated controller.
14. **A blocked archive** (DevTools → Network → block request URL pattern `*bourgogne.pmtiles*`, reload at z4.4, then zoom to Bourgogne z9): the console shows the blocked request and one `[wine-map] shard "bourgogne" could not be loaded and is skipped for this visit` line; `__wineMap.getSource("wine-shard-bourgogne")` is `undefined`; Bourgogne stays drawn by the world archive at region level (its fill, outline and "BOURGOGNE" label), with no hole; every other shard mounts and draws. Unblock and reload: Bourgogne's shard draws again.

- [ ] **Step 14: Commit**

```bash
cd /c/Users/Public/repos/blindtastingapp-mapdetail && git add src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-engine.test.ts src/lib/wine-map/hover-cursor.ts src/lib/wine-map/hover-cursor.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
perf(map): mount region shards through ShardController, throttle hover

The per-shard <Source>/<Layer> JSX is gone: TileWineMap describes the mount
set and its inputs, and ShardController adds, repaints and removes shards
with validate:false (no whole-style serialize per call), resuming after a
style rebuild from the style.load listener. The React-side mount stagger is
removed (the controller budgets frames), readiness asks controller.isAdded,
and the hover cursor moves from react-map-gl's onMouseMove (a query over
every interactive layer on every mousemove) to one rAF-throttled query that
skips moving frames, over the same memoised interactive layer list clicks
use (selected labels included). World and shard rings share one paint
builder.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 17: Phase 1c verification and production deploy (main session)

Run by the main session only (browser + push), never by an implementer subagent. Nothing is written to the repository in this task except, on failure, the revert.

**Files:** none modified (on failure only: a `git revert` of this phase's commits).

**Interfaces:**
- Consumes: the Phase 1c commits of Tasks 14-16 on `map-detail-modes`; the `?debugPerf=1` probe (Task 5) and its seven rows — row 2 "First zoom to z5.5", row 5 "Select Vosne-Romanée" (the visit's FIRST selection: it flips `wm_has_sel` and reloads every mounted source, accepted in spec §5.2), row 6 "Select Gevrey-Chambertin" (a LATER selection, where A2 is read), row 7 "Zoom out to z4.4"; `window.__wineMap` (`?debugClick=1`); Task 6's `master` baseline screenshots (A3); Task 13's Phase 1b probe medians and screenshots.
- Produces: a results record for this phase (gates, probe medians per row at both sizes, the row 5 and row 6 details, A2 lists, screenshots, failure-injection notes) kept in the session's scratchpad and summarised to the owner; a fast-forwarded `origin/master`.

- [ ] **Step 1: Gates (A4)**

Run in `C:\Users\Public\repos\blindtastingapp-mapdetail`:
- `npx vitest run` — expected: every file passes (157 files / 3354 tests at base, plus Phases 1a and 1b, plus this phase's `shard-layer-specs`, `shard-controller`, `hover-cursor`, `tile-wine-map-engine` and the 5 new `maplibre-internals` cases).
- `npx tsc --noEmit` — expected: no output.
- `npx eslint src/lib/wine-map/shard-specs.ts src/lib/wine-map/shard-layer-specs.test.ts src/lib/wine-map/shard-controller.ts src/lib/wine-map/shard-controller.test.ts src/lib/wine-map/maplibre-internals.test.ts src/lib/wine-map/hover-cursor.ts src/lib/wine-map/hover-cursor.test.ts src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-engine.test.ts` — expected: no problems.
- `npm run build` — expected: `next build` completes with no type or lint error.

- [ ] **Step 2: Production run**

As Task 13 Step 2: start the `start` launch config (after Step 1's build) and open `/knowledge/map` at 1440x900 with a signed-in session minted as CLAUDE.md describes (`auth.admin.generateLink` magiclink + `verifyOtp` → `/auth/confirm-hash?next=/knowledge/map#access_token=…`; demo accounts only, never a typed password). Keep the console open for the whole task.

- [ ] **Step 3: Behaviour checklist**

In light and then in dark: Task 16 Step 13 items 1-12 and 14 (item 13 is dev-only; run it once on the `dev` config if this session has not), then Task 11 Step 16 items 1-8 and Task 12 Step 7, which must all still hold now that the controller mounts the shards. Expected: no console error at any point other than the blocked request in item 14.

- [ ] **Step 4: Perf protocol (A1), selections first and later (G1, A2)**

With `?debugPerf=1`, three cold runs of Run test (a fresh tab each) at the 1440x900 layout (455x628 map canvas), then three in full view (the map's expand button, ~1400x850 canvas). Record the median per row at each size and compare with Task 13's Phase 1b medians. Expected at BOTH sizes:
- Row 2 "First zoom to z5.5" (36-44 shards mount at 455x628, 66-67 in full view): longest task ≤ 50 ms and no frame > 100 ms. This is the owner's original freeze (spec §1: a 1.2-1.5 s task); spec §1's replay put all 67 shards with `validate:false` and small expressions at 13 ms.
- Row 7 "Zoom out to z4.4": no long task — the ~110 ms unmount task (react-maplibre's `getStyle()` per `<Source>`) is gone.
- Rows 3 and 4: no long task.
- Row 5, the visit's first selection: record `worst`, `over50` and `longTasks`; G1's "a tree selection has no long task" is judged on this row too. Its `reloadedSources` lists every mounted source (the one-off `wm_has_sel` recompile) and is recorded, not judged by A2.
- Row 6, a later selection (A2): `reloadsCounted` is `true`, `reloadedSources` is exactly `wine-shard-bourgogne` and `wine-world`, and no long task.
- Every row equal to or better than Task 13's median for it.
Once, by hand, record the first zoom z4.4 → z5.5 at 455x628 in DevTools Performance: the shard adds show up as `ShardController` frames (`run` → `addShard` → `Style.addSource`/`addLayer`), none longer than ~10 ms, and no `serialize` or `_validate` under `addLayer`. Then the cross-shard A2 case, Task 11 Step 16 item 9 (select a Champagne village after Vosne-Romanée): expected exactly `wine-shard-bourgogne`, `wine-shard-champagne`, `wine-world`.

- [ ] **Step 5: Theme flip while shards are still mounting (Review Focus)**

Fresh `/knowledge/map?debugClick=1` at z4.4 in light. Select Vosne-Romanée from the tree, zoom out to z4.4 again, then zoom to z5.5 over France with the scroll wheel and flip to dark from the header theme menu within the first half second, while shards are still being added (`__wineMap.getLayersOrder().filter((id) => id.startsWith("shard-fills-")).length` is still climbing if you read it twice). After the map settles:
- `["alsace", "sud-ouest"].map((k) => JSON.stringify(__wineMap.getPaintProperty("shard-fills-" + k, "fill-color")).toLowerCase())` — Alsace (added first) contains `#8398dc` and not `#44548c`; Sud-Ouest (added last) contains `#e49c50` and not `#b0722c` (the dark and light region hues in `map-palette.ts`, which each shard's colour expression carries as its tint ramp's fallback);
- `__wineMap.getPaintProperty("shard-selected-ring-bourgogne", "line-color")` is `"#D4AF6A"` (the dark ring);
- the world layers repainted with them (no light-palette region anywhere), and no console error.
Flip back to light the same way while zooming z4.4 → z5.5 again: the light hexes, and the ring `"#B78E42"`.

- [ ] **Step 6: Screenshots (A3)**

Light and dark, the same framing as Task 6's `master` baseline and Task 13's set: France z5.5, Bourgogne z9, Bourgogne z13 with a climat selected, Alsace/Baden z9, Mosel z12, Champagne z10, Toscana z8, Baden z6. Expected: identical to Task 13's Phase 1b screenshots (1c changes no pixel), and so to the baseline except D4.

- [ ] **Step 7: Failure injection**

- Block `get_wine_place_tree` (DevTools request blocking on `rpc/get_wine_place_tree`), reload with `?debugClick=1&place=france.bourgogne.cote-de-nuits.vosne-romanee`: shards mount (the controller adds them with `country: null`, full depth) in region colours; the place is ringed; the tree card offers Retry. Retry: the tree lands, and the shards' filters and colours update without any shard being re-added (`__wineMap.getSource("wine-shard-bourgogne")` is the same object before and after: keep a reference in the console and compare with `===`).
- Block `bourgogne.pmtiles` (Task 16 Step 13 item 14): Bourgogne stays drawn by the world archive at region level, no hole, one `[wine-map] shard "bourgogne" could not be loaded…` line, every other shard fine.
- Forced rebuild (Task 16 Step 13 item 9) with 40+ shards mounted and a grape picked: after the rebuild every mounted shard is back, in the landed palette, the grape filter applies, and world layers are below shard layers, overlays on top.

- [ ] **Step 8: Deploy**

Exactly as Task 13 Step 7: never touch `C:\Users\Public\repos\blindtastingapp`; record the commit Phase 1c sits on (Phase 1b's deployed head) in the results record for Step 9's revert, check the fast-forward, then push the branch head to `origin/master`:
```bash
git -C C:/Users/Public/repos/blindtastingapp-mapdetail fetch origin
git -C C:/Users/Public/repos/blindtastingapp-mapdetail rev-parse origin/master
git -C C:/Users/Public/repos/blindtastingapp-mapdetail merge-base --is-ancestor origin/master HEAD && echo fast-forward-ok
git -C C:/Users/Public/repos/blindtastingapp-mapdetail push origin HEAD:master
```
Expected: a hash (record it as the Phase 1c base), `fast-forward-ok`, then a plain push (never `--force`). If the check prints nothing, stop and ask the owner. Then wait for the Vercel production deployment of that commit: `gh api "repos/{owner}/{repo}/commits/$(git -C C:/Users/Public/repos/blindtastingapp-mapdetail rev-parse HEAD)/status" --jq .state` prints `success`.

- [ ] **Step 9: Live smoke test (A5)**

On `https://blindrapp.vercel.app/knowledge/map?debugPerf=1` with a minted demo session: the map loads; Run test's row 2 (first zoom) has no long task and row 6 reloads only `wine-shard-bourgogne` and `wine-world`; `?place=france.bourgogne.cote-de-nuits.vosne-romanee` rings its place with the ring on top of every shard; no new console errors.

On any failure, revert the whole phase in one commit, with `BASE` set to the Phase 1c base hash recorded in Step 8:
```bash
git -C C:/Users/Public/repos/blindtastingapp-mapdetail revert --no-commit "$BASE..HEAD"
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git -C C:/Users/Public/repos/blindtastingapp-mapdetail commit -m "revert(map): Phase 1c imperative shard controller" -m "The live A5 smoke test failed after the Phase 1c deploy; the phase is reverted whole." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C C:/Users/Public/repos/blindtastingapp-mapdetail push origin HEAD:master
```
Then tell the owner which A5 check failed, with its console output.

---

## Phase 2 — One country | All countries (Tasks 18-24) and CLAUDE.md (Task 25)

**Conventions for every task below.**

- Run every command in Git Bash from the worktree root: `cd /c/Users/Public/repos/blindtastingapp-mapdetail`. Never touch `C:\Users\Public\repos\blindtastingapp`.
- `COMMIT_ID` below means exactly this prefix: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com`. Write it out in full in the command. Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Add only the files the task names; never run `git add -A`.
- New modules under `src/lib/wine-map/` import each other with RELATIVE paths (`./shard-specs`, `../safe-storage`), never `@/`: vitest runs in `node` with no path alias (see the note in `place-cache.ts`). They take maplibre types only, never values.
- vitest runs in `environment: "node"`, with no jsdom and no Testing Library. So every rule is a pure function with a test, and components get a manual browser check, which the main session runs.

**Phase 1 state these tasks assume.** They are the names the skeleton's contracts and task notes give. If a Phase 1 task landed a different local name, change the anchor to match. Keep the logic.

- `src/lib/wine-map/shard-specs.ts` exports `type Bbox` (Task 1) and `shardFilter(country)` (Task 10). `tile-wine-map.tsx` already has one value import `from "@/lib/wine-map/shard-specs"` (Tasks 2, 11 and 16 add names to it); Phase 2 adds names to that same import and never opens a second one.
- `src/lib/wine-map/map-state.ts` exports `desiredGlobalState` (Task 7).
- `src/lib/wine-map/mount-policy.ts` exists with `nextMountStep` (Task 3). Its test file is `mount-policy.test.ts`. After Task 16, `tile-wine-map.tsx` has NO import from `mount-policy` (Task 16 Step 5 deleted the `nextMountStep` import line).
- `src/app/knowledge/map/tile-wine-map.tsx` after Task 16:
  - `syncMountedShards` still holds the base `cd9acd5` share-grid code, the base `hit` helper and its "Below SHARD_MIN_ZOOM …" comment. Its tail is Task 16 Step 6's text: `const zoom = map.getZoom();`, then the two-line comment `// The target goes straight to state: ShardController paces the adds` / `// itself (an 8 ms budget per frame), so the React side no longer staggers.`, then the base `setMountedShards((prev) => { … })` filter. Its dependency line is `  }, [shardEntries, selectedShard, shardCountries]);`.
  - The only non-comment use of `SHARD_MIN_ZOOM` in the file is that filter (the Phase 1 drafts mention it only in comments).
  - `focusCountry` is still the base `useMemo`.
  - `mapReadyRef`, `pendingCameraRef`, `applyCameraTarget`, `scheduleScan`, `scanView`, `selectedShard` and `shardEntries` are unchanged from base.
  - Task 11 Step 10 inserted, right after the `focusCountry` memo, `const knownCountries = useMemo(() => [...new Set(Object.values(shardCountries))].sort(), [shardCountries]);` and `const desiredGlobal = useMemo(() => desiredGlobalState({ visibleKeys, english, selectedKey, deepCountries: focusCountry ? [focusCountry] : [], knownCountries }), [visibleKeys, english, selectedKey, focusCountry, knownCountries]);`, which feeds `MapStateSync`.
- `src/app/knowledge/map/tile-wine-map-explorer.tsx` after Task 4:
  - It holds `tree: WinePlaceTreeNode[] | null` and `const [treeLoad, dispatchTree] = useReducer(treeLoadReducer, INITIAL_TREE_LOAD);`. The tree card's Retry button calls `dispatchTree({ type: "retry" })` inline; Task 4 defines no named retry handler, and Phase 2 does not add one (Task 23 dispatches inline the same way).
  - `TileWineMap` sits inside `MapErrorBoundary`.

**Skeleton updates from this phase.** Fold these into the assembled plan's Review Focus and Interface Contracts so there is one source of truth.

- Review Focus, "Tree never arrives": replace "Pinned in Task 4 (tree state reducer) and Task 12 (mount policy with empty `shardCountries`)." with "Pinned in Task 4 (tree state reducer), Task 8 (context fallback), Task 10 (`shardFilter(null)` keeps full depth) and Task 18 (`mountTarget` with empty `shardCountries`, mount-target.test.ts case 7)."
- Interface Contracts, Phase 2 modules. Replace the skeleton's `mount-policy.ts` (Phase 2 half), `focus.ts`, `camera-fit.ts`, `detail-status.ts`, `detail-mode.ts`, `country-chips.ts` and `DetailReport` entries with:

  ```ts
  // src/lib/wine-map/mount-policy.ts (Phase 2 additions; nextMountStep unchanged)
  export const SHARD_MIN_ZOOM = 5;
  export const NEIGHBOUR_MIN_ZOOM = 8;
  export type MountInput = {
    shards: readonly (readonly [string, { bbox?: Bbox }])[]; view: Bbox; zoom: number;
    selectedShard: string | null; prev: ReadonlySet<string>;
    detail: "one" | "all"; focusCountry: string | null; shardCountries: Readonly<Record<string, string>>;
  };
  export function countryOfShard(shardCountries: Readonly<Record<string, string>>, key: string): string | null;
  export function keepAcrossSync(prev: readonly string[], syncedDetail: "one" | "all", detail: "one" | "all"): ReadonlySet<string>;
  export function mountTarget(input: MountInput): string[];                      // sorted, code-unit order

  // src/lib/wine-map/focus.ts
  export const COUNTRY_FOCUS_SHARE = 0.6;
  export const COUNTRY_RELEASE_SHARE = 0.45;
  export const FOCUS_GRID = 48;
  export function countryShares(input: { shards: MountInput["shards"]; shardCountries: Readonly<Record<string, string>>; view: Bbox }):
    { shares: Record<string, number>; present: string[] };
  export function centreCountryFrom(properties: readonly (Readonly<Record<string, unknown>> | null | undefined)[],
    shardCountries: Readonly<Record<string, string>>): string | null;
  export function nextFocusCountry(input: {
    chipCountry: string | null; selectedCountry: string | null; countriesInView: readonly string[];
    centreCountry: string | null; shares: Readonly<Record<string, number>>; prev: string | null;
  }): string | null;
  export type ChipFocus = { country: string; seen: boolean };
  export function chipOnTap(prev: ChipFocus | null, country: string, countriesInView: readonly string[]): ChipFocus;
  export function chipAfterReport(prev: ChipFocus | null, countriesInView: readonly string[]): ChipFocus | null;
  export function deepCountriesFor(detail: "one" | "all", focusCountry: string | null, knownCountries: readonly string[]): string[];
  export type DetailReport = { focusCountry: string | null; depthCountries: string[]; countriesInView: string[] };

  // src/lib/wine-map/camera-fit.ts
  export const CHIP_MIN_ZOOM = 5.5;
  export type CameraRequest = { bbox: Bbox; minZoom: number; nonce: number; stayIfVisible: string | null };
  export function countryCameraBox(bboxes: readonly Bbox[]): Bbox | null;
  export function bboxesForCountry(shards: Readonly<Record<string, { bbox?: Bbox }>>,
    shardCountries: Readonly<Record<string, string>>, country: string): Bbox[];
  export function chipFlightNeeded(input: { zoom: number; countriesInView: readonly string[]; stayIfVisible: string | null }): boolean;

  // src/lib/wine-map/detail-status.ts
  export const DETAIL_WARNING = "Uses more resources and can cause lag.";
  export type DetailStatus = { text: string; retry: boolean };
  export function detailStatus(input: {
    tree: "loading" | "ready" | "failed"; detail: "one" | "all"; fellBack: boolean;
    focusName: string | null; depthVisible: boolean; otherCountriesInView: boolean;
  }): DetailStatus;

  // src/lib/wine-map/detail-mode.ts
  export type DetailMode = "one" | "all";
  export const DETAIL_ALL_KEY = "wine-map-all-countries";
  export const DETAIL_PENDING_KEY = "wine-map-all-pending";
  export type DetailSnapshot = { mode: DetailMode; fellBack: boolean };
  export function initialDetailMode(read: (key: string) => boolean): DetailSnapshot;
  export type DetailModeStore = { getSnapshot(): DetailSnapshot; subscribe(l: () => void): () => void;
    setMode(m: DetailMode): void; dropToOne(): void; armSentinel(): void; confirmHealthy(): void };
  export function createDetailModeStore(getStorage: () => StorageLike | null): DetailModeStore;
  export function allModeHealthy(input: { pending: boolean; mountedCount: number; zoom: number }): boolean;
  export function useDetailMode(): { mode: DetailMode; fellBack: boolean; setMode(m: DetailMode): void;
                                     dropToOne(): void; confirmHealthy(): void };

  // src/lib/wine-map/country-chips.ts
  export type CountryChip = { key: string; label: string; lang: string | undefined; count: number | null };
  export function countryChips(roots: readonly WinePlaceTreeNode[], opts: { english: boolean; visibleKeys: readonly string[] | null }): CountryChip[];
  export function rovingIndex(key: string, index: number, count: number, orientation: "horizontal" | "both"): number | null;
  export const CHIP_FADE_PX = 12;
  export function chipScrollLeft(input: { chipLeft: number; chipWidth: number; scrollLeft: number; viewWidth: number }): number | null;

  // TileWineMap props added in Phase 2
  detail?: "one" | "all";             // default "one"
  chipCountry?: string | null;        // default null
  cameraRequest?: CameraRequest | null;
  onDetailReport?: (report: DetailReport) => void;
  onContextLost?: () => void;
  onHealthy?: () => void;             // All countries' crash-loop all-clear
  ```
- Task 23's skeleton note gives the full-view height as `h-[calc(100dvh-7rem-4.5rem)]`. The rows as built add 5rem (Task 23 Step 4(g) shows the sum), so the class is `h-[calc(100dvh-12rem)]`.
- For the owner (known wording limitation, spec §7.1 vs §7.3): the spec derives "subregions visible" from each country's smallest tier-2 `min_zoom` in the tree, but `WinePlaceTreeNode` has no `min_zoom`. Phase 2 instead claims depth only once the idle scan has seen tier ≥ 2 features of the focus country on screen. Where the focus country's on-screen regions have no tier ≥ 2 places in the catalogue (the live release's baden, franken, navarra, saale-unstrut and wuerttemberg shards carry tier ≤ 1 only), the line keeps saying "Zoom in to see {F}'s subregions." at every zoom. The approved copy has no sentence for "none here", so the plan ships it that way and Task 24 records it for the owner.

---

### Task 18: `mountTarget` — the One/All mount rule (`mount-policy.ts`)

**Files:**
- Modify: `src/lib/wine-map/mount-policy.ts`. Add one type import at the top and append the new block at the end.
- Create: `src/lib/wine-map/mount-target.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`:
  - delete the `SHARD_MIN_ZOOM` constant (base lines 153-158);
  - add a `mount-policy` import line;
  - inside `syncMountedShards`, delete the `hit` helper and its comment (base lines 745-758) and replace the post-Task-16 tail (from `const zoom = map.getZoom();` to the `});` closing `setMountedShards`).

**Interfaces:**
- Consumes: `type Bbox` from `./shard-specs` (Task 1).
- Produces:
  ```ts
  export const SHARD_MIN_ZOOM = 5;
  export const NEIGHBOUR_MIN_ZOOM = 8;
  export type MountInput = {
    shards: readonly (readonly [string, { bbox?: Bbox }])[]; view: Bbox; zoom: number;
    selectedShard: string | null; prev: ReadonlySet<string>;
    detail: "one" | "all"; focusCountry: string | null; shardCountries: Readonly<Record<string, string>>;
  };
  export function mountTarget(input: MountInput): string[];           // sorted (code-unit order)
  export function countryOfShard(shardCountries: Readonly<Record<string, string>>, key: string): string | null; // additive
  export function keepAcrossSync(prev: readonly string[], syncedDetail: "one" | "all", detail: "one" | "all"): ReadonlySet<string>; // additive
  ```
- Review Focus: case 7 below ("an unknown country (tree not loaded) keeps today's rule") is the "Tree never arrives" pin for the mount policy.

- [ ] **Step 1: Write the failing test.** Create `src/lib/wine-map/mount-target.test.ts`:

```ts
// mountTarget decides which region shards are mounted (spec 2026-09-23 §7.4).
// All countries is today's rule. One country mounts only the focus country's
// shards below z8, which is what makes the default genuinely lighter on the
// first zoom. Bboxes are the live manifest's.
import { describe, expect, it } from "vitest";
import {
  countryOfShard,
  keepAcrossSync,
  mountTarget,
  NEIGHBOUR_MIN_ZOOM,
  SHARD_MIN_ZOOM,
  type MountInput,
} from "./mount-policy";
import type { Bbox } from "./shard-specs";

const SHARDS: MountInput["shards"] = [
  ["alsace", { bbox: [7.051, 47.79, 7.612, 48.701] }],
  ["baden", { bbox: [7.521, 47.546, 9.768, 49.786] }],
  ["bourgogne", { bbox: [3.609, 46.243, 5.005, 47.885] }],
  // A transitional v1 shard: no bbox, no country. It is never hidden.
  ["legacy", {}],
  ["pfalz", { bbox: [7.943, 49.03, 8.418, 49.67] }],
  ["toscana", { bbox: [9.706, 42.238, 12.368, 44.472] }],
];
const COUNTRIES: Record<string, string> = {
  alsace: "france",
  baden: "germany",
  bourgogne: "france",
  pfalz: "germany",
  toscana: "italy",
};
// Colmar: Alsace in the middle, Baden's bbox across the Rhine, Pfalz and
// Bourgogne just outside the 50% pad.
const COLMAR: Bbox = [7.0, 47.9, 7.6, 48.3];
// West of Colmar: Alsace inside the 50% pad, Baden only inside the 150% keep.
const WEST_OF_COLMAR: Bbox = [6.5, 47.9, 7.0, 48.3];
// Far west: Alsace and Baden are past even the 150% keep; Bourgogne is in.
const FAR_WEST: Bbox = [5.0, 47.9, 5.5, 48.3];

function input(overrides: Partial<MountInput> = {}): MountInput {
  return {
    shards: SHARDS,
    view: COLMAR,
    zoom: 6,
    selectedShard: null,
    prev: new Set(),
    detail: "one",
    focusCountry: "france",
    shardCountries: COUNTRIES,
    ...overrides,
  };
}

describe("mountTarget", () => {
  it("1. names the zoom floors", () => {
    expect(SHARD_MIN_ZOOM).toBe(5);
    expect(NEIGHBOUR_MIN_ZOOM).toBe(8);
  });

  it("2. mounts nothing below z5 but the selected shard, whatever was mounted before", () => {
    expect(mountTarget(input({ zoom: 4.4 }))).toEqual([]);
    expect(mountTarget(input({ zoom: 4.4, selectedShard: "bourgogne" }))).toEqual(["bourgogne"]);
    expect(
      mountTarget(input({ zoom: 4.99, prev: new Set(["alsace", "baden"]) })),
    ).toEqual([]);
  });

  it("3. All countries is today's rule: every shard in the 50% pad at z >= 5", () => {
    expect(mountTarget(input({ detail: "all" }))).toEqual(["alsace", "baden", "legacy"]);
    expect(mountTarget(input({ detail: "all", focusCountry: null }))).toEqual([
      "alsace",
      "baden",
      "legacy",
    ]);
  });

  it("4. One country mounts only the focus country's shards below z8", () => {
    expect(mountTarget(input())).toEqual(["alsace", "legacy"]);
    expect(mountTarget(input({ zoom: 7.99 }))).toEqual(["alsace", "legacy"]);
    expect(mountTarget(input({ focusCountry: "germany" }))).toEqual(["baden", "legacy"]);
  });

  it("5. One country mounts other countries' shards from z8", () => {
    expect(mountTarget(input({ zoom: NEIGHBOUR_MIN_ZOOM }))).toEqual([
      "alsace",
      "baden",
      "legacy",
    ]);
  });

  it("6. One country with no focus mounts no known-country shard below z8", () => {
    expect(mountTarget(input({ focusCountry: null }))).toEqual(["legacy"]);
  });

  it("7. an unknown country (tree not loaded) keeps today's rule in One country", () => {
    // Review Focus "Tree never arrives": a failed or slow tree must never cost
    // detail, so every shard mounts exactly as it does in All countries.
    expect(mountTarget(input({ shardCountries: {} }))).toEqual(["alsace", "baden", "legacy"]);
  });

  it("8. always mounts the selected shard, even another country's, but only if the manifest has it", () => {
    expect(mountTarget(input({ selectedShard: "toscana" }))).toEqual([
      "alsace",
      "legacy",
      "toscana",
    ]);
    expect(mountTarget(input({ selectedShard: "atlantis" }))).toEqual(["alsace", "legacy"]);
  });

  it("9. keeps a mounted shard until it leaves the 150% pad, whichever country it is", () => {
    // Baden is outside the 50% pad here but inside 150%. A focus flip at a
    // border must not unmount and refetch it.
    expect(
      mountTarget(input({ view: WEST_OF_COLMAR, prev: new Set(["alsace", "baden"]) })),
    ).toEqual(["alsace", "baden", "legacy"]);
    expect(mountTarget(input({ view: WEST_OF_COLMAR, prev: new Set(["alsace"]) }))).toEqual([
      "alsace",
      "legacy",
    ]);
    expect(mountTarget(input({ view: WEST_OF_COLMAR, detail: "all" }))).toEqual([
      "alsace",
      "legacy",
    ]);
  });

  it("10. drops a kept shard once it is past the 150% pad", () => {
    expect(
      mountTarget(input({ view: FAR_WEST, prev: new Set(["alsace", "baden"]) })),
    ).toEqual(["bourgogne", "legacy"]);
  });

  it("11. returns a sorted list that does not depend on the input order", () => {
    const reversed = [...SHARDS].reverse();
    expect(mountTarget(input({ shards: reversed, detail: "all" }))).toEqual(
      mountTarget(input({ detail: "all" })),
    );
  });
});

describe("countryOfShard", () => {
  it("reads own properties only", () => {
    expect(countryOfShard(COUNTRIES, "baden")).toBe("germany");
    expect(countryOfShard(COUNTRIES, "legacy")).toBeNull();
    expect(countryOfShard(COUNTRIES, "constructor")).toBeNull();
    expect(countryOfShard(COUNTRIES, "__proto__")).toBeNull();
  });
});

describe("keepAcrossSync", () => {
  // What All countries mounts at Colmar z6 (case 3).
  const MOUNTED_IN_ALL = ["alsace", "baden", "legacy"];

  it("hands the mounted set on while the mode holds", () => {
    expect([...keepAcrossSync(MOUNTED_IN_ALL, "one", "one")]).toEqual(MOUNTED_IN_ALL);
    expect([...keepAcrossSync(MOUNTED_IN_ALL, "all", "all")]).toEqual(MOUNTED_IN_ALL);
  });

  it("drops it on a mode change, so One country unmounts the neighbours at once", () => {
    expect(keepAcrossSync(MOUNTED_IN_ALL, "all", "one").size).toBe(0);
    expect(mountTarget(input({ detail: "all" }))).toEqual(MOUNTED_IN_ALL);
    // Switched to One at the same view: the 150% keep would otherwise hold
    // Baden (it is inside the pad), mounted for nothing until a long pan.
    expect(
      mountTarget(input({ prev: keepAcrossSync(MOUNTED_IN_ALL, "all", "one") })),
    ).toEqual(["alsace", "legacy"]);
    // A later sync in One country keeps it, as case 9 pins for a border pan.
    expect(
      mountTarget(input({ prev: keepAcrossSync(MOUNTED_IN_ALL, "one", "one") })),
    ).toEqual(MOUNTED_IN_ALL);
  });

  it("switching to All loses nothing: All mounts every shard in the pad anyway", () => {
    expect(
      mountTarget(
        input({ detail: "all", prev: keepAcrossSync(["alsace", "legacy"], "one", "all") }),
      ),
    ).toEqual(MOUNTED_IN_ALL);
  });
});
```

- [ ] **Step 2: Run the test and see it fail.**
  Command: `npx vitest run src/lib/wine-map/mount-target.test.ts`
  Expected: FAIL. Test 1 fails with `expected undefined to be 5`, and the others fail with `TypeError: mountTarget is not a function` (and `countryOfShard is not a function`, `keepAcrossSync is not a function`).

- [ ] **Step 3: Implement.** Add this import at the top of `src/lib/wine-map/mount-policy.ts`, next to any existing imports:

```ts
import type { Bbox } from "./shard-specs";
```

Append to the end of `src/lib/wine-map/mount-policy.ts`:

```ts
// ---------------------------------------------------------------------------
// Which region shards to mount (spec 2026-09-23 §7.4)
// ---------------------------------------------------------------------------

/** Below this zoom no region shard is mounted. Verified against the
    catalogue: every shard-only place has min_zoom >= 5, so beneath it a shard
    could only contribute its region outline/fill — which the world archive
    also carries and paints with the same colours. The map therefore opens
    (initialViewState is z4.4) without reading a single shard's pmtiles header. */
export const SHARD_MIN_ZOOM = 5;

/** One country mode mounts another country's shards only from here. Below it
    such a shard would draw nothing deeper than its regions (that country's
    depth flag is off), which the world archive draws identically up to its z7
    max zoom. From z8 the world copy is overzoomed, so the shard takes over for
    crisp region outlines. This is what makes One country genuinely lighter:
    the first zoom past z5 mounts one country's shards, not 36-44 of them. */
export const NEIGHBOUR_MIN_ZOOM = 8;

export type MountInput = {
  shards: readonly (readonly [string, { bbox?: Bbox }])[];
  view: Bbox;
  zoom: number;
  selectedShard: string | null;
  prev: ReadonlySet<string>;
  detail: "one" | "all";
  focusCountry: string | null;
  shardCountries: Readonly<Record<string, string>>;
};

/** A shard's country from the tree-derived map, or null while it is unknown.
    Own properties only, so a key that happens to spell an Object.prototype
    member can never read a function back as a "country". */
export function countryOfShard(
  shardCountries: Readonly<Record<string, string>>,
  key: string,
): string | null {
  return Object.prototype.hasOwnProperty.call(shardCountries, key)
    ? shardCountries[key]
    : null;
}

/** The mounted set that mountTarget's 150% keep may hold on to: the last
    sync's set while the mode holds, and nothing right after a mode change, so
    switching to One country unmounts the other countries' shards at once
    instead of keeping them until they leave the 150% pad. */
export function keepAcrossSync(
  prev: readonly string[],
  syncedDetail: "one" | "all",
  detail: "one" | "all",
): ReadonlySet<string> {
  return syncedDetail === detail ? new Set(prev) : new Set();
}

/**
 * The shards to mount for this view, sorted.
 *
 * - The selected shard always mounts, at any zoom, so a tree selection can
 *   ring its place before the camera arrives.
 * - Nothing else mounts below SHARD_MIN_ZOOM.
 * - Hysteresis: a shard mounts once its bbox meets the view padded by 50%,
 *   and a mounted one stays until it leaves the view padded by 150%. Panning
 *   never thrashes sources. The keep ignores country on purpose. Focus flips
 *   whenever the map centre crosses a border, and unmounting there would throw
 *   away that source's tiles and refetch them on the way back. The caller
 *   builds `prev` with keepAcrossSync, which is empty right after a mode
 *   change, so switching to One country still unmounts the other countries'
 *   shards at once.
 * - All countries mounts every shard in the pad (today's rule). One country
 *   mounts the focus country's shards, and other countries' only from
 *   NEIGHBOUR_MIN_ZOOM. A shard whose country is unknown (the place tree has
 *   not loaded, or failed) follows today's rule, so a missing tree never
 *   costs detail.
 * - No bbox (transitional v1 manifest) never hides a shard.
 */
export function mountTarget(input: MountInput): string[] {
  const { shards, view, zoom, selectedShard, prev, detail, focusCountry, shardCountries } =
    input;
  const [w, s, e, n] = view;
  const dx = e - w;
  const dy = n - s;
  const hit = (bbox: Bbox | undefined, pad: number) => {
    if (!bbox) return true;
    const [minX, minY, maxX, maxY] = bbox;
    return (
      maxX >= w - dx * pad && minX <= e + dx * pad &&
      maxY >= s - dy * pad && minY <= n + dy * pad
    );
  };
  const next: string[] = [];
  for (const [key, shard] of shards) {
    if (key === selectedShard) {
      next.push(key);
      continue;
    }
    if (zoom < SHARD_MIN_ZOOM) continue;
    if (prev.has(key) && hit(shard.bbox, 1.5)) {
      next.push(key);
      continue;
    }
    if (!hit(shard.bbox, 0.5)) continue;
    if (detail === "one") {
      const country = countryOfShard(shardCountries, key);
      if (country !== null && country !== focusCountry && zoom < NEIGHBOUR_MIN_ZOOM) continue;
    }
    next.push(key);
  }
  return next.sort();
}
```

- [ ] **Step 4: Run the test and see it pass.**
  Command: `npx vitest run src/lib/wine-map/mount-target.test.ts src/lib/wine-map/mount-policy.test.ts`
  Expected: PASS. Both files are green, and Task 3's `nextMountStep` tests are untouched.

- [ ] **Step 5: Wire `mountTarget` into `TileWineMap`, keeping today's behaviour.** This commit passes `detail: "all"`, which is exactly today's rule. Task 19 feeds in the real mode and focus. In `src/app/knowledge/map/tile-wine-map.tsx`:

  (a) Delete the local constant and its comment. The comment now lives on the export. Old:

```ts
// Below this zoom no region shard is mounted. Verified against the catalogue:
// every shard-only place has min_zoom >= 5, so beneath it a shard can only
// contribute its region outline/fill — which the world archive also carries.
// The map therefore opens (initialViewState is z4.4) without reading a single
// shard's pmtiles header, instead of opening all 54.
const SHARD_MIN_ZOOM = 5;
```

  New: nothing. The block is removed.

  (b) Add a new import line directly below `import type { WineMapManifest } from "@/lib/wine-map/manifest";`, which no Phase 1 task touches. (The `key-gate` import that Task 3 sat under was replaced by the `map-state` imports in Task 11.) After Task 16 the file has no `mount-policy` import (Task 16 Step 5 deleted the `nextMountStep` one), so this is a new line, not an extension:

```ts
import { mountTarget } from "@/lib/wine-map/mount-policy";
```

  (c) Inside `syncMountedShards`, two edits against the text Task 16 left.

  Edit 1 deletes the `hit` helper and the comment under it (both now live in `mountTarget`). Old:

```ts
    const hit = (bbox: [number, number, number, number] | undefined, pad: number) => {
      // No bbox (transitional v1 manifest) => never hide it.
      if (!bbox) return true;
      const [minX, minY, maxX, maxY] = bbox;
      return (
        maxX >= w - dx * pad && minX <= e + dx * pad &&
        maxY >= s - dy * pad && minY <= n + dy * pad
      );
    };
    // Below SHARD_MIN_ZOOM a shard has nothing the world archive lacks: every
    // shard-only feature has min_zoom >= 5, so all a shard contributes down
    // there is its region — which the world archive also carries, and which the
    // world-region-* layers now paint identically. Mounting none of them means
    // the map opens without reading 54 pmtiles headers.
```

  New: nothing. The block is removed. `dx` and `dy` stay: the share grid above still reads them.

  Edit 2 replaces the tail, from `const zoom` through the `});` that closes `setMountedShards`. The dependency line below it is untouched. Old (Task 16 Step 6's text):

```ts
    const zoom = map.getZoom();
    // The target goes straight to state: ShardController paces the adds
    // itself (an 8 ms budget per frame), so the React side no longer staggers.
    setMountedShards((prev) => {
      const prevSet = new Set(prev);
      const next = shardEntries
        .filter(
          ([key, shard]) =>
            key === selectedShard ||
            (zoom >= SHARD_MIN_ZOOM &&
              (hit(shard.bbox, 0.5) ||
                (prevSet.has(key) && hit(shard.bbox, 1.5)))),
        )
        .map(([key]) => key);
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
```

  New:

```ts
    const zoom = map.getZoom();
    // The target goes straight to state: ShardController paces the adds
    // itself (an 8 ms budget per frame), so the React side no longer staggers.
    // The rule lives in lib/wine-map/mount-policy (mountTarget). "all" is
    // today's rule: every shard in view at z >= SHARD_MIN_ZOOM, 50% pad, kept
    // to 150%, plus the selected shard at any zoom.
    setMountedShards((prev) => {
      const next = mountTarget({
        shards: shardEntries,
        view: [w, s, e, n],
        zoom,
        selectedShard,
        prev: new Set(prev),
        detail: "all",
        focusCountry: null,
        shardCountries,
      });
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
```

  The output is now sorted in code-unit order, not `localeCompare` order. The list is only compared with its own previous value, and the Phase 1c controller orders its own adds (selected first, then alphabetical), so the order change has no visible effect.

  (d) Check that no piece of Task 3's stagger outlived Task 16. Task 19 replaces the block under the "Viewport-gated mounting" comment by anchors, and a stale "Staggered" paragraph above it would survive that. Command: `grep -n "Staggered\|MOUNTS_PER_FRAME\|nextMountStep\|advanceMounts\|mountTargetRef\|mountFirstRef\|renderedShardsRef" src/app/knowledge/map/tile-wine-map.tsx`
  Expected: no output. Each hit is Task 3 code or comment that Task 16 made dead: nothing reads it once the controller paces the adds. Delete that comment paragraph (the bare `  //` line above it plus the five lines from `  // Staggered: syncMountedShards decides the TARGET set in one go, and the` down to `  // (a selection, a pan that adds one or two shards) lands exactly as before.`) or that declaration, then re-run the grep until it prints nothing.

- [ ] **Step 6: Types and lint.**
  Commands: `npx tsc --noEmit`, then `npx eslint src/lib/wine-map/mount-policy.ts src/lib/wine-map/mount-target.test.ts src/app/knowledge/map/tile-wine-map.tsx`
  Expected: both clean. The filter replaced in (c) was the file's only code that read `SHARD_MIN_ZOOM`; the remaining mentions are comments naming the exported constant, so `tile-wine-map.tsx` does not import it.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/wine-map/mount-policy.ts src/lib/wine-map/mount-target.test.ts src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): mountTarget — One country mounts other countries' shards only from z8" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: `nextFocusCountry` (`focus.ts`) and the centre query

**Files:**
- Create: `src/lib/wine-map/focus.ts`
- Create: `src/lib/wine-map/focus.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`:
  - delete the focus constants (base lines 133-146);
  - add the `detail`/`chipCountry` props;
  - replace the block from `const [mountedShards, setMountedShards] = useState<string[]>([]);` through the dependency line that closes `syncMountedShards` (base lines 682-775, as Task 18 left them);
  - delete the `focusCountry` memo (base lines 925-936).

**Interfaces:**
- Consumes:
  - `type Bbox` and `shardFilter(country)` from `./shard-specs` (Tasks 1 and 10).
  - `desiredGlobalState` from `./map-state` (Task 7). Only the test uses it.
  - `countryOfShard` and `type MountInput` from `./mount-policy` (Task 18); `TileWineMap` also takes `keepAcrossSync` and `mountTarget` from it.
- Produces:
  ```ts
  export const COUNTRY_FOCUS_SHARE = 0.6;
  export const COUNTRY_RELEASE_SHARE = 0.45;
  export const FOCUS_GRID = 48;                                                        // additive
  export function countryShares(input: { shards: MountInput["shards"]; shardCountries: Readonly<Record<string, string>>; view: Bbox }):
    { shares: Record<string, number>; present: string[] };                              // additive
  export function centreCountryFrom(properties: readonly (Readonly<Record<string, unknown>> | null | undefined)[],
    shardCountries: Readonly<Record<string, string>>): string | null;                   // additive
  export function nextFocusCountry(input: {
    chipCountry: string | null; selectedCountry: string | null; countriesInView: readonly string[];
    centreCountry: string | null; shares: Readonly<Record<string, number>>; prev: string | null;
  }): string | null;
  export type ChipFocus = { country: string; seen: boolean };                          // additive
  export function chipOnTap(prev: ChipFocus | null, country: string, countriesInView: readonly string[]): ChipFocus; // additive
  export function chipAfterReport(prev: ChipFocus | null, countriesInView: readonly string[]): ChipFocus | null;     // additive
  export function deepCountriesFor(detail: "one" | "all", focusCountry: string | null, knownCountries: readonly string[]): string[]; // additive
  export type DetailReport = { focusCountry: string | null; depthCountries: string[]; countriesInView: string[] };
  ```
  - `TileWineMap` gains the props `detail?: "one" | "all"` (default `"one"`) and `chipCountry?: string | null` (default `null`).

- [ ] **Step 1: Write the failing test.** Create `src/lib/wine-map/focus.test.ts`:

```ts
// Which country gets subregion depth in One country mode (spec 2026-09-23
// §7.3). Each precedence step, the share rule's hysteresis, the chip's
// lifecycle, and — through MapLibre's own filter engine — the depth filter the
// resulting flags drive.
import { describe, expect, it } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  centreCountryFrom,
  chipAfterReport,
  chipOnTap,
  COUNTRY_FOCUS_SHARE,
  COUNTRY_RELEASE_SHARE,
  countryShares,
  deepCountriesFor,
  FOCUS_GRID,
  nextFocusCountry,
} from "./focus";
import { desiredGlobalState } from "./map-state";
import type { MountInput } from "./mount-policy";
import { shardFilter, type Bbox } from "./shard-specs";

describe("countryShares", () => {
  // One grid cell per degree: a 48x48 view on a 48-cell grid.
  const VIEW: Bbox = [0, 0, 48, 48];
  // Typed, not `as const`: readonly tuples are not assignable to Bbox.
  const SHARDS: MountInput["shards"] = [
    ["west", { bbox: [0, 0, 24, 48] }],
    // Inside "west": a union must not count its cells twice.
    ["west-core", { bbox: [0, 0, 12, 12] }],
    ["east", { bbox: [24, 0, 36, 48] }],
    // No country (tree does not know it): ignored.
    ["orphan", { bbox: [40, 40, 41, 41] }],
    // Known country, entirely off screen.
    ["away", { bbox: [100, 100, 110, 110] }],
    // No bbox: cannot be measured.
    ["nobox", {}],
  ];
  const COUNTRIES = {
    west: "france",
    "west-core": "france",
    east: "germany",
    away: "italy",
    nobox: "spain",
  };

  it("measures each country's share of the on-screen wine ground by union", () => {
    expect(FOCUS_GRID).toBe(48);
    const { shares, present } = countryShares({
      shards: SHARDS,
      shardCountries: COUNTRIES,
      view: VIEW,
    });
    // france: 24x48 cells (west-core adds none), germany 12x48, union 36x48.
    expect(shares.france).toBeCloseTo(2 / 3, 10);
    expect(shares.germany).toBeCloseTo(1 / 3, 10);
    expect(Object.keys(shares).sort()).toEqual(["france", "germany"]);
    expect(present).toEqual(["france", "germany"]);
  });

  it("returns nothing for a degenerate view", () => {
    expect(
      countryShares({ shards: SHARDS, shardCountries: COUNTRIES, view: [5, 5, 5, 9] }),
    ).toEqual({ shares: {}, present: [] });
  });
});

describe("centreCountryFrom", () => {
  const COUNTRIES = { alsace: "france", baden: "germany" };

  it("takes the first hit whose region has a known country", () => {
    expect(centreCountryFrom([{ region: "alsace", tier: 1 }], COUNTRIES)).toBe("france");
    expect(
      centreCountryFrom(
        [null, undefined, { tier: 0 }, { region: 42 }, { region: "atlantis" }, { region: "baden" }],
        COUNTRIES,
      ),
    ).toBe("germany");
  });

  it("never reads a prototype member as a country", () => {
    expect(centreCountryFrom([{ region: "constructor" }], COUNTRIES)).toBeNull();
    expect(centreCountryFrom([{ region: "__proto__" }], COUNTRIES)).toBeNull();
  });

  it("is null with no hits", () => {
    expect(centreCountryFrom([], COUNTRIES)).toBeNull();
  });
});

describe("nextFocusCountry", () => {
  const base = {
    chipCountry: null,
    selectedCountry: null,
    countriesInView: ["france", "germany"],
    centreCountry: null,
    shares: { france: 0.3, germany: 0.8 },
    prev: null,
  };

  it("names the thresholds", () => {
    expect(COUNTRY_FOCUS_SHARE).toBe(0.6);
    expect(COUNTRY_RELEASE_SHARE).toBe(0.45);
  });

  it("4. falls back to the share rule", () => {
    expect(nextFocusCountry(base)).toBe("germany");
  });

  it("3. prefers the country under the map centre — Colmar is France, whatever Baden's bbox says", () => {
    expect(nextFocusCountry({ ...base, centreCountry: "france" })).toBe("france");
  });

  it("2. prefers the selected place's country while it is on screen", () => {
    expect(
      nextFocusCountry({ ...base, selectedCountry: "germany", centreCountry: "france" }),
    ).toBe("germany");
  });

  it("2. ignores a selection whose country is off screen", () => {
    expect(
      nextFocusCountry({ ...base, selectedCountry: "italy", centreCountry: "france" }),
    ).toBe("france");
  });

  it("1. prefers a tapped chip once its country is on screen", () => {
    expect(
      nextFocusCountry({
        ...base,
        chipCountry: "france",
        selectedCountry: "germany",
        centreCountry: "germany",
      }),
    ).toBe("france");
  });

  it("1. ignores a chip whose country is not on screen yet (its flight is underway)", () => {
    expect(nextFocusCountry({ ...base, chipCountry: "italy" })).toBe("germany");
  });

  it("4. keeps the previous focus until it falls below the release share", () => {
    const even = { ...base, shares: { france: 0.5, germany: 0.5 } };
    expect(nextFocusCountry({ ...even, prev: "france" })).toBe("france");
    expect(nextFocusCountry({ ...even, prev: "germany" })).toBe("germany");
    expect(nextFocusCountry(even)).toBeNull();
    expect(
      nextFocusCountry({ ...base, shares: { france: 0.4, germany: 0.55 }, prev: "france" }),
    ).toBeNull();
  });

  it("4. a leader past the focus share beats the previous focus", () => {
    expect(
      nextFocusCountry({ ...base, shares: { france: 0.5, germany: 0.62 }, prev: "france" }),
    ).toBe("germany");
  });

  it("4. has no focus with no wine ground in view", () => {
    expect(
      nextFocusCountry({ ...base, countriesInView: [], shares: {}, prev: "france" }),
    ).toBeNull();
  });
});

describe("chip lifecycle", () => {
  it("chipOnTap knows at once whether the country is already on screen", () => {
    expect(chipOnTap(null, "france", ["france", "germany"])).toEqual({
      country: "france",
      seen: true,
    });
    expect(chipOnTap(null, "italy", ["france"])).toEqual({ country: "italy", seen: false });
  });

  it("chipOnTap keeps the same chip object on a repeat tap", () => {
    const chip = { country: "italy", seen: false };
    expect(chipOnTap(chip, "italy", ["italy"])).toBe(chip);
  });

  it("chipAfterReport waits for a flight, then clears once the country has left the view", () => {
    const flying = { country: "italy", seen: false };
    expect(chipAfterReport(flying, ["france"])).toBe(flying);
    const landed = chipAfterReport(flying, ["italy"]);
    expect(landed).toEqual({ country: "italy", seen: true });
    expect(chipAfterReport(landed, ["italy", "france"])).toBe(landed);
    expect(chipAfterReport(landed, ["france"])).toBeNull();
    expect(chipAfterReport(null, ["italy"])).toBeNull();
  });
});

describe("deepCountriesFor through the real depth filter", () => {
  const KNOWN = ["france", "germany", "italy"];
  const passes = (country: string, deep: string[], tier: number) => {
    const state = desiredGlobalState({
      visibleKeys: null,
      english: true,
      selectedKey: null,
      deepCountries: deep,
      knownCountries: KNOWN,
    });
    return featureFilter(shardFilter(country) as never, state).filter(
      { zoom: 9 } as never,
      { type: 3, properties: { key: `${country}.region.place`, tier } } as never,
    );
  };

  it("All countries opens full depth for every known country, focus or not", () => {
    const deep = deepCountriesFor("all", "france", KNOWN);
    expect(deep).toEqual(KNOWN);
    for (const country of KNOWN) expect(passes(country, deep, 3)).toBe(true);
  });

  it("One country opens only the focus country; the others keep their regions", () => {
    const deep = deepCountriesFor("one", "france", KNOWN);
    expect(deep).toEqual(["france"]);
    expect(passes("france", deep, 3)).toBe(true);
    expect(passes("germany", deep, 3)).toBe(false);
    expect(passes("germany", deep, 1)).toBe(true);
  });

  it("One country with no focus keeps every country at region level", () => {
    const deep = deepCountriesFor("one", null, KNOWN);
    expect(deep).toEqual([]);
    for (const country of KNOWN) {
      expect(passes(country, deep, 2)).toBe(false);
      expect(passes(country, deep, 1)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and see it fail.**
  Command: `npx vitest run src/lib/wine-map/focus.test.ts`
  Expected: FAIL with `Error: Failed to resolve import "./focus" from "src/lib/wine-map/focus.test.ts". Does the file exist?`

- [ ] **Step 3: Implement.** Create `src/lib/wine-map/focus.ts`:

```ts
// Which country the wine map gives subregion depth to in One country mode,
// and the small pieces around that choice (spec 2026-09-23 §7.3). Pure: the
// map feeds in measurements (bboxes, the feature under the centre, the chip
// state), so every precedence step and the hysteresis are tested without a map.
import type { Bbox } from "./shard-specs";
import { countryOfShard, type MountInput } from "./mount-policy";

/** Share of the on-screen wine ground one country must cover before the share
    rule gives it focus. Below it the frame spans several countries, and no
    country is focused by shares alone. */
export const COUNTRY_FOCUS_SHARE = 0.6;

/** Release threshold for that focus. Taking focus at 0.6 and dropping it at
    0.6 made a frame near the boundary flip on every small drag, blinking every
    appellation in view. Keep focus until the leader falls well clear. */
export const COUNTRY_RELEASE_SHARE = 0.45;

/** Resolution of the grid that measures each country's share by UNION rather
    than by summing overlapping bboxes. 48x48 over a viewport is far finer than
    the bboxes it measures. */
export const FOCUS_GRID = 48;

/**
 * Each country's share of the visible wine ground, plus every country with any
 * ground on screen (`present`, sorted).
 *
 * Union, not sum. Region bboxes overlap heavily (Italy has 20 of them), so
 * adding per-shard intersections double-counts and favours whichever country
 * is split into the most overlapping pieces — it once ranked Spain over Italy
 * on a frame Italy dominated. Rasterising the view into a coarse grid and
 * marking covered cells gives the real share.
 */
export function countryShares(input: {
  shards: MountInput["shards"];
  shardCountries: Readonly<Record<string, string>>;
  view: Bbox;
}): { shares: Record<string, number>; present: string[] } {
  const [w, s, e, n] = input.view;
  const dx = e - w;
  const dy = n - s;
  if (!(dx > 0) || !(dy > 0)) return { shares: {}, present: [] };
  const covered = new Map<string, Set<number>>();
  const anyCovered = new Set<number>();
  for (const [key, shard] of input.shards) {
    const country = countryOfShard(input.shardCountries, key);
    if (!country || !shard.bbox) continue;
    const [minX, minY, maxX, maxY] = shard.bbox;
    const cx0 = Math.max(0, Math.floor(((minX - w) / dx) * FOCUS_GRID));
    const cx1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxX - w) / dx) * FOCUS_GRID) - 1);
    const cy0 = Math.max(0, Math.floor(((minY - s) / dy) * FOCUS_GRID));
    const cy1 = Math.min(FOCUS_GRID - 1, Math.ceil(((maxY - s) / dy) * FOCUS_GRID) - 1);
    if (cx1 < cx0 || cy1 < cy0) continue;
    let cells = covered.get(country);
    if (!cells) covered.set(country, (cells = new Set()));
    for (let gx = cx0; gx <= cx1; gx += 1) {
      for (let gy = cy0; gy <= cy1; gy += 1) {
        const cell = gy * FOCUS_GRID + gx;
        cells.add(cell);
        anyCovered.add(cell);
      }
    }
  }
  const total = anyCovered.size;
  const shares: Record<string, number> = {};
  if (total > 0) {
    for (const [country, cells] of covered) shares[country] = cells.size / total;
  }
  return { shares, present: [...covered.keys()].sort() };
}

/** The country of the wine region under the map centre, from the properties
    of what `queryRenderedFeatures` found there: the first feature whose
    `region` (its shard key) has a known country. Region polygons of different
    countries do not overlap, so "first" is exact. Bboxes do overlap, which is
    why this beats the share rule at borders. */
export function centreCountryFrom(
  properties: readonly (Readonly<Record<string, unknown>> | null | undefined)[],
  shardCountries: Readonly<Record<string, string>>,
): string | null {
  for (const p of properties) {
    const region = p && typeof p.region === "string" ? p.region : null;
    if (!region) continue;
    const country = countryOfShard(shardCountries, region);
    if (country) return country;
  }
  return null;
}

/**
 * The focus country, in order:
 * 1. a tapped chip, once its country is on screen (before that its flight is
 *    still underway, and a country off screen can show nothing);
 * 2. the selected place's country, but ONLY while it is on screen — the
 *    explorer never clears a selection, so an unconditional pin meant the
 *    first selection of the session (or arriving via ?place=) held depth to
 *    that country forever, and panning to Tuscany never showed a Tuscan
 *    subzone;
 * 3. the country of the wine region under the map centre, which is what you
 *    are looking at (bbox shares called Colmar "Germany" through Baden's
 *    bbox);
 * 4. the share rule: a leader at COUNTRY_FOCUS_SHARE takes focus, and the
 *    previous focus keeps it until it falls under COUNTRY_RELEASE_SHARE.
 * Null means no country: everything stays at region level.
 */
export function nextFocusCountry(input: {
  chipCountry: string | null;
  selectedCountry: string | null;
  countriesInView: readonly string[];
  centreCountry: string | null;
  shares: Readonly<Record<string, number>>;
  prev: string | null;
}): string | null {
  const { chipCountry, selectedCountry, countriesInView, centreCountry, shares, prev } = input;
  if (chipCountry && countriesInView.includes(chipCountry)) return chipCountry;
  if (selectedCountry && countriesInView.includes(selectedCountry)) return selectedCountry;
  if (centreCountry) return centreCountry;
  // Alphabetical scan with a strict `>`, so a tie is decided by name, not by
  // object key order.
  let leader: string | null = null;
  let best = 0;
  for (const country of Object.keys(shares).sort()) {
    if (shares[country] > best) {
      leader = country;
      best = shares[country];
    }
  }
  if (leader !== null && best >= COUNTRY_FOCUS_SHARE) return leader;
  if (prev !== null && (shares[prev] ?? 0) >= COUNTRY_RELEASE_SHARE) return prev;
  return null;
}

/** A tapped country chip: focus without selection. `seen` turns true once the
    country has been on screen, so leaving the view after that clears it while
    a flight still on its way does not. */
export type ChipFocus = { country: string; seen: boolean };

/** The chip state after a tap. A repeat tap keeps the object, so a state
    update bails out. */
export function chipOnTap(
  prev: ChipFocus | null,
  country: string,
  countriesInView: readonly string[],
): ChipFocus {
  if (prev?.country === country) return prev;
  return { country, seen: countriesInView.includes(country) };
}

/** The chip state after the map reports the countries on screen. It is
    returned unchanged (same object) when nothing moved. */
export function chipAfterReport(
  prev: ChipFocus | null,
  countriesInView: readonly string[],
): ChipFocus | null {
  if (!prev) return null;
  if (countriesInView.includes(prev.country)) {
    return prev.seen ? prev : { country: prev.country, seen: true };
  }
  return prev.seen ? null : prev;
}

/** Countries whose `wm_deep_<country>` flag is on: every known one in All
    countries, the focus country alone (or none) in One country. */
export function deepCountriesFor(
  detail: "one" | "all",
  focusCountry: string | null,
  knownCountries: readonly string[],
): string[] {
  if (detail === "all") return [...knownCountries];
  return focusCountry ? [focusCountry] : [];
}

/** What TileWineMap tells the explorer. It reports whenever a value changes,
    and the status line and the chips are built from it. `depthCountries` are
    the countries whose tier >= 2 features the idle scan actually saw on
    screen. */
export type DetailReport = {
  focusCountry: string | null;
  depthCountries: string[];
  countriesInView: string[];
};
```

- [ ] **Step 4: Run the test and see it pass.**
  Command: `npx vitest run src/lib/wine-map/focus.test.ts`
  Expected: PASS, every test in the file.

- [ ] **Step 5: Wire focus into `TileWineMap`.** In `src/app/knowledge/map/tile-wine-map.tsx`:

  (a) Delete the three constants. They now live in `focus.ts`. Old:

```ts
// Share of the on-screen wine country a single country must account for before
// the map treats you as "viewing" it and reveals its subregions. Below this the
// frame spans several countries, so everything stays at region level.
const COUNTRY_FOCUS_SHARE = 0.6;

// Release threshold for that focus. Taking focus at 0.6 and dropping it at 0.6
// made a frame sitting near the boundary flip on every small drag, blinking
// every appellation in view. Keep focus until the leader falls well clear.
const COUNTRY_RELEASE_SHARE = 0.45;

// Resolution of the grid used to measure each country's share of the visible
// wine ground by UNION rather than by summing overlapping bboxes. 48x48 over a
// viewport is far finer than the bboxes it is measuring.
const FOCUS_GRID = 48;
```

  New: nothing. The block is removed.

  (b) Imports, three edits.
  - Add `type Bbox` to the existing `from "@/lib/wine-map/shard-specs"` import. Phases 1a-1c already import values from that module, so merge the name into that import's braces rather than opening a second import of the same module.
  - Replace Task 18's `import { mountTarget } from "@/lib/wine-map/mount-policy";` with:

```ts
import { keepAcrossSync, mountTarget } from "@/lib/wine-map/mount-policy";
```

  - Add the new focus import next to the other `@/lib/wine-map/*` imports:

```ts
import {
  centreCountryFrom,
  countryShares,
  nextFocusCountry,
} from "@/lib/wine-map/focus";
```

  (c) Props. Old (destructuring):

```ts
  manifest,
  selectedKey,
```

  New:

```ts
  detail = "one",
  chipCountry = null,
  manifest,
  selectedKey,
```

  Old (the props type):

```ts
  manifest: WineMapManifest;
```

  New:

```ts
  /** One country (default): subregion depth for the focus country alone, and
      other countries' shards mounted only from z8. All countries: depth for
      every country at once (spec 2026-09-23 §7). */
  detail?: "one" | "all";
  /** A tapped country chip: focus goes to it once it is on screen, ahead of
      the selection and the map centre (lib/wine-map/focus). */
  chipCountry?: string | null;
  manifest: WineMapManifest;
```

  (d) Replace everything from the line `  const [mountedShards, setMountedShards] = useState<string[]>([]);` down to and including the dependency line that closes `syncMountedShards`. That line is `  }, [shardEntries, selectedShard, shardCountries]);` (Task 16's text; Task 18 does not touch it). It covers the `viewportCountry`/`viewportCountries` states and the whole callback. Keep the `// Viewport-gated mounting. …` comment above it. New:

```ts
  const [mountedShards, setMountedShards] = useState<string[]>([]);
  // The focus country (One country mode's subregion depth) and every country
  // with wine ground on screen, both decided on each sync by nextFocusCountry
  // (lib/wine-map/focus). One state object, replaced only on a real change,
  // so a pan inside one country re-renders nothing.
  const [focus, setFocus] = useState<{ country: string | null; inView: string[] }>(
    () => ({ country: null, inView: [] }),
  );
  const focusCountry = focus.country;
  // The previous focus for the share rule's hysteresis. It is read and written
  // only inside syncMountedShards, so it never lags a render.
  const focusRef = useRef<string | null>(null);
  // Countries on screen as of the last sync. A chip's camera request reads it
  // at apply time.
  const countriesInViewRef = useRef<string[]>([]);
  // The mode the last sync mounted for. A mode change drops the 150% keep
  // (keepAcrossSync), so switching to One country unmounts the other
  // countries' shards at once.
  const syncedDetailRef = useRef(detail);
  const selectedCountry = useMemo(
    () => (selectedKey ? (selectedKey.split(".")[0] ?? null) : null),
    [selectedKey],
  );
  const syncMountedShards = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const b = map.getBounds();
    const view: Bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const zoom = map.getZoom();
    const { shares, present } = countryShares({ shards: shardEntries, shardCountries, view });
    // The wine region under the map centre. world-region-fills alone is
    // enough. The world archive carries every region at every zoom. A region
    // handed to its shard is only painted at opacity 0, and feature-state
    // never removes a feature from the query index. The layer is hidden under
    // ?debugFills=off (queries skip hidden layers), and that case falls back
    // to the share rule. The call is guarded because the style can be
    // mid-rebuild, or null after a lost WebGL context.
    let centreCountry: string | null = null;
    try {
      if (map.getLayer("world-region-fills")) {
        const hits = map.queryRenderedFeatures(map.project(map.getCenter()), {
          layers: ["world-region-fills"],
        });
        centreCountry = centreCountryFrom(
          hits.map((feature) => feature.properties),
          shardCountries,
        );
      }
    } catch {
      centreCountry = null;
    }
    const country = nextFocusCountry({
      chipCountry,
      selectedCountry,
      countriesInView: present,
      centreCountry,
      shares,
      prev: focusRef.current,
    });
    focusRef.current = country;
    countriesInViewRef.current = present;
    setFocus((prev) =>
      prev.country === country &&
      prev.inView.length === present.length &&
      prev.inView.every((c, i) => c === present[i])
        ? prev
        : { country, inView: present },
    );
    // Read before the write: the updater below may run later (or twice under
    // StrictMode), and must see the mode this sync started from.
    const syncedDetail = syncedDetailRef.current;
    syncedDetailRef.current = detail;
    setMountedShards((prev) => {
      const next = mountTarget({
        shards: shardEntries,
        view,
        zoom,
        selectedShard,
        prev: keepAcrossSync(prev, syncedDetail, detail),
        detail,
        focusCountry: country,
        shardCountries,
      });
      return next.length === prev.length && next.every((k, i) => k === prev[i])
        ? prev
        : next;
    });
  }, [shardEntries, shardCountries, selectedShard, selectedCountry, chipCountry, detail]);
```

  The existing `useEffect(() => { syncMountedShards(); }, [syncMountedShards]);` right below stays. The selection, the chip and the mode are now `syncMountedShards` dependencies, so each of them re-runs the sync at once, as a selection did before through the old memo.

  (e) Delete the old memo. Its rule now lives in `nextFocusCountry`. Old:

```ts
  // A selection pins the focus country, but ONLY while that country is still on
  // screen. selectedKey is never cleared by the explorer, so keying focus on it
  // unconditionally meant the first selection of the session — a tree click, or
  // just arriving via ?place=... — pinned depth to that country permanently:
  // pan to Tuscany afterwards and its shard mounts but stays clamped to
  // tier <= 1, so Chianti and every Tuscan subzone could never appear at any
  // zoom. Once the selection is off screen, focus follows the viewport again.
  const focusCountry = useMemo(() => {
    const selectedCountry = selectedKey ? (selectedKey.split(".")[0] ?? null) : null;
    if (selectedCountry && viewportCountries.includes(selectedCountry)) return selectedCountry;
    return viewportCountry;
  }, [selectedKey, viewportCountries, viewportCountry]);
```

  New: nothing. The block is removed. `focusCountry` is now `focus.country`, declared in (d). The Task 11 `desiredGlobalState` memo and the `?debugClick=1` log keep reading it unchanged.

- [ ] **Step 6: Types, lint and the suite.**
  Commands: `npx tsc --noEmit`, then `npx eslint src/lib/wine-map/focus.ts src/lib/wine-map/focus.test.ts src/app/knowledge/map/tile-wine-map.tsx`, then `npx vitest run src/lib/wine-map/`
  Expected: all clean and green. If `tsc` still names `viewportCountry` or `viewportCountries`, a Phase 1 edit referenced them. Switch that reference to `focusCountry` or `focus.inView`.

- [ ] **Step 7: Manual check (main session, dev server).**
  - Open `/knowledge/map?debugClick=1`. In the console, run `window.__wineMap.jumpTo({ center: [7.36, 48.08], zoom: 7.5 })` (Colmar), then click a vineyard. The `[wine-map click]` log must show `focusCountry: "france"`. On base it logged `"germany"` there.
  - Jump to `[8.2, 49.3]` at z7.5 (Pfalz) and click. The log must show `"germany"`.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/wine-map/focus.ts src/lib/wine-map/focus.test.ts src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): focus follows chip, selection, map centre, then share" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Detail mode store and guard rails (`detail-mode.ts`)

**Files:**
- Create: `src/lib/wine-map/detail-mode.ts`
- Create: `src/lib/wine-map/detail-mode.test.ts`
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`:
  - add the props `onContextLost` and `onHealthy`, with their refs;
  - add `handleIdle` after the `scanTimer` cleanup effect;
  - change `onIdle={scheduleScan}` to `onIdle={handleIdle}`;
  - add a `webglcontextlost` listener in `onLoad`.

**Interfaces:**
- Consumes: `readFlag`, `writeFlag`, `clearFlag` and `type StorageLike` from `../safe-storage`. Also `SHARD_MIN_ZOOM` from `./mount-policy` (Task 18), read by `allModeHealthy`.
- Produces:
  ```ts
  export type DetailMode = "one" | "all";
  export const DETAIL_ALL_KEY = "wine-map-all-countries";
  export const DETAIL_PENDING_KEY = "wine-map-all-pending";
  export type DetailSnapshot = { mode: DetailMode; fellBack: boolean };                 // additive
  export function initialDetailMode(read: (key: string) => boolean): DetailSnapshot;    // = { mode; fellBack }
  export type DetailModeStore = { getSnapshot(): DetailSnapshot; subscribe(l: () => void): () => void;
    setMode(m: DetailMode): void; dropToOne(): void; armSentinel(): void; confirmHealthy(): void };   // additive
  export function createDetailModeStore(getStorage: () => StorageLike | null): DetailModeStore;   // additive
  export function allModeHealthy(input: { pending: boolean; mountedCount: number; zoom: number }): boolean; // additive
  export function useDetailMode(): { mode: DetailMode; fellBack: boolean; setMode(m: DetailMode): void;
    dropToOne(): void; confirmHealthy(): void };
  ```
  - `TileWineMap` gains `onContextLost?: () => void` and `onHealthy?: () => void`. The skeleton did not list `onHealthy`; see contract_changes.

- [ ] **Step 1: Write the failing test.** Create `src/lib/wine-map/detail-mode.test.ts`:

```ts
// The One country | All countries choice and its crash-loop guard (spec
// 2026-09-23 §7.2, §7.5). The hook itself needs a DOM; everything it does is
// the store's, and the store takes its storage as an argument.
import { describe, expect, it, vi } from "vitest";
import type { StorageLike } from "../safe-storage";
import {
  allModeHealthy,
  createDetailModeStore,
  DETAIL_ALL_KEY,
  DETAIL_PENDING_KEY,
  initialDetailMode,
} from "./detail-mode";
import { SHARD_MIN_ZOOM } from "./mount-policy";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return { data, getStorage: () => storage };
}

describe("initialDetailMode", () => {
  const reader = (set: string[]) => (key: string) => set.includes(key);

  it("starts in One country when nothing was chosen", () => {
    expect(initialDetailMode(reader([]))).toEqual({ mode: "one", fellBack: false });
  });

  it("starts in All countries when that was chosen and the last visit confirmed it", () => {
    expect(initialDetailMode(reader([DETAIL_ALL_KEY]))).toEqual({ mode: "all", fellBack: false });
  });

  it("falls back to One country when the last All never confirmed", () => {
    expect(initialDetailMode(reader([DETAIL_ALL_KEY, DETAIL_PENDING_KEY]))).toEqual({
      mode: "one",
      fellBack: true,
    });
  });

  it("ignores a stale sentinel with no All choice", () => {
    expect(initialDetailMode(reader([DETAIL_PENDING_KEY]))).toEqual({
      mode: "one",
      fellBack: false,
    });
  });

  it("uses the exact persistence keys", () => {
    expect(DETAIL_ALL_KEY).toBe("wine-map-all-countries");
    expect(DETAIL_PENDING_KEY).toBe("wine-map-all-pending");
  });
});

describe("createDetailModeStore", () => {
  it("returns the same snapshot object until something changes", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const first = store.getSnapshot();
    expect(first).toEqual({ mode: "one", fellBack: false });
    expect(store.getSnapshot()).toBe(first);
  });

  it("setMode('all') remembers the choice, arms the sentinel and notifies once", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("confirmHealthy clears only the sentinel, and a new page load starts in All", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    store.setMode("all");
    const before = store.getSnapshot();
    store.confirmHealthy();
    expect(data.has(DETAIL_PENDING_KEY)).toBe(false);
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(store.getSnapshot()).toBe(before);
    expect(createDetailModeStore(getStorage).getSnapshot()).toEqual({
      mode: "all",
      fellBack: false,
    });
  });

  it("a page that never confirmed All starts the next one in One, and keeps the saved choice", () => {
    const { data, getStorage } = memoryStorage({
      [DETAIL_ALL_KEY]: "1",
      [DETAIL_PENDING_KEY]: "1",
    });
    const store = createDetailModeStore(getStorage);
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    // Nothing on this page may clear the evidence or re-drop.
    store.confirmHealthy();
    store.dropToOne();
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    // One tap on All tries again.
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
  });

  it("dropToOne switches this page only and leaves the saved choice alone", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    store.setMode("all");
    const listener = vi.fn();
    store.subscribe(listener);
    store.dropToOne();
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: true });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dropToOne does nothing in One country (a lost context there is not All's doing)", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const before = store.getSnapshot();
    store.dropToOne();
    expect(store.getSnapshot()).toBe(before);
  });

  it("setMode('one') forgets All and the sentinel, and clears a fallback", () => {
    const { data, getStorage } = memoryStorage({
      [DETAIL_ALL_KEY]: "1",
      [DETAIL_PENDING_KEY]: "1",
    });
    const store = createDetailModeStore(getStorage);
    store.setMode("one");
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: false });
    expect(data.has(DETAIL_ALL_KEY)).toBe(false);
    expect(data.has(DETAIL_PENDING_KEY)).toBe(false);
  });

  it("rapid switching lands on the last choice, notifying each change", () => {
    const { data, getStorage } = memoryStorage();
    const store = createDetailModeStore(getStorage);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setMode("all");
    store.setMode("one");
    store.setMode("all");
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
    expect(data.get(DETAIL_ALL_KEY)).toBe("1");
    expect(listener).toHaveBeenCalledTimes(3);
    store.setMode("all");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("armSentinel writes only in All countries", () => {
    const { data, getStorage } = memoryStorage({ [DETAIL_ALL_KEY]: "1" });
    const store = createDetailModeStore(getStorage);
    store.armSentinel();
    expect(data.get(DETAIL_PENDING_KEY)).toBe("1");
    const one = memoryStorage();
    createDetailModeStore(one.getStorage).armSentinel();
    expect(one.data.has(DETAIL_PENDING_KEY)).toBe(false);
  });

  it("unsubscribe stops notifications", () => {
    const store = createDetailModeStore(memoryStorage().getStorage);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.setMode("all");
    expect(listener).not.toHaveBeenCalled();
  });

  it("blocked storage reads as One country and still switches for this page view", () => {
    const store = createDetailModeStore(() => {
      throw new Error("SecurityError");
    });
    expect(store.getSnapshot()).toEqual({ mode: "one", fellBack: false });
    expect(() => store.setMode("all")).not.toThrow();
    expect(store.getSnapshot()).toEqual({ mode: "all", fellBack: false });
  });
});

describe("allModeHealthy", () => {
  it("gives All its all-clear at the first idle at shard zoom with shards mounted", () => {
    expect(allModeHealthy({ pending: true, mountedCount: 12, zoom: SHARD_MIN_ZOOM })).toBe(true);
    expect(allModeHealthy({ pending: true, mountedCount: 1, zoom: 9.5 })).toBe(true);
  });

  it("does not clear the sentinel before All has really drawn", () => {
    // The idle right after load at the opening z4.4: nothing is mounted.
    expect(allModeHealthy({ pending: true, mountedCount: 0, zoom: 4.4 })).toBe(false);
    // A ?place= deep link mounts its own shard below z5. That is one shard,
    // not the 40+ the first zoom in All loads.
    expect(allModeHealthy({ pending: true, mountedCount: 1, zoom: 4.99 })).toBe(false);
    // Shard zoom, but the mount has not landed yet.
    expect(allModeHealthy({ pending: true, mountedCount: 0, zoom: 6 })).toBe(false);
  });

  it("fires once per switch to All: never after the all-clear, never in One country", () => {
    expect(allModeHealthy({ pending: false, mountedCount: 40, zoom: 6 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and see it fail.**
  Command: `npx vitest run src/lib/wine-map/detail-mode.test.ts`
  Expected: FAIL with `Error: Failed to resolve import "./detail-mode" from "src/lib/wine-map/detail-mode.test.ts". Does the file exist?`

- [ ] **Step 3: Implement.** Create `src/lib/wine-map/detail-mode.ts`:

```ts
"use client";

// Map detail: One country | All countries (spec 2026-09-23 §7.2, §7.5).
// One country is the default for everyone. The choice is remembered per
// browser through safe-storage flags and never put in the URL, so a shared
// ?place= link cannot put a phone into All countries.
//
// All countries is guarded against a crash loop. A phone that runs out of
// graphics memory in All kills the tab, and a remembered All would reopen
// straight into the same crash on every visit. So DETAIL_PENDING_KEY is set
// before All draws. It is cleared once All has drawn and gone idle (the map
// reports that through onHealthy) or the page is left normally (pagehide, which
// a killed tab never fires). A load that finds the sentinel still set starts
// in One country and says why. The saved choice stays All until the viewer
// changes it.
//
// Same hydration shape as the Local/English toggle: useSyncExternalStore with
// "one" as the server snapshot, so the first client render matches the server
// and the stored choice lands after hydration with no setState in an effect.
import { useEffect, useSyncExternalStore } from "react";
import { clearFlag, readFlag, writeFlag, type StorageLike } from "../safe-storage";
import { SHARD_MIN_ZOOM } from "./mount-policy";

export type DetailMode = "one" | "all";

/** Set = All countries. Only setMode writes it, so a fallback never erases the
    viewer's choice. */
export const DETAIL_ALL_KEY = "wine-map-all-countries";

/** The crash-loop sentinel (see the top of this file). */
export const DETAIL_PENDING_KEY = "wine-map-all-pending";

export type DetailSnapshot = { mode: DetailMode; fellBack: boolean };

/** The mode a page load starts in. `fellBack` means All was chosen, but the
    last page that drew it never confirmed it. */
export function initialDetailMode(read: (key: string) => boolean): DetailSnapshot {
  if (!read(DETAIL_ALL_KEY)) return { mode: "one", fellBack: false };
  if (read(DETAIL_PENDING_KEY)) return { mode: "one", fellBack: true };
  return { mode: "all", fellBack: false };
}

export type DetailModeStore = {
  getSnapshot(): DetailSnapshot;
  subscribe(listener: () => void): () => void;
  /** The viewer's choice: persisted, and it clears any fallback. */
  setMode(mode: DetailMode): void;
  /** A lost WebGL context in All: One for this page only, with the reason
      shown. The saved choice is untouched. A no-op outside All. */
  dropToOne(): void;
  /** Set the sentinel before All draws. A no-op outside All. */
  armSentinel(): void;
  /** All drew and went idle, or the page was left normally. A no-op outside
      All, so a fallback page can never erase the evidence that sent it there. */
  confirmHealthy(): void;
};

/** The store behind useDetailMode, with its storage passed in so it can be
    tested with a fake. Storage is read once, lazily, on the first snapshot, and
    the snapshot object only changes when the mode or the fallback does, as
    useSyncExternalStore requires. A write that fails (site data blocked, full
    store) still switches the page. The choice just is not remembered. */
export function createDetailModeStore(
  getStorage: () => StorageLike | null,
): DetailModeStore {
  let snapshot: DetailSnapshot | null = null;
  const listeners = new Set<() => void>();
  const current = (): DetailSnapshot =>
    (snapshot ??= initialDetailMode((key) => readFlag(getStorage, key)));
  const publish = (next: DetailSnapshot) => {
    const prev = current();
    if (prev.mode === next.mode && prev.fellBack === next.fellBack) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setMode(mode) {
      if (mode === "all") {
        writeFlag(getStorage, DETAIL_ALL_KEY);
        writeFlag(getStorage, DETAIL_PENDING_KEY);
      } else {
        clearFlag(getStorage, DETAIL_ALL_KEY);
        clearFlag(getStorage, DETAIL_PENDING_KEY);
      }
      publish({ mode, fellBack: false });
    },
    dropToOne() {
      if (current().mode !== "all") return;
      publish({ mode: "one", fellBack: true });
    },
    armSentinel() {
      if (current().mode === "all") writeFlag(getStorage, DETAIL_PENDING_KEY);
    },
    confirmHealthy() {
      if (current().mode === "all") clearFlag(getStorage, DETAIL_PENDING_KEY);
    },
  };
}

/** Whether a map idle is All countries' all-clear. "All has drawn" means an
    idle at shard zoom with shards mounted. The idle right after load at the
    opening z4.4 mounts nothing, and a ?place= deep link mounts only its own
    shard below z5. Clearing the sentinel at either would leave the zoom that
    really loads 40+ shards unguarded. The map keeps `pending` true only while
    All has not yet proved itself on this page, so this fires once per switch
    to All. */
export function allModeHealthy(input: {
  pending: boolean;
  mountedCount: number;
  zoom: number;
}): boolean {
  return input.pending && input.mountedCount > 0 && input.zoom >= SHARD_MIN_ZOOM;
}

// The page's one store. The getter runs inside readFlag/writeFlag's
// try/catch, so a server import or blocked site data never throws.
const detailStore = createDetailModeStore(() => window.localStorage);
const SERVER_SNAPSHOT: DetailSnapshot = { mode: "one", fellBack: false };
const serverSnapshot = () => SERVER_SNAPSHOT;

export function useDetailMode(): {
  mode: DetailMode;
  fellBack: boolean;
  setMode(mode: DetailMode): void;
  dropToOne(): void;
  confirmHealthy(): void;
} {
  const snapshot = useSyncExternalStore(
    detailStore.subscribe,
    detailStore.getSnapshot,
    serverSnapshot,
  );
  // Arm the sentinel whenever All is live on this page, which covers a page
  // load that starts in All as well as a tap. The map chunk loads after
  // hydration, so this always runs before All draws a single shard. A normal
  // exit clears it, and a page restored from the back-forward cache re-arms.
  useEffect(() => {
    if (snapshot.mode !== "all") return;
    detailStore.armSentinel();
    const onPageHide = () => detailStore.confirmHealthy();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) detailStore.armSentinel();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [snapshot.mode]);
  return {
    mode: snapshot.mode,
    fellBack: snapshot.fellBack,
    setMode: detailStore.setMode,
    dropToOne: detailStore.dropToOne,
    confirmHealthy: detailStore.confirmHealthy,
  };
}
```

- [ ] **Step 4: Run the test and see it pass.**
  Command: `npx vitest run src/lib/wine-map/detail-mode.test.ts`
  Expected: PASS, every test in the file.

- [ ] **Step 5: `TileWineMap` guard-rail hooks.** In `src/app/knowledge/map/tile-wine-map.tsx`:

  (a) Import. Add next to the other `@/lib/wine-map/*` imports:

```ts
import { allModeHealthy } from "@/lib/wine-map/detail-mode";
```

  (b) Props. Old (destructuring):

```ts
  manifest,
  selectedKey,
```

  New:

```ts
  onContextLost,
  onHealthy,
  manifest,
  selectedKey,
```

  Old (the props type):

```ts
  manifest: WineMapManifest;
```

  New:

```ts
  /** The WebGL context was lost. This is usually a phone out of graphics
      memory in All countries, and the explorer drops to One country for the
      session. */
  onContextLost?: () => void;
  /** All countries has drawn at shard zoom and gone idle on this device. This
      is the crash-loop sentinel's all-clear (spec §7.5). */
  onHealthy?: () => void;
  manifest: WineMapManifest;
```

  (c) Right after the `scanTimer` cleanup effect, add `handleIdle` and its refs. This is the old block to anchor on:

```ts
  useEffect(
    () => () => {
      if (scanTimer.current !== null) window.clearTimeout(scanTimer.current);
    },
    [],
  );
```

  Keep it, and add this new code after it:

```ts
  // Latest callbacks, for listeners registered once in onLoad.
  const onContextLostRef = useRef(onContextLost);
  const onHealthyRef = useRef(onHealthy);
  useEffect(() => {
    onContextLostRef.current = onContextLost;
    onHealthyRef.current = onHealthy;
  }, [onContextLost, onHealthy]);
  // True while All countries has not yet proved itself on this device. It is
  // re-armed by each switch to All.
  const healthPendingRef = useRef(detail === "all");
  useEffect(() => {
    healthPendingRef.current = detail === "all";
  }, [detail]);
  // Every gesture ends in idle, which triggers the legend scan and, once, the
  // All countries all-clear (allModeHealthy says when All has really drawn).
  const handleIdle = useCallback(() => {
    scheduleScan();
    if (
      !allModeHealthy({
        pending: healthPendingRef.current,
        mountedCount: mountedShards.length,
        zoom: mapRef.current?.getZoom() ?? 0,
      })
    ) {
      return;
    }
    healthPendingRef.current = false;
    onHealthyRef.current?.();
  }, [scheduleScan, mountedShards]);
```

  (d) On `<Map>`, old: `        onIdle={scheduleScan}`. New: `        onIdle={handleIdle}`.

  (e) In `onLoad`, old:

```ts
          // First gating pass once the map has real bounds.
```

  New:

```ts
          // A lost WebGL context drops the page to One country for the session
          // (spec §7.5). This is usually a phone out of graphics memory in All
          // countries. MapLibre sets map.style to null until the context is
          // restored, so every imperative map call on the way stays guarded.
          e.target.on("webglcontextlost", () => onContextLostRef.current?.());
          // First gating pass once the map has real bounds.
```

- [ ] **Step 6: Types and lint.**
  Commands: `npx tsc --noEmit`, then `npx eslint src/lib/wine-map/detail-mode.ts src/lib/wine-map/detail-mode.test.ts src/app/knowledge/map/tile-wine-map.tsx`
  Expected: clean.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/wine-map/detail-mode.ts src/lib/wine-map/detail-mode.test.ts src/app/knowledge/map/tile-wine-map.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): persisted One/All detail mode with crash-loop guard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: `detailStatus` (`detail-status.ts`) — exact copy

**Files:**
- Create: `src/lib/wine-map/detail-status.ts`
- Create: `src/lib/wine-map/detail-status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const DETAIL_WARNING = "Uses more resources and can cause lag.";   // additive
  export type DetailStatus = { text: string; retry: boolean };             // additive
  export function detailStatus(input: {
    tree: "loading" | "ready" | "failed"; detail: "one" | "all"; fellBack: boolean;
    focusName: string | null; depthVisible: boolean; otherCountriesInView: boolean;
  }): DetailStatus;
  ```

- [ ] **Step 1: Write the failing test.** Create `src/lib/wine-map/detail-status.test.ts`:

```ts
// The status line under the Map detail switch (spec 2026-09-23 §7.1). Every
// string is pinned exactly: the owner approved this copy word for word.
import { describe, expect, it } from "vitest";
import { DETAIL_WARNING, detailStatus } from "./detail-status";

type Input = Parameters<typeof detailStatus>[0];
const base: Input = {
  tree: "ready",
  detail: "one",
  fellBack: false,
  focusName: "France",
  depthVisible: true,
  otherCountriesInView: false,
};

describe("detailStatus", () => {
  it("keeps the owner's warning verbatim", () => {
    expect(DETAIL_WARNING).toBe("Uses more resources and can cause lag.");
  });

  it("is empty while the place tree loads, whatever else is true", () => {
    expect(detailStatus({ ...base, tree: "loading" })).toEqual({ text: "", retry: false });
    expect(detailStatus({ ...base, tree: "loading", detail: "all", fellBack: true })).toEqual({
      text: "",
      retry: false,
    });
  });

  it("offers a retry when the place tree failed", () => {
    expect(detailStatus({ ...base, tree: "failed", detail: "all" })).toEqual({
      text: "Subregion detail couldn't load.",
      retry: true,
    });
  });

  it("explains a fallback to One country", () => {
    expect(detailStatus({ ...base, fellBack: true })).toEqual({
      text: "Switched to One country after a problem last time.",
      retry: false,
    });
  });

  it("shows the warning whenever All countries is on", () => {
    expect(detailStatus({ ...base, detail: "all", focusName: null })).toEqual({
      text: "Subregions for all countries. Uses more resources and can cause lag.",
      retry: false,
    });
  });

  it("One country with no focus says how to get one", () => {
    expect(detailStatus({ ...base, focusName: null, depthVisible: false })).toEqual({
      text: "Zoom in on a country, or tap one below, to see its subregions.",
      retry: false,
    });
  });

  it("One country before the focus country's subregions draw", () => {
    expect(detailStatus({ ...base, depthVisible: false })).toEqual({
      text: "Zoom in to see France's subregions.",
      retry: false,
    });
    // Also what a focus country with no subregions on screen gets (Baden at
    // z9: its regions have no tier >= 2 places). A known wording limit, kept
    // until the owner approves a sentence for it.
    expect(detailStatus({ ...base, focusName: "Germany", depthVisible: false }).text).toBe(
      "Zoom in to see Germany's subregions.",
    );
  });

  it("One country with subregions drawn", () => {
    expect(detailStatus(base)).toEqual({ text: "Subregions: France.", retry: false });
    expect(detailStatus({ ...base, otherCountriesInView: true })).toEqual({
      text: "Subregions: France. Other countries show regions only.",
      retry: false,
    });
  });

  it("uses the name as displayed, local or English", () => {
    expect(detailStatus({ ...base, focusName: "Deutschland" }).text).toBe(
      "Subregions: Deutschland.",
    );
  });
});
```

- [ ] **Step 2: Run the test and see it fail.**
  Command: `npx vitest run src/lib/wine-map/detail-status.test.ts`
  Expected: FAIL with `Error: Failed to resolve import "./detail-status" from "src/lib/wine-map/detail-status.test.ts". Does the file exist?`

- [ ] **Step 3: Implement.** Create `src/lib/wine-map/detail-status.ts`:

```ts
// The one-line status under the Map detail switch (spec 2026-09-23 §7.1). It
// says in words what the map is doing: which country has subregions, why none
// has, or that All countries is on and costs more. Switching modes always
// changes it at once, so the switch never looks broken at a zoom where the map
// itself would not change. The copy is owner-approved and pinned by
// detail-status.test.ts. Change it there first.

/** The owner's warning for All countries, verbatim. It is shown in the status
    line while All is on, and it is the All option's accessible description. */
export const DETAIL_WARNING = "Uses more resources and can cause lag.";

export type DetailStatus = { text: string; retry: boolean };

/**
 * `focusName` is the focus country as the viewer sees it (local or English).
 * `depthVisible` means the map's scan saw that country's tier >= 2 features
 * on screen. `retry` asks the UI for a Retry button beside the text.
 *
 * Known wording limitation (raised with the owner): the place tree carries no
 * min_zoom, so "not drawn yet" and "none here" look the same. A focus country
 * whose on-screen regions have no tier >= 2 places (Baden, Franken, Navarra,
 * Saale-Unstrut and Württemberg today) keeps "Zoom in to see {F}'s
 * subregions." at every zoom, because the approved copy has no sentence for
 * "none here".
 */
export function detailStatus(input: {
  tree: "loading" | "ready" | "failed";
  detail: "one" | "all";
  fellBack: boolean;
  focusName: string | null;
  depthVisible: boolean;
  otherCountriesInView: boolean;
}): DetailStatus {
  if (input.tree === "loading") return { text: "", retry: false };
  if (input.tree === "failed") {
    return { text: "Subregion detail couldn't load.", retry: true };
  }
  if (input.fellBack) {
    return { text: "Switched to One country after a problem last time.", retry: false };
  }
  if (input.detail === "all") {
    return { text: `Subregions for all countries. ${DETAIL_WARNING}`, retry: false };
  }
  if (!input.focusName) {
    return {
      text: "Zoom in on a country, or tap one below, to see its subregions.",
      retry: false,
    };
  }
  if (!input.depthVisible) {
    return { text: `Zoom in to see ${input.focusName}'s subregions.`, retry: false };
  }
  return {
    text: input.otherCountriesInView
      ? `Subregions: ${input.focusName}. Other countries show regions only.`
      : `Subregions: ${input.focusName}.`,
    retry: false,
  };
}
```

- [ ] **Step 4: Run the test and see it pass.**
  Command: `npx vitest run src/lib/wine-map/detail-status.test.ts`
  Expected: PASS, every test in the file.

- [ ] **Step 5: Types and lint.**
  Commands: `npx tsc --noEmit`, then `npx eslint src/lib/wine-map/detail-status.ts src/lib/wine-map/detail-status.test.ts`
  Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/wine-map/detail-status.ts src/lib/wine-map/detail-status.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): Map detail status line copy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Chip list and chip camera box (`country-chips.ts`, `camera-fit.ts`)

**Files:**
- Create: `src/lib/wine-map/country-chips.ts`
- Create: `src/lib/wine-map/country-chips.test.ts`
- Create: `src/lib/wine-map/camera-fit.ts`
- Create: `src/lib/wine-map/camera-fit.test.ts`

**Interfaces:**
- Consumes:
  - `type WinePlaceTreeNode` from `./tree`, and `englishName` from `./localize-names`.
  - `type Bbox` from `./shard-specs`.
  - `SHARD_MIN_ZOOM` and `countryOfShard` from `./mount-policy`.
- Produces:
  ```ts
  // country-chips.ts
  export type CountryChip = { key: string; label: string; lang: string | undefined; count: number | null };
  export function countryChips(roots: readonly WinePlaceTreeNode[], opts: { english: boolean; visibleKeys: readonly string[] | null }): CountryChip[];
  export function rovingIndex(key: string, index: number, count: number, orientation: "horizontal" | "both"): number | null; // additive
  export const CHIP_FADE_PX = 12;                                                                                     // additive
  export function chipScrollLeft(input: { chipLeft: number; chipWidth: number; scrollLeft: number; viewWidth: number }): number | null; // additive
  // camera-fit.ts
  export const CHIP_MIN_ZOOM = 5.5;
  export type CameraRequest = { bbox: Bbox; minZoom: number; nonce: number; stayIfVisible: string | null }; // + stayIfVisible (deviation)
  export function countryCameraBox(bboxes: readonly Bbox[]): Bbox | null;
  export function bboxesForCountry(shards: Readonly<Record<string, { bbox?: Bbox }>>,
    shardCountries: Readonly<Record<string, string>>, country: string): Bbox[];                       // additive
  export function chipFlightNeeded(input: { zoom: number; countriesInView: readonly string[]; stayIfVisible: string | null }): boolean; // additive
  ```

- [ ] **Step 1: Write the failing tests.** Create `src/lib/wine-map/country-chips.test.ts`:

```ts
// The country chip row (spec 2026-09-23 §7.1): countries only, ordered as the
// viewer reads them, a lang attribute on local names, and per-country counts
// while a grape filter is on. It also covers the row's keyboard and scroll
// arithmetic.
import { describe, expect, it } from "vitest";
import type { WinePlaceTreeNode } from "./tree";
import {
  CHIP_FADE_PX,
  chipScrollLeft,
  countryChips,
  rovingIndex,
} from "./country-chips";

function node(
  key: string,
  name: string,
  kind: string,
  tier: number,
  children: WinePlaceTreeNode[] = [],
): WinePlaceTreeNode {
  const cut = key.lastIndexOf(".");
  return {
    id: `id-${key}`,
    key,
    name,
    kind,
    tier,
    parent_key: cut > 0 ? key.slice(0, cut) : null,
    has_children: children.length > 0,
    children,
  };
}

// Roots as buildWinePlaceTree returns them (sorted by key), local names as in
// the catalogue. There is also one orphan: a verified place whose parent is
// unpublished is a root too, and it is not a country.
const ROOTS = [
  node("france", "France", "COUNTRY", 0, [node("france.bourgogne", "Bourgogne", "REGION", 1)]),
  node("germany", "Deutschland", "COUNTRY", 0, [node("germany.mosel", "Mosel", "REGION", 1)]),
  node("italy", "Italia", "COUNTRY", 0),
  node("italy.toscana.chianti-classico", "Chianti Classico", "APPELLATION", 2),
  node("portugal", "Portugal", "COUNTRY", 0),
  node("spain", "España", "COUNTRY", 0),
];

describe("countryChips", () => {
  it("lists countries only, in English order with English names", () => {
    const chips = countryChips(ROOTS, { english: true, visibleKeys: null });
    expect(chips.map((c) => c.label)).toEqual(["France", "Germany", "Italy", "Portugal", "Spain"]);
    expect(chips.map((c) => c.key)).toEqual(["france", "germany", "italy", "portugal", "spain"]);
    expect(chips.every((c) => c.lang === undefined)).toBe(true);
    expect(chips.every((c) => c.count === null)).toBe(true);
  });

  it("orders local names as they read, each tagged with its language", () => {
    const chips = countryChips(ROOTS, { english: false, visibleKeys: null });
    expect(chips.map((c) => c.label)).toEqual([
      "Deutschland",
      "España",
      "France",
      "Italia",
      "Portugal",
    ]);
    expect(chips.map((c) => c.lang)).toEqual(["de", "es", "fr", "it", "pt"]);
  });

  it("counts the visible places per country while a filter is on", () => {
    const visibleKeys = [
      "france",
      "france.bourgogne",
      "france.bourgogne.cote-de-nuits",
      "germany.mosel",
      "italy.toscana.chianti-classico",
    ];
    const chips = countryChips(ROOTS, { english: true, visibleKeys });
    expect(Object.fromEntries(chips.map((c) => [c.key, c.count]))).toEqual({
      france: 3,
      germany: 1,
      italy: 1,
      portugal: 0,
      spain: 0,
    });
    // Every visible key belongs to one country, so the chips add up to the badge.
    expect(chips.reduce((sum, c) => sum + (c.count ?? 0), 0)).toBe(visibleKeys.length);
  });

  it("is empty without a tree", () => {
    expect(countryChips([], { english: true, visibleKeys: null })).toEqual([]);
  });
});

describe("rovingIndex", () => {
  it("moves along a horizontal row, wrapping, with Home and End", () => {
    expect(rovingIndex("ArrowRight", 0, 5, "horizontal")).toBe(1);
    expect(rovingIndex("ArrowRight", 4, 5, "horizontal")).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 5, "horizontal")).toBe(4);
    expect(rovingIndex("ArrowLeft", 3, 5, "horizontal")).toBe(2);
    expect(rovingIndex("Home", 3, 5, "horizontal")).toBe(0);
    expect(rovingIndex("End", 1, 5, "horizontal")).toBe(4);
  });

  it("leaves vertical arrows and other keys to the page in a horizontal row", () => {
    expect(rovingIndex("ArrowDown", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex("ArrowUp", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex("Enter", 0, 5, "horizontal")).toBeNull();
    expect(rovingIndex(" ", 0, 5, "horizontal")).toBeNull();
  });

  it("takes all four arrows in a radio group", () => {
    expect(rovingIndex("ArrowDown", 0, 2, "both")).toBe(1);
    expect(rovingIndex("ArrowDown", 1, 2, "both")).toBe(0);
    expect(rovingIndex("ArrowUp", 0, 2, "both")).toBe(1);
    expect(rovingIndex("ArrowRight", 1, 2, "both")).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 2, "both")).toBe(1);
  });

  it("has nowhere to go in an empty row", () => {
    expect(rovingIndex("ArrowRight", 0, 0, "horizontal")).toBeNull();
  });
});

describe("chipScrollLeft", () => {
  it("leaves a chip that is clear of both faded edges alone", () => {
    expect(CHIP_FADE_PX).toBe(12);
    expect(chipScrollLeft({ chipLeft: 40, chipWidth: 70, scrollLeft: 0, viewWidth: 300 })).toBeNull();
  });

  it("centres a chip that is off to the right", () => {
    expect(chipScrollLeft({ chipLeft: 400, chipWidth: 80, scrollLeft: 0, viewWidth: 300 })).toBe(290);
    expect(chipScrollLeft({ chipLeft: 401, chipWidth: 81, scrollLeft: 0, viewWidth: 300 })).toBe(292);
  });

  it("scrolls back for a chip off to the left, never past the start", () => {
    expect(chipScrollLeft({ chipLeft: 100, chipWidth: 80, scrollLeft: 250, viewWidth: 300 })).toBe(0);
  });

  it("does nothing when the target is where the row already is", () => {
    expect(chipScrollLeft({ chipLeft: 6, chipWidth: 60, scrollLeft: 0, viewWidth: 300 })).toBeNull();
  });
});
```

  Create `src/lib/wine-map/camera-fit.test.ts`:

```ts
// Where a country chip flies (spec 2026-09-23 §7.3): the union of that
// country's shard bboxes, minus outliers such as Madeira, so a tap on
// Portugal lands on the mainland instead of a frame spanning the Atlantic.
// Bboxes are the live manifest's.
import { describe, expect, it } from "vitest";
import {
  bboxesForCountry,
  CHIP_MIN_ZOOM,
  chipFlightNeeded,
  countryCameraBox,
} from "./camera-fit";
import type { Bbox } from "./shard-specs";

const PORTUGAL: Bbox[] = [
  [-8.359, 40.136, -7.42, 40.875], // dao
  [-7.914, 40.923, -6.749, 41.557], // douro
  [-8.881, 40.763, -7.704, 42.154], // minho
  [-17.266, 32.633, -16.289, 33.107], // madeira
  [-8.583, 37.741, -6.987, 39.584], // alentejo
  [-8.746, 40.233, -8.303, 40.669], // bairrada
  [-9.261, 37.749, -8.13, 38.843], // peninsula-de-setubal
];

const FRANCE: Bbox[] = [
  [5.344, 46.398, 5.901, 47.039], // jura
  [8.575, 41.454, 9.49, 43.008], // corse
  [-2.023, 45.536, 4.109, 47.908], // loire
  [4.311, 43.669, 5.742, 45.521], // rhone
  [7.051, 47.79, 7.612, 48.701], // alsace
  [5.77, 45.464, 6.526, 46.399], // savoie
  [-1.06, 44.383, 0.313, 45.457], // bordeaux
  [4.705, 42.985, 6.86, 43.916], // provence
  [3.609, 46.243, 5.005, 47.885], // bourgogne
  [3.137, 47.924, 4.9, 49.455], // champagne
  [-1.366, 43.131, 2.568, 45.007], // sud-ouest
  [4.434, 45.836, 4.782, 46.282], // beaujolais
  [1.97, 42.435, 4.61, 43.906], // languedoc-roussillon
];

describe("countryCameraBox", () => {
  it("drops Madeira from Portugal (centre 11.4 deg away against a 1.24 median)", () => {
    expect(countryCameraBox(PORTUGAL)).toEqual([-9.261, 37.741, -6.749, 42.154]);
  });

  it("keeps Corse in France (5.8 deg against a 2.8 median, under the 3x cut)", () => {
    expect(countryCameraBox(FRANCE)).toEqual([-2.023, 41.454, 9.49, 49.455]);
  });

  it("handles the small cases", () => {
    expect(countryCameraBox([])).toBeNull();
    expect(countryCameraBox([[1, 2, 3, 4]])).toEqual([1, 2, 3, 4]);
    expect(
      countryCameraBox([
        [0, 0, 1, 1],
        [2, 2, 3, 3],
      ]),
    ).toEqual([0, 0, 3, 3]);
    // Two shards at one place and a third far off: the far one is the outlier.
    expect(
      countryCameraBox([
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [20, 20, 21, 21],
      ]),
    ).toEqual([0, 0, 1, 1]);
  });
});

describe("bboxesForCountry", () => {
  it("collects that country's shard bboxes in key order, skipping shards without one", () => {
    const shards = {
      minho: { bbox: [-8.881, 40.763, -7.704, 42.154] as Bbox },
      alsace: { bbox: [7.051, 47.79, 7.612, 48.701] as Bbox },
      douro: { bbox: [-7.914, 40.923, -6.749, 41.557] as Bbox },
      legacy: {},
    };
    const countries = { minho: "portugal", douro: "portugal", alsace: "france", legacy: "portugal" };
    expect(bboxesForCountry(shards, countries, "portugal")).toEqual([
      [-7.914, 40.923, -6.749, 41.557],
      [-8.881, 40.763, -7.704, 42.154],
    ]);
    expect(bboxesForCountry(shards, countries, "spain")).toEqual([]);
  });
});

describe("chipFlightNeeded", () => {
  it("lands deep enough for regions and first subregions to load", () => {
    expect(CHIP_MIN_ZOOM).toBe(5.5);
  });

  it("stays put for a country already on screen at shard zoom", () => {
    const req = { countriesInView: ["france", "germany"], stayIfVisible: "germany" };
    expect(chipFlightNeeded({ ...req, zoom: 9 })).toBe(false);
    expect(chipFlightNeeded({ ...req, zoom: 5 })).toBe(false);
  });

  it("flies below shard zoom, for a country off screen, and whenever it may not stay", () => {
    expect(chipFlightNeeded({ zoom: 4.4, countriesInView: ["france"], stayIfVisible: "france" })).toBe(true);
    expect(chipFlightNeeded({ zoom: 9, countriesInView: ["france"], stayIfVisible: "italy" })).toBe(true);
    expect(chipFlightNeeded({ zoom: 9, countriesInView: ["france"], stayIfVisible: null })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and see them fail.**
  Command: `npx vitest run src/lib/wine-map/country-chips.test.ts src/lib/wine-map/camera-fit.test.ts`
  Expected: FAIL with `Failed to resolve import "./country-chips"` and `Failed to resolve import "./camera-fit"`.

- [ ] **Step 3: Implement.** Create `src/lib/wine-map/country-chips.ts`:

```ts
// The country chip row under the Map detail switch (spec 2026-09-23 §7.1).
// The rule and the arithmetic are here, and the component only renders. Chips
// come from the place tree's roots, but only those of kind COUNTRY. A
// verified place whose parent is unpublished is a root too.
import type { WinePlaceTreeNode } from "./tree";
import { englishName } from "./localize-names";

export type CountryChip = {
  key: string;
  label: string;
  /** Set on a local name, so a screen reader says "Deutschland" in German. */
  lang: string | undefined;
  /** Visible places in this country under the active filter; null = no filter. */
  count: number | null;
};

// The language of each country's local name, by canonical key.
const LOCAL_LANG: Record<string, string> = {
  france: "fr",
  germany: "de",
  italy: "it",
  portugal: "pt",
  spain: "es",
};

/** The chips in the order the viewer reads them: collated on the DISPLAYED
    name in the active label language. The tree sorts by key (france, germany,
    …), which in local mode reads "France, Deutschland, Italia, …", alphabetical
    in neither language. */
export function countryChips(
  roots: readonly WinePlaceTreeNode[],
  opts: { english: boolean; visibleKeys: readonly string[] | null },
): CountryChip[] {
  let counts: Map<string, number> | null = null;
  if (opts.visibleKeys) {
    counts = new Map();
    for (const key of opts.visibleKeys) {
      const country = key.split(".", 1)[0];
      counts.set(country, (counts.get(country) ?? 0) + 1);
    }
  }
  const collator = new Intl.Collator(opts.english ? "en" : undefined);
  return roots
    .filter((root) => root.kind === "COUNTRY")
    .map((root) => ({
      key: root.key,
      label: opts.english ? englishName(root.name) : root.name,
      lang: opts.english ? undefined : LOCAL_LANG[root.key],
      count: counts ? (counts.get(root.key) ?? 0) : null,
    }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

/** Roving-tabindex keys. In a horizontal row (the chips), Left/Right move and
    Up/Down are left to the page. In a radio group, all four arrows move, per
    the WAI-ARIA radio pattern. Both wrap, and both take Home/End. Null = not
    ours. */
export function rovingIndex(
  key: string,
  index: number,
  count: number,
  orientation: "horizontal" | "both",
): number | null {
  if (count <= 0) return null;
  const vertical = orientation === "both";
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "ArrowDown":
      return vertical ? (index + 1) % count : null;
    case "ArrowUp":
      return vertical ? (index - 1 + count) % count : null;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Width of the chip row's faded edges (its mask gradient). A chip under a
    fade counts as out of view. */
export const CHIP_FADE_PX = 12;

/** Where to scroll the chip row so a chip sits clear of the faded edges:
    centred, clamped at the start. Null = leave the row alone. */
export function chipScrollLeft(input: {
  chipLeft: number;
  chipWidth: number;
  scrollLeft: number;
  viewWidth: number;
}): number | null {
  const { chipLeft, chipWidth, scrollLeft, viewWidth } = input;
  const visible =
    chipLeft - CHIP_FADE_PX >= scrollLeft &&
    chipLeft + chipWidth + CHIP_FADE_PX <= scrollLeft + viewWidth;
  if (visible) return null;
  const target = Math.max(0, Math.round(chipLeft - (viewWidth - chipWidth) / 2));
  return target === Math.round(scrollLeft) ? null : target;
}
```

  Create `src/lib/wine-map/camera-fit.ts`:

```ts
// The camera side of a country chip (spec 2026-09-23 §7.3). A chip is a
// focus-and-camera action with its own request, not a selection. A country
// selection caps the camera at z4.5 (its children are regions, min_zoom 4),
// below the z5 shard floor, so it could never show a subregion.
import type { Bbox } from "./shard-specs";
import { countryOfShard, SHARD_MIN_ZOOM } from "./mount-policy";

/** A chip flight never lands shallower than this. At z5.5 the country's
    shards are mounted and its regions load, and Italy's and Portugal's first
    subregions (min_zoom 5) are already drawn. */
export const CHIP_MIN_ZOOM = 5.5;

/** A camera move a chip asks for. `nonce` makes a repeat tap fly again (the
    selection camera is memoised on context and cannot repeat). A non-null
    `stayIfVisible` names a country: TileWineMap skips the move when that
    country's wine ground is already on screen at shard zoom, which it judges
    at apply time from its live zoom. */
export type CameraRequest = {
  bbox: Bbox;
  minZoom: number;
  nonce: number;
  stayIfVisible: string | null;
};

// A shard whose centre is further than this many times the median distance
// from the median centre is an outlier: Madeira sits 11.4 deg off mainland
// Portugal against a 1.2 deg median, while Corse sits 5.8 against France's 2.8.
const OUTLIER_FACTOR = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The box a chip flies to: the union of the country's shard bboxes, without
    outliers. At least half the shards always survive, since their distance is
    at most the median. Null for no bboxes. */
export function countryCameraBox(bboxes: readonly Bbox[]): Bbox | null {
  if (bboxes.length === 0) return null;
  const centres = bboxes.map(
    ([minX, minY, maxX, maxY]) => [(minX + maxX) / 2, (minY + maxY) / 2] as const,
  );
  const mx = median(centres.map(([x]) => x));
  const my = median(centres.map(([, y]) => y));
  const distances = centres.map(([x, y]) => Math.hypot(x - mx, y - my));
  const limit = OUTLIER_FACTOR * median(distances);
  const kept = bboxes.filter((_, i) => distances[i] <= limit);
  return [
    Math.min(...kept.map((b) => b[0])),
    Math.min(...kept.map((b) => b[1])),
    Math.max(...kept.map((b) => b[2])),
    Math.max(...kept.map((b) => b[3])),
  ];
}

/** One country's shard bboxes from the manifest, in key order. */
export function bboxesForCountry(
  shards: Readonly<Record<string, { bbox?: Bbox }>>,
  shardCountries: Readonly<Record<string, string>>,
  country: string,
): Bbox[] {
  const out: Bbox[] = [];
  for (const key of Object.keys(shards).sort()) {
    const bbox = shards[key].bbox;
    if (bbox && countryOfShard(shardCountries, key) === country) out.push(bbox);
  }
  return out;
}

/** Whether a chip's camera request should move the map. The country is
    already showing if its wine ground is on screen and the map is at shard
    zoom. Then focus switches in place, and a flight would only throw away
    where the viewer is. */
export function chipFlightNeeded(input: {
  zoom: number;
  countriesInView: readonly string[];
  stayIfVisible: string | null;
}): boolean {
  if (input.stayIfVisible === null) return true;
  return !(input.zoom >= SHARD_MIN_ZOOM && input.countriesInView.includes(input.stayIfVisible));
}
```

- [ ] **Step 4: Run the tests and see them pass.**
  Command: `npx vitest run src/lib/wine-map/country-chips.test.ts src/lib/wine-map/camera-fit.test.ts`
  Expected: PASS, both files.

- [ ] **Step 5: Types and lint.**
  Commands: `npx tsc --noEmit`, then `npx eslint src/lib/wine-map/country-chips.ts src/lib/wine-map/country-chips.test.ts src/lib/wine-map/camera-fit.ts src/lib/wine-map/camera-fit.test.ts`
  Expected: clean.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/wine-map/country-chips.ts src/lib/wine-map/country-chips.test.ts src/lib/wine-map/camera-fit.ts src/lib/wine-map/camera-fit.test.ts
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): country chip list and chip camera box" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Toolbar UI and plumbing

**Files:**
- Create: `src/app/knowledge/map/map-detail-controls.tsx`
- Create: `src/app/knowledge/map/country-chips.tsx`
- Modify: `src/app/knowledge/map/tile-wine-map-explorer.tsx`:
  - imports and detail state after `chooseLang`;
  - `select()` and the deep-link branch clear the chip;
  - chip, status and camera logic before `const article =`;
  - the toolbar `mb-3` becomes `mb-2`;
  - the two new rows go before the map container;
  - the full-view height;
  - new `TileWineMap` props.
- Modify: `src/app/knowledge/map/tile-wine-map.tsx`:
  - the `cameraRequest` and `onDetailReport` props;
  - the `depthCountries` state, and `scanView`'s lost-context guard and depth collection;
  - deep flags per mode;
  - the report effect;
  - the camera-request effect and its replay on load.

**Interfaces:**
- Consumes:
  - `useDetailMode` and `type DetailMode` (Task 20); `detailStatus`, `DETAIL_WARNING` and `type DetailStatus` (Task 21).
  - `countryChips`, `rovingIndex`, `chipScrollLeft` and `type CountryChip` (Task 22).
  - `countryCameraBox`, `bboxesForCountry`, `chipFlightNeeded`, `CHIP_MIN_ZOOM` and `type CameraRequest` (Task 22).
  - `chipAfterReport`, `chipOnTap`, `deepCountriesFor`, `type ChipFocus` and `type DetailReport` (Task 19).
  - `treeLoad` and `dispatchTree` (Task 4's `useReducer(treeLoadReducer, INITIAL_TREE_LOAD)`). Task 4 has no named retry handler, so the status line's Retry dispatches `{ type: "retry" }` inline, exactly as the tree card's Retry does.
  - `countryOfShard`, `keepAcrossSync` and `mountTarget` from `mount-policy` (Tasks 18-19); `allModeHealthy` (Task 20) is already imported.
- Produces:
  - `MapDetailControls({ mode, onModeChange, status, onRetry })` and `CountryChips({ chips, markedKey, loading, onChoose })`.
  - New `TileWineMap` props: `detail`, `chipCountry`, `cameraRequest`, `onDetailReport`, `onContextLost` and `onHealthy`. `detail` and `chipCountry` came in Task 19, and the two callbacks in Task 20.

This task adds no new pure rule. Every rule it wires is pinned by the tests of Tasks 18-22. What is left is markup and plumbing, checked by the full suite, types, lint, the build and the browser.

- [ ] **Step 1: Create `src/app/knowledge/map/map-detail-controls.tsx`:**

```tsx
"use client";

// The Map detail switch and its status line (spec 2026-09-23 §7.1). It is one
// tap between One country and All countries, and it lives in the toolbar, not
// on the map canvas. The status line says in words what the map is doing. It
// keeps a two-line height whatever it says, so the map below never moves when
// the text changes after a gesture.
import { useId, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { rovingIndex } from "@/lib/wine-map/country-chips";
import type { DetailMode } from "@/lib/wine-map/detail-mode";
import { DETAIL_WARNING, type DetailStatus } from "@/lib/wine-map/detail-status";

const OPTIONS: readonly { value: DetailMode; label: string }[] = [
  { value: "one", label: "One country" },
  { value: "all", label: "All countries" },
];

export function MapDetailControls({
  mode,
  onModeChange,
  status,
  onRetry,
}: {
  mode: DetailMode;
  onModeChange: (mode: DetailMode) => void;
  status: DetailStatus;
  /** Re-requests the place tree when the status offers a Retry. */
  onRetry: () => void;
}) {
  const warningId = useId();
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  // The WAI-ARIA radio group pattern. Only the checked radio is in the tab
  // order. Arrows move focus AND choose, wrapping. Home/End jump.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(event.key, index, OPTIONS.length, "both");
    if (next === null) return;
    event.preventDefault();
    radios.current[next]?.focus();
    onModeChange(OPTIONS[next].value);
  };
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
      <div
        role="radiogroup"
        aria-label="Map detail"
        className="flex shrink-0 items-center rounded-md border border-border p-0.5 text-xs"
      >
        {OPTIONS.map((option, index) => {
          const checked = option.value === mode;
          return (
            <button
              key={option.value}
              ref={(element) => {
                radios.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              aria-describedby={option.value === "all" ? warningId : undefined}
              title={option.value === "all" ? DETAIL_WARNING : undefined}
              onClick={() => onModeChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "min-h-11 rounded px-2 py-1 transition-colors md:min-h-0",
                // Shape as well as colour. Bordeaux on the dark card is only
                // 1.3:1, so in dark mode the ring (foreground, ~14.7:1 in both
                // themes) and the weight mark the choice.
                checked
                  ? "bg-primary font-semibold text-primary-foreground ring-2 ring-inset ring-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {/* Always in the DOM. The All radio's description has to exist while One
          is checked, which is exactly when it is read. */}
      <span id={warningId} className="sr-only">
        {DETAIL_WARNING}
      </span>
      <div className="flex min-h-8 flex-1 basis-56 items-center gap-2 text-xs leading-4 text-muted-foreground">
        <p role="status" aria-live="polite">
          {status.text}
        </p>
        {status.retry ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full border border-border px-2.5 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/knowledge/map/country-chips.tsx`:**

```tsx
"use client";

// Country chips (spec 2026-09-23 §7.1, §7.3). A tap focuses a country's
// subregions without selecting it, so the details panel and ?place= stay. It
// flies there only when the country is off screen. The row is a single tab
// stop (roving tabindex, arrows move) in one scrolling line with faded edges.
// The chip whose subregions are actually drawn is marked by shape, a glyph and
// an sr-only phrase, never by aria-pressed: these are navigation, not toggles.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chipScrollLeft,
  rovingIndex,
  type CountryChip,
} from "@/lib/wine-map/country-chips";

const SKELETON_CHIPS = 5;

/** Scroll the row, not the page, so a chip sits clear of the faded edges. The
    page column is itself a scroll container, and scrollIntoView would move it
    too. */
function scrollChipIntoView(scroller: HTMLElement, chip: HTMLElement) {
  const left = chipScrollLeft({
    chipLeft: chip.offsetLeft,
    chipWidth: chip.offsetWidth,
    scrollLeft: scroller.scrollLeft,
    viewWidth: scroller.clientWidth,
  });
  if (left === null) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
}

export function CountryChips({
  chips,
  markedKey,
  loading,
  onChoose,
}: {
  chips: CountryChip[];
  /** The country whose subregions are drawn right now (One country only). */
  markedKey: string | null;
  /** The place tree is still loading: placeholders hold the row's height. */
  loading: boolean;
  onChoose: (key: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  // The tab stop is the last chip the viewer moved to, else the marked one,
  // else the first.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const has = (key: string | null): key is string =>
    key !== null && chips.some((chip) => chip.key === key);
  const tabKey = has(activeKey)
    ? activeKey
    : has(markedKey)
      ? markedKey
      : (chips[0]?.key ?? null);

  // A focus that moves to a country whose chip is scrolled out of sight (a pan
  // across a border, a chip flight landing) brings that chip into view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = markedKey ? chipRefs.current.get(markedKey) : undefined;
    if (scroller && chip) scrollChipIntoView(scroller, chip);
  }, [markedKey, chips]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(event.key, index, chips.length, "horizontal");
    if (next === null) return;
    event.preventDefault();
    const key = chips[next].key;
    setActiveKey(key);
    const chip = chipRefs.current.get(key);
    if (!chip) return;
    chip.focus({ preventScroll: true });
    if (scrollerRef.current) scrollChipIntoView(scrollerRef.current, chip);
  };

  const empty = loading || chips.length === 0;
  return (
    <div
      ref={scrollerRef}
      role="toolbar"
      aria-label="Countries"
      aria-hidden={empty ? true : undefined}
      className="no-scrollbar relative flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%_-_12px),transparent)] md:h-8"
    >
      {loading
        ? Array.from({ length: SKELETON_CHIPS }, (_, i) => (
            <span key={i} className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          ))
        : chips.map((chip, index) => {
            const marked = chip.key === markedKey;
            return (
              <button
                key={chip.key}
                ref={(element) => {
                  if (element) chipRefs.current.set(chip.key, element);
                  else chipRefs.current.delete(chip.key);
                }}
                type="button"
                tabIndex={chip.key === tabKey ? 0 : -1}
                onFocus={() => setActiveKey(chip.key)}
                onClick={() => onChoose(chip.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors md:h-7",
                  marked
                    ? "border-foreground font-semibold text-foreground ring-1 ring-foreground"
                    : "border-border font-medium text-muted-foreground hover:text-foreground",
                  chip.count === 0 ? "opacity-50" : "",
                )}
              >
                {marked ? <Layers className="size-3.5" aria-hidden /> : null}
                <span lang={chip.lang}>{chip.label}</span>
                {chip.count !== null ? (
                  <span className="tabular-nums text-muted-foreground">
                    {chip.count}
                    <span className="sr-only"> places</span>
                  </span>
                ) : null}
                {marked ? <span className="sr-only">, subregions shown</span> : null}
              </button>
            );
          })}
    </div>
  );
}
```

- [ ] **Step 3: `TileWineMap` — the report, the deep flags and the chip camera.** In `src/app/knowledge/map/tile-wine-map.tsx`:

  (a) Imports. Replace the Task 19 `focus` import:

```ts
import {
  centreCountryFrom,
  countryShares,
  nextFocusCountry,
} from "@/lib/wine-map/focus";
```

  with:

```ts
import {
  centreCountryFrom,
  countryShares,
  deepCountriesFor,
  nextFocusCountry,
  type DetailReport,
} from "@/lib/wine-map/focus";
import { chipFlightNeeded, type CameraRequest } from "@/lib/wine-map/camera-fit";
```

  and replace the `mount-policy` import Task 19 left, `import { keepAcrossSync, mountTarget } from "@/lib/wine-map/mount-policy";`, with:

```ts
import { countryOfShard, keepAcrossSync, mountTarget } from "@/lib/wine-map/mount-policy";
```

  (b) Props. Old (destructuring):

```ts
  manifest,
  selectedKey,
```

  New:

```ts
  cameraRequest = null,
  onDetailReport,
  manifest,
  selectedKey,
```

  Old (the props type):

```ts
  manifest: WineMapManifest;
```

  New:

```ts
  /** A country chip's camera move (lib/wine-map/camera-fit). Each new nonce
      is applied once. */
  cameraRequest?: CameraRequest | null;
  /** Focus, depth and countries on screen, reported whenever one of them
      changes. The explorer's status line and chips read it. */
  onDetailReport?: (report: DetailReport) => void;
  manifest: WineMapManifest;
```

  (c) Depth state. Old:

```ts
  const [rampedRegions, setRampedRegions] = useState<string[]>([]);
```

  New:

```ts
  const [rampedRegions, setRampedRegions] = useState<string[]>([]);
  // Countries whose tier >= 2 features the last scan saw on screen. "Subregions
  // shown" (the status line, the chip marker) is claimed only from this, never
  // from focus alone. Focus exists at every zoom, depth only once drawn.
  const [depthCountries, setDepthCountries] = useState<string[]>([]);
```

  (d) `scanView` survives a lost context and collects depth. First, the guard. `scanView` runs from `scheduleScan`'s 250 ms timer, and MapLibre 5.24's `_contextLost` sets `map.style = null` (`src/ui/map.ts`, line 3526) until the context is restored, so a scan pending at that moment would throw a `TypeError` from `getLayer` straight out of the timer. Old:

```ts
  const scanView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
```

  New:

```ts
  const scanView = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    // A lost WebGL context nulls map.style until MapLibre restores it.
    if (!map.style) return;
```

  Then the depth collection. Old:

```ts
    const levelsByRegion = new globalThis.Map<string, Set<string>>();
```

  New:

```ts
    const levelsByRegion = new globalThis.Map<string, Set<string>>();
    // Countries with subregion depth drawn in this frame.
    const depth = new Set<string>();
```

  Old:

```ts
      const region = typeof p.region === "string" ? p.region : null;
      if (region) regions.add(region);
```

  New:

```ts
      const region = typeof p.region === "string" ? p.region : null;
      if (region) regions.add(region);
      if (region && typeof p.tier === "number" && p.tier >= 2) {
        const country = countryOfShard(shardCountries, region);
        if (country) depth.add(country);
      }
```

  Old:

```ts
    const next = {
      scanned: true,
```

  New:

```ts
    const depthList = [...depth].sort();
    setDepthCountries((prev) =>
      prev.length === depthList.length && prev.every((c, i) => c === depthList[i])
        ? prev
        : depthList,
    );
    const next = {
      scanned: true,
```

  Then add `shardCountries` to `scanView`'s dependency array. Base was `}, [mountedShards, noFills]);`, which becomes `}, [mountedShards, noFills, shardCountries]);`. Keep any dependency Phase 1 added.

  (e) Deep flags per mode. In Task 11's `desiredGlobal` memo (it reads Task 11's `knownCountries` memo, declared just above it), old:

```ts
        deepCountries: focusCountry ? [focusCountry] : [],
        knownCountries,
      }),
    [visibleKeys, english, selectedKey, focusCountry, knownCountries],
```

  New:

```ts
        // All countries: every known country deep, so a pan never reloads a
        // shard. One country: the focus country alone.
        deepCountries: deepCountriesFor(detail, focusCountry, knownCountries),
        knownCountries,
      }),
    [visibleKeys, english, selectedKey, focusCountry, knownCountries, detail],
```

  (f) The report effect. Put it right after Task 20's `handleIdle`. Old (the end of `handleIdle`):

```ts
    healthPendingRef.current = false;
    onHealthyRef.current?.();
  }, [scheduleScan, mountedShards]);
```

  New:

```ts
    healthPendingRef.current = false;
    onHealthyRef.current?.();
  }, [scheduleScan, mountedShards]);

  // Report what the map is showing to the explorer, which owns the status
  // line and the chips. Focus and depth are replaced only on a real change,
  // so this fires only then, and a pan inside one country re-renders nothing
  // above the map.
  const onDetailReportRef = useRef(onDetailReport);
  useEffect(() => {
    onDetailReportRef.current = onDetailReport;
  }, [onDetailReport]);
  useEffect(() => {
    onDetailReportRef.current?.({
      focusCountry: focus.country,
      depthCountries,
      countriesInView: focus.inView,
    });
  }, [focus, depthCountries]);
```

  (g) The chip camera, after the existing `cameraTarget` effect. Old:

```ts
  useEffect(() => {
    if (!cameraTarget) return;
    if (!mapRef.current?.getMap()) {
      pendingCameraRef.current = cameraTarget;
      return;
    }
    applyCameraTarget(cameraTarget);
  }, [cameraTarget, applyCameraTarget]);
```

  New:

```ts
  useEffect(() => {
    if (!cameraTarget) return;
    if (!mapRef.current?.getMap()) {
      pendingCameraRef.current = cameraTarget;
      return;
    }
    applyCameraTarget(cameraTarget);
  }, [cameraTarget, applyCameraTarget]);

  // A country chip's camera move, kept apart from cameraTarget. It carries a
  // nonce, so a second tap on the same chip flies again (cameraTarget is
  // memoised on the selection's context and cannot repeat), and it never
  // selects anything. The nonce present at mount counts as already applied, so
  // a remount (the error boundary's Retry) does not replay an old flight.
  const appliedRequestRef = useRef(cameraRequest?.nonce ?? 0);
  const pendingRequestRef = useRef<CameraRequest | null>(null);
  const applyCameraRequest = useCallback((request: CameraRequest) => {
    const map = mapRef.current?.getMap();
    if (!map || !mapReadyRef.current) {
      pendingRequestRef.current = request;
      return;
    }
    if (
      !chipFlightNeeded({
        zoom: map.getZoom(),
        countriesInView: countriesInViewRef.current,
        stayIfVisible: request.stayIfVisible,
      })
    ) {
      return;
    }
    const [minX, minY, maxX, maxY] = request.bbox;
    const cam = map.cameraForBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 48 },
    );
    if (!cam) return;
    // No `essential: true`. Under prefers-reduced-motion MapLibre turns this
    // into a jump, which is what a chip tap should do there.
    map.easeTo({
      center: cam.center,
      zoom: Math.max(cam.zoom ?? 0, request.minZoom),
      duration: 900,
    });
  }, []);
  useEffect(() => {
    if (!cameraRequest || cameraRequest.nonce <= appliedRequestRef.current) return;
    appliedRequestRef.current = cameraRequest.nonce;
    applyCameraRequest(cameraRequest);
  }, [cameraRequest, applyCameraRequest]);
```

  (h) Replay a request that came in before load. In `onLoad`, old:

```ts
          // Replay a camera target that arrived before the map existed.
          const pending = pendingCameraRef.current;
          if (pending) {
            pendingCameraRef.current = null;
            applyCameraTarget(pending);
          }
```

  New:

```ts
          // Replay a camera target that arrived before the map existed.
          const pending = pendingCameraRef.current;
          if (pending) {
            pendingCameraRef.current = null;
            applyCameraTarget(pending);
          }
          // Same for a chip's camera request.
          const pendingRequest = pendingRequestRef.current;
          if (pendingRequest) {
            pendingRequestRef.current = null;
            applyCameraRequest(pendingRequest);
          }
```

- [ ] **Step 4: The explorer.** In `src/app/knowledge/map/tile-wine-map-explorer.tsx`:

  (a) Imports. Old:

```ts
import { WineMapTree } from "./wine-map-tree";
```

  New:

```ts
import { WineMapTree } from "./wine-map-tree";
import { MapDetailControls } from "./map-detail-controls";
import { CountryChips } from "./country-chips";
import { useDetailMode } from "@/lib/wine-map/detail-mode";
import { detailStatus } from "@/lib/wine-map/detail-status";
import { countryChips } from "@/lib/wine-map/country-chips";
import {
  bboxesForCountry,
  CHIP_MIN_ZOOM,
  countryCameraBox,
  type CameraRequest,
} from "@/lib/wine-map/camera-fit";
import {
  chipAfterReport,
  chipOnTap,
  type ChipFocus,
  type DetailReport,
} from "@/lib/wine-map/focus";
```

  (b) Detail state. Old:

```ts
  const chooseLang = (value: boolean) => writeEnglish(value);
```

  New:

```ts
  const chooseLang = (value: boolean) => writeEnglish(value);

  // Map detail (spec 2026-09-23 §7). One country by default and All countries
  // one tap away, remembered per browser. It is never in the URL, so a shared
  // ?place= link cannot put a phone into All. `fellBack` means this page was
  // put back in One country after All went wrong (lib/wine-map/detail-mode).
  const {
    mode: detail,
    fellBack,
    setMode: setDetail,
    dropToOne,
    confirmHealthy,
  } = useDetailMode();
  // What the map says it is showing, reported on change.
  const [report, setReport] = useState<DetailReport>(() => ({
    focusCountry: null,
    depthCountries: [],
    countriesInView: [],
  }));
  // A tapped country chip: focus without selection. The next real selection
  // clears it, and so does its country leaving the view after being on it.
  const [chipFocus, setChipFocus] = useState<ChipFocus | null>(null);
  // A chip's camera move. The nonce lets the same chip fly again.
  const [cameraRequest, setCameraRequest] = useState<CameraRequest | null>(null);
  const handleDetailReport = useCallback((next: DetailReport) => {
    setReport(next);
    setChipFocus((prev) => chipAfterReport(prev, next.countriesInView));
  }, []);
```

  (c) A real selection clears the chip. In `select()`, old:

```ts
      selectSourceRef.current = source;
```

  New:

```ts
      selectSourceRef.current = source;
      setChipFocus(null);
```

  In the deep-link branch, old:

```ts
      selectSourceRef.current = "ui";
      applyCachedSelection(deepLink.select);
      setSelectedKey(deepLink.select);
```

  New. The watermark lines above it are untouched:

```ts
      selectSourceRef.current = "ui";
      applyCachedSelection(deepLink.select);
      setSelectedKey(deepLink.select);
      setChipFocus(null);
```

  (d) Chips, status and the chip camera. Old:

```ts
  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
```

  New:

```ts
  // The tree's countries, in the label language's order, with per-country
  // counts while a grape filter is on.
  const chips = useMemo(
    () => countryChips(tree ?? [], { english, visibleKeys }),
    [tree, english, visibleKeys],
  );
  // One country: focus the country (no selection), and fly only if it is off
  // screen or the map is below shard zoom. TileWineMap judges that at apply
  // time from its live zoom. All countries: every country already has
  // subregions, so a chip is a plain jump and always flies.
  const chooseChip = useCallback(
    (country: string) => {
      if (detail === "one") {
        setChipFocus((prev) => chipOnTap(prev, country, report.countriesInView));
      }
      const bbox = manifest
        ? countryCameraBox(bboxesForCountry(manifest.shards, shardCountries, country))
        : null;
      if (!bbox) return;
      setCameraRequest((prev) => ({
        bbox,
        minZoom: CHIP_MIN_ZOOM,
        nonce: (prev?.nonce ?? 0) + 1,
        stayIfVisible: detail === "one" ? country : null,
      }));
    },
    [detail, manifest, report.countriesInView, shardCountries],
  );
  const focusName = useMemo(() => {
    const root = report.focusCountry
      ? (tree ?? []).find((node) => node.key === report.focusCountry)
      : undefined;
    if (!root) return null;
    return english ? englishName(root.name) : root.name;
  }, [report.focusCountry, tree, english]);
  // "Subregions shown" is claimed only once they are drawn, meaning the map's
  // scan saw tier >= 2 features of the focus country on screen.
  const depthShown =
    report.focusCountry !== null && report.depthCountries.includes(report.focusCountry);
  const detailLine = detailStatus({
    tree: treeLoad.state,
    detail,
    fellBack,
    focusName,
    depthVisible: depthShown,
    otherCountriesInView: report.countriesInView.some(
      (country) => country !== report.focusCountry,
    ),
  });
  const markedChip = detail === "one" && depthShown ? report.focusCountry : null;

  const article =
    context?.article && context.article.editorial_status !== "PLACEHOLDER"
```

  (e) The filter toolbar gives up 4px, so the new rows sit on one margin rhythm. Old:

```tsx
            <div className="mb-3 flex flex-wrap items-center gap-2">
```

  New:

```tsx
            <div className="mb-2 flex flex-wrap items-center gap-2">
```

  (f) The two new rows go before the map container. Old:

```tsx
            {/* Expanded on mobile needs a definite height: the lg full-view
```

  New:

```tsx
            {/* Map detail (spec 2026-09-23 §7.1): the One | All switch with its
                status line, then the country chips. Both rows hold a fixed
                height from first paint, so the map below never moves when the
                status text or the chip list changes. */}
            <div className="mb-3 flex shrink-0 flex-col gap-2">
              <MapDetailControls
                mode={detail}
                onModeChange={setDetail}
                status={detailLine}
                onRetry={() => dispatchTree({ type: "retry" })}
              />
              <CountryChips
                chips={chips}
                markedKey={markedChip}
                loading={treeLoad.state === "loading"}
                onChoose={chooseChip}
              />
            </div>
            {/* Expanded on mobile needs a definite height: the lg full-view
```

  (g) Full view below xl subtracts the new rows. Full view exists only from lg, and there both rows sit on one line:
  - the detail row is 32px;
  - the gap is 8px;
  - the chip row is 32px;
  - the wrapper margin is 12px;
  - the filter toolbar gave back 4px.

  That adds up to 80px = 5rem, on top of the old 7rem. Old:

```tsx
                  ? "h-[calc(100dvh-7rem)] xl:h-auto xl:min-h-0 xl:flex-1"
```

  New:

```tsx
                  ? "h-[calc(100dvh-12rem)] xl:h-auto xl:min-h-0 xl:flex-1"
```

  (h) `TileWineMap` props. Old:

```tsx
                onToggleExpanded={() => setExpanded((value) => !value)}
```

  New:

```tsx
                onToggleExpanded={() => setExpanded((value) => !value)}
                detail={detail}
                chipCountry={chipFocus?.country ?? null}
                cameraRequest={cameraRequest}
                onDetailReport={handleDetailReport}
                onContextLost={dropToOne}
                onHealthy={confirmHealthy}
```

- [ ] **Step 5: Full suite, types, lint and build.**
  Commands: `npx vitest run`, then `npx tsc --noEmit`, then `npx eslint src/app/knowledge/map/map-detail-controls.tsx src/app/knowledge/map/country-chips.tsx src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx`, then `npx next build`
  Expected:
  - vitest: every file passes (the Phase 1 total plus the six new Phase 2 files).
  - tsc and eslint: clean.
  - `next build`: succeeds.

- [ ] **Step 6: Manual verification (main session, browser, production build via the `start` config).**
  1. Open `/knowledge/map?debugClick=1` in a fresh profile.
     - Row 2 shows **One country** (checked, ring and semibold) | **All countries**.
     - At z4.4 the status reads "Zoom in to see France's subregions." or "Zoom in on a country, or tap one below, to see its subregions."
     - Row 3 lists France, Germany, Italy, Portugal and Spain (English), with no chip marked.
     - Nothing shifts vertically once the tree lands. Skeleton chips hold the row until then.
     - Reserved height, measured. Run `window.__canvasTop = [document.querySelector("canvas.maplibregl-canvas").getBoundingClientRect().top]` as soon as the canvas exists, while the status is still empty and the chips are skeletons. Push the same reading onto `window.__canvasTop` after the tree lands, after step 2's "Subregions: France.", after step 3's two-sentence line, and after step 6's All line. Expected at 1440 wide and at 375 wide: every value in `window.__canvasTop` is equal.
  2. Jump to Bourgogne with `window.__wineMap.jumpTo({ center: [4.84, 47.05], zoom: 9 })`. At z9 no other country is in the frame. At z7 Baden and the Aosta valley already are, and the line would add "Other countries show regions only."
     - The status becomes "Subregions: France.".
     - The France chip gets the Layers glyph and a ring.
  3. Jump to Colmar (7.36, 48.08) at z8.
     - Alsace's crus show, and the status reads "Subregions: France. Other countries show regions only."
  4. Tap **Italy** from there.
     - The map flies and lands at z5.5 or deeper, with no details panel change and no `?place=` change.
     - The status becomes "Subregions: Italy." once tiles land.
     - Pan back to France, then tap Italy again: it flies again.
  5. At Colmar z8, tap **Germany**. The camera does not move, and Baden's regions take focus.
  5b. Known wording limitation (record it for the owner, do not fix it here). Jump to Würzburg with `window.__wineMap.jumpTo({ center: [9.93, 49.79], zoom: 9 })`. Franken has no tier ≥ 2 places, so the status reads "Zoom in to see Germany's subregions." Zoom to z12: it still reads the same, and no chip is marked.
  6. Tap **All countries**.
     - The status reads "Subregions for all countries. Uses more resources and can cause lag." at once.
     - localStorage now has `wine-map-all-countries` = `1` and `wine-map-all-pending` = `1`.
     - Zoom to z6 and wait for idle. `wine-map-all-pending` is removed.
     - Reload. The page is still in All.
  7. Crash sentinel. Set both keys to `"1"` by hand and reload.
     - The page starts in One country with "Switched to One country after a problem last time."
     - Tapping **All countries** clears the line.
  8. Context loss. In All at z6 with `?debugClick=1`, run `window.__wineMap.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`.
     - The switch flips to One, and the fallback line shows.
     - No uncaught error reaches the console.
     - `…restoreContext()` redraws the map.
  9. Keyboard.
     - Tab reaches the checked radio, and ArrowRight/ArrowLeft switch the mode. ArrowDown/ArrowUp do too. Exactly one radio is tabbable: `document.querySelectorAll('[role="radiogroup"][aria-label="Map detail"] [tabindex="0"]').length` is `1`, and it is the one with `aria-checked="true"`.
     - The next Tab lands on one chip only: `document.querySelectorAll('[role="toolbar"][aria-label="Countries"] button[tabindex="0"]').length` is `1`, before and after moving along the row.
     - ArrowRight/ArrowLeft/Home/End move along the chips. The row scrolls, and `document.scrollingElement.scrollTop` and the page column's `scrollTop` stay unchanged. ArrowDown on a chip does not move focus. Enter taps.
     - Shift+Tab from the chip row returns to the checked radio, not to the other one.
  10. Pick a grape (Pinot Noir).
      - The chips show counts, and zero-count chips are dimmed.
      - The counts add up to the "N places" badge.
  11. Block `get_wine_place_tree` in DevTools and reload.
      - After the automatic retry, the status reads "Subregion detail couldn't load." with a **Retry** button.
      - No chips show, and the map still shows full depth in region colours.
      - Unblock, then Retry. The chips appear.
  12. Width 375 in both themes.
      - The rows wrap cleanly.
      - The checked radio and the marked chip are clearly distinguishable in dark mode.
  13. Width 1100.
      - Full view shows the legend and attribution without page scroll.

- [ ] **Step 7: Commit.**

```bash
git add src/app/knowledge/map/map-detail-controls.tsx src/app/knowledge/map/country-chips.tsx src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "feat(map): One country | All countries switch, status line and country chips" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Phase 2 verification and production deploy (main session)

**Files:**
- No repository file changes. Evidence (the probe's Copy-results JSON per run, screenshots) goes to the session scratchpad, written `$SCRATCH` below. Every command block sets it, because shell state does not persist between calls: `SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad`.
- Push: remote `master`, fast-forwarded to the branch head.

**Interfaces:**
- Consumes:
  - everything Tasks 18-23 built;
  - the probe (`?debugPerf=1`, Task 5): its live worst-frame/long-task overlay (last 10 s), **Run test** (`PROBE_SCRIPT`) and **Copy results**, whose JSON carries per-gesture frame columns, long tasks, `reloads` and the per-source reload breakdown;
  - `window.__wineMap` (`?debugClick=1`);
  - the `start` launch configuration (port 3000);
  - the session's `mint.mjs` (`$SCRATCH/mint.mjs <origin> <next>`), which prints a signed-in demo URL without a password.
- Produces: the Phase 2 production deploy, plus the measured numbers Task 25 Step 5 may quote.

Run by the main session only (Global Constraints). An implementer subagent stops before this task.

- [ ] **Step 1: Branch gate.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-mapdetail
git fetch origin
git status --short
git log --oneline origin/master..HEAD
git rev-parse origin/master > "$SCRATCH/phase2-pre-deploy.txt"
npx vitest run
npx tsc --noEmit
npx eslint src/lib/wine-map/mount-policy.ts src/lib/wine-map/mount-target.test.ts src/lib/wine-map/focus.ts src/lib/wine-map/focus.test.ts src/lib/wine-map/detail-mode.ts src/lib/wine-map/detail-mode.test.ts src/lib/wine-map/detail-status.ts src/lib/wine-map/detail-status.test.ts src/lib/wine-map/country-chips.ts src/lib/wine-map/country-chips.test.ts src/lib/wine-map/camera-fit.ts src/lib/wine-map/camera-fit.test.ts src/app/knowledge/map/map-detail-controls.tsx src/app/knowledge/map/country-chips.tsx src/app/knowledge/map/tile-wine-map.tsx src/app/knowledge/map/tile-wine-map-explorer.tsx
npx next build
```

  Expected:
  - `git status` shows no modified or staged tracked file. An untracked plan file is fine.
  - `git log` lists only the Phase 2 commits (Tasks 18-23, plus Task 25's if it was already made). `origin/master` is the Phase 1c deploy, so the Step 10 push is a fast-forward.
  - vitest reports 0 failures, with six more test files than at the Phase 1c deploy.
  - tsc and eslint are clean, and `next build` succeeds.

- [ ] **Step 2: Production run and session.**
  - Start the `start` launch configuration. Keep the Browser pane visible, because a hidden pane never hydrates (CLAUDE.md dev gotcha).
  - Mint a session with `node "$SCRATCH/mint.mjs" http://localhost:3000 "/knowledge/map?debugPerf=1&debugClick=1"` and open the printed URL.
  - Expected: the map loads, the probe overlay sits top-left, and the Map detail row shows **One country** checked.

- [ ] **Step 3: A1 in One country (default), with the first selection.**
  - Run the same protocol at two sizes: 455x628, and about 1400x850 in full view (desktop size, map expanded).
  - At each size do three cold runs. Reload the page, wait for idle, and press **Run test**. When it finishes, press **Copy results** and save the JSON as `$SCRATCH/phase2-one-<size>-<run>.json`, one file per run (`phase2-one-455-1.json` … `phase2-one-1400-3.json`).
  - Expected, as the median of the three runs for every gesture row (A1): longest task ≤ 50 ms and worst frame ≤ 100 ms.
  - On a plain load, the "Select Vosne-Romanée" row is the session's FIRST selection. Flipping `wm_has_sel` recompiles data-driven paint and reloads every mounted source once, which spec §5.2 accepts. Record its reload count.
  - That row must still meet A1. G1 ("a tree selection has no long task") is judged on the first selection here and on a later one in Step 5.

- [ ] **Step 4: A1 in All countries.**
  - Tap **All countries**. Run `window.__wineMap.jumpTo({ center: [2.4, 46.6], zoom: 6 })` and wait for idle. `localStorage.getItem("wine-map-all-pending")` is now `null`, which is the all-clear.
  - Repeat Step 3's 2 x 3 runs. Reloads stay in All. Save the files as `$SCRATCH/phase2-all-<size>-<run>.json`.
  - Expected: the same A1 thresholds on every row. In All, the first zoom to z5.5 mounts every shard in view, and the controller's 8 ms frame budget is what keeps it under 50 ms.
  - Tap **One country** before moving on. This clears both keys, so the next steps start from the default.

- [ ] **Step 5: A2 on a later selection.**
  - Open `/knowledge/map?debugPerf=1&place=france.bourgogne.cote-de-nuits`. The deep link is the session's first selection, so `wm_has_sel` is already on before the script runs.
  - Wait for idle, press **Run test**, and save the results as `$SCRATCH/phase2-a2.json`.
  - Expected: the "Select Vosne-Romanée" row reloads at most `wine-world` and `wine-shard-bourgogne` (A2). The previous selection (Côte de Nuits) and the new one both live in the bourgogne shard. The row also meets A1.
  - If the probe script has two selection rows, check the second one on a plain load against the same bound.

- [ ] **Step 6: The Phase 2 gestures (A1).** Use about 1400x850 full view, with `?debugPerf=1&debugClick=1`. For each gesture, read the probe's live worst frame and long tasks, then wait 10 s idle before the next one (the live buffer covers the last 10 s).
  1. Run `window.__wineMap.jumpTo({ center: [2.4, 46.6], zoom: 6 })`, wait for idle, then tap **All countries**. Expected: the status line changes at once. While the other countries' shards mount, no long task goes over 50 ms and no frame over 100 ms.
  2. Tap **One country**. Expected: the same thresholds. The other countries' shards unmount at once, because `keepAcrossSync` drops the keep.
  3. Run `window.__wineMap.jumpTo({ center: [7.36, 48.08], zoom: 8 })`, wait for idle, note `window.__wineMap.getCenter()`, then tap **Germany**. Expected: the centre is unchanged (Germany is on screen at shard zoom, so there is no flight). Baden has no tier ≥ 2 places, so the status reads "Zoom in to see Germany's subregions." and no chip is marked. Record this as the known wording limitation.
  4. From there, tap **Italy**. Italy is off screen at Colmar z8, so this flies. Do not test the flight from France z6: Piemonte is already in that frame, and the chip correctly stays put. Expected: the same thresholds during the flight and the mounts that follow. After landing, `window.__wineMap.getZoom() >= 5.5`, and the URL's `?place=` is unchanged.
  5. Go back to France z6 in All. Pick Pinot Noir, then clear it. Switch Local ↔ English. Flip the theme from the theme menu. Expected: each of these meets the same thresholds.
  - Tap **One country** again at the end.

- [ ] **Step 7: Behaviour checks on the production build.**
  - Focus under the map centre: jump to `[7.36, 48.08]` at z7.5 and click a vineyard. The `[wine-map click]` log shows `focusCountry: "france"`.
  - Grape counts: pick Pinot Noir. Each chip shows a count, the zero-count chips are dimmed, and the counts add up to the "N places" badge.
  - The status strings. Watch each of these appear, word for word:
    - "Zoom in on a country, or tap one below, to see its subregions." (`[-35, 45]` z5, open Atlantic with no wine ground in view)
    - "Zoom in to see France's subregions." (Bordeaux `[-0.58, 44.84]` z4.8: the region under the centre is French, and below z5 no shard is mounted)
    - "Subregions: France." (Bourgogne `[4.84, 47.05]` z9)
    - "Subregions: France. Other countries show regions only." (Colmar `[7.36, 48.08]` z8, Baden in view)
    - "Subregions for all countries. Uses more resources and can cause lag." (All)
    - "Switched to One country after a problem last time." (the sentinel check below)
  - Keyboard: one tab stop per group. `document.querySelectorAll('[role="radiogroup"][aria-label="Map detail"] [tabindex="0"]').length` and `document.querySelectorAll('[role="toolbar"][aria-label="Countries"] button[tabindex="0"]').length` are both `1`. The arrows switch the mode, and they move along the chips without scrolling the page.
  - At width 375, in light and in dark:
    - The rows wrap cleanly, and `document.documentElement.scrollWidth <= window.innerWidth`.
    - In dark, the checked radio and the marked chip are clearly told apart by their ring and weight.
  - Crash sentinel:
    - Run `localStorage.setItem("wine-map-all-countries", "1"); localStorage.setItem("wine-map-all-pending", "1")` and reload. The page starts in One country with the fallback line.
    - Tap **All countries**. The line clears.
    - Tap **One country** to reset.
  - Context loss:
    - In All at France z6, run `window.__wineMap.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`. The switch flips to One, the fallback line shows, and the console has no uncaught error.
    - Keep that extension object and call `restoreContext()` on it. The map redraws.
  - Known wording limitation: run `window.__wineMap.jumpTo({ center: [9.93, 49.79], zoom: 9 })` (Würzburg, Franken), then zoom to z12. The status reads "Zoom in to see Germany's subregions." at both zooms. Put this in the report to the owner, with the other shards that have no tier ≥ 2 places (baden, navarra, saale-unstrut, wuerttemberg). Only the owner can approve a new sentence.

- [ ] **Step 8: A3 screenshots.**
  - Baseline first, BEFORE the deploy, from the live site (Phase 1c). Run `node "$SCRATCH/mint.mjs" https://blindrapp.vercel.app "/knowledge/map?debugClick=1"`.
  - Capture each frame in light and in dark with `window.__wineMap.jumpTo(...)`:
    - France `[2.4, 46.6]` z5.5
    - Bourgogne `[4.84, 47.05]` z9
    - Vosne-Romanée `[4.955, 47.16]` z13, opened with `&place=france.bourgogne.cote-de-nuits.vosne-romanee.la-tache`
    - Colmar `[7.36, 48.08]` z9
    - Mosel `[7.07, 49.92]` z12
    - Champagne `[3.95, 49.04]` z10
    - Toscana `[11.25, 43.35]` z8
    - Baden `[8.2, 48.6]` z6
  - Capture the same set on the local build in One country.
  - Expected: the canvases match, apart from the new toolbar rows. Any difference must be one of spec §9's Phase 2 changes: focus follows the map centre, or a neighbour country's regions come from the world archive below z8. Note each difference and its §9 reason for the report to the owner.
  - In All countries, Colmar z9 and Toscana z8 match their One country shots. Each frame has only one country with tier ≥ 2 places in view.

- [ ] **Step 9: Failure injection on the local production build.**
  1. Block the request URL pattern `*get_wine_place_tree*` in DevTools and reload.
     - Expected: after the automatic retry (~2 s), the status reads "Subregion detail couldn't load." with **Retry**.
     - No chips show, and nothing errors.
     - Bourgogne z9 still shows full depth in region colours, and `?place=france.bourgogne.cote-de-nuits.vosne-romanee` still rings its place.
     - Unblock and press **Retry**: the chips appear.
  2. Block `*bourgogne.pmtiles*`, reload, and jump to Bourgogne z9.
     - Expected: the world archive keeps drawing the Bourgogne region, and the other shards load.
     - No uncaught error, and no "Retry map" card.
  3. At z4.4, run `window.__wineMap.easeTo({ zoom: 5.5, duration: 1000 })` and flip the theme within that second.
     - Expected: after idle, every shard is painted in the new theme, and focus depth and label language are unchanged.

- [ ] **Step 10: Deploy.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-mapdetail
git fetch origin
test "$(git rev-parse origin/master)" = "$(cat "$SCRATCH/phase2-pre-deploy.txt")" && echo "master unchanged since Step 1"
git push origin map-detail-modes:master
```

  Expected:
  - The script prints "master unchanged since Step 1".
  - The push reports a fast-forward (`<old>..<new>  map-detail-modes -> master`).
  - If the test prints nothing or the push is rejected, `master` moved. Stop, and bring the owner in before going further.
  - Never update the local `master` ref. It is checked out in the owner's checkout, which this work never touches.

  Then wait until Vercel shows the production deployment of `$(git rev-parse HEAD)` as Ready. Either check the Vercel dashboard, or read `gh api "repos/christianolin/blindtastingapp/deployments?sha=$(git rev-parse HEAD)" --jq '.[0].id'` and then `gh api "repos/christianolin/blindtastingapp/deployments/<that id>/statuses" --jq '.[0].state'`, which reads `success`.

- [ ] **Step 11: A5 smoke test on the live site.**
  - Run `node "$SCRATCH/mint.mjs" https://blindrapp.vercel.app "/knowledge/map?debugPerf=1"` and open the URL.
  - Expected:
    - The map loads with **One country** checked, and the chips appear.
    - The first zoom from z4.4 to 5.5 over France shows no long task in the probe's live overlay.
    - `?place=france.bourgogne.cote-de-nuits.vosne-romanee` rings its place and fills the details panel.
    - **All countries** and **One country** each change the status line at once.
  - Read the console errors. There should be none that the pre-deploy site did not already show. The single stale "useAddWine must be used within <AddWineProvider>" after a hash login is known (CLAUDE.md) and does not count.

- [ ] **Step 12: Only if Step 11 failed, revert Phase 2 as one commit and push.**

```bash
SCRATCH=/c/Users/chris/AppData/Local/Temp/claude/C--Users-Public-repos-blindtastingapp/af0a834e-4dbb-4957-b632-9e9d3890ff65/scratchpad
cd /c/Users/Public/repos/blindtastingapp-mapdetail
git revert --no-commit "$(cat "$SCRATCH/phase2-pre-deploy.txt")"..HEAD
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "revert: wine map Phase 2 (One country | All countries)" -m "Production smoke test (A5) failed; Phase 1c restored while it is diagnosed on the branch." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin map-detail-modes:master
```

  Then repeat Step 11's first two checks on the live site to confirm Phase 1c is back, and tell the owner which check failed. Re-landing Phase 2 later means reverting this revert on the branch.

- [ ] **Step 13: iPhone numbers (owner).**
  - Ask the owner to open the live `/knowledge/map?debugPerf=1` on the iPhone and press **Run test**, first in One country and then in All countries.
  - Ask them to paste **Copy results** for each run. Save the two results as `$SCRATCH/phase2-iphone-one.json` and `$SCRATCH/phase2-iphone-all.json`.
  - Target (spec §2): no frame over 100 ms in any scripted gesture. Safari has no long-task API, so the probe falls back to rAF frame deltas there.
  - Task 25 Step 5 may quote these worst frames, together with Step 3's first-zoom longest task at both sizes.

---

### Task 25: CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`:
  - line 11 (the Stack line);
  - insert a new top-level bullet right before `- **Wine Map dark mode** (2026-09-19, spec` (currently line 1457), which is after the last "Wine map performance" sub-bullet.

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Fix the Stack line.** Old:

```md
- Deployed to Vercel (not yet wired up).
```

  New:

```md
- Deployed on Vercel (blindrapp.vercel.app) and live with daily users: a push
  to `master` is a production deploy.
```

- [ ] **Step 2: Add the engine and mode bullet.** Old (the anchor line, kept):

```md
- **Wine Map dark mode** (2026-09-19, spec
```

  New. Insert the whole block below immediately before that line:

```md
- **Wine map engine and One country | All countries** (2026-09-23; spec
  `docs/superpowers/specs/2026-09-23-wine-map-one-country-all-countries-design.md`,
  plan `docs/superpowers/plans/2026-09-23-wine-map-one-country-all-countries.md`;
  shipped as four production deploys, 1a/1b/1c/2). The first zoom past z5 froze
  the page for 1.2-1.5 s. The cause, verified in MapLibre 5.24's source:
  `map.addLayer`/`map.addSource` (and so react-map-gl's `<Source>`/`<Layer>`)
  ALWAYS run `Style._validate`, which serializes the WHOLE style. So adding a
  layer costs more the bigger the style already is, and neither the
  `validateStyle` map option nor a `setStyle` diff avoids it. Every shard layer
  also carried a ~38 KB catalogue-wide colour expression. A replay of all 67
  shards took 3,101 ms through the public API and 13 ms with `validate: false`
  plus per-shard colours. The rules that keep it that way:
  - **Colours are per shard** (`src/lib/wine-map/shard-specs.ts`).
    `shardColorExpression` builds a shard's colour from its own region
    (`regionHue`) and its own area slugs (`areaSlugsByShard`): ~2 KB, not 38.
    World layers use `worldRegionColor`. The colours are byte-identical to the
    old ones, pinned by a sweep through MapLibre's own expression engine. Never
    put one catalogue-wide colour expression back on shard layers.
  - **Wine layer specs are static.** No React prop change rewrites a wine
    layer's filter, paint or layout. Dynamic inputs come in two kinds:
    - MapLibre global state (`src/lib/wine-map/map-state.ts`). The names are
      exactly `wm_keys` (grape gate), `wm_local` (Local/English),
      `wm_deep_<country>` (subregion depth), `wm_has_sel`, `wm_sel_key` and
      `wm_tick`.
    - Feature-state. `sel`/`child`/`rel` carry selection emphasis on shard
      sources with `promoteId: "key"`. `handed` sits on the world source,
      which keeps `promoteId: "region"`.

    A filter or layout that reads global state only reloads its source.
    Data-driven PAINT that reads it is recompiled, validated, and its source
    reloaded (`StyleLayer.setPaintProperty` asks for a relayout, and
    `Style._updateLayer` marks the source for reload). So the first selection
    of a session, which flips `wm_has_sel`, reloads every mounted source once;
    A2 ("a selection reloads only the world and the two selected shards") is
    measured on later selections. Everything else about a selection is
    feature-state, which reloads nothing. The grape gate's object map
    (`keyLookupMap`, still `== true`) now lives in `wm_keys` instead of a
    per-layer literal. Use null-safe shapes only: the gate starts with
    `["!", ["to-boolean", ["global-state","wm_keys"]]]`. Never use `has`, a
    `coalesce` to `{}`, or `["==", gs, null]`: each one hides every place
    while no grape is picked (the old "only France" bug). Global-state truth
    tables run through both the standalone style-spec and maplibre-gl's
    bundled engine (`src/lib/testing/bundled-style-engine.ts`), because they
    disagree on never-set names.
    Depth is one name PER COUNTRY. A focus flip then reloads two countries'
    shards, and All never reloads on a pan. The selected place's label is its
    own layer (`world-selected-label`, `shard-selected-label-<key>`). Other
    labels keep their size and collision priority on selection (owner, D4).
  - **`MapStateSync`** (`src/lib/wine-map/map-state-sync.ts`) is the only
    writer of global state and selection feature-state. It holds the desired
    state in a ref and runs one idempotent `apply()`: on load, synchronously
    inside `style.load`, and after React changes. The `style.load` call sits in
    try/catch, because a throw there turns a theme diff into MapLibre's full
    rebuild. It keeps its own readiness flag: `styledataloading` clears it and
    `load`/`style.load` set it. Never gate on `isStyleLoaded()`, which is false
    while tiles load. The full-rebuild fallback wipes global state and
    feature-state, so `apply()` keys what it has sent on the `map.style` object
    and re-sends everything after a rebuild. Never put a `state` block in a
    style handed to `setStyle`: every theme flip would reset all global state.
  - **`ShardController`** (`src/lib/wine-map/shard-controller.ts`) adds shard
    sources and layers with `map.style.addSource/addLayer(..., { validate: false })`.
    That is the one way here to add layers without the whole-style serialize.
    Runtime validation is therefore off, and every
    `shardLayerSpecs`/`shardOverlaySpecs` output is checked by
    `validateStyleMin` in vitest instead; add a case there for any new spec
    shape. How it works:
    - Adds run in batches of 8 ms per frame, the selected shard first, and only
      after the world layers exist.
    - Each shard is transactional: a throw rolls it back and skips it for the
      session.
    - The selected casing, ring and label overlays stay on top.
    - Removal calls `removeLayer`/`removeSource` directly. react-maplibre's
      unmount cloned the style with `getStyle()` once per source, ~110 ms.
    - Specs are built fresh at add time from the LANDED theme and never mutated
      after the add.
    - The ids are unchanged (`wine-shard-<key>`, `shard-fills-<key>`,
      `shard-outlines-<key>`, `shard-labels-<key>`), so `withWineLayers` still
      carries them across a theme swap.

    The engine leans on MapLibre 5.24 internals: `map.style.addLayer`'s
    `{ validate: false }` option and how it orders add and throw,
    `style._loaded`, `Style#_reloadSource` (the probe's reload counter) and
    the dev bundle's chunk markers (`bundled-style-engine.ts`). Any
    maplibre-gl bump, even a minor one, re-runs the engine tests and the
    `?debugPerf=1` protocol before it ships.
  - **One country | All countries** (owner, 2026-09-23). Nothing new sits on
    the map canvas. Two toolbar rows sit under the filter bar:
    - A `role="radiogroup"` "Map detail" (`map-detail-controls.tsx`) with a
      `role="status"` line. The status copy lives only in
      `src/lib/wine-map/detail-status.ts` and is pinned word for word by its
      test.
    - Country chips (`country-chips.tsx`): tree roots of kind COUNTRY, collated
      in the label language, with roving tabindex and per-country counts under
      a grape filter. They scroll with the scroller's own `scrollTo`, never
      `scrollIntoView`, because the page column is itself a scroll container.

    One country (the default) gives subregion depth to one focus country. It
    mounts other countries' shards only from z8 (`mountTarget`,
    `mount-policy.ts`); below that the world archive draws their regions
    identically. A mode change drops the 150% keep (`keepAcrossSync`), so
    switching to One unmounts the neighbours at once. All countries gives
    every country depth, and the status line always says "Uses more
    resources and can cause lag." while it is on.

    Focus (`nextFocusCountry`, `focus.ts`) goes, in order, to:
    1. a tapped chip whose country is on screen;
    2. the selected place's country while it is on screen;
    3. the country of the wine region under the map centre
       (`queryRenderedFeatures` on `world-region-fills`; this stopped Baden's
       huge bbox calling Colmar "Germany");
    4. the 0.6/0.45 share rule.

    A chip focuses WITHOUT selecting: the details panel and `?place=` stay. In
    One country it flies only when its country is off screen or the map is
    below z5. The flight is a `CameraRequest` with a nonce, lands at z5.5 or
    deeper, and drops outliers such as Madeira (`countryCameraBox`). In All
    countries a chip always flies. The chip marker and "Subregions: {country}."
    appear only once the idle scan has seen tier ≥ 2 features of that country
    on screen. The tree has no `min_zoom` (spec §7.3 assumed one), so "not
    drawn yet" and "none here" look the same. Over a region with no tier ≥ 2
    places (baden, franken, navarra, saale-unstrut, wuerttemberg) the line
    keeps saying "Zoom in to see {F}'s subregions." at every zoom. This is a
    known wording limitation, and new copy for it needs the owner's approval.
  - **Persistence and the crash-loop guard** (`src/lib/wine-map/detail-mode.ts`).
    The mode is stored in `safe-storage` flags only, never in the URL: a shared
    link must not put a phone into All. The flags:
    - `wine-map-all-countries` set = All.
    - `wine-map-all-pending` is set before All draws. It is cleared at the
      first idle at z ≥ 5 with shards mounted (`allModeHealthy`), or on
      `pagehide`.

    A load that finds the sentinel still set starts in One country and says
    "Switched to One country after a problem last time." The saved All stays
    until the viewer changes it. `webglcontextlost` drops the page to One for
    the session. A lost context also leaves `map.style` null until MapLibre
    restores it, so every imperative map call stays inside try/catch.
  - **Safety net and probe.**
    - `MapErrorBoundary` wraps the dynamic map. Any leftover throw, or a
      `ChunkLoadError` after a deploy, becomes the "Retry map" card.
    - The place tree retries once after 2 s. A failed tree never blanks the
      map: shards of an unknown country render full depth in region colours,
      and the status line offers Retry.
    - `?debugPerf=1` adds `perf-probe.tsx`. It shows the live worst frame and
      long tasks, runs a scripted **Run test**, and offers **Copy results**
      JSON. Safari/WebKit has no long-task API, so the probe falls back to rAF
      frame deltas there. It is how the iPhone numbers are taken.
```

- [ ] **Step 3: Check that the Markdown renders.** Command: `git diff --stat CLAUDE.md`
  Expected: `CLAUDE.md` is the only file changed. A skim of `git diff CLAUDE.md` shows the new block sitting right before "Wine Map dark mode", indented two spaces like its neighbours.

- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md
GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -m "docs: wine map engine and One country | All countries in CLAUDE.md" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push (main session only).**
  - This commit goes out with the Phase 2 deploy (Task 24 Step 10), or in a docs-only push right after Task 24 Step 11's smoke test passes.
  - The push command is `git push origin map-detail-modes:master`. It fast-forwards the remote `master`, and it is refused if `master` moved. Never update the local `master` ref, which is checked out in the owner's checkout.
  - If Task 24 recorded measured production numbers, add them to the "Wine map engine" bullet in the same commit before pushing: Step 3's first-zoom longest task at 455x628 and in full view, Step 3's first-selection row and Step 5's later-selection row, and Step 13's iPhone worst frames.

