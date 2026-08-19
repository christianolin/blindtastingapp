-- Wave 4 flip: promote the 10 new DRAFT boundaries (across SICILY_COMUNI /
-- LOMBARDIA_COMUNI / FRIULI_COMUNI / VENETO_DOC_DOCG / ISTAT_CONFINI) and verify
-- the 10 new places. The Trentino umbrella footprint attaches to the existing
-- (already-verified) Trentino subregion node; Trentodoc is tree-only. Keyed on
-- canonical_key. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.sicilia.noto','italy.sicilia.menfi','italy.sicilia.faro','italy.lombardia.san-colombano',
    'italy.friuli.friuli-isonzo','italy.veneto.montello-colli-asolani','italy.veneto.monti-lessini',
    'italy.veneto.colli-di-conegliano','italy.veneto.bagnoli','italy.trentino-alto-adige.trentino'
  ];
  newplaces text[] := array[
    'italy.sicilia.noto','italy.sicilia.menfi','italy.sicilia.faro','italy.lombardia.san-colombano',
    'italy.friuli.friuli-isonzo','italy.veneto.montello-colli-asolani','italy.veneto.monti-lessini',
    'italy.veneto.colli-di-conegliano','italy.veneto.bagnoli','italy.trentino-alto-adige.trentodoc'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT';
  if n <> 10 then raise exception 'expected 10 DRAFT wave-4 boundaries, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 8.9 or r.bbox[2] < 36.4 or r.bbox[3] > 15.7 or r.bbox[4] > 46.4 then
      raise exception 'boundary % bbox %,%,%,% escapes the Italy window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 10 then raise exception 'expected to promote 10 boundaries, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where canonical_key = any(newplaces) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 10 then raise exception 'expected to verify 10 new places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 10 then raise exception 'expected 10 current footprints, got %', n; end if;

  -- The Trentino subregion (existing) now has its umbrella footprint current.
  if (select count(*) from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
       where p.canonical_key = 'italy.trentino-alto-adige.trentino' and b.is_current) <> 1 then
    raise exception 'Trentino subregion should have exactly one current boundary now';
  end if;

  select count(*) into n from wine_places
   where canonical_key = any(newplaces) and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 10 then raise exception 'expected 10 verified+locked new places, got %', n; end if;
end $$;

commit;
