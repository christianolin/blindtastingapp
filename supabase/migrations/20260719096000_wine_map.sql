-- Knowledge section, part 3: the interactive Wine Map. Deliberately its own
-- self-contained tree table, NOT reusing countries/regions/appellations (the
-- LWIN-derived scoring reference tables) — the Knowledge area is meant to be
-- completely separate from tasting/scoring, and a hand-curated editorial
-- hierarchy (which places to feature, what to say about them) doesn't need
-- to track 1:1 with the ~thousands of scoring appellations. Adding a new
-- country/region/appellation to the map later is just inserting more rows;
-- no schema change needed.
create table wine_map_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references wine_map_nodes(id) on delete cascade,
  level text not null check (level in ('COUNTRY', 'REGION', 'APPELLATION')),
  name text not null,
  slug text not null,
  description text,
  climate text,
  grape_varieties text,
  wine_styles text,
  key_facts text[],
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (parent_id, slug)
);

create index wine_map_nodes_parent_id_idx on wine_map_nodes (parent_id);

alter table wine_map_nodes enable row level security;

-- Read-only for now (matches the reference-table pattern: readable by any
-- authenticated user). No insert/update policy yet — content is seeded via
-- migration; add a write policy later if an in-app editing UI is built.
create policy "wine_map_nodes read" on wine_map_nodes for select to authenticated using (true);

-- ============================================================================
-- Seed: France > Bordeaux > 12 appellations
-- ============================================================================
do $$
declare
  v_france_id uuid;
  v_bordeaux_id uuid;
