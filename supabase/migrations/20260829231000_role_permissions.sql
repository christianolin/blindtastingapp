-- Wire up the three-tier roles. Curator powers (is_curator — gates catalog edits,
-- knowledge content and archetype writes) now belong to CONTRIBUTOR and ADMIN;
-- archetype-placement writes widen to both. Changing a user's role stays
-- ADMIN-only, via a SECURITY DEFINER RPC (the only way to edit another profile).

create or replace function sync_is_curator_from_role()
returns trigger language plpgsql as $$
begin
  new.is_curator := (new.role in ('ADMIN', 'CONTRIBUTOR'));
  return new;
end $$;

-- Re-assert is_curator for existing rows against the widened rule.
update profiles set is_curator = (role in ('ADMIN', 'CONTRIBUTOR'))
where is_curator is distinct from (role in ('ADMIN', 'CONTRIBUTOR'));

-- Archetype placements: contributors + admins may edit.
drop policy if exists "archetype placements write" on wine_archetype_placements;
create policy "archetype placements write" on wine_archetype_placements for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN', 'CONTRIBUTOR')))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('ADMIN', 'CONTRIBUTOR')));

-- Role changes are ADMIN-only. SECURITY DEFINER so an admin can update another
-- profile (RLS otherwise limits profile writes to self); guards the caller and
-- prevents an admin locking themselves out by self-demotion.
create or replace function admin_set_user_role(p_user_id uuid, p_role user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN') then
    raise exception 'Only admins can change roles';
  end if;
  if p_user_id = auth.uid() and p_role <> 'ADMIN' then
    raise exception 'You cannot remove your own admin role';
  end if;
  update profiles set role = p_role where id = p_user_id;
end $$;
revoke execute on function admin_set_user_role(uuid, user_role) from public, anon;
grant execute on function admin_set_user_role(uuid, user_role) to authenticated;

do $$
begin
  if to_regprocedure('public.admin_set_user_role(uuid, user_role)') is null then
    raise exception 'final-state: admin_set_user_role missing';
  end if;
end $$;
