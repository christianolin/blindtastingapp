-- Knowledge for Veneto round 1. Full Details (Intro/Climate/Soils/Grapes/Wine
-- styles/Key facts) on the REGION and the 4 subregions (Valpolicella, Soave,
-- Bardolino, Conegliano Valdobbiadene); articles + grape/style chips elsewhere.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.veneto',
   'Veneto, in Italy''s north-east, is one of the country''s largest and most varied wine regions — from the Amarone and Valpolicella hills above Verona and the whites of Soave, west to Lake Garda (Bardolino, Custoza, Lugana) and east to the Prosecco hills of Conegliano-Valdobbiadene.',
   'Corvina, Corvinone, Rondinella, Molinara; Garganega; Glera; plus Merlot, Cabernet, Raboso.',
   'Powerful dried-grape Amarone and sweet Recioto; fresh Valpolicella and Bardolino reds; mineral Soave whites; and Prosecco sparkling.',
   'Varied — moderated by Lake Garda in the west, cool Prealpine hills in the north (Prosecco), and a warmer, humid plain toward the Adriatic.',
   'Volcanic basalt and limestone in the Soave and Euganei/Berici hills, glacial moraine around Garda, alluvial gravels and clays on the plain.',
   array['Home of Amarone, Soave and Prosecco','Verona hosts Vinitaly, Italy''s biggest wine fair','Appassimento (dried-grape) tradition','One of Italy''s largest wine regions']::text[]),
  ('italy.veneto.valpolicella',
   'Valpolicella — the hills north of Verona, home to Corvina-based reds ranging from fresh Valpolicella to the powerful dried-grape Amarone, the sweet Recioto, and the re-fermented Ripasso in between.',
   'Corvina, Corvinone, Rondinella, Molinara',
   'Fresh Valpolicella, structured Ripasso, powerful (dry) Amarone and sweet Recioto.',
   'Temperate, with warm days and cool nights in the hills; good airflow is vital for drying grapes (appassimento) through winter.',
   'Limestone and volcanic basalt on the hillsides (Classico), alluvial soils on the valley floors.',
   array['Corvina-based reds','Amarone = dried-grape, powerful, dry','Ripasso = re-fermented on Amarone skins','Recioto = the sweet original style']::text[]),
  ('italy.veneto.soave',
   'Soave — the volcanic and limestone hills east of Verona, source of Italy''s benchmark Garganega whites: floral, almond-scented and, in the best sites, capable of real depth and age.',
   'Garganega, Trebbiano di Soave',
   'Dry Soave, richer Soave Superiore, and the sweet dried-grape Recioto di Soave.',
   'Temperate continental tempered by hillside altitude; the Classico hills are cooler and better-drained than the plain.',
   'Volcanic basalt (Classico) and limestone/clay — the basalt gives the finest, most mineral wines.',
   array['Garganega-based whites','Volcanic (basalt) & limestone soils','Classico core in the hills','Recioto di Soave = sweet passito']::text[]),
  ('italy.veneto.bardolino',
   'Bardolino — the morainic hills along the eastern shore of Lake Garda, making light, fresh, cherry-scented Corvina-based reds and the pale Chiaretto rosé.',
   'Corvina, Rondinella, Molinara',
   'Light, fresh Bardolino red; pale Chiaretto rosé; and the more structured Bardolino Superiore.',
   'Mild and sunny, strongly moderated by the mass of Lake Garda — a near-Mediterranean pocket in northern Italy.',
   'Glacial moraine — gravel, sand and pebbles left by the ancient Garda glacier.',
   array['Corvina-based light reds + Chiaretto rosé','Eastern shore of Lake Garda','Glacial morainic soils','Fresh, early-drinking style']::text[]),
  ('italy.veneto.conegliano-valdobbiadene-prosecco',
   'Conegliano Valdobbiadene — the steep Prealpine hills that are the historic quality heart of Prosecco (DOCG), producing Glera sparkling of finesse, crowned by the Cartizze cru. A UNESCO World Heritage landscape.',
   'Glera',
   'Traditional and Charmat-method sparkling (spumante), frizzante, and the prized Cartizze.',
   'Cool, breezy Prealpine hills with marked diurnal shifts — ideal for fresh, aromatic sparkling base wines.',
   'Steep hillsides of marl, sandstone and glacial-morainic conglomerate.',
   array['Glera sparkling (Prosecco Superiore DOCG)','UNESCO World Heritage hills (2019)','Cartizze = the grand cru','Around Conegliano & Valdobbiadene']::text[]),
  ('italy.veneto.prosecco','Prosecco — the vast DOC across nine provinces of the Veneto and Friuli that made Glera-based sparkling a global phenomenon: easy, fruity, floral fizz.','Glera',null,null,null,array['Glera sparkling','DOC since 2009 (9 provinces)','Veneto + Friuli plain','The world''s best-selling sparkling']::text[]),
  ('italy.veneto.lugana','Lugana — supple, saline whites from Turbiana on the clay soils of the southern shore of Lake Garda (shared with Lombardy).','Turbiana',null,null,null,array['Turbiana (a Verdicchio relative)','DOC','Southern shore of Lake Garda','Supple, saline whites']::text[]),
  ('italy.veneto.bianco-di-custoza','Bianco di Custoza (Custoza) — a fragrant white blend from the morainic hills south of Lake Garda, next to Bardolino.','Garganega, Trebbiano',null,null,null,array['Fragrant white blend','DOC','Morainic hills south of Garda','Neighbour of Bardolino']::text[]),
  ('italy.veneto.colli-euganei','Colli Euganei — the volcanic conical hills south-west of Padua: Merlot and Bordeaux-variety reds, whites, and the sweet Fior d''Arancio Moscato.','Merlot, Cabernet, Garganega',null,null,null,array['Volcanic conical hills (Padua)','Merlot/Cabernet reds + whites','Sweet Fior d''Arancio Moscato','DOC']::text[]),
  ('italy.veneto.colli-berici','Colli Berici — the limestone hills south of Vicenza, known for Tai Rosso (Grenache) and Merlot/Cabernet reds plus whites.','Tai Rosso, Merlot, Cabernet',null,null,null,array['Tai Rosso (Grenache) + Bordeaux reds','Limestone hills south of Vicenza','Reds and whites','DOC']::text[]),
  ('italy.veneto.breganze','Breganze — the Prealpine hills north of Vicenza, home to Bordeaux-variety reds and the sweet Vespaiola passito Torcolato.','Vespaiola, Merlot, Cabernet',null,null,null,array['Bordeaux-variety reds','Sweet Vespaiola passito (Torcolato)','Prealpine hills north of Vicenza','DOC']::text[]),
  ('italy.veneto.gambellara','Gambellara — Garganega whites (dry and sweet Recioto) on volcanic basalt just east of Soave.','Garganega',null,null,null,array['Garganega whites','Volcanic basalt soils','Just east of Soave','Also sweet Recioto di Gambellara']::text[]),
  ('italy.veneto.piave','Piave — the broad DOC of the Piave river plain (Treviso), best known for the tannic native Raboso plus Merlot and whites.','Raboso, Merlot',null,null,null,array['Native Raboso + Merlot','Piave river plain (Treviso)','Reds and whites','DOC']::text[]),
  ('italy.veneto.garda','Garda — a broad DOC around Lake Garda shared with Lombardy, for varietal reds and whites in a mild lakeside climate.','Garganega, Corvina, international',null,null,null,array['Broad Lake Garda DOC','Shared with Lombardy','Varietal reds and whites','Mild lakeside climate']::text[]),
  ('italy.veneto.lison-pramaggiore','Lison-Pramaggiore — the eastern Veneto plain toward Friuli, known for Friulano (Lison) whites and Merlot/Cabernet reds.','Friulano, Merlot, Cabernet',null,null,null,array['Friulano (Lison) whites','Merlot/Cabernet reds','Eastern Veneto plain','DOC']::text[]),
  ('italy.veneto.amarone-della-valpolicella','Amarone della Valpolicella — one of Italy''s greatest reds: Corvina-based grapes dried for months (appassimento) then fermented dry, giving a powerful, high-alcohol, velvety wine.','Corvina, Corvinone, Rondinella',null,null,null,array['Dried-grape (appassimento), fermented dry','DOCG since 2010','Powerful, velvety, ageworthy','The Valpolicella zone']::text[]),
  ('italy.veneto.recioto-della-valpolicella','Recioto della Valpolicella — the ancient sweet ancestor of Amarone: dried Corvina grapes fermented to leave rich residual sweetness.','Corvina, Rondinella',null,null,null,array['Sweet dried-grape red','DOCG','The original Valpolicella style','Ancestor of Amarone']::text[]),
  ('italy.veneto.valpolicella-ripasso','Valpolicella Ripasso — Valpolicella re-fermented (''ripassed'') on the leftover Amarone skins for extra body and depth: the ''baby Amarone''.','Corvina, Corvinone, Rondinella',null,null,null,array['Re-fermented on Amarone skins','DOC','Fuller than base Valpolicella','The ''baby Amarone''']::text[]),
  ('italy.veneto.soave-superiore','Soave Superiore — the DOCG tier of Soave: riper, more concentrated Garganega whites from the hills.','Garganega',null,null,null,array['Garganega','DOCG','Riper, more concentrated','Hillside Soave']::text[]),
  ('italy.veneto.recioto-di-soave','Recioto di Soave — the sweet dried-grape white of Soave, Veneto''s first DOCG (1998): honeyed and long-lived.','Garganega',null,null,null,array['Sweet dried-grape (passito) white','Veneto''s first DOCG (1998)','Garganega','Honeyed, long-lived']::text[]),
  ('italy.veneto.bardolino-superiore','Bardolino Superiore — the DOCG tier of Bardolino: a little more structure and ageing than the light base red.','Corvina, Rondinella',null,null,null,array['Corvina-based','DOCG since 2001','More structure than base Bardolino','Eastern Lake Garda']::text[]),
  ('italy.veneto.cartizze','Superiore di Cartizze — the tiny, prized ''grand cru'' hill of Conegliano Valdobbiadene, making the most sought-after Prosecco Superiore.','Glera',null,null,null,array['Glera sparkling','The ''grand cru'' of Prosecco','Tiny steep hill at Valdobbiadene','Most prized Prosecco Superiore']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

-- Grape entity links (chips).
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Corvina','italy.veneto'),('Garganega','italy.veneto'),('Glera','italy.veneto'),('Rondinella','italy.veneto'),('Merlot','italy.veneto'),
  ('Corvina','italy.veneto.valpolicella'),('Corvinone','italy.veneto.valpolicella'),('Rondinella','italy.veneto.valpolicella'),('Molinara','italy.veneto.valpolicella'),
  ('Garganega','italy.veneto.soave'),('Trebbiano di Soave','italy.veneto.soave'),
  ('Corvina','italy.veneto.bardolino'),('Rondinella','italy.veneto.bardolino'),('Molinara','italy.veneto.bardolino'),
  ('Glera','italy.veneto.conegliano-valdobbiadene-prosecco'),
  ('Glera','italy.veneto.prosecco'),
  ('Turbiana','italy.veneto.lugana'),
  ('Garganega','italy.veneto.bianco-di-custoza'),
  ('Merlot','italy.veneto.colli-euganei'),
  ('Merlot','italy.veneto.colli-berici'),
  ('Vespaiola','italy.veneto.breganze'),
  ('Garganega','italy.veneto.gambellara'),
  ('Raboso','italy.veneto.piave'),
  ('Garganega','italy.veneto.garda'),
  ('Friulano','italy.veneto.lison-pramaggiore'),
  ('Corvina','italy.veneto.amarone-della-valpolicella'),('Corvinone','italy.veneto.amarone-della-valpolicella'),('Rondinella','italy.veneto.amarone-della-valpolicella'),
  ('Corvina','italy.veneto.recioto-della-valpolicella'),
  ('Corvina','italy.veneto.valpolicella-ripasso'),
  ('Garganega','italy.veneto.soave-superiore'),
  ('Garganega','italy.veneto.recioto-di-soave'),
  ('Corvina','italy.veneto.bardolino-superiore'),
  ('Glera','italy.veneto.cartizze')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

-- Style links (appellations + tree-only; region + subregions use wine_styles text).
insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.veneto.prosecco','SPARKLING',0),
  ('italy.veneto.lugana','WHITE',0),
  ('italy.veneto.bianco-di-custoza','WHITE',0),
  ('italy.veneto.colli-euganei','RED',0),('italy.veneto.colli-euganei','WHITE',1),
  ('italy.veneto.colli-berici','RED',0),('italy.veneto.colli-berici','WHITE',1),
  ('italy.veneto.breganze','RED',0),('italy.veneto.breganze','WHITE',1),
  ('italy.veneto.gambellara','WHITE',0),
  ('italy.veneto.piave','RED',0),('italy.veneto.piave','WHITE',1),
  ('italy.veneto.garda','RED',0),('italy.veneto.garda','WHITE',1),
  ('italy.veneto.lison-pramaggiore','WHITE',0),('italy.veneto.lison-pramaggiore','RED',1),
  ('italy.veneto.amarone-della-valpolicella','RED',0),
  ('italy.veneto.recioto-della-valpolicella','RED',0),('italy.veneto.recioto-della-valpolicella','SWEET',1),
  ('italy.veneto.valpolicella-ripasso','RED',0),
  ('italy.veneto.soave-superiore','WHITE',0),
  ('italy.veneto.recioto-di-soave','WHITE',0),('italy.veneto.recioto-di-soave','SWEET',1),
  ('italy.veneto.bardolino-superiore','RED',0),
  ('italy.veneto.cartizze','SPARKLING',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.veneto%' and x.editorial_status='PUBLISHED';
  if a <> 22 then raise exception 'expected 22 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.veneto%' and x.editorial_status='PUBLISHED';
  if gr <> 34 then raise exception 'expected 34 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.veneto%' and x.editorial_status='PUBLISHED';
  if sl <> 26 then raise exception 'expected 26 style links, got %', sl; end if;
end $$;

commit;
