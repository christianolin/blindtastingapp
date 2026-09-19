-- wine-images write lockdown: no client may overwrite, move or delete a stored
-- wine photo. Drops the storage.objects policies "wine image write update" and
-- "wine image write delete"; "wine image write insert" and "wine image public
-- read" stay exactly as they are, and so does every other bucket's policy.
--
-- The hole (account-deletion spec
-- docs/superpowers/specs/2026-09-19-account-deletion-design.md, finding F2).
-- 20260829250000_wine_images_catalog_policy.sql gave the wine-images bucket
-- one expression for insert, update and delete alike:
--   bucket_id = 'wine-images' and case
--     when (storage.foldername(name))[1] = 'catalog' then true
--     when <first segment is uuid-shaped> then is_tasting_host(<it>) or is_tasting_participant(<it>)
--     else false end
-- It was written so uploads under catalog/ would stop failing (casting
-- "catalog" to uuid threw), but UPDATE and DELETE got the same `then true`.
-- Any signed-in user could therefore overwrite (upload with upsert, update,
-- move) or remove any object under wine-images/catalog/**, whoever uploaded
-- it. The host or any participant of a tasting could do the same to any object
-- under wine-images/<tasting id>/**. is_tasting_participant reads no status,
-- so INVITED and DECLINED rows count too.
--
-- Evidence (read-only dump of live, 2026-09-19; scripts under .superpowers/storage/):
-- * storage.objects carries the 12 policies the pre-state block pins below.
--   Each fingerprint is name | cmd | permissive | roles | md5 of the
--   normalised USING | md5 of the normalised WITH CHECK ("-" when absent);
--   normalised = the public./storage./auth. qualifiers pg_get_expr prints
--   off the search_path removed, whitespace runs collapsed. The
--   fingerprint is the same under any search_path. The wine-images insert
--   WITH CHECK and the update/delete USING are one expression (md5 e8712e3b…).
-- * storage.objects is owned by supabase_storage_admin, with RLS on and not
--   forced. anon and authenticated hold SELECT/INSERT/UPDATE/DELETE on it,
--   so RLS is the only gate. postgres is neither the owner nor a member of it:
--   it manages policies on storage.objects through supautils.policy_grants,
--   which lists storage.objects for postgres. The pre-state block checks that.
-- * wine-images (public bucket) holds 192 objects: 177 under
--   catalog/staging/<uploader id>/ (each folder named for its object's
--   owner), 12 under catalog/<catalog wine id>/ and 3 under <tasting id>/.
--   Every one has owner set. All 108 catalog_wines.image_url values resolve
--   to one of them (99 under catalog/staging/, 9 under catalog/<wine id>/), and
--   2 wine_answers.image_url values point into the bucket. Overwriting or
--   deleting one breaks a shared catalog wine's photo for everyone.
--
-- Who writes to wine-images (src/, scripts/ and supabase/ of every worktree,
-- 2026-09-19):
-- * src/components/image-uploader.tsx:
--   storage.upload(`${folder}/${Date.now()}-<random>.<ext>`, file). It uses a
--   new name every time and no upsert. Its "Remove" only clears the form
--   field and leaves the object in place. Its folders are:
--   catalog/<wineId> (src/app/catalog/[wineId]/wine-image.tsx);
--   <tastingId> or catalog/staging/<uid>
--   (src/components/add-wine/by-hand-form.tsx); and catalog/staging/<uid>
--   (src/components/wine/wine-identity-fields.tsx, from
--   src/app/catalog/new/new-wine-form.tsx and
--   src/app/cellar/new/cellar-lot-form.tsx).
-- * src/components/add-wine/add-wine-sheet.tsx: label-scan photos to
--   catalog/staging/<uid>/scan-<ts>-<random>.jpg, no upsert.
-- * src/app/scan/actions.ts: getPublicUrl only (a read).
-- * Nothing updates, upserts, moves, copies or removes a wine-images object.
--   The only upsert is the avatars uploader (another bucket). The only remove
--   is account deletion's admin-client (service_role) avatars clean-up.
-- A Storage API upload without upsert is an INSERT under the caller's role.
-- Only an upsert (INSERT ... ON CONFLICT DO UPDATE), an update or a move needs
-- an UPDATE policy, and only a remove needs a DELETE policy. No client path
-- above uses any of those on this bucket.
--
-- Design:
-- * Drop both policies. No client role (PUBLIC, anon, authenticated) keeps
--   an UPDATE or DELETE path on wine-images: not for catalog/**, not for
--   tasting folders, not even for the caller's own upload (no client path
--   needs one). service_role bypasses RLS (rolbypassrls), so maintenance goes
--   through the service key, for example the account-deletion spec §7
--   follow-up on unreferenced staging photos.
-- * "wine image write insert" and "wine image public read" are unchanged, so
--   every upload path above keeps working and every public URL keeps serving.
-- * The avatars and tasting-images own-folder policies are unchanged.
-- * No stored object is touched: this file reads, writes and deletes no row
--   of storage.objects.
-- * Post-state: every permissive UPDATE/DELETE/ALL policy on storage.objects
--   that applies to PUBLIC, anon or authenticated (or a role either belongs
--   to) must open with a top-level bucket_id = '<another bucket>' guard. A
--   generic owner policy (owner = auth.uid()) or a new wine-images one fails
--   the migration. The full policy list must also equal the pre-state list
--   minus exactly these two, fingerprint for fingerprint.
--
-- Deployed code once applied: no page changes behaviour. A client that did
-- try to overwrite a wine-images object (upsert, update or move) would now
-- get a row-level-security refusal. A remove() would remove nothing, because
-- RLS filters the DELETE to zero rows.
--
-- Stale once this lands (not changed here): the first case of
-- scripts/wine-images-catalog-policy.test.mjs expects all three
-- "wine image write ..." policies. It is a local database test, not run in CI.
--
-- Probe: .superpowers/storage/probes/20260919162300-wine-images-write-lockdown.mjs (gitignored).
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
  -- 1. storage.objects: RLS on and not forced (dropping a policy on a table
  --    without RLS would change nothing, and forced RLS would mean a
  --    different set-up from the one this file was written against).
  if not exists (select 1 from pg_class c
                 where c.oid = 'storage.objects'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'storage.objects row level security is not enabled, or is forced';
  end if;

  -- 2. The bucket exists and is public (its read policy is what serves the
  --    catalog's public URLs; the bucket flag is what the CDN path checks).
  if not exists (select 1 from storage.buckets b where b.id = 'wine-images' and b.public) then
    raise exception 'bucket wine-images is missing or not public';
  end if;

  -- 3. This role can drop a policy on storage.objects: it owns the table (or
  --    belongs to the owner), or supautils lets it manage that table's
  --    policies (live: supautils.policy_grants lists storage.objects for
  --    postgres).
  if not (pg_has_role(current_user,
                      (select c.relowner from pg_class c where c.oid = 'storage.objects'::regclass),
                      'USAGE')
          or coalesce((nullif(current_setting('supautils.policy_grants', true), '')::jsonb
                       -> current_user::text) ? 'storage.objects', false)) then
    raise exception 'role % can neither own storage.objects nor manage its policies through supautils.policy_grants', current_user;
  end if;

  -- 4. Every policy on storage.objects, fingerprinted as the header says. The
  --    six UPDATE/DELETE policies among them are the avatars and
  --    tasting-images own-folder pairs and the two dropped below. No ALL
  --    policy exists, so nothing else can grant an UPDATE or a DELETE on
  --    wine-images.
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
       || 'wine image write delete|d|permissive|{authenticated}|e8712e3b31c1c2d02ea5988d71fda52e|-; '
       || 'wine image write insert|a|permissive|{authenticated}|-|e8712e3b31c1c2d02ea5988d71fda52e; '
       || 'wine image write update|w|permissive|{authenticated}|e8712e3b31c1c2d02ea5988d71fda52e|-' then
    raise exception 'storage.objects policies differ from the live state this migration was written against (2026-09-19): %', v_text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- The lockdown.
-- ---------------------------------------------------------------------------
drop policy "wine image write update" on storage.objects;
drop policy "wine image write delete" on storage.objects;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  -- 1. Neither dropped policy exists any more.
  select string_agg(p.polname, ', ' order by p.polname::text collate "C") into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass
    and p.polname in ('wine image write update', 'wine image write delete');
  if v_text is not null then
    raise exception 'still present on storage.objects: %', v_text;
  end if;

  -- 2. No permissive UPDATE, DELETE or ALL policy on storage.objects that
  --    applies to a client role (PUBLIC, anon, authenticated, or a role
  --    either belongs to) can match a wine-images row. Each must open with a
  --    top-level bucket_id guard naming another bucket; anything else (no
  --    USING, a generic owner = auth.uid() policy, a wine-images guard, an
  --    OR at the top) fails closed. Restrictive policies cannot grant a row,
  --    so they are not examined.
  select string_agg(format('%s (%s): %s', p.polname, p.polcmd,
                           coalesce(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'), 'no USING')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass
    and p.polpermissive
    and p.polcmd in ('w', 'd', '*')
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
    raise exception 'an UPDATE, DELETE or ALL policy on storage.objects can still match a wine-images row for a client role: %', v_text;
  end if;

  -- 3. Nothing else on storage.objects changed: the pre-state list minus
  --    exactly the two dropped, fingerprint for fingerprint (so "wine image
  --    write insert" and "wine image public read" are the live ones).
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
    raise exception 'storage.objects policies differ from the pre-state list minus the two dropped: %', v_text;
  end if;

  -- 4. RLS is still on, and the bucket is still public.
  if not exists (select 1 from pg_class c
                 where c.oid = 'storage.objects'::regclass and c.relrowsecurity and not c.relforcerowsecurity)
     or not exists (select 1 from storage.buckets b where b.id = 'wine-images' and b.public) then
    raise exception 'storage.objects row level security or the wine-images bucket changed post-migration';
  end if;

  -- Informational: what a client may still do on storage.objects, by command.
  select string_agg(format('%s: %s', x.cmd, x.names), '; ' order by x.cmd) into v_text
  from (select p.polcmd::text as cmd, string_agg(p.polname, ', ' order by p.polname::text collate "C") as names
        from pg_policy p where p.polrelid = 'storage.objects'::regclass group by p.polcmd) x;
  raise notice 'wine-images write lockdown: storage.objects policies by command: %', v_text;
end $$;
