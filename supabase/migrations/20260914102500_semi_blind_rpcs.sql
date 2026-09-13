-- M9a semi_blind_rpcs: opaque candidate keys and the semi-blind RPCs.
--
-- Blind-tasting v3, plan task BT-SQL9 (refinement 1: M9 ships as M9a + M9b):
-- spec docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §10.4 (a)-(c),
-- §15 M9 (first half), §16.1 rows 19-21; ledger B9 (opaque keys, swap, per-glass
-- clear) and Q7 (the list is a snapshot from Start). The function bodies are the
-- spec's SQL where the spec gives it and the plan's (BT-SQL9 "Does" (b), (c))
-- where the spec elides it, byte for byte, except get_semi_blind_candidates: the
-- plan's body with the reviewed change described under "Deviation from the plan".
--
-- Written against the LIVE state (read-only checks, 2026-09-13; live tail
-- 20260914112500, blind-tasting M1-M3 applied, M4-M8 committed and not applied):
-- * catalog_wines.wine_name, catalog_wines_unidentified.wine_name,
--   wine_answers.unidentified_wine_id and tastings.async_reveal_policy exist;
--   live wine_answers.producer_id and vintage_kind are NOT NULL (B13 outcome);
-- * semi_blind_candidate_keys and the seven functions below do not exist;
-- * guesses carries UNIQUE (wine_id, participant_id), the assign upsert's arbiter;
-- * has_scored_guess, is_tasting_host, is_tasting_participant and
--   tasting_has_revealed_wine are the SECURITY DEFINER bodies pinned below.
-- wines.added_by_host is M6's (20260914095500_flight_edits_until_first_step):
-- this file applies after M6 and M7 (version order) and fails closed without it.
-- It recreates no live function and no policy.
--
-- What it adds. Nothing deployed changes behaviour: no deployed code calls these
-- functions, and the key table has no client grant.
-- (a) semi_blind_candidate_keys: one random 16-hex key per glass, unique within
--     its tasting, never derived from position, id or time. RLS on, no policies,
--     no anon or authenticated privilege: only the SECURITY DEFINER functions
--     below read or write it. ensure_semi_blind_keys mints missing keys (no
--     client EXECUTE); every read calls it first.
-- (b) The reads. can_see_semi_blind_list: the host or a JOINED participant of a
--     SEMI_BLIND tasting. get_semi_blind_candidates: keyed label cards ordered by
--     key, and a pending count; while DRAFT a caller gets only the cards of the
--     glasses they added, and pending only as the host; from Start pending to every
--     caller allowed, and every card too once no glass lacks its answer key (until
--     then still only the cards of the glasses the caller added).
--     get_semi_blind_board: the caller's own rows, revealed
--     glasses' keys, per-candidate splits on revealed glasses (eligible JOINED
--     rows), the caller's own bottles, and "known" (has_scored_guess: an ASYNC
--     IMMEDIATE own scored guess with no step reveal in progress).
--     get_semi_blind_revealed_picks: per revealed glass, who picked what; the
--     pick's label only when that wine is revealed or the caller saw the list.
-- (c) The writes. assign_semi_blind_match assigns, swaps with an open unlocked
--     holder, and refuses a locked holder ("glass locked", detail = the holder's
--     glass id), a revealed or proven candidate, the caller's own bottle and the
--     host-provides host. clear_semi_blind_match empties the caller's open row.
-- Not here (M9b, 20260914103500_semi_blind_lockdown): the unique index
-- guesses_one_open_glass_per_candidate, the pool release, the flight lock at
-- Start, the guesses column privileges and the narrowed "wine_answers read".
-- Until M9b the deployed batch UI keeps writing guessed_wine_id directly,
-- duplicates included, and the live semi-blind clause of "wine_answers read" stays.
--
-- Security (rule 1; spec §16.1 rows 19-21). Keys are random per tasting and never
-- equal a wine id; cards carry label fields only; no payload maps a candidate key
-- to an unrevealed wine's id: the board speaks in keys, splits exist only for
-- revealed glasses, "known" lists only glasses the caller has proved, and labels
-- of unrevealed picks go only to the host and JOINED participants. INVITED,
-- DECLINED and outsiders get null from the list and the board. Every function
-- pins search_path = public; EXECUTE is authenticated-only (never anon or PUBLIC),
-- and ensure_semi_blind_keys is not client-callable.
--
-- Deviation from the plan (BT-SQL9 review, 2026-09-13): the late answer key. A
-- glass may start without an answer key (add-wine D7 as amended: Start warns, it
-- does not refuse), and its adder may key it after Start (M6's
-- can_edit_flight_glass allows that until the glass's first step).
-- tasting_incomplete_glasses and get_wine_reveal already tell every participant
-- which glass that is, so a list that grew by one card when the key landed would
-- tie that card to that glass. get_semi_blind_candidates therefore counts the
-- glasses without an answer key in the same statement as the cards: from Start a
-- caller gets every card only while that count is 0, and until then only the
-- cards of the glasses they added (as while DRAFT), with pending. Every card then
-- appears at once, so no refresh shows a single new card. The plan's other lines
-- are kept. A complete started list stays complete only through objects outside
-- this file: no client DELETE on wine_answers (it has no DELETE policy), M6's
-- refusal to remove a started semi-blind glass, and M9b's refusal to insert one.
-- Until M9b applies, a glass inserted after Start and then keyed still adds one
-- card, and the live "wine_answers read" semi-blind clause exposes every answer
-- key anyway.
--
-- M8 (20260914101500_guess_lock_pin) applies after this file (refinement 24). Its
-- writer pre-assert names assign_semi_blind_match(uuid,text) and
-- clear_semi_blind_match(uuid); both read the caller's row (the assign also the
-- holder) FOR UPDATE and refuse a locked one with their own sentence before they
-- write. The post-state block asserts that no other new function inserts into or
-- updates guesses.
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the post-state assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot of what this file must not change.
-- ---------------------------------------------------------------------------
create temp table semi_blind_102500_policies as
select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
       pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
