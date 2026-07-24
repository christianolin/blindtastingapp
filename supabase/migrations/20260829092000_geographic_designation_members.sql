-- Phase 3F: geographic (SITE) classification members — Burgundy & Alsace Grand
-- Crus. A SITE member IS a delimited vineyard (not a producer), so it links to
-- a wine_place where the place is live. Seeded PUBLISHED (published-read RLS).
--
-- Burgundy: the 32 canonical Grand Cru appellations the app models = grand_cru
-- places under france.bourgogne whose parent is NOT itself grand_cru (this
-- collapses Corton's 24 lieux-dits and Chablis GC's 7 climats into their parent
-- appellation). wine_place_id is set from the existing place; commune = the
-- village it sits in. La Grande Rue (Vosne-Romanée, GC since 1992) is the 33rd
-- real Grand Cru but is not yet in the map catalog, so it seeds with a null
-- wine_place_id and links when the place is added.
--
-- Alsace: the 51 delimited Grand Cru lieux-dits from the pinned INAO artifact
-- (data/wine-map/alsace-appellations.json). Alsace is not live on the map yet,
-- so wine_place_id stays null (linked when the region is flipped).

-- Burgundy: 32 canonical GC appellations from live places.
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, wine_place_id, editorial_status)
select d.id, 'SITE', p.name, 'Grand Cru', 1, parent.name,
       row_number() over (order by p.name), p.id, 'PUBLISHED'
from public.wine_places p
join public.wine_places parent on parent.id = p.primary_parent_id
join public.wine_designations d on d.key = 'burgundy-grand-cru'
where p.canonical_key like 'france.bourgogne.%'
  and p.appellation_level = 'grand_cru'
  and p.publication_status = 'VERIFIED'
  and parent.appellation_level is distinct from 'grand_cru'
on conflict (designation_id, name) do nothing;

-- Burgundy: La Grande Rue (33rd GC, not yet mapped -> null place).
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune, sort_order, wine_place_id, local_note, editorial_status)
select d.id, 'SITE', 'La Grande Rue', 'Grand Cru', 1, 'Vosne-Romanée', 100, null,
       'Elevated from Premier Cru to Grand Cru in 1992; a monopole. Not yet on the Blindr map.', 'PUBLISHED'
from public.wine_designations d
where d.key = 'burgundy-grand-cru'
on conflict (designation_id, name) do nothing;

-- Alsace: the 51 Grand Cru lieux-dits (null place until Alsace goes live).
insert into public.wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, sort_order, editorial_status)
select d.id, 'SITE', v.name, 'Grand Cru', 1, v.ord, 'PUBLISHED'
from public.wine_designations d,
(values
  ('Altenberg de Bergbieten', 1),
  ('Altenberg de Bergheim', 2),
  ('Altenberg de Wolxheim', 3),
  ('Brand', 4),
  ('Bruderthal', 5),
  ('Eichberg', 6),
  ('Engelberg', 7),
  ('Florimont', 8),
  ('Frankstein', 9),
  ('Froehn', 10),
  ('Furstentum', 11),
  ('Geisberg', 12),
  ('Gloeckelberg', 13),
  ('Goldert', 14),
  ('Hatschbourg', 15),
  ('Hengst', 16),
  ('Kaefferkopf', 17),
  ('Kanzlerberg', 18),
  ('Kastelberg', 19),
  ('Kessler', 20),
  ('Kirchberg de Barr', 21),
  ('Kirchberg de Ribeauvillé', 22),
  ('Kitterlé', 23),
  ('Mambourg', 24),
  ('Mandelberg', 25),
  ('Marckrain', 26),
  ('Moenchberg', 27),
  ('Muenchberg', 28),
  ('Ollwiller', 29),
  ('Osterberg', 30),
  ('Pfersigberg', 31),
  ('Pfingstberg', 32),
  ('Praelatenberg', 33),
  ('Rangen', 34),
  ('Rosacker', 35),
  ('Saering', 36),
  ('Schlossberg', 37),
  ('Schoenenbourg', 38),
  ('Sommerberg', 39),
  ('Sonnenglanz', 40),
  ('Spiegel', 41),
  ('Sporen', 42),
  ('Steinert', 43),
  ('Steingrubler', 44),
  ('Steinklotz', 45),
  ('Vorbourg', 46),
  ('Wiebelsberg', 47),
  ('Wineck-Schlossberg', 48),
  ('Winzenberg', 49),
  ('Zinnkoepfle', 50),
  ('Zotzenberg', 51)
) as v(name, ord)
where d.key = 'alsace-grand-cru'
on conflict (designation_id, name) do nothing;

do $$
declare v_bur int; v_bur_linked int; v_grande_rue int; v_als int; v_als_null int; v_site int;
begin
  select count(*) into v_bur from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id where d.key = 'burgundy-grand-cru';
  select count(*) into v_bur_linked from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id
    where d.key = 'burgundy-grand-cru' and m.wine_place_id is not null;
  if v_bur <> 33 then raise exception 'burgundy GC expected 33, got %', v_bur; end if;
  if v_bur_linked <> 32 then raise exception 'burgundy GC linked expected 32, got %', v_bur_linked; end if;
  select count(*) into v_grande_rue from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id
    where d.key = 'burgundy-grand-cru' and m.name = 'La Grande Rue' and m.wine_place_id is null;
  if v_grande_rue <> 1 then raise exception 'La Grande Rue expected 1 null-place row, got %', v_grande_rue; end if;

  select count(*) into v_als from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id where d.key = 'alsace-grand-cru';
  select count(*) into v_als_null from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id
    where d.key = 'alsace-grand-cru' and m.wine_place_id is null;
  if v_als <> 51 then raise exception 'alsace GC expected 51, got %', v_als; end if;
  if v_als_null <> 51 then raise exception 'alsace GC wine_place_id must all be null, got % non-null', 51 - v_als_null; end if;

  -- every linked Burgundy member points at a bourgogne grand_cru place (subset invariant)
  if exists (
    select 1 from public.wine_designation_members m
    join public.wine_designations d on d.id = m.designation_id
    join public.wine_places p on p.id = m.wine_place_id
    where d.key = 'burgundy-grand-cru'
      and (p.canonical_key not like 'france.bourgogne.%' or p.appellation_level <> 'grand_cru')
  ) then raise exception 'a burgundy member links a non-bourgogne-GC place'; end if;

  select count(*) into v_site from public.wine_designation_members where member_kind = 'SITE';
  if v_site <> 84 then raise exception 'SITE members expected 84 (33 burgundy + 51 alsace), got %', v_site; end if;
end $$;
