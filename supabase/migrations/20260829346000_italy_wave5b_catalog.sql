-- Wave 5b catalog (DRAFT): a SUBREGION grouping layer for three of the new
-- regions + second-tier appellations across all five. Existing flagship
-- appellations are re-parented under their new subregion. Footprints staged
-- separately (romagna-sangiovese and falanghina-del-sannio are region-wide,
-- tree-only).
--
--   Emilia-Romagna ├─ Romagna (SUBREGION) ├─ Romagna Albana*, Romagna Sangiovese
--                  └─ Emilia  (SUBREGION) ├─ Lambrusco di Sorbara*, Grasparossa*,
--                                          Colli Bolognesi Pignoletto, Gutturnio
--   Campania       ├─ Irpinia (SUBREGION) ├─ Taurasi*, Greco di Tufo*, Fiano*
--                  ├─ Sannio  (SUBREGION) ├─ Aglianico del Taburno, Falanghina del Sannio
--                  └─ Vesuvio (DOC, region-direct)
--   Puglia         ├─ Salento (SUBREGION) ├─ Primitivo di Manduria*, Salice Salentino*, Copertino
--                  └─ Central Puglia (SUBREGION) ├─ Castel del Monte*, Gioia del Colle, Locorotondo
--   Umbria         └─ Colli del Trasimeno, Colli Martani (region-direct)
--   Abruzzo        └─ Tullum (DOCG), Villamagna (region-direct)
--   (* = re-parented existing place)

begin;

-- 6 SUBREGION grouping nodes (geographic; not appellations themselves).
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'SUBREGION'::wine_place_kind, 2, 5, 5, false, null, null, 'DRAFT', v.so, p.id
  from (values
    ('romagna',        'italy.emilia-romagna.romagna',  'Romagna',        'italy.emilia-romagna', 5),
    ('emilia',         'italy.emilia-romagna.emilia',   'Emilia',         'italy.emilia-romagna', 6),
    ('irpinia',        'italy.campania.irpinia',        'Irpinia',        'italy.campania',       5),
    ('sannio',         'italy.campania.sannio',         'Sannio',         'italy.campania',       6),
    ('salento',        'italy.puglia.salento',          'Salento',        'italy.puglia',         5),
    ('central-puglia', 'italy.puglia.central-puglia',   'Central Puglia', 'italy.puglia',         6)
  ) as v(slug, ckey, name, parent, so)
  join wine_places p on p.canonical_key = v.parent;

-- 13 new APPELLATION nodes.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('romagna-sangiovese',       'italy.emilia-romagna.romagna-sangiovese',       'Romagna Sangiovese',       'DOC',  'regional',    40, 'italy.emilia-romagna.romagna'),
    ('colli-bolognesi-pignoletto','italy.emilia-romagna.colli-bolognesi-pignoletto','Colli Bolognesi Pignoletto','DOCG','subregional', 40, 'italy.emilia-romagna.emilia'),
    ('gutturnio',                'italy.emilia-romagna.gutturnio',                'Gutturnio',                'DOC',  'subregional', 50, 'italy.emilia-romagna.emilia'),
    ('aglianico-del-taburno',    'italy.campania.aglianico-del-taburno',          'Aglianico del Taburno',    'DOCG', 'subregional', 40, 'italy.campania.sannio'),
    ('falanghina-del-sannio',    'italy.campania.falanghina-del-sannio',          'Falanghina del Sannio',    'DOC',  'regional',    50, 'italy.campania.sannio'),
    ('vesuvio',                  'italy.campania.vesuvio',                        'Vesuvio',                  'DOC',  'subregional', 60, 'italy.campania'),
    ('copertino',                'italy.puglia.copertino',                        'Copertino',                'DOC',  'subregional', 40, 'italy.puglia.salento'),
    ('gioia-del-colle',          'italy.puglia.gioia-del-colle',                  'Gioia del Colle',          'DOC',  'subregional', 40, 'italy.puglia.central-puglia'),
    ('locorotondo',              'italy.puglia.locorotondo',                      'Locorotondo',              'DOC',  'subregional', 50, 'italy.puglia.central-puglia'),
    ('colli-del-trasimeno',      'italy.umbria.colli-del-trasimeno',              'Colli del Trasimeno',      'DOC',  'subregional', 40, 'italy.umbria'),
    ('colli-martani',            'italy.umbria.colli-martani',                    'Colli Martani',            'DOC',  'subregional', 50, 'italy.umbria'),
    ('tullum',                   'italy.abruzzo.tullum',                          'Tullum',                   'DOCG', 'subregional', 50, 'italy.abruzzo'),
    ('villamagna',               'italy.abruzzo.villamagna',                      'Villamagna',               'DOC',  'subregional', 60, 'italy.abruzzo')
  ) as v(slug, ckey, name, sys, lvl, so, parent)
  join wine_places p on p.canonical_key = v.parent;

