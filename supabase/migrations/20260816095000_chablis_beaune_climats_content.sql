-- Phase 3F content for the 328 Chablis + Côte de Beaune premier-cru climats.
-- Styles and grapes are INHERITED from each climat's parent village (so
-- white Meursault / Puligny climats stay white, red Pommard / Volnay red,
-- Chablis Chardonnay), plus the premier-cru designation and a village-naming
-- article stub. No scoring links (individual climat names are absent from /
-- ambiguous in the scoring table). Published directly.

with new_climats as (
  select p.id, p.name, grp.id grp_id, village.id village_id, village.name village_name
  from wine_places p
  join wine_places grp on grp.id = p.primary_parent_id
  join wine_places village on village.id = grp.primary_parent_id
  where p.appellation_level = 'premier_cru' and p.display_tier = 5
    and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
      or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
)
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select nc.id, d.id, null, 'PUBLISHED'
from new_climats nc, wine_designations d
where d.key = 'burgundy-premier-cru'
on conflict (wine_place_id, designation_id) do nothing;

-- Inherit the parent village's styles.
insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, vs.style, null, vs.sort_order, 'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_place_styles vs on vs.wine_place_id = grp.primary_parent_id and vs.style <> 'ROSE'
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
on conflict (wine_place_id, style) do nothing;

-- Inherit the parent village's grapes.
insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, vg.grape_id, vg.role, vg.permitted, vg.share_pct, null, 'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_place_grapes vg on vg.wine_place_id = grp.primary_parent_id
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  p.name || ' is a premier cru climat of ' || village.name ||
  ', labelled ' || village.name || ' 1er Cru ' || p.name || '.',
  'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_places village on village.id = grp.primary_parent_id
where p.appellation_level = 'premier_cru' and p.display_tier = 5
  and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
    or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_missing int;
begin
  select count(*) into v_missing from wine_places p
   where p.publication_status = 'VERIFIED' and p.display_tier = 5
     and (p.canonical_key like 'france.bourgogne.chablis.%.premier-cru.%'
       or p.canonical_key like 'france.bourgogne.cote-de-beaune.%.premier-cru.%')
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception '% climats lack an article', v_missing;
  end if;
end $$;
