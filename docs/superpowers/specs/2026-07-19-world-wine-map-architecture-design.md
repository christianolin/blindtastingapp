# World Wine Map Architecture Design

## Goal

Turn `/knowledge/map` into a scalable, explorable world wine map. Users should
be able to move from countries to broad regions such as Bordeaux, then reveal
subregions, appellations, and sites by zooming or clicking. The map should
eventually cover every verified geographic wine place represented by the
application's reference data, without treating every raw database row as a
trustworthy place.

## Approved Product Decisions

- Display verified geographic wine places, not every raw reference row.
- Reveal finer places through both map zoom and explicit clicks.
- Show verified places before their learning articles are complete, with a
  clear editorial placeholder.
- Geographic boundaries are public and CDN-cacheable while the Knowledge UI
  remains authenticated.
- Merge nearby parcel fragments into readable cartographic footprints, but keep
  genuinely distant geographic components as one `MultiPolygon` feature.
- Use a dedicated label point so each place receives one label regardless of
  polygon component count.
- Use a canonical catalog plus prebuilt vector tiles rather than loading all
  GeoJSON through Next.js or generating tiles per request.

## Current State And Constraints

The live database currently contains:

- 46 countries;
- 379 regions;
- 3,636 appellation rows;
- 14 `wine_map_nodes` rows.

The reference tables are scoring lookup tables, not a canonical geographic
catalog. Appellation rows include official appellations, LWIN sites promoted to
appellations, synthetic region fallbacks, user-created values, duplicates, and
known artifacts. Bourgogne alone has 1,363 appellation rows. Existing scoring
UUIDs must remain stable.

The current map fetches every `wine_map_nodes` row with `.select("*")`, sends
all editorial fields and GeoJSON through the React Server Component payload,
and builds the complete tree in the browser. This is safe for 14 rows but would
be truncated by the configured 1,000-row Data API limit and would make world
geometry payloads, labels, and client-side GeoJSON processing unbounded.

The current Bordeaux boundary generator is a useful cartographic prototype,
but its source paths, slug allowlist, thresholds, and SQL rendering are specific
to 13 nearby Bordeaux geometries. The original WFS acquisition and dissolve
script is not retained, so worldwide acquisition must be rebuilt as a
reproducible source-adapter pipeline.

## Scope

This architecture covers:

- canonical place identity and hierarchy;
- reviewed links from scoring references;
- source provenance and boundary generalization;
- immutable vector-tile publication;
- zoom/click navigation and on-demand learning content;
- staged rollout from Bordeaux to worldwide coverage.

It does not:

- change scoring IDs or scoring behavior;
- automatically publish every existing reference row;
- require complete editorial articles before geographic publication;
- provide real-time in-browser geometry editing;
- claim that generalized map footprints are legal boundaries;
- connect truly distant islands with artificial land or ocean-spanning hulls.

## System Architecture

The system has four bounded responsibilities:

1. **Canonical catalog:** identifies verified wine places and their primary
   learning hierarchy.
2. **Curation pipeline:** reconciles reference rows and authoritative boundary
   sources into reviewed place records.
3. **Tile publisher:** converts approved boundaries into immutable world and
   country PMTiles artifacts.
4. **Map application:** renders visible tiles and loads only the selected
   place's context and article.

Supabase remains the source of truth for place identity, review state,
provenance, and articles. Public object storage/CDN handles the high-volume,
cacheable geometry. The browser never receives the entire catalog or world
geometry in one response.

## Canonical Data Model

### `wine_places`

A new canonical catalog replaces `wine_map_nodes` as the long-term map source.
The existing 14 IDs and content are migrated so their identity remains stable.
During Phases 1-2, the old table remains the read source for the current map;
there is no permanent dual-write or duplicate catalog after tile parity.

Core fields:

- `id uuid`;
- `primary_parent_id uuid null`;
- `kind`: `COUNTRY`, `MACRO_REGION`, `REGION`, `SUBREGION`, `APPELLATION`,
  `SITE`, or `VINEYARD`;
- `canonical_key text unique`, a stable globally unique source-independent key;
- `canonical_key_locked_at`, set when a place first becomes verified;
- `name` and `slug`;
- `display_tier smallint`, independent of `kind` and hierarchy depth;
- default `min_zoom` and `label_min_zoom`;
- `publication_status`: `DRAFT`, `VERIFIED`, or `EXCLUDED`;
- `sort_order`, `created_at`, and `updated_at`.

