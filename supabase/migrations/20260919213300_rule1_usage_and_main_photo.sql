-- rule1_usage_and_main_photo: two pre-existing rule-1 leaks found during the
-- scan-photos review (docs/superpowers/specs/2026-09-19-scan-photos.md §12
-- F2, F3), closed at the database.
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md (§4
-- is the SQL design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19):
-- * 20260919183100 (catalog_wine_photos) was the newest live version; no row
--   for 20260919213300 (live, origin/master or any worktree; the listing
--   worktree's 20260919203000 is independent of this file); none of the
--   functions or triggers this file creates.
-- * catalog_wine_usage(uuid) and catalog_wine_holdings(uuid[]) are SECURITY
--   DEFINER, EXECUTE for PUBLIC, anon, authenticated and service_role.
--   usage.appearance_count counts every wine_answers row (unrevealed glasses
--   included); usage.holders/bottles/consumption_count and holdings count
--   every cellar lot and consumption, so the D11 draw-down at Start
--   (draw_down_flight_cellar_lots / pour_cellar_lot_into_glass: lot -1, a
--   DRANK consumption +1, linked from wine_pour_intents.cellar_consumption_id)
--   shows in them even from a PRIVATE cellar.
-- * catalog_wines: authenticated holds table-level UPDATE; "catalog update"
--   admits the creator or a curator; triggers are exactly catalog_wines_audit
--   (AFTER UPDATE: a catalog_wine_edits row with editor, before and after),
--   catalog_wines_seed_grapes (AFTER INSERT) and catalog_wines_set_updated_at
--   (BEFORE UPDATE). catalog_wine_grapes: authenticated holds every privilege;
--   "cwg write" admits the wine's creator or a curator; one trigger,
--   catalog_wine_grapes_recompute (AFTER, rewrites primary/secondary).
--
-- What this migration does:
-- F2. catalog_wine_usage and catalog_wine_holdings return numbers no
--     unrevealed glass moves: appearance_count counts revealed glasses only,
--     and a bottle poured from a cellar lot into a glass that is not revealed
--     yet (catalog_wine_masked_pours) still counts as in that cellar and not
--     as drunk. EXECUTE is revoked from PUBLIC and anon.
-- F3. A signed-in client's own UPDATE of catalog_wines, or INSERT, UPDATE or
--     DELETE of catalog_wine_grapes, on a wine that is not blind_pending is
--     refused (42501) when the caller added a still-unrevealed glass of that
--     wine (attach_catalog_wine_photo's step 7). Writes made by other
--     triggers (blind_pending bookkeeping, the blend recompute, the seed) run
--     at trigger depth > 1 and are never judged; service_role and scripts
--     (no auth.uid()) are never judged.
--
-- Rule 1: every refusal depends only on the caller's own glasses; every
-- count is the same for every caller.
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
  -- 1. The scan-photos migration (whose step 7 the guard mirrors) is live.
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919183100') then
    raise exception '20260919183100 (catalog_wine_photos) is not applied; apply it first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('catalog_wine_masked_pours', 'catalog_wine_in_callers_unrevealed_glass',
                      'catalog_wines_rule1_guard', 'catalog_wine_grapes_rule1_guard');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(format('%s.%s', t.tgrelid::regclass::text, t.tgname), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('catalog_wines_rule1_guard', 'catalog_wine_grapes_rule1_guard');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 3. The two bodies replaced, and every body this file relies on, are the
  --    live ones (md5 of prosrc with any CR stripped):
  --    * usage/holdings: replaced here;
  --    * attach_catalog_wine_photo: its step 7 is the predicate mirrored;
  --    * draw_down_flight_cellar_lots / pour_cellar_lot_into_glass: one
  --      consumption per intent, linked by cellar_consumption_id (masking);
  --    * mark/unmark blind_pending, the seed and the blend recompute: they
  --      write catalog_wines / catalog_wine_grapes from inside a trigger, the
  --      depth the guards exempt;
  --    * merge_catalog_wines: moves the loser's answer keys before it sets
  --      merged_into, so the guard never refuses it.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.catalog_wine_usage(uuid)', 'a797b959a9806a853f6f1a15d87befcb'),
    ('public.catalog_wine_holdings(uuid[])', '52205058c105fb22a193c09f82f853f8'),
    ('public.attach_catalog_wine_photo(uuid,text,text)', 'e287a2a46c54937870951a9c297683c9'),
    ('public.draw_down_flight_cellar_lots(uuid)', '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.pour_cellar_lot_into_glass(uuid)', '558e60723fa745ead80dd0dc75871411'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d'),
    ('public.catalog_wine_unmark_blind()', 'f9e3bf5208ceddd18a9b334c585965cc'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.tg_seed_catalog_wine_grapes()', '0b492539fd7d4f0c22ceda7168462ddd'),
    ('public.tg_recompute_catalog_wine_grapes()', 'ca6c3c1f3e46a8f779743eba8a92713a'),
    ('public.recompute_catalog_wine_grapes(uuid)', 'd21ce2d57f0f5710ad4bdff46f4f35a0'),
    ('public.merge_catalog_wines(uuid,uuid)', '82c43b99a3f136acd5d772bd16f4e2d6')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. usage/holdings: SECURITY DEFINER, stable, sql, search_path=public,
  --    EXECUTE for PUBLIC, anon, authenticated, service_role (the ACL the
  --    revokes below narrow).
  select string_agg(format('%s %s %s %s %s', p.oid::regprocedure::text, p.prosecdef, p.provolatile,
                           p.proconfig::text,
                           (select string_agg(x.g, ',' order by x.g collate "C")
                              from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                                         when a.grantee = p.proowner then 'OWNER'
                                                         else pg_get_userbyid(a.grantee)::text end as g
                                      from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE') x)),
                    '; ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.catalog_wine_usage(uuid)'), to_regprocedure('public.catalog_wine_holdings(uuid[])'));
  if v_text is distinct from
       'catalog_wine_holdings(uuid[]) t s {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role; '
       || 'catalog_wine_usage(uuid) t s {search_path=public} OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'usage/holdings attributes or EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The triggers on the two guarded tables are exactly the live ones.
  select string_agg(format('%s.%s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.catalog_wines'::regclass, 'public.catalog_wine_grapes'::regclass) and not t.tgisinternal;
  if v_text is distinct from
       'catalog_wine_grapes.catalog_wine_grapes_recompute 29 tg_recompute_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_audit 17 audit_catalog_wine_edit(); '
       || 'catalog_wines.catalog_wines_seed_grapes 5 tg_seed_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_set_updated_at 19 set_updated_at()' then
    raise exception 'catalog_wines / catalog_wine_grapes triggers differ from live: %', v_text;
  end if;

  -- 6. The columns the new bodies read.
  select string_agg(s.col, ', ') into v_text
  from (values
    ('cellar_lots', 'catalog_wine_id'), ('cellar_lots', 'owner_id'), ('cellar_lots', 'quantity'),
    ('cellar_consumptions', 'lot_id'), ('cellar_consumptions', 'catalog_wine_id'), ('cellar_consumptions', 'quantity'),
    ('wine_pour_intents', 'wine_id'), ('wine_pour_intents', 'cellar_consumption_id'),
    ('wines', 'is_revealed'), ('wines', 'added_by_host'), ('wines', 'contributor_participant_id'), ('wines', 'tasting_id'),
    ('wine_answers', 'catalog_wine_id'), ('tastings', 'host_id'), ('tasting_participants', 'user_id'),
    ('catalog_wines', 'blind_pending'), ('catalog_wine_grapes', 'catalog_wine_id')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §4 SQL
-- ===========================================================================

-- F2 ------------------------------------------------------------------------

-- A bottle drawn from a cellar lot into a glass (D11: draw_down_flight_cellar_lots
-- at Start, pour_cellar_lot_into_glass while running) whose glass is not revealed
-- yet. Every shared count reads it as still in its cellar, and not drunk, until
-- that reveal. Internal: no client EXECUTE.
create function catalog_wine_masked_pours(p_ids uuid[])
returns table (consumption_id uuid, lot_id uuid, catalog_wine_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.lot_id, c.catalog_wine_id, c.quantity
    from cellar_consumptions c
   where c.catalog_wine_id = any(p_ids)
     and exists (select 1
                   from wine_pour_intents i
                   join wines w on w.id = i.wine_id
                  where i.cellar_consumption_id = c.id
                    and not w.is_revealed);
$$;

create or replace function catalog_wine_usage(p_id uuid)
returns table (
  holders int,
  bottles int,
  lot_count int,
  note_count int,
  appearance_count int,
  consumption_count int
)
language sql
security definer
set search_path = public
stable
as $$
  with masked as (
    select m.consumption_id, m.lot_id, m.quantity from catalog_wine_masked_pours(array[p_id]) m
  ),
  counted as (
    select l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = p_id
  )
  select
    (select count(distinct owner_id)::int from counted where quantity > 0),
    (select coalesce(sum(quantity), 0)::int from counted where quantity > 0),
    (select count(*)::int from cellar_lots where catalog_wine_id = p_id),
    (select count(*)::int from wset_notes where catalog_wine_id = p_id),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

create or replace function catalog_wine_holdings(p_ids uuid[])
returns table (catalog_wine_id uuid, holders integer, bottles integer)
language sql
stable
security definer
set search_path = public
as $$
  with masked as (
    select m.lot_id, m.quantity from catalog_wine_masked_pours(p_ids) m
  ),
  counted as (
    select l.catalog_wine_id, l.owner_id,
           l.quantity + coalesce((select sum(m.quantity) from masked m where m.lot_id = l.id), 0) as quantity
      from cellar_lots l
     where l.catalog_wine_id = any(p_ids)
  )
  select counted.catalog_wine_id,
         count(distinct counted.owner_id)::int as holders,
         coalesce(sum(counted.quantity), 0)::int as bottles
    from counted
   where counted.quantity > 0
   group by counted.catalog_wine_id;
$$;

revoke execute on function catalog_wine_usage(uuid) from public, anon;
revoke execute on function catalog_wine_holdings(uuid[]) from public, anon;
grant execute on function catalog_wine_usage(uuid) to authenticated, service_role;
grant execute on function catalog_wine_holdings(uuid[]) to authenticated, service_role;
revoke execute on function catalog_wine_masked_pours(uuid[]) from public, anon, authenticated, service_role;

-- F3 ------------------------------------------------------------------------

-- attach_catalog_wine_photo's step 7 (20260919183100): the caller added a glass
-- of this wine that is not revealed yet — the host for a host-added glass, the
-- contributor for a bring-your-own glass. Only the caller's own glasses are
-- ever consulted. Internal: no client EXECUTE (the guards run as its owner).
create function catalog_wine_in_callers_unrevealed_glass(p_catalog_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from wine_answers wa
      join wines w on w.id = wa.wine_id
      join tastings t on t.id = w.tasting_id
      left join tasting_participants tp on tp.id = w.contributor_participant_id
     where wa.catalog_wine_id = p_catalog_wine_id
       and not w.is_revealed
       and case when w.added_by_host then t.host_id = auth.uid() else tp.user_id = auth.uid() end
  );
$$;

-- A signed-in client's own UPDATE of a catalog wine that is public, or becomes
-- public, while the caller has it in a glass they added that is not revealed
-- yet: refused. Any such change (a main photo, a description, a name, even a
-- no-op save, which still stamps updated_at and an edit-audit row naming the
-- editor) would show everyone which wine that glass holds.
create function catalog_wines_rule1_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only a statement the client issued itself: blind_pending's mark/unmark,
  -- the blend recompute and every other trigger's write run deeper.
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return new;
  end if;
  -- Hidden before and after: "catalog read" admits only its creator, a
  -- curator, and whoever can already read an answer key naming it. Each of
  -- them can read the hidden row anyway, so the change shows no one a wine
  -- they could not already read (spec D6).
  if old.blind_pending and new.blind_pending then
    return new;
  end if;
  if catalog_wine_in_callers_unrevealed_glass(old.id)
     or (new.id is distinct from old.id and catalog_wine_in_callers_unrevealed_glass(new.id)) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change it after the reveal.';
  end if;
  return new;
end $$;

-- The same rule for the wine's blend (catalog_wine_grapes is read through
-- "catalog read"): a public wine's blend is not written by the adder of one of
-- its unrevealed glasses.
create function catalog_wine_grapes_rule1_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[] := '{}';
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    v_ids := v_ids || old.catalog_wine_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_ids := v_ids || new.catalog_wine_id;
  end if;
  if exists (select 1 from catalog_wines cw
              where cw.id = any(v_ids)
                and not cw.blind_pending
                and catalog_wine_in_callers_unrevealed_glass(cw.id)) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change it after the reveal.';
  end if;
  return coalesce(new, old);
end $$;

create trigger catalog_wines_rule1_guard
  before update on catalog_wines
  for each row execute function catalog_wines_rule1_guard();

create trigger catalog_wine_grapes_rule1_guard
  before insert or update or delete on catalog_wine_grapes
  for each row execute function catalog_wine_grapes_rule1_guard();

revoke execute on function catalog_wine_in_callers_unrevealed_glass(uuid) from public, anon, authenticated, service_role;
revoke execute on function catalog_wines_rule1_guard() from public, anon, authenticated, service_role;
revoke execute on function catalog_wine_grapes_rule1_guard() from public, anon, authenticated, service_role;

-- ===========================================================================
-- END SPEC §4 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_n int;
begin
  -- 1. The six functions: security, search_path, volatility, language, return
  --    type, set-returning, arguments, body (md5 of prosrc, CR stripped) and
  --    the roles holding EXECUTE ("OWNER" is the function owner).
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
      ('public.catalog_wine_usage(uuid)', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_id uuid', '8544e9afe31d30c26d516e68b19fca23', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_holdings(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', 'af3b6c87fcbfbbbf46c210d84f3b5b00', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_masked_pours(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', '7e2054d9001878a17672aedd11d7bfcb', 'OWNER'),
      ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', true, '{search_path=public}', 's', 'sql', 'boolean', false,
       'p_catalog_wine_id uuid', 'f33fbd7f4e283cb0ed682469aa6ea2c2', 'OWNER'),
      ('public.catalog_wines_rule1_guard()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'd7ab319ef77e4516f32f8d22ff531833', 'OWNER'),
      ('public.catalog_wine_grapes_rule1_guard()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '03f00cf6346e62794a89c2cd938e4ea9', 'OWNER')
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

  -- 2. What each role can call: the two counts for authenticated and
  --    service_role only; the helpers and the guards for nobody.
  if not has_function_privilege('authenticated', 'public.catalog_wine_usage(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.catalog_wine_holdings(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_usage(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_holdings(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_masked_pours(uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_masked_pours(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE is not: usage/holdings authenticated + service_role; helpers nobody';
  end if;

  -- 3. The guards: row-level BEFORE triggers, enabled, exactly these events,
  --    and the full trigger lists of both tables.
  select string_agg(format('%s.%s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.catalog_wines'::regclass, 'public.catalog_wine_grapes'::regclass) and not t.tgisinternal;
  if v_text is distinct from
       'catalog_wine_grapes.catalog_wine_grapes_recompute 29 O tg_recompute_catalog_wine_grapes(); '
       || 'catalog_wine_grapes.catalog_wine_grapes_rule1_guard 31 O catalog_wine_grapes_rule1_guard(); '
       || 'catalog_wines.catalog_wines_audit 17 O audit_catalog_wine_edit(); '
       || 'catalog_wines.catalog_wines_rule1_guard 19 O catalog_wines_rule1_guard(); '
       || 'catalog_wines.catalog_wines_seed_grapes 5 O tg_seed_catalog_wine_grapes(); '
       || 'catalog_wines.catalog_wines_set_updated_at 19 O set_updated_at()' then
    raise exception 'catalog_wines / catalog_wine_grapes triggers post-migration are %', v_text;
  end if;

  -- 4. No live number moves where no glass is hidden: for every catalog wine
  --    with no unrevealed glass and no masked pour, the new usage and holdings
  --    equal the formulas they replace.
  select count(*) into v_n
  from catalog_wines cw
  cross join lateral catalog_wine_usage(cw.id) u
  where not exists (select 1 from wine_answers wa join wines w on w.id = wa.wine_id
                    where wa.catalog_wine_id = cw.id and not w.is_revealed)
    and not exists (select 1 from catalog_wine_masked_pours(array[cw.id]))
    and (u.holders, u.bottles, u.lot_count, u.note_count, u.appearance_count, u.consumption_count)
        is distinct from (
          (select count(distinct owner_id)::int from cellar_lots where catalog_wine_id = cw.id and quantity > 0),
          (select coalesce(sum(quantity), 0)::int from cellar_lots where catalog_wine_id = cw.id and quantity > 0),
          (select count(*)::int from cellar_lots where catalog_wine_id = cw.id),
          (select count(*)::int from wset_notes where catalog_wine_id = cw.id),
          (select count(*)::int from wine_answers where catalog_wine_id = cw.id),
          (select count(*)::int from cellar_consumptions where catalog_wine_id = cw.id));
  if v_n > 0 then
    raise exception 'catalog_wine_usage changed % live wines that hold no hidden glass', v_n;
  end if;
  with n as (
    select h.catalog_wine_id, h.holders, h.bottles
      from catalog_wine_holdings(array(select id from catalog_wines)) h
     where not exists (select 1 from catalog_wine_masked_pours(array[h.catalog_wine_id]))
  ),
  o as (
    select l.catalog_wine_id, count(distinct l.owner_id)::int as holders, coalesce(sum(l.quantity), 0)::int as bottles
      from cellar_lots l
     where l.quantity > 0
       and not exists (select 1 from catalog_wine_masked_pours(array[l.catalog_wine_id]))
     group by l.catalog_wine_id
  )
  select count(*) into v_n
  from ((select * from n except select * from o) union all (select * from o except select * from n)) d;
  if v_n > 0 then
    raise exception 'catalog_wine_holdings changed % live wines that hold no masked pour', v_n;
  end if;

  raise notice 'rule1 usage/main photo: usage acl %; holdings acl %',
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_usage(uuid)')),
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_holdings(uuid[])'));
end $$;
