-- Catalog curation. catalog_wines were insert-only; now the creator OR a curator
-- may edit them, and every edit is audited. colour/style become nullable because
-- a catalog wine can be born from a blind answer (which carries neither). Also
-- adds the merge tombstone and external-id columns the backbone needs.

do $$
begin
  if to_regtype('public.external_wine_source') is null then
    create type external_wine_source as enum ('MANUAL', 'LWIN');
  end if;
end $$;

alter table profiles add column if not exists is_curator boolean not null default false;

alter table catalog_wines alter column colour drop not null;
alter table catalog_wines alter column style drop not null;
alter table catalog_wines add column if not exists merged_into uuid references catalog_wines(id) on delete set null;
alter table catalog_wines add column if not exists lwin_code text;
alter table catalog_wines add column if not exists external_source external_wine_source not null default 'MANUAL';
alter table catalog_wines add column if not exists updated_at timestamptz not null default now();

drop trigger if exists catalog_wines_set_updated_at on catalog_wines;
create trigger catalog_wines_set_updated_at
  before update on catalog_wines
  for each row execute function set_updated_at();

create table if not exists catalog_wine_edits (
  id uuid primary key default gen_random_uuid(),
  catalog_wine_id uuid not null references catalog_wines(id) on delete cascade,
  editor_id uuid references profiles(id) on delete set null,
  edited_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb not null
);
alter table catalog_wine_edits enable row level security;
drop policy if exists "catalog edits read" on catalog_wine_edits;
create policy "catalog edits read" on catalog_wine_edits for select to authenticated using (true);
-- No insert policy: rows are written only by the SECURITY DEFINER audit trigger.

-- Editing: creator or curator. (Adds a 3rd policy alongside read + insert.)
drop policy if exists "catalog update" on catalog_wines;
create policy "catalog update" on catalog_wines for update to authenticated
  using (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
  )
  with check (
    created_by = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
  );

create or replace function audit_catalog_wine_edit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into catalog_wine_edits (catalog_wine_id, editor_id, before, after)
  values (new.id, auth.uid(), to_jsonb(old), to_jsonb(new));
  return new;
end $$;

drop trigger if exists catalog_wines_audit on catalog_wines;
create trigger catalog_wines_audit
  after update on catalog_wines
  for each row execute function audit_catalog_wine_edit();

-- Final-state asserts.
do $$
declare v_pol int;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_curator'
  ) then raise exception 'final-state: profiles.is_curator missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'catalog_wines'
      and column_name = 'colour' and is_nullable = 'YES'
  ) then raise exception 'final-state: catalog_wines.colour must be nullable'; end if;
  if to_regclass('public.catalog_wine_edits') is null then
    raise exception 'final-state: catalog_wine_edits table missing'; end if;
  select count(*) into v_pol from pg_policies
    where schemaname = 'public' and tablename = 'catalog_wines';
  if v_pol <> 3 then
    raise exception 'final-state: expected 3 catalog_wines policies, found %', v_pol; end if;
end $$;
