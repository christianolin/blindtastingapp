-- Native grapes for the wave-6 regions. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Verdicchio',           'WHITE', 'green-gold', 'The Marche''s great native white, giving structured, saline, age-worthy wines (Castelli di Jesi, Matelica).', 'Marche'),
  ('Passerina',            'WHITE', 'green-gold', 'A crisp, high-acid native white of the southern Marche and Abruzzo, used in Offida and as a sparkling.', 'Marche & Abruzzo'),
  ('Cesanese',             'RED',   'blue-black', 'Lazio''s leading native red (Cesanese di Affile), behind the Cesanese del Piglio DOCG of the Ciociaria hills.', 'Lazio'),
  ('Cannonau',             'RED',   'blue-black', 'Sardinia''s dominant native red (the local Grenache), giving warm, herbal, full-bodied reds across the island.', 'Sardinia'),
  ('Carignano',            'RED',   'blue-black', 'A robust Mediterranean red (Carignan) at its best on the sandy Sulcis coast of south-west Sardinia.', 'Sardinia (Sulcis)'),
  ('Vernaccia di Oristano','WHITE', 'gold',       'A Sardinian native white made in an oxidative, flor-aged style near Oristano — Italy''s answer to fino sherry.', 'Sardinia (Oristano)'),
  ('Rossese',              'RED',   'blue-black', 'A perfumed, delicate native red of the far-western Ligurian Riviera, behind Rossese di Dolceacqua.', 'Liguria (Ponente)'),
  ('Pigato',               'WHITE', 'green-gold', 'An aromatic Ligurian white (a biotype of Vermentino) of the Riviera di Ponente, giving savoury, herbal wines.', 'Liguria (Ponente)'),
  ('Bosco',                'WHITE', 'green-gold', 'The backbone white of the Cinque Terre, behind the steep-terraced dry whites and the sweet Sciacchetrà.', 'Liguria (Cinque Terre)'),
  ('Albarola',             'WHITE', 'green-gold', 'A soft Ligurian native white blended with Bosco and Vermentino in the Cinque Terre and Colli di Luni.', 'Liguria'),
  ('Gaglioppo',            'RED',   'blue-black', 'Calabria''s leading native red, behind Cirò and Savuto — pale but firm, savoury and tannic.', 'Calabria'),
  ('Prié Blanc',           'WHITE', 'green-gold', 'An alpine native white of the upper Valle d''Aosta, grown ungrafted at Europe''s highest vineyards (Blanc de Morgex).', 'Valle d''Aosta'),
  ('Tintilia',             'RED',   'blue-black', 'Molise''s rediscovered native red, giving deeply coloured, spicy, structured wines (Tintilia del Molise).', 'Molise')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Verdicchio','Passerina','Cesanese','Cannonau','Carignano','Vernaccia di Oristano','Rossese','Pigato','Bosco','Albarola','Gaglioppo','Prié Blanc','Tintilia');
  if n <> 13 then raise exception 'expected 13 wave-6 grapes present, got %', n; end if;
end $$;
commit;
