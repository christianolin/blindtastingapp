-- Portugal wave 1: the `portugal` COUNTRY node and the seven regions that carry
-- the country's name recognition — Minho (Vinho Verde), Douro, Dão, Bairrada,
-- Península de Setúbal, Alentejo and Madeira — with their principal DOs and
-- the sub-regions that have a published area definition.
--
-- Modelling notes:
--  * Portugal separates the geographic region from the DO that sits on it, and
--    several regions carry two coextensive DOs (Douro/Porto; Madeira/
--    Madeirense; Palmela/Setúbal). So regions are plain REGION nodes and the
--    DOs are APPELLATION children — the France/Italy pattern, not Germany's
--    dual-role Anbaugebiet.
--  * The Douro's three classic sub-regions (Baixo Corgo, Cima Corgo, Douro
--    Superior) and the Alentejo's eight are defined by *freguesias*, not whole
--    concelhos, so a concelho-union would badly overstate them (the Évora
--    concelho alone appears in three Alentejo sub-regions). They land here as
--    tree-only nodes with no geometry; a later wave can cut them from CAOP's
--    freguesias layer. The nine Vinho Verde sub-regions are concelho-defined
--    and do get boundaries.
--  * Boundaries are attached by 20260903110000_portugal_wave1_boundaries.sql.
--    Regions, sub-regions and DOs land DRAFT and that migration promotes the
--    ones it can prove; the country lands VERIFIED (country keys never rename).

begin;

