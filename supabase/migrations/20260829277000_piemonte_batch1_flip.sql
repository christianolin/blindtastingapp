-- Piedmont batch 1 flip: promote the 9 official DRAFT boundaries to
-- current+VALIDATED and verify the 10 new places. All new (no re-parent, no
-- retire). Alto Piemonte is verified WITHOUT a boundary (tree/Details-only
-- grouping node — export.mjs allows boundary-less VERIFIED places). One
-- transaction, fail-closed.

begin;

do $$
declare
  r record;
  n int;
begin
  -- Pre: exactly 9 DRAFT batch-1 boundaries from this namespace (Langhe's are
  -- already VALIDATED, so only the new ones are DRAFT), none current yet.
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'PIEMONTE_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 9 then raise exception 'expected 9 DRAFT batch-1 boundaries, got %', n; end if;

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
  if n <> 9 then raise exception 'expected to promote 9 boundaries, got %', n; end if;

  -- Verify the 10 new places (locks canonical_key).
  update wine_places set publication_status = 'VERIFIED'
   where canonical_key in (
     'italy.piemonte.monferrato','italy.piemonte.alto-piemonte','italy.piemonte.roero','italy.piemonte.gavi',
     'italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.asti','italy.piemonte.brachetto-dacqui',
     'italy.piemonte.gattinara','italy.piemonte.ghemme'
   ) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 10 then raise exception 'expected to verify 10 new places, got %', n; end if;

  -- Post: 9 footprint places each on exactly one current+VALIDATED boundary.
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('italy.piemonte.monferrato','italy.piemonte.roero','italy.piemonte.gavi',
         'italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.asti',
         'italy.piemonte.brachetto-dacqui','italy.piemonte.gattinara','italy.piemonte.ghemme')
     and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 9 then raise exception 'expected 9 current/validated batch-1 boundaries, got %', n; end if;

  -- Alto Piemonte is intentionally boundary-less.
  if (select count(*) from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'italy.piemonte.alto-piemonte' and b.is_current) <> 0 then
    raise exception 'alto-piemonte unexpectedly has a current boundary';
  end if;

  -- All 10 VERIFIED + locked.
  select count(*) into n from wine_places
   where canonical_key in ('italy.piemonte.monferrato','italy.piemonte.alto-piemonte','italy.piemonte.roero','italy.piemonte.gavi',
         'italy.piemonte.barbera-dasti','italy.piemonte.nizza','italy.piemonte.asti','italy.piemonte.brachetto-dacqui',
         'italy.piemonte.gattinara','italy.piemonte.ghemme')
     and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 10 then raise exception 'expected 10 verified+locked places, got %', n; end if;
end $$;

commit;