from pg_policies pol
where pol.schemaname = 'public'
  and pol.tablename in ('guesses', 'wine_answers', 'wines', 'tastings', 'tasting_participants');

create temp table semi_blind_102500_acl as
select c.relname::text as tbl, a.attname::text as col, x.grantor, x.grantee, x.privilege_type, x.is_grantable
from pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) x
where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                'public.tastings'::regclass, 'public.tasting_participants'::regclass)
union all
select c.relname::text, '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
from pg_class c
cross join lateral aclexplode(c.relacl) x
where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                'public.tastings'::regclass, 'public.tasting_participants'::regclass);

create temp table semi_blind_102500_triggers as
select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
       pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where t.tgrelid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                    'public.tastings'::regclass, 'public.tasting_participants'::regclass)
  and not t.tgisinternal;

create temp table semi_blind_102500_functions as
select s.sig, p.oid, md5(replace(p.prosrc, chr(13), '')) as src_md5, p.proacl::text as acl,
       p.prosecdef, p.proconfig::text as config
from unnest(array[
  'public.has_scored_guess(uuid)',
  'public.is_tasting_host(uuid)',
  'public.is_tasting_participant(uuid)',
  'public.tasting_has_revealed_wine(uuid)',
  'public.is_open_guess_target(uuid,uuid,uuid)',
  'public.is_own_joined_participant_for_wine(uuid,uuid)',
  'public.reveal_wine(uuid)',
  'public.reveal_next_category(uuid,smallint)',
  'public.score_own_guess(uuid)',
  'public.reveal_own_next_category(uuid,smallint)',
  'public.get_wine_reveal(uuid)',
  'public.block_guess_writes_after_reveal()',
  'public.pin_guess_identity()'
]) as s (sig)
left join pg_proc p on p.oid = to_regprocedure(s.sig);

