-- Alsace — knowledge content (v1, published).
--
-- Region profile + grape/style links. Per-cru prose is deferred (the
-- artifact's "content per-cru later"), but every grand cru gets the four
-- noble-variety grape links and a WHITE style so place context is never
-- empty. Grape names match the live `grapes` rows exactly (Gewürztraminer
-- with diaeresis). Insert-only with existence/conflict guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'A narrow ribbon of vines between the Vosges and the Rhine, sheltered into one of France''s driest, sunniest climates. Alsace is white-wine country built on varietal labelling; its best sites are 51 delimited Grand Cru lieux-dits.',
  'Semi-continental and notably dry (the Vosges rain shadow); long, cool ripening autumns.',
  'A geological mosaic along the Vosges fault: granite, schist, volcanic greywacke (Rangen), limestone, marl and sandstone, changing vineyard by vineyard.',
  array[
    'Four noble grapes: Riesling, Gewurztraminer, Pinot Gris, Muscat',
    'Wines are labelled by variety - unusual for classic France',
    '51 Grand Cru lieux-dits, each its own AOC, mostly noble-variety only',
    'Zotzenberg (Sylvaner) and blend-based Kaefferkopf are the decree exceptions',
    'Also Pinot Blanc, Sylvaner and Pinot Noir under the regional AOC'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.alsace'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- The four noble varieties on the region and every grand cru.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null,
       'One of the four noble varieties of Alsace', 'PUBLISHED'
from wine_places p
cross join (select id from grapes where name in ('Riesling', 'Gewürztraminer', 'Pinot Gris', 'Muscat')) g
where p.canonical_key like 'france.alsace%'
on conflict (wine_place_id, grape_id) do nothing;

-- Regional-AOC accessories.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'ACCESSORY', true, null,
       case g.name when 'Pinot Noir' then 'The sole red grape of Alsace'
            else 'Regional AOC white' end,
       'PUBLISHED'
from wine_places p
join grapes g on g.name in ('Pinot Blanc', 'Pinot Noir')
where p.canonical_key = 'france.alsace'
on conflict (wine_place_id, grape_id) do nothing;

-- WHITE on every place; Zotzenberg carries its Sylvaner exception note.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'WHITE',
       case when p.canonical_key = 'france.alsace.zotzenberg'
            then 'Noble varieties plus Sylvaner - the one GC decree exception'
            else 'Mostly varietal noble-grape whites' end,
       0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.alsace%'
on conflict (wine_place_id, style) do nothing;

-- Region also makes Pinot Noir reds and rosé.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values ('RED', 'Pinot Noir', 1), ('ROSE', 'Pinot Noir rose', 2)) as v(style, note, so)
join wine_places p on p.canonical_key = 'france.alsace'
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.alsace%';
  if v_a <> 1 then raise exception 'expected 1 alsace article, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.alsace%';
  if v_g <> 210 then raise exception 'expected 210 alsace grape links (52*4 + 2), got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.alsace%';
  if v_s <> 54 then raise exception 'expected 54 alsace styles (52 white + red + rose), got %', v_s; end if;
end;
$$;
