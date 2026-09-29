# The United States on the wine map — design

Date 2026-09-29 (revised the same day after a feasibility review and a completeness review; see
§22). Worktree `blindtastingapp-map`, branch `usa-map`, base production `master` at `66164c7`.
Owner, verbatim: **"lets continue with the map work. I think my friend is working on Germany, so
lets do something else. Lets go to USA and start mapping that out. Let's just focus on the states
that actually produce noteworthy wine"**, and, on the same day, **"could also be cool to introduce
the map to the tasting room in some way … The typical wines should be linked to the map either
way"**. Answers to the follow-up questions: states **"CA, WA, OR, NY now; others later"**;
downloads **"Yes, download"** (UC Davis AVA files for CA, WA, OR, NY; Natural Earth country and
state outlines; TTB shapefiles for the 2026 AVAs UC Davis lacks); **"Links now, then likelihood
map"**; **"Training room only"**. Standing instruction: **"just write the design and then
implement"**.

**Scope of this document.** This is brief A: the USA on the map, its scoring-reference cleanup,
and linking the three US typical wines to their places. Brief B (the training room's two-way links,
then the on-demand likelihood map) is the **next document**,
`docs/superpowers/specs/<date>-training-room-map-design.md`. Its first part, the two-way links
("Option 0"), needs nothing from this work and **ships now, before US-2** (§14.4).

**Status.** Design only. Nothing in this document has been applied. The read-only checks in §3 and
§22 ran on 2026-09-29 inside `begin read only … rollback`. The only network reads were GitHub API
metadata listings (file names, sizes and SHAs; no data file was downloaded). No Anthropic API call.

**In one paragraph.** The catalogue has no US place at all. The scoring tables hold a messy flat
list of 240 US appellations, 210 of which end in " AVA", including 21 that are counties or states
and not AVAs at all. The plan:

- Register the USA in the shared map code on master first: attribution, palette, labels,
  per-country coverage checks, an outline-only fill flag, and a promote step that promotes its own
  release.
- Clean the US scoring rows in place, so nothing that references them changes id.
- Build four state waves the way Germany's newest regions were built:
  1. a committed normalized artifact and a committed tree report;
  2. a DRAFT catalog migration;
  3. an owner-approved knowledge migration;
  4. then, in one announced sitting: a stage script that writes DRAFT boundaries in one
     transaction, a promote migration that asserts the domain invariants and flips everything to
     VERIFIED + VALIDATED with the neighbour refresh, a pinned boundary-expectations hunk, and one
     tiles release.

US AVAs nest and overlap by law, so nothing is ever trimmed; overlap becomes `ALTERNATE_PARENT`
and `OVERLAPS` edges. About 205 places in five phases, each with its own acceptance checks and
rollback, run in turns with the friend's Germany work.

---

## 0. Method and what was re-checked

Every statement is grounded in one of three things:

- the research files (`usa-briefs.md`, and `usa-understand.json` with its pipeline, usa, room and
  collab maps);
- code read for this spec, cited by file and function;
- a read-only query run for this spec on 2026-09-29.

Where the research was unsure or wrong, the finding is marked **Checked** below and in the section
it affects.

| Research said | Checked 2026-09-29 |
|---|---|
| "26 or 28 regions" | **28**: 25 states, 2 AVAs stored as regions (`Columbia Gorge`, `Walla Walla Valley`), and the per-country `None` sentinel. |
| "240 or 244 appellations" | **240**, of which **210** end in " AVA". All are `map_status = 'PENDING'` and none is linked. |
| "5–7 catalog wines and 2 answer keys" | 5 `catalog_wines` and 2 `wine_answers`. **4 `guesses`**, which the research missed: 3 × Napa Valley AVA and 1 × Santa Barbara County AVA, all scored. 3 `wine_archetypes`. Zero rows in each of `catalog_wines_unidentified`, `profile_favourite_regions`, `training_attempts`, `type_designations` (on US regions), `label_lookups` and `wine_identity_drafts` (no jsonb draft names a US id). |
| "No self-named state appellation" | **Wrong.** All 25 states have one. Six carry a false " AVA" suffix (California, Oregon, Washington, Texas, Virginia, Pennsylvania); the rest are the bare state name. `justTheRegionOption` (`src/components/add-wine/self-named-appellation.ts`) already offers "California AVA" as "Just the region", because `stripDesignationSuffix` (`src/lib/wine-identity/fold.ts`) drops a trailing `ava`. |
| UC Davis per-state file names "to confirm" | `avas_by_state/CA_avas.geojson` 16,129,799 B, `WA_avas.geojson` 3,728,958 B, `OR_avas.geojson` 7,128,533 B, `NY_avas.geojson` 1,525,079 B: **28,512,369 B** together. The last commit touching `avas_by_state/` is `355f7da` (2025-12-03, "update state files"). |
| 2026 AVAs "not checked" | `avas/` holds 276 files. `columbia_hills` and `nashoba_valley` are absent. Present: `rocky_reach`, `lower_long_tom`, `san_ysidro_district`, `texas_davis_mountains`, `crystal_springs_of_napa_valley`, `west_sonoma_coast`, `laurelwood_district`, `beverly`, `candy_mountain`, `the_burn_of_columbia_valley`, `contra_costa`, `northern_sonoma`, `upper_hudson`, `champlain_valley_of_new_york`, `san_juan_creek` and `lamorinda`. The US-0 diff (§5.4) is still the authority. |
| Natural Earth "not measured" | `ne_50m_admin_0_countries_lakes.geojson` 3,138,521 B; `ne_50m_admin_1_states_provinces_lakes.geojson` 2,357,849 B (nvkelso/natural-earth-vector, `geojson/`). |
| (not in the research) | `get_wine_place_context` surfaces only `DUAL_LABEL` edges (`dual_label_list` in `20260920090000_wine_place_neighbours.sql`). `ALTERNATE_PARENT` and `OVERLAPS` are stored but shown nowhere (§8.6). Its `nearby_candidates` excludes only primary ancestors and primary-key descendants (§8.7). |
| (not in the research) | The guess-ladder grape shortlist is `shortlistGrapesForRegion` (with an internal `compute`) in `src/lib/grape-shortlist.ts`. Its callers are `play/guess-ladder.tsx`, `play/play-experience.tsx` and `src/components/add-wine/by-hand-form.tsx` (via `by-hand-logic.ts`). It name-matches a scoring region only to places of kind `COUNTRY/MACRO_REGION/REGION/SUBREGION` (`REGION_KINDS`), and folds in aliases of those places only. So once `California` is a VERIFIED REGION place, "Common grapes in California" switches from `region_grapes` to the map's grape links (§10.3). An AVA is an APPELLATION place and can never be matched. |
| (not in the research) | `countryCameraBox` (`src/lib/wine-map/camera-fit.ts`, `OUTLIER_FACTOR = 3`) would drop `new-york` as an outlier of the three West Coast shards (median distance ≈ 5.1°, New York ≈ 44°). So the chip gets its own fit rule (D26). |
| (not in the research) | The live-only migration `20260925190000_wine_place_context_inherited_profile` is still in no branch; live `get_wine_place_context` contains `inherited_grapes`. |
| (not in the research) | `gen-place-profiles-migration.mjs` checks only that a key exists, not that it is VERIFIED, so knowledge can land while places are DRAFT (§10.1). It emits `begin;`/`commit;` (lines 176 and 275), which commits partway through the owner's applier transaction, so a `--dry` rehearsal of a generated file applies it for real (D24). |
| (not in the research) | `Lake Erie AVA` already exists, as `Ohio › Lake Erie AVA` (`1f1d7c05-e522-4df4-8c84-78d0693fdffa`) (§6.2 step 5). |
| (not in the research) | The Columbia Gorge catalog wine (`64ac81fa-e8e4-4f22-a0be-3efa93a7c76c`) and answer key (wine `3bd5ecfa-d862-416d-9a01-b346fbd121df`) are both **Phelps Creek Vineyards**, a Hood River, Oregon producer (its `producers.region_id` is null). They are Oregon wines whatever Columbia Gorge's dominant state turns out to be (§6.2 step 6). |

---

## 1. Goal and scope

A taster opening the map can:

- fly to the United States and see the four states that matter for fine wine;
- drill from a state to its umbrella AVAs, and down to the named AVAs a critic or a WSET syllabus
  uses (Napa Valley → Oakville; Willamette Valley → Dundee Hills; Columbia Valley → Red Mountain;
  Finger Lakes → Seneca Lake);
- read a short profile of each;
- find the US typical wines on their places.

| Tier | States | Depth | In this spec |
|---|---|---|---|
| 1 | California, Washington, Oregon, New York | Every AVA whose dominant state is one of these, nested | Yes (US-2 … US-5) |
| 2 | Virginia, Texas, Michigan, Idaho | State outline plus their AVAs, shallow | No: "others later" (§20) |
| 3 | PA, NJ, NC, AZ, NM, OH, CO | — | No |

Why these four (research, `usa` map):

- **Acreage:** California ~590k acres in 2024, Washington ~50k, Oregon 47k, New York ~30k.
- **WSET Level 3** names these four states. This comes from secondary study material; the spec PDF
  could not be parsed.
- **Critics** give each of them dedicated coverage.

TTB counts 280 established AVAs (updated 2026-08-18): California 154, Oregon 23, Washington 22,
New York 11 (a cross-state AVA counts in each of its states). Wave 1 is about 205 distinct AVAs,
roughly one Burgundy wave.

Non-goals:

- Alaska and Hawaii.
- Counties as map nodes.
- Reference-to-place review (`map_status`).
- Brief B (the next document).
- Surfacing `ALTERNATE_PARENT`/`OVERLAPS` in the details panel.
- Aliases (§9).
- New label-reader synonyms (§20).
- More US typical wines.

---

## 2. Decisions

- **D1 Country key `united-states`.**
  - This follows the English-slug convention (`portugal`, `spain`, `italy`, `germany`).
    `canonical_key` locks once VERIFIED (`canonical_key_locked_at`).
  - The COUNTRY place is **named "United States"**. That is also `countries.name`, and what the
    label reader canonicalises "USA"/"U.S."/"America" to (`src/lib/label-scan/region-canonical.ts`).
  - Reason: `shortlistGrapesForRegion` compares the place's country name to the scoring country's
    name (`countryNameOf` … `fold(c) === wantedCountry`), so using the same string keeps that match
    exact.
