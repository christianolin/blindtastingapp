-- Spain wave 10: six more Cataluña DOPs (the anchor-miss DOs, now sourced by
-- reading each pliego's "Demarcación de la zona geográfica" directly).
--
-- From official MAPA pliegos (whole-municipality unions):
--   Penedès (61)          - Barcelona + Tarragona; 'Cabrera d'Igualada' = renamed
--                           INE Cabrera d'Anoia (08028).
--   Terra Alta (12)       - the 12 municipios of the comarca (Tarragona).
--   Empordà (55)          - Alt Empordà (35) + Baix Empordà (20), all Girona.
--   Conca de Barberà (14) - Tarragona; the historical out-of-zone parcels dropped.
--   Alella (31)           - Barcelona (Maresme/Vallès); tiny DO, whole-municipality
--                           over-approximation documented in the artifact.
--   Pla de Bages (35)     - Barcelona (comarca del Bages).
-- cataluna REGION already exists (from the Priorat wave). All regional DOPs ->
-- APPELLATION tier 2 (6/6), DRAFT; run-spain-dos.mjs promotes each from its
-- pliego municipality union.

begin;

insert into wine_places (slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom, is_appellation, appellation_system, appellation_level, publication_status, sort_order, primary_parent_id)
select v.slug, v.ckey, v.name, 'APPELLATION', 2, 6, 6, true, 'DOP', 'regional', 'DRAFT', v.so, p.id
  from (values
    ('penedes', 'spain.cataluna.penedes', 'Penedès', 30),
    ('terra-alta', 'spain.cataluna.terra-alta', 'Terra Alta', 40),
    ('emporda', 'spain.cataluna.emporda', 'Empordà', 50),
    ('conca-de-barbera', 'spain.cataluna.conca-de-barbera', 'Conca de Barberà', 60),
    ('alella', 'spain.cataluna.alella', 'Alella', 70),
    ('pla-de-bages', 'spain.cataluna.pla-de-bages', 'Pla de Bages', 80)
  ) as v(slug, ckey, name, so)
  cross join wine_places p
 where p.canonical_key = 'spain.cataluna';

do $$
declare v int;
begin
  select count(*) into v from wine_places
   where canonical_key in (
     'spain.cataluna.penedes', 'spain.cataluna.terra-alta', 'spain.cataluna.emporda',
     'spain.cataluna.conca-de-barbera', 'spain.cataluna.alella', 'spain.cataluna.pla-de-bages'
   ) and kind = 'APPELLATION' and publication_status = 'DRAFT';
  if v <> 6 then raise exception 'expected 6 new DRAFT Cataluña DOs, got %', v; end if;
end $$;

commit;
