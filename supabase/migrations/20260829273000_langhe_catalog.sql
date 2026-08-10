-- Langhe subregion + its appellation places (DRAFT).
--
-- Adds the Langhe SUBREGION under Piemonte (it doubles as the Langhe DOC), and
-- the Langhe denomination places. Barolo & Barbaresco already exist (tier 2 under
-- piemonte) and are re-parented to tier 3 under Langhe in the later flip, not here
-- (re-parenting belongs in the flip so the exporter never sees a cru under a
-- boundaryless parent). All rows DRAFT until the reviewed flip.
--
-- Footprints (official Regione Piemonte data) are staged separately for: langhe,
-- dogliani, diano-dalba, verduno-pelaverga (+ re-staged barolo/barbaresco). The
-- three broad grape-DOCs (barbera-dalba, dolcetto-dalba, nebbiolo-dalba) are
-- catalog/Details entries under Langhe with NO own footprint ("crisp" map).

begin;

-- Langhe SUBREGION (tier 2, = Langhe DOC)
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select 'langhe', 'italy.piemonte.langhe', 'Langhe', 'SUBREGION', 2, 5, 5,
       true, 'DOC', 'subregional', 'DRAFT', 10, id
  from wine_places where canonical_key = 'italy.piemonte';

-- Appellation places under Langhe (tier 3). appellation_level: communal for the
-- crisp place-zones, subregional for the broad grape-DOCs.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id
)
select v.slug, v.ckey, v.name, 'APPELLATION', 3, 7, 7,
       true, v.sys, v.lvl, 'DRAFT', v.so, p.id
  from (values
    ('dogliani',          'italy.piemonte.dogliani',          'Dogliani',          'DOCG', 'communal',    10),
    ('diano-dalba',       'italy.piemonte.diano-dalba',       'Diano d''Alba',     'DOCG', 'communal',    20),
    ('verduno-pelaverga', 'italy.piemonte.verduno-pelaverga', 'Verduno Pelaverga', 'DOC',  'communal',    30),
    ('barbera-dalba',     'italy.piemonte.barbera-dalba',     'Barbera d''Alba',   'DOC',  'subregional', 40),
    ('dolcetto-dalba',    'italy.piemonte.dolcetto-dalba',    'Dolcetto d''Alba',  'DOC',  'subregional', 50),
    ('nebbiolo-dalba',    'italy.piemonte.nebbiolo-dalba',    'Nebbiolo d''Alba',  'DOC',  'subregional', 60)
  ) as v(slug, ckey, name, sys, lvl, so)
  cross join (select id from wine_places where canonical_key = 'italy.piemonte.langhe') p;

-- same-transaction assertions
do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'italy.piemonte.langhe','italy.piemonte.dogliani','italy.piemonte.diano-dalba',
     'italy.piemonte.verduno-pelaverga','italy.piemonte.barbera-dalba',
     'italy.piemonte.dolcetto-dalba','italy.piemonte.nebbiolo-dalba'
   ) and publication_status = 'DRAFT';
  if n <> 7 then raise exception 'expected 7 new DRAFT langhe places, got %', n; end if;
end $$;

commit;
