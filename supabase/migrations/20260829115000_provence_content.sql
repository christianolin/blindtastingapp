-- Provence — knowledge content (v1, published).
--
-- Region + Bandol + Les Baux + Palette articles; the three big regional
-- AOCs and Sainte-Victoire keep the curation placeholder but carry full
-- grape/style links. Rosé leads everywhere (sort_order 0). Rolle is the
-- local name for Vermentino (carried in local_note); Clairette (Palette
-- whites) is not in the grape library yet, told in the article instead.
-- Insert-only with guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The world''s rose benchmark: sun-baked hills from the Rhone delta to the Var coast where pale, dry pink wine is the local currency. Grenache and Cinsault drive the roses, Mourvedre makes Bandol''s great age-worthy reds, and Rolle (Vermentino) leads the whites.',
  'Mediterranean: hot, dry, brilliantly sunny; the mistral dries and cools the vineyards.',
  'Limestone hills in the west and centre; crystalline schist toward the Maures and the coast.',
  array[
    'Around 90% of production is rose - the global reference for the style',
    'Grenache + Cinsault (+ Tibouren) for roses; Mourvedre for Bandol reds',
    'Three big AOCs: Cotes de Provence, Coteaux d''Aix, Coteaux varois',
    'Prestige pockets: Bandol, Palette, Les Baux-de-Provence, Sainte-Victoire',
    'Rolle is the Provencal name for Vermentino'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.provence'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Mediterranean; amphitheatre slopes above the sea or sheltered inland bowls.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('bandol',
   'South-facing terraced amphitheatre above the sea near Toulon: Mourvedre finds its greatest French expression here - dark, structured, garrigue-scented reds that age for decades, plus serious rose.',
   'Silica-limestone and sandy marls on restanque terraces.',
   'Mourvedre must be at least 50% of the reds (usually far more)',
   'One of France''s great age-worthy red appellations - and top-tier rose'),
  ('les-baux-de-provence',
   'Vines around the crag of Les Baux in the Alpilles: sun-hammered, mistral-swept slopes that pioneered organic viticulture - most of the appellation farms organically or biodynamically.',
   'Limestone scree of the Alpilles.',
   'A pioneer of organic/biodynamic farming in France',
   'Grenache-Syrah reds full of garrigue'),
  ('palette',
   'A tiny amphitheatre of pine-sheltered limestone outside Aix-en-Provence, dominated by Chateau Simone: old-vine field blends and long-lived whites led by Clairette.',
   'North-facing limestone scree under pine forest.',
   'Barely 50 hectares - Chateau Simone is the standard-bearer',
   'Whites led by Clairette; reds and roses from old field blends')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.provence.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place.
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.provence', 'Grenache',   'PRINCIPAL', 'Backbone of the roses'),
  ('france.provence', 'Cinsault',   'PRINCIPAL', 'The rose grape'),
  ('france.provence', 'Syrah',      'ACCESSORY', null),
  ('france.provence', 'Mourvèdre',  'ACCESSORY', 'Bandol''s grape'),
  ('france.provence', 'Tibouren',   'ACCESSORY', 'The Provencal rose specialty'),
  ('france.provence', 'Vermentino', 'ACCESSORY', 'Locally Rolle - the white'),
  ('france.provence', 'Carignan',   'ACCESSORY', 'Old-vine holdings'),
  ('france.provence.cotes-de-provence', 'Grenache',   'PRINCIPAL', null),
  ('france.provence.cotes-de-provence', 'Cinsault',   'PRINCIPAL', null),
  ('france.provence.cotes-de-provence', 'Syrah',      'ACCESSORY', null),
  ('france.provence.cotes-de-provence', 'Mourvèdre',  'ACCESSORY', null),
  ('france.provence.cotes-de-provence', 'Tibouren',   'ACCESSORY', 'A CdP specialty'),
  ('france.provence.cotes-de-provence', 'Vermentino', 'ACCESSORY', 'Locally Rolle'),
  ('france.provence.coteaux-daix-en-provence', 'Grenache',   'PRINCIPAL', null),
  ('france.provence.coteaux-daix-en-provence', 'Cinsault',   'ACCESSORY', null),
  ('france.provence.coteaux-daix-en-provence', 'Syrah',      'ACCESSORY', null),
  ('france.provence.coteaux-daix-en-provence', 'Mourvèdre',  'ACCESSORY', null),
  ('france.provence.coteaux-daix-en-provence', 'Vermentino', 'ACCESSORY', 'Locally Rolle'),
  ('france.provence.coteaux-varois-en-provence', 'Grenache',   'PRINCIPAL', null),
  ('france.provence.coteaux-varois-en-provence', 'Cinsault',   'ACCESSORY', null),
  ('france.provence.coteaux-varois-en-provence', 'Syrah',      'ACCESSORY', null),
  ('france.provence.coteaux-varois-en-provence', 'Mourvèdre',  'ACCESSORY', null),
  ('france.provence.coteaux-varois-en-provence', 'Vermentino', 'ACCESSORY', 'Locally Rolle'),
  ('france.provence.cotes-de-provence-sainte-victoire', 'Grenache', 'PRINCIPAL', null),
  ('france.provence.cotes-de-provence-sainte-victoire', 'Cinsault', 'PRINCIPAL', null),
  ('france.provence.cotes-de-provence-sainte-victoire', 'Syrah',    'ACCESSORY', null),
  ('france.provence.bandol', 'Mourvèdre', 'PRINCIPAL', 'Min 50% of reds - usually far more'),
  ('france.provence.bandol', 'Grenache',  'ACCESSORY', null),
  ('france.provence.bandol', 'Cinsault',  'ACCESSORY', 'For the roses'),
  ('france.provence.les-baux-de-provence', 'Grenache',  'PRINCIPAL', null),
  ('france.provence.les-baux-de-provence', 'Syrah',     'PRINCIPAL', null),
  ('france.provence.les-baux-de-provence', 'Mourvèdre', 'ACCESSORY', null),
  ('france.provence.les-baux-de-provence', 'Cinsault',  'ACCESSORY', null),
  ('france.provence.palette', 'Grenache',   'PRINCIPAL', null),
  ('france.provence.palette', 'Mourvèdre',  'PRINCIPAL', null),
  ('france.provence.palette', 'Cinsault',   'ACCESSORY', null),
  ('france.provence.palette', 'Vermentino', 'ACCESSORY', 'Whites led by Clairette (not yet in the library)')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles: rose first everywhere.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind,
       case
         when p.canonical_key = 'france.provence' and v.style = 'ROSE'
           then 'Around 90% of production'
         when p.canonical_key = 'france.provence.bandol' and v.style = 'RED'
           then 'Mourvedre - the age-worthy exception'
         else null
       end,
       v.so, 'PUBLISHED'
from (values ('ROSE', 0), ('RED', 1), ('WHITE', 2)) as v(style, so)
join wine_places p on p.canonical_key like 'france.provence%'
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.provence%';
  if v_a <> 4 then raise exception 'expected 4 provence articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.provence%';
  if v_g <> 37 then raise exception 'expected 37 provence grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.provence%';
  if v_s <> 24 then raise exception 'expected 24 provence styles (8x rose/red/white), got %', v_s; end if;
end;
$$;
