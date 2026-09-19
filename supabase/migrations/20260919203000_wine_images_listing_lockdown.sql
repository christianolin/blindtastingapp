-- wine-images listing lockdown: nobody lists the bucket any more; every public
-- photo link keeps working. Replaces the storage.objects SELECT policy "wine
-- image public read" (PUBLIC, i.e. anon included, every wine-images row) with
-- "wine image own read" (authenticated, only the rows the caller uploaded).
-- Every other policy, and every other bucket, stays exactly as it is.
--
-- The hole (rule 1: nothing may reveal a hidden glass's wine before its
-- reveal). "wine image public read" (20260714120000) was written for the
-- object BYTES, but a SELECT policy on storage.objects is what the Storage
-- API's list endpoints (storage.search / search_v2 / list_objects_with_delimiter,
-- all SECURITY INVOKER) run under. Live, 2026-09-19 (read-only, rolled back):
-- as anon, select from storage.objects where bucket_id = 'wine-images' returns
-- all 195 rows, 165 of them label-scan photos under
-- catalog/staging/<uploader id>/scan-<ms>-<random>.jpg (180 staging objects in
-- all, every one in the folder named for its owner). So during a tasting anyone
-- with the anon key could list a host's newest staging scans and open them:
-- tonight's flight, before the reveal.
--
-- Why narrowing SELECT breaks nothing (evidence, 2026-09-19):
-- 1. Public URLs do not read storage.objects under the caller's role.
--    storage-api src/http/routes/object/getPublicObject.ts (route
--    '/public/:bucketName/*') runs both lookups as the super user:
--      const bucketRef = request.storage.asSuperUser().from(bucketName)
--      ... request.storage.asSuperUser().findBucket(bucketName, 'id,public', { isPublic: true }),
--      bucketRef.findObject(objectName, 'id,version,metadata', ...)
--    Supabase docs (Storage > Buckets > Fundamentals): a public bucket
--    "effectively bypasses access controls for both retrieving and serving
--    files", while "access control is still enforced for ... uploading,
--    deleting, moving, and copying". @supabase/storage-js 2.110.2
--    getPublicUrl(): "objects table permissions: none" (it builds the URL
--    locally, no request). So the catalog's image_url, the wine page's photo
--    strip (catalog_wine_photos, 20260919183100, getPublicUrl in
--    src/lib/catalog-photos/queries.ts) and the label reader
--    (src/app/scan/actions.ts hands readLabel a public URL, which the model API
--    fetches) all keep working with no SELECT policy at all.
-- 2. An upload without upsert needs no SELECT policy. storage-js upload():
--    "objects table permissions: only insert when you are uploading new
--    files". storage-api src/storage/uploader.ts: canUpload() tests the
--    caller's INSERT with db.testPermission(db => db.createObject(...)) — a
--    plain INSERT with no RETURNING (src/storage/database/pg.ts), inside a
--    transaction it always rolls back — and completeUpload() writes the real
--    row as this.db.asSuperUser() (upsertObject, the one INSERT ... RETURNING *).
--    The new policy still admits the uploader's own new row anyway, so an
--    INSERT ... RETURNING under the caller's role (an older storage-api, or any
--    path that returns the row) keeps working: the probe checks both forms.
-- 3. Nothing lists, downloads through the authenticated API, or selects
--    wine-images object rows as a client. src/: two uploads
--    (src/components/image-uploader.tsx, src/components/add-wine/add-wine-sheet.tsx,
--    upload() without upsert) and three getPublicUrl() calls (image-uploader,
--    src/app/scan/actions.ts, src/lib/catalog-photos/queries.ts). The only
--    list()/remove() is account deletion's admin client on avatars. scripts/:
--    only scripts/wine-images-catalog-policy.test.mjs (a local test, below).
--    supabase/: the one function outside the storage schema that could read or
--    list storage.objects at all — its body names the storage schema
--    (storage.objects, "storage"."objects", storage.search / search_v2 /
--    list_objects_with_delimiter, ...), or it reads bare objects under a
--    search_path naming storage, or pg_depend ties it to storage.objects or a
--    storage function — is attach_catalog_wine_photo (20260919183100), SECURITY
--    DEFINER, owned by postgres, which has rolbypassrls — it keeps reading any
--    wine-images row, and only ever looks up the one object its caller
--    uploaded. The pre-state block checks all of that (check 5 is
--    deliberately that wide: a SECURITY DEFINER function owned by a bypassrls
--    role that lists storage would hand every wine-images row to its caller
--    whatever this policy says).
--
-- Design:
-- * "wine image own read": for select to authenticated using bucket_id =
--   'wine-images' and coalesce(owner_id, owner::text) = (select auth.uid())::text
--   — the same "uploaded by the caller" test attach_catalog_wine_photo uses.
--   Storage-api stamps owner_id (and owner, for a uuid sub) from the JWT; a
--   client cannot choose it. anon gets no wine-images row at all; a signed-in
--   caller sees only what they uploaded, which tells them nothing new.
-- * "wine image write insert" is unchanged, so every upload keeps working.
--   There is still no client UPDATE or DELETE path (20260919162300).
-- * avatars and tasting-images keep their public read and own-folder policies;
--   wine-map-tiles and wine-map-sources have none. No bucket is changed.
-- * No stored object is touched: this file reads storage.objects and writes
--   no row of it; the post-state block compares a snapshot of every object row.
--
-- Deployed code once applied: no page changes behaviour. A client list() of
-- wine-images returns only its own uploads (anon: nothing); info()/exists()/
-- download() of someone else's object reports not found. Public URLs serve as
-- before.
--
-- Residual (not changed here): tasting-images and avatars stay listable by
-- anyone (their "public read" policies); neither holds an answer key. Public
-- object names stay unguessable (Date.now() plus
-- Math.random().toString(36).slice(2), up to about 52 random bits), so a
-- public URL is only ever opened by someone the app gave it to.
--
-- Local test: scripts/wine-images-catalog-policy.test.mjs (not run
-- in CI; its first case is already stale since 20260919162300) inserts as
-- authenticated with only owner set and "returning id": coalesce(owner_id,
-- owner::text) admits that row, so its RETURNING still passes.
--
-- Probe: .superpowers/listing/probes/20260919203000-wine-images-listing-lockdown.mjs (gitignored).
--
-- No begin/commit: the applier owns the transaction (the snapshots below are
-- transaction-local settings, and the post-state refuses if they are missing).

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 0. This version is not recorded yet.
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations where version = '20260919203000') then
    raise exception 'version 20260919203000 is already recorded';
  end if;

  -- 1. storage.objects: RLS on and not forced.
  if not exists (select 1 from pg_class c
                 where c.oid = 'storage.objects'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'storage.objects row level security is not enabled, or is forced';
  end if;

  -- 2. The bucket exists and is public: its public URLs are served by the
  --    bucket flag, not by a SELECT policy, so the policy can narrow.
  if not exists (select 1 from storage.buckets b where b.id = 'wine-images' and b.public) then
    raise exception 'bucket wine-images is missing or not public';
  end if;

  -- 3. This role can drop and create a policy on storage.objects (owner, or
  --    supautils.policy_grants lists storage.objects for it, as live does).
  if not (pg_has_role(current_user,
                      (select c.relowner from pg_class c where c.oid = 'storage.objects'::regclass),
                      'USAGE')
          or coalesce((nullif(current_setting('supautils.policy_grants', true), '')::jsonb
                       -> current_user::text) ? 'storage.objects', false)) then
    raise exception 'role % can neither own storage.objects nor manage its policies through supautils.policy_grants', current_user;
  end if;

  -- 4. Every policy on storage.objects, fingerprinted exactly as in
  --    20260919162300 (name | cmd | permissive | roles | md5 of the normalised
  --    USING | md5 of the normalised WITH CHECK): its post-state list, ten policies.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(md5(regexp_replace(regexp_replace(pg_get_expr(p.polqual, p.polrelid),
                                                                      '\m(public|storage|auth)\.', '', 'g'), '\s+', ' ', 'g')), '-'),
                           coalesce(md5(regexp_replace(regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid),
                                                                      '\m(public|storage|auth)\.', '', 'g'), '\s+', ' ', 'g')), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass;
  if v_text is distinct from
       'avatar own folder delete|d|permissive|{authenticated}|73be138cdc556a750a6dc2a951730b24|-; '
       || 'avatar own folder insert|a|permissive|{authenticated}|-|73be138cdc556a750a6dc2a951730b24; '
       || 'avatar own folder update|w|permissive|{authenticated}|73be138cdc556a750a6dc2a951730b24|-; '
       || 'avatar public read|r|permissive|{-}|cf8e5fde823d5e06700e67692fa3d29b|-; '
       || 'tasting image own folder delete|d|permissive|{authenticated}|2034355d3201fd05f5090fceaa96495a|-; '
       || 'tasting image own folder insert|a|permissive|{authenticated}|-|2034355d3201fd05f5090fceaa96495a; '
       || 'tasting image own folder update|w|permissive|{authenticated}|2034355d3201fd05f5090fceaa96495a|-; '
       || 'tasting image public read|r|permissive|{-}|e8db6409a1088fa53ffea3c4392d3f79|-; '
       || 'wine image public read|r|permissive|{-}|a193eb206c2168d363c4b258105bbf19|-; '
       || 'wine image write insert|a|permissive|{authenticated}|-|e8712e3b31c1c2d02ea5988d71fda52e' then
    raise exception 'storage.objects policies differ from the live state this migration was written against (2026-09-19): %', v_text;
  end if;

  -- 5. Nothing outside the storage schema reads or lists storage.objects
  --    behind the new policy's back. A function could reach the object rows by
  --    naming the table (storage.objects, "storage"."objects"), by calling a
  --    storage listing function (storage.search, search_v2,
  --    list_objects_with_delimiter, ...), or by reading bare objects under a
  --    search_path that names storage; a SECURITY DEFINER one owned by a
  --    bypassrls role would then list every wine-images row whatever this
  --    policy says. So the match is deliberately wide: any body (plpgsql/sql
  --    text, or a SQL-standard body) that names the storage schema at all, any
  --    body mentioning objects whose SET search_path names storage, and any
  --    function pg_depend records against storage.objects or a storage-schema
  --    function. Live, 2026-09-19 (read-only): exactly one match,
  --    attach_catalog_wine_photo, SECURITY DEFINER, owned by a role that
  --    bypasses RLS (so it still finds the caller's object), and it only reads
  --    the one object the caller uploaded. No view depends on storage.objects.
  select string_agg(format('%s definer=%s owner=%s bypassrls=%s', p.oid::regprocedure, p.prosecdef,
                           pg_get_userbyid(p.proowner), r.rolbypassrls),
                    '; ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  cross join lateral (select p.prosrc || ' ' || coalesce(pg_get_function_sqlbody(p.oid), '') as body) b
  where p.pronamespace <> 'storage'::regnamespace
    and (b.body ~* '\mstorage\s*\.'
         or b.body ~* '"storage"'
         or (exists (select 1 from unnest(p.proconfig) as c (setting)
                     where c.setting ~* '^search_path=.*\mstorage\M')
             and b.body ~* '\mobjects\M')
         or exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                      and ((d.refclassid = 'pg_class'::regclass and d.refobjid = 'storage.objects'::regclass)
                           or (d.refclassid = 'pg_proc'::regclass
                               and exists (select 1 from pg_proc s
                                           where s.oid = d.refobjid and s.pronamespace = 'storage'::regnamespace)))));
  if v_text is distinct from 'attach_catalog_wine_photo(uuid,text,text) definer=t owner=postgres bypassrls=t' then
    raise exception 'functions outside storage that could read or list storage.objects differ from the live state this file was written against: %', v_text;
  end if;
  select string_agg(distinct v.oid::regclass::text, ', ') into v_text
  from pg_depend d
  join pg_rewrite w on w.oid = d.objid
  join pg_class v on v.oid = w.ev_class
  where d.refobjid = 'storage.objects'::regclass and v.oid <> 'storage.objects'::regclass;
  if v_text is not null then
    raise exception 'a view depends on storage.objects (%); its readers would change with this policy', v_text;
  end if;

  -- 6. Listing reaches object rows only through storage.objects RLS: no
  --    storage-schema function is SECURITY DEFINER (search, search_v2,
  --    list_objects_with_delimiter, ... run as the caller), and there is no
  --    storage.prefixes table (whose own policies would list folder names).
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'storage'::regnamespace and p.prosecdef;
  if v_text is not null then
    raise exception 'storage-schema functions are SECURITY DEFINER (%); listing would bypass the new policy', v_text;
  end if;
  if to_regclass('storage.prefixes') is not null then
    raise exception 'storage.prefixes exists; this file was written against a storage schema without it';
  end if;

  -- 7. Snapshots for the post-state (transaction-local): every bucket's public
  --    flag, and every object row.
  select string_agg(format('%s|%s', b.id, b.public), '; ' order by b.id collate "C") into v_text
  from storage.buckets b;
  perform set_config('blindr_migration.buckets_20260919203000', v_text, true);
  select md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s', o.id, o.bucket_id, o.name, o.owner, o.owner_id,
                                        o.version, o.updated_at, md5(coalesce(o.metadata::text, '-'))),
                                 ';' order by o.id), '')) || ':' || count(*)
    into v_text
  from storage.objects o;
  perform set_config('blindr_migration.objects_20260919203000', v_text, true);
