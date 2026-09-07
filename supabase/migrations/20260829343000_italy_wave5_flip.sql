-- Wave 5 flip: promote the 13 comune-union appellation footprints and verify all
-- 21 new places (5 regions + 16 appellations). The three Abruzzo regional DOCs
-- (Montepulciano/Trebbiano/Cerasuolo d'Abruzzo) are region-wide and tree-only —
-- verified without a footprint. Regions already carry their ISTAT blobs.
-- Namespace-agnostic (keyed on canonical_key). Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.emilia-romagna.romagna-albana','italy.emilia-romagna.lambrusco-di-sorbara','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro',
    'italy.campania.taurasi','italy.campania.greco-di-tufo','italy.campania.fiano-di-avellino',
    'italy.puglia.primitivo-di-manduria','italy.puglia.castel-del-monte','italy.puglia.salice-salentino',
    'italy.umbria.montefalco-sagrantino','italy.umbria.torgiano-rosso-riserva','italy.umbria.orvieto',
    'italy.abruzzo.montepulciano-d-abruzzo-colline-teramane'
  ];
begin
  select count(*) into n
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT';
  if n <> 13 then raise exception 'expected 13 DRAFT wave-5 footprints, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox
      from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 9.0 or r.bbox[2] < 39.7 or r.bbox[3] > 18.6 or r.bbox[4] > 45.2 then
      raise exception 'footprint % bbox %,%,%,% escapes the peninsular-Italy window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 13 then raise exception 'expected to promote 13 footprints, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where publication_status = 'DRAFT' and canonical_key ~ '^italy\.(emilia-romagna|campania|puglia|umbria|abruzzo)(\.|$)';
  get diagnostics n = row_count;
  if n <> 21 then raise exception 'expected to verify 21 new places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 13 then raise exception 'expected 13 current footprints, got %', n; end if;

  -- Each of the 5 regions must have exactly one current blob.
  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('italy.emilia-romagna','italy.campania','italy.puglia','italy.umbria','italy.abruzzo')
     and b.is_current;
  if n <> 5 then raise exception 'expected 5 current region blobs, got %', n; end if;

  select count(*) into n from wine_places
   where publication_status = 'VERIFIED' and canonical_key_locked_at is not null
     and canonical_key ~ '^italy\.(emilia-romagna|campania|puglia|umbria|abruzzo)(\.|$)';
  if n <> 21 then raise exception 'expected 21 verified+locked new places, got %', n; end if;
end $$;

commit;
