-- M11 wines_client_update_lockdown: no client role updates wines any more.
--
-- Blind-tasting v3, BT-V3 fix A-05 (review findings V2-2-01 and V2-6-04): spec
-- docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §16.3 (the
-- "wines update host" bullet: once every reorder goes through
-- move_flight_glass and moveWine is retired, "revoke that column grant"),
-- §3.4 item 2; plan refinement 25 (the BT-L1 / BT-L2 hand-off "close probe row
-- Y10"). M6 (20260914095500_flight_edits_until_first_step) is applied, so the
-- grant it made is closed here instead of in that file.
--
-- Version 20260914125500: above the live tail (20260914122317, the Portugal
-- appellation migration, now applied), absent live and on origin/master
-- (re-checked 2026-09-14 against a fresh fetch), and not reserved by any other
-- stream or fix group. First drafted as 20260914105500, the slot after M10,
-- which sits below the live tail.
--
-- Written against the LIVE state (read-only checks, 2026-09-14, re-run after
-- the Portugal apply; live tail 20260914122317; blind-tasting M1-M8 and M9a
-- recorded, M9b and M10 not):
-- * public.wines table privileges are {postgres=arwdDxtm/postgres,
--   anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,
--   service_role=arwdDxtm/postgres}: no client role holds table-level UPDATE
--   (M6 revoked it);
-- * the only column-level grant on wines is M6's
--   `grant update (position, added_via) on public.wines to authenticated`,
--   i.e. {authenticated=w/postgres} on exactly those two columns;
-- * "wines update host" (UPDATE, to authenticated, USING and WITH CHECK the
--   caller hosts the tasting) is the only UPDATE policy on wines. With that
--   grant a host writes position and added_via on any glass of their tasting
--   directly, outside move_flight_glass's after-Start refusals: a PATCH of
--   /rest/v1/wines reorders a started semi-blind flight (Q7: the flight is fixed
--   at Start) or renumbers a guessed or revealed glass (M6 probe row Y10). No
--   answer key is exposed;
-- * every public function whose body updates wines is SECURITY DEFINER with
--   search_path=public, owned by postgres, which keeps UPDATE on wines:
--   move_flight_glass, remove_flight_glass and set_flight_glass_added_via (M6),
--   reveal_wine and reveal_next_category;
-- * the app no longer updates wines (BT-L1 retired moveWine and removeWine): a
--   reorder calls rpc("move_flight_glass") (flight-actions.ts), a removal
--   rpc("remove_flight_glass") (actions.ts), Swap's provenance
--   rpc("set_flight_glass_added_via"). A client's only wines writes are the add
--   path's INSERT (tasting-wine-writes.ts insertGlassRow; wines_pin_adder pins
--   its position) and that path's undo DELETE ("wines delete adder").
--   Referential actions on wines (the contributor FK's SET NULL, a tasting's
--   cascade) run as the table owner and need no client grant.
--
-- What it does: revoke update (position, added_via) on public.wines from
-- authenticated. Afterwards no client role (anon, authenticated, PUBLIC) holds
-- UPDATE on any wines column, so position and added_via move only through the
-- three RPCs above and their rules. SELECT, INSERT, DELETE and every other
-- privilege, every policy (including "wines update host", inert without a
-- grant), every trigger and every function are untouched; the post-state
-- assertions pin that.
--
-- Deploy order: apply only once push A's production deployment is Ready (the
-- deployment before it still runs moveWine and removeWine, whose direct
-- position writes this refuses), beside BT-M9b. It needs neither M9b nor M10,
-- and neither asserts a wines privilege, so it applies before or after them
-- (probe .superpowers/blind-tasting/probes/20260914125500-wines-update-lockdown.mjs:
-- phase "stacked" applies M9b and M10, then this file; phase "first" applies
-- this file, then M9b and M10).
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the post-state assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot of everything this file must leave alone.
-- ---------------------------------------------------------------------------
create temp table wines_update_125500_functions as
select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
       p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile, p.proowner
from pg_proc p
where p.pronamespace = 'public'::regnamespace;

create temp table wines_update_125500_policies as
select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
       pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
from pg_policies pol
where pol.schemaname = 'public';

create temp table wines_update_125500_triggers as
select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
       pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;

create temp table wines_update_125500_acl as
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