`primary_parent_id` provides one deterministic breadcrumb and drill-down tree.
Cycles, self-parenting, missing parents, and invalid parent ordering are blocked
before publication. A child's `display_tier` may equal but never precede its
parent's tier, so reveal ordering remains valid without limiting hierarchy
depth. A published `canonical_key` is immutable even if the place is renamed or
reparented.

### `wine_place_aliases`

Aliases and localized names are stored separately with language, alias type,
and normalized search value. An alias can improve search but cannot act as a
canonical identity or source match without review.

### `wine_place_relationships`

Optional secondary relationships preserve facts that do not belong in the
primary navigation tree, such as overlapping zones, alternate classifications,
or an additional geographic parent. These edges never determine breadcrumbs or
automatic drill-down.

### Links From Scoring References

The existing `countries`, `regions`, and `appellations` tables keep their UUIDs
and scoring responsibilities. Each receives nullable canonical link and review
metadata:

- `wine_place_id`;
- `map_status`: `PENDING`, `VERIFIED`, `SYNTHETIC`, `DUPLICATE`, `INVALID`, or
  `NOT_GEOGRAPHIC`;
- match method, confidence, reviewer, review timestamp, and note.

No uniqueness constraint is placed on `wine_place_id`, so duplicate or
alternate reference rows may resolve to one canonical place. A review report
must account for every reference row; unlinked rows are explicit, not silent.
`VERIFIED`, `SYNTHETIC`, and `DUPLICATE` rows require a canonical link;
`PENDING`, `INVALID`, and `NOT_GEOGRAPHIC` rows remain unlinked. Suggested name
matches never become verified links without review.

### `wine_place_articles`

Optional one-to-one article records contain description, climate, grape
varieties, wine styles, key facts, and editorial status. Separating articles
keeps map navigation payloads small and allows a verified boundary to launch
with a "Profile being curated" state.

### Boundary And Source Records

`wine_boundary_sources` provides stable source-feature identity:

- authority and jurisdiction;
- source namespace and feature identifier, unique as a pair.

The namespace/feature pair is immutable after insertion; corrections create a
new source identity rather than rewriting snapshot history.

`wine_boundary_source_snapshots` records immutable revisions of a source
feature:

- source identity;
- source revision/date and evidenced retrieval timestamp;
- source URL and licence at that revision;
- optional immutable raw snapshot URL/checksum plus required immutable normalized
  artifact URL/checksum;
- a provenance note whenever a migrated legacy source has no retained raw
  snapshot;
- importer version.

New source adapters must retain the genuine raw response. The nullable raw fields
exist only so legacy geometries can be migrated honestly when the earliest
retained artifact is already normalized; those rows require an explanatory
provenance note.

`wine_place_boundaries` records:

- canonical `wine_place_id`;
- reviewed PostGIS display geometry in SRID 4326;
- one reviewed label point and bounding box;
- boundary method: `OFFICIAL`, `GENERALIZED_FROM_OFFICIAL_SOURCE`,
  `DERIVED_FROM_DESCENDANTS`, or `MANUAL`;
- source snapshot, quality status, and revision;
- generation parameters and review timestamps.

Raw cadastral/parcel datasets stay as immutable source artifacts rather than
inflating every runtime row. PostGIS stores reviewed display geometry and
supports validation, spatial measurements, and tile-build export; it does not
serve dynamic tiles on each user request.

### `wine_map_releases`

Each publication records a version, manifest URL/checksum, tile checksums,
feature counts by kind/country, build input revisions, validation report, and
promotion state. Only one release is active. Promotion changes a small manifest
pointer; rollback restores the prior release.

## Geographic Semantics

Every parent place has its own boundary. Bordeaux is therefore a selectable,
mapped `REGION`, not merely an invisible grouping of appellations.

Boundary priority is:

1. authoritative geographic boundary;
2. reviewed derivation from verified descendants;
3. reviewed manual cartographic boundary;
4. no boundary, with text navigation retained.

Derived boundaries are visibly and internally identified as derived. They do
not become official merely because they are generated from official children.

Generalization operates on coherent component clusters:

- nearby vineyard parcels are dissolved/generalized into a readable footprint;
- internal parcel whitespace and insignificant local fragments are removed;
- pathological tiny outliers may be omitted using reviewed quality rules;
- genuinely distant geographic islands remain separate components of one
  `MultiPolygon`;
