-- Promote the five Hessian boundaries, rebuilt with the morphological close.
--
-- The bands are on hectares_planted, NOT on the geometry's own area. The
-- geometry is the closed outline and its area is inflated by design, so
-- measuring it would check the buffer rather than the data. hectares_planted is
-- the vineyard extent measured before the close, and it is the number that goes
-- wrong if the clip fails:
--
--   the clip fails open   the footprint becomes the whole-Gemeinde union and
--                         Rheingau swallows Frankfurt am Main and Wiesbaden.
--                         Those twelve Gemeinden cover some 90 000 ha against a
--                         planted 3 700, so the ceiling catches it.
--   the clip fails shut   the footprint keeps a handful of parcels; the floor
--                         catches it.
--
-- Two structural checks then verify the statute's own arithmetic survived, and
-- they are the sharp ones. They are stated against the PLANTED figures, where
-- the relationships are exact -- after closing, overlapping buffers blur them.
--
-- Also asserts the superseded raw-clip rows stay retired. Nothing selects on
-- quality_status alone, so a stale VALIDATED row left current would be
-- indistinguishable from the new one.

begin;

do $$
declare
  r record;
  n int;
  planted_rheingau numeric;
  planted_johannisberg numeric;
  planted_bergstrasse numeric;
  planted_bereiche numeric;
  expected jsonb := jsonb_build_object(
    -- canonical_key -> [planted hectares low, planted hectares high]
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
           (b.generation_parameters->>'hectares_planted')::numeric planted,
           (b.generation_parameters->>'engine') engine,
           (b.generation_parameters->>'raw_parts')::int raw_parts,
           extensions.ST_NumGeometries(b.display_geometry) parts
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in (select jsonb_object_keys(expected))
       and b.quality_status = 'DRAFT' and not b.is_current
  loop
    if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
      raise exception '%: geometry invalid or empty', r.ck;
    end if;
    if r.engine is distinct from 'vineyard-clip+close' then
      raise exception '%: engine is %, expected vineyard-clip+close — an unclosed clip must not be promoted',
        r.ck, r.engine;
    end if;
    if r.planted is null then
      raise exception '%: generation_parameters has no hectares_planted to check', r.ck;
    end if;
    if r.planted < (expected -> r.ck ->> 0)::numeric or r.planted > (expected -> r.ck ->> 1)::numeric then
      raise exception '%: % planted ha is outside the expected band %-% — the vineyard clip has failed open or shut',
        r.ck, r.planted, (expected -> r.ck ->> 0)::numeric, (expected -> r.ck ->> 1)::numeric;
    end if;
    -- The close exists to make a scatter of parcels renderable. If it did not
    -- reduce the part count it did not do its job.
    if r.parts >= r.raw_parts then
      raise exception '%: close left % parts from % raw — it has not knitted anything together',
        r.ck, r.parts, r.raw_parts;
    end if;
    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.id;
  end loop;

  select (b.generation_parameters->>'hectares_planted')::numeric into planted_rheingau
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.rheingau' and b.is_current;
  select (b.generation_parameters->>'hectares_planted')::numeric into planted_johannisberg
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.rheingau.johannisberg' and b.is_current;
  select (b.generation_parameters->>'hectares_planted')::numeric into planted_bergstrasse
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.hessische-bergstrasse' and b.is_current;
  select sum((b.generation_parameters->>'hectares_planted')::numeric) into planted_bereiche
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.hessische-bergstrasse.starkenburg','germany.hessische-bergstrasse.umstadt')
     and b.is_current;

  -- Bereich Johannisberg is the Rheingau less Frankfurt's Lohrberger Hang and
  -- Felsberg's Böddiger Berg -- the two sites the statute puts in the
  -- Anbaugebiet but in no Bereich. A couple of hectares, no more.
  if planted_johannisberg > planted_rheingau then
    raise exception 'Johannisberg (% ha) exceeds its Anbaugebiet (% ha)', planted_johannisberg, planted_rheingau;
  end if;
  if planted_rheingau - planted_johannisberg > 20 then
    raise exception 'Rheingau less Johannisberg is % ha; only Lohrberger Hang and Böddiger Berg should differ',
      planted_rheingau - planted_johannisberg;
  end if;

  -- Starkenburg and Umstadt partition the Hessische Bergstraße exactly.
  if abs(planted_bereiche - planted_bergstrasse) > 1 then
    raise exception 'Starkenburg + Umstadt = % ha but Hessische Bergstraße = % ha',
      planted_bereiche, planted_bergstrasse;
  end if;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select jsonb_object_keys(expected)) and b.is_current;
  if n <> 5 then raise exception 'expected exactly 5 current Hessian boundaries, got % (a superseded row is still current)', n; end if;

  select count(*) into n
    from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 8 then raise exception 'expected 8 German Anbaugebiete with geometry, got %', n; end if;
end $$;

commit;
