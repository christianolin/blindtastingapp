-- Piedmont batch 3 catalog (DRAFT): complete the Alto Piemonte subregion with
-- its 7 sibling DOCs. All Nebbiolo (Spanna)-based, all tier-3 under
-- italy.piemonte.alto-piemonte. Footprints from the official Regione Piemonte
-- dataset, staged separately.
--   Alto Piemonte
--   ├─ Gattinara, Ghemme (batch 1)
--   ├─ Boca, Bramaterra, Lessona, Fara, Sizzano  (communal)
--   ├─ Colline Novaresi  (regional umbrella, Novara)
--   └─ Coste della Sesia (regional umbrella, Biella/Vercelli)

begin;

insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, 'DOC', v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('boca',              'italy.piemonte.boca',              'Boca',              'communal', 30),
    ('bramaterra',        'italy.piemonte.bramaterra',        'Bramaterra',        'communal', 40),
    ('lessona',           'italy.piemonte.lessona',           'Lessona',           'communal', 50),
    ('fara',              'italy.piemonte.fara',              'Fara',              'communal', 60),
    ('sizzano',           'italy.piemonte.sizzano',           'Sizzano',           'communal', 70),
    ('colline-novaresi',  'italy.piemonte.colline-novaresi',  'Colline Novaresi',  'regional', 80),
    ('coste-della-sesia', 'italy.piemonte.coste-della-sesia', 'Coste della Sesia', 'regional', 90)
  ) as v(slug, ckey, name, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.alto-piemonte') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.boca','italy.piemonte.bramaterra','italy.piemonte.lessona','italy.piemonte.fara',
     'italy.piemonte.sizzano','italy.piemonte.colline-novaresi','italy.piemonte.coste-della-sesia'
   ) and publication_status = 'DRAFT';
  if n <> 7 then raise exception 'expected 7 new DRAFT batch-3 places, got %', n; end if;
end $$;

commit;
