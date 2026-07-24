-- Champagne — sub-region content (v1, published). Articles only (grapes/styles
-- live on the villages).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Cool, marginal semi-continental; the northern edge of fine-wine ripening.',
  'Deep Belemnite and Micraster chalk (craie) under clay and marl.',
  array[v.fact], 'PUBLISHED'
from (values
  ('montagne-de-reims','The forested plateau south of Reims - Champagne''s Pinot Noir heartland, home to 9 of the 17 Grand Cru villages; power and structure for the blend.','Pinot Noir sub-region; 9 Grand Cru villages.'),
  ('cote-des-blancs','The Chardonnay escarpment south of Epernay - pure chalk giving the finest, longest-lived Blanc de Blancs; 6 Grand Cru villages.','Chardonnay sub-region; 6 Grand Cru villages.'),
  ('grande-vallee-de-la-marne','The Marne''s grand sweep around Ay - historic Pinot Noir of great depth; Ay and Tours-sur-Marne are Grand Cru.','Pinot Noir sub-region; 2 Grand Cru villages.')
) as v(slug, descr, fact)
join wine_places p on p.canonical_key = 'france.champagne.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION';
  if v_a <> 3 then raise exception 'expected 3 champagne subregion articles, got %', v_a; end if;
end;
$$;
