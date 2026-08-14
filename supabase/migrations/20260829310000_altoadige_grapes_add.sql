-- Add the Alto Adige grape varieties missing from the grapes table so the
-- region/subregion/appellation Details show grape entity chips. Idempotent.

begin;

insert into grapes (name, color, skin_color, description, main_regions)
select v.name, v.color, v.skin, v.descr, v.regions
from (values
  ('Pinot Grigio',   'WHITE', 'greyish-pink', 'Italy''s ubiquitous crisp, light white; in Alto Adige it gains alpine freshness and real substance.', 'Alto Adige, Friuli, Veneto'),
  ('Pinot Bianco',   'WHITE', 'green-gold',   'Pinot Blanc — a restrained, mineral white that reaches its Italian peak in Alto Adige (Terlano).', 'Alto Adige (Terlano)'),
  ('Kerner',         'WHITE', 'green-gold',   'An aromatic, high-acid crossing (Riesling × Schiava) that thrives in the cool Valle Isarco.', 'Alto Adige (Valle Isarco)'),
  ('Müller-Thurgau', 'WHITE', 'green-gold',   'A fragrant, early-ripening crossing grown at high altitude across Alto Adige and Trentino.', 'Alto Adige, Trentino'),
  ('Moscato Giallo', 'WHITE', 'golden',       'Goldmuskateller — an aromatic yellow Muscat made both dry and sweet in Alto Adige.', 'Alto Adige'),
  ('Schiava',        'RED',   'thin, pale red','Vernatsch — the pale, gentle, low-tannin native red behind Santa Maddalena, Lago di Caldaro and Meranese.', 'Alto Adige'),
  ('Lagrein',        'RED',   'blue-black',   'A dark, brooding native Alto Adige red of deep colour and firm tannin, at home around Bolzano.', 'Alto Adige (Bolzano)'),
  ('Pinot Nero',     'RED',   'blue-black',   'Pinot Noir — its Italian benchmark is the high slopes of Alto Adige (Mazon) and Trentino.', 'Alto Adige, Trentino')
) as v(name, color, skin, descr, regions)
where not exists (select 1 from grapes g where g.name = v.name);

do $$
declare n int;
begin
  select count(*) into n from grapes where name in (
    'Pinot Grigio','Pinot Bianco','Kerner','Müller-Thurgau','Moscato Giallo','Schiava','Lagrein','Pinot Nero'
  );
  if n <> 8 then raise exception 'expected 8 Alto Adige grapes present, got %', n; end if;
end $$;

commit;
