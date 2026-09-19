# Map dark mode: design

Date 2026-09-19. Base `master` at `ff43ade` (worktree `blindtastingapp-mapdark`, branch `mapdark`). There is no handoff. The owner's words are quoted in §1. The decisions the orchestrator announced are D1 to D5 in §2, and this note adds the defaults D6 to D14. There is no migration, no RPC, no tile or manifest change and no Anthropic API call.

## 1. Goal

Owner, verbatim: "we also need dark mode to apply to the map".

The 2026-09-13 dark-mode spec left this out on purpose: "Dark mode reaches the chrome around the map; the map canvas stays light-styled." This note covers what that spec deferred: a second map palette and a dark basemap. Three constraints come from `439fafa` (Plan A, the zoom-lag fix):

- no per-frame or per-zoom paint or filter rewrites;
- the fill colour stays a fixed table keyed by tree slugs;
- the world-to-shard handoff stays on feature-state.

## 2. Decisions

Announced:

- **D1 The map follows the rendered theme live.** The theme is the `.dark` class on `<html>`, however it gets there. The map switches without a reload and keeps the selected place, the camera, the grape filter and the Local/English choice.
- **D2 Basemaps.** Dark uses Carto Dark Matter. Light stays on Carto Positron. Both are un-keyed.
- **D3 Dark palette.** Region fills, outlines, the selected ring and casing, and the label ink and halo each get a dark variant chosen for contrast on Dark Matter. It is a second **fixed table**, keyed exactly as Plan A keys the first: region slug to hex, and `districtHash(slug) % 12` to hex. It is never computed per feature. It lives in a pure palette module with vitest cases.
- **D4 MapLibre chrome.** The navigation control and the compact attribution read correctly in dark. The map renders no popups, markers or scale bar (grep: none).
- **D5 Restore after the swap.** If the swap goes through a style change, the custom sources and layers and the feature-state come back afterwards. The pmtiles protocol stays registered exactly once.

Defaults chosen here:

- **D6 The swap does not go through react-map-gl's `mapStyle` prop.** The prop is frozen at the theme the map mounted with. A theme change calls `map.setStyle(url, { diff: true, transformStyle })` directly. `transformStyle` copies our sources and layers from the outgoing style onto the incoming one, so the diff never touches them. §6 explains why.
- **D7 The theme source is a `MutationObserver` on `<html>`'s `class`.** It feeds `useSyncExternalStore`, with a server snapshot of `"light"`. The hook sits inside `TileWineMap` only, so the explorer (which fetches the manifest) never re-renders on a theme flip.
- **D8 Wine paint follows the basemap, not the class.** The dark palette is applied in the `style.load` that the swap fires. If a style fetch fails, the map stays wholly light rather than showing dark wine colours on Positron.
- **D9 The dark palette comes from one documented rule, then frozen as literal hex.** The rule is in §7.1. Only the table ships, not the rule.
- **D10 Classification intensity inverts in dark.** Grand cru is the *brightest* shade of the area hue, not the darkest (§7.3). The legend word follows: "Grand cru (darkest)" in light, "Grand cru (brightest)" in dark.
- **D11 The tint ramp (`SHADE_STEPS`) is shared by both themes.** It separates better on Dark Matter than it does on Positron (§7.2).
- **D12 The selected ring uses the app's own gold for each theme.** That is `#B78E42` in light (unchanged, the `--gold-deep` hex) and `#D4AF6A` in dark (the dark `--gold`). The casing and label halo become a warm near-black in dark, the mirror of light's cream.
- **D13 Chrome CSS lives in its own global stylesheet.** `src/app/knowledge/map/map-chrome.css` is imported by `tile-wine-map.tsx` next to `maplibre-gl.css`, so it loads with the map chunk only. It uses theme tokens and no literal colours.
- **D14 No change for a light user.** Every light colour moves verbatim into the palette module. At runtime a light user gains one `MutationObserver`, one `style.load` listener and two `useState`s.

## 3. What the code does today (verified)

**Theme.**

- `src/lib/theme.ts`: `readTheme()` returns the stored choice or `"light"`. The OS preference is ignored since the 2026-09-14 hotfix. `applyTheme()` toggles `.dark` and sets `colorScheme` on `<html>`.
- `THEME_SCRIPT` (`src/app/layout.tsx`) sets the class before first paint.
- `ThemeSync` (`src/components/theme-sync.tsx`) re-applies the class in a layout effect after any render, because React can overwrite `<html>`'s class attribute.
- The switches are `sidebar-theme-switch.tsx` and `theme-toggle.tsx`, and both go through `setThemeChoice`.
- The `.dark` tokens sit inside `@media screen` in `globals.css`.

**Map** (`src/app/knowledge/map/tile-wine-map.tsx`, 1847 lines).

- `mapStyle={BASEMAP_STYLE}` is the Positron URL.
- `onLoad` removes basemap layers whose `source-layer` is in `PRUNED_BASEMAP_LAYERS` (`housenumber`, `poi`, `transportation_name`, `aeroway`, `building`). It also calls `setLayerZoomRange(id, max(7, minzoom), maxzoom ?? 24)` on every `symbol` layer whose source-layer is `place`, then collapses the compact attribution.
- Our layers:
  - The world source `wine-world` (`promoteId="region"`) has `world-fills`, `world-outlines`, `world-region-fills`, `world-region-outlines`, `world-selected-casing`, `world-selected-ring` and `world-labels`.
  - One source per mounted shard, `wine-shard-<key>`, has `shard-fills-<key>`, `shard-outlines-<key>`, `shard-labels-<key>`, and the owning shard only has `shard-selected-casing-<key>` and `shard-selected-ring-<key>`.
  - No `beforeId` is used, so our layers are appended after the basemap in mount order, with world first. The `world-labels` comment depends on that order.

