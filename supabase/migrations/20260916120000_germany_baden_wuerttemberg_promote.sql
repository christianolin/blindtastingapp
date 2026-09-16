-- Promote the Baden and Württemberg boundaries staged by stage-germany-weinbau.mjs.
--
-- Same shape of check as 20260913180000 and 20260913200000 used for Franken and
-- Saale-Unstrut, and the same reasoning: the band is on hectares_planted, the
-- vineyard extent measured BEFORE the morphological close, because the stored
-- geometry is the closed outline and its area is inflated on purpose.
--
-- WHAT IS DIFFERENT HERE, AND WHY THE CHECKS ARE NOT THE USUAL ONES.
--
-- Every earlier region was the only one of its kind in its state, so a clip that
-- escaped its named units produced something absurdly large and the ceiling
-- caught it. Baden and Württemberg SHARE a state, and they share the same
-- vineyard layer: both are clipped out of the same 33 468 ha of ATKIS Rebfläche.
-- A failure here does not have to look big. If the Gemarkung-level membership
-- were wrong, each region would still come out of the right state, at a
-- plausible size, with a plausible outline -- and the wine would be attributed
-- to the wrong region. So the checks below are about the SPLIT, not the size.
--
--   the two must not overlap        they are disjoint sets of Gemarkungen, so
--                                   their closed outlines may touch along the
--                                   boundary but must not share real area
--   together they must account      33 435 of the state's 33 468 recorded
--   for the state's vineyard        hectares are inside one or the other
--   each must reach its own ends    Baden from the Markgräflerland and the
--                                   Bodensee up to Tauberfranken; Württemberg
--                                   from the Bodensee up to the Tauber
--
-- The overlap check is the one that would have caught the real error found while
-- building this: the 1983 annexes were being read past their last row into the
-- next ordinance's text and the publisher's imprint, which put Gemarkung
-- Stuttgart and Gemarkung Ludwigsburg -- Württemberg past any argument -- into
-- BADEN. Nothing about the size or shape of either region looked wrong.
--
-- NOT included: Württemberg's Bavarian annex. Its specification also names
-- Nonnenhorn and Wasserburg, and Hoyren and Aeschach of Lindau, on the Bavarian
-- shore of the Bodensee. Those lie outside Baden-Württemberg's cadastre and
-- outside the ATKIS extract this is clipped from, and Bavaria's Basis-DLM
-- carries no Gemarkung layer to place Hoyren and Aeschach with. Roughly 100 ha,
-- recorded here so it is not mistaken later for a defect in the clip.

begin;

do $$
declare
  r record;
  n int;
  overlap_ha numeric;
  baden_g extensions.geometry;
