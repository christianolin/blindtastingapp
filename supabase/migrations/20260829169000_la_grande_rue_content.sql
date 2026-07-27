-- Bourgogne — La Grande Rue content (v1, published).
insert into wine_place_articles
  (wine_place_id, description, climate, soils, key_facts, editorial_status)
select p.id,
  'The slender monopole strip between La Tâche and Romanée-Conti - Domaine Lamarche''s grand cru, promoted from premier cru in 1992.',
  'Continental; mid-slope east exposure on the Vosne côte.',
  'Shallow brown limestone over hard rock, mid-slope.',
  array['Grand cru monopole (Domaine François Lamarche)', 'Promoted 1992'],
  'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
  and not exists (select 1 from wine_place_articles a where a.wine_place_id = p.id);

insert into wine_place_grapes
  (wine_place_id, grape_id, role, permitted, share_pct, local_note, editorial_status)
select p.id, g.id, 'PRINCIPAL'::wine_grape_role, true, null, null, 'PUBLISHED'
from wine_places p, grapes g
where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
  and g.name = 'Pinot Noir'
on conflict (wine_place_id, grape_id) do nothing;

insert into wine_place_styles (wine_place_id, style, note, sort_order, editorial_status)
select p.id, 'RED'::wine_style_kind, null, 0, 'PUBLISHED'
from wine_places p
where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue'
on conflict (wine_place_id, style) do nothing;

do $$
declare v_a int;
begin
  select count(*) into v_a from wine_place_articles a
    join wine_places p on p.id = a.wine_place_id
   where p.canonical_key = 'france.bourgogne.cote-de-nuits.vosne-romanee.la-grande-rue';
  if v_a <> 1 then raise exception 'expected la-grande-rue article, got %', v_a; end if;
end;
$$;
