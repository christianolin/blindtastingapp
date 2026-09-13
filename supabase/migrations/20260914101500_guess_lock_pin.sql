-- M8 guess_lock_pin: a locked guess keeps its answers until it is unlocked.
--
-- Blind-tasting v3, plan task BT-SQL8: spec
-- docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §8.4 (the
-- function and trigger below are that SQL, verbatim) and §15 M8; ledger B7
-- (locked rows keep their answers); map PLAY-17 (the server refusal).
-- Written against the LIVE state (read-only checks, 2026-09-13): guesses
-- carries exactly the non-internal triggers guesses_block_after_reveal,
-- guesses_pin_identity and guesses_set_updated_at; live tail 20260913180000.
-- This migration recreates no function and no policy.
--
-- What it does. A BEFORE UPDATE row trigger on public.guesses refuses, with
-- SQLSTATE 42501, any change to a locked row's answers (the ten guess fields
-- and guessed_wine_id) while the row stays locked (old.locked_at and
-- new.locked_at both set). It lets through:
-- * locking and unlocking (locked_at alone), and an unlock that edits in the
--   same statement (new.locked_at is null): "Change it" unlocks first;
-- * reveal_wine, reveal_next_category and score_own_guess, which write only the
--   *_points columns, total_points and scored_at (their live bodies are pinned
--   below, so a changed scorer fails this file instead of the trigger);
-- * the one change allowed on a locked row: guessed_wine_id becoming null while
--   every other answer stays, which is guesses_guessed_wine_id_fkey's
--   ON DELETE SET NULL when the picked glass is deleted, for example inside a
--   tasting delete that reaches the row before or after its own cascade;
-- * §10's pool release (M9b), which clears guessed_wine_id and locked_at
--   together.
--
-- Security. The function is SECURITY INVOKER with a pinned search_path and only
-- refuses. There is no read path, so rule 1 is unaffected (spec §16 lists no M8
-- row). RLS filters another taster's row before any BEFORE UPDATE trigger runs,
-- so the refusal is no oracle about anyone else's lock. The 093000 client-column
-- privileges, guesses_pin_identity and guesses_block_after_reveal stay as they
-- are, and a whole-tasting delete still passes guesses_block_after_reveal (one
-- statement deletes every glass before the FK actions on guesses run).
--
-- Deploy: after add-wine V2 (the deployed ladder can race a debounced save
-- against lockGuess, which this surfaces as an error). Applied live by the main
-- session in BT-M8, in version order after M7.
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the post-state assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot.
-- ---------------------------------------------------------------------------
create temp table guesses_101500_triggers as
select t.tgname::text as tgname, t.tgtype, t.tgenabled, t.tgfoid,
       cardinality(t.tgattr::int2[]) as ncols, t.tgqual is null as no_when, t.tgconstraint
from pg_trigger t
where t.tgrelid = 'public.guesses'::regclass and not t.tgisinternal;

create temp table guesses_101500_functions as
select s.sig, p.oid, md5(replace(p.prosrc, chr(13), '')) as src_md5, p.proacl::text as acl,
       p.prosecdef, p.proconfig::text as config
from unnest(array[
  'public.block_guess_writes_after_reveal()',
  'public.pin_guess_identity()',
  'public.set_updated_at()',
  'public.reveal_wine(uuid)',
  'public.reveal_next_category(uuid,smallint)',
  'public.score_own_guess(uuid)'
]) as s (sig)
left join pg_proc p on p.oid = to_regprocedure(s.sig);

create temp table guesses_101500_policies as
select pol.policyname::text as policyname, pol.permissive, pol.roles::text as roles, pol.cmd,
       pol.qual, pol.with_check
from pg_policies pol
where pol.schemaname = 'public' and pol.tablename = 'guesses';

