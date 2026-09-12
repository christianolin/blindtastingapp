-- Add-wine v2 (D1, spec §E.1): every Sonnet 5 label read is retained, owner-only,
-- so a bug report can be replayed without a second API call. A row holds the
-- structured read, the model and the billed token usage, and only the staging
-- path of the photo, never its bytes. `outcome` also records billed calls that
-- produced no read (a refusal, a max_tokens stop, an unparsed output), so the
-- cost query counts real spend. No begin/commit: the applier wraps the file.

create table public.label_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_path text not null check (image_path like 'catalog/staging/%'),
  outcome text not null check (outcome in ('ok', 'not-a-label', 'not-read')),
  read jsonb,                                  -- null exactly when outcome = 'not-read'
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  constraint label_reads_read_matches_outcome check ((read is null) = (outcome = 'not-read'))
);

create index label_reads_user_created_idx on public.label_reads (user_id, created_at desc);

alter table public.label_reads enable row level security;

create policy "label_reads own select" on public.label_reads
  for select to authenticated using (user_id = auth.uid());
create policy "label_reads own insert" on public.label_reads
  for insert to authenticated with check (user_id = auth.uid());
create policy "label_reads own delete" on public.label_reads
  for delete to authenticated using (user_id = auth.uid());
-- No update policy: a read is a record and is never edited.

-- Same-transaction assertions (the 20260911100000 pattern): a recorded version
-- must never exist without the DDL it names. The behavioural half builds its row
-- inside a synthetic-rollback subtransaction (spec §E.0), so neither a dry nor a
-- live apply leaves a row behind.
do $$
declare
  v_bad text;
  v_a uuid;
  v_b uuid;
  v_row uuid;
  v_ran boolean := false;
  v_a_sees int;
  v_a_updated int;
  v_b_sees int;
  v_b_updated int;
  v_b_deleted int;
  v_b_forged_refused boolean := false;
  v_model_after text;
