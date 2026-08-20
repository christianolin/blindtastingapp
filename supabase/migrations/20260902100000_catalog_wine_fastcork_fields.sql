-- Structured wine profile fields, mirroring the FastCork /v1/analyze payload.
--
-- The scan used to compose FastCork's prose into the single free-text
-- `description` column. That flattened three distinct things (who the producer
-- is, how the wine smells, how it tastes) into one blob, and made the catalog
-- inconsistent with the source data. Store them as they arrive instead, so
-- every scanned wine carries the same shape and the UI can render real sections.
--
-- `description` is deliberately KEPT: it holds the earlier hand/Claude-written
-- prose and is still the field the manual add-wine form writes. It becomes the
-- fallback shown when a wine has no FastCork profile.

alter table public.catalog_wines
  add column if not exists winery_description text,
  add column if not exists aroma text,
  add column if not exists tasting_notes text,
  add column if not exists food_pairing text,
  add column if not exists serving_temp_min_c smallint,
  add column if not exists serving_temp_max_c smallint,
  add column if not exists decant_minutes smallint,
  add column if not exists alcohol_percent numeric(4, 1);

comment on column public.catalog_wines.winery_description is
  'FastCork winery_description — background on the producer.';
comment on column public.catalog_wines.aroma is
  'FastCork aroma — the wine''s nose.';
comment on column public.catalog_wines.tasting_notes is
  'FastCork tasting_notes — the wine''s palate.';
comment on column public.catalog_wines.food_pairing is
  'FastCork food_pairing — suggested pairings.';
comment on column public.catalog_wines.serving_temp_min_c is
  'FastCork serving_temperature_celcius_range.min_temp, in Celsius.';
comment on column public.catalog_wines.serving_temp_max_c is
  'FastCork serving_temperature_celcius_range.max_temp, in Celsius.';
comment on column public.catalog_wines.decant_minutes is
  'FastCork decanting_time_minutes; 0 means no decanting needed.';
comment on column public.catalog_wines.alcohol_percent is
  'FastCork alc_percentage — stated ABV.';

-- Sanity bands. A bad upstream read should fail loudly rather than render an
-- absurd serving temperature or a 400% ABV.
alter table public.catalog_wines
  drop constraint if exists catalog_wines_serving_temp_range_ck;
alter table public.catalog_wines
  add constraint catalog_wines_serving_temp_range_ck check (
    (serving_temp_min_c is null or serving_temp_min_c between -5 and 30)
    and (serving_temp_max_c is null or serving_temp_max_c between -5 and 30)
    and (
      serving_temp_min_c is null
      or serving_temp_max_c is null
      or serving_temp_min_c <= serving_temp_max_c
    )
  );

alter table public.catalog_wines
  drop constraint if exists catalog_wines_decant_minutes_ck;
alter table public.catalog_wines
  add constraint catalog_wines_decant_minutes_ck check (
    decant_minutes is null or decant_minutes between 0 and 1440
  );

alter table public.catalog_wines
  drop constraint if exists catalog_wines_alcohol_percent_ck;
alter table public.catalog_wines
  add constraint catalog_wines_alcohol_percent_ck check (
    alcohol_percent is null or (alcohol_percent > 0 and alcohol_percent < 100)
  );

do $$
declare
  n int;
begin
  select count(*) into n
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'catalog_wines'
     and column_name in (
       'winery_description', 'aroma', 'tasting_notes', 'food_pairing',
       'serving_temp_min_c', 'serving_temp_max_c', 'decant_minutes',
       'alcohol_percent'
     );
  if n <> 8 then
    raise exception 'expected 8 FastCork profile columns on catalog_wines, found %', n;
  end if;
end $$;
