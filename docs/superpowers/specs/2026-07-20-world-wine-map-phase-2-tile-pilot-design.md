# World Wine Map Phase 2: France/Bordeaux Tile Pilot — Design

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan
**Prerequisite:** Phase 1 foundation (live at `fc09517`): canonical catalog, reviewed
PostGIS boundaries, and release metadata tables exist; the 14 Bordeaux places are
`VERIFIED` with current `VALIDATED` boundaries.
**Parent spec:** `docs/superpowers/specs/2026-07-19-world-wine-map-architecture-design.md`

## Objective

Publish the existing 14 verified places (France, Bordeaux, 12 appellations) as
immutable PMTiles archives, build the zoom/click tile map UI behind a URL opt-in
switch, prove parity with the current Bordeaux experience, and — after an explicit
human approval gate — promote the tile UI and retire `wine_map_nodes`.

## Pilot Decisions

- **Parity-first data scope.** The pilot publishes only the 14 places already in
  `wine_places`/`wine_place_boundaries`. No new geographic data. Source adapters
  and versioned raw snapshots move to Phase 3; nothing in this phase blocks them.
- **Hosting: Supabase Storage, gated by an acceptance spike.** A spike script must
  prove HTTP range requests, CORS from the app origin, and cache-header control
  on a binary fixture before any pipeline work builds on the bucket, and the
  publish stage must re-prove range reads through the pmtiles client on the real
  archives before a release can be promoted. If either fails, choose another
  host; only manifest URLs change.
- **Tile build: pinned tippecanoe in GitHub Actions.** Export, validation, and
  publish are Node scripts that also run locally on Windows; only the tippecanoe
  stage requires the CI runner. Tippecanoe is proven at planet scale, which covers
  the stated trajectory toward worldwide wine-region coverage.
- **Publisher runs in GitHub Actions** via `workflow_dispatch` (manual trigger).
- **Controlled switch: URL opt-in on the same page.** `/knowledge/map?map=tiles`
  renders the new tile UI; without the parameter the current experience is
  byte-for-byte unchanged until promotion.
- **Promotion and `wine_map_nodes` retirement are in scope**, behind an explicit
  approval gate: automated parity evidence plus a hands-on manual checklist
  (desktop and mobile) reviewed by the project owner before the default flips.

## Section 1: Release Pipeline

A manually triggered GitHub Actions workflow with four fail-closed stages:

1. **Export (Node, locally runnable).** Reads only `VERIFIED` places joined to
   their single current `VALIDATED` boundary. Emits per-layer GeoJSON: polygon
   features plus a separate label-point layer. Each feature carries exactly the
   spec's tile properties — canonical ID, name, kind, display tier, primary parent
   ID, has-children flag, style rank, attribution key — and nothing else. Aborts
   unless counts match the pilot expectation (14 places, 14 boundaries, 14 labels).
2. **Build (tippecanoe, CI-only).** Produces `world.pmtiles` (France at country
   tier, Bordeaux at region tier) and `france.pmtiles` (Bordeaux plus the 12
   appellations, plus label points). Zoom windows derive from each place's stored
   `min_zoom`/`label_min_zoom`. The tippecanoe version is pinned for deterministic
   builds; identical inputs must yield identical archive checksums.
3. **Validate (Node).** Reads the built archives back with the `pmtiles` library
   and enforces the quality gates: feature counts by kind, every tile feature ID
   resolves to a `VERIFIED` canonical place in the live database, bounds are
   finite and within the expected bbox, and byte-range reads succeed. Any failure
   stops the workflow before upload.
4. **Publish, then promote (Node).** Uploads archives to immutable versioned
   Storage paths and records the release in `wine_map_releases`
   (`BUILDING` → `VALIDATED`, with checksums, feature counts, build inputs
   including the git SHA and tippecanoe version, and the validation report).
   Promotion is a separate small step: write `tiles/manifest.json` pointing at the
   release and flip its status to `ACTIVE` (the Phase 1 unique index enforces a
   single active release). Rollback rewrites the manifest to the prior release;
   archives are never mutated or deleted.

CI secrets: the database connection password and a Storage-write credential live
only in GitHub Actions secrets. No credential enters the repository.

## Section 2: Storage Layout And Manifest Contract

- Bucket `wine-map-tiles`, public read; writes only via the CI credential.
- Paths:
  - `tiles/releases/<version>/world.pmtiles`
  - `tiles/releases/<version>/france.pmtiles`
  - `tiles/manifest.json`
- `<version>` equals the `wine_map_releases.version` value (UTC timestamp form,
  e.g. `20260720T140000Z`).
- Cache policy: release archives are immutable with a long public cache lifetime;
  the manifest has a short lifetime (≈60 s) so promotion and rollback propagate
  quickly.
- Manifest shape (schema-versioned JSON):

