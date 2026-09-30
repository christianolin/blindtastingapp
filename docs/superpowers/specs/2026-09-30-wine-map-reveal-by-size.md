# Wine map: small places appear later (final design)

> Copied into the repo on 2026-09-30 with the implementation (branch `map-reveal`). The evidence files it names
> (`reveal/final/*`, `before-*.png`) stayed in the session scratchpad and are not part of the repository.
>
> **Amended the same day after review: see §10 at the end.** Where §10 and the body disagree, §10 wins.
>
> **Built the same evening with the owner's decisions: see §11 at the end** (24 px; ribbons measured by their
> length; the tiles release switches the rule on). Where §11 disagrees with anything above it, §11 wins.

Owner, 2026-09-30, with a photo of the North Coast (Napa Valley selected, the Napa fit, about z7.5):

> "I think in general on the map you can see the small areas way too soon. You need to zoom further in before
> smaller places appear."

This is the judge's synthesis of three proposals (size-client, size-export and hierarchy-context). It is
implementable as written. It ships as **one app deploy**: no tiles release, no migration, no database write
and no neighbour-cache refresh. Nothing was built, pushed or applied while writing it.

Evidence is in `reveal/final/`:

- `exact.json`: one read-only SELECT against the live catalogue, release `20260930T132635Z`, 3,465 places. It
  holds each tile's own `area`, the true Web-Mercator area of each place and of its largest part, the bbox the
  camera gets, and each parent.
- `final-sim.cjs` → `final-sim.txt`: every number in this document.
- `expr-check.mjs` → `expr-check.txt`: the exact expressions, validated and run through both MapLibre engines.
- `fragments-sim.cjs`: the multi-part residual.
- `proto-plan.cjs` → `proto-live.txt`: a live, read-only prototype on production tiles.

---

## 0. The rule in one sentence

**A subregion is drawn from the first whole zoom at which it is at least `REVEAL_MIN_PX` CSS px across. "Across"
means the side of a square with the same on-screen area. It is never drawn earlier than today. Countries and
regions are never delayed.**

- **Default: 24 px.** This is the WCAG 2.2 minimum target size (2.5.8), so anything that appears can be tapped.
- **Alternatives for the owner:** 16 px (lighter) and 32 px (stricter).
- **Off:** 0 restores today's map, byte for byte.
- **Comparing values:** `?revealPx=0|16|24|32` on the map URL overrides the value for one visit, so the owner
  can compare them on production before choosing.

Everything else is fixed by the design, not by an owner setting:

- **Tier ≤ 1 is exempt** (countries and regions).
- **Everything is drawn by z16**, as a reachability safety net. With today's catalogue it changes nothing at 16,
  24 or 32 px.
- **The selected place is always drawn.**
- **Tree, search and `?place=` picks land where the place can be seen.**

---

## 1. Verdict on the three proposals

Each criterion is scored 1–5; a checkmark means verified, not taken on trust.

| Criterion | size-client | size-export | hierarchy-context |
|---|---|---|---|
| 1. Fixes what the owner sees zoomed out | 4 | 5 | 3 |
| 2. Correct: everything reachable, nothing invisible but clickable, picks land drawn | 5 | 4 | 4 |
| 3. Calm and predictable at every zoom, including multi-part places | 4 | 4 | 3 |
| 4. Cost and risk on a live app | 4 | 2 | 3 |
| 5. Performance | 5 | 4 | 4 |
| 6. Future places need no hand work | 5 | 5 | 5 |
| **Total (of 30)** | **27 (winner)** | **24** | **22** |

### size-client (the winner)

**What it gets right:**
- It needs only an app deploy, because it reads the `area` that every tile already carries.
- Its per-shard latitude constant is accurate. ✓ The final design keeps the same form, and its filter and JS
  mirror agree on 65,835 evaluations per threshold, in both engines. Only 11 places land a zoom away from the
  exact-geometry answer, each within 0.3 px of the threshold.
- It is the only proposal that keeps a size-hidden *selected* place drawn and clickable without adding new
  global state (its overlay fill).
- It is the only one that found the parent bug that exists today. ✓ Six tree picks land below their own tile
  zoom and draw nothing, not even the ring: Chablis, Chablis Grand Cru, Chablis 1er Cru (on both canvases),
  Corton and Pouilly-Fuissé 1er Cru.

**What it gets wrong:**
- **Regions at T/2 go beyond what the owner asked for.** ✓ The map opens at z4.4 over France. At 24 px that
  view would lose Bourgogne (8.9 px), Alsace, Beaujolais, Corse, Jura and Savoie, and all 12 German regions at
  z4. It also needs a 71-arm world `match` and an extra world layer.
- **Its z14 cap** draws 51 places under T at z14.
- **Its overlay fill is painted in `regionHue`.** From z8 up the ordinary fill uses the area palette, so the
  colour jumps when the ordinary fill takes over.
- **Its parent floor of `min_zoom + 0.35`** needlessly moves country picks: the United States on a phone goes
  from z1.75 to z1.85.

### size-export

**What it gets right:**
- Exact Mercator sizes.
- A child is clamped so it never appears before its parent.
- Regions are exempt.
- The rollout is safe in either order.

**What it gets wrong:**
- **It is the most expensive route for a small gain.** It needs a tiles release, a size sidecar per shard, a new
  manifest field, a loader and cache, and a camera that holds the fly for up to 1,200 ms.
- **Largest-part sizing does not fix the named confetti at its own default.** ✓ At 24 px Mendocino Ridge still
  appears at z7 with all 75 parts, the same as the client rule.
- **Largest-part sizing moves 195 places** compared with total-area sizing. 190 of them come in later, and 170
  of those are German multi-parcel Einzellagen, which read as one cluster but are held back 1–2 zooms. For
  example, Boppard Elfenley is 26 px in total but would be held to z14 because its largest part is 11 px.
- **It leaves the parent bug.** A size-hidden selection shows only its ring, and a click inside that ring
  selects the parent.

### hierarchy-context

**What it gets right:**
- The selected place is always drawn, through its filter.
- A useful shard `max_zoom` fix.
- A good analysis of why hover-driven reveal was rejected.

**What it gets wrong:**
- **"Selecting a place opens its family at T/2" re-creates the photo.** ✓ With Napa Valley selected at the Napa
  fit, it draws **9 of Napa's 15 sub-AVAs at 12–17 px, none named before z9**, and does so at the default. That
  is exactly the state the owner photographed.
- **It puts per-archive global state in every base filter.** Moving the selection to another shard now also
  reloads the previous shard.
- **Its two phases disagree on 414 places,** so those places move once at each phase.
- **"Labels with shapes" quietly overrides the US label ladder** (D16 in `usa-tree.mjs`).
- **The parent bug stays.**
- **Regions at T/3** hide Alsace, Beaujolais, Jura and Savoie on the opening view.

### What the final design takes from each

- **From size-client:** the app-only filter on `area` with a per-shard latitude constant K, the overlay fill,
  the bbox camera floor, the parent floor fix, the status-line probe, `?revealPx=`, and the tests and live plan.
- **From size-export:** regions exempt (so there is no world-archive change at all), omitting the term when the
  rule is off, the reasons never to bake the rule into tippecanoe, and labels-with-shapes as a separate owner
  decision.
- **From hierarchy-context:** the z16 safety net instead of z14, `number` guards that fail open, the shard
  `max_zoom` follow-up, and the evidence against the family rule.
- **The judge's own changes:**
  - the parent floor is `floor(min_zoom)`, which fixes the six blank landings without moving any country pick;
  - the overlay fill uses the ordinary fill's own paint and filter with only the size term negated, so there is
    no colour jump and depth and the grape filter are respected;
  - the status probe counts only places the size rule itself is hiding;
  - per-piece reveal is added as the honest fix for fragments, which none of the three proposals achieves at
    its default.

---

## 2. What the owner will see

### 2.1 The named places: when each first appears

Each cell gives the zoom where the shape (and its name, where one is shown) is first drawn, then its true
on-screen size there. The size doubles by the next zoom. Sizes are the side of an equal-area square in true Web
Mercator. The source is `final-sim.txt`.

