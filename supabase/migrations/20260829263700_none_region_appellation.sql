-- Sentinel "None" region + appellation per country.
--
-- catalog_wines.region_id and .appellation_id are NOT NULL, so a wine sold with
-- no geographic indication (Vin de France, Vino d'Italia, Deutscher Wein, plain
-- table wine) was simply unrepresentable: the add form let you clear the
-- appellation, then the insert failed. Rather than make the columns nullable —
-- which would push a null check into every read path — every country gets one
-- "None" region holding one "None" appellation, so the value is explicit and
-- the joins stay simple.
insert into regions (country_id, name)
select c.id, 'None'
from countries c
on conflict (country_id, name) do nothing;

insert into appellations (region_id, name)
select r.id, 'None'
from regions r
where r.name = 'None'
on conflict (region_id, name) do nothing;
