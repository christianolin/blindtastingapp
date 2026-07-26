-- Corse — knowledge content (v1, published).
--
-- Region + Patrimonio + Ajaccio + Muscat du Cap Corse articles; the five
-- Vin de Corse villages keep the curation placeholder but get grape/style
-- links. The library has no 'Nielluccio' row: Nielluccio IS Sangiovese
-- (the Corsican name), so Patrimonio/region link Sangiovese with the local
-- name carried in local_note. Sciaccarello matches the library spelling
-- (double c). Insert-only with guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The Isle of Beauty: vineyards ring the island between sea and mountain, from the chalk of Patrimonio to the granite west around Ajaccio. Italian heritage shows in the grapes - Nielluccio (Sangiovese) and Vermentino - joined by the native Sciaccarello.',
  'Mediterranean and mountainous: intense sun tempered by altitude and sea winds; the driest of France''s classic regions.',
  'Schist in the north (Cap Corse), limestone at Patrimonio, granite in the west and south.',
  array[
    'Nielluccio = Sangiovese (Patrimonio); Sciaccarello is the native red (Ajaccio)',
    'Vermentino (Vermentinu) leads the whites island-wide',
    'Vin de Corse + five village denominations: Calvi, Coteaux du Cap Corse, Figari, Porto-Vecchio, Sartene',
    'Muscat du Cap Corse: vin doux naturel from Muscat Blanc a Petits Grains'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.corse'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Mediterranean; sea winds temper the heat.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('patrimonio',
   'Corsica''s first AOC (1968), on chalky limestone below the Cap Corse schist: structured, age-worthy Nielluccio reds (min 90%), saline Vermentino whites and a fine Muscat tradition.',
   'Chalky limestone and clay - rare on a schist-granite island.',
   'Corsica''s first AOC - Nielluccio (Sangiovese) reds of real structure',
   'Reds must be at least 90% Nielluccio'),
  ('ajaccio',
   'Granite hills around the imperial city: pale, peppery, red-fruited Sciaccarello reds and roses with real freshness at altitude.',
   'Granite arenes on steep coastal hills.',
   'Sciaccarello country - pale, peppery, mountain-fresh reds',
   'Among the highest mainland-style vineyards on the island'),
  ('muscat-du-cap-corse',
   'Vin doux naturel from Muscat Blanc a Petits Grains on the schist terraces of the island''s northern finger - honeyed, citrus-bright and mineral.',
   'Schist terraces of the Cap Corse peninsula.',
   'Vin doux naturel from Muscat Blanc a Petits Grains',
   'Grown on the narrow schist finger of Cap Corse')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.corse.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.corse', 'Vermentino',   'PRINCIPAL', 'Vermentinu - the island white'),
  ('france.corse', 'Sangiovese',   'PRINCIPAL', 'Locally Nielluccio - the Patrimonio red'),
  ('france.corse', 'Sciaccarello', 'PRINCIPAL', 'The native red - Ajaccio and the granite west'),
  ('france.corse', 'Grenache',     'ACCESSORY', 'In Vin de Corse blends'),
  ('france.corse', 'Cinsault',     'ACCESSORY', 'In Vin de Corse blends'),
  ('france.corse.calvi',                'Vermentino',   'PRINCIPAL', null),
  ('france.corse.calvi',                'Sciaccarello', 'ACCESSORY', null),
  ('france.corse.calvi',                'Sangiovese',   'ACCESSORY', 'Locally Nielluccio'),
  ('france.corse.coteaux-du-cap-corse', 'Vermentino',   'PRINCIPAL', null),
  ('france.corse.coteaux-du-cap-corse', 'Sciaccarello', 'ACCESSORY', null),
  ('france.corse.coteaux-du-cap-corse', 'Sangiovese',   'ACCESSORY', 'Locally Nielluccio'),
  ('france.corse.figari',               'Vermentino',   'PRINCIPAL', null),
  ('france.corse.figari',               'Sciaccarello', 'ACCESSORY', null),
  ('france.corse.figari',               'Sangiovese',   'ACCESSORY', 'Locally Nielluccio'),
  ('france.corse.porto-vecchio',        'Vermentino',   'PRINCIPAL', null),
  ('france.corse.porto-vecchio',        'Sciaccarello', 'ACCESSORY', null),
  ('france.corse.porto-vecchio',        'Sangiovese',   'ACCESSORY', 'Locally Nielluccio'),
  ('france.corse.sartene',              'Vermentino',   'PRINCIPAL', null),
  ('france.corse.sartene',              'Sciaccarello', 'ACCESSORY', null),
  ('france.corse.sartene',              'Sangiovese',   'ACCESSORY', 'Locally Nielluccio'),
  ('france.corse.patrimonio', 'Sangiovese', 'PRINCIPAL', 'Locally Nielluccio - min 90% of reds'),
  ('france.corse.patrimonio', 'Vermentino', 'ACCESSORY', 'Saline whites'),
  ('france.corse.ajaccio',    'Sciaccarello', 'PRINCIPAL', 'The signature - pale, peppery reds'),
  ('france.corse.ajaccio',    'Vermentino',   'ACCESSORY', null),
  ('france.corse.muscat-du-cap-corse', 'Muscat', 'PRINCIPAL', 'Muscat Blanc a Petits Grains - vin doux naturel')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles: the island is red/white/rose everywhere except the Muscat VDN.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind,
       case when p.canonical_key = 'france.corse' and v.style = 'ROSE'
            then 'Rose leads island production' else null end,
       v.so, 'PUBLISHED'
from (values ('RED', 0), ('WHITE', 1), ('ROSE', 2)) as v(style, so)
join wine_places p on p.canonical_key in (
  'france.corse',
  'france.corse.calvi', 'france.corse.coteaux-du-cap-corse',
  'france.corse.figari', 'france.corse.porto-vecchio',
  'france.corse.sartene', 'france.corse.patrimonio', 'france.corse.ajaccio'
)
on conflict (wine_place_id, style) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'SWEET', 'Vin doux naturel', 0, 'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.corse.muscat-du-cap-corse'
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.corse%';
  if v_a <> 4 then raise exception 'expected 4 corse articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.corse%';
  if v_g <> 25 then raise exception 'expected 25 corse grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.corse%';
  if v_s <> 25 then raise exception 'expected 25 corse styles (8x3 + sweet), got %', v_s; end if;
end;
$$;
