-- tasting_lifecycle_stamps: when a tasting started and finished, and when a
-- glass was revealed (blind-tasting spec §11.4, §5.4, §15 M3; ledger B4 reveal
-- time, B10 record dates).
--
-- Why: B4's "You joined after this glass" compares a participant's joined_at
-- (server-owned from M4) with wines.revealed_at, and B10's record dates a
-- tasting by started_at / finished_at. The server owns all three stamps: BEFORE
-- INSERT OR UPDATE triggers replace any client-sent value, so neither a host
-- nor a participant (nor the service role) can back-date or forward-date a
-- start, a finish or a reveal.
--
-- Rule 1 (spec §16): the stamps are facts about the tasting and the glass,
-- readable wherever those rows already are. They reveal no wine: revealed_at
-- is set only while is_revealed is true. wines is in supabase_realtime with no
-- column list, so revealed_at streams with is_revealed and adds nothing to it.
--
-- Written against the LIVE state (read-only dump, 2026-09-13:
-- .superpowers/blind-tasting/probes/20260914092500-live-defs.sql):
-- * tastings has no triggers. wines has wines_full_reveal_step (BEFORE UPDATE;
--   on the false -> true flip it raises reveal_step, nothing else) and
--   trg_catalog_wine_unmark_blind (AFTER UPDATE OF is_revealed).
-- * The only SQL writers of wines.is_revealed are reveal_wine and
--   reveal_next_category's last step (both SECURITY DEFINER); no SQL function
--   writes tastings.status. The app writes status through RLS (createTasting
--   inserts DRAFT; startTasting DRAFT -> IN_PROGRESS; finishTasting
--   IN_PROGRESS -> CLOSED; reopenTasting CLOSED -> IN_PROGRESS), the seed script
--   inserts IN_PROGRESS, reveals, then closes as the service role, and the
--   add-wine write inserts OPEN glasses with is_revealed = true.
-- * anon and authenticated hold full table privileges on both tables and there
--   is no column ACL, so the new columns are client-writable by grant: the
--   triggers, not privileges, own them.
-- M3 recreates no existing object. The statements between the two assertion
-- blocks are spec §11.4 verbatim; the assertions are this migration's own.
--
-- Firing order: BEFORE row triggers run in name order, so
-- wines_stamp_revealed_at runs after wines_full_reveal_step. The later
-- blind-tasting triggers (M6 tastings_lock_setup_after_start and wines_pin_adder,
-- M7 tastings_pause_follows_status and wines_refuse_reveal_while_paused, M9b
-- wines_semi_blind_flight_locked) all sort before the stamp triggers. The stamps
-- read NEW.status and NEW.is_revealed as the earlier triggers leave them, so a
-- future BEFORE trigger that sorts after them must not change either column.
--
-- No backfill (spec §11.4): existing tastings and glasses keep null stamps.
-- Legacy tastings therefore get no "added while pouring" and no "joined after",
-- and the record header falls back to scheduled_at, then created_at.
--
-- Deployed code neither reads nor writes these columns (the only mention in src
-- is a doc comment in src/lib/glass-eligibility.ts), so this is
-- behaviour-neutral: every deployed status change and reveal keeps its outcome,
-- and reveal_wine's points are unchanged (probe
-- .superpowers/blind-tasting/probes/20260914092500-lifecycle-stamps.mjs).
--
-- Both trigger functions are SECURITY INVOKER, as the spec writes them. They only
-- assign NEW and cannot be called outside a trigger ("trigger functions can only
-- be called as triggers"), so the default EXECUTE ACL is left alone.
--
-- Locks: ADD COLUMN holds ACCESS EXCLUSIVE on tastings and wines until the
-- applier commits; lock_timeout stops the apply from queueing behind a long
-- transaction.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The three stamp columns do not exist yet.
  select string_agg(format('%s.%s', c.relname, a.attname), ', ' order by c.relname, a.attname)
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  where a.attnum > 0 and not a.attisdropped
    and ((a.attrelid = 'public.tastings'::regclass and a.attname in ('started_at', 'finished_at'))
      or (a.attrelid = 'public.wines'::regclass and a.attname = 'revealed_at'));
  if v_text is not null then
    raise exception 'lifecycle stamp columns already exist: %', v_text;
  end if;

  -- 2. create or replace would silently overwrite a function of the same name,
  --    and a trigger of the same name would fail the apply halfway.
  select string_agg(p.oid::regprocedure::text, ', ')
    into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('tastings_stamp_lifecycle', 'wines_stamp_revealed_at');
  if v_text is not null then
    raise exception 'a stamp function already exists: %; re-dump and rebuild this migration', v_text;
  end if;
  select string_agg(format('%s on %s', t.tgname, c.relname), ', ')
    into v_text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where t.tgname in ('tastings_stamp_lifecycle', 'wines_stamp_revealed_at');
  if v_text is not null then
    raise exception 'a stamp trigger already exists: %', v_text;
  end if;

  -- 3. tastings_stamp_lifecycle compares status with these labels. A missing
  --    label would make every tastings insert and update raise.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.tastings'::regclass
                   and a.attname = 'status'
                   and a.atttypid = 'public.tasting_status'::regtype
                   and a.attnotnull
                   and not a.attisdropped)
     or (select array_agg(e.enumlabel::text order by e.enumsortorder)
         from pg_enum e where e.enumtypid = 'public.tasting_status'::regtype)
        is distinct from array['DRAFT', 'OPEN', 'IN_PROGRESS', 'CLOSED']::text[] then
    raise exception 'tastings.status is not a not-null tasting_status (DRAFT, OPEN, IN_PROGRESS, CLOSED)';
  end if;

  -- 4. wines_stamp_revealed_at reads is_revealed with two-valued logic.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.wines'::regclass
                   and a.attname = 'is_revealed'
                   and a.atttypid = 'boolean'::regtype
                   and a.attnotnull
                   and not a.attisdropped) then
    raise exception 'wines.is_revealed is not boolean not null';
  end if;

  -- 5. The triggers the firing-order note relies on: none on tastings; on wines,
  --    trg_catalog_wine_unmark_blind (AFTER UPDATE OF is_revealed, tgtype 17) and
  --    wines_full_reveal_step (BEFORE UPDATE, tgtype 19), the latter enabled
  --    with the live body (raises reveal_step on the reveal flip, nothing else).
  select string_agg(format('%s %s %s', c.relname, t.tgname, t.tgtype), ', ' order by c.relname, t.tgname)
    into v_text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where t.tgrelid in ('public.tastings'::regclass, 'public.wines'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from 'wines trg_catalog_wine_unmark_blind 17, wines wines_full_reveal_step 19' then
    raise exception 'triggers on tastings and wines differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.wines'::regclass
                   and t.tgname = 'wines_full_reveal_step'
                   and t.tgfoid = 'public.wines_full_reveal_step()'::regprocedure
                   and t.tgenabled = 'O')
     or (select md5(p.prosrc) from pg_proc p
         where p.oid = to_regprocedure('public.wines_full_reveal_step()'))
        is distinct from '5c8215b1df122773ec07058e31337c0e' then
    raise exception 'wines_full_reveal_step is not the enabled trigger with the live body this migration was written against';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §11.4, verbatim.
