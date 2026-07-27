-- Loire — sub-region content (v1, published). Articles only (grapes/styles
-- live on the AOCs, per the Champagne/Rhone sub-region precedent).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.climate, v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('pays-nantais', 'The Atlantic mouth of the Loire - crisp, saline Melon de Bourgogne (Muscadet) country, with Gros Plant and the five Fiefs Vendéens crus.', 'Cool oceanic; the Atlantic moderates everything.', 'Gneiss, granite, schist and gabbro.', 'Muscadet + sur-lie tradition; 14 AOCs.'),
  ('anjou-saumur', 'Chenin Blanc''s heartland - dry Savennières to the great Layon sweet wines - plus Cabernet Franc reds around Saumur.', 'Oceanic, warming inland; sheltered mesoclimates along the Layon.', 'Dark schist ("Anjou noir") giving way to tuffeau limestone ("Anjou blanc") at Saumur.', 'Chenin dry-to-sweet + Cabernet Franc; 19 AOCs.'),
  ('touraine-region', 'The garden of France - Chenin in Vouvray and Montlouis, Cabernet Franc in Chinon and Bourgueil, Sauvignon on the plateaux (Haut-Poitou rides south).', 'Semi-oceanic with a continental edge moving east.', 'Tuffeau limestone, flinty clay (perruches) and sand-gravel terraces.', 'Chenin, Cabernet Franc, Sauvignon; 18 AOCs.'),
  ('centre-loire', 'The upper river''s Sauvignon Blanc country - Sancerre and Pouilly-Fumé - with Pinot Noir reds and rosés.', 'Continental; frost-prone slopes above the river.', 'Kimmeridgian marl (terres blanches), caillottes limestone and silex.', 'Sauvignon Blanc benchmark; 8 AOCs.')
) as v(slug, descr, climate, soils, fact)
join wine_places p on p.canonical_key = 'france.loire.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.loire.%' and p.kind = 'SUBREGION';
  if v_a <> 4 then raise exception 'expected 4 loire subregion articles, got %', v_a; end if;
end;
$$;
