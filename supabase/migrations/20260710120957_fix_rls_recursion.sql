-- The "tastings read" and "participants read" policies each subquery the
-- other table directly, so Postgres re-evaluates both tables' RLS in a loop
-- ("infinite recursion detected in policy for relation \"tastings\"").
-- Fix: SECURITY DEFINER helper functions bypass RLS internally (they run as
-- the function owner, which isn't subject to RLS unless FORCE ROW LEVEL
-- SECURITY is set), breaking the cycle.

create function is_tasting_host(p_tasting_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from tastings t where t.id = p_tasting_id and t.host_id = auth.uid()
  );
$$;

create function is_tasting_participant(p_tasting_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from tasting_participants p
    where p.tasting_id = p_tasting_id and p.user_id = auth.uid()
  );
$$;

grant execute on function is_tasting_host(uuid) to authenticated;
grant execute on function is_tasting_participant(uuid) to authenticated;

drop policy "tastings read" on tastings;
create policy "tastings read" on tastings for select to authenticated using (
  host_id = auth.uid() or is_tasting_participant(id)
);

drop policy "participants read" on tasting_participants;
create policy "participants read" on tasting_participants for select to authenticated using (
  user_id = auth.uid() or is_tasting_host(tasting_id)
);

drop policy "participants insert host" on tasting_participants;
create policy "participants insert host" on tasting_participants for insert to authenticated
  with check (is_tasting_host(tasting_id));

drop policy "participants update own or host" on tasting_participants;
create policy "participants update own or host" on tasting_participants for update to authenticated
  using (user_id = auth.uid() or is_tasting_host(tasting_id))
  with check (user_id = auth.uid() or is_tasting_host(tasting_id));

drop policy "participants delete host" on tasting_participants;
create policy "participants delete host" on tasting_participants for delete to authenticated
  using (is_tasting_host(tasting_id));
