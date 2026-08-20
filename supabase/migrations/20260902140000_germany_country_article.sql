-- Germany's country-level profile, matching the country + comunidad articles
-- Spain got. The six Anbaugebiete already carry their own.

begin;

insert into wine_place_articles (
  wine_place_id, description, climate, soils, key_facts, editorial_status
)
select p.id,
  'Northerly, cool and defined by rivers: almost every German vineyard leans on a slope above the Rhine, Mosel, Nahe or Main, angled to catch what sun there is and to borrow warmth reflected off the water. That marginality is the point — grapes ripen slowly and keep their acidity, which is why Riesling, the country''s great grape, can be bone-dry or lusciously sweet and still taste weightless. Germany also quietly became a serious red-wine country: it is now the world''s third-largest grower of Pinot Noir, here called Spätburgunder. Thirteen Anbaugebiete are recognised, from the Ahr in the north-west to Baden along the Rhine''s upper reach.',
  'Cool continental, at the northern edge of viticulture. Sites are chosen for aspect and for the heat stored by rivers and dark stone; a warming climate has made ripeness reliable where it once was not, and dry styles now dominate.',
  'Enormously varied over short distances: blue Devonian slate on the Mosel, quartzite and porphyry on the Nahe, limestone and loess in Rheinhessen and the Pfalz, volcanic soils in Baden. Slate''s ability to absorb and re-radiate heat is what makes the steepest, coolest sites work at all.',
  array[
    'Riesling''s homeland — around half the world''s plantings',
    'Third-largest producer of Pinot Noir (Spätburgunder)',
    '13 Anbaugebiete; the Weinbergsrolle names ~2,650 Einzellagen',
    'Steep river slopes: the Mosel''s are the steepest in wine',
    'Prädikat scale (Kabinett to Trockenbeerenauslese) by must weight'
  ]::text[],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'germany'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 'PUBLISHED'
from (values ('Riesling'), ('Pinot Noir'), ('Müller-Thurgau'), ('Silvaner'), ('Dornfelder')) as v(grape)
join grapes g on g.name = v.grape
join wine_places p on p.canonical_key = 'germany'
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, s.style::wine_style_kind, s.so, 'PUBLISHED'
from (values ('WHITE', 0), ('RED', 1), ('SWEET', 2), ('SPARKLING', 3)) as s(style, so)
join wine_places p on p.canonical_key = 'germany'
where not exists (
  select 1 from wine_place_styles ws
   where ws.wine_place_id = p.id and ws.style = s.style::wine_style_kind and ws.colour is null);

do $$
declare v int;
begin
  select count(*) into v from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key = 'germany';
  if v <> 1 then raise exception 'expected 1 germany article, got %', v; end if;
end $$;

commit;
