-- Levels and achievements: an append-only XP ledger written by triggers on the
-- source tables, levels on a fixed curve, twenty achievements, the history
-- backfill and three client RPCs.
--
-- Spec: docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md
-- (§2-§7; L1-L36; C1: this version, 20260927160000). Plan:
-- docs/superpowers/plans/2026-09-27-levels-and-achievements.md, Task 1.
-- Additive for the deployed app: nothing it runs reads the five new tables,
-- and no existing function is recreated.
--
-- Written against the LIVE state (read-only, 2026-09-27), never an older
-- migration file alone:
-- * reveal_wine and the last step of reveal_next_category score every guess
--   on the glass BEFORE `update wines set is_revealed = true`; score_own_guess
--   never sets is_revealed (L12).
-- * pour_cellar_lot_into_glass and draw_down_flight_cellar_lots insert the
--   DRANK consumption BEFORE pointing wine_pour_intents.cellar_consumption_id
--   at it, which is why the consumption trigger is deferred to COMMIT (L21).
-- * The AFTER UPDATE OF is_revealed triggers on wines are
--   semi_blind_release_revealed_wine, trg_catalog_wine_unmark_blind (which
--   deletes the glass's flight_holds rows), wines_release_note_holds
--   (sharing-defaults 20260927140000: deletes the glass's wset_note_holds) and
--   wset_notes_resolve_on_reveal. Same-event triggers fire in name order, so
--   wines_xp_on_reveal runs after the unmark and the note-hold release and
--   before the note resolve.
-- * This file REQUIRES sharing-defaults M1 (20260927140000; review round,
--   amending C1): a held note (wset_note_held, S10/S11) moves no count others
--   see (S9), so note XP and the notes achievements leave it out until the
--   reveal that releases it pays it. wset_notes_hold_on_identity sorts before
--   wset_notes_xp_insert and wset_notes_xp_identity, so the hold row exists
--   when those run. The pre-state pins wset_note_held, the hold trigger and
--   the release trigger.
-- * No trigger exists on cellar_consumptions, training_attempts or
--   friendships beyond friendships_refuse_deleted_profile.
-- * wset_notes has no index on author_id and tasting_participants none on
--   user_id (L24).
-- * record_training_attempt is deliberately NOT pinned (its live body is
--   training-region-guess's); the training trigger reads training_attempts
--   columns only.
--
-- What this migration does:
-- 1. xp_sources, achievements (seeded), xp_events (the ledger),
--    profile_levels, profile_achievements; RLS and grants (§5.2).
-- 2. Two indexes: wset_notes (author_id), tasting_participants (user_id).
-- 3. The curve, the one award function, the metrics, the achievement check,
--    the per-source award functions and the replay (§4.1, §5.3).
-- 4. Ten triggers on the source tables (§7.1), each wrapping its work so an
--    XP error never blocks the write that caused it (L20).
-- 5. get_my_level_state, mark_xp_seen, get_my_achievement_progress (§6.1).
-- 6. The backfill: every non-deleted profile replayed, seen, with one welcome
--    (L1, L25, L26). The triggers already exist, so no fact falls between.
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
  select string_agg(t, ', ') into v_text
  from unnest(array['xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements',
                    'wset_notes_author_idx', 'tasting_participants_user_idx']) as t
  where to_regclass('public.' || t) is not null;
  if v_text is not null then
    raise exception 'already exists: %; re-read live before applying', v_text;
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and (p.proname like 'xp\_%' or p.proname in ('level_for_xp', 'get_my_level_state', 'mark_xp_seen',
                                                  'get_my_achievement_progress'));
  if v_text is not null then
    raise exception 'a function this migration creates already exists: %', v_text;
  end if;
  select string_agg(t.tgname, ', ') into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wines_xp_on_reveal', 'tastings_xp_on_close', 'cellar_lots_xp_insert',
                     'cellar_lots_xp_update', 'cellar_consumptions_xp', 'wset_notes_xp_insert',
                     'wset_notes_xp_identity', 'training_attempts_xp', 'friendships_xp',
                     'profiles_deleted_drop_levels');
  if v_text is not null then
    raise exception 'a trigger this migration creates already exists: %', v_text;
  end if;

  -- 2. The bodies the triggers rely on (md5 of prosrc with any CR stripped).
  --    §5.4's seventeen, plus semi_blind_release_revealed_wine (the third
  --    same-event trigger on wines), send_friend_request (the other writer
  --    of friendships) and sharing-defaults' hold: wset_note_held (what
  --    "held" means), wset_notes_hold_on_identity (writes a hold) and
  --    wines_release_note_holds (the reveal that releases it).
  select string_agg(format('%s %s', s.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ')
    into v_text
  from (values
    ('public.reveal_wine(uuid)',                        'ed7f78a59fb299b6307e586b8e8ab5c0'),
    ('public.reveal_next_category(uuid,smallint)',      '6a08183662534db0d212b2412d729ac2'),
    ('public.score_own_guess(uuid)',                    '395045b10c179a6fea43507ce8ce15e6'),
    ('public.pour_cellar_lot_into_glass(uuid)',         '558e60723fa745ead80dd0dc75871411'),
    ('public.draw_down_flight_cellar_lots(uuid)',       '0cbe5dd2dd771abb3cbd5855ea78f7c4'),
    ('public.consume_cellar_lot(jsonb)',                '990d02e64f1e093c4f6d5aac3269e5c7'),
    ('public.add_cellar_lot(jsonb)',                    '52c28f6b1dc08254407cc2aa59601e62'),
    ('public.import_cellar_lot(jsonb)',                 '4ebae4297787e1afef2cf79781480429'),
    ('public.save_wset_note(jsonb,jsonb)',              '9ac29b18bbda5b08bcd9a12e19beb932'),
    ('public.catalog_wine_unmark_blind()',              'de1f11ee58c418bf8fdc9310f0ba508f'),
    ('public.flight_holds_on_pour()',                   'f2eefca376cd3135468195963bf32ae5'),
    ('public.wset_notes_resolve_on_reveal()',           'f406623e9d46feb1f1aa0fb8c285529d'),
    ('public.catalog_wine_masked_pours(uuid[])',        'fea91b152e3565f16c56cc1d15810d29'),
    ('public.scrub_deleted_account(uuid)',              'b9aa8d71a00dda3aec526a2ec6950f1d'),
    ('public.can_view_cellar(uuid)',                    '3af2e51e338dc43cc48b58f061049ec2'),
    ('public.accept_friend_request(uuid)',              '8c473e36e07123e4a4ab2ee5b211b454'),
    ('public.accept_platform_invite(text)',             '9b3e4a89a84d2eb482c312eba87c4d37'),
    ('public.semi_blind_release_revealed_wine()',       'f2b99368997eaa08944e7d31943ed12a'),
    ('public.send_friend_request(uuid)',                '8efbf4536f08f335934d517ca5007238'),
    ('public.wset_note_held(uuid)',                     '9599a36cd224a3af0d5c2fb3dea70b2b'),
    ('public.wset_notes_hold_on_identity()',            '8b500cd6a6f62204c02c66c4760793fc'),
    ('public.wines_release_note_holds()',               '419a9f4dda4fac12a601207ea3f3b45a')
  ) as s (sig, md5)
  left join pg_proc p on p.oid = to_regprocedure(s.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) <> s.md5;
  if v_text is not null then
    raise exception 'function bodies differ from the live ones this file was written against: %', v_text;
  end if;

  -- 3. L21's name-order premise: the same-event triggers on wines are the
  --    three live ones plus sharing-defaults' note-hold release, and the hold
  --    on wset_notes is sharing-defaults' (it must run before this file's
  --    wset_notes_xp_* triggers, which it does by name).
  select string_agg(t.tgname, ',' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
    and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %';
  if v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wset_notes_resolve_on_reveal' then
    raise exception 'the AFTER UPDATE OF is_revealed triggers on wines are not the known set (sharing-defaults M1 applied): %', v_text;
  end if;
  select string_agg(regexp_replace(pg_get_triggerdef(t.oid), '\mpublic\.', '', 'g'), ' | ') into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal
    and t.tgname = 'wset_notes_hold_on_identity';
  if v_text is distinct from
       'CREATE TRIGGER wset_notes_hold_on_identity AFTER INSERT OR UPDATE OF catalog_wine_id ON wset_notes '
       || 'FOR EACH ROW EXECUTE FUNCTION wset_notes_hold_on_identity()' then
    raise exception 'wset_notes_hold_on_identity is not sharing-defaults'' trigger: %', v_text;
  end if;

  -- 4. The enum labels the functions compare against.
  if not (array['BLIND', 'SEMI_BLIND'] <@ enum_range(null::reveal_mode_type)::text[])
     or not ('CLOSED' = any (enum_range(null::tasting_status)::text[]))
     or not ('JOINED' = any (enum_range(null::participant_status)::text[]))
     or not ('DRANK' = any (enum_range(null::cellar_consumption_reason)::text[]))
     or not ('TRAINING' = any (enum_range(null::wset_note_context)::text[])) then
    raise exception 'an enum label the XP rules compare against is missing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tables (§5.1; multi-column checks carry explicit names).
-- ---------------------------------------------------------------------------
create table public.xp_sources (
  kind            text primary key,
  base_xp         integer not null default 0 check (base_xp >= 0),
  unit_xp         integer not null default 0 check (unit_xp >= 0),
  unit_cap        integer check (unit_cap > 0),
  daily_xp_cap    integer check (daily_xp_cap > 0),
  daily_count_cap integer check (daily_count_cap > 0)
);

-- §2's table. A change here affects future awards only (L36).
insert into public.xp_sources (kind, base_xp, unit_xp, unit_cap, daily_xp_cap, daily_count_cap) values
  ('guess',            10,  1, null, null, null),
  ('guess_match',      10, 10, null, null, null),
  ('tasting_finished', 40,  0, null, null,    3),
  ('tasting_hosted',   40,  0, null, null,    3),
  ('cellar_add',        0,  5,   20,  100, null),
  ('drink',             0, 15,    6,   90, null),
  ('note',             20,  0, null, null,    5),
  ('training',         20,  1, null, null,    5),
  ('achievement',       0,  0, null, null, null);

create table public.achievements (
  key        text primary key,
  category   text not null check (category in ('cellar', 'tastings', 'notes', 'training', 'friends')),
  gate       text not null check (gate in ('public', 'cellar')),
  target     integer not null check (target > 0),
  bonus_xp   integer not null check (bonus_xp between 25 and 250),
  sort_order integer not null,
  is_active  boolean not null default true,
  constraint achievements_gate_follows_category check ((category = 'cellar') = (gate = 'cellar'))
);

-- §4's table; names and descriptions live in src/lib/levels/copy.ts (L22).
insert into public.achievements (key, category, gate, target, bonus_xp, sort_order) values
  ('first_bottle',      'cellar',   'cellar',   1,  25,  1),
  ('cellar_25',         'cellar',   'cellar',  25,  50,  2),
  ('cellar_100',        'cellar',   'cellar', 100, 150,  3),
  ('first_drink',       'cellar',   'cellar',   1,  25,  4),
  ('drank_50',          'cellar',   'cellar',  50, 100,  5),
  ('first_tasting',     'tastings', 'public',   1,  25,  6),
  ('tastings_10',       'tastings', 'public',  10, 100,  7),
  ('first_host',        'tastings', 'public',   1,  50,  8),
  ('perfect_glass',     'tastings', 'public',   1, 100,  9),
  ('winner',            'tastings', 'public',   1, 100, 10),
  ('glasses_50',        'tastings', 'public',  50, 100, 11),
  ('first_note',        'notes',    'public',   1,  25, 12),
  ('notes_25',          'notes',    'public',  25,  75, 13),
  ('notes_100',         'notes',    'public', 100, 200, 14),
  ('note_countries_10', 'notes',    'public',  10, 100, 15),
  ('first_training',    'training', 'public',   1,  25, 16),
  ('training_10',       'training', 'public',  10,  75, 17),
  ('training_ace',      'training', 'public',   1, 100, 18),
  ('first_friend',      'friends',  'public',   1,  25, 19),
  ('friends_10',        'friends',  'public',  10,  75, 20);

create table public.xp_events (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  kind            text not null references public.xp_sources(kind),
  source_key      text not null,
  xp              integer not null check (xp > 0),
  xp_after        integer not null,
  units           integer,
  achievement_key text references public.achievements(key),
  day             date not null,
  created_at      timestamptz not null default now(),
  seen_at         timestamptz,
  constraint xp_events_user_id_source_key_key unique (user_id, source_key),
  constraint xp_events_xp_after_check check (xp_after >= xp),
  constraint xp_events_achievement_shape check ((kind = 'achievement') = (achievement_key is not null))
);
create index xp_events_user_kind_day_idx on public.xp_events (user_id, kind, day);
create index xp_events_unseen_idx on public.xp_events (user_id, id) where seen_at is null;

create table public.profile_levels (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  xp              integer not null default 0 check (xp >= 0),
  level           smallint not null default 1 check (level between 1 and 60),
  welcome_pending boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table public.profile_achievements (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key),
  gate            text not null check (gate in ('public', 'cellar')),
  unlocked_at     timestamptz not null default now(),
  backfill        boolean not null default false,
  primary key (user_id, achievement_key)
);

-- L24: the two reads the metrics lean on.
create index wset_notes_author_idx on public.wset_notes (author_id);
create index tasting_participants_user_idx on public.tasting_participants (user_id);

-- §5.2. Supabase's default privileges hand every new table to anon,
-- authenticated and service_role; authenticated keeps SELECT alone, anon and
-- PUBLIC nothing. No client role writes any of the five.
alter table public.xp_sources enable row level security;
alter table public.achievements enable row level security;
alter table public.xp_events enable row level security;
alter table public.profile_levels enable row level security;
alter table public.profile_achievements enable row level security;

create policy "xp sources read" on public.xp_sources for select to authenticated using (true);
create policy "achievements read" on public.achievements for select to authenticated using (true);
create policy "xp events read own" on public.xp_events for select to authenticated
  using (user_id = auth.uid());
create policy "profile levels read" on public.profile_levels for select to authenticated using (true);
-- A cellar achievement follows the cellar's own gate (L6, L23).
create policy "profile achievements read" on public.profile_achievements for select to authenticated
  using (user_id = auth.uid() or gate <> 'cellar' or can_view_cellar(user_id));

revoke all on table public.xp_sources, public.achievements, public.xp_events,
  public.profile_levels, public.profile_achievements from public, anon, authenticated;
revoke all on sequence public.xp_events_id_seq from public, anon, authenticated;
grant select on table public.xp_sources, public.achievements, public.xp_events,
  public.profile_levels, public.profile_achievements to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The curve (§3.1): the largest L ≤ 60 with 25·L·(L−1) ≤ xp. The square
--    root is a first guess; the integer thresholds correct it by ±1.
--    src/lib/levels/curve.ts is the same rule; both are pinned to
--    src/lib/levels/__fixtures__/curve.json.
-- ---------------------------------------------------------------------------
create function public.level_for_xp(p_xp integer)
returns smallint language plpgsql immutable set search_path = public as $$
declare
  x bigint := greatest(coalesce(p_xp, 0), 0);
  v bigint;
begin
  v := floor((1 + sqrt(1 + 4 * x / 25.0)) / 2);
  while v > 1 and 25 * v * (v - 1) > x loop
    v := v - 1;
  end loop;
  while v < 60 and 25 * (v + 1) * v <= x loop
    v := v + 1;
  end loop;
  return least(greatest(v, 1), 60)::smallint;
end $$;

-- ---------------------------------------------------------------------------
-- 3. The one award (L19): locks the person's profile_levels row, applies the
--    kind's daily caps for the UTC day of p_at (L16), writes the ledger row
--    with its running total, and moves the level. Returns the XP paid; 0 when
--    p_xp <= 0, the profile is missing or deleted, the key was paid, or a cap
--    took it all (no zero-XP rows). The deleted-profile check holds the
--    profile row FOR SHARE, which conflicts with the account scrub's UPDATE
--    of deleted_at (L27): either the scrub waits and then drops this award's
--    rows, or this award waits, re-reads the row as deleted and pays nothing.
-- ---------------------------------------------------------------------------
create function public.xp_award(p_user uuid, p_kind text, p_source_key text, p_xp integer,
                                p_units integer, p_achievement text, p_at timestamptz, p_seen boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_at timestamptz := coalesce(p_at, now());
  v_day date := (coalesce(p_at, now()) at time zone 'utc')::date;
  v_src xp_sources%rowtype;
  v_total integer;
  v_xp integer := p_xp;
  v_count integer;
  v_sum integer;
  v_id bigint;
begin
  if p_user is null or p_source_key is null or coalesce(p_xp, 0) <= 0 then
    return 0;
  end if;
  perform 1 from profiles where id = p_user and deleted_at is null for share;
  if not found then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = p_kind;
  if not found then
    raise exception 'unknown xp kind %', p_kind;
  end if;
  insert into profile_levels (user_id) values (p_user) on conflict (user_id) do nothing;
  select xp into v_total from profile_levels where user_id = p_user for update;
  -- Under the lock: a concurrent transaction may have paid this key already.
  if exists (select 1 from xp_events where user_id = p_user and source_key = p_source_key) then
    return 0;
  end if;
  if v_src.daily_count_cap is not null then
    select count(*) into v_count from xp_events
     where user_id = p_user and kind = p_kind and day = v_day;
    if v_count >= v_src.daily_count_cap then
      return 0;
    end if;
  end if;
  if v_src.daily_xp_cap is not null then
    select coalesce(sum(xp), 0) into v_sum from xp_events
     where user_id = p_user and kind = p_kind and day = v_day;
    v_xp := least(v_xp, v_src.daily_xp_cap - v_sum);
    if v_xp <= 0 then
      return 0;
    end if;
  end if;
  insert into xp_events (user_id, kind, source_key, xp, xp_after, units, achievement_key, day, created_at, seen_at)
  values (p_user, p_kind, p_source_key, v_xp, v_total + v_xp, p_units, p_achievement, v_day, v_at,
          case when p_seen then now() end)
  on conflict (user_id, source_key) do nothing
  returning id into v_id;
  if v_id is null then
    return 0;
  end if;
  update profile_levels
     set xp = v_total + v_xp,
         level = level_for_xp(v_total + v_xp),
         updated_at = now()
   where user_id = p_user;
  return v_xp;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The metrics (§4.1): the one definition of every unlock rule, used by the
--    live check, the replay and the own-profile progress RPC.
-- ---------------------------------------------------------------------------

-- catalog_wine_masked_pours' predicate (md5 fea91b15…, pinned above), per
-- consumption: a bottle poured into a glass not revealed yet (L4).
create function public.xp_consumption_masked(p_consumption uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from flight_holds h where h.consumption_id = p_consumption)
      or exists (select 1
                   from wine_pour_intents i
                   join wines w on w.id = i.wine_id
                  where i.cellar_consumption_id = p_consumption
                    and not w.is_revealed);
$$;

-- Bottles on hand, a masked pour still counted as in the cellar (L4).
create function public.xp_cellar_on_hand(p_user uuid)
returns integer language sql stable security definer set search_path = public as $$
  select ((select coalesce(sum(l.quantity), 0) from cellar_lots l where l.owner_id = p_user)
        + (select coalesce(sum(c.quantity), 0)
             from cellar_consumptions c
            where c.owner_id = p_user and xp_consumption_masked(c.id)))::integer;
$$;

-- A JOINED seat with a scored, non-blank guess on a revealed glass (L13).
create function public.xp_tasting_player(p_tasting uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
     where p.tasting_id = p_tasting and p.user_id = p_user and p.status = 'JOINED'
       and w.tasting_id = p_tasting and w.is_revealed and g.scored_at is not null
       and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                        g.secondary_grape_id, g.producer_id, g.type_designation_id,
                        g.vintage_kind, g.guessed_wine_id) > 0);
$$;

-- L35: most points over revealed glasses among >= 3 players; top > 0; ties all win.
create function public.xp_tasting_won_by(p_tasting uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with totals as (
    select p.user_id, sum(coalesce(g.total_points, 0)) as points
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
     where p.tasting_id = p_tasting and p.status = 'JOINED'
       and w.tasting_id = p_tasting and w.is_revealed and g.scored_at is not null
       and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                        g.secondary_grape_id, g.producer_id, g.type_designation_id,
                        g.vintage_kind, g.guessed_wine_id) > 0
     group by p.user_id
  )
  select coalesce(count(*) >= 3
                  and max(points) > 0
                  and max(points) = max(points) filter (where user_id = p_user), false)
    from totals;
$$;

create function public.xp_achievement_metric(p_user uuid, p_key text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v bigint := 0;
begin
  if p_key = 'first_bottle' then
    select count(*) into v from cellar_lots where owner_id = p_user;
  elsif p_key in ('cellar_25', 'cellar_100') then
    v := xp_cellar_on_hand(p_user);
  elsif p_key in ('first_drink', 'drank_50') then
    select coalesce(sum(c.quantity), 0) into v
      from cellar_consumptions c
     where c.owner_id = p_user and c.reason = 'DRANK' and not xp_consumption_masked(c.id);
  elsif p_key in ('first_tasting', 'tastings_10') then
    select count(*) into v
      from tastings t
     where (t.host_id = p_user
            or t.id in (select s.tasting_id from tasting_participants s where s.user_id = p_user))
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and ((t.host_id <> p_user and xp_tasting_player(t.id, p_user))
            or (t.host_id = p_user
                and exists (select 1 from tasting_participants o
                             where o.tasting_id = t.id and o.status = 'JOINED' and o.user_id <> p_user)));
  elsif p_key = 'first_host' then
    select count(*) into v
      from tastings t
     where t.host_id = p_user
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and exists (select 1 from tasting_participants o
                    where o.tasting_id = t.id and o.status = 'JOINED' and o.user_id <> p_user);
  elsif p_key = 'perfect_glass' then
    -- reveal_wine's own per-category maxima; after a full reveal a null
    -- points column means "not in play".
    select count(*) into v
      from tasting_participants p
      join guesses g on g.participant_id = p.id
      join wines w on w.id = g.wine_id
      join tastings t on t.id = w.tasting_id
     where p.user_id = p_user and t.reveal_mode = 'BLIND' and w.is_revealed
       and g.scored_at is not null
       and (2 * (g.country_points is not null)::int + 3 * (g.region_points is not null)::int
            + 5 * (g.appellation_points is not null)::int + 8 * (g.primary_grape_points is not null)::int
            + 2 * (g.secondary_grape_points is not null)::int + 6 * (g.producer_points is not null)::int
            + 2 * (g.type_designation_points is not null)::int + 2 * (g.vintage_points is not null)::int) > 0
       and g.total_points =
             2 * (g.country_points is not null)::int + 3 * (g.region_points is not null)::int
             + 5 * (g.appellation_points is not null)::int + 8 * (g.primary_grape_points is not null)::int
             + 2 * (g.secondary_grape_points is not null)::int + 6 * (g.producer_points is not null)::int
             + 2 * (g.type_designation_points is not null)::int + 2 * (g.vintage_points is not null)::int;
  elsif p_key = 'winner' then
    select count(*) into v
      from tastings t
     where (t.host_id = p_user
            or t.id in (select s.tasting_id from tasting_participants s where s.user_id = p_user))
       and t.status = 'CLOSED' and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
       and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed)
       and xp_tasting_won_by(t.id, p_user);
  elsif p_key = 'glasses_50' then
    -- The ledger's guess rows (L24): exact, because guess XP is uncapped.
    select count(*) into v from xp_events where user_id = p_user and kind in ('guess', 'guess_match');
  elsif p_key in ('first_note', 'notes_25', 'notes_100') then
    -- Every note, identity-less ones included (a count names no wine), but a
    -- held one: it moves no count others see until its reveal (sharing S9).
    select count(*) into v from wset_notes n where n.author_id = p_user and not wset_note_held(n.id);
  elsif p_key = 'note_countries_10' then
    -- A held note is tonight's wine in its adder's hands: its country would
    -- name it (Rule 1, sharing S9-S11).
    select count(distinct cw.country_id) into v
      from wset_notes n
      join catalog_wines cw on cw.id = n.catalog_wine_id
     where n.author_id = p_user and not cw.blind_pending and not wset_note_held(n.id);
  elsif p_key in ('first_training', 'training_10') then
    select count(*) into v from training_attempts where author_id = p_user and scored_at is not null;
  elsif p_key = 'training_ace' then
    select count(*) into v
      from training_attempts
     where author_id = p_user and scored_at is not null
       and possible_points > 0 and total_points = possible_points;
  elsif p_key in ('first_friend', 'friends_10') then
    select count(*) into v from friendships where user_id = p_user;
  end if;
  return least(coalesce(v, 0), 2147483647)::integer;
end $$;

-- Walks the active achievements of one category the person has NOT unlocked
-- (a veteran pays nothing for earned ones), in sort_order; unlocks each whose
-- metric reached its target and pays its bonus. Takes the person's
-- profile_levels row before any profile_achievements row: one lock order.
-- The deleted-profile check holds the profile row FOR SHARE, as xp_award's.
create function public.xp_check_achievements(p_user uuid, p_category text, p_at timestamptz,
                                             p_seen boolean, p_backfill boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_locked boolean := false;
  v_unlocked integer := 0;
begin
  if p_user is null then
    return 0;
  end if;
  perform 1 from profiles where id = p_user and deleted_at is null for share;
  if not found then
    return 0;
  end if;
  for r in
    select a.key, a.gate, a.target, a.bonus_xp
      from achievements a
     where a.category = p_category and a.is_active
       and not exists (select 1 from profile_achievements pa
                        where pa.user_id = p_user and pa.achievement_key = a.key)
     order by a.sort_order, a.key
  loop
    if xp_achievement_metric(p_user, r.key) >= r.target then
      if not v_locked then
        insert into profile_levels (user_id) values (p_user) on conflict (user_id) do nothing;
        perform 1 from profile_levels where user_id = p_user for update;
        v_locked := true;
      end if;
      insert into profile_achievements (user_id, achievement_key, gate, unlocked_at, backfill)
      values (p_user, r.key, r.gate, coalesce(p_at, now()), coalesce(p_backfill, false))
      on conflict (user_id, achievement_key) do nothing;
      if found then
        perform xp_award(p_user, 'achievement', 'achievement:' || r.key, r.bonus_xp, null, r.key,
                         p_at, p_seen);
        v_unlocked := v_unlocked + 1;
      end if;
    end if;
  end loop;
  return v_unlocked;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The per-source awards (§5.3), shared by the triggers (p_check true) and
--    the replay (p_check false): one definition of every rule.
-- ---------------------------------------------------------------------------

-- L11/L12: a scored, non-blank guess on a globally revealed glass of a
-- BLIND/SEMI_BLIND tasting. guess = 10 + points; guess_match = 10 + 10·match (L10).
create function public.xp_award_guess(p_guess uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_user uuid;
  v_mode reveal_mode_type;
  v_points integer;
  v_kind text;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select p.user_id, t.reveal_mode, coalesce(g.total_points, 0)
    into v_user, v_mode, v_points
    from guesses g
    join wines w on w.id = g.wine_id
    join tastings t on t.id = w.tasting_id
    join tasting_participants p on p.id = g.participant_id and p.tasting_id = w.tasting_id
   where g.id = p_guess
     and w.is_revealed
     and g.scored_at is not null
     and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
     and num_nonnulls(g.country_id, g.region_id, g.appellation_id, g.primary_grape_id,
                      g.secondary_grape_id, g.producer_id, g.type_designation_id,
                      g.vintage_kind, g.guessed_wine_id) > 0;
  if v_user is null then
    return 0;
  end if;
  v_kind := case when v_mode = 'SEMI_BLIND' then 'guess_match' else 'guess' end;
  select * into v_src from xp_sources where kind = v_kind;
  v_units := greatest(v_points, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_user, v_kind, 'guess:' || p_guess::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_user, 'tastings', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L13: a closed BLIND/SEMI_BLIND tasting with a revealed glass pays a JOINED
-- guest who played (finish:) and a host with another JOINED seat (host:).
-- Keys make a reopen and re-close pay nothing twice.
create function public.xp_award_tasting_close(p_tasting uuid, p_user uuid, p_at timestamptz,
                                              p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_host uuid;
  v_kind text;
  v_key text;
  v_src xp_sources%rowtype;
  v_paid integer;
begin
  select t.host_id into v_host
    from tastings t
   where t.id = p_tasting and t.status = 'CLOSED'
     and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
     and exists (select 1 from wines w where w.tasting_id = t.id and w.is_revealed);
  if v_host is null or p_user is null then
    return 0;
  end if;
  if v_host = p_user then
    if exists (select 1 from tasting_participants o
                where o.tasting_id = p_tasting and o.status = 'JOINED' and o.user_id <> p_user) then
      v_kind := 'tasting_hosted';
      v_key := 'host:' || p_tasting::text;
    end if;
  elsif xp_tasting_player(p_tasting, p_user) then
    v_kind := 'tasting_finished';
    v_key := 'finish:' || p_tasting::text;
  end if;
  if v_kind is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = v_kind;
  v_paid := xp_award(p_user, v_kind, v_key, v_src.base_xp, null, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(p_user, 'tastings', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L14: growth of purchased_quantity, at most unit_cap (20) bottles over the
-- lot's life. The key names the level reached; a lot lowered and raised again
-- is paid only past the highest level already paid.
create function public.xp_award_cellar_lot(p_lot uuid, p_old integer, p_new integer, p_at timestamptz,
                                           p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_owner uuid;
  v_src xp_sources%rowtype;
  v_cap integer;
  v_from integer;
  v_to integer;
  v_paid_to integer;
  v_units integer;
  v_paid integer := 0;
begin
  select l.owner_id into v_owner from cellar_lots l where l.id = p_lot;
  if v_owner is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'cellar_add';
  v_cap := coalesce(v_src.unit_cap, 2147483647);
  v_from := least(greatest(coalesce(p_old, 0), 0), v_cap);
  v_to := least(greatest(coalesce(p_new, 0), 0), v_cap);
  select coalesce(max(split_part(e.source_key, ':', 3)::integer), 0) into v_paid_to
    from xp_events e
   where e.user_id = v_owner and e.kind = 'cellar_add'
     and e.source_key like 'cellar_add:' || p_lot::text || ':%';
  v_units := v_to - greatest(v_from, v_paid_to);
  if v_units > 0 then
    v_paid := xp_award(v_owner, 'cellar_add', 'cellar_add:' || p_lot::text || ':' || v_to::text,
                       v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  end if;
  if p_check then
    perform xp_check_achievements(v_owner, 'cellar', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L17/L21: a DRANK consumption, at most unit_cap (6) bottles, never while its
-- pour is masked. The reveal passes p_require_lot false (the lot may be gone).
create function public.xp_award_drink(p_consumption uuid, p_at timestamptz, p_seen boolean,
                                      p_check boolean, p_require_lot boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_c cellar_consumptions%rowtype;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select * into v_c from cellar_consumptions where id = p_consumption;
  if not found or v_c.reason <> 'DRANK' or (coalesce(p_require_lot, true) and v_c.lot_id is null)
     or xp_consumption_masked(v_c.id) then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'drink';
  v_units := greatest(v_c.quantity, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_c.owner_id, 'drink', 'drink:' || v_c.id::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_c.owner_id, 'cellar', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- L18: a TRAINING note is paid by its round, but still counts as a note.
-- A held note (sharing S9-S11) is not paid yet: the reveal that releases it
-- pays it (xp_on_glass_revealed), so its +20 names no unrevealed glass.
create function public.xp_award_note(p_note uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_author uuid;
  v_context wset_note_context;
  v_src xp_sources%rowtype;
  v_paid integer := 0;
begin
  select n.author_id, n.context_kind into v_author, v_context from wset_notes n where n.id = p_note;
  if v_author is null then
    return 0;
  end if;
  if v_context <> 'TRAINING' and not wset_note_held(p_note) then
    select * into v_src from xp_sources where kind = 'note';
    v_paid := xp_award(v_author, 'note', 'note:' || p_note::text, v_src.base_xp, null, null, p_at, p_seen);
  end if;
  if p_check then
    perform xp_check_achievements(v_author, 'notes', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

create function public.xp_award_training(p_attempt uuid, p_at timestamptz, p_seen boolean, p_check boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  v_author uuid;
  v_points integer;
  v_src xp_sources%rowtype;
  v_units integer;
  v_paid integer;
begin
  select a.author_id, coalesce(a.total_points, 0) into v_author, v_points
    from training_attempts a
   where a.id = p_attempt and a.scored_at is not null;
  if v_author is null then
    return 0;
  end if;
  select * into v_src from xp_sources where kind = 'training';
  v_units := greatest(v_points, 0);
  if v_src.unit_cap is not null then
    v_units := least(v_units, v_src.unit_cap);
  end if;
  v_paid := xp_award(v_author, 'training', 'training:' || p_attempt::text,
                     v_src.base_xp + v_src.unit_xp * v_units, v_units, null, p_at, p_seen);
  if p_check then
    perform xp_check_achievements(v_author, 'training', p_at, p_seen, false);
  end if;
  return v_paid;
end $$;

-- §5.5: a person's facts, oldest first, each with its own time (never later
-- than now), through the same award functions; then every category's check
-- once. Keys make it idempotent: run again it adds only what is missing.
-- p_repair is the tool for what a swallowed error missed (L20); false only
-- for the launch backfill and the parity test. cellar_lots,
-- cellar_consumptions and wset_notes rows are client-writable (R4), so a
-- repair refuses what the live triggers refuse where it can: a lot-less DRANK
-- row pays only when a pour links it (the reveal's own rule, L17/L21), and
-- every fact's time is clamped to on or after the account's created_at, so a
-- row dated before the account existed cannot open an older cap bucket. It
-- still re-derives from the rows as they are now (a created_at set inside the
-- account's life, a reason edited to DRANK), so run it only for a person whose
-- cellar and notes rows have been checked. Returns the XP it added.
create function public.xp_replay_user(p_user uuid, p_seen boolean, p_backfill boolean, p_repair boolean)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_repair boolean := coalesce(p_repair, false);
  v_joined timestamptz;
  v_at timestamptz;
  v_before integer;
  v_after integer;
  v_category text;
begin
  if p_user is null then
    return 0;
  end if;
  select p.created_at into v_joined from profiles p where p.id = p_user and p.deleted_at is null;
  if not found then
    return 0;
  end if;
  select coalesce((select xp from profile_levels where user_id = p_user), 0) into v_before;
  for r in
    select f.kind, f.fact, least(f.at, now()) as at, f.qty
      from (
        select 'guess'::text as kind, g.id as fact, coalesce(w.revealed_at, g.scored_at) as at,
               null::integer as qty
          from guesses g
          join tasting_participants p on p.id = g.participant_id
          join wines w on w.id = g.wine_id
          join tastings t on t.id = w.tasting_id
         where p.user_id = p_user and w.is_revealed and g.scored_at is not null
           and t.reveal_mode in ('BLIND', 'SEMI_BLIND')
        union all
        select 'close', t.id,
               coalesce(t.finished_at,
                        (select max(w.revealed_at) from wines w where w.tasting_id = t.id),
                        t.created_at),
               null
          from tastings t
         where t.status = 'CLOSED'
           and (t.host_id = p_user
                or exists (select 1 from tasting_participants s
                            where s.tasting_id = t.id and s.user_id = p_user))
        union all
        select 'lot', l.id, l.created_at, l.purchased_quantity
          from cellar_lots l
         where l.owner_id = p_user
        union all
        select 'drink', c.id, c.created_at, null
          from cellar_consumptions c
         where c.owner_id = p_user and c.reason = 'DRANK'
           and (not v_repair
                or c.lot_id is not null
                or exists (select 1 from wine_pour_intents i where i.cellar_consumption_id = c.id))
        union all
        select 'note', n.id, n.created_at, null
          from wset_notes n
         where n.author_id = p_user
        union all
        select 'training', a.id, a.scored_at, null
          from training_attempts a
         where a.author_id = p_user and a.scored_at is not null
      ) f
     order by 3, f.kind, f.fact
  loop
    v_at := case when v_repair then greatest(r.at, v_joined) else r.at end;
    if r.kind = 'guess' then
      perform xp_award_guess(r.fact, v_at, p_seen, false);
    elsif r.kind = 'close' then
      perform xp_award_tasting_close(r.fact, p_user, v_at, p_seen, false);
    elsif r.kind = 'lot' then
      perform xp_award_cellar_lot(r.fact, 0, r.qty, v_at, p_seen, false);
    elsif r.kind = 'drink' then
      perform xp_award_drink(r.fact, v_at, p_seen, false, false);
    elsif r.kind = 'note' then
      perform xp_award_note(r.fact, v_at, p_seen, false);
    elsif r.kind = 'training' then
      perform xp_award_training(r.fact, v_at, p_seen, false);
    end if;
  end loop;
  foreach v_category in array array['cellar', 'tastings', 'notes', 'training', 'friends'] loop
    perform xp_check_achievements(p_user, v_category, now(), p_seen, p_backfill);
  end loop;
  select coalesce((select xp from profile_levels where user_id = p_user), 0) into v_after;
  return v_after - v_before;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Trigger functions (§7.1). Each wraps its work (L20): an XP error is a
--    WARNING, never a failed reveal, pour, note or cellar write; a loop wraps
--    each person, so one bad award never costs the others theirs.
--    xp_replay_user(u, false, false, true) repairs whatever a swallowed error
--    missed.
-- ---------------------------------------------------------------------------

-- Every guess on the glass (step 1), the pour this reveal unmasks (step 2,
-- L21), and the notes it releases (step 3, sharing S10/S11): one person at a
-- time in user_id order (L34), each step in its own block. Runs after
-- trg_catalog_wine_unmark_blind has deleted the glass's flight_holds rows and
-- wines_release_note_holds its wset_note_holds rows (name order). Step 3 is
-- for the glass's adder (the host of an added_by_host glass, else the
-- contributor) and each pour owner: their unpaid notes on the glass's catalog
-- wine or its pour's wine, or linked to its pour, are paid now unless another
-- unrevealed glass still holds them (xp_award_note), then the notes check.
create function public.xp_on_glass_revealed()
returns trigger language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
  v_note record;
  v_wine uuid;
  v_any boolean;
begin
  begin
    select wa.catalog_wine_id into v_wine from wine_answers wa where wa.wine_id = new.id;
    for r in
      select x.user_id, x.step, x.guess_id, x.consumption_id
        from (
          select p.user_id, 1 as step, g.id as guess_id, null::uuid as consumption_id
            from guesses g
            join tasting_participants p on p.id = g.participant_id
           where g.wine_id = new.id
          union all
          select c.owner_id, 2, null::uuid, c.id
            from wine_pour_intents i
            join cellar_consumptions c on c.id = i.cellar_consumption_id
           where i.wine_id = new.id
          union all
          select a.user_id, 3, null::uuid, null::uuid
            from (select case when new.added_by_host then t.host_id else tp.user_id end as user_id
                    from tastings t
                    left join tasting_participants tp on tp.id = new.contributor_participant_id
                   where t.id = new.tasting_id
                  union
                  select c.owner_id
                    from wine_pour_intents i
                    join cellar_consumptions c on c.id = i.cellar_consumption_id
                   where i.wine_id = new.id) a
           where a.user_id is not null
        ) x
       order by x.user_id, x.step, x.guess_id, x.consumption_id
    loop
      begin
        if r.step = 1 then
          perform xp_award_guess(r.guess_id, now(), false, true);
        elsif r.step = 2 then
          perform xp_award_drink(r.consumption_id, now(), false, true, false);
        else
          v_any := false;
          for v_note in
            select n.id,
                   exists (select 1 from xp_events e
                            where e.user_id = r.user_id and e.source_key = 'note:' || n.id::text) as paid
              from wset_notes n
             where n.author_id = r.user_id
               and (n.catalog_wine_id = v_wine
                    or n.catalog_wine_id in (select c.catalog_wine_id
                                               from wine_pour_intents i
                                               join cellar_consumptions c on c.id = i.cellar_consumption_id
                                              where i.wine_id = new.id and c.owner_id = r.user_id)
                    or n.id in (select c.wset_note_id
                                  from wine_pour_intents i
                                  join cellar_consumptions c on c.id = i.cellar_consumption_id
                                 where i.wine_id = new.id and c.owner_id = r.user_id))
             order by n.created_at, n.id
          loop
            v_any := true;
            if not v_note.paid then
              perform xp_award_note(v_note.id, now(), false, false);
            end if;
          end loop;
          if v_any then
            perform xp_check_achievements(r.user_id, 'notes', now(), false, false);
          end if;
        end if;
      exception when others then
        raise warning 'xp_on_glass_revealed: glass %, user %: % %', new.id, r.user_id, sqlstate, sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning 'xp_on_glass_revealed: glass %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Every seat of the tasting plus the host, in user_id order (L34).
create function public.xp_on_tasting_closed()
returns trigger language plpgsql volatile security definer set search_path = public as $$
declare
  r record;
begin
  begin
    for r in
      select s.user_id from tasting_participants s where s.tasting_id = new.id
      union
      select new.host_id
      order by 1
    loop
      begin
        perform xp_award_tasting_close(new.id, r.user_id, now(), false, true);
      exception when others then
        raise warning 'xp_on_tasting_closed: tasting %, user %: % %', new.id, r.user_id, sqlstate, sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning 'xp_on_tasting_closed: tasting %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Insert: the lot's bottles. Update: purchased_quantity growth; a quantity
-- growth alone (an Edit-lot correction) pays nothing but re-checks on-hand.
create function public.xp_on_cellar_lot()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform xp_award_cellar_lot(new.id, 0, new.purchased_quantity, now(), false, true);
    elsif new.purchased_quantity > old.purchased_quantity then
      perform xp_award_cellar_lot(new.id, old.purchased_quantity, new.purchased_quantity, now(), false, true);
    else
      perform xp_check_achievements(new.owner_id, 'cellar', now(), false, false);
    end if;
  exception when others then
    raise warning 'xp_on_cellar_lot: lot %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Deferred to COMMIT (L21): by then a pour has its intent and hold, so a
-- masked bottle is skipped here and paid by the reveal.
create function public.xp_on_cellar_consumption()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_award_drink(new.id, now(), false, true, true);
  exception when others then
    raise warning 'xp_on_cellar_consumption: consumption %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- Insert: the note. An identity change: the notes check only
-- (note_countries_10 counts a hidden-glass note once its glass is revealed).
create function public.xp_on_wset_note()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform xp_award_note(new.id, now(), false, true);
    else
      perform xp_check_achievements(new.author_id, 'notes', now(), false, false);
    end if;
  exception when others then
    raise warning 'xp_on_wset_note: note %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

create function public.xp_on_training_scored()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_award_training(new.id, now(), false, true);
  exception when others then
    raise warning 'xp_on_training_scored: attempt %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

create function public.xp_on_friendship()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    perform xp_check_achievements(new.user_id, 'friends', now(), false, false);
  exception when others then
    raise warning 'xp_on_friendship: friendship %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- L27: the profiles_deleted_drop_favourites pattern; scrub_deleted_account is
-- not recreated.
create function public.xp_drop_deleted_profile()
returns trigger language plpgsql volatile security definer set search_path = public as $$
begin
  begin
    delete from xp_events where user_id = new.id;
    delete from profile_achievements where user_id = new.id;
    delete from profile_levels where user_id = new.id;
  exception when others then
    raise warning 'xp_drop_deleted_profile: profile %: % %', new.id, sqlstate, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Client RPCs (§6.1).
-- ---------------------------------------------------------------------------

-- AppHeader's one read per render: the level and the oldest 50 unseen rows.
-- SECURITY INVOKER: RLS scopes the ledger to the caller. Times are UTC ISO
-- strings with milliseconds, so every browser parses them alike.
create function public.get_my_level_state()
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'xp', coalesce(l.xp, 0),
    'level', coalesce(l.level, 1),
    'welcome', coalesce(l.welcome_pending, false),
    'checked_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'unseen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'kind', e.kind,
               'xp', e.xp,
               'xp_after', e.xp_after,
               'units', e.units,
               'achievement', e.achievement_key,
               'created_at', to_char(e.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
             order by e.id)
        from (select x.id, x.kind, x.xp, x.xp_after, x.units, x.achievement_key, x.created_at
                from xp_events x
               where x.user_id = me.uid and x.seen_at is null
               order by x.id
               limit 50) e), '[]'::jsonb))
    from (select auth.uid() as uid) me
    left join profile_levels l on l.user_id = me.uid;
$$;

-- Explicit ids, not "up to id N": two transactions for one person can commit
-- out of id order. Idempotent.
create function public.mark_xp_seen(p_ids bigint[], p_welcome boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_ids), 0) > 100 then
    raise exception 'at most 100 ids at a time' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(cardinality(p_ids), 0) > 0 then
    update xp_events set seen_at = now()
     where user_id = v_uid and id = any (p_ids) and seen_at is null;
  end if;
  if coalesce(p_welcome, false) then
    update profile_levels set welcome_pending = false
     where user_id = v_uid and welcome_pending;
  end if;
end $$;

-- Your own profile's card: every active achievement with its progress.
-- SECURITY DEFINER because the cellar metrics read flight_holds and
-- wine_pour_intents; it only ever computes for auth.uid().
create function public.get_my_achievement_progress()
returns table (key text, category text, bonus_xp integer, target integer, progress integer,
               unlocked_at timestamptz, backfill boolean)
language sql stable security definer set search_path = public as $$
  select a.key, a.category, a.bonus_xp, a.target,
         case when pa.user_id is not null then a.target
              else least(xp_achievement_metric(auth.uid(), a.key), a.target) end,
         pa.unlocked_at,
         coalesce(pa.backfill, false)
    from achievements a
    left join profile_achievements pa on pa.user_id = auth.uid() and pa.achievement_key = a.key
   where a.is_active and auth.uid() is not null
   order by a.sort_order, a.key;
$$;

-- Supabase's default privileges grant EXECUTE on a new function to PUBLIC,
-- anon, authenticated and service_role. The three RPCs are authenticated-only
-- (auth.uid() is null for anon and service_role: the OD-1 precedent); every
-- other function here is owner-only.
revoke all on function public.level_for_xp(integer) from public, anon, authenticated, service_role;
revoke all on function public.xp_award(uuid, text, text, integer, integer, text, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_consumption_masked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_cellar_on_hand(uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_tasting_player(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_tasting_won_by(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.xp_achievement_metric(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.xp_check_achievements(uuid, text, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_guess(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_tasting_close(uuid, uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_cellar_lot(uuid, integer, integer, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_drink(uuid, timestamptz, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_note(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_award_training(uuid, timestamptz, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_replay_user(uuid, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.xp_on_glass_revealed() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_tasting_closed() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_cellar_lot() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_cellar_consumption() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_wset_note() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_training_scored() from public, anon, authenticated, service_role;
revoke all on function public.xp_on_friendship() from public, anon, authenticated, service_role;
revoke all on function public.xp_drop_deleted_profile() from public, anon, authenticated, service_role;
revoke all on function public.get_my_level_state() from public, anon, service_role;
revoke all on function public.mark_xp_seen(bigint[], boolean) from public, anon, service_role;
revoke all on function public.get_my_achievement_progress() from public, anon, service_role;
grant execute on function public.get_my_level_state() to authenticated;
grant execute on function public.mark_xp_seen(bigint[], boolean) to authenticated;
grant execute on function public.get_my_achievement_progress() to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Triggers (§7.1), created before the backfill so no fact falls between.
-- ---------------------------------------------------------------------------
create trigger wines_xp_on_reveal after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.xp_on_glass_revealed();
create trigger tastings_xp_on_close after update of status on public.tastings
  for each row when (new.status = 'CLOSED' and old.status is distinct from 'CLOSED')
  execute function public.xp_on_tasting_closed();
create trigger cellar_lots_xp_insert after insert on public.cellar_lots
  for each row execute function public.xp_on_cellar_lot();
create trigger cellar_lots_xp_update after update of purchased_quantity, quantity on public.cellar_lots
  for each row when (new.purchased_quantity > old.purchased_quantity or new.quantity > old.quantity)
  execute function public.xp_on_cellar_lot();
create constraint trigger cellar_consumptions_xp after insert on public.cellar_consumptions
  deferrable initially deferred for each row execute function public.xp_on_cellar_consumption();
create trigger wset_notes_xp_insert after insert on public.wset_notes
  for each row execute function public.xp_on_wset_note();
create trigger wset_notes_xp_identity after update of catalog_wine_id, unidentified_wine_id on public.wset_notes
  for each row when (old.catalog_wine_id is distinct from new.catalog_wine_id
                     or old.unidentified_wine_id is distinct from new.unidentified_wine_id)
  execute function public.xp_on_wset_note();
create trigger training_attempts_xp after insert or update of scored_at on public.training_attempts
  for each row when (new.scored_at is not null)
  execute function public.xp_on_training_scored();
create trigger friendships_xp after insert on public.friendships
  for each row execute function public.xp_on_friendship();
create trigger profiles_deleted_drop_levels after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function public.xp_drop_deleted_profile();

-- ---------------------------------------------------------------------------
-- 9. The backfill (§5.5; L1, L25, L26): every non-deleted profile gets its
--    welcome and its history, all seen; achievements stamped as backfilled.
-- ---------------------------------------------------------------------------
insert into public.profile_levels (user_id, welcome_pending)
select p.id, true from public.profiles p where p.deleted_at is null
on conflict (user_id) do nothing;

do $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.deleted_at is null order by p.id loop
    perform public.xp_replay_user(r.id, true, true, false);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction: every check a raise exception.
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn record;
  v_text text;
  v_expected text;
begin
  -- 1. The five tables' columns, in order.
  select string_agg(format('%s.%s %s%s%s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then ' not null' else '' end,
                           case when d.adbin is null then ''
                                else ' default ' || pg_get_expr(d.adbin, d.adrelid) end),
                    ', ' order by c.relname collate "C", a.attnum)
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
    and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from
       'achievements.key text not null, achievements.category text not null, achievements.gate text not null, '
       || 'achievements.target integer not null, achievements.bonus_xp integer not null, '
       || 'achievements.sort_order integer not null, achievements.is_active boolean not null default true, '
       || 'profile_achievements.user_id uuid not null, profile_achievements.achievement_key text not null, '
       || 'profile_achievements.gate text not null, profile_achievements.unlocked_at timestamp with time zone not null default now(), '
       || 'profile_achievements.backfill boolean not null default false, '
       || 'profile_levels.user_id uuid not null, profile_levels.xp integer not null default 0, '
       || 'profile_levels.level smallint not null default 1, profile_levels.welcome_pending boolean not null default false, '
       || 'profile_levels.updated_at timestamp with time zone not null default now(), '
       || 'xp_events.id bigint not null, xp_events.user_id uuid not null, xp_events.kind text not null, '
       || 'xp_events.source_key text not null, xp_events.xp integer not null, xp_events.xp_after integer not null, '
       || 'xp_events.units integer, xp_events.achievement_key text, xp_events.day date not null, '
       || 'xp_events.created_at timestamp with time zone not null default now(), '
       || 'xp_events.seen_at timestamp with time zone, '
       || 'xp_sources.kind text not null, xp_sources.base_xp integer not null default 0, '
       || 'xp_sources.unit_xp integer not null default 0, xp_sources.unit_cap integer, '
       || 'xp_sources.daily_xp_cap integer, xp_sources.daily_count_cap integer' then
    raise exception 'the new tables'' columns differ from spec §5.1: %', v_text;
  end if;

  -- 2. Their constraints.
  select string_agg(format('%s %s', k.conname, regexp_replace(pg_get_constraintdef(k.oid), '\mpublic\.', '', 'g')),
                    '; ' order by k.conname::text collate "C")
    into v_text
  from pg_constraint k
  where k.conrelid in ('public.xp_sources'::regclass, 'public.achievements'::regclass,
                       'public.xp_events'::regclass, 'public.profile_levels'::regclass,
                       'public.profile_achievements'::regclass);
  if v_text is distinct from
       'achievements_bonus_xp_check CHECK (((bonus_xp >= 25) AND (bonus_xp <= 250))); '
       || 'achievements_category_check CHECK ((category = ANY (ARRAY[''cellar''::text, ''tastings''::text, ''notes''::text, ''training''::text, ''friends''::text]))); '
       || 'achievements_gate_check CHECK ((gate = ANY (ARRAY[''public''::text, ''cellar''::text]))); '
       || 'achievements_gate_follows_category CHECK (((category = ''cellar''::text) = (gate = ''cellar''::text))); '
       || 'achievements_pkey PRIMARY KEY (key); '
       || 'achievements_target_check CHECK ((target > 0)); '
       || 'profile_achievements_achievement_key_fkey FOREIGN KEY (achievement_key) REFERENCES achievements(key); '
       || 'profile_achievements_gate_check CHECK ((gate = ANY (ARRAY[''public''::text, ''cellar''::text]))); '
       || 'profile_achievements_pkey PRIMARY KEY (user_id, achievement_key); '
       || 'profile_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_levels_level_check CHECK (((level >= 1) AND (level <= 60))); '
       || 'profile_levels_pkey PRIMARY KEY (user_id); '
       || 'profile_levels_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'profile_levels_xp_check CHECK ((xp >= 0)); '
       || 'xp_events_achievement_key_fkey FOREIGN KEY (achievement_key) REFERENCES achievements(key); '
       || 'xp_events_achievement_shape CHECK (((kind = ''achievement''::text) = (achievement_key IS NOT NULL))); '
       || 'xp_events_kind_fkey FOREIGN KEY (kind) REFERENCES xp_sources(kind); '
       || 'xp_events_pkey PRIMARY KEY (id); '
       || 'xp_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE; '
       || 'xp_events_user_id_source_key_key UNIQUE (user_id, source_key); '
       || 'xp_events_xp_after_check CHECK ((xp_after >= xp)); '
       || 'xp_events_xp_check CHECK ((xp > 0)); '
       || 'xp_sources_base_xp_check CHECK ((base_xp >= 0)); '
       || 'xp_sources_daily_count_cap_check CHECK ((daily_count_cap > 0)); '
       || 'xp_sources_daily_xp_cap_check CHECK ((daily_xp_cap > 0)); '
       || 'xp_sources_pkey PRIMARY KEY (kind); '
       || 'xp_sources_unit_cap_check CHECK ((unit_cap > 0)); '
       || 'xp_sources_unit_xp_check CHECK ((unit_xp >= 0))' then
    raise exception 'the new tables'' constraints differ from spec §5.1: %', v_text;
  end if;

  -- 3. The four indexes besides the keys.
  select string_agg(format('%s %s', i.indexname, regexp_replace(i.indexdef, '^.* USING ', '')), '; '
                    order by i.indexname collate "C")
    into v_text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.indexname in ('xp_events_user_kind_day_idx', 'xp_events_unseen_idx', 'wset_notes_author_idx',
                        'tasting_participants_user_idx');
  if v_text is distinct from
       'tasting_participants_user_idx btree (user_id); '
       || 'wset_notes_author_idx btree (author_id); '
       || 'xp_events_unseen_idx btree (user_id, id) WHERE (seen_at IS NULL); '
       || 'xp_events_user_kind_day_idx btree (user_id, kind, day)' then
    raise exception 'the indexes differ from spec §5.1/L24: %', v_text;
  end if;

  -- 4. RLS on (not forced) and exactly the five read policies.
  if exists (select 1 from pg_class c
              where c.relnamespace = 'public'::regnamespace
                and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
                and (not c.relrowsecurity or c.relforcerowsecurity)) then
    raise exception 'row level security is off, or forced, on a new table';
  end if;
  select string_agg(format('%s: %s %s %s %s %s', c.relname, p.polname, p.polcmd,
                           case when p.polpermissive then 'permissive' else 'restrictive' end,
                           p.polroles::regrole[]::text, coalesce(pg_get_expr(p.polqual, p.polrelid), '-')),
                    '; ' order by c.relname collate "C", p.polname collate "C")
    into v_text
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements');
  if v_text is distinct from
       'achievements: achievements read r permissive {authenticated} true; '
       || 'profile_achievements: profile achievements read r permissive {authenticated} '
       || '((user_id = auth.uid()) OR (gate <> ''cellar''::text) OR can_view_cellar(user_id)); '
       || 'profile_levels: profile levels read r permissive {authenticated} true; '
       || 'xp_events: xp events read own r permissive {authenticated} (user_id = auth.uid()); '
       || 'xp_sources: xp sources read r permissive {authenticated} true' then
    raise exception 'the new tables'' policies differ from spec §5.2: %', v_text;
  end if;

  -- 5. Grants: authenticated SELECT alone; anon and PUBLIC nothing; no column grants.
  select string_agg(format('%s %s', c.relname, a.privilege_type), ', ' order by c.relname collate "C", a.privilege_type collate "C")
    into v_text
  from pg_class c, aclexplode(c.relacl) a
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
    and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole));
  if v_text is distinct from
       'achievements SELECT, profile_achievements SELECT, profile_levels SELECT, xp_events SELECT, xp_sources SELECT' then
    raise exception 'client grants on the new tables are not "authenticated SELECT only": %', v_text;
  end if;
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a
              where c.oid = 'public.xp_events_id_seq'::regclass
                and (a.grantee = 0 or a.grantee in ('anon'::regrole, 'authenticated'::regrole))) then
    raise exception 'a client role holds a privilege on xp_events_id_seq';
  end if;
  if exists (select 1 from pg_attribute t join pg_class c on c.oid = t.attrelid
              where c.relnamespace = 'public'::regnamespace
                and c.relname in ('xp_sources', 'achievements', 'xp_events', 'profile_levels', 'profile_achievements')
                and t.attnum > 0 and t.attacl is not null) then
    raise exception 'a new table carries a column-level grant';
  end if;

  -- 6. The seeds: exactly §2 and §4.
  select string_agg(format('%s %s/%s/%s/%s/%s', kind, base_xp, unit_xp, coalesce(unit_cap::text, '-'),
                           coalesce(daily_xp_cap::text, '-'), coalesce(daily_count_cap::text, '-')),
                    ', ' order by kind collate "C")
    into v_text from public.xp_sources;
  if v_text is distinct from
       'achievement 0/0/-/-/-, cellar_add 0/5/20/100/-, drink 0/15/6/90/-, guess 10/1/-/-/-, '
       || 'guess_match 10/10/-/-/-, note 20/0/-/-/5, tasting_finished 40/0/-/-/3, '
       || 'tasting_hosted 40/0/-/-/3, training 20/1/-/-/5' then
    raise exception 'xp_sources is not spec §2''s table: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s %s', key, category, gate, target, bonus_xp), ', ' order by sort_order)
    into v_text from public.achievements where is_active;
  if v_text is distinct from
       'first_bottle cellar cellar 1 25, cellar_25 cellar cellar 25 50, cellar_100 cellar cellar 100 150, '
       || 'first_drink cellar cellar 1 25, drank_50 cellar cellar 50 100, '
       || 'first_tasting tastings public 1 25, tastings_10 tastings public 10 100, '
       || 'first_host tastings public 1 50, perfect_glass tastings public 1 100, winner tastings public 1 100, '
       || 'glasses_50 tastings public 50 100, first_note notes public 1 25, notes_25 notes public 25 75, '
       || 'notes_100 notes public 100 200, note_countries_10 notes public 10 100, '
       || 'first_training training public 1 25, training_10 training public 10 75, '
       || 'training_ace training public 1 100, first_friend friends public 1 25, friends_10 friends public 10 75' then
    raise exception 'achievements is not spec §4''s table: %', v_text;
  end if;

  -- 7. Every function this file creates: security, search_path, volatility,
  --    language, return type, arguments, body (md5 of prosrc with any CR
  --    stripped) and who holds EXECUTE ("OWNER" is the owner).
  for v_fn in
    select s.sig, s.secdef, s.volatile, s.lang, s.rettype, s.retset, s.args, s.body_md5, s.grantees,
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
      ('public.level_for_xp(integer)', false, 'i', 'plpgsql', 'smallint', false, 'p_xp integer',
       'e1e671dec9b7f9fe961895fb89da0b1f', 'OWNER'),
      ('public.xp_award(uuid,text,text,integer,integer,text,timestamptz,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_kind text, p_source_key text, p_xp integer, p_units integer, p_achievement text, p_at timestamp with time zone, p_seen boolean',
       '25cd28e3b4d2501d32e9031ca87b9bca', 'OWNER'),
      ('public.xp_consumption_masked(uuid)', true, 's', 'sql', 'boolean', false, 'p_consumption uuid',
       '9a8f6ce6d9de3063e5743dac5bec12b4', 'OWNER'),
      ('public.xp_cellar_on_hand(uuid)', true, 's', 'sql', 'integer', false, 'p_user uuid',
       '3481a84c307948e83a41e56a2e1c40b3', 'OWNER'),
      ('public.xp_tasting_player(uuid,uuid)', true, 's', 'sql', 'boolean', false, 'p_tasting uuid, p_user uuid',
       'c94850b9c2a258b0042a04a25e7ae7dd', 'OWNER'),
      ('public.xp_tasting_won_by(uuid,uuid)', true, 's', 'sql', 'boolean', false, 'p_tasting uuid, p_user uuid',
       'a9c32de88c5af2fc781bd7ec0d5689f2', 'OWNER'),
      ('public.xp_achievement_metric(uuid,text)', true, 's', 'plpgsql', 'integer', false, 'p_user uuid, p_key text',
       '6221cc770dd3aee16c43bc50a2ca1004', 'OWNER'),
      ('public.xp_check_achievements(uuid,text,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_category text, p_at timestamp with time zone, p_seen boolean, p_backfill boolean',
       '42fb379abdab68f1fdeec11f1af96b58', 'OWNER'),
      ('public.xp_award_guess(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_guess uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '599f905cd9d9f4cc631b57cb2bf4c887', 'OWNER'),
      ('public.xp_award_tasting_close(uuid,uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_tasting uuid, p_user uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '12f3b0633f833e11eda81d9a56a62e00', 'OWNER'),
      ('public.xp_award_cellar_lot(uuid,integer,integer,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_lot uuid, p_old integer, p_new integer, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '7baec44db9b657eaf6dd6ea1c425e9e6', 'OWNER'),
      ('public.xp_award_drink(uuid,timestamptz,boolean,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_consumption uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean, p_require_lot boolean',
       'bb4410ed83f66ceed1a5f469c68f2b91', 'OWNER'),
      ('public.xp_award_note(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_note uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       'e04cf320098a84a871eba439e8af0a66', 'OWNER'),
      ('public.xp_award_training(uuid,timestamptz,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_attempt uuid, p_at timestamp with time zone, p_seen boolean, p_check boolean',
       '52a1e008282add33cafcbddf17eb63bc', 'OWNER'),
      ('public.xp_replay_user(uuid,boolean,boolean,boolean)', true, 'v', 'plpgsql', 'integer', false,
       'p_user uuid, p_seen boolean, p_backfill boolean, p_repair boolean',
       '84cd76a07bc5d20cdb2c421839ef4ca3', 'OWNER'),
      ('public.xp_on_glass_revealed()', true, 'v', 'plpgsql', 'trigger', false, '',
       'cbb6b965b8421af8e476e529c9691324', 'OWNER'),
      ('public.xp_on_tasting_closed()', true, 'v', 'plpgsql', 'trigger', false, '',
       'a5ba1c057b2b99f8f00fc796c3467bd4', 'OWNER'),
      ('public.xp_on_cellar_lot()', true, 'v', 'plpgsql', 'trigger', false, '',
       '5174e05a934bec37adc7b6c3b88ed677', 'OWNER'),
      ('public.xp_on_cellar_consumption()', true, 'v', 'plpgsql', 'trigger', false, '',
       '908ed16361d1c53d273853798cbc4aa2', 'OWNER'),
      ('public.xp_on_wset_note()', true, 'v', 'plpgsql', 'trigger', false, '',
       '0ddc191a6f385d42baa704393ba7d1c9', 'OWNER'),
      ('public.xp_on_training_scored()', true, 'v', 'plpgsql', 'trigger', false, '',
       '1835464dbc5fbd898c6e55e5becfb532', 'OWNER'),
      ('public.xp_on_friendship()', true, 'v', 'plpgsql', 'trigger', false, '',
       '37281ca530320b28c483fbd750ad8a7f', 'OWNER'),
      ('public.xp_drop_deleted_profile()', true, 'v', 'plpgsql', 'trigger', false, '',
       '7919bfa1008d0ed574212d316031bbc8', 'OWNER'),
      ('public.get_my_level_state()', false, 's', 'sql', 'jsonb', false, '',
       '1be2bcfe134b250867e8f44cee243dd8', 'OWNER,authenticated'),
      ('public.mark_xp_seen(bigint[],boolean)', true, 'v', 'plpgsql', 'void', false, 'p_ids bigint[], p_welcome boolean',
       'e079b0a31504b3108aa7180b5ca9f53e', 'OWNER,authenticated'),
      ('public.get_my_achievement_progress()', true, 's', 'sql', 'record', true, '',
       'e34084467ab9655a1a0cb2be3400c942', 'OWNER,authenticated')
    ) as s (sig, secdef, volatile, lang, rettype, retset, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
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

  -- 8. The ten triggers, and the reveal trigger's place among its neighbours.
  select string_agg(pg_get_triggerdef(t.oid), E'\n' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where not t.tgisinternal
    and t.tgname in ('wines_xp_on_reveal', 'tastings_xp_on_close', 'cellar_lots_xp_insert',
                     'cellar_lots_xp_update', 'cellar_consumptions_xp', 'wset_notes_xp_insert',
                     'wset_notes_xp_identity', 'training_attempts_xp', 'friendships_xp',
                     'profiles_deleted_drop_levels');
  v_expected := concat_ws(E'\n',
    'CREATE CONSTRAINT TRIGGER cellar_consumptions_xp AFTER INSERT ON public.cellar_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION xp_on_cellar_consumption()',
    'CREATE TRIGGER cellar_lots_xp_insert AFTER INSERT ON public.cellar_lots FOR EACH ROW EXECUTE FUNCTION xp_on_cellar_lot()',
    'CREATE TRIGGER cellar_lots_xp_update AFTER UPDATE OF purchased_quantity, quantity ON public.cellar_lots FOR EACH ROW WHEN (((new.purchased_quantity > old.purchased_quantity) OR (new.quantity > old.quantity))) EXECUTE FUNCTION xp_on_cellar_lot()',
    'CREATE TRIGGER friendships_xp AFTER INSERT ON public.friendships FOR EACH ROW EXECUTE FUNCTION xp_on_friendship()',
    'CREATE TRIGGER profiles_deleted_drop_levels AFTER UPDATE OF deleted_at ON public.profiles FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION xp_drop_deleted_profile()',
    'CREATE TRIGGER tastings_xp_on_close AFTER UPDATE OF status ON public.tastings FOR EACH ROW WHEN (((new.status = ''CLOSED''::tasting_status) AND (old.status IS DISTINCT FROM ''CLOSED''::tasting_status))) EXECUTE FUNCTION xp_on_tasting_closed()',
    'CREATE TRIGGER training_attempts_xp AFTER INSERT OR UPDATE OF scored_at ON public.training_attempts FOR EACH ROW WHEN ((new.scored_at IS NOT NULL)) EXECUTE FUNCTION xp_on_training_scored()',
    'CREATE TRIGGER wines_xp_on_reveal AFTER UPDATE OF is_revealed ON public.wines FOR EACH ROW WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION xp_on_glass_revealed()',
    'CREATE TRIGGER wset_notes_xp_identity AFTER UPDATE OF catalog_wine_id, unidentified_wine_id ON public.wset_notes FOR EACH ROW WHEN (((old.catalog_wine_id IS DISTINCT FROM new.catalog_wine_id) OR (old.unidentified_wine_id IS DISTINCT FROM new.unidentified_wine_id))) EXECUTE FUNCTION xp_on_wset_note()',
    'CREATE TRIGGER wset_notes_xp_insert AFTER INSERT ON public.wset_notes FOR EACH ROW EXECUTE FUNCTION xp_on_wset_note()');
  if v_text is distinct from v_expected then
    raise exception 'the triggers differ from spec §7.1: %', v_text;
  end if;
  select string_agg(t.tgname, ',' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal
    and pg_get_triggerdef(t.oid) like '% AFTER UPDATE OF is_revealed ON public.wines %';
  if v_text is distinct from 'semi_blind_release_revealed_wine,trg_catalog_wine_unmark_blind,wines_release_note_holds,wines_xp_on_reveal,wset_notes_resolve_on_reveal' then
    raise exception 'wines_xp_on_reveal does not fire after the unmark and the note-hold release and before the note resolve: %', v_text;
  end if;
  -- The hold row exists before either note trigger runs (name order).
  select string_agg(t.tgname, ',' order by t.tgname collate "C") into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal
    and t.tgname in ('wset_notes_hold_on_identity', 'wset_notes_xp_identity', 'wset_notes_xp_insert');
  if v_text is distinct from 'wset_notes_hold_on_identity,wset_notes_xp_identity,wset_notes_xp_insert' then
    raise exception 'the note hold does not fire before the note XP triggers: %', v_text;
  end if;

  -- 9. The backfill (§5.4): totals and levels agree with the ledger, each
  --    person's newest row carries their total, nothing unseen, one welcome
  --    per non-deleted profile, every achievement's bonus paid once.
  if exists (select 1 from public.profile_levels l
              where l.xp <> coalesce((select sum(e.xp) from public.xp_events e where e.user_id = l.user_id), 0)
                 or l.level <> public.level_for_xp(l.xp)) then
    raise exception 'a profile_levels row disagrees with its ledger or the curve';
  end if;
  if exists (select 1 from public.profile_levels l
              where l.xp > 0
                and l.xp <> (select e.xp_after from public.xp_events e
                              where e.user_id = l.user_id order by e.id desc limit 1)) then
    raise exception 'a person''s newest ledger row does not carry their total';
  end if;
  if exists (select 1 from public.xp_events where seen_at is null) then
    raise exception 'the backfill left an unseen ledger row';
  end if;
  if (select count(*) from public.profile_levels where welcome_pending)
       <> (select count(*) from public.profiles where deleted_at is null)
     or exists (select 1 from public.profile_levels l join public.profiles p on p.id = l.user_id
                 where l.welcome_pending and p.deleted_at is not null) then
    raise exception 'welcome_pending is not set for exactly the non-deleted profiles';
  end if;
  if exists (select 1 from public.profile_achievements pa
              where (select count(*) from public.xp_events e
                      where e.user_id = pa.user_id and e.source_key = 'achievement:' || pa.achievement_key) <> 1)
     or exists (select 1 from public.profile_achievements where not backfill) then
    raise exception 'an unlocked achievement lacks its one bonus row, or is not marked backfilled';
  end if;

  select string_agg(format('L%s × %s', level, n), ', ' order by level desc) into v_text
  from (select level, count(*) as n from public.profile_levels group by level) x;
  raise notice 'levels: % profiles, % ledger rows, % XP, % achievements; %',
    (select count(*) from public.profile_levels), (select count(*) from public.xp_events),
    (select coalesce(sum(xp), 0) from public.profile_levels),
    (select count(*) from public.profile_achievements), v_text;
end $$;
