-- Flesh out the Italy country article to match France's depth (description +
-- key_facts + climate + soils), so the map Details panel reads fully for Italy.
-- Content is factual/established. Updates the single existing italy article in
-- place; stays PUBLISHED so it keeps rendering.

begin;

do $$
declare
  v_place uuid;
  v_n int;
begin
  select id into v_place from wine_places where canonical_key = 'italy';
  if v_place is null then raise exception 'italy place missing'; end if;

  update wine_place_articles
     set description = 'Italy rivals France as the world''s largest wine producer and is arguably its most diverse, with a distinct family of native grapes and traditions in each of its 20 regions. From Alpine whites in the north to sun-baked reds in the south, few countries pack as much variety into their vineyards.',
         climate = 'Spans cool Alpine and continental conditions in the north (Piedmont, Alto Adige), through the Mediterranean centre, to the heat of the far south, Sicily and Sardinia — as varied as its grapes.',
         soils = 'Enormously varied, from Piedmont''s calcareous marls and Tuscany''s galestro and alberese to the volcanic slopes of Mount Etna and coastal sands.',
         key_facts = array[
           'One of the world''s two largest wine producers, alongside France',
           'Twenty regions, each with its own native varieties — Nebbiolo, Sangiovese, Nero d''Avola, Glera and more',
           'Quality pyramid: DOCG (highest) → DOC → IGT',
           'Icons include Barolo & Barbaresco (Piedmont), Chianti & Brunello (Tuscany), Amarone & Prosecco (Veneto)'
         ]::text[],
         editorial_status = 'PUBLISHED'
   where wine_place_id = v_place;

  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'expected to update exactly 1 italy article, updated %', v_n; end if;
end $$;

commit;
