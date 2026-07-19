# Concave Wine Map Boundaries Design

## Goal

Replace the exact, fragmented INAO parcel coverage shown on the wine map with
one readable outer footprint per mapped area. The footprint should resemble a
traditional regional wine map: it preserves the area's broad geographic shape
but fills internal non-vineyard gaps and does not render detached parcel
islands as separate polygons.

## Data Source

The official IGN Geoplateforme WFS layer
`AOC-VITICOLES:aire_parcellaire` remains the source of truth. The existing
parcel-derived GeoJSON in
`supabase/migrations/20260726090000_wine_map_inao_boundaries.sql` is sufficient
input for this refinement, so the result does not depend on hand-drawn points.

## Boundary Generation

- Generate an all-component concave hull from the exterior coordinates of every
  polygon component belonging to one map node. It is tuned to bridge normal
  gaps between parcel clusters without collapsing to a broad convex hull.
- If that hull's longest edge exceeds 20% of its diagonal, omit components whose
  exterior area is below 2% of the dominant exterior component and regenerate
  once. This global rule currently changes the output for Pauillac and
  Saint-Julien only.
- Emit exactly one GeoJSON `Polygon` with one closed exterior ring.
- Do not emit interior rings. White space within an appellation is filled.
- Do not retain detached output polygons or tiny islands. Components retained
  by the adaptive area rule influence the single generated envelope.
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
- The ring has non-zero signed area, no repeated non-closing vertex, and no
  intersections between non-adjacent segments.
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
