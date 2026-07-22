// Stage sibling-trimmed revisions for a village's PLOT-level shapes (grands
// crus + individual 1er-cru climats). Independent generalization (closing
// buffers, simplification) makes neighbouring plots overlap; legally these
// parcels are disjoint, so overlaps are artefacts. Deterministic rule:
// process plots smallest-area-first, each later (larger) plot is cut by the
// union of everything already kept — matching the map's smallest-wins click
// rule. Unchanged plots are skipped; changed ones get a DRAFT revision
// reusing the SAME source snapshot (same evidence, corrected generalization)
// with the trim recorded in generation_parameters. A flip migration promotes.
// Usage: node trim-sibling-overlaps.mjs <village-canonical-key> [...]
import assert from "node:assert/strict";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const villages = process.argv.slice(2);
assert.ok(villages.length > 0, "pass at least one village canonical key");

const client = new pg.Client(pgConfig());
await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = 300000");
  let stagedTotal = 0;

  for (const village of villages) {
    const plots = await client.query(
      `select b.id, b.wine_place_id, b.source_snapshot_id, b.boundary_method,
              b.generation_parameters, b.revision, p.canonical_key,
              extensions.ST_Area(b.display_geometry) as area
         from wine_places p
         join wine_place_boundaries b
           on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
        where p.canonical_key like $1 || '.%'
          and (p.appellation_level = 'grand_cru'
               or (p.appellation_level = 'premier_cru' and p.display_tier = 5))
        order by extensions.ST_Area(b.display_geometry) asc, p.canonical_key`,
      [village],
    );
    if (plots.rows.length < 2) {
      console.log(`SKIP ${village}: ${plots.rows.length} plots`);
      continue;
    }

    const keptIds = [];
    let staged = 0;
    for (const plot of plots.rows) {
      if (keptIds.length === 0) {
        keptIds.push(plot.id);
        continue;
      }
      const trimmed = await client.query(
        `with prior as (
           select extensions.ST_Union(display_geometry) g
             from wine_place_boundaries where id = any($2::uuid[])
         ),
         cut as (
           select extensions.ST_Multi(extensions.ST_CollectionExtract(
             extensions.ST_MakeValid(
               extensions.ST_Difference(b.display_geometry, prior.g)
             ), 3)) g
           from wine_place_boundaries b, prior where b.id = $1
         )
         select extensions.ST_AsGeoJSON(cut.g, 6) geojson,
                extensions.ST_IsEmpty(cut.g) is_empty,
                extensions.ST_Equals(cut.g, b.display_geometry) unchanged,
                extensions.ST_Area(cut.g) area_after,
                extensions.ST_Area(b.display_geometry) area_before
           from cut, wine_place_boundaries b where b.id = $1`,
        [plot.id, keptIds],
      );
      const { geojson, is_empty, unchanged, area_after, area_before } = trimmed.rows[0];
      // Losing most of the plot means the overlap is LEGAL, not an artefact:
      // dual-label crus genuinely share land (Mazoyères-/Charmes-Chambertin,
      // like Barsac/Sauternes). Keep those untrimmed and surface them as
      // DUAL_LABEL relationship candidates instead of destroying them.
      const removedShare = is_empty ? 1 : 1 - area_after / area_before;
      if (removedShare > 0.5) {
        console.log(
          `LEGAL-OVERLAP ${plot.canonical_key}: ${(removedShare * 100).toFixed(0)}% shared — kept untrimmed (DUAL_LABEL candidate)`,
        );
        keptIds.push(plot.id);
        continue;
      }
      if (unchanged) {
        keptIds.push(plot.id);
        continue;
      }
      const inserted = await client.query(
        `with geom as (
           -- 6-decimal GeoJSON rounding can re-break validity; repair on the
           -- way in exactly like build-boundary does.
           select extensions.ST_Multi(extensions.ST_CollectionExtract(
             extensions.ST_MakeValid(
               extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON($2), 4326)
             ), 3)) g
         )
         insert into wine_place_boundaries (
           wine_place_id, source_snapshot_id, boundary_method, quality_status,
           display_geometry, label_point, bbox, source_feature_refs,
           generation_parameters, revision, is_current, reviewed_at
         )
         select b.wine_place_id, b.source_snapshot_id, b.boundary_method, 'DRAFT',
                geom.g, extensions.ST_PointOnSurface(geom.g),
                array[
                  extensions.ST_XMin(extensions.Box3D(geom.g)),
                  extensions.ST_YMin(extensions.Box3D(geom.g)),
                  extensions.ST_XMax(extensions.Box3D(geom.g)),
                  extensions.ST_YMax(extensions.Box3D(geom.g))
                ]::double precision[],
                b.source_feature_refs,
                b.generation_parameters || jsonb_build_object(
                  'sibling_trim',
                  jsonb_build_object('village', $3::text, 'rule', 'smallest-first-keeps')
                ),
                b.revision || '-trim', false, null
           from wine_place_boundaries b, geom where b.id = $1
         returning id`,
        [plot.id, geojson, village],
      );
      keptIds.push(inserted.rows[0].id);
      staged += 1;
      console.log(`TRIMMED ${plot.canonical_key}`);
    }
    stagedTotal += staged;
    console.log(`VILLAGE ${village}: ${plots.rows.length} plots, ${staged} trimmed revisions staged`);
  }

  await client.query("commit");
  console.log(`STAGED_TOTAL ${stagedTotal}`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
