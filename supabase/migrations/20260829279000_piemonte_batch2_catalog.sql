-- Piedmont batch 2 catalog (DRAFT): 2 cross-province tier-2 appellations +
-- 3 Monferrato reds. All footprints from the official Regione Piemonte dataset,
-- staged separately. Tidy hierarchy (no new grouping nodes):
--   Piemonte
--   ├─ Alta Langa (appellation, DOCG — traditional-method sparkling)
--   ├─ Colli Tortonesi (appellation, DOC — Timorasso / Derthona)
--   └─ Monferrato
--      ├─ Ruché di Castagnole Monferrato (DOCG)
--      ├─ Grignolino d'Asti (DOC)
--      └─ Grignolino del Monferrato Casalese (DOC)

begin;

-- Tier-2 appellations under Piemonte.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('alta-langa',      'italy.piemonte.alta-langa',      'Alta Langa',      'DOCG', 'regional',    60),
    ('colli-tortonesi', 'italy.piemonte.colli-tortonesi', 'Colli Tortonesi', 'DOC',  'subregional', 70)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte') p;

-- Tier-3 appellations under Monferrato (mixed DOCG/DOC).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 3, 7, 7, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('ruche',               'italy.piemonte.ruche',               'Ruché di Castagnole Monferrato',    'DOCG', 'communal',    50),
    ('grignolino-dasti',    'italy.piemonte.grignolino-dasti',    'Grignolino d''Asti',                'DOC',  'subregional', 60),
    ('grignolino-casalese', 'italy.piemonte.grignolino-casalese', 'Grignolino del Monferrato Casalese','DOC',  'subregional', 70)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.monferrato') p;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.alta-langa','italy.piemonte.colli-tortonesi','italy.piemonte.ruche',
     'italy.piemonte.grignolino-dasti','italy.piemonte.grignolino-casalese'
   ) and publication_status = 'DRAFT';
  if n <> 5 then raise exception 'expected 5 new DRAFT batch-2 places, got %', n; end if;
end $$;

commit;