create temp table guesses_101500_acl as
select a.attname::text as col, x.grantor, x.grantee, x.privilege_type, x.is_grantable
from pg_attribute a, lateral aclexplode(a.attacl) x
where a.attrelid = 'public.guesses'::regclass and a.attnum > 0
union all
select '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
from pg_class c, lateral aclexplode(c.relacl) x
where c.oid = 'public.guesses'::regclass;

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  v_text text;
begin
  if to_regprocedure('public.guesses_refuse_locked_edit()') is not null then
    raise exception 'guesses_refuse_locked_edit() already exists';
  end if;

  select string_agg(tgname, ',' order by tgname) into v_text from guesses_101500_triggers;
  if v_text is distinct from 'guesses_block_after_reveal,guesses_pin_identity,guesses_set_updated_at' then
    raise exception 'guesses triggers differ from the live three this migration was written against: %', v_text;
  end if;

  -- tgtype 23 = ROW (1) | BEFORE (2) | INSERT (4) | UPDATE (16); 19 = ROW | BEFORE | UPDATE.
  select string_agg(e.tgname, ', ') into v_text
  from (values
    ('guesses_block_after_reveal', 23, 'public.block_guess_writes_after_reveal()'),
    ('guesses_pin_identity', 19, 'public.pin_guess_identity()'),
    ('guesses_set_updated_at', 19, 'public.set_updated_at()')
  ) as e (tgname, tgtype, fn)
  join guesses_101500_triggers b on b.tgname = e.tgname
  where b.tgenabled <> 'O'
     or b.tgtype <> e.tgtype
     or b.tgfoid is distinct from to_regprocedure(e.fn)::oid
     or b.ncols <> 0
     or not b.no_when
     or b.tgconstraint <> 0;
  if v_text is not null then
    raise exception 'guesses triggers are not the live shapes (enabled, BEFORE ROW, function, no column list, no WHEN): %', v_text;
  end if;

  -- The live bodies the pass-through reasoning relies on (md5 of prosrc, CR-stripped).
  select string_agg(e.sig, ', ') into v_text
  from (values
    ('public.block_guess_writes_after_reveal()', 'fba41add347849171c6ca24a10b26abd'),
    ('public.pin_guess_identity()', 'fd9130fc22af9fd6aaeb0b769c3a3c4d'),
    ('public.reveal_wine(uuid)', '13923813da0f470fe2d1ffd3ac445625'),
    ('public.reveal_next_category(uuid,smallint)', '6a08183662534db0d212b2412d729ac2'),
    ('public.score_own_guess(uuid)', 'f7acab278d1a88558b1e35b4370e72e4')
  ) as e (sig, src_md5)
  left join guesses_101500_functions f on f.sig = e.sig
  where f.oid is null or f.src_md5 is distinct from e.src_md5;
  if v_text is not null then
    raise exception 'functions differ from the live bodies this migration was written against (re-verify the lock pin pass-through): %', v_text;
  end if;
  if (select oid from guesses_101500_functions where sig = 'public.set_updated_at()') is null then
    raise exception 'set_updated_at() missing pre-migration';
  end if;

  -- The columns the row comparison names, with their live types.
  select string_agg(e.col, ', ') into v_text
  from (values
    ('country_id', 'uuid'), ('region_id', 'uuid'), ('appellation_id', 'uuid'),
    ('primary_grape_id', 'uuid'), ('secondary_grape_id', 'uuid'), ('producer_id', 'uuid'),
    ('type_designation_id', 'uuid'), ('vintage_kind', 'public.vintage_kind'),
    ('vintage_year', 'integer'), ('vintage_tawny_years', 'integer'),
    ('guessed_wine_id', 'uuid'), ('locked_at', 'timestamp with time zone')
  ) as e (col, typ)
  left join pg_attribute a
    on a.attrelid = 'public.guesses'::regclass and a.attname = e.col
   and a.attnum > 0 and not a.attisdropped
  where a.attnum is null or a.atttypid is distinct from e.typ::regtype::oid;
  if v_text is not null then
    raise exception 'guesses columns the lock pin compares are missing or retyped: %', v_text;
  end if;

  -- The one exemption exists for this foreign key's SET NULL.
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.guesses'::regclass
      and c.conname = 'guesses_guessed_wine_id_fkey'
      and c.contype = 'f'
      and c.confrelid = 'public.wines'::regclass
      and c.confdeltype = 'n'
      and c.conkey = array[(select a.attnum from pg_attribute a
                            where a.attrelid = 'public.guesses'::regclass and a.attname = 'guessed_wine_id')]
      and c.confkey = array[(select a.attnum from pg_attribute a
                             where a.attrelid = 'public.wines'::regclass and a.attname = 'id')]
  ) then
    raise exception 'guesses_guessed_wine_id_fkey is not guessed_wine_id -> wines(id) ON DELETE SET NULL';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §8.4, verbatim.