create temp table semi_blind_102500_counts as
select (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
       (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace) as relations;

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  v_text text;
begin
  -- 1. Nothing of this file exists yet (create or replace would silently replace a function).
  if to_regclass('public.semi_blind_candidate_keys') is not null then
    raise exception 'public.semi_blind_candidate_keys already exists';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('ensure_semi_blind_keys', 'can_see_semi_blind_list', 'get_semi_blind_candidates',
                      'get_semi_blind_board', 'get_semi_blind_revealed_picks',
                      'assign_semi_blind_match', 'clear_semi_blind_match');
  if v_text is not null then
    raise exception 'semi-blind functions already exist: %', v_text;
  end if;

  -- 2. M6 first: the host's DRAFT cards key on its pinned flag.
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host'
      and a.atttypid = 'boolean'::regtype and a.attnotnull and not a.attisdropped
  ) then
    raise exception 'wines.added_by_host (boolean not null) is missing: apply 20260914095500_flight_edits_until_first_step (M6) first';
  end if;

  -- 3. The columns the new functions read or write, with their live types.
  select string_agg(format('%s.%s', e.tbl, e.col), ', ') into v_text
  from (values
    ('tastings', 'id', 'uuid'), ('tastings', 'host_id', 'uuid'),
    ('tastings', 'status', 'public.tasting_status'), ('tastings', 'reveal_mode', 'public.reveal_mode_type'),
    ('tastings', 'wine_source', 'public.wine_source_mode'), ('tastings', 'timing_mode', 'public.timing_mode'),
    ('tastings', 'async_reveal_policy', 'public.async_reveal_type'),
    ('tasting_participants', 'id', 'uuid'), ('tasting_participants', 'tasting_id', 'uuid'),
    ('tasting_participants', 'user_id', 'uuid'), ('tasting_participants', 'status', 'public.participant_status'),
    ('wines', 'id', 'uuid'), ('wines', 'tasting_id', 'uuid'), ('wines', 'position', 'integer'),
    ('wines', 'is_revealed', 'boolean'), ('wines', 'reveal_step', 'smallint'),
    ('wines', 'contributor_participant_id', 'uuid'), ('wines', 'added_by_host', 'boolean'),
    ('wine_answers', 'wine_id', 'uuid'), ('wine_answers', 'producer_id', 'uuid'),
    ('wine_answers', 'catalog_wine_id', 'uuid'), ('wine_answers', 'unidentified_wine_id', 'uuid'),
    ('wine_answers', 'appellation_id', 'uuid'), ('wine_answers', 'primary_grape_id', 'uuid'),
    ('wine_answers', 'vintage_kind', 'public.vintage_kind'), ('wine_answers', 'vintage_year', 'integer'),
    ('wine_answers', 'vintage_tawny_years', 'integer'),
    ('guesses', 'id', 'uuid'), ('guesses', 'wine_id', 'uuid'), ('guesses', 'participant_id', 'uuid'),
    ('guesses', 'guessed_wine_id', 'uuid'), ('guesses', 'locked_at', 'timestamp with time zone'),
    ('guesses', 'scored_at', 'timestamp with time zone'), ('guesses', 'total_points', 'integer'),
    ('producers', 'id', 'uuid'), ('producers', 'name', 'text'),
    ('catalog_wines', 'id', 'uuid'), ('catalog_wines', 'wine_name', 'text'),
    ('catalog_wines_unidentified', 'id', 'uuid'), ('catalog_wines_unidentified', 'wine_name', 'text'),
    ('appellations', 'id', 'uuid'), ('appellations', 'name', 'text'),
    ('grapes', 'id', 'uuid'), ('grapes', 'name', 'text')
  ) as e (tbl, col, typ)
  left join pg_attribute a
    on a.attrelid = to_regclass('public.' || e.tbl) and a.attname = e.col
   and a.attnum > 0 and not a.attisdropped
  where a.attnum is null or a.atttypid is distinct from to_regtype(e.typ)::oid;
  if v_text is not null then
    raise exception 'columns the semi-blind functions use are missing or retyped: %', v_text;
  end if;

  -- 4. The enum labels the bodies compare against.
  select string_agg(format('%s.%s', e.typ, e.lbl), ', ') into v_text
  from (values
    ('public.reveal_mode_type', 'SEMI_BLIND'), ('public.tasting_status', 'DRAFT'),
    ('public.tasting_status', 'IN_PROGRESS'), ('public.participant_status', 'JOINED'),
    ('public.wine_source_mode', 'HOST_PROVIDES'), ('public.vintage_kind', 'YEAR'),
    ('public.vintage_kind', 'NV'), ('public.vintage_kind', 'TAWNY')
  ) as e (typ, lbl)
  where not exists (select 1 from pg_enum x where x.enumtypid = to_regtype(e.typ)::oid and x.enumlabel = e.lbl);
  if v_text is not null then
    raise exception 'enum labels missing: %', v_text;
  end if;

  -- 5. The assign upsert's arbiter: guesses UNIQUE (wine_id, participant_id).
  if not exists (
    select 1 from pg_constraint k
    where k.conrelid = 'public.guesses'::regclass and k.contype = 'u'
      and cardinality(k.conkey) = 2
      and k.conkey @> (select array_agg(a.attnum) from pg_attribute a
                       where a.attrelid = 'public.guesses'::regclass and a.attname in ('wine_id', 'participant_id'))
  ) then
    raise exception 'guesses has no UNIQUE (wine_id, participant_id) constraint for the assign upsert';
  end if;

  -- 6. The helpers the reads, the gate and the proven check call, as read live
  --    (md5 of prosrc, CR-stripped; SECURITY DEFINER with search_path=public).
  select string_agg(e.sig, ', ') into v_text
  from (values
    ('public.has_scored_guess(uuid)', '5099c6403210215615be08022bc621fe'),
    ('public.is_tasting_host(uuid)', '8ef6153d5d80f4bdcf587b4270568a02'),
    ('public.is_tasting_participant(uuid)', '84808d6f9c81b41397e63de148849307'),
    ('public.tasting_has_revealed_wine(uuid)', '3e0865af32d41bc173abe5fdddbe5fab')
  ) as e (sig, src_md5)
  left join pg_proc p on p.oid = to_regprocedure(e.sig)
  where p.oid is null
     or md5(replace(p.prosrc, chr(13), '')) is distinct from e.src_md5
     or not p.prosecdef
     or p.proconfig::text is distinct from '{search_path=public}';
  if v_text is not null then
    raise exception 'helpers differ from the live bodies this migration was written against: %', v_text;
  end if;

  -- 7. The key generator and the caller's id resolve.
  if to_regprocedure('gen_random_uuid()') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'gen_random_uuid() or auth.uid() does not resolve';
  end if;
end $$;

-- ===========================================================================
-- Spec §10.4 (a) Opaque keys, verbatim.
-- ===========================================================================
create table public.semi_blind_candidate_keys (
  wine_id uuid primary key references public.wines(id) on delete cascade,
  tasting_id uuid not null references public.tastings(id) on delete cascade,
  candidate_key text not null,
  created_at timestamptz not null default now(),
  unique (tasting_id, candidate_key)
);
alter table public.semi_blind_candidate_keys enable row level security;
revoke all on public.semi_blind_candidate_keys from anon, authenticated;
-- No policies: only SECURITY DEFINER functions read or write it.

