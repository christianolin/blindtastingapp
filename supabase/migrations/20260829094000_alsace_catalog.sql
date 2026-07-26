-- Alsace region — catalog (places only, DRAFT).
--
-- Official-first from the pinned INAO artifact (data/wine-map/
-- alsace-appellations.json, owner-previewed): the dual-role region place
-- france.alsace (the regional 'Alsace' AOC) plus all 51 Alsace Grand Cru
-- lieux-dits as DRAFT appellation places, so the staged boundaries
-- (scripts/wine-map-sources/build-boundary.mjs --engine concave, namespace
-- IGN_INAO_AOC_VITICOLES) can reference them. The reviewed flip lands in
-- 20260829095000. Model per the artifact: REGION/regional for the region
-- (tier 1, like Beaujolais/Champagne); APPELLATION/grand_cru for the 51 crus
-- hanging directly off the region (tier 2 per the artifact; min_zoom 10 —
-- vineyard-scale footprints sit between Champagne's commune villages (8) and
-- Burgundy's nested climats (13)). Display names keep their accents
-- (Kirchberg de Ribeauvillé, Kitterlé); scoring rows are linked by their own
-- exact stored names in 20260829096000.
do $$
declare
  v_france uuid;
  v_region uuid;
  v_n int;
begin
  select id into v_france from wine_places where canonical_key = 'france';
  if v_france is null then
    raise exception 'france place missing';
  end if;
  if exists (select 1 from wine_places where canonical_key like 'france.alsace%') then
    raise exception 'alsace places already exist';
  end if;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  ) values (
    v_france, 'REGION', 'france.alsace', 'Alsace', 'alsace', 1,
    4, 4, 'DRAFT', true, 'AOC/AOP', 'regional', 0
  )
  returning id into v_region;

  insert into wine_places (
    primary_parent_id, kind, canonical_key, name, slug, display_tier,
    min_zoom, label_min_zoom, publication_status,
    is_appellation, appellation_system, appellation_level, sort_order
  )
  select v_region, 'APPELLATION', 'france.alsace.' || v.slug, v.name, v.slug, 2,
         10, 10, 'DRAFT', true, 'AOC/AOP', 'grand_cru', v.so
  from (values
    ('altenberg-de-bergbieten',  'Altenberg de Bergbieten',   1),
    ('altenberg-de-bergheim',    'Altenberg de Bergheim',     2),
    ('altenberg-de-wolxheim',    'Altenberg de Wolxheim',     3),
    ('brand',                    'Brand',                     4),
    ('bruderthal',               'Bruderthal',                5),
    ('eichberg',                 'Eichberg',                  6),
    ('engelberg',                'Engelberg',                 7),
    ('florimont',                'Florimont',                 8),
    ('frankstein',               'Frankstein',                9),
    ('froehn',                   'Froehn',                   10),
    ('furstentum',               'Furstentum',               11),
    ('geisberg',                 'Geisberg',                 12),
    ('gloeckelberg',             'Gloeckelberg',             13),
    ('goldert',                  'Goldert',                  14),
    ('hatschbourg',              'Hatschbourg',              15),
    ('hengst',                   'Hengst',                   16),
    ('kaefferkopf',              'Kaefferkopf',              17),
    ('kanzlerberg',              'Kanzlerberg',              18),
    ('kastelberg',               'Kastelberg',               19),
    ('kessler',                  'Kessler',                  20),
    ('kirchberg-de-barr',        'Kirchberg de Barr',        21),
    ('kirchberg-de-ribeauville', 'Kirchberg de Ribeauvillé', 22),
    ('kitterle',                 'Kitterlé',                 23),
    ('mambourg',                 'Mambourg',                 24),
    ('mandelberg',               'Mandelberg',               25),
    ('marckrain',                'Marckrain',                26),
    ('moenchberg',               'Moenchberg',               27),
    ('muenchberg',               'Muenchberg',               28),
    ('ollwiller',                'Ollwiller',                29),
    ('osterberg',                'Osterberg',                30),
    ('pfersigberg',              'Pfersigberg',              31),
    ('pfingstberg',              'Pfingstberg',              32),
    ('praelatenberg',            'Praelatenberg',            33),
    ('rangen',                   'Rangen',                   34),
    ('rosacker',                 'Rosacker',                 35),
    ('saering',                  'Saering',                  36),
    ('schlossberg',              'Schlossberg',              37),
    ('schoenenbourg',            'Schoenenbourg',            38),
    ('sommerberg',               'Sommerberg',               39),
    ('sonnenglanz',              'Sonnenglanz',              40),
    ('spiegel',                  'Spiegel',                  41),
    ('sporen',                   'Sporen',                   42),
    ('steinert',                 'Steinert',                 43),
    ('steingrubler',             'Steingrubler',             44),
    ('steinklotz',               'Steinklotz',               45),
    ('vorbourg',                 'Vorbourg',                 46),
    ('wiebelsberg',              'Wiebelsberg',              47),
    ('wineck-schlossberg',       'Wineck-Schlossberg',       48),
    ('winzenberg',               'Winzenberg',               49),
    ('zinnkoepfle',              'Zinnkoepfle',              50),
    ('zotzenberg',               'Zotzenberg',               51)
  ) as v(slug, name, so);

  select count(*) into v_n from wine_places where canonical_key like 'france.alsace%';
  if v_n <> 52 then
    raise exception 'expected 52 alsace places, got %', v_n;
  end if;
  if (select count(*) from wine_places
        where canonical_key like 'france.alsace.%'
          and kind = 'APPELLATION' and is_appellation
          and appellation_system = 'AOC/AOP'
          and appellation_level = 'grand_cru'
          and primary_parent_id = v_region
          and publication_status = 'DRAFT') <> 51 then
    raise exception 'alsace grand cru places assertion failed';
  end if;
  if not exists (
    select 1 from wine_places
     where canonical_key = 'france.alsace'
       and primary_parent_id = v_france
       and kind = 'REGION' and display_tier = 1
       and is_appellation and appellation_system = 'AOC/AOP'
       and appellation_level = 'regional' and publication_status = 'DRAFT'
  ) then
    raise exception 'alsace region assertion failed';
  end if;
end;
$$;
