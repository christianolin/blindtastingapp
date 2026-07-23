-- Phase 3F content for the 121 Côte de Nuits premier-cru climats, all
-- rule-driven: Pinot Noir, red, premier-cru designation, and an article
-- stub naming the parent village. Published directly. No scoring links —
-- individual 1er-cru climat names are largely absent from / ambiguous in the
-- scoring table, so no fuzzy matching is attempted (they stay unlinked).

-- Grand-cru-vs-premier catalogue link.
insert into wine_place_designations (wine_place_id, designation_id, local_note, editorial_status)
select p.id, d.id, null, 'PUBLISHED'
from wine_places p, wine_designations d
where d.key = 'burgundy-premier-cru'
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
  and p.appellation_level = 'premier_cru' and p.display_tier = 5
on conflict (wine_place_id, designation_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED', null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
  and p.appellation_level = 'premier_cru' and p.display_tier = 5
on conflict (wine_place_id, style) do nothing;

insert into wine_place_grapes (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL', true, 100, null, 'PUBLISHED'
from wine_places p, grapes g
where g.name = 'Pinot Noir'
  and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
  and p.appellation_level = 'premier_cru' and p.display_tier = 5
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_articles (wine_place_id, description, editorial_status)
select p.id,
  p.name || ' is a premier cru climat of ' || village.name ||
  ', labelled ' || village.name || ' 1er Cru ' || p.name || '.',
  'PUBLISHED'
from wine_places p
join wine_places grp on grp.id = p.primary_parent_id
join wine_places village on village.id = grp.primary_parent_id
where p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
  and p.appellation_level = 'premier_cru' and p.display_tier = 5
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

do $$
declare v_missing int;
begin
  select count(*) into v_missing from wine_places p
   where p.publication_status = 'VERIFIED'
     and p.canonical_key like 'france.bourgogne.cote-de-nuits.%.premier-cru.%'
     and p.display_tier = 5
     and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);
  if v_missing <> 0 then
    raise exception '% Cote de Nuits climats lack an article', v_missing;
  end if;
end $$;
