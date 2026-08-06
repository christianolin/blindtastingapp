-- Let profiles exist without a GoTrue user.
--
-- Ordering fix. The plan put every cutover step in one late migration, but our
-- own signup (20260829... Task 8) inserts a profile with a UUID we generate,
-- and `profiles_id_fkey` requires a matching auth.users row — so signing up
-- failed with 23503 the moment GoTrue stopped creating those rows for us.
--
-- Dropping a foreign key is additive: no existing row changes, nothing that
-- worked stops working, and the later backfill still joins profiles to
-- auth.users perfectly well. The rest of the cutover — retiring the
-- on_auth_user_created trigger, backfilling credentials, deleting orphaned
-- auth.users — stays where it was.
alter table profiles drop constraint if exists profiles_id_fkey;

-- The trigger is deliberately left alone. It only fires on inserts into
-- auth.users, and nothing creates those any more; retiring it belongs with the
-- rest of the cutover, where it can be asserted against a final state.

do $$
begin
  if exists (
    select 1
      from information_schema.table_constraints
     where table_schema = 'public'
       and table_name = 'profiles'
       and constraint_name = 'profiles_id_fkey'
  ) then
    raise exception 'profiles is still bound to auth.users';
  end if;

  -- Prove the point rather than assert the absence: a profile with no
  -- auth.users row must now insert. Rolled back within this DO block.
  begin
    insert into profiles (id, display_name, email)
    values ('00000000-0000-0000-0000-0000000000f0', 'FK probe', 'fk-probe@blindr.invalid');
    delete from profiles where id = '00000000-0000-0000-0000-0000000000f0';
  exception
    when foreign_key_violation then
      raise exception 'a profile without an auth.users row is still rejected';
  end;
end;
$$;