begin
  -- 1. The table exists with row level security on.
  if to_regclass('public.label_reads') is null then
    raise exception 'label_reads table missing post-migration';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.label_reads'::regclass) then
    raise exception 'row level security is off on label_reads post-migration';
  end if;

  -- 2. Exactly the three owner-only policies, and none that can UPDATE: a read is a record.
  if exists (
    select 1
    from pg_policy pol
    where pol.polrelid = 'public.label_reads'::regclass
      and pol.polcmd in ('w', '*')
  ) then
    raise exception 'label_reads has an UPDATE or ALL policy post-migration';
  end if;

  with expected (policyname, permissive, roles, cmd, qual, with_check) as (
    values
      ('label_reads own select', 'PERMISSIVE', '{authenticated}', 'SELECT',
        '(user_id = auth.uid())', null),
      ('label_reads own insert', 'PERMISSIVE', '{authenticated}', 'INSERT',
        null, '(user_id = auth.uid())'),
      ('label_reads own delete', 'PERMISSIVE', '{authenticated}', 'DELETE',
        '(user_id = auth.uid())', null)
  ),
  live as (
    select pol.policyname::text as policyname,
           pol.permissive,
           pol.roles::text as roles,
           pol.cmd,
           pol.qual,
           pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.tablename = 'label_reads'
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
    raise exception 'label_reads policies differ from the owner-only set post-migration: %', v_bad;
  end if;

  -- 3. The nine columns with their types and nullability (read is null exactly
  --    when nothing was read), and no image bytes anywhere.
  with expected (column_name, data_type, not_null) as (
    values
      ('id', 'uuid', true),
      ('user_id', 'uuid', true),
      ('image_path', 'text', true),
      ('outcome', 'text', true),
      ('read', 'jsonb', false),
      ('model', 'text', true),
      ('input_tokens', 'integer', true),
      ('output_tokens', 'integer', true),
      ('created_at', 'timestamp with time zone', true)
  ),
  live as (
    select a.attname::text as column_name,
           format_type(a.atttypid, a.atttypmod) as data_type,
           a.attnotnull as not_null
    from pg_attribute a
    where a.attrelid = 'public.label_reads'::regclass
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
    raise exception 'label_reads columns differ from the nine expected post-migration: %', v_bad;
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.label_reads'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.atttypid = 'bytea'::regtype
  ) then
    raise exception 'label_reads stores image bytes post-migration';
  end if;

  -- 4. The outcome vocabulary, and read present exactly when something was read.
  select string_agg(k.conname || ' ' || pg_get_constraintdef(k.oid), '; ' order by k.conname) into v_bad
  from pg_constraint k
  where k.conrelid = 'public.label_reads'::regclass and k.contype = 'c';
  if not exists (
    select 1
    from pg_constraint k
    where k.conrelid = 'public.label_reads'::regclass
      and k.contype = 'c'
      and pg_get_constraintdef(k.oid)
        = 'CHECK ((outcome = ANY (ARRAY[''ok''::text, ''not-a-label''::text, ''not-read''::text])))'
  ) then
    raise exception 'label_reads outcome check missing or changed post-migration: %', v_bad;
  end if;
  if not exists (
    select 1
    from pg_constraint k
    where k.conrelid = 'public.label_reads'::regclass
      and k.contype = 'c'
      and k.conname = 'label_reads_read_matches_outcome'
      and pg_get_constraintdef(k.oid) = 'CHECK (((read IS NULL) = (outcome = ''not-read''::text)))'
  ) then
    raise exception 'label_reads_read_matches_outcome missing or changed post-migration: %', v_bad;
  end if;

  -- 5. user_id references auth.users (seeded demo accounts have no profiles row)
  --    and cascades on delete; the owner's newest-first index exists.
  if not exists (
    select 1
    from pg_constraint k
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = 'public.label_reads'::regclass
      and k.contype = 'f'
      and cardinality(k.conkey) = 1
      and a.attname = 'user_id'
      and k.confrelid = 'auth.users'::regclass
      and k.confdeltype = 'c'
  ) then
    raise exception 'label_reads.user_id does not reference auth.users on delete cascade post-migration';
  end if;
  if to_regclass('public.label_reads_user_created_idx') is null then
    raise exception 'label_reads_user_created_idx missing post-migration';
  end if;

  -- 6. Behavioural (spec §E.0): profile A's read is visible to A only; B can neither
  --    edit, delete nor forge one under A's id, and nobody can edit a read.
  select p.id into v_a from public.profiles p order by p.id limit 1;
  select p.id into v_b from public.profiles p where p.id <> v_a order by p.id limit 1;
  if v_b is null then
    raise notice '20260912100100: behavioural assertions skipped (needs two profiles)';
  else
    begin
      set local role authenticated;

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      insert into public.label_reads (user_id, image_path, outcome, read, model, input_tokens, output_tokens)
      values (v_a, 'catalog/staging/' || v_a || '/synthetic-assertion.jpg', 'ok', '{}'::jsonb,
              'claude-sonnet-5', 1, 1)
      returning id into v_row;
      select count(*) into v_a_sees from public.label_reads l where l.id = v_row;
      update public.label_reads l set model = 'edited' where l.id = v_row;
      get diagnostics v_a_updated = row_count;

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
      select count(*) into v_b_sees from public.label_reads l where l.id = v_row;
      update public.label_reads l set model = 'edited' where l.id = v_row;
      get diagnostics v_b_updated = row_count;
      delete from public.label_reads l where l.id = v_row;
      get diagnostics v_b_deleted = row_count;
      begin
        insert into public.label_reads (user_id, image_path, outcome, read, model)
        values (v_a, 'catalog/staging/' || v_a || '/forged-assertion.jpg', 'not-read', null,
                'claude-sonnet-5');
      exception
        when insufficient_privilege then
          v_b_forged_refused := true;
      end;

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
      select l.model into v_model_after from public.label_reads l where l.id = v_row;

      v_ran := true;
      raise exception 'synthetic rollback' using errcode = 'SYNRB';
    exception
      when sqlstate 'SYNRB' then
        null;
    end;

    if not v_ran then
      raise exception '20260912100100: behavioural assertions did not run to completion';
    end if;
    if v_a_sees is distinct from 1 then
      raise exception 'label_reads: the owner cannot see their own read post-migration';
    end if;
    if v_a_updated is distinct from 0 then
      raise exception 'label_reads: the owner edited a read post-migration (a read is a record)';
    end if;
    if v_b_sees is distinct from 0 then
      raise exception 'label_reads: another user can see a read they do not own post-migration';
    end if;
    if v_b_updated is distinct from 0 then
      raise exception 'label_reads: another user edited a read they do not own post-migration';
    end if;
    if v_b_deleted is distinct from 0 then
      raise exception 'label_reads: another user deleted a read they do not own post-migration';
    end if;
    if not v_b_forged_refused then
      raise exception 'label_reads: a user inserted a read under another user''s id post-migration';
    end if;
    if v_model_after is distinct from 'claude-sonnet-5' then
      raise exception 'label_reads: the read changed after other users touched it post-migration (%)', v_model_after;
    end if;
    if exists (select 1 from public.label_reads l where l.id = v_row) then
      raise exception '20260912100100: the synthetic read survived its rollback';
    end if;
  end if;
end $$;
