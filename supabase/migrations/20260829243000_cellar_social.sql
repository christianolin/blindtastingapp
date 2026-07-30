-- Cellar social: let others view your cellar. A per-user visibility toggle plus
-- a SECURITY DEFINER predicate (can_view_cellar) used to broaden the cellar_lots
-- read policy — definer so the profiles/friendships lookups bypass their own RLS.
-- Drink history (cellar_consumptions) stays private.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'cellar_visibility'
  ) then
    create type cellar_visibility as enum ('PRIVATE', 'FRIENDS', 'PUBLIC');
  end if;
end $$;

alter table profiles
  add column if not exists cellar_visibility cellar_visibility not null default 'PRIVATE';

-- True when the caller may view p_owner's cellar. SECURITY DEFINER so it can read
-- p_owner's profile + friendships regardless of their RLS; auth.uid() still
-- resolves to the caller (it reads the request JWT, not the definer role).
create or replace function can_view_cellar(p_owner uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_owner
      and (
        p.cellar_visibility = 'PUBLIC'
        or (
          p.cellar_visibility = 'FRIENDS'
          and exists (
            select 1 from friendships f
            where (f.user_id = p_owner and f.friend_id = auth.uid())
               or (f.user_id = auth.uid() and f.friend_id = p_owner)
          )
        )
      )
  );
$$;
grant execute on function can_view_cellar(uuid) to authenticated;

-- Broaden the owner-only read: own lots, or a cellar you're allowed to view.
drop policy if exists "cellar own select" on cellar_lots;
create policy "cellar own select" on cellar_lots for select to authenticated
  using (owner_id = auth.uid() or can_view_cellar(owner_id));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'cellar_visibility'
  ) then
    raise exception 'final-state: profiles.cellar_visibility missing'; end if;
  if not exists (select 1 from pg_proc where proname = 'can_view_cellar') then
    raise exception 'final-state: can_view_cellar missing'; end if;
end $$;
