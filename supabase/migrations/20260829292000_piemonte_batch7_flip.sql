-- Piedmont batch 7 flip: promote the 8 official DRAFT boundaries to
-- current+VALIDATED and verify the 8 new places. All new. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  ckeys text[] := array[
    'italy.piemonte.collina-torinese','italy.piemonte.freisa-di-chieri','italy.piemonte.malvasia-castelnuovo',
    'italy.piemonte.pinerolese','italy.piemonte.valsusa','italy.piemonte.colline-saluzzesi','italy.piemonte.valli-ossolane',
    'italy.piemonte.alba'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'PIEMONTE_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 8 then raise exception 'expected 8 DRAFT batch-7 boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'PIEMONTE_DOC_DOCG' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.5 or r.bbox[2] < 44.0 or r.bbox[3] > 9.3 or r.bbox[4] > 46.6 then
      raise exception 'boundary % bbox %,%,%,% escapes the Piemonte window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 8 then raise exception 'expected to promote 8 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key = any(ckeys) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 8 then raise exception 'expected to verify 8 new places, got %', n; end if;

  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(ckeys) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 8 then raise exception 'expected 8 current/validated batch-7 boundaries, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key = any(ckeys) and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 8 then raise exception 'expected 8 verified+locked places, got %', n; end if;
end $$;

commit;
