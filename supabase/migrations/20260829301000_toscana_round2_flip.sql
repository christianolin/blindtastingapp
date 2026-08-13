-- Tuscany round 2 flip: promote the 12 official DRAFT boundaries to
-- current+VALIDATED and verify the 12 new places. All new. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  ckeys text[] := array[
    'italy.toscana.carmignano','italy.toscana.cortona','italy.toscana.maremma-toscana','italy.toscana.montecucco',
    'italy.toscana.orcia','italy.toscana.suvereto','italy.toscana.val-di-cornia','italy.toscana.colline-lucchesi',
    'italy.toscana.montecarlo','italy.toscana.elba','italy.toscana.pomino','italy.toscana.candia-dei-colli-apuani'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'TOSCANA_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 12 then raise exception 'expected 12 DRAFT round-2 boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
      join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
      join wine_boundary_sources so on so.id = s.source_id
     where so.source_namespace = 'TOSCANA_DOC_DOCG' and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 9.5 or r.bbox[2] < 42.2 or r.bbox[3] > 12.5 or r.bbox[4] > 44.6 then
      raise exception 'boundary % bbox %,%,%,% escapes the Toscana window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 12 then raise exception 'expected to promote 12 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key = any(ckeys) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 12 then raise exception 'expected to verify 12 new places, got %', n; end if;

  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(ckeys) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 12 then raise exception 'expected 12 current/validated round-2 boundaries, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key = any(ckeys) and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 12 then raise exception 'expected 12 verified+locked places, got %', n; end if;
end $$;

commit;
