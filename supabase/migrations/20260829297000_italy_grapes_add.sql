-- Add the Piedmontese and Tuscan grape varieties still missing from the grapes
-- table, so region/appellation Details can show proper grape entities (chips
-- linking to the grape library) instead of plain text. Idempotent.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  -- Piedmont
  ('Grignolino', 'RED',   'pale ruby',   'A pale, high-tannin, aromatic Piedmontese red with a savoury, bitter-cherry twist.', 'Piedmont (Asti, Monferrato)'),
  ('Freisa',     'RED',   'blue-black',  'A tannic, lightly bitter Piedmontese red related to Nebbiolo, made dry or gently frizzante.', 'Piedmont (Asti, Chieri)'),
  ('Brachetto',  'RED',   'ruby',        'An aromatic red grape behind sweet, low-alcohol sparkling reds such as Brachetto d''Acqui.', 'Piedmont (Acqui)'),
  ('Vespolina',  'RED',   'blue-black',  'A peppery, perfumed Alto Piemonte red, often blended with Nebbiolo (Spanna).', 'Piedmont (Alto Piemonte)'),
  ('Ruché',      'RED',   'ruby',        'A rare aromatic Monferrato red — floral, rose-scented and lightly tannic.', 'Piedmont (Monferrato)'),
  ('Timorasso',  'WHITE', 'golden',      'A revived, structured and age-worthy white of the Tortona hills, often labelled ''Derthona''.', 'Piedmont (Colli Tortonesi)'),
  ('Erbaluce',   'WHITE', 'amber-gold',  'A versatile, high-acid Canavese white made still, traditional-method sparkling and as Caluso passito.', 'Piedmont (Canavese, Caluso)'),
  ('Pelaverga',  'RED',   'pale ruby',   'A light, peppery, perfumed red centred on the village of Verduno in the Langhe.', 'Piedmont (Verduno)'),
  ('Uva Rara',   'RED',   'blue-black',  'A soft, fruity Alto Piemonte red used to round out Spanna blends (also called Bonarda Novarese).', 'Piedmont (Alto Piemonte)'),
  ('Croatina',   'RED',   'blue-black',  'A deeply coloured, tannic red of northern Piedmont and the Oltrepò (often called Bonarda).', 'Piedmont (Alto Piemonte), Lombardy'),
  -- Tuscany
  ('Vernaccia',  'WHITE', 'golden',      'The white grape of San Gimignano — crisp and savoury with a bitter-almond finish; unrelated to other ''Vernaccia'' varieties.', 'Tuscany (San Gimignano)'),
  ('Canaiolo',   'RED',   'blue-black',  'A soft, gently fruity Tuscan red, the traditional supporting partner to Sangiovese in Chianti.', 'Tuscany (Chianti)'),
  ('Colorino',   'RED',   'blue-black',  'A deeply pigmented Tuscan red historically used to deepen the colour of Chianti blends.', 'Tuscany (Chianti)'),
  ('Ciliegiolo', 'RED',   'ruby',        'A soft, cherry-scented Tuscan red of the Maremma, closely related to Sangiovese.', 'Tuscany (Maremma)'),
  ('Malvasia',   'WHITE', 'golden',      'An aromatic white grape family used across central Italy for dry, sweet and Vin Santo wines.', 'Tuscany, central Italy')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

do $$
declare n int;
begin
  select count(*) into n from grapes where name in (
    'Grignolino','Freisa','Brachetto','Vespolina','Ruché','Timorasso','Erbaluce','Pelaverga','Uva Rara','Croatina',
    'Vernaccia','Canaiolo','Colorino','Ciliegiolo','Malvasia'
  );
  if n <> 15 then raise exception 'expected 15 target grapes present, got %', n; end if;
end $$;

commit;
