-- Pin every tasting_participants row to its tasting and its user
-- (GUEST-34, blind-tasting ledger B13.2).
--
-- The hole. "participants update own or host" (20260710120957, read live
-- 2026-09-12) is
--   USING      ((user_id = auth.uid()) OR is_tasting_host(tasting_id))
--   WITH CHECK ((user_id = auth.uid()) OR is_tasting_host(tasting_id))
-- and authenticated holds UPDATE on every column. Neither clause looks at
-- the OLD row's tasting, so a row can be re-pointed. The only brake is that
-- an UPDATE which reads the table (WHERE or RETURNING; every PostgREST PATCH,
-- as authenticator preloads safeupdate) must leave a NEW row that some SELECT
-- policy admits. Probed before this migration, that still lets:
--   * a participant (INVITED, JOINED or DECLINED) move their own row into
--     any tasting with a revealed wine (every running tasting after its
--     first reveal), because "participants of tastings with revealed wines
--     are public" admits the new row. The moved row passes
--     is_tasting_participant(): the mover reads that tasting's roster and
--     wines and a SEMI_BLIND tasting's still-hidden answer keys, and can set
--     themselves JOINED to guess. No invite, join code or host needed.
--   * an UPDATE with no WHERE or RETURNING (any SQL path running as
--     authenticated) move a participant's row into any tasting at all.
--   * a host move a guest's row into another tasting they host, or re-point
--     its user_id at anyone, handing that guest's guesses and brought wine
--     to someone else.
--
-- The fix. A BEFORE UPDATE row trigger refuses any change to tasting_id or
-- user_id, for every role. Nothing legitimate changes them:
--   * respondToInvite (and the planned leaveTasting) PATCH status/joined_at;
--   * join_tasting_by_code's ON CONFLICT DO UPDATE sets status/joined_at
--     only (the trigger fires there and passes);
--   * both FKs are ON DELETE CASCADE with no ON UPDATE action.
-- Being in another tasting means a new row (host insert or join code), never
-- a moved one. Policies are untouched.
--
-- Deliberately not BEFORE UPDATE OF tasting_id, user_id: a column-list
-- trigger fires only when the statement names the column, so a value changed
-- by another BEFORE trigger would slip past. IS DISTINCT FROM lets a PATCH
-- that restates the same ids through. SQLSTATE 42501 is what an RLS WITH
-- CHECK failure raises, so PostgREST answers 403 either way.

create or replace function public.pin_tasting_participant_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tasting_id is distinct from old.tasting_id then
    raise exception 'a participant row cannot move to another tasting'
      using errcode = 'insufficient_privilege',
            hint = 'Add a participant row to the other tasting instead.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'a participant row cannot change hands'
      using errcode = 'insufficient_privilege',
            hint = 'Add a participant row for that person instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists tasting_participants_pin_identity on public.tasting_participants;
create trigger tasting_participants_pin_identity
  before update on public.tasting_participants
  for each row execute function public.pin_tasting_participant_identity();

-- Same-transaction assertions (never trust "version recorded").
do $$
declare
  v_bad text;
begin
  -- 1. The trigger exists, is enabled, and is BEFORE UPDATE FOR EACH ROW on
  --    all columns: tgtype 19 = ROW (1) | BEFORE (2) | UPDATE (16), and an
  --    empty tgattr (no column list).
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.tasting_participants'::regclass
      and t.tgname = 'tasting_participants_pin_identity'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgtype = 19
      and cardinality(t.tgattr::int2[]) = 0
      and t.tgfoid = 'public.pin_tasting_participant_identity()'::regprocedure
  ) then
    raise exception 'tasting_participants_pin_identity is missing, disabled or mis-shaped post-migration';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_language l on l.oid = p.prolang
    where p.oid = 'public.pin_tasting_participant_identity()'::regprocedure
      and l.lanname = 'plpgsql'
      and not p.prosecdef
      and p.proconfig @> array['search_path=public']
  ) then
    raise exception 'pin_tasting_participant_identity is not a SECURITY INVOKER plpgsql function with a pinned search_path';
  end if;

  -- 2. RLS is still on and the policies are exactly the ones read live before
  --    this migration (public. stripped so a different search_path at deparse
  --    time cannot fail the comparison).
  if not (select c.relrowsecurity from pg_class c
          where c.oid = 'public.tasting_participants'::regclass) then
    raise exception 'row level security is off on tasting_participants post-migration';
  end if;

  with expected (policyname, permissive, roles, cmd, qual, with_check) as (
    values
      ('participants delete host', 'PERMISSIVE', '{authenticated}', 'DELETE',
        'is_tasting_host(tasting_id)', null),
      ('participants insert host', 'PERMISSIVE', '{authenticated}', 'INSERT',
        null, 'is_tasting_host(tasting_id)'),
      ('participants of tastings with revealed wines are public', 'PERMISSIVE', '{authenticated}', 'SELECT',
        'tasting_has_revealed_wine(tasting_id)', null),
      ('participants read', 'PERMISSIVE', '{authenticated}', 'SELECT',
        '(is_tasting_host(tasting_id) OR is_tasting_participant(tasting_id))', null),
      ('participants update own or host', 'PERMISSIVE', '{authenticated}', 'UPDATE',
        '((user_id = auth.uid()) OR is_tasting_host(tasting_id))',
        '((user_id = auth.uid()) OR is_tasting_host(tasting_id))')
  ),
  live as (
    select pol.policyname::text as policyname,
           pol.permissive,
           pol.roles::text as roles,
           pol.cmd,
           replace(pol.qual, 'public.', '') as qual,
           replace(pol.with_check, 'public.', '') as with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'tasting_participants'
  )
  select string_agg(coalesce(e.policyname, l.policyname), '; ') into v_bad
  from expected e
  full join live l on l.policyname = e.policyname
  where e.policyname is null
     or l.policyname is null
     or l.permissive is distinct from e.permissive
     or l.roles is distinct from e.roles
     or l.cmd is distinct from e.cmd
     or l.qual is distinct from e.qual
     or l.with_check is distinct from e.with_check;
  if v_bad is not null then
    raise exception 'tasting_participants policies differ from the reviewed live set: %', v_bad;
  end if;
end $$;
