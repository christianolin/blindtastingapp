-- Catalogue the two Hessian Anbaugebiete and their three Bereiche.
--
-- Germany has carried six of its thirteen Anbaugebiete since the map was built,
-- and the six were not a wine decision: they are exactly the ones inside
-- Rheinland-Pfalz, because the RLP Weinbergsrolle is the only vineyard register
-- any German state publishes openly. Rheingau has had no place at all on the
-- map -- arguably the most consequential German region after Mosel for a blind
-- taster, and simply absent.
--
-- Rheingau and Hessische Bergstraße are now buildable because the two things
-- needed exist separately and openly:
--
--   WHICH Gemeinden  Regierungspräsidium Darmstadt, Dezernat Weinbau Eltville,
--                    "Info-Blatt: Geographische Angaben", recorded in
--                    data/wine-map/hessen-weinbau-membership.json
--   WHICH LAND       ATKIS Basis-DLM AX_Landwirtschaft, vegetationsmerkmal
--                    1040 (Rebfläche), free under § 24 HVGG
--
-- The Bereich list is the statute's own and is not tidied: Bereich Johannisberg
-- covers ten Gemeinden where the Rheingau Anbaugebiet covers twelve. Frankfurt
-- am Main and Felsberg carry Lohrberger Hang and Böddiger Berg, which belong to
-- the Anbaugebiet but to no Bereich. The built geometry reproduces that exactly:
-- Rheingau is 3 696.3 ha and Johannisberg 3 693.4 ha, the 2.9 ha difference
-- being those two sites.
--
-- NOT catalogued here: the 16 Großlagen and ~130 Einzellagen the same Info-Blatt
-- names. No open source gives them geometry, and a place without a footprint
-- renders as nothing -- the exact condition 20260902220000_italy_missing_geometry
-- had to repair. They stay out until a boundary source exists for them.

begin;

-- Two statements, not one. A single INSERT ... SELECT cannot join to rows the
-- same statement is inserting, so the Bereiche would find no parent and be
-- dropped silently -- the assertions below caught exactly that.

-- 1. The Anbaugebiete. sort_order slots them by vineyard area: between Nahe
--    (70) and Ahr (100) for the Rheingau, after Mittelrhein (120) for the
--    Bergstraße.
insert into wine_places (
  canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom,
  publication_status, sort_order, is_appellation, appellation_system,
  appellation_level, primary_parent_id
)
select v.canonical_key, v.kind::wine_place_kind, v.name, v.slug, v.display_tier,
       v.min_zoom, v.label_min_zoom, 'VERIFIED', v.sort_order, true, 'g.U.',
       v.appellation_level, p.id
from (values
  ('germany.rheingau', 'REGION', 'Rheingau', 'rheingau', 1, 4::numeric, 4::numeric, 80, 'regional', 'germany'),
  ('germany.hessische-bergstrasse', 'REGION', 'Hessische Bergstraße', 'hessische-bergstrasse', 1, 4, 4, 130, 'regional', 'germany')
) as v(canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom, sort_order, appellation_level, parent_key)
join wine_places p on p.canonical_key = v.parent_key
on conflict (canonical_key) do nothing;

-- 2. The Bereiche, now that their parents exist.
insert into wine_places (
  canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom,
  publication_status, sort_order, is_appellation, appellation_system,
  appellation_level, primary_parent_id
)
select v.canonical_key, v.kind::wine_place_kind, v.name, v.slug, v.display_tier,
       v.min_zoom, v.label_min_zoom, 'VERIFIED', v.sort_order, true, 'g.U.',
       v.appellation_level, p.id
from (values
  ('germany.rheingau.johannisberg', 'SUBREGION', 'Johannisberg', 'johannisberg', 2, 7::numeric, 7::numeric, 10, 'subregional', 'germany.rheingau'),
  ('germany.hessische-bergstrasse.starkenburg', 'SUBREGION', 'Starkenburg', 'starkenburg', 2, 7, 7, 10, 'subregional', 'germany.hessische-bergstrasse'),
  ('germany.hessische-bergstrasse.umstadt', 'SUBREGION', 'Umstadt', 'umstadt', 2, 7, 7, 20, 'subregional', 'germany.hessische-bergstrasse')
) as v(canonical_key, kind, name, slug, display_tier, min_zoom, label_min_zoom, sort_order, appellation_level, parent_key)
join wine_places p on p.canonical_key = v.parent_key
on conflict (canonical_key) do nothing;

do $$
declare n int;
begin
  select count(*) into n from wine_places
   where canonical_key in (
     'germany.rheingau', 'germany.hessische-bergstrasse',
     'germany.rheingau.johannisberg',
     'germany.hessische-bergstrasse.starkenburg',
     'germany.hessische-bergstrasse.umstadt');
  if n <> 5 then raise exception 'expected 5 Hessian places, got %', n; end if;

  -- Every one must hang off the right parent, or it will not render in the
  -- hierarchy even though the row exists.
  select count(*) into n
    from wine_places c join wine_places p on p.id = c.primary_parent_id
   where c.canonical_key like 'germany.rheingau%' or c.canonical_key like 'germany.hessische-bergstrasse%';
  if n <> 5 then raise exception 'expected 5 parented Hessian places, got %', n; end if;

  -- Germany should now stand at 8 of its 13 Anbaugebiete.
  select count(*) into n from wine_places
   where kind = 'REGION' and canonical_key like 'germany.%';
  if n <> 8 then raise exception 'expected 8 German Anbaugebiete, got %', n; end if;
end $$;

commit;
