-- Jura — knowledge content (v1, published).
--
-- Region profile + a concise article per village AOC (5 places is small
-- enough for full per-place prose, like Beaujolais). Grapes linked per place
-- by what each AOC permits: Chateau-Chalon is Savagnin-only vin jaune,
-- L'Etoile is white (plus Poulsard in vin de paille). Grape names match the
-- live `grapes` rows exactly. Insert-only with existence/conflict guards so
-- a re-run is a no-op. ASCII prose (accents live on wine_places).

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'A narrow band of vines on the Revermont foothills facing Burgundy across the Bresse plain - small, singular and stubbornly traditional. Home of vin jaune (voile-aged Savagnin) and vin de paille, with Chardonnay the most-planted grape and light reds from Poulsard and Trousseau.',
  'Semi-continental and cool, wetter than Burgundy; slopes catch the drying winds.',
  'Grey, blue and red marls (the key to Savagnin) with limestone scree along the Revermont.',
  array[
    'Vin jaune: Savagnin aged 6+ years under a flor-like voile, bottled in the 62 cl clavelin',
    'Five grapes: Chardonnay, Savagnin, Poulsard, Trousseau, Pinot Noir',
    'Geographic AOCs: Cotes du Jura, Arbois (+ Pupillin), Chateau-Chalon, L''Etoile',
    'Cremant du Jura and Macvin du Jura are product AOCs over the same vineyards'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.jura'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Semi-continental and cool; sheltered Revermont slopes.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('arbois',
   'The Jura''s biggest and best-known AOC, around the town of Arbois - the historic heart of the region and its red-wine capital, from Poulsard, Trousseau and Pinot Noir alongside Chardonnay, Savagnin and vin jaune.',
   'Red marls and limestone below the Revermont escarpment.',
   'The Jura''s largest geographic AOC and first French AOC decree (1936)',
   'Reds lead: Poulsard, Trousseau and Pinot Noir; whites and vin jaune too'),
  ('arbois-pupillin',
   'Arbois with the named village complement for Pupillin, the self-styled world capital of Ploussard (Poulsard) - the village''s light, pale, perfumed reds carry its name.',
   'Red marls under the Pupillin plateau.',
   'A named-village complement within the Arbois AOC',
   'Pupillin calls Poulsard "Ploussard" - its signature grape'),
  ('chateau-chalon',
   'The vin jaune AOC: a tiny amphitheatre of marl below the clifftop village, growing only Savagnin for wine aged over six years under voile. No other style may carry the name; in weak years the growers declassify the entire vintage.',
   'Blue and grey marls in a sheltered south-west amphitheatre.',
   'Vin jaune only, from Savagnin - sold in the 62 cl clavelin',
   'The whole vintage is declassified in unworthy years'),
  ('l-etoile',
   'A small white-wine AOC named for the star-shaped fossil crinoids in its marls - Chardonnay and Savagnin whites, vin jaune and vin de paille.',
   'Star-fossil (crinoid) marls and limestone.',
   'White wines only: Chardonnay and Savagnin, plus vin jaune and paille',
   'Named for the star-shaped crinoid fossils in its soils')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.jura.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place, by what each AOC permits.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  -- Region (Cotes du Jura footprint): all five.
  ('france.jura', 'Chardonnay', 'PRINCIPAL', 'The Jura''s most-planted grape'),
  ('france.jura', 'Savagnin',   'PRINCIPAL', 'The vin jaune grape, on marl'),
  ('france.jura', 'Poulsard',   'ACCESSORY', 'Pale, perfumed reds'),
  ('france.jura', 'Trousseau',  'ACCESSORY', 'The Jura''s structured red'),
  ('france.jura', 'Pinot Noir', 'ACCESSORY', 'Often blended in Jura reds'),
  -- Arbois: red-led, all five permitted.
  ('france.jura.arbois', 'Poulsard',   'PRINCIPAL', 'Arbois is the Jura''s red capital'),
  ('france.jura.arbois', 'Trousseau',  'PRINCIPAL', 'Best on the warm gravels'),
  ('france.jura.arbois', 'Chardonnay', 'ACCESSORY', null),
  ('france.jura.arbois', 'Savagnin',   'ACCESSORY', 'Vin jaune and ouille whites'),
  ('france.jura.arbois', 'Pinot Noir', 'ACCESSORY', null),
  -- Arbois Pupillin: same AOC, Ploussard first.
  ('france.jura.arbois-pupillin', 'Poulsard',   'PRINCIPAL', 'Pupillin: the capital of Ploussard'),
  ('france.jura.arbois-pupillin', 'Trousseau',  'ACCESSORY', null),
  ('france.jura.arbois-pupillin', 'Chardonnay', 'ACCESSORY', null),
  ('france.jura.arbois-pupillin', 'Savagnin',   'ACCESSORY', null),
  ('france.jura.arbois-pupillin', 'Pinot Noir', 'ACCESSORY', null),
  -- Chateau-Chalon: Savagnin only (vin jaune).
  ('france.jura.chateau-chalon', 'Savagnin', 'PRINCIPAL', 'The only grape - vin jaune only'),
  -- L'Etoile: whites (+ Poulsard permitted in vin de paille).
  ('france.jura.l-etoile', 'Chardonnay', 'PRINCIPAL', null),
  ('france.jura.l-etoile', 'Savagnin',   'PRINCIPAL', 'Vin jaune too'),
  ('france.jura.l-etoile', 'Poulsard',   'ACCESSORY', 'Permitted in vin de paille')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles per place.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('france.jura', 'WHITE', 'Chardonnay and Savagnin, incl. vin jaune', 0),
  ('france.jura', 'RED',   'Poulsard, Trousseau, Pinot Noir', 1),
  ('france.jura', 'SWEET', 'Vin de paille (straw wine)', 2),
  ('france.jura.arbois', 'RED',   'Poulsard, Trousseau, Pinot Noir', 0),
  ('france.jura.arbois', 'WHITE', 'Chardonnay, Savagnin, vin jaune', 1),
  ('france.jura.arbois', 'SWEET', 'Vin de paille', 2),
  ('france.jura.arbois-pupillin', 'RED',   'Ploussard above all', 0),
  ('france.jura.arbois-pupillin', 'WHITE', null, 1),
  ('france.jura.arbois-pupillin', 'SWEET', 'Vin de paille', 2),
  ('france.jura.chateau-chalon', 'WHITE', 'Vin jaune only', 0),
  ('france.jura.l-etoile', 'WHITE', 'Chardonnay and Savagnin, incl. vin jaune', 0),
  ('france.jura.l-etoile', 'SWEET', 'Vin de paille', 1)
) as v(ck, style, note, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.jura%';
  if v_a <> 5 then raise exception 'expected 5 jura articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.jura%';
  if v_g <> 19 then raise exception 'expected 19 jura grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.jura%';
  if v_s <> 12 then raise exception 'expected 12 jura styles, got %', v_s; end if;
end;
$$;
