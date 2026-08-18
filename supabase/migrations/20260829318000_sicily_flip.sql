-- Sicily round 1 flip: promote the 3 comune-union DRAFT boundaries and verify
-- all 5 new places. The REGION (blob next) and Sicilia DOC (whole island,
-- tree-only) have no separate footprint. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array['italy.sicilia.etna','italy.sicilia.cerasuolo-di-vittoria','italy.sicilia.marsala'];
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'SICILY_COMUNI' and b.quality_status = 'DRAFT';
  if n <> 3 then raise exception 'expected 3 DRAFT Sicily boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'SICILY_COMUNI' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 12.3 or r.bbox[2] < 36.6 or r.bbox[3] > 15.3 or r.bbox[4] > 38.3 then
      raise exception 'boundary % bbox %,%,%,% escapes the Sicily window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 3 then raise exception 'expected to promote 3 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key like 'italy.sicilia%' and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'expected to verify 5 places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 3 then raise exception 'expected 3 current/validated footprints, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key like 'italy.sicilia%' and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 5 then raise exception 'expected 5 verified+locked places, got %', n; end if;
end $$;

commit;
