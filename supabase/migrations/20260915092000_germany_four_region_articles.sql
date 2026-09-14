-- Articles for the four German Anbaugebiete that have none.
--
-- Franken, Saale-Unstrut, Hessische Bergstraße and Rheingau were all published
-- in the September geometry wave and none of them got a wine_place_articles
-- row, so the Details panel falls through to "Profile being curated — check
-- back soon." while the six older German regions read properly. Nothing was
-- broken; the content was simply never written.
--
-- These four also have no wine_place_grapes or wine_place_styles rows, and the
-- explorer only renders article.grape_varieties when context.grapes is empty
-- and article.wine_styles when context.styles is empty. So both are filled here
-- and will stop displaying by themselves the day structured rows are added --
-- which is the behaviour the panel was built for, not a workaround.
--
-- FIGURES. Vineyard area and variety splits are Deutsches Weininstitut, 2025
-- figures, checked against the DWI region pages rather than repeated from
-- memory. Two things that "everyone knows" are wrong and are not written here:
--
--   Müller-Thurgau is NOT Franken's most planted variety any more. Silvaner is,
--   at 1,536 ha against 1,298 ha.
--
--   Hessische Bergstraße is NOT Germany's smallest Anbaugebiet any more. It
--   passed that to Mittelrhein; it had taken it from Sachsen in 2007. The
--   article says "one of the smallest", which stays true either way.
--
-- The Bocksbeutel wording is exact for the same reason: the flask has been EU
-- protected since 1989 for Franken, but Tauberfranken in Baden and the
-- Baden-Baden Rebland villages kept the right, so it is not Franken's alone.
--
-- Idempotent: ON CONFLICT DO UPDATE, so re-running refreshes the text rather
-- than failing. Written as PUBLISHED, matching all 3,234 existing rows.

begin;

insert into public.wine_place_articles
  (wine_place_id, description, climate, soils, grape_varieties, wine_styles, key_facts, editorial_status)
select p.id, v.description, v.climate, v.soils, v.grape_varieties, v.wine_styles, v.key_facts, 'PUBLISHED'
  from (values
  (
    'germany.franken',
    'Bavaria''s wine country, strung along the loops of the Main between Aschaffenburg and Bamberg, and the one German region where Silvaner rather than Riesling sets the standard. The wines are dry by instinct and built on stone — firm, savoury and often smoky — and the best of them go into the Bocksbeutel, the flattened flask that has carried Franken''s name since long before the EU wrote it down.',
    'Continental and markedly drier than the Rhine regions, with warm summers, cold winters and a real risk of spring frost. Vineyards cluster on south-facing slopes above the river, which moderates the cold.',
    'Three, and they are tasted rather than merely mapped: Muschelkalk shell-limestone around the Maindreieck, giving taut, mineral Silvaner; Keuper marl around the Steigerwald, giving broader and spicier wines; and Buntsandstein red sandstone in the west near Aschaffenburg, the warmest of the three.',
    'Silvaner, at 1,536 ha, is the region''s signature and its most planted variety. Müller-Thurgau follows at 1,298 ha, and Bacchus is a genuine Franken speciality. About 83% of the vineyard is white.',
    'Dry white wine, taken more seriously here than almost anywhere in Germany. Silvaner ranges from brisk and stony to weighty Grosses Gewächs; Bacchus is aromatic and early-drinking; Spätburgunder and Domina account for most of the red.',
    array[
      'Silvaner''s German heartland — a quarter of the vineyard',
      'Muschelkalk, Keuper and Buntsandstein',
      'Dry by default; about 83% white',
      'The Bocksbeutel flask, EU-protected since 1989',
      '6,040 ha (DWI, 2025)'
    ]::text[]
  ),
  (
    'germany.saale-unstrut',
    'Germany''s northernmost quality wine region, gathered around the meeting of the Saale and the Unstrut in Saxony-Anhalt and Thuringia at about 51°N. Vines have been documented here since 998, and they survive on dry-stone terraces cut into south-facing limestone above the rivers. The wines are light, dry and brisk — a northern style that has little to do with the Rhine.',
    'Continental and one of the driest corners of Germany, with roughly 500 mm of rain a year. The growing season is short and frost is the constant threat, so sites are chosen for the slope and the river''s warmth rather than for soil alone.',
    'Muschelkalk shell-limestone and Buntsandstein red sandstone, worked into terraces held up by dry-stone walls — some of them medieval, and a large part of the region''s character and its cost.',
    'White varieties take about three-quarters of the vineyard. Müller-Thurgau and Weißburgunder lead at roughly 14% each, Riesling follows at about 9%, with Bacchus, Silvaner and Dornfelder also planted.',
    'Dry, light-bodied whites with high acidity and modest alcohol, made for drinking young. Sparkling wine matters more here than the vineyard area suggests — Freyburg is the home of Rotkäppchen Sekt.',
    array[
      'Germany''s northernmost quality wine region, near 51°N',
      'Vineyards documented since 998',
      'Terraced Muschelkalk behind dry-stone walls',
      'One of the driest climates in German wine',
      '868 ha (DWI, 2025)'
    ]::text[]
  ),
  (
    'germany.hessische-bergstrasse',
    'A narrow ribbon of vineyard on the western edge of the Odenwald between Darmstadt and Heppenheim, and one of Germany''s smallest and warmest wine regions. Spring arrives here before almost anywhere else in the country — almonds and apricots flower while the Rhine regions are still bare — and the wine, most of it Riesling, is largely drunk within sight of where it grew.',
    'One of Germany''s mildest, sheltered from the north and east by the Odenwald and open to the warm Rhine plain. Early budbreak and an early harvest follow, with the frost risk that comes with both.',
    'Loess and loam over the crystalline rock of the Odenwald — granite, gneiss and porphyry — giving wines a little more weight than the region''s size and latitude would suggest.',
    'Riesling dominates at about 164 ha, over a third of the vineyard. Grauburgunder is second at roughly 59 ha, with Spätburgunder, Weißburgunder and Müller-Thurgau making up most of the rest.',
    'Riesling in a rounder, earlier-ripening register than the Rheingau across the river, dry to off-dry. Pinot varieties are increasingly serious. Very little leaves the region.',
    array[
      'One of Germany''s smallest regions, at 440 ha (DWI, 2025)',
      'Among the warmest and earliest in the country',
      'Riesling on loess over Odenwald crystalline rock',
      'Two Bereiche: Starkenburg and Umstadt'
    ]::text[]
  ),
  (
    'germany.rheingau',
    'For roughly thirty kilometres below Wiesbaden the Rhine gives up running north and turns west, and the whole bank tilts south to face the sun. That accident of geography made the Rheingau the most historically weighted stretch of vineyard in Germany: Kloster Eberbach''s Cistercians, Schloss Johannisberg''s late-harvest discovery in 1775, and a tradition of dry, structured Riesling that still measures the rest of the country.',
    'Warm for its latitude and sheltered by the Taunus hills to the north, with the broad river storing heat and lengthening the autumn — the conditions botrytis needs, which is why the noble-sweet styles were codified here.',
    'Quartzite and slate on the steep Rüdesheimer Berg at the western end, giving the firmest wines; loess, marl and sandy loam through the gentler middle of the region around Johannisberg and Hattenheim.',
    'Riesling on 2,355 ha — about three-quarters of the region — with Spätburgunder second at roughly 390 ha, concentrated at Assmannshausen.',
    'Dry Riesling of structure and length, alongside the Spätlese, Auslese and Trockenbeerenauslese scale that was effectively defined here. Assmannshausen''s Spätburgunder is one of Germany''s oldest red wine traditions.',
    array[
      'The Rhine turns west, so the whole bank faces south',
      'Riesling on about three-quarters of 3,117 ha (DWI, 2025)',
      'Spätlese discovered at Schloss Johannisberg, 1775',
      'Assmannshausen for Spätburgunder',
      'Kloster Eberbach, Cistercian, 12th century'
    ]::text[]
  )
) as v(key, description, climate, soils, grape_varieties, wine_styles, key_facts)
  join public.wine_places p on p.canonical_key = v.key