| Place | Today | **N = 24 (default)** | N = 16 | N = 32 |
|---|---|---|---|---|
| Cole Ranch (US) | z6 · 0.9 px | **z11 · 30 px** | z11 · 30 px | z12 · 59 px |
| Benmore Valley | z6 · 2.4 px | **z10 · 38 px** | z9 · 19 px | z10 · 38 px |
| Rockpile | z6 · 8 px | **z8 · 32 px** | z7 · 16 px | z8 · 32 px |
| High Valley | z6 · 9 px | **z8 · 34 px** | z7 · 17 px | z8 · 34 px |
| Los Carneros | z6 · 13 px | **z7 · 26 px** | z7 · 26 px | z8 · 51 px |
| Mendocino Ridge (75 parts) | z6 · 19 px | **z7 · 39 px** (largest part 29) | z6 · 19 px | z7 · 39 px |
| Napa Valley | z6 · 42 px | **unchanged** | unchanged | unchanged |
| Oakville | z7 · 11 px | **z9 · 44 px** | z8 · 22 px | z9 · 44 px |
| Stags Leap District | z7 · 7 px | **z9 · 29 px** | z9 · 29 px | z10 · 59 px |
| Russian River Valley | z7 · 55 px | **unchanged** | unchanged | unchanged |
| Pauillac | z9 · 39 px | **unchanged** | unchanged | unchanged |
| Canon-Fronsac | z7 · 5 px | **z10 · 42 px** | z9 · 21 px | z10 · 42 px |
| Hermitage | z7 · 2.8 px | **z11 · 46 px** | z10 · 23 px | z11 · 46 px |
| Monthoux (smallest place) | z7 · 0.1 px | **z15 · 30 px** | z15 · 30 px | z16 · 60 px |
| Romanée-Conti | z13 · 21 px | **z14 · 42 px** | unchanged | z14 · 42 px |
| La Tâche · Clos de Vougeot | z13 · 38 · 110 px | **unchanged** | unchanged | unchanged |
| Les Amoureuses (1er cru) | z14 · 75 px | **unchanged** | unchanged | unchanged |
| Bernkasteler Doctor | z12 · 15 px | **z13 · 30 px** | z13 · 30 px | z14 · 59 px |
| Brauneberger Juffer-Sonnenuhr | z12 · 27 px | **unchanged** | unchanged | z13 · 54 px |
| Piesporter Goldtröpfchen | z12 · 75 px | **unchanged** | unchanged | unchanged |
| Barolo | z7 · 19 px | **z8 · 39 px** | unchanged | z8 · 39 px |
| Barbaresco | z7 · 15 px | **z8 · 29 px** | z8 · 29 px | z9 · 58 px |
| Lugana | z6 · 3 px | **z9 · 25 px** | z9 · 25 px | z10 · 51 px |
| Ahr · Rheingau · Mosel (regions) | z4 · 2 · 3 · 8 px | **unchanged (regions are exempt)** | unchanged | unchanged |

**Names.** A name never appears before its shape. Where the US label ladder shows names later (tier 3 at z7,
tier 4 at z9, tier 5 at z10), the name still follows its own zoom. For example, Napa Valley's shape appears at
z6 and its name at z7; at 16 px Oakville's shape appears at z8 and its name at z9. Everywhere else the shape and
its name arrive together.

### 2.2 Where a tree, search or `?place=` pick now lands

Figures are for the 769×654 desktop map, as the landing zoom with the true size there.

| Place | Today | **N = 24** | N = 16 | N = 32 |
|---|---|---|---|---|
| Cole Ranch | z7.5 · 2.6 px | **z12.5 · 84 px** | z11.5 · 42 px | z12.5 · 84 px |
| Oakville | z8.5 · 31 px | **z9.5 · 62 px** | z8.5 · 31 px | z9.5 · 62 px |
| Stags Leap District | z8.5 · 21 px | **z10.5 · 83 px** | z9.5 · 42 px | z10.5 · 83 px |
| Hermitage | z8.5 · 8 px | **z11.5 · 65 px** | z10.5 · 32 px | z11.5 · 65 px |
| Monthoux | z8.5 · 0.3 px | **z15.5 · 42 px** | z15.5 · 42 px | z16.5 · 84 px |
| Bernkasteler Doctor | z13.5 · 42 px | **z14.5 · 83 px** | z13.5 · 42 px | z14.5 · 83 px |
| Pauillac, Napa Valley, Russian River Valley, La Tâche, Clos de Vougeot, the regions | – | **unchanged** | unchanged | unchanged |

**Every pick now lands where the place is visible.** At 24 px, 3,445 of 3,465 places are drawn by their ordinary
fill at the landing zoom. The other 20 are sparse footprints such as Muscat de Lunel and Jasnières, and the
selected-place overlay fill draws them. No pick lands below the place's own tile zoom; today 6 do.

### 2.3 Map-wide and in the owner's views

| | Today | **N = 24** | N = 16 | N = 32 |
|---|---|---|---|---|
| Places that now appear later (FR / DE / IT / PT / ES / US) | – | **944** (397/290/100/14/8/135) | 575 | 1,294 |
| Median / maximum delay | – | **1 / 8 zooms** | 1 / 8 | 1 / 9 |
| Subregions under 16 px when first drawn | 576 | **0** | 5 | 0 |
| Subregions under 24 px when first drawn | 943 | **5** (all ≥ 23.7 px) | 639 | 0 |
| Features drawn world-wide at z6 / z7 / z8 | 418 / 868 / 985 | **253 / 524 / 699** | 320 / 621 / 814 | 205 / 448 / 627 |
| Places in a desktop view at z7, p90 (specks under 16 px) | 110 (60) | **51 (0)** | 59 (0) | 43 (0) |
| Owner's photo: Napa fit z7.5, 1280×900 map: drawn / under 16 px / under 24 px | 90 / 17 / 33 | **42 / 0 / 0** | 58 / 0 / 1 | 31 / 0 / 0 |
| One click out, z6.5 | 65 / 25 / 36 | **18 / 0 / 0** | 29 / 0 / 0 | 15 / 0 / 0 |
| Napa's 15 sub-AVAs drawn at the Napa fit (Napa selected) | 15 | **0** | 1 | 0 |

**Live prototype on production tiles** (`proto-live.txt`). This was read-only: the size term was added with
`setFilter` in a headless tab only. It used the same 769×654 view as the before-measurements.

- **Napa fit (z7.5):** 83 places drawn before, 40 after. No subregion was under 32 px (bbox measure). There
  were no MapLibre errors.
- **One click out (z6.5):** 60 places before, 17 after.
- **A click where the hidden Oakville lies** hit Napa Valley, North Coast, California and United States, and
  resolved to the drawn Napa Valley, which was already selected, so the selection stayed. Nothing invisible was
  hit.
- **Screenshots:** `final/proto-napa-desktop*.png`, next to `before-napa-desktop*.png`.

**Recommendation: 24.**
- **16** still lets 16–22 px shapes appear one zoom earlier than at 24: Rockpile and High Valley at z7, and
  Oakville at z8 with no name until z9. These are the same unnamed specks the photo shows.
- **32** delays 497 German places, including Bernkasteler Doctor and Brauneberger Juffer-Sonnenuhr, even though
  they read well at 27–30 px.

---

## 3. Implementation

### 3.1 New file `src/lib/wine-map/reveal.ts`

It is pure, with no maplibre value import, so vitest runs it through both engines.

