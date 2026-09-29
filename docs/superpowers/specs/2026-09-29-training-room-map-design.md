# The training room on the wine map — design

Date: 2026-09-29. Branch `room-map` off production master `66164c7`. Status: **approved to build** under the owner's standing instruction for this work ("just write the design and then implement"), revised after a feasibility review and a completeness review (§17).

Two things still wait on the owner before they reach production:
- **Copy.** Every new user-facing string in §9 is **PROVISIONAL**. The §9 table goes to the owner before each phase's production deploy, and the owner's answer is applied before that deploy.
- **O2** (§14). The region-placement migration (R1b) changes the public wine map for every user, so it is applied only after the owner answers O2. Nothing else in R1 depends on it.

It extends the training room spec (`docs/superpowers/specs/2026-09-25-training-room-design.md`, D1–D22) and its region-guess addendum (`2026-09-27-training-room-region-guess.md`, R1–R11). Both still hold unless this spec says otherwise. The USA map wave (brief A in the same research) is a separate spec. This one only records where the two meet (§13), and every migration here is written to apply before or after that wave.

Sources:
- the research briefs (`usa-briefs.md` §B) and the four research maps (`usa-understand.json`, sections `room`, `pipeline`, `collab`);
- the code on `66164c7`, read for this spec;
- read-only queries against production on 2026-09-29. Each one ran inside `begin read only … rollback`, some under `set local role authenticated` with JWT claims set.

Where the research was unsure, this spec says what the code or the data showed.

## 0. The owner's words

> "could also be cool to introduce the map to the tasting room in some way. Like if you could see the percetnage likelihoods actually on the map like a heatmap. The typical wines should be linked to the map either way"

The owner's answers to the follow-up questions:
- "Links now, then likelihood map": two-way links first, then an on-demand map in the training room. On that map each typical wine is a dot coloured by its live likelihood. It is a toggle on a laptop and a tab on a phone.
- "Training room only": no likelihoods in live blind tastings.

The main session took these research recommendations as defaults:
- The heat ramp is relative to the top wine, and the list's % is unchanged.
- The 18 typical wines with no map place get curated, display-only points.
- The room map is on demand on both widths.

## 1. Summary

**Phase R1 — links both ways (no map in the room).**
- A typical wine's detail in the room (the laptop popover and the phone sheet) says **"See it on the wine map"** and opens the explorer on the wine's home place. The 18 wines with no map place say **"Not on the wine map yet"**.
- An expanded region group in the room's list shows a link to the **map region** its wines sit in, e.g. "Veneto on the wine map" under the Prosecco group.
- On the map side:
  - The typical-wine sheet (map and Library) and the archetype page gain "Practise blind in the training room".
  - The archetype page's "← Map" goes to the wine's place.
  - Once the owner answers O2, region pages list the typical wines beneath them (R1b): Bordeaux, Rhône, Loire, Piemonte, Toscana, Veneto and, by default, 13 more regions. Bourgogne keeps its seven (five curated districts plus Bourgogne rouge and blanc, whose home is the region). The explorer's heading reads "Typical wines" when it lists more than one.
- One new read supplies the room's side: a SECURITY INVOKER RPC, `training_archetype_places()`. It runs in the pool's first round, so it adds no round trip, and it **fails soft**: if it errors, every wine reads as not on the map and the room still works.

**Phase R2 — the likelihood map (training room only, on demand).**
- A lean `TrainingMap` is loaded through `next/dynamic` with `ssr: false` and mounted only when the viewer asks for it:
  - on a laptop, a **List | Map** switch at the top of the 360 px candidates column;
  - on a phone, **List | Map** tabs in the candidates sheet.
- Each typical wine is one dot at its place's `label_point`. It is coloured and sized by its closeness **relative to the leader**. Capped wines are hollow grey rings.
- The % is on the map: the three closest positions always carry a label with the list's own %, more labels appear as the viewer zooms in, and on a laptop hovering any dot shows its name and %. A tap opens the same `ArchetypeDetail`.
- The 18 wines outside the mapped countries get curated, display-only points: two new nullable columns on `wine_archetypes`, 18 values.
- Updates are coalesced to at most one per animation frame. The camera follows the close set until the viewer moves the map. The theme follows the explorer's frozen-`mapStyle` contract. A lost WebGL context or a failed map start falls back to the list.
- A build-time kill switch, `NEXT_PUBLIC_TRAINING_MAP=0`, hides the Map tab without a code revert.

**Nothing in this spec:**
- touches `TileWineMap`, the shards, the tile pipeline, `wine_places` or `wine_place_boundaries`;
- needs a neighbour-cache refresh (CLAUDE.md "A catalogue write must be followed by a neighbour-cache refresh" applies only to those two tables);
- needs a tiles run;
- recreates a shared map function (the collab research: `get_wine_place_context` has a live-only version, `20260925190000`).

## 2. What is there today (checked 2026-09-29)

- **The pool.**
  - `readTrainingPool` (`src/lib/training/pool.ts`) reads the archetypes and their names in two rounds of `Promise.all`. The second round includes `readByIds("map places", …)` on `wine_places(id, canonical_key)`. `readAll` and `readByIds` throw on any error by design ("a failed read fails the page").
  - `shapeCandidates` (`src/lib/training/pool-shape.ts`) puts the home key on `TrainingCandidate.placeCanonicalKey` (`src/lib/training/types.ts`).
  - No component reads it. Besides `types.ts`, `pool-shape.ts`, `archetype-view.ts` and the fixture, it appears only in tests that build candidates by hand: `src/lib/training/panel.test.ts`, `src/lib/training/archetype-view.test.ts`, `src/lib/training/pool-shape.test.ts` and `src/app/admin/archetypes/profile-rules.test.ts`.
  - The comment "69 of the 87 archetypes" in `pool.ts` is stale.
- **Live counts.**
  - 102 archetypes; 84 have `wine_place_id`, 18 have none.
  - 93 `wine_archetype_placements` rows: the 84 home placements plus 9 others.
  - Five of those others are Bourgogne's curated district representatives: Chablis 10, Côte de Nuits 20, Côte de Beaune 30, Côte Chalonnaise 40 and Mâconnais 50, all at `france.bourgogne`. The other four are Chablis and Petit Chablis at `france.bourgogne.chablis`, Vosne-Romanée at `…cote-de-nuits`, and Côte-Rôtie at `france.rhone.septentrional`.
  - The Bourgogne region page lists **7** wines today: those five plus the home placements of Bourgogne rouge (sort 36) and Bourgogne blanc (sort 37). Andalucía lists 1 (the Manzanilla home) and Cataluña 1 (the Cava home).
- **The 18 without a place** (live names):
  - Argentina 1: Mendoza Malbec.
  - Australia 5: Barossa Shiraz, Clare Valley Riesling, Coonawarra Cabernet Sauvignon, Eden Valley Riesling, Hunter Valley Semillon.
  - Austria 3: Blaufränkisch (Mittelburgenland DAC), Wachau Grüner Veltliner, Wachau Riesling.
  - Chile 1: Chilean Cabernet Sauvignon (Maipo Valley DO).
  - Greece 1: Santorini Assyrtiko.
  - Hungary 1: Tokaji Aszú.
  - New Zealand 2: Central Otago Pinot Noir, Marlborough Sauvignon Blanc.
  - South Africa 1: Stellenbosch Chenin Blanc.
  - United States 3: Napa Cabernet Sauvignon, Sonoma Chardonnay, Willamette Pinot Noir.
- **Home place depth.**
  - 14 homes are REGIONs.
  - 30 are at display tier 2 (24 APPELLATION, 6 SUBREGION).
  - 35 are tier-3 APPELLATIONs.
  - 5 are at tier 4 (4 APPELLATION, 1 SITE).
  - `kind = 'REGION'` coincides exactly with `display_tier = 1` (67 rows).
  - The deepest home sits 3 hops below its region (e.g. `france.bordeaux.haut-medoc.margaux`).
- **Points.**
  - 83 of the 84 homes have a current VALIDATED boundary that an `authenticated` reader can see ("wine place boundaries validated read").
  - Montepulciano d'Abruzzo's home (`italy.abruzzo.montepulciano-d-abruzzo`) has no boundary. Its parent `italy.abruzzo` has one. So, as `authenticated`: 84 placed, **84 with a point** (83 own + 1 ancestor), 84 with a REGION ancestor.
  - A `label_point` read through the geometry→json cast is GeoJSON with a `crs` member, e.g. `{"type":"Point","crs":{…},"coordinates":[-0.3315,44.9235]}` for `france.bordeaux`. The RPC uses `ST_X`/`ST_Y` instead.
- **Co-located homes.** Seven places each hold 2 or 3 typical wines:
  - Alsace ×3;
  - Bourgogne rouge/blanc;
  - Tawny/Vintage Port;
  - Mosel Kabinett/Spätlese;
  - Pessac-Léognan red/white;
  - Rioja Reserva/Gran Reserva;
  - Fino/Oloroso.
- **Scoring region → map region.** Every one of the 30 scoring regions that has placed members maps to exactly ONE REGION ancestor. Examples: Prosecco→`italy.veneto`, Cava and Priorat→`spain.cataluna`, Jerez→`spain.andalucia`, Porto→`portugal.douro`. The 13 scoring regions of the 18 unplaced wines map to none. `regions.wine_place_id` is set on 14 French regions, nine of them scoring regions of typical wines; it covers no other country, so it cannot be the source.
- **Keeping placements in step.** `scripts/training/archetype-batch.mjs` writes only the home placement of a new archetype. The admin editor's `updateArchetype` (`src/app/admin/archetypes/actions.ts`) changes `wine_place_id` and leaves placements alone. Neither adds a REGION-ancestor placement.
- **The map side.**
  - The explorer's "Typical wine" list (`tile-wine-map-explorer.tsx`, the `archetypes.length > 0` block, heading around line 945) reads `fetchArchetypesForPlace` (`src/lib/wset/archetype-query.ts`), which reads placements only. Its heading is singular whatever the count.
  - `ArchetypeModal` (`src/components/wset/archetype-modal.tsx`) is opened from the explorer and from the Library (`src/app/knowledge/archetypes/archetype-browser.tsx`). It calls `createClient()` during render and loads the view through the async `fetchArchetype`, inside a base-ui Dialog.
  - `/knowledge/archetypes/[id]` links a bare `/knowledge/map`.
  - `fetchArchetype` (`src/lib/wset/archetype-detail.ts`) reads only the place's `name`. Its test (`archetype-detail.test.ts`, around line 96) compares the whole view with `toEqual`.
- **The room.**
  - `TrainingRoom` (`training-room.tsx`) ranks on the device: `rankCandidates` → `ranked` (around line 199) → `groupRanking` → `groups`. Only `groups` reaches `CandidatesPanel` and `CandidatesSheet`.
  - The draft (D13) is written to the device on every change (`writeDraft`, `src/lib/training/draft.ts`).
  - Laptop (lg+): a sticky 360 px `<aside>` (`sticky top-[72px] max-h-[calc(100dvh-88px)] overflow-y-auto`) holds `CandidatesPanel`. Its wine rows open `ArchetypeDetail` in a base-ui Popover anchored `side="left"`, with `anchorRef`, `pressOnOwningRow` and a `finalFocus` that returns to the row. The `TAP` class (`min-h-11 md:pointer-fine:min-h-0`) is defined in `candidates-panel.tsx`.
  - Phone: `CandidatesStrip` opens `CandidatesSheet`, a base-ui Dialog bottom sheet (`max-lg:max-h-[88dvh]`, a `flex flex-col` content, a body that is `min-h-0 flex-1 overflow-y-auto overscroll-contain`). A wine row swaps the sheet's content to the detail, with Back.
  - `src/components/ui/dialog.tsx` has no swipe or drag handler; the sheet's pill is decorative.
