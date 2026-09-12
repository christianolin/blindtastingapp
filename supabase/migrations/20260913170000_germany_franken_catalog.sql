-- Catalogue Franken, Germany's ninth Anbaugebiet on this map.
--
-- Where the delimitation came from matters, because it is not where Hessen's
-- came from. German wine law does not enumerate its own regions: BayWeinRAV § 1
-- says "Das Gebiet von geschützten geografischen Herkunftsangaben ist über die
-- Produktspezifikation abzugrenzen", and the Produktspezifikation is held by
-- the EU register. So eAmbrosia is not a convenience here, it is where the
-- boundary legally lives -- and it covers all 46 German wine GIs uniformly,
-- where Hessen's Weinbauamt info sheet was one state's bespoke publication.
--
--   WHICH Gemeinden  eAmbrosia PDO-DE-A1267, section 5 "ABGEGRENZTES GEBIET":
--                    138 Gemeinden across 12 Landkreise in 3 Regierungsbezirke,
--                    from Aschaffenburg in the west to Bamberg in the east.
--   WHICH LAND       Bavarian ATKIS Basis-DLM, land-use class Rebfläche.
--                    CC BY 4.0, open since 2023, no registration.
--
-- All 138 resolved against the survey register, which took some care: the legal
-- text and the register spell the same places differently ("Sand a. Main" for
-- "Sand a.Main", "Üttingen" for "Uettingen", "Viereth" for the merged
-- "Viereth-Trunstadt", "Haßloch" for "Hasloch"). The extractor reports anything
-- it cannot match rather than dropping it, because a Gemeinde that quietly
-- disappears shrinks the region with no other symptom.
--
-- 3 836 of Bavaria's 4 027 Rebfläche parcels fall inside those Gemeinden --
-- 7 043 ha against an official planted area of roughly 6 200, land use running
-- slightly ahead of planted vines exactly as it does in Hessen.
--
-- NOT catalogued: the three Bereiche (Maindreieck, Mainviereck, Steigerwald).
-- The specification does not enumerate them, and a place with no footprint
-- renders as nothing -- the condition 20260902220000_italy_missing_geometry
-- existed to repair.

begin;

insert into wine_places (
  canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom,
  publication_status, sort_order, is_appellation, appellation_system,
  appellation_level, primary_parent_id
)
select 'germany.franken', 'REGION', 'Franken', 'franken', 1, 4, 4,
       'VERIFIED', 60, true, 'g.U.', 'regional', p.id
from wine_places p
where p.canonical_key = 'germany'
on conflict (canonical_key) do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key = 'germany.franken';
  if n <> 1 then raise exception 'expected Franken to be catalogued once, got %', n; end if;

  select count(*) into n
    from wine_places c join wine_places p on p.id = c.primary_parent_id
   where c.canonical_key = 'germany.franken' and p.canonical_key = 'germany';
  if n <> 1 then raise exception 'Franken is not parented to germany'; end if;

  -- sort_order 60 places it between Mosel (50) and Nahe (70), which is where
  -- roughly 6 200 planted hectares belongs among the existing regions.
  select count(*) into n from wine_places
   where kind = 'REGION' and canonical_key like 'germany.%';
  if n <> 9 then raise exception 'expected 9 German Anbaugebiete, got %', n; end if;
end $$;

commit;
