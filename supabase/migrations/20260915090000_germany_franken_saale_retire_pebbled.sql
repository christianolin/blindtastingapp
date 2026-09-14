-- Retire the Franken and Saale-Unstrut boundaries promoted by 20260913180000
-- and 20260913200000, so they can be rebuilt with the pebble filter.
--
-- Same shape, and the same reason, as 20260913150000 retired the five raw
-- Hessian clips: two regions of one country were being drawn on different
-- cartographic principles, and the ones that lost were the ones a taster is
-- most likely to go looking for.
--
-- What was wrong with them. The close (buffer +0.012°, then -0.008°) knits a
-- dense parcel field into a solid -- that is why Mosel is three parts and
-- Rheinhessen one. It cannot knit together vineyards that are genuinely far
-- apart, and Franken's run from Aschaffenburg to Bamberg. So the close left:
--
--   Franken          87 parts, 7 043 ha planted
--   Saale-Unstrut    43 parts,   894 ha planted
--
-- against 1 to 4 parts for every German region already published. On the map
-- they read as a scatter of specks, each one carrying a whole Anbaugebiet's
-- colour. The tail is dust: 46 of Franken's parts hold under 5 ha of vineyard
-- between them all -- 53.6 ha of 7 043 -- and twelve of those hold under a
-- tenth of a hectare each.
--
-- Raising the close instead was measured and rejected. Saale-Unstrut already
-- shows 103 km² for 894 ha of vines; the close that brought it to 17 parts
-- showed 266 km², about thirty times its planted extent, and still left a
-- speckle field. The scatter is real geography, not a buffer artefact, so the
-- answer is to stop drawing the dust, not to inflate everything until the dust
-- touches.
--
-- The rebuild drops closed parts holding under 5 ha of planted vineyard,
-- measured on the vineyard inside each part rather than on the part's own
-- displayed area, which the close inflates unevenly:
--
--   Franken          87 -> 41 parts, 6 989.6 of 7 043.2 ha kept (99.2%)
--   Saale-Unstrut    43 -> 19 parts,   855.1 of   894.1 ha kept (95.6%)
--
-- Hessische Bergstraße and Rheingau are deliberately NOT touched. Their closes
-- worked: 4 and 6 parts, nothing under 65 ha of displayed area, no dust to
-- remove. The Hessen build is a different script and keeps its own geometry.
--
-- This migration only clears is_current. stage-germany-weinbau.mjs then stages
-- the rebuilt DRAFT rows, and 20260915091000 validates and promotes them, so
-- between the two the regions have no current boundary and drop off the map.
-- Run them together.

begin;

do $$
declare
  n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.franken', 'germany.saale-unstrut')
     and b.is_current;
  if n <> 2 then
    raise exception 'expected 2 current boundaries for Franken and Saale-Unstrut, got %', n;
  end if;

  -- Retire only the pebbled ones. If these are already the filtered rebuild --
  -- this migration applied twice -- the parts are 41 and 19 and there is
  -- nothing to retire, so say so rather than cycling the geometry again.
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.franken', 'germany.saale-unstrut')
     and b.is_current
     and (b.generation_parameters ->> 'min_planted_ha') is null;
  if n <> 2 then
    raise exception
      'expected 2 unfiltered current boundaries to retire, got % — has the rebuild already been promoted?', n;
  end if;
end $$;

update wine_place_boundaries b
   set is_current = false
  from wine_places p
 where p.id = b.wine_place_id
   and p.canonical_key in ('germany.franken', 'germany.saale-unstrut')
   and b.is_current;

do $$
declare
  n int;
begin
  select count(*) into n
    from wine_place_boundaries b
    join wine_places p on p.id = b.wine_place_id
   where p.canonical_key in ('germany.franken', 'germany.saale-unstrut')
     and b.is_current;
  if n <> 0 then
    raise exception 'Franken/Saale-Unstrut still have % current boundaries', n;
  end if;

  -- Nothing else moved: the other eight German Anbaugebiete keep theirs.
  select count(*) into n
    from wine_places p
    join wine_place_boundaries b on b.wine_place_id = p.id and b.is_current
   where p.kind = 'REGION' and p.canonical_key like 'germany.%';
  if n <> 8 then
    raise exception 'expected 8 German Anbaugebiete still holding geometry, got %', n;
  end if;
end $$;

commit;