- **Map stack.**
  - `maplibre-gl ^5.24.0`, `react-map-gl ^8.1.1` (`@vis.gl/react-maplibre`), `pmtiles ^4.4.1` (`package.json`). MapLibre is about 276 KB gzip, per the research.
  - `@vis.gl/react-maplibre` builds the map inside a promise `.then` (`dist/components/map.js`). A constructor throw (no WebGL) never reaches an error boundary: it goes to the `onError` prop with `target: null`, or to `console.error` when there is no `onError`. The explorer passes no `onError`.
  - The explorer imports `maplibre-gl/dist/maplibre-gl.css` (which carries the canvas's `touch-action: none` rules) and `./map-chrome.css` (the dark controls), mounts with `mapStyle={BASEMAP_STYLE_URL[initialTheme]}`, and applies `basemapTweaks` on load.
  - `basemap.ts` offers `loadBasemapStyle` / `cachedBasemapStyle` (module memory per theme), `tuneBasemapStyle`, `basemapTweaks` and `withWineLayers`, which carries the sources that `isWineSourceId` names. It imports only types from maplibre-gl.
  - `useRenderedTheme` (`src/lib/rendered-theme.ts`) supplies the theme.
  - `MAP_PALETTES` (`src/lib/wine-map/map-palette.ts`) holds two tables keyed alike, guarded by `map-palette.test.ts`.
  - `MapErrorBoundary` (`src/app/knowledge/map/map-error-boundary.tsx`) reloads the page as its Retry for a chunk error (`isChunkLoadError`).
  - `installHoverCursor` (`src/lib/wine-map/hover-cursor.ts`) decides clickability with `hoverIsClickable`, which needs `properties.tier > 0` or zoom ≤ 5, and queries the exact pointer point.
  - `RangeControl` (`src/components/overview/range-control.tsx`) has `role="tablist"`/`"tab"` and `aria-selected`, and no keyboard handling.
  - maplibre-gl 5 exports `CircleLayerSpecification` and `SymbolLayerSpecification` (re-exported from the style spec), not `CirclePaint`/`SymbolLayout`.
  - `vitest.config.mts` maps `@` to `./src`.
- **Live tests.** `scripts/training-room.test.mjs` asserts Pauillac has `placements: 1` (around line 888), and that Napa has `{ wine_place_id: null, placements: 0 }`.
- **Migrations.** The latest live version is `20260929090000`. The friend applies migrations to live directly (collab research).

## 3. Decisions

### Scope

- **RM1 — Training room only.** No likelihood, no room map and no matcher output appears in a tasting, a lobby or the play page. `training-map.tsx` and `src/lib/training/map-view.ts` are imported only from under `src/app/taste/training/` and from `map-view.ts`'s own test, and a test pins that (§11). Reasons:
  - the owner's answer ("Training room only");
  - training spec §12, "The matcher as a hint inside real blind tastings is tempting and explicitly out";
  - rule 1 and fairness in live tastings.
- **RM2 — Two phases, each shippable on its own:** R1 (links) and then R2 (the map). R1 needs no MapLibre in the room. Reason: the owner chose "Links now, then likelihood map", and R1 already meets "linked to the map either way".

### R1 — links

- **RM3 — One new read: `training_archetype_places()`.** It is SECURITY INVOKER, STABLE, EXECUTE for `authenticated` only, and revoked from PUBLIC, `anon` and `service_role`. It returns one row per archetype (102 today):
  - `archetype_id`;
  - `place_key` (the home place's key);
  - `region_key` and `region_name` (the REGION ancestor, RM4);
  - `point_key`, `point_lon` and `point_lat` (the nearest place in the chain, self included, with a current VALIDATED boundary, and that boundary's `label_point`).

  `readTrainingPool` starts it in its FIRST `Promise.all`, beside the archetype read, and it replaces the "map places" `readByIds`. Reasons:
  - The REGION ancestor needs a walk up `primary_parent_id`; CLAUDE.md says `canonical_key` is opaque, so it is never split.
  - A client-side walk would add up to 3 sequential round trips (homes are up to 3 hops below their region).
  - The RPC's body, run read-only as `authenticated` on live, took 25.5 ms. It returned 102 rows: 84 with place, region and point, one of those points an ancestor's (`italy.abruzzo`).
  - Under invoker rights, `wine_places` "verified read" and the boundaries' "validated read" apply as they do everywhere else.
  - Revoking `service_role` follows the house rule of not leaving Supabase's default grant on a new function (`transfer_tasting_host`, `refresh_wine_place_neighbours`). Nothing calls this function with the service key.
- **RM3a — The RPC fails soft; nothing else in the pool does.** It is the only pool read that serves links and dots rather than ranking. On an error, `readTrainingPool` logs it (`console.error("training pool: map places", error)`) and shapes every candidate as unplaced: `placeCanonicalKey`, `mapRegion` and the place/ancestor `mapPoint` are null, so every detail reads "Not on the wine map yet" and the R2 map shows curated points only. The room still ranks, scores and saves. Reason: a failure here (a PostgREST schema cache that has not reloaded, a lock during a neighbour's DDL, an RLS change on `wine_places` or its boundaries) must not take the whole training room down for a feature that only links out. The archetype read itself keeps "a failed read fails the page".
- **RM4 — A candidate's map region is the nearest place in its chain, itself included, whose `kind` is `REGION`.** Reason: live, REGION and tier 1 are the same 67 rows. `kind` is the semantic field; `display_tier` is a rendering one. 14 homes are REGIONs themselves.
- **RM5 — A group's map region is its members' map region.** Today every placed group agrees (§2). If members ever disagree, the region most members name wins, ties by key. A group with no placed member has none. `groupRanking` (`src/lib/training/groups.ts`) derives it. Reason: this is deterministic and needs no key parsing. The scoring-region grouping (addendum R1) is unchanged.
- **RM6 — "See it on the wine map" opens `/knowledge/map?place=<encodeURIComponent(home key)>` in a new tab** (`target="_blank" rel="noopener"`, an ↗ icon, and a visually hidden "(opens in a new tab)"). It sits at the foot of `ArchetypeDetail`, which serves both the laptop popover and the phone sheet. Reasons:
  - The link is reference material in the middle of a session. The device draft (D13) would survive a same-tab visit, but the panel's open regions, Show all and the open popover would not, and coming back costs a Continue tap.
  - `?place=` is the house deep link (`catalog/[wineId]/page.tsx`, `global-search.tsx`, `classification-table.tsx`).
  - On an iPhone the explorer opens in a second tab, and under memory pressure the browser may evict the training tab. Coming back then reloads it: the draft (D13, written on every change) offers Continue, but open panels are lost. An acceptance check covers this path (§10 R1-8), and O1 states it to the owner.

  This is a provisional owner decision (§14, O1).
- **RM7 — A candidate with no home place shows "Not on the wine map yet" as plain muted text, not a link.** This stays true in R2 even when the wine has a curated point. Reason: a curated point is not a map place. The explorer has nothing to open.
- **RM8 — The region link sits inside the expanded group, as a small first row above its wines. It is never inside the region row.** The region row is a `<button>`, and a link inside it would be nested interactive content. The link names the **map** region: "Veneto on the wine map" under Prosecco, and "Andalucía on the wine map" under Jerez. A group with no map region shows "Not on the wine map yet". Reason: the link is honest about the scoring-region/map-region difference (brief B risk 3). Once R1b is live, the destination region page lists every typical wine of the group (RM9); before that the link still lands on the right region.
- **RM9 — Region pages list their typical wines (R1b, after the owner's O2 answer).** One data migration places typical wines at their REGION ancestor as well, except under `france.bourgogne`, which keeps its curated representatives.
  - The rows are a **literal list** of (archetype id, region `canonical_key`, `sort_order`) triples, in Appendix A, generated once from the rule below against live on 2026-09-29 and committed in both the migration and its rollback file. The rule: every placed archetype whose REGION ancestor is not its home and is not `france.bourgogne`, with no placement there yet.
  - Default (O2 = all): **50 rows over 19 regions**. The brief's six (Bordeaux 9, Rhône 7, Loire 5, Piemonte 4, Veneto 4, Toscana 3 = 32 rows), then Castilla y León 3; Provence, Douro and Andalucía 2 each; Beaujolais, Sud-Ouest, Abruzzo, Campania, Lombardia, Puglia, Sicilia, Cataluña and Galicia 1 each (18 rows). If the owner answers "the six only", the migration carries the 32 rows marked "six" in Appendix A.
  - Region **page totals** after the full list: Bordeaux 9, Rhône 7, Loire 5, Piemonte 4, Veneto 4, Toscana 3, Castilla y León 3, **Andalucía 3** (Manzanilla's home plus Fino and Oloroso), Provence 2, Douro 2, **Cataluña 2** (Cava's home plus Priorat), and 1 each for the other eight. **Bourgogne 7**, unchanged.
  - `sort_order` is the archetype's own `sort_order`, the convention of the 20260829224000 backfill.
  - The explorer's heading becomes "Typical wines" when the list has more than one row (`typicalWinesHeading(n)`, §9).

  Reasons:
  - A region page that shows none of the typical wines beneath it is the same gap whether it has one or nine.
  - Bourgogne is excluded because its 22 wines would bury its panel, and a curator already chose its representatives.
  - A literal list makes the rollback exact: `wine_archetype_placements` has no source column, so a rule-derived delete could remove a curator's own rows.
  - The write touches `wine_archetype_placements` only: no `wine_places` or boundary write, no neighbour refresh, no tiles run (brief B, "data only").
  - It changes the public map for every user, and it is neither an owner answer nor a main-session default, hence O2.
- **RM9a — The rule is kept, not just applied once.** From R1b on, "every placed archetype outside `france.bourgogne` has a placement at its REGION ancestor" is a standing rule:
  - `scripts/training/archetype-batch.mjs` emits that placement for each new archetype, beside its home placement (same `sort_order`), with the same REGION walk as the RPC;
  - a live drift-guard test (`scripts/training-room.test.mjs`) lists placed archetypes that break the rule and expects none. An editor home change (`updateArchetype`) is the one path that can break it; the fix is a placement add in `/admin/archetypes`, and the test says so in its message;
  - the CLAUDE.md bullet states the rule, and the USA wave's migration follows it (§13).
- **RM10 — Map → room.**
  - (a) `ArchetypeModal` and `/knowledge/archetypes/[id]` gain "Practise blind in the training room", which links to `/taste/training`. It never names the archetype: a link that pre-selects a wine would defeat a blind session.
  - (b) The archetype page's "← Map" goes to `?place=<home key>`, or stays bare `/knowledge/map` when there is none. `fetchArchetype` also reads the place's `canonical_key` and returns it on a new optional `ArchetypeView.placeKey`. It is optional so the admin editor's `draftView` needs no change. `archetype-detail.test.ts`'s exact `toEqual` gains `placeKey` (its `wine_places` mock gains `canonical_key`).
  - (c) `ArchetypeModal` takes `mapLink?: boolean`. The Library passes `true` and shows "See it on the wine map" (a same-tab link: the Library is not a session). The explorer passes nothing, because the viewer is already on the map.
  - (d) The footer links are a pure, exported component, `ArchetypeLinks({ placeKey, mapLink })` (`src/components/wset/archetype-links.tsx`), which `ArchetypeModal` and the archetype page both render. It is what the markup test renders, because the modal itself cannot be rendered statically (Dialog portal, `createClient()` in render, async load).

### R2 — the likelihood map

- **RM11 — A lean `TrainingMap`, never `TileWineMap`.** It is `src/app/taste/training/training-map.tsx`, loaded through `next/dynamic` with `ssr: false` (maplibre-gl touches `window` on import, CLAUDE.md), and mounted only while the Map view is open.
  - One module-level loader, `loadTrainingMap = () => import("./training-map")` (`src/app/taste/training/training-map-loader.ts`), feeds both `dynamic(loadTrainingMap, { ssr: false })` and the warm-up (RM24), so the source test can pin a single import site.
  - It imports `maplibre-gl/dist/maplibre-gl.css` and `src/app/knowledge/map/map-chrome.css`, as the explorer does. The first carries the canvas's `touch-action: none` (RM20); the second dresses the controls for dark.
  - It reuses `basemap.ts`, `useRenderedTheme`, `MAP_PALETTES` and `MapErrorBoundary`. The legend (`training-map-legend.tsx`) is rendered by `training-map.tsx`, so it and `map-palette.ts` ride in the dynamic chunk.
  - It uses no pmtiles, no manifest, no shards and no explorer state.

  Reasons:
  - The research put the explorer's own heat (Option B) at 6–9 days with a real risk of regressing the live-measured map (CLAUDE.md "Wine map performance"). A points-only map is 2–3 days.
  - A basemap plus one GeoJSON source can reach every typical wine, the curated ones included.
- **RM12 — One dot per typical wine.** Its position is the first of these that exists:
  1. its home place's `label_point` (source `place`);
  2. the nearest ancestor's (source `ancestor`, today only Montepulciano d'Abruzzo → `italy.abruzzo`);
  3. its curated display point (source `curated`, RM23).

  Otherwise it has no dot and is listed under "not on the wine map yet". There is no MapLibre `heatmap` layer. Reasons:
  - A density heatmap glows where many archetypes sit: Bourgogne holds 22, Bordeaux 9. It would light Burgundy for any red note (brief B).
  - Seven places hold 2–3 wines (§2); their dots stack exactly. RM13's sort key draws the hottest on top, so a stack reads as its best member, never as a sum.
  - Positions are never nudged off their real place. RM15 merges a stack's label, and RM18's chooser separates a stack on tap.
- **RM13 — The ramp is relative to the leader.** `heat = closeness / top`, where `top` is the best uncapped closeness (`null` when no wine is uncapped with a closeness).
  - `heatOf(closeness, top)`: `null` when `closeness` is null; `0` when `top` is null or `top ≤ 0`; otherwise `closeness / top`, linear.
  - Colour interpolates linearly over the four `heat` stops at 0.5, 0.75, 0.9 and 1.0 (below 0.5 is the first stop).
  - Radius runs from 4 px (heat ≤ 0.5) to 11 px (heat 1), scaled ×0.85 at z3 and ×1.2 at z8 by a zoom interpolate at the top level.
  - A capped wine (`capped !== null`, whatever its capped closeness ≤ `CAP_MAX` 15) is a **hollow ring**: 4 px, no fill, a 1.5 px stroke in `heat.capped`.
  - A wine with `closeness === null` is a 5 px dot in `heat.neutral`.
  - Before any answer every dot is neutral.
  - `circle-sort-key`: heat for scored wines, −0.5 for neutral, −1 for capped. A higher key draws on top.

  Reasons:
  - The "%" is closeness (each wine measured on its own), not a probability. Early on many wines sit near 100 %, so an absolute ramp saturates (brief B risk 1).
  - The matcher's soft ranges crowd the leaders together. Putting the stops at 0.5–1.0 spends the ramp where the choice is. The break points are tuned against real notes during verification (§12), and the pure `heatOf` stays linear.
  - Lightness and size both encode heat, and a capped wine differs in shape, not only in colour, so the map reads under colour-vision deficiency. This follows the dataviz rule of never encoding by hue alone.
- **RM14 — The heat colours live in both `MAP_PALETTES` tables** as a new `heat` block, appended at the END of each table (the collab research: the palette file is a registry the friend also edits, so it must be hand-merged; §13 gives the merge order). The values in the table below are measured with the WCAG formula and OKLab from `map-palette.test.ts`'s own helpers.
  - The light ramp darkens toward bordeaux; the dark ramp brightens toward cream. This is the same inversion the classification ramp makes (`grandCruLegend`).

  | | coldest → hottest | capped | neutral | casing |
  |---|---|---|---|---|
  | light | `#A7813A` `#A95834` `#8C2D3C` `#5C1A2B` | `#8A8580` | `#8A7A6A` | `#FFFDF7` |
  | dark | `#8E6A42` `#BF7253` `#E88A92` `#F7D6AE` | `#8A847D` | `#978A7D` | `#120E0C` |

  Measured on the land colours, with Positron `#fafaf8` for light and Dark Matter `#0e0e0e` for dark:
  - **Stop contrast:** light 3.44 / 4.86 / 7.86 / 12.27:1; dark 3.94 / 5.28 / 7.80 / 13.96:1.
  - **Hottest against coldest:** 3.57:1 in light and 3.54:1 in dark.
  - **Lightness steps (OKLab L), always away from the ground:** light −0.075 / −0.107 / −0.113; dark +0.078 / +0.105 / +0.159.
  - **Adjacent ΔE:** at least 0.104 in light and 0.094 in dark.
  - **Capped:** 3.50:1 in light and 5.22:1 in dark. Neutral: 3.96:1 and 5.74:1.
  - **Casing against land:** 1.03 and 1.01. The casing reads as ground and only cuts overlapping dots apart; it is `selectedCasing`'s value in each theme.

  The hottest light stop is the brand bordeaux. A dot that opens a detail wears `selectedRing` (the gold line) while its detail is open.
- **RM15 — The % is on the map.**
  - **Labels by position.** Labels are computed per distinct dot position (dots at the exact same coordinates are one position). Each position's label is its best-ranked uncapped wine with a closeness, as "`shortName` `percentLabel`" ("Pauillac 91 %", the list's own helpers in `copy.ts`). When other wines share the position, it gains " +{n}" ("Alsace Riesling 88 % +2"), `n` counting every other wine there.
  - **Always and on zoom.** The three best-ranked positions (`LABEL_COUNT`) carry `rank` 1–3 and are always labelled. Every other labelled position is shown from z7 up: `text-field` is a zoom `step` that returns `""` below z7 for `rank > 3`.
  - **Placement.** A symbol layer with the palette's `label.text`/`label.halo`, `text-variable-anchor: ["right", "left", "top", "bottom"]` with `text-radial-offset` of the dot radius plus 2 px, `symbol-sort-key` by `rank` (so collisions keep the best), and the default `text-allow-overlap: false` (a colliding label drops rather than covering another).
  - **Hover (fine pointer).** Hovering a dot shows a small tooltip with the same text as its label, whether or not the label is drawn. It is a plain absolutely positioned element over the map, driven by `installHoverCursor`'s new `onHover` option (RM18), not a MapLibre Popup.

  Reasons: the number on the map is literally the list's number, so the two can never disagree. The owner asked to see the percentages on the map; three always-on labels, zoom-in labels and hover make every dot's % reachable without cluttering a 360 px column. A stacked position would otherwise hide all but one of its wines' labels (Alsace ×3, Pessac-Léognan red and white).
- **RM16 — Updates are coalesced per frame.** There is one GeoJSON source (`wine-training`). When `ranked` changes, an effect builds the FeatureCollection (pure, RM26) and compares a fingerprint (`id:heat to 2 dp:capped:label:rank`, joined). If it changed, the effect schedules ONE `requestAnimationFrame` that calls `setData`, cancelling any frame still pending. The effect does nothing while the map is not mounted. Reasons:
  - `circle-sort-key` and the labels' `text-field` are layout properties, which feature-state cannot drive, so the data itself must change.
  - At 102 points geojson-vt re-tiles in well under a frame.
  - A slider drag in the WSET sheet re-ranks on every change (D6). The frame cap bounds the map's share.
  - On a phone the sheet is modal, so the note cannot change while the map shows. Live updates matter on a laptop.
- **RM17 — The camera.**
  - Before any answer, it shows the pool's European view: `EUROPE_BOX = [-10, 35.5, 27, 52.5]`, which holds Portugal to Santorini and Jerez to the Mosel.
  - After answers, it fits the **fit set**: the close set (the leader plus every uncapped wine within `CLOSE_WINDOW`, 10 points, `copy.ts`; the strip's "N more close") restricted to wines with a dot, cut to the `CAMERA_SET_MAX` (12) best-ranked, then to those within `CAMERA_REACH_DEG` (25°) of the leader's dot in both longitude and latitude. It uses 40 px padding and `maxZoom` `FIT_MAX_ZOOM` (10).
  - When the fit set is a single position, the box is that point padded by `FIT_MIN_SPAN_DEG` (0.6°) each way, so a lone leader still shows its neighbours.
  - It follows the fit set automatically, 600 ms after its membership last changed, until the viewer first moves the map: a `movestart` carrying an `originalEvent`, the explorer's own test for a user move.
  - After that, a "Fit to the closest" control appears and the camera never moves by itself.
  - Under `prefers-reduced-motion` every fit is instant; otherwise `easeTo` takes 500 ms.
  - A close set with no dot leaves the camera where it is.

  Reasons:
  - Fitting on every answer would jerk the map during a slider drag.
  - "Fit the top group" (brief B) would zoom into one scoring region and lose the comparison the map exists to show.
  - Early answers put dozens of wines near 100 %, the New World curated points included; fitting all of them would show the whole world in 360 px and melt Europe's 80 dots into one blob. The cap and the reach keep the camera on where the leaders actually are.
  - A claret note's leaders (Pauillac, Saint-Julien, Saint-Estèphe) sit 5–10 px apart at z7, less than a dot's width; at z10 they are 40–80 px apart, so their labels fit.
  - The close set is a concept the room already names.
- **RM18 — A tap opens the same detail.** The dots' layer is interactive. A tap queries a box around the point, ±22 px on a coarse pointer (a 44 px target) and ±6 px on a fine one. "Coarse" is `matchMedia("(pointer: coarse)")`, so an iPad at laptop width gets the 44 px target too.
  - **Cursor and hover.** `installHoverCursor` (`hover-cursor.ts`, a shared file) gains three optional options, all additive: `isClickable(features, zoom)` (default `hoverIsClickable`, so the explorer is unchanged), `box` (a half-size in px; default 0, the exact point) and `onHover(features, point)` (called once per frame with the hits, `[]` when none). The room passes `isClickable: (f) => f.length > 0`, `box: 6` and an `onHover` that drives the RM15 tooltip. `HoverMap.queryRenderedFeatures` accepts a point or a box.
  - One hit opens `ArchetypeDetail`.
  - Several hits open a **chooser**, "{n} wines here": the hit wines as the list's own `CandidateRow`s, in ranking order.
  - On a laptop the detail and the chooser appear in the SAME popover the list uses. It is extracted from `CandidatesPanel` as `CandidateDetailPopover`, anchored either to a row (as today) or to a virtual element at the dot's screen point, `side="left"`. For a virtual anchor, `pressOnOwningRow` is skipped (there is no row) and `finalFocus` returns the map container (`tabIndex={-1}`), never `<body>`. Any `movestart` closes it, because the anchor would drift.
  - On a phone the sheet swaps to the chooser or the detail with Back, as a row does today. The map stays mounted underneath (`invisible`, `inert`, same size), so Back returns to the same camera without a new WebGL context. The detail/chooser layer is its own scroller (`absolute inset-0 overflow-y-auto overscroll-contain` over the map), because the Map body itself does not scroll (RM20) and `ArchetypeDetail` is long.

  Reason: one detail component and one row component serve both the list and the map.
- **RM19 — On demand, both widths.**
  - Laptop: a **List | Map** tablist at the top of `CandidatesPanel`.
  - Phone: the same tablist in `CandidatesSheet`'s header, shown only while the sheet is not on a detail or chooser view.
  - Every **page visit** starts on List: the choice is state in `TrainingRoom` (not the panel or the sheet), so it survives the phone sheet closing and reopening and a new attempt started without a reload, and resets on a reload or a new visit. It is never written to browser storage, and a test pins that.
  - With the kill switch off (`NEXT_PUBLIC_TRAINING_MAP === "0"`, read once at build), no tablist renders and the room is exactly R1. Unset means on. Turning it off is an env change plus a redeploy, not a code revert.

  Reasons: the owner answered "on demand on both widths". A remembered "Map" would make the map the default by stealth. The kill switch lets a bad R2 on the owner's iPhone be switched off quickly.
- **RM20 — Phone gestures and sizes.**
  - On the Map tab the sheet takes its full `88dvh` (`max-lg:h-[88dvh]`): a map has no content height to size to. Switching back to List returns to the list's content height (`max-h-[88dvh]`). The sheet growing on Map and shrinking on List is intended; it is verified on iOS Safari, whose dynamic toolbar changes `dvh` (§12).
  - The body stops being a scroller (`relative flex flex-col overflow-hidden` in place of `overflow-y-auto`), so the map owns every touch inside it; the map is `flex-1 min-h-0`. `touch-action: none` on the canvas comes from `maplibre-gl.css` (RM11).
  - `dragRotate`, `touchPitch` and `pitchWithRotate` are off, and `touchZoomRotate.disableRotation()` is called.
  - `overscroll-contain` stays.
  - There is no swipe-to-dismiss to fight: `dialog.tsx` has none (§2). The ✕, Escape and the backdrop still close the sheet.
  - **Short screens.** Under `(max-height: 480px)` (a phone on its side, where 88dvh leaves a map under 200 px) the Map tab does not mount the map; it shows "Turn your phone upright to see the map" and a "Show the list" button. Rotating upright mounts it.
  - **Tablets** below lg (768–1023 px) get the same bottom sheet at full width; nothing is width-specific in it.

  Reason: the only competing gesture was the body's scroll, and it is removed rather than arbitrated.
- **RM21 — Theme follows the explorer's contract.**
  - `mapStyle` is frozen at mount: `const [mountStyle] = useState(() => cachedBasemapStyle(theme) ?? BASEMAP_STYLE_URL[theme])`. It is never recomputed. Recomputing it would change from the URL to the object once RM24's warm-up or a theme flip fills the cache, and react-map-gl would then call `setStyle` without `transformStyle`, dropping the `wine-training` source.
  - On load, `basemapTweaks` is applied, as the explorer does. It is a no-op on an already-tuned cached style and tunes a style mounted from the URL.
  - A theme flip calls `map.setStyle(<cached or loaded style>, { diff: true, validate: false, transformStyle: (prev, next) => withWineLayers(prev, tuneBasemapStyle(next)) })`.
  - `isWineSourceId` (`basemap.ts`) learns the new `TRAINING_SOURCE_ID = "wine-training"`, so `withWineLayers` carries the dots' source and layers unchanged.
  - The heat paint follows the style that landed (`style.load`), as the explorer's `paintTheme` does.

  Reasons: this is one contract for every map in the app (CLAUDE.md "never pass a changing `mapStyle`"). A flip keeps the camera and needs no second WebGL context. The explorer's own sources are unaffected, because no explorer source uses that id.
- **RM22 — Failure falls back to the list.**
  - **Map stopped** — a `webglcontextlost` event, or a map that could not start: `<Map onError>` receives an event with `target === null` (react-maplibre's constructor path, e.g. no WebGL). Either switches the view back to List with "The map stopped working — the list has every wine." and "Try the map again", which remounts the map. Any other `onError` event (a tile or style error on a running map) is logged and nothing else happens.
  - **Map could not load** — a chunk error, either from the `MapErrorBoundary` around the dynamic component or from a rejected warm-up import (RM24). The room shows "The map needs a page reload to load." and a "Reload the page" button, and does not offer "Try again" (a rejected import stays rejected). The reload is safe for the note: the D13 draft is already written on every change, and the button reloads only on the viewer's tap. After a deploy, a stale tab is the likely way this happens for a daily user.
  - `MapErrorBoundary` gains an optional `fallback(error, isChunk)` render prop. This is additive: the explorer passes none and keeps `MapUnavailableCard` and its reload.
  - The boundary stays for render and chunk errors; `onError` covers the constructor path the boundary never sees.

  Reason: the explorer drops to One country on context loss. The room's equivalent is its list, which holds every number the map shows.
- **RM23 — Curated display points are data on the archetype.** Two nullable columns go on `wine_archetypes`: `display_lon` and `display_lat`, both `double precision`. A check makes them both null or both set, with lon in [−180, 180] and lat in [−90, 90].
  - A migration sets the values in §7 **by id**, each guarded by the live name, and only while the archetype is still unplaced (`wine_place_id is null`). An archetype already placed (for example Napa, if the USA wave landed first) is skipped: it has a real point.
  - They are read by a separate `select id, display_lon, display_lat from wine_archetypes`, started in the pool's first round, which **fails soft** like RM3a (curated points absent on error). The main archetype read does not select them, so the app deployed before the migration keeps working.
  - They are used only when no place or ancestor point resolves (RM12). They are never a `wine_places` row and never a boundary.
  - The editor gets no field yet (§15).

  Reasons:
  - New archetypes arrive as data batches, and ids in a code constant would drift and need deploys.
  - Plain numbers need no geometry cast.
  - Without these points every New World and Austrian match would silently vanish from the map (brief B risk 4).
- **RM24 — Warm on intent.** A `pointerenter` or `focus` on the Map tab calls `loadTrainingMap()` and `import("@/lib/wine-map/basemap").then((m) => m.loadBasemapStyle(theme))`. Both are dynamic imports, so neither `basemap.ts` nor `map-palette.ts` enters the room's initial bundle. Both are idempotent: `loadBasemapStyle` shares one request per theme, and the import is cached by the bundler. A rejected warm-up import is caught and marks the chunk as failed, so opening Map shows RM22's "needs a page reload" state directly. Reason: most of the first-open cost is the chunk and the style (§12). The room page itself preloads nothing, because most sessions never open the map.
- **RM25 — Accessibility.**
  - The tablist is written here, not borrowed: `role="tablist"` with an `aria-label`, each tab `role="tab"` with `aria-selected`, `aria-controls` naming its `tabpanel`, and a roving `tabIndex` (0 on the selected tab, −1 on the other). ArrowLeft/ArrowRight move and select, Home/End go to the ends. It borrows only `RangeControl`'s segmented look.
  - The map is a `tabpanel` with `aria-labelledby` its tab, `aria-label` `mapLabel`, and a visually hidden line saying the list shows the same wines and numbers.
  - **Keyboard path.** Under the map sits a visible "Closest on the map" row: the three labelled positions as real buttons with the label text ("Pauillac 91 %"). Each opens the same detail or chooser as a tap on its dot (anchored to the dot on a laptop), and focus returns to that button on close. The legend's "not on the wine map yet" names are real buttons too, opening the detail.
  - Dots themselves are pointer targets only. The list is the full accessible equivalent.

  Reason: the map adds a view and takes nothing away from the list, and a keyboard user can still reach the wines the map highlights.
- **RM26 — The rules are pure.** `src/lib/training/map-view.ts` holds `heatOf`, `trainingFeatures`, `featuresFingerprint`, `closeSet`, `fitSet`, `cameraTarget`, `shouldAutoFit`, `chooserOrder`, `labelledPositions`, `unmappedCandidates` and the paint/layout expression builders. It uses relative imports, the house style for `src/lib/training/` (the `@` alias would also work in vitest). `training-map.tsx` only wires them to MapLibre. Reason: the house pattern (`camera-fit.ts`, `deep-link.ts`, `groups.ts`). It is the part most likely to be wrong, and it is cheap to pin.
- **RM27 — Copy is provisional** (§9). The phrases "wine map", "typical wine" and "closeness" match existing copy. No new string claims a probability.

## 4. Data and SQL

Migration timestamps below are placeholders. At apply time each is re-picked to be later than the latest live `schema_migrations` version and not in a range the friend is using; the main session agrees a range with the friend before the first apply (collab research: the friend applies to live directly, and this spec and the USA wave both write migrations on 2026-09-29).

### 4.1 R1a migration `20260929140000_training_archetype_places.sql` (the function; no public change)

1. `set local lock_timeout = '5s';`
2. `create or replace function public.training_archetype_places()`
   - Returns `table (archetype_id uuid, place_key text, region_key text, region_name text, point_key text, point_lon double precision, point_lat double precision)`.
   - `language sql stable security invoker set search_path = public, extensions`.
   - The body is the query dry-run on live for this spec:
     - a recursive `chain` from each archetype's home up `primary_parent_id`, capped at depth 8;
     - left-joined to `wine_place_boundaries` on `is_current and quality_status = 'VALIDATED'` (at most one row per place, `wine_place_boundaries_one_current_idx`);
     - then per archetype a lateral pick of the first `kind = 'REGION'` by depth, and the first row with a `label_point` by depth, with `ST_X`/`ST_Y`.
   - Every archetype yields a row; an unplaced one yields nulls.
   - `revoke all … from public, anon, service_role; grant execute … to authenticated;`.
3. Fail-closed asserts in the same transaction. Each raises and rolls back everything on a mismatch:
   - the function exists, is SECURITY INVOKER, and `authenticated` alone of the client roles holds EXECUTE;
   - **as `authenticated`**: `set local role authenticated`, `select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true)`, then `count(*)` = count of `wine_archetypes`, and the number of rows with a `place_key`, with a `region_key` and with a point each equals the number of placed archetypes (84 each on 2026-09-29), exactly one of the points an ancestor's; then `reset role`. These are checked against live counts computed in the same transaction as `postgres`, so a curator's new archetype does not break the apply, but a reader that sees fewer rows than exist does.
4. `notify pgrst, 'reload schema';` (live has `pgrst_ddl_watch`, so this is belt and braces).
5. It writes no table. A source test (§11) greps it for `wine_places`/`wine_place_boundaries` in a write position.

### 4.2 R1b migration `20260929141000_training_region_placements.sql` (after the owner's O2 answer)

1. `set local lock_timeout = '5s';`
2. Insert the literal triples of Appendix A (all 50, or the 32 marked "six"):

   ```sql
   insert into wine_archetype_placements (archetype_id, wine_place_id, sort_order)
   select v.archetype_id, p.id, v.sort_order
   from (values ('<uuid>'::uuid, 'france.bordeaux', 6), …) v(archetype_id, place_key, sort_order)
   join wine_places p on p.canonical_key = v.place_key
   on conflict (archetype_id, wine_place_id) do nothing
   ```

3. Fail-closed asserts in the same transaction:
   - every triple resolved (its archetype and its place exist, and the place is the archetype's REGION ancestor by the same walk as the RPC);
   - exactly as many rows were inserted as the list has (50 or 32); if the USA wave or a curator already added one, the apply fails and the list is re-read, never loosened;
   - the placement total is the total before plus that number;
   - the **page totals** of §3 RM9 hold for every region in the list (Andalucía 3, Cataluña 2, …), and `france.bourgogne` still has exactly its seven;
   - with the full list only: no placed archetype outside `france.bourgogne` lacks a placement at its REGION ancestor (the RM9a rule, in-transaction). With the six only, this assert is scoped to the six regions.
4. No neighbour refresh: it writes only `wine_archetype_placements`.

### 4.3 R2 migration `20260929150000_training_room_display_points.sql`

1. `set local lock_timeout = '5s';` (the `alter table` takes an ACCESS EXCLUSIVE lock and must not queue behind a long neighbour refresh or the friend's writes; on timeout the apply fails and is retried).
2. `alter table wine_archetypes add column display_lon double precision, add column display_lat double precision, add constraint wine_archetypes_display_point_check check (…)` (RM23). The grants are table-level live (`authenticated` holds SELECT on the table), so no column grant is needed.
3. For each §7 row: the archetype with that id must exist with that name, or the migration raises. If its `wine_place_id` is null, `update … set display_lon = …, display_lat = … where id = … and wine_place_id is null` must touch exactly one row; if it is set, the row is skipped with a `raise notice`.
4. An assert that the number of rows carrying a display point equals the number of §7 ids still unplaced (18 on 2026-09-29, 15 if the USA wave placed its three first).
5. `notify pgrst, 'reload schema';`

### 4.4 Types (`database.types.ts`, hand-written — CLAUDE.md)

- `Functions.training_archetype_places: { Args: Record<string, never>; Returns: {…7 columns…}[] }` in R1a.
- `wine_archetypes` Row, Insert **and Update** gain `display_lon`/`display_lat` (`number | null`; optional in Insert and Update) in R2.
- Every table keeps `Relationships: []`.

### 4.5 Rollout order and rollback

**Order.** For each phase the migration goes first, then the app. The app also tolerates the wrong order: the RPC read and the display-point read both fail soft (RM3a, RM23), so an app deployed early shows "Not on the wine map yet" everywhere and no curated dots, and never fails the page. R1b is independent of the app and is applied only after O2.

Apply each migration with the pg applier, `--dry` first (owner memory: `supabase db push` refuses on this project). Re-check live `schema_migrations` just before applying.

**Pre-deploy check (each phase).** After the migration and before the app deploy, call the RPC (R1) or select the two columns (R2) **through PostgREST** as a signed-in demo user (`.superpowers/demo-session.mjs`'s session), and confirm 102 rows and the §4.1 counts. This catches a schema cache that has not reloaded.

**Staged-deploy smoke and revert triggers** (owner memory: live smoke plus revert). Revert the app if, on production after the deploy:
- the training page errors or logs `training pool: map places` on a normal load;
- a placed wine's detail has no map link, or an unplaced one has a link;
- (R2) opening Map on a laptop or the Browser pane's phone preset fails, falls back, or leaves a second WebGL context after close;
- (R2) the room's pre-map JS grows by more than the §12 budget.

**Rollback files** (`scripts/training-room-map/`, the `scripts/sharing-defaults/rollback-*.sql` convention), each applied with the pg applier after the app revert:
- `rollback-r1a.sql`: `drop function public.training_archetype_places();` The R1 app must be reverted first; if it is not, its read fails soft anyway.
- `rollback-r1b.sql`: deletes exactly the Appendix A pairs that migration inserted, by (archetype id, place key) literal, and asserts the count. It never deletes by rule, so a curator's own rows survive.
- R2: revert the app, or set `NEXT_PUBLIC_TRAINING_MAP=0` and redeploy. The two columns stay: they are nullable, unread by the old app and harmless. `rollback-r2.sql` (drop the constraint and the columns) exists for completeness and is run only if the feature is abandoned.

## 5. Types and pure modules

```ts
// src/lib/training/types.ts
export type MapPlaceRef = { key: string; name: string };
export type MapPoint = { lon: number; lat: number; source: "place" | "ancestor" | "curated" };
// TrainingCandidate gains (required, so every hand-built candidate states them):
mapRegion: MapPlaceRef | null;   // RM4 (R1)
mapPoint: MapPoint | null;       // RM12 (R2 adds "curated"; R1 already fills place/ancestor)
// RegionGroup gains:
mapRegion: MapPlaceRef | null;   // RM5
```

- `placeCanonicalKey` stays, now from `place_key`.
- `pool-shape.ts` gains `ArchetypePlaceRaw` and `placeLinks(rows)`. It rejects a non-finite coordinate, or one out of range, as "no point". `placeLinks([])` (the fail-soft path) gives every candidate nulls.
- `shapeCandidates` takes `placeLinks` in place of `placeKeys`. In R2 it also takes a `displayPoints` map (id → lon/lat) from the separate read (RM23).
- Updated to the new required fields: `lineageForParts`'s inert shell (`archetype-view.ts`), the fixture (`__fixtures__/archetypes.ts`), and the hand-built candidates in `panel.test.ts`, `archetype-view.test.ts`, `pool-shape.test.ts` and `src/app/admin/archetypes/profile-rules.test.ts`.

`src/lib/training/map-view.ts` (R2, pure):

```ts
import type { CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl"; // types only
export const HEAT_STOPS = [0.5, 0.75, 0.9, 1] as const;
export const LABEL_COUNT = 3;
export const LABEL_ALL_ZOOM = 7;
export const EUROPE_BOX: Bbox = [-10, 35.5, 27, 52.5];
export const FIT_MAX_ZOOM = 10;
export const FIT_PADDING = 40;
export const FIT_MIN_SPAN_DEG = 0.6;
export const CAMERA_SET_MAX = 12;
export const CAMERA_REACH_DEG = 25;
export const CAMERA_SETTLE_MS = 600;
export const HIT_SLOP_PX = { coarse: 22, fine: 6 } as const;
export function heatOf(closeness: number | null, top: number | null): number | null;
export function labelledPositions(ranked: readonly RankedCandidate[]): Map<string, { id: string; text: string; rank: number }>; // by "lon,lat"
export function trainingFeatures(ranked: readonly RankedCandidate[]): FeatureCollection; // props: id, heat, capped, label, rank, sort
export function featuresFingerprint(fc: FeatureCollection): string;
export function closeSet(ranked: readonly RankedCandidate[]): RankedCandidate[];         // leader + within CLOSE_WINDOW, uncapped
export function fitSet(ranked: readonly RankedCandidate[]): RankedCandidate[];           // close set with a dot, top CAMERA_SET_MAX, within reach of the leader
export function cameraTarget(ranked: readonly RankedCandidate[]): { box: Bbox; maxZoom: number } | null;
export function shouldAutoFit(state: { userMoved: boolean; membershipChangedAt: number; now: number }): boolean;
export function chooserOrder(hitIds: readonly string[], ranked: readonly RankedCandidate[]): RankedCandidate[];
export function unmappedCandidates(candidates: readonly TrainingCandidate[]): TrainingCandidate[];
export function dotPaint(palette: MapPalette): CircleLayerSpecification["paint"];   // built once per landed theme, never per feature
export function labelLayout(): SymbolLayerSpecification["layout"];
```

`MapPalette` gains `heat: { stops: readonly [string, string, string, string]; capped: string; neutral: string; casing: string }`.

## 6. Screens

### 6.1 R1

- **`ArchetypeDetail`**, both widths. Below the `ArchetypeSheet`, one row:
  - a placed wine gets a text link, `text-primary hover:underline` with an ↗ icon, "See it on the wine map";
  - an unplaced wine gets muted 12.5 px text, "Not on the wine map yet".
  - The tap target is `min-h-11` on touch and the row's own height on a fine pointer, using `TAP`, now exported from `candidates-panel.tsx`.
- **Expanded region group** (`RegionGroups`, shared by the column and the sheet). The first `<li>` above the wines is a compact link row, "{Map region} on the wine map ↗" (new tab), or muted "Not on the wine map yet". It is indented like the member rows (`ml-3 … pl-1`).
- **`ArchetypeLinks`** (rendered by `ArchetypeModal`'s footer and the archetype page): "Practise blind in the training room →" (same tab), and, when `mapLink` and a `placeKey`, "See it on the wine map" (same tab).
- **`/knowledge/archetypes/[id]`.** "← Map" goes to `?place=`. Under the sheet sits `ArchetypeLinks` (practise link only; the page already has "← Map").
- **Explorer region pages.** After R1b, the list on Bordeaux shows 9 rows in `sort_order`: Margaux, Sauternes, Pauillac, Saint-Julien, Saint-Estèphe, Pessac-Léognan red and white, Saint-Émilion, Pomerol. The heading reads "Typical wines" when there is more than one row, "Typical wine" for one. That heading is the only explorer code change in R1.

### 6.2 R2, laptop (lg+, the 360 px column)

- The header row holds "What it could be" (h2) with the List | Map tablist at its right.
- On **Map**, the panel body is:
  - the map, `h-[clamp(240px,calc(100dvh-380px),520px)]`, `rounded-[10px]`, full column width: 485 px at the owner's about 1675×865 window, 340 px at 1280×720. The height is set so the whole panel fits the aside's `max-h-[calc(100dvh-88px)]` with no aside scroll (header ~44 px, "Closest on the map" row ~36 px, legend ~72 px, "not on the wine map yet" line ~24 px, gaps ~40 px), checked in §10;
  - the "Closest on the map" row (RM25);
  - the legend (§6.4);
  - when any exist, the "not on the wine map yet" line.
- Show all and the region groups are hidden while Map shows, and come back as they were on List. The expand state lives in the panel, which stays mounted.
- A dot tap opens the shared popover (RM18); hovering a dot shows its tooltip (RM15). The WSET sheet keeps its column, and answers repaint the dots live (RM16).
- On an iPad in landscape (≥ 1024 px, coarse pointer) this layout applies with the 22 px hit slop and the popover opened by tap.

### 6.3 R2, phone and tablet (below lg, `CandidatesSheet`)

- The header gets the tablist under the title row, hidden on detail and chooser views.
- On **Map**, the content is `max-lg:h-[88dvh]` and the body is `relative flex flex-col overflow-hidden`. The map fills it (`flex-1 min-h-0`); the "Closest on the map" row and the legend sit below it inside the safe-area padding.
- A dot tap swaps to the detail or chooser with Back (RM18), in its own scroller over the kept map. The strip and its "Top match" line are unchanged.
- Closing the sheet unmounts the map and frees its WebGL context. Reopening remounts it, with the style from module memory and tiles from the HTTP cache, and the tab stays Map (RM19).
- A short screen (`max-height: 480px`) shows the upright note instead of the map (RM20).

### 6.4 Legend (both widths)

- A 120×8 px gradient swatch through the four stops, with "Less close" at the cold end and "Closest" at the hot end.
- A hollow-ring swatch, "Ruled out".
- One muted line, "Colours compare the wines with each other; the % is each wine's own closeness." (RM13, risk X1).
- When any dot is curated: "Wines outside the mapped countries sit at an approximate spot."
- Before any answer, the legend shows only "Start describing the wine" (the existing `beforeAnswers`).

## 7. The 18 curated display points (RM23)

Approximate centres of each wine's growing area, on land, to 2 decimals (about 1 km). They are **not** boundaries or appellation claims. They are verified on both basemaps in §12. The two Wachau wines share one point on purpose, because they share one appellation; RM15 merges their label and RM18's chooser handles the stack.

| Archetype (live id prefix) | Point (lon, lat) | Where |
|---|---|---|
| Mendoza Malbec (`569e2a6f`) | −68.88, −33.05 | Luján de Cuyo, Mendoza |
| Barossa Shiraz (`8c350884`) | 138.96, −34.52 | Tanunda, Barossa Valley |
| Clare Valley Riesling (`b4abafcc`) | 138.61, −33.83 | Clare |
| Coonawarra Cabernet Sauvignon (`6de675c2`) | 140.83, −37.29 | Coonawarra |
| Eden Valley Riesling (`4d159a28`) | 139.10, −34.65 | Eden Valley |
| Hunter Valley Semillon (`43805ec4`) | 151.29, −32.78 | Pokolbin |
| Blaufränkisch (`cf054f8a`) | 16.63, 47.60 | Deutschkreutz, Mittelburgenland |
| Wachau Grüner Veltliner (`a92188eb`) | 15.42, 48.39 | Weißenkirchen–Spitz, Wachau |
| Wachau Riesling (`5a8a879d`) | 15.42, 48.39 | same |
| Chilean Cabernet Sauvignon (`05235473`) | −70.57, −33.61 | Pirque–Puente Alto, Alto Maipo |
| Santorini Assyrtiko (`3d7aa7a4`) | 25.44, 36.39 | Pyrgos, Santorini |
| Tokaji Aszú (`a8097ab3`) | 21.28, 48.19 | Mád, Tokaj |
| Central Otago Pinot Noir (`d46a437c`) | 169.20, −45.07 | Bannockburn–Cromwell |
| Marlborough Sauvignon Blanc (`cd76ac56`) | 173.83, −41.51 | Renwick, Wairau Valley |
| Stellenbosch Chenin Blanc (`3ff0167e`) | 18.86, −33.93 | Stellenbosch |
| Napa Cabernet Sauvignon (`75e4e467`) | −122.40, 38.43 | Oakville, Napa Valley |
| Sonoma Chardonnay (`c4ea77f3`) | −122.82, 38.40 | Sebastopol (Sonoma Coast AVA) |
| Willamette Pinot Noir (`bab8537e`) | −123.03, 45.28 | Dundee Hills |

The migration uses the full ids from the 2026-09-29 read-only query (§2). The three US rows are skipped if the USA wave has placed them first (§4.3).

## 8. Files

**R1**
- `supabase/migrations/20260929140000_training_archetype_places.sql` (new, R1a)
- `supabase/migrations/20260929141000_training_region_placements.sql` (new, R1b, after O2)
- `scripts/training-room-map/rollback-r1a.sql`, `rollback-r1b.sql` (new)
- `src/lib/supabase/database.types.ts`: the function
- `src/lib/training/pool.ts`:
  - the RPC in the first round, fail-soft (RM3a);
  - drop the "map places" read;
  - fix the stale "69 of the 87" comment
- `src/lib/training/pool-shape.ts`, `types.ts`, `groups.ts`, `archetype-view.ts`, `__fixtures__/archetypes.ts`
- tests updated for the new required fields: `src/lib/training/panel.test.ts`, `archetype-view.test.ts`, `pool-shape.test.ts`, `src/app/admin/archetypes/profile-rules.test.ts`
- `src/lib/training/copy.ts`: §9 strings, plus `placeHref(key)` = `/knowledge/map?place=${encodeURIComponent(key)}`
- `src/app/taste/training/archetype-detail.tsx`, `candidates-panel.tsx` (the group link row; export `TAP`)
- `src/lib/wset/archetype-detail.ts` (`canonical_key` → `placeKey`) and `archetype-detail.test.ts` (the exact view gains `placeKey`; the mock gains `canonical_key`); `src/components/wset/archetype-sheet.tsx` (optional `placeKey`)
- `src/components/wset/archetype-links.tsx` (new), `archetype-modal.tsx`, `src/app/knowledge/archetypes/archetype-browser.tsx`, `src/app/knowledge/archetypes/[id]/page.tsx`
- `src/app/knowledge/map/tile-wine-map-explorer.tsx`: the heading only (`typicalWinesHeading(n)`)
- `scripts/training/archetype-batch.mjs`: emit the REGION-ancestor placement (RM9a), with its test
- `scripts/training-room.test.mjs`: Pauillac's `placements` becomes 2 once R1b is live (its home plus `france.bordeaux`); the drift-guard test (RM9a); an RPC-as-`authenticated` check (102 rows, placed = with key = with region = with point, one ancestor point)
- `CLAUDE.md`: one Domain-rules bullet, "Training room on the map": RM1, RM3/RM3a, RM9/RM9a, RM23 and the rollout order

**R2**
- `supabase/migrations/20260929150000_training_room_display_points.sql` (new); `scripts/training-room-map/rollback-r2.sql`; `database.types.ts` (columns, Row/Insert/Update)
- `src/lib/training/map-view.ts` (new, pure) and its test; `pool.ts`/`pool-shape.ts` (the fail-soft display-point read); `src/lib/training/pool.test.ts` (new in R1, extended in R2)
- `src/lib/wine-map/map-palette.ts`, the `heat` block; `src/lib/wine-map/basemap.ts`, `TRAINING_SOURCE_ID` in `isWineSourceId`
- `src/lib/wine-map/hover-cursor.ts` (`isClickable`, `box`, `onHover` options) and its test
- `src/app/knowledge/map/map-error-boundary.tsx`: optional `fallback`, and its test
- `src/app/taste/training/training-map.tsx` (new, client, MapLibre; imports `maplibre-gl/dist/maplibre-gl.css` and `src/app/knowledge/map/map-chrome.css`)
- `src/app/taste/training/training-map-loader.ts` (new, `loadTrainingMap`)
- `src/app/taste/training/map-switch.tsx` (new, the tablist); `training-map-legend.tsx` (new, rendered only inside `training-map.tsx`); `map-fallback.tsx` (new, the two RM22 states, outside the chunk)
- `training-room.tsx`: the view state (RM19), the kill switch, and `ranked` passed to the panel and the sheet
- `candidates-panel.tsx`:
  - takes `ranked`;
  - extract `CandidateDetailPopover`, with virtual anchor support;
  - Map mode;
  - the chooser
- `candidates-sheet.tsx`: takes `ranked`; tab, map kept under the detail, chooser view, the detail scroller, the short-screen note
- `copy.ts`; `CLAUDE.md`: the R2 half of the bullet (RM11–RM22, the kill switch)

## 9. Copy (all PROVISIONAL, English only — D20)

The owner approves this table before each phase's production deploy: the R1 rows before R1, the rest before R2.

| Key | Text | Where | Phase |
|---|---|---|---|
| `seeOnMap` | See it on the wine map | detail (new tab), Library modal (same tab) | R1 |
| `newTabHint` | (opens in a new tab) | visually hidden, after new-tab links | R1 |
| `notOnMap` | Not on the wine map yet | detail, group row | R1 |
| `regionOnMap(name)` | {name} on the wine map | expanded group | R1 |
| `practiseBlind` | Practise blind in the training room → | archetype modal, archetype page | R1 |
| `typicalWinesHeading(n)` | Typical wine / Typical wines | explorer place panel (n = 1 / more) | R1 |
| `listTab` / `mapTab` | List / Map | tablist | R2 |
| `viewsLabel` | What it could be, as a list or a map | tablist `aria-label` | R2 |
| `mapLabel` | Map of the typical wines, coloured by how close each is to your note | tabpanel `aria-label` | R2 |
| `mapSrNote` | The list shows the same wines and numbers. | visually hidden | R2 |
| `closestOnMap` | Closest on the map | row under the map | R2 |
| `stackMore(n)` | +{n} | label and tooltip suffix for a shared spot | R2 |
| `legendLess` / `legendClosest` | Less close / Closest | legend | R2 |
| `legendRuledOut` | Ruled out | legend | R2 |
| `legendRelative` | Colours compare the wines with each other; the % is each wine's own closeness. | legend | R2 |
| `legendApprox` | Wines outside the mapped countries sit at an approximate spot. | legend | R2 |
| `unmappedLine(n)` | {n} not on the wine map yet | legend (hidden at 0) | R2 |
| `chooserTitle(n)` | {n} wines here | chooser | R2 |
| `fitClosest` | Fit to the closest | map control after a user move | R2 |
| `mapStopped` | The map stopped working — the list has every wine. | fallback | R2 |
| `mapRetry` | Try the map again | fallback | R2 |
| `mapNeedsReload` | The map needs a page reload to load. | chunk fallback | R2 |
| `mapReload` | Reload the page | chunk fallback | R2 |
| `mapUpright` | Turn your phone upright to see the map. | short screen | R2 |
| `showList` | Show the list | short screen | R2 |

## 10. Acceptance checks

**R1**
1. A placed wine's detail links to `/knowledge/map?place=<its home key>` in a new tab on both widths. The explorer opens with that place selected and its typical-wine list containing the wine.
2. All 18 unplaced wines' details read "Not on the wine map yet", with no link.
3. An expanded group links to its map region: Prosecco → Veneto, Jerez → Andalucía, Porto → Douro, Bourgogne → Bourgogne. The 13 unplaced groups read "Not on the wine map yet".
4. After R1b, the live region pages list these page totals: Bordeaux 9, Rhône 7, Loire 5, Piemonte 4, Veneto 4, Toscana 3, Castilla y León 3, Andalucía 3, Provence 2, Douro 2, Cataluña 2, and 1 each for Beaujolais, Sud-Ouest, Abruzzo, Campania, Lombardia, Puglia, Sicilia and Galicia; Bourgogne still lists 7. (With O2 = six, only the first six change.) The heading reads "Typical wines" on each page with more than one.
5. `ArchetypeModal` from the Library shows both links; from the explorer it shows only "Practise…". The archetype page's "← Map" lands on the wine's place.
6. `?place=italy.abruzzo.montepulciano-d-abruzzo` (a place with no boundary) selects the place and shows its panel without an error.
7. The training page still renders when every archetype is unplaced (fixture), and when the RPC errors: every detail reads "Not on the wine map yet", one `console.error` names "map places", and ranking and saving work.
8. On the phone preset (and the owner's iPhone): from a wine's detail, open the map link, return to the training tab; either the session is as left, or, if the tab reloaded, Continue restores the note from the draft.
9. Before the deploy, the RPC called through PostgREST as a signed-in user returns 102 rows with the §4.1 counts (§4.5).

**R2**
1. The room page loads no MapLibre JS, no basemap style, no `basemap.ts`/`map-palette.ts` and no tiles until the Map tab is opened or hovered (Network panel), and its JS grows by at most the §12 budget.
2. Map shows a dot for all 102 typical wines (84 place, 1 of them via an ancestor, plus 18 curated), and the "not on the wine map yet" line is hidden.
3. After a claret-like note, at the auto-fitted camera (z ≤ 10) the three best positions all show labels, with the same names and % as the list's top rows (queried with `queryRenderedFeatures` on the label layer through `__trainingMap`). After an aromatic-white note, Alsace shows one merged label, "… % +2". Capped wines are hollow rings.
4. After an "only colour answered" note, the camera fits at most 12 wines near the leader, not the whole world.
5. On a laptop, hovering any dot shows its name and %; zooming to z7 or more shows labels beyond the top three where they fit.
6. A slider drag with Map open on a laptop repaints within a frame, with no long task over 50 ms attributable to the map (§12).
7. The camera follows the close set until the viewer drags; then "Fit to the closest" appears and works; reduced motion makes fits instant.
8. A tap on Alsace (3 wines) opens the chooser with all three in ranking order. A tap on a single dot opens the detail. On a phone, Back returns to the same camera, and a long detail scrolls inside the sheet.
9. A theme flip while the map is open repaints the basemap and dots in the new palette without remounting: the camera is unchanged and there is one WebGL context. A theme flip right after a warm-up (cache filled before mount) still keeps the dots.
10. A forced context loss (`WEBGL_lose_context`) switches to List with the fallback line; "Try the map again" remounts the map. A map constructor failure (WebGL disabled in the browser) gives the same fallback, not a blank panel.
11. A failed chunk (blocked in the Network panel, or a stale deployment) shows "The map needs a page reload to load." and a Reload button; after reloading, Continue restores the note.
12. Keyboard only: Tab reaches the tablist, arrows switch List/Map, Tab reaches the "Closest on the map" buttons, Enter opens the detail, Escape returns focus to the button. Closing a popover opened from a dot leaves focus on the map container, never `<body>`.
13. On a phone, panning the map never scrolls the sheet or the page, and pinch-zoom works. The ✕, Escape and the backdrop still close the sheet. On iOS Safari the sheet's height change between List and Map does not jump the toolbar or leave a gap.
14. At 1675×865 and 1280×720 the aside does not scroll on Map (`scrollHeight ≤ clientHeight`), and the legend is visible without scrolling.
15. At 768×1024 (tablet) the sheet works at full width; at 1024×768 with touch emulation the laptop column's dots open the popover on tap; in phone landscape (812×375) the Map tab shows the upright note.
16. With `NEXT_PUBLIC_TRAINING_MAP=0` there is no tablist and the room matches R1.
17. Nothing outside `src/app/taste/training/` (and `map-view.ts`'s own test) imports `training-map` or `map-view` (RM1 test).

## 11. Tests (vitest unless noted)

- **`pool-shape.test.ts`**:
  - `placeLinks` maps RPC rows to `placeCanonicalKey`, `mapRegion` and `mapPoint`;
  - `source` is `place` when `point_key === place_key` and `ancestor` otherwise;
  - an unplaced archetype has all three null;
  - `placeLinks([])` (the fail-soft path) makes every candidate unplaced;
  - a NaN or out-of-range coordinate gives no point;
  - in R2, a curated point is used only with no place point, and ignored when one exists; a half-set curated point is ignored.
- **`pool.test.ts`** (new; `readTrainingPool` with a stubbed client): a rejected RPC read logs once and yields unplaced candidates; a rejected display-point read yields no curated points; a rejected archetype read still fails.
- **`groups.test.ts`**: `mapRegion` by majority, ties by key, null when no member has one; the existing order tests are unchanged.
- **`map-view.test.ts`** (R2):
  - `heatOf` returns null for null closeness, 0 for `top` null and for `top ≤ 0`, and is linear;
  - `labelledPositions`: one label per distinct position, the best-ranked wine's text, " +n" for the others at that spot (Alsace ×3 → "+2"), ranks 1–3 on the three best positions;
  - `trainingFeatures`: capped → ring props, neutral before answers, sort keys, label and rank props, text equal to `shortName` + `percentLabel`;
  - the fingerprint is stable, and changes on heat, label, rank or cap;
  - `closeSet` agrees with `stripLine`'s "N more close" on the same ranking;
  - `fitSet`/`cameraTarget`: Europe before answers; the fit-set box after; at most `CAMERA_SET_MAX`; a far curated point (Barossa) is dropped when the leader is in Europe; a single position is padded by `FIT_MIN_SPAN_DEG`; null when no point; `maxZoom` 10;
  - `shouldAutoFit`: settle window, and never after a user move;
  - `chooserOrder` follows ranking order;
  - `unmappedCandidates`.
- **`hover-cursor.test.ts`**: with no new options the explorer's behaviour is unchanged; `isClickable` overrides; `box` queries a box; `onHover` fires once per frame with the hits and `[]` when leaving.
- **`map-error-boundary.test.ts`**: with `fallback`, a chunk error renders `fallback(error, true)` and a render error `fallback(error, false)`; without it, the explorer's card is unchanged.
- **`map-palette.test.ts`**:
  - both tables have a `heat` block keyed alike, as `#rrggbb` literals;
  - every stop, `capped` and `neutral` is ≥ 3:1 on its land;
  - hottest against coldest is ≥ 3:1;
  - OKLab L is monotone away from the ground, each step ≥ 0.07;
  - adjacent ΔE ≥ 0.09;
  - capped against the coldest stop has ΔE ≥ 0.08, and neutral against it ≥ 0.07;
  - casing against land ≤ 1.2;
  - `casing === selectedCasing`.
- **`basemap.test.ts`**: `isWineSourceId("wine-training")`, and `withWineLayers` carries the training source and its layers across a swap in order.
- **`copy.test.ts`**: every §9 string and template; `placeHref` encodes.
- **Component markup tests** (the `sheet-markup.test.tsx` idiom, static markup of components that render no portal):
  - `ArchetypeDetail` renders the link with `target="_blank"`, `rel="noopener"` and the hidden hint, or the not-on-map text;
  - the group link row;
  - `ArchetypeLinks` with and without `mapLink`/`placeKey`;
  - `MapSwitch`: roles, `aria-selected`, `aria-controls`, the roving `tabIndex`; its key handler (a pure `nextTab(key, current)`) for ArrowLeft/Right/Home/End.
- **Source tests** (the `training-room-layout.test.ts` idiom):
  - `training-map` is imported only by `training-map-loader.ts`, whose `loadTrainingMap` is used by the `dynamic(…, { ssr: false })` call and the warm-up, and nowhere else;
  - `TrainingMap` is rendered only inside the Map-view branch (never unconditionally);
  - no non-test file outside `src/app/taste/training/` and `src/lib/training/map-view*` imports `training-map` or `map-view`;
  - no room file other than `training-map.tsx` has a value import of `maplibre-gl` or `react-map-gl` (`import type` is allowed);
  - no room file outside the dynamic chunk statically imports `@/lib/wine-map/basemap` or `@/lib/wine-map/map-palette` (the warm-up uses `import()`);
  - `map-switch.tsx`, `training-room.tsx` and `training-map.tsx` never touch `localStorage`, `sessionStorage` or `safe-storage`;
  - the Map view hides the region groups and Show all, and the panel keeps its expand state (the panel stays mounted);
  - no migration of this spec writes `wine_places` or `wine_place_boundaries`.
- **Live tests** (`scripts/training-room.test.mjs`, node, read-only):
  - the RPC as `authenticated`: 102 rows, and placed = with key = with region = with point, one of them an ancestor point;
  - after R1b: Pauillac's `placements` is 2; the drift guard (RM9a) finds no placed archetype outside `france.bourgogne` without a placement at its REGION ancestor;
  - `archetype-batch.mjs`'s test: a generated batch includes the REGION-ancestor placement.
- **The migrations' own same-transaction asserts** (§4) are the data tests; they run in the `--dry` apply first.

## 12. Verification and performance budget

**Where.**
- Desktop Chrome at the owner's size (about 1675×865) and at 1280×720, light and dark.
- The Browser pane's `mobile` preset (375×812), a tablet size (768×1024), phone landscape (812×375) and 1024×768 with touch, light and dark.
- **The owner's iPhone in Chrome and Safari, on a Vercel preview deployment of the R2 branch, before the R2 merge.** If sign-in does not work on the preview's URL (Supabase's redirect allow-list), the owner's check runs on production right after the deploy with the kill switch as the instant off.
- Everything again on production after each phase's staged deploy (owner memory: benchmark prod, not dev).

Signed-in sessions come from CLAUDE.md's `.superpowers/demo-session.mjs` recipe, never a typed password. The Browser pane must be fronted: a hidden pane never hydrates (CLAUDE.md dev gotcha). In non-production builds only, `TrainingMap` exposes `window.__trainingMap`, as the explorer's `debugClick` exposes `__wineMap`, so the context-loss and label checks can reach the map.

**Budget.**

| What | Budget | Grounding |
|---|---|---|
| Room page JS before the map is opened | +0 KB MapLibre, `basemap.ts` or `map-palette.ts`; ≤ 3 KB gzip for links, tablist, fallback and loader | RM11/RM24 dynamic imports; checked in the build's chunk list |
| Pool read | +0 sequential round trips; RPC ≤ 50 ms server time | 25.5 ms measured live (§3 RM3) |
| RSC payload | ≤ +10 KB (102 × two small objects) | — |
| First open, cold, desktop | first dots ≤ 2.5 s | style 0.9–1.6 s and first tile 1.5–1.8 s measured on `/knowledge/map` (CLAUDE.md "Wine map performance"); chunk ~276 KB gzip, shared with `/knowledge/map` |
| First open, warm, desktop (RM24 prefetch, or the map visited earlier) | ≤ 1 s | module-memory style, HTTP-cached chunk |
| First open, owner's iPhone over mobile data | cold ≤ 4 s, warm ≤ 1.5 s | measured by the owner with a stopwatch from the tap to the first dots, or Safari Web Inspector's Network timeline |
| Per answer with Map open | ≤ 1 `setData` per frame; features + fingerprint ≤ 2 ms p95 | `performance.mark` around the effect in a dev build |
| Long tasks during a 5 s slider drag with Map open (laptop) | none > 50 ms attributable to the map | `PerformanceObserver('longtask')` via the Browser pane |
| WebGL contexts | exactly 1 while open, 0 after close | `__trainingMap`, context count |
| Phone memory | after 5 open/close cycles, memory back within 10 MB of the first open | Safari Web Inspector's Timelines → Memory on the owner's iPhone (iOS has no `performance.memory`); Chrome remote devtools for Android if used |

Measure the ramp's break points (RM13) on three real notes: a claret-like red, a Sauvignon-like white, and an early "only colour answered" note. If the top band is still a flat wash, move the stops. Pure `heatOf` does not change, and a stop change needs no palette change.

## 13. Collaboration and the USA wave

- **Shared files touched:** `map-palette.ts` (the `heat` block appended last in each table), `basemap.ts` (`isWineSourceId`, which the explorer's `withWineLayers` also uses; `basemap.test.ts` pins that the explorer's sources are still carried) and `hover-cursor.ts` (additive options; the explorer passes none). No tiles registry, attribution, `boundary-expectations.json`, shared map function or neighbour cache is touched (collab research).
- **Merge order:** the USA wave's registry changes to `map-palette.ts` (its state colours) merge first; this spec's `heat` block is then appended after them by hand, and the palette tests catch a bad merge. If R2 is ready first, the order flips and the USA branch rebases onto it; either way the block stays last in each table.
- **Order between the two specs' migrations is free.** Every migration here is written to apply before or after the USA wave (§4.2, §4.3). What the USA wave must do to keep this spec's rules:
  - Its data migration that sets the three US archetypes' `wine_place_id` (brief A: at state or subregion level in US-2, the AVA in US-3/US-4) must also add each one's **REGION-ancestor placement** (e.g. Napa → the California state place), the RM9a rule. The drift guard fails otherwise.
  - It should null those three archetypes' display points when it places them, so no stale value lingers. Recommended, not required: RM12 ignores a curated point once a place point exists.
  - It must update `scripts/training-room.test.mjs`'s Napa assertion (`{ wine_place_id: null, placements: 0 }`), which becomes false the moment Napa is placed.
  - If it lands after R1b, its migration re-reads the counts R1b asserted (the drift guard, the page totals it touches). If it lands before R1b, R1b's list is regenerated from the rule and re-checked before the apply, and R2's display-point count assert becomes 15.
- US scoring regions get a map region only once the USA migration sets those archetypes' `wine_place_id`: the RPC walks up from `wine_archetypes.wine_place_id`, not from the scoring region. A state REGION existing on its own changes nothing in the room.

## 14. Owner decisions (defaults taken; the owner may override)

- **O1** — The detail's map link opens in a new tab (RM6). On an iPhone the training tab may be evicted while the map is open; coming back then offers Continue from the draft, and open panels are lost. The alternative is the same tab, relying on D13's Continue every time.
- **O2 (asked before R1b is applied)** — Ancestor placements for all 19 non-Bourgogne regions (RM9, 50 rows), not only the brief's six (32 rows). This changes the public map's region pages for every user. The rest of R1 ships without waiting for the answer.
- **O3** — Three always-on labels (RM15), on both widths, plus zoom-in labels and hover.
- **O4** — The opening view before any answer is Europe (RM17). The alternative is the whole pool's box, which is world-wide.
- **O5** — The two Wachau wines share one point (§7).
- **O6** — All §9 copy, including the explorer's "Typical wines" heading, approved per phase before its production deploy.

## 15. Later (not in this spec)

- World-archive region fills coloured by their best member through feature-state `heat` (brief B Option A, optional part).
- Heat in the full explorer (Option B), only after a live performance re-measure.
- Placements at intermediate ancestors (Haut-Médoc for its four communes, Rhône septentrional/méridional).
- A display-point field in the admin archetype editor.
- `updateArchetype` adding the REGION-ancestor placement itself when a curator re-homes a wine (today the drift guard catches it and a curator adds it by hand, RM9a).
- A "where your note pointed" map on the result screen.
- More US typical wines (brief A decision 14).

## 16. Risks

- **X1 — Closeness read as a probability.** Mitigations:
  - the relative ramp is explained in the legend (`legendRelative`);
  - labels and the tooltip show the list's own %;
  - no copy says "likely" or "chance".

  Residual: a 35 % leader is as hot as a 95 % one. That is intended ("where your note points"), and the label shows the difference.
- **X2 — Density bias.** There is one dot per wine and no heatmap layer. The hottest draws on top, so a stack reads as its best member (RM12, RM13), and its label says how many more share it. Residual: Bourgogne's 22 dots cover more area at Europe zoom than a region with one. Colour is unaffected.
- **X3 — Scoring-region groups against map regions.** The list groups by scoring region (addendum R1), while the map shows wines, not regions. The group's link names the map region ("Veneto" under Prosecco), so the difference is stated, not hidden.
- **X4 — Curated points read as real places.** They are marked approximate in the legend. The detail says "Not on the wine map yet". They are ignored the moment a real place exists.
- **X5 — Phone memory and gestures.** There is one context, unmounted on close, and no scroll container under the map (RM20). The owner's iPhone check on a preview is required before the R2 merge.
- **X6 — Wheel over the laptop map zooms it rather than scrolling the column.** Accepted: the map fills the column, the panel is sized so the aside never needs to scroll on Map (§6.2, §10 R2-14), and the WSET sheet scrolls normally beside it.
- **X7 — RM9's placements drift.** R1b is a one-off list. New batches keep the rule (`archetype-batch.mjs`), and the drift guard catches an editor re-home or a USA migration that skips it (RM9a). Bordeaux's 9 rows push its article down on phones; the lever is a placement delete in `/admin/archetypes`, not code.
- **X8 — Deploy order.** The app is designed to survive the wrong order (fail-soft reads, §4.5), and the pre-deploy PostgREST check and the smoke test's revert triggers cover the rest.
- **X9 — Collisions with the friend's work** on `map-palette.ts` and on migration timestamps (§4, §13). The block is appended at the end, the palette tests catch a bad merge, and timestamps are re-picked against live at apply time.
- **X10 — Stale chunks after a deploy.** A daily user with an open tab gets a chunk error on first opening the map after a deploy. RM22 answers it with an honest reload prompt, and the draft makes the reload safe.

## 17. Review notes (2026-09-29)

Two reviews of the first draft: feasibility (against the code and read-only live data) and completeness (against the owner's ask). Every point was checked against the code or live data before it was applied.

**Feasibility.**
1. MapLibre constructor errors never reach `MapErrorBoundary` — confirmed in `@vis.gl/react-maplibre`'s `map.js`. RM22 now uses `onError` with `target === null`; the boundary stays for chunk and render errors.
2. `scripts/training-room.test.mjs` asserts Pauillac `placements: 1` — confirmed. §8/§11 change it to 2 after R1b.
3. Bourgogne's page lists 7, not 5 (confirmed live: sorts 10/20/30/36/37/40/50); Andalucía and Cataluña totals are 3 and 2. RM9, §4.2 and R1-4 are restated as page totals.
4. `hoverIsClickable` needs `tier`, and the hover queries a point — confirmed. `hover-cursor.ts` gains `isClickable`, `box` and `onHover` (the last also serves completeness 7).
5. `RangeControl` has no keyboard handling — confirmed. RM25 specifies the tablist's keys, roving `tabIndex` and `aria-controls` itself.
6. The import tests are reworded for `src/lib/training/map-view*` and allow `import type`.
7. The `dynamic()`/warm-up contradiction is resolved by one `loadTrainingMap`, pinned in the source test.
8. `ranked` is passed from `training-room.tsx` to the panel and the sheet (confirmed: only `groups` reaches them today).
9. The new fields stay required; the four hand-built-candidate tests and `pool-shape.test.ts`'s fixtures are listed in §5/§8.
10. `archetype-detail.test.ts`'s exact `toEqual` is listed and updated.
11. `ArchetypeModal` cannot be markup-tested (Dialog portal, `createClient()` in render, async load) — confirmed. `ArchetypeLinks` is extracted and tested instead.
12. The phone detail gets its own scroller over the kept map; the body is `relative flex flex-col`.
13. `mapStyle` is frozen in a `useState` initializer; `basemapTweaks` is applied on load.
14. `touch-action` comes from `maplibre-gl.css`; `training-map.tsx` imports it and `map-chrome.css`.
15. A virtual-anchor popover skips `pressOnOwningRow` and returns focus to the map container.
16. Drift: `archetype-batch.mjs` now emits the REGION placement, and a live drift guard catches editor re-homes (RM9a).
17. §13 corrected: a US map region appears only once the archetype's `wine_place_id` is set, and that migration must add the REGION-ancestor placement.
- Smaller fixes applied: the RM26 reason (vitest does map `@`); `CircleLayerSpecification["paint"]`/`SymbolLayerSpecification["layout"]` (confirmed: `CirclePaint`/`SymbolLayout` are not exported); `text-optional` dropped; `regions.wine_place_id` is 14 rows (confirmed live); `TAP` lives in `candidates-panel.tsx` and is exported; the `Update` type gains the columns.

**Completeness.**
1. R2 (and R1b) no longer assume the USA wave has not landed: R2 skips placed archetypes and asserts against the still-unplaced count; R1b uses a literal list with an exact inserted count; §13 states what either order requires.
2. Rollback added (§4.5): literal-pair down file for R1b, function drop for R1a, app revert or kill switch for R2, and named revert triggers.
3. The RPC read fails soft (RM3a), and so does the separate display-point read (RM23); `notify pgrst` and a pre-deploy PostgREST check are added too.
4. An `authenticated` same-transaction assert and a live test are added. **Correction:** the review expected 85 rows with a point; the read-only query as `authenticated` on 2026-09-29 gives 84 (83 own boundaries + 1 ancestor, over 84 placed archetypes), which is what the assert checks, computed in the transaction rather than hard-coded.
5. `FIT_MAX_ZOOM` is 10; labels use variable anchors and merge per position ("+n"); the acceptance check is rewritten.
6. The camera fits at most 12 close wines within 25° of the leader (`fitSet`), tested.
7. Hover tooltips on fine pointers and zoom-in labels from z7 are added; the top three stay the minimum.
8. O2 is now asked before R1b is applied, and R1b is split from R1a so nothing public changes before the answer. The explorer heading pluralizes (`typicalWinesHeading`), in the copy table. **Not taken:** "ship the six now and ask about the rest" — shipping any of R1b before the owner answers would still change the public map without an answer; holding R1b costs nothing, since the room's links do not depend on it.
9. The drift guard, the CLAUDE.md rule and the USA instance are added (RM9a, §13).
10. "Ships flagged" is replaced: copy goes to the owner before each phase's production deploy, and R2 has a real kill switch. The unmapped count reads "{n} not on the wine map yet".
11. The owner's iPhone check moves to a Vercel preview before the R2 merge, with a fallback if preview sign-in does not work.
12. Tablet, iPad landscape and phone landscape are in the matrix; a short screen shows an upright note instead of a tiny map.
13. The List/Map height change is stated as intended and checked on iOS Safari.
14. The phone new-tab round trip is an acceptance check (R1-8), and O1 states the eviction behaviour.
15. "Session" is defined as a page visit, the state lives in `TrainingRoom`, and a test pins no storage access.
16. The warm-up imports `basemap.ts` dynamically, the legend lives in the chunk, and a source test pins both.
17. iPhone cold/warm targets and Web Inspector memory are in the budget.
18. The laptop map height is derived so the aside does not scroll on Map, with a check at two sizes.
19. Chunk errors get honest "needs a page reload" copy, the draft is already written on every change, and a failed warm-up import shows the same state.
20. A visible "Closest on the map" button row gives a keyboard path, and focus returns to the map container from a dot's popover.
21. `heatOf` with a null leader returns 0 and is tested.
22. Timestamps are placeholders re-picked against live at apply, with a range agreed with the friend.
23. The palette merge order and the shared `basemap.ts`/`hover-cursor.ts` changes are in §13.
24. Every migration sets `lock_timeout`.
- The tests listed under G are all in §11.

**R2 build review (2026-09-29).** Five verified findings on the built R2, fixed on `room-map`. Where a fix changes a mechanism this spec names, the fix wins and is recorded here; the decisions' intent is unchanged.
1. **First-load budget (§12, a §4.5 revert trigger).** The built R2 grew the room's pre-map JS by +6,246 bytes gzip against the 3 KB budget. Trimmed to **+2,992** (352,670 → 355,662, caf84e7 → room-map; the gzip of every `static/chunks/*.js` in the page's `page_client-reference-manifest.js`, default Turbopack build):
   - RM11: `TrainingMap` loads through `React.lazy` + `Suspense` (what `next/dynamic` wraps), not `next/dynamic(…, { ssr: false })`: `next/dynamic`'s own runtime cost ~1 KB. No `ssr: false` is needed — the view starts on List on the server and every visit (RM19), so the map never renders outside the browser.
   - RM22: the room has its own tiny `RoomMapBoundary` and `src/lib/chunk-load-error.ts` (a copy of the explorer's test, a parity test pins it); `MapErrorBoundary` gains no `fallback` prop and the explorer's file is untouched.
   - RM18: the laptop map's popover (chooser, Back, virtual anchor) is rendered by the map's chunk (`map-popover.tsx`), its state in the map; the panel hands it the shared shell (`DetailPopover`), rows and `ArchetypeDetail` as a prop (`MAP_UI`). A static import of those from the chunk made Turbopack re-split the room's chunks (+1.3 KB), so **the chunk imports no first-load room module** (source test).
   - RM24: the warm-up is one import — `loadTrainingMap()`, then the chunk's `warmBasemap()` fetches the style — instead of a second `import()` of `basemap.ts`. The style request starts once the (small) chunk has arrived rather than in parallel with it.
   - §9: the map's own lines move to `src/lib/training/map-copy.ts` (chunk only); the R1 nit's English region name is resolved on the server (`placeLinks`), so `localize-names.ts` stays out of the bundle.
2. **Hover (RM15).** The tooltip names the one spot nearest the pointer (by its dot's point on screen) with that spot's own text — never the best of every dot the ±6 px box caught, nor a "+n" for dots at other spots. The tap chooser keeps the box (RM18).
3. **Phone sheet (RM20, §6.3).** The map never drops under 240 px; the "Closest on the map" row and the legend scroll on their own under it (an iPhone SE, or all 18 names listed when the display-point read fails soft). The map itself is still never inside a scroller.
4. **MapLibre's own chunk (RM22).** react-maplibre's `import("maplibre-gl")` rejecting reaches `onError` with `target` null like a constructor failure; it is now told apart as a chunk error and shows "needs a page reload", not a "Try the map again" that cannot work.
5. **Tooltip placement (RM15).** The tooltip is clamped inside the map box (below the pointer when there is no room above), so its name and % are never clipped at an edge.

## Appendix A — R1b's placement list (live, 2026-09-29)

Generated by the RM9 rule. "Six" marks the brief's six regions (32 rows); the rest are the other 18 rows. The migration and `rollback-r1b.sql` carry the full archetype ids; the prefixes here are for reading.

| Region key | Set | Archetype (id prefix, sort_order) |
|---|---|---|
| `france.bordeaux` | six | Margaux (`feb10b4c`, 6), Sauternes (`d070d08c`, 7), Pauillac (`fa5486e6`, 16), Saint-Julien (`2f7a4e51`, 17), Saint-Estèphe (`9bda65b1`, 18), Pessac-Léognan red (`3f4a3124`, 19), Pessac-Léognan white (`f10ffd0b`, 20), Saint-Émilion (`9a23b813`, 21), Pomerol (`86cc1784`, 22) |
| `france.rhone` | six | Châteauneuf-du-Pape (`a89863b4`, 4), Côte-Rôtie (`57f5ce3b`, 5), Condrieu (`1e7997df`, 43), Hermitage (`50773b81`, 44), Crozes-Hermitage (`3ea58a94`, 45), Gigondas (`d3ffdbcb`, 46), Côtes du Rhône (`4620727a`, 47) |
| `france.loire` | six | Sancerre (`df0ee4f7`, 3), Pouilly-Fumé (`e708bae1`, 39), Vouvray (`2deafac2`, 40), Muscadet (`d67a15ff`, 41), Chinon (`015e0941`, 42) |
| `italy.piemonte` | six | Barolo (`adc30ad9`, 52), Barbaresco (`0e3e1b61`, 53), Barbera d'Asti (`0c99c524`, 54), Gavi (`54d7adc3`, 55) |
| `italy.veneto` | six | Amarone (`d0db791a`, 56), Valpolicella Ripasso (`f07b6310`, 57), Soave (`caa2cf27`, 58), Prosecco (`3457ea81`, 59) |
| `italy.toscana` | six | Chianti Classico (`517e05e5`, 61), Brunello di Montalcino (`ee53d280`, 62), Bolgheri (`3c46122a`, 63) |
| `spain.castilla-y-leon` | other | Ribera del Duero (`dfae084d`, 70), Bierzo (`3aa90255`, 72), Rueda Verdejo (`1c42533d`, 74) |
| `france.provence` | other | Bandol (`6c3ae593`, 10), Provence rosé (`9e9984e6`, 50) |
| `portugal.douro` | other | Vintage Port (`ee42c150`, 79), Tawny Port (`44c4527b`, 80) |
| `spain.andalucia` | other | Fino (`217ed3e1`, 75), Oloroso (`fdd58936`, 77) |
| `france.beaujolais` | other | Beaujolais cru (`bfa9c61a`, 38) |
| `france.sud-ouest` | other | Cahors (`3758fca9`, 51) |
| `italy.abruzzo` | other | Montepulciano d'Abruzzo (`fcf7911c`, 64) |
| `italy.campania` | other | Taurasi (`fa07e2eb`, 65) |
| `italy.lombardia` | other | Franciacorta (`dc4e44ca`, 60) |
| `italy.puglia` | other | Primitivo (`f22f6fed`, 67) |
| `italy.sicilia` | other | Etna Rosso (`64f7d91b`, 66) |
| `spain.cataluna` | other | Priorat (`ec9865f8`, 71) |
| `spain.galicia` | other | Rías Baixas Albariño (`4cba1205`, 73) |
