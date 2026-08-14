-- Trentino-Alto Adige round 1 flip: promote the 9 official DRAFT boundaries to
-- current+VALIDATED and verify all 12 new places. The REGION (blob added in the
-- next migration) and the two IGTs (Mitterberg, Vigneti delle Dolomiti) are
-- verified WITHOUT a footprint (tree/Details-only). One transaction, fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.trentino-alto-adige.alto-adige','italy.trentino-alto-adige.santa-maddalena','italy.trentino-alto-adige.terlano',
    'italy.trentino-alto-adige.meranese','italy.trentino-alto-adige.valle-isarco','italy.trentino-alto-adige.val-venosta',
    'italy.trentino-alto-adige.colli-di-bolzano','italy.trentino-alto-adige.lago-di-caldaro','italy.trentino-alto-adige.valdadige'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'ALTOADIGE_DOC_IGT' and b.quality_status = 'DRAFT';
  if n <> 9 then raise exception 'expected 9 DRAFT Alto Adige boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'ALTOADIGE_DOC_IGT' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 10.5 or r.bbox[2] < 46.1 or r.bbox[3] > 12.0 or r.bbox[4] > 47.0 then
      raise exception 'boundary % bbox %,%,%,% escapes the Alto Adige window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 9 then raise exception 'expected to promote 9 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key like 'italy.trentino-alto-adige%' and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 12 then raise exception 'expected to verify 12 places, got %', n; end if;

  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 9 then raise exception 'expected 9 current/validated footprints, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key like 'italy.trentino-alto-adige%' and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 12 then raise exception 'expected 12 verified+locked places, got %', n; end if;
end $$;

commit;
