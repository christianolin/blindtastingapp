-- Phase 3F: scoring links, designation, styles, grapes and articles for the
-- seven Chablis Grand Cru climats. Published directly.

update appellations a
set wine_place_id = p.id,
    map_status = 'VERIFIED',
    map_match_method = 'MIGRATED_EXACT',
    map_match_confidence = 1,
    map_reviewed_at = now(),
    map_review_note = 'Phase 3F chablis-climats migration: exact name match'
from (values
  ('Bougros AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.bougros'),
  ('Preuses AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.preuses'),
  ('Vaudesir AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.vaudesir'),
  ('Grenouilles AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.grenouilles'),
  ('Valmur AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.valmur'),
  ('Les Clos AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.les-clos'),
  ('Blanchot AOP', 'france.bourgogne.chablis.chablis.chablis-grand-cru.blanchot')
) as v(name, key)
join wine_places p on p.canonical_key = v.key
where a.name = v.name and a.wine_place_id is null;

-- Grand-cru designation + all-Chardonnay style/grape for each climat.
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p, wine_designations d
where d.key = 'burgundy-grand-cru'
  and p.canonical_key like 'france.bourgogne.chablis.chablis.chablis-grand-cru.%'
on conflict (wine_place_id, designation_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'WHITE', null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.bourgogne.chablis.chablis.chablis-grand-cru.%'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 100, null, 'PUBLISHED'
from wine_places p, grapes g
where g.name = 'Chardonnay'
  and p.canonical_key like 'france.bourgogne.chablis.chablis.chablis-grand-cru.%'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, soils, key_facts, editorial_status)
select p.id, v.description, 'Kimmeridgian marl and limestone on the one south-west-facing grand cru slope.', v.facts, 'PUBLISHED'
from (values
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.bougros',
   'The north-westernmost climat of the grand cru slope — the broadest and, in its lower "Côte Bouguerots" section, one of the fullest, most powerful Chablis grands crus.',
   array['Largest of the seven climats', 'Includes the steep Côte Bouguerots']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.preuses',
   'A gently curving climat above Bougros — rounder and more supple than its neighbours, all white flowers and honeyed stone-fruit.',
   array['The most rounded, supple grand cru', 'Sits high on the slope']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.vaudesir',
   'A steep, sun-trap fold in the centre of the slope giving perfumed, intense Chablis — Grenouilles'' more flamboyant neighbour.',
   array['Steep amphitheatre exposure', 'Perfumed and intense']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.grenouilles',
   'The smallest grand cru but for La Moutonne — a low, riverside climat of unusual richness and generosity, named for the frogs of the Serein below.',
   array['The smallest true grand cru climat', 'Rich, generous, riverside']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.valmur',
   'The central climat straddling a fold between Grenouilles and Les Clos — structured, mineral and slow to open, with real ageing power.',
   array['Central, structured, age-worthy', 'Straddles a slope fold']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.les-clos',
   'The largest and most celebrated climat — the grand cru against which all Chablis is measured: taut, saline, flinty and near-immortal in great years.',
   array['The reference-point grand cru', 'Taut, saline, extremely long-lived']),
  ('france.bourgogne.chablis.chablis.chablis-grand-cru.blanchot',
   'The south-easternmost, highest and coolest climat — the most floral and delicate of the seven, adjoining Les Clos.',
   array['Highest and coolest climat', 'The most floral and delicate'])
) as v(key, description, facts)
join wine_places p on p.canonical_key = v.key
where not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_links int; v_missing int;
begin
  select count(*) into v_links from appellations
   where map_review_note = 'Phase 3F chablis-climats migration: exact name match';
  if v_links <> 7 then
    raise exception 'expected 7 Chablis climat links, got %', v_links;
  end if;
  select count(*) into v_missing from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne.chablis.chablis.chablis-grand-cru.%'
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception '% Chablis climats lack an article', v_missing;
  end if;
end $$;
