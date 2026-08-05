-- Alsace communes — catalog (47 places, DRAFT).
--
-- The level Alsace was missing: the 51 grands crus hung straight off the region
-- with no village tier, unlike Burgundy and Champagne. These 47 communes become
-- that tier, so the hierarchy models true geographic containment —
--
--   france.alsace              REGION       tier 1
--   └─ france.alsace.<commune> SITE         tier 2   (here)
--      └─ france.alsace.<cru>  APPELLATION  tier 3   (re-parented in ...264200)
--
-- INAO's decree for each grand cru names the commune(s) its delimited area lies
-- in. A commune is a place, not an appellation, so kind=SITE,
-- is_appellation=false, appellation_level/system null — the same modelling as
-- Champagne's Échelle des Crus villages (20260823090000), which keeps them out
-- of the AOC counts and the classification-coupling constraint.
--
-- The 47 are from data/wine-map/alsace-communes.json, where two independent
-- INAO sources agree exactly: the communes holding >= 0.5% of some cru's
-- delimited parcels are precisely the 47 of the published aire géographique.
-- 42 are some cru's parent; the other 5 (Saint-Hippolyte,
-- Scharrachbergheim-Irmstett, Soultzmatt, Vieux-Thann, Vœgtlinshoffen) host cru
-- land whose majority lies next door, so they arrive childless. They really do
-- contain grand cru vines.
--
-- Kientzheim and Sigolsheim were merged into the commune nouvelle Kaysersberg
-- Vignoble (68162) on 1 January 2016 and survive only as communes déléguées.
-- They keep their wine names — what labels, textbooks and INAO itself still use
-- — and their déléguée polygons are the correct pre-merger footprints. The
-- merger is recorded in the artifact and travels with the boundary provenance.
-- Kaysersberg itself is NOT created: 1.3% of Schlossberg falls inside it, but
-- INAO's aire omits it while listing the other two, and we follow INAO.
--
-- min_zoom/label_min_zoom 8 matches Champagne's whole-commune village
-- footprints; the crus stay at 10 and resolve on top two zooms deeper.
--
-- Boundaries are staged DRAFT by scripts/wine-map-sources/fetch-alsace-communes.mjs;
-- the reviewed flip — which also re-parents the crus — is 20260829264200.
do $$
declare
  v_region uuid;
  v_n int;
