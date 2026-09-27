-- Sharing defaults, M2 of 2: every private cellar becomes visible to
-- everyone, new accounts start public, and the people this affects get a
-- one-time notice.
--
-- Spec: docs/superpowers/specs/2026-09-27-sharing-defaults-design.md (§3.2;
-- S1, S4, S14, S21). Plan: docs/superpowers/plans/2026-09-27-sharing-defaults.md,
-- Task 2. Applied only after M1 (20260927140000) AND the app deploy that
-- explains it are live on prod (spec §10.2 step 4).
--
-- Written against the LIVE state (read-only, 2026-09-27):
-- * 34 PRIVATE, 2 FRIENDS, 2 PUBLIC cellars of 38 profiles; 0 deleted.
--   profiles.cellar_visibility defaults to 'PRIVATE'.
-- * handle_new_user() md5 f18c8dc309331e2b2cf7d40bad8d55fa inserts only
--   (id, display_name, email), so column defaults decide a new account's
--   settings.
-- * The notice audience today: 34 flipped (3 of them also noted) and 2
--   noted only (the FRIENDS and the PUBLIC author) = 36 rows. Signups
--   between M1 and this file move it (R12).
--
-- "Noted" is the SQL twin of src/lib/notes/shared-notes-view.ts's
-- noteHasContent (NOTE_CONTENT_COLUMNS, pinned by a vitest test against
-- this file): any of the 17 assessment columns set, an aroma row, or free
-- text with a non-space character — on an identified note that is not held.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: M1 is present, nothing is flipped yet.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.sharing_notices') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility')
     or to_regprocedure('public.wset_note_held(uuid)') is null then
    raise exception 'M1 (20260927140000_sharing_defaults) is not applied';
  end if;
  if (select regexp_replace(regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g'), '\mpublic\.', '', 'g')
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       '((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" is not M1''s policy';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices is not empty: M2 has run before';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility no longer defaults to PRIVATE';
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p
      where p.oid = to_regprocedure('public.handle_new_user()'))
     is distinct from 'f18c8dc309331e2b2cf7d40bad8d55fa' then
    raise exception 'handle_new_user changed: a new account''s settings may no longer come from the column defaults';
  end if;
  if exists (select 1 from public.profiles where deleted_at is not null and cellar_visibility <> 'PRIVATE') then
    raise exception 'a deleted profile''s cellar is not PRIVATE';
  end if;
end $$;

-- The snapshot, before anything changes.
drop table if exists pg_temp._sd_flipped;
create temp table _sd_flipped on commit drop as
select p.id from public.profiles p
 where p.deleted_at is null and p.cellar_visibility = 'PRIVATE';

drop table if exists pg_temp._sd_noted;
create temp table _sd_noted on commit drop as
select distinct n.author_id as id
  from public.wset_notes n
  join public.profiles p on p.id = n.author_id and p.deleted_at is null
 where n.catalog_wine_id is not null
   and not public.wset_note_held(n.id)
   and (num_nonnulls(n.clarity, n.appearance_intensity, n.colour_hue, n.condition, n.nose_intensity,
                     n.development, n.sweetness, n.acidity, n.tannin, n.alcohol, n.body, n.mousse,
                     n.flavour_intensity, n.finish, n.quality_score, n.price_category, n.readiness) > 0
        or n.taster_notes ~ '\S'
        or exists (select 1 from public.wset_note_aromas a where a.note_id = n.id));

drop table if exists pg_temp._sd_counts_before;
create temp table _sd_counts_before on commit drop as
select p.cellar_visibility::text as visibility, (p.deleted_at is not null) as deleted, count(*)::int as n
  from public.profiles p
 group by 1, 2;

drop table if exists pg_temp._sd_deleted_before;
create temp table _sd_deleted_before on commit drop as
select p.id, p.cellar_visibility::text as visibility, p.notes_visibility::text as notes
  from public.profiles p
 where p.deleted_at is not null;

-- ---------------------------------------------------------------------------
-- 1. The notices: one row per flipped or noted person.
-- ---------------------------------------------------------------------------
insert into public.sharing_notices (user_id, cellar_flipped, notes_shared)
select u.id,
       exists (select 1 from _sd_flipped f where f.id = u.id),
       exists (select 1 from _sd_noted d where d.id = u.id)
  from (select id from _sd_flipped union select id from _sd_noted) u;

-- ---------------------------------------------------------------------------
-- 2. The flip (S1): PRIVATE becomes PUBLIC; FRIENDS stays; deleted rows are
--    never touched. Runs as the owner, so profiles_deleted_guard lets it through.
-- ---------------------------------------------------------------------------
update public.profiles
   set cellar_visibility = 'PUBLIC'
 where deleted_at is null and cellar_visibility = 'PRIVATE';

-- ---------------------------------------------------------------------------
-- 3. New accounts start public.
-- ---------------------------------------------------------------------------
alter table public.profiles alter column cellar_visibility set default 'PUBLIC';

-- ---------------------------------------------------------------------------
-- Post-state.
-- ---------------------------------------------------------------------------
do $$
declare
  v_flipped int := (select count(*)::int from _sd_flipped);
  v_noted int := (select count(*)::int from _sd_noted);
  v_rows int;
begin
  if exists (select 1 from public.profiles where deleted_at is null and cellar_visibility = 'PRIVATE') then
    raise exception 'a non-deleted profile is still PRIVATE';
  end if;
  if (select count(*)::int from public.profiles where deleted_at is null and cellar_visibility = 'FRIENDS')
     is distinct from coalesce((select n from _sd_counts_before where visibility = 'FRIENDS' and not deleted), 0) then
    raise exception 'the FRIENDS count changed';
  end if;
  if (select count(*)::int from public.profiles where deleted_at is null and cellar_visibility = 'PUBLIC')
     is distinct from coalesce((select n from _sd_counts_before where visibility = 'PUBLIC' and not deleted), 0) + v_flipped then
    raise exception 'PUBLIC is not the snapshot''s PUBLIC plus the flipped';
  end if;
  if exists ((select id, visibility, notes from _sd_deleted_before)
             except
             (select p.id, p.cellar_visibility::text, p.notes_visibility::text from public.profiles p where p.deleted_at is not null))
     or exists ((select p.id, p.cellar_visibility::text, p.notes_visibility::text from public.profiles p where p.deleted_at is not null)
                except
                (select id, visibility, notes from _sd_deleted_before))
     or exists (select 1 from public.profiles where deleted_at is not null and cellar_visibility <> 'PRIVATE') then
    raise exception 'a deleted profile changed, or is not PRIVATE';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PUBLIC''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility does not default to PUBLIC';
  end if;
  select count(*)::int into v_rows from public.sharing_notices;
  if v_rows is distinct from (select count(*)::int from (select id from _sd_flipped union select id from _sd_noted) u) then
    raise exception 'sharing_notices has % rows, expected |flipped ∪ noted|', v_rows;
  end if;
  if exists (
    select 1 from public.sharing_notices s
     where s.cellar_flipped is distinct from exists (select 1 from _sd_flipped f where f.id = s.user_id)
        or s.notes_shared is distinct from exists (select 1 from _sd_noted d where d.id = s.user_id)
        or s.dismissed_at is not null
  ) then
    raise exception 'a notice''s flags differ from the snapshot, or it starts dismissed';
  end if;
  raise notice 'sharing defaults M2: % cellar(s) flipped, % noted author(s), % notice row(s)', v_flipped, v_noted, v_rows;
end $$;
