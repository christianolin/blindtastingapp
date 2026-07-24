-- Champagne — sub-region descriptions (owner-provided) for all five sub-regions.
-- Updates the three existing articles and inserts the two new (Sezanne / Bar).
update wine_place_articles a
   set description = v.descr, soils = v.soils, key_facts = array[v.fact]
from (values
  ('montagne-de-reims','Dominated by Pinot Noir, producing structured, robust wines with deep character and great ageing potential.','Chalk with sand and clay on the forested plateau.','Pinot Noir; structured and age-worthy.'),
  ('cote-des-blancs','Renowned for pure chalk soils dedicated primarily to Chardonnay, crafting crisp, elegant, mineral-driven Blanc de Blancs.','Pure chalk (craie).','Chardonnay; the home of Blanc de Blancs.'),
  ('grande-vallee-de-la-marne','Centred around the Marne River with clay and sandy soils heavily planted to Pinot Meunier, yielding fruity, supple and accessible styles.','Clay, sand and marl along the Marne.','Pinot Meunier; fruity and supple (Ay and Tours-sur-Marne are the Grand Cru eastern edge).')
) as v(slug, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.champagne.' || v.slug
where a.wine_place_id = p.id;

insert into wine_place_articles (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Cool, marginal semi-continental; the northern edge of fine-wine ripening.',
  v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('cote-de-sezanne','Located just south of the Cote des Blancs, featuring chalk and marl soils that grow aromatic, fruit-forward Chardonnay.','Chalk and marl.','Chardonnay; aromatic and fruit-forward.'),
  ('cote-des-bar','Situated further south in the Aube department, dominated by Pinot Noir on Kimmeridgian limestone, producing rich, powerful, textured wines.','Kimmeridgian limestone (as in Chablis).','Pinot Noir; rich and powerful.')
) as v(slug, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.champagne.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.champagne.%' and p.kind = 'SUBREGION';
  if v_a <> 5 then raise exception 'expected 5 champagne subregion articles, got %', v_a; end if;
end;
$$;
