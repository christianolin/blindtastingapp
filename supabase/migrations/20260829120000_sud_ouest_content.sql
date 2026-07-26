-- Sud-Ouest — knowledge content (v1, published).
--
-- Region + Cahors + Madiran + Jurançon articles; every constituent gets
-- grape/style links where the grape exists in the library. Missing from the
-- library (carried in style notes instead): Negrette (Fronton), Duras and
-- Len de l'El (Gaillac), Abouriou (Marmandais). Fer Servadou covers its
-- local names (Braucol/Mansois). Insert-only with guards; re-run no-op.

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'A constellation of proudly local appellations between Bordeaux and the Pyrenees - the tannic blacks of Cahors and Madiran, Gaillac''s ancient vines, Basque Irouleguy, and the honeyed Mansengs of Jurancon. No shared AOC, but a shared spirit: native grapes first.',
  'Atlantic in the west, warming and drying toward the Mediterranean watershed; Pyrenean foehn ripens the far south.',
  'Limestone causses (Cahors), gravel terraces, molasse hills and Pyrenean scree.',
  array[
    'Native grapes first: Malbec, Tannat, Fer Servadou, the Mansengs, Negrette',
    'Cahors is original Malbec country ("the black wine")',
    'Madiran built Tannat; Jurancon and Pacherenc make the great Manseng sweets',
    'Bergerac mirrors Bordeaux varieties on the Dordogne',
    'Basque Irouleguy is France''s smallest mountain vineyard region'
  ],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.sud-ouest'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id, v.descr,
  'Atlantic-influenced with warm, dry late seasons.',
  v.soils,
  array[v.fact1, v.fact2],
  'PUBLISHED'
