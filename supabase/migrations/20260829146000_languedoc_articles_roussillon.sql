-- Languedoc-Roussillon articles part 3: Costieres, Roussillon and the
-- vin-doux-naturel family (17 places). Completes all 57 profiles.
-- Insert-only; re-run no-op.
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr, 'Mediterranean; the Roussillon is France''s sunniest corner.', v.soils,
       array[v.fact1, v.fact2], 'PUBLISHED'
from (values
  ('costieres-de-nimes',
   'Rhone-style galets between Nimes and the Camargue - Syrah-Grenache reds and roses with southern-Rhone manners.',
   'Rolled quartz galets over red clay.',
   'Administratively Languedoc, stylistically Rhone', 'Galets like Chateauneuf''s'),
  ('cotes-du-roussillon',
   'The Catalan base red: Carignan-Grenache-Syrah from the Pyrenees'' last terraces to the sea.',
   'Schist, granite, limestone - a Catalan mosaic.',
   'Catalan France''s everyday AOC', 'All three valleys - Agly, Tet, Tech'),
  ('cotes-du-roussillon-villages',
   'The Agly valley''s superior tier: black schist and granite giving concentrated, sun-charged reds.',
   'Black schist, gneiss and granite.',
   'Reds only, Agly-valley heartland', 'Four named villages rise within it'),
  ('cotes-du-roussillon-villages-caramany',
   'Gneiss terraces above the Agly dam - the village that pioneered carbonic Carignan here.',
   'Gneiss and granite sands.',
   'Named village since 1977', 'Gneiss is the calling card'),
  ('cotes-du-roussillon-villages-les-aspres',
   'The dry foothill fans of the Aspres under Canigou - garrigue-roasted Grenache blends.',
   'Pebbly clay fans (aspres = the arid ones).',
   'The newest named village (2017)', 'Canigou watches over the vines'),
  ('cotes-du-roussillon-villages-lesquerde',
   'A high granite-sand shelf - the lightest-footed, most perfumed Agly villages red.',
   'Decomposed granite sand.',
   'Granite-sand singularity', 'Named village since 1996'),
  ('cotes-du-roussillon-villages-tautavel',
   'Limestone gorges of prehistoric Tautavel Man - deep Grenache with iron and garrigue.',
   'Limestone and red clay.',
   'Tautavel Man was found next door', 'Named village since 1997'),
  ('collioure',
   'The dry twin of Banyuls: the same sea-plunging schist terraces, unfortified - Grenache and Mourvedre of salty power.',
   'Thin brown schist terraces.',
   'Same vines and slopes as Banyuls, dry wines', 'Anchovy-port beauty of the Cote Vermeille'),
  ('banyuls-grand-cru',
   'Banyuls aged at least 30 months in wood - rancio depth, walnut and fig, the Roussillon''s answer to tawny.',
   'Schist terraces to the sea.',
   'Min 30 months in wood by decree', 'Mostly traditional (oxidative) styles'),
  ('maury',
   'Black-schist scarps under the Cathar castle of Queribus - Grenache vin doux naturel, from inky rimage to old rancio.',
   'Black schist of the upper Agly.',
   'Grenache VDN in rimage and rancio styles', 'Maury Sec covers the dry reds since 2011'),
  ('rivesaltes',
   'The great VDN sea of the Roussillon plain - ambre and tuile ageing in glass bonbonnes and old foudres.',
   'Terraces of the Agly-Tet plain.',
   'Ambre, tuile, grenat and rancio styles', 'Once France''s biggest sweet-wine AOC'),
  ('grand-roussillon',
   'The umbrella VDN appellation of the whole Catalan plain - rarely seen, historically the blending tier.',
   'All Roussillon soils.',
   'Umbrella VDN appellation', 'A rarity on labels today'),
  ('muscat-de-rivesaltes',
   'Muscat VDN across the plain - both Muscats blended into grapey, orange-blossom sweetness.',
   'Limestone and terrace soils.',
   'Both Muscat varieties permitted', 'The biggest Muscat VDN of France'),
  ('muscat-de-frontignan',
   'The historic Muscat of the Herault shore - petits-grains only, once shipped as "Frontignan" worldwide.',
   'Limestone by the Thau lagoon.',
   'Muscat blanc a petits grains only', 'Voltaire ordered it by the barrel'),
  ('muscat-de-lunel',
   'Muscat between Nimes and Montpellier - the "premier muscat de France" claim of little Lunel.',
   'Red clay with galets.',
   'Petits-grains Muscat VDN', 'Freed Napoleon''s exile shipments (legend)'),
  ('muscat-de-mireval',
   'The lagoon-side Muscat beside Frontignan - saltier, breezier renditions of the same grape.',
   'Limestone and sand by the etang.',
   'Petits-grains Muscat VDN', 'Sea-air freshness marks it'),
  ('muscat-de-saint-jean-de-minervois',
   'High limestone causse Muscat at 200+ m - the freshest, most crystalline of the Muscat VDNs.',
   'White limestone causse.',
   'Altitude Muscat - later harvests', 'Widely judged the finest French Muscat VDN')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.languedoc-roussillon.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_a int; v_total int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_a <> 57 then
    raise exception 'expected 57 languedoc articles (all places), got %', v_a;
  end if;
  -- The whole map: every VERIFIED place now carries an article.
  select count(*) into v_total from wine_places p
   where p.publication_status = 'VERIFIED'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_total <> 0 then
    raise exception 'expected 0 verified places without articles, got %', v_total;
  end if;
end $$;
