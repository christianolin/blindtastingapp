-- Knowledge for Friuli round 1. Full Details on the REGION; articles + grape/
-- style chips throughout.

begin;

insert into wine_place_articles (wine_place_id, description, grape_varieties, wine_styles, climate, soils, key_facts, editorial_status)
select p.id, v.descr, v.gv, v.styles, v.climate, v.soils, v.kf, 'PUBLISHED'
from (values
  ('italy.friuli',
   'Friuli-Venezia Giulia, in Italy''s north-east on the Slovenian border, is the country''s white-wine benchmark: the Collio and Colli Orientali hills yield world-class Friulano, Ribolla Gialla, Pinot Grigio and Sauvignon, alongside native reds like Refosco and Schioppettino.',
   'Friulano, Ribolla Gialla, Pinot Grigio, Sauvignon, Malvasia, Picolit (whites); Refosco, Schioppettino, Pignolo (native reds).',
   'Precise, aromatic whites; skin-contact ''orange'' wines; native reds; and the sweet Picolit and Ramandolo.',
   'Continental, moderated by the Adriatic to the south and sheltered by the Alps to the north — warm days and cool nights suit aromatic, high-acid whites.',
   'The prized hill soils are ''ponca'' (flysch) — alternating marl and sandstone — in the Collio and Colli Orientali; gravel on the Grave plain.',
   array['Italy''s white-wine benchmark','Collio & Colli Orientali hills (''ponca'' soils)','Native reds Refosco, Schioppettino, Pignolo','A home of modern Italian whites & orange wine']::text[]),
  ('italy.friuli.collio',
   'Collio (Collio Goriziano) — Italy''s most celebrated white-wine hills, on the ponca (flysch) slopes along the Slovenian border in Gorizia: Friulano, Ribolla Gialla, Sauvignon and Pinot Grigio of great finesse.',
   'Friulano, Ribolla Gialla, Sauvignon, Pinot Grigio',
   null, null, null,
   array['Benchmark Friulian whites','Ponca (flysch) hills, Gorizia','On the Slovenian border','Friulano, Ribolla, Sauvignon']::text[]),
  ('italy.friuli.friuli-colli-orientali',
   'Friuli Colli Orientali — the eastern hills of Udine around Cividale: outstanding whites (Friulano, Ribolla Gialla) plus a stronghold of native reds (Refosco, Schioppettino, Pignolo) and the sweet Picolit.',
   'Friulano, Ribolla Gialla, Refosco, Schioppettino, Pignolo, Picolit',
   null, null, null,
   array['Whites + native reds','Hills around Cividale (Udine)','Refosco, Schioppettino, Pignolo','Sweet Picolit']::text[]),
  ('italy.friuli.ramandolo',
   'Ramandolo — a tiny DOCG in the high hills above Nimis: a honeyed sweet passito from Verduzzo Friulano.',
   'Verduzzo Friulano',
   null, null, null,
   array['Verduzzo Friulano (sweet passito)','DOCG','High hills above Nimis','Honeyed dessert wine']::text[]),
  ('italy.friuli.rosazzo',
   'Rosazzo — a DOCG for a structured, Friulano-led white blend around the Abbey of Rosazzo in the Colli Orientali.',
   'Friulano, Ribolla Gialla, Sauvignon',
   null, null, null,
   array['Friulano-led white blend','DOCG','Around the Abbey of Rosazzo','Colli Orientali']::text[])
) as v(ck, descr, gv, styles, climate, soils, kf)
join wine_places p on p.canonical_key = v.ck;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, null, 'PUBLISHED'
from (values
  ('Friulano','italy.friuli'),('Ribolla Gialla','italy.friuli'),('Pinot Grigio','italy.friuli'),('Refosco','italy.friuli'),('Sauvignon Blanc','italy.friuli'),
  ('Friulano','italy.friuli.collio'),('Ribolla Gialla','italy.friuli.collio'),('Sauvignon Blanc','italy.friuli.collio'),('Pinot Grigio','italy.friuli.collio'),
  ('Friulano','italy.friuli.friuli-colli-orientali'),('Ribolla Gialla','italy.friuli.friuli-colli-orientali'),('Refosco','italy.friuli.friuli-colli-orientali'),('Schioppettino','italy.friuli.friuli-colli-orientali'),('Pignolo','italy.friuli.friuli-colli-orientali'),('Picolit','italy.friuli.friuli-colli-orientali'),
  ('Verduzzo','italy.friuli.ramandolo'),
  ('Friulano','italy.friuli.rosazzo')
) as m(grape, ck)
join grapes g on g.name = m.grape
join wine_places p on p.canonical_key = m.ck
where not exists (select 1 from wine_place_grapes wg where wg.wine_place_id = p.id and wg.grape_id = g.id);

insert into wine_place_styles (wine_place_id, style, sort_order, editorial_status)
select p.id, st.style::wine_style_kind, st.so, 'PUBLISHED'
from wine_places p
join (values
  ('italy.friuli.collio','WHITE',0),
  ('italy.friuli.friuli-colli-orientali','WHITE',0),('italy.friuli.friuli-colli-orientali','RED',1),
  ('italy.friuli.ramandolo','WHITE',0),('italy.friuli.ramandolo','SWEET',1),
  ('italy.friuli.rosazzo','WHITE',0)
) as st(ck, style, so) on st.ck = p.canonical_key;

do $$
declare a int; gr int; sl int;
begin
  select count(*) into a from wine_place_articles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.friuli%' and x.editorial_status='PUBLISHED';
  if a <> 5 then raise exception 'expected 5 articles, got %', a; end if;
  select count(*) into gr from wine_place_grapes x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.friuli%' and x.editorial_status='PUBLISHED';
  if gr <> 17 then raise exception 'expected 17 grape links, got %', gr; end if;
  select count(*) into sl from wine_place_styles x join wine_places p on p.id=x.wine_place_id where p.canonical_key like 'italy.friuli%' and x.editorial_status='PUBLISHED';
  if sl <> 6 then raise exception 'expected 6 style links, got %', sl; end if;
end $$;

commit;
