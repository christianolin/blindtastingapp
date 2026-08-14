-- Veneto round 1 flip: promote the 14 official DRAFT boundaries to
-- current+VALIDATED and verify all 22 new places. The REGION (blob added next)
-- and the 7 tree-only variants are verified WITHOUT a footprint. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.veneto.valpolicella','italy.veneto.soave','italy.veneto.bardolino','italy.veneto.prosecco',
    'italy.veneto.conegliano-valdobbiadene-prosecco','italy.veneto.lugana','italy.veneto.bianco-di-custoza',
    'italy.veneto.colli-euganei','italy.veneto.colli-berici','italy.veneto.breganze','italy.veneto.gambellara',
    'italy.veneto.piave','italy.veneto.garda','italy.veneto.lison-pramaggiore'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'VENETO_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 14 then raise exception 'expected 14 DRAFT Veneto boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'VENETO_DOC_DOCG' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 10.5 or r.bbox[2] < 44.9 or r.bbox[3] > 13.2 or r.bbox[4] > 46.8 then
      raise exception 'boundary % bbox %,%,%,% escapes the Veneto window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 14 then raise exception 'expected to promote 14 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key like 'italy.veneto%' and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 22 then raise exception 'expected to verify 22 places, got %', n; end if;

  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 14 then raise exception 'expected 14 current/validated footprints, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key like 'italy.veneto%' and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 22 then raise exception 'expected 22 verified+locked places, got %', n; end if;
end $$;

commit;
