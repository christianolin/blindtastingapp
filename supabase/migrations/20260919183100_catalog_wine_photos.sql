-- catalog_wine_photos: every label scan whose add lands in the catalog, a
-- cellar or a note, and every wine-page upload, becomes one of that wine's
-- photos (the wine page's "More photos" strip). catalog_wines.image_url stays
-- the one main photo, with unchanged rules.
--
-- Scan photos: spec docs/superpowers/specs/2026-09-19-scan-photos.md §6
-- (D2 one table, D5 remove, D6 account deletion, D7 caps, D8 no backfill,
-- D9 version; §3.1 rule 1). One table, one RPC, one trigger, one index.
--
-- Written against the LIVE state (read-only dump, 2026-09-19), never an older
-- migration file:
-- * Newest live version 20260919141700 (profile_favourites), to be followed by
--   the wine-images write lockdown 20260919162300 (below) before this file; no
--   schema_migrations row, table, function, trigger or index of this file.
-- * profiles: id uuid PRIMARY KEY; deleted_at timestamptz, nullable, no
--   default (20260919101300); non-internal triggers exactly
--   profiles_deleted_drop_favourites (20260919141700, AFTER UPDATE OF
--   deleted_at), profiles_deleted_guard and profiles_sync_is_curator.
--   (Spec §6.1/§6.5 name two before and three after: 20260919141700 went live
--   after the spec's dump, so this file asserts three before and four after.)
-- * catalog_wines: id uuid PK, blind_pending boolean not null, merged_into
--   uuid; policy "catalog read" for authenticated is exactly
--   ((NOT blind_pending) OR (created_by = auth.uid()) OR
--   can_read_blind_pending_catalog_wine(id)) — so every signed-in caller reads
--   a non-blind_pending row, which the photo read policy relies on.
-- * wine_answers (catalog_wine_id uuid, image_url text; no index on
--   catalog_wine_id yet), wines (tasting_id, is_revealed, added_by_host,
--   contributor_participant_id), tastings.host_id,
--   tasting_participants.user_id, wine_identity_drafts(owner_id, draft jsonb).
-- * label_reads: id uuid PK, user_id, image_path, outcome, created_at, all not
--   null; owner-only RLS. Nothing references it yet.
-- * storage: bucket wine-images, public; storage.objects carries bucket_id,
--   name, owner, owner_id, metadata (every wine-images object has owner =
--   owner_id and metadata.mimetype/size); the applier (postgres) has SELECT on
--   storage.objects and rolbypassrls, so the SECURITY DEFINER RPC reads object
--   rows as its owner.
-- * Cellar visibility: can_view_cellar(uuid) (SECURITY DEFINER, returns
--   boolean, EXECUTE for authenticated) is the gate cellar_lots' "cellar own
--   select" uses, exactly ((owner_id = auth.uid()) OR can_view_cellar(owner_id)).
--   A cellar scan's read gate reuses it (§3.1).
-- * PREREQUISITE, not yet live when this file was written: the wine-images
--   write lockdown 20260919162300. Live still carries "wine image write
--   update" and "wine image write delete", which admit every authenticated
--   caller to any object under catalog/**. The pre-state refuses until no
--   UPDATE/DELETE/ALL policy on storage.objects can reach a wine-images object
--   (item 8). Apply 20260919162300 first.
-- * Supabase's default privileges grant anon, authenticated and service_role
--   everything on a new table and EXECUTE on a new function: the revokes below
--   undo that, and the post-state block asserts the result.
--
-- What this migration does (spec §6.2-§6.4):
-- 1. catalog_wine_photos (id, catalog_wine_id -> catalog_wines ON DELETE
--    CASCADE, image_path = the object name in wine-images (never a URL),
--    via = where the photo came from ('upload' for a wine-page upload, else
--    where its scan's add landed: 'catalog', 'cellar' or 'note'), added_by ->
--    profiles ON DELETE CASCADE, label_read_id -> label_reads ON DELETE SET
--    NULL, created_at); unique (catalog_wine_id, image_path); a path-shape
--    check and a via check; two indexes; plus wine_answers_catalog_wine_id_idx
--    for the RPC's linkage lookups.
-- 2. RLS: authenticated reads a photo when its wine is not blind_pending AND,
--    for a cellar scan, the photographer's own cellar is visible to the reader
--    (own row, or can_view_cellar(added_by)); no glass linkage test (§3.1).
--    The photographer deletes (unlinks) their own row. authenticated holds
--    SELECT on six columns (not label_read_id: label_reads is owner-only) and
--    DELETE; no client INSERT or UPDATE; anon nothing; service_role keeps the
--    defaults.
-- 3. attach_catalog_wine_photo(wine, path, via): SECURITY DEFINER, volatile,
--    plpgsql, returns one status word and never raises for a refusal;
--    EXECUTE for authenticated only. In order: signed-out / no-wine (null id);
--    deleted-account (row lock serialises with the scrub and the cap);
--    bad-path (own catalog/staging/<uid>/scan-*.jpg with via catalog, cellar
--    or note; or this wine's own catalog/<wineId>/<name>, stored as 'upload'
--    whatever via says); no-object / not-an-image / too-large (the caller's
--    own object in wine-images, image/*, <= 5 MB); no-wine (missing, merged or
--    blind_pending — one answer); flight-photo (the answer-key or draft photo
--    of one of the caller's own glasses); unrevealed-glass (the caller added a
--    still-unrevealed glass of this wine); already-attached (idempotent,
--    before the cap); limit (12 per person per wine); attached. label_read_id
--    is derived from the caller's own label_reads, never sent.
-- 4. profiles_drop_catalog_wine_photos: AFTER UPDATE OF deleted_at, null ->
--    set, deletes that person's photo rows (the files stay). The freshly
--    shipped scrub_deleted_account is not edited.
--
-- Security (spec §6.7, §3.1):
-- * Rule 1: only the ADDER of a still-unrevealed glass is refused
--   (unrevealed-glass), and their own glass photos are refused for good
--   (flight-photo). Everyone else's attach result, and every read, is
--   independent of any glass — hiding photos while a wine is poured, or
--   refusing everyone, would be a one-query oracle for tonight's flight.
--   blind_pending (existing behaviour) hides the whole wine, photos included.
-- * Cellar privacy: a cellar scan is read exactly by whoever can read the
--   photographer's cellar lots (the same can_view_cellar gate), never by
--   everyone. A host who scans a bottle into a PRIVATE or FRIENDS cellar and
--   pours it from there (D11) therefore leaves no photo trace to anyone who
--   cannot already see that cellar; and because the host's lot keeps the wine
--   off blind_pending, a public cellar photo would have stayed visible all
--   evening. Residual: a catalog or note scan of a wine that already exists
--   leaves a public trace (photographer and time) where the add used to write
--   nothing (spec §12 R6).
-- * No client writes a row directly; a client deletes only its own. An attach
--   names only an object the caller uploaded, under its own staging folder or
--   the wine's own folder; label_read_id and created_at cannot be forged; via
--   only ever narrows the caller's own photo's audience (or widens it to the
--   public, which is the caller's own choice about their own photo).
-- * Storage: nothing here writes, moves or deletes storage.objects, but the
--   attach-time object checks (owner, image/*, <= 5 MB) only hold if nobody can
--   rewrite the object afterwards. With live's "wine image write update" /
--   "wine image write delete" any signed-in user could replace or delete the
--   file behind someone else's photo while the strip still credits that
--   person, and the owner could swap in any content after attaching. The
--   wine-images write lockdown (20260919162300) is therefore required, and the
--   pre-state refuses until it is live.
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
  -- 1. Nothing this migration creates exists yet.
  if to_regclass('public.catalog_wine_photos') is not null then
    raise exception 'public.catalog_wine_photos already exists; re-dump and rebuild this migration';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('attach_catalog_wine_photo', 'drop_deleted_account_catalog_wine_photos');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;
  if exists (select 1 from pg_trigger t where t.tgname = 'profiles_drop_catalog_wine_photos') then
    raise exception 'a trigger named profiles_drop_catalog_wine_photos already exists';
  end if;
  if to_regclass('public.wine_answers_catalog_wine_id_idx') is not null
     or exists (select 1 from pg_index i
                join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                where i.indrelid = 'public.wine_answers'::regclass
                  and i.indnkeyatts = 1 and i.indexprs is null and a.attname = 'catalog_wine_id') then
    raise exception 'wine_answers already has an index on catalog_wine_id';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations where version = '20260919183100') then
    raise exception 'version 20260919183100 is already recorded';
  end if;

  -- 2. Account deletion is applied: profiles.deleted_at, the three live
  --    triggers (profiles_deleted_drop_favourites since 20260919141700), the PK.
  if not exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped
                   and a.atttypid = 'timestamptz'::regtype and not a.attnotnull and not a.atthasdef) then
    raise exception 'profiles.deleted_at is not a nullable timestamptz without a default';
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
  if v_text is distinct from 'profiles_deleted_drop_favourites, profiles_deleted_guard, profiles_sync_is_curator' then
    raise exception 'profiles triggers differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.profiles'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)') then
    raise exception 'profiles has no PRIMARY KEY (id) for catalog_wine_photos.added_by to reference';
  end if;

  -- 3. catalog_wines, and the "catalog read" policy the photo read policy relies on.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.catalog_wines'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname in ('id', 'blind_pending', 'merged_into');
  if v_text is distinct from 'blind_pending bool not null, id uuid not null, merged_into uuid' then
    raise exception 'catalog_wines columns differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.catalog_wines'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)') then
    raise exception 'catalog_wines has no PRIMARY KEY (id)';
  end if;
  if not exists (select 1 from pg_policy p
                 where p.polrelid = 'public.catalog_wines'::regclass and p.polname = 'catalog read'
                   and p.polcmd = 'r' and p.polpermissive
                   and p.polroles::regrole[]::text = '{authenticated}'
                   and pg_get_expr(p.polqual, p.polrelid)
                       = '((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id))') then
    raise exception 'catalog_wines policy "catalog read" differs from the live state this file was written against';
  end if;
  if exists (select 1 from pg_policy p
             where p.polrelid = 'public.catalog_wines'::regclass and not p.polpermissive) then
    raise exception 'catalog_wines carries a restrictive policy; the photo read reasoning assumes none';
  end if;

  -- 4. The glass tables the RPC reads (only the caller's own glasses).
  select string_agg(format('%s.%s %s%s', c.relname, a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from (values ('wine_answers', 'wine_id'), ('wine_answers', 'catalog_wine_id'), ('wine_answers', 'image_url'),
               ('wines', 'id'), ('wines', 'tasting_id'), ('wines', 'is_revealed'), ('wines', 'added_by_host'),
               ('wines', 'contributor_participant_id'),
               ('tastings', 'id'), ('tastings', 'host_id'),
               ('tasting_participants', 'id'), ('tasting_participants', 'user_id'),
               ('wine_identity_drafts', 'owner_id'), ('wine_identity_drafts', 'draft')) as s (rel, col)
  join pg_class c on c.relnamespace = 'public'::regnamespace and c.relname = s.rel
  join pg_attribute a on a.attrelid = c.oid and a.attname = s.col and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid;
  if v_text is distinct from
       'tasting_participants.id uuid not null, tasting_participants.user_id uuid not null, '
       || 'tastings.host_id uuid not null, tastings.id uuid not null, '
       || 'wine_answers.catalog_wine_id uuid, wine_answers.image_url text, wine_answers.wine_id uuid not null, '
       || 'wine_identity_drafts.draft jsonb not null, wine_identity_drafts.owner_id uuid not null, '
       || 'wines.added_by_host bool not null, wines.contributor_participant_id uuid, wines.id uuid not null, '
       || 'wines.is_revealed bool not null, wines.tasting_id uuid not null' then
    raise exception 'glass table columns differ from the live state this file was written against: %', v_text;
  end if;

  -- 5. label_reads: the FK target and the columns step 10 reads.
  select string_agg(format('%s %s%s', a.attname, t.typname, case when a.attnotnull then ' not null' else '' end),
                    ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'public.label_reads'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname in ('id', 'user_id', 'image_path', 'outcome', 'created_at');
  if v_text is distinct from
       'created_at timestamptz not null, id uuid not null, image_path text not null, outcome text not null, user_id uuid not null' then
    raise exception 'label_reads columns differ from the live state this file was written against: %', v_text;
  end if;
  if not exists (select 1 from pg_constraint k
                 where k.conrelid = 'public.label_reads'::regclass and k.contype = 'p'
                   and pg_get_constraintdef(k.oid) = 'PRIMARY KEY (id)') then
    raise exception 'label_reads has no PRIMARY KEY (id) for catalog_wine_photos.label_read_id to reference';
  end if;

  -- 6. Storage: the bucket, the object columns step 4 reads, and the owner's
  --    right to read object rows (SELECT, and RLS bypassed).
  if not exists (select 1 from storage.buckets b where b.id = 'wine-images' and b.public) then
    raise exception 'storage bucket wine-images is missing or not public';
  end if;
  select string_agg(format('%s %s', a.attname, t.typname), ', ' order by a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  where a.attrelid = 'storage.objects'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname in ('bucket_id', 'name', 'owner', 'owner_id', 'metadata');
  if v_text is distinct from 'bucket_id text, metadata jsonb, name text, owner uuid, owner_id text' then
    raise exception 'storage.objects columns differ from the live state this file was written against: %', v_text;
  end if;
  if not has_table_privilege(current_user, 'storage.objects', 'SELECT') then
    raise exception '% cannot select storage.objects; the attach RPC reads object rows as its owner', current_user;
  end if;
  if not (select r.rolbypassrls from pg_roles r where r.rolname = current_user) then
    raise exception '% does not bypass RLS; the attach RPC reads object rows as its owner', current_user;
  end if;

  -- 7. Cellar visibility: the photo read gate reuses can_view_cellar, which must be the very gate
  --    cellar_lots' "cellar own select" uses, so a cellar scan is read exactly by who reads the lot.
  if to_regprocedure('public.can_view_cellar(uuid)') is null
     or not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure('public.can_view_cellar(uuid)')
                      and p.prosecdef and p.prorettype = 'boolean'::regtype and not p.proretset)
     or not has_function_privilege('authenticated', 'public.can_view_cellar(uuid)', 'EXECUTE') then
    raise exception 'public.can_view_cellar(uuid) is missing, not a SECURITY DEFINER boolean function, or not executable by authenticated';
  end if;
  if not exists (select 1 from pg_policy p
                 where p.polrelid = 'public.cellar_lots'::regclass and p.polname = 'cellar own select'
                   and p.polcmd = 'r' and p.polpermissive
                   and p.polroles::regrole[]::text = '{authenticated}'
                   and pg_get_expr(p.polqual, p.polrelid) = '((owner_id = auth.uid()) OR can_view_cellar(owner_id))')
     or exists (select 1 from pg_policy p
                where p.polrelid = 'public.cellar_lots'::regclass and p.polcmd in ('r', '*') and p.polname <> 'cellar own select') then
    raise exception 'cellar_lots read policies differ from the live state this file was written against';
  end if;

  -- 8. The wine-images write lockdown (20260919162300) is live: no UPDATE/DELETE/ALL policy on
  --    storage.objects can reach a wine-images object. Each must be scoped to another bucket by a
  --    leading bucket_id conjunct and must not mention wine-images at all. Otherwise anyone could
  --    replace or delete the file behind someone else's photo after the attach checked it.
  select string_agg(p.polname, ', ' order by p.polname::text collate "C") into v_text
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass and p.polcmd in ('w', 'd', '*')
    and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
           like '%wine-images%'
         or coalesce(pg_get_expr(p.polqual, p.polrelid), '') !~ '^\(\(?bucket_id = ''[^'']+''::text\)( AND |$)');
  if v_text is not null then
    raise exception 'wine-images still grants client UPDATE/DELETE (%); apply 20260919162300 first', v_text;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The table, its indexes, RLS and grants (spec §6.2).
-- ---------------------------------------------------------------------------
create table public.catalog_wine_photos (
  id uuid primary key default gen_random_uuid(),
  catalog_wine_id uuid not null references public.catalog_wines(id) on delete cascade,
  image_path text not null,               -- the object name in wine-images, never a URL
  via text not null default 'upload',     -- 'upload' (wine page), else where the scan's add landed
  added_by uuid not null references public.profiles(id) on delete cascade,
  label_read_id uuid references public.label_reads(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint catalog_wine_photos_wine_path_key unique (catalog_wine_id, image_path),
  constraint catalog_wine_photos_path_shape
    check (char_length(image_path) <= 300 and image_path ~ '^catalog/[A-Za-z0-9._/-]+$'),
  constraint catalog_wine_photos_via check (via in ('upload', 'catalog', 'cellar', 'note'))
);
create index catalog_wine_photos_wine_created_idx on public.catalog_wine_photos (catalog_wine_id, created_at desc);
create index catalog_wine_photos_added_by_idx on public.catalog_wine_photos (added_by, catalog_wine_id);
create index wine_answers_catalog_wine_id_idx on public.wine_answers (catalog_wine_id);  -- §6.3 steps 6-7

alter table public.catalog_wine_photos enable row level security;

-- A signed-in user sees a wine's photos when the wine is not blind_pending (the subquery runs as the
-- caller under "catalog read", which admits every authenticated caller to a non-blind_pending row),
-- except a cellar scan: that one is seen by its photographer and by whoever can see their cellar
-- (can_view_cellar, the gate of cellar_lots' own read policy), so it tells nobody more than the lot
-- does. No glass linkage test anywhere: see §3.1.
create policy "catalog_wine_photos read" on public.catalog_wine_photos
  for select to authenticated
  using (exists (select 1 from public.catalog_wines cw
                  where cw.id = catalog_wine_photos.catalog_wine_id and not cw.blind_pending)
         and (added_by = auth.uid() or via <> 'cellar' or public.can_view_cellar(added_by)));

-- The photographer unlinks their own photo. The storage object is untouched.
create policy "catalog_wine_photos delete own" on public.catalog_wine_photos
  for delete to authenticated
  using (added_by = auth.uid());

revoke all on public.catalog_wine_photos from public, anon, authenticated;
grant select (id, catalog_wine_id, image_path, via, added_by, created_at) on public.catalog_wine_photos to authenticated;
grant delete on public.catalog_wine_photos to authenticated;
-- No client INSERT or UPDATE: rows are written only by attach_catalog_wine_photo.
-- label_read_id is not client-readable: label_reads is owner-only.
-- service_role keeps Supabase's defaults (the probe's and the main session's fixtures).

-- ---------------------------------------------------------------------------
-- 2. attach_catalog_wine_photo (spec §6.3).
-- ---------------------------------------------------------------------------
create function public.attach_catalog_wine_photo(p_catalog_wine_id uuid, p_image_path text, p_via text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_deleted_at timestamptz;
  v_via text;
  v_meta jsonb;
  v_wine record;
  v_suffix text;
  v_read uuid;
  v_id uuid;
begin
  -- 1. Signed in.
  if v_uid is null then return 'signed-out'; end if;
  if p_catalog_wine_id is null then return 'no-wine'; end if;

  -- 2. A live account. The lock serialises with scrub_deleted_account (FOR UPDATE, D6) and with this
  --    person's other attaches (so the cap in step 9 holds).
  select deleted_at into v_deleted_at from profiles where id = v_uid for no key update;
  if not found or v_deleted_at is not null then return 'deleted-account'; end if;

  -- 3. The path: the caller's own label scan, which names where its add landed (catalog, cellar or
  --    note; a cellar scan is then read only by who can read that cellar), or an upload into this
  --    wine's own folder, which is always 'upload' whatever p_via says.
  if p_image_path is null or char_length(p_image_path) > 300 then
    return 'bad-path';
  elsif p_image_path ~ ('^catalog/staging/' || v_uid::text || '/scan-[A-Za-z0-9._-]+\.jpg$') then
    if p_via is null or p_via not in ('catalog', 'cellar', 'note') then return 'bad-path'; end if;
    v_via := p_via;
  elsif p_image_path ~ ('^catalog/' || p_catalog_wine_id::text || '/[A-Za-z0-9._-]+$') then
    v_via := 'upload';
  else
    return 'bad-path';
  end if;

  -- 4. The object: in wine-images, uploaded by the caller, an image, at most 5 MB.
  select o.metadata into v_meta from storage.objects o
   where o.bucket_id = 'wine-images' and o.name = p_image_path
     and coalesce(o.owner_id, o.owner::text) = v_uid::text;
  if not found or v_meta is null then return 'no-object'; end if;
  if coalesce(v_meta->>'mimetype', '') not like 'image/%' then return 'not-an-image'; end if;
  if coalesce(v_meta->>'size', '') !~ '^[0-9]+$' or (v_meta->>'size')::bigint > 5242880 then
    return 'too-large';
  end if;

  -- 5. The wine: exists, not merged away, not blind_pending. "catalog read" admits every caller to such
  --    a row, so this is "readable". One answer for all three cases: a blind_pending id cannot be told
  --    from a missing one.
  select cw.blind_pending, cw.merged_into into v_wine
    from catalog_wines cw where cw.id = p_catalog_wine_id for key share;
  if not found or v_wine.blind_pending or v_wine.merged_into is not null then return 'no-wine'; end if;

  -- 6. Never a photo of one of the caller's own glasses (the owner's rule), revealed or not, keyed or
  --    still a draft. Only the caller's own glasses are consulted.
  v_suffix := '/storage/v1/object/public/wine-images/' || p_image_path;
  if exists (select 1 from wine_answers wa
               join wines w on w.id = wa.wine_id
               join tastings t on t.id = w.tasting_id
               left join tasting_participants tp on tp.id = w.contributor_participant_id
              where right(split_part(wa.image_url, '?', 1), char_length(v_suffix)) = v_suffix
                and case when w.added_by_host then t.host_id = v_uid else tp.user_id = v_uid end)
     or exists (select 1 from wine_identity_drafts d
                 where d.owner_id = v_uid
                   and right(split_part(d.draft->>'imageUrl', '?', 1), char_length(v_suffix)) = v_suffix) then
    return 'flight-photo';
  end if;

  -- 7. Not while the caller has this wine in a glass they added that is not yet revealed (§3.1).
  --    Nobody else is ever refused for linkage.
  if exists (select 1 from wine_answers wa
               join wines w on w.id = wa.wine_id
               join tastings t on t.id = w.tasting_id
               left join tasting_participants tp on tp.id = w.contributor_participant_id
              where wa.catalog_wine_id = p_catalog_wine_id and not w.is_revealed
                and case when w.added_by_host then t.host_id = v_uid else tp.user_id = v_uid end) then
    return 'unrevealed-glass';
  end if;

  -- 8. Idempotent. Checked before the cap, so a retry at 12 never reads as 'limit'.
  if exists (select 1 from catalog_wine_photos
              where catalog_wine_id = p_catalog_wine_id and image_path = p_image_path) then
    return 'already-attached';
  end if;

  -- 9. At most 12 per person per wine (D7).
  if (select count(*) from catalog_wine_photos
       where catalog_wine_id = p_catalog_wine_id and added_by = v_uid) >= 12 then
    return 'limit';
  end if;

  -- 10. The read that produced it, when there was one. It is derived here: the client never names it.
  select lr.id into v_read from label_reads lr
   where lr.user_id = v_uid and lr.image_path = p_image_path
   order by (lr.outcome = 'ok') desc, lr.created_at desc limit 1;

  insert into catalog_wine_photos (catalog_wine_id, image_path, via, added_by, label_read_id)
  values (p_catalog_wine_id, p_image_path, v_via, v_uid, v_read)
  on conflict (catalog_wine_id, image_path) do nothing
  returning id into v_id;
  return case when v_id is null then 'already-attached' else 'attached' end;
end $$;
-- auth.uid() is null for service_role (the transfer_tasting_host OD-1 precedent).
revoke all on function public.attach_catalog_wine_photo(uuid, text, text) from public, anon, service_role;
grant execute on function public.attach_catalog_wine_photo(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Account deletion (spec §6.4, D6). scrub_deleted_account stamps deleted_at
--    last; this fires once, then. The files stay. A hard delete of a profile
--    cascades through the FK.
-- ---------------------------------------------------------------------------
create function public.drop_deleted_account_catalog_wine_photos() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from catalog_wine_photos where added_by = new.id;
  return null;
end $$;
revoke all on function public.drop_deleted_account_catalog_wine_photos() from public, anon, authenticated, service_role;

create trigger profiles_drop_catalog_wine_photos
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_account_catalog_wine_photos();

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception (spec §6.5).
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_attnum int2;
begin
  -- 1. The table: exactly the seven columns of §6.2, in order, with their types,
  --    nullability and defaults.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\mpublic\.', '', 'g') end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.catalog_wine_photos'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'id uuid not null default gen_random_uuid(), catalog_wine_id uuid not null, image_path text not null, '
       || 'via text not null default ''upload''::text, '
       || 'added_by uuid not null, label_read_id uuid, created_at timestamptz not null default now()' then
    raise exception 'catalog_wine_photos columns differ from spec §6.2: %', v_text;
  end if;

  -- 2. The constraints: the pkey, the three FKs, the unique pair, the path shape, the via set.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.catalog_wine_photos'::regclass;
  if v_text is distinct from
       'catalog_wine_photos_added_by_fkey FOREIGN KEY (added_by) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'catalog_wine_photos_catalog_wine_id_fkey FOREIGN KEY (catalog_wine_id) REFERENCES catalog_wines(id) ON DELETE CASCADE; '
       || 'catalog_wine_photos_label_read_id_fkey FOREIGN KEY (label_read_id) REFERENCES label_reads(id) ON DELETE SET NULL; '
       || 'catalog_wine_photos_path_shape CHECK (((char_length(image_path) <= 300) AND (image_path ~ ''^catalog/[A-Za-z0-9._/-]+$''::text))); '
       || 'catalog_wine_photos_pkey PRIMARY KEY (id); '
       || 'catalog_wine_photos_via CHECK ((via = ANY (ARRAY[''upload''::text, ''catalog''::text, ''cellar''::text, ''note''::text]))); '
       || 'catalog_wine_photos_wine_path_key UNIQUE (catalog_wine_id, image_path)' then
    raise exception 'catalog_wine_photos constraints differ from spec §6.2: %', v_text;
  end if;

  -- 3. The three new indexes.
  select string_agg(i.indexdef, '; ' order by i.indexname::text collate "C") into v_text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname in ('catalog_wine_photos_wine_created_idx', 'catalog_wine_photos_added_by_idx',
                        'wine_answers_catalog_wine_id_idx');
  if v_text is distinct from
       'CREATE INDEX catalog_wine_photos_added_by_idx ON public.catalog_wine_photos USING btree (added_by, catalog_wine_id); '
       || 'CREATE INDEX catalog_wine_photos_wine_created_idx ON public.catalog_wine_photos USING btree (catalog_wine_id, created_at DESC); '
       || 'CREATE INDEX wine_answers_catalog_wine_id_idx ON public.wine_answers USING btree (catalog_wine_id)' then
    raise exception 'the new indexes differ from spec §6.2: %', v_text;
  end if;

  -- 4. RLS on (not forced: the owner and the SECURITY DEFINER functions bypass
  --    it); exactly the two permissive policies of §6.2 (whitespace folded).
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.catalog_wine_photos'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'catalog_wine_photos row level security is not enabled, or is forced';
  end if;
  select string_agg(regexp_replace(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                                          case when p.polpermissive then 'permissive' else 'restrictive' end,
                                          p.polroles::regrole[]::text,
                                          coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                                          coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')), '\s+', ' ', 'g'),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.catalog_wine_photos'::regclass;
  if v_text is distinct from
       'catalog_wine_photos delete own d permissive {authenticated} (added_by = auth.uid()) -; '
       || 'catalog_wine_photos read r permissive {authenticated} ((EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE ((cw.id = catalog_wine_photos.catalog_wine_id) AND (NOT cw.blind_pending)))) '
       || 'AND ((added_by = auth.uid()) OR (via <> ''cellar''::text) OR can_view_cellar(added_by))) -' then
    raise exception 'catalog_wine_photos policies differ from spec §6.2: %', v_text;
  end if;

  -- 5. Privileges: anon and PUBLIC hold nothing (table or column);
  --    authenticated holds DELETE at table level and SELECT on exactly the
  --    six columns — never label_read_id — and no INSERT, UPDATE, TRUNCATE,
  --    REFERENCES or TRIGGER; service_role keeps the defaults.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.catalog_wine_photos'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a table privilege on catalog_wine_photos';
  end if;
  if exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
             where t.attrelid = 'public.catalog_wine_photos'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a column privilege on catalog_wine_photos';
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.catalog_wine_photos'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'DELETE' then
    raise exception 'authenticated table privileges on catalog_wine_photos are %, expected DELETE only', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_attribute t, aclexplode(t.attacl) a
             where t.attrelid = 'public.catalog_wine_photos'::regclass and a.grantee <> 'authenticated'::regrole) then
    raise exception 'a role other than authenticated holds a column privilege on catalog_wine_photos';
  end if;
  select string_agg(format('%s:%s', t.attname, a.privilege_type), ',' order by t.attnum, a.privilege_type collate "C") into v_text
  from pg_attribute t, aclexplode(t.attacl) a
  where t.attrelid = 'public.catalog_wine_photos'::regclass and t.attnum > 0 and not t.attisdropped;
  if v_text is distinct from 'id:SELECT,catalog_wine_id:SELECT,image_path:SELECT,via:SELECT,added_by:SELECT,created_at:SELECT' then
    raise exception 'column privileges on catalog_wine_photos are %, expected SELECT for authenticated on exactly id, catalog_wine_id, image_path, via, added_by, created_at', coalesce(v_text, '-');
  end if;
  if not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'catalog_wine_id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'image_path', 'SELECT')
     or not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'via', 'SELECT')
     or not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'added_by', 'SELECT')
     or not has_column_privilege('authenticated', 'public.catalog_wine_photos', 'created_at', 'SELECT')
     or has_column_privilege('authenticated', 'public.catalog_wine_photos', 'label_read_id', 'SELECT')
     or has_table_privilege('authenticated', 'public.catalog_wine_photos', 'SELECT')
     or not has_table_privilege('authenticated', 'public.catalog_wine_photos', 'DELETE')
     or has_any_column_privilege('authenticated', 'public.catalog_wine_photos', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.catalog_wine_photos', 'UPDATE')
     or has_any_column_privilege('authenticated', 'public.catalog_wine_photos', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.catalog_wine_photos', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.catalog_wine_photos', 'TRIGGER')
     or has_any_column_privilege('anon', 'public.catalog_wine_photos', 'SELECT')
     or has_any_column_privilege('anon', 'public.catalog_wine_photos', 'INSERT')
     or has_any_column_privilege('anon', 'public.catalog_wine_photos', 'UPDATE')
     or has_table_privilege('anon', 'public.catalog_wine_photos', 'DELETE') then
    raise exception 'catalog_wine_photos privileges are not: authenticated SELECT on the six columns + DELETE only; anon nothing';
  end if;
  if not has_table_privilege('service_role', 'public.catalog_wine_photos', 'SELECT')
     or not has_table_privilege('service_role', 'public.catalog_wine_photos', 'INSERT')
     or not has_table_privilege('service_role', 'public.catalog_wine_photos', 'UPDATE')
     or not has_table_privilege('service_role', 'public.catalog_wine_photos', 'DELETE') then
    raise exception 'service_role lost its default privileges on catalog_wine_photos (the probe and the main session fixtures need them)';
  end if;

  -- 6. The two new functions: security, search_path, volatility, language,
  --    return type, arguments, body (md5 of prosrc with any CR stripped) and
  --    the roles holding EXECUTE ("OWNER" is the function owner).
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.args, s.body_md5, s.grantees,
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
      ('public.attach_catalog_wine_photo(uuid,text,text)', true, '{search_path=public}', 'v', 'plpgsql', 'text',
       'p_catalog_wine_id uuid, p_image_path text, p_via text', 'e287a2a46c54937870951a9c297683c9', 'OWNER,authenticated'),
      ('public.drop_deleted_account_catalog_wine_photos()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger',
       '', '3efba41e17adce06c4d24bc4166aa359', 'OWNER')
    ) as s (sig, secdef, config, volatile, lang, rettype, args, body_md5, grantees)
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
       or v_fn.proretset
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

  -- 7. What each role can call: attach for authenticated only — not anon,
  --    not PUBLIC, not service_role; the trigger function for nobody.
  if not has_function_privilege('authenticated', 'public.attach_catalog_wine_photo(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.attach_catalog_wine_photo(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.attach_catalog_wine_photo(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.drop_deleted_account_catalog_wine_photos()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.drop_deleted_account_catalog_wine_photos()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.drop_deleted_account_catalog_wine_photos()', 'EXECUTE')
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid in (to_regprocedure('public.attach_catalog_wine_photo(uuid,text,text)'),
                                to_regprocedure('public.drop_deleted_account_catalog_wine_photos()'))
                  and a.grantee = 0) then
    raise exception 'EXECUTE on the scan-photo functions is not: attach authenticated only; the trigger function nobody';
  end if;

  -- 8. The trigger: row-level, AFTER, UPDATE OF deleted_at only, enabled, with
  --    the null -> set WHEN clause; profiles now carries exactly four
  --    non-internal triggers.
  select a.attnum into v_attnum from pg_attribute a
   where a.attrelid = 'public.profiles'::regclass and a.attname = 'deleted_at' and not a.attisdropped;
  if not exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'profiles_drop_catalog_wine_photos'
                   and not t.tgisinternal and t.tgenabled = 'O' and t.tgtype = 17
                   and t.tgattr::text = v_attnum::text
                   and t.tgfoid = to_regprocedure('public.drop_deleted_account_catalog_wine_photos()')
                   and t.tgqual is not null
                   and regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g')
                       = 'CREATE TRIGGER profiles_drop_catalog_wine_photos AFTER UPDATE OF deleted_at ON profiles '
                         || 'FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) '
                         || 'EXECUTE FUNCTION drop_deleted_account_catalog_wine_photos()') then
    raise exception 'profiles_drop_catalog_wine_photos is not a row-level AFTER UPDATE OF deleted_at trigger firing only when deleted_at goes from null to set';
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'profiles_deleted_drop_favourites, profiles_deleted_guard, profiles_drop_catalog_wine_photos, profiles_sync_is_curator' then
    raise exception 'profiles triggers post-migration are %', v_text;
  end if;

  -- Informational: the new function's ACL and the table's.
  raise notice 'catalog_wine_photos: attach acl %; table acl %',
    (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.attach_catalog_wine_photo(uuid,text,text)')),
    (select c.relacl::text from pg_class c where c.oid = 'public.catalog_wine_photos'::regclass);
end $$;