on conflict (wine_place_id) do update
  set description     = excluded.description,
      climate         = excluded.climate,
      soils           = excluded.soils,
      grape_varieties = excluded.grape_varieties,
      wine_styles     = excluded.wine_styles,
      key_facts       = excluded.key_facts,
      editorial_status = excluded.editorial_status,
      updated_at      = now();

do $$
declare
  n int;
  r record;
begin
  -- All four landed. A canonical_key typo would silently insert nothing,
  -- because the join is what finds the place.
  select count(*) into n
    from public.wine_place_articles a
    join public.wine_places p on p.id = a.wine_place_id
   where p.canonical_key in ('germany.franken', 'germany.saale-unstrut',
                             'germany.hessische-bergstrasse', 'germany.rheingau');
  if n <> 4 then
    raise exception 'expected 4 new German articles, got % — check the canonical keys', n;
  end if;

  -- Every German Anbaugebiet now has one, which is the point of the migration.
  select count(*) into n
    from public.wine_places p
   where p.kind = 'REGION' and p.canonical_key like 'germany.%'
     and not exists (select 1 from public.wine_place_articles a where a.wine_place_id = p.id);
  if n <> 0 then
    raise exception '% German regions still have no article', n;
  end if;

  -- No empty shell rows: the panel renders each of these fields on its own, and
  -- a blank one is the "curated" placeholder wearing a different hat.
  for r in
    select p.name, a.*
      from public.wine_place_articles a
      join public.wine_places p on p.id = a.wine_place_id
     where p.canonical_key in ('germany.franken', 'germany.saale-unstrut',
                               'germany.hessische-bergstrasse', 'germany.rheingau')
  loop
    if coalesce(length(trim(r.description)), 0) < 120 then
      raise exception '%: description is missing or too short', r.name;
    end if;
    if coalesce(length(trim(r.climate)), 0) < 40
       or coalesce(length(trim(r.soils)), 0) < 40
       or coalesce(length(trim(r.grape_varieties)), 0) < 40
       or coalesce(length(trim(r.wine_styles)), 0) < 40 then
      raise exception '%: climate, soils, grape_varieties and wine_styles must all be filled', r.name;
    end if;
    if coalesce(array_length(r.key_facts, 1), 0) < 4 then
      raise exception '%: expected at least 4 key facts, got %', r.name,
        coalesce(array_length(r.key_facts, 1), 0);
    end if;
    if r.editorial_status <> 'PUBLISHED' then
      raise exception '%: editorial_status is %, expected PUBLISHED', r.name, r.editorial_status;
    end if;
  end loop;
end $$;

commit;
