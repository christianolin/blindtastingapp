-- Piedmont batch 2 flip: promote the 5 official DRAFT boundaries to
-- current+VALIDATED and verify the 5 new places. All new (no re-parent, no
-- retire). One transaction, fail-closed.

begin;

do $$
declare
  r record;
  n int;
begin
  -- Pre: exactly 5 DRAFT boundaries from this namespace (batch 1 + Langhe are
  -- already VALIDATED, so only the batch-2 ones are DRAFT).
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'PIEMONTE_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 DRAFT batch-2 boundaries, got %', n; end if;

  -- Promote, window-guarded.
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
  if n <> 5 then raise exception 'expected to promote 5 boundaries, got %', n; end if;

  -- Verify the 5 new places (locks canonical_key).
  update wine_places set publication_status = 'VERIFIED'
   where canonical_key in (
     'italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche',
     'italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese'
   ) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'expected to verify 5 new places, got %', n; end if;

  -- Post: 5 footprint places each on exactly one current+VALIDATED boundary.
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche',
         'italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese')
     and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 5 then raise exception 'expected 5 current/validated batch-2 boundaries, got %', n; end if;

  -- All 5 VERIFIED + locked.
  select count(*) into n from wine_places
   where canonical_key in ('italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche',
         'italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 5 then raise exception 'expected 5 verified+locked places, got %', n; end if;
end $$;

commit;