-- Portuguese varieties. Aragonez is Tinta Roriz and Pedernã is Arinto, so
-- neither gets a second row; the synonym lives in the place-level local_note.
insert into grapes (name, color, description)
select v.name, v.color, v.description
from (values
  ('Alvarinho', 'WHITE',
   'The prestige white of the Minho''s far north, at its best on the granite of Monção e Melgaço where the Atlantic''s edge is blunted by hills. Thick-skinned and low-yielding, it gives an unusually concentrated citrus-and-stone-fruit wine with real weight — the same grape Spain calls Albariño, but typically drier, firmer and more ageworthy on the Portuguese bank.'),
  ('Loureiro', 'WHITE',
   'The most planted quality white of the Vinho Verde region and the source of its perfume: laurel, orange blossom and lime, with high acidity and modest alcohol. Excels in the Lima and Cávado valleys.'),
  ('Arinto', 'WHITE',
   'Portugal''s great acid-keeper, planted from the Minho (where it is called Pedernã) to the Alentejo. Neutral and lemony when young, it holds freshness in hot years and takes on a waxy, mineral depth with age — which is why it appears in almost every serious white blend in the country.'),
  ('Avesso', 'WHITE',
   'A fuller, riper Vinho Verde white from the sheltered inland valleys around Baião and Amarante, where the Atlantic influence fades. Peach and citrus with more body and less bite than Loureiro.'),
  ('Trajadura', 'WHITE',
   'A low-acid, apple-scented white used to round out Alvarinho and Loureiro blends in the Minho. Known as Treixadura across the border in Galicia.'),
  ('Azal', 'WHITE',
   'A late-ripening, sharply acidic Minho white — green apple and lemon at very low alcohol. Traditional in the Basto and Sousa sub-regions.'),
  ('Espadeiro', 'RED',
   'A pale, high-acid Minho red mostly used for the region''s bracing rosés. Light in colour and body, with red-fruit lift.'),
  ('Sousão', 'RED',
   'A deeply pigmented, ferociously acidic red — Vinhão in the Minho, where it makes the region''s inky, tart traditional red. In the Douro it is prized for the colour and freshness it lends to Port blends, and it is now planted for the same reason in warm regions worldwide.'),
  ('Tinto Cão', 'RED',
   'One of the Douro''s five classic Port varieties and the rarest: small berries, low yields, and wines of fine tannin and aromatic lift that age exceptionally well. Nearly lost in the twentieth century.'),
  ('Rabigato', 'WHITE',
   'A Douro white of high acidity and floral, citrus-peel character that holds up in the heat of the upper valley. Increasingly the backbone of serious white Douro.'),
  ('Viosinho', 'WHITE',
   'A low-yielding Douro white giving weight, texture and stone-fruit depth — the body in a white Douro blend, where Rabigato and Gouveio supply the acid.'),
  ('Gouveio', 'WHITE',
   'A crisp, apple-and-citrus Douro white, the same variety as Spain''s Godello. Reliable acidity at altitude.'),
  ('Códega do Larinho', 'WHITE',
   'A soft, floral Douro white with low acidity, used for aromatic lift in blends. Distinct from the unrelated Códega, which is Síria.'),
  ('Malvasia Fina', 'WHITE',
   'A widely planted, gently aromatic white of the Douro and Dão — restrained and nutty, and the traditional base of white Port.'),
  ('Encruzado', 'WHITE',
   'The Dão''s great white and one of Portugal''s finest: naturally balanced, textural and citrus-and-pine-scented, it takes to oak and lees ageing better than almost any other Portuguese white and ages for a decade or more.'),
  ('Jaen', 'RED',
   'An early-ripening red giving soft, juicy, low-tannin wines of bright red fruit — the fleshy counterweight to Touriga Nacional in a Dão blend. The same grape as Galicia''s Mencía.'),
  ('Alfrocheiro', 'RED',
   'A Dão speciality: deep colour, blackberry and violet perfume, and supple tannin. Prone to rot, so it rewards careful sites.'),
  ('Baga', 'RED',
   'Bairrada''s difficult, magnificent red: thick-skinned, late-ripening and packed with acid and tannin, it makes lean, austere wine in poor years and structured, long-lived wine in good ones. Also the base of much of the region''s rosé and sparkling.'),
  ('Bical', 'WHITE',
   'A Bairrada white of firm acidity and pear-and-citrus character, well suited to traditional-method sparkling and capable of ageing in still form.'),
  ('Fernão Pires', 'WHITE',
   'Portugal''s most planted white grape, aromatic and floral with low acidity, ripening early. Called Maria Gomes in the Bairrada, where much of it goes into sparkling wine.'),
  ('Castelão', 'RED',
   'The workhorse red of southern Portugal, at its best on the sandy soils around Palmela — raspberry and tobacco with firm acidity and real ageing capacity. Long sold under the brand name Periquita.'),
  ('Moscatel Graúdo', 'WHITE',
   'Muscat of Alexandria, the grape of Moscatel de Setúbal: fortified, then macerated on its skins for months so the wine takes on an orange-peel and raisin intensity found nowhere else.'),
  ('Moscatel Roxo', 'WHITE',
   'A rare pink-skinned Muscat of the Setúbal Peninsula, lower-yielding and more delicate than Moscatel Graúdo, giving a fortified wine of rose and dried-fruit perfume.'),
  ('Vital', 'WHITE',
   'A neutral, productive white of the Lisbon and Setúbal areas, grown for volume rather than character.'),
  ('Trincadeira', 'RED',
   'An Alentejo mainstay — high-acid, peppery and herbal, with fine tannin — but thin-skinned and rot-prone, so it needs the dry south. Known as Tinta Amarela in the Douro.'),
  ('Alicante Bouschet', 'RED',
   'A red-fleshed French crossing that found its true home in the Alentejo, where the heat gives it depth, colour and dark, savoury fruit rather than the coarseness it shows elsewhere. Central to the region''s most serious reds.'),
  ('Antão Vaz', 'WHITE',
   'The Alentejo''s own white: drought-tolerant, ripening to a rich, tropical, full-bodied wine that needs Arinto or Roupeiro for acidity, and takes well to oak.'),
  ('Síria', 'WHITE',
   'A widely planted white of the interior — Roupeiro in the Alentejo, Códega in the Douro — giving fragrant, melon-scented wine that must be picked early and drunk young, as it oxidises fast.'),
  ('Sercial', 'WHITE',
   'The driest of the four classic Madeira noble varieties, grown highest and picked at searing acidity. Bone-dry, almond-and-lime, and famously austere in youth.'),
  ('Verdelho', 'WHITE',
   'A Madeira noble variety giving medium-dry wine of smoke, citrus peel and honey. Also planted, unrelated in style, as a dry table white in Australia.'),
  ('Boal', 'WHITE',
   'A Madeira noble variety — Bual in English — grown on the warmer south coast, giving medium-sweet wine of raisin, coffee and dark caramel.'),
  ('Terrantez', 'WHITE',
   'The rarest of the Madeira noble varieties, all but extinct after phylloxera and now slowly replanted. Fiercely acidic and intensely perfumed — the connoisseur''s Madeira.'),
  ('Tinta Negra', 'RED',
   'The most planted variety on Madeira by far — around four-fifths of the island''s vineyard — and the base of most Madeira sold. Adaptable enough to be vinified across the full sweetness range, and since 2015 permitted to carry a vintage.')
) as v(name, color, description)
where not exists (select 1 from grapes g where g.name = v.name);

-- Tinta Barroca predates this wave with a null colour.
update grapes set color = 'RED' where name = 'Tinta Barroca' and color is null;

