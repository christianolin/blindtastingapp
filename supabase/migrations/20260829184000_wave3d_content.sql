-- Wave 3d — content (v1, published) for the 9 new places.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('france.sud-ouest.cotes-de-bergerac', 'Bergerac''s stricter overlay - riper reds and moelleux whites from the same Dordogne vineyards.', 'Oceanic, warming up the Dordogne.', 'Clay-limestone plateaux above the Dordogne.', 'Overlay of the Bergerac zone.'),
  ('france.sud-ouest.cotes-de-montravel', 'Semi-sweet Montravel whites from the Dordogne''s western edge.', 'Oceanic; morning mists off the river.', 'Clay-limestone slopes.', 'Moelleux white tier of Montravel.'),
  ('france.sud-ouest.haut-montravel', 'The sweetest Montravel tier - botrytised Sémillon.', 'Oceanic; mist-prone pockets favour botrytis.', 'Clay-limestone slopes.', 'Liquoreux white tier of Montravel.'),
  ('france.sud-ouest.saint-mont', 'Gascony reds and whites off the Adour hills - Tannat country revived by Plaimont.', 'Oceanic Gascon; the Pyrenees close the horizon.', 'Clay-limestone and fawn sands.', 'Tannat-led; Plaimont co-op heartland.'),
  ('france.sud-ouest.tursan', 'Landes hillside reds and the rare Baroque white.', 'Oceanic; pine-forest shelter.', 'Clay-limestone and sandy molasse.', 'Home of the Baroque grape.'),
  ('france.provence.pierrevert', 'Haute-Provence''s high-altitude vineyard near Manosque - fresh reds and rosés.', 'Mediterranean with mountain nights; one of France''s highest zones.', 'Stony clay-limestone terraces.', 'High-altitude Provence satellite.'),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune', 'The small hillside AOC on the top of the slope above Beaune itself.', 'Continental; mid-slope exposure.', 'Limestone and marl high on the côte.', 'Distinct from the district and from CdB-Villages.'),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune-villages', 'A red-wine union of the côte''s lesser villages - blends or single-village Pinot declassified under one name.', 'Continental.', 'Limestone and marl across the côte.', 'Red only; multi-village AOC.'),
  ('france.bourgogne.maconnais.macon-villages', 'The Mâconnais'' white-wine workhorse - Chardonnay from the better named communes.', 'Warmer south-Burgundian; early-ripening.', 'Limestone and clay over granite fringes.', 'White only; named communes may append their name.')
) as v(ck, descr, climate, soils, fact)
join wine_places p on p.canonical_key = v.ck
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('france.sud-ouest.cotes-de-bergerac','Merlot','PRINCIPAL'),('france.sud-ouest.cotes-de-bergerac','Cabernet Franc','ACCESSORY'),
  ('france.sud-ouest.cotes-de-montravel','Sémillon','PRINCIPAL'),('france.sud-ouest.cotes-de-montravel','Sauvignon Blanc','ACCESSORY'),
  ('france.sud-ouest.haut-montravel','Sémillon','PRINCIPAL'),
  ('france.sud-ouest.saint-mont','Tannat','PRINCIPAL'),
  ('france.sud-ouest.tursan','Tannat','PRINCIPAL'),
  ('france.provence.pierrevert','Grenache','PRINCIPAL'),('france.provence.pierrevert','Syrah','ACCESSORY'),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune','Pinot Noir','PRINCIPAL'),('france.bourgogne.cote-de-beaune.cote-de-beaune','Chardonnay','ACCESSORY'),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune-villages','Pinot Noir','PRINCIPAL'),
  ('france.bourgogne.maconnais.macon-villages','Chardonnay','PRINCIPAL')
) as v(ck, grape, role)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('france.sud-ouest.cotes-de-bergerac','RED',0),('france.sud-ouest.cotes-de-bergerac','SWEET',1),
  ('france.sud-ouest.cotes-de-montravel','SWEET',0),('france.sud-ouest.cotes-de-montravel','WHITE',1),
  ('france.sud-ouest.haut-montravel','SWEET',0),
  ('france.sud-ouest.saint-mont','RED',0),('france.sud-ouest.saint-mont','WHITE',1),
  ('france.sud-ouest.tursan','RED',0),('france.sud-ouest.tursan','WHITE',1),
  ('france.provence.pierrevert','RED',0),('france.provence.pierrevert','ROSE',1),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune','RED',0),('france.bourgogne.cote-de-beaune.cote-de-beaune','WHITE',1),
  ('france.bourgogne.cote-de-beaune.cote-de-beaune-villages','RED',0),
  ('france.bourgogne.maconnais.macon-villages','WHITE',0)
) as v(ck, style, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key in ('france.sud-ouest.cotes-de-bergerac','france.sud-ouest.cotes-de-montravel',
     'france.sud-ouest.haut-montravel','france.sud-ouest.saint-mont','france.sud-ouest.tursan',
     'france.provence.pierrevert','france.bourgogne.cote-de-beaune.cote-de-beaune',
     'france.bourgogne.cote-de-beaune.cote-de-beaune-villages','france.bourgogne.maconnais.macon-villages');
  if v_a <> 9 then raise exception 'expected 9 wave-3d articles, got %', v_a; end if;
end;
$$;
