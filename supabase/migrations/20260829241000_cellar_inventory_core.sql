-- Cellar inventory core: per-user bottle lots over the shared catalog identity.
alter table profiles add column if not exists preferred_currency text not null default 'DKK';

create table if not exists cellar_lots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  catalog_wine_id uuid not null references catalog_wines(id) on delete restrict,
  bottle_size_ml int not null default 750 check (bottle_size_ml > 0),
  quantity int not null check (quantity >= 0),
  purchased_quantity int not null check (purchased_quantity >= 1),
  price_per_bottle numeric(10,2) check (price_per_bottle >= 0),
  currency text not null default 'DKK',
  purchased_on date,
  purchase_source text,
  drink_from int,
  drink_to int,
  storage_location text,
  lot_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cellar_lots_drink_window
    check (drink_from is null or drink_to is null or drink_to >= drink_from)
);

create index if not exists cellar_lots_owner_idx on cellar_lots (owner_id);
create index if not exists cellar_lots_wine_idx on cellar_lots (catalog_wine_id);

drop trigger if exists cellar_lots_set_updated_at on cellar_lots;
create trigger cellar_lots_set_updated_at before update on cellar_lots
  for each row execute function set_updated_at();

alter table cellar_lots enable row level security;
drop policy if exists "cellar own select" on cellar_lots;
create policy "cellar own select" on cellar_lots for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "cellar own insert" on cellar_lots;
create policy "cellar own insert" on cellar_lots for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "cellar own update" on cellar_lots;
create policy "cellar own update" on cellar_lots for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "cellar own delete" on cellar_lots;
create policy "cellar own delete" on cellar_lots for delete to authenticated
  using (owner_id = auth.uid());

-- add_cellar_lot: resolve/create the catalog identity, insert a lot for the caller.
-- SECURITY INVOKER so auth.uid() is the caller and RLS applies to both writes.
create or replace function add_cellar_lot(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_wine uuid;
  v_qty int := coalesce((p->>'quantity')::int, 1);
  v_currency text;
  v_lot uuid;
begin
  v_wine := nullif(p->>'catalog_wine_id','')::uuid;
  if v_wine is null then
    v_wine := find_or_create_catalog_wine(p);
  end if;
  select coalesce(nullif(p->>'currency',''), preferred_currency, 'DKK')
    into v_currency from profiles where id = auth.uid();
  insert into cellar_lots (
    owner_id, catalog_wine_id, bottle_size_ml, quantity, purchased_quantity,
    price_per_bottle, currency, purchased_on, purchase_source,
    drink_from, drink_to, storage_location, lot_note
  ) values (
    auth.uid(), v_wine, coalesce((p->>'bottle_size_ml')::int, 750),
    v_qty, v_qty,
    nullif(p->>'price_per_bottle','')::numeric, coalesce(v_currency, 'DKK'),
    nullif(p->>'purchased_on','')::date, nullif(p->>'purchase_source',''),
    nullif(p->>'drink_from','')::int, nullif(p->>'drink_to','')::int,
    nullif(p->>'storage_location',''), nullif(p->>'lot_note','')
  ) returning id into v_lot;
  return v_lot;
end $$;
grant execute on function add_cellar_lot(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.cellar_lots') is null then
    raise exception 'final-state: cellar_lots missing'; end if;
  if not exists (select 1 from information_schema.columns
    where table_name='profiles' and column_name='preferred_currency') then
    raise exception 'final-state: profiles.preferred_currency missing'; end if;
  if (select count(*) from pg_policies where tablename='cellar_lots') <> 4 then
    raise exception 'final-state: expected 4 cellar_lots policies'; end if;
  if not exists (select 1 from pg_proc where proname='add_cellar_lot') then
    raise exception 'final-state: add_cellar_lot missing'; end if;
end $$;