begin
  select id into v_region from wine_places
   where canonical_key = 'france.alsace' and publication_status = 'VERIFIED';
  if v_region is null then
    raise exception 'france.alsace is not VERIFIED';
  end if;

  create temp table alsace_commune (slug text, name text, so int) on commit drop;
  insert into alsace_commune (slug, name, so) values
    ('ammerschwihr'                , 'Ammerschwihr'                ,  1),
    ('andlau'                      , 'Andlau'                      ,  2),
    ('barr'                        , 'Barr'                        ,  3),
    ('beblenheim'                  , 'Beblenheim'                  ,  4),
    ('bennwihr'                    , 'Bennwihr'                    ,  5),
    ('bergbieten'                  , 'Bergbieten'                  ,  6),
    ('bergheim'                    , 'Bergheim'                    ,  7),
    ('bergholtz'                   , 'Bergholtz'                   ,  8),
    ('blienschwiller'              , 'Blienschwiller'              ,  9),
    ('dahlenheim'                  , 'Dahlenheim'                  , 10),
    ('dambach-la-ville'            , 'Dambach-la-Ville'            , 11),
    ('eguisheim'                   , 'Eguisheim'                   , 12),
    ('eichhoffen'                  , 'Eichhoffen'                  , 13),
    ('gueberschwihr'               , 'Gueberschwihr'               , 14),
    ('guebwiller'                  , 'Guebwiller'                  , 15),
    ('hattstatt'                   , 'Hattstatt'                   , 16),
    ('hunawihr'                    , 'Hunawihr'                    , 17),
    ('ingersheim'                  , 'Ingersheim'                  , 18),
    ('katzenthal'                  , 'Katzenthal'                  , 19),
    ('kientzheim'                  , 'Kientzheim'                  , 20),
    ('kintzheim'                   , 'Kintzheim'                   , 21),
    ('marlenheim'                  , 'Marlenheim'                  , 22),
    ('mittelbergheim'              , 'Mittelbergheim'              , 23),
    ('mittelwihr'                  , 'Mittelwihr'                  , 24),
    ('molsheim'                    , 'Molsheim'                    , 25),
    ('niedermorschwihr'            , 'Niedermorschwihr'            , 26),
    ('nothalten'                   , 'Nothalten'                   , 27),
    ('orschwihr'                   , 'Orschwihr'                   , 28),
    ('pfaffenheim'                 , 'Pfaffenheim'                 , 29),
    ('ribeauville'                 , 'Ribeauvillé'                 , 30),
    ('riquewihr'                   , 'Riquewihr'                   , 31),
    ('rodern'                      , 'Rodern'                      , 32),
    ('rouffach'                    , 'Rouffach'                    , 33),
    ('saint-hippolyte'             , 'Saint-Hippolyte'             , 34),
    ('scharrachbergheim-irmstett'  , 'Scharrachbergheim-Irmstett'  , 35),
    ('sigolsheim'                  , 'Sigolsheim'                  , 36),
    ('soultzmatt'                  , 'Soultzmatt'                  , 37),
    ('thann'                       , 'Thann'                       , 38),
    ('turckheim'                   , 'Turckheim'                   , 39),
    ('vieux-thann'                 , 'Vieux-Thann'                 , 40),
    ('voegtlinshoffen'             , 'Vœgtlinshoffen'              , 41),
    ('westhalten'                  , 'Westhalten'                  , 42),
    ('wettolsheim'                 , 'Wettolsheim'                 , 43),
    ('wintzenheim'                 , 'Wintzenheim'                 , 44),
    ('wolxheim'                    , 'Wolxheim'                    , 45),
    ('wuenheim'                    , 'Wuenheim'                    , 46),
    ('zellenberg'                  , 'Zellenberg'                  , 47);

  select count(*) into v_n from alsace_commune;
  if v_n <> 47 then
    raise exception 'expected 47 communes in the catalog, got %', v_n;
  end if;

  -- Communes share the france.alsace.* key namespace with the crus (the
  -- Champagne pattern: sub-regions and villages both sit at france.champagne.*).
  -- A collision would be caught by the unique index, but not legibly.
  if exists (
    select 1 from alsace_commune c
    join wine_places p on p.canonical_key = 'france.alsace.' || c.slug
  ) then
    raise exception 'a commune slug collides with an existing france.alsace place';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status, is_appellation, sort_order
  )
  select v_region, 'SITE', 'france.alsace.' || c.slug, c.name, c.slug, 2,
         8, 8, 'DRAFT', false, c.so
  from alsace_commune c;

  -- The crus are untouched here: re-parenting waits for the flip, so there is
  -- never a moment where a cru's parent is a place the tile exporter does not
  -- emit. Until then these 47 are DRAFT and boundaryless, hence invisible.
  select count(*) into v_n from wine_places
   where canonical_key like 'france.alsace.%'
     and kind = 'SITE' and not is_appellation
     and appellation_level is null and appellation_system is null
     and display_tier = 2 and min_zoom = 8 and label_min_zoom = 8
     and publication_status = 'DRAFT' and primary_parent_id = v_region;
  if v_n <> 47 then
    raise exception 'alsace commune catalog assertion failed, got %', v_n;
  end if;

  select count(*) into v_n from wine_places
   where canonical_key like 'france.alsace.%' and kind = 'APPELLATION'
     and display_tier = 2 and primary_parent_id = v_region;
  if v_n <> 51 then
    raise exception 'expected the 51 crus still parented to the region, got %', v_n;
  end if;

  select count(*) into v_n from wine_places where canonical_key like 'france.alsace%';
  if v_n <> 99 then
    raise exception 'expected 99 alsace places (region + 47 communes + 51 crus), got %', v_n;
  end if;

  -- Every primary commune named in the corrected member table must exist here,
  -- or the flip has nothing to parent that cru to.
  if exists (
    select 1 from wine_designation_members m
      join wine_designations d on d.id = m.designation_id
     where d.key = 'alsace-grand-cru'
       and not exists (
         select 1 from wine_places p
          where p.canonical_key like 'france.alsace.%'
            and p.kind = 'SITE' and p.name = m.commune
       )
  ) then
    raise exception 'a grand cru commune has no matching commune place';
  end if;
end;
$$;