-- portugal (COUNTRY, tier 0).
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order
) values (
  'portugal', 'portugal', 'Portugal', 'COUNTRY', 0, 1.5, 2,
  false, 'VERIFIED', 130
);

-- The seven regions, ordered north to south with Madeira last.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select v.slug, 'portugal.' || v.slug, v.name, 'REGION', 1, 4, 4,
       false, 'DRAFT', v.so, p.id
from (values
  ('minho',                'Minho',                 10),
  ('douro',                'Douro',                 20),
  ('dao',                  'Dão',                   30),
  ('bairrada',             'Bairrada',              40),
  ('peninsula-de-setubal', 'Península de Setúbal',  50),
  ('alentejo',             'Alentejo',              60),
  ('madeira',              'Madeira',               70)
) as v(slug, name, so)
join wine_places p on p.canonical_key = 'portugal';

-- The ten principal DOs. Each is coextensive with its region except Palmela
-- and Setúbal, which share a three-concelho core inside the peninsula.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, appellation_system, appellation_level,
  publication_status, sort_order, primary_parent_id
)
select v.slug, 'portugal.' || v.region || '.' || v.slug, v.name, 'APPELLATION',
       2, 6, 6, true, 'DOP', v.level, 'DRAFT', v.so, p.id
from (values
  ('minho',                'vinho-verde', 'Vinho Verde', 'regional',    110),
  ('douro',                'porto',       'Porto',       'regional',    210),
  ('douro',                'douro',       'Douro',       'regional',    220),
  ('dao',                  'dao',         'Dão',         'regional',    310),
  ('bairrada',             'bairrada',    'Bairrada',    'regional',    410),
  ('peninsula-de-setubal', 'setubal',     'Setúbal',     'subregional', 510),
  ('peninsula-de-setubal', 'palmela',     'Palmela',     'subregional', 520),
  ('alentejo',             'alentejo',    'Alentejo',    'regional',    610),
  ('madeira',              'madeira',     'Madeira',     'regional',    710),
  ('madeira',              'madeirense',  'Madeirense',  'regional',    720)
) as v(region, slug, name, level, so)
join wine_places p on p.canonical_key = 'portugal.' || v.region;

-- Sub-regions. The nine Vinho Verde ones are concelho-defined and get
-- boundaries; the Douro and Alentejo ones are freguesia-defined and stay
-- tree-only until a freguesia-level cut exists.
insert into wine_places (
  slug, canonical_key, name, kind, display_tier, min_zoom, label_min_zoom,
  is_appellation, publication_status, sort_order, primary_parent_id
)
select v.slug, 'portugal.' || v.region || '.' || v.slug, v.name, 'SUBREGION',
       2, 5, 5, false, 'DRAFT', v.so, p.id
from (values
  ('minho',    'moncao-e-melgaco', 'Monção e Melgaço', 120),
  ('minho',    'lima',             'Lima',             125),
  ('minho',    'cavado',           'Cávado',           130),
  ('minho',    'ave',              'Ave',              135),
  ('minho',    'basto',            'Basto',            140),
  ('minho',    'sousa',            'Sousa',            145),
  ('minho',    'amarante',         'Amarante',         150),
  ('minho',    'baiao',            'Baião',            155),
  ('minho',    'paiva',            'Paiva',            160),
  ('douro',    'baixo-corgo',      'Baixo Corgo',      230),
  ('douro',    'cima-corgo',       'Cima Corgo',       235),
  ('douro',    'douro-superior',   'Douro Superior',   240),
  ('alentejo', 'portalegre',       'Portalegre',       620),
  ('alentejo', 'borba',            'Borba',            625),
  ('alentejo', 'redondo',          'Redondo',          630),
  ('alentejo', 'reguengos',        'Reguengos',        635),
  ('alentejo', 'evora',            'Évora',            640),
  ('alentejo', 'vidigueira',       'Vidigueira',       645),
  ('alentejo', 'granja-amareleja', 'Granja-Amareleja', 650),
  ('alentejo', 'moura',            'Moura',            655)
) as v(region, slug, name, so)
join wine_places p on p.canonical_key = 'portugal.' || v.region;

do $$
declare n int;
begin
  select count(*) into n from wine_places where canonical_key like 'portugal%';
  if n <> 38 then raise exception 'expected 38 portugal places (1 country + 7 regions + 10 DOs + 20 sub-regions), got %', n; end if;
  select count(*) into n from wine_places
  where canonical_key like 'portugal.%' and primary_parent_id is null;
  if n <> 0 then raise exception '% portugal places have no parent', n; end if;
end $$;

commit;
