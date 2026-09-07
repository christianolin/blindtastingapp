-- Wave 6 flip: promote the 19 comune-union footprints and verify all 53 new
-- places (8 regions + 17 subregions + 28 appellations). Subregions are tree-only
-- grouping nodes; 9 region-wide/boundary-defined appellations are tree-only.
-- Regions carry their ISTAT blobs. Namespace-agnostic. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.marche.verdicchio-di-matelica','italy.marche.conero','italy.marche.offida',
    'italy.lazio.frascati','italy.lazio.marino','italy.lazio.cesanese-del-piglio','italy.lazio.est-est-est-di-montefiascone',
    'italy.sardegna.vermentino-di-gallura','italy.sardegna.carignano-del-sulcis','italy.sardegna.vernaccia-di-oristano',
    'italy.liguria.rossese-di-dolceacqua','italy.liguria.cinque-terre','italy.liguria.colli-di-luni',
    'italy.calabria.ciro','italy.calabria.greco-di-bianco',
    'italy.basilicata.aglianico-del-vulture',
    'italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle','italy.valle-d-aosta.donnas',
    'italy.molise.biferno'
  ];
begin
  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT';
  if n <> 19 then raise exception 'expected 19 DRAFT wave-6 footprints, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 6.7 or r.bbox[2] < 37.9 or r.bbox[3] > 17.3 or r.bbox[4] > 46.0 then
      raise exception 'footprint % bbox %,%,%,% escapes the Italy window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 19 then raise exception 'expected to promote 19 footprints, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED'
   where publication_status = 'DRAFT' and canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)(\.|$)';
  get diagnostics n = row_count;
  if n <> 53 then raise exception 'expected to verify 53 new places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 19 then raise exception 'expected 19 current footprints, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('italy.marche','italy.lazio','italy.sardegna','italy.liguria','italy.calabria','italy.basilicata','italy.valle-d-aosta','italy.molise') and b.is_current;
  if n <> 8 then raise exception 'expected 8 current region blobs, got %', n; end if;

  select count(*) into n from wine_places where publication_status='VERIFIED' and canonical_key_locked_at is not null
   and canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)(\.|$)';
  if n <> 53 then raise exception 'expected 53 verified+locked new places, got %', n; end if;
end $$;

commit;
