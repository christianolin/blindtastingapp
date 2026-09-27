-- Undo M1 (20260927140000_sharing_defaults): spec §10.3. NEVER under
-- supabase/migrations. Run with scripts/sharing-defaults/run-sql.mjs,
-- --dry first, and only AFTER the app is reverted to a build that does not
-- read notes_visibility, sharing_notices or wset_my_held_notes, and after
-- rollback-m2.sql (or before M2 was ever applied). People's notes settings
-- are lost. The three indexes stay (harmless). Removes M1's history row.
--
-- It PUBLISHES NOTES: the old read policy lets every signed-in member read
-- every identified note, so at the commit these become readable to everyone
-- (and count in catalog_wine_ratings, so a wine's average and note count can
-- move mid-tasting):
-- * every held note — a host's note on tonight's wine, one held for good
--   after a Remove (R2), one linked to a masked pour of its author's (S11);
-- * every note of anyone who chose Friends or Only me.
-- The pre-state prints both counts on every run, --dry included, and refuses
-- while either is non-zero unless the run sets
-- blindr.rollback_publishes_hidden_notes = 'yes' — run-sql.mjs does that for
-- --publish-hidden-notes, which is for the owner's explicit go-ahead only.

set local lock_timeout = '10s';

do $$
declare
  v_held int;
  v_notes int;
  v_people int;
begin
  if to_regclass('public.sharing_notices') is null then
    raise exception 'M1 is not applied';
  end if;
  if exists (select 1 from public.sharing_notices)
     or (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'cellar_visibility')
        is distinct from '''PRIVATE''::cellar_visibility' then
    raise exception 'M2 is still applied: run rollback-m2.sql first';
  end if;
  select count(*)::int into v_held from public.wset_notes n where public.wset_note_held(n.id);
  select count(*)::int into v_people
    from public.profiles p where p.deleted_at is null and p.notes_visibility <> 'PUBLIC';
  select count(*)::int into v_notes
    from public.wset_notes n
    join public.profiles p on p.id = n.author_id
   where p.notes_visibility <> 'PUBLIC' and n.catalog_wine_id is not null;
  raise notice 'rollback M1 publishes to everyone: % held note(s); % note(s) of % person(s) set to Friends or Only me',
    v_held, v_notes, v_people;
  if (v_held > 0 or v_people > 0)
     and coalesce(current_setting('blindr.rollback_publishes_hidden_notes', true), '') <> 'yes' then
    raise exception 'rollback M1 would make % held note(s) and the notes of % person(s) set to Friends or Only me readable by everyone: re-run with --publish-hidden-notes only with the owner''s go-ahead',
      v_held, v_people;
  end if;
end $$;

-- 1. The notice table and its deletion trigger.
drop trigger profiles_deleted_drop_sharing_notice on public.profiles;
drop function public.drop_deleted_profile_sharing_notice();
drop table public.sharing_notices;

-- 2. The read policy, exactly as it was.
drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes for select to authenticated
  using ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) or (author_id = auth.uid()));

-- 3. The hold, release and guard triggers.
drop trigger wset_note_aromas_rule1_guard on public.wset_note_aromas;
drop function public.wset_note_aromas_rule1_guard();
drop trigger wset_notes_rule1_guard on public.wset_notes;
drop trigger wset_notes_hold_on_identity on public.wset_notes;
drop trigger wines_release_note_holds on public.wines;
drop function public.wset_notes_rule1_guard();
drop function public.wset_notes_hold_on_identity();
drop function public.wines_release_note_holds();

-- 4. The recreated bodies, back to the pinned live ones (md5 8544e9af...,
--    c3da48f2...); structure back to SECURITY DEFINER.
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
    (select count(*)::int from wset_notes where catalog_wine_id = p_id),
    (select count(*)::int from wine_answers wa join wines w on w.id = wa.wine_id
      where wa.catalog_wine_id = p_id and w.is_revealed),
    (select count(*)::int from cellar_consumptions c
      where c.catalog_wine_id = p_id
        and not exists (select 1 from masked m where m.consumption_id = c.id));
$$;

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
              'updated_at', lots.created_at))).*
    from lots
    left join masked on masked.lot_id = lots.id;
$$;

alter function public.catalog_wine_structure(uuid) security definer;

-- 5. The helpers and the hold table.
drop function public.wset_my_held_notes(uuid[]);
drop function public.wset_note_held(uuid);
drop function public.can_view_notes(uuid);
drop function public.catalog_wine_unrevealed_glasses_of(uuid, uuid);
drop table public.wset_note_holds;

-- 6. The notes setting.
revoke update (notes_visibility) on public.profiles from authenticated;
alter table public.profiles drop column notes_visibility;

-- 7. The cellars M1 recorded as already shared (M2's input).
drop table public.sharing_m1_open_cellars;

delete from supabase_migrations.schema_migrations where version = '20260927140000';

do $$
begin
  if (select format('%s %s', p.polroles::regrole[]::text, pg_get_expr(p.polqual, p.polrelid))
        from pg_policy p where p.polrelid = 'public.wset_notes'::regclass and p.polname = 'wset notes read')
     is distinct from '{authenticated} ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR (author_id = auth.uid()))' then
    raise exception '"wset notes read" is not the pre-M1 policy';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.catalog_wine_usage(uuid)'::regprocedure)
       is distinct from '8544e9afe31d30c26d516e68b19fca23'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.shared_cellar_lots(uuid)'::regprocedure)
       is distinct from 'c3da48f21c077f0a349e5d88e55b0ff7'
     or not (select prosecdef from pg_proc where oid = 'public.catalog_wine_structure(uuid)'::regprocedure) then
    raise exception 'a recreated function is not back to its pre-M1 body or security';
  end if;
  if (select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C")
        from pg_trigger t where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal)
     is distinct from
       'wset_notes_glass_move_guard,wset_notes_glass_resolve_on_write,wset_notes_hue_matches_colour,wset_notes_set_updated_at' then
    raise exception 'wset_notes triggers are not the four pre-M1 ones';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles' and column_name = 'notes_visibility')
     or to_regclass('public.wset_note_holds') is not null
     or to_regclass('public.sharing_m1_open_cellars') is not null
     or to_regprocedure('public.can_view_notes(uuid)') is not null
     or to_regprocedure('public.wset_note_aromas_rule1_guard()') is not null
     or exists (select 1 from pg_trigger t
                 where t.tgrelid = 'public.wset_note_aromas'::regclass and t.tgname = 'wset_note_aromas_rule1_guard') then
    raise exception 'an M1 object is still present';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20260927140000') then
    raise exception 'M1''s history row is still recorded';
  end if;
  raise notice 'rollback M1: done';
end $$;
