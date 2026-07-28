-- Make catalog_wines.appellation_id and region_id nullable.
--
-- These FKs were mirrored from wine_answers as NOT NULL, but that is too strict for
-- the WSET catalog: regional wines (e.g. "Bourgogne AOP") have no sub-appellation, and
-- Vin de France / IGP wines have no region at all. Country stays required (a catalogued
-- wine always has a known country of origin).
--
-- Idempotent: ALTER ... DROP NOT NULL on an already-nullable column is a no-op, and the
-- final-state block asserts the end state rather than any row/column delta.

do $$
begin
  alter table public.catalog_wines alter column appellation_id drop not null;
  alter table public.catalog_wines alter column region_id     drop not null;
end $$;

-- Final-state assertions.
do $$
declare
  appellation_nullable text;
  region_nullable      text;
begin
  select is_nullable into appellation_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'catalog_wines'
      and column_name  = 'appellation_id';

  select is_nullable into region_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'catalog_wines'
      and column_name  = 'region_id';

  if appellation_nullable is distinct from 'YES' then
    raise exception 'catalog_wines.appellation_id must be nullable, got %', appellation_nullable;
  end if;
  if region_nullable is distinct from 'YES' then
    raise exception 'catalog_wines.region_id must be nullable, got %', region_nullable;
  end if;
end $$;
