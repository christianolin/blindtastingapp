-- Make type_designations scalable while staying a single table: group each
-- designation by category, optionally tie it to a country/region (for
-- prioritising the taster's chosen origin without hiding the rest), and carry
-- a sort order + active flag. Then seed the comprehensive set of official
-- designations used in blind-tasting competitions (Danish Championship / WBTC).
alter table type_designations
  add column if not exists category text,
  add column if not exists country_id uuid references countries(id) on delete set null,
  add column if not exists region_id uuid references regions(id) on delete set null,
  add column if not exists sort_order int not null default 0,
  add column if not exists is_active boolean not null default true;

-- Upsert by name (unique) so the ~18 existing rows are updated in place —
-- keeping their ids, so wine_answers/guesses FK references stay valid — and
-- the rest are inserted. country/region are resolved by name; a null stays
-- null (e.g. sparkling dosages are universal).
insert into type_designations (name, category, country_id, region_id, sort_order, is_active)
select
  s.name,
  s.category,
  (select id from countries c where c.name = s.country_name),
  (
    select id from regions r
    where r.name = s.region_name
      and r.country_id = (select id from countries c2 where c2.name = s.country_name)
  ),
  s.sort_order,
  true
from (
  values
    -- Prädikat (German ripeness scale)
    ('Kabinett', 'Prädikat', 'Germany', null::text, 1),
    ('Spätlese', 'Prädikat', 'Germany', null, 2),
    ('Auslese', 'Prädikat', 'Germany', null, 3),
    ('Beerenauslese (BA)', 'Prädikat', 'Germany', null, 4),
    ('Trockenbeerenauslese (TBA)', 'Prädikat', 'Germany', null, 5),
    ('Eiswein', 'Prädikat', 'Germany', null, 6),
    -- Quality Classification
    ('Grosses Gewächs (GG)', 'Quality Classification', 'Germany', null, 7),
    ('Erste Lage', 'Quality Classification', 'Germany', null, 8),
    ('1. Lage', 'Quality Classification', 'Germany', null, 9),
    ('Grand Cru', 'Quality Classification', 'France', null, 10),
    ('Premier Cru', 'Quality Classification', 'France', null, 11),
    ('Grand Cru Classé', 'Quality Classification', 'France', 'Bordeaux', 12),
    ('Premier Grand Cru Classé', 'Quality Classification', 'France', 'Bordeaux', 13),
    ('Cru Bourgeois', 'Quality Classification', 'France', 'Bordeaux', 14),
    ('Cru Artisan', 'Quality Classification', 'France', 'Bordeaux', 15),
    ('Cru Exceptionnel', 'Quality Classification', 'France', 'Bordeaux', 16),
    ('Gutswein', 'Quality Classification', 'Germany', null, 17),
    ('Ortswein', 'Quality Classification', 'Germany', null, 18),
    ('Smaragd', 'Quality Classification', 'Austria', 'Wachau', 19),
    ('Federspiel', 'Quality Classification', 'Austria', 'Wachau', 20),
    ('Steinfeder', 'Quality Classification', 'Austria', 'Wachau', 21),
    -- Aging Classification
    ('Crianza', 'Aging Classification', 'Spain', null, 22),
    ('Reserva', 'Aging Classification', 'Spain', null, 23),
    ('Gran Reserva', 'Aging Classification', 'Spain', null, 24),
    ('Riserva', 'Aging Classification', 'Italy', null, 25),
    ('Superiore', 'Aging Classification', 'Italy', null, 26),
    ('Vendange Tardive', 'Aging Classification', 'France', 'Alsace', 27),
    ('Sélection de Grains Nobles', 'Aging Classification', 'France', 'Alsace', 28),
    ('Late Bottled Vintage (LBV)', 'Aging Classification', 'Portugal', 'Douro', 29),
    ('Vintage Port', 'Aging Classification', 'Portugal', 'Douro', 30),
    ('Colheita', 'Aging Classification', 'Portugal', 'Douro', 31),
    ('Novello', 'Aging Classification', 'Italy', null, 32),
    -- Sparkling Dosage (universal — no country)
    ('Brut Nature', 'Sparkling Dosage', null, null, 33),
    ('Extra Brut', 'Sparkling Dosage', null, null, 34),
    ('Brut', 'Sparkling Dosage', null, null, 35),
    ('Extra Dry', 'Sparkling Dosage', null, null, 36),
    ('Sec', 'Sparkling Dosage', null, null, 37),
    ('Demi-Sec', 'Sparkling Dosage', null, null, 38),
    ('Doux', 'Sparkling Dosage', null, null, 39),
    -- Fortified Style
    ('Fino', 'Fortified Style', 'Spain', 'Jerez', 40),
    ('Manzanilla', 'Fortified Style', 'Spain', 'Jerez', 41),
    ('Amontillado', 'Fortified Style', 'Spain', 'Jerez', 42),
    ('Oloroso', 'Fortified Style', 'Spain', 'Jerez', 43),
    ('Palo Cortado', 'Fortified Style', 'Spain', 'Jerez', 44),
    ('Pedro Ximénez', 'Fortified Style', 'Spain', 'Jerez', 45),
    ('Ruby', 'Fortified Style', 'Portugal', 'Douro', 46),
    ('Tawny', 'Fortified Style', 'Portugal', 'Douro', 47),
    -- Sweetness (still-wine German scale)
    ('Trocken', 'Sweetness', 'Germany', null, 48),
    ('Halbtrocken', 'Sweetness', 'Germany', null, 49),
    ('Feinherb', 'Sweetness', 'Germany', null, 50)
) as s(name, category, country_name, region_name, sort_order)
on conflict (name) do update set
  category = excluded.category,
  country_id = excluded.country_id,
  region_id = excluded.region_id,
  sort_order = excluded.sort_order,
  is_active = true;

create index if not exists type_designations_sort_idx
  on type_designations (sort_order);
