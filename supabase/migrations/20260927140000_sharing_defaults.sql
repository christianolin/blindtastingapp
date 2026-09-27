-- Sharing defaults, M1 of 2: the notes setting, the narrowed notes read
-- policy and its Rule 1 machinery (the hold, the pour link, the guard on a
-- note and on its aromas), the community figures that follow the reader,
-- shared cellars without the owner-only lot fields, the empty notice table
-- M2 fills, and the cellars already shared now (M2's flip leaves a cellar
-- set to Only me after this file).
--
-- Spec: docs/superpowers/specs/2026-09-27-sharing-defaults-design.md (§3.1,
-- §4, §5; S5-S14, S19-S23). Plan: docs/superpowers/plans/2026-09-27-sharing-defaults.md,
-- Task 1. Safe under the app deployed today (spec §10.1): M1 flips no
-- cellar, and every author is Everyone, so the deployed app's readers of
-- other people's notes lose only held notes (0 live).
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * "wset notes read": SELECT, authenticated,
--   ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid())).
--   The insert, update and delete policies are 20260914094500's; md5 of
--   their canonical text (below) 1a032311d06ac6939ff04ca5977a61d6. RLS on,
--   not forced. Triggers: wset_notes_glass_move_guard,
--   wset_notes_glass_resolve_on_write, wset_notes_hue_matches_colour,
--   wset_notes_set_updated_at. wset_notes_one_identity is 20260925120000's.
-- * 16 notes (10 OPEN, 5 BLIND identified, 1 TRAINING identity-less); 0 on
--   an unidentified wine, 0 on a blind_pending wine; 0 unrevealed glasses,
--   0 flight_holds, so the hold back-fill (step 9) writes 0 rows today.
-- * profiles: 34 PRIVATE, 2 FRIENDS, 2 PUBLIC cellars, 0 deleted;
--   cellar_visibility defaults to 'PRIVATE'. Two policies ("profiles read"
--   true, "profiles update own"). The client UPDATE grant is ten columns
--   (tour_seen_at since 20260925010000); anon and authenticated hold no
--   table-level UPDATE.
-- * "catalog read" = ((NOT blind_pending) OR (created_by = auth.uid()) OR
--   can_read_blind_pending_catalog_wine(id)); "wset note aromas read" =
--   EXISTS over wset_notes; catalog_wine_ratings and catalog_wine_descriptors
--   are security_invoker=true.
-- * Function bodies (md5 of prosrc with CR stripped): can_view_cellar
--   3af2e51e338dc43cc48b58f061049ec2, catalog_wine_structure
--   e5111f04dc3c14e5d62a82072e70b6be (DEFINER; switched to INVOKER below),
--   catalog_wine_usage 8544e9afe31d30c26d516e68b19fca23 and
--   shared_cellar_lots c3da48f21c077f0a349e5d88e55b0ff7 (recreated below),
--   catalog_wine_masked_pours fea91b152e3565f16c56cc1d15810d29 and
--   catalog_wine_in_callers_unrevealed_glass f33fbd7f4e283cb0ed682469aa6ea2c2
--   (owner-only; called / mirrored), save_wset_note
--   9ac29b18bbda5b08bcd9a12e19beb932, record_training_attempt
--   f6a24c83c24aaab34ab568dc6280083f, wset_notes_resolve_on_reveal
--   f406623e9d46feb1f1aa0fb8c285529d, scrub_deleted_account
--   b9aa8d71a00dda3aec526a2ec6950f1d (all unchanged).
-- * Default privileges hand every new function EXECUTE to PUBLIC, anon,
--   authenticated and service_role, and every new table all privileges to
--   anon, authenticated and service_role: each object below revokes what it
--   must not keep.
--
-- Never add a catalog_wines_unidentified check to the notes read policy:
-- its policy calls can_read_unidentified_wine, SECURITY INVOKER over
-- wset_notes, and the policy would recurse (spec §4.3). Notes on an
-- unidentified wine are simply author-only.
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
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility') then
    raise exception 'profiles.notes_visibility already exists; re-read live before applying';
  end if;
  if to_regclass('public.wset_note_holds') is not null or to_regclass('public.sharing_notices') is not null
     or to_regclass('public.sharing_m1_open_cellars') is not null then
    raise exception 'wset_note_holds, sharing_notices or sharing_m1_open_cellars already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('can_view_notes', 'wset_note_held', 'wset_my_held_notes',
                      'catalog_wine_unrevealed_glasses_of', 'wset_notes_hold_on_identity',
                      'wines_release_note_holds', 'wset_notes_rule1_guard',
                      'wset_note_aromas_rule1_guard', 'drop_deleted_profile_sharing_notice');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;
  if exists (select 1 from pg_trigger t
             where not t.tgisinternal
               and t.tgname in ('wset_notes_hold_on_identity', 'wines_release_note_holds',
                                'wset_notes_rule1_guard', 'wset_note_aromas_rule1_guard',
                                'profiles_deleted_drop_sharing_notice')) then
    raise exception 'a trigger this migration creates already exists';
  end if;
  if exists (select 1 from pg_indexes i
             where i.schemaname = 'public'
               and i.indexname in ('wset_notes_author_tasted_idx', 'wset_notes_catalog_wine_idx',
                                   'cellar_consumptions_wset_note_idx')) then
    raise exception 'an index this migration creates already exists';
  end if;

  -- 2. The enum both settings use, and the cellar default M2 changes.
  if enum_range(null::public.cellar_visibility)::text[] is distinct from array['PRIVATE', 'FRIENDS', 'PUBLIC'] then
    raise exception 'cellar_visibility labels are not PRIVATE, FRIENDS, PUBLIC';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'profiles.cellar_visibility does not default to PRIVATE';
  end if;

  -- 3. wset_notes: RLS, the four policies, the four triggers, the identity check.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.wset_notes'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'wset_notes row level security is not enabled, or is forced';
  end if;
  if (select string_agg(p.polname::text, ',' order by p.polname::text collate "C")
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass)
     is distinct from 'wset notes delete,wset notes insert,wset notes read,wset notes update' then
    raise exception 'wset_notes does not have exactly its four live policies';
  end if;
  if (select format('%s %s %s', p.polcmd, p.polroles::regrole[]::text, pg_get_expr(p.polqual, p.polrelid))
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from
       'r {authenticated} ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid()))' then
    raise exception '"wset notes read" is not the live policy this file replaces';
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
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hue_matches_colour,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers differ from the four live ones';
  end if;
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from
       'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) '
       || 'AND (context_kind = ''BLIND''::wset_note_context)) OR '
       || '((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NULL) '
       || 'AND (context_kind = ''TRAINING''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the live constraint';
  end if;

  -- 4. profiles: the two policies, the ten-column client UPDATE grant, no table UPDATE.
  if (select string_agg(format('%s %s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                               coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                               coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                        '; ' order by p.polname::text collate "C")
        from pg_policy p where p.polrelid = 'public.profiles'::regclass)
     is distinct from
       'profiles read r {authenticated} true -; profiles update own w {authenticated} (id = auth.uid()) (id = auth.uid())' then
    raise exception 'profiles policies differ from live';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                    order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and x.grantee = 'authenticated'::regrole;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,phone:UPDATE,preferred_currency:UPDATE,tour_seen_at:UPDATE' then
    raise exception 'the profiles client UPDATE grant is not the ten live columns: %', v_text;
  end if;
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE') then
    raise exception 'anon or authenticated holds a table-level UPDATE on profiles';
  end if;

  -- 5. The catalog gate the new policy leans on, and the two invoker views.
  if (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
      where p.polrelid = 'public.catalog_wines'::regclass and p.polname = 'catalog read')
     is distinct from
       '((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id))' then
    raise exception '"catalog read" is not the live policy this file relies on';
  end if;
  if (select regexp_replace(pg_get_expr(p.polqual, p.polrelid), '\s+', ' ', 'g') from pg_policy p
      where p.polrelid = 'public.wset_note_aromas'::regclass and p.polname = 'wset note aromas read')
     is distinct from '(EXISTS ( SELECT 1 FROM wset_notes n WHERE (n.id = wset_note_aromas.note_id)))' then
    raise exception '"wset note aromas read" is not the live policy';
  end if;
  if exists (select 1 from pg_class c
             where c.oid in ('public.catalog_wine_ratings'::regclass, 'public.catalog_wine_descriptors'::regclass)
               and not ('security_invoker=true' = any (coalesce(c.reloptions, '{}')))) then
    raise exception 'catalog_wine_ratings or catalog_wine_descriptors is not security_invoker';
  end if;

  -- 6. The bodies this file recreates, switches, calls or mirrors.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.can_view_cellar(uuid)',                           '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_structure(uuid)',                    'e5111f04dc3c14e5d62a82072e70b6be'),
    ('public.catalog_wine_usage(uuid)',                        '8544e9afe31d30c26d516e68b19fca23'),
    ('public.shared_cellar_lots(uuid)',                        'c3da48f21c077f0a349e5d88e55b0ff7'),
    ('public.catalog_wine_masked_pours(uuid[])',               'fea91b152e3565f16c56cc1d15810d29'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)',  'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.save_wset_note(jsonb,jsonb)',                     '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.record_training_attempt(jsonb,jsonb,jsonb)',      'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.wset_notes_resolve_on_reveal()',                  'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.scrub_deleted_account(uuid)',                     'b9aa8d71a00dda3aec526a2ec6950f1d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = 'public.catalog_wine_structure(uuid)'::regprocedure) then
    raise exception 'catalog_wine_structure is already SECURITY INVOKER';
  end if;
end $$;

-- The "before" numbers the post-state compares against.
drop table if exists pg_temp._sd_profiles_before;
create temp table _sd_profiles_before on commit drop as
select p.cellar_visibility::text as visibility, (p.deleted_at is not null) as deleted, count(*)::int as n
  from public.profiles p
 group by 1, 2;

drop table if exists pg_temp._sd_notes_before;
create temp table _sd_notes_before on commit drop as
select count(*)::int as n from public.wset_notes;

-- The holds step 9 must write, computed here independently of the helper:
-- every identified note whose author is right now the adder of an unrevealed
-- glass keyed to the note's wine (the host for added_by_host, else the
-- contributor), paired with that glass.
drop table if exists pg_temp._sd_backfill;
create temp table _sd_backfill on commit drop as
select distinct n.id as note_id, w.id as wine_id
  from public.wset_notes n
  join public.wine_answers wa on wa.catalog_wine_id = n.catalog_wine_id
  join public.wines w on w.id = wa.wine_id
  join public.tastings t on t.id = w.tasting_id
  left join public.tasting_participants tp on tp.id = w.contributor_participant_id
 where n.catalog_wine_id is not null
   and not w.is_revealed
   and case when w.added_by_host then t.host_id = n.author_id else tp.user_id = n.author_id end;

-- ---------------------------------------------------------------------------
-- 1. The notes setting (S5): same enum and friend rule as the cellar.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notes_visibility public.cellar_visibility not null default 'PUBLIC';
grant update (notes_visibility) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The hold table (S10): internal, no client access, flight_holds style.
--    A removed glass keeps its hold (wine_id set null, OD4).
-- ---------------------------------------------------------------------------
create table public.wset_note_holds (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.wset_notes(id) on delete cascade,
  wine_id uuid references public.wines(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (note_id, wine_id)
);
create index wset_note_holds_wine_idx on public.wset_note_holds (wine_id);
alter table public.wset_note_holds enable row level security;
revoke all on public.wset_note_holds from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers (spec §4.2).
-- ---------------------------------------------------------------------------

-- catalog_wine_in_callers_unrevealed_glass with p_user for auth.uid(),
-- returning the glass ids. Internal: owner-only EXECUTE.
create function public.catalog_wine_unrevealed_glasses_of(p_catalog_wine_id uuid, p_user uuid)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select w.id
    from wine_answers wa
    join wines w on w.id = wa.wine_id
    join tastings t on t.id = w.tasting_id
    left join tasting_participants tp on tp.id = w.contributor_participant_id
   where wa.catalog_wine_id = p_catalog_wine_id
     and not w.is_revealed
     and case when w.added_by_host then t.host_id = p_user else tp.user_id = p_user end;
$$;
revoke all on function public.catalog_wine_unrevealed_glasses_of(uuid, uuid) from public, anon, authenticated, service_role;

-- S7: can_view_cellar's Friends clause, byte for byte, over notes_visibility,
-- plus one clause: a deleted author's notes are refused.
create function public.can_view_notes(p_author uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = p_author
      and p.deleted_at is null
      and (
        p.notes_visibility = 'PUBLIC'
        or (
          p.notes_visibility = 'FRIENDS'
          and exists (
            select 1 from friendships f
            where (f.user_id = p_author and f.friend_id = auth.uid())
               or (f.user_id = auth.uid() and f.friend_id = p_author)
          )
        )
      )
  );
$$;
revoke all on function public.can_view_notes(uuid) from public, anon;
grant execute on function public.can_view_notes(uuid) to authenticated, service_role;

-- S10 + S11: held by a hold row, or linked through its author's own
-- consumption to a pour catalog_wine_masked_pours still masks. The owner
-- match stops anyone hiding another person's note with their own pour.
create function public.wset_note_held(p_note_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from wset_note_holds h where h.note_id = p_note_id)
      or exists (
        select 1
          from wset_notes n
          join cellar_consumptions c on c.wset_note_id = n.id and c.owner_id = n.author_id
          cross join lateral catalog_wine_masked_pours(array[c.catalog_wine_id]) m
         where n.id = p_note_id and m.consumption_id = c.id);
$$;
revoke all on function public.wset_note_held(uuid) from public, anon, service_role;
grant execute on function public.wset_note_held(uuid) to authenticated;

-- S19: which of these note ids are the caller's own held notes.
create function public.wset_my_held_notes(p_note_ids uuid[])
returns setof uuid
language sql stable security definer set search_path = public as $$
  select n.id from wset_notes n
   where n.id = any(p_note_ids) and n.author_id = auth.uid() and wset_note_held(n.id);
$$;
revoke all on function public.wset_my_held_notes(uuid[]) from public, anon, service_role;
grant execute on function public.wset_my_held_notes(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Triggers (spec §5): the hold, its release, the guard on a note and on
--    its aromas.
-- ---------------------------------------------------------------------------

-- S10: a note that gains an identity while its author adds an unrevealed
-- glass of that wine is held until that glass is revealed. Keyed on the
-- author, never auth.uid(), so every write path is covered. Two more glasses
-- hold it, each known to the author alone: one where the author's own guess
-- is scored in an ASYNC IMMEDIATE tasting (has_scored_guess's rule: they read
-- the answer before the reveal), and one that pours a bottle of the wine from
-- the author's own cellar (the pour catalog_wine_masked_pours masks, also
-- after a Swap), so a note is held from its save, not from a later cellar
-- link (S11). The adder clause is catalog_wine_unrevealed_glasses_of's,
-- inlined: the glasses are read FOR SHARE (a STABLE helper cannot lock), so a
-- reveal in flight is waited for and is_revealed re-read after it, and no
-- hold lands on a glass whose release (wines_release_note_holds) already ran.
-- The trigger also fires on a move (tasting_wine_id): an identity that
-- wset_notes_glass_resolve_on_write fills in a BEFORE trigger is not in the
-- UPDATE's SET list, so an "update of catalog_wine_id" trigger alone would miss it.
create function public.wset_notes_hold_on_identity()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_glass uuid;
begin
  if new.catalog_wine_id is null then
    return null;
  end if;
  -- A move is not an arrival: a note others could see never becomes held.
  if tg_op = 'UPDATE' and old.catalog_wine_id is not null then
    return null;
  end if;
  -- The glasses keyed to the note's wine: the author added it, or has a
  -- scored ASYNC IMMEDIATE guess on it.
  for v_glass in
    select w.id
      from wine_answers wa
      join wines w on w.id = wa.wine_id
      join tastings t on t.id = w.tasting_id
      left join tasting_participants tp on tp.id = w.contributor_participant_id
     where wa.catalog_wine_id = new.catalog_wine_id
       and not w.is_revealed
       and ((case when w.added_by_host then t.host_id = new.author_id else tp.user_id = new.author_id end)
            or (t.timing_mode = 'ASYNC' and t.async_reveal_policy = 'IMMEDIATE' and w.reveal_step = 0
                and exists (select 1
                              from guesses g
                              join tasting_participants gp on gp.id = g.participant_id
                             where g.wine_id = w.id
                               and gp.tasting_id = w.tasting_id
                               and gp.user_id = new.author_id
                               and gp.status = 'JOINED'
                               and g.scored_at is not null)))
       for share of w
  loop
    insert into wset_note_holds (note_id, wine_id) values (new.id, v_glass)
    on conflict (note_id, wine_id) do nothing;
  end loop;
  -- The glasses that pour a bottle of it from the author's own cellar.
  for v_glass in
    select w.id
      from wines w
     where not w.is_revealed
       and exists (select 1
                     from cellar_consumptions c
                    where c.owner_id = new.author_id
                      and c.catalog_wine_id = new.catalog_wine_id
                      and (exists (select 1 from flight_holds h
                                    where h.consumption_id = c.id and h.wine_id = w.id)
                           or exists (select 1 from wine_pour_intents i
                                       where i.cellar_consumption_id = c.id and i.wine_id = w.id)))
       for share of w
  loop
    insert into wset_note_holds (note_id, wine_id) values (new.id, v_glass)
    on conflict (note_id, wine_id) do nothing;
  end loop;
  return null;
end $$;
revoke all on function public.wset_notes_hold_on_identity() from public, anon, authenticated, service_role;
create trigger wset_notes_hold_on_identity
  after insert or update of catalog_wine_id, tasting_wine_id on public.wset_notes
  for each row execute function public.wset_notes_hold_on_identity();

-- Only a reveal releases a hold: that glass's. A removed glass, a deleted
-- tasting or a CLOSED one leaves it held for good (the flight_holds rule).
-- Same trigger shape as wset_notes_resolve_on_reveal, so both fire together.
create function public.wines_release_note_holds()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from wset_note_holds where wine_id = new.id;
  return null;
end $$;
revoke all on function public.wines_release_note_holds() from public, anon, authenticated, service_role;
create trigger wines_release_note_holds
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.wines_release_note_holds();

-- S12: catalog_wines_rule1_guard's analogue. The adder of an unrevealed
-- glass of W may not change or delete a note on W that others can already
-- see, nor move any note onto W. Only the author's own statement is judged.
create function public.wset_notes_rule1_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or old.author_id is distinct from auth.uid() then
    return coalesce(new, old);
  end if;
  if (old.catalog_wine_id is not null
      and not wset_note_held(old.id)
      and exists (select 1 from catalog_wine_unrevealed_glasses_of(old.catalog_wine_id, old.author_id)))
     or (tg_op = 'UPDATE' and old.catalog_wine_id is not null
         and new.catalog_wine_id is distinct from old.catalog_wine_id and new.catalog_wine_id is not null
         and exists (select 1 from catalog_wine_unrevealed_glasses_of(new.catalog_wine_id, old.author_id))) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change or delete this note after the reveal.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.wset_notes_rule1_guard() from public, anon, authenticated, service_role;
create trigger wset_notes_rule1_guard
  before update or delete on public.wset_notes
  for each row execute function public.wset_notes_rule1_guard();

-- S12 on a note's aromas: the same adder may not add, change or remove the
-- aroma rows of a note on W that others can already see, which would change
-- that note's read view and W's "What people find" mid-tasting (the
-- wset_note_aromas write policies check only the author). The guard's first
-- condition, judged on the parent note. save_wset_note writes aromas only
-- after its note write, which the note guard has already judged, and a note
-- it just created on W is held by then; RI cascades (depth > 1) and the scrub
-- (no auth.uid()) are not judged.
create function public.wset_note_aromas_rule1_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_notes uuid[] := '{}';
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op <> 'INSERT' then
    v_notes := v_notes || old.note_id;
  end if;
  if tg_op <> 'DELETE' then
    v_notes := v_notes || new.note_id;
  end if;
  if exists (select 1
               from wset_notes n
              where n.id = any (v_notes)
                and n.author_id = auth.uid()
                and n.catalog_wine_id is not null
                and not wset_note_held(n.id)
                and exists (select 1 from catalog_wine_unrevealed_glasses_of(n.catalog_wine_id, n.author_id))) then
    raise exception using
      errcode = '42501',
      message = 'This wine is in one of your flights that hasn''t been revealed yet. Change or delete this note after the reveal.';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.wset_note_aromas_rule1_guard() from public, anon, authenticated, service_role;
create trigger wset_note_aromas_rule1_guard
  before insert or update or delete on public.wset_note_aromas
  for each row execute function public.wset_note_aromas_rule1_guard();

-- ---------------------------------------------------------------------------
-- 5. Indexes for the new surfaces (by author, by wine) and the pour link.
-- ---------------------------------------------------------------------------
create index wset_notes_author_tasted_idx on public.wset_notes (author_id, tasted_on desc, created_at desc);
create index wset_notes_catalog_wine_idx on public.wset_notes (catalog_wine_id, tasted_on desc)
  where catalog_wine_id is not null;
create index cellar_consumptions_wset_note_idx on public.cellar_consumptions (wset_note_id)
  where wset_note_id is not null;

-- ---------------------------------------------------------------------------
-- 6. The read policy (S8, spec §4.3). The EXISTS runs under the reader's own
--    "catalog read", so a note on a blind_pending wine reaches only people
--    who can already read that wine.
-- ---------------------------------------------------------------------------
drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes for select to authenticated
using (
  author_id = auth.uid()
  or (
    catalog_wine_id is not null
    and public.can_view_notes(author_id)
    and not public.wset_note_held(id)
    and exists (select 1 from public.catalog_wines cw where cw.id = wset_notes.catalog_wine_id)
  )
);

-- ---------------------------------------------------------------------------
-- 7. Structure averages follow the reader (S9): only prosecdef flips.
-- ---------------------------------------------------------------------------
alter function public.catalog_wine_structure(uuid) security invoker;

-- ---------------------------------------------------------------------------
-- 8. catalog_wine_usage: the live body with one line changed — a held note
--    moves no count others see. Private notes still count (a reference
--    count for the delete guard). create or replace keeps its ACL.
-- ---------------------------------------------------------------------------
create or replace function public.catalog_wine_usage(p_id uuid)
returns table(holders integer, bottles integer, lot_count integer, note_count integer,
              appearance_count integer, consumption_count integer)
language sql stable security definer set search_path = public as $$
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
    (select count(*)::int from wset_notes n where n.catalog_wine_id = p_id and not wset_note_held(n.id)),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

-- ---------------------------------------------------------------------------
-- 9. Back-fill holds for notes whose author adds an unrevealed glass of the
--    note's wine right now (0 live). A one-off hide of notes the app has
--    never shown to anyone but their author; the trigger's other two
--    clauses (a scored ASYNC IMMEDIATE guess, a masked pour) hold arrivals
--    from here on only. No reveal can race it: creating
--    wines_release_note_holds above took a lock on wines that every reveal's
--    UPDATE waits for until this transaction ends.
-- ---------------------------------------------------------------------------
insert into public.wset_note_holds (note_id, wine_id)
select n.id, g from public.wset_notes n
cross join lateral public.catalog_wine_unrevealed_glasses_of(n.catalog_wine_id, n.author_id) g
where n.catalog_wine_id is not null
on conflict (note_id, wine_id) do nothing;

-- ---------------------------------------------------------------------------
-- 10. shared_cellar_lots (S13): anyone but the owner gets lot_note,
--     price_per_bottle and purchase_source as null. A null auth.uid() takes
--     the blanking branch. create or replace keeps its ACL.
-- ---------------------------------------------------------------------------
create or replace function public.shared_cellar_lots(p_owner uuid)
returns setof public.cellar_lots
language sql stable security definer set search_path = public as $$
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
              'updated_at', lots.created_at)
            || case when p_owner = auth.uid() then '{}'::jsonb
                    else jsonb_build_object('lot_note', null, 'price_per_bottle', null,
                                            'purchase_source', null) end)).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

