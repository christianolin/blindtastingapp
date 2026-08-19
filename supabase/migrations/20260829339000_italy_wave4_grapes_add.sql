-- Native grapes for the wave-4 zones. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Nocera',         'RED',   'blue-black', 'A tangy, high-acid native red of north-east Sicily, a traditional blending partner to the Nerello grapes in Faro.', 'Sicily (Messina)'),
  ('Durella',        'WHITE', 'green-gold', 'A very high-acid native white of the Lessini mountains north of Verona, made into the crisp Durello sparkling wine.', 'Veneto (Lessini)'),
  ('Manzoni Bianco', 'WHITE', 'green-gold', 'A Riesling x Pinot Bianco crossing bred at Conegliano (Incrocio Manzoni 6.0.13), giving aromatic, structured whites.', 'Veneto (Conegliano)')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Nocera','Durella','Manzoni Bianco');
  if n <> 3 then raise exception 'expected 3 wave-4 grapes present, got %', n; end if;
end $$;
commit;
