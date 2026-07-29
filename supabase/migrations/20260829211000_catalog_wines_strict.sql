-- P5 Migration B: catalog_wines becomes a fully-identified wine (post-purge), gains the
-- bottle-identity unique index (dedup), and find_or_create is rebuilt on that identity.
--
-- Runs after the event-data purge, so catalog_wines is empty and SET NOT NULL is trivial.

alter table catalog_wines alter column region_id      set not null;
alter table catalog_wines alter column appellation_id set not null;
alter table catalog_wines alter column wine_name       set not null;
alter table catalog_wines alter column vintage_kind    set not null;
alter table catalog_wines alter column colour          set not null;
alter table catalog_wines alter column style           set not null;
-- country_id, primary_grape_id, producer_id are already NOT NULL.

-- Bottle identity = producer + normalised name + appellation + colour + vintage.
-- (grape / secondary grape / type designation are descriptive, not identity.)
create unique index catalog_wines_identity_key on catalog_wines (
  producer_id, lower(btrim(wine_name)), appellation_id, colour,
  vintage_kind, coalesce(vintage_year, -1), coalesce(vintage_tawny_years, -1)
) where merged_into is null;

create or replace function find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  select c.id into v_id
  from catalog_wines c
  where c.merged_into is null
    and c.producer_id             = (p->>'producer_id')::uuid
    and lower(btrim(c.wine_name))  = lower(btrim(p->>'wine_name'))
    and c.appellation_id          = (p->>'appellation_id')::uuid
    and c.colour                  = (p->>'colour')::wine_colour
    and c.vintage_kind            = (p->>'vintage_kind')::vintage_kind
    and c.vintage_year        is not distinct from (p->>'vintage_year')::int
    and c.vintage_tawny_years is not distinct from (p->>'vintage_tawny_years')::int
  limit 1;
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style, p->>'wine_name', auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

grant execute on function find_or_create_catalog_wine(jsonb) to authenticated;

-- final-state assertions
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name='catalog_wines'
      and column_name in ('region_id','appellation_id','wine_name','vintage_kind','colour','style')
      and is_nullable='YES'
  ) then
    raise exception 'final-state: a catalog_wines identity column is still nullable';
  end if;
  if to_regclass('public.catalog_wines_identity_key') is null then
    raise exception 'final-state: catalog_wines_identity_key index missing';
  end if;
end $$;
