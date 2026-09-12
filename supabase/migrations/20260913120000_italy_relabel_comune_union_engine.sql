-- Correct generation_parameters.engine on 18 Italian boundaries that call
-- themselves an official delimited area but are comune-union approximations.
--
-- Italy is served by two genuinely different kinds of source, and the engine
-- field is what distinguishes them:
--
--   official-delimited-area  the regulator's OWN GIS of the delimited zone.
--                            Piemonte, Toscana, Veneto and Alto Adige are
--                            this -- 111 boundaries where the shape IS the
--                            statute, plus 13 more that share a parent's zone.
--   comune-union             ISTAT comune polygons dissolved per the comune
--                            list read out of the MASAF disciplinare. A
--                            comune-level APPROXIMATION -- a comune the
--                            disciplinare admits only in part is taken whole --
--                            and it depends on a membership list being read
--                            correctly, which is exactly what the eAmbrosia
--                            audit was for.
--
-- Sicily, Lombardy, Friuli and Trentino were staged by adapters that copied the
-- official-delimited-area label from their Alto Adige ancestor while reading
-- ISTAT comuni. Their authority string and provenance note have always said
-- "comune-union" plainly; only this one field disagreed. Left alone it invites
-- the opposite of the mistake this audit has been chasing: trusting an
-- approximation as if a regulator had drawn it.
--
-- Metadata only. No geometry is touched, so no tiles rebuild is required.

begin;

update wine_place_boundaries b
set generation_parameters = jsonb_set(b.generation_parameters, '{engine}', '"comune-union"')
from wine_boundary_source_snapshots s
join wine_boundary_sources so on so.id = s.source_id
where s.id = b.source_snapshot_id
  and b.is_current
  and so.authority like '%MASAF disciplinari%'
  and b.generation_parameters->>'engine' = 'official-delimited-area';

do $$
declare n int;
begin
  -- Nothing sourced from ISTAT comuni may still claim to be a delimited area.
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where b.is_current and so.authority like '%MASAF disciplinari%'
     and b.generation_parameters->>'engine' = 'official-delimited-area';
  if n <> 0 then raise exception '% comune-union boundaries still claim official-delimited-area', n; end if;

  -- All 61 audited footprints should now agree on the label.
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where b.is_current and so.authority like '%MASAF disciplinari%'
     and b.generation_parameters->>'engine' = 'comune-union';
  if n <> 61 then raise exception 'expected 61 comune-union boundaries, got %', n; end if;

  -- And the regulator-GIS sources must be untouched by the update above.
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where b.is_current
     and so.source_namespace in ('PIEMONTE_DOC_DOCG','TOSCANA_DOC_DOCG','VENETO_DOC_DOCG','ALTOADIGE_DOC_IGT')
     and b.generation_parameters->>'engine' = 'official-delimited-area';
  if n <> 111 then raise exception 'expected 111 regulator-GIS delimited areas to survive, got %', n; end if;
end $$;

commit;
