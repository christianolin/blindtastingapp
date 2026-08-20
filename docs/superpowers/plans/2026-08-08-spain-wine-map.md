# Spain on the wine map

Add the whole Spanish DO/DOP hierarchy to the wine map, mirroring the France
model but sourced the Champagne/Alsace way (commune-union), because Spain has
no national parcel layer.

## Session status — 2026-08-19 (resume here)

**Overnight "finish Spain" run (waves 11–19, pushed through `af69543`).** Spain is
now **14 comunidades, 57 DOs**, all promoted (VERIFIED + current boundary) with
descriptions + grape/style chips. This run added: **Castilla y León** Bierzo,
Valtiendas, Sierra de Salamanca, Tierra del Vino de Zamora, Arlanza (53), Valles
de Benavente (61); **Galicia** Rías Baixas (34), Ribeira Sacra (18), Valdeorras
(8), Monterrei (8); **new comunidades** País Vasco (Arabako 5, Bizkaiko = whole
Bizkaia 112, Getariako = whole Gipuzkoa 90), Illes Balears (Binissalem 5, Pla i
Llevant 19), Comunidad de Madrid (Vinos de Madrid 70); **Andalucía** Montilla-
Moriles (17), Granada (whole province, 174); **Valenciana** Valencia (91),
Alicante (34); **CLM** Mondéjar (21), Uclés (24). Whole-territory DOs (the two
Txakolis, Granada) are the literal legal delimitation; every list verified against
the pliego with capital/partial drops. Frontend colours+labels + English-toggle
exonyms added for the 3 new comunidades. **Tiles need a republish** to show all
the new polygons.

**"Make the call" follow-up (waves 20–23, pushed through `cf186b8`).** Owner asked
me to decide the held items. Shipped faithful-to-pliego: **Méntrida** (77 — current
2022 pliego incl. Toledo city + Talavera, noted as an expanded zona), **Costers del
Segre** (69 — coarse whole-municipality over-approx of a parcel-fragmented DO,
Lleida city excluded), **Tarragona** (79 — its explicit "Zona de producción" list
was found after all), and **Cangas** (8) as a new comunidad **Principado de
Asturias**. Now **15 comunidades, 63 DOs.**

**Deliberately NOT shipped (final calls, with reasons):**
- **DO Catalunya** — region-wide umbrella DO; would just duplicate the Cataluña
  comunidad overview as a big overlapping blob. Skipped as noise.
- **Cava** — multi-region traditional-method sparkling; overlaps many regions,
  doesn't fit the `spain.<comunidad>.<do>` tree. Needs a future "multi-region"
  tier, not a polygon.
- **Lebrija** (Vino de Calidad) and **Cantabria** (Liébana DOP + Costa de Cantabria
  VC) — small, and their pliegos didn't surface a clean enumerated list via the
  DuckDuckGo search (Liébana returned a wrong PDF). Left for a targeted pass.
- **Vinos de Pago** (single-estate DOPs) — sub-municipal, can't be a municipality
  union; out of scope per the plan's Decisions.
