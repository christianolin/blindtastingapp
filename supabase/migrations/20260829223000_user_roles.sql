-- User roles: ADMIN (curator powers + the new admin sections) and MEMBER (the
-- default). Introduced alongside the existing profiles.is_curator boolean, which
-- is kept mirrored from role by a trigger so every existing curator RLS policy
-- keeps working unchanged. Existing curators are backfilled to ADMIN.

do $$
begin
  if to_regtype('public.user_role') is null then
    create type user_role as enum ('ADMIN', 'MEMBER');
  end if;
end $$;

alter table profiles add column if not exists role user_role not null default 'MEMBER';

-- Backfill before the sync trigger exists: existing curators become admins.
update profiles set role = 'ADMIN' where is_curator and role <> 'ADMIN';

-- Keep is_curator mirrored from role, so granting/revoking ADMIN via the new
-- role automatically toggles the legacy curator flag the older policies read.
create or replace function sync_is_curator_from_role()
returns trigger language plpgsql as $$
begin
  new.is_curator := (new.role = 'ADMIN');
  return new;
end $$;

drop trigger if exists profiles_sync_is_curator on profiles;
create trigger profiles_sync_is_curator
  before insert or update of role on profiles
  for each row execute function sync_is_curator_from_role();

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then raise exception 'final-state: profiles.role missing'; end if;
  if to_regtype('public.user_role') is null then
    raise exception 'final-state: user_role type missing'; end if;
end $$;
