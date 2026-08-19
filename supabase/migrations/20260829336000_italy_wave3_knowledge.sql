-- Knowledge for wave 3. Full Details on the Trentino subregion; articles +
-- grape/style chips on the four appellations.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.trentino-alto-adige.trentino',
   'Trentino — the southern, Italian-speaking province of Trentino-Alto Adige, running down the Adige valley from the Alto Adige border to Lake Garda: a major source of Metodo Classico sparkling (Trentodoc) and of native reds like Teroldego and Marzemino.',
   'Chardonnay & Pinot Nero (Trentodoc); Teroldego, Marzemino, Lagrein (reds); Nosiola, Müller-Thurgau (whites).',
   'Metodo Classico sparkling (Trentodoc); native reds (Teroldego, Marzemino); alpine whites; and the sweet Vino Santo.',
   'Alpine-continental, moderated by Lake Garda to the south; steep valley sides and cool nights preserve acidity.',
   'Alluvial and morainic gravels on the Adige floor; limestone and porphyry on the slopes.',
   array['Trentodoc — a major Metodo Classico sparkling','Teroldego (Campo Rotaliano) is the flagship red','Adige valley down to Lake Garda','Broad Trentino DOC umbrella footprint still to come']::text[]),
  ('italy.trentino-alto-adige.teroldego-rotaliano',
   'Teroldego Rotaliano — the flagship red of Trentino, from the native Teroldego on the gravelly alluvial Campo Rotaliano north of Trento (Mezzocorona, Mezzolombardo): deep, dark-fruited and structured.',
   'Teroldego',
   null, null, null,
   array['Teroldego (native)','DOC','Campo Rotaliano (gravel plain)','Deep, dark-fruited red']::text[]),
  ('italy.lombardia.riviera-del-garda-classico',
   'Riviera del Garda Classico (Valtènesi) — the western shore of Lake Garda in Brescia: light, fragrant Groppello-based reds and the pale Chiaretto rosé.',
   'Groppello, Marzemino, Sangiovese, Barbera',
   null, null, null,
   array['Groppello-based reds + Chiaretto rosé','DOC','Western shore of Lake Garda (Brescia)','Light, lake-moderated']::text[]),
  ('italy.lombardia.moscato-di-scanzo',
   'Moscato di Scanzo — Italy''s smallest DOCG: a rare sweet, aromatic passito RED from the Moscato di Scanzo grape, grown only around Scanzorosciate near Bergamo.',
   'Moscato di Scanzo',
   null, null, null,
   array['Moscato di Scanzo (aromatic red)','DOCG — Italy''s smallest','Only Scanzorosciate (Bergamo)','Sweet dried-grape passito red']::text[]),
  ('italy.friuli.carso',
   'Carso (Carso-Kras) — the windswept limestone karst above Trieste on the Slovenian border: distinctive wines from the native red Terrano and white Vitovska, plus Malvasia Istriana.',
   'Terrano, Vitovska, Malvasia',
   null, null, null,
   array['Native Terrano (red) & Vitovska (white)','DOC — the Trieste/Gorizia karst','Iron-rich ''terra rossa'' over limestone','On the Slovenian border']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Teroldego','italy.trentino-alto-adige.trentino'),
  ('Teroldego','italy.trentino-alto-adige.teroldego-rotaliano'),
  ('Groppello','italy.lombardia.riviera-del-garda-classico'),
  ('Moscato di Scanzo','italy.lombardia.moscato-di-scanzo'),
  ('Terrano','italy.friuli.carso'),('Vitovska','italy.friuli.carso')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.trentino-alto-adige.teroldego-rotaliano','RED',0),
  ('italy.lombardia.riviera-del-garda-classico','RED',0),('italy.lombardia.riviera-del-garda-classico','ROSE',1),
  ('italy.lombardia.moscato-di-scanzo','SWEET',0),
  ('italy.friuli.carso','RED',0),('italy.friuli.carso','WHITE',1)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
  keys text[] := array['italy.trentino-alto-adige.trentino','italy.trentino-alto-adige.teroldego-rotaliano','italy.lombardia.riviera-del-garda-classico','italy.lombardia.moscato-di-scanzo','italy.friuli.carso'];
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if a <> 5 then raise exception 'expected 5 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if gr <> 6 then raise exception 'expected 6 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key = any(keys) and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 style links, got %', sl; end if;
end $$;

commit;