```ts
// When a subregion appears on the wine map (owner, 2026-09-30: "you need to
// zoom further in before smaller places appear"). One rule for every country:
// a place below region level is drawn from the first whole zoom at which it is
// at least REVEAL_MIN_PX CSS px across — the side of a square of its on-screen
// area — and never before its catalogue min_zoom (tippecanoe keeps it out of
// the tiles before that). Countries and regions (tier <= 1) are the orientation
// layer and are never delayed. `wine_places.min_zoom` therefore means "never
// before", not "appears at": read reveal zooms through this module.
import type { Bbox } from "./shard-specs";

/** THE owner's knob: a place appears once it is this many CSS px across.
    24 = WCAG 2.2's minimum target size, so what appears can be tapped.
    Alternatives: 16 (lighter), 32 (stricter). 0 = off (today's map). */
export const REVEAL_MIN_PX = 24;
/** ?revealPx= is clamped to 0..REVEAL_PX_MAX. */
export const REVEAL_PX_MAX = 64;
/** From this zoom on, everything is drawn whatever its size — a net for a
    degenerate footprint. It binds nothing in today's catalogue at 16/24/32. */
export const REVEAL_CAP_ZOOM = 16;

const PX_PER_DEG_Z0 = 512 / 360; // 512-px tiles
/** A feature without a numeric `area` is drawn as it is today (fail open). */
const AREA_WHEN_MISSING = 1e9;
/** `number`, never `to-number`: a missing or non-numeric tier reads 0 → drawn. */
const TIER = ["number", ["get", "tier"], 0];

export function revealPxFromSearch(search: string): number {
  const raw = new URLSearchParams(search).get("revealPx");
  if (raw === null || raw.trim() === "") return REVEAL_MIN_PX;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(REVEAL_PX_MAX, Math.max(0, value)) : REVEAL_MIN_PX;
}

let pagePx: number | null = null;
/** This page load's threshold, read once, so the map's filters and the
    explorer's camera always agree. SSR-safe. */
export function currentRevealPx(): number {
  if (typeof window === "undefined") return REVEAL_MIN_PX;
  return (pagePx ??= revealPxFromSearch(window.location.search));
}

/** A shard's mid-latitude, from its manifest bbox (45 when missing). */
export function revealLatitude(bbox: Bbox | undefined): number {
  return bbox ? (bbox[1] + bbox[3]) / 2 : 45;
}

/** One shard's constant: at tile zoom z a feature is at least `minPx` across iff
    area · 4^z >= K, `area` being the tile's planar deg² of the whole footprint
    (side_px = sqrt(area / cos φ) · 512 · 2^z / 360). The shard's mid-latitude
    stands in for the feature's: within ±0.02 zoom from p1 to p99. */
export function revealK(minPx: number, latitude: number): number {
  return (minPx / PX_PER_DEG_Z0) ** 2 * Math.cos((latitude * Math.PI) / 180);
}

/** The arm every shard fill, outline and label layer ANDs in FIRST (it is the
    cheapest and rejects most features at z5-z9). null when the rule is off, so
    the filter is then exactly today's. Filters see the tile's integer zoom
    (overscaledZ, overzoom included), so this costs nothing per frame. */
export function revealTerm(k: number, minPx: number): unknown[] | null {
  if (!(minPx > 0)) return null;
  return [
    "any",
    ["<=", TIER, 1],
    [">=", ["zoom"], REVEAL_CAP_ZOOM],
    [">=", ["*", ["number", ["get", "area"], AREA_WHEN_MISSING], ["^", 4, ["zoom"]]], k],
  ];
}

/** revealTerm in JS with the same doubles (the status probe and the tests). */
export function revealPasses(
  props: Readonly<Record<string, unknown>>,
  tileZoom: number,
  k: number,
  minPx: number,
): boolean {
  if (!(minPx > 0)) return true;
  const tier = typeof props.tier === "number" ? props.tier : 0;
  if (tier <= 1 || tileZoom >= REVEAL_CAP_ZOOM) return true;
  const area = typeof props.area === "number" ? props.area : AREA_WHEN_MISSING;
  return area * Math.pow(4, tileZoom) >= k;
}

/** The first whole zoom at which a bbox is `px` across (the side of a square of
    its Web-Mercator area), clamped to 0..REVEAL_CAP_ZOOM: the camera's floor. */
export function bboxZoomForPx(bbox: Bbox, px: number): number {
  const mercY = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const w = Math.max(((bbox[2] - bbox[0]) / 360) * 512, 1e-9);
  const h = Math.max((mercY(bbox[1]) - mercY(bbox[3])) * 512, 1e-9);
  const z = Math.ceil(Math.log2(px / Math.sqrt(w * h)));
  return Math.min(REVEAL_CAP_ZOOM, Math.max(0, z));
}
```

### 3.2 `src/lib/wine-map/shard-specs.ts`

**Inputs.** `ShardSpecInputs` gains two fields, both fixed for the visit:

```ts
  /** reveal.ts: this shard's K (manifest bbox mid-latitude) and the page's threshold. */
  revealK: number;
  revealPx: number;
```

**The filter.** Called without `reveal` it returns exactly today's filter, so existing tests keep passing:

```ts
export function shardFilter(country: string | null, reveal?: { k: number; px: number }): unknown[] {
  const term = reveal ? revealTerm(reveal.k, reveal.px) : null;
  return ["all", ...(term ? [term] : []), grapeGateExpression(), ...(country ? [depthTerm(country)] : [])];
}
```

**One filter for all three layers.** In `shardLayerSpecs`, the same filter still goes to fills, outlines and
labels:

```ts
const filter = shardFilter(inputs.country, { k: inputs.revealK, px: inputs.revealPx }) as FilterSpecification;
```

The consequences:
- a shape and its outline always appear together;
- a name never appears before its shape;
- a hidden place is never rendered, hit-tested, hovered, scanned or placed for collision;
- nothing is ever hidden by opacity.

**Overlay ids.** The overlays gain a fill id:

```ts
export function shardOverlayIds(key: string) {
  return {
    fill: `shard-selected-fill-${key}`,
    casing: `shard-selected-casing-${key}`,
    ring: `shard-selected-ring-${key}`,
    label: `shard-selected-label-${key}`,
  };
}
```

**The overlay filter.** It is the ordinary filter with the size term negated, restricted to the selected key:

```ts
/** The ordinary shard filter with the size term NEGATED, for the selected key:
    it draws the selected place exactly where the ordinary fill would if the size
    rule were off (grape and depth still apply), and never where it already draws. */
export function selectedFillFilter(inputs: ShardSpecInputs): unknown[] | null {
  const term = revealTerm(inputs.revealK, inputs.revealPx);
  if (!term) return null;
  return [
    "all",
    ["!", term],
    ...shardFilter(inputs.country).slice(1), // grape gate, depth term
    ["==", ["string", ["get", "key"], ""], ["global-state", GS.selKey]],
  ];
}
```

**The overlay specs.** `shardOverlaySpecs(key, palette, inputs?)` returns `[fill?, casing, ring, label]`, bottom
to top. The fill is included only when `inputs` is given and the rule is on:

```ts
{
  id: ids.fill, type: "fill", source, "source-layer": "places",
  filter: selectedFillFilter(inputs),
  layout: { visibility: inputs.fillsVisible ? "visible" : "none" },
  // the ORDINARY fill's paint: same colour expression, same focus/opacity arms
  // (feature-state `sel` is per feature, so it reads 0.6→0.3 exactly as the
  // ordinary fill would), hence no colour or opacity jump at the reveal zoom
  paint: staticFillPaint({
    color: shardColorExpression({ region: key, areaSlugs: inputs.areaSlugs, ramp: inputs.ramp, palette: inputs.palette }),
    ramp: inputs.ramp, worldHandoff: false,
  }),
}
```

**No new reload scope.** The overlay fill reads only global-state names the selected shard already reads:
`wm_sel_key`, `wm_keys` and `wm_deep_<country>`.

### 3.3 `src/lib/wine-map/shard-controller.ts`

- **`OVERLAY_LAYER_ID`** becomes `/^shard-selected-(?:fill|casing|ring|label)-(.+)$/`.
- **`removeOverlays`** removes `[label, ring, casing, fill]`. `removeLayer` is a no-op for a missing layer.
- **`run()`:**
  - The filter-rewrite condition becomes
    `!was || was.country !== inputs.country || was.revealK !== inputs.revealK || was.revealPx !== inputs.revealPx`.
  - Both overlay calls pass the owner's inputs: `this.ensureOverlays(style, owner, d.inputs(owner))`.
- **`ensureOverlays(style, key, inputs)`** replaces today's `(style, key, palette)` and builds
  `shardOverlaySpecs(key, inputs.palette, inputs)`.
  - It compares the inputs before building the specs, so a run that changes nothing allocates no new colour
    expression.
  - `appliedOverlay` becomes `{ key, inputs }`.
  - When every overlay is present and palette, ramp, area slugs or country differ from what was applied, it
    rewrites each overlay's paint and the fill's filter with `setFilter(fill.id, fill.filter, NO_VALIDATE)`.
    Otherwise it returns, as it does today.
- **The overlay fill is appended first,** so it sits under the casing and ring. `firstOverlayId()` then finds it,
  so shards added later still land below every overlay.
- **Theme swaps need no extra code.** `withWineLayers` already carries every layer on a wine source. After a full
  rebuild, `reapplyPaint()` clears `appliedOverlay`.

### 3.4 `src/app/knowledge/map/tile-wine-map.tsx`

**Inputs.**

```ts
const revealPx = useMemo(() => currentRevealPx(), []);
const revealKs = useMemo(
  () => Object.fromEntries(shardEntries.map(([key, shard]) => [key, revealK(revealPx, revealLatitude(shard.bbox))])),
  [shardEntries, revealPx],
);
// shardDesired.inputs(key): add
//   revealK: revealKs[key] ?? revealK(revealPx, 45), revealPx,
```

**Clicks and hover.** `interactiveLayerIds` gains the selected shard's overlay fill:

```ts
...(selectedShard && !noFills ? [shardOverlayIds(selectedShard).fill] : []),
```

A click or hover on a size-hidden selected place then resolves to that place (smallest area wins). The hover
cursor reads the same list.

**Status probe in `scanView`.** Today "No subregions mapped here for {F} yet" assumes nothing new appears past
z8. The rule breaks that: at 24 px, 662 subregions now first appear at z9 or deeper. In today's catalogue a
larger drawn subregion almost always covers them, so the wrong line is rare. A view between umbrellas, a phone
canvas or a future catalogue can still hit it, and the probe keeps the line honest.

