-- wine_name becomes optional. Many wines — especially Burgundy — have no cuvée; the
-- wine IS producer + appellation + vintage, and forcing a name just duplicates the
-- title. Relax NOT NULL and make the bottle-identity index + find_or_create null-safe
-- on wine_name (coalesce blank/NULL to '') so cuvée-less wines still dedup.

alter table catalog_wines alter column wine_name drop not null;

drop index if exists catalog_wines_identity_key;
create unique index catalog_wines_identity_key on catalog_wines (
  producer_id, coalesce(lower(btrim(wine_name)), ''), appellation_id, colour,
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
    and c.producer_id = (p->>'producer_id')::uuid
    and coalesce(lower(btrim(c.wine_name)), '') = coalesce(lower(btrim(p->>'wine_name')), '')
    and c.appellation_id = (p->>'appellation_id')::uuid
    and c.colour = (p->>'colour')::wine_colour
    and c.vintage_kind = (p->>'vintage_kind')::vintage_kind
    and c.vintage_year is not distinct from (p->>'vintage_year')::int
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
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid()
  ) returning id into v_id;
  return v_id;
end $$;

grant execute on function find_or_create_catalog_wine(jsonb) to authenticated;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'catalog_wines' and column_name = 'wine_name' and is_nullable = 'NO'
  ) then
    raise exception 'final-state: catalog_wines.wine_name should be nullable';
  end if;
end $$;