- multiple zoom resolutions are generated from the same reviewed display
  geometry;
- one label point is generated and reviewed independently of polygon parts.

The Bordeaux 20%-edge/2%-component heuristic remains valid for its tested
dataset but is not a universal worldwide constant. Source adapters may select
documented jurisdiction-specific parameters, and every output must pass common
quality gates and visual review.

## Source And Curation Pipeline

There is no single worldwide authoritative boundary source. The pipeline uses
source adapters per authority and jurisdiction, such as INAO for France and TTB
for US AVAs.

Each adapter must:

1. fetch or read a versioned raw snapshot;
2. retain stable source IDs and licensing metadata;
3. normalize names without destroying the source spelling;
4. emit staged source entities and geometries;
5. generate candidate canonical/reference matches with evidence;
6. never publish matches automatically.

The review workflow resolves candidates into canonical places, links scoring
rows, selects the primary hierarchy, approves boundary derivation, and records
exclusion reasons. Reimports upsert by `(source namespace, source ID)`, not by
mutable display name, and report added, changed, missing, and conflicting
features.

The current LWIN hierarchy loss is not copied into the canonical catalog.
Country, region, subregion, appellation, site, and vineyard concepts remain
distinct where the source supports them. Existing flattened scoring rows can
link to the appropriate canonical level without changing their scoring IDs.

## Tile Publication

The publisher creates:

- a versioned `world.pmtiles` archive containing wine countries and top-level
  regions;
- one versioned country archive containing that country's deeper regions,
  appellations, and sites;
- a small versioned manifest containing release metadata and archive URLs.

Country sharding keeps updates localized and prevents dense countries from
inflating every user's world session. Large countries may later split into
region shards without changing the manifest contract.

Only one country shard is active by default. An explicit country/place
selection takes priority; otherwise, once the map reaches regional zoom, the
country containing the viewport center is resolved from the world tiles and
its shard is activated. Moving the center across a country boundary switches
the active shard after the map settles. This gives manual zoom a deterministic
path to deeper data without loading every country visible around Europe.

Tile polygon features contain only:

- canonical ID;
- name;
- kind and display tier;
- primary parent ID;
- child flag;
- style/label rank;
- publication-safe source attribution key.

Labels are emitted in a separate point layer, one feature per place. Article
text, aliases, provenance details, and child lists do not enter vector tiles.

Archives use immutable versioned URLs and long public cache lifetimes. The
manifest has a shorter cache lifetime. Supabase Storage is the first hosting
candidate, but production use requires a range-request, CORS, cache-header, and
file-size acceptance test. The manifest contract allows another CDN/object
store without changing the map UI.

## Map Interaction

### Progressive Detail

Default visibility follows display tier and per-place zoom overrides:

- world zoom: wine countries;
- country zoom: top-level regions such as Bordeaux, Bourgogne, Rioja, and
  California;
- regional zoom: subregions and appellations;
- local zoom: sites and vineyards.

Manual zoom reveals finer layers but does not change the selected article or
breadcrumb. Selection changes only through click, text navigation, or search.

### Click Behavior

Clicking a place:

1. selects its canonical ID;
2. updates a shareable URL state;
3. loads its country shard if needed;
4. fetches one context response containing the place, ancestors, immediate
   children, article summary, and attribution;
5. fits the camera to the place at the zoom where its children become visible.

At child zoom, the selected parent's fill fades while its outline and single
label remain. Bordeaux therefore stays legible around its appellations. Deeper
features win click selection only when their layer is visible at the current
zoom.

### Context Data

The application replaces full-tree `.select("*")` with bounded operations:

- initial country/navigation summary;
- `get_wine_place_context(place_id)` for one place, ancestors, and immediate
  children;
- paginated/searchable canonical place search;
- optional article-detail fetch by canonical ID.

No operation depends on fetching more than the Data API row limit. Queries
surface errors rather than presenting failures as empty content.

### Fallbacks

- A verified place without a boundary remains accessible through text search,
  breadcrumbs, and child lists.
- A place without an article shows a deliberate curation placeholder.
- Tile or manifest failures show an actionable map fallback while preserving
  text navigation and articles.
- If a new release fails validation after upload, the active manifest remains
  on the prior release.

## Search And URLs

Global search covers verified canonical places and aliases, not raw duplicate
reference rows. Results include their ancestor context to distinguish repeated
names. Selecting a result loads the relevant shard and focuses the map.