-- ---------------------------------------------------------------------------
-- A locked guess keeps its answers until it is unlocked. Locking and unlocking
-- (locked_at alone) and the scoring functions (score columns only) pass.
create or replace function public.guesses_refuse_locked_edit()
returns trigger language plpgsql set search_path = public as $$
begin
  -- The one change allowed on a locked row: its candidate becoming null while
  -- every other answer stays (guesses_guessed_wine_id_fkey's SET NULL when the
  -- picked glass is deleted, for example inside a tasting delete).
  if old.locked_at is not null and new.locked_at is not null
     and old.guessed_wine_id is not null and new.guessed_wine_id is null
     and row(new.country_id, new.region_id, new.appellation_id, new.primary_grape_id,
             new.secondary_grape_id, new.producer_id, new.type_designation_id,
             new.vintage_kind, new.vintage_year, new.vintage_tawny_years)
         is not distinct from
         row(old.country_id, old.region_id, old.appellation_id, old.primary_grape_id,
             old.secondary_grape_id, old.producer_id, old.type_designation_id,
             old.vintage_kind, old.vintage_year, old.vintage_tawny_years) then
    return new;
  end if;
  if old.locked_at is not null and new.locked_at is not null
     and row(new.country_id, new.region_id, new.appellation_id, new.primary_grape_id,
             new.secondary_grape_id, new.producer_id, new.type_designation_id,
             new.vintage_kind, new.vintage_year, new.vintage_tawny_years, new.guessed_wine_id)
         is distinct from
         row(old.country_id, old.region_id, old.appellation_id, old.primary_grape_id,
             old.secondary_grape_id, old.producer_id, old.type_designation_id,
             old.vintage_kind, old.vintage_year, old.vintage_tawny_years, old.guessed_wine_id)
  then
    raise exception 'this guess is locked in — change it first'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger guesses_refuse_locked_edit
  before update on public.guesses
  for each row execute function public.guesses_refuse_locked_edit();

-- ---------------------------------------------------------------------------
-- Same-transaction assertions (never trust "version recorded").
-- ---------------------------------------------------------------------------
do $$
declare
  c_guesses constant oid := 'public.guesses'::regclass::oid;
  -- md5 of the verbatim body above (prosrc, CR-stripped, so a CRLF checkout compares equal).
  c_body_md5 constant text := 'dfdb3bbb2ed512fa98b03b2ec088ab1c';
  v_fn oid := to_regprocedure('public.guesses_refuse_locked_edit()')::oid;
  v_text text;
