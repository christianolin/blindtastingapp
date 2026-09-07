-- Native grapes for the wave-5 regions. Idempotent.
begin;
insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Sagrantino',            'RED',   'blue-black', 'An intensely tannic native red of Montefalco in Umbria — one of the most polyphenol-rich grapes in the world — made dry and as a sweet passito.', 'Umbria (Montefalco)'),
  ('Grechetto',             'WHITE', 'green-gold', 'Umbria''s characterful native white, the backbone of Orvieto and Torgiano whites; firm, nutty and age-worthy.', 'Umbria'),
  ('Albana',                'WHITE', 'gold',       'A Romagnol native white behind Italy''s first white DOCG (Romagna Albana), made dry, amabile, sweet and passito.', 'Emilia-Romagna (Romagna)'),
  ('Nero di Troia',         'RED',   'blue-black', 'A late-ripening, tannic native red of northern Puglia (Castel del Monte), also called Uva di Troia.', 'Puglia (Castel del Monte)'),
  ('Bombino Nero',          'RED',   'blue-black', 'A light, high-acid native red of the Murgia, the grape of Castel del Monte Bombino Nero rosato DOCG.', 'Puglia (Murgia)'),
  ('Negroamaro',            'RED',   'blue-black', 'The dark, warming native red of the Salento peninsula, behind Salice Salentino and Copertino.', 'Puglia (Salento)'),
  ('Montepulciano',         'RED',   'blue-black', 'A deeply-coloured, widely-planted native red of Abruzzo and central-eastern Italy (Montepulciano d''Abruzzo) — unrelated to the Tuscan town.', 'Abruzzo & central Italy'),
  ('Lambrusco di Sorbara',  'RED',   'blue-black', 'A pale, high-acid, aromatic Lambrusco variety of the Modena plain behind the delicate Lambrusco di Sorbara.', 'Emilia-Romagna (Modena)'),
  ('Lambrusco Grasparossa', 'RED',   'blue-black', 'A deeply-coloured, tannic Lambrusco of the Modena foothills (Castelvetro), giving fuller, frothy reds.', 'Emilia-Romagna (Modena)'),
  ('Coda di Volpe',         'WHITE', 'green-gold', 'A soft Campanian native white (''fox''s tail''), a traditional blender in Greco di Tufo and behind Vesuvio whites.', 'Campania')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);
do $$
declare n int;
begin
  select count(*) into n from grapes where name in ('Sagrantino','Grechetto','Albana','Nero di Troia','Bombino Nero','Negroamaro','Montepulciano','Lambrusco di Sorbara','Lambrusco Grasparossa','Coda di Volpe');
  if n <> 10 then raise exception 'expected 10 wave-5 grapes present, got %', n; end if;
end $$;
commit;