Every hardcoded colour in the file (and in the whole map canvas):

| Constant / site | Value | Role |
|---|---|---|
| `REGION_COLORS` (64 keys) | l.72–143 | region hue; `regionMatch` spreads it over `SHADE_STEPS` by the `tint` tile property |
| `FALLBACK_COLOR` | `#6B6257` | unknown region; equals the france/spain/portugal neutral |
| `DISTRICT_PALETTE` (12) | l.325–328 | area hue from z8 (`AREA_PALETTE_ZOOM`), index `districtHash(slug) % 12` |
| `classificationShades` | `shade(hex, 0.45, +0.3)`, `shade(hex, 0.68, +0.14)` | grand / premier cru |
| `SELECTED_COLOR` | `#B78E42` | selected ring (world + shard), legend swatch l.1766 |
| casing | `#FFFDF7` @0.85 | l.1647, l.1708 |
| `labelPaint` | `#2b0f18` (no selection); `#1d0a11` / `#3a2830` / `#7a666f` (selected / related / distant); halo `#FFFDF7` | label ink |

`WORLD_HANDED_FACTOR` (feature-state `handed`) only touches opacity, so it does not depend on the theme. There is no hover paint; hover only changes the cursor.

The Plan A invariants that must survive are:

- `areaColor` is keyed only on `areaSlugs` (which changes once, when the tree loads) and `rampedRegions` (which latches at most once per region).
- The world filters are static apart from the grape gate.
- `recomputeReady` is debounced.
- Paint, filter and layout come from `useMemo` and never from camera state.

**`localize-names.ts` touches no basemap layer.** The task text assumed it rewrites the basemap's label layers. It does not:

- It only builds `englishTextFieldExpression()`, a `match` on the wine tile property `name`, for *our* `world-labels` and `shard-labels-*` `text-field` (`labelLayout(..., english)`).
- The basemap's own labels use Carto's `{name_en}`, `{name}`, or zoom stops from `{name_en}` to `{name}`. That is identical in both styles and was never switched by the Local/English toggle.
- So "re-applying localisation" after the swap means carrying our label layers' layout across unchanged. `transformStyle` does that (§6).
- The basemap layer ids the code *does* touch are the prune and zoom-range sets in §4. They exist in both styles.

**The rest of the pipeline.**

- `manifest.ts` fetches `tiles/manifest.json` once per `manifestAttempt` in the explorer's effect. That is unaffected.
- `shard.ts` is unaffected.
- `page.tsx` preconnects `BASEMAP_ORIGIN = "https://basemaps.cartocdn.com"` and the tile origin.

## 4. The two basemaps (fetched 2026-09-19)

Both style JSONs were fetched with curl from `https://basemaps.cartocdn.com/gl/{positron,dark-matter}-gl-style/style.json`. The server returns `Cache-Control: public,max-age=15552000`, so after the first flip a toggle hits the HTTP cache.

| | Positron | Dark Matter |
|---|---|---|
| `background` | `#fafaf8` | **`#0e0e0e`** |
| `landcover` / `landuse` / `park_*` | `rgba(234,241,233,0.5)` | **`#0e0e0e`** (all stops) |
| `landuse_residential` | `rgba(237,237,237,.5→.25)` | `rgba(0,0,0,.5→.15)` |
| `water` | `#d4dadc` | **`#2C353C`** |
| `waterway` | `#d1dbdf` | `rgba(63,90,109,1)` |
| `boundary_country_inner` | `#f2e6e7→#ebd6d8` | `rgba(92,94,94)→rgba(102,102,102)` |
| place label halo | `#fafaf8` | `#111` |
| sprite | `tiles.basemaps.cartocdn.com/gl/positron-gl-style/sprite` | `…/dark-matter-gl-style/sprite` |
| glyphs, sources | identical: `carto` → `tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json` | identical |
| center / zoom / bearing / pitch / projection / terrain / sky / light | absent | absent |

The structural facts, checked programmatically:

- Both styles have the same 93 layer ids.
- For every id, `type`, `source-layer`, `minzoom`, `maxzoom`, `layout` (including `text-field`) and `filter` are identical.
- The styles differ only in `paint` (91 layers), in `sprite`, and in the position of one layer: `waterway_label` is at index 13 in Positron and 66 in Dark Matter.
- One paint difference is a cross-faded property: `boundary_state`'s `line-dasharray`.

The basemap layers the code touches exist in both styles with the same zoom ranges:

- **Pruned (11):** `aeroway-runway`, `aeroway-taxiway`, `building`, `building-top`, `poi_stadium`, `poi_park`, `roadname_minor`, `roadname_sec`, `roadname_pri`, `roadname_major`, `housenumber`.
- **Place labels, zoom range raised (15):** `place_hamlet`@12-16, `place_suburbs`@12-16, `place_villages`@10-16, `place_town`@8-14, `place_country_2`@3-10, `place_country_1`@2-7, `place_state`@5-10, `place_continent`@0-2, `place_city_r6`@8-15, `place_city_r5`@8-15, `place_city_dot_r7`@6-7, `place_city_dot_r4`@5-7, `place_city_dot_r2`@4-7, `place_city_dot_z7`@7-8, `place_capital_dot_z7`@7-8.
  - After `max(7, minzoom)`, several end with `minzoom > maxzoom` (`place_continent` 7-2, `place_country_1` 7-7). That is today's behaviour and it hides them.
  - The style validator accepts it (checked with `validateStyleMin`: no errors).

**`BASEMAP_ORIGIN` stays correct for both themes.** Both style URLs are on `https://basemaps.cartocdn.com`. The sprites, glyphs and vector tiles of *both* styles are on `https://tiles.basemaps.cartocdn.com`. That host is not preconnected today and still will not be (§12).

## 5. How the theme is observed

`src/lib/rendered-theme.ts` (new, `"use client"`):

