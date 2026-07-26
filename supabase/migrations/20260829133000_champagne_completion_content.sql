-- Champagne — completion villages content (v1, published).
--
-- Same set-based template as 20260827099000, now covering the 4 completion
-- Premier Cru villages (Mareuil-sur-Aÿ, Bisseuil, Tauxières-Mutry, Vertus):
-- article per village, Chardonnay-led in the Côte des Blancs / Pinot-led
-- elsewhere, SPARKLING style. Guards skip the 55 already-filled villages.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  p.name || ', a Champagne Premier Cru village (rated 90-99% on the Echelle des Crus) in the ' || sr.name || '.',
  'Cool, marginal semi-continental; the northern edge of ripening, so blending across villages and vintages is the norm.',
  'Belemnite and Micraster chalk (craie) under clay and marl.',
  array['One of the Champagne Premier Cru villages (a whole-commune 90-99% rating, not a parcel AOC)', sr.name],
  'PUBLISHED'
from wine_places p join wine_places sr on sr.id = p.primary_parent_id
where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3 and sr.kind = 'SUBREGION'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, null, 'PUBLISHED'
from wine_places p join wine_places sr on sr.id = p.primary_parent_id
join grapes g on g.name = case when sr.canonical_key = 'france.champagne.cote-des-blancs' then 'Chardonnay' else 'Pinot Noir' end
where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3 and sr.kind = 'SUBREGION'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'ACCESSORY', true, null, null, 'PUBLISHED'
from wine_places p join wine_places sr on sr.id = p.primary_parent_id
join grapes g on g.name = case when sr.canonical_key = 'france.champagne.cote-des-blancs' then 'Pinot Noir' else 'Chardonnay' end
where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3 and sr.kind = 'SUBREGION'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'SPARKLING', 'Traditional-method Champagne', 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3;
  if v_a <> 59 then raise exception 'expected 59 champagne village articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key in (
     'france.champagne.mareuil-sur-ay', 'france.champagne.bisseuil',
     'france.champagne.tauxieres-mutry', 'france.champagne.vertus'
   );
  if v_g <> 8 then raise exception 'expected 8 completion grape links (4 x 2), got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SITE' and p.display_tier = 3;
  if v_s <> 59 then raise exception 'expected 59 champagne village styles, got %', v_s; end if;
end;
$$;
