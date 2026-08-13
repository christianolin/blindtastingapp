-- Tuscany round 1 flip: promote the 15 official DRAFT boundaries to
-- current+VALIDATED and verify all 23 new Toscana places. The REGION node and
-- the 7 Montalcino/Montepulciano satellite DOCs are verified WITHOUT a boundary
-- (tree/Details-only — export.mjs allows boundary-less VERIFIED places).
-- One transaction, fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.toscana.chianti-classico','italy.toscana.chianti','italy.toscana.chianti-rufina',
    'italy.toscana.chianti-colli-fiorentini','italy.toscana.chianti-colli-senesi','italy.toscana.chianti-colli-aretini',
    'italy.toscana.chianti-colline-pisane','italy.toscana.chianti-montalbano','italy.toscana.chianti-montespertoli',
    'italy.toscana.montalcino','italy.toscana.montepulciano','italy.toscana.bolgheri','italy.toscana.bolgheri-sassicaia',
    'italy.toscana.vernaccia-di-san-gimignano','italy.toscana.morellino-di-scansano'
  ];
begin
  -- Pre: exactly 15 DRAFT boundaries from this namespace.
  select count(*) into n
    from wine_place_boundaries b
    join wine_boundary_source_snapshots s on s.id = b.source_snapshot_id
    join wine_boundary_sources so on so.id = s.source_id
   where so.source_namespace = 'TOSCANA_DOC_DOCG' and b.quality_status = 'DRAFT';
  if n <> 15 then raise exception 'expected 15 DRAFT Toscana boundaries, got %', n; end if;

  -- Promote, window-guarded.
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
  if n <> 15 then raise exception 'expected to promote 15 boundaries, got %', n; end if;

  -- Verify all 23 new places (region + 15 footprint + 7 tree-only).
  update wine_places set publication_status = 'VERIFIED'
   where canonical_key like 'italy.toscana%' and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 23 then raise exception 'expected to verify 23 Toscana places, got %', n; end if;

  -- Post: 15 footprint places each on exactly one current+VALIDATED boundary.
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 15 then raise exception 'expected 15 current/validated Toscana boundaries, got %', n; end if;

  -- The region node and satellites must be boundary-less.
  if (select count(*) from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
       where p.canonical_key like 'italy.toscana%' and p.canonical_key <> all(footprints) and b.is_current) <> 0 then
    raise exception 'a tree-only Toscana place unexpectedly has a current boundary';
  end if;

  -- All 23 VERIFIED + locked.
  select count(*) into n from wine_places
   where canonical_key like 'italy.toscana%' and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 23 then raise exception 'expected 23 verified+locked Toscana places, got %', n; end if;
end $$;

commit;