```ts
import { useSyncExternalStore } from "react";
import type { Theme } from "./theme";

/** The theme <html> is actually rendering. Pure, so it can be tested with a fake root. */
export function themeOfRoot(root: { classList: { contains(token: string): boolean } }): Theme {
  return root.classList.contains("dark") ? "dark" : "light";
}
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const snapshot = () => themeOfRoot(document.documentElement);
export function useRenderedTheme(): Theme {
  return useSyncExternalStore(subscribe, snapshot, () => "light");
}
```

**Why the class and not `useTheme()`.** Today they agree, but the class is what the page's CSS paints from, and D1 says the map follows it however it is toggled. The observer also absorbs `ThemeSync`'s correction. React's `<html>` class overwrite and `ThemeSync`'s layout-effect fix happen in the same synchronous commit. `MutationObserver` callbacks run as a microtask after it, so the snapshot reads the corrected class and does not change, and there is no re-render and no spurious swap.

The observer is filtered to `class`, so the `style.colorScheme` write in `applyTheme` never wakes it. `classList.toggle("dark", sameValue)` makes no mutation.

**First render.** `TileWineMap` only mounts after the manifest resolves in an effect, as a plain client render, never a hydration. So `useSyncExternalStore` uses `snapshot()`, and a dark user's map is created on Dark Matter directly, without loading Positron first. This is verified in §11 by the network log. This respects the CLAUDE.md rule: no `localStorage` in a `useState` initialiser. Nothing here reads storage, and the frozen initial theme below is a hook value, not a storage read.

## 6. How the style is swapped, and what is restored

**Why not the `mapStyle` prop.** react-map-gl (8.1.1, `@vis.gl/react-maplibre`) calls `map.setStyle(url, { diff: true })` on a prop change, with no `transformStyle`. MapLibre (5.24.0) then diffs the current style, which holds the basemap plus our layers, against the bare Dark Matter JSON. That emits:

- `removeLayer` for every wine layer and `removeSource` for `wine-world` and every shard;
- `addLayer` for the 11 pruned layers;
- `setLayerZoomRange` back on the 15 place labels.

react-map-gl's `<Source>` and `<Layer>` do re-add themselves on `styledata`, but the result is poor:

- The source re-add waits on a `setTimeout(0)`, so there are frames with no wine layers at all.
- The pmtiles sources are recreated, so their tile caches are dropped and tiles are fetched again.
- Feature-state is lost, which un-hands every region.
- Layer order depends on re-add timing, but `world-labels` must stay below the shard labels.
- The basemap tweaks would have to be replayed by hand.

**The swap D6 uses.** `mapStyle={BASEMAP_STYLE_URL[initialTheme]}` with `const [initialTheme] = useState(theme)`, so react-map-gl never calls `setStyle` itself. Then:

```ts
const theme = useRenderedTheme();
const [initialTheme] = useState(theme);
const [paintTheme, setPaintTheme] = useState(theme);   // D8: what the wine layers and the legend paint
const [styleEpoch, setStyleEpoch] = useState(0);        // bumps after every style.load following a swap
const palette = MAP_PALETTES[paintTheme];
const requestedBasemapRef = useRef<Theme>(initialTheme);
const landingBasemapRef = useRef<Theme>(initialTheme);
const latestThemeRef = useRef<Theme>(theme);
const mapReadyRef = useRef(false);

const swapBasemap = useCallback((next: Theme) => {
  const map = mapRef.current?.getMap();
  if (!map || !mapReadyRef.current || requestedBasemapRef.current === next) return;
  requestedBasemapRef.current = next;
  map.setStyle(BASEMAP_STYLE_URL[next], {
    diff: true,
    transformStyle: (prev, incoming) => {
      landingBasemapRef.current = next;          // exactly the request being applied
      return withWineLayers(prev, tuneBasemapStyle(incoming));
    },
  });
}, []);

useEffect(() => {
  latestThemeRef.current = theme;
  swapBasemap(theme);
}, [theme, swapBasemap]);
```

In `onLoad`, after the existing tweaks (now driven by `basemapTweaks`, below):

```ts
mapReadyRef.current = true;
e.target.on("style.load", () => {
  appliedHandoffRef.current = new Set();   // re-apply feature-state from scratch (see below)
  setPaintTheme(landingBasemapRef.current);
  setStyleEpoch((n) => n + 1);
});
swapBasemap(latestThemeRef.current);       // a flip that landed while the map was still loading
```

The handoff effect's dependency list becomes `[handedOffShards, styleEpoch]`.

**The pure functions** (`src/lib/wine-map/basemap.ts`):

- `basemapTweaks(layers)` returns `{ remove: string[]; zoomRanges: {id, minzoom, maxzoom}[] }`. It is the single rule `onLoad` applies imperatively (`removeLayer` / `setLayerZoomRange`).
- `tuneBasemapStyle(style)` applies the same result to a style spec: it drops `remove` and sets the zoom ranges. It does not mutate its input.

Because both come from one function, the serialized live style and the tuned incoming style agree. The diff then emits no `addLayer` for pruned layers and no `setLayerZoomRange`.

`withWineLayers(prev, next)`:

- If `prev` is undefined, it returns `next`.
- Otherwise:
  - `sources` = `next.sources` plus every `prev.sources` entry whose id `isWineSourceId` (`"wine-world"` or `"wine-shard-*"`), copied as-is, `promoteId` included.
  - `layers` = `next.layers` followed by every `prev.layers` entry whose `source` is a wine source, in `prev` order.

Order, filters (grape gate, focus-country gate), layout (Local/English `text-field`, `LAYER_VISIBLE`/`LAYER_HIDDEN`) and paint are carried byte for byte.

**What the diff then does.** This was simulated with `@maplibre/maplibre-gl-style-spec`'s `diff`, the function `Style.setState` runs, on the fetched JSONs.

