// Preview the tiles export for one country's rows without building tiles
// (tippecanoe runs only in the Wine Map Tiles workflow; plan 2026-09-29-usa-wine-map-us2
// Task 12). Routes rows through lib.mjs exactly as export.mjs does:
// archiveForPlace, placeFeature (the outline property), the shard max-zoom
// rule, assertMultiCountryArchive and the per-country coverage check (D17).
// export.mjs runs its export on import, so its SQL cannot be imported: this is
// a verbatim copy, and export-preview.test.mjs fails the moment the two drift.
// Nothing under scripts/wine-map-tiles/ changes.
import { readFile } from "node:fs/promises";
import {
  SHARD_TARGET, archiveForPlace, assertMultiCountryArchive, featureOutsideCoverage, placeFeature,
} from "../wine-map-tiles/lib.mjs";

export const EXPORT_SQL_COPY = `
  select
    p.id::text as id,
    p.canonical_key,
    p.name,
    p.kind::text as kind,
    p.display_tier,
    p.appellation_level as level,
    coalesce(
      p.appellation_level,
      case
        when s.source_feature_id like 'echelle-grand-cru:%' then 'grand_cru'
        when s.source_feature_id like 'echelle-premier-cru:%' then 'premier_cru'
      end
    ) as classification,
    p.primary_parent_id::text as primary_parent_id,
    p.min_zoom,
    p.label_min_zoom,
    p.sort_order,
    exists (
      select 1 from wine_places c
      where c.primary_parent_id = p.id and c.publication_status = 'VERIFIED'
    ) as has_children,
    s.source_namespace,
    b.generation_parameters->>'display' as display,
    extensions.ST_AsGeoJSON(b.display_geometry, 6) as geometry,
    extensions.ST_AsGeoJSON(b.label_point, 6) as label_point,
    extensions.ST_X(b.label_point) as label_lon,
    extensions.ST_Y(b.label_point) as label_lat,
    round(extensions.ST_Area(b.display_geometry)::numeric, 8) as area,
    (
      select json_agg(json_build_array(
        round(extensions.ST_X(extensions.ST_PointOnSurface(d.geom))::numeric, 6),
        round(extensions.ST_Y(extensions.ST_PointOnSurface(d.geom))::numeric, 6),
        round(extensions.ST_Area(d.geom)::numeric, 8)
      ) order by extensions.ST_Area(d.geom) desc)
      from extensions.ST_Dump(b.display_geometry) d
    ) as component_labels
  from wine_places p
  join wine_place_boundaries b
    on b.wine_place_id = p.id and b.is_current and b.quality_status = 'VALIDATED'
  join wine_boundary_source_snapshots snap on snap.id = b.source_snapshot_id
  join wine_boundary_sources s on s.id = snap.source_id
  where p.publication_status = 'VERIFIED'
  order by p.canonical_key`;

export async function exportSqlFromSource(path = "scripts/wine-map-tiles/export.mjs") {
  const text = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
  const m = /const EXPORT_SQL = `([\s\S]*?)`;/.exec(text);
  if (!m) throw new Error(`EXPORT_SQL not found in ${path}`);
  return m[1];
}

/**
 * rows: EXPORT_SQL rows (every tier-0 row plus the country's own). Returns the
 * world and shard membership, each shard's max zoom (export.mjs's rule) and a
 * GeoJSON byte count (a proxy; real archive sizes are checked at the sitting),
 * the outline-only keys and any label point outside its country's box.
 */
export function previewRelease(rows, country = "united-states") {
  assertMultiCountryArchive(rows);
  // export.mjs moves a tier <= 1 label to its largest component's point.
  const labelled = rows.map((r) => (r.display_tier <= 1 && Array.isArray(r.component_labels) && r.component_labels.length > 0
    ? { ...r, label_lon: r.component_labels[0][0], label_lat: r.component_labels[0][1] }
    : r));
  const mine = labelled.filter((r) => r.canonical_key === country || r.canonical_key.startsWith(`${country}.`));
  const world = [];
  const shards = {};
  for (const r of mine) {
    const { world: inWorld, shard } = archiveForPlace(r);
    if (inWorld) world.push(r.canonical_key);
    if (!shard) continue;
    const s = (shards[shard] ??= { keys: [], maxLabelZoom: 0, bytes: 0 });
    s.keys.push(r.canonical_key);
    s.maxLabelZoom = Math.max(s.maxLabelZoom, Number(r.label_min_zoom));
    s.bytes += JSON.stringify(placeFeature(r)).length;
  }
  for (const s of Object.values(shards)) {
    s.keys.sort();
    s.max_zoom = Math.min(SHARD_TARGET.maxZoom, Math.max(SHARD_TARGET.minZoom + 1, Math.ceil(s.maxLabelZoom) + 2));
    delete s.maxLabelZoom;
  }
  const outline = mine.filter((r) => placeFeature(r).properties.outline === true).map((r) => r.canonical_key).sort();
  const release = {
    expected: labelled.map((r) => ({ id: r.id, key: r.canonical_key, label_lon: Number(r.label_lon), label_lat: Number(r.label_lat) })),
  };
  const outside = featureOutsideCoverage(release).map((e) => e.key).sort();
  return { world: world.sort(), shards, outline, outside };
}
