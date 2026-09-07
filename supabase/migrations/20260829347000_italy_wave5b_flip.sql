-- Wave 5b flip: promote the 11 new appellation footprints and verify all 19 new
-- places (6 subregions + 13 appellations). The subregions are tree-only grouping
-- nodes; Romagna Sangiovese and Falanghina del Sannio are region-wide tree-only
-- appellations. Namespace-agnostic. Fail-closed.

begin;

do $$
declare
  r record;
  n int;
  footprints text[] := array[
    'italy.emilia-romagna.colli-bolognesi-pignoletto','italy.emilia-romagna.gutturnio',
    'italy.campania.aglianico-del-taburno','italy.campania.vesuvio',
    'italy.puglia.copertino','italy.puglia.gioia-del-colle','italy.puglia.locorotondo',
    'italy.umbria.colli-del-trasimeno','italy.umbria.colli-martani',
    'italy.abruzzo.tullum','italy.abruzzo.villamagna'
  ];
  newplaces text[] := array[
    'italy.emilia-romagna.romagna','italy.emilia-romagna.emilia','italy.campania.irpinia','italy.campania.sannio','italy.puglia.salento','italy.puglia.central-puglia',
    'italy.emilia-romagna.romagna-sangiovese','italy.emilia-romagna.colli-bolognesi-pignoletto','italy.emilia-romagna.gutturnio',
    'italy.campania.aglianico-del-taburno','italy.campania.falanghina-del-sannio','italy.campania.vesuvio',
    'italy.puglia.copertino','italy.puglia.gioia-del-colle','italy.puglia.locorotondo',
    'italy.umbria.colli-del-trasimeno','italy.umbria.colli-martani',
    'italy.abruzzo.tullum','italy.abruzzo.villamagna'
  ];
begin
  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT';
  if n <> 11 then raise exception 'expected 11 DRAFT wave-5b footprints, got %', n; end if;

  n := 0;
  for r in
    select b.id, p.canonical_key ck, b.bbox from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
     where p.canonical_key = any(footprints) and b.quality_status = 'DRAFT'
  loop
    if r.bbox[1] < 9.0 or r.bbox[2] < 39.7 or r.bbox[3] > 18.6 or r.bbox[4] > 45.2 then
      raise exception 'footprint % bbox %,%,%,% escapes the peninsular-Italy window', r.ck, r.bbox[1], r.bbox[2], r.bbox[3], r.bbox[4];
    end if;
    update wine_place_boundaries set quality_status = 'VALIDATED', is_current = true, reviewed_at = now() where id = r.id;
    n := n + 1;
  end loop;
  if n <> 11 then raise exception 'expected to promote 11 footprints, got %', n; end if;

  update wine_places set publication_status = 'VERIFIED' where canonical_key = any(newplaces) and publication_status = 'DRAFT';
  get diagnostics n = row_count;
  if n <> 19 then raise exception 'expected to verify 19 new places, got %', n; end if;

  select count(*) into n from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = any(footprints) and b.is_current and b.quality_status = 'VALIDATED';
  if n <> 11 then raise exception 'expected 11 current footprints, got %', n; end if;

  select count(*) into n from wine_places where canonical_key = any(newplaces) and publication_status = 'VERIFIED' and canonical_key_locked_at is not null;
  if n <> 19 then raise exception 'expected 19 verified+locked new places, got %', n; end if;
end $$;

commit;
