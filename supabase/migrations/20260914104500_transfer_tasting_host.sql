-- M10 transfer_tasting_host: the host hands hosting to a joined guest before the
-- tasting starts.
--
-- Blind-tasting v3, plan task BT-SQL11: spec
-- docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §12.4 (the SQL
-- block below is the spec's, byte for byte), §12.5, §15 M10, §16.1 row 28;
-- ledger B11 and Q4 (the hand-hosting rules); map LOBBY-48, XCUT-56 (schema).
--
-- Written against the LIVE state (read-only dump
-- .superpowers/blind-tasting/probes/20260914104500-live-defs.sql, 2026-09-14;
-- live tail 20260914121417; blind-tasting M1-M7 and M9a applied, M8 and M9b not):
-- * no function named transfer_tasting_host exists;
-- * "tastings update host" is the only UPDATE policy on tastings (PERMISSIVE, to
--   authenticated, USING and WITH CHECK both (host_id = auth.uid())), so no
--   client can move host_id;
-- * tastings carries exactly four triggers: tastings_lock_setup_after_start
--   (UPDATE OF reveal_mode, timing_mode, wine_source, status),
--   tastings_pause_follows_status (status, paused_at, timing_mode),
--   tastings_pointer_in_tasting (current_wine_id) and tastings_stamp_lifecycle
--   (every update; it keeps started_at and finished_at and refuses nothing), so a
--   host_id-only update meets only the last;
-- * wines.added_by_host (boolean not null) is owned by wines_pin_adder (M6): true
--   exactly when the glass was inserted with no contributor, and kept on every
--   update, so a glass whose contributor's participant row is deleted (the FK
--   sets contributor_participant_id null) stays not host-added;
-- * wine_identity_drafts.owner_id and wine_pour_intents.owner_id (uuid not null)
--   name the user who added the glass; is_wine_adder keys host-added glasses on
--   tastings.host_id, and draw_down_flight_cellar_lots takes tastings.host_id as
--   the adder of a glass with no contributor.
-- M9b (20260914103500_semi_blind_lockdown) applies before this file (spec §15:
-- M10 needs M9's narrowed host clause; M9b in turn needs M8), and this file fails
-- closed without it: the wine_answers policies must be the set M9b leaves, whose
-- "wine_answers read" host clause is ((t.host_id = auth.uid()) AND w.added_by_host).
--
-- What it does. transfer_tasting_host(p_tasting_id, p_new_host_user_id), SECURITY
-- DEFINER with search_path=public, EXECUTE for authenticated and never for anon
-- or PUBLIC: the host of a DRAFT tasting hands hosting to a JOINED participant.
-- It locks the tasting row first, so two hand-overs of one tasting run one after
-- the other. It refuses, in this order, with these messages (handHostingRefusal
-- in src/lib/lobby-copy.ts maps them to sentences):
--   'only the host can hand hosting over'
--       no such tasting, no auth.uid(), or the caller is not the host;
--   'hosting can only change before the tasting starts'
--       the status is not DRAFT;
--   'only someone who has joined can host'
--       a null target, the host, or no JOINED participant row for the target;
--   'remove the glasses you added first'
--       any glass of the tasting has added_by_host;
--   'finish or remove your unfinished glasses and cellar bottles first'
--       the host owns an identity draft or a pour intent on a glass of the tasting.
-- The former host's participant row is untouched: they stay JOINED.
--
-- Security (rule 1; spec §12.4 "Security reasoning", §16.1 row 28).
-- * The new host inherits no answer key they did not add. With a host-added glass
--   the call is refused, so a host-provides flight moves only while empty. In a
--   bring-your-own flight no glass is host-added (a contributor whose row was
--   deleted leaves a glass with a null contributor that is still not host-added),
--   and after M9b the host clause of "wine_answers read" covers host-added glasses
--   only, so the new host reads no contributor's hidden key. Before M9b the live
--   host clause (t.host_id = auth.uid()) would show them: hence the M9b pre-assert.
-- * Drafts and pour intents stay with their owners. Refusing while any belongs to
--   the host keeps is_wine_adder and draw_down_flight_cellar_lots from changing
--   meaning under a new host_id.
-- * The former host stays JOINED and becomes an eligible guesser of the others'
--   bottles, which they never saw (a bottle they brought to a bring-your-own flight
--   stays theirs through the contributor clause).
-- * The WITH CHECK of "tastings update host" still blocks any client-side change of
--   host_id; this function is the only way hosting moves, and it runs as its owner.
--   The post-state assertions pin that policy, and that nothing but the one
--   function changed.
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the post-state assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot of everything this file must leave alone.
-- ---------------------------------------------------------------------------
create temp table transfer_host_104500_functions as
select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
       p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile
from pg_proc p
where p.pronamespace = 'public'::regnamespace;

create temp table transfer_host_104500_policies as
select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
       pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
from pg_policies pol
where pol.schemaname = 'public';

create temp table transfer_host_104500_triggers as
select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
       pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;

create temp table transfer_host_104500_acl as
select c.relname::text as tbl, a.attname::text as col, x.grantee, x.privilege_type, x.is_grantable
from pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) x
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
union all
select c.relname::text, '(table)', x.grantee, x.privilege_type, x.is_grantable
from pg_class c
cross join lateral aclexplode(c.relacl) x
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S');