- **When it runs:** after the existing loop, only when the focus country has no subregion drawn and the zoom is
  z8 or deeper.
- **What it does:** it runs
  `map.querySourceFeatures(shardSourceId(key), { sourceLayer: "places", filter: [">=", ["get", "tier"], 2] })`
  over the focus country's mounted shards.
- **What counts:** a feature that passes the grape filter (checked in JS against `visibleKeys`) and fails
  `revealPasses(p, Math.floor(map.getZoom()), revealKs[key], revealPx)`. That means it exists and only size
  hides it.
- **What it reports:** any hit sets `depthHidden = true` (stored next to `scanFocus`).
- **Copy:** none new. The status then keeps the owner-approved "Zoom in to see {F}'s subregions."

**`pastDepthZoom`** becomes `scanPastDepthZoom({ scanZoom, scanFocus, focusCountry, depthHidden })`.
`DetailReport`'s shape is unchanged.

**World layers are not touched.** `WORLD_*_FILTER`, `GRAPE_GATE` and the JSX layers stay as they are. World
features are tier ≤ 1, and the rule exempts them. `mapStyle` still never changes.

### 3.5 The camera: `src/lib/wine-map/camera-fit.ts` and `tile-wine-map-explorer.tsx`

`camera-fit.ts` gains a constant and a pure function. It also fixes the comment at `CHIP_MIN_ZOOM` from "first
subregions … already drawn" to "those at least REVEAL_MIN_PX across".

```ts
/** A selection flight's deepest cap: the reveal net (z16) plus headroom. Was 16. */
export const CAMERA_MAX_ZOOM = 17;

/** Where a tree, search, details or ?place= pick flies. */
export function selectionZooms(input: {
  tier: number;
  minZoom: number;                     // the place's catalogue min_zoom
  childMinZooms: readonly number[];
  bbox: Bbox;
  revealPx: number;
}): { minZoom: number; maxZoom: number } {
  // The first whole zoom where the bbox is 2N across: a place filling a quarter
  // of its box or more is drawn there by its ordinary fill; a sparser one is
  // drawn by the selected-place overlay fill. Countries and regions: no floor.
  const n = input.tier >= 2 ? input.revealPx : 0;
  const sizeFloor = n > 0 ? bboxZoomForPx(input.bbox, 2 * n) : 0;
  if (input.childMinZooms.length > 0) {
    // Parent: today's framing (deepest child + 0.5), raised only if the parent
    // itself is size-delayed. Floor = its own tile zoom: today's floor 0 let six
    // picks (Chablis 1er Cru, Corton, ...) land where nothing is drawn.
    const maxZoom = Math.min(CAMERA_MAX_ZOOM, Math.max(Math.max(...input.childMinZooms) + 0.5, sizeFloor + 0.5));
    return { minZoom: Math.min(Math.max(Math.floor(input.minZoom), sizeFloor), maxZoom), maxZoom };
  }
  // Leaf: today's [min_zoom + 0.35, min_zoom + 1.5], raised to the size floor.
  const maxZoom = Math.min(CAMERA_MAX_ZOOM, Math.max(input.minZoom + 1.5, sizeFloor + 0.5));
  return { minZoom: Math.min(Math.max(input.minZoom + 0.35, sizeFloor), maxZoom), maxZoom };
}
```

In the explorer, `cameraTarget` (lines 757–783) keeps its shape and calls the helper:

```ts
const { minZoom, maxZoom } = selectionZooms({
  tier: context.place.tier,
  minZoom: context.place.min_zoom,
  childMinZooms: context.children.map((c) => c.min_zoom),
  bbox: context.boundary.bbox,
  revealPx: currentRevealPx(),
});
return { bbox: context.boundary.bbox, minZoom, maxZoom, source: selectSourceRef.current,
         padding: sheetCameraPadding(selectSnapRef.current) };
```

**Unchanged:**
- **`applyCameraTarget`:** its `max(fit, minZoom)` and its "already framed" skip read the new `minZoom`.
- **Map taps:** they still never reframe, because a tap can only hit a drawn place.
- **Country chips:** `chipLandingZoom` and `CHIP_MIN_ZOOM` are unchanged.
- **Parent framing:** it is unchanged. Napa Valley still lands at z7.5, now without the confetti, and its
  sub-AVAs appear as the viewer zooms in (9 at z8, the rest at z9), which is what the owner asked for.

**With the rule off (`revealPx = 0`),** the numbers are today's except the parent floor, which is the bug fix.

### 3.6 `src/lib/wine-map/focus.ts` and `detail-status.ts`

- **`scanPastDepthZoom`** gains `depthHidden?: boolean` and returns `… && !input.depthHidden`.
- **`detail-status.ts`:** only the docstring changes. "At or above NEIGHBOUR_MIN_ZOOM" now also requires that
  the probe found no size-hidden subregion. The copy is unchanged.

### 3.7 `CLAUDE.md`

Add this bullet under "Wine map performance":

