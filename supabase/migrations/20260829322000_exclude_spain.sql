-- Park Spain: it was added to the catalog prematurely ("not doing Spain yet").
-- Set it to EXCLUDED so it drops out of the tile export / map without deleting
-- the row (reversible — flip back to VERIFIED when Spain work actually starts).
-- Tolerant of absence so a fresh DB without the stray row is unaffected.

begin;

update wine_places set publication_status = 'EXCLUDED'
 where canonical_key = 'spain' and publication_status <> 'EXCLUDED';

-- Its boundary is no longer current on an excluded place (belt-and-braces: the
-- export ignores excluded places, but keep the boundary non-current too).
update wine_place_boundaries b set is_current = false
 from wine_places p
 where b.wine_place_id = p.id and p.canonical_key = 'spain' and b.is_current;

commit;