- **Canarias** — out of scope (outside the map's display window, prior decision).

**Wave 11 — Castilla y León completion (pushed `5bdec65`):** four more DOPs from
their MAPA pliego zona lists, density-located + INE-resolved fail-closed, each
verified per-pliego and promoted (with descriptions + grape/style chips):
**Bierzo** (31, León — Mencía), **Valtiendas** (16, Segovia), **Sierra de
Salamanca** (26 — Rufete; spurious Salamanca-city header match dropped), **Tierra
del Vino de Zamora** (56 = 46 Zamora incl. the city + 10 Salamanca; spurious
Salamanca-city dropped). CyL overview rebuilt → 11 DOs / 457 municipios. Added
grapes Rufete + Garnacha Tintorera. Migration `20260901113000`. **Still deferred
in CyL:** **Arlanza** (Burgos + a Palencia block + many *entidades menores* to
classify — the finder only caught the 41 Burgos ones) and **Valles de Benavente**
(pliego riddled with parenthetical *anejos* that aren't separate INE municipios —
verify before shipping). Also still open across Spain: Galicia parroquia DOs
(Rías Baixas + subzones, Ribeira Sacra, Valdeorras, Monterrei), Costers del Segre
(partial-parcel subzones) + Tarragona DO, Baleares, País Vasco Txakolis, CLM
(Méntrida/Uclés/Mondéjar), Valencia/Alicante. **Tiles need a republish** to show
the 4 new polygons (owner ran one earlier today for the prior waves).

**Earlier 2026-08-19 work (pushed to `master` through `c90a6ba`):**
- **Subzone tier (NEW) — Rioja Alta / Rioja Oriental / Rioja Alavesa** as
  `APPELLATION` children of `spain.la-rioja.rioja` (canonical keys
  `spain.la-rioja.rioja.rioja-{alta,oriental,alavesa}`, display_tier 3, min_zoom 7,
  `appellation_level='subregional'`). Sourced by reading the DOCa Rioja pliego's
  three zone headers, then intersecting each zone with the parent Rioja's 135
  municipios so they tile it exactly (Alta 75 + Oriental 47 + Alavesa 13 = 135).
  Promoted by `run-spain-dos.mjs` with the parent-containment guard. Migration
  `20260901107000`; commit `de2dc35`. **This is the reusable subzone pattern** for
  Rías Baixas' 5 zones etc. (extractor: `.tiles-build/build-rioja-subzones.mjs`).
- **Knowledge content (NEW) — every Spanish place now has a profile.** Migrations
  `20260901108000` (15 Spanish grapes added to the shared `grapes` lib +
  Graciano colour fix), `20260901109000` (country + 11 comunidad articles: rich
  description/climate/soils/key_facts + grape & style chips), `20260901110000`
  (all 34 DOs + 3 Rioja subzones: description + key_facts + grape/style chips).
  50/50 Spanish places have descriptions; all `editorial_status='PUBLISHED'`.
  Comunidad REGION content renders NOW (those nodes are VERIFIED); DO content
  renders too (VERIFIED post-promotion). Written in-session, no API (AGENTS.md).
  Commit `02aa032`. **These render from the live DB immediately — no tile rebuild
  needed** (tiles carry geometry/labels, not article prose).
- **Cellar smoothness (cont.)** — `content-visibility:auto` +
  `contain-intrinsic-size` on the list rows/cards so the browser skips off-screen
  layout/paint. Safe because the desktop table is `table-fixed` with a fixed
  `<colgroup>` (columns don't shift when rows are virtualised out). Commit
  `c90a6ba`. Further levers if still not smooth: collapse the mobile-card/desktop-
  table double-mount to one per breakpoint; memoize the row + the `filtered` sort.

**Earlier on 2026-08-19, pushed to `master` (`b083f34`):**
- **Precise Italy country border** — new `fetch-italy-comuni.mjs` (caches all 7,904
  `georef-italy-comune` ISTAT comuni to `.tiles-build/sources/italy-comuni.json`,
  gitignored) + `build-italy-country-outline.mjs` (grid-dissolve, mainland + Sicily
  + Sardinia, 7,531 vertices, `NAMESPACE=ISTAT_CONFINI`, `source_feature_id=
  georef-comune-dissolve:ITA`), replacing the collaborator's coarse Natural Earth
  1:50m Italy outline. Committed live directly (like Spain's outline). Now matches
  France/Spain fidelity, as the owner asked.
- **Cataluña wave 10 (6 DOs, LIVE)** — Penedès (61), Terra Alta (12), Empordà (55),
  Conca de Barberà (14), Alella (31), Pla de Bages (35), all from official MAPA
  pliegos read directly (the "anchor-miss" DOs — their lists were sourced by
  reading each pliego's *Demarcación de la zona geográfica* out of a text dump, the
  reliable path; the density finder undercounts Catalan bulleted/footnote lists).
  Migration `20260901106000`; promoted by `run-spain-dos.mjs`; comunidad overview
  rebuilt (Cataluña now 8 DOs / 230 municipios). **35 DOs across 11 comunidades.**
  Notable: `Cabrera d'Igualada`→INE `Cabrera d'Anoia` (08028) rename; Alella is a
  documented whole-municipality over-approximation (tiny DO, dense Maresme).
- **Cellar list-view scroll lag fixed** (separate concern, `b083f34`) —
  `src/app/cellar/cellar-bottles-table.tsx` thumbnails were raw full-res `<img>`
  with no sizing/lazy/decoding at 25 rows/page; added `loading="lazy"
  decoding="async"` to all three `<img>` and explicit `width`/`height` to the two
  list thumbnails. tsc+eslint green.
- **Catalan pliego tooling** (scratch, gitignored under `.tiles-build/`):
  `dump-pliego.mjs` (PDF→text), `slice.mjs` (find the zona section),
  `parse-catalan-list.mjs` (bulleted `- Name (n)` + province footnote legend),
  `build-catalan.mjs` (verbatim name lists → fail-closed resolve → writes entries).
- **STILL DEFERRED in Cataluña:** **Costers del Segre** (7 disjoint subzones, many
  partial polígono-catastral inclusions — needs careful per-subzone whole-vs-partial
  reading) and the **Tarragona** DO (large, not yet fetched). Plus all the earlier
  deferrals (Galicia parroquia DOs, País Vasco Txakolis, Baleares, Rioja refine,
  subregions).
- **TILES ARE STALE** — the DB has Italy's new border + the 6 Cataluña DOs but the
  published tiles do not. Owner must run the **"Wine Map Tiles"** GitHub Actions
  workflow from `master` with `promote: true` (reads live DB; republishes Italy +
  Spain + the collaborator's Italy regions together).

---

## Session status — 2026-08-14

**Merged to `master`** (`b892baa`) — Spain wave 1 + the collaborator's Italy
(Trentino-Alto-Adige/Veneto/Sicily) are unioned; `export.mjs` runs clean on the
full live DB (1358 places, all namespaces, guard passes), tests/tsc/eslint green.
Old branches cleaned up (11 merged branches deleted; `master` + `auth-phase-1`
kept). **The GitHub `wine-map-tiles` workflow can now be run from `master`** to
publish Spain + Italy (owner-gated).

All **machinery** is built and proven, and authoritative sourcing is **solved**:
official MAPA pliego PDFs, found via DuckDuckGo over HTTP (the Google tool is
licence-blocked), text-extracted with `pdfjs`, parsed and INE-validated
fail-closed by `fetch-spain-pliego.mjs`. Merged to `master` (Spain + the
collaborator's Italy). **29 DOs are LIVE end-to-end** across **11 comunidades**, each dissolved →
guarded → auto-promoted from its official pliego, plus a **precise national
border** (georef dissolve of all 8,129 peninsular + Balearic municipios, 9,571
vertices, replacing the coarse Natural Earth 1:50m outline — matches the
comunidad boundaries exactly):
- **Castilla y León** (7) — Rueda, Toro, Cigales, Arribes, Ribera del Duero (83), Tierra de León (85), Cebreros (35)
- **Castilla-La Mancha** (5) — La Mancha (188), Valdepeñas (12), Manchuela (68), Almansa (7), Ribera del Júcar (7)
- **Aragón** (4) — Somontano (43), Cariñena (16), Calatayud (50), Campo de Borja (16)
- **Andalucía** (3) — Jerez (10), Condado de Huelva (18), Málaga (102, 7 subzones)
- **Región de Murcia** (3) — Jumilla (7), Bullas (11), Yecla (1)
- **Cataluña** (2) — Priorat DOQ (10), Montsant (13)
- **Galicia** (1) — Ribeiro (13; parroquia-delimited, coarser)
- **Comunidad Valenciana** (1) — Utiel-Requena (9)
- **Navarra** (1) — Navarra (118)
- **Extremadura** (1) — Ribera del Guadiana (122, 6 subzones)
- **La Rioja** (1) — Rioja DOCa (135; trans-comunidad, incl. Álava + Navarra)

Migrations `20260901091000`–`100000`. Each comunidad REGION node carries an
**overview boundary = union of its DOs' municipios** (built by
`build-spain-comunidad-boundaries.mjs`, re-run after each wave) so it renders at
region zoom (z4) like France/Italy, coloured per comunidad. Each DO's boundary is
the whole-municipality union. **Sourcing accelerator:** `scratch`-level density
list-finder (greedy-match whole doc, take the largest dense cluster of in-province
matches, skip "provincia de X" headers) locates the list regardless of pliego
intro phrasing — but each DO is still verified before promotion.

**Deferred (need per-DO pliego reads):** parroquia-delimited Galician DOs (Rías
Baixas + subzones, Ribeira Sacra, Valdeorras, Monterrei), capital-membership
ambiguity on big DOs (Málaga, Ribera del Guadiana), space-table Rioja DOCa,
several Cataluña/CLM pliegos where search or anchor missed. Subregions (Rías
Baixas subzones, Rioja Alta/Alavesa/Oriental) not yet added.

**Reliability finding (important):** bulk-processing is NOT trustworthy for this
map's quality bar — every DO needs a per-DO pass against the raw pliego text.
Pliego formats vary wildly (comma-lists, space-separated multi-column tables like
Rioja, "entidad menor" sub-entity annotations, older 2011 layouts), and the
membership hazard is subtle: pliegos list many **pedanías** that are NOT separate
INE municipios (must be dropped, as they are covered by their parent), and
**partial** (cadastral-polygon) inclusions taken whole. Arribes proved the point
— an initial hasty reconciliation was wrong twice (a mislabeled code; a missed
real municipio, Monumenta, which turns out absent from the georef cache) before a
name-by-name resolve against the pliego got it right. So the parser is an
accelerator, not an oracle; the fail-closed resolver + reading the pliego is what
makes a DO correct. Attempted-but-deferred formats: **Rioja** DOCa (space table,
~131/144 auto), **Bierzo** (anchor lands on the control-plan section; anchor needs
tightening); **Arlanza** is dense with "entidad menor" sub-entities to classify;
**Rías Baixas** is Galician with sub-zones. Each is `fetch-spain-pliego.mjs
--search`/`--pdf --emit`, review FUZZY + UNRESOLVED, finalize codes, catalog
migration, `run-spain-dos.mjs --commit`. ~65 DOs remain.

**Done + committed (branch is pushed as backup):**
- `02737a4` Task 1 — country-agnostic export guard `assertMultiCountryArchive`
  (orphan-country + cross-country shard-collision, both fail-closed) in
  `lib.mjs`, wired into `export.mjs`, unit-tested. Turns out **Italy already
  made the pipeline multi-country** (live `italy.*` tree from a collaborator),
  so items 2–5 of the plan's "multi-country blocker" were already delivered;
  only the export assertion needed generalising.
- `b847297` Task 2 — `extract-spain-ne.mjs` + pinned Natural Earth ESP artifacts
  (peninsula + Balearics; Canaries out of scope per owner).
- `8933d70` Task 2 — migration `20260901090000_spain_country_base.sql`,
  dry-run + **live-applied** (`spain` COUNTRY, tier 0, España). *(See collaborator
  note — the row was later EXCLUDED by the other developer.)*
- `9b03e0c` Task 3+4 — `fetch-spain-municipios.mjs` (8,217 municipios w/
  aliases+geometry cached), `spain-lib.mjs` fail-closed resolver (+15 tests),
  `run-spain-dos.mjs` resumable stage→guard→auto-promote driver,
  `IGN_CNIG_SPAIN` attribution. Driver **proven** via `--selftest 01` (dissolved
  53 real Álava municipios → valid outline, all guards green, rolled back).
- `8a26d05` Task 6 (frontend) — `spain` colour + label on the tile map.
- `5ff554e` Task 4 hardening — unit-tested the auto-promote guards (the only
  safety net for the waived review): 12 tests proving they reject an out-of-window
  bbox (Canary municipio), out-of-band area (wrong-province municipio), and
  empty/invalid/uncovered geometry. `main()` gated so importing the pure guards
  never touches the DB.
- `1a0c069` Task 3c+4+5 **wave 1 (Rueda pilot), LIVE** — `fetch-spain-pliego.mjs`
  (DuckDuckGo search → official MAPA pliego PDF → pdfjs text extract → parse the
  province-grouped `términos municipales` → INE-resolve fail-closed, with a
  province-scoped `query⊆cache` fuzzy suggester for abbreviations/`del`↔`de`
  variants, flagged for review). `spain-do-membership.json` Rueda entry = 68 INE
  municipios w/ pliego provenance (6 pedanías/sub-entities documented-excluded).
  Migration `20260901091000` re-activates `spain` (VERIFIED + boundary current)
  and adds `castilla-y-leon` (tree-only REGION) + `rueda` (APPELLATION). Driver
  promoted Rueda's 68-municipio union → current-VALIDATED (0.319 deg², 277 pts).
- `a48f6e4` Toro (2nd DO), LIVE — pliego PDO-ES-A0886 ("Comprende los siguientes
  municipios:", a phrasing the anchor now also matches). 15 municipios (Zamora +
  Valladolid: San Román de Hornija, Villafranca de Duero, and Pedrosa del Rey —
  included whole for the Villaester *pagos*). Migration `20260901092000`.
- `3d96aa6` Priorat DOQ (3rd DO, first bilingual/Catalan, first outside Castilla
  y León), LIVE — pliego priorat_2022_09_06.pdf §4.1. 10 municipios (Tarragona),
  resolved code-first. Migration `20260901093000` adds the `cataluna` REGION
  (tree-only) + `priorat` APPELLATION (DOCa/DOQ, communal 7/7).
- Gate green: 51 pure unit tests, `tsc`, `eslint` all clean. `pdfjs-dist` is a
  session-only tool (`npm install --no-save pdfjs-dist`); the committed pipeline
  and artifact never depend on it.
- `221fc05` Cigales (4th DO), LIVE — pliego cigales_2022_03_25.pdf, 12 municipios
  (11 in Valladolid along the Pisuerga + Dueñas/Palencia; the "El Berrocal" pago,
  which the pliego notes lies within the city of Valladolid, is documented-excluded
  to avoid pulling in the whole city). Migration `20260901094000`.
- **Live tree now (4 DOs, committed to `master`):** `spain` → `castilla-y-leon`
  → {`rueda`, `toro`, `cigales`}; `spain` → `cataluna` → `priorat`.
- **Pliego parser** handles three list phrasings + the fuzzy suggester. Harder
  pliegos still need per-DO care (their PDFs found + probed, not yet promoted):
  **Rioja** DOCa (space-separated multi-column table across La Rioja/Álava/Navarra
  — a greedy longest-match got 131/~144; needs the multi-word residue finished),
  **Bierzo** (anchor grabbed the control-plan section — needs a tighter anchor),
  **Arlanza** (many "entidad menor" sub-entities to classify), **Rías Baixas**
  (Galician phrasing + subzones), **Ribera del Duero** (~300 municipios).

**Sourcing solved (Task 3c was the dominant risk):** the Google search *tool* is
dead here (backend Gemini licence, `SUBSCRIPTION_REQUIRED`), and ODS/datos.gob.es/
Wikidata/Wikipedia all lack municipality-level membership — but **DuckDuckGo over
plain HTTP works**, and the **Ministry of Agriculture (mapa.gob.es) publishes each
DOP's official pliego de condiciones as a text-extractable PDF** with a clean
province-grouped municipality list. That's pliego-grade provenance, exactly the
plan's requirement. `fetch-spain-pliego.mjs` turns each pliego into an
INE-validated list; the fail-closed resolver + the documented per-DO exclusions
mean no plausible-but-wrong list ships silently. Rueda proves it end-to-end;
5 stubs remain `pending` + the rest of the ~70 DOs to source the same way.

**Collaborator / live-DB divergence:** the live DB is ahead of this branch — the
other developer is actively adding Italian regions (Trentino-Alto-Adige, Veneto,
… now through migration `20260829322000`, still climbing *during* this session).
Spain was therefore renumbered into its own `20260901xxxxxx` block to avoid
racing their slot sequence. Mid-session they set the content-less `spain` node to
`EXCLUDED`; wave 1's migration (`20260901091000`) **re-activated it** (VERIFIED +
boundary current) because it now hosts a real DO (Rueda) — documented in the
migration header, and it does not touch the live map until a tile republish.

**Export divergence (resolves on merge):** a full `export.mjs` run on this branch
throws `Unknown source namespace: SICILY_COMUNI` — the live DB carries the
collaborator's newer Italy namespaces (`SICILY_COMUNI`, `VENETO_DOC_DOCG`,
`ALTOADIGE_DOC_IGT`) that this branch's `ATTRIBUTION` map hasn't got yet. Not mine
to add (I'd risk the wrong licence text); it clears when this branch merges master.
Spain's own rows use `IGN_CNIG_SPAIN`/`NATURAL_EARTH` and export fine — verified
directly: countries `france, italy, spain`, **no orphan, no shard collision**,
`rueda` → `castilla-y-leon` shard. Also: `world-wine-map-foundation.test.mjs` is
already red against live from the un-merged Italy work (hardcoded
`linked_boundaries=1346`; live is ~1450+) — not Spain's doing, not fixed here.

**To resume a real DO wave (one command per wave, fully resumable):**
1. Source the pliego (Rueda is the worked example): `npm install --no-save pdfjs-dist`,
   then `node scripts/wine-map-sources/fetch-spain-pliego.mjs --search "<DO>"` to
   find the `mapa.gob.es` pliego PDF, then `... --pdf <url> --emit spain.<com>.<do>`.
   Review the FUZZY lines (each `del`/`de` or abbreviation) and classify every
   UNRESOLVED: pedania of a listed parent -> drop; orthographic variant -> add its
   explicit INE code; not an INE municipio -> drop and note. Write the finalized
   `{code,name}` list + `expected_count` + pliego `provenance` + `status:"ready"`
   into `spain-do-membership.json` (the strict resolver must return exactly
   `expected_count`).
2. Re-activate the `spain` country node (VERIFIED + current boundary) — the
   export guard fail-closes on a Spanish DO with no country outline, by design.
3. Create the catalog nodes (Task 5): comunidad SUBREGION + DO APPELLATION rows,
   tiers/zooms per the France precedent (REGION t1 4/4, communal DO t2 7/7),
   `20260901xxxxxx` block.
4. `node scripts/wine-map-sources/fetch-spain-municipios.mjs` (cache; idempotent),
   then `node scripts/wine-map-sources/run-spain-dos.mjs --dry` (resolve+dissolve+
   guards, rolled back), then `--commit` to stage+promote. Skips done DOs.
5. Task 6 tiles: `export → build → validate → publish` (owner-gated — it also
   republishes the collaborator's in-progress Italy).

## Decisions (owner, locked)

- **Boundary model:** municipality-dissolve. Geometry from OpenDataSoft
  `georef-spain-municipio` (8,223 municipios, each with `geo_shape` + INE
  `mun_code`, `prov_code`, `acom_code`; Licence: the dataset is IGN/CNIG-derived
  open data). Membership = each DO's official municipality list from its BOE
  *pliego de condiciones*. Fidelity is municipality-level (an over-approximation
  of vineyard land), consistent with Champagne/Alsace, coarser than France's
  parcel outlines. Accepted.
- **Scope:** target **(b)** — Spain outline + all DO/DOP + the 2 DOCa
  (Rioja, Priorat), grouped by autonomous community. Sub-zones and Vinos de
  Pago are a later wave.
- **Grouping / keys:** `spain.<comunidad>.<do>` e.g. `spain.galicia.rias-baixas`,
  `spain.la-rioja.rioja`, `spain.cataluna.priorat`.
- **No shape-review gate.** Fetch → build → stage → **auto-promote** →
  build/publish tiles, in one long resumable run. (This differs from every
  France region, which flipped after review. Documented risk: a bad membership
  list or a municipio-code typo ships an ugly/wrong outline with no human
  catch. Mitigated by automated guards in Task 4, not by eyeballing.)

## Why this shape

The France pipeline (`fetch-inao-denomination` → `build-boundary` →
`run-targets` → catalog/flip/links/content migrations) is pointed at the IGN
`AOC-VITICOLES:aire_parcellaire` WFS — officially delimited *parcels*. **No such
layer exists for Spain**; DOs are legally defined as *municipality lists*. So
Spain reuses the **commune-union** path already proven for Champagne (635
communes → one region outline) and Alsace (47 communes, each its own place):
IGN-equivalent municipal polygons + a compiled membership list, dissolved.

Verified live during planning: `georef-spain-municipio` returns 8,223 municipios
with polygon `geo_shape` and INE codes — the load-bearing assumption holds.

## The multi-country blocker (do first)

The map is hardcoded single-country. These MUST change before any Spanish place
can ship, and each is small:

1. `scripts/wine-map-tiles/export.mjs:175` asserts the world archive contains
   `"france"`. → assert it contains **every** tier-0 country key present in the
   row set (derive the set, require each; keep asserting France while it exists).
2. `shardKeyFor` (in `scripts/wine-map-tiles/lib.mjs` **and** `src/lib/wine-map/shard.ts`)
   takes segment **1** (`france.<region>` → `<region>`). With a country prefix
   that stays correct (`spain.galicia` → `galicia`) — a shard is still keyed by
   the 2nd segment. **Verify** no collision between a French and Spanish 2nd
   segment (e.g. both had `rioja`)? France has none named like a Spanish region;
   still, add a guard in export that shard keys are globally unique or namespace
   them `country-region`. **Decision needed at build time** (see Q below).
3. `export.mjs` area/group logic keys off segment 2/3 — unaffected by a country
   prefix since France keys already have ≥3 segments; Spain keys parallel them.
4. Frontend `tile-wine-map.tsx` has `france: "#6B6257"` / `france: "France"`
   colour+label maps and a "France's outline remains as context" filter note.
   → add `spain` entries; generalise the "context outline" logic to "all
   country outlines".
5. `src/lib/wine-map/manifest.ts`, `wine-map-tree.tsx`: confirm they iterate
   shards/countries generically (they appear to). Grep + fix any `france`
   literal that gates behaviour.

**Open question for build time:** shard granularity. France shards per *region*
(`bourgogne`, `champagne`). If Spain shards per *comunidad*, Andalucía (Jerez)
is one shard, Galicia (5 DOs) another — fine. Confirm shard = 2nd segment
(comunidad) is the intended granularity for Spain, or whether large comunidades
should shard finer. Recommend: comunidad-level, matching France's region-level.

## Tasks

### Task 1 — Multi-country plumbing (code, no data)
Make the pipeline country-agnostic (items 1–5 above). Add a unit test to
`lib.test.mjs`: `archiveForPlace` for a `spain.*` row lands in the right shard;
world-archive assertion accepts a multi-country set. `tsc` + `eslint` + the
wine-map tile tests green. Ship this alone first — it's inert until Spanish
rows exist, and it de-risks everything after.

### Task 2 — Spain country base (one migration)
`spain` COUNTRY node, tier 0, from Natural Earth `ne_50m_admin_0_countries:ESP`
(same vendored public-domain file as France; extract ESP feature to
`data/wine-map/spain-ne50m.geojson`, mirror `20260731090000`'s source/snapshot
provenance rows). Display window guard for peninsular Spain + Balearics; decide
whether Canary Islands are in scope (recommend: include — Islas Canarias has
DOs). Tier-0 → world archive only.

### Task 3 — The membership artifact (the hard part; hours)
`data/wine-map/spain-do-membership.json` — the reviewed, in-repo source of
truth. Per DO: canonical key, comunidad, display name, appellation_level,
`mun_codes` (INE), provenance (BOE pliego reference + date), grapes, and the
scoring-reference name for links. **Compiled from official pliegos, not recall**
— this is the exact hazard flagged earlier this session. Approach:
- Build `build-spain-do-membership.mjs` that, given a DO's municipality *names*,
  resolves them to INE `mun_code` via the georef dataset (exact,
  accent-insensitive; province-scoped to disambiguate duplicate town names —
  Spain has many) and FAILS on any unresolved name rather than guessing.
- The municipality lists themselves come from the BOE pliego per DO. Do this in
  waves by comunidad so the run is resumable and each wave is independently
  checkable: start La Rioja (Rioja DOCa), Cataluña (Priorat DOCa, Penedès,
  Cava — note Cava is multi-region, model carefully), Galicia (Rías Baixas +4),
  Castilla y León (Ribera del Duero, Rueda, Toro, Bierzo), then the rest.
- Record per-DO `mun_code` count so the fetch can assert it got them all.
- Flag Cava and other trans-comunidad DOs explicitly — they don't fit the
  `spain.<comunidad>.<do>` tree cleanly; model under a `spain.multi.*` or their
  primary comunidad with an ALTERNATE note. Decide per-DO in the artifact.

### Task 4 — Fetch + build + stage + auto-promote (resumable driver; hours)
New `fetch-spain-do.mjs` (mirrors `fetch-alsace-communes.mjs`): pull the named
municipios' `geo_shape` from georef by `mun_code`, retain raw + normalized
artifacts with SHA-256 to the wine-map-sources bucket, one
`wine_boundary_sources` + snapshot per DO, `NAMESPACE = IGN_CNIG_SPAIN` (add to
`ATTRIBUTION` in `lib.mjs` → credit "Contains data © IGN/CNIG España"), dissolve
municipios into the DO outline (reuse `build-boundary` dissolve engine; concave
for large sets), stage DRAFT.

Then, since there's no review gate, an **auto-promote step with guards that
replace the human eye**:
- geometry `ST_IsValid`, within the Spain display window, non-empty, area
  within a sane band for its `appellation_level`;
- **child ⊂ parent containment** check where a parent DO exists;
- every DO's municipio count matches the artifact;
- reject + halt the DO (don't promote) on any failure, log it, continue others.
Driver mirrors `run-targets.mjs` resumability (skip already-promoted DOs), so a
multi-hour run resumes cleanly after any interruption.

### Task 5 — Catalog / links / content migrations (per comunidad wave)
Per wave: `catalog` (create comunidad SUBREGION nodes + DO APPELLATION nodes,
tiers/zooms mirroring France — REGION tier 1, sub-region tier 2, communal DO
tier 3; min_zoom per the Alsace/Champagne precedent), `boundary_flip` (promote
the staged rows — or fold into Task 4's auto-promote), `links` (exact-name
scoring reference links, PENDING when no row), `content` (article stubs).
Migrations numbered from the next free slot after `20260829264200`.

### Task 6 — Tiles + viewport
Run export → build → validate → publish. The map viewport / initial camera
currently frames France; add Spain to the country picker / default extent so it's
reachable. Verify the France archive assertion still passes and Spanish shards
appear in the manifest.

## Runs-for-hours shape
Tasks 3 and 4 are the long ones and are explicitly resumable: membership by
comunidad wave (each wave a checkpoint), fetch/build/promote skips completed DOs.
An interrupted run re-invokes with no duplication. Task 1–2 are quick and gate
the rest; 5–6 are per-wave and fast.

## Risks
1. **Membership provenance** — the dominant risk; ~70 DOs of municipality lists
   that must come from pliegos, not memory. Mitigation: name→INE-code resolution
   fails closed, and the artifact records the BOE reference per DO.
2. **No review gate** (owner's call) — guards in Task 4 are the only safety net;
   a plausible-but-wrong outline can ship. Accepted.
3. **Trans-comunidad DOs** (Cava, Jumilla, etc.) don't fit the tree — handled
   case-by-case in the artifact.
4. **Duplicate town names across provinces** — resolution must be province-scoped.
5. **georef dataset availability / rate limits** over a long run — cache raw
   municipio geometry locally (all 8,223 fit in one pull) so the DO fetches read
   from disk, not the API repeatedly.
