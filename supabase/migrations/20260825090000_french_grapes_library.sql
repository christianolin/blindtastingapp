-- Grape library — add missing important French varieties.
--
-- Fills the gaps for the French regions (built + upcoming): Jura, Savoie,
-- Sud-Ouest, Loire (Muscadet), Alsace, Southern Rhone / Languedoc whites,
-- Roussillon, Provence and Corsica. Insert-only, guarded by name (idempotent);
-- test-neutral (grapes is not in the wine-map foundation suite).
insert into grapes
  (name, color, description, typical_aromas, typical_acidity, typical_tannin, typical_body, typical_alcohol, main_regions, skin_color)
select v.name, v.color, v.description, v.aromas, v.acidity, v.tannin, v.body, v.alcohol, v.regions, v.skin
from (values
  ('Melon de Bourgogne','WHITE','The grape of Muscadet at the mouth of the Loire - light, dry, saline whites, often aged on the lees (sur lie) for texture.','Green apple, citrus, saline, subtle bready lees','High','None (white)','Light','Low to medium','Loire (Muscadet, Pays Nantais)','thin, golden-green'),
  ('Pinot Blanc','WHITE','A soft, gently fruity white of Alsace and Cremant blends - approachable and low in aromatics.','White peach, apple, almond, faint floral','Medium','None (white)','Light to medium','Medium','Alsace, Cremant','thin, pale green'),
  ('Savagnin','WHITE','The Jura white behind Vin Jaune, aged oxidatively under a veil of yeast (voile) for nutty, curry-spice intensity.','Walnut, curry (fenugreek), green apple, bruised fruit','High','None (white)','Medium','Medium to high','Jura (Vin Jaune, Chateau-Chalon)','thin, green-gold'),
  ('Poulsard','RED','A pale, delicate Jura red (also spelled Ploussard) giving light, translucent, red-fruited wines.','Redcurrant, cranberry, forest floor, rose','Medium to high','Low','Light','Low to medium','Jura (Arbois, Pupillin)','thin, pale red'),
  ('Trousseau','RED','The most structured of the Jura reds - deeper coloured and firmer than Poulsard.','Blackberry, pepper, earth, dried herbs','Medium to high','Medium','Medium','Medium','Jura (Arbois)','medium, dark red'),
  ('Jacquère','WHITE','Savoie''s workhorse white - light, crisp, alpine and low in alcohol.','Green apple, citrus, white flowers, flinty minerality','High','None (white)','Light','Low','Savoie (Apremont, Abymes)','thin, green'),
  ('Altesse','WHITE','The noble Savoie white, sold as Roussette de Savoie - richer and more aromatic than Jacquère.','Pear, hazelnut, honey, bergamot','Medium to high','None (white)','Medium','Medium','Savoie (Roussette de Savoie)','thin, amber-gold'),
  ('Mondeuse','RED','Savoie''s deeply coloured, peppery alpine red with brisk acidity.','Blackberry, black pepper, violet, iron','High','Medium to high','Medium','Medium','Savoie','medium, blue-black'),
  ('Tannat','RED','The powerful, tannic black grape of Madiran, often softened by micro-oxygenation; deep colour and structure.','Blackberry, plum, liquorice, smoke','Medium to high','Very high','Full','Medium to high','Sud-Ouest (Madiran, Irouleguy)','thick, blue-black'),
  ('Négrette','RED','The fragrant, supple black grape of Fronton near Toulouse.','Violet, red berry, liquorice, spice','Medium','Low to medium','Medium','Medium','Sud-Ouest (Fronton)','medium, dark'),
  ('Fer Servadou','RED','A firm, herbal Sud-Ouest red (a.k.a. Braucol / Pinenc) in Marcillac, Gaillac and Madiran.','Blackcurrant, green pepper, blackberry leaf','Medium to high','Medium to high','Medium','Medium','Sud-Ouest (Marcillac, Gaillac, Madiran)','thick, dark'),
  ('Petit Manseng','WHITE','The thick-skinned white of Jurancon - small berries that shrivel on the vine for intense sweet (and dry) whites.','Passion fruit, apricot, citrus peel, honey','High','None (white)','Medium to full','Medium to high','Sud-Ouest (Jurancon, Pacherenc)','thick, golden'),
  ('Gros Manseng','WHITE','The larger-berried Manseng - mostly dry, zesty Jurancon and Cotes de Gascogne whites.','Grapefruit, passion fruit, green apple, spice','High','None (white)','Medium','Medium','Sud-Ouest (Jurancon, Gascogne)','thick, golden-green'),
  ('Mauzac','WHITE','The apple-scented white of Gaillac and Limoux - the traditional base of methode ancestrale sparkling (Blanquette).','Baked apple, pear skin, quince, herbs','Medium to high','None (white)','Medium','Medium','Sud-Ouest / Languedoc (Gaillac, Limoux)','medium, golden'),
  ('Grenache Blanc','WHITE','The white mutation of Grenache - full-bodied, low-acid whites across the Southern Rhone and Languedoc.','White peach, fennel, almond, dried herbs','Low to medium','None (white)','Full','Medium to high','Southern Rhone, Languedoc-Roussillon','thin, green-gold'),
  ('Clairette','WHITE','An old Southern French white giving soft, floral, low-acid wines, still and sparkling (Clairette de Die / du Languedoc).','Apple, fennel, white flowers, honey','Low to medium','None (white)','Medium to full','Medium to high','Southern Rhone, Languedoc (Die, Bellegarde)','medium, golden'),
  ('Bourboulenc','WHITE','A late-ripening Southern French white bringing citrus lift and freshness to Rhone and Languedoc blends (a star of La Clape).','Lemon, white flowers, saline, smoke','Medium to high','None (white)','Medium','Medium','Southern Rhone, Languedoc (La Clape)','thick, golden'),
  ('Grolleau','RED','A light, juicy Loire red, mostly behind Rose d''Anjou and Cremant de Loire.','Red cherry, raspberry, floral','Medium to high','Low','Light','Low to medium','Loire (Anjou, Touraine)','medium, dark'),
  ('Macabeu','WHITE','A fresh, floral white of Roussillon (Spain''s Viura / Macabeo) for dry whites and some Rivesaltes.','Green apple, white flowers, citrus, fennel','Medium','None (white)','Medium','Medium','Roussillon (also Rioja / Cava as Viura)','thin, amber'),
  ('Tibouren','RED','A perfumed, earthy Provencal grape prized for characterful, structured roses.','Garrigue herbs, red fruit, earth','Medium','Low to medium','Light to medium','Medium','Provence (Cotes de Provence)','medium, dark'),
  ('Sciaccarello','RED','A spicy, pale Corsican red giving perfumed, peppery reds and roses, especially around Ajaccio.','Red berry, pepper, herbs, almond','Medium','Low to medium','Light to medium','Medium','Corsica (Ajaccio, Sartene)','thin, pale red')
) as v(name, color, description, aromas, acidity, tannin, body, alcohol, regions, skin)
where not exists (select 1 from grapes g where g.name = v.name);

do $$
declare v_n int;
begin
  select count(*) into v_n from grapes where name in (
    'Melon de Bourgogne','Pinot Blanc','Savagnin','Poulsard','Trousseau','Jacquère','Altesse',
    'Mondeuse','Tannat','Négrette','Fer Servadou','Petit Manseng','Gros Manseng','Mauzac',
    'Grenache Blanc','Clairette','Bourboulenc','Grolleau','Macabeu','Tibouren','Sciaccarello');
  if v_n <> 21 then raise exception 'expected 21 french grapes present, got %', v_n; end if;
end;
$$;