The selected canonical key or ID is represented in the URL so views such as
France, Bordeaux, or Margaux are shareable and restorable. Canonical keys are
stable across display-name edits.

## Quality Gates

No place or release may publish unless all applicable checks pass:

- globally unique canonical keys and source identities;
- acyclic primary hierarchy with valid parents;
- complete reference-row review accounting;
- valid SRID and finite coordinates;
- non-empty, non-zero-area, non-self-intersecting display geometry;
- justified component clustering and outlier handling;
- valid label point and bounding box;
- source provenance and licence present;
- no unexpected place/feature loss from the prior release;
- expected tile feature counts by kind and country;
- every tile feature ID resolves to a verified canonical place;
- world and country archives pass PMTiles read/range tests;
- generated visual previews pass human review.

Containment is a warning rather than a universal hard failure because real wine
classifications may overlap or follow non-administrative geography. The review
must explain material parent/child geometry mismatches.

## Testing

### Catalog And Reconciliation

- canonical-key uniqueness and alias behavior;
- hierarchy cycle/parent validation;
- explicit status for every reference row;
- source-ID idempotency and reimport change reports;
- no changes to scoring UUIDs or scoring comparisons.

### Geometry

- valid Polygon/MultiPolygon outputs;
- true distant components retained;
- local parcel fragmentation generalized;
- label point lies on or appropriately represents the geometry;
- zoom-resolution topology and feature identity remain stable;
- parent derivations and source methods are reproducible.

### Tiles

- deterministic build for identical inputs;
- manifest/archive checksums and feature counts;
- PMTiles range/CORS behavior on the production host;
- IDs, hierarchy properties, zoom tiers, and label-point layers round-trip from
  generated tiles;
- prior manifest remains usable during failed publication.

### Application

- world → France → Bordeaux → appellation click path;
- manual zoom reveals children without changing selection;
- clicking a parent zooms to and reveals children;
- parent outline/label remains at child zoom;
- search/deep links load the correct shard and context;
- boundary/article/tile missing states retain navigation;
- mobile and desktop camera/detail-panel behavior.

### Scalability

- initial metadata size is bounded independently of catalog size;
- no all-world GeoJSON or article payload crosses the RSC boundary;
- only visible PMTiles ranges and the active country shard are requested;
- catalog and search queries remain paginated/bounded;
- automated build reports archive sizes and tile-density hotspots before
  promotion.

## Rollout

### Phase 1: Foundation

- Add canonical catalog, article, source, boundary, release, and reference-link
  structures.
- Migrate the existing 14 Bordeaux map records without changing their IDs.
- Classify/link the existing Bordeaux scoring references.
- Enable PostGIS and validate the existing generalized geometries.
- Keep the current `/knowledge/map` implementation active.

### Phase 2: France/Bordeaux Tile Pilot

- Build the first source adapters and versioned raw snapshots.
- Generate `world.pmtiles`, the France shard, and the release manifest.
- Implement the zoom/click tile UI behind a controlled switch.
- Prove parity for France → Bordeaux → nested appellations, deep links,
  fallbacks, and mobile behavior.
- Promote the tile UI only after the old Bordeaux experience passes parity.
- Retire `wine_map_nodes` only after promotion; do not maintain two catalogs.

### Phase 3: Country And Broad-Region Coverage

- Review all country and region reference rows.
- Publish every verified wine country and broad region with boundaries or
  explicit no-boundary status.
- Allow article placeholders.
- Add source adapters and attribution country-by-country.

### Phase 4: Appellations And Sites

- Review and publish verified appellations in controlled country batches.
- Resolve synthetic, duplicate, erroneous, and non-geographic reference rows.
- Add subregions/sites where source hierarchy supports them.
- Expand learning content independently of geographic publication.

Each phase is separately deployable and reversible. Worldwide coverage is a
curation program, not one migration. The next implementation plan should cover
Phase 1 only; later phases receive separate plans after the prior phase is
validated.

## Success Criteria

- Bordeaux is visible and selectable before its appellations are shown.
- Zooming or clicking reveals the appropriate next level without loading the
  entire world hierarchy.
- Every displayed place is verified, sourced, and represented once in the
  canonical catalog.
- Every scoring reference row has an explicit map-review outcome.
- Current scoring behavior and IDs remain unchanged.
- Boundaries are public, immutable, cacheable artifacts with atomic rollback.
- The architecture can add countries and appellations without increasing the
  initial page payload in proportion to total catalog size.
