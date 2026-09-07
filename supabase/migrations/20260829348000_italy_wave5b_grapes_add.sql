-- Native grapes for the wave-5b appellations. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Pignoletto',        'WHITE', 'green-gold', 'The white of the Bologna hills (a biotype of Grechetto gentile), behind crisp, often frizzante Colli Bolognesi Pignoletto.', 'Emilia-Romagna (Bologna)'),
  ('Falanghina',        'WHITE', 'green-gold', 'A fresh, floral Campanian native white grown across Sannio and the coast (Falanghina del Sannio, Campi Flegrei).', 'Campania'),
  ('Piedirosso',        'RED',   'blue-black', 'A soft, fruity Campanian native red (locally Palombina / Per''e Palummo), the partner to Aglianico around Vesuvius and the coast.', 'Campania'),
  ('Verdeca',           'WHITE', 'green-gold', 'The crisp, neutral white of Puglia''s Valle d''Itria, the backbone of Locorotondo and Martina Franca.', 'Puglia (Valle d''Itria)'),
  ('Bianco d''Alessano','WHITE', 'green-gold', 'A Pugliese native white blended with Verdeca in the Valle d''Itria whites (Locorotondo).', 'Puglia (Valle d''Itria)'),
  ('Pecorino',          'WHITE', 'green-gold', 'A characterful, high-acid native white of the central Adriatic (Abruzzo, Marche), giving structured, savoury wines.', 'Abruzzo & Marche')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Pignoletto','Falanghina','Piedirosso','Verdeca','Bianco d''Alessano','Pecorino');
  if n <> 6 then raise exception 'expected 6 wave-5b grapes present, got %', n; end if;
end $$;
commit;
