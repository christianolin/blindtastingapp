-- Grape blends: N grapes per wine with optional percentages. catalog_wine_grapes
-- is the source of truth; catalog_wines.primary_grape_id / secondary_grape_id
-- stay but become trigger-derived (top two by percentage when any % is set, else
-- first two by sort_order) so blind scoring, answer snapshots and guess stats are
-- completely untouched.

create table if not exists catalog_wine_grapes (
  id uuid primary key default gen_random_uuid(),
  catalog_wine_id uuid not null references catalog_wines(id) on delete cascade,
  grape_id uuid not null references grapes(id) on delete restrict,
  percentage numeric(5,2) check (percentage > 0 and percentage <= 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (catalog_wine_id, grape_id)
);

create index if not exists catalog_wine_grapes_wine_idx
  on catalog_wine_grapes (catalog_wine_id);

alter table catalog_wine_grapes enable row level security;
drop policy if exists "cwg read" on catalog_wine_grapes;
create policy "cwg read" on catalog_wine_grapes for select to authenticated
  using (true);
drop policy if exists "cwg write" on catalog_wine_grapes;
create policy "cwg write" on catalog_wine_grapes for all to authenticated
  using (
    exists (
      select 1 from catalog_wines w
      where w.id = catalog_wine_id
        and (w.created_by = auth.uid()
             or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator))
    )
  )
  with check (
    exists (
      select 1 from catalog_wines w
      where w.id = catalog_wine_id
        and (w.created_by = auth.uid()
             or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator))
    )
  );

-- Derive primary/secondary from the blend rows: percentage'd rows first (highest
-- = primary), else first two by sort_order. Only writes when >=1 grape row
-- exists, so primary_grape_id (NOT NULL) never gets nulled by a transient empty
-- state. SECURITY DEFINER so it can update catalog_wines regardless of that
-- table's insert-only RLS.
create or replace function recompute_catalog_wine_grapes(p_wine uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
begin
  select array(
    select grape_id from catalog_wine_grapes
    where catalog_wine_id = p_wine
    order by (percentage is null) asc, percentage desc nulls last, sort_order asc
  ) into v_ids;
  if array_length(v_ids, 1) >= 1 then
    update catalog_wines
      set primary_grape_id = v_ids[1], secondary_grape_id = v_ids[2]
    where id = p_wine;
  end if;
end $$;

create or replace function tg_recompute_catalog_wine_grapes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform recompute_catalog_wine_grapes(coalesce(new.catalog_wine_id, old.catalog_wine_id));
  return null;
end $$;

drop trigger if exists catalog_wine_grapes_recompute on catalog_wine_grapes;
create trigger catalog_wine_grapes_recompute
  after insert or update or delete on catalog_wine_grapes
  for each row execute function tg_recompute_catalog_wine_grapes();

-- Seed blend rows for every new catalog_wine from the columns the create paths
-- (find_or_create, import, catalog/new) set directly, so new wines get blend
-- rows without touching those RPCs. No loop: recompute UPDATEs catalog_wines but
-- there is no AFTER UPDATE seed.
create or replace function tg_seed_catalog_wine_grapes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order)
    values (new.id, new.primary_grape_id, 0)
    on conflict (catalog_wine_id, grape_id) do nothing;
  if new.secondary_grape_id is not null then
    insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order)
      values (new.id, new.secondary_grape_id, 1)
      on conflict (catalog_wine_id, grape_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists catalog_wines_seed_grapes on catalog_wines;
create trigger catalog_wines_seed_grapes
  after insert on catalog_wines
  for each row execute function tg_seed_catalog_wine_grapes();

-- Backfill existing wines from their current primary/secondary.
insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order)
  select id, primary_grape_id, 0 from catalog_wines
  on conflict (catalog_wine_id, grape_id) do nothing;
insert into catalog_wine_grapes (catalog_wine_id, grape_id, sort_order)
  select id, secondary_grape_id, 1 from catalog_wines where secondary_grape_id is not null
  on conflict (catalog_wine_id, grape_id) do nothing;

do $$
declare v_wines int; v_covered int;
begin
  if to_regclass('public.catalog_wine_grapes') is null then
    raise exception 'final-state: catalog_wine_grapes missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'recompute_catalog_wine_grapes') then
    raise exception 'final-state: recompute_catalog_wine_grapes missing'; end if;
  select count(*) into v_wines from catalog_wines;
  select count(distinct catalog_wine_id) into v_covered from catalog_wine_grapes;
  if v_covered <> v_wines then
    raise exception 'final-state: % of % wines lack blend rows', v_wines - v_covered, v_wines; end if;
  if exists (select 1 from catalog_wines where primary_grape_id is null) then
    raise exception 'final-state: a catalog wine has null primary_grape_id'; end if;
end $$;