> **When a place appears** (2026-09-30, owner: "you need to zoom further in before smaller places appear";
> design `.superpowers/…/design-final.md`).
>
> - **The rule.** A subregion (tier ≥ 2) is drawn from the first whole zoom at which it is at least
>   `REVEAL_MIN_PX` CSS px across (`src/lib/wine-map/reveal.ts`; 24 by default, 16/24/32 awaiting the owner's pick; 0 = off).
>   "Across" is the side of a square of its on-screen area, from the tile's `area` and a per-shard latitude
>   constant.
> - **Never earlier than `floor(min_zoom)`.** So `min_zoom` now means "never before"; read reveal zooms through
>   `reveal.ts`.
> - **Exemptions and the net.** Countries and regions are exempt. Everything is drawn by z16.
> - **One term, first.** The term is the first arm of `shardFilter`, shared by fills, outlines and labels. Never
>   hide a place with opacity: `queryRenderedFeatures` and label collision still see opacity-0 features.
> - **The selection.** The selected place is always drawn, by `shard-selected-fill-*`: the ordinary fill's
>   paint and filter with the size term negated.
> - **Picks.** They land where the place is drawn (`selectionZooms`).
> - **Status line.** The "No subregions mapped here" line checks with `querySourceFeatures` that nothing is only
>   size-hidden.
> - **Comparing.** `?revealPx=` overrides the knob for one visit.
> - **Do not.** Never bake the rule into tippecanoe `minzoom`: the ring could no longer draw a small selected
>   place, and shard `max_zoom` would drop features.

### What does NOT change

- **Data and tiles:** the tiles pipeline, manifest, migrations, database, RLS and neighbour cache.
- **The map shell:** the world archive layers, `map-state.ts` (no new global-state names),
  `map-state-sync.ts`, `basemap.ts` and `mapStyle`.
- **The grape key gate:** still an O(1) object lookup; "no filter" is still always-true.
- **Other surfaces:** the training room map, which draws its own GeoJSON dots and never loads these tiles (the
  brief was wrong on this), and dark-mode palettes.
- **The US label ladder** (D16).

---

## 4. Correctness guarantees and how they were checked

1. **Nothing appears earlier than today.** Tippecanoe's per-feature minzoom is untouched and the client can only
   subtract. ✓ Checked on all 3,465 places at N = 16, 24 and 32: 0 earlier.
2. **Nothing is unreachable.** Every place is drawn by z16, the map allows z22, and the camera cap is 17. ✓ The
   net itself binds nothing today: the largest reveal is Monthoux at z15, or z16 at 32 px. A child is never
   drawn before its parent: 0 cases at any N.
3. **Nothing invisible can be clicked.** Filtered features are not in `queryRenderedFeatures`, so they are never
   hit by clicks, hover, the scan or the legend. ✓ Live: a click over the hidden Oakville hit only drawn places
   and resolved to Napa Valley.
4. **Picks land where the place is drawn.**
   - ✓ 3,445 of 3,465 at 24 px are drawn by their ordinary fill at the desktop landing, and the overlay draws
     the other 20.
   - ✓ The phone canvas is 3,443 plus 22.
   - ✓ 0 picks land below their tile zoom (6 today).
5. **The selected place is always drawn.** ✓ The overlay fill is the exact complement of the ordinary fill for
   the selected key in both engines: never both, never neither. When the country is not deep or the grape filter
   excludes the place, neither draws, exactly as the ordinary fill behaves. Zooming out from a selected tiny place
   keeps it filled and ringed, and its big selected name still shows from its label zoom.
6. **The expressions are valid and match their JS mirror.**
   - ✓ `validateStyleMin` passes on the fill, outline, label and overlay filters.
   - ✓ 0 mismatches against `revealPasses` over 3,465 places × zooms 0–18 × 3 thresholds, in both the
     standalone style-spec and maplibre-gl 5.24's bundled copy.
   - ✓ The term is monotone in zoom: 0 places drawn at one zoom and hidden at a deeper one, so zooming in never
     flickers.
   - ✓ Missing `area`, a string `area`, or a missing or string tier all fail open and draw as today.
   - ✓ At N = 0 the filter is byte-identical to today's.
7. **The world copy and the shard copy of a region cannot disagree,** because regions pass everywhere. ✓ No
   region or country is hidden at any zoom from 0 to 18.

---

## 5. Performance

- **Per feature:** one `get` with a `number` assertion, one `^`, one multiply and one compare, at tile parse in
  the worker. There are no arrays, no `in` and no `match`, so the key-gate lesson holds.
- **No per-frame work.** Filters see the tile's integer zoom, and every integer zoom already parses its own
  tiles, overzoom included.
- **Style size:** 148 B per shard layer, 3–4 layers per mounted shard, added with `validate: false`. The world
  layers are unchanged. A theme swap diffs essentially the same style.
- **No new reloads.** The term reads no global state. The overlay fill reads only names its shard already reads,
  and a selection reloads exactly what it reloads today.
- **Less GPU work.** At z7, 524 features are drawn world-wide instead of 868; at z6, 253 instead of 418. That
  means fewer fill triangles, fewer outlines and fewer label placements.
- **The status probe** runs only in the rare "nothing drawn at z8 or deeper" state, once per idle, over tiles
  already loaded.
- **Camera work is not touched,** per CLAUDE.md.
- **Measure before and after** with `?debugPerf=1` on the North Coast at z7 and on Burgundy at z12. Expect equal
  or better worst frames.

---

## 6. Tests

Use vitest and follow the existing patterns: `map-state.test.ts`'s dual engine, `shard-layer-specs.test.ts`'s
`validateStyleMin`, and `key-gate.test.ts`'s `featureFilter`.

### 1. `reveal.test.ts` (new)

**Fixture.** Use the `area` values of the §2.1 places from the read-only SELECT (`final/exact.json`, copied into
the test as literals).

**The table.**
- **Parity:** through both engines, `revealTerm` gives the same answer as `revealPasses` at every whole zoom
  0–18 for N = 16, 24 and 32.
- **Pin the §2.1 table:** the first zoom where each named place passes, at each N. This is the owner-approved
  table, so a future change to the rule shows up as a diff.

**Edge cases:**
- tier ≤ 1 always passes;
- z ≥ 16 always passes;
- a missing, string or `null` area passes;
- `area: 0` passes only from z16;
- a missing or string tier passes;
- `revealTerm(k, 0) === null`.

**Other units:**
- **Monotone:** a place that passes at z also passes at z+1.
- **`revealK`:** matches a direct Mercator computation to within 1e-12 relative.
- **`bboxZoomForPx`:**
  - Cole Ranch's bbox at 48 px gives 12, and at 32 px gives 11;
  - it returns integers, clamped to 0–16;
  - a zero-size bbox gives 16.
- **`revealPxFromSearch`:** `""` → 24, `"?revealPx=16"` → 16, `"0"` → 0, `"abc"` → 24, `"-5"` → 0, `"99"` → 64.

### 2. `shard-specs.test.ts`, `shard-specs-static.test.ts` and `shard-layer-specs.test.ts`

- **Shared filter:** fills, outlines and labels share one filter, and the size term is its first arm.
- **Unchanged calls:** `shardFilter(country)` without `reveal` equals today's value, so the existing
  expectations keep passing.
- **Global-state names:** the set read by `shardFilter` is unchanged.
- **Overlays:**
  - `shardOverlayIds` has 4 ids;
  - `shardOverlaySpecs(key, palette, inputs)` returns `[fill, casing, ring, label]`;
  - with the rule off, or without `inputs`, it returns the 3 layers of today.
- **Fill paint:** the overlay fill's paint deep-equals the ordinary fill's paint for the same inputs (no colour
  jump).
- **Validity:** `validateStyleMin` passes over the new specs in light and dark at 16, 24 and 32.

### 3. `map-state.test.ts`

Add a truth table through both engines for the overlay filter against the ordinary filter:

- selected with depth on;
- depth off;
- another key selected;
- grape filter excluding it (the `constructor` key is still rejected);
- `wm_sel_key` unset, null or undefined.

In every case the overlay and the ordinary filter are never both true.

### 4. `shard-controller.test.ts`

- **Filter rewrites:** a change in `revealK` or `revealPx` rewrites the three base filters; unchanged inputs
  rewrite nothing.
- **Overlay adds and removes:** 4 overlays are added in order with the fill at the bottom, and all 4 are removed
  when the selection moves to another shard.
- **Overlay rewrites:** a ramp latch, a change in area slugs or a palette change rewrites the fill's paint;
  a country change rewrites its filter.
- **Ordering:** `firstOverlayId` returns the fill, so a shard added later still lands below every overlay.

### 5. `camera-fit.test.ts`

- **Unchanged places:** `selectionZooms` gives today's values for Pauillac, Napa Valley and Russian River Valley,
  and for every leaf at N = 0.
- **Named values:**
  - Cole Ranch → [12, 12.5] at 24 and [11, 11.5] at 16;
  - Monthoux → [15, 15.5] at 24 and [16, 16.5] at 32.
- **Parent floor:** Chablis 1er Cru's floor is 12 (it lands at 11.77 today).
- **Countries and regions:** a country or region is never floored above `floor(min_zoom)`.
- **Bounds:** always `minZoom <= maxZoom <= 17`.

### 6. `focus.test.ts` and `detail-status.test.ts`

- At z ≥ 8, `depthHidden: true` keeps "Zoom in to see {F}'s subregions.".
- Without it, "No subregions mapped here for {F} yet." is unchanged.

### 7. `basemap.test.ts`

`withWineLayers` carries `shard-selected-fill-*`, with its filter and paint, across a theme swap.

### 8. Live check (not vitest)

Use `final/cdp-live.mjs`, `live-plan.cjs`'s 9 views × desktop and phone × fit, −1 and −2, and the
`proto-plan.cjs` click. Run it against the local production build first and against production after the push.

Pass criteria:
- **The rule:** no tier ≥ 2 rendered feature fails `revealPasses` at the view's tile zoom.
- **Off matches before:** `?revealPx=0` reproduces the `before-*` tables.
- **Deep links:** for Cole Ranch, Oakville, Hermitage, Romanée-Conti, Bernkasteler Doctor, Monthoux and Chablis
  1er Cru, the selected key renders in `shard-fills-*` or `shard-selected-fill-*` and in the ring after idle.
- **Clicks:** open the North Coast deep link (z6.5) and click where the hidden Oakville lies. The selection must
  become Napa Valley, the smallest drawn place under the point, and not Oakville.
- **Dark mode:** a dark flip keeps the filters and the overlay.
- **Status line:** use the 769×654 desktop map (a 1675×865 viewport) or the phone canvas, with
  `?revealPx=64`. Pick Savoie and press + once to reach z8.5. No French subregion in that view is 64 px yet
  (Roussette de Savoie is 63 px at z8; all 21–22 in view were checked), so the line must read "Zoom in to see
  France's subregions." and not "No subregions mapped here for France yet."
- **Console:** no `[wine-map]` errors.

---

## 7. Deploy and rollback

There is one app deploy. It needs no tiles release, migration, neighbour-cache refresh or coordination with
the Germany collaborator: new places follow the rule automatically through the `area` in every release.

1. **Implement** on branch `map-reveal` in `C:/Users/Public/repos/blindtastingapp-reveal`. Then run
   `npx vitest run src/lib/wine-map`, `npx tsc --noEmit`, `npx eslint src/lib/wine-map src/app/knowledge/map` and
   `npx next build`.
2. **Check locally** with `next start` on production data and a demo session (`mint.mjs`), running the §6.8
   plan. Produce screenshots at `?revealPx=0 | 16 | 24 | 32` for the owner.
3. **Merge and push** with the owner's go-ahead. That push is the production deploy.
4. **Live smoke:** the same plan against blindrapp.vercel.app with a demo session. The owner can compare
   `?revealPx=16|24|32` live.
5. **If the owner picks 16 or 32,** change the one constant and deploy the same way.

**Rollback:**
- **Deploy:** Vercel Instant Rollback, or `git revert`. No tile, manifest or database state needs undoing.
- **Kill switch:** `REVEAL_MIN_PX = 0` returns today's filters and today's camera (parent floor 0, z16 cap), byte
  for byte (§10).
- **One visit:** `?revealPx=0` shows today's map.

---

## 8. What is left, and optional follow-ups (owner decisions, not part of this change)

1. **Fragments of multi-part places.**
   - **What remains:** once a place is drawn, all of its parts are drawn. In the owner's z7.5 view Mendocino
     Ridge still shows 71 slivers under 8 px (at z6.5 it is gone). World-wide at z7, 1,203 such slivers are
     drawn (1,346 today).
   - **Why the proposals don't fix it:** none of them does at its default, since largest-part sizing only
     delays the whole place.
   - **The real fix:** a tiles release that exports each part as its own feature, with `part_area` next to the
     place's `area`. A part under N/3 would wait, and the largest part would always come with its place.
   - **Recommendation:** decide after living with this change.
2. **US shapes before their names.** 87 US places (157 today) draw their shape 1–2 zooms before their name,
   because of the D16 label ladder in `usa-tree.mjs`. Examples: Napa Valley's shape at z6 and name at z7; Russian
   River Valley's shape at z7 and name at z9. Options:
   - **Emit US labels with their shapes** (size-export's option L) as an export flag;
   - **Leave the ladder as it is.**

   Delaying the shapes instead (size-client's "label sync") was rejected: it would hide a 55 px Russian River
   Valley for two more zooms.
3. **Blocky first sight in shallow shards.**
   - **What happens:** 70 places at 24 px first appear beyond their shard's `max_zoom`: Savoie 17, Loire 10,
     Mosel 10, Languedoc 9 and Rhône 7. They are drawn from overzoomed geometry; for example, Monthoux at z15
     comes from z9 data.
   - **The fix:** a tiles tweak that includes reveal zooms in the shard `max_zoom` (hierarchy §6: Loire 9→10,
     Rhône 9→12, Savoie 9→14).
4. **Places pop in at whole zooms,** as they do today. An optional fade would add stops to the fill-opacity
   interpolate (size-client Appendix A). Add it only if the owner notices the pop, and only after an A/B like the
   one done for `useDeferredValue`.
5. **The grape filter.** Small matching places also wait, and the tree still lists them. No bypass was added:
   Chardonnay's 598 keys would bring the confetti back.
6. **Transient tile swaps.** While tiles load after zooming out, retained child tiles can show a small place for
   a frame. This happens today too.

---

## 9. Evidence files (all in `reveal/`)

- **The judge's evidence, in `final/`:**
  - `exact.json` and `parts.json`: read-only SELECTs (`fetch-exact.mjs`, `fetch-parts.mjs`).
  - `final-sim.cjs` → `final-sim.txt`: every table above.
  - `expr-check.mjs` → `expr-check.txt`: validation, both engines, parity, edge cases, overlay truth table.
  - `fragments-sim.cjs` → `fragments-sim.txt`.
  - `proto-plan.cjs`, `cdp-live.mjs` → `proto-live.txt` and `proto-napa-desktop*.png`: the live read-only
    prototype.
- **The proposals and their simulations:**
  - `proposal-size-client.md`, `proposal-size-export.md`, `proposal-hierarchy-context.md`;
  - `size-client-sim.txt`, `export-rule-sim*.txt`, `hc/sim.md`.
- **The shared evidence:** `understand-code.md`, `understand-data.md`, `understand-live.md`, `places.json`,
  `before-*.png`.

---

## 10. Review amendments (2026-09-30)

A review of the prototype (`f2c902c`) confirmed eleven findings. The fixes:

1. **The overlay fill's stacking.** `shard-selected-fill-*` was appended at the top of the style, so below its reveal
   zoom it veiled every shard's outlines and labels (the "Na" of "Napa Valley" over Oakville at z8.5), and at the
   reveal zoom the ordinary fill took over underneath them: a jump. It is now inserted just below the owner shard's
   outlines, where the ordinary fill sits; the casing, ring and label stay on top, and `firstOverlayId` skips the
   fill so a later shard lands below the casing, never inside the owner's stack. Live: fills 76, overlay fill 77,
   outlines 78, labels 79.
2. **The parent cap could undercut the parent floor** (a parent at min_zoom 12 with children at 11 landed at z11.5).
   The cap now includes `floor(min_zoom) + 0.5`.
3. **`?revealPx=` was cached for the module's lifetime**, so it survived client-side navigation. `currentRevealPx()`
   now reads the URL each call; the explorer reads it once per mount and passes it to the map (`revealPx` prop)
   and its camera. Live: a hard load at 16, then client navigation back without it, gives the 24 px K.
4. **Kill switch.** `revealPx = 0` now also restores the old camera: parent floor 0 and the z16 cap
   (`CAMERA_MAX_ZOOM_RULE_OFF`). The parent-floor fix applies only with the rule on.
5. **A parent drawn at its old landing was pushed a zoom deeper** (the parent floor tested a 2N-px bbox). A parent is
   now raised only when even its bbox is under N px there. Libournais lands at z7.5 again.
6. **The "24 px" claim.** The rule tests the whole tile zoom; what appears is at least N px, but a hidden place can be
   up to 2N on screen between whole zooms. Documented as such (reveal.ts, CLAUDE.md); not changed, since it errs
   later, which is the owner's ask.
7. **CLAUDE.md said 24 was the owner's pick.** It is the default; 16/24/32 still wait on his comparison.
8. **No cue when a drill-down lands before its children.** The idle scan now probes the selected place's own
   children (`familyInView`): when some in view are hidden only by size, the status line says "Zoom in to see the
   subregions of {place}." (none drawn) or "Zoom in to see all the subregions of {place}." (some drawn). New copy
   for the owner to approve. Live: Northern Rhône, Jura, Centre-Loire, Montagne de Reims, Libournais and Napa
   Valley get the first; Burgundy, Côte de Nuits and Vosne-Romanée the second.
9. **Holes in families and confetti in scattered places** (Vosne-Romanée's grands crus missing Romanée-Conti,
   La Romanée and La Grande Rue at its landing; Mendocino Ridge's 71 slivers in the owner's view). Both need
   knowledge only the export has, so the tiles now carry `reveal_area`, which the filter reads before `area`:
   - a place comes in with its family (tier >= 2 siblings under one parent) once the family's **median** member is
     N px, if it is itself at least N/2 (`FAMILY_PX_RATIO` 2);
   - each part of a multi-part subregion is its own feature; a part other than the largest waits until it is N/3
     (`PIECE_PX_RATIO` 3), and the largest comes with its place.

   Simulated on the design's own data (`reveal/fix/family-sim.txt`) at N = 24: Vosne-Romanée 9 of 9 children at its
   landing (6 today with the rule), Côte de Nuits 8 of 8 (6), families appearing at a single zoom 149 of 259 (82),
   the owner's views unchanged in substance (z7.5: 45 drawn, none under 24 px; the three extras are 24-32 px), and
   0 parts under 8 px drawn in the owner's view (72), and 0-1 world-wide at z7-z10 (about 1,200). The median was chosen
   over the largest sibling because the largest brings Rockpile and High Valley back into the owner's photo view.
   **This part takes effect only with the next tiles release**; until then the app reads `area` alone and behaves
   as §0-§9 describe. Burgundy (2 of 6 districts at its landing) and Libournais stay partial, and say so (item 8).

---

## 11. The rule as built: owner decisions and the ribbon rule (2026-09-30, third commit on `map-reveal`)

**Where this section and §0-§10 disagree, this section wins.** It supersedes §10.9's family rule and makes the tiles
release the switch.

### 11.1 Owner decisions (2026-09-30, after before/after screenshots at 16/24/32 px)

- **Threshold: 24 px** ("24 px (Recommended)"). `REVEAL_MIN_PX` stays 24; `?revealPx=` stays as a per-visit override.
- **Keep ribbons visible** ("Keep ribbons visible (Recommended)": "I measure elongated places by their length as well
  as their area, so Côte de Nuits and similar ribbons still appear with their region. Only compact specks wait."). The
  plain size rule hid four of Burgundy's six districts at the Burgundy view.
- **Cue copy approved**: "Zoom in to see the subregions of {place}." / "Zoom in to see all the subregions of
  {place}."
- **Ship when it passes**: an app deploy first, with no visible change, a live check; then a tiles release that
  switches the rule on, with desktop and phone checks. Rollback: an app switch back to today's behaviour
  (`REVEAL_MIN_PX = 0`), or promoting the previous tiles release.

### 11.2 The final combined formula

All lengths are Web-Mercator CSS px at z0 (the world is 512 px wide; Mercator is conformal, so every length on screen
is its z0 length × 2^z). N = the threshold (24). Computed by the tile export (`scripts/wine-map-tiles/lib.mjs`
`revealPlan`), which has the geometry:

1. **Per polygon part** q, with area A and L the long side of its minimum-area enclosing rectangle (rotating calipers
   on its convex hull):
   `size(q) = max( sqrt(A), min( L / 2, 8 × A / L ) )`
   A part counts once its equal-area square is N px (the plain rule), **or**, if it is a ribbon, once it is **2N long
   and N/8 thick** on average (A / L = mean thickness; `REVEAL_LENGTH_RATIO` 2, `REVEAL_THICKNESS_RATIO` 8). A part at
   most twice as long as its equal-area square (L ≤ 2√A: every compact shape) gets exactly the plain rule.
2. **Per place** p: `own(p) = max( sqrt(total area), max over its parts of size(q) )`. The whole footprint still
   counts (a cluster of parcels); a length is only measured within one part, never across a scattered multipart bbox.
3. **Subregions come with their region**: the SUBREGION-kind children of one region (tier 1) are a family; a member
   with `own ≥ median / 2` (`SUBREGION_FAMILY_RATIO` 2) takes `max(own, median)`. Nothing else is pulled by a family.
4. **Parts**: every tier ≥ 2 place is one feature per polygon part (geometry order). The anchor (the part with the
   largest size) carries the place's side; every other part `min(place side, 3 × sqrt(A_part))`
   (`PIECE_PX_RATIO` 3): it waits until its own square is N/3 and never comes before its place.
5. **Labels** carry the place's side, so a name comes with its shape.
6. **The number in the tile**: `reveal_area = (side × 360/512)² × cos(shard mid-latitude)`, the unit of the tile's
   `area` at the latitude the app's `revealK` uses (the manifest bbox's), so `reveal_area × 4^z ≥ K(N)` ⟺
   `side × 2^z ≥ N` exactly. Every step is a ratio of N, so `?revealPx=16|32` scale the same numbers.
7. **In the app** (`reveal.ts`), unchanged except: a feature without a numeric `reveal_area` is **not delayed**
   (`area` is never read), and a shard applies the rule only when its manifest entry says `reveal_rule: 1`.

### 11.3 Why these constants (evidence in the session scratchpad: `reveal/build/ribbon-sim*.txt`, `reveal-table.md`)

- **Length 2N, not N.** The task's starting rule ("long dimension ≥ N and mean thickness ≥ 4 px") credits every
  oblong blob by its long side: Cole Ranch came in at z10 (table: z11), Benmore Valley z9 (z10), Rockpile and High
  Valley z7 (z8), Oakville and Stags Leap z8 (z9). The window for the length factor was 1.69 < λ ≤ 2.24 (Rockpile at
  z7 is 40.5 px long: excluded above 1.69; Côte de Nuits at z7 is 53.8 px long: kept up to 2.24). λ = 2 has margin
  both ways and needs no separate "is it elongated" test: below L = 2√A the clause can never beat the square.
- **Thickness N/8 = 3 px, not 4.** Côte de Nuits is 3.68 px thick on average at the Burgundy view (tile z7). A 4 px
  floor would hide the owner's own named ribbon on its merits (it would only come in through its family). 3 px keeps
  it with 23 % margin. The 12 places a 3 px floor admits over 4 px are all 50-86 px long, 3.1-3.9 px thick ribbons
  (Saint-Joseph, Val Venosta, Valle Isarco, Côte Roannaise, Orléans, Chautagne, Monthoux, four Mosel/Ruwer/Nahe
  Einzellagen, Rocky Reach).
- **Mean thickness from the minimum-area rectangle** (A / L) rather than the rectangle's short side: robust to boundary
  noise (hull-based), exact for compact shapes. Rejected: the rectangle's aspect ratio ("equivalent rectangle")
  brought Oakville (1.56:1) and Rockpile (3:1) in a zoom early; the perimeter-based equivalent rectangle reads jagged
  outlines as ribbons (Cole Ranch's outline says "8 × 0.4 px").
- **§10.9's family rule is withdrawn.** "Comes in with its family once the family's median member is N px, if itself
  N/2" applied at every zoom, so any member of a large family came a zoom early: Cole Ranch z10, Benmore Valley z9,
  Oakville z8, Stags Leap z8, Canon-Fronsac z9, Monthoux z13, Romanée-Conti z13, Bernkasteler Doctor z12, Lugana z8,
  Barbaresco z7. A scale-free "members ≥ median/2 take the median" rule for every family still pulled Oakville, Stags
  Leap and Canon-Fronsac. Limited to a region's SUBREGION children it pulls six places (Grand Auxerrois, Libournais,
  Diois, Umstadt, Baixo Corgo, Monção e Melgaço; 15.6-23.4 px at their new zoom) and none of the specks. Consequence:
  Vosne-Romanée lands with 7 of 9 grands crus (La Grande Rue now comes by length; La Romanée and Romanée-Conti at
  z14) and Côte de Nuits with 6 of 8 villages (Fixin, Vougeot at z11); the approved cue says so.
- **Grand Auxerrois is not a ribbon.** It is two compact parts (18.7 × 14.1 and 13.8 × 9.8 px at z7, 15.6 px as one
  square). It comes in at the Burgundy view only as one of Burgundy's subregions (own 15.6 ≥ median 28.6 / 2).

### 11.4 What the owner will see (the named places are in §11.7)

- **Burgundy view** (desktop z7.35): all six districts drawn and named (plain rule: 2 of 6). On a phone the Burgundy
  pick lands at z5.8 (the half sheet), as today; from z7 the districts come in together.
- **Compact specks keep the approved 24 px table**: Cole Ranch z11, Benmore Valley z10, Rockpile z8, High Valley z8,
  Oakville z9, Stags Leap District z9, Canon-Fronsac z10, Lugana z9, Barolo/Barbaresco z8, Romanée-Conti z14.
- **The owner's North Coast views** (centred on Napa Valley): no place under 24 px, and **no part under 8 px**
  (today 72-86; the plain rule 72 at z7.5, all Mendocino Ridge); Mendocino Ridge shows 3 of its 75 parts at z7.5.
  Drawn at the 769×654 Napa fit: 38 (today 81, plain 38).
- **Ribbons**: Côte de Nuits, Côte de Beaune, Côte Chalonnaise z7; Saint-Joseph z7 and Rhône septentrional z6; La
  Grande Rue z13; Hermitage z10 (plain z11); Monthoux z14 (plain z15); Brauneberger Juffer-Sonnenuhr z12. Côte-Rôtie
  and Condrieu z9 as before (their length clause is met at z9 too).
- **Map-wide** (3,388 subregions): 892 later than today, none earlier; 95 earlier than the plain rule, 2 later (exact
  Mercator vs the plain rule's shard-latitude approximation: Sta. Rita Hills 23.9 px, Sierra Pelona Valley 23.8 px).

### 11.5 Tiles: parts, bytes, validation, max_zoom

- **Every tier ≥ 2 feature carries `reveal_area`**; each shard in release.json carries `reveal_rule: 1`, which
  publish.mjs keeps in `tile_checksums` and promote.mjs (`manifestForRelease`, also used for local drafts) copies into
  the manifest. The world archive holds only countries and regions: its inputs are byte-identical to master's.
- **Bytes** (estimate: every unique tile of the production archives decoded, split and re-encoded with vt-pbf + gzip;
  the re-encode reproduces tippecanoe's bytes within 1-7 %): world unchanged (381,587 B ≤ 400 KB); California 2.57 →
  2.69 MB (+4.6 %, ≤ 3 MB); Washington 565 → 585 KB, Oregon 523 → 538 KB, New York 88 → 102 KB (≤ 1.5 MB); all
  shards 15.9 → 17.1 MB (+7.7 %; largest: Galicia +21 %, New York +16 %, Savoie +14 %, Pfalz +13 %). Largest tile
  after the split: 18 KB gzipped, far under tippecanoe's 500 KB limit.
- **validate.mjs**: its gates are per id, so a place's parts count once (unchanged); a new gate refuses a flagged
  shard whose decoded subregions lack a numeric `reveal_area` (`checkTileFeature`). Checked locally on PMTiles built
  from the dry run for all 71 shards (285 gates pass; an archive without `reveal_area` is refused).
- **max_zoom**: a shard's `max_zoom` stays `ceil(max label_min_zoom) + 2` (≤ 16). The export now asserts every
  place's tile zoom `floor(min_zoom)` is ≤ its shard's `max_zoom`, so every feature is written. A reveal zoom above
  `max_zoom` needs nothing more: MapLibre overzooms the max-zoom tile and evaluates the filter at the tile's
  overscaled zoom (`WorkerTile.zoom = tileID.overscaledZ`), so the place is drawn from the max-zoom geometry.

### 11.6 Deploy order and the draft check

1. **App deploy.** Production tiles carry no `reveal_area` and the live manifest no `reveal_rule`, so every shard's
   filter is exactly today's, the camera is today's (parent floor 0, z16 cap) and no cue appears. Checked locally
   against the live manifest: default and `?revealPx=0` identical in camera, filters, drawn places, labels and status
   for 11 views on desktop and 3 on a phone, and no filter carries the term.
2. **Draft tiles release** (Wine Map Tiles, promote=false, from this branch): archives land in
   `tiles/releases/<version>/`, a VALIDATED `wine_map_releases` row records them; no manifest is written. A local build
   loads it through `NEXT_PUBLIC_WINE_MAP_MANIFEST_URL` (steps in `reveal/build/draft-test.md`).
3. **Promote** that release: the manifest's `reveal_rule` switches the rule on, shard by shard.

### 11.7 The named places at 24 px (read-only export dry run of the live catalogue, 2026-09-30)

today = first zoom drawn before any size rule; plain = the whole-footprint rule of §0-§10 on today's tiles; new =
this build (shape, and the name when later). Sizes on screen at the new zoom, CSS px, true Web Mercator: √area of
the whole place · the anchor part's long side × mean thickness; S = long side ÷ thickness; how = what first lets it
in (not delayed = drawn at its tile zoom).

| Place | tier · parts | today | plain 24 px (f2c902c) | **new** (shape · name) | at the new zoom: √area · length × thickness (px) | S = L/T | how |
|---|---|---|---|---|---|---|---|
| Chablis (district) | t2 · 1 | z7 | z7 | **z7** | 26.6 · 40.1 × 17.7 | 2.3 | not delayed |
| Grand Auxerrois | t2 · 2 | z7 | z8 | **z7** | 15.6 · 18.7 × 9.7 | 1.9 | with its region's subregions |
| Côte de Nuits | t2 · 1 | z7 | z8 | **z7** | 14.1 · 53.8 × 3.7 | 14.6 | by its length (ribbon) |
| Côte de Beaune | t2 · 1 | z7 | z8 | **z7** | 20.3 · 64.6 × 6.4 | 10.1 | by its length (ribbon) |
| Côte Chalonnaise | t2 · 1 | z7 | z8 | **z7** | 18.2 · 60.5 × 5.5 | 11.1 | by its length (ribbon) |
| Mâconnais | t2 · 1 | z7 | z7 | **z7** | 56.2 · 107 × 29.6 | 3.6 | not delayed |
| Rhône septentrional | t2 · 1 | z6 | z7 | **z6** | 18.2 · 77.8 × 4.3 | 18.3 | by its length (ribbon) |
| Côte-Rôtie | t3 · 1 | z7 | z9 | **z9** | 24.4 · 78.3 × 7.6 | 10.3 | by its area |
| Condrieu | t3 · 2 | z7 | z9 | **z9** | 24.8 · 118 × 4.6 | 25.9 | by its area |
| Château-Grillet | t3 · 1 | z7 | z13 | **z13** | 31.5 · 45.9 × 21.6 | 2.1 | by its area |
| Saint-Joseph | t3 · 3 | z7 | z8 | **z7** | 19.2 · 86.5 × 3.3 | 25.9 | by its length (ribbon) |
| Hermitage | t3 · 1 | z7 | z11 | **z10** | 22.8 · 51.0 × 10.2 | 5.0 | by its length (ribbon) |
| Crozes-Hermitage | t3 · 1 | z7 | z8 | **z8** | 37.2 · 77.2 × 17.9 | 4.3 | by its area |
| Cornas | t3 · 1 | z7 | z10 | **z10** | 43.8 · 54.5 × 35.1 | 1.6 | by its area |
| Baixo Corgo | t2 · 1 | z5 | z7 | **z6** | 21.8 · 28.8 × 16.6 | 1.7 | with its region's subregions |
| Cima Corgo | t2 · 1 | z5 | z6 | **z6** | 33.9 · 44.7 × 25.6 | 1.7 | by its area |
| Douro Superior | t2 · 2 | z5 | z6 | **z6** | 39.4 · 61.3 × 24.4 | 2.5 | by its area |
| Bernkastel (Bereich) | t2 · 3 | z7 | z7 | **z7** | 38.4 · 103 × 13.5 | 7.6 | not delayed |
| Burg Cochem | t2 · 1 | z7 | z7 | **z7** | 26.6 · 123 × 5.8 | 21.3 | not delayed |
| Obermosel | t2 · 4 | z7 | z8 | **z8** | 35.5 · 69.8 × 9.9 | 7.1 | by its area |
| Saar | t2 · 1 | z7 | z8 | **z8** | 38.6 · 80.5 × 18.5 | 4.4 | by its area |
| Ruwer | t2 · 1 | z7 | z9 | **z9** | 34.8 · 67.2 × 18.1 | 3.7 | by its area |
| Nahetal | t2 · 11 | z7 | z7 | **z7** | 37.0 · 68.9 × 14.7 | 4.7 | not delayed |
| Walporzheim/Ahrtal | t2 · 2 | z7 | z8 | **z8** | 26.6 · 63.7 × 10.0 | 6.4 | by its area |
| Loreley | t2 · 8 | z7 | z8 | **z8** | 40.3 · 57.5 × 8.8 | 6.5 | by its area |
| Bernkasteler Doctor | t4 · 1 | z12 | z13 | **z13** | 29.5 · 43.6 × 19.9 | 2.2 | by its area |
| Brauneberger Juffer-Sonnenuhr | t4 · 2 | z12 | z12 | **z12** | 26.8 · 74.3 × 5.1 | 14.6 | not delayed |
| Piesporter Goldtröpfchen | t4 · 3 | z12 | z12 | **z12** | 74.8 · 254 × 21.7 | 11.7 | not delayed |
| Cole Ranch | t3 · 1 | z6 | z11 | **z11** | 29.6 · 62.1 × 14.1 | 4.4 | by its area |
| Benmore Valley | t3 · 1 | z6 | z10 | **z10** | 38.5 · 65.5 × 22.6 | 2.9 | by its area |
| Rockpile | t3 · 1 | z6 | z8 | **z8** | 32.4 · 81.1 × 12.9 | 6.3 | by its area |
| High Valley | t3 · 1 | z6 | z8 | **z8** | 34.2 · 64.0 × 18.3 | 3.5 | by its area |
| Los Carneros | t3 · 1 | z6 | z7 | **z7** | 25.6 · 41.6 × 15.7 | 2.6 | by its area |
| Mendocino Ridge (75 parts) | t3 · 75 | z6 | z7 | **z7** | 38.8 · 79.5 × 10.5 | 7.5 | by its area |
| Napa Valley | t3 · 1 | z6 | z6 | **z6** · name z7 | 42.1 · 73.5 × 24.1 | 3.0 | not delayed |
| Oakville | t4 · 1 | z7 | z9 | **z9** | 43.8 · 71.1 × 27.0 | 2.6 | by its area |
| Stags Leap District | t4 · 1 | z7 | z9 | **z9** | 29.3 · 53.2 × 16.2 | 3.3 | by its area |
| Russian River Valley | t4 · 1 | z7 | z7 | **z7** · name z9 | 55.0 · 78.9 × 38.3 | 2.1 | not delayed |
| Pauillac | t3 · 1 | z9 | z9 | **z9** | 39.4 · 59.9 × 25.9 | 2.3 | not delayed |
| Canon-Fronsac | t3 · 1 | z7 | z10 | **z10** | 42.0 · 45.9 × 38.4 | 1.2 | by its area |
| Monthoux (smallest place) | t2 · 1 | z7 | z15 | **z14** | 14.9 · 64.9 × 3.4 | 19.0 | by its length (ribbon) |
| Romanée-Conti | t4 · 1 | z13 | z14 | **z14** | 41.7 · 53.6 × 32.4 | 1.7 | by its area |
| La Grande Rue | t4 · 1 | z13 | z14 | **z13** | 19.7 · 50.4 × 7.7 | 6.5 | by its length (ribbon) |
| La Tâche | t4 · 1 | z13 | z13 | **z13** | 37.9 · 63.2 × 22.7 | 2.8 | not delayed |
| Clos de Vougeot | t4 · 1 | z13 | z13 | **z13** | 110 · 147 × 82.7 | 1.8 | not delayed |
| Les Amoureuses (1er cru) | t5 · 1 | z14 | z14 | **z14** | 75.0 · 92.6 × 60.8 | 1.5 | not delayed |
| Barolo | t3 · 1 | z7 | z8 | **z8** | 38.7 · 53.3 × 28.1 | 1.9 | by its area |
| Barbaresco | t3 · 1 | z7 | z8 | **z8** | 29.1 · 44.0 × 19.2 | 2.3 | by its area |
| Lugana | t2 · 1 | z6 | z9 | **z9** | 25.3 · 37.1 × 17.2 | 2.2 | by its area |