end $$;

-- ---------------------------------------------------------------------------
-- The lockdown.
-- ---------------------------------------------------------------------------
drop policy "wine image public read" on storage.objects;

create policy "wine image own read" on storage.objects
  for select to authenticated
  using (bucket_id = 'wine-images' and coalesce(owner_id, owner::text) = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. The public read is gone; the own read is exactly what this file creates
  --    (USING normalised as in the fingerprint, so any search_path agrees).
  if exists (select 1 from pg_policy p
             where p.polrelid = 'storage.objects'::regclass and p.polname = 'wine image public read') then
    raise exception '"wine image public read" is still present on storage.objects';
  end if;
  select format('%s|%s|%s|%s|%s', p.polcmd, case when p.polpermissive then 'permissive' else 'restrictive' end,
                p.polroles::regrole[]::text,
                regexp_replace(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\m(public|storage|auth)\.', '', 'g'), '\s+', ' ', 'g'),
                coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-'))
    into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass and p.polname = 'wine image own read';
  if v_text is distinct from
       'r|permissive|{authenticated}|((bucket_id = ''wine-images''::text) AND (COALESCE(owner_id, (owner)::text) = (( SELECT uid() AS uid))::text))|-' then
    raise exception '"wine image own read" is not the policy this file creates: %', coalesce(v_text, 'missing');
  end if;

  -- 2. No other permissive SELECT or ALL policy on storage.objects that
  --    applies to a client role (PUBLIC, anon, authenticated, or a role either
  --    belongs to) can match a wine-images row: each must open with a top-level
  --    bucket_id guard naming another bucket. Restrictive policies grant nothing.
  select string_agg(format('%s (%s): %s', p.polname, p.polcmd,
                           coalesce(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'), 'no USING')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass
    and p.polpermissive
    and p.polcmd in ('r', '*')
    and p.polname <> 'wine image own read'
    and (0 = any (p.polroles)
         or exists (select 1 from unnest(p.polroles) as r (oid)
                    where r.oid <> 0
                      and (pg_has_role('anon', r.oid, 'MEMBER') or pg_has_role('authenticated', r.oid, 'MEMBER'))))
    and coalesce(substring(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g')
                           from '^\(\(bucket_id = ''([^'']+)''::text\) AND '),
                 substring(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g')
                           from '^\(bucket_id = ''([^'']+)''::text\)$'),
                 'wine-images') = 'wine-images';
  if v_text is not null then
    raise exception 'a SELECT or ALL policy on storage.objects can still match a wine-images row for a client role: %', v_text;
  end if;

  -- 3. Nothing else on storage.objects changed: the pre-state list minus
  --    "wine image public read" plus "wine image own read", fingerprint for
  --    fingerprint.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text,
                           coalesce(md5(regexp_replace(regexp_replace(pg_get_expr(p.polqual, p.polrelid),
                                                                      '\m(public|storage|auth)\.', '', 'g'), '\s+', ' ', 'g')), '-'),
                           coalesce(md5(regexp_replace(regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid),
                                                                      '\m(public|storage|auth)\.', '', 'g'), '\s+', ' ', 'g')), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass;
  if v_text is distinct from
       'avatar own folder delete|d|permissive|{authenticated}|73be138cdc556a750a6dc2a951730b24|-; '
       || 'avatar own folder insert|a|permissive|{authenticated}|-|73be138cdc556a750a6dc2a951730b24; '
       || 'avatar own folder update|w|permissive|{authenticated}|73be138cdc556a750a6dc2a951730b24|-; '
       || 'avatar public read|r|permissive|{-}|cf8e5fde823d5e06700e67692fa3d29b|-; '
       || 'tasting image own folder delete|d|permissive|{authenticated}|2034355d3201fd05f5090fceaa96495a|-; '
       || 'tasting image own folder insert|a|permissive|{authenticated}|-|2034355d3201fd05f5090fceaa96495a; '
       || 'tasting image own folder update|w|permissive|{authenticated}|2034355d3201fd05f5090fceaa96495a|-; '
       || 'tasting image public read|r|permissive|{-}|e8db6409a1088fa53ffea3c4392d3f79|-; '
       || 'wine image own read|r|permissive|{authenticated}|2841d44d3d0f68e43adfd00cb2246dff|-; '
       || 'wine image write insert|a|permissive|{authenticated}|-|e8712e3b31c1c2d02ea5988d71fda52e' then
    raise exception 'storage.objects policies differ from the pre-state list with the one read policy replaced: %', v_text;
  end if;

  -- 4. RLS is still on, every bucket's public flag is what it was, and no
  --    object row changed.
  if not exists (select 1 from pg_class c
                 where c.oid = 'storage.objects'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'storage.objects row level security changed post-migration';
  end if;
  select string_agg(format('%s|%s', b.id, b.public), '; ' order by b.id collate "C") into v_text
  from storage.buckets b;
  if nullif(current_setting('blindr_migration.buckets_20260919203000', true), '') is null then
    raise exception 'the pre-state bucket snapshot is missing; run this file as one transaction';
  end if;
  if v_text is distinct from current_setting('blindr_migration.buckets_20260919203000', true) then
    raise exception 'storage.buckets changed: % (was %)', v_text, current_setting('blindr_migration.buckets_20260919203000', true);
  end if;
  select md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s', o.id, o.bucket_id, o.name, o.owner, o.owner_id,
                                        o.version, o.updated_at, md5(coalesce(o.metadata::text, '-'))),
                                 ';' order by o.id), '')) || ':' || count(*)
    into v_text
  from storage.objects o;
  if nullif(current_setting('blindr_migration.objects_20260919203000', true), '') is null then
    raise exception 'the pre-state object snapshot is missing; run this file as one transaction';
  end if;
  if v_text is distinct from current_setting('blindr_migration.objects_20260919203000', true) then
    raise exception 'storage.objects rows changed: % (was %)', v_text, current_setting('blindr_migration.objects_20260919203000', true);
  end if;
end $$;

-- Post-state, behaviour: what each client role now sees, checked under that
-- role in this same transaction; the role and JWT settings are put back after.
do $$
declare
  v_role text := current_user;
  v_claims text := current_setting('request.jwt.claims', true);
  v_claim_sub text := current_setting('request.jwt.claim.sub', true);
  v_owner text;
  v_owned bigint;
  v_avatars bigint;
  v_tasting bigint;
  v_n bigint;
  v_other bigint;
  v_a bigint;
  v_t bigint;
begin
  select coalesce(o.owner_id, o.owner::text), count(*) into v_owner, v_owned
  from storage.objects o
  where o.bucket_id = 'wine-images' and coalesce(o.owner_id, o.owner::text) is not null
  group by 1 order by count(*) desc, 1 limit 1;
  select count(*) filter (where o.bucket_id = 'avatars'), count(*) filter (where o.bucket_id = 'tasting-images')
    into v_avatars, v_tasting
  from storage.objects o;

  -- anon: no wine-images row; still every avatars and tasting-images row.
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) filter (where o.bucket_id = 'wine-images'),
         count(*) filter (where o.bucket_id = 'avatars'),
         count(*) filter (where o.bucket_id = 'tasting-images')
    into v_n, v_a, v_t
  from storage.objects o;
  if v_n <> 0 then
    raise exception 'anon still sees % wine-images rows', v_n;
  end if;
  if v_a <> v_avatars or v_t <> v_tasting then
    raise exception 'anon sees % of % avatars rows and % of % tasting-images rows; those buckets must be unchanged',
      v_a, v_avatars, v_t, v_tasting;
  end if;

  -- A signed-in caller who owns no wine-images object: none.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
                     json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  select count(*) into v_n from storage.objects o where o.bucket_id = 'wine-images';
  if v_n <> 0 then
    raise exception 'a signed-in caller with no uploads sees % wine-images rows', v_n;
  end if;

  -- The biggest uploader (when there is one): exactly their own, no one else's.
  if v_owner is not null then
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    select count(*), count(*) filter (where coalesce(o.owner_id, o.owner::text) is distinct from v_owner)
      into v_n, v_other
    from storage.objects o where o.bucket_id = 'wine-images';
    if v_n <> v_owned or v_other <> 0 then
      raise exception 'uploader % sees % wine-images rows (% not theirs), expected exactly their own %',
        v_owner, v_n, v_other, v_owned;
    end if;
  end if;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_claim_sub, ''), true);
  if current_user::text is distinct from v_role then
    raise exception 'role not restored: % (expected %)', current_user, v_role;
  end if;

  raise notice 'wine-images listing lockdown: anon sees 0 wine-images rows (% avatars, % tasting-images); uploader sees own % only',
    v_avatars, v_tasting, coalesce(v_owned, 0);
end $$;
