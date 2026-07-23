-- Phase 3F content for the final Burgundy climats. Chalonnaise/Mâconnais
-- premier-cru climats inherit styles+grapes from their village; Corton
-- grand-cru climats get red / Pinot Noir and the grand-cru designation.
-- Article stubs throughout; no scoring links (ambiguous climat names).

-- ---- Premier-cru climats (Chalonnaise + Mâconnais): inherit from village ----
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p, wine_designations d
where d.key = 'burgundy-premier-cru'
  and p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.cote-chalonnaise.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.maconnais.%.premier-cru.%')
on conflict (wine_place_id, designation_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, vs.style, null, vs.sort_order, 'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_place_styles vs on vs.wine_place_id = grp.primary_parent_id and vs.style <> 'ROSE'
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.cote-chalonnaise.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.maconnais.%.premier-cru.%')
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, vg.grape_id, vg.role, vg.permitted, vg.share_pct, null, 'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_place_grapes vg on vg.wine_place_id = grp.primary_parent_id
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.cote-chalonnaise.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.maconnais.%.premier-cru.%')
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  p.name || ' is a premier cru climat of ' || village.name ||
  ', labelled ' || village.name || ' 1er Cru ' || p.name || '.', 'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_places village on village.id = grp.primary_parent_id
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.cote-chalonnaise.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.maconnais.%.premier-cru.%')
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

-- ---- Corton grand-cru climats: red / Pinot Noir / grand-cru designation ----
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p, wine_designations d
where d.key = 'burgundy-grand-cru'
  and p.canonical_key like 'france.bourgogne.cote-de-beaune.aloxe-corton.corton.%'
on conflict (wine_place_id, designation_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED', null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.bourgogne.cote-de-beaune.aloxe-corton.corton.%'
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 100, null, 'PUBLISHED'
from wine_places p, grapes g
where g.name = 'Pinot Noir'
  and p.canonical_key like 'france.bourgogne.cote-de-beaune.aloxe-corton.corton.%'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  p.name || ' is a named climat of the Corton grand cru, on the hill of Corton above Aloxe-Corton — labelled Corton ' || p.name || ' or simply Corton.',
  'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.bourgogne.cote-de-beaune.aloxe-corton.corton.%'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_missing int;
begin
  select count(*) into v_missing from wine_places p
   where p.publication_status = 'VERIFIED' and p.display_tier = 5
     and (p.canonical_key like 'france.bourgogne.cote-chalonnaise.%.premier-cru.%'
       or p.canonical_key like 'france.bourgogne.maconnais.%.premier-cru.%'
       or p.canonical_key like 'france.bourgogne.cote-de-beaune.aloxe-corton.corton.%')
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception '% final climats lack an article', v_missing;
  end if;
end $$;
