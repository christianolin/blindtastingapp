-- Champagne's Échelle des Crus as a classification, so the library tab can show
-- the same pyramid + searchable table as Burgundy and Bordeaux instead of a
-- bare link to the map.
--
-- The classified units are whole VILLAGES (crus), not estates or vineyards: 17
-- Grand Cru and 42 Premier Cru communes. Those 59 villages already exist as
-- SITE places under france.champagne, so every member links straight to the map.
insert into wine_designations
  (key, name, description, display_group, appellation_system, sort_order, editorial_status)
select
  'champagne-echelle-des-crus',
  'Échelle des Crus',
  'Champagne ranks whole villages rather than individual estates. The échelle ' ||
  '("ladder") once set grape prices as a percentage of the going rate: 100% ' ||
  'villages were Grand Cru, 90–99% Premier Cru. The price scale was abandoned ' ||
  'in the 2000s, but the 17 Grand Cru and 42 Premier Cru villages remain, and ' ||
  'the terms still appear on labels.',
  'Champagne',
  'AOC/AOP',
  0,
  'PUBLISHED'
where not exists (
  select 1 from wine_designations where key = 'champagne-echelle-des-crus'
);

with d as (
  select id from wine_designations where key = 'champagne-echelle-des-crus'
),
grand_cru(name) as (
  values ('Ambonnay'), ('Avize'), ('Aÿ'), ('Beaumont-sur-Vesle'), ('Bouzy'),
         ('Chouilly'), ('Cramant'), ('Louvois'), ('Le Mesnil-sur-Oger'),
         ('Mailly-Champagne'), ('Oger'), ('Oiry'), ('Puisieulx'), ('Sillery'),
         ('Tours-sur-Marne'), ('Verzenay'), ('Verzy')
),
village as (
  select p.id, p.name, parent.name as subregion
  from wine_places p
  join wine_places parent on parent.id = p.primary_parent_id
  where p.kind = 'SITE'
    and p.canonical_key like 'france.champagne.%'
)
insert into wine_designation_members
  (designation_id, member_kind, name, tier, tier_rank, commune,
   wine_place_id, appellation_wine_place_id, local_note, sort_order,
   editorial_status)
select
  d.id,
  -- member_kind is constrained to ESTATE | SITE; a Champagne cru is a place,
  -- not a producer, so it is a SITE (as the Alsace grand crus are).
  'SITE',
  v.name,
  case when g.name is not null then 'Grand Cru' else 'Premier Cru' end,
  case when g.name is not null then 0 else 1 end,
  v.subregion,
  v.id,
  v.id,
  case
    when v.name = 'Chouilly' then 'Grand Cru for Chardonnay; Pinot Noir here is rated Premier Cru.'
    when v.name = 'Tours-sur-Marne' then 'Grand Cru for Pinot Noir; Chardonnay here is rated Premier Cru.'
    else null
  end,
  row_number() over (order by case when g.name is not null then 0 else 1 end, v.name),
  'PUBLISHED'
from village v
cross join d
left join grand_cru g on g.name = v.name
where not exists (
  select 1 from wine_designation_members m
  where m.designation_id = d.id and m.name = v.name
);