- **D2 States are `REGION`, tier 1, one shard each.**
  - The shard is the second key segment (`shardKeyFor`, `scripts/wine-map-tiles/lib.mjs`):
    `california`, `washington`, `oregon`, `new-york`. Checked: none of the 67 live second segments
    collides with these.
  - States are not appellations on the map (`is_appellation = false`, like Spain's comunidades), so
    the map's classification border language stays about AVAs.
  - Reason: 27 CFR 4.25 makes a state a legal appellation of origin, but a state is an
    administrative outline, and the scoring side already carries it as an appellation row.
- **D3 Umbrella AVAs are `SUBREGION`, tier 2.**
  - California: North Coast, Central Coast, Sierra Foothills, South Coast (all real AVAs), plus
    **Central Valley**, a navigation node (`is_appellation = false`; D25).
  - Washington: Columbia Valley, Puget Sound.
  - Oregon: Willamette Valley, Southern Oregon.
  - New York: Finger Lakes, Long Island.
  - Every other AVA is `APPELLATION`. APPELLATION under APPELLATION is already used 71 times live.
- **D4 `appellation_system = 'AVA'`, with levels `regional` / `subregional`.**
  - `'AVA'` is a new free-text value. `appellation_system` is `text`, coupled only by
    `wine_places_classification_coupling` (`20260801090000`), so no schema change is needed.
  - An AVA whose primary parent is a state or a navigation node is `regional`. An AVA whose primary
    parent is another AVA is `subregional`.
  - `communal`, `premier_cru`, `grand_cru` and `cru` are never used for the US. Reason:
    `staticFillPaint` (`src/lib/wine-map/shard-specs.ts`) gives `communal`/`premier_cru`/`grand_cru`
    their own opacities, which are Burgundy's intensity ramp and mean nothing for an AVA.
- **D5 Counties are not map nodes.** They stay scoring appellations, renamed to "X County" with the
  false " AVA" suffix removed (§6). Reason: county lines cut across AVAs (Los Carneros spans Napa
  and Sonoma; Petaluma Gap spans Sonoma and Marin), so a county layer would need `ALTERNATE_PARENT`
  edges everywhere for little gain.
- **D6 Every AVA is ONE place, keyed under ONE state: its dominant state.**
  - "Dominant" means the state holding the largest share of the AVA's land area. It is computed in
    US-0 from the UC Davis geometry (§8.3) and recorded in the committed tree report.
  - Exception: an **owner-approved override** recorded in the data file (`state_override`, with the
    owner's words), which applies to the map and the scoring row alike.
  - Every other state holding ≥ 0.5% of the AVA's land area gets an `ALTERNATE_PARENT` edge.
  - **Only a legal state counts** (US-0 review fix, 2026-09-29). A legal state is one TTB lists for
    the AVA (`data/wine-map/usa-ava-ttb-list.json`; UC Davis's own list only for an AVA TTB does
    not name). "Dominant" is the largest land share among the legal states, a state edge needs a
    legal state, and an override must name one. Reason: the NE 1:50m state line sits several km off
    the Columbia River, so it measures Oregon land inside Washington-only AVAs (The Burn of Columbia
    Valley 38%, Horse Heaven Hills 2%). Those shares are withheld and listed for review
    (`review.state_list_disagreements[].withheld_states`), never used.
  - An AVA whose dominant state is outside wave 1 waits for that state's wave (likely Snake River
    Valley and Lewis-Clark Valley, for Idaho; Lake Erie is decided by the computation).
  - Reason: the shard is the second key segment and keys lock, so a place cannot live in two shards.
- **D7 Primary parent = the smallest AVA that contains the place geometrically AND is keyed under
  the same state.**
  - If there is none: the umbrella SUBREGION or navigation node the data file names. Otherwise: the
    state.
  - Every other containing AVA becomes an `ALTERNATE_PARENT` edge, including one in another state's
    shard.
  - So The Rocks District of Milton-Freewater, which lies wholly in Oregon, is keyed under
    `united-states.oregon`, with `ALTERNATE_PARENT → Walla Walla Valley` if Walla Walla Valley is
    Washington-dominant.
  - Reason: Russian River Valley is within North Coast, Northern Sonoma and Sonoma Coast (UC Davis
    `within`), and the tree is single-parent. A wholly-Oregon AVA must not appear only under
    Washington (§22, F7/C2).
  - UC Davis `within`/`contains` are **not trusted**: the Russian River file lists Alexander Valley
    under `contains`. Containment is recomputed in PostGIS, and the text is only cross-checked.
- **D8 Overlap is legal; nothing is ever trimmed.**
  - `trim-sibling-overlaps.mjs` never runs on `united-states.*`.
  - Burgundy's ">50% overlap ⇒ `DUAL_LABEL`" rule is not applied.
  - Partial overlaps become `OVERLAPS` edges (§8.5).
- **D9 Boundaries are a generalized digitization, never "the legal boundary".**
  - `boundary_method = 'GENERALIZED_FROM_OFFICIAL_SOURCE'`, and `generation_parameters.engine =
    'ucd-ava-digitization'`; never `official-delimited-area`.
  - Reason: UC Davis says "educational purposes only, no warranties", and
    `20260913120000_italy_relabel_comune_union_engine.sql` exists because approximations once called
    themselves official.
- **D10 CRS: NAD83 is read as WGS84, and this is recorded.**
  - UC Davis traces in NAD83 (EPSG:4269). Across the conterminous US, NAD83 and WGS84 differ by
    about 1–2 m. That is far below the source's own line accuracy (a USGS 1:24,000 topo base, whose
    National Map Accuracy Standard is 12.2 m) and below the display simplification.
  - So coordinates are taken as EPSG:4326 unchanged, and `generation_parameters` records
    `{"crs_in":"EPSG:4269","crs_out":"EPSG:4326","transform":"identity"}`.
  - The stage asserts, in metres, that the simplification tolerance is at least **five** times the
    2 m datum shift, measured as metres of longitude at the state's northernmost latitude. Example:
    0.0002° at 49°N ≈ 14.6 m ≥ 10 m.
- **D11 Stage and promote, not an inline-geometry migration.**
  - California's source is 16.1 MB; Portugal's inline migration was 304 KB for 27 shapes. The
    Germany pattern (`stage-germany-weinbau.mjs` + `20260916120000_germany_baden_wuerttemberg_promote.sql`)
    fits.
  - Places stay DRAFT until the promote, so a release the friend runs mid-wave exports none of them
    (`export.mjs` reads `publication_status = 'VERIFIED'` only).
