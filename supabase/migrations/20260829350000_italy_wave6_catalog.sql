-- Wave 6 catalog (DRAFT): the final 8 Italian regions (Marche, Lazio, Sardegna,
-- Liguria, Calabria, Basilicata, Valle d'Aosta, Molise) with a subregion layer +
-- flagship appellations. Comune-union footprints staged separately; region-wide
-- or boundary-defined denominations (Verdicchio dei Castelli di Jesi, Rosso
-- Piceno, Cannonau/Vermentino di Sardegna, Riviera Ligure di Ponente, Savuto,
-- Matera, Valle d'Aosta DOC, Tintilia del Molise) are tree-only.

begin;

-- 8 REGION nodes.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'REGION'::wine_place_kind, 1, 4, 4, false, null, null, 'DRAFT', v.so, p.id
  from (values
    ('marche','italy.marche','Marche',130),
    ('lazio','italy.lazio','Lazio',140),
    ('sardegna','italy.sardegna','Sardegna',150),
    ('liguria','italy.liguria','Liguria',160),
    ('calabria','italy.calabria','Calabria',170),
    ('basilicata','italy.basilicata','Basilicata',180),
    ('valle-d-aosta','italy.valle-d-aosta','Valle d''Aosta',190),
    ('molise','italy.molise','Molise',200)
  ) as v(slug, ckey, name, so)
  cross join (select id from wine_places where canonical_key = 'italy') p;

-- 17 SUBREGION grouping nodes.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'SUBREGION'::wine_place_kind, 2, 5, 5, false, null, null, 'DRAFT', v.so, p.id
  from (values
    ('castelli-di-jesi','italy.marche.castelli-di-jesi','Castelli di Jesi','italy.marche',5),
    ('matelica','italy.marche.matelica','Matelica','italy.marche',6),
    ('piceno','italy.marche.piceno','Piceno','italy.marche',7),
    ('castelli-romani','italy.lazio.castelli-romani','Castelli Romani','italy.lazio',5),
    ('ciociaria','italy.lazio.ciociaria','Ciociaria','italy.lazio',6),
    ('alta-tuscia','italy.lazio.alta-tuscia','Alta Tuscia','italy.lazio',7),
    ('gallura','italy.sardegna.gallura','Gallura','italy.sardegna',5),
    ('sulcis','italy.sardegna.sulcis','Sulcis','italy.sardegna',6),
    ('oristano','italy.sardegna.oristano','Oristano','italy.sardegna',7),
    ('riviera-di-ponente','italy.liguria.riviera-di-ponente','Riviera di Ponente','italy.liguria',5),
    ('riviera-di-levante','italy.liguria.riviera-di-levante','Riviera di Levante','italy.liguria',6),
    ('ionio-crotonese','italy.calabria.ionio-crotonese','Cirò e Ionio Crotonese','italy.calabria',5),
    ('locride','italy.calabria.locride','Locride','italy.calabria',6),
    ('vulture','italy.basilicata.vulture','Vulture','italy.basilicata',5),
    ('valdigne','italy.valle-d-aosta.valdigne','Valdigne','italy.valle-d-aosta',5),
    ('basse-vallee','italy.valle-d-aosta.basse-vallee','Basse Vallée','italy.valle-d-aosta',6),
    ('basso-molise','italy.molise.basso-molise','Basso Molise','italy.molise',5)
  ) as v(slug, ckey, name, parent, so)
  join wine_places p on p.canonical_key = v.parent;

-- 28 APPELLATION nodes.
insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION'::wine_place_kind, 2, 6, 6, true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('verdicchio-dei-castelli-di-jesi','italy.marche.verdicchio-dei-castelli-di-jesi','Verdicchio dei Castelli di Jesi','DOC','subregional',10,'italy.marche.castelli-di-jesi'),
    ('verdicchio-di-matelica','italy.marche.verdicchio-di-matelica','Verdicchio di Matelica','DOC','subregional',10,'italy.marche.matelica'),
    ('conero','italy.marche.conero','Conero','DOCG','subregional',20,'italy.marche'),
    ('rosso-piceno','italy.marche.rosso-piceno','Rosso Piceno','DOC','regional',10,'italy.marche.piceno'),
    ('offida','italy.marche.offida','Offida','DOCG','subregional',20,'italy.marche.piceno'),
    ('frascati','italy.lazio.frascati','Frascati','DOC','subregional',10,'italy.lazio.castelli-romani'),
    ('marino','italy.lazio.marino','Marino','DOC','subregional',20,'italy.lazio.castelli-romani'),
    ('cesanese-del-piglio','italy.lazio.cesanese-del-piglio','Cesanese del Piglio','DOCG','subregional',10,'italy.lazio.ciociaria'),
    ('est-est-est-di-montefiascone','italy.lazio.est-est-est-di-montefiascone','Est! Est!! Est!!! di Montefiascone','DOC','subregional',10,'italy.lazio.alta-tuscia'),
    ('vermentino-di-gallura','italy.sardegna.vermentino-di-gallura','Vermentino di Gallura','DOCG','subregional',10,'italy.sardegna.gallura'),
    ('carignano-del-sulcis','italy.sardegna.carignano-del-sulcis','Carignano del Sulcis','DOC','subregional',10,'italy.sardegna.sulcis'),
    ('vernaccia-di-oristano','italy.sardegna.vernaccia-di-oristano','Vernaccia di Oristano','DOC','subregional',10,'italy.sardegna.oristano'),
    ('cannonau-di-sardegna','italy.sardegna.cannonau-di-sardegna','Cannonau di Sardegna','DOC','regional',30,'italy.sardegna'),
    ('vermentino-di-sardegna','italy.sardegna.vermentino-di-sardegna','Vermentino di Sardegna','DOC','regional',40,'italy.sardegna'),
    ('rossese-di-dolceacqua','italy.liguria.rossese-di-dolceacqua','Rossese di Dolceacqua','DOC','subregional',10,'italy.liguria.riviera-di-ponente'),
    ('riviera-ligure-di-ponente','italy.liguria.riviera-ligure-di-ponente','Riviera Ligure di Ponente','DOC','regional',20,'italy.liguria.riviera-di-ponente'),
    ('cinque-terre','italy.liguria.cinque-terre','Cinque Terre','DOC','subregional',10,'italy.liguria.riviera-di-levante'),
    ('colli-di-luni','italy.liguria.colli-di-luni','Colli di Luni','DOC','subregional',20,'italy.liguria.riviera-di-levante'),
    ('ciro','italy.calabria.ciro','Cirò','DOC','subregional',10,'italy.calabria.ionio-crotonese'),
    ('greco-di-bianco','italy.calabria.greco-di-bianco','Greco di Bianco','DOC','communal',10,'italy.calabria.locride'),
    ('savuto','italy.calabria.savuto','Savuto','DOC','subregional',20,'italy.calabria'),
    ('aglianico-del-vulture','italy.basilicata.aglianico-del-vulture','Aglianico del Vulture','DOC','subregional',10,'italy.basilicata.vulture'),
    ('matera','italy.basilicata.matera','Matera','DOC','regional',20,'italy.basilicata'),
    ('blanc-de-morgex-et-de-la-salle','italy.valle-d-aosta.blanc-de-morgex-et-de-la-salle','Blanc de Morgex et de La Salle','DOC','subregional',10,'italy.valle-d-aosta.valdigne'),
    ('donnas','italy.valle-d-aosta.donnas','Donnas','DOC','subregional',10,'italy.valle-d-aosta.basse-vallee'),
    ('valle-d-aosta-doc','italy.valle-d-aosta.valle-d-aosta-doc','Valle d''Aosta','DOC','regional',30,'italy.valle-d-aosta'),
    ('biferno','italy.molise.biferno','Biferno','DOC','subregional',10,'italy.molise.basso-molise'),
    ('tintilia-del-molise','italy.molise.tintilia-del-molise','Tintilia del Molise','DOC','regional',20,'italy.molise')
  ) as v(slug, ckey, name, sys, lvl, so, parent)
  join wine_places p on p.canonical_key = v.parent;

do $$
declare nr int; ns int; na int;
begin
  select count(*) into nr from wine_places where kind='REGION' and publication_status='DRAFT' and canonical_key in ('italy.marche','italy.lazio','italy.sardegna','italy.liguria','italy.calabria','italy.basilicata','italy.valle-d-aosta','italy.molise');
  if nr <> 8 then raise exception 'expected 8 new DRAFT regions, got %', nr; end if;
  select count(*) into ns from wine_places where kind='SUBREGION' and publication_status='DRAFT' and canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)\.';
  if ns <> 17 then raise exception 'expected 17 new DRAFT subregions, got %', ns; end if;
  select count(*) into na from wine_places where kind='APPELLATION' and publication_status='DRAFT' and canonical_key ~ '^italy\.(marche|lazio|sardegna|liguria|calabria|basilicata|valle-d-aosta|molise)\.';
  if na <> 28 then raise exception 'expected 28 new DRAFT appellations, got %', na; end if;
end $$;

commit;
