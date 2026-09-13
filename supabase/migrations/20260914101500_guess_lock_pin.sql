-- M8 guess_lock_pin: a locked guess keeps its answers until it is unlocked.
--
-- Blind-tasting v3, plan tasks BT-SQL8 and BT-SQL8x: spec
-- docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §8.4 (the
-- function and trigger below are that SQL plus the client-role scope of plan
-- refinement 24) and §15 M8; ledger B7 (locked rows keep their answers); map
-- PLAY-17 (the server refusal).
-- Written against the LIVE state (read-only checks, 2026-09-13; live tail
-- 20260914092500, M1–M3 applied):
-- * guesses carries exactly the non-internal triggers guesses_block_after_reveal,
--   guesses_pin_identity and guesses_set_updated_at;
-- * UPDATE on guesses is granted to authenticated (14 columns), service_role and
--   the owner postgres; the only members of anon, authenticated and service_role
--   are postgres and the no-inherit authenticator;
-- * the only functions that insert into or update guesses are reveal_wine,
--   reveal_next_category, score_own_guess and reveal_own_next_category.
-- This migration recreates no function and no policy.
--
-- What it does. A BEFORE UPDATE row trigger on public.guesses refuses, with
-- SQLSTATE 42501, a client's change to a locked row's answers (the ten guess
-- fields and guessed_wine_id) while the row stays locked (old.locked_at and
-- new.locked_at both set).
-- * Who is bound: anon and authenticated, whether the statement runs as that
--   role (current_user) or for a request whose JWT names it
--   (request.jwt.claims; a SECURITY DEFINER function or a foreign-key action
--   runs as the owner inside the same request). service_role, and the owner or
--   a superuser outside any client request, pass: maintenance that repoints
--   guesses foreign keys is never blocked by a locked row
--   (scripts/dedupe-producer-orthographic-variants.mjs runs as service_role;
--   scripts/fix-lwin-producer-titles.mjs and data migrations run as postgres).
--   Nothing in src writes guesses with the service-role client; its only use
--   there is inviteUserByEmail.
-- * What a client may still do to a locked row:
--   - lock and unlock (locked_at alone), and unlock while editing in the same
--     statement (new.locked_at is null): "Change it" unlocks first;
--   - run the functions that write guesses. They assign only reveal_step, the
--     *_points columns, total_points and scored_at: reveal_wine,
--     reveal_next_category and score_own_guess (EXECUTE: authenticated), and
--     reveal_own_next_category (EXECUTE: service_role only; nothing in src calls
--     it). Their bodies are pinned below. Any other function whose body inserts
--     into or updates guesses fails this file, except M9a's
--     assign_semi_blind_match and clear_semi_blind_match (spec §10.4 c), which
--     refuse a locked row themselves before they write;
--   - let guessed_wine_id become null while every other answer stays:
--     guesses_guessed_wine_id_fkey's ON DELETE SET NULL when a client request
--     deletes the picked glass (the host through RLS, or a SECURITY DEFINER
--     function running for one, such as M6's remove_flight_glass);
--   - §10's pool release (M9b), which clears guessed_wine_id and locked_at
--     together.
--
-- Security. The function is SECURITY INVOKER with a pinned search_path and only
-- refuses. There is no read path, so rule 1 is unaffected (spec §16 lists no M8
-- row). RLS filters another taster's row before any BEFORE UPDATE trigger runs,
-- so the refusal is no oracle about anyone else's lock. A client cannot lift the
-- pin: its direct writes run as authenticated whatever its JWT claims; PostgREST
-- sets request.jwt.claims from the verified token and exposes no set_config; the
-- service-role key never leaves the server. The pre-state checks fail unless the
-- UPDATE grantees, the role memberships and the writer functions are the ones
-- above. The 093000 client-column privileges, guesses_pin_identity and
-- guesses_block_after_reveal stay as they are, and a whole-tasting delete still
-- passes guesses_block_after_reveal (one statement deletes every glass before
-- the FK actions on guesses run).
--
-- Deploy gate (plan BT-SQL8 "Deploy gate"; applied in BT-M8). Two deployed paths
-- rewrite locked rows and would surface this refusal raw: the ladder's full-row
-- submitGuess (a save racing lockGuess, or a second tab) and the semi-blind batch
-- submitAllMatchGuesses (it skips only scored rows). So this file applies only
-- once a Ready production deployment contains BT-Y1, BT-S2 and BT-S3, which
-- replace both: after M9a and before M9b, out of version order. A version below
-- the live tail is fine while it is absent.
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
  'public.score_own_guess(uuid)',
  'public.reveal_own_next_category(uuid,smallint)'
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
    ('public.score_own_guess(uuid)', 'f7acab278d1a88558b1e35b4370e72e4'),
    ('public.reveal_own_next_category(uuid,smallint)', '7ed3b1d262563ee6e699ced8c2811f87')
  ) as e (sig, src_md5)
  left join guesses_101500_functions f on f.sig = e.sig
  where f.oid is null or f.src_md5 is distinct from e.src_md5;
  if v_text is not null then
    raise exception 'functions differ from the live bodies this migration was written against (re-verify the lock pin pass-through): %', v_text;
  end if;
  if (select oid from guesses_101500_functions where sig = 'public.set_updated_at()') is null then
    raise exception 'set_updated_at() missing pre-migration';
  end if;

  -- Every function that inserts into or updates guesses is a writer whose pass-through was
  -- verified: the four pinned above, or M9a's two RPCs (they refuse a locked row before they
  -- write). Any other writer has to be probed against the lock pin first.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '(insert\s+into|update)\s+(only\s+)?(public\.)?"?guesses"?\M'
    and not exists (
      select 1
      from unnest(array[
        to_regprocedure('public.reveal_wine(uuid)'),
        to_regprocedure('public.reveal_next_category(uuid,smallint)'),
        to_regprocedure('public.score_own_guess(uuid)'),
        to_regprocedure('public.reveal_own_next_category(uuid,smallint)'),
        to_regprocedure('public.assign_semi_blind_match(uuid,text)'),
        to_regprocedure('public.clear_semi_blind_match(uuid)')
      ]) as known (f)
      where known.f::oid = p.oid
    );
  if v_text is not null then
    raise exception 'functions outside the verified writer list insert into or update guesses (probe them against the lock pin first): %', v_text;
  end if;

  -- The role scope binds anon and authenticated, so every other role holding UPDATE on guesses
  -- must be service_role or the owner (superusers need no grant) ...
  select string_agg(distinct g.grantee, ', ') into v_text
  from (
    select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end as grantee
    from pg_class c, lateral aclexplode(c.relacl) x
    where c.oid = 'public.guesses'::regclass and x.privilege_type = 'UPDATE'
    union all
    select case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end
    from pg_attribute a, lateral aclexplode(a.attacl) x
    where a.attrelid = 'public.guesses'::regclass and a.attnum > 0 and not a.attisdropped
      and x.privilege_type = 'UPDATE'
  ) as g
  where g.grantee not in ('anon', 'authenticated', 'service_role',
                          (select pg_get_userbyid(c.relowner)::text from pg_class c
                           where c.oid = 'public.guesses'::regclass));
  if v_text is not null then
    raise exception 'UPDATE on guesses is held outside anon, authenticated, service_role and the owner: %', v_text;
  end if;

  -- ... and no other non-superuser role uses the anon or authenticated grants as itself (a member
  -- without inheritance, like authenticator, must SET ROLE and is then bound as that role).
  select string_agg(r.rolname::text, ', ' order by r.rolname) into v_text
  from pg_roles r
  where r.rolname not in ('anon', 'authenticated')
    and not r.rolsuper
    and r.oid <> (select c.relowner from pg_class c where c.oid = 'public.guesses'::regclass)
    and (pg_has_role(r.oid, 'anon', 'USAGE') or pg_has_role(r.oid, 'authenticated', 'USAGE'));
  if v_text is not null then
    raise exception 'roles inherit the anon or authenticated privileges without being bound by the lock pin: %', v_text;
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
-- Spec §8.4, with the client-role scope of plan refinement 24 (BT-SQL8x).
-- ---------------------------------------------------------------------------
-- A locked guess keeps its answers until it is unlocked. Locking and unlocking
-- (locked_at alone) and the scoring functions (score columns only) pass.
create or replace function public.guesses_refuse_locked_edit()
returns trigger language plpgsql set search_path = public as $$
declare
  -- The role the request's JWT names (the expression auth.role() uses).
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
begin
  -- The pin binds the client roles, anon and authenticated: a statement run as
  -- one of them, or run for a request whose JWT names one (a SECURITY DEFINER
  -- function or a foreign-key action runs as the owner). service_role, and the
  -- owner or a superuser outside a client request, pass: maintenance that
  -- repoints the guesses foreign keys.
  if current_user::text not in ('anon', 'authenticated')
     and coalesce(v_request_role, '') not in ('anon', 'authenticated') then
    return new;
  end if;
  -- The one change allowed on a locked row: its candidate becoming null while
  -- every other answer stays (guesses_guessed_wine_id_fkey's SET NULL when a
  -- client request deletes the picked glass).
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
  -- md5 of the reviewed body above (prosrc, CR-stripped, so a CRLF checkout compares equal).
  c_body_md5 constant text := 'da49ce8d922eaa39c5c12367e5921494';
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
      and strpos(p.prosrc, 'current_user::text not in (''anon'', ''authenticated'')') > 0
      and strpos(p.prosrc, 'coalesce(v_request_role, '''') not in (''anon'', ''authenticated'')') > 0
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
