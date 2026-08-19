-- Add native grapes for the wave-3 zones. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Teroldego',         'RED',   'blue-black', 'A deep, dark-fruited native red of Trentino''s gravelly Campo Rotaliano (Teroldego Rotaliano).', 'Trentino (Rotaliano)'),
  ('Marzemino',         'RED',   'blue-black', 'A fragrant, gently fruity native red of Trentino, famously name-checked in Mozart''s Don Giovanni.', 'Trentino'),
  ('Nosiola',           'WHITE', 'green-gold', 'Trentino''s native white, made dry and as the sweet Vino Santo of the Valle dei Laghi.', 'Trentino'),
  ('Groppello',         'RED',   'blue-black', 'A light, fragrant native red of the western shore of Lake Garda, behind Valtènesi reds and Chiaretto rosé.', 'Lombardy (Garda)'),
  ('Moscato di Scanzo', 'RED',   'blue-black', 'A rare aromatic red grape behind Italy''s smallest DOCG — a sweet passito red at Scanzorosciate.', 'Lombardy (Scanzo)'),
  ('Terrano',           'RED',   'blue-black', 'A tangy, iron-rich native red of the Carso karst above Trieste (a Refosco relative).', 'Friuli (Carso)'),
  ('Vitovska',          'WHITE', 'green-gold', 'A saline, mineral native white of the Carso karst, often made as a skin-contact wine.', 'Friuli (Carso)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Teroldego','Marzemino','Nosiola','Groppello','Moscato di Scanzo','Terrano','Vitovska');
  if n <> 7 then raise exception 'expected 7 wave-3 grapes present, got %', n; end if;
end $$;
commit;
