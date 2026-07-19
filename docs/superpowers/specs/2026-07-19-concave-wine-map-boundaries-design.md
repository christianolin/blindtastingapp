# Concave Wine Map Boundaries Design

## Goal

Replace the exact, fragmented INAO parcel coverage shown on the wine map with
one readable outer footprint per mapped area. The footprint should resemble a
traditional regional wine map: it preserves the area's broad geographic shape
but fills internal non-vineyard gaps and omits detached parcel islands.

## Data Source

The official IGN Geoplateforme WFS layer
`AOC-VITICOLES:aire_parcellaire` remains the source of truth. The existing
parcel-derived GeoJSON in
`supabase/migrations/20260726090000_wine_map_inao_boundaries.sql` is sufficient
input for this refinement, so the result does not depend on hand-drawn points.

## Boundary Generation

- Collect the exterior coordinates from every polygon component belonging to
  one map node.
- Generate a concave hull around those coordinates, tuned to bridge normal
  gaps between parcel clusters without collapsing to a broad convex hull.
- Emit exactly one GeoJSON `Polygon` with one closed exterior ring.
- Do not emit interior rings. White space within an appellation is filled.
- Do not retain detached polygons or tiny islands. Their outermost coordinates
  influence the envelope, but they do not render as separate shapes.
- Simplify the final ring enough for a clean browser map while preserving the
  area's recognizable silhouette.

Because this is a cartographic footprint rather than legal parcel coverage,
the filled envelope intentionally includes some non-vineyard land between the
outermost qualifying parcels.

## Application Behavior

The database continues to store a bare GeoJSON geometry in
`wine_map_nodes.boundary_geojson`. No schema or component API changes are
needed. Existing breadcrumbs, nested fill ordering, click resolution,
highlighting, and auto-fit behavior remain unchanged. A single polygon also
causes MapLibre to place one label for each appellation instead of repeating a
label on each disconnected component.

## Validation

Before applying the migration, validate every generated boundary:

- Geometry type is `Polygon`.
- `coordinates` contains exactly one ring.
- The ring has at least four positions and is exactly closed.
- Every coordinate is finite and in GeoJSON longitude/latitude order.
- No generated boundary is empty.
- The set of updated slugs exactly matches the parcel-derived boundaries being
  replaced.

After applying the migration, query the live rows to confirm the same
invariants and verify the project with TypeScript, ESLint, and a production
build.

## Documentation

Update `CLAUDE.md` to call these geometries generalized concave cartographic
footprints derived from official INAO parcels, not exact displayed parcel
coverage.
