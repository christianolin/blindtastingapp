# Spain on the wine map

Add the whole Spanish DO/DOP hierarchy to the wine map, mirroring the France
model but sourced the Champagne/Alsace way (commune-union), because Spain has
no national parcel layer.

## Session status — 2026-08-14 (resume here)

Branch `spain-wine-map-phase-1`. All the **machinery** is built, tested and
proven; the **membership data** is blocked on authoritative sourcing (see below).
Nothing false was shipped to the live map.

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
- Gate green: 46 pure unit tests, `tsc`, `eslint` all clean.

**BLOCKER — Task 3c membership (the dominant risk, unresolved):** this
environment had **no web search** (Google 403) and **no reachable authoritative
DO→municipio dataset** (OpenDataSoft catalog, datos.gob.es, Wikidata SPARQL all
dry). Per the owner mandate (lists from BOE pliegos, *not* recall) I **refused to
fabricate** ~70 municipality lists from memory — the fail-closed resolver catches
typos/nonexistent names but *cannot* catch a plausible-but-incomplete list, which
is exactly the shipped-wrong-map risk. So `data/wine-map/spain-do-membership.json`
is a documented schema with 6 `status:"pending"` stubs and **zero** transcribed
lists. Task 5 (catalog/links/content migrations) is consequently deferred — there
are no `ready` DOs to catalog yet.

**Collaborator / live-DB divergence:** the live DB is ahead of this branch — the
other developer is actively adding Italian regions (Trentino-Alto-Adige, Veneto,
… now through migration `20260829322000`, still climbing *during* this session).
Spain was therefore renumbered into its own `20260901xxxxxx` block to avoid
racing their slot sequence. At 18:56 they **directly set the `spain` country node
to `EXCLUDED` and retired its boundary** (no migration; a content-less country
outline is reasonably premature on the live map). Left as-is — not my change to
revert. Note: the DB-integration test `world-wine-map-foundation.test.mjs` is
already red against live from their un-merged Italy work (hardcoded
`linked_boundaries=1346`; live is ~1450+) — not Spain's doing, not fixed here.

**To resume a real DO wave (one command per wave, fully resumable):**
1. For each DO, set `municipios` (code-first `{code,name}` for Galicia/Cataluña/
   Valencia/País Vasco; name-only fine for Castilian comunidades) + `expected_count`
   + `provenance` (BOE ref) + `status:"ready"` in `spain-do-membership.json`,
   transcribed **from the pliego** (or have the owner paste lists).
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