- **Light to dark:** `setSprite` ×1, `removeLayer` + `addLayer` of `waterway_label` only, and 112 basemap `setPaintProperty`. There are **0 commands naming a wine source or layer**, and no `setStyle`, `addSource`, `removeSource` or `setLayerZoomRange`. `validateStyleMin` returns `[]`.
- **Dark to light:** `setSprite`, 51 basemap `removeLayer`/`addLayer` pairs (MapLibre's order diff walks from the end and moves the road block rather than the one label) and 62 paint ops. Again 0 wine commands.

MapLibre 5.24's `setState` fires `style.load` after applying the ops (`style.ts:894`), which runs our handler.

**What is restored, item by item:**

- **Sources and layers.** They are never removed on the diff path: identical sources produce no ops. react-map-gl's `styledata` re-render finds every source and layer present, and `updateLayer` compares props with the previous props, so it is a no-op. No leak, no duplicate.
- **Layer order.** Wine layers stay at the tail in the order they had.
- **Feature-state `handed`.** The world source survives the diff, so its state survives too. The handler still resets `appliedHandoffRef` and bumps `styleEpoch`, so the effect re-sends `setFeatureState` for every handed shard. That write is idempotent and costs a few features. The reset matters on the **full-rebuild fallback**. MapLibre takes that path (`_updateDiff` → `_updateStyle`) when a diff op is unimplemented or the style is not loaded yet. It also applies `transformStyle` there (`style.ts:471`, `_load`), but it recreates the sources, so feature-state really is gone. There, `sourcedata` then re-drives `recomputeReady` as it does on first load.
- **Basemap tweaks.** These are inside `tuneBasemapStyle`.
- **Local/English.** Carried in our label layers' `text-field`. The `english` prop keeps driving `setLayoutProperty` afterwards as before.
- **Camera.** Neither style has a camera key, and the diff has no camera ops. Selection, grape filter and expanded state are React state and are untouched.
- **pmtiles protocol.** `setStyle` never touches protocols. `ensurePmtilesProtocol()` keeps its module flag and is not called from anything keyed on the theme.
- **Attribution.** It stays collapsed. `AttributionControl._updateAttributions` returns early when the attribution string is unchanged, and the `carto` and pmtiles sources are unchanged. Even on a rebuild, `_updateCompact` only re-adds `compact-show` when `maplibregl-compact` is absent.

**Rapid toggles and failures.**

- `_diffStyle` aborts the previous request's fetch, so the last request wins.
- A toggle back before the first JSON lands diffs to "no ops". `setState` returns false, no `style.load` fires, and `paintTheme` never moved.
- A failed fetch emits a map `error` and no `style.load`, so the map stays wholly on the old theme (D8). `requestedBasemapRef` already names the new theme, so a later toggle away and back retries. No automatic retry is added.

## 7. Dark palette: values and reasoning

The ground is the Dark Matter land colour `#0e0e0e`, read from the style JSON: `background` and every `landcover`/`landuse` stop. Water is `#2C353C`. The measures are WCAG contrast ratio and OKLab ΔE, both from the scratch analysis. The light table's own figures on Positron are given for comparison.

### 7.1 Regions and districts

Why they must change: the light hues are dark jewel tones. On `#0e0e0e`, `#5C1A2B` (Bordeaux) is 1.51:1 and `#1F4E5F` (Bourgogne) is 2.13:1, which is invisible as an outline and black as a wash.

**Rule (D9), applied once, offline.**

- In OKLCH: L′ = 0.72 + 0.4·(L − 0.53), C′ = 1.1·C, reducing chroma in 2% steps until the colour is in the sRGB gamut, with hue unchanged.
- This keeps each key's hue family. That is what the light table's comments rely on: "Bordeaux claret vs Sud-Ouest amber, Rhône rust vs Provence olive-gold".
- It lifts every colour into a band of L 0.64 to 0.79, where it reads both as a line and as a wash on black.
- The equality classes are preserved automatically: france = spain = portugal = fallback, murcia = madeira, and provence = district 3.

Measured on the frozen table:

| Check | Dark on Dark Matter | Light on Positron (today) |
|---|---|---|
| min base colour vs land | **5.42:1** (bordeaux) | 2.47:1 (andalucia) |
| min `SHADE_STEPS` tint vs land | **3.03:1** | 1.59:1 |
| min wash @0.3 vs land | **1.50:1** | 1.29:1 |
| min wash ΔE to water, α ∈ {0.16, 0.32, 0.5} | **0.023** (bourgogne @0.32) | 0.012 (bourgogne @0.16) |
| closest listed neighbour pair ΔE | **0.053** (Sicilia/Calabria, Pfalz/Rheinhessen) | 0.052 (Pfalz/Rheinhessen) |
| owner-named pairs ΔE | Bordeaux/Sud-Ouest 0.157, Rhône/Provence 0.082, Bourgogne/Beaujolais 0.176 | 0.294 / 0.144 / 0.202 |

`MAP_PALETTES.dark.regions` (same 64 keys, same order as `REGION_COLORS`):

```ts
france: "#AA9F92", alsace: "#8398DC", beaujolais: "#DD83B5", bordeaux: "#C36F7F",
bourgogne: "#699DB2", champagne: "#C4A269", corse: "#EA845E", jura: "#BD89D3",
"languedoc-roussillon": "#63B5B2", loire: "#6CAF8D", piemonte: "#DA6E7C", provence: "#D49C5B",
rhone: "#CF8170", savoie: "#90B36B", "sud-ouest": "#E49C50", toscana: "#E8A746",
spain: "#AA9F92", "castilla-y-leon": "#F76D83", cataluna: "#EF9152", aragon: "#A2B162",
murcia: "#D77ABF", andalucia: "#E7B23A", galicia: "#64B793", valencia: "#FE7F65",
"castilla-la-mancha": "#D2AC4D", navarra: "#E1876F", extremadura: "#97BA81", "la-rioja": "#E3737A",
"pais-vasco": "#83A8CC", baleares: "#50C4D2", madrid: "#D39B7A", asturias: "#71B5A6",
"trentino-alto-adige": "#70ABCF", veneto: "#79BD88", sicilia: "#FE8553", lombardia: "#B18CD6",
friuli: "#EF7FAE", "emilia-romagna": "#E071A4", campania: "#59BFB8", puglia: "#E78D5C",
umbria: "#98BC5F", abruzzo: "#CB7EA4", marche: "#F97095", lazio: "#779EED",
sardegna: "#4FBEBE", liguria: "#66BAD4", calabria: "#EF7766", basilicata: "#A993E6",
"valle-d-aosta": "#A6C851", molise: "#DD956A", mosel: "#77BE9B", rheinhessen: "#DB925E",
pfalz: "#C5A25B", nahe: "#8FA5D9", ahr: "#F37685", mittelrhein: "#65BCCC",
portugal: "#AA9F92", minho: "#69C08A", douro: "#6BA1DB", dao: "#98BB63",
bairrada: "#E89655", "peninsula-de-setubal": "#58BDCD", alentejo: "#F67E5E", madeira: "#D77ABF",
```

- `MAP_PALETTES.dark.districts` = `["#E3717E", "#79AD91", "#869ED6", "#D49C5B", "#90B36B", "#BD89D3", "#63B5B2", "#EA845E", "#9F8DDD", "#71ABCE", "#C6A168", "#BC8B73"]`.
- `MAP_PALETTES.dark.fallback` = `#AA9F92`.

**Two things for the owner to look at in the browser (§12):**

- The Bordeaux region lifts to a dusty claret, `#C36F7F`. It cannot stay `#5C1A2B` on black. The UI's `--primary` bordeaux is untouched, as CLAUDE.md requires.
- Four plum or raspberry keys lift into pinks: beaujolais, friuli, marche, emilia-romagna. If they read as "hot pink", lower only those entries' chroma and re-run the tests. The floors in §8 say whether the edit still holds.

### 7.2 Tint ramp

The ramp is shared (D11). `SHADE_STEPS` spreads adjacent sites across a lightness ramp at wash opacity. The minimum adjacent-step ΔE is:

- 0.0084 dark vs 0.0041 light at α 0.18;
- 0.0177 vs 0.0073 at α 0.4.

On black the ramp separates about twice as well as on Positron, so no dark-specific steps are needed. Every dark tint stays at or above 3:1 against land (§7.1).

### 7.3 Classification intensity

With the light parameters, `shade(hex, 0.45, +0.3)` and `shade(hex, 0.68, +0.14)`, grand cru *darkens* toward the black ground. Composited at its opacity (0.65, 0.45 and 0.18 for grand, premier and village), the adjacent classes measure **1.00:1** and **1.02:1** on Dark Matter. They cannot be told apart.

Dark uses `grandCru: [1.2, 0.2]` and `premierCru: [1.08, 0.1]` (lighter and more saturated). That gives **1.85:1** and **1.88:1**, the light theme's own separation on Positron (1.85 and 1.69). The minimum shade against land is 6.22:1. The parameters live in the palette as `classification`, and `classificationShades(hex, palette)` runs when the expression is built, not per feature, as today. The legend word is `palette.grandCruLegend`: `"darkest"` or `"brightest"` (D10).

### 7.4 Selection, labels, outline weights

| Field | Light (unchanged) | Dark | Dark measure |
|---|---|---|---|
| `selectedRing` | `#B78E42` | `#D4AF6A` (dark `--gold`) | 9.32:1 vs land, 9.27:1 vs casing |
| `selectedCasing` (@0.85, 5px) | `#FFFDF7` | `#120E0C` | 1.006:1 vs land: a keyline cut into the fills, like cream on Positron (1.027) |
| `label.text` (no selection) | `#2b0f18` | `#F5EFE3` (dark `--foreground`) | 16.77:1 vs halo |
| `label.selected` | `#1d0a11` | `#FFF8EC` | 18.18:1 |
| `label.related` (@0.95) | `#3a2830` | `#E6DCCD` | 12.82:1 |
| `label.distant` (@0.8) | `#7a666f` | `#978A7D` | 4.03:1 (light 3.47: keeps it the quiet tier) |
| `label.halo` | `#FFFDF7` | `#120E0C` | reads as ground |

Line widths, opacities, halo widths, text sizes and `WORLD_HANDED_FACTOR` are unchanged and shared.

### 7.5 MapLibre chrome (`map-chrome.css`)

Every rule is inside `@media screen and (forced-colors: none)`, so forced-colors mode keeps MapLibre's own high-contrast icons and print keeps light. Every rule is scoped `.dark …` and uses tokens only:

- `.maplibregl-ctrl-group`: background `var(--card)`, `box-shadow: 0 0 0 1px var(--border)`.
- `button + button`: `border-top-color: var(--border-light)`.
- `.maplibregl-ctrl button .maplibregl-ctrl-icon`: `filter: invert(1)`.
  - The `#333` glyphs become `#ccc` (10.5:1 on `--card`).
  - The compass keeps north as the high-contrast half. North is `#333` in light and `#ccc` in dark; south goes `#ccc` → `#333`, the low-emphasis half in both themes.
- Hover: `color-mix(in srgb, var(--foreground) 8%, transparent)`.
- Focus-visible: `box-shadow: 0 0 2px 2px var(--ring)` (gold, not MapLibre's `#0096ff`: no blue in dark).
- `.maplibregl-ctrl-attrib.maplibregl-compact` and `.maplibregl-ctrl.maplibregl-ctrl-attrib`: background `var(--card)`, `color: var(--foreground)`.
- `.maplibregl-ctrl-attrib a`: `color: var(--muted-foreground)`.
- `.maplibregl-ctrl-attrib-button`: `background-color: transparent; filter: invert(1)`.

The full-view button and the legend already use tokens (`bg-background/85`, `border-border`). The legend's swatches read `palette.*`, so they always match the map.

## 8. Tests to write first

These are vitest files in node with no DOM. The vitest config has no `@/` alias, so the new pure modules use relative imports only. `maplibre-gl` types come in through `import type` and are erased.

**Fixture.** `src/lib/wine-map/__fixtures__/carto-styles.json`, retrieved 2026-09-19. It is a *trimmed* copy of both style JSONs:

- top-level `version`, `name`, `sprite`, `glyphs`, `sources`, plus any of `center`, `zoom`, `bearing`, `pitch`, `roll`, `projection`, `terrain`, `sky`, `light`, `transition`, `state` that are present (none are today);
- per layer `id`, `type`, `source`, `source-layer`, `minzoom`, `maxzoom`, `filter`, `layout`;
- `paint` only for `background`, `landcover`, `landuse`, `water`.

It is about 100 KB and carries the facts the tests need without redistributing Carto's full style. To regenerate it: curl both URLs to temp files, then `node` a 15-line trim script that reads both and writes `{ retrieved, positron, darkMatter }` with `JSON.stringify(…, null, 1)`. Put the script in the test file's header comment.

**`src/lib/wine-map/map-palette.test.ts`**

1. **Same keys.**
   - `Object.keys(light.regions).sort()` equals dark's, and there are 64 of them.
   - `districts` has length 12 in both, so `paletteArms(slugs, 12)` keys both tables identically.
   - The `label` keys are equal, and so are the `classification` keys.
2. **Valid hex.** Every string colour leaf in both palettes matches `/^#[0-9a-f]{6}$/i`.
3. **Light unchanged (pins).**
   - `light.regions.bordeaux` is `#5C1A2B`, `.bourgogne` `#1F4E5F`, `.france` `#6B6257`.
   - `light.districts[0]` is `#8C2D3C` and `[11]` is `#6B4430`.
   - `light.fallback` is `#6B6257`, `selectedRing` `#B78E42`, `selectedCasing` `#FFFDF7`.
   - `label.text` is `#2b0f18` and `label.halo` is `#FFFDF7`.
   - `classification` is `{ grandCru: [0.45, 0.3], premierCru: [0.68, 0.14] }`.
4. **Equality classes preserved.** For every pair of region keys, the light colours are equal exactly when the dark ones are.
5. **Ground read from the style JSON.**
   - `DARK_MATTER_LAND` equals, case-insensitively, the fixture's Dark Matter `background` colour and every `landcover` and `landuse` stop colour.
   - `DARK_MATTER_WATER` equals its `water` fill.
   - Likewise `POSITRON_LAND` and `POSITRON_WATER`.
6. **Base contrast.** Every dark region, district and fallback colour is ≥ 4.5:1 against `DARK_MATTER_LAND` (achieved 5.42).
7. **Tint contrast.** `shiftLightness(c, s)` for every dark colour and every `SHADE_STEPS` step is ≥ 3:1 against land (achieved 3.03).
8. **Wash visibility.** Every dark colour composited at α 0.3 over land is ≥ 1.4:1 against land. The light table's own minimum on Positron is 1.29.
9. **Not water.** Every dark colour composited at α 0.16, 0.32 and 0.5 over land is ≥ 0.02 OKLab ΔE from `DARK_MATTER_WATER`. Light's own worst against Positron water is 0.012.
10. **Neighbours distinct.** Take `NEIGHBOURS`, the adjacent pairs:
    - bordeaux/sud-ouest, rhone/provence, bourgogne/beaujolais, languedoc-roussillon/rhone, languedoc-roussillon/sud-ouest, loire/bordeaux, champagne/bourgogne, alsace/champagne, jura/savoie, jura/bourgogne;
    - la-rioja/navarra, la-rioja/pais-vasco, cataluna/aragon, valencia/murcia, castilla-y-leon/galicia, castilla-la-mancha/valencia, andalucia/extremadura;
    - piemonte/liguria, piemonte/lombardia, toscana/umbria, veneto/friuli, emilia-romagna/toscana, campania/lazio, abruzzo/marche, sicilia/calabria, puglia/basilicata;
    - mosel/nahe, mosel/ahr, pfalz/rheinhessen;
    - bairrada/dao, douro/minho, alentejo/peninsula-de-setubal.

    Every pair's dark ΔE is ≥ 0.05 (achieved 0.053; light's own closest is 0.052).
11. **Classification.** For every dark district colour, with `classificationShades(c, dark)`:
    - each shade is ≥ 4.5:1 against land;
    - composited over land at 0.65, 0.45 and 0.18 (grand, premier, base), luminance strictly *decreases* grand → premier → base, with each adjacent pair ≥ 1.6:1 (achieved 1.85 and 1.88).

    The light palette's composites over `POSITRON_LAND` strictly *increase* in luminance. This pins the inversion. `light.grandCruLegend` is `"darkest"` and `dark.grandCruLegend` is `"brightest"`.
12. **Selection.** Dark `selectedRing` is ≥ 7:1 against land and against `selectedCasing`.
13. **Labels.**
    - Dark `text`, `selected` and `related` (related composited at 0.95) are ≥ 7:1 against `halo`.
    - `distant` composited at 0.8 over `halo` is ≥ 3:1.
    - `halo` against land is ≤ 1.2:1.
14. **`districtColor(slug, palette)`** equals `palette.districts[districtHash(slug) % 12]` for both palettes.

The contrast, composite and OKLab helpers are local to this test, as in `theme-contrast.test.ts`.

**`src/lib/wine-map/basemap.test.ts`**

1. `BASEMAP_STYLE_URL.light` is the Positron URL and `.dark` the Dark Matter URL. `new URL(u).origin === BASEMAP_ORIGIN` for both, which is what the `page.tsx` preconnect needs.
2. `basemapTweaks(positron.layers).remove` equals exactly the 11 ids in §4. `zoomRanges` covers exactly the 15 place ids, with `minzoom = max(7, orig)` and `maxzoom = orig ?? 24`. `basemapTweaks(darkMatter.layers)` deep-equals it.
3. `tuneBasemapStyle` leaves no layer whose source-layer is pruned, applies the ranges, and does not mutate a deep-frozen input.
4. The tuned Positron and tuned Dark Matter have the same layer-id *set* (82) and equal `sources`. Neither fixture has a camera, projection, terrain or sky key (keeps the camera, D1).
5. `isWineSourceId`: `"wine-world"` and `"wine-shard-bordeaux"` are true; `"carto"`, `"wine-worldx"` and `""` are false.
6. `withWineLayers`:
   - Build `prev` = tuned Positron plus sources `wine-world` (`promoteId: "region"`), `wine-shard-bordeaux` and `wine-shard-bourgogne`, and seven wine layers in a deliberate order.
     - One is `world-labels` with `text-field: englishTextFieldExpression()` (from `./localize-names`, pure).
     - One is a filtered `shard-fills-bordeaux` with a grape gate `["in", ["get", "key"], ["literal", […]]]`.
     - One is `layout: { visibility: "none" }`.
   - Assert:
     - the result's `sources.carto` is next's, and each wine source deep-equals prev's;
     - `layers` is exactly next's layers then prev's wine layers in prev order, each deep-equal;
     - there are no duplicate ids.
   - `withWineLayers(undefined, next)` returns `next`.
7. **The diff.** Use `diff` and `validateStyleMin` from `@maplibre/maplibre-gl-style-spec`. It is maplibre-gl's own dependency (24.10.0, hoisted by npm, ESM entry present); do not add it to `package.json`. Diff `prev` against `withWineLayers(prev, tuneBasemapStyle(darkMatter))`:
   - no command's `args` contains a wine source or layer id;
   - no `setStyle`, `addSource`, `removeSource` or `setLayerZoomRange`;
   - the only `removeLayer`/`addLayer` commands name `waterway_label`;
   - `validateStyleMin` returns `[]`.

   The reverse (dark to light) also has no wine id in any command. Basemap re-adds are allowed there.

**`src/lib/rendered-theme.test.ts`**: `themeOfRoot` with a fake root whose `classList.contains` reports `dark` gives `"dark"`; without it gives `"light"`.

**`src/app/knowledge/map/map-chrome.test.ts`** reads the CSS as text and checks that:

- every rule sits inside one `@media screen and (forced-colors: none)` block;
- every selector starts with `.dark `;
- there is no `#hex`, `rgb(` or `hsl(` literal (colours come only from `var(--…)`, or from `color-mix` of one).

## 9. Performance argument

**Per frame, per gesture, per zoom: nothing new.**

- No listener is added on move, zoom, idle or sourcedata.
- The theme hook depends on no camera state.
- Every paint `useMemo` gains `palette` as a dependency. Palettes are two module constants, so the reference changes only when `paintTheme` does.
- The region `match` is built once per palette at module load (`REGION_MATCH.light` / `.dark`). It is not rebuilt per render.
- `fillColorExpression(areaSlugs, rampedRegions, palette)` still changes only on the tree load, the ramp latch and now a theme flip.
- Filters are untouched.

**Per theme flip (rare, user-initiated), once:**

- One style JSON fetch. It is HTTP-cached for 180 days after the first flip.
- One sprite fetch, the first time.
- A diff of basemap-only ops (§6). The `boundary_state` dasharray difference makes MapLibre re-parse the `carto` tiles it already has, with no network.
- React's `paintTheme` flip sets each mounted wine layer's colour paint once. The data-driven ones mark each wine source for one worker re-parse of tiles it already holds. There is no pmtiles fetch, no source add or remove, and no feature-state rebuild on the diff path.
- One `styleEpoch` re-send of `handed` for the handed shards.

**Never:**

- a pmtiles protocol re-registration (module flag, not keyed on theme);
- a manifest re-fetch (the explorer does not subscribe to the theme; the fetch effect is keyed on `manifestAttempt` only);
- a source or layer leak (`withWineLayers` copies by source id, tests 6 and 7 pin it, and the debug check in §11 counts them).

**For a light user** the only additions are one `MutationObserver` on `<html>` class writes (in practice none after load) and one `style.load` listener that never fires unless the theme changes.

## 10. File plan

Work in this order: tests first, then modules, then wiring.

| File | Change |
|---|---|
| `src/lib/wine-map/__fixtures__/carto-styles.json` | new: trimmed styles (§8) |
| `src/lib/wine-map/map-palette.test.ts` | new: §8 cases 1–14 (write first; fails) |
| `src/lib/wine-map/map-palette.ts` | new, pure. `MapPalette` type; `MAP_PALETTES: Record<Theme, MapPalette>` with `light` **moved verbatim** from `tile-wine-map.tsx` and `dark` from §7. Also `SHADE_STEPS`, `shiftLightness`, `shade`, `classificationShades(hex, palette)`, `districtColor(slug, palette)` (all moved), and `DARK_MATTER_LAND`/`_WATER` and `POSITRON_LAND`/`_WATER`. Imports `districtHash` from `./fill-palette`, `type Theme` from `../theme`. |
| `src/lib/wine-map/basemap.test.ts` | new: §8 cases 1–7 (write first) |
| `src/lib/wine-map/basemap.ts` | new, pure. `BASEMAP_ORIGIN`, `BASEMAP_STYLE_URL`, `PRUNED_BASEMAP_SOURCE_LAYERS` (moved), `PLACE_LABEL_MIN_ZOOM = 7`, `basemapTweaks`, `tuneBasemapStyle`, `WORLD_SOURCE_ID`, `SHARD_SOURCE_PREFIX`, `shardSourceId(key)`, `isWineSourceId`, `withWineLayers`. |
| `src/lib/rendered-theme.test.ts`, `src/lib/rendered-theme.ts` | new (§5) |
| `src/app/knowledge/map/map-chrome.test.ts`, `map-chrome.css` | new (§7.5, §8) |
| `src/app/knowledge/map/tile-wine-map.tsx` | Import palette and basemap. Delete the moved constants and helpers (`REGION_LABELS` stays). `regionMatch` becomes `REGION_MATCH[paintTheme]`. `paletteShadeExpression`, `fillColorExpression`, `labelPaint` and the ring/casing paints take `palette`. The legend reads `palette.regions`, `districtColor(slug, palette)`, `classificationShades(sample, palette)`, `palette.selectedRing` and `grandCruLegend`. Swap logic per §6, with `onLoad` tweaks via `basemapTweaks` and the `style.load` handler. Handoff effect depends on `[handedOffShards, styleEpoch]`. Source ids via `WORLD_SOURCE_ID`/`shardSourceId`. `import "./map-chrome.css"` after `maplibre-gl.css`. |
| `src/app/knowledge/map/page.tsx` | `BASEMAP_ORIGIN` imported from `@/lib/wine-map/basemap` (the local constant goes) |
| `src/lib/wine-map/fill-palette.ts` | comment only: `districtColor` now lives in `map-palette.ts` |
| `CLAUDE.md` | after it ships, one Wine Map bullet. Cover: the map follows the rendered theme; palettes in `map-palette.ts` (dark table frozen from the §7.1 rule; change both tables together, keyed alike); the basemap swap is `setStyle` diff + `transformStyle`/`withWineLayers` with `mapStyle` frozen, so never pass a changing `mapStyle`; basemap tweaks live in `basemapTweaks`. |

Not touched: the explorer, `localize-names.ts`, `manifest.ts`, `shard.ts`, `theme.ts`, `layout.tsx`, `globals.css`, the tiles pipeline and the scripts.

## 11. Verification

**Checks** (in the worktree):

- `npx vitest run src/lib/wine-map src/lib/rendered-theme.test.ts src/app/knowledge/map`
- then the full `npx vitest run`
- `npx tsc --noEmit`
- `npx eslint --max-warnings=0` on the touched files
- `npm run build`

**Browser** (the main session, not the coding agent). Use `?debugClick=1` for `window.__wineMap`.

1. **Dark first load.** Pin dark, then load `/knowledge/map`. The network log has exactly one `style.json` (dark-matter) and the dark sprite, and never Positron. `manifest.json` is fetched once.
2. **Live flip keeps the view.**
   - Select Pauillac from the tree. Zoom to about z10. Pick a grape filter. Choose Local.
   - Flip the sidebar switch to light and back.
   - Each flip swaps both the basemap and the wine colours without a reload, and the camera, ring, filter and label language are unchanged.
3. **No leaks.** After five flips, the counts below equal their pre-flip values, and there is no "protocol already registered" error:
   - `__wineMap.getStyle().layers.filter(l => /^(world|shard)-/.test(l.id)).length`
   - `Object.keys(__wineMap.getStyle().sources).length`
   - the index of `world-labels` is below every `shard-labels-*`.
4. **Handoff survives.** With a shard loaded, `__wineMap.getFeatureState({ source: "wine-world", sourceLayer: "places", id: "bordeaux" })` is `{ handed: true }` after a flip. There is no doubled Bordeaux wash.
5. **No per-gesture writes.** Wrap `setPaintProperty`, `setFilter` and `setLayoutProperty` with counters, then pinch or zoom into Bourgogne and pan. The counters stay at 0, as on master. Pan and zoom feel unchanged.
6. **Chrome.** The zoom and compass buttons, the attribution "i" and the expanded attribution read correctly in dark. Keyboard focus shows a gold ring.
7. **Legend.** The swatches match the map in both themes. With Burgundy crus in view, the dark legend says "Grand cru (brightest)".
8. **Owner look.** Bordeaux claret, the four pinks (§7.1) and Rhône/Provence at z5 and z9.

## 12. Out of scope / owner review

- **Owner eye** on §7.1's two notes (Bordeaux lifts to claret; four pinks). The lever is to edit single table entries; the tests guard the floors.
- **Basemap tone.** Dark Matter's ground is neutral black (`#0e0e0e`), while the app's dark surfaces are warm (`#1b1310`). The map sits in a bordered card, so the seam is acceptable. Warming the basemap would be a `tuneBasemapStyle` change and would invalidate every §7 measurement.
- **One canonical basemap layer order** would make the dark-to-light diff paint-only (no 51 re-adds). This was considered and not taken: it overrides Dark Matter's own stacking for a one-off cost on a rare event.
- **Preconnecting `tiles.basemaps.cartocdn.com`** (sprites, glyphs, vector tiles of both styles) is a separate latency tweak.
- **Details-panel wine-colour icon tints** in `knowledge-sections.tsx` (`#7E1B26` and others on the dark card) are outside the map canvas. They belong to a separate chrome pass.
- **`scripts/wine-map-sources/fetch-piedmont-comuni.mjs`'s** own Positron preview is untouched.
- **Carto's style URLs are unversioned.** The fixture pins 2026-09-19. A future Carto change is handled at runtime by the diff, or by its full-rebuild fallback with `transformStyle`. Refresh the fixture if a test on it ever needs to be re-checked.
