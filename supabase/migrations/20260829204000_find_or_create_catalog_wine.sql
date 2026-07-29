-- find_or_create_catalog_wine: resolve a blind-answer snapshot to a single
-- catalog wine, creating one if none matches. Used by the add-wine action so
-- every new answer links immediately. Identity = the answer FK tuple + vintage
-- (null-safe); colour/style/cuvee are non-identity attributes set on create.
--
-- Prereq: catalog_wines.vintage_kind must allow null (a vintage-less answer),
-- mirroring wine_answers (20260807090000). Relax it here.

alter table catalog_wines alter column vintage_kind drop not null;
alter table catalog_wines drop constraint if exists catalog_wines_vintage_shape;
alter table catalog_wines add constraint catalog_wines_vintage_shape check (
  (vintage_kind = 'YEAR'  and vintage_year is not null and vintage_tawny_years is null) or
  (vintage_kind = 'NV'    and vintage_year is null     and vintage_tawny_years is null) or
  (vintage_kind = 'TAWNY' and vintage_tawny_years is not null and vintage_year is null) or
  (vintage_kind is null   and vintage_year is null     and vintage_tawny_years is null)
);

create or replace function find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from catalog_wines c
  where c.merged_into is null
    and c.country_id          is not distinct from (p->>'country_id')::uuid
    and c.region_id           is not distinct from (p->>'region_id')::uuid
    and c.appellation_id      is not distinct from (p->>'appellation_id')::uuid
    and c.primary_grape_id    is not distinct from (p->>'primary_grape_id')::uuid
    and c.secondary_grape_id  is not distinct from (p->>'secondary_grape_id')::uuid
    and c.producer_id         is not distinct from (p->>'producer_id')::uuid
    and c.type_designation_id is not distinct from (p->>'type_designation_id')::uuid
    and c.vintage_kind        is not distinct from (p->>'vintage_kind')::vintage_kind
    and c.vintage_year        is not distinct from (p->>'vintage_year')::int
    and c.vintage_tawny_years is not distinct from (p->>'vintage_tawny_years')::int
  order by c.created_at
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, cuvee, created_by
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style, p->>'cuvee', auth.uid()
  )
  returning id into v_id;
  return v_id;
end $$;

grant execute on function find_or_create_catalog_wine(jsonb) to authenticated;

do $$
begin
  if not exists (select 1 from pg_proc where proname = 'find_or_create_catalog_wine') then
    raise exception 'final-state: find_or_create_catalog_wine missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'catalog_wines'
      and column_name = 'vintage_kind' and is_nullable = 'YES'
  ) then raise exception 'final-state: catalog_wines.vintage_kind must be nullable'; end if;
end $$;
