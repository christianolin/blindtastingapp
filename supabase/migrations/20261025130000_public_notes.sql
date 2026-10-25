-- Every tasting note is public (owner, 2026-10-25: "Everyones notes should
-- be public" — asked how far: "All notes public, no choice", every existing
-- note included, with no warning).
--
-- What changes:
-- * can_view_notes(author) no longer reads profiles.notes_visibility: it is
--   true for every signed-in reader whenever the author's account is not
--   deleted. The "wset notes read" policy itself is NOT recreated — it keeps
--   every Rule 1 clause it has (sharing-defaults 20260927140000 §6):
--     author_id = auth.uid()
--     or (catalog_wine_id is not null      -- identity-less hidden-glass,
--                                          -- training and unidentified-wine
--                                          -- notes stay author-only
--         and can_view_notes(author_id)    -- now: author not deleted
--         and not wset_note_held(id)       -- the Rule 1 hold and pour link
--         and exists (catalog_wines ...))  -- the reader's own "catalog read"
--   So an identity-less note on a still-hidden glass is readable by its
--   author alone until the reveal gives it an identity, a held note stays
--   held until its glass's reveal, and a note on a blind_pending wine reaches
--   only people who can already read that wine. Nothing here reveals a
--   hidden wine or an unrevealed glass's identity.
-- * profiles.notes_visibility is set to PUBLIC on every row and the client
--   UPDATE grant on it is revoked: the choice is gone from the app, and no
--   client can store one any more. The column stays (the deployed app still
--   selects it until the new deploy is live; nothing reads it for access).
-- * Writes are untouched: the insert/update/delete policies stay
--   author-only (asserted below by md5, unchanged since 20260914094500).
--
-- Order: app deploy (no notes picker) first, then this file — applied first,
-- the deployed Sharing card's notes select would answer "Not saved".
--
-- Written against the LIVE state (read-only, 2026-10-25): "wset notes read"
-- as below; can_view_notes md5 (prosrc, CR stripped)
-- 3fe471b0d155ff618afd5e4f559044d6; 44 profiles, all notes_visibility
-- PUBLIC; 28 notes, all identified, none held, none on a blind_pending wine,
-- no deleted author — so no note's readability changes today; the file
-- removes the choice for every later note.
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
  if (select format('%s %s %s', p.polcmd, p.polroles::regrole[]::text,
                    regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'))
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       'r {authenticated} ((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" is not the live policy this file relies on';
  end if;
  if (select string_agg(p.polname::text, ',' order by p.polname::text collate "C")
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass)
     is distinct from 'wset notes delete,wset notes insert,wset notes read,wset notes update' then
    raise exception 'wset_notes does not have exactly its four live policies';
  end if;
  select md5(string_agg(format('%s %s %s %s %s %s', p.polname, p.polcmd,
                               case when p.polpermissive then 'permissive' else 'restrictive' end,
                               p.polroles::regrole[]::text,
                               coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                        E'\n' order by p.polname::text collate "C"))
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wset_notes'::regclass and p.polname <> 'wset notes read';
  if v_text is distinct from '1a032311d06ac6939ff04ca5977a61d6' then
    raise exception 'the wset_notes insert/update/delete policies differ from live (md5 %)', v_text;
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = 'public.can_view_notes(uuid)'::regprocedure)
     is distinct from '3fe471b0d155ff618afd5e4f559044d6' then
    raise exception 'can_view_notes is not the live body this file replaces';
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = 'public.can_view_notes(uuid)'::regprocedure and p.prosecdef) then
    raise exception 'can_view_notes is not SECURITY DEFINER';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'notes_visibility', 'UPDATE') then
    raise exception 'authenticated does not hold UPDATE on profiles.notes_visibility';
  end if;
end $$;

-- Readers' expected count, taken before anything changes (as the owner): the
-- identified notes no hold hides, by a live author, on a wine that is not
-- blind_pending — exactly what a stranger must read afterwards.
select set_config('public_notes.expected',
  (select count(*)::text
     from public.wset_notes n
     join public.profiles p on p.id = n.author_id
     join public.catalog_wines cw on cw.id = n.catalog_wine_id
    where p.deleted_at is null
      and not cw.blind_pending
      and not public.wset_note_held(n.id)),
  true);

-- ---------------------------------------------------------------------------
-- 1. No choice left: every profile PUBLIC, and no client can store another.
-- ---------------------------------------------------------------------------
update public.profiles set notes_visibility = 'PUBLIC' where notes_visibility <> 'PUBLIC';
revoke update (notes_visibility) on public.profiles from authenticated, anon, public;

-- ---------------------------------------------------------------------------
-- 2. can_view_notes: the author's account is live. Same signature, still
--    SECURITY DEFINER (profiles.deleted_at under the owner), grants kept.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_notes(p_author uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_author
      and p.deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
begin
  if exists (select 1 from public.profiles where notes_visibility <> 'PUBLIC') then
    raise exception 'a profile still has notes_visibility other than PUBLIC';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'notes_visibility', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'notes_visibility', 'UPDATE') then
    raise exception 'a client role can still write profiles.notes_visibility';
  end if;
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C") into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and x.grantee = 'authenticated'::regrole and x.privilege_type = 'UPDATE';
  if v_text is distinct from
       'avatar_url,bio,cellar_visibility,display_name,favorite_wine_type,last_seen_at,location,phone,'
       || 'preferred_currency,tour_seen_at' then
    raise exception 'the profiles client UPDATE grant is not the ten expected columns: %', v_text;
  end if;
  if not exists (select 1 from pg_proc p
                 where p.oid = 'public.can_view_notes(uuid)'::regprocedure
                   and p.prosecdef and p.provolatile = 's'
                   and p.prosrc !~ 'notes_visibility'
                   and p.prosrc ~ 'deleted_at is null') then
    raise exception 'can_view_notes is not the new definer body';
  end if;
  if not has_function_privilege('authenticated', 'public.can_view_notes(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.can_view_notes(uuid)', 'EXECUTE') then
    raise exception 'can_view_notes EXECUTE is not authenticated-only among client roles';
  end if;
  -- The read policy is untouched (every Rule 1 clause intact).
  if (select regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g')
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       '((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" changed';
  end if;
end $$;

-- Behaviour, as a signed-in stranger (an id that is no profile): they read
-- exactly the expected identified notes, and never an identity-less one.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c0de","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  v_read int;
  v_noid int;
begin
  select count(*) into v_read from public.wset_notes;
  if v_read <> current_setting('public_notes.expected')::int then
    raise exception 'a stranger reads % notes, expected %', v_read, current_setting('public_notes.expected');
  end if;
  select count(*) into v_noid from public.wset_notes where catalog_wine_id is null;
  if v_noid <> 0 then
    raise exception 'a stranger reads % identity-less notes', v_noid;
  end if;
  raise notice 'public notes: a signed-in stranger reads % notes', v_read;
end $$;
reset role;
select set_config('request.jwt.claims', '', true);