create temp table wines_update_125500_counts as
select (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
       (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace) as relations;

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  v_text text;
begin
  -- 1. Table-level privileges on wines exactly as dumped: no client role holds
  --    table-level UPDATE; SELECT, INSERT and DELETE stay.
  select c.relacl::text into v_text from pg_class c where c.oid = 'public.wines'::regclass;
  if v_text is distinct from '{postgres=arwdDxtm/postgres,anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception 'wines table privileges are not the live set this file was written against: %', v_text;
  end if;

  -- 2. The column-level grants on wines are M6's alone (UPDATE on position and
  --    added_via for authenticated, not grantable), and no client role holds
  --    UPDATE on any other column, through PUBLIC or a role membership either.
  --    (is_grantable is cast to text: format's %s would print a boolean as t/f.)
  select string_agg(format('%s:%s:%s:%s', a.attname,
                           case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end,
                           x.privilege_type, x.is_grantable::text), ', ' order by a.attnum, x.privilege_type)
    into v_text
  from pg_attribute a
  cross join lateral aclexplode(a.attacl) x
  where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'position:authenticated:UPDATE:false, added_via:authenticated:UPDATE:false' then
    raise exception 'wines column privileges are not M6''s update (position, added_via) for authenticated: %', v_text;
  end if;
  select string_agg(format('%s.%s', r.rolname, a.attname), ', ' order by r.rolname, a.attnum)
    into v_text
  from (values ('anon'::name), ('authenticated'::name)) as r (rolname)
  cross join pg_attribute a
  where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege(r.rolname, 'public.wines'::regclass, a.attname::text, 'UPDATE');
  if v_text is distinct from 'authenticated.position, authenticated.added_via' then
    raise exception 'client UPDATE on wines columns is not M6''s position and added_via for authenticated: %', v_text;
  end if;

  -- 3. The three flight RPCs that write position and added_via are SECURITY
  --    DEFINER, pin search_path=public and are owned by a role that holds UPDATE
  --    on wines, so they keep working once the client grant is gone.
  select string_agg(format('%s:%s:%s:%s', s.sig, coalesce(p.prosecdef::text, 'missing'), coalesce(p.proconfig::text, '-'),
                           coalesce(has_table_privilege(p.proowner, 'public.wines'::regclass, 'UPDATE')::text, '-')),
                    ', ' order by s.sig)
    into v_text
  from unnest(array['public.move_flight_glass(uuid,integer)', 'public.remove_flight_glass(uuid)',
                    'public.set_flight_glass_added_via(uuid,text)']) as s (sig)
  left join pg_proc p on p.oid = to_regprocedure(s.sig);
  if v_text is distinct from 'public.move_flight_glass(uuid,integer):true:{search_path=public}:true, public.remove_flight_glass(uuid):true:{search_path=public}:true, public.set_flight_glass_added_via(uuid,text):true:{search_path=public}:true' then
    raise exception 'the flight glass RPCs are not the SECURITY DEFINER writers this file relies on: %', v_text;
  end if;

  -- 4. No SECURITY INVOKER function in public updates wines: one a client calls
  --    (or a trigger a client fires) would lose its UPDATE with this revoke.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and not p.prosecdef
    and p.prosrc ~* '\mupdate\s+(only\s+)?(public\.)?wines\M';
  if v_text is not null then
    raise exception 'SECURITY INVOKER functions update wines: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- The fix (spec §16.3; review finding V2-2-01).
-- ===========================================================================
revoke update (position, added_via) on public.wines from authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. No client role holds UPDATE on wines: not on the table, not on any column,
  --    not through PUBLIC or a role membership. service_role keeps every column.
  select string_agg(format('%s.%s', r.rolname, a.attname), ', ' order by r.rolname, a.attnum)
    into v_text
  from (values ('anon'::name), ('authenticated'::name)) as r (rolname)
  cross join pg_attribute a
  where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege(r.rolname, 'public.wines'::regclass, a.attname::text, 'UPDATE');
  if v_text is not null
     or has_any_column_privilege('anon', 'public.wines', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.wines', 'UPDATE') then
    raise exception 'a client role still holds UPDATE on wines: %', coalesce(v_text, '(any column)');
  end if;
  if exists (select 1 from pg_attribute a
             where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped
               and not has_column_privilege('service_role', 'public.wines'::regclass, a.attname::text, 'UPDATE')) then
    raise exception 'service_role lost UPDATE on a wines column';
  end if;

  -- 2. No column-level grant is left on wines, and the table privileges are the
  --    dumped set (SELECT, INSERT and DELETE stay for the add path and its undo).
  select string_agg(format('%s:%s:%s', a.attname,
                           case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee)::text end,
                           x.privilege_type), ', ' order by a.attnum, x.privilege_type)
    into v_text
  from pg_attribute a
  cross join lateral aclexplode(a.attacl) x
  where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is not null then
    raise exception 'column-level privileges remain on wines: %', v_text;
  end if;
  select c.relacl::text into v_text from pg_class c where c.oid = 'public.wines'::regclass;
  if v_text is distinct from '{postgres=arwdDxtm/postgres,anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception 'wines table privileges changed: %', v_text;
  end if;

  -- 3. The three flight RPCs still write as an owner that holds UPDATE on wines.
  select string_agg(format('%s:%s:%s:%s', s.sig, coalesce(p.prosecdef::text, 'missing'), coalesce(p.proconfig::text, '-'),
                           coalesce(has_table_privilege(p.proowner, 'public.wines'::regclass, 'UPDATE')::text, '-')),
                    ', ' order by s.sig)
    into v_text
  from unnest(array['public.move_flight_glass(uuid,integer)', 'public.remove_flight_glass(uuid)',
                    'public.set_flight_glass_added_via(uuid,text)']) as s (sig)
  left join pg_proc p on p.oid = to_regprocedure(s.sig);
  if v_text is distinct from 'public.move_flight_glass(uuid,integer):true:{search_path=public}:true, public.remove_flight_glass(uuid):true:{search_path=public}:true, public.set_flight_glass_added_via(uuid,text):true:{search_path=public}:true' then
    raise exception 'the flight glass RPCs changed: %', v_text;
  end if;

  -- 4. Nothing else changed: every public function (body, ACL, security, config,
  --    volatility, owner), policy and trigger is as it was; the only privilege
  --    change is the two column grants this file revokes; no relation added or
  --    removed.
  select string_agg(format('%s %s', d.side, d.sig), ', ' order by d.sig) into v_text
  from (
    select case when pre.oid is null then 'new' when cur.oid is null then 'dropped' else 'changed' end as side,
           coalesce(cur.sig, pre.sig) as sig
    from wines_update_125500_functions pre
    full join (select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
                      p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile, p.proowner
               from pg_proc p where p.pronamespace = 'public'::regnamespace) cur
      on cur.oid = pre.oid
    where pre.oid is null or cur.oid is null
       or (pre.sig, pre.body, pre.acl, pre.prosecdef, pre.config, pre.provolatile, pre.proowner)
          is distinct from (cur.sig, cur.body, cur.acl, cur.prosecdef, cur.config, cur.provolatile, cur.proowner)
  ) d;
  if v_text is not null then
    raise exception 'public functions changed: %', v_text;
  end if;

  select string_agg(format('%s.%s', coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)), ', ')
    into v_text
  from wines_update_125500_policies pre
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
  from wines_update_125500_triggers pre
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
     from wines_update_125500_acl pre
     except
     select 'lost', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur)
    union all
    (select 'gained', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur
     except
     select 'gained', pre.tbl, pre.col, pre.grantee, pre.privilege_type, pre.is_grantable
     from wines_update_125500_acl pre)
  )
  select string_agg(format('%s %s.%s %s %s', side, tbl, col,
                           case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee)::text end, privilege_type),
                    ', ' order by side collate "C", tbl collate "C", col collate "C")
    into v_text
  from diff;
  if v_text is distinct from 'lost wines.added_via authenticated UPDATE, lost wines.position authenticated UPDATE' then
    raise exception 'table or column privileges changed beyond the two wines column grants: %', v_text;
  end if;

  if (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace)
       <> (select functions from wines_update_125500_counts)
     or (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace)
       <> (select relations from wines_update_125500_counts) then
    raise exception 'public functions or relations were added or removed';
  end if;
end $$;

drop table wines_update_125500_functions;
drop table wines_update_125500_policies;
drop table wines_update_125500_triggers;
drop table wines_update_125500_acl;
drop table wines_update_125500_counts;
