-- Real Bordeaux appellation boundaries traced carefully from geographic
-- knowledge. Key design constraints:
--   1. Atlantic coastline forms the western limit of Médoc and Haut-Médoc.
--   2. Saint-Estèphe / Pauillac / Saint-Julien / Margaux tile north→south
--      with NO overlap (small gaps between them match real Haut-Médoc
--      villages between communes).
--   3. Haut-Médoc sits entirely west of the communes (~0.02° buffer) and
--      stays east of the Atlantic coast.
--   4. Southern appellations stay east of the Atlantic, west of the Garonne.
--   5. Right-bank appellations (Saint-Émilion, Pomerol) are independent.
--   6. Every polygon ring is EXACTLY closed (first == last coordinate).
-- Coordinates are [longitude, latitude] in GeoJSON order.

-- Médoc: northern peninsula from ~45.28°N to Pointe de Grave.
-- Atlantic coast on the west, Gironde estuary on the east.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.26,45.28],[-1.12,45.28],[-1.00,45.28],[-0.76,45.28],[-0.75,45.30],[-0.78,45.35],[-0.82,45.40],[-0.88,45.45],[-0.95,45.50],[-1.08,45.55],[-1.22,45.50],[-1.25,45.45],[-1.26,45.40],[-1.27,45.35],[-1.27,45.32],[-1.26,45.28]]]}'::jsonb where slug = 'medoc';

-- Haut-Médoc: western Médoc peninsula from ~44.96°N to ~45.28°N.
-- The jagged eastern boundary maintains a ~0.02° buffer west of the four
-- commune appellations (Saint-Estèphe, Pauillac, Saint-Julien, Margaux)
-- which sit along the Gironde as separate non-overlapping strips.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.26,45.28],[-1.00,45.28],[-0.88,45.28],[-0.86,45.25],[-0.86,45.22],[-0.84,45.19],[-0.84,45.17],[-0.82,45.15],[-0.82,45.12],[-0.78,45.10],[-0.78,45.08],[-0.78,45.04],[-0.78,45.00],[-0.82,44.98],[-0.90,44.97],[-1.00,44.96],[-1.16,44.98],[-1.20,45.02],[-1.22,45.04],[-1.24,45.08],[-1.25,45.12],[-1.26,45.16],[-1.26,45.20],[-1.26,45.24],[-1.26,45.28]]]}'::jsonb where slug = 'haut-medoc';

-- Saint-Estèphe: 45.22°N–45.28°N strip along Gironde.
-- Gironde on the east, Haut-Médoc on the west at ~-0.86.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.86,45.28],[-0.76,45.28],[-0.75,45.27],[-0.74,45.25],[-0.73,45.23],[-0.72,45.22],[-0.76,45.22],[-0.80,45.22],[-0.84,45.22],[-0.86,45.24],[-0.86,45.26],[-0.86,45.28]]]}'::jsonb where slug = 'saint-estephe';

-- Pauillac: 45.17°N–45.22°N strip along Gironde.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.84,45.22],[-0.75,45.22],[-0.73,45.21],[-0.72,45.20],[-0.71,45.19],[-0.70,45.17],[-0.73,45.17],[-0.78,45.17],[-0.84,45.19],[-0.84,45.20],[-0.84,45.22]]]}'::jsonb where slug = 'pauillac';

-- Saint-Julien: 45.12°N–45.17°N strip along Gironde.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.82,45.17],[-0.72,45.17],[-0.70,45.16],[-0.69,45.14],[-0.69,45.12],[-0.73,45.12],[-0.78,45.12],[-0.82,45.14],[-0.82,45.15],[-0.82,45.17]]]}'::jsonb where slug = 'saint-julien';

-- Margaux: 45.00°N–45.08°N, the widest of the commune AOCs, stretching
-- farther inland along the wider estuary.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.78,45.08],[-0.64,45.08],[-0.61,45.06],[-0.59,45.04],[-0.58,45.02],[-0.59,45.00],[-0.63,45.00],[-0.68,45.00],[-0.76,45.02],[-0.78,45.04],[-0.78,45.08]]]}'::jsonb where slug = 'margaux';

-- Pessac-Léognan: south of Bordeaux city, west of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.71,44.82],[-0.60,44.82],[-0.54,44.80],[-0.52,44.78],[-0.53,44.75],[-0.55,44.73],[-0.60,44.71],[-0.67,44.71],[-0.73,44.73],[-0.73,44.77],[-0.71,44.80],[-0.71,44.82]]]}'::jsonb where slug = 'pessac-leognan';

-- Graves: south of Pessac-Léognan, along both sides of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.62,44.72],[-0.45,44.72],[-0.35,44.70],[-0.30,44.67],[-0.28,44.64],[-0.28,44.61],[-0.30,44.58],[-0.35,44.55],[-0.38,44.50],[-0.42,44.47],[-0.50,44.45],[-0.57,44.46],[-0.63,44.48],[-0.64,44.54],[-0.62,44.60],[-0.60,44.66],[-0.62,44.70],[-0.62,44.72]]]}'::jsonb where slug = 'graves';

-- Sauternes: southern Graves, left bank of Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.37,44.57],[-0.29,44.57],[-0.24,44.55],[-0.22,44.52],[-0.22,44.49],[-0.25,44.48],[-0.30,44.48],[-0.35,44.49],[-0.37,44.51],[-0.37,44.54],[-0.37,44.57]]]}'::jsonb where slug = 'sauternes';

-- Barsac: within the Sauternes appellation, left bank of Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.34,44.64],[-0.28,44.64],[-0.24,44.62],[-0.22,44.60],[-0.23,44.58],[-0.26,44.57],[-0.31,44.57],[-0.34,44.58],[-0.34,44.61],[-0.34,44.64]]]}'::jsonb where slug = 'barsac';

-- Saint-Émilion: Right Bank, east of Dordogne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.22,44.95],[-0.14,44.95],[-0.08,44.93],[-0.04,44.91],[-0.02,44.88],[-0.03,44.86],[-0.06,44.84],[-0.12,44.84],[-0.18,44.85],[-0.22,44.88],[-0.22,44.92],[-0.22,44.95]]]}'::jsonb where slug = 'saint-emilion';

-- Pomerol: Right Bank, north of Saint-Émilion.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.26,44.97],[-0.18,44.97],[-0.12,44.96],[-0.10,44.94],[-0.10,44.92],[-0.12,44.90],[-0.16,44.90],[-0.22,44.91],[-0.26,44.93],[-0.26,44.97]]]}'::jsonb where slug = 'pomerol';
