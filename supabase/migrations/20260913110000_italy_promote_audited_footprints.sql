-- Promote the seven Italian footprints retired by 20260913100000 and restaged
-- from disciplinare-checked comune lists.
--
-- The counts assert the corrections actually landed, since a silent no-op here
-- would leave the map showing the old zones with a clean audit record beside
-- them. The interior-ring assertion matters just as much: four of these zones
-- enclose land belonging to comuni that are NOT members, and the artifacts used
-- to drop those rings and fill the land in. Simplification at 0.0002 degrees
-- runs between the artifact and this table and could drop a small ring again
-- without failing anything, so the rings are counted here rather than assumed.

begin;

-- Etna and Riviera del Garda Classico were staged twice: the Sicily and
-- Lombardy adapters did not record comuni_count in generation_parameters, so
-- the assertion below had nothing to check them against, and they were restaged
-- after that was fixed. Drop the superseded drafts so exactly one candidate per
-- place remains and the count below means what it says.
delete from wine_place_boundaries b
using wine_places p
where p.id = b.wine_place_id
  and b.quality_status = 'DRAFT' and not b.is_current
  and p.canonical_key in ('italy.sicilia.etna', 'italy.lombardia.riviera-del-garda-classico')
  and b.generation_parameters->>'comuni_count' is null;

do $$
declare
  r record;
  n int;
  expected jsonb := jsonb_build_object(
    -- canonical_key -> [comuni in the list, minimum interior rings expected]
    'italy.sicilia.etna',                                     jsonb_build_array(20, 0),
    'italy.lombardia.riviera-del-garda-classico',             jsonb_build_array(30, 0),
    'italy.puglia.copertino',                                 jsonb_build_array(6,  2),
    'italy.puglia.castel-del-monte',                          jsonb_build_array(10, 1),
    'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane', jsonb_build_array(31, 1),
    'italy.sardegna.vermentino-di-gallura',                   jsonb_build_array(23, 0),
    'italy.campania.vesuvio',                                 jsonb_build_array(16, 1)
  );
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select jsonb_object_keys(expected))
     and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 7 then raise exception 'expected 7 DRAFT boundaries to promote, got %', n; end if;

  for r in
    select b.id, p.canonical_key ck, b.display_geometry g,
           (b.generation_parameters->>'comuni_count')::int cc
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in (select jsonb_object_keys(expected))
       and b.quality_status = 'DRAFT' and not b.is_current
  loop
    if r.cc is distinct from (expected -> r.ck ->> 0)::int then
      raise exception '%: staged boundary reports % comuni, expected %',
        r.ck, r.cc, (expected -> r.ck ->> 0)::int;
    end if;

    select coalesce(sum(extensions.ST_NumInteriorRings(d.geom)), 0) into n
      from extensions.ST_Dump(r.g) d;
    if n < (expected -> r.ck ->> 1)::int then
      raise exception '%: staged geometry has % interior ring(s), expected at least % — '
        'simplification has closed a hole over land outside the zone',
        r.ck, n, (expected -> r.ck ->> 1)::int;
    end if;

    if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
      raise exception '%: staged geometry is invalid or empty', r.ck;
    end if;

    update wine_place_boundaries
       set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
     where id = r.id;
  end loop;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in (select jsonb_object_keys(expected))
     and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 7 then raise exception 'expected 7 current VALIDATED boundaries after promotion, got %', n; end if;
end $$;

commit;
