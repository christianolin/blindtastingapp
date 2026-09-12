-- Retire three Spanish DO boundaries whose membership lists were found
-- incomplete by an audit against the pliegos they cite.
--
-- spain-do-membership.json's own readme warns that the build guards "CANNOT
-- detect a plausible-but-incomplete list": expected_count is written by the
-- same pass that writes the list, so an omission matches itself and every
-- guard passes. Re-reading the cited pliegos found that happening three times:
--
--   Priorat   The pliego includes "la parte este del municipio del Molar" by
--             poligono, immediately after the Falset partial. Only Falset was
--             captured. 10 municipios where the pliego names 11.
--   Montsant  Same municipality, same omission: El Molar is listed under "Y, en
--             parte, los terminos municipales siguientes" alongside Falset, and
--             only Falset was captured. 13 where the pliego names 14.
--   Alicante  The list covered four of the pliego's SEVEN subzones. Bajo
--             Vinalopo, La Marina Alta, La Marina Baja and El Comtat were
--             missing entirely -- the DO is roughly three times the area that
--             was mapped. 34 municipios where the pliego names 111.
--
-- The pattern in the first two is worth naming: where a pliego lists more than
-- one partial-inclusion municipality, the ones after the first were dropped.
--
-- This migration only RETIRES; it does not insert. run-spain-dos.mjs skips any
-- DO that already holds a current-VALIDATED boundary, so retiring here is what
-- lets it re-resolve, re-dissolve and re-promote from the corrected lists,
-- through the same fail-closed guards as the original run. Retiring rather
-- than deleting keeps the mistake in the boundary history.
--
-- Between this migration and that run these three DOs have no current
-- boundary and will not export to tiles. Run run-spain-dos.mjs --commit
-- immediately after applying.

begin;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in (
    'spain.cataluna.priorat',
    'spain.cataluna.montsant',
    'spain.valencia.alicante'
  )
  and b.is_current;

do $$
declare n int;
begin
  select count(*) into n
  from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
  where p.canonical_key in ('spain.cataluna.priorat', 'spain.cataluna.montsant',
                            'spain.valencia.alicante')
    and b.is_current;
  if n <> 0 then raise exception '% of the three audited DOs still hold a current boundary', n; end if;

  -- The retired rows must survive: they are the record of what was shipped.
  select count(*) into n
  from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
  where p.canonical_key in ('spain.cataluna.priorat', 'spain.cataluna.montsant',
                            'spain.valencia.alicante')
    and not b.is_current;
  if n < 3 then raise exception 'expected at least 3 retired boundaries, found %', n; end if;
end $$;

commit;