begin
  -- 1. The function: plpgsql, SECURITY INVOKER, search_path pinned, returns trigger, this body.
  if v_fn is null then
    raise exception 'guesses_refuse_locked_edit() missing post-migration';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = v_fn
      and l.lanname = 'plpgsql'
      and not p.prosecdef
      and p.proconfig::text = '{search_path=public}'
      and p.prorettype = 'trigger'::regtype
      and p.pronargs = 0
      and md5(replace(p.prosrc, chr(13), '')) = c_body_md5
      and strpos(p.prosrc, 'old.guessed_wine_id is not null and new.guessed_wine_id is null') > 0
      and strpos(p.prosrc, 'using errcode = ''insufficient_privilege''') > 0
  ) then
    raise exception 'guesses_refuse_locked_edit is not the reviewed SECURITY INVOKER plpgsql trigger function (body md5 %)',
      (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = v_fn);
  end if;

  -- 2. guesses carries exactly the live three triggers, unchanged, plus this one, enabled.
  select string_agg(t.tgname::text, ',' order by t.tgname) into v_text
  from pg_trigger t
  where t.tgrelid = c_guesses and not t.tgisinternal;
  if v_text is distinct from 'guesses_block_after_reveal,guesses_pin_identity,guesses_refuse_locked_edit,guesses_set_updated_at' then
    raise exception 'guesses does not carry exactly the live three triggers plus guesses_refuse_locked_edit: %', v_text;
  end if;
  select string_agg(b.tgname, ', ') into v_text
  from guesses_101500_triggers b
  left join pg_trigger t on t.tgrelid = c_guesses and t.tgname = b.tgname and not t.tgisinternal
  where t.oid is null
     or t.tgtype <> b.tgtype
     or t.tgenabled <> b.tgenabled
     or t.tgfoid <> b.tgfoid
     or cardinality(t.tgattr::int2[]) <> b.ncols
     or (t.tgqual is null) <> b.no_when
     or t.tgconstraint <> b.tgconstraint;
  if v_text is not null then
    raise exception 'live guesses triggers changed: %', v_text;
  end if;
  -- tgtype 19 = ROW (1) | BEFORE (2) | UPDATE (16); no column list, no WHEN, not a constraint trigger.
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c_guesses and t.tgname = 'guesses_refuse_locked_edit' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgtype = 19 and cardinality(t.tgattr::int2[]) = 0
      and t.tgqual is null and t.tgconstraint = 0 and t.tgfoid = v_fn
  ) then
    raise exception 'guesses_refuse_locked_edit is missing, disabled or mis-shaped';
  end if;

  -- 3. Nothing else changed: the snapshotted functions, the guesses policies and grants.
  select string_agg(b.sig, ', ') into v_text
  from guesses_101500_functions b
  left join pg_proc p on p.oid = b.oid
  where p.oid is null
     or md5(replace(p.prosrc, chr(13), '')) is distinct from b.src_md5
     or p.proacl::text is distinct from b.acl
     or p.prosecdef is distinct from b.prosecdef
     or p.proconfig::text is distinct from b.config;
  if v_text is not null then
    raise exception 'functions changed post-migration: %', v_text;
  end if;

  if exists (
    (select policyname, permissive, roles, cmd, qual, with_check from guesses_101500_policies
     except
     select pol.policyname::text, pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check
     from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'guesses')
    union all
    (select pol.policyname::text, pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check
     from pg_policies pol where pol.schemaname = 'public' and pol.tablename = 'guesses'
     except
     select policyname, permissive, roles, cmd, qual, with_check from guesses_101500_policies)
  ) then
    raise exception 'guesses policies changed post-migration';
  end if;

  if exists (
    (select col, grantor, grantee, privilege_type, is_grantable from guesses_101500_acl
     except
     (select a.attname::text, x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_attribute a, lateral aclexplode(a.attacl) x
      where a.attrelid = c_guesses and a.attnum > 0
      union all
      select '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c, lateral aclexplode(c.relacl) x
      where c.oid = c_guesses))
    union all
    ((select a.attname::text, x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_attribute a, lateral aclexplode(a.attacl) x
      where a.attrelid = c_guesses and a.attnum > 0
      union all
      select '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c, lateral aclexplode(c.relacl) x
      where c.oid = c_guesses)
     except
     select col, grantor, grantee, privilege_type, is_grantable from guesses_101500_acl)
  ) then
    raise exception 'guesses table or column grants changed post-migration';
  end if;
end $$;

drop table guesses_101500_triggers;
drop table guesses_101500_functions;
drop table guesses_101500_policies;
drop table guesses_101500_acl;