from (values
  ('cahors',
   'The original Malbec: dark, structured reds (min 70% Cot) from the Lot valley''s gravel terraces and the high limestone causse - the medieval "black wine" that predates Bordeaux''s fame.',
   'Gravel terraces by the Lot; hard limestone causse above.',
   'Min 70% Malbec (locally Cot or Auxerrois)',
   'The medieval "black wine" - exported before Bordeaux''s rise'),
  ('madiran',
   'Tannat''s homeland in the Gascon hills: deep, firmly tannic reds built to age, softened today by careful extraction and micro-oxygenation - a technique pioneered here.',
   'Clay-limestone slopes and iron-rich sands of the Vic-Bilh.',
   'Tannat-led reds - among France''s most structured',
   'Micro-oxygenation was pioneered in Madiran'),
  ('jurancon',
   'Pyrenean amphitheatres facing the peaks: Petit and Gros Manseng picked late (passerillage) for vibrant moelleux sweets, plus taut dry Jurancon Sec - the wine of Henri IV''s baptism.',
   'Pudding-stone (poudingue) and clay on steep south-facing slopes.',
   'Petit/Gros Manseng - moelleux by passerillage (shrivelling on the vine)',
   'Henri IV was baptised with Jurancon in 1553')
) as v(slug, descr, soils, fact1, fact2)
join wine_places p on p.canonical_key = 'france.sud-ouest.' || v.slug
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- Grapes per place (library-present only).
insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, v.role::wine_grape_role, true, null, v.note, 'PUBLISHED'
from (values
  ('france.sud-ouest', 'Malbec',        'PRINCIPAL', 'Cahors - locally Cot or Auxerrois'),
  ('france.sud-ouest', 'Tannat',        'PRINCIPAL', 'Madiran, Irouleguy, Bearn'),
  ('france.sud-ouest', 'Fer Servadou',  'ACCESSORY', 'Braucol (Gaillac) / Mansois (Marcillac)'),
  ('france.sud-ouest', 'Petit Manseng', 'ACCESSORY', 'Jurancon and Pacherenc sweets'),
  ('france.sud-ouest', 'Gros Manseng',  'ACCESSORY', null),
  ('france.sud-ouest', 'Merlot',        'ACCESSORY', 'Bergerac and the Dordogne'),
  ('france.sud-ouest', 'Mauzac',        'ACCESSORY', 'Gaillac whites and bubbles'),
  ('france.sud-ouest.bergerac', 'Merlot',             'PRINCIPAL', 'Bordeaux varieties on the Dordogne'),
  ('france.sud-ouest.bergerac', 'Cabernet Franc',     'ACCESSORY', null),
  ('france.sud-ouest.bergerac', 'Cabernet Sauvignon', 'ACCESSORY', null),
  ('france.sud-ouest.bergerac', 'Sauvignon Blanc',    'ACCESSORY', null),
  ('france.sud-ouest.monbazillac', 'Semillon',        'PRINCIPAL', 'Noble-rot sweet wines'),
  ('france.sud-ouest.monbazillac', 'Muscadelle',      'ACCESSORY', null),
  ('france.sud-ouest.monbazillac', 'Sauvignon Blanc', 'ACCESSORY', null),
  ('france.sud-ouest.saussignac', 'Semillon', 'PRINCIPAL', 'Noble-rot sweet wines'),
  ('france.sud-ouest.pecharmant', 'Merlot',         'PRINCIPAL', null),
  ('france.sud-ouest.pecharmant', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.sud-ouest.montravel', 'Merlot',          'PRINCIPAL', null),
  ('france.sud-ouest.montravel', 'Sauvignon Blanc', 'ACCESSORY', null),
  ('france.sud-ouest.cotes-de-duras', 'Merlot',          'PRINCIPAL', null),
  ('france.sud-ouest.cotes-de-duras', 'Sauvignon Blanc', 'ACCESSORY', null),
  ('france.sud-ouest.cotes-du-marmandais', 'Merlot',         'PRINCIPAL', 'With the local Abouriou'),
  ('france.sud-ouest.cotes-du-marmandais', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.sud-ouest.buzet', 'Merlot',             'PRINCIPAL', null),
  ('france.sud-ouest.buzet', 'Cabernet Franc',     'ACCESSORY', null),
  ('france.sud-ouest.buzet', 'Cabernet Sauvignon', 'ACCESSORY', null),
  ('france.sud-ouest.cahors', 'Malbec', 'PRINCIPAL', 'Min 70% - locally Cot or Auxerrois'),
  ('france.sud-ouest.cahors', 'Merlot', 'ACCESSORY', null),
  ('france.sud-ouest.gaillac', 'Fer Servadou', 'PRINCIPAL', 'Locally Braucol'),
  ('france.sud-ouest.gaillac', 'Mauzac',       'PRINCIPAL', 'Whites and methode ancestrale'),
  ('france.sud-ouest.gaillac-premieres-cotes', 'Mauzac', 'PRINCIPAL', null),
  ('france.sud-ouest.marcillac', 'Fer Servadou', 'PRINCIPAL', 'Locally Mansois - min 90%'),
  ('france.sud-ouest.madiran', 'Tannat',         'PRINCIPAL', 'The Madiran grape'),
  ('france.sud-ouest.madiran', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.sud-ouest.pacherenc-du-vic-bilh', 'Petit Manseng', 'PRINCIPAL', 'Sweet and dry whites'),
  ('france.sud-ouest.pacherenc-du-vic-bilh', 'Gros Manseng',  'PRINCIPAL', null),
  ('france.sud-ouest.jurancon', 'Petit Manseng', 'PRINCIPAL', 'The moelleux grape'),
  ('france.sud-ouest.jurancon', 'Gros Manseng',  'PRINCIPAL', 'Jurancon sec'),
  ('france.sud-ouest.bearn', 'Tannat',         'PRINCIPAL', null),
  ('france.sud-ouest.bearn', 'Cabernet Franc', 'ACCESSORY', null),
  ('france.sud-ouest.irouleguy', 'Tannat',         'PRINCIPAL', 'Basque mountain reds'),
  ('france.sud-ouest.irouleguy', 'Cabernet Franc', 'ACCESSORY', 'Locally Axeria')
) as v(ck, grape, role, note)
join wine_places p on p.canonical_key = v.ck
join grapes g on g.name = v.grape
on conflict (wine_place_id, grape_id) do nothing;

-- Styles.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, v.style::wine_style_kind, v.note, v.so, 'PUBLISHED'
from (values
  ('france.sud-ouest', 'RED',   'Tannat, Malbec, Fer Servadou', 0),
  ('france.sud-ouest', 'WHITE', null, 1),
  ('france.sud-ouest', 'SWEET', 'Jurancon, Monbazillac, Pacherenc', 2),
  ('france.sud-ouest.bergerac', 'RED', null, 0),
  ('france.sud-ouest.bergerac', 'WHITE', null, 1),
  ('france.sud-ouest.bergerac', 'ROSE', null, 2),
  ('france.sud-ouest.monbazillac', 'SWEET', 'Noble rot below the Dordogne mists', 0),
  ('france.sud-ouest.saussignac', 'SWEET', 'Noble rot', 0),
  ('france.sud-ouest.pecharmant', 'RED', null, 0),
  ('france.sud-ouest.montravel', 'WHITE', null, 0),
  ('france.sud-ouest.montravel', 'RED', null, 1),
  ('france.sud-ouest.cotes-de-duras', 'RED', null, 0),
  ('france.sud-ouest.cotes-de-duras', 'WHITE', null, 1),
  ('france.sud-ouest.cotes-du-marmandais', 'RED', 'With the local Abouriou', 0),
  ('france.sud-ouest.buzet', 'RED', null, 0),
  ('france.sud-ouest.buzet', 'ROSE', null, 1),
  ('france.sud-ouest.cahors', 'RED', 'Malbec - the black wine', 0),
  ('france.sud-ouest.gaillac', 'RED', 'Braucol and Duras', 0),
  ('france.sud-ouest.gaillac', 'WHITE', 'Mauzac and Len de l''El', 1),
  ('france.sud-ouest.gaillac', 'SPARKLING', 'Methode ancestrale', 2),
  ('france.sud-ouest.gaillac-premieres-cotes', 'WHITE', null, 0),
  ('france.sud-ouest.fronton', 'RED', 'Negrette - not yet in the grape library', 0),
  ('france.sud-ouest.fronton', 'ROSE', 'Negrette rose', 1),
  ('france.sud-ouest.marcillac', 'RED', 'Mansois on the rougier', 0),
  ('france.sud-ouest.madiran', 'RED', 'Tannat', 0),
  ('france.sud-ouest.pacherenc-du-vic-bilh', 'SWEET', 'Passerillage', 0),
  ('france.sud-ouest.pacherenc-du-vic-bilh', 'WHITE', 'Pacherenc sec', 1),
  ('france.sud-ouest.jurancon', 'SWEET', 'Moelleux by passerillage', 0),
  ('france.sud-ouest.jurancon', 'WHITE', 'Jurancon sec', 1),
  ('france.sud-ouest.bearn', 'RED', null, 0),
  ('france.sud-ouest.bearn', 'ROSE', null, 1),
  ('france.sud-ouest.irouleguy', 'RED', null, 0),
  ('france.sud-ouest.irouleguy', 'ROSE', null, 1),
  ('france.sud-ouest.irouleguy', 'WHITE', null, 2)
) as v(ck, style, note, so)
join wine_places p on p.canonical_key = v.ck
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int; v_g int; v_s int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key like 'france.sud-ouest%';
  if v_a <> 4 then raise exception 'expected 4 sud-ouest articles, got %', v_a; end if;
  select count(*) into v_g from wine_place_grapes wg
    join wine_places p on p.id = wg.wine_place_id
   where p.canonical_key like 'france.sud-ouest%';
  if v_g <> 42 then raise exception 'expected 42 sud-ouest grape links, got %', v_g; end if;
  select count(*) into v_s from wine_place_styles ws
    join wine_places p on p.id = ws.wine_place_id
   where p.canonical_key like 'france.sud-ouest%';
  if v_s <> 34 then raise exception 'expected 34 sud-ouest styles, got %', v_s; end if;
end;
$$;
