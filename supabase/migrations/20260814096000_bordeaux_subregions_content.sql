-- Phase 3E content: articles, styles and grapes for the 11 new Bordeaux
-- appellations. Published directly (standing owner pattern). Insert-only.

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.sort, 'PUBLISHED'
from (values
  ('france.bordeaux.haut-medoc.listrac-medoc', 'RED', 'Red only', 0),
  ('france.bordeaux.montagne-saint-emilion', 'RED', 'Red only', 0),
  ('france.bordeaux.lussac-saint-emilion', 'RED', 'Red only', 0),
  ('france.bordeaux.puisseguin-saint-emilion', 'RED', 'Red only', 0),
  ('france.bordeaux.saint-georges-saint-emilion', 'RED', 'Red only', 0),
  ('france.bordeaux.lalande-de-pomerol', 'RED', 'Red only', 0),
  ('france.bordeaux.cadillac', 'SWEET', 'Botrytis-influenced sweet white', 0),
  ('france.bordeaux.cerons', 'SWEET', 'Sweet white; some dry made as Graves', 0),
  ('france.bordeaux.loupiac', 'SWEET', 'Sweet white', 0),
  ('france.bordeaux.sainte-croix-du-mont', 'SWEET', 'Sweet white', 0),
  ('france.bordeaux.cotes-de-bordeaux-saint-macaire', 'SWEET', 'Sweet and off-dry white', 0)
) as v(key, style, note, sort)
join wine_places p on p.canonical_key = v.key
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, v.share, v.note, 'PUBLISHED'
from (values
  ('france.bordeaux.haut-medoc.listrac-medoc', 'Merlot', 'PRINCIPAL', 50, null),
  ('france.bordeaux.haut-medoc.listrac-medoc', 'Cabernet Sauvignon', 'PRINCIPAL', 42, null),
  ('france.bordeaux.haut-medoc.listrac-medoc', 'Cabernet Franc', 'ACCESSORY', 5, null),
  ('france.bordeaux.haut-medoc.listrac-medoc', 'Petit Verdot', 'ACCESSORY', 3, null),
  ('france.bordeaux.montagne-saint-emilion', 'Merlot', 'PRINCIPAL', 75, null),
  ('france.bordeaux.montagne-saint-emilion', 'Cabernet Franc', 'ACCESSORY', 18, null),
  ('france.bordeaux.montagne-saint-emilion', 'Cabernet Sauvignon', 'ACCESSORY', 6, null),
  ('france.bordeaux.lussac-saint-emilion', 'Merlot', 'PRINCIPAL', 78, null),
  ('france.bordeaux.lussac-saint-emilion', 'Cabernet Franc', 'ACCESSORY', 15, null),
  ('france.bordeaux.lussac-saint-emilion', 'Cabernet Sauvignon', 'ACCESSORY', 6, null),
  ('france.bordeaux.puisseguin-saint-emilion', 'Merlot', 'PRINCIPAL', 80, null),
  ('france.bordeaux.puisseguin-saint-emilion', 'Cabernet Franc', 'ACCESSORY', 15, null),
  ('france.bordeaux.saint-georges-saint-emilion', 'Merlot', 'PRINCIPAL', 78, null),
  ('france.bordeaux.saint-georges-saint-emilion', 'Cabernet Franc', 'ACCESSORY', 16, null),
  ('france.bordeaux.lalande-de-pomerol', 'Merlot', 'PRINCIPAL', 75, null),
  ('france.bordeaux.lalande-de-pomerol', 'Cabernet Franc', 'ACCESSORY', 20, null),
  ('france.bordeaux.cadillac', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.cadillac', 'Sauvignon Blanc', 'ACCESSORY', 15, null),
  ('france.bordeaux.cadillac', 'Muscadelle', 'ACCESSORY', 5, null),
  ('france.bordeaux.cerons', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.cerons', 'Sauvignon Blanc', 'ACCESSORY', 18, null),
  ('france.bordeaux.loupiac', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.loupiac', 'Sauvignon Blanc', 'ACCESSORY', 15, null),
  ('france.bordeaux.loupiac', 'Muscadelle', 'ACCESSORY', 5, null),
  ('france.bordeaux.sainte-croix-du-mont', 'Semillon', 'PRINCIPAL', 85, null),
  ('france.bordeaux.sainte-croix-du-mont', 'Sauvignon Blanc', 'ACCESSORY', 12, null),
  ('france.bordeaux.cotes-de-bordeaux-saint-macaire', 'Semillon', 'PRINCIPAL', 80, null),
  ('france.bordeaux.cotes-de-bordeaux-saint-macaire', 'Sauvignon Blanc', 'ACCESSORY', 18, null)
) as v(key, grape, role, share, note)
join wine_places p on p.canonical_key = v.key
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, soils, key_facts, editorial_status)
select p.id, v.description, v.soils, v.facts, 'PUBLISHED'
from (values
  ('france.bordeaux.haut-medoc.listrac-medoc',
   'The Médoc''s highest point inland from the estuary — sturdy, structured Cabernet-led reds with a Merlot backbone, and the peninsula''s Cru Bourgeois heartland.',
   'Gravel rises over limestone and clay, further from the river than the great communes.',
   array['Red only', 'No 1855 growths — Cru Bourgeois country', 'The Médoc''s highest elevation']),
  ('france.bordeaux.montagne-saint-emilion',
   'The largest of the Saint-Émilion satellites, just north across the Barbanne — supple, plummy Merlot at friendly prices, absorbing the former Saint-Georges and Parsac AOCs.',
   'Clay-limestone slopes and gravel.',
   array['Largest Saint-Émilion satellite', 'Merlot-dominant', 'Includes the old Parsac and Saint-Georges zones']),
  ('france.bordeaux.lussac-saint-emilion',
   'The northernmost satellite — rounded, early-drinking Merlot from a patchwork of clay, sand and limestone.',
   'Clay-limestone, sand and gravel.',
   array['The northernmost satellite', 'Merlot-led, approachable young']),
  ('france.bordeaux.puisseguin-saint-emilion',
   'A limestone-plateau satellite east of Montagne — firmer, more structured Merlot built to age a little longer than its neighbours.',
   'Limestone plateau with clay.',
   array['Firmest of the satellites', 'Limestone plateau']),
  ('france.bordeaux.saint-georges-saint-emilion',
   'The smallest Bordeaux AOC of all — a single hillside enclave inside Montagne whose growers may use either name; almost everyone chooses this one for its old cachet.',
   'South-facing clay-limestone slope.',
   array['One of Bordeaux''s smallest AOCs', 'May also be sold as Montagne-Saint-Émilion', 'A single south-facing slope']),
  ('france.bordeaux.lalande-de-pomerol',
   'Pomerol''s northern neighbour across the Barbanne — plush, Merlot-driven reds with much of Pomerol''s velvet at a fraction of the price.',
   'Gravel, sand and clay over the iron pan.',
   array['Pomerol''s more affordable neighbour', 'Merlot-dominant, plush', 'Absorbed the old Néac AOC']),
  ('france.bordeaux.cadillac',
   'A right-bank sweet-white AOC on the Garonne facing Sauternes — botrytised Sémillon, richer and pricier than Loupiac or Sainte-Croix, sharing the town''s name with a red Côtes de Bordeaux.',
   'Clay-limestone slopes above the Garonne.',
   array['Sweet white only (the AOC of this name)', 'Faces Sauternes across the river', 'Botrytis in the best years']),
  ('france.bordeaux.cerons',
   'A sweet-wine enclave within the Graves, wrapped around three communes — delicate, honeyed Sémillon lighter than Sauternes; growers may also declassify to Graves.',
   'Graves gravel over limestone.',
   array['A sweet enclave inside the Graves', 'Lighter than Sauternes', 'Some dry wine sold as Graves']),
  ('france.bordeaux.loupiac',
   'A right-bank sweet AOC opposite Barsac — bright, honeyed botrytis whites with more freshness and less weight than their Sauternes counterparts.',
   'Clay-limestone slopes facing the river.',
   array['Sweet white only', 'Faces Barsac across the Garonne', 'Fresher, lighter sweet style']),
  ('france.bordeaux.sainte-croix-du-mont',
   'The steep limestone terrace south of Loupiac — sweet whites of real cut and minerality, from slopes riddled with ancient fossil-oyster beds.',
   'Fossil-oyster limestone escarpment.',
   array['Sweet white only', 'Famous fossil-oyster cliffs', 'The most mineral of the right-bank sweets']),
  ('france.bordeaux.cotes-de-bordeaux-saint-macaire',
   'A tiny, little-seen sweet and off-dry white AOC at Bordeaux''s south-eastern tip, the last outpost before Entre-Deux-Mers gives way to open country.',
   'Clay-limestone hills.',
   array['One of Bordeaux''s smallest and rarest AOCs', 'Sweet to off-dry white', 'South-eastern edge of the region'])
) as v(key, description, soils, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_missing int;
begin
  select count(*) into v_missing from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bordeaux%'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception '% Bordeaux places lack an article', v_missing;
  end if;
end $$;
