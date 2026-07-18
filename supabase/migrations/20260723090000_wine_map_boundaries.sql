-- Interactive wine map: each node can carry a GeoJSON *geometry* (not a
-- Feature) as JSONB. Nullable on purpose — a node without a boundary just
-- doesn't render on the map (the pill list remains the universal fallback).
-- These seed shapes are ROUGH PLACEHOLDERS: hand-approximated boxes near the
-- real locations, good enough to make the map interactive; replace with real
-- boundary data (e.g. traced from OpenStreetMap) per-node later via UPDATE.
alter table wine_map_nodes add column boundary_geojson jsonb;

-- France: coarse hexagon of the mainland.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-4.8,48.4],[2.5,51.0],[7.6,48.9],[7.0,43.7],[3.0,42.4],[-1.8,43.3],[-4.8,48.4]]]}'::jsonb where slug = 'france';

-- Bordeaux: rough envelope of the Gironde wine region.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.15,44.35],[-1.10,45.60],[-0.05,45.40],[0.10,44.50],[-0.50,44.20],[-1.15,44.35]]]}'::jsonb where slug = 'bordeaux';

-- Left Bank, north to south along the Gironde/Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.05,45.25],[-1.05,45.55],[-0.75,45.55],[-0.75,45.25],[-1.05,45.25]]]}'::jsonb where slug = 'medoc';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.95,44.95],[-0.95,45.25],[-0.70,45.25],[-0.70,44.95],[-0.95,44.95]]]}'::jsonb where slug = 'haut-medoc';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.83,45.22],[-0.83,45.30],[-0.72,45.30],[-0.72,45.22],[-0.83,45.22]]]}'::jsonb where slug = 'saint-estephe';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.81,45.16],[-0.81,45.22],[-0.71,45.22],[-0.71,45.16],[-0.81,45.16]]]}'::jsonb where slug = 'pauillac';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.80,45.11],[-0.80,45.16],[-0.70,45.16],[-0.70,45.11],[-0.80,45.11]]]}'::jsonb where slug = 'saint-julien';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.74,45.00],[-0.74,45.07],[-0.62,45.07],[-0.62,45.00],[-0.74,45.00]]]}'::jsonb where slug = 'margaux';

-- South of the city.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.72,44.68],[-0.72,44.82],[-0.55,44.82],[-0.55,44.68],[-0.72,44.68]]]}'::jsonb where slug = 'pessac-leognan';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.62,44.45],[-0.62,44.72],[-0.30,44.72],[-0.30,44.45],[-0.62,44.45]]]}'::jsonb where slug = 'graves';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.42,44.48],[-0.42,44.57],[-0.28,44.57],[-0.28,44.48],[-0.42,44.48]]]}'::jsonb where slug = 'sauternes';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.40,44.57],[-0.40,44.64],[-0.28,44.64],[-0.28,44.57],[-0.40,44.57]]]}'::jsonb where slug = 'barsac';

-- Right Bank.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.22,44.84],[-0.22,44.95],[-0.02,44.95],[-0.02,44.84],[-0.22,44.84]]]}'::jsonb where slug = 'saint-emilion';
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.25,44.90],[-0.25,44.97],[-0.16,44.97],[-0.16,44.90],[-0.25,44.90]]]}'::jsonb where slug = 'pomerol';
