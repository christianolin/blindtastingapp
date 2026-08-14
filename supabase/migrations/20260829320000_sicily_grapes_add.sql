-- Add Sicilian grape varieties missing from the grapes table. Idempotent.
begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Nerello Mascalese',  'RED',   'blue-black', 'The noble red of Mount Etna — pale, perfumed and Pinot-like, transparently expressing volcanic contrade.', 'Sicily (Etna)'),
  ('Nerello Cappuccio',  'RED',   'blue-black', 'A softer, deeper-coloured Etna red, blended with Nerello Mascalese for flesh and colour.', 'Sicily (Etna)'),
  ('Carricante',         'WHITE', 'green-gold', 'The racy, high-acid white of Mount Etna — mineral, citrussy and genuinely age-worthy.', 'Sicily (Etna)'),
  ('Frappato',           'RED',   'ruby',       'A light, fragrant, cherry-scented Sicilian red, the aromatic partner to Nero d''Avola in Cerasuolo di Vittoria.', 'Sicily (Vittoria)'),
  ('Grillo',             'WHITE', 'golden',     'A crisp, citrussy Sicilian white — historically the backbone of Marsala, now prized for dry whites.', 'Sicily (western)'),
  ('Catarratto',         'WHITE', 'golden',     'Sicily''s most-planted white grape, used for dry whites and for Marsala.', 'Sicily'),
  ('Inzolia',            'WHITE', 'golden',     'Also called Ansonica — a soft, nutty Sicilian white for dry wines and Marsala.', 'Sicily, Tuscany'),
  ('Zibibbo',            'WHITE', 'golden',     'Muscat of Alexandria — the intensely aromatic grape of Pantelleria''s sweet passito.', 'Sicily (Pantelleria)'),
  ('Grecanico',          'WHITE', 'green-gold', 'A fresh, herbal Sicilian white (a Garganega relative), often blended.', 'Sicily'),
  ('Perricone',          'RED',   'blue-black', 'A robust, tannic native Sicilian red, used in red Marsala and traditional blends.', 'Sicily')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Nerello Mascalese','Nerello Cappuccio','Carricante','Frappato','Grillo','Catarratto','Inzolia','Zibibbo','Grecanico','Perricone');
  if n <> 10 then raise exception 'expected 10 Sicilian grapes present, got %', n; end if;
end $$;

commit;
