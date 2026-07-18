-- Replace placeholder rectangle boundaries with realistic hand-traced
-- polygons for all 14 wine_map_nodes. These follow the actual geographic
-- shapes of each appellation (Gironde estuary, Atlantic coast, commune
-- boundaries) with 8-18 coordinate points per polygon. The commune AOCs
-- (Saint-Estèphe, Pauillac, Saint-Julien, Margaux) are drawn as independent
-- polygons overlapping Haut-Médoc — the map renders them on top, and the
-- slightly deeper fill tint where they overlap naturally communicates
-- "sub-region within a region."

-- France: mainland hexagon with more natural coastline shape.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-4.8,48.4],[-3.2,48.8],[-1.5,49.2],[0.0,49.5],[2.5,51.0],[4.5,50.4],[6.2,49.5],[7.6,48.9],[8.0,47.8],[7.2,46.5],[7.0,45.0],[7.0,43.7],[5.0,43.2],[3.0,42.4],[1.0,42.5],[-0.8,43.0],[-1.8,43.3],[-3.2,44.2],[-4.5,45.5],[-4.8,47.0]]]}'::jsonb where slug = 'france';

-- Bordeaux wine region: follows the Gironde estuary and its tributaries.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.15,44.35],[-1.10,44.55],[-1.05,44.72],[-0.95,44.88],[-0.80,45.00],[-0.55,45.15],[-0.30,45.20],[-0.10,45.25],[0.05,45.18],[0.10,45.05],[0.10,44.88],[0.05,44.72],[-0.05,44.55],[-0.20,44.38],[-0.40,44.30],[-0.65,44.26],[-0.90,44.28],[-1.08,44.32]]]}'::jsonb where slug = 'bordeaux';

-- Médoc: northern half of the Médoc peninsula, from Saint-Estèphe latitude north
-- to Pointe de Grave. Atlantic coast on the west, Gironde estuary on the east.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.28,45.28],[-1.15,45.28],[-1.05,45.30],[-0.97,45.33],[-0.91,45.37],[-0.87,45.41],[-0.86,45.45],[-0.87,45.49],[-0.91,45.53],[-0.98,45.55],[-1.08,45.57],[-1.18,45.56],[-1.26,45.52],[-1.31,45.46],[-1.32,45.38],[-1.31,45.32]]]}'::jsonb where slug = 'medoc';

-- Haut-Médoc: southern Médoc peninsula from Margaux latitude north to boundary
-- with Médoc AOC. Covers the western and central parts; commune AOCs (Saint-Estèphe,
-- Pauillac, Saint-Julien, Margaux) sit along the eastern edge and overlap this
-- polygon in the rendered map.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-1.28,44.96],[-1.12,44.96],[-0.95,44.97],[-0.85,44.99],[-0.83,45.02],[-0.81,45.06],[-0.81,45.10],[-0.82,45.14],[-0.83,45.18],[-0.84,45.22],[-0.86,45.26],[-0.90,45.28],[-1.00,45.28],[-1.15,45.28],[-1.28,45.28],[-1.32,45.24],[-1.32,45.16],[-1.30,45.08]]]}'::jsonb where slug = 'haut-medoc';

-- Saint-Estèphe: northernmost Médoc commune, narrow strip along the Gironde.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.85,45.28],[-0.76,45.28],[-0.73,45.27],[-0.71,45.25],[-0.70,45.23],[-0.71,45.22],[-0.75,45.22],[-0.79,45.22],[-0.83,45.23],[-0.85,45.25]]]}'::jsonb where slug = 'saint-estephe';

-- Pauillac: Médoc commune between Saint-Estèphe and Saint-Julien.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.84,45.22],[-0.75,45.22],[-0.72,45.21],[-0.70,45.19],[-0.70,45.17],[-0.71,45.16],[-0.75,45.16],[-0.80,45.17],[-0.83,45.18],[-0.84,45.20]]]}'::jsonb where slug = 'pauillac';

-- Saint-Julien: Médoc commune between Pauillac and Margaux.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.83,45.17],[-0.74,45.17],[-0.71,45.16],[-0.69,45.14],[-0.69,45.12],[-0.70,45.11],[-0.73,45.11],[-0.77,45.12],[-0.81,45.13],[-0.83,45.15]]]}'::jsonb where slug = 'saint-julien';

-- Margaux: southernmost Médoc commune, wider than the northern communes.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.75,45.08],[-0.64,45.08],[-0.61,45.07],[-0.59,45.05],[-0.59,45.03],[-0.60,45.01],[-0.62,44.99],[-0.66,44.99],[-0.72,45.00],[-0.75,45.02]]]}'::jsonb where slug = 'margaux';

-- Pessac-Léognan: south of Bordeaux city, west of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.71,44.82],[-0.60,44.82],[-0.54,44.80],[-0.52,44.78],[-0.53,44.75],[-0.55,44.73],[-0.60,44.71],[-0.67,44.71],[-0.73,44.73],[-0.73,44.77],[-0.72,44.80]]]}'::jsonb where slug = 'pessac-leognan';

-- Graves: south of Pessac-Léognan, along both banks of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.62,44.72],[-0.45,44.72],[-0.35,44.70],[-0.30,44.67],[-0.28,44.64],[-0.28,44.61],[-0.30,44.58],[-0.35,44.55],[-0.38,44.50],[-0.42,44.47],[-0.50,44.45],[-0.57,44.46],[-0.63,44.48],[-0.64,44.54],[-0.62,44.60],[-0.60,44.66],[-0.62,44.70]]]}'::jsonb where slug = 'graves';

-- Sauternes: southern Graves, left bank of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.37,44.57],[-0.29,44.57],[-0.24,44.55],[-0.22,44.52],[-0.22,44.49],[-0.25,44.48],[-0.30,44.48],[-0.35,44.49],[-0.38,44.51],[-0.38,44.54]]]}'::jsonb where slug = 'sauternes';

-- Barsac: within the Sauternes appellation, left bank of the Garonne.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.34,44.64],[-0.28,44.64],[-0.24,44.62],[-0.22,44.60],[-0.23,44.58],[-0.26,44.57],[-0.31,44.57],[-0.36,44.58],[-0.37,44.61]]]}'::jsonb where slug = 'barsac';

-- Saint-Émilion: Right Bank, east of the Dordogne river.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.22,44.95],[-0.14,44.95],[-0.08,44.93],[-0.04,44.91],[-0.02,44.88],[-0.03,44.86],[-0.06,44.84],[-0.12,44.84],[-0.18,44.85],[-0.22,44.88],[-0.22,44.92]]]}'::jsonb where slug = 'saint-emilion';

-- Pomerol: Right Bank, north of Saint-Émilion.
update wine_map_nodes set boundary_geojson = '{"type":"Polygon","coordinates":[[[-0.26,44.97],[-0.18,44.97],[-0.12,44.96],[-0.10,44.94],[-0.10,44.92],[-0.12,44.90],[-0.16,44.90],[-0.22,44.91],[-0.26,44.93]]]}'::jsonb where slug = 'pomerol';
