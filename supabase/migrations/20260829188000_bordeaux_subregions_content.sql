-- Bordeaux — sub-region content (v1, published). Articles only (grapes and
-- styles live on the AOCs, per the sub-region precedent).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Maritime; the Gironde estuary and Atlantic moderate everything.',
  v.soils, array[v.fact], 'PUBLISHED'
from (values
  ('libournais', 'The right bank''s Merlot country - Pomerol and Saint-Émilion with their satellites and the Fronsac hills above the Dordogne.', 'Clay and limestone: the plateau calcaire, the Pomerol clay-gravel boutonnière and molasse hills.', 'Merlot/Cabernet Franc; 9 AOCs.'),
  ('blaye-bourg', 'The northern right bank facing the Médoc across the Gironde - early-drinking Merlot reds from Blaye and the Bourg hills.', 'Clay-limestone hills over the estuary.', 'Merlot-led; 2 AOCs.')
) as v(slug, descr, soils, fact)
join wine_places p on p.canonical_key = 'france.bordeaux.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a join wine_places p on p.id = a.wine_place_id
   where p.canonical_key in ('france.bordeaux.libournais','france.bordeaux.blaye-bourg');
  if v_a <> 2 then raise exception 'expected 2 bordeaux subregion articles, got %', v_a; end if;
end;
$$;
