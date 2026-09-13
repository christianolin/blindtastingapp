-- Add-wine v2 (D7, D13, spec §E.3): incomplete glasses, and how a glass was added.
-- A glass added from a partial read, or left for later, is a `wines` row plus an
-- owner-only `wine_identity_drafts` row, with no `wine_answers` until it is
-- complete. `is_wine_adder` is the SECURITY DEFINER adder check that the new
-- policies (here and in 20260912103000) use, so no policy subqueries wines or
-- tasting_participants (CLAUDE.md, RLS recursion). `tasting_incomplete_glasses`
-- returns field keys only, never draft values, so participants may call it: the
-- Start warning, the reveal refusal, auto-reveal and locking run in their sessions.
-- No field key is written in SQL: the keys live only in src/lib/wine-identity (D2),
-- so flipping D3 changes no SQL (spec §B.3). No begin/commit: the applier wraps the file.

-- 1. How a glass was added (D13's identity line). Null for legacy rows.
alter table public.wines
  add column added_via text
  check (added_via in ('SCAN', 'CATALOG', 'CELLAR', 'BY_HAND'));

-- 2. Who added a glass: the host for a glass with no contributor, else the contributor.
create or replace function public.is_wine_adder(p_wine_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = p_wine_id
      and (
        (w.contributor_participant_id is null and t.host_id = auth.uid())
        or p.user_id = auth.uid()
      )
  )
$$;
grant execute on function public.is_wine_adder(uuid) to authenticated;

-- 3. An incomplete glass: a wines row and a draft, with no wine_answers until it is complete.
create table public.wine_identity_drafts (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft jsonb not null,
  -- Field keys live only in src/lib/wine-identity (D2); SQL checks only that the list is non-empty.
  missing text[] not null check (cardinality(missing) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wine_identity_drafts enable row level security;

create policy "wine_identity_drafts own select" on public.wine_identity_drafts
  for select to authenticated using (owner_id = auth.uid());
create policy "wine_identity_drafts own insert" on public.wine_identity_drafts
  for insert to authenticated with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_identity_drafts own update" on public.wine_identity_drafts
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and is_wine_adder(wine_id));
create policy "wine_identity_drafts own delete" on public.wine_identity_drafts
  for delete to authenticated using (owner_id = auth.uid());

-- 4. A glass is never both: an answer key clears its draft, and a draft is refused for an answered glass.
create or replace function public.wine_answers_clear_identity_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from wine_identity_drafts where wine_id = new.wine_id;
  return null;
end $$;

create trigger trg_wine_answers_clear_identity_draft
  after insert on public.wine_answers
  for each row execute function public.wine_answers_clear_identity_draft();

create or replace function public.wine_identity_drafts_refuse_answered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from wine_answers where wine_id = new.wine_id) then
    raise exception 'glass % already has an answer key', new.wine_id;
  end if;
  return new;
end $$;

create trigger trg_wine_identity_drafts_refuse_answered
  before insert on public.wine_identity_drafts
  for each row execute function public.wine_identity_drafts_refuse_answered();

-- 5. Start / reveal gating: every glass with no answer key, its list-order number, and only its missing field keys.
create or replace function public.tasting_incomplete_glasses(p_tasting_id uuid)
returns table (wine_id uuid, glass integer, missing text[])
language sql
stable
security definer
set search_path = public
as $$
  select g.id,
         g.glass,
         coalesce(d.missing, '{}'::text[])   -- no draft: toIncompleteGlasses expands an empty list to every field
  from (
    select w.id, (row_number() over (order by w.position))::int as glass
    from wines w
    where w.tasting_id = p_tasting_id
  ) g
  left join wine_identity_drafts d on d.wine_id = g.id
  where not exists (select 1 from wine_answers a where a.wine_id = g.id)
    and (is_tasting_host(p_tasting_id) or is_tasting_participant(p_tasting_id))
  order by g.glass
$$;
grant execute on function public.tasting_incomplete_glasses(uuid) to authenticated;

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version
-- must never exist without the DDL it names. The behavioural half builds its rows
-- inside a synthetic-rollback subtransaction (spec §E.0), so neither a dry nor a
-- live apply leaves a row behind. The synthetic drafts carry opaque placeholder
-- keys: no field key is ever written in SQL (spec §B.3).
do $$
declare
  v_bad text;
  v_sig text;
  v_oid oid;
  v_secdef boolean;
  v_config text[];
  v_profiles uuid[];
  v_a uuid;
  v_b uuid;
  v_c uuid;
  v_cw uuid;
  v_country uuid;
  v_region uuid;
  v_grape uuid;
  v_producer uuid;
  v_tasting uuid;
  v_pa uuid;
  v_pb uuid;
  v_wd uuid;   -- glass 1: the host's glass, with A's draft
  v_wn uuid;   -- glass 2: the host's glass, with neither a draft nor an answer key
  v_wa uuid;   -- glass 3: the host's glass, with A's draft and then an answer key
  v_wb uuid;   -- glass 4: B's own bottle, with B's draft
  v_ran boolean := false;
  v_adder jsonb;
  v_a_inserted int;
  v_a_updated int;
  v_a_sees int;
  v_a_sees_b int;
  v_b_sees int;
  v_b_updated int;
  v_b_deleted int;
  v_b_refused boolean := false;
  v_b_inserted int;
  v_b_glasses jsonb;
  v_c_glasses int;
  v_draft_after_answer int;
  v_answered_refused boolean := false;
  v_answered_message text;
  v_b_glasses_after jsonb;
begin
  -- 1. wines.added_via: a nullable text column holding how a glass was added (D13).
  if not exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.wines'::regclass
      and a.attname = 'added_via'
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid = 'text'::regtype
      and not a.attnotnull
  ) then
    raise exception 'wines.added_via missing, not text, or not nullable post-migration';
  end if;
  if not exists (
    select 1
    from pg_constraint k
    where k.conrelid = 'public.wines'::regclass
      and k.contype = 'c'
      and pg_get_constraintdef(k.oid)
        = 'CHECK ((added_via = ANY (ARRAY[''SCAN''::text, ''CATALOG''::text, ''CELLAR''::text, ''BY_HAND''::text])))'
  ) then
    raise exception 'wines.added_via check missing or changed post-migration';
  end if;

  -- 2. wine_identity_drafts: the table with row level security on, its six columns,
  --    its keys, and a missing-list check that only requires the list to be non-empty.
  if to_regclass('public.wine_identity_drafts') is null then
    raise exception 'wine_identity_drafts table missing post-migration';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_identity_drafts'::regclass) then
    raise exception 'row level security is off on wine_identity_drafts post-migration';
  end if;

  with expected (column_name, data_type, not_null) as (
    values
      ('wine_id', 'uuid', true),
      ('owner_id', 'uuid', true),
      ('draft', 'jsonb', true),
      ('missing', 'text[]', true),
      ('created_at', 'timestamp with time zone', true),
      ('updated_at', 'timestamp with time zone', true)
  ),
  live as (
    select a.attname::text as column_name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null
    from pg_attribute a
    where a.attrelid = 'public.wine_identity_drafts'::regclass
      and a.attnum > 0
      and not a.attisdropped
  )
  select string_agg(coalesce(e.column_name, l.column_name), ', ') into v_bad
  from expected e
  full join live l on l.column_name = e.column_name
  where e.column_name is null
     or l.column_name is null
     or l.data_type is distinct from e.data_type
     or l.not_null is distinct from e.not_null;
  if v_bad is not null then
    raise exception 'wine_identity_drafts columns differ from the six expected post-migration: %', v_bad;
  end if;

  if not exists (
    select 1
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'public.wine_identity_drafts'::regclass
      and k.contype = 'p'
      and cardinality(k.conkey) = 1
      and a.attname = 'wine_id'
  ) then
    raise exception 'wine_identity_drafts primary key is not wine_id post-migration';
  end if;

  with expected (column_name, target, deltype) as (
    values
      ('wine_id', 'public.wines'::regclass, 'c'::"char"),
      ('owner_id', 'auth.users'::regclass, 'c'::"char")
  )
  select string_agg(e.column_name, ', ') into v_bad
  from expected e
  where not exists (
    select 1
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'public.wine_identity_drafts'::regclass
      and k.contype = 'f'
      and cardinality(k.conkey) = 1
      and a.attname = e.column_name
      and k.confrelid = e.target
      and k.confdeltype = e.deltype
  );
  if v_bad is not null then
    raise exception 'wine_identity_drafts foreign keys missing or not on delete cascade post-migration: %', v_bad;
  end if;

  select string_agg(pg_get_constraintdef(k.oid), '; ') into v_bad
  from pg_constraint k
  where k.conrelid = 'public.wine_identity_drafts'::regclass
    and k.contype = 'c';
  if v_bad is distinct from 'CHECK ((cardinality(missing) > 0))' then
    raise exception 'wine_identity_drafts checks must be exactly the non-empty missing list (no field keys in SQL) post-migration: %', v_bad;
  end if;

  -- 3. Exactly the four owner-only policies; writes also need is_wine_adder, and no
  --    policy reaches tasting_participants or wines by a raw subquery (CLAUDE.md).
  with expected (policyname, permissive, roles, cmd, qual, with_check) as (
    values
      ('wine_identity_drafts own select', 'PERMISSIVE', '{authenticated}', 'SELECT',
        '(owner_id = auth.uid())', null),
      ('wine_identity_drafts own insert', 'PERMISSIVE', '{authenticated}', 'INSERT',
        null, '((owner_id = auth.uid()) AND is_wine_adder(wine_id))'),
      ('wine_identity_drafts own update', 'PERMISSIVE', '{authenticated}', 'UPDATE',
        '(owner_id = auth.uid())', '((owner_id = auth.uid()) AND is_wine_adder(wine_id))'),
      ('wine_identity_drafts own delete', 'PERMISSIVE', '{authenticated}', 'DELETE',
        '(owner_id = auth.uid())', null)
  ),
  live as (
    select pol.policyname::text as policyname,
           pol.permissive,
           pol.roles::text as roles,
           pol.cmd,
           pol.qual,
           pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'wine_identity_drafts'
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
    raise exception 'wine_identity_drafts policies differ from the four owner-only policies post-migration: %', v_bad;
  end if;

  select string_agg(pol.policyname::text, '; ') into v_bad
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = 'wine_identity_drafts'
    and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '')) ilike any
          (array['%tasting_participants%', '%from wines%']);
  if v_bad is not null then
    raise exception 'wine_identity_drafts policies subquery tasting_participants or wines instead of is_wine_adder post-migration: %', v_bad;
  end if;

  -- 4. Both triggers. pg_trigger.tgtype bits: 1 = row, 2 = before, 4 = insert, so
  --    5 = AFTER INSERT FOR EACH ROW and 7 = BEFORE INSERT FOR EACH ROW.
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.wine_answers'::regclass
      and t.tgname = 'trg_wine_answers_clear_identity_draft'
      and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.wine_answers_clear_identity_draft()')::oid
      and t.tgtype = 5
      and t.tgenabled = 'O'
  ) then
    raise exception 'trg_wine_answers_clear_identity_draft missing or not AFTER INSERT FOR EACH ROW post-migration';
  end if;
  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid = 'public.wine_identity_drafts'::regclass
      and t.tgname = 'trg_wine_identity_drafts_refuse_answered'
      and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.wine_identity_drafts_refuse_answered()')::oid
      and t.tgtype = 7
      and t.tgenabled = 'O'
  ) then
    raise exception 'trg_wine_identity_drafts_refuse_answered missing or not BEFORE INSERT FOR EACH ROW post-migration';
  end if;

  -- 5. Every new function is SECURITY DEFINER and pins search_path=public; the two
  --    callable ones are executable by authenticated, and the glass list returns
  --    field keys only, never draft values.
  foreach v_sig in array array[
    'public.is_wine_adder(uuid)',
    'public.tasting_incomplete_glasses(uuid)',
    'public.wine_answers_clear_identity_draft()',
    'public.wine_identity_drafts_refuse_answered()'
  ] loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception '% missing post-migration', v_sig;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_config from pg_proc p where p.oid = v_oid;
    if not v_secdef then
      raise exception '% is not SECURITY DEFINER post-migration', v_sig;
    end if;
    if not ('search_path=public' = any (coalesce(v_config, '{}'::text[]))) then
      raise exception '% does not pin search_path=public post-migration (proconfig: %)', v_sig, v_config;
    end if;
  end loop;

  foreach v_sig in array array['public.is_wine_adder(uuid)', 'public.tasting_incomplete_glasses(uuid)'] loop
    if not has_function_privilege('authenticated', to_regprocedure(v_sig)::oid, 'EXECUTE') then
      raise exception '% is not executable by authenticated post-migration', v_sig;
    end if;
  end loop;

  if pg_get_function_result(to_regprocedure('public.is_wine_adder(uuid)')::oid) is distinct from 'boolean' then
    raise exception 'is_wine_adder no longer returns boolean post-migration';
  end if;
  if pg_get_function_result(to_regprocedure('public.tasting_incomplete_glasses(uuid)')::oid)
     is distinct from 'TABLE(wine_id uuid, glass integer, missing text[])' then
    raise exception 'tasting_incomplete_glasses must return (wine_id, glass, missing) only post-migration, returns %',
      pg_get_function_result(to_regprocedure('public.tasting_incomplete_glasses(uuid)')::oid);
  end if;

  -- 6. No glass is both drafted and answered.
  if exists (
    select 1
    from public.wine_identity_drafts d
    join public.wine_answers a on a.wine_id = d.wine_id
  ) then
    raise exception 'a glass has both an identity draft and an answer key post-migration';
  end if;

  -- 7. Behavioural (spec §E.0, §E.3). A synthetic DRAFT host-provides tasting hosted
  --    by A, with B JOINED and C outside it. Glasses are inserted out of position
  --    order, so their numbers must come from list order:
  --      glass 1 (position 10): the host's glass, A drafts it;
  --      glass 2 (position 20): the host's glass, no draft and no answer key;
  --      glass 3 (position 30): the host's glass, A drafts it, then it is answered;
  --      glass 4 (position 40): B's own bottle, B drafts it.
  --    Every observation is copied into a variable, which survives the rollback.
  select array_agg(s.id) into v_profiles
  from (select pr.id from public.profiles pr order by pr.id limit 3) s;
  select cw.id, cw.country_id, cw.region_id, cw.primary_grape_id, cw.producer_id
    into v_cw, v_country, v_region, v_grape, v_producer
  from public.catalog_wines cw
  order by cw.blind_pending desc, cw.id
  limit 1;

  if coalesce(array_length(v_profiles, 1), 0) < 3 or v_cw is null then
    raise notice '20260912102000: behavioural assertions skipped (needs three profiles and a catalog wine)';
  else
    v_a := v_profiles[1];
    v_b := v_profiles[2];
    v_c := v_profiles[3];
    begin
      insert into public.tastings (name, host_id, timing_mode, wine_source, status, reveal_mode)
      values ('synthetic wine_identity_drafts check', v_a, 'LIVE', 'HOST_PROVIDES', 'DRAFT', 'BLIND')
      returning id into v_tasting;
      insert into public.tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_a, 'JOINED', now())
      returning id into v_pa;
      insert into public.tasting_participants (tasting_id, user_id, status, joined_at)
      values (v_tasting, v_b, 'JOINED', now())
      returning id into v_pb;
      insert into public.wines (tasting_id, position) values (v_tasting, 30) returning id into v_wa;
      insert into public.wines (tasting_id, position, contributor_participant_id)
      values (v_tasting, 40, v_pb)
      returning id into v_wb;
      insert into public.wines (tasting_id, position) values (v_tasting, 20) returning id into v_wn;
      insert into public.wines (tasting_id, position) values (v_tasting, 10) returning id into v_wd;

      -- As A, the host: the adder of the host's glasses, never of B's bottle.
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      v_adder := jsonb_build_object(
        'host_on_host_glass', public.is_wine_adder(v_wd),
        'host_on_contributor_bottle', public.is_wine_adder(v_wb));
      insert into public.wine_identity_drafts (wine_id, owner_id, draft, missing)
      values (v_wd, v_a, '{"note": "synthetic"}'::jsonb, array['synthetic-key-1']),
             (v_wa, v_a, '{"note": "synthetic"}'::jsonb, array['synthetic-key-1']);
      get diagnostics v_a_inserted = row_count;
      update public.wine_identity_drafts d
         set missing = array['synthetic-key-1', 'synthetic-key-2'], updated_at = now()
       where d.wine_id = v_wd;
      get diagnostics v_a_updated = row_count;

      -- As B, a JOINED participant: blind to A's drafts, refused a draft on a glass
      -- B did not add, allowed one on B's own bottle, and sees only the key lists.
      perform set_config('request.jwt.claim.sub', v_b::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      v_adder := v_adder || jsonb_build_object(
        'participant_on_host_glass', public.is_wine_adder(v_wd),
        'contributor_on_own_bottle', public.is_wine_adder(v_wb));
      select count(*) into v_b_sees from public.wine_identity_drafts d where d.wine_id in (v_wd, v_wa);
      update public.wine_identity_drafts d set missing = array['synthetic-key-9'] where d.wine_id = v_wd;
      get diagnostics v_b_updated = row_count;
      delete from public.wine_identity_drafts d where d.wine_id = v_wd;
      get diagnostics v_b_deleted = row_count;
      begin
        insert into public.wine_identity_drafts (wine_id, owner_id, draft, missing)
        values (v_wn, v_b, '{}'::jsonb, array['synthetic-key-1']);
      exception
        when insufficient_privilege then
          v_b_refused := true;
      end;
      insert into public.wine_identity_drafts (wine_id, owner_id, draft, missing)
      values (v_wb, v_b, '{}'::jsonb, array['synthetic-key-3']);
      get diagnostics v_b_inserted = row_count;
      select jsonb_agg(jsonb_build_array(g.wine_id, g.glass, g.missing) order by g.glass)
        into v_b_glasses
      from public.tasting_incomplete_glasses(v_tasting) g;

      -- As A again: A's own drafts are visible, B's is not.
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      select count(*) into v_a_sees from public.wine_identity_drafts d where d.wine_id in (v_wd, v_wa);
      select count(*) into v_a_sees_b from public.wine_identity_drafts d where d.wine_id = v_wb;

      -- As C, outside the tasting: no glass list at all.
      perform set_config('request.jwt.claim.sub', v_c::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
      select count(*) into v_c_glasses from public.tasting_incomplete_glasses(v_tasting);

      -- An answer key for glass 3 clears its draft ...
      execute 'reset role';
      insert into public.wine_answers (
        wine_id, country_id, region_id, primary_grape_id, producer_id, vintage_kind, catalog_wine_id
      )
      values (v_wa, v_country, v_region, v_grape, v_producer, 'NV', v_cw);
      select count(*) into v_draft_after_answer from public.wine_identity_drafts d where d.wine_id = v_wa;

      -- ... and a new draft for the answered glass is refused, even for its adder.
      execute 'set local role authenticated';
      perform set_config('request.jwt.claim.sub', v_a::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      begin
        insert into public.wine_identity_drafts (wine_id, owner_id, draft, missing)
        values (v_wa, v_a, '{}'::jsonb, array['synthetic-key-1']);
      exception
        when raise_exception then
          v_answered_refused := true;
          get stacked diagnostics v_answered_message = message_text;
      end;

      -- As B: the answered glass leaves the list; the others keep their numbers.
      perform set_config('request.jwt.claim.sub', v_b::text, true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      select jsonb_agg(jsonb_build_array(g.wine_id, g.glass, g.missing) order by g.glass)
        into v_b_glasses_after
      from public.tasting_incomplete_glasses(v_tasting) g;

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;

    if not v_ran then
      raise exception '20260912102000: behavioural assertions did not run to completion';
    end if;
    if v_adder is distinct from jsonb_build_object(
         'host_on_host_glass', true,
         'host_on_contributor_bottle', false,
         'participant_on_host_glass', false,
         'contributor_on_own_bottle', true) then
      raise exception 'is_wine_adder: the host adds glasses with no contributor, a contributor adds their own bottle; observed %',
        v_adder;
    end if;
    if v_a_inserted is distinct from 2 then
      raise exception 'wine_identity_drafts: the adder could not draft their own glasses post-migration (% rows)', v_a_inserted;
    end if;
    if v_a_updated is distinct from 1 then
      raise exception 'wine_identity_drafts: the adder could not update their own draft post-migration (% rows)', v_a_updated;
    end if;
    if v_a_sees is distinct from 2 then
      raise exception 'wine_identity_drafts: the owner cannot read their own drafts post-migration (% rows)', v_a_sees;
    end if;
    if v_a_sees_b is distinct from 0 then
      raise exception 'wine_identity_drafts: the host can read a contributor''s draft post-migration';
    end if;
    if v_b_sees is distinct from 0 then
      raise exception 'wine_identity_drafts: a participant can read the host''s drafts post-migration';
    end if;
    if v_b_updated is distinct from 0 or v_b_deleted is distinct from 0 then
      raise exception 'wine_identity_drafts: a participant changed the host''s draft post-migration (updated %, deleted %)',
        v_b_updated, v_b_deleted;
    end if;
    if not v_b_refused then
      raise exception 'wine_identity_drafts: a participant who did not add a glass wrote a draft for it post-migration';
    end if;
    if v_b_inserted is distinct from 1 then
      raise exception 'wine_identity_drafts: a contributor could not draft their own bottle post-migration (% rows)', v_b_inserted;
    end if;
    if v_b_glasses is distinct from jsonb_build_array(
         jsonb_build_array(v_wd, 1, array['synthetic-key-1', 'synthetic-key-2']),
         jsonb_build_array(v_wn, 2, '{}'::text[]),
         jsonb_build_array(v_wa, 3, array['synthetic-key-1']),
         jsonb_build_array(v_wb, 4, array['synthetic-key-3'])) then
      raise exception 'tasting_incomplete_glasses for a participant: expected every unanswered glass in list order with its keys (empty with no draft), observed %',
        v_b_glasses;
    end if;
    if v_c_glasses is distinct from 0 then
      raise exception 'tasting_incomplete_glasses returned % rows to someone outside the tasting post-migration', v_c_glasses;
    end if;
    if v_draft_after_answer is distinct from 0 then
      raise exception 'an answer key did not clear its glass''s identity draft post-migration';
    end if;
    if not v_answered_refused
       or v_answered_message is distinct from format('glass %s already has an answer key', v_wa) then
      raise exception 'a draft for an answered glass was not refused post-migration (%)', coalesce(v_answered_message, 'no error');
    end if;
    if v_b_glasses_after is distinct from jsonb_build_array(
         jsonb_build_array(v_wd, 1, array['synthetic-key-1', 'synthetic-key-2']),
         jsonb_build_array(v_wn, 2, '{}'::text[]),
         jsonb_build_array(v_wb, 4, array['synthetic-key-3'])) then
      raise exception 'tasting_incomplete_glasses after an answer key: expected glasses 1, 2 and 4, observed %',
        v_b_glasses_after;
    end if;
    if exists (select 1 from public.tastings t where t.id = v_tasting) then
      raise exception '20260912102000: the synthetic tasting survived its rollback';
    end if;
  end if;
end $$;
