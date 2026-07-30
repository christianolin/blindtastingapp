-- Wine styles gain a colour dimension so the map can distinguish white sparkling
-- from rosé sparkling (Champagne showed a bare "Sparkling" + "Rosé"). For the
-- method styles (sparkling / sweet / fortified) colour qualifies the label; still
-- wines keep style = their colour and colour null. The unique key widens to
-- (place, style, colour) so a place can list both a white and a rosé sparkling.

alter table wine_place_styles add column if not exists colour wine_colour;

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.wine_place_styles'::regclass and contype = 'u';
  if c is not null then
    execute format('alter table wine_place_styles drop constraint %I', c);
  end if;
end $$;
alter table wine_place_styles
  add constraint wine_place_styles_place_style_colour_key unique (wine_place_id, style, colour);

-- Every sparkling entry is white sparkling; rosé sparkling is a separate row.
update wine_place_styles set colour = 'WHITE' where style = 'SPARKLING' and colour is null;

-- Champagne (region) also makes rosé sparkling: turn its still-looking ROSE row
-- into a second sparkling row, colour rosé. Other regions' ROSE stays still rosé.
update wine_place_styles s set style = 'SPARKLING', colour = 'ROSE'
from wine_places p
where p.id = s.wine_place_id
  and p.canonical_key = 'france.champagne'
  and s.style = 'ROSE';

do $$
declare n int;
begin
  select count(*) into n from wine_place_styles s
  join wine_places p on p.id = s.wine_place_id
  where p.canonical_key = 'france.champagne' and s.style = 'SPARKLING';
  if n < 2 then
    raise exception 'final-state: champagne should list white + rosé sparkling, got %', n;
  end if;
end $$;
