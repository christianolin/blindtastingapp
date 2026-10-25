-- Bottles per person: "exactly N" vs "up to N" (owner request 2026-10-25,
-- follow-up to 20261025120000_tasting_bottles_per_person.sql).
--
-- 1. tastings.bottles_exact boolean NOT NULL default false. true means the host
--    wants everyone to bring exactly bottles_per_person bottles; false (every
--    existing tasting, no backfill) keeps today's "up to N". It only describes
--    the host's intent: the cap itself is still enforced, for both rules, by
--    wines_bottles_per_person_limit, which this migration does not touch. The
--    "exactly" half is NOT enforced by the database: Start is allowed with
--    people short of N, and the app warns, naming who is short.
-- 2. tastings_bottles_exact_needs_limit: exact only alongside a limit
--    (Unlimited has no rule), so a row can never claim "exactly unlimited".
-- 3. Written by the host through the existing "tastings update host" policy
--    and the table-level grant, exactly like bottles_per_person. Changeable at
--    any time until CLOSED (an app rule): tastings_lock_setup_after_start is
--    NOT touched and does not name it (asserted below).

do $$
begin
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.tastings'::regclass and a.attname = 'bottles_exact' and not a.attisdropped) then
    raise exception 'tastings.bottles_exact already exists';
  end if;
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.tastings'::regclass and a.attname = 'bottles_per_person' and not a.attisdropped)
     or to_regprocedure('public.wines_bottles_per_person_limit()') is null then
    raise exception 'tastings.bottles_per_person is missing: apply 20261025120000 first';
  end if;
end $$;

alter table public.tastings
  add column bottles_exact boolean not null default false
  constraint tastings_bottles_exact_needs_limit check (not bottles_exact or bottles_per_person is not null);

comment on column public.tastings.bottles_exact is
  'Bring-your-own only: true = everyone brings exactly bottles_per_person bottles (the app warns at Start about anyone short); false = up to that many. Only true with a limit set.';

-- Same-transaction assertions.
do $$
declare
  v_text text;
begin
  -- 1. The column: boolean NOT NULL with default false; every existing row false.
  select format('%s %s %s', format_type(a.atttypid, a.atttypmod), a.attnotnull,
                pg_get_expr(d.adbin, d.adrelid))
    into v_text
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.tastings'::regclass and a.attname = 'bottles_exact' and not a.attisdropped;
  if v_text is distinct from 'boolean t false' then
    raise exception 'tastings.bottles_exact is not a NOT NULL boolean defaulting to false: %', v_text;
  end if;
  if exists (select 1 from public.tastings where bottles_exact) then
    raise exception 'an existing tasting became exact';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
       where c.conrelid = 'public.tastings'::regclass and c.conname = 'tastings_bottles_exact_needs_limit')
     is distinct from 'CHECK (((NOT bottles_exact) OR (bottles_per_person IS NOT NULL)))' then
    raise exception 'tastings_bottles_exact_needs_limit is not the expected check: %',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conrelid = 'public.tastings'::regclass and c.conname = 'tastings_bottles_exact_needs_limit');
  end if;

  -- 2. The host can read and write it (table-level grant + "tastings update host").
  if not has_column_privilege('authenticated', 'public.tastings', 'bottles_exact', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.tastings', 'bottles_exact', 'INSERT')
     or not has_column_privilege('authenticated', 'public.tastings', 'bottles_exact', 'SELECT') then
    raise exception 'authenticated cannot insert, select or update tastings.bottles_exact';
  end if;

  -- 3. The setup lock does not lock it: neither its trigger column list nor its body names it.
  select pg_get_triggerdef(t.oid) into v_text
  from pg_trigger t
  where t.tgrelid = 'public.tastings'::regclass and t.tgname = 'tastings_lock_setup_after_start' and not t.tgisinternal;
  if v_text is null then
    raise exception 'tastings_lock_setup_after_start is missing';
  end if;
  if v_text like '%bottles_exact%'
     or (select p.prosrc from pg_proc p where p.oid = to_regprocedure('public.tastings_lock_setup_after_start()'))
          like '%bottles_exact%' then
    raise exception 'tastings_lock_setup_after_start locks bottles_exact';
  end if;

  -- 4. The cap trigger is still in place and unchanged in kind (both rules rely on it).
  select format('%s %s', t.tgenabled, t.tgtype) into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and t.tgname = 'wines_bottles_per_person_limit' and not t.tgisinternal;
  if v_text is distinct from 'O 7' then
    raise exception 'wines_bottles_per_person_limit is not an enabled BEFORE INSERT row trigger: %', v_text;
  end if;
end $$;