-- Re-parent the 9 existing flagship appellations under their new subregion.
update wine_places child set primary_parent_id = sub.id
  from wine_places sub
 where sub.canonical_key = (case
     when child.canonical_key = 'italy.emilia-romagna.romagna-albana' then 'italy.emilia-romagna.romagna'
     when child.canonical_key in ('italy.emilia-romagna.lambrusco-di-sorbara','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro') then 'italy.emilia-romagna.emilia'
     when child.canonical_key in ('italy.campania.taurasi','italy.campania.greco-di-tufo','italy.campania.fiano-di-avellino') then 'italy.campania.irpinia'
     when child.canonical_key in ('italy.puglia.primitivo-di-manduria','italy.puglia.salice-salentino') then 'italy.puglia.salento'
     when child.canonical_key = 'italy.puglia.castel-del-monte' then 'italy.puglia.central-puglia'
   end)
   and child.canonical_key in (
     'italy.emilia-romagna.romagna-albana','italy.emilia-romagna.lambrusco-di-sorbara','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro',
     'italy.campania.taurasi','italy.campania.greco-di-tufo','italy.campania.fiano-di-avellino',
     'italy.puglia.primitivo-di-manduria','italy.puglia.salice-salentino','italy.puglia.castel-del-monte');

do $$
declare ns int; na int; nre int;
begin
  select count(*) into ns from wine_places where kind='SUBREGION' and publication_status='DRAFT'
    and canonical_key in ('italy.emilia-romagna.romagna','italy.emilia-romagna.emilia','italy.campania.irpinia','italy.campania.sannio','italy.puglia.salento','italy.puglia.central-puglia');
  if ns <> 6 then raise exception 'expected 6 new DRAFT subregions, got %', ns; end if;
  select count(*) into na from wine_places where kind='APPELLATION' and publication_status='DRAFT'
    and canonical_key in ('italy.emilia-romagna.romagna-sangiovese','italy.emilia-romagna.colli-bolognesi-pignoletto','italy.emilia-romagna.gutturnio','italy.campania.aglianico-del-taburno','italy.campania.falanghina-del-sannio','italy.campania.vesuvio','italy.puglia.copertino','italy.puglia.gioia-del-colle','italy.puglia.locorotondo','italy.umbria.colli-del-trasimeno','italy.umbria.colli-martani','italy.abruzzo.tullum','italy.abruzzo.villamagna');
  if na <> 13 then raise exception 'expected 13 new DRAFT appellations, got %', na; end if;
  select count(*) into nre from wine_places p join wine_places sub on sub.id=p.primary_parent_id
   where sub.kind='SUBREGION' and p.canonical_key in ('italy.emilia-romagna.romagna-albana','italy.emilia-romagna.lambrusco-di-sorbara','italy.emilia-romagna.lambrusco-grasparossa-di-castelvetro','italy.campania.taurasi','italy.campania.greco-di-tufo','italy.campania.fiano-di-avellino','italy.puglia.primitivo-di-manduria','italy.puglia.salice-salentino','italy.puglia.castel-del-monte');
  if nre <> 9 then raise exception 'expected 9 re-parented appellations, got %', nre; end if;
end $$;

commit;
