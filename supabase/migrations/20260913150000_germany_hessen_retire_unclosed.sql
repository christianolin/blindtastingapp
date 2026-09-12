-- Retire the five Hessian boundaries promoted by 20260913140000 so they can be
-- rebuilt with the morphological close the rest of Germany already uses.
--
-- What was wrong with them: the geometry was the RAW vineyard clip. That is the
-- honest planted extent, but it is not a usable region outline -- Rheingau came
-- out as 116 disconnected pieces. Beside it, Ahr renders as one solid shape
-- despite having a SIXTH of the Rheingau's planted area, because
-- build-germany-anbaugebiete.mjs closes the six Rheinland-Pfalz Anbaugebiete
-- (buffer +0.012°, then -0.008°) and says so plainly in its own header: the
-- close "deliberately INFLATES the area relative to the true planted parcels".
--
-- Publishing the Rheingau raw would have put two regions of the same country on
-- different cartographic principles, so the region a taster is most likely to
-- look for would have been the one that rendered as a scatter of specks.
--
-- The rebuild applies the same close with the same constants. The resulting
-- inflation lands where the existing regions already sit:
--
--   Hessische Bergstraße   567 ha planted -> 3 784 shown   (6.7x)
--   Ahr                    560 ha planted -> 3 878 shown   (6.9x)
--   Rheingau             3 696 ha planted -> 11 052 shown  (3.0x)
--   Rheinhessen         27 000 ha planted -> 102 100 shown (3.8x)
--
-- Planted extent is not lost: it is carried into generation_parameters as
-- hectares_planted, which is what the promotion migration bands.

begin;

update wine_place_boundaries b
set is_current = false
from wine_places p
where p.id = b.wine_place_id
  and p.canonical_key in (
    'germany.rheingau',
    'germany.hessische-bergstrasse',
    'germany.rheingau.johannisberg',
    'germany.hessische-bergstrasse.starkenburg',
    'germany.hessische-bergstrasse.umstadt'
  )
  and b.is_current;

do $$
declare n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where (p.canonical_key like 'germany.rheingau%'
          or p.canonical_key like 'germany.hessische-bergstrasse%')
     and b.is_current;
  if n <> 0 then raise exception 'expected 0 current Hessian boundaries after retirement, got %', n; end if;
end $$;

commit;
