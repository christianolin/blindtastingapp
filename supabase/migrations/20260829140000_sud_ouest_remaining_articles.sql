-- Sud-Ouest remaining articles (16 places) - completes the region's
-- profiles (region, Cahors, Madiran, Jurancon already curated).
-- Insert-only with guards; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Atlantic-influenced with warm, dry late seasons.', v.soils,
       array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('bergerac',
   'The Dordogne''s answer to Bordeaux: Merlot-led reds and Sauvignon-Semillon whites from the hills around the old river port.',
   'Clay-limestone and gravel over the Dordogne.',
   'Bordeaux varieties, Perigord prices', 'Red, white and rose across one broad AOC'),
  ('monbazillac',
   'South-facing slopes above the Dordogne where autumn mists breed noble rot - the Sud-Ouest''s great sweet wine.',
   'Clay-limestone with morning-fog exposure.',
   'Botrytis sweet wine to rival Sauternes', 'Semillon, Sauvignon and Muscadelle'),
  ('montravel',
   'The western gateway of Bergerac country - dry whites of cut, plus firm Merlot reds under their own rules.',
   'Limestone plateau edges.',
   'Known for taut Sauvignon-led whites', 'Red Montravel has its own stricter decree'),
  ('pecharmant',
   'The "charming hill" east of Bergerac: iron-tinged sands over clay ("tran") giving the area''s most structured reds.',
   'Iron-rich sand and gravel over clay.',
   'Bergerac''s firmest, most age-worthy red', 'Iron pan (tran) marks the soil'),
  ('saussignac',
   'A small sweet-wine amphitheatre beside Monbazillac - late-harvest and botrytis whites of finesse.',
   'Clay-limestone slopes to the Dordogne.',
   'Sweet wines only', 'A quieter neighbour of Monbazillac'),
  ('cotes-de-duras',
   'Between Entre-deux-Mers and Bergerac, a hill country of Sauvignon whites and supple Merlot reds.',
   'Clay-limestone hills.',
   'Bordeaux grapes beyond the Gironde line', 'Whites are the historic strength'),
  ('cotes-du-marmandais',
   'Garonne-side hills where Bordeaux varieties meet the local Abouriou - friendly, fruit-forward reds.',
   'Gravel terraces and clay-limestone.',
   'Abouriou is the local signature', 'Cooperatives revived the appellation'),
  ('gaillac',
   'One of France''s oldest vineyards (Roman Albi): a universe of native grapes - Braucol, Duras, Len de l''El, Mauzac - in every style.',
   'Gravel terraces, limestone coteaux.',
   'Vines since the 1st century', 'Every style incl. methode ancestrale bubbles'),
  ('gaillac-premieres-cotes',
   'The right-bank limestone terraces of Gaillac reserved for riper, richer whites.',
   'South-facing limestone coteaux.',
   'A whites-only superior tier', 'Mauzac and Len de l''El lead'),
  ('fronton',
   'The vineyard of Toulouse on high terrace gravels - Negrette''s only homeland, violet-scented and peppery.',
   'Ancient Tarn terrace gravels (boulbenes).',
   'Negrette grows almost nowhere else', 'The Toulouse crowd''s local red and rose'),
  ('brulhois',
   'Garonne-side "black wine" country near Agen - Tannat and Cabernet-driven reds of rustic sap.',
   'Terrace gravels and clay.',
   'A once-lost black wine revived', 'Tannat and the Cabernets'),
  ('marcillac',
   'The red-earth amphitheatre of the Aveyron: Fer Servadou (Mansois) on rougier sandstone - peppery, iron-edged mountain red.',
   'Rust-red rougier sandstone and clay.',
   'Min 90% Fer Servadou (Mansois)', 'The rougier earth is blood-red'),
  ('pacherenc-du-vic-bilh',
   'Madiran''s white twin: Manseng-family grapes picked into winter for sweet pacherenc, or dry and taut.',
   'Clay-limestone and iron sands of the Vic-Bilh.',
   'Sweet harvests can run to December', 'Shares every slope with Madiran'),
  ('bearn',
   'The everyday red, white and rose of the Pyrenean foothills, from the vineyards around Madiran and Jurancon.',
   'Foothill clay and galets.',
   'Tannat-led reds, Manseng whites', 'The historic AOC of Henri IV''s homeland'),
  ('irouleguy',
   'The Basque vineyard: terraces cut into Pyrenean mountainsides for Tannat-Cabernet reds and saline Manseng whites.',
   'Red sandstone and ophite terraces.',
   'France''s smallest mountain wine region', 'Basque names on every label'),
  ('buzet',
   'Between Garonne and the Landes forest, Bordeaux-variety reds with a plummy, generous accent.',
   'Gravel, sand and clay terraces.',
   'Merlot-led, cooperative-driven', 'A forest-edge claret alternative')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.sud-ouest.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.sud-ouest%';
  if v_a <> 20 then
    raise exception 'expected 20 sud-ouest articles (all places), got %', v_a;
  end if;
end $$;
