-- Bottles per person (owner request 2026-10-25): in a bring-your-own tasting
-- (wine_source = 'PARTICIPANT_CONTRIBUTED') the host may cap how many glasses
-- each participant contributes: 1, 2, 3, or unlimited (null).
--
-- 1. tastings.bottles_per_person smallint, nullable, check 1..3. Null means
--    unlimited, so every existing tasting keeps today's behaviour (no backfill).
--    The host writes it through the existing "tastings update host" policy and
--    the table-level grant (no column ACL on tastings), exactly like paused_at.
--    It is changeable at any time: tastings_lock_setup_after_start is NOT
--    touched and does not list this column (asserted below). Lowering it never
--    removes a glass; it only refuses new ones.
-- 2. wines_bottles_per_person_limit (BEFORE INSERT on wines, SECURITY DEFINER):
--    a glass with a contributor is refused once that contributor already has
--    bottles_per_person contributor glasses (added_by_host = false) in the
--    tasting. Host-added glasses (no contributor) are never counted or refused.
--    It reads the tasting row FOR SHARE by id (the same pattern as
--    wines_semi_blind_flight_locked), and takes a transaction advisory lock per
--    contributor so two overlapping adds by one person cannot both pass the
--    count. Applies to every role (service_role writes no contributor glasses).
--    Error: SQLSTATE 23514 (check_violation), message starting
--    'bottle limit reached', which the app maps to friendly copy
--    (src/lib/bottle-limit.ts, BOTTLE_LIMIT_DB_MARKER).
--    The trigger name sorts before wines_pin_adder; it reads only
--    contributor_participant_id and tasting_id, which wines_pin_adder does not
--    change, so the order does not matter.

do $$
begin
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.tastings'::regclass and a.attname = 'bottles_per_person' and not a.attisdropped)
     or to_regprocedure('public.wines_bottles_per_person_limit()') is not null then
    raise exception 'an object of 20261025120000_tasting_bottles_per_person already exists';
  end if;
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host'
                   and a.atttypid = 'boolean'::regtype and a.attnotnull and not a.attisdropped) then
    raise exception 'wines.added_by_host is missing: apply 20260914095500 (M6) first';
  end if;
end $$;

alter table public.tastings
  add column bottles_per_person smallint
  constraint tastings_bottles_per_person_range check (bottles_per_person between 1 and 3);

comment on column public.tastings.bottles_per_person is
  'Bring-your-own only: max contributor glasses per participant (1-3); null = unlimited. Enforced by wines_bottles_per_person_limit.';

create or replace function public.wines_bottles_per_person_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit smallint;
  v_source wine_source_mode;
  v_count integer;
begin
  if new.contributor_participant_id is null then
    return new;  -- a host-added glass is never counted or refused
  end if;
  select t.bottles_per_person, t.wine_source into v_limit, v_source
    from tastings t
   where t.id = new.tasting_id
     for share;
  if v_limit is null or v_source is distinct from 'PARTICIPANT_CONTRIBUTED' then
    return new;
  end if;
  -- One contributor's inserts one at a time, so two overlapping adds both see
  -- the other's committed row.
  perform pg_advisory_xact_lock(hashtext('public.wines_bottles_per_person_limit'),
                                hashtext(new.contributor_participant_id::text));
  select count(*) into v_count
    from wines w
   where w.tasting_id = new.tasting_id
     and w.contributor_participant_id = new.contributor_participant_id
     and not w.added_by_host;
  if v_count >= v_limit then
    raise exception 'bottle limit reached: % per person in this tasting', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger wines_bottles_per_person_limit
  before insert on public.wines
  for each row execute function public.wines_bottles_per_person_limit();

-- Runs only as a trigger: no client EXECUTE (M4, M6, M7 and M9b do the same).
revoke all on function public.wines_bottles_per_person_limit() from public, anon, authenticated;

-- Same-transaction assertions.
do $$
declare
  v_text text;
begin
  -- 1. The column: nullable smallint, no default, every existing row null.
  select format('%s %s %s', format_type(a.atttypid, a.atttypmod), a.attnotnull, a.atthasdef)
    into v_text
  from pg_attribute a
  where a.attrelid = 'public.tastings'::regclass and a.attname = 'bottles_per_person' and not a.attisdropped;
  if v_text is distinct from 'smallint f f' then
    raise exception 'tastings.bottles_per_person is not a nullable smallint without default: %', v_text;
  end if;
  if exists (select 1 from public.tastings where bottles_per_person is not null) then
    raise exception 'an existing tasting got a bottle limit';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.tastings'::regclass and c.conname = 'tastings_bottles_per_person_range')
     is distinct from 'CHECK (((bottles_per_person >= 1) AND (bottles_per_person <= 3)))' then
    raise exception 'tastings_bottles_per_person_range is not the expected check';
  end if;

  -- 2. The host can read and write it (table-level grant + "tastings update host").
  if not has_column_privilege('authenticated', 'public.tastings', 'bottles_per_person', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.tastings', 'bottles_per_person', 'INSERT')
     or not has_column_privilege('authenticated', 'public.tastings', 'bottles_per_person', 'SELECT') then
    raise exception 'authenticated cannot insert, select or update tastings.bottles_per_person';
  end if;

  -- 3. The setup lock does not lock it: neither its trigger column list nor its body names it.
  select pg_get_triggerdef(t.oid) into v_text
  from pg_trigger t
  where t.tgrelid = 'public.tastings'::regclass and t.tgname = 'tastings_lock_setup_after_start' and not t.tgisinternal;
  if v_text is null then
    raise exception 'tastings_lock_setup_after_start is missing';
  end if;
  if v_text like '%bottles_per_person%'
     or (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.tastings_lock_setup_after_start()'))
          like '%bottles_per_person%' then
    raise exception 'tastings_lock_setup_after_start locks bottles_per_person';
  end if;

  -- 4. The trigger: BEFORE INSERT FOR EACH ROW, enabled, on wines.
  select format('%s %s', t.tgenabled, t.tgtype) into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and t.tgname = 'wines_bottles_per_person_limit' and not t.tgisinternal
    and t.tgfoid = to_regprocedure('public.wines_bottles_per_person_limit()')::oid;
  if v_text is distinct from 'O 7' then
    raise exception 'wines_bottles_per_person_limit is not an enabled BEFORE INSERT row trigger: %', v_text;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure('public.wines_bottles_per_person_limit()')) then
    raise exception 'wines_bottles_per_person_limit is not SECURITY DEFINER';
  end if;

  -- 5. No client EXECUTE on the trigger function.
  if has_function_privilege('anon', 'public.wines_bottles_per_person_limit()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.wines_bottles_per_person_limit()', 'EXECUTE') then
    raise exception 'a client role can execute wines_bottles_per_person_limit';
  end if;
end $$;