begin
  insert into wine_map_nodes (parent_id, level, name, slug, description, climate, grape_varieties, wine_styles, key_facts, sort_order)
  values (
    null, 'COUNTRY', 'France', 'france',
    'France is the historical benchmark for wine, with a system of Appellation d''Origine Contrôlée (AOC) rules that ties wine style tightly to place. Nearly every major international grape and wine style traces its roots here.',
    'Ranges from cool maritime in the northwest and Champagne to warm Mediterranean in the south — a wide diversity of growing conditions across the country.',
    'Cabernet Sauvignon, Merlot, Pinot Noir, Chardonnay, Sauvignon Blanc, Syrah, Grenache, Chenin Blanc, and many regional varieties.',
    'Dry reds and whites, sparkling wine (Champagne), sweet botrytized wines, and rosé — virtually every major wine style.',
    ARRAY[
      'Home of the AOC system that inspired appellation laws worldwide',
      'The classic Cabernet Sauvignon–Merlot red blend originates in Bordeaux',
      'Divided into major regions: Bordeaux, Burgundy, Champagne, the Rhône, the Loire, Alsace, and more'
    ],
    1
  )
  returning id into v_france_id;

  insert into wine_map_nodes (parent_id, level, name, slug, description, climate, grape_varieties, wine_styles, key_facts, sort_order)
  values (
    v_france_id, 'REGION', 'Bordeaux', 'bordeaux',
    'France''s largest fine-wine region, on the Atlantic coast around the Gironde estuary — famous for age-worthy red blends and the sweet wines of Sauternes.',
    'Maritime, moderated by the Atlantic and the Gironde estuary — mild winters, warm summers, and a real risk of autumn rain that shapes vintage variation.',
    'Cabernet Sauvignon and Merlot (reds); Sémillon and Sauvignon Blanc (whites, dry and sweet).',
    'Cabernet-dominant reds on the Left Bank, Merlot-dominant reds on the Right Bank, dry whites, and the world''s benchmark botrytized sweet wines.',
    ARRAY[
      'Split by the Gironde estuary into the Left Bank (gravel soils, Cabernet-dominant) and Right Bank (clay/limestone, Merlot-dominant)',
      'The 1855 Classification ranked top Médoc and Sauternes estates and is still used today, largely unchanged',
      'Home to more classified estates (châteaux) than almost any other wine region'
    ],
    1
  )
  returning id into v_bordeaux_id;

  insert into wine_map_nodes (parent_id, level, name, slug, description, climate, grape_varieties, wine_styles, key_facts, sort_order)
  values
  (
    v_bordeaux_id, 'APPELLATION', 'Médoc', 'medoc',
    'The broad appellation covering the whole Left Bank peninsula north of the city of Bordeaux, north of the more prestigious Haut-Médoc.',
    'Maritime, with the Gironde estuary moderating temperatures and gravel banks providing good drainage and heat retention.',
    'Cabernet Sauvignon, Merlot, Cabernet Franc, Petit Verdot',
    'Structured, Cabernet-dominant dry reds, generally less concentrated than the classified communes further south.',
    ARRAY[
      'Sits north of Haut-Médoc, historically considered simpler and lighter than the classified communes',
      'Gravel soils over clay give good drainage, key to ripening Cabernet Sauvignon'
    ],
    1
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Haut-Médoc', 'haut-medoc',
    'The southern, higher-quality part of the Médoc peninsula, containing all six of the famous classified communes, including Margaux, Pauillac, Saint-Julien, and Saint-Estèphe.',
    'Maritime with excellent gravel-based drainage; closer to the Gironde''s moderating influence than the Médoc AOC further north.',
    'Cabernet Sauvignon (dominant), Merlot, Cabernet Franc, Petit Verdot',
    'Firm, age-worthy Cabernet-based reds, generally deeper and more structured than generic Médoc.',
    ARRAY[
      'Contains the six famous Médoc communes, several of which have their own appellation',
      'Deep gravel soils are prized for retaining daytime heat and draining excess rain'
    ],
    2
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Margaux', 'margaux',
    'The southernmost and most aromatically elegant of the great Médoc communes, home to Château Margaux.',
    'Maritime, with particularly well-drained, thin gravel soils that stress the vines and concentrate flavor.',
    'Cabernet Sauvignon (dominant), Merlot, Cabernet Franc, Petit Verdot',
    'Perfumed, silky, elegant reds — often considered the most aromatic of the Médoc communes.',
    ARRAY[
      'Home to Château Margaux, a First Growth in the 1855 Classification',
      'Has more classified châteaux than any other Médoc commune'
    ],
    3
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Pauillac', 'pauillac',
    'The most prestigious Médoc commune, home to three of the five First Growths of the 1855 Classification.',
    'Maritime, with deep gravel mounds (''croupes'') giving outstanding drainage and heat retention.',
    'Cabernet Sauvignon (dominant), Merlot, Cabernet Franc, Petit Verdot',
    'Powerful, concentrated, tannic reds built for long aging — the archetype of classic Bordeaux.',
    ARRAY[
      'Home to Châteaux Lafite Rothschild, Latour, and Mouton Rothschild — three of the five 1855 First Growths',
      'Deep gravel croupes are considered ideal Cabernet Sauvignon terroir'
    ],
    4
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Saint-Julien', 'saint-julien',
    'A small, tightly-knit Médoc commune known for producing some of the most consistently classic, well-balanced Bordeaux reds.',
    'Maritime, gravel-dominant soils similar to its neighbors Margaux and Pauillac.',
    'Cabernet Sauvignon (dominant), Merlot, Cabernet Franc, Petit Verdot',
    'Polished, harmonious reds often described as a bridge between Margaux''s elegance and Pauillac''s power.',
    ARRAY[
      'The smallest of the four great Médoc communes by area',
      'A very high proportion of its vineyard land is classified in the 1855 Classification'
    ],
    5
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Saint-Estèphe', 'saint-estephe',
    'The northernmost of the great Médoc communes, with more clay in its soils than its neighbors, giving sturdier, firmer wines.',
    'Maritime, cooler and slightly wetter influence with a higher proportion of clay alongside gravel.',
    'Cabernet Sauvignon, Merlot (a higher proportion than other Médoc communes), Cabernet Franc',
    'Robust, firmly tannic reds with a reputation for value relative to its more famous neighbors.',
    ARRAY[
      'Has fewer classified 1855 châteaux than Margaux, Pauillac, or Saint-Julien',
      'Higher clay content supports a larger share of Merlot than elsewhere in the Haut-Médoc'
    ],
    6
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Pessac-Léognan', 'pessac-leognan',
    'Carved out of the northern Graves in 1987, this appellation contains Bordeaux''s most prestigious dry red and white estates, including Château Haut-Brion.',
    'Maritime, moderated further by its position closest to the city of Bordeaux and the forests of the Landes to the west.',
    'Cabernet Sauvignon, Merlot (reds); Sauvignon Blanc, Sémillon (whites)',
    'Structured reds with a savory, gravelly character, and some of Bordeaux''s finest dry white wines.',
    ARRAY[
      'Home to Château Haut-Brion, the only non-Médoc estate among the 1855 First Growths',
      'One of the few Bordeaux appellations equally famous for dry whites and reds'
    ],
    7
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Graves', 'graves',
    'The historic region south of the city of Bordeaux — and namesake of its gravel soils — producing both dry reds and dry whites.',
    'Maritime, with the gravel soils that give the region its name providing excellent drainage.',
    'Cabernet Sauvignon, Merlot (reds); Sauvignon Blanc, Sémillon (whites)',
    'Medium-bodied, earthy reds and fresh-to-rich dry whites.',
    ARRAY[
      'Gave its name to the gravel (''graves'') soils found throughout the Left Bank',
      'Pessac-Léognan was carved out of its northern, most prestigious section in 1987'
    ],
    8
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Saint-Émilion', 'saint-emilion',
    'A historic Right Bank town and appellation built on limestone and clay, dominated by Merlot and Cabernet Franc.',
    'Maritime, moderated by the Dordogne river; limestone plateau and clay slopes retain moisture better than Left Bank gravel.',
    'Merlot (dominant), Cabernet Franc, small amounts of Cabernet Sauvignon',
    'Rich, plush, fruit-forward reds, from approachable to age-worthy depending on the estate.',
    ARRAY[
      'Its own classification (Saint-Émilion Grand Cru Classé) is reviewed roughly every decade, unlike the fixed 1855 Classification',
      'A UNESCO World Heritage Site for its historic town and vineyard landscape'
    ],
    9
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Pomerol', 'pomerol',
    'A small, prestigious Right Bank appellation with no official classification, yet home to some of the world''s most sought-after wines, led by Château Pétrus.',
    'Maritime, with a distinctive clay-and-iron-rich soil that retains moisture well.',
    'Merlot (dominant), Cabernet Franc',
    'Rich, velvety, opulent Merlot-based reds with notable aging potential.',
    ARRAY[
      'Has never adopted an official classification system, unlike Médoc or Saint-Émilion',
      'Home to Château Pétrus, one of the world''s most expensive wines'
    ],
    10
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Sauternes', 'sauternes',
    'Bordeaux''s most famous sweet-wine appellation, where autumn mists off the Ciron and Garonne rivers encourage noble rot (botrytis).',
    'Maritime, with morning mists and afternoon sun creating ideal conditions for botrytis cinerea to develop on the grapes.',
    'Sémillon (dominant), Sauvignon Blanc, small amounts of Muscadelle',
    'Intensely sweet, botrytized white wines with high acidity balancing their richness.',
    ARRAY[
      'Château d''Yquem, its top estate, was the only wine given its own "Premier Cru Supérieur" rank in the 1855 Classification',
      'Harvest often involves multiple selective passes through the vineyard to pick individually botrytized berries'
    ],
    11
  ),
  (
    v_bordeaux_id, 'APPELLATION', 'Barsac', 'barsac',
    'A neighboring appellation to Sauternes producing similarly botrytized sweet wines, with the right to use either name.',
    'Similar maritime, mist-prone conditions to Sauternes, with slightly more clay and limestone in the soil.',
    'Sémillon (dominant), Sauvignon Blanc, small amounts of Muscadelle',
    'Sweet, botrytized whites, often considered a touch lighter and fresher than Sauternes.',
    ARRAY[
      'Wines from Barsac may legally be labeled either "Barsac" or "Sauternes"',
      'Its soils have more limestone than Sauternes, often giving a fresher style'
    ],
    12
  );
end $$;