```json
{
  "schema_version": 1,
  "release_version": "20260720T140000Z",
  "generated_at": "2026-07-20T14:00:00Z",
  "world": { "url": "...", "checksum_sha256": "...", "bytes": 0 },
  "shards": {
    "france": { "url": "...", "checksum_sha256": "...", "bytes": 0 }
  },
  "attribution": { "<attribution-key>": "<display string>" }
}
```

The map UI depends only on this contract, so the host can change without UI
changes. Attribution display strings are publication-safe and keyed by the
attribution key embedded in tile features.

## Section 3: Tile Schema

- Two layers per archive: `places` (polygons) and `labels` (points).
- Feature properties (both layers): `id` (canonical UUID), `key` (canonical key),
  `name`, `kind`, `tier`, `parent_id`, `has_children`, `rank`, `attribution`.
- No article text, aliases, provenance detail, or child lists in tiles.
- Progressive reveal: features appear at their stored `min_zoom`; labels at
  `label_min_zoom`. World archive covers low zooms; the France shard carries the
  regional and appellation zoom range.

## Section 4: Application UI

- `/knowledge/map?map=tiles` renders the new client-only tile map component;
  without the parameter, the existing `wine_map_nodes` experience renders
  unchanged. The switch is one conditional in the page — no feature-flag
  infrastructure.
- New dependency: `pmtiles` (MapLibre protocol). Reuses the existing
  `maplibre-gl` + `react-map-gl` stack and the Carto basemap.
- Behavior per the parent spec:
  - Progressive detail by display tier; manual zoom reveals finer layers without
    changing the selection.
  - Click selects a place, updates a shareable URL state
    (`?map=tiles&place=<canonical_key>`), and fits the camera to the zoom where
    the place's children become visible.
  - At child zoom, the selected parent's fill fades while its outline and single
    label remain.
  - Shard handling in the pilot is trivial: France is the only shard and loads
    when the world view reaches regional zoom over France or on selection.
- Context data: a new `get_wine_place_context(place_id)` database function returns
  the place, its ancestors, immediate children, article summary, and attribution
  in one bounded response — no full-tree `select *`. It is `security invoker`,
  relying on the Phase 1 RLS policies (verified/published rows only, authenticated
  role), matching the app's login requirement.
- Fallbacks: manifest or tile fetch failure shows an actionable error state while
  the text navigation (breadcrumb + child list from context data) keeps working; a
  place without an article shows the deliberate curation placeholder.

## Section 5: Parity Gate, Promotion, Retirement

1. **Automated parity evidence:** integration checks that the published tiles
   contain exactly the 14 places with correct hierarchy properties, that context
   responses match the canonical catalog, and that deep links resolve.
2. **Manual parity checklist (owner-executed, desktop + mobile):** world → France
   → Bordeaux → appellation click path; manual zoom reveal; parent outline/label
   at child zoom; deep links; fallback states; camera/detail-panel behavior.
3. **Approval gate:** implementation pauses and presents the evidence. Only after
   explicit owner approval does promotion proceed.
4. **Promotion:** the tile UI becomes the default on `/knowledge/map` and the
   legacy rendering path is removed (no long-lived dual implementation).
5. **Retirement:** a follow-up migration drops `wine_map_nodes` and the last code
   references to it are deleted, per the parent spec's "do not maintain two
   catalogs." Promotion and retirement are separate commits so promotion alone is
   trivially revertible.

## Section 6: Error Handling

- Every pipeline stage fails closed; the manifest is written last, so a failed run
  can never leave a half-published release active.
- A release that fails validation after upload is recorded as `FAILED`; the active
  manifest remains on the prior release.
- UI queries and tile loads surface errors visibly rather than rendering failures
  as empty content.

## Section 7: Testing

Consistent with repository practice (`node --test` scripts, tsc, targeted ESLint,
production build, manual smoke):

- **Unit (fixtures, no network):** export property mapping, manifest generation,
  and each validation gate rejecting a specifically broken input.
- **Integration (live/CI):** the storage acceptance spike (kept as a re-runnable
  script), PMTiles read-back round-trip of IDs/tiers/labels, determinism check on
  double-build checksums, and `get_wine_place_context` contract tests.
- **Application:** tsc, ESLint, `npm run build`; the manual parity checklist is
  the human gate no automated test replaces.

## Out Of Scope

- New source adapters, raw snapshots, or any geography beyond the 14 pilot places
  (Phase 3+).
- Subregion/site/vineyard kinds, curation tooling, article editing.
- Multi-shard activation logic beyond the single France shard.
- Anonymous/public map access (the app requires login today; unchanged).

## Success Criteria

- The hosting spike passes (or a documented host switch happened) before pipeline
  work began on it.
- A versioned release exists in Storage and `wine_map_releases`, promoted via the
  manifest, with rollback demonstrated once.
- `/knowledge/map?map=tiles` delivers the full click path France → Bordeaux →
  appellation with parity against the current map; the default page is unchanged
  until the approval gate passes.
- After approval: tile UI is the default, `wine_map_nodes` is retired, and scoring
  IDs/behavior remain untouched throughout.
