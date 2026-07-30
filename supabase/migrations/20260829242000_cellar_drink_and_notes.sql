-- Cellar drink+notes: an append-only log of bottles leaving a lot, decoupled
-- from reviewing (a consumption may carry no note). reason covers drink/gift/loss.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'cellar_consumption_reason'
  ) then
    create type cellar_consumption_reason as enum ('DRANK', 'GIFTED', 'LOST', 'OTHER');
  end if;
end $$;

create table if not exists cellar_consumptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  lot_id uuid references cellar_lots(id) on delete set null,
  catalog_wine_id uuid not null references catalog_wines(id) on delete restrict,
  quantity int not null check (quantity >= 1),
  reason cellar_consumption_reason not null default 'DRANK',
  consumed_on date not null default (now() at time zone 'utc')::date,
  occasion text,
  wset_note_id uuid references wset_notes(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cellar_consumptions_owner_idx
  on cellar_consumptions (owner_id, consumed_on desc);
create index if not exists cellar_consumptions_lot_idx
  on cellar_consumptions (lot_id);

alter table cellar_consumptions enable row level security;
drop policy if exists "consumptions own select" on cellar_consumptions;
create policy "consumptions own select" on cellar_consumptions for select to authenticated
  using (owner_id = auth.uid());
drop policy if exists "consumptions own insert" on cellar_consumptions;
create policy "consumptions own insert" on cellar_consumptions for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists "consumptions own update" on cellar_consumptions;
create policy "consumptions own update" on cellar_consumptions for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "consumptions own delete" on cellar_consumptions;
create policy "consumptions own delete" on cellar_consumptions for delete to authenticated
  using (owner_id = auth.uid());

-- consume_cellar_lot: decrement a lot and log the removal, atomically. SECURITY
-- INVOKER so auth.uid() is the caller and RLS applies to both writes.
create or replace function consume_cellar_lot(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_lot cellar_lots;
  v_qty int := coalesce((p->>'quantity')::int, 1);
  v_id uuid;
begin
  select * into v_lot from cellar_lots where id = (p->>'lot_id')::uuid;
  if v_lot.id is null then raise exception 'lot not found'; end if;
  if v_lot.owner_id <> auth.uid() then raise exception 'not your lot'; end if;
  if v_qty < 1 then raise exception 'quantity must be at least 1'; end if;
  if v_qty > v_lot.quantity then
    raise exception 'only % left in this lot', v_lot.quantity;
  end if;

  update cellar_lots set quantity = quantity - v_qty where id = v_lot.id;

  insert into cellar_consumptions (
    owner_id, lot_id, catalog_wine_id, quantity, reason, consumed_on, occasion, wset_note_id
  ) values (
    auth.uid(), v_lot.id, v_lot.catalog_wine_id, v_qty,
    coalesce(nullif(p->>'reason', '')::cellar_consumption_reason, 'DRANK'),
    coalesce(nullif(p->>'consumed_on', '')::date, (now() at time zone 'utc')::date),
    nullif(p->>'occasion', ''),
    nullif(p->>'wset_note_id', '')::uuid
  ) returning id into v_id;
  return v_id;
end $$;
grant execute on function consume_cellar_lot(jsonb) to authenticated;

do $$
begin
  if to_regclass('public.cellar_consumptions') is null then
    raise exception 'final-state: cellar_consumptions missing'; end if;
  if not exists (select 1 from pg_type where typname = 'cellar_consumption_reason') then
    raise exception 'final-state: cellar_consumption_reason enum missing'; end if;
  if (select count(*) from pg_policies where tablename = 'cellar_consumptions') <> 4 then
    raise exception 'final-state: expected 4 cellar_consumptions policies'; end if;
  if not exists (select 1 from pg_proc where proname = 'consume_cellar_lot') then
    raise exception 'final-state: consume_cellar_lot missing'; end if;
end $$;