begin
  -- Intersecting two closed outlines of 3 900 and 2 800 vertices is past the
  -- default timeout on a pooled connection.
  set local statement_timeout = 600000;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.baden', 'germany.wuerttemberg')
     and b.quality_status = 'DRAFT' and not b.is_current;
  if n <> 2 then raise exception 'expected 2 DRAFT boundaries for Baden and Wuerttemberg, got %', n; end if;

  for r in
    select p.canonical_key key, p.name nm, b.id, b.display_geometry g,
           (b.generation_parameters->>'hectares_planted')::numeric planted,
           (b.generation_parameters->>'engine') engine,
           (b.generation_parameters->>'named_units')::int units,
           (b.generation_parameters->>'min_planted_ha')::numeric min_planted,
           (b.generation_parameters->>'raw_parts')::int raw_parts,
           extensions.ST_NumGeometries(b.display_geometry) parts
      from wine_place_boundaries b
      join wine_places p on p.id = b.wine_place_id
     where p.canonical_key in ('germany.baden', 'germany.wuerttemberg')
       and b.quality_status = 'DRAFT' and not b.is_current
  loop
    if not extensions.ST_IsValid(r.g) or extensions.ST_IsEmpty(r.g) then
      raise exception '%: geometry invalid or empty', r.nm;
    end if;
    if r.engine is distinct from 'vineyard-clip+close' then
      raise exception '%: engine is %, expected vineyard-clip+close', r.nm, r.engine;
    end if;
    if r.min_planted is distinct from 5 then
      raise exception '%: pebble filter ran at % ha, expected 5', r.nm, r.min_planted;
    end if;
    if r.parts >= r.raw_parts then
      raise exception '%: close left % parts from % raw — it knitted nothing together',
        r.nm, r.parts, r.raw_parts;
    end if;

    -- The Gemarkung count is the membership. Everything upstream of it -- the
    -- 1983 annexes, the namesake resolution, the specification additions --
    -- lands on this one number, so it is checked exactly.
    if r.key = 'germany.baden' and r.units is distinct from 589 then
      raise exception 'Baden: built from % Gemarkungen, the resolved membership has 589', r.units;
    end if;
    if r.key = 'germany.wuerttemberg' and r.units is distinct from 421 then
      raise exception 'Wuerttemberg: built from % Gemarkungen, the resolved membership has 421', r.units;
    end if;

    -- Baden is credited with roughly 15 800 planted hectares and Württemberg
    -- with 11 400; recorded land use runs ahead of planted vines everywhere on
    -- this map, so the bands are wide on the upper side.
    if r.key = 'germany.baden' and (r.planted is null or r.planted < 16000 or r.planted > 24000) then
      raise exception 'Baden: % planted ha is outside 16000-24000', r.planted;
    end if;
    if r.key = 'germany.wuerttemberg' and (r.planted is null or r.planted < 10000 or r.planted > 16000) then
      raise exception 'Wuerttemberg: % planted ha is outside 10000-16000', r.planted;
    end if;
  end loop;

  -- BADEN'S REACH. It is the longest German region, from the Markgräflerland
  -- opposite Basel to Tauberfranken, and it alone touches the Bodensee's
  -- western end. Losing Tauberfranken -- which the 1983 ordinance splits with
  -- Württemberg village by village along the Tauber -- would leave a region
  -- that still looked entirely reasonable.
  select b.display_geometry into baden_g
    from wine_place_boundaries b join wine_places p on p.id = b.wine_place_id
   where p.canonical_key = 'germany.baden' and b.quality_status = 'DRAFT' and not b.is_current;
  if extensions.ST_YMin(extensions.Box3D(baden_g)) > 47.7
     or extensions.ST_YMax(extensions.Box3D(baden_g)) < 49.6
     or extensions.ST_XMin(extensions.Box3D(baden_g)) > 7.7
     or extensions.ST_XMax(extensions.Box3D(baden_g)) < 9.5 then
    raise exception 'Baden: bbox does not span the Markgraeflerland, Tauberfranken and the Bodensee';
  end if;

  update wine_place_boundaries b
     set quality_status = 'VALIDATED', is_current = true, reviewed_at = now()
    from wine_places p
   where p.id = b.wine_place_id
     and p.canonical_key in ('germany.baden', 'germany.wuerttemberg')
     and b.quality_status = 'DRAFT' and not b.is_current;

  -- THE SPLIT. Disjoint Gemarkungen give disjoint vineyard; the close can push
  -- the two outlines into contact along the boundary, but a real shared area
  -- means a Gemarkung has been counted in both, or one region's vineyard has
  -- been read into the other's.
  --
  -- The threshold is set from the measured value rather than guessed. These two
  -- geometries overlap by 392 ha, 0.4% of Baden's displayed area, which is what
  -- two outlines buffered by 0.012 degrees and meeting along a 200 km border
  -- come to. 1 500 ha leaves nearly four times that in headroom while still
  -- catching the failure worth catching: Baden's displayed area runs about five
  -- times its planted area, so a single Gemarkung of 300 planted hectares
  -- counted in both regions would show up here as roughly 1 500 ha and trip it.
  -- A 3 000 ha threshold, the round number first written here, would have let
  -- Stuttgart's 503 hectares through unnoticed.
  select coalesce(extensions.ST_Area(extensions.ST_Intersection(a.display_geometry, b.display_geometry)::extensions.geography), 0) / 10000
    into overlap_ha
    from wine_place_boundaries a
    join wine_places pa on pa.id = a.wine_place_id and pa.canonical_key = 'germany.baden'
    join wine_places pb on pb.canonical_key = 'germany.wuerttemberg'
    join wine_place_boundaries b on b.wine_place_id = pb.id and b.is_current
   where a.is_current;
  if overlap_ha > 1500 then
    raise exception 'Baden and Wuerttemberg overlap by % ha — the Gemarkung split is wrong', round(overlap_ha);
  end if;

  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.baden', 'germany.wuerttemberg') and b.is_current;
  if n <> 2 then raise exception 'expected 2 current boundaries, got %', n; end if;

  -- Germany now stands at 12 of its 13 Anbaugebiete with geometry. Sachsen is
  -- the one left: its specification is a flat place list like these two, but
  -- Saxony publishes no open vineyard land-use layer to clip against.
  select count(*) into n
    from wine_places p join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 12 then raise exception 'expected 12 German Anbaugebiete with geometry, got %', n; end if;
end $$;

commit;
