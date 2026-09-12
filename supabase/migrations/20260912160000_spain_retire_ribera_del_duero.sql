-- Retire the Ribera del Duero boundary so it can be rebuilt from the pliego.
--
-- The previous entry was the only one of 69 citing a landing page rather than
-- a pliego PDF, and re-deriving the list from the actual document (PDO-ES-A0626,
-- section 4) found two FALSE INCLUSIONS -- the opposite of the omissions found
-- in Priorat, Montsant and Alicante.
--
-- The pliego's table pairs each INE municipio (3-digit code) with its unidades
-- poblacionales (6-digit codes). Matching that right-hand column against
-- municipality names, across provinces, produced:
--
--   'Bocigas' (47021, Valladolid)  <- really BOCIGAS DE PERALES, a pedania of
--                                     Langa de Duero (Soria, 42103)
--   'Velilla' (47190, Valladolid)  <- really VELILLA DE SAN ESTEBAN, a pedania
--                                     of San Esteban de Gormaz (Soria, 42162)
--
-- Both real parents were already in the list, so these two Valladolid
-- municipios were pure over-inclusion: territory ~80 km outside the DO.
--
-- Retires only. run-spain-dos.mjs skips any DO holding a current-VALIDATED
-- boundary, so this is what lets it rebuild through the same fail-closed
-- guards. Run run-spain-dos.mjs --commit --only ribera immediately after.

begin;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key = 'spain.castilla-y-leon.ribera-del-duero'
  and b.is_current;

do $$
declare n int;
begin
  select count(*) into n from wine_place_boundaries b
  join wine_places p on p.id = b.wine_place_id
  where p.canonical_key = 'spain.castilla-y-leon.ribera-del-duero' and b.is_current;
  if n <> 0 then raise exception 'ribera del duero still holds a current boundary'; end if;
  select count(*) into n from wine_place_boundaries b
  join wine_places p on p.id = b.wine_place_id
  where p.canonical_key = 'spain.castilla-y-leon.ribera-del-duero' and not b.is_current;
  if n < 1 then raise exception 'the retired boundary did not survive'; end if;
end $$;

commit;
