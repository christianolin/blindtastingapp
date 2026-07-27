-- Cellar catalog: user-curated wines that exist independently of any
-- tasting. Entries are immutable once created (insert-only RLS below);
-- blind-tasting wines can point at a catalog entry via
-- wines.catalog_wine_id so a reveal can land in the taster's cellar.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'wine_colour'
  ) then
    create type wine_colour as enum ('WHITE', 'ROSE', 'RED');
  end if;
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'wine_style'
  ) then
    create type wine_style as enum ('STILL', 'SPARKLING', 'FORTIFIED');
  end if;
end $$;

create table if not exists catalog_wines (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references countries(id) on delete restrict,
  region_id uuid not null references regions(id) on delete restrict,
  appellation_id uuid not null references appellations(id) on delete restrict,
  primary_grape_id uuid not null references grapes(id) on delete restrict,
  secondary_grape_id uuid references grapes(id) on delete restrict,
  producer_id uuid not null references producers(id) on delete restrict,
  type_designation_id uuid references type_designations(id) on delete restrict,
  vintage_kind vintage_kind not null,
  vintage_year int,
  vintage_tawny_years int,
  colour wine_colour not null,
  style wine_style not null,
  cuvee text,
  bottle_size_ml int not null default 750,
  created_by uuid not null references profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint catalog_wines_vintage_shape check (
    (vintage_kind = 'YEAR' and vintage_year is not null and vintage_tawny_years is null) or
    (vintage_kind = 'NV' and vintage_year is null and vintage_tawny_years is null) or
    (vintage_kind = 'TAWNY' and vintage_tawny_years is not null and vintage_year is null)
  )
);

alter table wines add column if not exists catalog_wine_id uuid references catalog_wines(id) on delete set null;

alter table catalog_wines enable row level security;

-- Insert-only by design: no update/delete policies — catalog entries are
-- immutable (WSET notes and ratings will hang off stable rows).
drop policy if exists "catalog read" on catalog_wines;
create policy "catalog read" on catalog_wines for select to authenticated using (true);
drop policy if exists "catalog insert" on catalog_wines;
create policy "catalog insert" on catalog_wines for insert to authenticated
  with check (created_by = auth.uid());

-- Final-state asserts.
do $$
declare
  v_policies int;
begin
  if to_regclass('public.catalog_wines') is null then
    raise exception 'final-state: catalog_wines table missing';
  end if;
  select count(*) into v_policies
  from pg_policies
  where schemaname = 'public' and tablename = 'catalog_wines';
  if v_policies <> 2 then
    raise exception 'final-state: expected 2 catalog_wines policies, found %', v_policies;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wines'
      and column_name = 'catalog_wine_id'
  ) then
    raise exception 'final-state: wines.catalog_wine_id missing';
  end if;
end $$;
