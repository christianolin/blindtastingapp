-- Grape library — the 11 missing signature varieties (owner-approved:
-- they join the shared grapes list used by tasting autocomplete).
--
-- Every region shipped this phase whose signature grape was absent gets it
-- properly: Romorantin (Cour-Cheverny), Gringet (Ayze), Chasselas (Léman
-- crus + Pouilly-sur-Loire), Molette (Seyssel), Duras + Len de l'El
-- (Gaillac), Abouriou (Marmandais), Folle Blanche (Gros Plant), Pineau
-- d'Aunis (Coteaux du Loir), Sylvaner (Alsace/Zotzenberg) and Nielluccio —
-- Corsica's name for Sangiovese, promoted to a first-class row; the 7 Corse
-- links move from Sangiovese to Nielluccio (labels there say Nielluccio).
-- Négrette and Clairette already existed and only gain their place links.
-- Style notes that said "not yet in the grape library" are cleaned up.
-- Insert-only with guards; re-run no-op.

insert into grapes (name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
select * from (values
  ('Romorantin', 'WHITE', 'yellow-green',
   'A Loire rarity with exactly one AOC: Cour-Cheverny. Brought from Burgundy by Francois I in 1519; taut and citrusy young, gaining honey and beeswax with age.',
   'Green apple, citrus zest, honey, beeswax', 'High', 'None (white)', 'Light to medium', 'Medium',
   'Cour-Cheverny (Loire)'),
  ('Gringet', 'WHITE', 'pale gold',
   'An alpine survivor with about 20 hectares in the world, nearly all in Ayze (Haute-Savoie) - taut, herbal whites and a lively mousseux.',
   'Alpine herbs, pear, white flowers', 'High', 'None (white)', 'Light', 'Low to medium',
   'Ayze (Savoie)'),
  ('Chasselas', 'WHITE', 'pale green-gold',
   'The delicate, low-key grape of Lake Geneva''s shores (Crepy, Marin, Marignan, Ripaille) and Pouilly-sur-Loire - subtle, softly stony wines; Switzerland''s Fendant.',
   'White flowers, hazelnut, wet stone', 'Low to medium', 'None (white)', 'Light', 'Low to medium',
   'Savoie (Leman crus), Pouilly-sur-Loire, Switzerland'),
  ('Molette', 'WHITE', 'yellow-green',
   'Seyssel''s local white - fresh and appley, historically the base of the town''s traditional-method mousseux, usually lifted with Altesse.',
   'Green apple, citrus, blossom', 'High', 'None (white)', 'Light', 'Low to medium',
   'Seyssel (Savoie)'),
  ('Duras', 'RED', 'blue-black',
   'A Gaillac native (no relation to Cotes de Duras): peppery, violet-scented reds with firm structure, usually blended with Braucol.',
   'Black pepper, violet, dark berries', 'Medium to high', 'Medium to high', 'Medium', 'Medium',
   'Gaillac (Sud-Ouest)'),
  ('Abouriou', 'RED', 'deep purple',
   'The early-ripening native of the Cotes du Marmandais - dark-fruited, gently rustic, low in acid; almost nowhere else.',
   'Blackberry, plum, earth', 'Low to medium', 'Medium', 'Medium', 'Medium',
   'Cotes du Marmandais (Sud-Ouest)'),
  ('Folle Blanche', 'WHITE', 'yellow-green',
   'Bracing and neutral: Gros Plant du Pays Nantais sur lie by the Atlantic, and the historic base of Cognac and Armagnac before phylloxera.',
   'Lemon, green apple, sea spray', 'Very high', 'None (white)', 'Light', 'Low',
   'Pays Nantais (Gros Plant), Armagnac'),
  ('Pineau d''Aunis', 'RED', 'pale red-black',
   'The Loir valley''s native red - pale, aromatic wines with a white-pepper signature, as red or rose (Coteaux du Loir, Vendomois).',
   'White pepper, redcurrant, herbs', 'Medium to high', 'Low to medium', 'Light', 'Low to medium',
   'Coteaux du Loir, Coteaux du Vendomois (Loire)'),
  ('Len de l''El', 'WHITE', 'yellow-gold',
   'Gaillac''s native white - Occitan for "far from the eye" (the long-stalked bunch): supple pear-and-quince wines, often with Mauzac.',
   'Pear, quince, white peach', 'Low to medium', 'None (white)', 'Medium', 'Medium',
   'Gaillac (Sud-Ouest)'),
  ('Nielluccio', 'RED', 'deep ruby-black',
   'Corsica''s leading red, genetically Sangiovese: maquis herbs over dark cherry with firm tannin. Patrimonio reds are at least 90% Nielluccio.',
   'Dark cherry, maquis herbs, tobacco, dried tomato', 'High', 'High', 'Medium to full', 'Medium to high',
   'Patrimonio, Vin de Corse'),
  ('Sylvaner', 'WHITE', 'pale green',
   'Alsace''s old workhorse white, regaining respect - crisp, gently herbal, quietly mineral; Zotzenberg is the one Grand Cru that admits it.',
   'Green apple, herbs, wet stone', 'Medium to high', 'None (white)', 'Light to medium', 'Medium',
   'Alsace (Zotzenberg), Germany (Franken)')
) as v(name, color, skin_color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions)
where not exists (select 1 from grapes g where g.name = v.name);

-- Corse: Nielluccio becomes the first-class link (labels say Nielluccio).
update wine_place_grapes wg
   set grape_id = (select id from grapes where name = 'Nielluccio'),
       local_note = case p.canonical_key
         when 'france.corse' then 'The Patrimonio red - genetically Sangiovese'
         when 'france.corse.patrimonio' then 'Min 90% of reds'
         else null
       end
  from wine_places p, grapes s
 where p.id = wg.wine_place_id
   and s.id = wg.grape_id and s.name = 'Sangiovese'
   and p.canonical_key like 'france.corse%';

-- New place links (30).
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.sud-ouest.fronton', 'Négrette', 'PRINCIPAL', 'The Fronton grape - violet-scented'),
  ('france.sud-ouest.gaillac', 'Duras', 'PRINCIPAL', 'With Braucol in the reds'),
  ('france.sud-ouest.gaillac', 'Len de l''El', 'ACCESSORY', 'The native white, with Mauzac'),
  ('france.sud-ouest.cotes-du-marmandais', 'Abouriou', 'ACCESSORY', 'The local signature in the blend'),
  ('france.loire.cour-cheverny', 'Romorantin', 'PRINCIPAL', 'Its only AOC'),
  ('france.loire.gros-plant-du-pays-nantais', 'Folle Blanche', 'PRINCIPAL', 'Sur lie, bracing'),
  ('france.loire.coteaux-du-loir', 'Pineau d''Aunis', 'PRINCIPAL', 'White-pepper reds and roses'),
  ('france.loire.pouilly-sur-loire', 'Chasselas', 'PRINCIPAL', 'The other Pouilly'),
  ('france.savoie.ayze', 'Gringet', 'PRINCIPAL', 'About 20 ha in the world - still and mousseux'),
  ('france.savoie.crepy', 'Chasselas', 'PRINCIPAL', 'Lake Geneva shore'),
  ('france.savoie.marin', 'Chasselas', 'PRINCIPAL', 'Lake Geneva shore'),
  ('france.savoie.marignan', 'Chasselas', 'PRINCIPAL', 'Lake Geneva shore'),
  ('france.savoie.ripaille', 'Chasselas', 'PRINCIPAL', 'Lake Geneva shore'),
  ('france.savoie.seyssel', 'Molette', 'ACCESSORY', 'The mousseux base, with Altesse'),
  ('france.alsace', 'Sylvaner', 'ACCESSORY', 'The old regional workhorse'),
  ('france.alsace.zotzenberg', 'Sylvaner', 'ACCESSORY', 'The one Grand Cru that admits Sylvaner'),
  ('france.languedoc-roussillon.clairette-du-languedoc', 'Clairette', 'PRINCIPAL', 'The AOC grape'),
  ('france.languedoc-roussillon.clairette-du-languedoc-adissan', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-aspiran', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-cabrieres', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-ceyras', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-fontes', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-le-bosc', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-lieuran-cabrieres', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-nizas', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-paulhan', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-peret', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-du-languedoc-saint-andre-de-sangonis', 'Clairette', 'PRINCIPAL', null),
  ('france.languedoc-roussillon.clairette-de-bellegarde', 'Clairette', 'PRINCIPAL', 'The AOC grape'),
  ('france.provence.palette', 'Clairette', 'ACCESSORY', 'Leads the Palette whites')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Style notes that pointed at the gap now point at the grape.
update wine_place_styles ws
   set note = v.note
  from (values
    ('france.languedoc-roussillon.clairette-du-languedoc', 'WHITE', 'Clairette'),
    ('france.loire.coteaux-du-loir', 'RED', 'Pineau d''Aunis - white pepper'),
    ('france.loire.cour-cheverny', 'WHITE', 'Romorantin - its only AOC'),
    ('france.loire.gros-plant-du-pays-nantais', 'WHITE', 'Folle Blanche sur lie'),
    ('france.loire.pouilly-sur-loire', 'WHITE', 'Chasselas'),
    ('france.sud-ouest.fronton', 'RED', 'Negrette')
  ) as v(ck, style, note),
  wine_places p
 where p.canonical_key = v.ck
   and ws.wine_place_id = p.id
   and ws.style = v.style::wine_style_kind;

do $$
declare v_grapes int; v_new int; v_sang int; v_niell int; v_notes int;
begin
  select count(*) into v_grapes from grapes;
  if v_grapes <> 92 then raise exception 'expected 92 grapes (81 + 11), got %', v_grapes; end if;
  select count(*) into v_new from wine_place_grapes wg
    join grapes g on g.id = wg.grape_id
   where g.name in ('Négrette','Clairette','Duras','Len de l''El','Abouriou','Romorantin',
                    'Folle Blanche','Pineau d''Aunis','Chasselas','Gringet','Molette','Sylvaner');
  if v_new <> 30 then raise exception 'expected 30 new-variety place links, got %', v_new; end if;
  select count(*) into v_sang from wine_place_grapes wg
    join grapes g on g.id = wg.grape_id and g.name = 'Sangiovese'
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.corse%';
  if v_sang <> 0 then raise exception 'expected 0 remaining Corse Sangiovese links, got %', v_sang; end if;
  select count(*) into v_niell from wine_place_grapes wg
    join grapes g on g.id = wg.grape_id and g.name = 'Nielluccio';
  if v_niell <> 7 then raise exception 'expected 7 Nielluccio links, got %', v_niell; end if;
  select count(*) into v_notes from wine_place_styles
   where note ilike '%not yet in the grape library%';
  if v_notes <> 0 then raise exception 'expected 0 leftover gap notes, got %', v_notes; end if;
end $$;
