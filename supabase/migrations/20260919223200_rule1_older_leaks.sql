-- rule1_older_leaks: closes the pre-existing rule-1 leaks F4, F6, F7, F8, F10
-- and F11 (§9 of docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md),
-- on top of 20260919223100 (born-hidden flight wines, F5; the shared cellar read).
--
-- Spec: docs/superpowers/specs/2026-09-19-rule1-older-leaks.md (§5.2 is the SQL
-- design this file implements, verbatim between the banners).
--
-- Written against the LIVE state (read-only queries, 2026-09-19), with
-- 20260919223100 applied on top:
-- * catalog_wine_mark_blind (AFTER INSERT OR UPDATE OF catalog_wine_id on
--   wine_answers) hides ANY linked wine with no lot, note or revealed glass,
--   so a public catalog-only wine vanishes the moment a host pours it (F4).
-- * catalog_wine_unmark_blind_on_unlink un-hides the wine a glass stops
--   linking as soon as no unrevealed glass links it: an Edit, a Swap or a
--   Remove plus a re-add publishes the abandoned brand-new wine, a near-copy of
--   the one now in the glass, mid-tasting (F11). catalog_wine_masked_pours
--   masks a pour only while an intent still links it, so the same Swap or
--   Remove unmasks the pre-swap wine's counts (F11, spec R3 of 20260919213300).
-- * authenticated (and anon) hold table-level INSERT and UPDATE on
--   catalog_wines: blind_pending, merged_into, created_by, id are
--   client-writable (F6).
-- * merge_catalog_wines is EXECUTE for PUBLIC and anon, and moves every answer
--   key of the loser, other people's unrevealed glasses included, onto the
--   winner (F7).
-- * "cellar own select" is owner_id = auth.uid() or can_view_cellar(owner_id):
--   a PUBLIC or FRIENDS cellar's lot quantity visibly drops at Start (F8).
-- * "unidentified read" on catalog_wines_unidentified is true for every
--   signed-in user: an unidentified flight glass's identity is public (F10).
--
-- What this migration does:
-- F4.  catalog_wine_mark_blind is dropped. A wine is hidden only when it is
--      born for a flight (20260919223100); a wine that already exists is
--      never hidden because someone pours it.
-- F11. flight_holds: a hidden wine linked by an unrevealed glass, and a bottle
--      poured into one, is held to that glass. A held wine stays hidden after
--      an Edit, Swap or Remove, and a held pour stays masked, until a reveal
--      releases the hold: the reveal of that glass or, for a wine, of any
--      glass that links it. Nothing else releases a hold. A removed glass, a
--      deleted tasting, or a tasting CLOSED with a glass never revealed keeps
--      its holds for good, so a wine abandoned before any reveal stays hidden
--      (its creator and curators read it) until a later glass that pours it
--      is revealed.
-- F6.  authenticated keeps INSERT and UPDATE on the catalog_wines columns the
--      app writes, and nothing else; anon keeps neither.
-- F7.  merge_catalog_wines: EXECUTE for authenticated and service_role only;
--      an unrevealed glass keeps its answer key until its own reveal moves it
--      to the winner; a hidden wine is never a merge target.
-- F8.  "cellar own select" is the owner only; everyone else reads a cellar
--      through shared_cellar_lots (masked pours).
-- F10. "unidentified read" admits the row's creator and whoever can read an
--      answer key naming it (or their own note naming it).
--
-- Rule 1: nothing here answers differently for anyone depending on whether
-- someone else poured a wine; the one refusal added (a merge by the adder of
-- an unrevealed glass of a public loser) is catalog_wines_rule1_guard's, and
-- depends only on the caller's own glasses.
--
-- Deploy order (spec §8): 20260919223100, then the app, then this file. The
-- app sends "hidden" for flight wines and reads other cellars through
-- shared_cellar_lots; applied before that app, brand-new flight wines would be
-- born public and stay public, and friends' cellars would read empty.
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
  -- 1. 20260919223100 is applied (its two bodies are pinned in 3).
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260919223100') then
    raise exception '20260919223100 (rule1_born_hidden_and_shared_cellar) is not applied; apply it, then deploy the app, first';
  end if;

  -- 2. Nothing this migration creates exists yet.
  if to_regclass('public.flight_holds') is not null
     or to_regclass('public.wine_answers_unidentified_wine_id_idx') is not null then
    raise exception 'flight_holds or wine_answers_unidentified_wine_id_idx already exists; re-read live before applying';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('catalog_wine_unhide_if_free', 'catalog_wine_merge_target', 'flight_holds_on_link',
                      'flight_holds_on_pour', 'flight_holds_after_delete', 'can_read_unidentified_wine');
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;

  -- 3. Every body replaced, dropped or relied on is the live one (md5 of
  --    prosrc with any CR stripped):
  --    * mark (dropped), unmark and unmark-on-unlink, masked pours and merge:
  --      replaced here;
  --    * find_or_create (born hidden) and shared_cellar_lots: 20260919223100;
  --    * the pour pair: each sets wine_pour_intents.cellar_consumption_id
  --      after it inserts the consumption (the pour hold keys on that);
  --    * reveal_wine / reveal_next_category: a reveal is an UPDATE of
  --      wines.is_revealed, and both refuse a CLOSED tasting;
  --    * remove_flight_glass: a Remove deletes the wines row (cascades);
  --    * the rule-1 guard and its helper: they refuse the tombstone of a
  --      merge by the adder of an unrevealed glass of a public loser, and
  --      exempt every write at trigger depth > 1;
  --    * usage/holdings: they read masked pours;
  --    * can_read_blind_pending_catalog_wine: the model the unidentified
  --      helper mirrors; resolve_unidentified_wine: left unchanged.
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.find_or_create_catalog_wine(jsonb)', '0e9e2f1142635473eb916125611ed7ef'),
    ('public.shared_cellar_lots(uuid)', 'c3da48f21c077f0a349e5d88e55b0ff7'),
    ('public.catalog_wine_identity_match(jsonb)', '763eb9a53dcb0ebb4dbeaf0c92073f35'),
    ('public.catalog_wine_mark_blind()', '08dc5499a57fda78eda6e6ac31ac9f9d'),
    ('public.catalog_wine_unmark_blind()', 'f9e3bf5208ceddd18a9b334c585965cc'),
    ('public.catalog_wine_unmark_blind_on_unlink()', '3473768fbd4143ed68129953ecce6ea4'),
    ('public.catalog_wine_masked_pours(uuid[])', '7e2054d9001878a17672aedd11d7bfcb'),
    ('public.merge_catalog_wines(uuid,uuid)', '82c43b99a3f136acd5d772bd16f4e2d6'),
    ('public.draw_down_flight_cellar_lots(uuid)', '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.pour_cellar_lot_into_glass(uuid)', '558e60723fa745ead80dd0dc75871411'),
    ('public.reveal_wine(uuid)', 'ed7f78a59fb299b6307e586b8e8ab5c0'),
    ('public.reveal_next_category(uuid,smallint)', '6a08183662534db0d212b2412d729ac2'),
    ('public.remove_flight_glass(uuid)', 'afbc58c0c0b48becdfde9436d5b2ebc0'),
    ('public.catalog_wines_rule1_guard()', 'd7ab319ef77e4516f32f8d22ff531833'),
    ('public.catalog_wine_in_callers_unrevealed_glass(uuid)', 'f33fbd7f4e283cb0ed682469aa6ea2c2'),
    ('public.catalog_wine_usage(uuid)', '8544e9afe31d30c26d516e68b19fca23'),
    ('public.catalog_wine_holdings(uuid[])', 'af3b6c87fcbfbbbf46c210d84f3b5b00'),
    ('public.can_read_blind_pending_catalog_wine(uuid)', '111373cbbf75a46339813b377c8a975c'),
    ('public.resolve_unidentified_wine(uuid,uuid)', '915e17733e5f48577fbf777fdcd81af8'),
    ('public.can_view_cellar(uuid)', '3af2e51e338dc43cc48b58f061049ec2')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'live function bodies differ from the ones this file was written against: %', v_text;
  end if;

  -- 4. merge_catalog_wines: EXECUTE for PUBLIC, anon, authenticated and
  --    service_role (what the revoke below narrows).
  select string_agg(x.g, ',' order by x.g collate "C") into v_text
  from (select distinct case when a.grantee = 0 then 'PUBLIC'
                             when a.grantee = p.proowner then 'OWNER'
                             else pg_get_userbyid(a.grantee)::text end as g
          from pg_proc p, aclexplode(p.proacl) a
         where p.oid = to_regprocedure('public.merge_catalog_wines(uuid,uuid)') and a.privilege_type = 'EXECUTE') x;
  if v_text is distinct from 'OWNER,PUBLIC,anon,authenticated,service_role' then
    raise exception 'merge_catalog_wines EXECUTE grantees differ from live: %', v_text;
  end if;

  -- 5. The triggers on every table this file adds a trigger to, or whose
  --    trigger function it replaces or drops, and on tastings (a hold must
  --    outlive its tasting's close and delete: no trigger there may release
  --    one), are exactly the live ones.
  select string_agg(format('%s.%s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.wine_answers'::regclass, 'public.wines'::regclass, 'public.tastings'::regclass,
                      'public.wine_pour_intents'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from
       'tastings.tastings_lock_setup_after_start 19 tastings_lock_setup_after_start(); '
       || 'tastings.tastings_pause_follows_status 23 tastings_pause_follows_status(); '
       || 'tastings.tastings_pointer_in_tasting 23 tastings_pointer_in_tasting(); '
       || 'tastings.tastings_stamp_lifecycle 23 tastings_stamp_lifecycle(); '
       || 'wine_answers.trg_catalog_wine_mark_blind 21 catalog_wine_mark_blind(); '
       || 'wine_answers.trg_catalog_wine_unmark_blind_on_unlink 25 catalog_wine_unmark_blind_on_unlink(); '
       || 'wine_answers.trg_wine_answers_clear_identity_draft 5 wine_answers_clear_identity_draft(); '
       || 'wines.semi_blind_release_revealed_wine 17 semi_blind_release_revealed_wine(); '
       || 'wines.trg_catalog_wine_unmark_blind 17 catalog_wine_unmark_blind(); '
       || 'wines.wines_drop_unresolved_notes 11 wines_drop_unresolved_notes(); '
       || 'wines.wines_full_reveal_step 19 wines_full_reveal_step(); '
       || 'wines.wines_pin_adder 23 wines_pin_adder(); '
       || 'wines.wines_refuse_reveal_while_paused 19 wines_refuse_reveal_while_paused(); '
       || 'wines.wines_semi_blind_flight_locked 7 wines_semi_blind_flight_locked(); '
       || 'wines.wines_stamp_revealed_at 23 wines_stamp_revealed_at(); '
       || 'wines.wset_notes_resolve_on_reveal 17 wset_notes_resolve_on_reveal()' then
    raise exception 'wine_answers / wines / tastings / wine_pour_intents triggers differ from live: %', v_text;
  end if;

  -- 6. The three policies replaced or relied on read as live does; the
  --    answer-key read policy the unidentified helper runs under is pinned by md5.
  select string_agg(format('%s.%s %s %s', p.tablename, p.policyname, p.cmd, p.qual), '; '
                    order by p.tablename collate "C", p.policyname collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (('catalog_wines', 'catalog read'), ('cellar_lots', 'cellar own select'),
                                        ('catalog_wines_unidentified', 'unidentified read'));
  if v_text is distinct from
       'catalog_wines.catalog read SELECT ((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id)); '
       || 'catalog_wines_unidentified.unidentified read SELECT true; '
       || 'cellar_lots.cellar own select SELECT ((owner_id = auth.uid()) OR can_view_cellar(owner_id))' then
    raise exception 'catalog / cellar / unidentified read policies differ from live: %', v_text;
  end if;
  if (select md5(p.qual) from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers read')
     is distinct from 'abe0592ac72de20adfb3b8005bc86f86' then
    raise exception '"wine_answers read" differs from the policy this file was written against';
  end if;

  -- 7. catalog_wines: anon and authenticated hold table-level INSERT and
  --    UPDATE (what F6 narrows to columns).
  if not (has_table_privilege('authenticated', 'public.catalog_wines', 'INSERT')
          and has_table_privilege('authenticated', 'public.catalog_wines', 'UPDATE')
          and has_table_privilege('anon', 'public.catalog_wines', 'INSERT')
          and has_table_privilege('anon', 'public.catalog_wines', 'UPDATE')) then
    raise exception 'catalog_wines table-level INSERT/UPDATE for anon and authenticated differ from live';
  end if;

  -- 8. The columns the new bodies read or write.
  select string_agg(s.tbl || '.' || s.col, ', ') into v_text
  from (values
    ('catalog_wines', 'blind_pending'), ('catalog_wines', 'merged_into'), ('catalog_wines', 'created_by'),
    ('wine_answers', 'catalog_wine_id'), ('wine_answers', 'unidentified_wine_id'), ('wine_answers', 'wine_id'),
    ('wines', 'is_revealed'), ('wines', 'tasting_id'), ('tastings', 'status'),
    ('wine_pour_intents', 'wine_id'), ('wine_pour_intents', 'cellar_consumption_id'),
    ('cellar_consumptions', 'lot_id'), ('cellar_consumptions', 'catalog_wine_id'), ('cellar_consumptions', 'quantity'),
    ('wset_notes', 'unidentified_wine_id'), ('wset_notes', 'author_id'), ('wset_notes', 'catalog_wine_id'),
    ('catalog_wines_unidentified', 'created_by')
  ) as s (tbl, col)
  where not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || s.tbl) and a.attname = s.col and not a.attisdropped);
  if v_text is not null then
    raise exception 'columns this migration reads are missing: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- BEGIN SPEC §5.2 SQL
-- ===========================================================================

-- F6 ------------------------------------------------------------------------

-- A client inserts only through find_or_create_catalog_wine (the identity, its
-- creator and, for a flight, blind_pending) and updates only what Manage wine,
-- the fill, the price fill and the main photo write. blind_pending,
-- merged_into, created_by, id and the timestamps are written by the database
-- alone (triggers, merge_catalog_wines, defaults).
revoke insert, update on table catalog_wines from anon, authenticated;
grant insert (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
              type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style, wine_name,
              created_by, blind_pending)
  on table catalog_wines to authenticated;
grant update (country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id,
              type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, colour, style, wine_name,
              description, alcohol_percent, image_url, estimated_price, estimated_price_currency)
  on table catalog_wines to authenticated;

-- F4 + F11: holds ----------------------------------------------------------

-- Something hidden because of a flight: a flight-born catalog wine an
-- unrevealed glass links (it stays hidden even after the glass stops linking
-- it), or a cellar bottle poured into an unrevealed glass (it stays masked in
-- every shared count and cellar). Only a reveal releases a hold: the reveal of
-- its glass or, for a catalog hold, of any glass that links its wine, since
-- that wine is public from then on (catalog_wine_unmark_blind). A removed glass
-- (wine_id set null) or a deleted tasting (tasting_id set null) keeps its holds
-- for good: releasing them at a close or a delete would publish a wine no glass
-- ever revealed, and a later pour of it would then be public from the start.
-- tasting_id records the tasting that took the hold (null once that tasting is
-- deleted); no release rule reads it.
-- Internal: no client role reads or writes it.
create table flight_holds (
  id uuid primary key default gen_random_uuid(),
  tasting_id uuid references tastings(id) on delete set null,
  wine_id uuid references wines(id) on delete set null,
  catalog_wine_id uuid references catalog_wines(id) on delete cascade,
  consumption_id uuid references cellar_consumptions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint flight_holds_one_subject check (num_nonnulls(catalog_wine_id, consumption_id) = 1)
);
create index flight_holds_tasting_idx on flight_holds (tasting_id);
create index flight_holds_wine_idx on flight_holds (wine_id) where wine_id is not null;
create index flight_holds_catalog_wine_idx on flight_holds (catalog_wine_id) where catalog_wine_id is not null;
create unique index flight_holds_consumption_key on flight_holds (consumption_id) where consumption_id is not null;
alter table flight_holds enable row level security;
revoke all on table flight_holds from public, anon, authenticated;

-- A hidden wine that no unrevealed glass links and no hold keeps hidden becomes
-- public. The one place a flight-born wine is un-hidden other than its own reveal.
create function catalog_wine_unhide_if_free(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update catalog_wines cw set blind_pending = false
   where cw.id = p_id
     and cw.blind_pending
     and not exists (select 1 from wine_answers wa join wines w on w.id = wa.wine_id
                      where wa.catalog_wine_id = cw.id and not w.is_revealed)
     and not exists (select 1 from flight_holds h where h.catalog_wine_id = cw.id);
$$;

-- The wine a merged-away wine ends up in (merged_into followed to its end).
create function catalog_wine_merge_target(p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_next uuid;
  v_hops int := 0;
begin
  loop
    select c.merged_into into v_next from catalog_wines c where c.id = v_id;
    exit when v_next is null or v_hops >= 32;
    v_id := v_next;
    v_hops := v_hops + 1;
  end loop;
  return v_id;
end $$;

-- An answer key links a hidden wine to a glass that is not revealed yet: hold
-- the wine to that glass (replaces catalog_wine_mark_blind, which hid any
-- linked wine without a lot, note or revealed glass: F4).
create function flight_holds_on_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.catalog_wine_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.catalog_wine_id is not distinct from old.catalog_wine_id then
    return null;
  end if;
  insert into flight_holds (tasting_id, wine_id, catalog_wine_id)
  select w.tasting_id, w.id, cw.id
    from wines w
    join catalog_wines cw on cw.id = new.catalog_wine_id
   where w.id = new.wine_id
     and not w.is_revealed
     and cw.blind_pending
     and not exists (select 1 from flight_holds h where h.wine_id = w.id and h.catalog_wine_id = cw.id);
  return null;
end $$;

-- A bottle poured into a glass that is not revealed yet (D11: Start's
-- draw-down or a running pour, which set cellar_consumption_id): hold the pour
-- to that glass, so a Swap or Remove that drops the intent keeps it masked.
create function flight_holds_on_pour()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cellar_consumption_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.cellar_consumption_id is not distinct from old.cellar_consumption_id then
    return null;
  end if;
  insert into flight_holds (tasting_id, wine_id, consumption_id)
  select w.tasting_id, w.id, new.cellar_consumption_id
    from wines w
   where w.id = new.wine_id
     and not w.is_revealed
  on conflict (consumption_id) where consumption_id is not null do nothing;
  return null;
end $$;

-- A released hold may free its wine.
create function flight_holds_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.catalog_wine_id is not null then
    perform catalog_wine_unhide_if_free(old.catalog_wine_id);
  end if;
  return null;
end $$;

-- A glass stops linking a wine (Edit, Swap, Remove, a tasting deleted): the
-- wine becomes public only once nothing keeps it hidden (F11; was: as soon as
-- no unrevealed glass linked it). A flight-born wine's hold outlives the link,
-- so this never publishes one; only a reveal does.
create or replace function catalog_wine_unmark_blind_on_unlink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.catalog_wine_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.catalog_wine_id is not distinct from old.catalog_wine_id then
    return null;
  end if;
  perform catalog_wine_unhide_if_free(old.catalog_wine_id);
  return null;
end $$;

-- A glass is revealed: an answer key a merge left on a merged-away wine moves
-- to the wine it was merged into (F7), the glass's wine becomes public, and
-- every hold on this glass or on its wine is released (F11; the pours held to
-- it unmask, as 20260919213300's masking did at the reveal). The only release:
-- a wine abandoned by this glass's Edit or Swap is a near-copy of the wine now
-- public, and a removed glass's wine waits for a glass that pours it.
create or replace function catalog_wine_unmark_blind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_revealed and not old.is_revealed then
    update wine_answers wa
       set catalog_wine_id = catalog_wine_merge_target(wa.catalog_wine_id)
     where wa.wine_id = new.id
       and exists (select 1 from catalog_wines c where c.id = wa.catalog_wine_id and c.merged_into is not null);
    update catalog_wines cw set blind_pending = false
    where cw.blind_pending
      and cw.id in (
        select wa.catalog_wine_id from wine_answers wa where wa.wine_id = new.id
      );
    delete from flight_holds h
     where h.wine_id = new.id
        or h.catalog_wine_id in (select wa.catalog_wine_id from wine_answers wa where wa.wine_id = new.id);
  end if;
  return new;
end $$;

drop trigger trg_catalog_wine_mark_blind on wine_answers;
drop function catalog_wine_mark_blind();

create trigger flight_holds_on_link
  after insert or update of catalog_wine_id on wine_answers
  for each row execute function flight_holds_on_link();

create trigger flight_holds_on_pour
  after insert or update of cellar_consumption_id on wine_pour_intents
  for each row execute function flight_holds_on_pour();

create trigger flight_holds_after_delete
  after delete on flight_holds
  for each row execute function flight_holds_after_delete();

-- What live holds today: every hidden wine an unrevealed glass links, and every
-- bottle poured into an unrevealed glass.
insert into flight_holds (tasting_id, wine_id, catalog_wine_id)
select distinct w.tasting_id, w.id, wa.catalog_wine_id
  from wine_answers wa
  join wines w on w.id = wa.wine_id
  join catalog_wines cw on cw.id = wa.catalog_wine_id
 where not w.is_revealed and cw.blind_pending;
insert into flight_holds (tasting_id, wine_id, consumption_id)
select w.tasting_id, w.id, i.cellar_consumption_id
  from wine_pour_intents i
  join wines w on w.id = i.wine_id
 where i.cellar_consumption_id is not null and not w.is_revealed
on conflict (consumption_id) where consumption_id is not null do nothing;

-- F2 + F11: a held pour stays masked after its intent is gone ----------------

create or replace function catalog_wine_masked_pours(p_ids uuid[])
returns table (consumption_id uuid, lot_id uuid, catalog_wine_id uuid, quantity integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.lot_id, c.catalog_wine_id, c.quantity
    from cellar_consumptions c
   where c.catalog_wine_id = any(p_ids)
     and (exists (select 1 from flight_holds h where h.consumption_id = c.id)
          or exists (select 1
                       from wine_pour_intents i
                       join wines w on w.id = i.wine_id
                      where i.cellar_consumption_id = c.id
                        and not w.is_revealed));
$$;

revoke execute on function catalog_wine_unhide_if_free(uuid) from public, anon, authenticated, service_role;
revoke execute on function catalog_wine_merge_target(uuid) from public, anon, authenticated, service_role;
revoke execute on function flight_holds_on_link() from public, anon, authenticated, service_role;
revoke execute on function flight_holds_on_pour() from public, anon, authenticated, service_role;
revoke execute on function flight_holds_after_delete() from public, anon, authenticated, service_role;

-- F7 ------------------------------------------------------------------------

-- A merge never shows anyone a hidden glass: only revealed glasses move now; an
-- unrevealed glass keeps its answer key on the loser until its own reveal moves
-- it (catalog_wine_unmark_blind). A hidden wine is never a target, and says so
-- with the same words as a missing one. The loser's tombstone is still judged by
-- catalog_wines_rule1_guard, which refuses only the adder of an unrevealed glass
-- of a public loser.
create or replace function merge_catalog_wines(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_loser = p_winner then
    raise exception 'cannot merge a catalog wine into itself';
  end if;
  if not exists (
    select 1 from catalog_wines c
    where c.id = p_loser
      and (
        c.created_by = auth.uid()
        or exists (select 1 from profiles p where p.id = auth.uid() and p.is_curator)
      )
  ) then
    raise exception 'not authorised to merge this catalog wine';
  end if;
  if not exists (select 1 from catalog_wines where id = p_winner and merged_into is null and not blind_pending) then
    raise exception 'winner catalog wine not found or already merged';
  end if;

  update wset_notes    set catalog_wine_id = p_winner where catalog_wine_id = p_loser;
  update wine_answers wa set catalog_wine_id = p_winner
   where wa.catalog_wine_id = p_loser
     and exists (select 1 from wines w where w.id = wa.wine_id and w.is_revealed);
  update catalog_wines set merged_into = p_winner where id = p_loser;
end $$;

revoke execute on function merge_catalog_wines(uuid, uuid) from public, anon;
grant execute on function merge_catalog_wines(uuid, uuid) to authenticated, service_role;

-- F8 ------------------------------------------------------------------------

-- Another person's cellar is read only through shared_cellar_lots
-- (20260919223100), where a bottle poured into an unrevealed glass is still in
-- its lot.
drop policy "cellar own select" on cellar_lots;
create policy "cellar own select" on cellar_lots
  for select to authenticated
  using (owner_id = auth.uid());

-- F10 -----------------------------------------------------------------------

-- Whoever may already read an answer key naming this unidentified wine (the
-- adder; anyone, once its glass is revealed; an ASYNC IMMEDIATE guesser who
-- scored it), or who wrote a note naming it. SECURITY INVOKER on purpose, like
-- can_read_blind_pending_catalog_wine: it reads under the caller's own RLS, so
-- it narrows whenever "wine_answers read" does.
create function can_read_unidentified_wine(p_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (select 1 from wine_answers wa where wa.unidentified_wine_id = p_id)
      or exists (select 1 from wset_notes n where n.unidentified_wine_id = p_id and n.author_id = auth.uid());
$$;

revoke execute on function can_read_unidentified_wine(uuid) from public, anon;
grant execute on function can_read_unidentified_wine(uuid) to authenticated, service_role;

drop policy "unidentified read" on catalog_wines_unidentified;
create policy "unidentified read" on catalog_wines_unidentified
  for select to authenticated
  using (created_by = auth.uid() or can_read_unidentified_wine(id));

create index wine_answers_unidentified_wine_id_idx on wine_answers (unidentified_wine_id)
  where unidentified_wine_id is not null;

-- ===========================================================================
-- END SPEC §5.2 SQL
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_n int;
begin
  -- 1. Every function created or replaced: security, search_path, volatility,
  --    language, return type, set-returning, arguments, body and EXECUTE.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
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
      ('public.catalog_wine_unhide_if_free(uuid)', true, '{search_path=public}', 'v', 'sql', 'void', false,
       'p_id uuid', 'f946145ff6a4f72ee7271e87d5112ab8', 'OWNER'),
      ('public.catalog_wine_merge_target(uuid)', true, '{search_path=public}', 's', 'plpgsql', 'uuid', false,
       'p_id uuid', '41b6630a6f071bc910f6af21f32511ce', 'OWNER'),
      ('public.flight_holds_on_link()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '7e7f1a32f794e143df94b10cdec59d67', 'OWNER'),
      ('public.flight_holds_on_pour()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'f2eefca376cd3135468195963bf32ae5', 'OWNER'),
      ('public.flight_holds_after_delete()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'b9f927675b7787cf134df79e9831c54b', 'OWNER'),
      ('public.catalog_wine_unmark_blind_on_unlink()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', '923badd459406c1cffcc02cb66733df7', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.catalog_wine_unmark_blind()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'de1f11ee58c418bf8fdc9310f0ba508f', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.catalog_wine_masked_pours(uuid[])', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_ids uuid[]', 'fea91b152e3565f16c56cc1d15810d29', 'OWNER'),
      ('public.merge_catalog_wines(uuid,uuid)', true, '{search_path=public}', 'v', 'plpgsql', 'void', false,
       'p_loser uuid, p_winner uuid', '6894957f77b8107a54e9f186a0973788', 'OWNER,authenticated,service_role'),
      ('public.can_read_unidentified_wine(uuid)', false, '{search_path=public}', 's', 'sql', 'boolean', false,
       'p_id uuid', 'c293ea5374aaee3bb3c89e8da4513850', 'OWNER,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, retset, args, body_md5, grantees)
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
  if to_regprocedure('public.catalog_wine_mark_blind()') is not null then
    raise exception 'catalog_wine_mark_blind() still exists';
  end if;
  if has_function_privilege('anon', 'public.merge_catalog_wines(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.merge_catalog_wines(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.can_read_unidentified_wine(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_unhide_if_free(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.catalog_wine_merge_target(uuid)', 'EXECUTE') then
    raise exception 'EXECUTE is not: merge and the unidentified helper authenticated + service_role; the hold helpers nobody';
  end if;

  -- 2. The triggers on the five tables, in full (none on tastings releases a
  --    hold).
  select string_agg(format('%s.%s %s %s %s', t.tgrelid::regclass::text, t.tgname, t.tgtype, t.tgenabled,
                           t.tgfoid::regprocedure::text),
                    '; ' order by t.tgrelid::regclass::text collate "C", t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid in ('public.wine_answers'::regclass, 'public.wines'::regclass, 'public.tastings'::regclass,
                      'public.wine_pour_intents'::regclass, 'public.flight_holds'::regclass)
    and not t.tgisinternal;
  if v_text is distinct from
       'flight_holds.flight_holds_after_delete 9 O flight_holds_after_delete(); '
       || 'tastings.tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start(); '
       || 'tastings.tastings_pause_follows_status 23 O tastings_pause_follows_status(); '
       || 'tastings.tastings_pointer_in_tasting 23 O tastings_pointer_in_tasting(); '
       || 'tastings.tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle(); '
       || 'wine_answers.flight_holds_on_link 21 O flight_holds_on_link(); '
       || 'wine_answers.trg_catalog_wine_unmark_blind_on_unlink 25 O catalog_wine_unmark_blind_on_unlink(); '
       || 'wine_answers.trg_wine_answers_clear_identity_draft 5 O wine_answers_clear_identity_draft(); '
       || 'wine_pour_intents.flight_holds_on_pour 21 O flight_holds_on_pour(); '
       || 'wines.semi_blind_release_revealed_wine 17 O semi_blind_release_revealed_wine(); '
       || 'wines.trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind(); '
       || 'wines.wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes(); '
       || 'wines.wines_full_reveal_step 19 O wines_full_reveal_step(); '
       || 'wines.wines_pin_adder 23 O wines_pin_adder(); '
       || 'wines.wines_refuse_reveal_while_paused 19 O wines_refuse_reveal_while_paused(); '
       || 'wines.wines_semi_blind_flight_locked 7 O wines_semi_blind_flight_locked(); '
       || 'wines.wines_stamp_revealed_at 23 O wines_stamp_revealed_at(); '
       || 'wines.wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal()' then
    raise exception 'triggers post-migration are %', v_text;
  end if;

  -- 3. The three read policies, as this file leaves them.
  select string_agg(format('%s.%s %s %s %s', p.tablename, p.policyname, p.cmd, p.roles::text, p.qual), '; '
                    order by p.tablename collate "C", p.policyname collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (('catalog_wines', 'catalog read'), ('cellar_lots', 'cellar own select'),
                                        ('catalog_wines_unidentified', 'unidentified read'));
  if v_text is distinct from
       'catalog_wines.catalog read SELECT {authenticated} ((NOT blind_pending) OR (created_by = auth.uid()) OR can_read_blind_pending_catalog_wine(id)); '
       || 'catalog_wines_unidentified.unidentified read SELECT {authenticated} ((created_by = auth.uid()) OR can_read_unidentified_wine(id)); '
       || 'cellar_lots.cellar own select SELECT {authenticated} (owner_id = auth.uid())' then
    raise exception 'read policies post-migration are %', v_text;
  end if;

  -- 4. catalog_wines: no table-level INSERT/UPDATE for anon or authenticated;
  --    authenticated's column grants exactly the two lists; anon none.
  if has_table_privilege('authenticated', 'public.catalog_wines', 'INSERT')
     or has_table_privilege('authenticated', 'public.catalog_wines', 'UPDATE')
     or has_table_privilege('anon', 'public.catalog_wines', 'INSERT')
     or has_table_privilege('anon', 'public.catalog_wines', 'UPDATE')
     or has_any_column_privilege('anon', 'public.catalog_wines', 'INSERT')
     or has_any_column_privilege('anon', 'public.catalog_wines', 'UPDATE') then
    raise exception 'catalog_wines still grants table-level INSERT/UPDATE, or anon a column';
  end if;
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C") into v_text
  from pg_attribute a
  where a.attrelid = 'public.catalog_wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.catalog_wines', a.attname, 'INSERT');
  if v_text is distinct from
       'appellation_id,blind_pending,colour,country_id,created_by,primary_grape_id,producer_id,region_id,'
       || 'secondary_grape_id,style,type_designation_id,vintage_kind,vintage_tawny_years,vintage_year,wine_name' then
    raise exception 'authenticated INSERT columns on catalog_wines are %', v_text;
  end if;
  select string_agg(a.attname::text, ',' order by a.attname::text collate "C") into v_text
  from pg_attribute a
  where a.attrelid = 'public.catalog_wines'::regclass and a.attnum > 0 and not a.attisdropped
    and has_column_privilege('authenticated', 'public.catalog_wines', a.attname, 'UPDATE');
  if v_text is distinct from
       'alcohol_percent,appellation_id,colour,country_id,description,estimated_price,estimated_price_currency,'
       || 'image_url,primary_grape_id,producer_id,region_id,secondary_grape_id,style,type_designation_id,'
       || 'vintage_kind,vintage_tawny_years,vintage_year,wine_name' then
    raise exception 'authenticated UPDATE columns on catalog_wines are %', v_text;
  end if;

  -- 5. flight_holds: RLS on, no policy, nothing for anon or authenticated.
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.flight_holds'::regclass)
     or exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'flight_holds')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'INSERT')
     or has_any_column_privilege('authenticated', 'public.flight_holds', 'UPDATE')
     or has_table_privilege('authenticated', 'public.flight_holds', 'DELETE')
     or has_any_column_privilege('anon', 'public.flight_holds', 'SELECT')
     or has_table_privilege('anon', 'public.flight_holds', 'DELETE') then
    raise exception 'flight_holds is readable or writable by a client role';
  end if;
  --    Only a reveal releases a hold: deleting the tasting or the glass keeps
  --    it (set null); only the held wine or consumption itself going away
  --    drops it.
  select string_agg(format('%s %s', a.attname, c.confdeltype), ', ' order by a.attname::text collate "C")
    into v_text
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.conrelid = 'public.flight_holds'::regclass and c.contype = 'f';
  if v_text is distinct from 'catalog_wine_id c, consumption_id c, tasting_id n, wine_id n'
     or exists (select 1 from pg_attribute a
                 where a.attrelid = 'public.flight_holds'::regclass and a.attname in ('tasting_id', 'wine_id')
                   and a.attnotnull) then
    raise exception 'flight_holds foreign keys are %; tasting_id and wine_id must be nullable and set null on delete', v_text;
  end if;

  -- 6. The backfill holds what live holds: every hidden wine an unrevealed glass
  --    links, and every pour into an unrevealed glass.
  select count(*) into v_n
  from wine_answers wa
  join wines w on w.id = wa.wine_id
  join catalog_wines cw on cw.id = wa.catalog_wine_id
  where not w.is_revealed and cw.blind_pending
    and not exists (select 1 from flight_holds h where h.wine_id = w.id and h.catalog_wine_id = cw.id);
  if v_n > 0 then
    raise exception '% hidden links are not held', v_n;
  end if;
  select count(*) into v_n
  from wine_pour_intents i
  join wines w on w.id = i.wine_id
  where i.cellar_consumption_id is not null and not w.is_revealed
    and not exists (select 1 from flight_holds h where h.consumption_id = i.cellar_consumption_id);
  if v_n > 0 then
    raise exception '% pours into unrevealed glasses are not held', v_n;
  end if;

  -- 7. No live count moves: the masked pours are exactly the ones
  --    20260919213300 masked (an intent linking an unrevealed glass).
  with now_masked as (
    select m.consumption_id as id from catalog_wine_masked_pours(array(select id from catalog_wines)) m
  ),
  was_masked as (
    select c.id from cellar_consumptions c
     where exists (select 1 from wine_pour_intents i join wines w on w.id = i.wine_id
                    where i.cellar_consumption_id = c.id and not w.is_revealed)
  )
  select count(*) into v_n
  from ((select id from now_masked except select id from was_masked)
        union all
        (select id from was_masked except select id from now_masked)) d;
  if v_n > 0 then
    raise exception 'catalog_wine_masked_pours differs from the pours 20260919213300 masked on % consumptions', v_n;
  end if;
end $$;
