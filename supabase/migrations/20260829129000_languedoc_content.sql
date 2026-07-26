-- Languedoc-Roussillon — knowledge content (v1, published).
--
-- Region + Corbières + Limoux + Banyuls articles; grape/style links across
-- the subtree where the grape exists in the library. Clairette (the grape)
-- is not in the library yet, so the Clairette family carries it in style
-- notes. Insert-only with guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'France''s biggest vineyard: an amphitheatre of garrigue-covered hills from Nimes to the Spanish border. Once a bulk-wine ocean, now a source of characterful Grenache-Syrah-Carignan reds, crisp Picpoul, sparkling Limoux and the great vins doux naturels of Roussillon.',
  'Mediterranean - hot, dry, windy (the tramontane); the Pyrenees close the south.',
  'Schist (Faugeres, Banyuls), limestone garrigue, galets and alluvium - enormous variety.',
  array[
    'France''s largest wine region by far',
    'Reds: Grenache, Syrah, Mourvedre, old-vine Carignan, Cinsault',
    'Limoux claims sparkling wine before Champagne (Blanquette, 1531)',
    'Vins doux naturels: Banyuls, Maury, Rivesaltes and the Muscats',
    'Picpoul de Pinet: the Mediterranean oyster white'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.languedoc-roussillon'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Mediterranean, dry and windy.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('corbieres',
   'The wild heart of the Languedoc: a vast, rugged sweep of garrigue and schist between Narbonne and the Aude gorges, led by old-vine Carignan with Grenache and Syrah - and Boutenac as its named cru.',
   'Schist, limestone and galets across wildly varied terrain.',
   'One of France''s largest AOCs - old-vine Carignan country',
   'Corbieres-Boutenac is the named cru within it'),
  ('limoux',
   'Cool Atlantic-tinged hills south of Carcassonne where sparkling wine claims a 1531 birth at Saint-Hilaire - Blanquette from Mauzac, Cremant from Chardonnay and Chenin, plus barrel-fermented still Chardonnay.',
   'Clay-limestone on cool upland slopes.',
   'Blanquette de Limoux (1531) predates Champagne''s sparkle',
   'Mauzac for Blanquette; Chardonnay/Chenin for Cremant and still whites'),
  ('banyuls',
   'Steep schist terraces falling to the sea at the Spanish border: Grenache picked ripe and fortified into vin doux naturel, aged oxidatively to rancio depth. Collioure shares the terraces for dry wines.',
   'Thin brown schist on near-vertical terraced slopes.',
   'Vin doux naturel from old Grenache on sea-facing schist',
   'Banyuls Grand Cru requires longer wood ageing')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.languedoc-roussillon.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place (library-present only; 66 rows).
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.languedoc-roussillon', 'Grenache', 'PRINCIPAL', 'The southern backbone'),
  ('france.languedoc-roussillon', 'Syrah',    'PRINCIPAL', null),
  ('france.languedoc-roussillon', 'Carignan', 'PRINCIPAL', 'Old-vine heritage'),
  ('france.languedoc-roussillon', 'Mourvèdre', 'ACCESSORY', null),
  ('france.languedoc-roussillon', 'Cinsault',  'ACCESSORY', null),
  ('france.languedoc-roussillon.corbieres', 'Carignan', 'PRINCIPAL', 'Old vines on schist and garrigue'),
  ('france.languedoc-roussillon.corbieres', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.corbieres', 'Syrah',    'ACCESSORY', null),
  ('france.languedoc-roussillon.corbieres-boutenac', 'Carignan', 'PRINCIPAL', 'The old-Carignan heart of Corbieres'),
  ('france.languedoc-roussillon.minervois', 'Syrah',    'PRINCIPAL', null),
  ('france.languedoc-roussillon.minervois', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.minervois-la-liviniere', 'Syrah', 'PRINCIPAL', 'The Minervois cru'),
  ('france.languedoc-roussillon.saint-chinian', 'Syrah',    'PRINCIPAL', null),
  ('france.languedoc-roussillon.saint-chinian', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.saint-chinian-berlou', 'Carignan', 'PRINCIPAL', 'Schist cru'),
  ('france.languedoc-roussillon.saint-chinian-roquebrun', 'Syrah', 'PRINCIPAL', 'Schist cru'),
  ('france.languedoc-roussillon.faugeres', 'Syrah',    'PRINCIPAL', 'On pure schist'),
  ('france.languedoc-roussillon.faugeres', 'Carignan', 'ACCESSORY', null),
  ('france.languedoc-roussillon.fitou', 'Carignan', 'PRINCIPAL', 'The Languedoc''s oldest red AOC (1948)'),
  ('france.languedoc-roussillon.fitou', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.cabardes', 'Syrah',  'PRINCIPAL', 'Atlantic meets Mediterranean'),
  ('france.languedoc-roussillon.cabardes', 'Merlot', 'ACCESSORY', 'The Atlantic half of the blend'),
  ('france.languedoc-roussillon.malepere', 'Merlot',         'PRINCIPAL', 'The most Atlantic Languedoc AOC'),
  ('france.languedoc-roussillon.malepere', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.languedoc-roussillon.limoux', 'Mauzac',      'PRINCIPAL', 'Blanquette de Limoux'),
  ('france.languedoc-roussillon.limoux', 'Chardonnay',  'PRINCIPAL', 'Cremant and barrel-fermented still whites'),
  ('france.languedoc-roussillon.limoux', 'Chenin Blanc', 'ACCESSORY', 'In Cremant blends'),
  ('france.languedoc-roussillon.costieres-de-nimes', 'Syrah',    'PRINCIPAL', null),
  ('france.languedoc-roussillon.costieres-de-nimes', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.cotes-du-roussillon', 'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.cotes-du-roussillon', 'Syrah',    'ACCESSORY', null),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages', 'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages', 'Syrah',    'ACCESSORY', null),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages-caramany',   'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages-les-aspres', 'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde',  'Grenache', 'PRINCIPAL', 'On granite sand'),
  ('france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel',   'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.collioure', 'Grenache',  'PRINCIPAL', 'Dry wines from the Banyuls terraces'),
  ('france.languedoc-roussillon.collioure', 'Mourvèdre', 'ACCESSORY', null),
  ('france.languedoc-roussillon.banyuls',           'Grenache', 'PRINCIPAL', 'Vin doux naturel'),
  ('france.languedoc-roussillon.banyuls-grand-cru', 'Grenache', 'PRINCIPAL', 'Min 75%, long wood ageing'),
  ('france.languedoc-roussillon.maury',             'Grenache', 'PRINCIPAL', 'Vin doux naturel on black schist'),
  ('france.languedoc-roussillon.rivesaltes', 'Grenache', 'PRINCIPAL', 'Ambre and tuile VDN'),
  ('france.languedoc-roussillon.rivesaltes', 'Muscat',   'ACCESSORY', null),
  ('france.languedoc-roussillon.grand-roussillon', 'Grenache', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.muscat-de-rivesaltes',             'Muscat', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.muscat-de-frontignan',             'Muscat', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.muscat-de-lunel',                  'Muscat', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.muscat-de-mireval',                'Muscat', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.muscat-de-saint-jean-de-minervois', 'Muscat', 'PRINCIPAL', 'VDN'),
  ('france.languedoc-roussillon.picpoul-de-pinet', 'Picpoul', 'PRINCIPAL', 'The Mediterranean oyster white'),
  ('france.languedoc-roussillon.la-clape', 'Grenache',  'PRINCIPAL', null),
  ('france.languedoc-roussillon.la-clape', 'Mourvèdre', 'ACCESSORY', 'Bourboulenc leads the whites'),
  ('france.languedoc-roussillon.pic-saint-loup', 'Syrah',    'PRINCIPAL', 'The cool northern cru'),
  ('france.languedoc-roussillon.pic-saint-loup', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.terrasses-du-larzac', 'Syrah',    'PRINCIPAL', 'Altitude and cool nights'),
  ('france.languedoc-roussillon.terrasses-du-larzac', 'Grenache', 'ACCESSORY', null),
  ('france.languedoc-roussillon.languedoc-cabrieres',            'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-gres-de-montpellier',  'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-la-mejanelle',         'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-montpeyroux',          'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-quatourze',            'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-saint-christol',       'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-saint-drezery',        'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-saint-georges-d-orques', 'Grenache', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.languedoc-saint-saturnin',       'Grenache', 'PRINCIPAL', null)
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles (66 rows).
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED', null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key in (
  'france.languedoc-roussillon.corbieres',
  'france.languedoc-roussillon.corbieres-boutenac',
  'france.languedoc-roussillon.minervois',
  'france.languedoc-roussillon.minervois-la-liviniere',
  'france.languedoc-roussillon.saint-chinian',
  'france.languedoc-roussillon.saint-chinian-berlou',
  'france.languedoc-roussillon.saint-chinian-roquebrun',
  'france.languedoc-roussillon.faugeres',
  'france.languedoc-roussillon.fitou',
  'france.languedoc-roussillon.cabardes',
  'france.languedoc-roussillon.malepere',
  'france.languedoc-roussillon.costieres-de-nimes',
  'france.languedoc-roussillon.cotes-du-roussillon',
  'france.languedoc-roussillon.cotes-du-roussillon-villages',
  'france.languedoc-roussillon.cotes-du-roussillon-villages-caramany',
  'france.languedoc-roussillon.cotes-du-roussillon-villages-les-aspres',
  'france.languedoc-roussillon.cotes-du-roussillon-villages-lesquerde',
  'france.languedoc-roussillon.cotes-du-roussillon-villages-tautavel',
  'france.languedoc-roussillon.collioure',
  'france.languedoc-roussillon.pic-saint-loup',
  'france.languedoc-roussillon.terrasses-du-larzac',
  'france.languedoc-roussillon.la-clape',
  'france.languedoc-roussillon.languedoc-cabrieres',
  'france.languedoc-roussillon.languedoc-gres-de-montpellier',
  'france.languedoc-roussillon.languedoc-la-mejanelle',
  'france.languedoc-roussillon.languedoc-montpeyroux',
  'france.languedoc-roussillon.languedoc-quatourze',
  'france.languedoc-roussillon.languedoc-saint-christol',
  'france.languedoc-roussillon.languedoc-saint-drezery',
  'france.languedoc-roussillon.languedoc-saint-georges-d-orques',
  'france.languedoc-roussillon.languedoc-saint-saturnin'
)
on conflict (wine_place_id, style) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'WHITE',
       case
         when p.canonical_key = 'france.languedoc-roussillon.limoux' then 'Chardonnay, Mauzac, Chenin'
         when p.canonical_key = 'france.languedoc-roussillon.picpoul-de-pinet' then 'Picpoul'
         when p.canonical_key = 'france.languedoc-roussillon.la-clape' then 'Bourboulenc'
         when p.canonical_key = 'france.languedoc-roussillon.clairette-du-languedoc' then 'Clairette - not yet in the grape library'
         else null
       end,
       case when p.canonical_key = 'france.languedoc-roussillon.la-clape' then 1 else 0 end,
       'PUBLISHED'
from wine_places p
where p.canonical_key in (
  'france.languedoc-roussillon.limoux',
  'france.languedoc-roussillon.picpoul-de-pinet',
  'france.languedoc-roussillon.la-clape',
  'france.languedoc-roussillon.clairette-du-languedoc',
  'france.languedoc-roussillon.clairette-du-languedoc-adissan',
  'france.languedoc-roussillon.clairette-du-languedoc-aspiran',
  'france.languedoc-roussillon.clairette-du-languedoc-cabrieres',
  'france.languedoc-roussillon.clairette-du-languedoc-ceyras',
  'france.languedoc-roussillon.clairette-du-languedoc-fontes',
  'france.languedoc-roussillon.clairette-du-languedoc-le-bosc',
  'france.languedoc-roussillon.clairette-du-languedoc-lieuran-cabrieres',
  'france.languedoc-roussillon.clairette-du-languedoc-nizas',
  'france.languedoc-roussillon.clairette-du-languedoc-paulhan',
  'france.languedoc-roussillon.clairette-du-languedoc-peret',
  'france.languedoc-roussillon.clairette-du-languedoc-saint-andre-de-sangonis',
  'france.languedoc-roussillon.clairette-de-bellegarde'
)
on conflict (wine_place_id, style) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('france.languedoc-roussillon', 'RED',       'Grenache, Syrah, Mourvedre, Carignan', 0),
  ('france.languedoc-roussillon', 'WHITE',     null, 1),
  ('france.languedoc-roussillon', 'ROSE',      null, 2),
  ('france.languedoc-roussillon', 'SWEET',     'The vins doux naturels', 3),
  ('france.languedoc-roussillon', 'SPARKLING', 'Limoux', 4),
  ('france.languedoc-roussillon.costieres-de-nimes',   'ROSE', null, 1),
  ('france.languedoc-roussillon.cotes-du-roussillon',  'ROSE', null, 1),
  ('france.languedoc-roussillon.collioure',            'ROSE', null, 1),
  ('france.languedoc-roussillon.banyuls',              'SWEET', 'Vin doux naturel', 0),
  ('france.languedoc-roussillon.banyuls-grand-cru',    'SWEET', 'Vin doux naturel, long wood ageing', 0),
  ('france.languedoc-roussillon.maury',                'SWEET', 'Vin doux naturel', 0),
  ('france.languedoc-roussillon.rivesaltes',           'SWEET', 'Ambre and tuile VDN', 0),
  ('france.languedoc-roussillon.grand-roussillon',     'SWEET', 'Vin doux naturel', 0),
  ('france.languedoc-roussillon.muscat-de-rivesaltes', 'SWEET', 'Muscat VDN', 0),
  ('france.languedoc-roussillon.muscat-de-frontignan', 'SWEET', 'Muscat VDN', 0),
  ('france.languedoc-roussillon.muscat-de-lunel',      'SWEET', 'Muscat VDN', 0),
  ('france.languedoc-roussillon.muscat-de-mireval',    'SWEET', 'Muscat VDN', 0),
  ('france.languedoc-roussillon.muscat-de-saint-jean-de-minervois', 'SWEET', 'Muscat VDN', 0),
  ('france.languedoc-roussillon.limoux', 'SPARKLING', 'Blanquette and Cremant', 1)
) as v(ck, style, note, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_a <> 4 then raise exception 'expected 4 languedoc articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_g <> 66 then raise exception 'expected 66 languedoc grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.languedoc-roussillon%';
  if v_s <> 66 then raise exception 'expected 66 languedoc styles, got %', v_s; end if;
end;
$$;