-- ---------------------------------------------------------------------------
alter table public.tastings
  add column started_at timestamptz,
  add column finished_at timestamptz;
alter table public.wines add column revealed_at timestamptz;

-- The server owns these stamps: a client-sent value is always replaced.
create or replace function public.tastings_stamp_lifecycle()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.started_at := case when new.status in ('IN_PROGRESS', 'OPEN') then now() end;
    new.finished_at := case when new.status = 'CLOSED' then now() end;
    return new;
  end if;
  new.started_at := old.started_at;
  new.finished_at := old.finished_at;
  if new.status is distinct from old.status then
    if old.status = 'DRAFT' and new.status = 'IN_PROGRESS' then
      new.started_at := coalesce(old.started_at, now());
    end if;
    if new.status = 'CLOSED' then
      new.finished_at := now();
    elsif old.status = 'CLOSED' then
      new.finished_at := null;                    -- reopened
    end if;
  end if;
  return new;
end $$;
create trigger tastings_stamp_lifecycle
  before insert or update on public.tastings
  for each row execute function public.tastings_stamp_lifecycle();

create or replace function public.wines_stamp_revealed_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.revealed_at := case when new.is_revealed then now() end;
    return new;
  end if;
  new.revealed_at := old.revealed_at;
  if new.is_revealed and not old.is_revealed then
    new.revealed_at := now();
  elsif not new.is_revealed then
    new.revealed_at := null;
  end if;
  return new;
