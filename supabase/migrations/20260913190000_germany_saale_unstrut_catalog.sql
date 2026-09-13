-- Catalogue Saale-Unstrut, Germany's tenth Anbaugebiet on this map and, at
-- 52.44 N, its northernmost.
--
-- Delimitation comes from the same place Franken's did -- German wine law
-- delegates it to the Produktspezifikation, which the EU register holds -- but
-- Saale-Unstrut is the awkward case the earlier adapters did not have to
-- handle. eAmbrosia PDO-DE-A1275-AM01, section 5 "ABGEGRENZTES GEBIET", names
-- its area at three different levels across THREE Länder:
--
--   Landkreise        Burgenlandkreis, Harz, Mansfeld-Südharz, Saalekreis and
--                     Salzlandkreis in Sachsen-Anhalt; Weimarer Land,
--                     Saale-Holzland-Kreis, Saalfeld-Rudolstadt, Sömmerda and
--                     Unstrut-Hainich-Kreis in Thüringen.
--   kreisfreie Städte Jena and Erfurt.
--   Ortsteile         Schöndorf and Tiefurt -- parts of Weimar, not the city.
--   Gemarkungen       Werder/Havel, Phöben, Plessow and Neu Töplitz, of Stadt
--                     Werder (Havel) in Landkreis Potsdam-Mittelmark. That is
--                     in BRANDENBURG, 106 km from the nearest other part of
--                     the region, and it is why this footprint has a detached
--                     northern lobe.
--
-- Naming a Landkreis is not naming a zone -- the five Sachsen-Anhalt ones alone
-- come to some 780 000 ha -- so the geometry is the vineyard land inside them,
-- the same clip Franken and Hessen use, and for the same reason. 894 ha of
-- recorded vineyard land against the roughly 850 ha Saale-Unstrut is usually
-- credited with, land use running a little ahead of planted vines as it does
-- everywhere else on this map.
--
-- WHERE THE LAND CAME FROM. Each state publishes something different and all
-- three publish it openly (dl-de/by-2-0), with no institute to email:
--
--   ST  LVermGeo Basis-DLM, statewide.
--   TH  TLBG Basis-DLM for the Kreise; TLBG ALKIS for Schöndorf and Tiefurt,
--       because Basis-DLM stops at the Gemeinde and has no Ortsteil at all.
--   BB  LGB ALKIS for Potsdam-Mittelmark. Brandenburg publishes no open
--       Basis-DLM, but ALKIS is the better source here anyway: Gemarkungen are
--       cadastral districts and Basis-DLM does not carry them.
--
-- NOT catalogued: the Bereiche or the Großlagen. The specification does not
-- enumerate them, and a place with no footprint renders as nothing -- the
-- condition 20260902220000 existed to repair.

begin;

insert into wine_places (
  canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom,
  publication_status, sort_order, is_appellation, appellation_system,
  appellation_level, primary_parent_id
)
select 'germany.saale-unstrut', 'REGION', 'Saale-Unstrut', 'saale-unstrut', 1, 4, 4,
       'VERIFIED', 90, true, 'g.U.', 'regional', p.id
from wine_places p
where p.canonical_key = 'germany'
on conflict (canonical_key) do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key = 'germany.saale-unstrut';
  if n <> 1 then raise exception 'expected Saale-Unstrut to be catalogued once, got %', n; end if;

  select count(*) into n
    from wine_places c join wine_places p on p.id = c.primary_parent_id
   where c.canonical_key = 'germany.saale-unstrut' and p.canonical_key = 'germany';
  if n <> 1 then raise exception 'Saale-Unstrut is not parented to germany'; end if;

  -- sort_order 90 puts it between Rheingau (80) and Ahr (100), which is where
  -- roughly 850 planted hectares belongs among the existing regions.
  select count(*) into n from wine_places
   where kind = 'REGION' and canonical_key like 'germany.%';
  if n <> 10 then raise exception 'expected 10 German Anbaugebiete, got %', n; end if;
end $$;

commit;
