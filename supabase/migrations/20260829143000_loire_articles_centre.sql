-- Loire articles part 3: Chinon-Bourgueil belt, the Loir, Sologne edge and
-- Centre-Loire (16 places). Completes all 60 Loire profiles.
-- Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('montlouis-sur-loire',
   'Vouvray''s mirror across the river: Chenin from sec to petillant, with an avant-garde growers'' scene.',
   'Between Loire and Cher.', 'Tuffeau under clay-silex and sand.',
   'Chenin in every register', 'Petillant originel was codified here'),
  ('bourgueil',
   'Cabernet Franc on gravel terraces and tuffeau slopes north of the Loire - raspberry-fresh to age-worthy.',
   'Sheltered by the Benais forest ridge.', 'River gravels + tuffeau coteaux.',
   'Gravel = supple, tuffeau = structured', 'Cabernet Franc country since Rabelais'),
  ('saint-nicolas-de-bourgueil',
   'The sandy-graveled west of Bourgueil under its own name - the silkiest, earliest-drinking Breton.',
   'Mild river terraces.', 'Deep sands and gravels.',
   'Lighter, sandier sibling of Bourgueil', 'One village, one AOC'),
  ('jasnieres',
   'A single south wall above the Loir: bone-dry (and off-dry) Chenin of legendary cut in warm years.',
   'Marginal northern valley - vintage-sensitive.', 'Tuffeau with silex.',
   'One steep slope, 4 km long', 'Northernmost great Chenin'),
  ('coteaux-du-loir',
   'The Loir''s (no "e") valley: peppery Pineau d''Aunis reds and taut Chenin from a rescued vineyard.',
   'Cool northern valley.', 'Tuffeau, clay and silex.',
   'Pineau d''Aunis is the signature', 'The other Loir - a tributary valley'),
  ('cheverny',
   'Sologne-edge blends: Sauvignon-Chardonnay whites and Pinot-Gamay reds, light and forest-fresh.',
   'Continental Sologne border.', 'Sand and clay over tuffeau.',
   'Blended whites and reds by decree', 'Chateau country of Tintin''s Moulinsart'),
  ('cour-cheverny',
   'Romorantin''s only appellation on earth - Francois I''s Burgundian import, honeyed yet cutting with age.',
   'Continental edge of the Sologne.', 'Clay-silex and sand.',
   'Romorantin only - unique worldwide', 'Planted by royal decree in 1519'),
  ('valencay',
   'Goat-cheese country whites and reds - Sauvignon with Chardonnay, Gamay with Pinot and Cot - plus the namesake AOC cheese.',
   'Continental Berry border.', 'Clay-silex (perruches) and sand.',
   'Wine AND cheese share the AOC name', 'Sauvignon-led, blends mandatory'),
  ('haut-poitou',
   'An island of vines south of the Loire swarm, near Poitiers - brisk Sauvignon and light Cabernet-Gamay reds.',
   'Sunny, breezy plateau.', 'Clay-limestone.',
   'Detached southern outpost of the valley', 'Sauvignon leads'),
  ('pouilly-fume',
   'Sauvignon across the river from Sancerre - smokier, rounder, flint-struck from silex soils.',
   'Continental Centre-Loire.', 'Silex, marl (terres blanches), caillottes.',
   'The fume is the flint-smoke note', 'Sauvignon only'),
  ('pouilly-sur-loire',
   'The old Chasselas of Pouilly, surviving beside its famous Sauvignon twin - featherweight table white.',
   'Continental river bench.', 'Gravels and limestone.',
   'Chasselas - the historic grape here', 'A shrinking, cherished curiosity'),
  ('menetou-salon',
   'Sancerre''s neighbour on the same Kimmeridgian seam - Sauvignon and Pinot Noir with chalk-flower lift.',
   'Continental Berry.', 'Kimmeridgian marl (oyster fossils).',
   'Same Kimmeridgian chain as Chablis/Sancerre', 'Sauvignon whites, Pinot reds and roses'),
  ('quincy',
   'The Cher-side sand-and-gravel terraces - Sauvignon only, the Centre''s earliest and airiest.',
   'Warm, fast-draining terraces.', 'Glacial sands and gravels over limestone.',
   'Sauvignon only - the second AOC of France (1936)', 'Sandy soils, feather-light style'),
  ('reuilly',
   'Sauvignon, Pinot Noir and a prized Pinot Gris vin gris from marl and sand by the Arnon.',
   'Continental Berry.', 'Kimmeridgian marl and sandy terraces.',
   'Pinot Gris rose is the local celebrity', 'All three colours in miniature'),
  ('coteaux-du-giennois',
   'A slender ribbon from Gien to Cosne: Sauvignon and Gamay-Pinot reds on flint and chalk.',
   'Continental upper river.', 'Silex and limestone.',
   'Reds must blend Gamay AND Pinot', 'The Loire''s narrowest long AOC'),
  ('chateaumeillant',
   'The southernmost Loire vines, deep in the Berry: Gamay-led reds and the pale vin gris tradition.',
   'Continental heart of France.', 'Sand and gravel over gneiss.',
   'Vin gris is the historic style', 'Closer to the Massif Central than the Loire')
) as v(slug, descr, climate, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire%';
  if v_a <> 60 then
    raise exception 'expected 60 loire articles (all places), got %', v_a;
  end if;
end $$;