end $$;
create trigger wines_stamp_revealed_at
  before insert or update on public.wines
  for each row execute function public.wines_stamp_revealed_at();

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
begin
  -- 1. The columns exist: timestamptz, nullable, no default.
  select string_agg(format('%s.%s %s%s%s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           case when a.atthasdef then ' default' else '' end),
                    ', ' order by c.relname, a.attname)
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  where a.attnum > 0 and not a.attisdropped
    and ((a.attrelid = 'public.tastings'::regclass and a.attname in ('started_at', 'finished_at'))
      or (a.attrelid = 'public.wines'::regclass and a.attname = 'revealed_at'));
  if v_text is distinct from 'tastings.finished_at timestamp with time zone, tastings.started_at timestamp with time zone, wines.revealed_at timestamp with time zone' then
    raise exception 'the stamp columns are not three nullable timestamptz columns without a default: %', v_text;
  end if;

  -- 2. No backfill: every existing row keeps null stamps.
  if exists (select 1 from public.tastings where started_at is not null or finished_at is not null)
     or exists (select 1 from public.wines where revealed_at is not null) then
    raise exception 'a lifecycle stamp was backfilled; spec §11.4 says no backfill';
  end if;

  -- 3. Both functions: plpgsql trigger functions, SECURITY INVOKER, search_path pinned.
  for v_fn in
    select s.sig, p.oid, p.prosecdef, p.proconfig, p.prorettype, l.lanname
    from (values ('public.tastings_stamp_lifecycle()'), ('public.wines_stamp_revealed_at()')) as s (sig)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% was not created', v_fn.sig;
    end if;
    if v_fn.prosecdef
       or v_fn.proconfig is distinct from array['search_path=public']::text[]
       or v_fn.prorettype <> 'trigger'::regtype
       or v_fn.lanname is distinct from 'plpgsql' then
      raise exception '% is not a SECURITY INVOKER plpgsql trigger function with search_path=public', v_fn.sig;
    end if;
  end loop;

  -- 4. Both triggers: enabled, BEFORE INSERT OR UPDATE, FOR EACH ROW
  --    (tgtype = ROW 1 | BEFORE 2 | INSERT 4 | UPDATE 16 = 23), on every column,
  --    with no WHEN clause.
  select string_agg(s.tgname, ', ')
    into v_text
  from (values
    ('tastings_stamp_lifecycle', 'public.tastings', 'public.tastings_stamp_lifecycle()'),
    ('wines_stamp_revealed_at', 'public.wines', 'public.wines_stamp_revealed_at()')
  ) as s (tgname, tbl, fn)
  where not exists (select 1 from pg_trigger t
                    where t.tgname = s.tgname
                      and t.tgrelid = s.tbl::regclass
                      and t.tgfoid = s.fn::regprocedure
                      and t.tgtype = 23
                      and t.tgenabled = 'O'
                      and t.tgattr::text = ''
                      and t.tgqual is null
                      and not t.tgisinternal);
  if v_text is not null then
    raise exception 'not an enabled BEFORE INSERT OR UPDATE row trigger on every column without WHEN: %', v_text;
  end if;

  -- 5. The whole trigger set on both tables. In name order each stamp trigger is
  --    the last BEFORE trigger on its table.
  select string_agg(format('%s %s', c.relname, t.tgname), ', ' order by c.relname, t.tgname)
    into v_text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where t.tgrelid in ('public.tastings'::regclass, 'public.wines'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from 'tastings tastings_stamp_lifecycle, wines trg_catalog_wine_unmark_blind, wines wines_full_reveal_step, wines wines_stamp_revealed_at' then
    raise exception 'triggers on tastings and wines are not the expected set: %', v_text;
  end if;

  -- 6. The BEFORE trigger sharing the reveal flip is untouched.
  if (select md5(p.prosrc) from pg_proc p
      where p.oid = to_regprocedure('public.wines_full_reveal_step()'))
       is distinct from '5c8215b1df122773ec07058e31337c0e' then
    raise exception 'wines_full_reveal_step changed post-migration';
  end if;

  -- Informational: the default EXECUTE ACL the spec leaves on the two trigger functions.
  select string_agg(format('%s %s', p.proname, coalesce(p.proacl::text, '(default)')), '; ' order by p.proname)
    into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.tastings_stamp_lifecycle()'),
                  to_regprocedure('public.wines_stamp_revealed_at()'));
  raise notice 'lifecycle stamps: trigger function ACLs %', v_text;
end $$;