- **D12 The country row and its states flip to VERIFIED in the same promote transaction.** Reason:
  `assertMultiCountryArchive` fails every release (the friend's too) if a VERIFIED place's country
  has no tier-0 outline.
- **D13 Scoring rows are cleaned in place before any map wave (US-1), and they stay PENDING.**
  - Renames keep ids. Merges re-point every reference to the kept row, then remove the empty
    duplicate. This is the producer-dedupe approach, never delete-and-reinsert.
  - `map_status` stays `PENDING` for every US row. The owner's rule (`20260902150000`) reserves
    VERIFIED for a human review that only France has had, and
    `scripts/world-wine-map-foundation.test.mjs` ("only exact current Bordeaux references are
    verified") pins that.
- **D14 One scoring row per cross-state AVA, under the same state as its map place (D6, including
  any override).** The per-state duplicates and the two pseudo-regions go, with every reference
  re-pointed by id, subject to the safety rules in §6.3. A move that would make an existing wine's
  record name the wrong state stops for the owner (§6.2 step 6).
- **D15 Very large AVAs draw as outlines.**
  - The `outline` set is exactly: every `SUBREGION` or `APPELLATION` place whose current boundary
    comes from the `UCD_TTB_AVA` or `TTB_AVA_MAP` namespace and covers **5,000 km² or more**
    (≈1.24M acres: Columbia Valley, Central Coast, North Coast, Willamette Valley, Puget Sound,
    Sierra Foothills, Finger Lakes…), plus the navigation node Central Valley (D25).
  - Those places carry the tile property `outline: true` and draw no fill, only their line.
  - The country and the states are never in the set (they are NE outlines, and keep the normal
    tier-0/1 wash). Long Island (about 3,000 km²), Lodi (2,230 km²), Paso Robles (~2,480 km²) and
    Napa Valley (~910 km²) keep fills.
  - Reason: at tier 2, the existing fill is `min(0.5, 0.16 × tier)` = 0.32 at z5, a blanket over
    millions of acres of non-vineyard land that hides the AVAs that matter.
- **D16 `label_min_zoom` ≤ 10 for every US place.** The shard's max zoom is
  `ceil(max label_min_zoom) + 2` (`export.mjs`), so California stays at z12, not Bourgogne's z16
  (5.2 MB).
- **D17 Per-country coverage, not a wider box.**
  - `validate.mjs`'s single `COVERAGE_BBOX` (-18..19 lon, 32..56 lat) rejects any US archive.
    Widening it to -125 would stop catching a stray European shard.
  - Two checks replace it:
    1. **Header check.** Each archive's pmtiles header bounds must lie inside the bbox of the union
       of the boxes of the countries it contains. For a shard, that is its own country's box.
    2. **Feature check.** Every `release.expected` row's `label_lon`/`label_lat` must lie inside
       *its own* country's box (country = first key segment), in every archive, the world archive
       included.
  - The feature check is what keeps a Paris label on a `united-states.*` key failing even though
    the world archive's header box now spans -125.5..19.
  - A country with no box throws. This resolves the `TODO(3E)` in `validate.mjs`, which asked for
    per-shard boxes.
- **D18 Aliases are deferred** (§9). Nothing reads aliases of APPELLATION places today, and the
  explorer search does not read aliases at all.
- **D19 Knowledge is written in-session, and the owner approves it before it applies, and before
  any boundary is staged.**
  - AGENTS.md rules out any API batch.
  - Articles apply as `PUBLISHED`. A `DRAFT` article is invisible under "wine place articles
    published read" and cannot be previewed in the app, so the owner reads them first, as a review
    file (§18).
  - The approval comes **before `--stage`**, so owner review time never sits inside a DRAFT-boundary
    window (§15).
- **D20 US knowledge lives in its own data file,** `data/wine-map/place-profiles-usa.json`, and the
  generator takes `--source`. Reason: `gen-place-profiles-migration.mjs` emits every entry not yet
  live, so a shared file would let one person's generated migration apply the other's content.
- **D21 This spec never recreates a shared map function.** No change to `get_wine_place_context`
  or `refresh_wine_place_neighbours`. Reason: live `get_wine_place_context` carries the friend's
  unpushed `20260925190000`, and recreating it from the repo copy would silently delete that (§17).
- **D22 The three US typical wines are linked in two steps.**
  - US-2 links them at subregion level (the deepest place that exists then); US-3 moves the two
    California wines to their AVAs.
  - Both `wine_archetypes.wine_place_id` (the home, read by the training room) and
    `wine_archetype_placements` (read by the map's "Typical wine" list) are set.
  - Archetypes are matched by name **and** live id, both asserted, because names are editable in
    `/admin/archetypes`.
- **D23 Migration versions for this work end in `4747`** (`YYYYMMDDHH4747`).
  - Checked: no repo migration and no live `schema_migrations` version uses that suffix. (`4500` was
    taken, by `20260914094500` and `20260914104500`.)
  - Reason: both people apply live directly. A distinct suffix keeps two same-day migrations from
    colliding and makes the author obvious in `schema_migrations`.
- **D24 No migration in this spec contains a transaction statement.**
  - This covers catalog, cleanup, knowledge, promote and archetype links. None contains `begin;`,
    `commit;` or `rollback;`; the applier owns the transaction.
  - The generator gains `--bare`, which emits no `begin;`/`commit;`. Every US run passes it. The
    default output stays as it is, because the friend's workflow may rely on it (§22, F1).
  - The promote copies `20260916120000`'s asserts, never its `begin;`/`commit;`.
  - The applier gets a pre-flight check that refuses a file containing a top-level
    `begin`/`commit`/`rollback` statement (outside a `$$` body). A `--dry` rehearsal is therefore a
    real rehearsal.
- **D25 Central Valley is a navigation node with a derived outline.**
  - It is a `SUBREGION`, `is_appellation = false`, and not an AVA.
  - Its boundary is `DERIVED_FROM_DESCENDANTS` (the union of its verified member AVAs, via
    `scripts/wine-map-sources/derive-boundary.mjs`, as Burgundy's districts), with
    `display: 'outline'`.
  - Reasons:
    - `export.mjs` fills `group_name` only from exported rows (boundary required), so without a
      boundary everything under Central Valley would get a null `group_name`.
    - Picking it in the tree would not move the camera.
  - Its article says in its first sentence that it is a grouping on this map, not an AVA.
- **D26 The "United States" chip frames all four states.**
  - `countryCameraBox` gains an option to keep every shard. The explorer uses it for countries in a
    `CHIP_FIT_ALL_SHARDS` set, which holds `united-states` only. The chip therefore frames the lower
    48 from California to New York.
  - On a phone, that is below shard zoom, so the world archive's four state washes show first and a
    tap drills in (checked on iPhone, §15 US-2).
  - The chip's z5.5 floor (`CHIP_MIN_ZOOM`) does not apply to these countries: `chipMinZoom(country)`
    is 0 for them, so the camera keeps MapLibre's fitted zoom (about z4.4 on a laptop, z2 on a
    phone). Raised to z5.5, the box would centre on its middle, the Great Plains, with neither coast
    on screen (US-0 review fix, 2026-09-29).
  - Reason: the outlier rule would silently drop New York, the first thing a user tapping the chip
    would notice.

---

## 3. What is live today (read-only, 2026-09-29)

**Map catalogue.**

- 3,309 places, all VERIFIED: germany 1,695, france 1,241, italy 252, spain 83, portugal 38. **No
  `united-states`, `usa` or `us.` key.**
- All 3,694 boundary rows are VALIDATED (none DRAFT).
- The last `wine_places` write and the last boundary write were both at 2026-09-16T21:34Z.
- Neighbour cache `fresh = true`, built 2026-09-20T13:39Z. ACTIVE release `20260916T213650Z`.
- Relationships: `DUAL_LABEL` 5, `REPLACES_WITHIN` 1, no `ALTERNATE_PARENT` or `OVERLAPS`.
  Aliases: 0.
- `appellation_system` values: AOC/AOP 1,107, g.U. 1,694, DOC 140, DOP 74, DOCG 65, DOCa 4, IGT 2,
  DOCa/DOQ 1, null 222.
- Country places, with their sort_order: france 1, italy 100, spain 110, germany 120, portugal 130.
  All are tier 0, `min_zoom` 1.5, `label_min_zoom` 2.

**US scoring rows.** Country `United States` (`fb8c582b-3bd2-4571-ac7f-834d79af6bb5`), PENDING,
unlinked.

| Region | Appellations | of which " AVA" | Producers |
|---|---:|---:|---:|
| California | 138 | 132 | 3,210 |
| Oregon | 21 | 21 | 481 |
| Washington | 19 | 18 | 336 |
| New York | 8 | 7 | 119 |
| Texas / Virginia | 6 / 6 | 6 / 5 | 30 / 131 |
| Missouri, New Jersey, Arizona, Idaho | 5, 5, 4, 3 | 4, 3, 3, 2 | 16, 5, 56, 4 |
| CO, MD, MI, NM, OH, PA, WI | 2 each | ≤ 2 | 1–9 |
| IL, IN, KY, MT, NV, TN, UT, VT | 1 each | 0 | KY 143, others ≤ 12 |
| **Columbia Gorge** (an AVA) | 1 | 1 | 0 |
| **Walla Walla Valley** (an AVA) | 1 | 1 | 45 (+3 `region_grapes`) |
| None (sentinel) | 1 | 0 | 0 |

Cross-state rows today (live ids, to be asserted in US-1):

| AVA | Rows |
|---|---|
| Columbia Valley AVA | Oregon `30a8e06f-c9a7-4e5d-ae43-819f8048fe54`; Washington `52b4e94c-44ce-435f-a68d-5bf1c13050dd` |
| Columbia Gorge AVA | Oregon `c367f0ce-84c1-4f16-a228-aba53fda736e`; Washington `46451c0f-3bb2-42c4-8d30-c5ac3ea86461`; region Columbia Gorge `254e0e57-4b21-4172-9568-8a8bbeaa3fee` |
| The Rocks District of Milton-Freewater AVA | Oregon `c1c1d9d0-aa74-44ab-97b5-bd31a067fa0f`; Washington `41694564-7601-454a-a28b-220962248568` |
| Walla Walla Valley | Washington › "Walla Walla Valley" `c27f9b10-8b46-4e71-a590-a3184d883d0b`; region Walla Walla Valley › "Walla Walla Valley AVA" `be3fd8ac-0b9e-4055-a6b6-e937dac8ed0f` |
| Snake River Valley AVA / Lewis-Clark Valley AVA | Oregon + Idaho / Washington + Idaho (left for Idaho's wave) |
| Lake Erie AVA | Ohio `1f1d7c05-e522-4df4-8c84-78d0693fdffa` |

**Every live reference to a US scoring row:**

| Table | Row | Count | State |
|---|---|---:|---|
| `catalog_wines` | California AVA; Napa Valley AVA; Paso Robles Willow Creek District AVA; Sta. Rita Hills AVA; Oregon › Columbia Gorge AVA (Phelps Creek Vineyards) | 1 each | none `blind_pending`, none merged, 0 WSET notes on the Columbia Gorge wine |
| `wine_answers` | Napa Valley AVA | 1 | revealed, CLOSED, 3 scored guesses |
| `wine_answers` | Oregon › Columbia Gorge AVA (Phelps Creek Vineyards) | 1 | revealed, CLOSED, **0 guess rows** |
| `guesses` | Napa Valley AVA (region California) | 3 | scored |
| `guesses` | Santa Barbara County AVA (region California) | 1 | scored |
| `wine_archetypes` | Napa Valley AVA; Sonoma Coast AVA; Willamette Valley AVA | 1 each | `wine_place_id` null, 0 placements |

References to the scoring tables:

- FKs to `appellations`: `catalog_wines`, `catalog_wines_unidentified`, `guesses`,
  `wine_answers`, `wine_archetypes`.
- FKs to `regions`: `appellations`, `catalog_wines`, `catalog_wines_unidentified`, `guesses`,
  `producers`, `profile_favourite_regions`, `region_grapes`, `training_attempts.picked_region_id`,
  `type_designations`, `wine_answers`, `wine_archetypes`.
- Id columns with no FK: `label_lookups.region_id` / `.appellation_id` (0 US rows).
- jsonb that may hold ids: `wine_identity_drafts.draft` (`regionId`/`appellationId`, 0 US today),
  and the history payloads in `label_reads` and `catalog_wine_edits`.
- `appellations` is `UNIQUE (region_id, name)`.
- `catalog_wines_identity_key` includes `appellation_id`, so an appellation merge can collide there.

Name references outside the database:

- `src/lib/wine-identity/__fixtures__/reference-snapshot.json` holds `California` and
  `California AVA`. The row with id `ef4ebc71-aadf-4792-abae-300698f7b09f` is `California AVA`. The
  exporter `.superpowers/export-reference-snapshot.mjs` is gitignored and not on this machine.
- `scripts/seed-demo-people.mjs` and `data/training/archetypes-batch-1.json` use `Napa Valley AVA`,
  `Sonoma Coast AVA` and `Willamette Valley AVA` (real AVAs, unchanged by §6).
- `live-replay.test.ts` uses `Sta. Rita Hills AVA` (unchanged).

---

## 4. The tree, kinds, keys and zooms

```
united-states                                   COUNTRY     tier 0  z1.5 / label 2   sort 140
├─ united-states.california                     REGION      tier 1  z4   / 4          (shard)
│  ├─ .north-coast                              SUBREGION   tier 2  z5   / 5   AVA regional, outline
│  │  ├─ .napa-valley                           APPELLATION tier 3  z6   / 7   AVA subregional
│  │  │  └─ .oakville                           APPELLATION tier 4  z7   / 9   AVA subregional
│  │  └─ .northern-sonoma …                     (chain continues: russian-river-valley, green-valley-…)
│  ├─ .central-coast                            SUBREGION   outline
│  ├─ .sierra-foothills / .south-coast          SUBREGION   (outline if ≥ 5,000 km²)
│  ├─ .central-valley                           SUBREGION   navigation node, derived outline (D25)
│  │  └─ .lodi → 7 sub-AVAs
│  └─ AVAs outside every umbrella               APPELLATION tier 2 directly under the state
├─ united-states.washington   (columbia-valley, puget-sound, …; per the US-0 dominance table)
├─ united-states.oregon       (willamette-valley, southern-oregon, the-rocks-district-…, …)
└─ united-states.new-york     (finger-lakes, long-island, hudson-river-region, …)
```

**Keys.**

- Form: `<country>.<state>[.<ancestor-slugs>…].<slug>`, following the primary tree at insert time
  (D6/D7).
- Slugs come from the TTB legal name without "AVA": `sta-rita-hills`, `mt-veeder`,
  `mt-pisgah-polk-county-oregon`, `oak-knoll-district-of-napa-valley`.
- Keys are opaque once VERIFIED, and nothing parses them for hierarchy (CLAUDE.md Phase 3A). Only
  the tile pipeline reads the first two segments, and the coverage check reads the first.

**Names** are the legal name without the suffix ("Napa Valley"), as every other country's places
are ("Pauillac", not "Pauillac AOP"). The suffix lives on the scoring row.

**Tiers and zooms** (a rule, not a list):

| Place | display_tier | min_zoom | label_min_zoom |
|---|---:|---:|---:|
| Country | 0 | 1.5 | 2 |
| State | 1 | 4 | 4 |
| Umbrella SUBREGION or navigation node | 2 | 5 | 5 |
| AVA directly under a state or navigation node | 2 | 6 | 6 |
| AVA one level inside another AVA | 3 | 6 | 7 |
| two levels | 4 | 7 | 9 |
| three or more | 5 | 8 | 10 |

Tier also drives `staticFillPaint` opacity and `LABEL_TIER_SIZE`. The table mirrors Portugal
(subregions z5, DOPs z6) and keeps every label at z10 or below (D16). The hierarchy trigger (a
child's tier must be ≥ its parent's) allows these tiers.

**California's navigation node.**

- Central Valley groups the AVAs of the Sacramento and San Joaquin valleys that sit in no umbrella
  AVA: Lodi and its sub-AVAs, Clarksburg, Merritt Island, Dunnigan Hills, Capay Valley, Madera,
  Diablo Grande, Salado Creek, River Junction, Tracy Hills…
- Its member list is curated in the data file by county.
- Its outline is derived from those members (D25).
- Other AVAs outside every umbrella (e.g. Antelope Valley of the California High Desert, Trinity
  Lakes, Seiad Valley) sit directly under California.

---

## 5. Data sources, licences and artifacts

### 5.1 Files to fetch (owner approved "Yes, download")

| File | Source | Licence | Size |
|---|---|---|---:|
| `avas_by_state/CA_avas.geojson` | github.com/UCDavisLibrary/ava, pinned at the commit fetched (currently `355f7da`) | CC0-1.0 | 16,129,799 B |
| `avas_by_state/WA_avas.geojson` | same | CC0-1.0 | 3,728,958 B |
| `avas_by_state/OR_avas.geojson` | same | CC0-1.0 | 7,128,533 B |
| `avas_by_state/NY_avas.geojson` | same | CC0-1.0 | 1,525,079 B |
| `geojson/ne_50m_admin_0_countries_lakes.geojson` | github.com/nvkelso/natural-earth-vector | Public domain | 3,138,521 B |
| `geojson/ne_50m_admin_1_states_provinces_lakes.geojson` | same | Public domain | 2,357,849 B |
| TTB AVA Map Explorer shapefile per missing AVA (US-5; Columbia Hills confirmed missing) | ttb.gov AVA Map Explorer | CC0 per data.gov (schema unverified; ttb.gov refused the research fetch) | a few AVAs |

The `_lakes` Natural Earth variants are used, not the plain ones France and Portugal used. In the
plain variants the Great Lakes are land of the US polygon and of New York, so the country and New
York fills would paint Lake Erie and Lake Ontario.

Downloads go through two paths:

- UC Davis files: a new `scripts/wine-map-sources/fetch-ucd-ava.mjs`, which fetches by commit SHA
  from `raw.githubusercontent.com/UCDavisLibrary/ava/<sha>/…` and pins each file's sha256.
- Natural Earth files: the existing NE extractor pattern.

### 5.2 Raw retention

- Raw files never enter git. `fetch-ucd-ava.mjs` only writes them to `.tiles-build/usa/` and
  records their sha256. **US-0 writes nothing live, Storage included.**
- The upload to the private `wine-map-sources` bucket happens in the US-2 stage run, as its first
  step. It is idempotent by sha256, and goes to
  `storage://wine-map-sources/UCD_TTB_AVA/<source revision>/<file>`. This is the INAO pattern
  (`build-boundary.mjs`; live example `storage://wine-map-sources/IGN_INAO_AOC_VITICOLES/…/
  fetch-manifest.json`).
- Each snapshot row then has:
  - `raw_snapshot_uri` + `raw_checksum_sha256`;
  - `source_revision` = the UC Davis commit SHA;
  - `retrieved_at` and `source_url`;
  - `licence` = `CC0-1.0 (American Viticultural Areas Digitizing Project)`;
  - `importer_version`.
- The NE files follow the existing extractor exactly: a committed
  `data/wine-map/united-states-ne50m-raw.geojson` (the USA feature) and
  `united-states-lower48-ne50m.geojson`, with `raw_snapshot_uri` null and a `provenance_note`, like
  Portugal's live country row.

### 5.3 Normalized artifacts (committed, sha256-pinned)

- **Per-state AVA files:** `data/wine-map/usa-<state>-ava.geojson`, one per state.
  - Contents: only in-scope AVAs, and only the current boundary (`valid_end` null).
  - Properties are trimmed to `ava_id, name, aka, state, county, within, contains, cfr_index,
    valid_start`.
  - Geometry is simplified with Douglas–Peucker at 0.0001° (≈10 m, under the 12.2 m source
    accuracy) and rounded to 5 decimals.
  - Each carries a `_provenance` block (source commit, raw sha256, method), as
    `stage-germany-weinbau.mjs` requires.
  - Budget: ≤ 10 MB across the four files. If California alone exceeds it, its normalized artifact
    moves to the bucket too (`normalized_artifact_uri` may be a `storage://` URI, as INAO's are). The
    stage script then downloads it first and checks its sha256 against the committed pin before using
    it.
- **States:** `data/wine-map/usa-states-ne50m.geojson` holds the four wave states **plus every
  other state that any wave-1 AVA touches**. Those extra states (at least Idaho, Pennsylvania and
  Ohio, for Snake River Valley, Lewis-Clark Valley and Lake Erie) are check-only geometry for the
  dominance and containment computation. They never become places in this spec.
- **Tree reports:** `data/wine-map/usa-<state>-tree.json`. These are the §8.3 output, committed in
  US-0 and re-asserted by `--stage`.

### 5.4 The TTB diff (US-0)

- `data/wine-map/usa-ava-ttb-list.json` holds TTB's established-AVA list as read on the day (name,
  states, CFR section, established date; 280 on 2026-08-18), copied in-session.
- A pure, tested check (`usa-ava-diff.mjs`) compares it to the UC Davis features by legal name and
  CFR section, and writes three lists:
  - in both;
  - TTB only (US-5 material; Columbia Hills is known);
  - UC Davis only (removed or renamed AVAs, each of which must be explained).
- The same file drives the scoring-row additions (§6.2 step 8) and the dominant-state table (D6).

### 5.5 Attribution

| Namespace | key | Text (owner approves, §18) |
|---|---|---|
| `UCD_TTB_AVA` (new) | `ucd-ava` | "AVA outlines: American Viticultural Areas Digitizing Project, UC Davis Library et al. (CC0) — a generalized digitization of 27 CFR Part 9, not TTB's legal boundary" |
| `TTB_AVA_MAP` (new, used from US-5) | `ttb-ava` | "AVA outlines: TTB AVA Map Explorer (public domain) — generalized, not the legal boundary" |
| `NATURAL_EARTH` (exists) | `natural-earth` | unchanged, "Made with Natural Earth"; used for the country and the four states |

---

## 6. Scoring-reference cleanup (US-1)

### 6.1 Why first

The US rows came from LWIN via `scripts/add-appellation-designations.mjs`. Its allowlist appended
LWIN's "AVA" designation to rows whose site was a county or a state. Usage is tiny today (§3), so
the fix is cheap now and gets dearer with every tasting.

It must precede the map waves because of D14. The scoring row of a cross-state AVA has to sit under
the same state as its map place, before any taster sees both. It also has to precede US-2's
shortlist change (§10.3): the state shortlists must be compared against clean region rows, with the
two pseudo-regions gone.

### 6.2 Operations (one migration, `…4747_usa_reference_cleanup.sql`)

The rename/merge table is generated in-session from the §5.4 diff and the US-0 dominance table. It
is pasted into the migration as a literal `jsonb` spec, the way
`20260914114217_appellation_prefix_designations.sql` does it.

- Each row names **country + region + old name + new name**, and carries the **live id**.
- Rows are matched by name, because a fresh replay of the seed migrations creates different ids.
- Live mode vs replay mode (§6.3): in live mode, the live id is asserted to be the row matched.

The table as read on 2026-09-29:

1. **States lose the false suffix** (6): California AVA → California; Oregon AVA → Oregon;
   Washington AVA → Washington; Texas AVA → Texas; Virginia AVA → Virginia; Pennsylvania AVA →
   Pennsylvania.
   - `justTheRegionOption` keeps offering them, since they fold equal to the region name with or
     without the suffix.
   - One catalog wine references California AVA; its id does not change.
2. **Counties lose the false suffix** (15): Amador, Calaveras, Contra Costa, El Dorado, Lake,
   Marin, Mendocino, Monterey, Napa, San Benito, San Luis Obispo, Santa Barbara, Santa Cruz,
   Sonoma, Yolo. Each "X County AVA" becomes "X County".
   - Contra Costa County AVA (`02a91253-bc9c-42a0-a155-7e666f1cd098`) is renamed like the others,
     because the LWIN row meant the county. The real AVA is added separately in step 8.
   - One scored guess references Santa Barbara County AVA; its id and points do not change.
   - **Not** touched: real AVAs whose legal name contains "County": Eagle Peak Mendocino County, Red
     Hills Lake County, Solano County Green Valley (and Moon Mountain District Sonoma County after
     step 4).
   - Unsuffixed county rows already follow the "X County" form: Los Angeles, Madera, San Mateo,
     Santa Clara, Ventura; Frederick MD; Hunterdon NJ; Loudoun VA.
3. **Merges** (loser → kept row):
   - Santa Benito County AVA → San Benito County (a typo).
   - SLO Coast AVA → San Luis Obispo Coast AVA (TTB's legal name).
   - California › Sonoma (unsuffixed) → Sonoma County.
   - Washington › Walla Walla Valley (unsuffixed, `c27f9b10-…`) → Walla Walla Valley AVA
     (`be3fd8ac-…`).
4. **Legal-name corrections** (renames). The exact strings come from the UC Davis `name` field:
   - Oak Knoll District AVA → Oak Knoll District of Napa Valley AVA;
   - Moon Mountain District AVA → Moon Mountain District Sonoma County AVA;
   - Mt. Pisgah Polk County Oregon AVA → Mt. Pisgah, Polk County, Oregon AVA;
   - Red Hill Douglas County Oregon AVA → Red Hill Douglas County, Oregon AVA;
   - The Hamptons (Long Island) AVA → The Hamptons, Long Island AVA.
5. **Cross-state AVAs go to one row under the map state (D14)**, per the US-0 dominance table:
   - **Columbia Valley:** the Oregon row merges into the Washington row (expected).
   - **The Rocks District of Milton-Freewater:** the Washington row merges into the Oregon row. It
     lies wholly in Oregon.
   - **Walla Walla Valley:** the kept row (after step 3) is re-parented from the pseudo-region to
     the dominant state.
   - **Lake Erie:** if New York is dominant, the Ohio row is **moved by id** to New York. Otherwise
     it is left alone for Ohio's wave. No new Lake Erie row is ever created.
   - **Snake River Valley and Lewis-Clark Valley** keep their rows until Idaho's wave decides them,
     since their dominant state is not in wave 1.
6. **Columbia Gorge is an owner decision before US-1.**
   - It has three rows: the pseudo-region's, Oregon's and Washington's. Its only references are one
     catalog wine and one CLOSED answer key, both Phelps Creek Vineyards (Hood River, **Oregon**).
   - If US-0 finds it Oregon-dominant, all three rows merge into Oregon's, and nothing on record
     changes state.
   - If US-0 finds it Washington-dominant, the migration does **not** merge it on its own. The owner
     is asked to choose:
     - (a) a `state_override` to Oregon for Columbia Gorge, applied to map and scoring alike (D6).
       The record stays honest.
     - (b) accept that the Phelps Creek record and catalog wine read "Washington · Columbia Gorge".
   - US-1 applies only once that answer is in the data file.
   - The same rule applies to any other moved catalog wine or answer key: its producer's real state
     is checked in-session first. If it is the non-dominant state, the migration stops for the owner.
7. **The two pseudo-regions are retired.** For `Walla Walla Valley` and `Columbia Gorge`:
   - Re-point `producers.region_id` **by each producer's actual state**. That is 45 and 0 producers.
     Each producer's winery state is looked up in-session from public sources (for example,
     Milton-Freewater producers go to Oregon, Walla Walla city producers to Washington); a producer
     whose state is unsure gets `region_id = null`. The list is committed in the migration's spec
     block.
   - Merge `region_grapes` (3 rows) into the dominant state's set without duplicates.
   - Assert that every other region FK (the §3 list) and `label_lookups.region_id` is zero.
   - Delete the empty region row.
8. **Missing AVAs are added**, for the four wave-1 states only, from the TTB list. Each becomes a
   "<Legal name> AVA" row under its map state (D6):
   - e.g. Northern Sonoma, West Sonoma Coast, Crystal Springs of Napa Valley, San Juan Creek,
     Lamorinda, Contra Costa (if TTB lists it), Beverly, Candy Mountain, Columbia Hills, Rocky
     Reach, The Burn of Columbia Valley, Laurelwood District, Lower Long Tom, Hudson River Region,
     Upper Hudson, Champlain Valley of New York.
   - Checked: none of these exists live today (only the Contra Costa County row, handled in step 2,
     and Ohio's Lake Erie, handled in step 5).
   - New reference rows are public at once. That is the accepted F9 in CLAUDE.md's rule-1 notes.
   - Other states' missing AVAs wait for their wave.
9. **Kentucky is left alone** (143 producers, very likely LWIN spirits). The `None` sentinels are
   untouched.

### 6.3 Safety rules (asserted in the migration, fail-closed)

**Ids and references.**

- **Ids never change for a renamed row.** Every rename is `update … set name` on the asserted id.
- **A merge re-points every reference first, then deletes the loser, then asserts the loser has no
  references left, all in one transaction.** The references are:
  - the five `appellations` FKs;
  - the eleven `regions` FKs;
  - `label_lookups.region_id` / `.appellation_id` (no FK, 0 US rows today);
  - `wine_identity_drafts.draft` → `regionId`/`appellationId`. The migration asserts that no draft
    names a loser or moved id (0 today). If one appears on the apply day, it is rewritten to the
    kept id in the same transaction with `jsonb_set`.
- **History payloads keep old ids.** The jsonb in `label_reads` and `catalog_wine_edits` is
  history, is not re-pointed, and is documented as such in the migration header.
- **No identity-key collision.** Before an appellation merge, the migration asserts that no two
  non-merged `catalog_wines` would share `catalog_wines_identity_key`
  (`producer_id, lower(wine_name), appellation_id, colour, vintage…`) afterwards.

**Region moves.**

- **Appellation-in-region holds after every move.** When an appellation moves region (steps 5–7),
  every row that carries both ids gets the new `region_id` in the same transaction: `catalog_wines`,
  `catalog_wines_unidentified`, `wine_answers`, `guesses` and `wine_archetypes`. This is needed
  because the write path refuses an appellation outside its region
  (`src/lib/wine-identity/server/write.ts`: "The appellation is not in the chosen region.").
- **A `catalog_wines` region move writes an audit row.** It writes a `catalog_wine_edits` row with
  `editor_id` null. That column is nullable, and `catalog_wines_rule1_guard` does not judge a write
  with no `auth.uid()`, so this works; it is stated here so nobody is surprised by the audit row.
- **No guess is ever re-pointed to a different region or appellation.** The migration asserts that
  no `guesses` row references any row that merges or changes region. This is true today: the 4 US
  guesses reference Napa Valley AVA and Santa Barbara County AVA, which at most rename.
- **An answer key moves region only if its glass has no guess row at all** (asserted) **and** its
  producer's real state is the target state (§6.2 step 6). Any other case stops the migration for
  the owner.
- **Stored points are never recomputed.** Scoring is a plain FK comparison at reveal time
  (`reveal_wine`), and scored rows keep their stored points.

**Replay-safe asserts (live mode vs replay mode).** Modelled on `20260914114217`:

- **Live mode:** the migration first checks whether the live anchor id exists (the California AVA
  row `ef4ebc71-aadf-4792-abae-300698f7b09f`). If it does, it runs every exact assert:
  - pre-state: 28 US regions, 240 US appellations, 210 ending " AVA", and the §3 reference table
    row by row;
  - each operation's live id;
  - post-state: 26 US regions; the expected appellation count; every renamed id present with its
    new name; no US appellation name ending " AVA" that is not in the TTB list; `UNIQUE (region_id,
    name)` intact; every US row still `PENDING` and unlinked.
- **Replay mode:** on a fresh replay (the anchor is absent; the seed `20260710141617` creates US
  rows without " AVA"), each operation applies by name only where its old name exists, and no count
  assert runs.

**Transaction and apply.**

- **No transaction statements in the file** (D24). It is rehearsed with `--dry` (rolled back)
  first, per the owner's applier and CLAUDE.md's "version rows recorded without their DDL" warning.
- **Apply at a quiet hour.** Clients with a region list open while it applies may hold a retired id
  (Walla Walla Valley or Columbia Gorge as a *region*). Examples: an add-wine form, a guess ladder,
  or a training-room device draft (`src/lib/training/draft.ts`). Saving one of those fails the FK
  insert. This is accepted as near-zero risk: no live row, draft or attempt references either
  pseudo-region today.

### 6.4 Code and fixtures that move with it

- `reference-snapshot.json`: **hand-edit** the one row with id
  `ef4ebc71-aadf-4792-abae-300698f7b09f` from `California AVA` to `California`. The exporter is
  gitignored and absent, and a full re-export would pull in unrelated live drift. Then run
  `live-replay.test.ts` and the wine-identity suite.
- `scripts/add-appellation-designations.mjs`: its header is marked historical, and it refuses to
  run on `United States` rows, so a rerun cannot put the suffixes back.
- A wine-identity unit case, with no API call, for:
  - an Oregon Rocks District label from a Milton-Freewater producer;
  - an Oregon Columbia Gorge label from a Hood River producer.

  Both must resolve without "The appellation is not in the chosen region" after the cleanup, with
  producer links as set in §6.2 step 7.
- **Pre-image and reverse migration** (§16): `data/usa-reference/preimage-<version>.json` holds
  every touched row's id, name and region, and every referencing row's id with its before-state FK
  columns. It holds ids and FK columns only, no content. The reverse migration
  `…4747_usa_reference_cleanup_revert.sql` is written and `--dry`-rehearsed before the forward
  migration applies.

---

## 7. Registry changes on master (US-0)

These go in one small PR, merged before any US boundary exists live, so the friend can rebase
before their next tiles dispatch (§17). It is deployed as a **staged push** with a live smoke test
and a stated revert (§15 US-0).

| File | Change | Test |
|---|---|---|
| `scripts/wine-map-tiles/lib.mjs` `ATTRIBUTION` | `UCD_TTB_AVA`, `TTB_AVA_MAP` (§5.5) | `lib.test.mjs` `deepEqual(attributionDisplayMap(), …)` gains both keys |
| `scripts/wine-map-tiles/lib.mjs` (new pure fns) | `COVERAGE_BOXES` by country. `coverageBoxFor(countries)` returns the bbox of the union of those countries' boxes (for the header check). `featureOutsideCoverage(release)` returns every `release.expected` row whose label point lies outside its own country's box (country = first key segment). france/italy/spain/germany/portugal keep today's box (-18, 32, 19, 56), so nothing European tightens; `united-states` = (-125.5, 24, -66.5, 49.5). An unknown country throws. | `lib.test.mjs`: a Madeira shard passes; a US shard passes; a Paris label on a `united-states.*` key fails, **even in the world archive**; world with US + Europe passes the header check; an unknown country throws |
| `scripts/wine-map-tiles/validate.mjs` | uses both checks instead of `COVERAGE_BBOX`; `TODO(3E)` removed | the tiles run itself |
| `scripts/wine-map-tiles/lib.mjs` `tileProperties` (internal) + `export.mjs` | emit `outline: true` only when the current boundary's `generation_parameters->>'display' = 'outline'`; the property is absent otherwise, so every existing feature is byte-identical | `lib.test.mjs` through the exported `placeFeature`/`labelFeatures`. The existing `placeFeature` `deepEqual` keeps passing; a new case with `display: 'outline'` sees `outline: true` |
| `src/lib/wine-map/shard-specs.ts` `staticFillPaint` | the outline factor `["case", ["==", ["get","outline"], true], 0, 1]` multiplies the **`base` argument of each zoom stop inside `focus(...)`**, never the top-level expression. A zoom expression may only be the input of a top-level `interpolate`/`step`, so wrapping the whole `fill-opacity` would fail MapLibre validation. The `IS_SELECTED` branch keeps its selected opacity, so a selected outline-only place still shows its emphasis. | `shard-specs-static.test.ts`: the generated shard and world layer specs, for an outline and a non-outline feature, pass `validate` from `@maplibre/maplibre-gl-style-spec` (already installed with maplibre-gl; pinned as a devDependency if the import needs it). An A/B frame-time and hit-test measurement on the live build (CLAUDE.md "measure before believing it") includes that `queryRenderedFeatures` still returns an outline-only fill, so smallest-area click resolution picks Central Coast where no child covers the point |
| `src/lib/wine-map/map-palette.ts` | `LIGHT_REGIONS`/`DARK_REGIONS`: `united-states` = the fallback (the france = spain = portugal equality class), plus `california`, `washington`, `oregon`, `new-york`. Starting light values amber `#B0762E`, slate-blue `#2E6E8C`, plum `#6A3E8C`, green `#3E8C6A`. Dark values are derived by the §7.1 rule of `2026-09-19-map-dark-mode.md` and frozen as literals | `map-palette.test.ts`: 64 → 69 keys; `NEIGHBOURS` gains `["washington","oregon"]`, `["oregon","california"]`; contrast floors unchanged |
| `src/app/knowledge/map/tile-wine-map.tsx` `REGION_LABELS` | `"united-states": "United States"`, `california`, `washington`, `oregon`, `"new-york": "New York"` (the fallback would render "New-york") | — |
| map legend (the component that renders the classification block) | the "Classification" heading renders only when at least one of its rows does. US shards have two levels (`regional`, `subregional`), so `latchRampedRegions` ramps them, but no US row renders. The latch itself is unchanged, since changing it would change existing regions' fills | a render test with a ramped region carrying only `regional`/`subregional` |
| `src/lib/wine-map/country-chips.ts` `LOCAL_LANG` | `"united-states": "en"` | `country-chips.test.ts` |
| `src/lib/wine-map/localize-names.ts` | **no entry**: every US name is already English, and `englishName` falls through unchanged | — |
| `src/lib/wine-map/camera-fit.ts` + `tile-wine-map-explorer.tsx` | `countryCameraBox(bboxes, { keepAll })`; the explorer passes `keepAll` for countries in `CHIP_FIT_ALL_SHARDS = new Set(["united-states"])` and `minZoom: chipMinZoom(country)` (0 for them), and the map lands at `chipLandingZoom` (D26) | `camera-fit.test.ts`: West Coast shards + `new-york` with `keepAll` → the box spans California to New York; without it → `new-york` is dropped (pins why the option exists); Portugal/Madeira unchanged; the landed zoom of the lower-48 box stays the fitted one, below z5.5 and shard zoom, on a 375 px and a 1675 px canvas, while other countries keep the z5.5 floor |
| `src/lib/wine-map/shard-layer-specs.test.ts` `SHARD_COUNTRY` | the four US shards, added with the first release that has them (the map describes a release) | itself |
| `scripts/wine-map-sources/gen-place-profiles-migration.mjs` | `REPO = process.env.BLINDR_REPO ?? process.cwd()` (was hard-coded `C:/Users/Birchenz/blindtastingapp`), `--source <file>` (default: the old file) and `--bare` (no `begin;`/`commit;`; D24) | a dry run on both machines; agreed with the friend first (it is their script) |
| `.github/workflows/wine-map-tiles.yml` | the "Promote release" step passes this run's own version: `node scripts/wine-map-tiles/promote.mjs "$(node -p "require('./.tiles-build/release.json').version")"`. Today it passes none, so `promote.mjs` promotes the newest VALIDATED release, whoever built it | a dispatch with `promote=false` shows the computed version in the log; agreed with the friend |
| the owner's migration applier (`apply-migration.mjs`) | pre-flight: refuse a file with a top-level `begin`/`commit`/`rollback` statement outside a `$$` body (D24) | run against `20260916120000` (refused) and a US file (accepted) |

New pure modules with tests (US-0), each fixture-based with no network or database:

- `usa-tree.mjs`. Input: pairwise intersection areas, each AVA's land area per state, and any
  `state_override`. Output: map state, primary parent, `ALTERNATE_PARENT` and `OVERLAPS` edges.
  Cases:
  - Russian River Valley in three containers;
  - Los Carneros straddling Napa Valley and Sonoma Valley;
  - The Rocks District wholly in Oregon inside a Washington-dominant Walla Walla Valley;
  - a sliver below 1% (no edge);
  - a cross-state AVA with a 0.4% state share (no state edge);
  - an override.
- `usa-ava-diff.mjs` (§5.4). Cases: matched, TTB-only, UC-Davis-only, renamed-by-CFR-section.
- `fetch-ucd-ava.mjs`'s sha256 pinning: a mismatching body is refused; a URL with a branch name
  instead of a SHA is refused.
- The NE lower-48 filter. Alaska and Hawaii are out. In: the Great Lakes holes, Long Island, the
  San Juan Islands and the Channel Islands.

---

## 8. Catalog, boundary staging and promotion (per state wave)

### 8.1 Catalog migration `…4747_usa_<wave>_catalog.sql`

- Inserts the wave's places **DRAFT**, with kind, key, name, slug, tier, zooms, sort_order and the
  classification columns (§4, D4). US-2 also inserts the `united-states` COUNTRY row (DRAFT).
- Parents resolve by key. Count asserts per kind and per parent are fail-closed (Portugal: "count =
  38").
- The member list and every key come from the committed tree report (§8.3), which US-0 computed.
- DRAFT places are invisible to the app under "wine places verified read" and to `export.mjs`.
- It is a migration that writes `wine_places`, so it **ends with
  `select public.refresh_wine_place_neighbours()` checked `>= 0`**, in the same transaction
  (CLAUDE.md standing rule), and the cache is fresh again when it commits.

### 8.2 Build and stage: `scripts/wine-map-sources/stage-usa-ava.mjs`

Modelled on `stage-germany-weinbau.mjs`.

**Runs and order.**

- **The default is a rolled-back dry run**, which is also how US-0 computes the tree reports (§8.3).
  `--stage` commits.
- One transaction for the whole wave, never a per-place commit, so a release cannot catch half a
  wave (§17).
- `--stage` refuses to run unless all of these hold:
  - the wave's catalog and knowledge migrations are recorded in `schema_migrations`;
  - the owner's OK on the knowledge file is noted in the data file;
  - the recomputed tree equals the committed tree report.
- Its first step uploads the raw files (§5.2).
- It calls `attributionKeyFor('UCD_TTB_AVA')` first, so a missing registry entry fails here, not in
  the friend's next tiles run ("exactly how the Rheingau merge went red").

**What it writes.**

- Reads the normalized artifact (downloading it first if it lives in the bucket), and checks its
  sha256 against the pin.
- `wine_boundary_sources`: namespace `UCD_TTB_AVA`, `source_feature_id` = UC Davis `ava_id`,
  authority "UC Davis Library AVA Digitizing Project (after 27 CFR Part 9)", jurisdiction "United
  States".
- An immutable snapshot (§5.2).
- A **DRAFT, non-current** `wine_place_boundaries` row per place.

**Display geometry.**

- `ST_SimplifyPreserveTopology` at a tolerance chosen in US-0 (start at 0.0002°, ≈20 m, Germany's
  value), then `ST_MakeValid`, MultiPolygon, SRID 4326.
- `label_point` = `ST_PointOnSurface`, plus the bbox.
- `generation_parameters`: engine `ucd-ava-digitization`, tolerance, the CRS note (D10), and
  `display: 'outline'` for the D15 set.
- Central Valley's derived outline is produced by `derive-boundary.mjs` inside the same transaction,
  with `display: 'outline'`.

**Checks.** Each is a hard assert with the key in the message:

- The geometry is valid and non-empty.
- The label point is covered. This is the table's own `ST_Covers` check, asserted early for a
  readable error.
- Simplification area drift is < 15% against the unsimplified normalized shape (Germany's bound).
- D10's metre check passes.
- The bbox is inside a per-state WINDOW (California −124.6..−114.0 / 32.4..42.1, and so on,
  padded).
- **State containment is measured on land, and is water-aware.** For each AVA, the share is
  `area(AVA ∩ keyed-state outline, buffered 0.05°) / area(AVA ∩ union of all lower-48 state
  outlines, buffered 0.05°)`. It must be ≥ 99.5% unless the AVA is cross-state. For a cross-state
  AVA, the union of its states must reach ≥ 99.5%. "Cross-state" and "its states" mean its legal
  (TTB) states (D6), never the states the 1:50m line happens to measure.
  - Water inside an AVA (Puget Sound, San Francisco Bay, Long Island Sound, Lake Erie, the Finger
    Lakes) therefore counts toward neither side of the share.
  - The buffer absorbs 1:50m coastline generalization. It is check-only.
  - Each AVA's land share `area(AVA ∩ land) / area(AVA)` is reported. A land share below 50% is
    listed for review, not failed.
  - US-0 reports the measured shares for every AVA before the 99.5% threshold is fixed. If a real
    AVA falls below it, the threshold or the buffer is revisited then, with the numbers in the tree
    report.
- Every AVA is ≥ 99.5% inside its primary parent AVA. Nested AVAs are wholly contained in law; the
  0.5% absorbs digitizing slivers.

**States and the country.**

- They come from NE, via the same script's `--ne` step (the existing extractor pattern).
- `boundary_method = 'MANUAL'`, namespace `NATURAL_EARTH`.
- Country component filter: "outer ring fully inside lon [−125, −66.5], lat [24, 49.5]" (the lower
  48; Alaska and Hawaii are out).

**Ending.**

- The run ends with `warnIfNeighbourCacheStale`.
- A `--stage` commit writes `wine_place_boundaries`, so the statement-level trigger marks the cache
  stale even though the rows are DRAFT. The banner shows, and the promote's refresh, run in the same
  sitting, clears it.

### 8.3 Containment, map state, edges (computed in US-0, re-asserted at stage)

A read-only step (the stage script's dry run) computes, over the simplified normalized geometry,
the inputs to the pure `usa-tree.mjs`:

- **Map state** = the legal state holding the largest land share (D6), unless `state_override`
  says otherwise.
- **`within(a, b)`** = area(a ∩ b) ≥ 99.5% of area(a).
- **Primary parent** = the smallest-area AVA with `within` **that has the same map state**.
  Otherwise, the umbrella SUBREGION or navigation node the data file names. Otherwise, the state
  (D7).
- **`ALTERNATE_PARENT(a → b)`** for every other `within` container, whatever its state.
- **`ALTERNATE_PARENT(a → state)`** for every legal (TTB) state of a (D6), other than the map
  state, that holds ≥ 0.5% of a's land area. A measured share in any other state is a state-line
  artifact: withheld, listed for review, no edge.
- **`OVERLAPS(a, b)`**, stored once with `source` = the smaller place, when their intersection is
  > 1% of the smaller one's area and neither is `within` the other. Below 1% is digitizing noise and
  gets no edge.
- The UC Davis `within`/`contains` text is compared to the computed result. Every disagreement is
  listed in the report for review, and is never used to decide.

**Output.** The report is committed per state as `data/wine-map/usa-<state>-tree.json`. It holds
keys, parents, edges, land shares and dominance shares, and it is the review evidence for the
catalog migration and the promote.

**Breadcrumbs the owner accepts before the keys lock.** Two cases are called out, because keys lock
at the promote:

- Walla Walla Valley's state;
- The Rocks District's breadcrumb (expected "United States › Oregon › The Rocks District of
  Milton-Freewater").

Columbia Gorge's state is settled in US-1 (§6.2 step 6).

### 8.4 Promote migration `…4747_usa_<wave>_promote.sql`

It has the same asserts as `20260916120000`, but no transaction statements (D24). It re-asserts,
then flips:

1. **Pre-state.** Exactly the expected DRAFT boundaries exist for the wave's keys: one per place,
   all non-current.
2. **Domain invariants**, re-checked in SQL rather than trusted from the script:
   - validity;
   - label cover;
   - the state containment and parent containment of §8.2;
   - the edge set of §8.3, inserted and counted;
   - the `outline` set equals exactly D15's set, with its count asserted: SUBREGION/APPELLATION
     places whose source namespace is `UCD_TTB_AVA`/`TTB_AVA_MAP` and whose area is ≥ 5,000 km²,
     plus Central Valley. No COUNTRY or REGION place carries it.
3. **Coverage.** Every place being flipped has an article, and every COUNTRY/REGION/SUBREGION has
   ≥ 1 style, plus ≥ 1 grape link (a US rule, stricter than the generator's; §10.1). The knowledge
   has already landed (§15), and this is fail-closed, so no US place ever shows "Profile being
   curated".
4. **Flip.** Boundaries become `VALIDATED` + `is_current`; places become `VERIFIED`. In US-2, the
   country and the states flip in this same transaction (D12).
5. **Refresh.** `select public.refresh_wine_place_neighbours()` must return `>= 0`, else raise
   (§11).
6. **Post-state.** Counts per kind, per state and per system; no `united-states.*` DRAFT row left.

### 8.5 Overlap rules (summary)

- Never trim, and never use `DUAL_LABEL`.
- `ALTERNATE_PARENT` covers containment beyond the primary parent, plus extra states.
- `OVERLAPS` covers partial overlaps.
- Click resolution already picks the smallest overlapping shape (the `area` tile property), which
  is what makes nested AVAs clickable.

### 8.6 Edges are stored, not shown (yet)

`get_wine_place_context` returns only `dual_labels`, so the US edges will not appear in the details
panel. Showing "Also within: North Coast, Sonoma Coast" needs a new CTE in that function. By D21,
that waits for the friend's `20260925190000` to reach git (or is spliced from `pg_get_functiondef`
on live), and is a follow-up (§20). The tree still shows the primary chain.

### 8.7 Nearby chips on nested AVAs

`nearby_candidates` excludes only primary ancestors and primary-key descendants. So
`ALTERNATE_PARENT` containers (Sonoma Coast for Russian River Valley) and overlapping AVAs all score
distance 0, and can take the five slots in key order. D21 forbids changing the function here.

Instead, the acceptance for US-3 and US-4 prints the nearby list for about ten US keys (Russian
River Valley, Los Carneros, Oakville, Green Valley of Russian River Valley, Dundee Hills, The Rocks
District, Walla Walla Valley, Red Mountain, Seneca Lake, North Fork of Long Island), read-only as
`authenticated`, and the owner accepts them. If they read wrong, the function change goes to §20
(it needs the live function in git first).

---

## 9. Aliases (deferred)

The earlier draft stored the first live `wine_place_aliases` (Carneros, Santa Rita Hills, Mount
Veeder, SLO Coast…). They are **deferred** to §20, together with explorer search over aliases.
Reasons:

- The only reader, `shortlistGrapesForRegion`, considers aliases of region-kind places alone. US
  AVAs are APPELLATION places, so their aliases would have no reader at all.
- They would add an assert and a copy review for no visible gain.

When they come back, one rule carries over: an alias on a region-kind place must not fold equal to
any scoring region name, or a state's shortlist could be hijacked.

---

## 10. Knowledge content

### 10.1 What, where, by whom

- **Articles.** Every place gets an article: `description`, `climate`, `soils`, `key_facts[]`.
  AVA articles are short ("what distinguishes it, and why you would care", as Portugal's
  sub-regions), but each still meets the generator's floor:
  - `description`, `climate` and `soils` are each ≥ 40 characters;
  - `key_facts` has ≥ 3 entries.
- **Grapes and styles.**
  - The generator itself asserts styles and articles for REGION/SUBREGION, and styles for COUNTRY.
  - This spec adds a stricter US rule, asserted by the promote (§8.4 step 3): every
    COUNTRY/REGION/SUBREGION also has ≥ 1 grape link.
  - AVAs get grapes where the grape is the point (Napa Valley Cabernet Sauvignon, Willamette Pinot
    Noir, Finger Lakes Riesling, Lodi Zinfandel).
- **Authorship.** Written **in-session** from public sources: TTB/CFR text, state wine commissions,
  and UC Davis `boundary_description` for geography. Never by an API batch (AGENTS.md).
- **Storage and generation.** Stored in `data/wine-map/place-profiles-usa.json` (D20) and turned
  into `…4747_usa_<wave>_knowledge.sql` by `gen-place-profiles-migration.mjs --source
  data/wine-map/place-profiles-usa.json --bare --write --version … --name …`.
- **Checked:** the generator only requires the key to exist. So the knowledge migration applies
  right after the catalog migration, while the places are still DRAFT and before any boundary is
  staged. The promote then asserts full coverage.
- **New grapes.** Petite Sirah, Zinfandel if missing, and Concord only if the owner wants a
  labrusca listed. They go in `new_grapes` with colour and description, which the generator already
  supports.
- Content-only migrations need no tiles run (`export.mjs` reads only places and boundaries), and
  write no `wine_places` row.

### 10.2 Editorial status

The generator writes `PUBLISHED` (articles, grapes, styles). The read policies admit only
`PUBLISHED` (grapes, styles) or `PLACEHOLDER`/`PUBLISHED` (articles). Hence D19: the owner reviews
the file before it applies (§18), not in the app. Because the places are DRAFT until the promote,
published content is still invisible in the app until then.

### 10.3 Side effect on the grape shortlist (checked)

`shortlistGrapesForRegion` matches the scoring regions "California", "Washington", "Oregon" and
"New York" to the REGION place of the same name. It lists grapes linked to that place **and every
descendant**, and falls back to `region_grapes` only when that set is empty.

So from US-2 on, "Common grapes in California" comes from the map on three surfaces:

- the guess ladder (`play/guess-ladder.tsx`, `play/play-experience.tsx`);
- the answer-key by-hand form (`src/components/add-wine/by-hand-form.tsx`).

The comparison runs at US-2, and again after US-3 and US-4, because the descendant union changes
with every wave. Each time, it prints each of the four states' shortlist before and after (as the
viewer, read-only), for both surfaces, and the owner accepts the difference. The state-level grape
lists are written with that use in mind: the principal varieties a blind taster would reach for,
ordered.

---

## 11. Neighbour cache

- Every catalog and promote migration ends with `select public.refresh_wine_place_neighbours();` in
  the same transaction, and raises on a negative return (CLAUDE.md standing rule).
- Stage runs end with the banner. A stage run that is abandoned (not promoted) is rolled back per
  §16, ending with `node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs`.
- The refresh costs ~65 s (~135 s inside a migration) at 3.3k places, and holds the state row the
  whole time (`20260920090000` comments; a `lock_timeout 10s` migration aborts behind it).
  - US-2's rolled-back rehearsal times it with the US places present.
  - If it passes 300 s, stop and revisit before applying: the large AVA outlines are the new cost.
- A refresh runs only after both people's batches are quiet (§17).

---

## 12. Boundary expectations

- After each promote, run `generate-boundary-expectations.mjs`, and commit **only the
  `united-states.*` hunk** of `data/wine-map/boundary-expectations.json`. The file is sorted by
  `canonical_key`, so the hunk is contiguous.
- If the diff contains other countries' rows, they are the friend's live-but-unpinned boundaries:
  leave them out and tell the friend.
- Proposal for the friend (not a precondition): split the file per country
  (`boundary-expectations/<country>.json`). That is a small change to the generator and to
  `boundary-expectations.test.mjs`, and it removes the shared-file conflicts.
- While DRAFT US boundaries exist, the Checks workflow's map-data job is red for everyone
  (`assert.equal(b.validated, b.total, 'every boundary must be VALIDATED')`), and so is
  `wine-place-context.test.mjs` (stale cache). This is why `--stage` and the promote happen in one
  announced sitting, with no owner review inside it (§15).

---

## 13. Tiles, shards and zoom tiers

**13.1 Archives.**

- `world.pmtiles` gains the US country and the four states (tier ≤ 1; z0–7).
- Each state is its own shard (`california`, `washington`, `oregon`, `new-york`), from z4 to
  `ceil(max label_min_zoom) + 2` ≤ 12 (D16).
- The manifest stays at `schema_version: 2`. The client has no country or shard allow-list and no
  hard-coded bounds (checked: no `maxBounds` in the map code), so no client change is needed to load
  them.

**13.2 Size targets** (acceptance): california ≤ 3 MB; the other three ≤ 1.5 MB each; world
≤ 400 KB (281 KB today). If a target is exceeded, raise the simplification tolerance for the largest
shapes and re-run the drift check; this is not a code change.

**13.3 Outlines** (D15, §7). Places with `outline: true` draw their line only: AVA places of
5,000 km² or more, and Central Valley. The country and the states keep the normal tier-0/1 wash.
Every other AVA fills by tier as elsewhere, Long Island included.

**13.4 Release.**

- Dispatch "Wine Map Tiles" from master with `promote=true` (≈4 min). Master must already carry §7,
  including the promote step that passes its own version. So `promote=true` promotes exactly the
  release this run published, never a newer one someone else built.
- The one-captain rule (§17) still applies.
- `validate.mjs` then checks each archive's header against its countries' union box, and every
  feature against its own country's box.
- Verify on the live map (§15 US-2's phone and desktop list) and through
  `get_wine_place_context('united-states.california')` (article, grapes, styles, children).

**13.5 Camera.** The initial view stays France-centred (`initialViewState` 2.4 / 46.6 / z4.4). The
"United States" chip flies to the box of all four state shards (D26), not to the outlier-filtered
box.

---

## 14. Linking the US typical wines

**14.1 Today.** 3 US archetypes, `wine_place_id` null, 0 placements. Convention (checked): every
home place also has a placement row (84 of 84).

**14.2 Links.**

- One data migration per step: `…4747_usa_archetype_links_<n>.sql`.
- Archetypes are matched by name **and** live id, both asserted. Places are matched by key.
- Placements touch no `wine_places` row, so no neighbour refresh is needed.
- No transaction statements (D24).

| Archetype | US-2 home (+ placements) | US-3/US-4 home (+ placements) |
|---|---|---|
| A typical Napa Cabernet Sauvignon | north-coast (+ california) | napa-valley (+ north-coast, california) |
| A typical Sonoma Chardonnay | north-coast (+ california) | sonoma-coast (+ russian-river-valley, north-coast, california) |
| A typical Willamette Pinot Noir | willamette-valley (+ oregon) | unchanged |

`sort_order` is the next free value at each place. The archetypes' scoring FKs (`Napa Valley AVA`,
`Sonoma Coast AVA`, `Willamette Valley AVA`) are real AVAs and do not change in US-1.

**14.3 Effect.**

- The map's "Typical wine" list (`fetchArchetypesForPlace`, placements) shows them on those places.
- The training room's candidates get a non-null `placeCanonicalKey` (`readTrainingPool` reads
  `wine_place_id`).
- 3 of the room's 18 unplaced typical wines become placed. Curated display points for the other 15
  belong to brief B.
- More US typical wines (a Washington Cabernet, a Finger Lakes Riesling) are the owner's later call.

**14.4 Brief B's links ship first.**

- Brief B's Option 0 (the room's "See it on the map" / "Not on the map yet" and the map's links
  back to the room) needs no US place. It ships now, independent of and before US-2, from the next
  spec.
- Until US-2's archetype link step, the three US wines read "Not on the map yet". After it, they
  link to north-coast / willamette-valley; after US-3, to their AVAs. No change to brief B's code is
  needed for that, because the key comes from the data.

---

## 15. Phases, order and acceptance checks

**Order within every wave (US-2 … US-5):**

1. Tree report (committed).
2. Catalog migration: DRAFT places, with refresh.
3. Knowledge review file to the owner. **Wait for the OK.**
4. Knowledge migration applied.
5. **One announced sitting:**
   1. confirm the friend is quiet;
   2. `--stage`;
   3. promote (with refresh);
   4. expectations hunk;
   5. tiles release.
6. Archetype links, if the wave has any.

The DRAFT-boundary window is therefore minutes, not days, and never holds an owner review.

**US-0: registry and preparation (no live write, Storage included).**

- **Work:**
  - the §7 PR and the new pure modules with their tests;
  - `fetch-ucd-ava.mjs` (local only), the NE extraction and the §5.4 diff;
  - dominance, land-share and containment computation (dry run), and the four tree reports;
  - the §6.2 table drafted, and the pre-image;
  - ask the friend the §17 questions;
  - send the owner the US-1 copy list (§18).
- **Deploy:** a staged push of the §7 PR. Smoke test the live map on desktop and iPhone: France,
  Bourgogne, Germany, Portugal (including Madeira) and Italy fills; selection and fade on a few
  places; the country chips; dark mode. **Revert:** `git revert` of the merge and push. The revert
  is safe until the first US boundary is VALIDATED live. From US-2's promote on, US-0 is one-way,
  because reverting it would fail every release on the unknown namespace and the coverage boxes.
- **Acceptance:**
  - `tsc`, eslint, vitest and `node --test scripts/wine-map-tiles/lib.test.mjs` are green, including
    the style-spec validation test;
  - a local `export.mjs` against live (read-only) produces byte-identical GeoJSON for every existing
    archive (proving the `outline` property is absent everywhere today);
  - the outline A/B measurement shows no frame-time or hit-test regression;
  - the smoke list above passes;
  - the diff lists every TTB AVA of the four states as matched, TTB-only or explained;
  - the four raw files' sha256 are recorded;
  - the tree reports list every AVA's map state, land share and parent, with the Walla Walla Valley
    and Rocks District breadcrumbs and the Columbia Gorge question put to the owner.

**US-1: scoring-reference cleanup.**

- **Gate:** the owner has answered the Columbia Gorge question (§6.2 step 6) and accepted the
  visible renames (§18).
- **Work:** the §6 migration, its reverse, the pre-image, the fixture hand-edit, the script guard,
  the producer state list and the wine-identity unit cases.
- **Acceptance:**
  - `--dry` rehearsals of the forward and the reverse migration pass all asserts;
  - applied live at a quiet hour, with same-transaction asserts;
  - post-apply read-only checks:
    - 26 US regions;
    - no US state or county row ending " AVA";
    - the §3 reference table still resolves (5 catalog wines, 2 answer keys, 4 guesses,
      3 archetypes) with the same ids and stored points;
    - each affected user's total points, `getProfileStats` output and the affected tastings'
      leaderboard are identical before and after;
  - `live-replay.test.ts` and the wine-identity suite are green;
  - in the app:
    - the region picker no longer lists "Walla Walla Valley" or "Columbia Gorge";
    - the by-hand form offers "Just the region" for California, Oregon, Washington and New York;
    - the Phelps Creek record page renders with the state the owner chose;
    - one add-wine save and one guess on a Washington AVA succeed.

**US-2: country, four states, umbrella AVAs, Central Valley.**

- **Gate:** the friend's working branch contains the US-0 merge (a hard gate: a dispatch from a
  branch without it fails on the namespace **and** on the old `COVERAGE_BBOX` once US places are
  VERIFIED).
- **Work:** as the wave order above, then archetype links step 1.
- **Acceptance:**
  - the promote asserts pass;
  - `wine_place_neighbours_state.fresh = true` afterwards, and the refresh is timed under 300 s;
  - `scripts/wine-place-context.test.mjs` is green;
  - `boundary-expectations.test.mjs` is green on master;
  - the tiles run is green, with 4 new shards within the §13.2 targets;
  - `get_wine_place_context` for `united-states` and each state returns an article, grapes and
    styles;
  - the §10.3 shortlist comparison (guess ladder and by-hand form) is accepted by the owner;
  - the three typical wines are listed on north-coast / willamette-valley.
- **On the map (desktop, iPhone Chrome and iPhone Safari):**
  - the "United States" chip is reachable in the chip row and frames California to New York;
  - the states are coloured, including in dark mode;
  - the umbrella AVAs and Central Valley draw as outlines;
  - Central Valley's article says it is a grouping;
  - the legend shows no empty "Classification" heading;
  - the california shard (≤ 3 MB) loads on a throttled 4G profile;
  - tapping open Central Coast land selects Central Coast;
  - the North Coast and Central Coast child pill lists are usable at 375 px;
  - long names and breadcrumbs wrap or truncate cleanly at 375 px.

**US-3: California AVAs (two batches: core, then the rest).**

- **Core batch:**
  - **Napa Valley** and its 17 sub-AVAs (the research list). Los Carneros is placed by the computed
    rule. It straddles Napa Valley and Sonoma Valley, so it is ≥ 99.5% inside neither: expect
    primary parent North Coast, with `OVERLAPS` to Napa Valley and Sonoma Valley (and whatever else
    the geometry finds, e.g. Sonoma Coast). The tree report decides.
  - **Sonoma:** Northern Sonoma, Russian River Valley and Green Valley, Chalk Hill, Sonoma Coast,
    West Sonoma Coast, Fort Ross-Seaview, Petaluma Gap, Dry Creek Valley, Alexander Valley, Knights
    Valley, Rockpile, Sonoma Valley, Moon Mountain District, Sonoma Mountain, Bennett Valley,
    Fountaingrove District, Pine Mountain-Cloverdale Peak.
  - **Mendocino and Lake:** Mendocino, Anderson Valley, Mendocino Ridge; Red Hills Lake County.
  - **Bay Area:** Santa Cruz Mountains; Livermore Valley.
  - **Monterey:** Monterey, Santa Lucia Highlands, Chalone, Arroyo Seco, Carmel Valley, Mt. Harlan.
  - **San Luis Obispo:** Paso Robles and its 11 districts; Edna Valley, Arroyo Grande Valley, San
    Luis Obispo Coast.
  - **Santa Barbara:** Santa Maria Valley, Santa Ynez Valley, Sta. Rita Hills, Ballard Canyon,
    Happy Canyon of Santa Barbara, Los Olivos District, Alisos Canyon.
  - **Central Valley:** Lodi and its 7.
  - **Sierra Foothills:** El Dorado, Fair Play, California Shenandoah Valley, Fiddletown.
  - **South Coast:** Temecula Valley.
- **Rest batch:** every remaining California AVA from the diff.
- **Acceptance per batch:**
  - the tree report is reviewed (containment, edges, and the `within` disagreements explained);
  - the promote asserts pass, and every place has an article;
  - the california shard is within target;
  - clicking Oakville selects Oakville, not Napa Valley or North Coast;
  - Cole Ranch (≈0.6 km²) and Oakville are selectable by tap at phone zoom;
  - Russian River Valley shows North Coast › Northern Sonoma in its breadcrumb, and has
    `ALTERNATE_PARENT` rows to Sonoma Coast (and whatever else the geometry finds);
  - long names wrap cleanly at 375 px: "… › Russian River Valley › Green Valley of Russian River
    Valley", "Antelope Valley of the California High Desert";
  - the §8.7 nearby lists are accepted;
  - the §10.3 comparison is repeated;
  - archetype links step 2 is applied.

**US-4: Washington, Oregon, New York AVAs.**

- **Work:** the three states' AVAs, in one wave or three, with placement per D6/D7 and the US-0
  table (the owner has already accepted the Walla Walla Valley and Rocks District breadcrumbs, §8.3).
- **Acceptance:** as US-3, plus:
  - each cross-state AVA has exactly one place, keyed under its map state, and the expected state
    edges;
  - The Rocks District is keyed under Oregon, lies ≥ 99.5% in Oregon, and has `ALTERNATE_PARENT` to
    Walla Walla Valley if that is keyed elsewhere;
  - no Idaho-dominant AVA was created;
  - Finger Lakes contains Seneca Lake and Cayuga Lake;
  - Long Island contains North Fork of Long Island and The Hamptons, Long Island;
  - "Mt. Pisgah, Polk County, Oregon" wraps cleanly at 375 px;
  - the §8.7 and §10.3 checks are repeated.

**US-5: 2026 AVAs missing from UC Davis.**

- **Work:** for each TTB-only AVA of the four states (Columbia Hills is known):
  - fetch its TTB shapefile;
  - normalize it;
  - catalog, knowledge, stage under `TTB_AVA_MAP`, and promote, in the wave order.

  Then re-run the diff against the newest UC Davis commit and the TTB list, and record the next
  check date in the data file.
- **Acceptance:** the diff shows no TTB-only AVA for the four states; `validate.mjs` is green; the
  TTB field schema is documented in the fetch script header.

---

## 16. Rollback

- **US-0.**
  - Before US-2's promote: `git revert` of the merge, pushed as a staged deploy.
  - From US-2's promote on: one-way (§15). Any fix is a forward commit.
- **US-1.**
  - The committed pre-image and the `--dry`-rehearsed reverse migration are the rollback.
  - The reverse migration:
    - renames by id;
    - re-creates each merged loser **with its original id**;
    - re-points the references listed in the pre-image back;
    - re-creates the two pseudo-regions with their original ids, and restores producer links and
      `region_grapes`.
  - Without the pre-image, merges would be irreversible, so US-1 does not apply until both exist.
- **A wave before its promote** (catalog applied, maybe knowledge, maybe staged). One migration:
  - deletes the wave's DRAFT boundaries and snapshots, their knowledge rows and the DRAFT places
    (keys are not locked yet);
  - ends with the neighbour refresh.
- **A wave after its promote.** Keys are locked for good: `lock_verified_wine_place_canonical_key`
  keeps the lock even if a place is later un-verified. So always roll forward, with a migration
  that:
  1. re-points the archetype links first;
  2. flips the places to DRAFT and the boundaries to non-current;
  3. ends with the refresh.

  Then a new tiles release. **Never roll back the manifest:** that removes the friend's newer places
  (§17).

---

## 17. Collaboration with the friend's Germany work

The friend (GitHub Birchenz) wrote every German map commit and ran most tile releases. Nothing is in
flight on GitHub or live today (§3). Rules:

1. **Their live-only migration first.**
   - `20260925190000_wine_place_context_inherited_profile` is recorded live and is in no branch. Ask
     them to push it (and the app code behind it) now.
   - Until it is in git, nobody recreates `get_wine_place_context` or another shared map function
     from a repo file. Any such change is spliced from `pg_get_functiondef` on live.
   - This spec needs no such change (D21).
2. **Registry on master first, both ways.**
   - §7 merges before any `UCD_TTB_AVA` boundary is VALIDATED live.
   - The friend's **working branch must contain the US-0 merge before US-2's `--stage`**. This is a
     hard gate, not a promise. Once US places are VERIFIED, a dispatch from a branch without it
     fails twice:
     - `attributionKeyFor` throws "Unknown source namespace" (it happened: `3f39f37`);
     - the old `COVERAGE_BBOX` rejects the US archives.
   - The same applies to any new German namespace in the other direction.
   - The friend often dispatches from feature branches, which run that branch's `lib.mjs` against
     the shared database.
3. **One release captain at a time.**
   - Every release exports the whole VERIFIED catalogue and rebuilds every shard.
   - Before dispatching: send a message, and confirm the other has no batch mid-commit
     (`build-germany-einzellagen.mjs` commits one place at a time, VERIFIED + VALIDATED).
   - Dispatch from master with `promote=true`. After US-0, that promotes the run's own version.
   - Never run `promote.mjs` by hand without a version (it promotes the newest VALIDATED release,
     whoever built it).
   - Never roll back without asking: a rollback removes the other person's newer places.
4. **Short, announced DRAFT windows** (§15's single sitting). Staged DRAFT boundaries turn master's
   map-data guard red for both people.
5. **One neighbour refresh, after both batches are quiet.** A refresh blocks the other's catalogue
   writes and aborts a `lock_timeout 10s` migration.
6. **Files.**
   - A distinct migration suffix (D23), and a separate `place-profiles-usa.json` (D20).
   - The generator's `REPO`/`--source`/`--bare` change and the workflow's promote-version change
     are agreed with them first.
   - `boundary-expectations.json`: commit only your own country's hunk.
   - Palette, label and attribution lists are append-only edits. Rebase before every merge, since
     merging to master deploys to production for both.

---

## 18. Owner copy and decisions

**What goes to the owner, and when:**

| When | What |
|---|---|
| US-0 | The US-1 visible renames that tasters see in the guess ladder and on past records: "Napa County AVA" → "Napa County" (and the other county renames); "SLO Coast AVA" merged into "San Luis Obispo Coast AVA"; "The Hamptons, Long Island AVA"; the other legal-name corrections. The Columbia Gorge question (§6.2 step 6). The Walla Walla Valley and Rocks District breadcrumbs (§8.3). The attribution strings (§5.5). The chip label "United States". |
| each wave, before its knowledge migration | The wave's review file (below), including Central Valley's article (US-2), which must say it is a grouping on this map, not an AVA. |
| US-2, US-3, US-4 | The §10.3 shortlist comparison; the §8.7 nearby lists (US-3, US-4). |

**Review file format.** `data/wine-map/review/usa-<wave>-<n>.md`, generated from
`place-profiles-usa.json`:

- One section per place, in tree order. Each section gives the breadcrumb, the name, the key, and
  the four article fields; key facts as a list; grapes (ordered, with any `share_pct`) and styles.
- At most **40 places per file**. US-2 is one file of about 15 places; California's core batch is
  about 3 files.
- The owner answers "OK", or gives line-level corrections quoting the section.
- The knowledge migration applies only after every file of the wave is OK'd. Corrections later are
  ordinary update migrations.
- Nothing is staged while a file is out for review (§15), so review time never holds a DRAFT window
  open.

**Copy rules.**

- Plain English, no hype and no praise words.
- Facts the sources support.
- "Generalized digitization", never "official boundary".
- Figures only where published (the `share_pct` rule in `place-profiles.json`: "a bar drawn from a
  guess is worse than none").

---

## 19. Risks

- **UC Davis lags TTB** (last state-file commit 2025-12-03; Columbia Hills missing). Mitigated by
  the diff (§5.4) and US-5; the data file records when it was last checked.
- **Mislabelling digitized outlines as legal boundaries.** Mitigated by D9, the attribution text,
  and the engine name.
- **Cross-state placement is permanent** (keys lock). Mitigated by D6/D7's computed rule, the owner
  accepting the two named breadcrumbs, and overrides only by the owner.
- **Re-labelling a real wine's state.** Mitigated by §6.2 step 6 and §6.3: a stop for the owner,
  never silent.
- **Label-reader regressions** from producer re-links. Mitigated by producer links by actual state,
  and the §6.4 unit cases.
- **Mega-AVAs blanket the map.** Mitigated by D15 outlines. If the owner still finds them heavy,
  raise the threshold, not the code.
- **California becomes a large shard.** Mitigated by the D16 zoom cap and the §13.2 targets.
- **Coastline mismatch** between NE 1:50m state outlines and USGS-traced AVAs: an AVA edge may sit a
  little outside the state fill at the coast at high zoom. Cosmetic; the containment check is
  land-based and buffered.
- **The state containment threshold may not fit a real AVA.** Measured in US-0 before it is fixed
  (§8.2).
- **Grape shortlist changes** for four states, on two surfaces, at every wave (§10.3).
- **The neighbour refresh grows** with large outlines. Timed in the US-2 rehearsal, with a 300 s
  stop.
- **Nearby chips crowded by containers** (§8.7). Accepted by the owner or deferred.
- **Reference renames touch FK targets.** Covered by §6.3; ids never change, no guess moves, and a
  rehearsed reverse migration exists.
- **Collaboration:** a mid-batch release, an unknown namespace, an old coverage box, a stale
  function recreate, a rollback. Covered by §17.
- **Edges are invisible in the panel** until the context function is extended (§8.6).
- **WSET naming came from secondary sources.** It only orders the US-3 core batch, not what is
  mapped.

---

## 20. Residuals and later

- Tier-2 states (VA, TX, MI, ID), which also settle Snake River Valley, Lewis-Clark Valley and (if
  Ohio-dominant) Lake Erie.
- Showing `ALTERNATE_PARENT`/`OVERLAPS` in the details panel, and excluding containers from nearby
  chips (both need the live function in git).
- Aliases, together with explorer search over `wine_place_aliases` (§9).
- `APPELLATION_SYNONYMS` for US label spellings (Carneros → Los Carneros AVA, Santa Rita Hills →
  Sta. Rita Hills AVA, Mount Veeder → Mt. Veeder AVA, Mount Harlan → Mt. Harlan AVA, SLO Coast → San
  Luis Obispo Coast AVA). They change the label reader's input, so they need the owner's explicit
  OK and their own replay cases.
- `map_status` review of US scoring rows (owner decision; they stay PENDING).
- More US typical wines.
- Brief B beyond Option 0 (the on-demand likelihood map, training room only, with curated display
  points for the still-unplaced typical wines) is in the next document, not here.

## 21. Rejected

- **One inline-geometry migration per state** (Portugal's pattern): megabytes of SQL, and no
  dry-run checks against live before commit.
- **Counties as a navigation layer**: it cuts across AVAs and needs edges everywhere (D5).
- **Trusting UC Davis `within`/`contains`**: shown wrong for Russian River Valley.
- **Trimming overlaps, or `DUAL_LABEL`, for US AVAs**: overlap is lawful there (D8).
- **Widening the single coverage box to −125**: it stops catching a stray European shard (D17).
- **"Containment wins over dominant state"** for keys (feasibility review item 7's first fix): it
  would key a wholly-Oregon AVA under Washington (§22).
- **A per-state row for each cross-state AVA in the scoring tables**: considered, since a Columbia
  Gorge wine from Oregon is honestly "Oregon". But it would make the map and the scoring tables
  disagree. D14 keeps one row, and §6.2 step 6 plus the override keep real records honest.
- **US Census cartographic boundaries** for states: better coasts, but not in the approved
  downloads; NE is enough at state zoom.

---

## 22. Review notes (2026-09-29)

Two reviews of the first draft, a feasibility review (F) and a completeness review (C). Each point
was verified before it was accepted.

**Verified:**

- **Code:** `gen-place-profiles-migration.mjs` lines 176/275; the applier's own `begin`/`rollback`;
  `REGION_KINDS` and the three callers of `shortlistGrapesForRegion`; `wine-map-tiles.yml`
  promoting with no version; `export.mjs`'s `group_name` from exported rows only;
  `staticFillPaint`'s top-level zoom `interpolate`; the `COVERAGE_BBOX` header check and
  `release.expected`'s label points; `nearby_candidates`' exclusions; `latchRampedRegions`; the
  missing snapshot exporter; the two existing `4500` migrations.
- **Live:** read-only in `usa-rev-ro1.mjs` in the scratchpad: Ohio's Lake Erie row; `label_lookups`'
  id columns (0 US rows); 0 `wine_identity_drafts` naming a US id; `catalog_wines_identity_key`'s
  columns; the Phelps Creek (Oregon) catalog wine and answer key; the 45 Walla Walla producers; all
  cross-state row ids; no `4747` version live.

**F1 (a `--dry` run of a generated file commits): accepted, with one change.**

- Fixed by D24, the applier pre-flight, and no transaction statements anywhere.
- The generator gets a `--bare` flag rather than dropping `begin;`/`commit;` from its default. The
  script is the friend's, and their current apply path may rely on the file being atomic on its
  own. Every US run passes `--bare`, so the risk is removed for this work without changing theirs.

**Accepted as proposed, or with the proposed option chosen:**

- **F2:** D15's set, and §13.3's wording.
- **F3:** §6.2 step 5, and the extra check-only states in §5.3.
- **F4:** the rename throughout, and the by-hand form in §10.3.
- **F5:** §6.1's reason is now D14; the alias rule is limited to region-kind places, and aliases
  are deferred.
- **F6:** US-3's Los Carneros sentence.
- **F8:** the fixture hand-edit.
- **F9:** the workflow passes the run's own version.
- **F10:** the Storage upload moved to the US-2 stage run.
- **F11:** the §15 order.
- **F12:** a water-aware, land-based share, with measured shares reported in US-0.
- **F13:** live mode vs replay mode.
- **F14:** `label_lookups`, the identity-key assert and the audit-row note.
- **F15:** §10.1.
- **F16:** Central Valley gets a derived outline (D25).
- **F17:** D10 in metres, factor 5.
- **F18:** the legend heading fix in §7.
- **F19:** the suffix is `4747` (unused, checked); the §5.3 download before the sha check; D17's
  wording; tests through `placeFeature`/`labelFeatures`.

**F7 (The Rocks District): partly rejected.**

- Its state-edge definition is adopted: every state other than the map state holding ≥ 0.5%.
- Its first fix, "containment wins over dominant state", is rejected in favour of C2's rule: the
  map state is the AVA's own dominant state, and the primary parent is the smallest container in
  that state. Reason: containment-wins keys a wholly-Oregon AVA only under Washington, forever,
  contradicts its Oregon scoring row, and hides it from Oregon's tree.
- Under C2, Oregon's shortlist still includes it, since it is an Oregon descendant.

**C1–C19: accepted.**

- C1: §15's order.
- C2: D6/D7.
- C3: §7's per-stop factor, and the style-spec test.
- C4: D17.
- C5: §6.3.
- C6: §6.2 steps 6–7, and §6.4's unit cases.
- C7: §16.
- C8: §14.4, and the next document named.
- C9: US-2/US-3/US-4's phone checks.
- C10: the chip fits all four shards (D26); chosen over asking the owner to accept a West-Coast-only
  frame.
- C11: §8.7.
- C12: §17.2's hard gate.
- C13: §18.
- C14: §7's new modules and tests, US-1's acceptance, and §10.3 repeated per wave.
- C15: US-0's staged push, smoke list and revert.
- C16: synonyms moved to §20.
- C17: aliases deferred (§9).
- C18: Contra Costa (§6.2 steps 2 and 8).
- C19: archetype ids asserted (D22).

## 23. Sources read for this spec

- **Research:** `usa-briefs.md`; `usa-understand.json` (pipeline, usa, room, collab); the
  feasibility and completeness reviews of the first draft.
- **Tile scripts:**
  - `scripts/wine-map-tiles/lib.mjs` (`shardKeyFor`, `archiveForPlace`,
    `assertMultiCountryArchive`, `ATTRIBUTION`, `attributionKeyFor`, `tileProperties`,
    `placeFeature`, `labelFeatures`);
  - `export.mjs`, `validate.mjs`, `promote.mjs`, `publish.mjs`, `lib.test.mjs`;
  - `scripts/wine-map-tiles/extract-portugal-ne.mjs`;
  - `.github/workflows/wine-map-tiles.yml`.
- **Source scripts:** `scripts/wine-map-sources/stage-germany-weinbau.mjs`,
  `gen-place-profiles-migration.mjs`, `derive-boundary.mjs`, `boundary-expectations.test.mjs`,
  `generate-boundary-expectations.mjs`.
- **Map code:**
  - `src/lib/wine-map/map-palette.ts` (+ test);
  - `shard-specs.ts` (`staticFillPaint`);
  - `fill-palette.ts` (`latchRampedRegions`);
  - `camera-fit.ts` (`countryCameraBox`, `bboxesForCountry`, `OUTLIER_FACTOR`);
  - `country-chips.ts`, `localize-names.ts`, `shard-layer-specs.test.ts`;
  - `src/app/knowledge/map/tile-wine-map.tsx` (`REGION_LABELS`, `initialViewState`) and
    `tile-wine-map-explorer.tsx`.
- **Other app code:** `src/lib/grape-shortlist.ts`; `src/lib/wine-identity/fold.ts`,
  `server/write.ts`, `types.ts`; `src/components/add-wine/self-named-appellation.ts`,
  `by-hand-form.tsx`; `src/lib/label-scan/region-canonical.ts`; `src/lib/training/draft.ts`;
  `src/lib/wine-identity/__fixtures__/reference-snapshot.json`.
- **Migrations:** `20260727090000`, `20260801090000`, `20260808090000`, `20260903120000`,
  `20260913120000`, `20260914114217`, `20260916120000`, `20260920090000`.
- **Live read-only queries** on 2026-09-29 (scratchpad `usa-spec-ro*.mjs`, `usa-feas-ro*.mjs`,
  `usa-rev-ro1.mjs`).
- **GitHub API metadata** for UCDavisLibrary/ava and nvkelso/natural-earth-vector.