-- Mint keys for glasses that have none. Random; never derived from position, id or time.
create or replace function public.ensure_semi_blind_keys(p_tasting_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into semi_blind_candidate_keys (wine_id, tasting_id, candidate_key)
  select w.id, w.tasting_id, substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
  from wines w
  where w.tasting_id = p_tasting_id
    and not exists (select 1 from semi_blind_candidate_keys k where k.wine_id = w.id)
  on conflict do nothing;
end $$;
revoke all on function public.ensure_semi_blind_keys(uuid) from public, anon, authenticated;

-- ===========================================================================
-- Spec §10.4 (b) Reads: can_see_semi_blind_list verbatim. The three bodies the
-- spec elides are the plan's (BT-SQL9 "Does" (b)), verbatim, each under the
-- spec's contract comment.
-- ===========================================================================
create or replace function public.can_see_semi_blind_list(p_tasting_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tastings t
    where t.id = p_tasting_id and t.reveal_mode = 'SEMI_BLIND'
      and (t.host_id = auth.uid()
           or exists (select 1 from tasting_participants p
                      where p.tasting_id = t.id and p.user_id = auth.uid()
                        and p.status = 'JOINED'))
  );
$$;

-- { "cards": [ { "key", "producer", "wine_name", "vintage_kind", "vintage_year",
--               "vintage_tawny_years", "appellation", "grape",
--               "revealed_glass" } ],          -- list-order glass number, null unless revealed
--   "pending": <glasses without an answer key> }
-- Cards ordered by key (random); the client sorts with sortCandidates.
-- Null unless can_see_semi_blind_list(p_tasting_id). Calls ensure_semi_blind_keys first.
-- While the tasting is DRAFT: only the cards of glasses the caller added (the host's
-- added_by_host glasses; a contributor's own), and "pending" null unless the caller is
-- the host. From Start: "pending" to every caller allowed above, and every card once
-- "pending" is 0; while it is not, only the cards of glasses the caller added (BT-SQL9
-- review: a glass keyed after Start must not add a single card).
create or replace function public.get_semi_blind_candidates(p_tasting_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_cards jsonb;
  v_pending int;
  v_unkeyed int;
  v_started boolean;
  v_is_host boolean;
  v_pid uuid;
begin
  if not public.can_see_semi_blind_list(p_tasting_id) then
    return null;
  end if;
  perform public.ensure_semi_blind_keys(p_tasting_id);
  select t.status <> 'DRAFT', t.host_id = auth.uid() into v_started, v_is_host
  from tastings t where t.id = p_tasting_id;
  select id into v_pid from tasting_participants
   where tasting_id = p_tasting_id and user_id = auth.uid() and status = 'JOINED';

  -- Before Start a caller sees only the glasses they added (spec §10.3 item 1).
  -- From Start the same holds while any glass has no answer key: a glass started
  -- without one (add-wine D7) and keyed later would otherwise put one new card on
  -- the guests' screens in the same refresh as tasting_incomplete_glasses drops
  -- that glass. Every card appears at once when the last key lands (BT-SQL9 review).
  with numbered as (
    select w.id, w.is_revealed, w.added_by_host, w.contributor_participant_id,
           row_number() over (order by w.position) as glass,
           exists (select 1 from wine_answers a where a.wine_id = w.id) as keyed
    from wines w where w.tasting_id = p_tasting_id
  ),
  unkeyed as (
    select (count(*) filter (where not n.keyed))::int as n
    from numbered n
  ),
  ordered as (
    select n.id, n.is_revealed, n.glass
    from numbered n cross join unkeyed x
    where (v_started and x.n = 0)
       or (n.added_by_host and v_is_host)
       or (v_pid is not null and n.contributor_participant_id = v_pid)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', k.candidate_key,
           'producer', pr.name,
           'wine_name', coalesce(cw.wine_name, u.wine_name),
           'vintage_kind', a.vintage_kind,
           'vintage_year', a.vintage_year,
           'vintage_tawny_years', a.vintage_tawny_years,
           'appellation', ap.name,
           'grape', g.name,
           'revealed_glass', case when o.is_revealed then o.glass end
         ) order by k.candidate_key), '[]'::jsonb),
         (select x.n from unkeyed x)
    into v_cards, v_unkeyed
  from ordered o
  join semi_blind_candidate_keys k on k.wine_id = o.id
  join wine_answers a on a.wine_id = o.id
  left join producers pr on pr.id = a.producer_id
  left join catalog_wines cw on cw.id = a.catalog_wine_id
  left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
  left join appellations ap on ap.id = a.appellation_id
  left join grapes g on g.id = a.primary_grape_id;

  v_pending := case when v_started or v_is_host then v_unkeyed end;

  return jsonb_build_object('cards', v_cards, 'pending', v_pending);
end $$;

-- The caller's board. Null unless can_see_semi_blind_list(p_tasting_id).
-- { "mine":        [ { "glass_wine_id", "key", "locked", "scored", "total_points" } ],  -- the caller's own rows
--   "revealed":    [ { "glass_wine_id", "key" } ],                                      -- revealed glasses only
--   "split":       [ { "glass_wine_id", "key", "count" } ],                             -- revealed glasses, eligible rows
--   "own_bottles": [ "key" ],                                                           -- wines the caller contributed
--   "known":       [ { "glass_wine_id", "key" } ] }                                     -- unrevealed glasses where has_scored_guess(glass) holds
create or replace function public.get_semi_blind_board(p_tasting_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_t tastings%rowtype;
  v_pid uuid;
begin
  if not public.can_see_semi_blind_list(p_tasting_id) then
    return null;
  end if;
  perform public.ensure_semi_blind_keys(p_tasting_id);
  select * into v_t from tastings where id = p_tasting_id;
  select id into v_pid from tasting_participants
   where tasting_id = p_tasting_id and user_id = auth.uid() and status = 'JOINED';

  return jsonb_build_object(
    'mine', coalesce((
      select jsonb_agg(jsonb_build_object(
               'glass_wine_id', g.wine_id, 'key', k.candidate_key,
               'locked', g.locked_at is not null, 'scored', g.scored_at is not null,
               'total_points', g.total_points))
      from guesses g
      join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id
      left join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
      where v_pid is not null and g.participant_id = v_pid), '[]'::jsonb),
    'revealed', coalesce((
      select jsonb_agg(jsonb_build_object('glass_wine_id', w.id, 'key', k.candidate_key))
      from wines w join semi_blind_candidate_keys k on k.wine_id = w.id
      where w.tasting_id = p_tasting_id and w.is_revealed), '[]'::jsonb),
    'split', coalesce((
      select jsonb_agg(jsonb_build_object('glass_wine_id', s.wine_id, 'key', s.candidate_key, 'count', s.n))
      from (
        select g.wine_id, k.candidate_key, count(*)::int as n
        from guesses g
        join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and w.is_revealed
        join tasting_participants p on p.id = g.participant_id and p.status = 'JOINED'
        join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
        where p.id is distinct from w.contributor_participant_id
          and not (v_t.wine_source = 'HOST_PROVIDES' and p.user_id = v_t.host_id)
        group by g.wine_id, k.candidate_key
      ) s), '[]'::jsonb),
    'own_bottles', coalesce((
      select jsonb_agg(k.candidate_key)
      from wines w join semi_blind_candidate_keys k on k.wine_id = w.id
      where v_pid is not null and w.tasting_id = p_tasting_id
        and w.contributor_participant_id = v_pid), '[]'::jsonb),
    'known', coalesce((
      select jsonb_agg(jsonb_build_object('glass_wine_id', w.id, 'key', k.candidate_key))
      from guesses g
      join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and not w.is_revealed
      join semi_blind_candidate_keys k on k.wine_id = w.id
      where v_pid is not null and g.participant_id = v_pid
        and public.has_scored_guess(w.id)), '[]'::jsonb)   -- lane N's gate: own scored guess, ASYNC IMMEDIATE, no step reveal in progress
  );
end $$;

-- For /results, the record (§11) and /u/[id]/tastings/[tastingId]: per revealed glass,
-- who matched and what they picked. Rows only for revealed glasses of a SEMI_BLIND tasting
-- the caller can read (host, participant, or tasting_has_revealed_wine).
-- pick_key   = the picked wine's opaque candidate key (null when nothing was picked); an
--              identifier for counting splits, meaningless without the list.
-- pick_label = "{producer}, {wine name} {vintage}" of the picked wine when that wine is
--              revealed, or when the caller is the host or a JOINED participant (who saw the
--              list); null otherwise.
create or replace function public.get_semi_blind_revealed_picks(p_tasting_id uuid)
returns table (glass_wine_id uuid, participant_id uuid, correct boolean,
               pick_key text, pick_label text)
language plpgsql security definer set search_path = public as $$
declare
  v_member boolean;
begin
  if not exists (select 1 from tastings t where t.id = p_tasting_id and t.reveal_mode = 'SEMI_BLIND')
     or not (public.is_tasting_host(p_tasting_id)
             or public.is_tasting_participant(p_tasting_id)
             or public.tasting_has_revealed_wine(p_tasting_id)) then
    return;
  end if;
  perform public.ensure_semi_blind_keys(p_tasting_id);
  v_member := public.can_see_semi_blind_list(p_tasting_id);

  return query
  select g.wine_id, g.participant_id,
         coalesce(g.guessed_wine_id = g.wine_id, false),
         k.candidate_key,
         case when g.guessed_wine_id is not null and (pw.is_revealed or v_member) then
           concat_ws(' ',
             concat_ws(', ', pr.name, coalesce(cw.wine_name, u.wine_name)),
             case a.vintage_kind
               when 'YEAR' then a.vintage_year::text
               when 'NV' then 'NV'
               when 'TAWNY' then coalesce(a.vintage_tawny_years::text || 'yo', 'Tawny')
             end)
         end
  from guesses g
  join wines w on w.id = g.wine_id and w.tasting_id = p_tasting_id and w.is_revealed
  left join wines pw on pw.id = g.guessed_wine_id
  left join semi_blind_candidate_keys k on k.wine_id = g.guessed_wine_id
  left join wine_answers a on a.wine_id = g.guessed_wine_id
  left join producers pr on pr.id = a.producer_id
  left join catalog_wines cw on cw.id = a.catalog_wine_id
  left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id;
end $$;

-- ===========================================================================
-- Spec §10.4 (c) Writes: assign_semi_blind_match verbatim. The clear body is the
-- plan's (BT-SQL9 "Does" (c)), verbatim, under the spec's contract comment.
-- ===========================================================================
create or replace function public.assign_semi_blind_match(p_wine_id uuid, p_candidate_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_glass wines%rowtype;
  v_tasting tastings%rowtype;
  v_pid uuid;
  v_candidate uuid;
  v_mine guesses%rowtype;
  v_has_mine boolean;
  v_holder guesses%rowtype;
  v_has_holder boolean;
begin
  select * into v_glass from wines where id = p_wine_id;
  select * into v_tasting from tastings where id = v_glass.tasting_id;
  if v_tasting.reveal_mode is distinct from 'SEMI_BLIND' or v_tasting.status <> 'IN_PROGRESS' then
    raise exception 'matching is closed';
  end if;

  select id into v_pid from tasting_participants
   where tasting_id = v_tasting.id and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null
     or v_glass.contributor_participant_id is not distinct from v_pid
     or (v_tasting.wine_source = 'HOST_PROVIDES' and v_tasting.host_id = auth.uid())
     or v_glass.is_revealed or v_glass.reveal_step > 0 then
    raise exception 'you cannot match this glass';
  end if;

  select wine_id into v_candidate from semi_blind_candidate_keys
   where tasting_id = v_tasting.id and candidate_key = p_candidate_key;
  if v_candidate is null
     or exists (select 1 from wines where id = v_candidate
                and (is_revealed or contributor_participant_id = v_pid))
     or public.has_scored_guess(v_candidate) then          -- ASYNC IMMEDIATE: already proven (lane N's gate)
    raise exception 'that wine is not in your pool';
  end if;

  select * into v_mine from guesses
   where wine_id = p_wine_id and participant_id = v_pid for update;
  v_has_mine := found;
  if v_has_mine and (v_mine.locked_at is not null or v_mine.scored_at is not null) then
    raise exception 'this glass is locked in';
  end if;

  select * into v_holder from guesses
   where participant_id = v_pid and guessed_wine_id = v_candidate
     and scored_at is null and wine_id <> p_wine_id
   for update;
  v_has_holder := found;
  if v_has_holder and v_holder.locked_at is not null then
    raise exception 'glass locked' using detail = v_holder.wine_id::text;
  end if;

  -- Clear the holder, set this glass, then hand this glass's previous
  -- candidate to the holder: the unique index never sees a duplicate.
  if v_has_holder then
    update guesses set guessed_wine_id = null where id = v_holder.id;
  end if;
  insert into guesses (wine_id, participant_id, guessed_wine_id)
  values (p_wine_id, v_pid, v_candidate)
  on conflict (wine_id, participant_id) do update set guessed_wine_id = excluded.guessed_wine_id;
  if v_has_holder and v_has_mine and v_mine.guessed_wine_id is not null then
    update guesses set guessed_wine_id = v_mine.guessed_wine_id where id = v_holder.id;
  end if;

  return jsonb_build_object('glass', p_wine_id,
                            'swapped_with', case when v_has_holder then v_holder.wine_id end);
end $$;

-- The caller's own unlocked, unscored row on this glass loses its candidate.
create or replace function public.clear_semi_blind_match(p_wine_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_glass wines%rowtype;
  v_tasting tastings%rowtype;
  v_pid uuid;
  v_row guesses%rowtype;
begin
  select * into v_glass from wines where id = p_wine_id;
  select * into v_tasting from tastings where id = v_glass.tasting_id;
  if v_tasting.reveal_mode is distinct from 'SEMI_BLIND' or v_tasting.status <> 'IN_PROGRESS' then
    raise exception 'matching is closed';
  end if;
  select id into v_pid from tasting_participants
   where tasting_id = v_tasting.id and user_id = auth.uid() and status = 'JOINED';
  if v_pid is null or v_glass.is_revealed or v_glass.reveal_step > 0 then
    raise exception 'you cannot match this glass';
  end if;
  select * into v_row from guesses
   where wine_id = p_wine_id and participant_id = v_pid for update;
  if not found then
    return;
  end if;
  if v_row.locked_at is not null or v_row.scored_at is not null then
    raise exception 'this glass is locked in';
  end if;
  update guesses set guessed_wine_id = null where id = v_row.id;
end $$;

-- EXECUTE: authenticated only, never anon or PUBLIC (ensure_semi_blind_keys was
-- revoked from authenticated too, above).
revoke all on function public.can_see_semi_blind_list(uuid), public.get_semi_blind_candidates(uuid),
  public.get_semi_blind_board(uuid), public.get_semi_blind_revealed_picks(uuid),
  public.assign_semi_blind_match(uuid, text), public.clear_semi_blind_match(uuid)
  from public, anon;
grant execute on function public.can_see_semi_blind_list(uuid), public.get_semi_blind_candidates(uuid),
  public.get_semi_blind_board(uuid), public.get_semi_blind_revealed_picks(uuid),
  public.assign_semi_blind_match(uuid, text), public.clear_semi_blind_match(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Same-transaction assertions (never trust "version recorded").
-- ---------------------------------------------------------------------------
do $$
declare
  c_keys constant oid := 'public.semi_blind_candidate_keys'::regclass::oid;
  v_text text;
  v_n int;
begin
  -- 1. The key table: columns, primary key, unique key, cascades.
  select string_agg(format('%s %s %s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                           case when a.attnotnull then 'not null' else 'null' end,
                           case when a.atthasdef then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end),
                    '; ' order by a.attnum) into v_text
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = c_keys and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'wine_id uuid not null; tasting_id uuid not null; candidate_key text not null; created_at timestamp with time zone not null default now()' then
    raise exception 'semi_blind_candidate_keys columns differ: %', v_text;
  end if;

  select string_agg(format('%s %s %s %s', k.contype,
                           (select string_agg(a.attname::text, ',' order by a.attname::text) from pg_attribute a
                            where a.attrelid = k.conrelid and a.attnum = any (k.conkey)),
                           case when k.contype = 'f' then k.confrelid::text else '-' end,
                           case when k.contype = 'f' then k.confdeltype::text else '-' end),
                    '; ' order by k.contype, k.conname) into v_text
  from pg_constraint k
  where k.conrelid = c_keys and k.contype in ('p', 'u', 'f', 'c', 'x');
  if v_text is distinct from format('f tasting_id %s c; f wine_id %s c; p wine_id - -; u candidate_key,tasting_id - -',
                                    'public.tastings'::regclass::oid, 'public.wines'::regclass::oid) then
    raise exception 'semi_blind_candidate_keys constraints differ: %', v_text;
  end if;

  -- 2. RLS on with no policy, no trigger, and no privilege for anon, authenticated or PUBLIC.
  if not (select c.relrowsecurity from pg_class c where c.oid = c_keys) then
    raise exception 'row level security is not enabled on semi_blind_candidate_keys';
  end if;
  select count(*) into v_n from pg_policy pol where pol.polrelid = c_keys;
  if v_n <> 0 then
    raise exception 'semi_blind_candidate_keys has % policies; it must have none', v_n;
  end if;
  select count(*) into v_n from pg_trigger t where t.tgrelid = c_keys and not t.tgisinternal;
  if v_n <> 0 then
    raise exception 'semi_blind_candidate_keys has % triggers; it must have none', v_n;
  end if;
  select string_agg(format('%s:%s', r.rolname, p.priv), ', ' order by r.rolname, p.priv) into v_text
  from (values ('anon'), ('authenticated')) as r (rolname)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
  where has_table_privilege(r.rolname, c_keys, p.priv)
     or (p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and has_any_column_privilege(r.rolname, c_keys, p.priv));
  if v_text is not null then
    raise exception 'client roles hold privileges on semi_blind_candidate_keys: %', v_text;
  end if;
  if exists (select 1 from pg_class c, lateral aclexplode(c.relacl) x where c.oid = c_keys and x.grantee = 0)
     or exists (select 1 from pg_attribute a, lateral aclexplode(a.attacl) x
                where a.attrelid = c_keys and a.attnum > 0 and x.grantee = 0) then
    raise exception 'PUBLIC holds a privilege on semi_blind_candidate_keys';
  end if;
  if has_table_privilege('authenticated', 'public.semi_blind_candidate_keys', 'select') then
    raise exception 'authenticated can select semi_blind_candidate_keys';
  end if;

  -- 3. The seven functions: exactly these signatures, SECURITY DEFINER with
  --    search_path=public, the reviewed bodies (md5 of prosrc, CR-stripped), and
  --    EXECUTE for authenticated on six, on none for ensure_semi_blind_keys, never
  --    for anon or PUBLIC.
  select count(*) into v_n
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('ensure_semi_blind_keys', 'can_see_semi_blind_list', 'get_semi_blind_candidates',
                      'get_semi_blind_board', 'get_semi_blind_revealed_picks',
                      'assign_semi_blind_match', 'clear_semi_blind_match');
  if v_n <> 7 then
    raise exception 'expected exactly 7 semi-blind functions (no overloads), found %', v_n;
  end if;
  select string_agg(format('%s (md5 %s)', e.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ') into v_text
  from (values
    ('public.ensure_semi_blind_keys(uuid)', 'plpgsql', 'v', 'void', false, 'f273327676ea12d1ca7a8c652df2631e'),
    ('public.can_see_semi_blind_list(uuid)', 'sql', 's', 'boolean', true, '20e245ced9440ca7923e3ad248963a68'),
    ('public.get_semi_blind_candidates(uuid)', 'plpgsql', 'v', 'jsonb', true, 'ade50a9fd3932ba3bb261c01c6d9bfa9'),
    ('public.get_semi_blind_board(uuid)', 'plpgsql', 'v', 'jsonb', true, '1e698f9861ea5be71eec7c006ebbf72a'),
    ('public.get_semi_blind_revealed_picks(uuid)', 'plpgsql', 'v',
     'TABLE(glass_wine_id uuid, participant_id uuid, correct boolean, pick_key text, pick_label text)', true, '56d04f4187dd77489e83c5e23ab42a90'),
    ('public.assign_semi_blind_match(uuid,text)', 'plpgsql', 'v', 'jsonb', true, 'a258a91136470a3656736032e61d3c75'),
    ('public.clear_semi_blind_match(uuid)', 'plpgsql', 'v', 'void', true, '6e6b42bf8e626720829d79ae796c26e5')
  ) as e (sig, lang, vol, result, client_exec, src_md5)
  left join pg_proc p on p.oid = to_regprocedure(e.sig)
  left join pg_language l on l.oid = p.prolang
  where p.oid is null
     or l.lanname::text is distinct from e.lang
     or p.provolatile::text is distinct from e.vol
     or pg_get_function_result(p.oid) is distinct from e.result
     or not p.prosecdef
     or p.proconfig::text is distinct from '{search_path=public}'
     or md5(replace(p.prosrc, chr(13), '')) is distinct from e.src_md5
     or has_function_privilege('authenticated', p.oid, 'EXECUTE') is distinct from e.client_exec
     or has_function_privilege('anon', p.oid, 'EXECUTE')
     or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0);
  if v_text is not null then
    raise exception 'semi-blind functions differ from the reviewed shape, body or EXECUTE matrix: %', v_text;
  end if;

  -- 4. M8's writer list (20260914101500's pre-state check, same pattern): of the
  --    new functions only the two match RPCs insert into or update guesses.
  select string_agg(p.proname::text, ', ' order by p.proname::text) into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('ensure_semi_blind_keys', 'can_see_semi_blind_list', 'get_semi_blind_candidates',
                      'get_semi_blind_board', 'get_semi_blind_revealed_picks',
                      'assign_semi_blind_match', 'clear_semi_blind_match')
    and p.prosrc ~* '(insert\s+into|update)\s+(only\s+)?(public\.)?"?guesses"?\M';
  if v_text is distinct from 'assign_semi_blind_match, clear_semi_blind_match' then
    raise exception 'new functions writing guesses differ from the two match RPCs M8 names: %', v_text;
  end if;

  -- 5. Nothing deployed changed: the policies, grants and triggers of guesses,
  --    wine_answers, wines, tastings and tasting_participants, the snapshotted
  --    function bodies and ACLs, and no public function or relation beyond this file's.
  if exists (
    (select tablename, policyname, permissive, roles, cmd, qual, with_check from semi_blind_102500_policies
     except
     select pol.tablename::text, pol.policyname::text, pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check
     from pg_policies pol
     where pol.schemaname = 'public'
       and pol.tablename in ('guesses', 'wine_answers', 'wines', 'tastings', 'tasting_participants'))
    union all
    (select pol.tablename::text, pol.policyname::text, pol.permissive, pol.roles::text, pol.cmd, pol.qual, pol.with_check
     from pg_policies pol
     where pol.schemaname = 'public'
       and pol.tablename in ('guesses', 'wine_answers', 'wines', 'tastings', 'tasting_participants')
     except
     select tablename, policyname, permissive, roles, cmd, qual, with_check from semi_blind_102500_policies)
  ) then
    raise exception 'policies on guesses, wine_answers, wines, tastings or tasting_participants changed';
  end if;

  if exists (
    (select tbl, col, grantor, grantee, privilege_type, is_grantable from semi_blind_102500_acl
     except
     (select c.relname::text, a.attname::text, x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join lateral aclexplode(a.attacl) x
      where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                      'public.tastings'::regclass, 'public.tasting_participants'::regclass)
      union all
      select c.relname::text, '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c
      cross join lateral aclexplode(c.relacl) x
      where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                      'public.tastings'::regclass, 'public.tasting_participants'::regclass)))
    union all
    ((select c.relname::text, a.attname::text, x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      cross join lateral aclexplode(a.attacl) x
      where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                      'public.tastings'::regclass, 'public.tasting_participants'::regclass)
      union all
      select c.relname::text, '(table)', x.grantor, x.grantee, x.privilege_type, x.is_grantable
      from pg_class c
      cross join lateral aclexplode(c.relacl) x
      where c.oid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                      'public.tastings'::regclass, 'public.tasting_participants'::regclass))
     except
     select tbl, col, grantor, grantee, privilege_type, is_grantable from semi_blind_102500_acl)
  ) then
    raise exception 'table or column grants on guesses, wine_answers, wines, tastings or tasting_participants changed';
  end if;

  if exists (
    (select tbl, tgname, tgenabled, tgtype, tgfoid, def from semi_blind_102500_triggers
     except
     select c.relname::text, t.tgname::text, t.tgenabled, t.tgtype, t.tgfoid, pg_get_triggerdef(t.oid)
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgrelid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                         'public.tastings'::regclass, 'public.tasting_participants'::regclass)
       and not t.tgisinternal)
    union all
    (select c.relname::text, t.tgname::text, t.tgenabled, t.tgtype, t.tgfoid, pg_get_triggerdef(t.oid)
     from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgrelid in ('public.guesses'::regclass, 'public.wine_answers'::regclass, 'public.wines'::regclass,
                         'public.tastings'::regclass, 'public.tasting_participants'::regclass)
       and not t.tgisinternal
     except
     select tbl, tgname, tgenabled, tgtype, tgfoid, def from semi_blind_102500_triggers)
  ) then
    raise exception 'triggers on guesses, wine_answers, wines, tastings or tasting_participants changed';
  end if;

  select string_agg(b.sig, ', ') into v_text
  from semi_blind_102500_functions b
  left join pg_proc p on p.oid = to_regprocedure(b.sig)
  where p.oid is distinct from b.oid
     or md5(replace(p.prosrc, chr(13), '')) is distinct from b.src_md5
     or p.proacl::text is distinct from b.acl
     or p.prosecdef is distinct from b.prosecdef
     or p.proconfig::text is distinct from b.config;
  if v_text is not null then
    raise exception 'functions changed post-migration: %', v_text;
  end if;

  if (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace)
       <> (select functions + 7 from semi_blind_102500_counts)
     or (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace)
       <> (select relations + 3 from semi_blind_102500_counts) then
    raise exception 'public functions or relations changed beyond the seven functions, the key table and its two indexes';
  end if;
end $$;

drop table semi_blind_102500_policies;
drop table semi_blind_102500_acl;
drop table semi_blind_102500_triggers;
drop table semi_blind_102500_functions;
drop table semi_blind_102500_counts;
