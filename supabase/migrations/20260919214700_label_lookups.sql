-- label_lookups: every billed follow-up lookup of the label scan (owner fix C,
-- 2026-09-19), kept like label_reads keeps every billed read.
--
-- Spec: docs/superpowers/specs/2026-09-19-scan-region-appellation.md (§7 is the
-- SQL design this file implements, the DDL between the banners below verbatim;
-- D5 is its decision). Owner, 2026-09-19: "Its really important that we get
-- region and appellation in common wines like this one. Only the most obscure
-- its okay." When the resolver leaves a scanned wine's appellation missing
-- inside a region we trust, readLabelPhoto (src/app/scan/actions.ts) makes at
-- most ONE text-only Claude Sonnet 5 request that picks one name from our own
-- list of that region's appellations. CLAUDE.md: every billed call is kept.
--
-- Written against the LIVE state (read-only queries, 2026-09-19), never an
-- older migration file:
-- * Newest live version 20260919183100 (catalog_wine_photos); no
--   schema_migrations row for 20260919214700; no table or index of any name
--   this file creates; no local branch, remote-tracking ref or worktree names
--   this version.
-- * label_reads (20260912100100, append-only since 20260914150000): id uuid
--   PRIMARY KEY; user_id uuid not null REFERENCES auth.users(id) ON DELETE
--   CASCADE; exactly two policies, "label_reads own insert" (a, with check
--   user_id = auth.uid()) and "label_reads own select" (r, using user_id =
--   auth.uid()). Referenced so far only by catalog_wine_photos.label_read_id
--   (ON DELETE SET NULL, 20260919183100).
-- * scrub_deleted_account(uuid) (md5 bad163a7d72fcab774936383dc1b6f2a) runs
--   `delete from label_reads where user_id = p_user_id`;
--   attach_catalog_wine_photo(uuid, text, text) (md5
--   e287a2a46c54937870951a9c297683c9) picks a label_reads row by (user_id,
--   image_path) at its step 10. Neither is recreated here, and both are pinned
--   before and after.
-- * Supabase's default privileges grant anon, authenticated and service_role
--   everything on a new table (plus PUBLIC nothing): the revoke below undoes
--   that for PUBLIC, anon and authenticated, and the post-state block asserts
--   the result, not the default. service_role keeps the defaults.
--
-- Why a separate table and not a purpose column on label_reads (spec §7.1, D5):
-- a lookup row in label_reads could become a photo's label_read_id through
-- attach_catalog_wine_photo's (user_id, image_path) pick, so that deployed
-- function would have to be recreated with a filter; the scan quota
-- (src/lib/label-scan/quota.ts) counts every label_reads row of the last 24 h,
-- so every lookup would use up a scan; label_reads_read_matches_outcome ties
-- `read` to a LabelRead; and the replay fixtures assume every stored read is
-- one. A separate table changes no deployed function and no existing table.
--
-- What this migration does:
-- 1. label_lookups (id, label_read_id -> label_reads ON DELETE CASCADE, unique:
--    one follow-up per read; user_id -> auth.users ON DELETE CASCADE;
--    region_id and appellation_id recorded as they were, deliberately with no
--    FK, so catalog curation never trips on an audit row; candidates 1..300,
--    the gate's list cap; outcome 'answer' | 'no-answer' | 'discarded' |
--    'not-read'; answer text <= 200 chars, present exactly for answer and
--    discarded; appellation_id only on answer; model; the billed tokens;
--    created_at), with a (user_id, created_at desc) index for the owner's
--    newest-first reads and the cost query.
-- 2. RLS: the owner selects their own rows and inserts only against their own
--    label_reads row. No UPDATE and no DELETE policy: append-only, like
--    label_reads since 20260914150000. authenticated holds SELECT and INSERT
--    only; anon and PUBLIC nothing.
--
-- Account deletion needs no change: scrub_deleted_account's `delete from
-- label_reads where user_id = p_user_id` removes every lookup through the
-- cascade on label_read_id, and a hard delete of auth.users cascades through
-- user_id as well.
--
-- Deploy order: apply this migration BEFORE the app deploy that ships the
-- follow-up (readLabelPhoto's followUpAppellation + keepLookup). Nothing in the
-- currently deployed app reads or writes this table, so applying it first changes
-- no behaviour. The other way round is not safe: keepLookup only logs a failed
-- insert (never throws, so the scan carries on), which means every follow-up
-- billed while the table is missing (42P01) would be paid for and never recorded,
-- breaking the rule that every billed call is kept.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
begin
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.label_lookups') is not null
     or to_regclass('public.label_lookups_user_created_idx') is not null then
    raise exception 'label_lookups or its index already exists; re-read live before applying';
  end if;

  -- 2. label_reads: the key label_read_id references, and the owner's cascade
  --    from auth.users.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.label_reads'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname in ('id', 'user_id');
  if v_text is distinct from 'id uuid not null, user_id uuid not null' then
    raise exception 'label_reads id/user_id differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.label_reads'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)') then
    raise exception 'label_reads has no PRIMARY KEY (id) for label_lookups.label_read_id to reference';
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.label_reads'::regclass and k.contype = 'f'
                   and pg_get_constraintdef(k.oid) = 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE') then
    raise exception 'label_reads.user_id does not reference auth.users on delete cascade';
  end if;

  -- 3. label_reads is owner-only and append-only (the insert policy below leans
  --    on its select policy to see the caller's own read).
  select string_agg(format('%s %s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.label_reads'::regclass;
  if v_text is distinct from
       'label_reads own insert a {authenticated} - (user_id = auth.uid()); '
       || 'label_reads own select r {authenticated} (user_id = auth.uid()) -' then
    raise exception 'label_reads policies differ from the live state this file was written against: %', v_text;
  end if;

  -- 4. The deployed bodies this relies on without changing them: the account
  --    scrub deletes the owner's label_reads (the cascade does the rest), and
  --    the photo attach reads label_reads only (md5 of prosrc, CR stripped).
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_bad
  from (values
    ('public.scrub_deleted_account(uuid)',                 'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.attach_catalog_wine_photo(uuid,text,text)',   'e287a2a46c54937870951a9c297683c9')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'deployed bodies differ from the live ones this file was written against: %', v_bad;
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = to_regprocedure('public.scrub_deleted_account(uuid)')
                   and position('delete from label_reads where user_id = p_user_id' in p.prosrc) > 0) then
    raise exception 'scrub_deleted_account no longer deletes the owner''s label_reads';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §7.2, verbatim: the table, its index, RLS and grants (D5).
-- ---------------------------------------------------------------------------
create table public.label_lookups (
  id uuid primary key default gen_random_uuid(),
  label_read_id uuid not null unique references public.label_reads(id) on delete cascade,  -- one follow-up per read
  user_id uuid not null references auth.users(id) on delete cascade,
  region_id uuid,                -- recorded as it was; deliberately no FK to reference tables
  candidates integer not null check (candidates between 1 and 300),
  outcome text not null check (outcome in ('answer', 'no-answer', 'discarded', 'not-read')),
  answer text check (char_length(answer) <= 200),
  appellation_id uuid,           -- recorded as it was; no FK (catalog curation must never trip on an audit row)
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint label_lookups_answer_matches_outcome check ((answer is not null) = (outcome in ('answer', 'discarded'))),
  constraint label_lookups_appellation_only_on_answer check (appellation_id is null or outcome = 'answer')
);
create index label_lookups_user_created_idx on public.label_lookups (user_id, created_at desc);
alter table public.label_lookups enable row level security;
create policy "label_lookups own select" on public.label_lookups
  for select to authenticated using (user_id = auth.uid());
create policy "label_lookups own insert" on public.label_lookups
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.label_reads lr where lr.id = label_read_id and lr.user_id = auth.uid()));
-- No UPDATE and no DELETE policy: append-only, like label_reads since 20260914150000.
revoke all on table public.label_lookups from public, anon, authenticated;
grant select, insert on table public.label_lookups to authenticated;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception (spec §7.3).
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_bad text;
  v_a uuid;
  v_b uuid;
  v_read uuid;
  v_lookup uuid;
  v_ran boolean := false;
  v_a_sees int;
  v_a_update_refused boolean := false;
  v_a_delete_refused boolean := false;
  v_second_refused boolean := false;
  v_b_sees int;
  v_b_forged_own_refused boolean := false;
  v_b_forged_as_a_refused boolean := false;
  v_anon_refused boolean := false;
  v_after_cascade int;
begin
  -- 1. The twelve columns, in order, with types, nullability and defaults.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then '' else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.label_lookups'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), label_read_id uuid not null, user_id uuid not null, '
       || 'region_id uuid, candidates int4 not null, outcome text not null, answer text, appellation_id uuid, '
       || 'model text not null, input_tokens int4 not null default 0, output_tokens int4 not null default 0, '
       || 'created_at timestamptz not null default now()' then
    raise exception 'label_lookups columns differ from the spec: %', v_text;
  end if;

  -- 2. Constraints by name: the key, one lookup per read, both cascades, and
  --    the checks that keep a row honest about what was billed and answered.
  select string_agg(format('%s %s', k.conname, pg_get_constraintdef(k.oid)), '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.label_lookups'::regclass;
  if v_text is distinct from
       'label_lookups_answer_check CHECK ((char_length(answer) <= 200)); '
       || 'label_lookups_answer_matches_outcome CHECK (((answer IS NOT NULL) = (outcome = ANY (ARRAY[''answer''::text, ''discarded''::text])))); '
       || 'label_lookups_appellation_only_on_answer CHECK (((appellation_id IS NULL) OR (outcome = ''answer''::text))); '
       || 'label_lookups_candidates_check CHECK (((candidates >= 1) AND (candidates <= 300))); '
       || 'label_lookups_input_tokens_check CHECK ((input_tokens >= 0)); '
       || 'label_lookups_label_read_id_fkey FOREIGN KEY (label_read_id) REFERENCES label_reads(id) ON DELETE CASCADE; '
       || 'label_lookups_label_read_id_key UNIQUE (label_read_id); '
       || 'label_lookups_outcome_check CHECK ((outcome = ANY (ARRAY[''answer''::text, ''no-answer''::text, ''discarded''::text, ''not-read''::text]))); '
       || 'label_lookups_output_tokens_check CHECK ((output_tokens >= 0)); '
       || 'label_lookups_pkey PRIMARY KEY (id); '
       || 'label_lookups_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE' then
    raise exception 'label_lookups constraints differ from the spec: %', v_text;
  end if;
  if (select count(*) from pg_constraint k
      where k.conrelid = 'public.label_lookups'::regclass and k.contype = 'f' and k.confdeltype = 'c') <> 2 then
    raise exception 'label_lookups foreign keys do not both cascade';
  end if;
  if not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = 'label_lookups_label_read_id_key'
                   and i.indexdef like 'CREATE UNIQUE INDEX % USING btree (label_read_id)')
     or not exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = 'label_lookups_user_created_idx'
                      and i.indexdef like '% USING btree (user_id, created_at DESC)') then
    raise exception 'a label_lookups index is missing or changed';
  end if;

  -- 3. RLS on, not forced; exactly the two owner-only policies, none that can
  --    UPDATE or DELETE (w, d or *). pg_get_expr lays a subquery out over
  --    several lines, so whitespace runs are folded to one space first.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.label_lookups'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'label_lookups row level security is not enabled, or is forced';
  end if;
  select regexp_replace(
           string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                             p.polroles::regrole[]::text,
                             coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                      '; ' order by p.polname::text collate "C"),
           '\s+', ' ', 'g')
    into v_text
  from pg_policy p
  where p.polrelid = 'public.label_lookups'::regclass;
  if v_text is distinct from
       'label_lookups own insert a permissive {authenticated} - ((user_id = auth.uid()) AND (EXISTS ( SELECT 1 '
       || 'FROM label_reads lr WHERE ((lr.id = label_lookups.label_read_id) AND (lr.user_id = auth.uid()))))); '
       || 'label_lookups own select r permissive {authenticated} (user_id = auth.uid()) -' then
    raise exception 'label_lookups policies differ from the spec: %', v_text;
  end if;

  -- 4. Privileges: authenticated SELECT and INSERT only, at table level; no
  --    column grants; anon and PUBLIC nothing (checked one privilege at a
  --    time: has_table_privilege with a list is true if any one is held).
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.label_lookups'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'INSERT,SELECT' then
    raise exception 'authenticated table privileges on label_lookups are %', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.label_lookups'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole))
     or exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
                where t.attrelid = 'public.label_lookups'::regclass and t.attnum > 0 and not t.attisdropped)
     or exists (select 1 from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as pv (name)
                where has_table_privilege('anon', 'public.label_lookups', pv.name))
     or has_table_privilege('authenticated', 'public.label_lookups', 'UPDATE')
     or has_table_privilege('authenticated', 'public.label_lookups', 'DELETE')
     or has_table_privilege('authenticated', 'public.label_lookups', 'TRUNCATE')
     or has_any_column_privilege('authenticated', 'public.label_lookups', 'UPDATE') then
    raise exception 'label_lookups privileges are not the spec''s (authenticated SELECT and INSERT only; anon and PUBLIC nothing)';
  end if;

  -- 5. What this relies on without changing it: label_reads' two policies, the
  --    account scrub and the photo attach bodies.
  select string_agg(p.polcmd::text, ',' order by p.polcmd::text) into v_text
  from pg_policy p where p.polrelid = 'public.label_reads'::regclass;
  if v_text is distinct from 'a,r' then
    raise exception 'label_reads policies changed: %', coalesce(v_text, '-');
  end if;
  select string_agg(s.sig, ', ') into v_bad
  from (values
    ('public.scrub_deleted_account(uuid)',               'bad163a7d72fcab774936383dc1b6f2a'),
    ('public.attach_catalog_wine_photo(uuid,text,text)', 'e287a2a46c54937870951a9c297683c9')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_bad is not null then
    raise exception 'deployed bodies changed: %', v_bad;
  end if;

  -- 6. Not in a publication (nothing streams lookups).
  if exists (select 1 from pg_publication_tables pt where pt.schemaname = 'public' and pt.tablename = 'label_lookups') then
    raise exception 'label_lookups is in a publication';
  end if;

  -- 7. Behavioural, inside a synthetic-rollback subtransaction so neither a dry
  --    nor a live apply leaves a row behind: the owner inserts and sees their
  --    lookup and can neither update nor delete it; a second lookup for the
  --    same read is refused; user B neither sees it nor forges one against A's
  --    read; anon reads nothing; deleting the read (the account scrub's own
  --    statement) removes the lookup with it.
  select u.id into v_a from auth.users u order by u.id limit 1;
  select u.id into v_b from auth.users u where u.id <> v_a order by u.id limit 1;
  if v_b is null then
    raise notice '20260919214700: behavioural assertions skipped (needs two auth users)';
  else
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      insert into public.label_reads (user_id, image_path, outcome, read, model, input_tokens, output_tokens)
      values (v_a, 'catalog/staging/' || v_a || '/scan-synthetic-assertion.jpg', 'ok', '{}'::jsonb, 'claude-sonnet-5', 1, 1)
      returning id into v_read;
      insert into public.label_lookups (label_read_id, user_id, region_id, candidates, outcome, answer, appellation_id, model, input_tokens, output_tokens)
      values (v_read, v_a, gen_random_uuid(), 2, 'answer', 'Castilla y Leon', gen_random_uuid(), 'claude-sonnet-5', 500, 15)
      returning id into v_lookup;
      select count(*) into v_a_sees from public.label_lookups l where l.id = v_lookup;
      begin
        update public.label_lookups set model = 'edited' where id = v_lookup;
      exception when insufficient_privilege then v_a_update_refused := true;
      end;
      begin
        delete from public.label_lookups where id = v_lookup;
      exception when insufficient_privilege then v_a_delete_refused := true;
      end;
      begin
        insert into public.label_lookups (label_read_id, user_id, region_id, candidates, outcome, model)
        values (v_read, v_a, gen_random_uuid(), 1, 'no-answer', 'claude-sonnet-5');
      exception when unique_violation then v_second_refused := true;
      end;

      perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      select count(*) into v_b_sees from public.label_lookups l where l.id = v_lookup;
      begin
        insert into public.label_lookups (label_read_id, user_id, region_id, candidates, outcome, model)
        values (v_read, v_b, gen_random_uuid(), 1, 'no-answer', 'claude-sonnet-5');
      exception when insufficient_privilege then v_b_forged_own_refused := true;
      end;
      begin
        insert into public.label_lookups (label_read_id, user_id, region_id, candidates, outcome, model)
        values (v_read, v_a, gen_random_uuid(), 1, 'no-answer', 'claude-sonnet-5');
      exception when insufficient_privilege then v_b_forged_as_a_refused := true;
      end;

      set local role anon;
      perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
      begin
        perform 1 from public.label_lookups;
      exception when insufficient_privilege then v_anon_refused := true;
      end;

      reset role;
      delete from public.label_reads where id = v_read;
      select count(*) into v_after_cascade from public.label_lookups l where l.id = v_lookup;

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;

    if not v_ran then
      raise exception '20260919214700: behavioural assertions did not run to completion';
    end if;
    if v_a_sees is distinct from 1 then
      raise exception 'label_lookups: the owner cannot see their own lookup';
    end if;
    if not v_a_update_refused then
      raise exception 'label_lookups: the owner could update a lookup (it is a record)';
    end if;
    if not v_a_delete_refused then
      raise exception 'label_lookups: the owner could delete a lookup (append-only)';
    end if;
    if not v_second_refused then
      raise exception 'label_lookups: a second lookup for one read was accepted';
    end if;
    if v_b_sees is distinct from 0 then
      raise exception 'label_lookups: another user can see a lookup they do not own';
    end if;
    if not v_b_forged_own_refused or not v_b_forged_as_a_refused then
      raise exception 'label_lookups: another user wrote a lookup against a read they do not own';
    end if;
    if not v_anon_refused then
      raise exception 'label_lookups: anon can read the table';
    end if;
    if v_after_cascade is distinct from 0 then
      raise exception 'label_lookups: deleting the read did not remove its lookup';
    end if;
    if exists (select 1 from public.label_reads r where r.id = v_read)
       or exists (select 1 from public.label_lookups l where l.id = v_lookup) then
      raise exception '20260919214700: the synthetic rows survived their rollback';
    end if;
  end if;

  -- Informational: the table's ACL.
  select c.relacl::text into v_text from pg_class c where c.oid = 'public.label_lookups'::regclass;
  raise notice 'label_lookups: table acl %', v_text;
end $$;
