-- Retire three Spanish DO boundaries so they rebuild from statute-checked lists.
--
-- These were the last of the 69 entries citing no pliego PDF -- the audit could
-- flag them as unverifiable but not check them. Locating each document (four on
-- mapa.gob.es, Tierra de Leon via its Consejo Regulador) found three wrong:
--
--   Bullas            "Ulea" was a FALSE INCLUSION: the pliego names it only
--                     inside "la Rambla de Ulea", a WATERCOURSE used to
--                     describe the Moratalla boundary. Ulea is a separate
--                     Murcia municipio outside the DO. Caravaca de la Cruz,
--                     which the pliego does name, was missing.
--   Ribera del Jucar  "Casas de los Pinos" was a false inclusion and "El
--                     Picazo" was missing -- a count-preserving substitution,
--                     which is exactly why expected_count never flagged it.
--   Tierra de Leon    Three missing (Fuentes de Carbajal, Palacios de la
--                     Valduerna, Villaornate y Castro) and "Cea" (24051) a
--                     false inclusion, almost certainly split out of "Santa
--                     Maria del Monte de Cea", the actual member.
--
-- Yecla (one municipio) and Cebreros (35) were verified correct and are not
-- touched; they only gained their citations.
--
-- The Ulea case is the third instance of one failure mode across this audit:
-- a name lifted from descriptive text -- a river, a pedania, a unidad
-- poblacional -- matched against the municipality register. Bocigas and
-- Velilla in Ribera del Duero were the same mistake.
--
-- Retires only. run-spain-dos.mjs skips any DO holding a current-VALIDATED
-- boundary, so this is what lets it rebuild through the same fail-closed
-- guards. Run run-spain-dos.mjs --commit for these three straight after.

begin;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in (
    'spain.murcia.bullas',
    'spain.castilla-la-mancha.ribera-del-jucar',
    'spain.castilla-y-leon.tierra-de-leon'
  )
  and b.is_current;

do $$
declare n int;
begin
  select count(*) into n from wine_place_boundaries b
  join wine_places p on p.id = b.wine_place_id
  where p.canonical_key in ('spain.murcia.bullas','spain.castilla-la-mancha.ribera-del-jucar',
                            'spain.castilla-y-leon.tierra-de-leon') and b.is_current;
  if n <> 0 then raise exception '% still hold a current boundary', n; end if;
  select count(*) into n from wine_place_boundaries b
  join wine_places p on p.id = b.wine_place_id
  where p.canonical_key in ('spain.murcia.bullas','spain.castilla-la-mancha.ribera-del-jucar',
                            'spain.castilla-y-leon.tierra-de-leon') and not b.is_current;
  if n < 3 then raise exception 'expected at least 3 retired boundaries, found %', n; end if;
end $$;

commit;
