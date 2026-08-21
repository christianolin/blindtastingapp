-- Push Germany's zoom ladder deeper so detail arrives gradually.
--
-- Germany shipped 5 zoom levels shallower than France for the equivalent tier,
-- which is why the map looked like static: 1,583 Einzellagen were appearing at
-- z9, while France's 655 Burgundy climats — the same kind of object — only
-- appear at z14. Every German tier below the region was similarly early.
--
--   tier                      before -> after     France's comparable tier
--   Anbaugebiet (REGION)      4  -> 4             region 4          (unchanged)
--   Bereich (SUBREGION)       6  -> 7             subregion 6-7
--   Großlage (APPELLATION)    7  -> 9             appellation 7-10
--   Einzellage (SITE)         9  -> 12            site 12 / 14
--
-- Einzellagen land at 12 rather than 14 because they are markedly larger than a
-- Burgundy climat (a whole hillside vs a single named parcel), so they stay
-- legible a couple of zooms earlier.
--
-- Labels trail their polygon by one zoom so a shape appears before its name
-- crowds the view.

begin;

update wine_places set min_zoom = 7, label_min_zoom = 7
 where canonical_key like 'germany.%' and display_tier = 2;

update wine_places set min_zoom = 9, label_min_zoom = 9
 where canonical_key like 'germany.%' and display_tier = 3;

update wine_places set min_zoom = 12, label_min_zoom = 13
 where canonical_key like 'germany.%' and display_tier = 4;

do $$
declare v_b int; v_g int; v_e int;
begin
  select count(*) into v_b from wine_places
   where canonical_key like 'germany.%' and display_tier = 2 and min_zoom = 7;
  select count(*) into v_g from wine_places
   where canonical_key like 'germany.%' and display_tier = 3 and min_zoom = 9;
  select count(*) into v_e from wine_places
   where canonical_key like 'germany.%' and display_tier = 4 and min_zoom = 12;
  if v_b <> 13 then raise exception 'expected 13 Bereiche at z7, got %', v_b; end if;
  if v_g <> 83 then raise exception 'expected 83 Großlagen at z9, got %', v_g; end if;
  if v_e <> 1583 then raise exception 'expected 1583 Einzellagen at z12, got %', v_e; end if;
end $$;

commit;
