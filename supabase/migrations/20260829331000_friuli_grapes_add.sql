-- Add Friulian native grapes missing from the grapes table. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Ribolla Gialla', 'WHITE', 'golden',     'A crisp, mineral native white of the Collio and Colli Orientali, also central to Friulian skin-contact ''orange'' wines.', 'Friuli (Collio)'),
  ('Picolit',        'WHITE', 'golden',     'A rare, prized native producing a delicate sweet passito in the Colli Orientali.', 'Friuli (Colli Orientali)'),
  ('Verduzzo',       'WHITE', 'golden',     'Verduzzo Friulano — a tannic white made dry and, at Ramandolo, as a honeyed sweet passito.', 'Friuli (Ramandolo)'),
  ('Refosco',        'RED',   'blue-black', 'Refosco dal Peduncolo Rosso — Friuli''s leading native red: dark, tangy and plummy.', 'Friuli'),
  ('Schioppettino',  'RED',   'blue-black', 'A peppery, aromatic native red of the Colli Orientali (Prepotto), once nearly extinct.', 'Friuli (Colli Orientali)'),
  ('Pignolo',        'RED',   'blue-black', 'A rare, tannic, structured native red of the Colli Orientali.', 'Friuli (Colli Orientali)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Ribolla Gialla','Picolit','Verduzzo','Refosco','Schioppettino','Pignolo');
  if n <> 6 then raise exception 'expected 6 Friulian grapes present, got %', n; end if;
end $$;
commit;
