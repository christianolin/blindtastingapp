-- Wave 3 flip: promote the 4 new comune-union DRAFT boundaries (across the
-- LOMBARDIA_COMUNI / FRIULI_COMUNI / ISTAT_CONFINI namespaces) and verify all 5
-- new places. The Trentino subregion is verified WITHOUT a footprint (grouping
-- node). Keyed on canonical_key so it is namespace-agnostic. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.lombardia.riviera-del-garda-classico','italy.lombardia.moscato-di-scanzo',
    'italy.friuli.carso','italy.trentino-alto-adige.teroldego-rotaliano'
  ];
  allkeys text[] := array[
    'italy.lombardia.riviera-del-garda-classico','italy.lombardia.moscato-di-scanzo',
    'italy.friuli.carso','italy.trentino-alto-adige.teroldego-rotaliano','italy.trentino-alto-adige.trentino'
  ];
begin
  -- Pre: exactly 4 DRAFT boundaries for the 4 footprint places.
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT';
  if n <> 4 then raise exception 'expected 4 DRAFT wave-3 boundaries, got %', n; end if;

  -- Promote, guarded to a generous north-Italy window.
  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 8.9 or r.bbox[2] < 44.7 or r.bbox[3] > 14.0 or r.bbox[4] > 46.4 then
      raise exception 'boundary % bbox %,%,%,% escapes the north-Italy window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 4 then raise exception 'expected to promote 4 boundaries, got %', n; end if;

  -- Verify all 5 new places.
  update wine_places set publication_status = 'VERIFIED'
   where canonical_key = any(allkeys) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 5 then raise exception 'expected to verify 5 places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 4 then raise exception 'expected 4 current footprints, got %', n; end if;

  select count(*) into n from wine_places
   where canonical_key = any(allkeys) and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 5 then raise exception 'expected 5 verified+locked places, got %', n; end if;
end $$;

commit;