create temp table transfer_host_104500_counts as
select (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
       (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace) as relations;

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  v_text text;
begin
  -- 1. Nothing of this file exists yet (create or replace would silently replace a function).
  if exists (select 1 from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = 'transfer_tasting_host') then
    raise exception 'an object of 20260914104500_transfer_tasting_host already exists';
  end if;

  -- 2. "tastings update host" exactly as dumped, and the only UPDATE (or ALL) policy on
  --    tastings: a second permissive one could let a client move host_id. RLS stays on.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(p.qual, '-'), coalesce(p.with_check, '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'tastings' and p.cmd in ('UPDATE', 'ALL');
  if v_text is distinct from 'tastings update host|UPDATE|{authenticated}|PERMISSIVE|(host_id = auth.uid())|(host_id = auth.uid())' then
    raise exception 'the tastings UPDATE policies are not the live "tastings update host" alone: %', v_text;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.tastings'::regclass) then
    raise exception 'row level security is not enabled on tastings';
  end if;

  -- 3. The columns the function reads and writes (type, not null), and the enum labels it names.
  select string_agg(format('%s.%s', e.tbl, e.col), ', ') into v_text
  from (values
    ('tastings', 'id', 'uuid'), ('tastings', 'host_id', 'uuid'), ('tastings', 'status', 'public.tasting_status'),
    ('tasting_participants', 'tasting_id', 'uuid'), ('tasting_participants', 'user_id', 'uuid'),
    ('tasting_participants', 'status', 'public.participant_status'),
    ('wines', 'id', 'uuid'), ('wines', 'tasting_id', 'uuid'), ('wines', 'added_by_host', 'boolean'),
    ('wine_identity_drafts', 'wine_id', 'uuid'), ('wine_identity_drafts', 'owner_id', 'uuid'),
    ('wine_pour_intents', 'wine_id', 'uuid'), ('wine_pour_intents', 'owner_id', 'uuid')
  ) as e (tbl, col, typ)
  left join pg_attribute a
    on a.attrelid = to_regclass('public.' || e.tbl) and a.attname = e.col
   and a.attnum > 0 and not a.attisdropped
  where a.attnum is null or a.atttypid is distinct from to_regtype(e.typ)::oid or not a.attnotnull;
  if v_text is not null then
    raise exception 'columns the function uses are missing, retyped or nullable: %', v_text;
  end if;
  if not exists (select 1 from pg_enum x where x.enumtypid = 'public.tasting_status'::regtype and x.enumlabel = 'DRAFT')
     or not exists (select 1 from pg_enum x where x.enumtypid = 'public.participant_status'::regtype and x.enumlabel = 'JOINED') then
    raise exception 'enum labels DRAFT or JOINED missing';
  end if;

  -- 4. M9b first: the wine_answers policy set it leaves, whose "wine_answers read" host
  --    clause covers host-added glasses only and which has no semi-blind clause
  --    (20260914103500's post-state md5s).
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'wine_answers';
  if v_text is distinct from 'wine_answers insert|INSERT|{authenticated}|PERMISSIVE|-|8f590b9d5d338417fe6b882507446975; wine_answers read|SELECT|{authenticated}|PERMISSIVE|abe0592ac72de20adfb3b8005bc86f86|-; wine_answers update|UPDATE|{authenticated}|PERMISSIVE|8f590b9d5d338417fe6b882507446975|8f590b9d5d338417fe6b882507446975' then
    raise exception 'the narrowed "wine_answers read" (M9b) is missing: apply 20260914103500_semi_blind_lockdown first (policies: %)', v_text;
  end if;

  -- 5. The live bodies this file's reasoning relies on (md5 of prosrc, CR-stripped): the
  --    trigger that owns added_by_host, the adder helper, the cellar draw-down, and the
  --    one tastings trigger a host_id update meets.
  select string_agg(e.sig, ', ') into v_text
  from (values
    ('public.wines_pin_adder()', 'cdf869a9016452c49640bfba9fba2ff5'),
    ('public.is_wine_adder(uuid)', '465968d5cd9fb36c4e9736994e4677a6'),
    ('public.draw_down_flight_cellar_lots(uuid)', '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.tastings_stamp_lifecycle()', '5d7702a39d76b3a8b6fd3ddf2d30fe1d')
  ) as e (sig, src_md5)
  left join pg_proc p on p.oid = to_regprocedure(e.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) is distinct from e.src_md5;
  if v_text is not null then
    raise exception 'functions differ from the live bodies this migration was written against: %', v_text;
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.wines'::regclass and t.tgname = 'wines_pin_adder' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgtype = 23 and cardinality(t.tgattr::int2[]) = 0
      and t.tgfoid = to_regprocedure('public.wines_pin_adder()')::oid
  ) then
    raise exception 'wines_pin_adder (M6) is missing, disabled or no longer BEFORE INSERT OR UPDATE on wines';
  end if;

  -- 6. The tastings triggers, as name, enabled, tgtype and the columns an UPDATE OF names
  --    (none names host_id).
  select string_agg(format('%s %s %s %s', t.tgname, t.tgenabled, t.tgtype,
                           coalesce((select string_agg(a.attname::text, ',' order by a.attname::text collate "C")
                                     from pg_attribute a
                                     where a.attrelid = t.tgrelid and a.attnum = any (t.tgattr::int2[])), '-')),
                    '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.tastings'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tastings_lock_setup_after_start O 19 reveal_mode,status,timing_mode,wine_source; tastings_pause_follows_status O 23 paused_at,status,timing_mode; tastings_pointer_in_tasting O 23 current_wine_id; tastings_stamp_lifecycle O 23 -' then
    raise exception 'tastings triggers differ from the live set this migration was written against: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- Spec §12.4 transfer_tasting_host, verbatim.
-- ===========================================================================
create or replace function public.transfer_tasting_host(p_tasting_id uuid, p_new_host_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting tastings%rowtype;
begin
  select * into v_tasting from tastings where id = p_tasting_id for update;
  if not found or auth.uid() is null or v_tasting.host_id is distinct from auth.uid() then
    raise exception 'only the host can hand hosting over';
  end if;
  if v_tasting.status <> 'DRAFT' then
    raise exception 'hosting can only change before the tasting starts';
  end if;
  if p_new_host_user_id is null
     or p_new_host_user_id = v_tasting.host_id
     or not exists (select 1 from tasting_participants
                    where tasting_id = p_tasting_id and user_id = p_new_host_user_id
                      and status = 'JOINED') then
    raise exception 'only someone who has joined can host';
  end if;
  if exists (select 1 from wines
             where tasting_id = p_tasting_id and added_by_host) then   -- M6's pinned flag
    raise exception 'remove the glasses you added first';
  end if;
  if exists (select 1 from wine_identity_drafts d join wines w on w.id = d.wine_id
             where w.tasting_id = p_tasting_id and d.owner_id = v_tasting.host_id)
     or exists (select 1 from wine_pour_intents i join wines w on w.id = i.wine_id
                where w.tasting_id = p_tasting_id and i.owner_id = v_tasting.host_id) then
    raise exception 'finish or remove your unfinished glasses and cellar bottles first';
  end if;

  update tastings set host_id = p_new_host_user_id where id = p_tasting_id;
  -- The former host's participant row is untouched: they stay JOINED.
end $$;
revoke all on function public.transfer_tasting_host(uuid, uuid) from public, anon;
grant execute on function public.transfer_tasting_host(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Same-transaction assertions (never trust "version recorded").
-- ---------------------------------------------------------------------------
do $$
declare
  c_anon constant oid := 'anon'::regrole::oid;
  c_authenticated constant oid := 'authenticated'::regrole::oid;
  c_service_role constant oid := 'service_role'::regrole::oid;
  v_fn oid := to_regprocedure('public.transfer_tasting_host(uuid,uuid)')::oid;
  v_text text;
begin
  -- 1. The function: plpgsql, SECURITY DEFINER with search_path=public, the spec's
  --    signature and body (md5 of prosrc, CR-stripped), returning void, the only one
  --    of its name.
  select format('%s definer=%s config=%s (%s) returns %s volatility=%s md5=%s', l.lanname, p.prosecdef::text,
                p.proconfig::text, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid),
                p.provolatile, md5(replace(p.prosrc, chr(13), '')))
    into v_text
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_fn;
  if v_fn is null
     or v_text is distinct from 'plpgsql definer=true config={search_path=public} (p_tasting_id uuid, p_new_host_user_id uuid) returns void volatility=v md5=4c32379c31e4061c9ef658cef6dadd06' then
    raise exception 'transfer_tasting_host is not the spec §12.4 function: %', coalesce(v_text, 'missing');
  end if;
  if (select count(*) from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = 'transfer_tasting_host') <> 1 then
    raise exception 'more than one public.transfer_tasting_host';
  end if;

  -- 2. EXECUTE: authenticated, never anon or PUBLIC. Beyond authenticated only the owner
  --    and service_role (Supabase's default privileges for new functions) hold it, and
  --    nobody but the owner holds it with grant option.
  if not has_function_privilege(c_authenticated, v_fn, 'EXECUTE')
     or has_function_privilege(c_anon, v_fn, 'EXECUTE') then
    raise exception 'transfer_tasting_host EXECUTE is not authenticated-only (authenticated %, anon %)',
      has_function_privilege(c_authenticated, v_fn, 'EXECUTE'), has_function_privilege(c_anon, v_fn, 'EXECUTE');
  end if;
  select string_agg(format('%s:%s:%s', case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end,
                           x.privilege_type, x.is_grantable), ', ')
    into v_text
  from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
  where p.oid = v_fn
    and not (x.grantee = p.proowner
             or (x.grantee in (c_authenticated, c_service_role) and not x.is_grantable));
  if v_text is not null then
    raise exception 'unexpected EXECUTE grants on transfer_tasting_host: %', v_text;
  end if;

  -- 3. "tastings update host" unchanged, still the only UPDATE (or ALL) policy on tastings.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(p.qual, '-'), coalesce(p.with_check, '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'tastings' and p.cmd in ('UPDATE', 'ALL');
  if v_text is distinct from 'tastings update host|UPDATE|{authenticated}|PERMISSIVE|(host_id = auth.uid())|(host_id = auth.uid())' then
    raise exception 'the tastings UPDATE policies changed: %', v_text;
  end if;

  -- 4. Nothing else changed: every other public function (body, ACL, security, config,
  --    volatility), policy, trigger and privilege; one new function, no new relation.
  select string_agg(format('%s %s', d.side, d.sig), ', ' order by d.sig) into v_text
  from (
    select case when pre.oid is null then 'new' when cur.oid is null then 'dropped' else 'changed' end as side,
           coalesce(cur.sig, pre.sig) as sig, cur.oid
    from transfer_host_104500_functions pre
    full join (select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
                      p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile
               from pg_proc p where p.pronamespace = 'public'::regnamespace) cur
      on cur.oid = pre.oid
    where pre.oid is null or cur.oid is null
       or (pre.sig, pre.body, pre.acl, pre.prosecdef, pre.config, pre.provolatile)
          is distinct from (cur.sig, cur.body, cur.acl, cur.prosecdef, cur.config, cur.provolatile)
  ) d
  where not (d.side = 'new' and d.oid = v_fn);
  if v_text is not null then
    raise exception 'public functions changed beyond transfer_tasting_host: %', v_text;
  end if;

  select string_agg(format('%s.%s', coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)), ', ')
    into v_text
  from transfer_host_104500_policies pre
  full join (select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
                    pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
             from pg_policies pol where pol.schemaname = 'public') cur
    on cur.tablename = pre.tablename and cur.policyname = pre.policyname
  where pre.policyname is null or cur.policyname is null
     or (pre.permissive, pre.roles, pre.cmd, pre.qual, pre.with_check)
        is distinct from (cur.permissive, cur.roles, cur.cmd, cur.qual, cur.with_check);
  if v_text is not null then
    raise exception 'policies changed: %', v_text;
  end if;

  select string_agg(format('%s.%s', coalesce(pre.tbl, cur.tbl), coalesce(pre.tgname, cur.tgname)), ', ')
    into v_text
  from transfer_host_104500_triggers pre
  full join (select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
                    pg_get_triggerdef(t.oid) as def
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) cur
    on cur.tbl = pre.tbl and cur.tgname = pre.tgname
  where pre.tgname is null or cur.tgname is null
     or (pre.tgenabled, pre.tgtype, pre.tgfoid, pre.def)
        is distinct from (cur.tgenabled, cur.tgtype, cur.tgfoid, cur.def);
  if v_text is not null then
    raise exception 'triggers changed: %', v_text;
  end if;

  with cur as (
    select c.relname::text as tbl, a.attname::text as col, x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) x
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
    union all
    select c.relname::text, '(table)', x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    cross join lateral aclexplode(c.relacl) x
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ),
  diff as (
    (select 'lost' as side, pre.tbl, pre.col, pre.grantee, pre.privilege_type, pre.is_grantable
     from transfer_host_104500_acl pre
     except
     select 'lost', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur)
    union all
    (select 'gained', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur
     except
     select 'gained', pre.tbl, pre.col, pre.grantee, pre.privilege_type, pre.is_grantable
     from transfer_host_104500_acl pre)
  )
  select string_agg(format('%s %s.%s %s %s', side, tbl, col,
                           case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee)::text end, privilege_type), ', ')
    into v_text
  from diff;
  if v_text is not null then
    raise exception 'table or column privileges changed: %', v_text;
  end if;

  if (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace)
       <> (select functions + 1 from transfer_host_104500_counts)
     or (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace)
       <> (select relations from transfer_host_104500_counts) then
    raise exception 'public functions or relations changed beyond transfer_tasting_host';
  end if;
end $$;

drop table transfer_host_104500_functions;
drop table transfer_host_104500_policies;
drop table transfer_host_104500_triggers;
drop table transfer_host_104500_acl;
drop table transfer_host_104500_counts;
