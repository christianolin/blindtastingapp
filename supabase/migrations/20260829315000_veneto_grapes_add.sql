-- Add Veneto grape varieties missing from the grapes table. Idempotent.
begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Garganega',          'WHITE', 'golden',     'The white grape of Soave and Gambellara — floral and almond-scented, capable of real depth and age.', 'Veneto (Soave, Gambellara)'),
  ('Trebbiano di Soave', 'WHITE', 'green-gold', 'A high-quality white (a form of Verdicchio) blended into Soave for freshness and structure.', 'Veneto (Soave)'),
  ('Turbiana',           'WHITE', 'green-gold', 'The grape of Lugana on the southern shore of Lake Garda (related to Verdicchio) — supple, saline whites.', 'Lombardy/Veneto (Lugana)'),
  ('Raboso',             'RED',   'blue-black', 'A tannic, high-acid native red of the Piave plain, made dry and as sparkling or passito.', 'Veneto (Piave)'),
  ('Vespaiola',          'WHITE', 'golden',     'A Breganze white best known for the sweet passito Torcolato.', 'Veneto (Breganze)'),
  ('Friulano',           'WHITE', 'green-gold', 'Formerly Tocai — a supple, almond-scented white of the eastern Veneto and Friuli (Lison).', 'Veneto/Friuli (Lison)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Garganega','Trebbiano di Soave','Turbiana','Raboso','Vespaiola','Friulano');
  if n <> 6 then raise exception 'expected 6 Veneto grapes present, got %', n; end if;
end $$;

commit;
