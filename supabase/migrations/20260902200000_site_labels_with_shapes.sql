-- Name a shape as soon as it is drawn.
--
-- Vineyard sites were appearing one zoom before their labels, so there was a
-- band where you saw a dozen identically-coloured polygons with no way to tell
-- which was which. For a REGION that gap is fine (the shape is recognisable on
-- its own); for a single vineyard the name IS the information.
--
-- Applies to every country, not just Germany: France's 655 Burgundy climats and
-- 100+ other SITE rows had the same gap.

begin;

update wine_places
   set label_min_zoom = min_zoom
 where kind = 'SITE'
   and label_min_zoom > min_zoom;

do $$
declare v_gap int;
begin
  select count(*) into v_gap from wine_places
   where kind = 'SITE' and label_min_zoom > min_zoom;
  if v_gap <> 0 then
    raise exception '% SITE rows still label later than they draw', v_gap;
  end if;
end $$;

commit;
