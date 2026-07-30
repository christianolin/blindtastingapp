-- Broaden the two wine-type dimensions so every style/colour combo the app
-- needs is expressible: ORANGE (skin-contact whites) joins the colour enum, and
-- SWEET joins the style enum. A still sweet white (Sauternes) becomes
-- colour=WHITE + style=SWEET; a fortified red (Port) stays RED + FORTIFIED. This
-- keeps colour independent of style, so aroma filtering can key on colour even
-- for sweet/fortified wines.

alter type wine_colour add value if not exists 'ORANGE';
alter type wine_style add value if not exists 'SWEET';

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'wine_colour' and e.enumlabel = 'ORANGE'
  ) then
    raise exception 'final-state: wine_colour ORANGE missing';
  end if;
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'wine_style' and e.enumlabel = 'SWEET'
  ) then
    raise exception 'final-state: wine_style SWEET missing';
  end if;
end $$;