-- ---------------------------------------------------------------------------
-- 11. The notice table (S14), created empty; M2 fills it. Owner-only: every
--     member reads profiles, so a flag there would publish who used to have
--     a private cellar.
-- ---------------------------------------------------------------------------
create table public.sharing_notices (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cellar_flipped boolean not null,
  notes_shared boolean not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  constraint sharing_notices_reason check (cellar_flipped or notes_shared)
);
alter table public.sharing_notices enable row level security;
revoke all on public.sharing_notices from public, anon, authenticated;
grant select on public.sharing_notices to authenticated;
grant update (dismissed_at) on public.sharing_notices to authenticated;
create policy "sharing notices read own" on public.sharing_notices for select to authenticated
  using (user_id = auth.uid());
create policy "sharing notices dismiss own" on public.sharing_notices for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- An account deletion drops the notice (the profiles_deleted_drop_favourites
-- precedent).
create function public.drop_deleted_profile_sharing_notice()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from sharing_notices where user_id = new.id;
  return null;
end $$;
revoke all on function public.drop_deleted_profile_sharing_notice() from public, anon, authenticated, service_role;
create trigger profiles_deleted_drop_sharing_notice
  after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.drop_deleted_profile_sharing_notice();

-- ---------------------------------------------------------------------------
-- 12. The cellars already shared now (Friends or Everyone), for M2's flip.
--     The Sharing card ships between M1 and M2 (spec §10.2), so a cellar
--     that is shared here and Only me by M2 was set so by hand, and M2
--     leaves it. Internal: no client access; the app never reads it. Step
--     1's add column holds an exclusive lock on profiles until commit, so no
--     cellar changes between this insert and the post-state's check of it.
-- ---------------------------------------------------------------------------
create table public.sharing_m1_open_cellars (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.sharing_m1_open_cellars enable row level security;
revoke all on public.sharing_m1_open_cellars from public, anon, authenticated;
insert into public.sharing_m1_open_cellars (user_id)
select p.id from public.profiles p
 where p.deleted_at is null and p.cellar_visibility <> 'PRIVATE';

-- ---------------------------------------------------------------------------
-- Post-state: every check in the same transaction; any failure rolls it all back.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
  v_n int;
begin
  -- 1. The read policy's new text (whitespace and any public. prefix
  --    normalised); the three write policies byte-identical to before.
  select regexp_replace(regexp_replace(format('%s %s %s', p.polcmd, p.polroles::regrole[]::text,
                                              pg_get_expr(p.polqual, p.polrelid)),
                                       '\s+', ' ', 'g'), '\mpublic\.', '', 'g')
    into v_text
  from pg_policy p
  where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read' and p.polwithcheck is null;
  if v_text is distinct from
       'r {authenticated} ((author_id = auth.uid()) OR ((catalog_wine_id IS NOT NULL) AND can_view_notes(author_id) '
       || 'AND (NOT wset_note_held(id)) AND (EXISTS ( SELECT 1 FROM catalog_wines cw '
       || 'WHERE (cw.id = wset_notes.catalog_wine_id)))))' then
    raise exception '"wset notes read" is not spec §4.3''s policy: %', v_text;
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
    raise exception 'the wset_notes insert/update/delete policies changed (md5 %)', v_text;
  end if;
  if (select count(*) from pg_policy p where p.polrelid = 'public.wset_notes'::regclass) <> 4 then
    raise exception 'wset_notes does not have exactly four policies';
  end if;

  -- 2. Triggers: the four from before plus the hold and the guard; the
  --    aromas guard; the release on wines; the notice drop on profiles.
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hold_on_identity,'
       || 'wset_notes_hue_matches_colour,wset_notes_rule1_guard,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers are not the four live ones plus the hold and the guard';
  end if;
  select string_agg(regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g'), ' | '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wset_notes_hold_on_identity', 'wset_notes_rule1_guard', 'wset_note_aromas_rule1_guard',
                     'wines_release_note_holds', 'profiles_deleted_drop_sharing_notice');
  if v_text is distinct from
       'CREATE TRIGGER profiles_deleted_drop_sharing_notice AFTER UPDATE OF deleted_at ON profiles FOR EACH ROW '
       || 'WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION drop_deleted_profile_sharing_notice()'
       || ' | CREATE TRIGGER wines_release_note_holds AFTER UPDATE OF is_revealed ON wines FOR EACH ROW '
       || 'WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION wines_release_note_holds()'
       || ' | CREATE TRIGGER wset_note_aromas_rule1_guard BEFORE INSERT OR DELETE OR UPDATE ON wset_note_aromas '
       || 'FOR EACH ROW EXECUTE FUNCTION wset_note_aromas_rule1_guard()'
       || ' | CREATE TRIGGER wset_notes_hold_on_identity AFTER INSERT OR UPDATE OF catalog_wine_id, tasting_wine_id '
       || 'ON wset_notes FOR EACH ROW EXECUTE FUNCTION wset_notes_hold_on_identity()'
       || ' | CREATE TRIGGER wset_notes_rule1_guard BEFORE DELETE OR UPDATE ON wset_notes '
       || 'FOR EACH ROW EXECUTE FUNCTION wset_notes_rule1_guard()' then
    raise exception 'the new triggers differ from spec §3.1 step 4: %', v_text;
  end if;

  -- 3. profiles: notes_visibility not null default PUBLIC everywhere; the
  --    eleven-column grant; the cellar untouched (M1 flips nothing).
  if (select format('%s %s %s', c.udt_name, c.is_nullable, c.column_default)
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = 'profiles' and c.column_name = 'notes_visibility')
     is distinct from 'cellar_visibility NO ''PUBLIC''::cellar_visibility' then
    raise exception 'profiles.notes_visibility is not cellar_visibility not null default PUBLIC';
  end if;
  if exists (select 1 from public.profiles where notes_visibility <> 'PUBLIC') then
    raise exception 'a profile does not start with notes_visibility PUBLIC';
  end if;
  select string_agg(format('%s:%s', a.attname, x.privilege_type), ','
                    order by a.attname::text collate "C", x.privilege_type collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
    and x.grantee = 'authenticated'::regrole;
  if v_text is distinct from
       'avatar_url:UPDATE,bio:UPDATE,cellar_visibility:UPDATE,display_name:UPDATE,favorite_wine_type:UPDATE,'
       || 'last_seen_at:UPDATE,location:UPDATE,notes_visibility:UPDATE,phone:UPDATE,preferred_currency:UPDATE,'
       || 'tour_seen_at:UPDATE' then
    raise exception 'the profiles client UPDATE grant is not the eleven columns: %', v_text;
  end if;
  if has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_column_privilege('anon', 'public.profiles', 'notes_visibility', 'UPDATE') then
    raise exception 'the profiles UPDATE grant widened past the eleven authenticated columns';
  end if;
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
     is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'M1 must not change the cellar default';
  end if;
  if exists (
    (select p.cellar_visibility::text, (p.deleted_at is not null), count(*)::int from public.profiles p group by 1, 2)
    except
    (select visibility, deleted, n from _sd_profiles_before)
  ) or exists (
    (select visibility, deleted, n from _sd_profiles_before)
    except
    (select p.cellar_visibility::text, (p.deleted_at is not null), count(*)::int from public.profiles p group by 1, 2)
  ) then
    raise exception 'M1 changed a cellar setting';
  end if;
  if (select count(*)::int from public.wset_notes) <> (select n from _sd_notes_before) then
    raise exception 'M1 changed the number of notes';
  end if;

  -- 4. wset_note_holds: RLS on, no policy, no client privilege; exactly the
  --    back-fill computed before anything changed.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.wset_note_holds'::regclass and c.relrowsecurity and not c.relforcerowsecurity)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.wset_note_holds'::regclass)
     or exists (select 1 from pg_class c, aclexplode(c.relacl) a
                where c.oid = 'public.wset_note_holds'::regclass
                  and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))) then
    raise exception 'wset_note_holds is not internal (RLS on, no policy, no PUBLIC/anon/authenticated privilege)';
  end if;
  if exists ((select note_id, wine_id from public.wset_note_holds) except (select note_id, wine_id from _sd_backfill))
     or exists ((select note_id, wine_id from _sd_backfill) except (select note_id, wine_id from public.wset_note_holds)) then
    raise exception 'the hold back-fill differs from the notes whose author adds an unrevealed glass of their wine';
  end if;

  -- 5. sharing_notices: its columns, RLS and two own-row policies,
  --    authenticated SELECT + UPDATE(dismissed_at) only, anon nothing, empty.
  select string_agg(format('%s %s%s%s', a.attname, t.typname,
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by a.attnum)
    into v_text
  from pg_attribute a
  join pg_type t on t.oid = a.atttypid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.sharing_notices'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'user_id uuid not null, cellar_flipped bool not null, notes_shared bool not null, '
       || 'created_at timestamptz not null default now(), dismissed_at timestamptz' then
    raise exception 'sharing_notices columns differ from spec §3.1 step 11: %', v_text;
  end if;
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid = 'public.sharing_notices'::regclass;
  if v_text is distinct from
       'sharing_notices_pkey PRIMARY KEY (user_id); '
       || 'sharing_notices_reason CHECK ((cellar_flipped OR notes_shared)); '
       || 'sharing_notices_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE' then
    raise exception 'sharing_notices constraints differ from spec §3.1 step 11: %', v_text;
  end if;
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.sharing_notices'::regclass and c.relrowsecurity and not c.relforcerowsecurity) then
    raise exception 'sharing_notices row level security is not enabled, or is forced';
  end if;
  select string_agg(format('%s %s %s %s %s', p.polname, p.polcmd, p.polroles::regrole[]::text,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.sharing_notices'::regclass;
  if v_text is distinct from
       'sharing notices dismiss own w {authenticated} (user_id = auth.uid()) (user_id = auth.uid()); '
       || 'sharing notices read own r {authenticated} (user_id = auth.uid()) -' then
    raise exception 'sharing_notices policies differ from spec §3.1 step 11: %', v_text;
  end if;
  select string_agg(a.privilege_type, ',' order by a.privilege_type collate "C") into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.oid = 'public.sharing_notices'::regclass and a.grantee = 'authenticated'::regrole;
  if v_text is distinct from 'SELECT' then
    raise exception 'authenticated table privileges on sharing_notices are %, expected SELECT only', coalesce(v_text, '-');
  end if;
  select string_agg(format('%s:%s:%s', a.attname, pg_get_userbyid(x.grantee), x.privilege_type), ','
                    order by a.attname::text collate "C")
    into v_text
  from pg_attribute a, aclexplode(a.attacl) x
  where a.attrelid = 'public.sharing_notices'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'dismissed_at:authenticated:UPDATE' then
    raise exception 'sharing_notices column grants are %, expected dismissed_at:authenticated:UPDATE', coalesce(v_text, '-');
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
             where c.oid = 'public.sharing_notices'::regclass and (a.grantee = 0 or a.grantee = 'anon'::regrole)) then
    raise exception 'anon or PUBLIC holds a privilege on sharing_notices';
  end if;
  if exists (select 1 from public.sharing_notices) then
    raise exception 'sharing_notices must start empty (M2 fills it)';
  end if;

  -- 6. The three indexes.
  select string_agg(regexp_replace(i.indexdef, '\mpublic\.', '', 'g'), ' | ' order by i.indexname collate "C")
    into v_text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname in ('cellar_consumptions_wset_note_idx', 'wset_notes_author_tasted_idx', 'wset_notes_catalog_wine_idx');
  if v_text is distinct from
       'CREATE INDEX cellar_consumptions_wset_note_idx ON cellar_consumptions USING btree (wset_note_id) WHERE (wset_note_id IS NOT NULL)'
       || ' | CREATE INDEX wset_notes_author_tasted_idx ON wset_notes USING btree (author_id, tasted_on DESC, created_at DESC)'
       || ' | CREATE INDEX wset_notes_catalog_wine_idx ON wset_notes USING btree (catalog_wine_id, tasted_on DESC) WHERE (catalog_wine_id IS NOT NULL)' then
    raise exception 'the new indexes differ from spec §3.1 step 5: %', v_text;
  end if;

  -- 7. Every function this file creates or recreates, and the one it
  --    switches: security, search_path, volatility, language, return type,
  --    arguments, body md5 and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.definer, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
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
      ('public.catalog_wine_unrevealed_glasses_of(uuid,uuid)', true, 's', 'sql', 'uuid', true,
       'p_catalog_wine_id uuid, p_user uuid', '91748b399ca7bbb3de7f752e6c47c3d9', 'OWNER'),
      ('public.can_view_notes(uuid)', true, 's', 'sql', 'boolean', false,
       'p_author uuid', '3fe471b0d155ff618afd5e4f559044d6', 'OWNER,authenticated,service_role'),
      ('public.wset_note_held(uuid)', true, 's', 'sql', 'boolean', false,
       'p_note_id uuid', '9599a36cd224a3af0d5c2fb3dea70b2b', 'OWNER,authenticated'),
      ('public.wset_my_held_notes(uuid[])', true, 's', 'sql', 'uuid', true,
       'p_note_ids uuid[]', '3a08cb7faf015f9b2f592d60d6a5bafb', 'OWNER,authenticated'),
      ('public.wset_notes_hold_on_identity()', true, 'v', 'plpgsql', 'trigger', false,
       '', '392edc2f47b146e8fa291703c6739702', 'OWNER'),
      ('public.wines_release_note_holds()', true, 'v', 'plpgsql', 'trigger', false,
       '', '419a9f4dda4fac12a601207ea3f3b45a', 'OWNER'),
      ('public.wset_notes_rule1_guard()', true, 'v', 'plpgsql', 'trigger', false,
       '', '770e9c571942c4a9e6bd337fc0dbf200', 'OWNER'),
      ('public.wset_note_aromas_rule1_guard()', true, 'v', 'plpgsql', 'trigger', false,
       '', 'cc66665c8d7771678016919f6aa1ed5e', 'OWNER'),
      ('public.drop_deleted_profile_sharing_notice()', true, 'v', 'plpgsql', 'trigger', false,
       '', '656d8d4d8f86f71b61a0238f1cf59636', 'OWNER'),
      ('public.catalog_wine_usage(uuid)', true, 's', 'sql', 'record', true,
       'p_id uuid', '79615b604369fe584ba39bf9ef6f4dd8', 'OWNER,authenticated,service_role'),
      ('public.shared_cellar_lots(uuid)', true, 's', 'sql', 'cellar_lots', true,
       'p_owner uuid', '1091a585637cbc6235a220a52b12cb99', 'OWNER,authenticated,service_role'),
      ('public.catalog_wine_structure(uuid)', false, 's', 'sql', 'record', true,
       'p_catalog_wine_id uuid', 'e5111f04dc3c14e5d62a82072e70b6be', 'OWNER,anon,authenticated,service_role')
    ) as s (sig, definer, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.definer
       or v_fn.config_now is distinct from '{search_path=public}'
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

  -- 8. What this file calls or mirrors without changing it.
  select string_agg(s.sig, ', ') into v_text
  from (values
    ('public.can_view_cellar(uuid)',                          '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.catalog_wine_masked_pours(uuid[])',              'fea91b152e3565f16c56cc1d15810d29'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.save_wset_note(jsonb,jsonb)',                    '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.record_training_attempt(jsonb,jsonb,jsonb)',     'f6a24c83c24aaab34ab568dc6280083f'),
    ('public.wset_notes_resolve_on_reveal()',                 'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.scrub_deleted_account(uuid)',                    'b9aa8d71a00dda3aec526a2ec6950f1d')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'a function this file relies on changed: %', v_text;
  end if;

  -- 9. sharing_m1_open_cellars: internal (RLS on, no policy, no client
  --    privilege), and exactly the non-deleted cellars shared right now.
  if not exists (select 1 from pg_class c
                 where c.oid = 'public.sharing_m1_open_cellars'::regclass and c.relrowsecurity and not c.relforcerowsecurity)
     or exists (select 1 from pg_policy p where p.polrelid = 'public.sharing_m1_open_cellars'::regclass)
     or exists (select 1 from pg_class c, aclexplode(c.relacl) a
                where c.oid = 'public.sharing_m1_open_cellars'::regclass
                  and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))) then
    raise exception 'sharing_m1_open_cellars is not internal (RLS on, no policy, no PUBLIC/anon/authenticated privilege)';
  end if;
  if exists ((select o.user_id from public.sharing_m1_open_cellars o)
             except
             (select p.id from public.profiles p where p.deleted_at is null and p.cellar_visibility <> 'PRIVATE'))
     or exists ((select p.id from public.profiles p where p.deleted_at is null and p.cellar_visibility <> 'PRIVATE')
                except
                (select o.user_id from public.sharing_m1_open_cellars o)) then
    raise exception 'sharing_m1_open_cellars is not the set of cellars shared when M1 ran';
  end if;

  select count(*)::int into v_n from public.wset_note_holds;
  raise notice 'sharing defaults M1: % hold(s) back-filled; % notes; % profiles; % cellar(s) already shared',
    v_n, (select n from _sd_notes_before), (select sum(n) from _sd_profiles_before),
    (select count(*) from public.sharing_m1_open_cellars);
end $$;
