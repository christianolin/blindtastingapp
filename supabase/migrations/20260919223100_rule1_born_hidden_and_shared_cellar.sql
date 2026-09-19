-- rule1_born_hidden_and_shared_cellar: the additive half of the fix for the
-- older rule-1 leaks F5 and F8 (docs/superpowers/specs/2026-09-19-rule1-older-leaks.md;
-- the findings are §9 of docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md).
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-older-leaks.md (§5 is the SQL
-- design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19):
-- * 20260919214700 (label_lookups) is the newest live version; no row for
--   20260919223100 or 20260919223200 (live, origin/master or any worktree).
-- * find_or_create_catalog_wine(jsonb) is SECURITY INVOKER, EXECUTE for
--   PUBLIC, anon, authenticated and service_role; it inserts every new row
--   with blind_pending = false (the column default). A brand-new flight wine is
--   hidden only later, by catalog_wine_mark_blind at the answer-key insert,
--   a separate PostgREST request (F5: public for one round trip).
-- * cellar_lots "cellar own select" is owner_id = auth.uid() or
--   can_view_cellar(owner_id): a PUBLIC or FRIENDS cellar's lot rows, and the
--   quantity D11 draws down at Start, are read directly by its viewers (F8).
--   catalog_wine_masked_pours (20260919213300) already names every bottle
--   poured into a glass that is not revealed yet.
--
-- What this migration does (nothing a deployed app calls changes behaviour):
-- 1. find_or_create_catalog_wine honours an optional payload key "hidden":
--    a row it CREATES with "hidden": true is born blind_pending. A row it
--    finds is returned as it is. The deployed app never sends the key, so
--    nothing changes until the app that does is deployed (spec §6.1).
-- 2. shared_cellar_lots(p_owner): the owner's lots as someone else may see
--    them. It is gated like "cellar own select" (the owner, or
--    can_view_cellar), and every bottle poured into a glass that is not
--    revealed yet still counts as in its lot (catalog_wine_masked_pours);
--    updated_at reads as created_at, since a pour stamps it. Nothing is
--    narrowed here: 20260919223200 narrows "cellar own select" to the owner
--    once the app reads other people's cellars through this function.
--
-- Deploy order (spec §8): this file, then the app, then 20260919223200.
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
  -- 1. The rule-1 counts migration (whose catalog_wine_masked_pours this file
  --    reads) is live.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919213300') then
    raise exception '20260919213300 (rule1_usage_and_main_photo) is not applied; apply it first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  if to_regprocedure('public.shared_cellar_lots(uuid)') is not null then
    raise exception 'shared_cellar_lots(uuid) already exists; re-read live before applying';
  end if;

  -- 3. The body replaced, and every body this file relies on, are the live
  --    ones (md5 of prosrc with any CR stripped):
  --    * find_or_create_catalog_wine: replaced here;
  --    * catalog_wine_identity_match: the lookup it keeps calling;
  --    * catalog_wine_masked_pours: what shared_cellar_lots masks;
  --    * can_view_cellar: the gate shared_cellar_lots applies;
  --    * catalog_wine_mark_blind: until 20260919223200 it still hides a
  --      linked row at the answer insert, and never un-hides one.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.find_or_create_catalog_wine(jsonb)', '2cf9598f9b8640e6ef7bcfc4e30e82fb'),
    ('public.catalog_wine_identity_match(jsonb)', '763eb9a53dcb0ebb4dbeaf0c92073f35'),
    ('public.catalog_wine_masked_pours(uuid[])', '7e2054d9001878a17672aedd11d7bfcb'),
    ('public.can_view_cellar(uuid)', '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. find_or_create_catalog_wine: SECURITY INVOKER, volatile, plpgsql,
  --    search_path=public, EXECUTE for PUBLIC, anon, authenticated and
  --    service_role (create or replace keeps all of it).
  select format('%s %s %s %s', p.prosecdef, p.provolatile, p.proconfig::text,
                (select string_agg(x.g, ',' order by x.g collate "C")
                   from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                              when a.grantee = p.proowner then 'OWNER'
                                              else pg_get_userbyid(a.grantee)::text end as g
                           from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x))
    into v_text
  from pg_proc p
  where p.oid = to_regprocedure('public.find_or_create_catalog_wine(jsonb)');
  if v_text is distinct from 'f v {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'find_or_create_catalog_wine attributes or EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The columns the new bodies read or write.
  select string_agg(s.tbl || '.' || s.col, ', ') into v_text
  from (values
    ('catalog_wines', 'blind_pending'), ('catalog_wines', 'created_by'),
    ('cellar_lots', 'id'), ('cellar_lots', 'owner_id'), ('cellar_lots', 'catalog_wine_id'),
    ('cellar_lots', 'quantity'), ('cellar_lots', 'created_at'), ('cellar_lots', 'updated_at')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §5.1 SQL
-- ===========================================================================

-- F5: a wine created for a flight is born hidden. The flight path sends
-- "hidden": true (never for an OPEN board, whose glasses are revealed at
-- insert); every other caller sends nothing and gets a public row. A row that
-- already exists is returned unchanged, hidden or not (F4: a public wine is
-- never hidden because someone pours it).
create or replace function find_or_create_catalog_wine(p jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare v_id uuid;
begin
  v_id := public.catalog_wine_identity_match(p);
  if v_id is not null then return v_id; end if;

  insert into catalog_wines (
    country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
    producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
    colour, style, wine_name, created_by, blind_pending
  ) values (
    (p->>'country_id')::uuid, (p->>'region_id')::uuid, (p->>'appellation_id')::uuid,
    (p->>'primary_grape_id')::uuid, (p->>'secondary_grape_id')::uuid,
    (p->>'producer_id')::uuid, (p->>'type_designation_id')::uuid,
    (p->>'vintage_kind')::vintage_kind, (p->>'vintage_year')::int, (p->>'vintage_tawny_years')::int,
    (p->>'colour')::wine_colour, (p->>'style')::wine_style,
    nullif(btrim(p->>'wine_name'), ''), auth.uid(),
    coalesce((p->>'hidden')::boolean, false)
  ) returning id into v_id;
  return v_id;
end $$;

-- F8: someone's cellar as another person may see it. Gated like "cellar own
-- select" (the owner, or can_view_cellar). A bottle poured into a glass that is
-- not revealed yet (catalog_wine_masked_pours) still counts in its lot, and
-- updated_at reads as created_at for every lot, so neither a quantity nor a
-- timestamp moves when the host pours at Start. Returns cellar_lots rows so
-- PostgREST can embed the catalog wine exactly as a direct read does.
create function shared_cellar_lots(p_owner uuid)
returns setof cellar_lots
language sql
stable
security definer
set search_path = public
as $$
  with lots as (
    select l.*
      from cellar_lots l
     where l.owner_id = p_owner
       and (p_owner = auth.uid() or can_view_cellar(p_owner))
  ),
  masked as (
    select m.lot_id, sum(m.quantity)::int as quantity
      from catalog_wine_masked_pours(array(select distinct lots.catalog_wine_id from lots)) m
     group by m.lot_id
  )
  select (jsonb_populate_record(null::cellar_lots,
            to_jsonb(lots) || jsonb_build_object(
              'quantity', lots.quantity + coalesce(masked.quantity, 0),
              'updated_at', lots.created_at))).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

revoke execute on function shared_cellar_lots(uuid) from public, anon;
grant execute on function shared_cellar_lots(uuid) to authenticated, service_role;

-- ===========================================================================
-- END SPEC §5.1 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_owner record;
  v_claims text := current_setting('request.jwt.claims', true);
  v_n int;
begin
  -- 1. The two functions: security, search_path, volatility, language, return
  --    type, set-returning, arguments, body and the roles holding EXECUTE.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname, format_type(p.prorettype, null) as rettype_now, p.proretset,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.find_or_create_catalog_wine(jsonb)', false, '{search_path=public}', 'v', 'plpgsql', 'uuid', false,
       'p jsonb', '0e9e2f1142635473eb916125611ed7ef', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.shared_cellar_lots(uuid)', true, '{search_path=public}', 's', 'sql', 'cellar_lots', true,
       'p_owner uuid', 'c3da48f21c077f0a349e5d88e55b0ff7', 'OWNER,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lanname is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.proretset is distinct from v_fn.retset
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns % (set %), arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lanname, v_fn.rettype_now,
        v_fn.proretset, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;

  -- 2. What each role can call.
  if not has_function_privilege('authenticated', 'public.shared_cellar_lots(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.shared_cellar_lots(uuid)', 'EXECUTE') then
    raise exception 'shared_cellar_lots EXECUTE is not authenticated + service_role only';
  end if;

  -- 3. Where nothing is poured, the shared view is the owner's own truth: for
  --    every owner (read as that owner), exactly their lots, the same
  --    quantities for every lot with no masked pour, and updated_at = created_at.
  for v_owner in select distinct owner_id from cellar_lots loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner.owner_id, 'role', 'authenticated')::text, true);
    select count(*) into v_n
    from (
      (select s.id, s.quantity, s.updated_at from shared_cellar_lots(v_owner.owner_id) s
        where not exists (select 1 from catalog_wine_masked_pours(array[s.catalog_wine_id]) m where m.lot_id = s.id))
      except
      (select l.id, l.quantity, l.created_at from cellar_lots l where l.owner_id = v_owner.owner_id)
    ) d;
    if v_n > 0 then
      raise exception 'shared_cellar_lots differs from cellar_lots for owner % on % lots', v_owner.owner_id, v_n;
    end if;
    select count(*) into v_n
    from cellar_lots l
    where l.owner_id = v_owner.owner_id
      and not exists (select 1 from shared_cellar_lots(v_owner.owner_id) s where s.id = l.id);
    if v_n > 0 then
      raise exception 'shared_cellar_lots leaves out % lots of owner %', v_n, v_owner.owner_id;
    end if;
  end loop;
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end $$;
