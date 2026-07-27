-- Bordeaux — wave 3c content (v1, published).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Maritime; the Gironde estuary and Atlantic moderate everything.', v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('cotes-de-bordeaux', 'The umbrella of the right-bank côtes (Blaye, Cadillac, Castillon, Francs, Sainte-Foy) - Merlot-led hillside reds.', 'Clay-limestone slopes above the rivers.', 'Umbrella AOC of the côtes (2009).'),
  ('graves-de-vayres', 'A small enclave on the left bank of the Dordogne - NOT in the Graves district despite the name.', 'Gravel terraces by the Dordogne.', 'Red and dry white.'),
  ('graves.graves-superieures', 'The Graves zone''s sweet-white overlay - Sémillon-led moelleux from the same gravelly vineyards.', 'Gravel terraces over clay and limestone.', 'Sweet white only.'),
  ('premieres-cotes-de-bordeaux', 'The right bank of the Garonne facing Graves - sweet and semi-sweet whites on the slopes.', 'Clay-limestone slopes above the Garonne.', 'Sweet/moelleux white.'),
  ('saint-emilion.saint-emilion-grand-cru', 'Saint-Émilion''s stricter overlay AOC - lower yields, longer élevage, same zone; home of the classified growths.', 'Limestone plateau, côtes and sandy-gravel foot.', 'Overlay of the Saint-Émilion zone; the Classé estates sit here.')
) as v(suffix, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.bordeaux.' || v.suffix
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, null, 'PUBLISHED'
from (values
  ('cotes-de-bordeaux','Merlot','PRINCIPAL'),('cotes-de-bordeaux','Cabernet Franc','ACCESSORY'),('cotes-de-bordeaux','Cabernet Sauvignon','ACCESSORY'),
  ('graves-de-vayres','Merlot','PRINCIPAL'),('graves-de-vayres','Sauvignon Blanc','ACCESSORY'),
  ('graves.graves-superieures','Sémillon','PRINCIPAL'),('graves.graves-superieures','Sauvignon Blanc','ACCESSORY'),
  ('premieres-cotes-de-bordeaux','Sémillon','PRINCIPAL'),('premieres-cotes-de-bordeaux','Sauvignon Blanc','ACCESSORY'),
  ('saint-emilion.saint-emilion-grand-cru','Merlot','PRINCIPAL'),('saint-emilion.saint-emilion-grand-cru','Cabernet Franc','ACCESSORY')
) as v(suffix, grape, role)
join wine_places p on p.canonical_key = 'france.bordeaux.' || v.suffix
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, null, v.so, 'PUBLISHED'
from (values
  ('cotes-de-bordeaux','RED',0),
  ('graves-de-vayres','RED',0),('graves-de-vayres','WHITE',1),
  ('graves.graves-superieures','SWEET',0),('graves.graves-superieures','WHITE',1),
  ('premieres-cotes-de-bordeaux','SWEET',0),('premieres-cotes-de-bordeaux','WHITE',1),
  ('saint-emilion.saint-emilion-grand-cru','RED',0)
) as v(suffix, style, so)
join wine_places p on p.canonical_key = 'france.bordeaux.' || v.suffix
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key in ('france.bordeaux.cotes-de-bordeaux','france.bordeaux.graves-de-vayres','france.bordeaux.graves.graves-superieures','france.bordeaux.premieres-cotes-de-bordeaux','france.bordeaux.saint-emilion.saint-emilion-grand-cru');
  if v_a <> 5 then raise exception 'expected 5 wave-3c articles, got %', v_a; end if;
end;
$$;
