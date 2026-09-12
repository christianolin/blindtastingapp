-- Promote the five Hessian boundaries staged by stage-hessen-weinbau.mjs.
--
-- The assertions are not ceremony. This footprint is a CLIP -- ATKIS vineyard
-- land inside the Gemeinden the Weinbauamt names -- and the two ways it can go
-- wrong both leave a boundary that looks perfectly fine on its own:
--
--   the clip fails open   and the footprint becomes the whole-Gemeinde union,
--                         putting Frankfurt am Main and Wiesbaden inside the
--                         Rheingau. Caught by an area ceiling: those twelve
--                         Gemeinden cover some 90 000 ha against a vineyard
--                         3 700.
--   the clip fails shut   and the footprint keeps a handful of parcels. Caught
--                         by an area floor.
--
-- The containment check is the sharper one. Bereich Johannisberg must sit
-- inside its Anbaugebiet, and Starkenburg plus Umstadt must together account
-- for the Hessische Bergstraße -- they partitioned it to 0.1 ha when built, so
-- a drift here means the statute's Gemeinde lists and the clip have come apart.

begin;

do $$
declare
  r record;
  n int;
  a_rheingau numeric;
  a_johannisberg numeric;
  a_bergstrasse numeric;
  a_parts numeric;
  expected jsonb := jsonb_build_object(
    -- canonical_key -> [hectares low, hectares high]
    'germany.rheingau',                          jsonb_build_array(3000, 4400),
    'germany.hessische-bergstrasse',              jsonb_build_array(400,  750),
    'germany.rheingau.johannisberg',              jsonb_build_array(3000, 4400),
    'germany.hessische-bergstrasse.starkenburg',  jsonb_build_array(320,  600),
    'germany.hessische-bergstrasse.umstadt',      jsonb_build_array(70,   200)
  );
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select jsonb_object_keys(expected))
     and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 5 then raise exception 'expected 5 DRAFT Hessian boundaries, got %', n; end if;

  for r in
    select b.id, p.canonical_key ck, b.display_geometry g,
           round((extensions.ST_Area(b.display_geometry::extensions.geography) / 10000)::numeric, 1) ha
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in (select jsonb_object_keys(expected))
       and b.quality_status = 'DRAFT' and not b.is_current
  loop
    if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
      raise exception '%: geometry invalid or empty', r.ck;
    end if;
    if r.ha < (expected -> r.ck ->> 0)::numeric or r.ha > (expected -> r.ck ->> 1)::numeric then
      raise exception '%: % ha is outside the expected band %-% — the vineyard clip has failed open or shut',
        r.ck, r.ha, (expected -> r.ck ->> 0)::numeric, (expected -> r.ck ->> 1)::numeric;
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.id;
  end loop;

  select round((extensions.ST_Area(b.display_geometry::extensions.geography) / 10000)::numeric, 1) into a_rheingau
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.rheingau' and b.is_current;
  select round((extensions.ST_Area(b.display_geometry::extensions.geography) / 10000)::numeric, 1) into a_johannisberg
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.rheingau.johannisberg' and b.is_current;
  select round((extensions.ST_Area(b.display_geometry::extensions.geography) / 10000)::numeric, 1) into a_bergstrasse
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.hessische-bergstrasse' and b.is_current;
  select round(sum(extensions.ST_Area(b.display_geometry::extensions.geography) / 10000)::numeric, 1) into a_parts
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.hessische-bergstrasse.starkenburg','germany.hessische-bergstrasse.umstadt')
     and b.is_current;

  -- Johannisberg is the Rheingau minus Frankfurt's Lohrberger Hang and
  -- Felsberg's Böddiger Berg, a couple of hectares between them.
  if a_johannisberg > a_rheingau then
    raise exception 'Bereich Johannisberg (% ha) is larger than its Anbaugebiet (% ha)', a_johannisberg, a_rheingau;
  end if;
  if a_rheingau - a_johannisberg > 50 then
    raise exception 'Rheingau minus Johannisberg is % ha; only Lohrberger Hang and Böddiger Berg should differ',
      a_rheingau - a_johannisberg;
  end if;

  -- Starkenburg and Umstadt partition the Hessische Bergstraße between them.
  if abs(a_parts - a_bergstrasse) > 10 then
    raise exception 'Starkenburg + Umstadt = % ha but Hessische Bergstraße = % ha', a_parts, a_bergstrasse;
  end if;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select jsonb_object_keys(expected))
     and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 5 then raise exception 'expected 5 current VALIDATED Hessian boundaries, got %', n; end if;

  -- Germany now stands at 8 of its 13 Anbaugebiete with geometry.
  select count(*) into n
    from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 8 then raise exception 'expected 8 German Anbaugebiete with geometry, got %', n; end if;
end $$;

commit;
