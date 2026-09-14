-- M9b semi_blind_lockdown: the permutation's invariant, the pool release, the
-- flight fixed at Start, guessed_wine_id out of the client roles, and the
-- narrowed "wine_answers read".
--
-- Blind-tasting v3, plan task BT-SQL10 (refinement 1: M9 ships as M9a + M9b):
-- spec docs/superpowers/specs/2026-09-12-blind-tasting-v3-design.md §10.4 (d),
-- (e) and (f), §15 M9 (second half), §16.1 rows 22-23, §16.2 rows 1-3 (the read
-- half); ledger B9 (the permutation, the pool release) and Q7 (a semi-blind
-- flight is fixed at Start). The four SQL blocks below are the spec's, byte for
-- byte; the recreate of assign_semi_blind_match after them is BT-SQL10 review
-- round 1's (not in the spec yet).
--
-- Written against the LIVE state (read-only dump
-- .superpowers/blind-tasting/probes/20260914103500-live-defs.sql, 2026-09-14;
-- live tail 20260914121417; blind-tasting M1-M7 and M9a applied, M8 not):
-- * no participant holds one candidate on two unscored glasses (0 rows);
-- * "wine_answers read" is the dumped text (md5 dabdc0e3b678ed52b96d817c5cf9c242):
--   its host clause is t.host_id = auth.uid() alone, and its semi-blind clause
--   goes through is_tasting_participant (any participant row, INVITED and
--   DECLINED included); "wine_answers insert" and "wine_answers update" are M6's;
-- * guesses: anon and authenticated hold table-level SELECT (with DELETE,
--   TRUNCATE, REFERENCES, TRIGGER and MAINTAIN) and no table-level INSERT or
--   UPDATE; authenticated holds INSERT and UPDATE on the 14 client columns of
--   20260912093000 and no column-level SELECT; guesses has exactly 28 columns;
-- * wines.added_by_host exists (M6; wines_pin_adder owns it);
-- * semi_blind_candidate_keys, assign_semi_blind_match and
--   clear_semi_blind_match exist (M9a);
-- * reveal_wine scores the glass's rows first and then sets wines.is_revealed.
-- M8 (20260914101500_guess_lock_pin) applies behind its own deploy gate, after
-- M9a and before this file (plan refinement 24; BT-M9b gate check 4). This file
-- fails closed without it.
--
-- What it does.
-- (d) guesses_one_open_glass_per_candidate: one open (unscored) glass per
--     candidate per participant. semi_blind_release_revealed_wine (AFTER UPDATE
--     OF is_revealed on wines): once a semi-blind glass is revealed, every
--     unscored guess holding that wine on another unrevealed glass of the
--     tasting loses the candidate and its lock, in one statement. reveal_wine
--     scores the revealed glass's rows before it flips is_revealed, so the
--     release runs after the scoring, in the same transaction; reveal_wine and
--     score_own_guess are not recreated. wines_semi_blind_flight_locked (BEFORE
--     INSERT on wines): no glass is inserted into a semi-blind tasting that has
--     left DRAFT, whatever the role (M6 already refuses removal and provenance).
--     It reads the tasting row FOR SHARE, by id alone, and tests the row it locked
--     (BT-V3 A-10): Start's UPDATE of tastings conflicts with that lock, so an insert
--     racing Start waits for Start's commit and then reads the started status. A
--     plain read would see the committed DRAFT row and let the glass in (the foreign
--     key's KEY SHARE does not conflict with Start), and a status filter in the
--     locking query would skip that DRAFT row without waiting.
--     Both trigger functions get no client EXECUTE, as M4, M6 and M7 do for
--     theirs (a trigger fires without it).
-- (e) guessed_wine_id leaves the client roles: no INSERT or UPDATE of it, and
--     SELECT on guesses narrows to the other 27 columns for authenticated (anon:
--     none). Semi-blind picks go through assign_semi_blind_match and
--     clear_semi_blind_match (M9a, SECURITY DEFINER) and are read back as keys.
-- (f) "wine_answers read" recreated from the live text with exactly two edits:
--     the semi-blind participant clause is gone, and the host clause carries
--     w.added_by_host.
-- (review) assign_semi_blind_match (M9a) recreated from the live body with two
--     edits (BT-SQL10 review round 1; rule 1) and a third (BT-V3 A-11). The function runs as its owner,
--     postgres, which owns guesses and bypasses RLS, so a unique violation raised
--     inside it carries Postgres's DETAIL "Key (participant_id, guessed_wine_id)=
--     (<participant>, <candidate wine id>) already exists.", and PostgREST returns
--     DETAIL to any caller of rpc/assign_semi_blind_match: an opaque candidate key
--     mapped to an unrevealed wine id, while wines exposes (id, position). The index
--     above is reachable from two overlapping calls of one participant: both read
--     no committed holder (two calls placing one candidate), or the second waits on
--     a swap in progress and its re-checked holder no longer matches.
--     1. Right after the caller's JOINED participant row is resolved, and before
--        any guesses read, pg_advisory_xact_lock(hashtext('public.assign_semi_blind_match'),
--        hashtext(v_pid::text)) runs one participant's calls one at a time: an
--        overlapping call reads the committed rows and swaps. An advisory lock,
--        not a row lock on tasting_participants: nothing else takes it, so it
--        cannot deadlock with a writer that locks the participant's guesses and
--        then the participant row (the order a tasting delete's cascades can take).
--     2. The three writes sit in a block that re-raises a unique violation with its
--        SQLSTATE (23505, which assignMatch retries once), message and constraint,
--        and without its DETAIL, for any writer that does not take the lock.
--     3. BT-V3 A-11: right after the candidate key resolves, and before any guesses
--        lock, the candidate's glass is read FOR SHARE by id, and its is_revealed
--        and contributor are tested on the row it locked. reveal_wine's UPDATE of
--        is_revealed conflicts with that lock both ways: a match racing the reveal
--        waits and then reads the glass revealed ("that wine is not in your pool"),
--        and a reveal racing a match waits for the match's commit, so the pool
--        release (a later statement) sees the new pick and clears it. Without the
--        lock both orders leave an open pick on a revealed wine (race rows R9, R10).
--        This order (wines, then guesses) is the one reveal_next_category takes, so
--        the two never deadlock. reveal_wine takes the opposite order (it scores the
--        glass's guesses, then flips wines), which leaves one rare deadlock: when the
--        caller's own row on the candidate's glass is the holder (or is the glass
--        being matched), reveal_wine can lock that row after the match took the share
--        lock and before the match reaches the row. Postgres aborts one side with
--        40P01; either may be the victim, and one retry of the victim restores the
--        invariant (race row R11). assignMatch retries 40P01 once; the reveal paths
--        do not retry.
--
-- The lock pin (M8). The pool release is a fifth writer of guesses: it runs as
-- the owner inside the reveal's client request, so the pin binds it, and it
-- passes because it sets locked_at to null in the same statement (the pin only
-- refuses a change while old.locked_at and new.locked_at are both set). It
-- touches only rows on unrevealed glasses, so guesses_block_after_reveal passes.
--
-- Security (rule 1; spec §16.1 rows 22-23, §16.2). No payload maps a candidate
-- to an unrevealed wine's id any more: guesses stops exposing guessed_wine_id,
-- and a participant no longer reads other glasses' answer keys through the
-- semi-blind clause (get_semi_blind_candidates replaces it). A bring-your-own
-- host no longer reads contributors' hidden answer keys, and nulling or deleting
-- a contributor's participant row does not win them back: added_by_host is
-- trigger-owned. The raw exists over wines / tastings / tasting_participants is
-- the live policy's, kept word for word; this recreate adds no cross-table check.
--
-- Deploy gate (BT-M9b): production runs the explicit guesses column lists
-- (BT-S5), the RPC-based semi-blind UI (BT-S2, BT-S3, BT-S4) and the host console
-- on get_wine_reveal (BT-H2) before this file applies. guesses is in the
-- supabase_realtime publication: BT-M9b checks that RevealSync still receives
-- guesses changes after the SELECT narrowing (spec §10.4 (e); BT-S6 if not).
--
-- No begin/commit: the applier owns the transaction. Temp tables carry the
-- pre-migration state into the post-state assertions and are dropped at the end.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-migration snapshot of everything this file must leave alone.
-- ---------------------------------------------------------------------------
create temp table semi_blind_103500_functions as
select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
       p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile
from pg_proc p
where p.pronamespace = 'public'::regnamespace;

create temp table semi_blind_103500_policies as
select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
       pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
from pg_policies pol
where pol.schemaname = 'public';

create temp table semi_blind_103500_triggers as
select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
       pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;

create temp table semi_blind_103500_acl as
select c.relname::text as tbl, a.attname::text as col, x.grantee, x.privilege_type, x.is_grantable
from pg_class c
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) x
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
union all
select c.relname::text, '(table)', x.grantee, x.privilege_type, x.is_grantable
from pg_class c
cross join lateral aclexplode(c.relacl) x
where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S');

create temp table semi_blind_103500_counts as
select (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace) as functions,
       (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace) as relations;

-- Fail closed unless the live objects are the ones this file was written against.
do $$
declare
  c_guesses constant oid := 'public.guesses'::regclass::oid;
  c_anon constant oid := 'anon'::regrole::oid;
  c_authenticated constant oid := 'authenticated'::regrole::oid;
  -- 20260912093000's client columns: INSERT and UPDATE for authenticated.
  c_client_columns constant text[] := array[
    'wine_id', 'participant_id',
    'country_id', 'region_id', 'appellation_id', 'primary_grape_id', 'secondary_grape_id',
    'producer_id', 'type_designation_id', 'vintage_kind', 'vintage_year', 'vintage_tawny_years',
    'guessed_wine_id', 'locked_at'];
  -- Every guesses column, in attnum order.
  c_all_columns constant text[] := array[
    'id', 'wine_id', 'participant_id',
    'country_id', 'region_id', 'appellation_id', 'primary_grape_id', 'secondary_grape_id',
    'producer_id', 'type_designation_id', 'vintage_kind', 'vintage_year', 'vintage_tawny_years',
    'country_points', 'region_points', 'appellation_points', 'primary_grape_points',
    'secondary_grape_points', 'producer_points', 'type_designation_points', 'vintage_points',
    'total_points', 'scored_at', 'submitted_at', 'updated_at', 'guessed_wine_id', 'reveal_step', 'locked_at'];
  v_text text;
  v_n int;
begin
  -- 1. Nothing of this file exists yet (create or replace would silently replace a function).
  if to_regclass('public.guesses_one_open_glass_per_candidate') is not null
     or to_regprocedure('public.semi_blind_release_revealed_wine()') is not null
     or to_regprocedure('public.wines_semi_blind_flight_locked()') is not null
     or exists (select 1 from pg_trigger t
                where t.tgrelid = 'public.wines'::regclass
                  and t.tgname in ('semi_blind_release_revealed_wine', 'wines_semi_blind_flight_locked')) then
    raise exception 'an object of 20260914103500_semi_blind_lockdown already exists';
  end if;

  -- 2. M8 first: the pool release clears locked rows, so the reviewed lock pin
  --    (20260914101500's c_body_md5) must be the one it passes.
  if not exists (
       select 1 from pg_proc p
       where p.oid = to_regprocedure('public.guesses_refuse_locked_edit()')
         and md5(replace(p.prosrc, chr(13), '')) = 'da49ce8d922eaa39c5c12367e5921494')
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid = c_guesses and t.tgname = 'guesses_refuse_locked_edit' and not t.tgisinternal
         and t.tgenabled = 'O' and t.tgtype = 19
         and t.tgfoid = to_regprocedure('public.guesses_refuse_locked_edit()')::oid) then
    raise exception 'guesses_refuse_locked_edit (M8) is missing or not the reviewed pin: apply 20260914101500_guess_lock_pin first';
  end if;

  -- 3. M6 and M9a first.
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host'
      and a.atttypid = 'boolean'::regtype and a.attnotnull and not a.attisdropped
  ) then
    raise exception 'wines.added_by_host (boolean not null) is missing: apply 20260914095500_flight_edits_until_first_step (M6) first';
  end if;
  if to_regclass('public.semi_blind_candidate_keys') is null
     or to_regprocedure('public.assign_semi_blind_match(uuid,text)') is null
     or to_regprocedure('public.clear_semi_blind_match(uuid)') is null then
    raise exception 'the semi-blind RPCs are missing: apply 20260914102500_semi_blind_rpcs (M9a) first';
  end if;

  -- 4. The live bodies this file's reasoning relies on (md5 of prosrc, CR-stripped):
  --    the four scoring writers (reveal_wine scores before it flips is_revealed);
  --    the guesses triggers the release passes; the trigger that owns
  --    added_by_host; M9a's two match RPCs, which write guessed_wine_id as the
  --    owner and clear a holder before they set a candidate; the policy's first
  --    clause; the two helpers the guesses write policies call.
  select string_agg(e.sig, ', ') into v_text
  from (values
    ('public.reveal_wine(uuid)', '13923813da0f470fe2d1ffd3ac445625'),
    ('public.score_own_guess(uuid)', 'f7acab278d1a88558b1e35b4370e72e4'),
    ('public.reveal_next_category(uuid,smallint)', '6a08183662534db0d212b2412d729ac2'),
    ('public.reveal_own_next_category(uuid,smallint)', '7ed3b1d262563ee6e699ced8c2811f87'),
    ('public.block_guess_writes_after_reveal()', 'fba41add347849171c6ca24a10b26abd'),
    ('public.pin_guess_identity()', 'fd9130fc22af9fd6aaeb0b769c3a3c4d'),
    ('public.wines_pin_adder()', 'cdf869a9016452c49640bfba9fba2ff5'),
    ('public.assign_semi_blind_match(uuid,text)', 'a258a91136470a3656736032e61d3c75'),
    ('public.clear_semi_blind_match(uuid)', '6e6b42bf8e626720829d79ae796c26e5'),
    ('public.has_scored_guess(uuid)', '5099c6403210215615be08022bc621fe'),
    ('public.is_open_guess_target(uuid,uuid,uuid)', 'dfbed5b97a55c3f8a65c3604a0ad5861'),
    ('public.is_own_joined_participant_for_wine(uuid,uuid)', '00bef75b74a95bb970625ff43ff85736')
  ) as e (sig, src_md5)
  left join pg_proc p on p.oid = to_regprocedure(e.sig)
  where p.oid is null or md5(replace(p.prosrc, chr(13), '')) is distinct from e.src_md5;
  if v_text is not null then
    raise exception 'functions differ from the live bodies this migration was written against: %', v_text;
  end if;

  -- 5. The functions that insert into or update guesses are M8's verified list:
  --    the four scoring writers and M9a's two RPCs (20260914101500's pattern).
  select string_agg(format('%s.%s', n.nspname, p.proname), ', ' order by format('%s.%s', n.nspname, p.proname) collate "C")
    into v_text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '(insert\s+into|update)\s+(only\s+)?(public\.)?"?guesses"?\M';
  if v_text is distinct from 'public.assign_semi_blind_match, public.clear_semi_blind_match, public.reveal_next_category, public.reveal_own_next_category, public.reveal_wine, public.score_own_guess' then
    raise exception 'the functions that write guesses are not M8''s verified list: %', v_text;
  end if;

  -- 6. The policy this file recreates, exactly as dumped, and the wine_answers
  --    policy set around it (a second permissive SELECT policy would keep what
  --    this file removes). RLS stays on for both tables.
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'wine_answers';
  if v_text is distinct from 'wine_answers insert|INSERT|{authenticated}|PERMISSIVE|-|8f590b9d5d338417fe6b882507446975; wine_answers read|SELECT|{authenticated}|PERMISSIVE|dabdc0e3b678ed52b96d817c5cf9c242|-; wine_answers update|UPDATE|{authenticated}|PERMISSIVE|8f590b9d5d338417fe6b882507446975|8f590b9d5d338417fe6b882507446975' then
    raise exception 'the wine_answers policies are not the live set this migration was written against: %', v_text;
  end if;
  select count(*) into v_n
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers read'
    and array_length(string_to_array(p.qual, '(t.host_id = auth.uid()) OR w.is_revealed OR (p.user_id = auth.uid()) OR ((t.reveal_mode = ''SEMI_BLIND''::reveal_mode_type) AND is_tasting_participant(t.id))'), 1) = 2;
  if v_n <> 1 then
    raise exception '"wine_answers read" does not carry the live host / revealed / contributor / semi-blind clause exactly once';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.wine_answers'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = c_guesses) then
    raise exception 'row level security is not enabled on wine_answers or guesses';
  end if;

  -- 7. guesses privileges as 20260912093000 left them: the grants this file narrows.
  select count(*) into v_n
  from pg_attribute a
  where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped;
  if v_n <> 28
     or (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
         where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped) is distinct from c_all_columns then
    raise exception 'guesses does not have exactly the 28 columns the SELECT grant list was written against';
  end if;
  if (select c.relacl::text from pg_class c where c.oid = c_guesses)
       is distinct from '{postgres=arwdDxtm/postgres,anon=rdDxtm/postgres,authenticated=rdDxtm/postgres,service_role=arwdDxtm/postgres}' then
    raise exception 'the guesses table ACL is not the live one this migration was written against: %',
      (select c.relacl::text from pg_class c where c.oid = c_guesses);
  end if;
  select string_agg(format('%s:%s:%s:%s', a.attname, x.grantee::regrole, x.privilege_type, x.is_grantable), ', ') into v_text
  from pg_attribute a
  cross join lateral aclexplode(a.attacl) x
  where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
    and not (x.grantee = c_authenticated and x.privilege_type in ('INSERT', 'UPDATE') and not x.is_grantable
             and a.attname::text = any (c_client_columns));
  if v_text is not null then
    raise exception 'unexpected column grants on guesses: %', v_text;
  end if;
  if (select count(*) from pg_attribute a cross join lateral aclexplode(a.attacl) x
      where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
        and x.grantee = c_authenticated and x.privilege_type = 'INSERT') <> 14
     or (select count(*) from pg_attribute a cross join lateral aclexplode(a.attacl) x
         where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
           and x.grantee = c_authenticated and x.privilege_type = 'UPDATE') <> 14
     or not has_table_privilege(c_anon, c_guesses, 'SELECT')
     or not has_table_privilege(c_authenticated, c_guesses, 'SELECT') then
    raise exception 'authenticated does not hold INSERT and UPDATE on exactly the 14 client columns, or a client role lacks table-level SELECT on guesses';
  end if;

  -- 8. No participant holds one candidate on two unscored glasses (the unique index needs it).
  select count(*) into v_n
  from (select 1 from public.guesses
        where guessed_wine_id is not null and scored_at is null
        group by participant_id, guessed_wine_id
        having count(*) > 1) d;
  if v_n <> 0 then
    raise exception 'duplicate open holdings: % (participant, candidate) pairs hold one candidate on two unscored glasses; clean them up first', v_n;
  end if;

  -- 9. The columns and enum labels the new objects name, and the triggers they join.
  select string_agg(format('%s.%s', e.tbl, e.col), ', ') into v_text
  from (values
    ('guesses', 'wine_id', 'uuid'), ('guesses', 'participant_id', 'uuid'), ('guesses', 'guessed_wine_id', 'uuid'),
    ('guesses', 'scored_at', 'timestamp with time zone'), ('guesses', 'locked_at', 'timestamp with time zone'),
    ('wines', 'id', 'uuid'), ('wines', 'tasting_id', 'uuid'), ('wines', 'is_revealed', 'boolean'),
    ('wines', 'contributor_participant_id', 'uuid'),
    ('tastings', 'id', 'uuid'), ('tastings', 'host_id', 'uuid'),
    ('tastings', 'reveal_mode', 'public.reveal_mode_type'), ('tastings', 'status', 'public.tasting_status'),
    ('tasting_participants', 'id', 'uuid'), ('tasting_participants', 'user_id', 'uuid'),
    ('wine_answers', 'wine_id', 'uuid')
  ) as e (tbl, col, typ)
  left join pg_attribute a
    on a.attrelid = to_regclass('public.' || e.tbl) and a.attname = e.col
   and a.attnum > 0 and not a.attisdropped
  where a.attnum is null or a.atttypid is distinct from to_regtype(e.typ)::oid;
  if v_text is not null then
    raise exception 'columns the new objects use are missing or retyped: %', v_text;
  end if;
  if not exists (select 1 from pg_enum x where x.enumtypid = 'public.reveal_mode_type'::regtype and x.enumlabel = 'SEMI_BLIND')
     or not exists (select 1 from pg_enum x where x.enumtypid = 'public.tasting_status'::regtype and x.enumlabel = 'DRAFT') then
    raise exception 'enum labels SEMI_BLIND or DRAFT missing';
  end if;
  select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C") into v_text
  from pg_trigger t where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal;
  if v_text is distinct from 'trg_catalog_wine_unmark_blind,wines_drop_unresolved_notes,wines_full_reveal_step,wines_pin_adder,wines_refuse_reveal_while_paused,wines_stamp_revealed_at,wset_notes_resolve_on_reveal' then
    raise exception 'wines triggers differ from the live set this migration was written against: %', v_text;
  end if;
  select string_agg(t.tgname::text, ',' order by t.tgname::text collate "C") into v_text
  from pg_trigger t where t.tgrelid = c_guesses and not t.tgisinternal;
  if v_text is distinct from 'guesses_block_after_reveal,guesses_pin_identity,guesses_refuse_locked_edit,guesses_set_updated_at' then
    raise exception 'guesses triggers differ from the live set plus M8 this migration was written against: %', v_text;
  end if;
end $$;

-- ===========================================================================
-- Spec §10.4 (d) The permutation's invariant and the pool release, verbatim.
-- ===========================================================================
-- Pre-assert first: no participant holds one candidate on two unscored glasses (live data).
create unique index guesses_one_open_glass_per_candidate
  on public.guesses (participant_id, guessed_wine_id)
  where guessed_wine_id is not null and scored_at is null;

create or replace function public.semi_blind_release_revealed_wine()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from tastings t
             where t.id = new.tasting_id and t.reveal_mode = 'SEMI_BLIND') then
    update guesses g
       set guessed_wine_id = null,
           locked_at = null
      from wines w
     where w.id = g.wine_id
       and w.tasting_id = new.tasting_id
       and g.wine_id <> new.id
       and g.guessed_wine_id = new.id
       and not w.is_revealed
       and g.scored_at is null;
  end if;
  return null;
end $$;
create trigger semi_blind_release_revealed_wine
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.semi_blind_release_revealed_wine();

-- A semi-blind flight is fixed at Start: no glass is inserted into a started
-- semi-blind tasting (§10.3 item 7). M6's helpers refuse removal and provenance.
create or replace function public.wines_semi_blind_flight_locked()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode reveal_mode_type;
  v_status tasting_status;
begin
  -- Lock the tasting row by id, then test it (BT-V3 A-10): an insert racing Start
  -- waits for Start's commit and reads the started status. A status filter in this
  -- query would skip the committed DRAFT row without waiting.
  select t.reveal_mode, t.status into v_mode, v_status
    from tastings t
   where t.id = new.tasting_id
     for share;
  if v_mode = 'SEMI_BLIND' and v_status <> 'DRAFT' then
    raise exception 'a semi-blind flight is fixed once the tasting starts'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger wines_semi_blind_flight_locked
  before insert on public.wines
  for each row execute function public.wines_semi_blind_flight_locked();

-- The two functions run only as triggers: no client EXECUTE (M4, M6 and M7 do the
-- same for theirs).
revoke all on function public.semi_blind_release_revealed_wine(), public.wines_semi_blind_flight_locked()
  from public, anon, authenticated;

-- ===========================================================================
-- Spec §10.4 (e) guesses.guessed_wine_id leaves the client roles, verbatim.
-- ===========================================================================
revoke insert (guessed_wine_id), update (guessed_wine_id) on public.guesses from anon, authenticated;
revoke select on public.guesses from anon, authenticated;
grant select (id, wine_id, participant_id,
              country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id,
              producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years,
              country_points, region_points, appellation_points, primary_grape_points,
              secondary_grape_points, producer_points, type_designation_points, vintage_points,
              total_points, scored_at, submitted_at, updated_at, reveal_step, locked_at)
  on public.guesses to authenticated;

-- ===========================================================================
-- Spec §10.4 (f) "wine_answers read", recreated from live, verbatim.
-- ===========================================================================
drop policy "wine_answers read" on public.wine_answers;
create policy "wine_answers read" on public.wine_answers
  for select to authenticated
  using (
    has_scored_guess(wine_id)
    or exists (
      select 1
      from wines w
      join tastings t on t.id = w.tasting_id
      left join tasting_participants p on p.id = w.contributor_participant_id
      where w.id = wine_answers.wine_id
        and (
          (t.host_id = auth.uid() and w.added_by_host)                       -- the host: glasses the host added (M6's pinned flag)
          or w.is_revealed
          or p.user_id = auth.uid()                                          -- the contributor: their own
        )
    )
  );

-- ===========================================================================
-- BT-SQL10 review round 1 (rule 1) and BT-V3 A-11: assign_semi_blind_match recreated
-- from live (md5 a258a91136470a3656736032e61d3c75, 20260914103500-live-defs.sql) with
-- the three edits the header describes; the rest of the body is unchanged. create or replace
-- keeps its owner and its EXECUTE grants (authenticated only).
-- ===========================================================================
create or replace function public.assign_semi_blind_match(p_wine_id uuid, p_candidate_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_glass wines%rowtype;
  v_tasting tastings%rowtype;
  v_pid uuid;
  v_candidate uuid;
  v_cand wines%rowtype;
  v_mine guesses%rowtype;
  v_has_mine boolean;
  v_holder guesses%rowtype;
  v_has_holder boolean;
  v_message text;
  v_constraint text;
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

  -- One participant's calls run one at a time (BT-SQL10 review round 1): an
  -- overlapping call waits here, then reads this call's committed rows below.
  perform pg_advisory_xact_lock(hashtext('public.assign_semi_blind_match'), hashtext(v_pid::text));

  select wine_id into v_candidate from semi_blind_candidate_keys
   where tasting_id = v_tasting.id and candidate_key = p_candidate_key;
  -- Lock the candidate's glass by id before any guesses lock, then test that row
  -- (BT-V3 A-11): a match racing the glass's reveal waits here and reads it
  -- revealed, and a reveal racing this match waits for its commit, so the pool
  -- release sees the pick.
  select * into v_cand from wines where id = v_candidate for share;
  if v_candidate is null
     or v_cand.is_revealed
     or v_cand.contributor_participant_id = v_pid
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
  -- candidate to the holder: under the lock above the unique index never sees a
  -- duplicate. Should a writer outside that lock race one in, the violation leaves
  -- without its DETAIL, which would print the candidate's wine id (review round 1).
  begin
    if v_has_holder then
      update guesses set guessed_wine_id = null where id = v_holder.id;
    end if;
    insert into guesses (wine_id, participant_id, guessed_wine_id)
    values (p_wine_id, v_pid, v_candidate)
    on conflict (wine_id, participant_id) do update set guessed_wine_id = excluded.guessed_wine_id;
    if v_has_holder and v_has_mine and v_mine.guessed_wine_id is not null then
      update guesses set guessed_wine_id = v_mine.guessed_wine_id where id = v_holder.id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_message = message_text, v_constraint = constraint_name;
    raise exception using errcode = 'unique_violation', message = v_message, constraint = v_constraint;
  end;

  return jsonb_build_object('glass', p_wine_id,
                            'swapped_with', case when v_has_holder then v_holder.wine_id end);
end $$;

-- ---------------------------------------------------------------------------
-- Same-transaction assertions (never trust "version recorded").
-- ---------------------------------------------------------------------------
do $$
declare
  c_guesses constant oid := 'public.guesses'::regclass::oid;
  c_wines constant oid := 'public.wines'::regclass::oid;
  c_keys constant oid := 'public.semi_blind_candidate_keys'::regclass::oid;
  c_anon constant oid := 'anon'::regrole::oid;
  c_authenticated constant oid := 'authenticated'::regrole::oid;
  -- The one clause spec §10.4 (f) edits, as Postgres prints it before and after.
  c_old_clause constant text := '(t.host_id = auth.uid()) OR w.is_revealed OR (p.user_id = auth.uid()) OR ((t.reveal_mode = ''SEMI_BLIND''::reveal_mode_type) AND is_tasting_participant(t.id))';
  c_new_clause constant text := '((t.host_id = auth.uid()) AND w.added_by_host) OR w.is_revealed OR (p.user_id = auth.uid())';
  -- Spec §10.4 (e): the 27 columns authenticated may select ...
  c_read_columns constant text[] := array[
    'id', 'wine_id', 'participant_id',
    'country_id', 'region_id', 'appellation_id', 'primary_grape_id', 'secondary_grape_id',
    'producer_id', 'type_designation_id', 'vintage_kind', 'vintage_year', 'vintage_tawny_years',
    'country_points', 'region_points', 'appellation_points', 'primary_grape_points',
    'secondary_grape_points', 'producer_points', 'type_designation_points', 'vintage_points',
    'total_points', 'scored_at', 'submitted_at', 'updated_at', 'reveal_step', 'locked_at'];
  -- ... and the 13 it may still insert and update (20260912093000's 14 without guessed_wine_id).
  c_write_columns constant text[] := array[
    'wine_id', 'participant_id',
    'country_id', 'region_id', 'appellation_id', 'primary_grape_id', 'secondary_grape_id',
    'producer_id', 'type_designation_id', 'vintage_kind', 'vintage_year', 'vintage_tawny_years',
    'locked_at'];
  v_release oid := to_regprocedure('public.semi_blind_release_revealed_wine()')::oid;
  v_locked oid := to_regprocedure('public.wines_semi_blind_flight_locked()')::oid;
  v_assign oid := to_regprocedure('public.assign_semi_blind_match(uuid,text)')::oid;
  v_pre_qual text;
  v_qual text;
  v_text text;
  v_lost int;
  v_gained int;
begin
  -- 1. The index: spec §10.4 (d)'s partial unique index on guesses, valid.
  if not exists (
    select 1 from pg_index i
    where i.indexrelid = to_regclass('public.guesses_one_open_glass_per_candidate')
      and i.indrelid = c_guesses and i.indisunique and i.indisvalid and i.indisready
      and not i.indisprimary and i.indnatts = 2 and i.indnkeyatts = 2
      and pg_get_indexdef(i.indexrelid) = 'CREATE UNIQUE INDEX guesses_one_open_glass_per_candidate ON public.guesses USING btree (participant_id, guessed_wine_id) WHERE ((guessed_wine_id IS NOT NULL) AND (scored_at IS NULL))'
  ) then
    raise exception 'guesses_one_open_glass_per_candidate is missing or not the spec §10.4 (d) partial unique index: %',
      pg_get_indexdef(to_regclass('public.guesses_one_open_glass_per_candidate'));
  end if;

  -- 2. The two trigger functions: plpgsql, SECURITY DEFINER with search_path=public,
  --    returning trigger, the bodies above (md5 of prosrc, CR-stripped: the spec's,
  --    with BT-V3 A-10's row lock in the flight lock), and no EXECUTE for anon,
  --    authenticated or PUBLIC.
  select string_agg(format('%s (md5 %s)', e.sig, coalesce(md5(replace(p.prosrc, chr(13), '')), 'missing')), '; ') into v_text
  from (values
    ('public.semi_blind_release_revealed_wine()', 'f2b99368997eaa08944e7d31943ed12a'),
    ('public.wines_semi_blind_flight_locked()', 'c9f1ab6235ebcc2300f1da58c2561681')
  ) as e (sig, src_md5)
  left join pg_proc p on p.oid = to_regprocedure(e.sig)
  left join pg_language l on l.oid = p.prolang
  where p.oid is null
     or l.lanname::text is distinct from 'plpgsql'
     or not p.prosecdef
     or p.proconfig::text is distinct from '{search_path=public}'
     or p.prorettype <> 'trigger'::regtype
     or p.pronargs <> 0
     or md5(replace(p.prosrc, chr(13), '')) is distinct from e.src_md5
     or has_function_privilege(c_authenticated, p.oid, 'EXECUTE')
     or has_function_privilege(c_anon, p.oid, 'EXECUTE')
     or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0);
  if v_text is not null then
    raise exception 'the trigger functions differ from the spec §10.4 (d) shape, body or EXECUTE matrix: %', v_text;
  end if;

  -- 2b. assign_semi_blind_match (review round 1, BT-V3 A-11): the live body with the three
  --     edits (md5 of prosrc, CR-stripped); still plpgsql SECURITY DEFINER with
  --     search_path=public returning jsonb, EXECUTE for authenticated and never for anon
  --     or PUBLIC; the advisory lock, then the candidate's FOR SHARE read, both before the
  --     first guesses read; the DETAIL-free unique violation.
  select format('md5 %s, lock at %s, candidate lock at %s, first guesses read at %s, handler at %s, secdef %s, config %s, auth %s, anon %s',
                md5(replace(p.prosrc, chr(13), '')), strpos(p.prosrc, 'perform pg_advisory_xact_lock(hashtext(''public.assign_semi_blind_match''), hashtext(v_pid::text));'),
                strpos(p.prosrc, 'select * into v_cand from wines where id = v_candidate for share;'),
                strpos(p.prosrc, 'from guesses'), strpos(p.prosrc, 'exception when unique_violation then'),
                p.prosecdef, p.proconfig::text, has_function_privilege(c_authenticated, p.oid, 'EXECUTE'),
                has_function_privilege(c_anon, p.oid, 'EXECUTE'))
    into v_text
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = v_assign
    and not (l.lanname = 'plpgsql' and p.prosecdef and p.proconfig::text = '{search_path=public}'
             and p.prorettype = 'jsonb'::regtype
             and md5(replace(p.prosrc, chr(13), '')) = '16728c8b25d8c3dee5e221cca26491ec'
             and strpos(p.prosrc, 'perform pg_advisory_xact_lock(hashtext(''public.assign_semi_blind_match''), hashtext(v_pid::text));') > 0
             and strpos(p.prosrc, 'perform pg_advisory_xact_lock(hashtext(''public.assign_semi_blind_match''), hashtext(v_pid::text));')
                 < strpos(p.prosrc, 'select * into v_cand from wines where id = v_candidate for share;')
             and strpos(p.prosrc, 'select * into v_cand from wines where id = v_candidate for share;') < strpos(p.prosrc, 'from guesses')
             and strpos(p.prosrc, 'exception when unique_violation then') > strpos(p.prosrc, 'from guesses')
             and has_function_privilege(c_authenticated, p.oid, 'EXECUTE')
             and not has_function_privilege(c_anon, p.oid, 'EXECUTE')
             and not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where x.grantee = 0));
  if v_assign is null or v_text is not null then
    raise exception 'assign_semi_blind_match is not the live body with the review round 1 lock and unique-violation handler and the BT-V3 A-11 candidate lock: %',
      coalesce(v_text, 'missing');
  end if;

  -- 3. The two triggers on wines, enabled. tgtype 17 = ROW (1) | UPDATE (16), AFTER,
  --    on the is_revealed column with the WHEN clause; 7 = ROW | BEFORE (2) | INSERT (4).
  --    (tgattr is an int2vector, whose array starts at index 0: compare its elements, not the array.)
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c_wines and t.tgname = 'semi_blind_release_revealed_wine' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgtype = 17 and t.tgfoid = v_release and t.tgconstraint = 0
      and cardinality(t.tgattr::int2[]) = 1
      and (select a.attnum from pg_attribute a
           where a.attrelid = c_wines and a.attname = 'is_revealed') = any (t.tgattr::int2[])
      and t.tgqual is not null
      and strpos(pg_get_triggerdef(t.oid), ' FOR EACH ROW WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION ') > 0
  ) then
    raise exception 'semi_blind_release_revealed_wine is missing, disabled or mis-shaped on wines: %',
      (select format('enabled %s, tgtype %s, function %s, columns %s, when %s: %s', t.tgenabled, t.tgtype,
                     t.tgfoid::regproc, t.tgattr::int2[]::text, t.tgqual is not null, pg_get_triggerdef(t.oid))
       from pg_trigger t where t.tgrelid = c_wines and t.tgname = 'semi_blind_release_revealed_wine');
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = c_wines and t.tgname = 'wines_semi_blind_flight_locked' and not t.tgisinternal
      and t.tgenabled = 'O' and t.tgtype = 7 and t.tgfoid = v_locked and t.tgconstraint = 0
      and cardinality(t.tgattr::int2[]) = 0 and t.tgqual is null
  ) then
    raise exception 'wines_semi_blind_flight_locked is missing, disabled or mis-shaped on wines: %',
      (select format('enabled %s, tgtype %s, function %s, columns %s, when %s: %s', t.tgenabled, t.tgtype,
                     t.tgfoid::regproc, t.tgattr::int2[]::text, t.tgqual is not null, pg_get_triggerdef(t.oid))
       from pg_trigger t where t.tgrelid = c_wines and t.tgname = 'wines_semi_blind_flight_locked');
  end if;

  -- 4. "wine_answers read": the live text with exactly the two edits of spec §10.4 (f)
  --    (no semi-blind participant clause; the host clause carries added_by_host), and
  --    the wine_answers policy set otherwise unchanged.
  select pre.qual into v_pre_qual
  from semi_blind_103500_policies pre
  where pre.tablename = 'wine_answers' and pre.policyname = 'wine_answers read';
  select p.qual into v_qual
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers read'
    and p.cmd = 'SELECT' and p.roles::text = '{authenticated}' and p.permissive = 'PERMISSIVE'
    and p.with_check is null;
  if v_qual is null
     or v_qual is distinct from replace(v_pre_qual, c_old_clause, c_new_clause)
     or md5(v_qual) is distinct from 'abe0592ac72de20adfb3b8005bc86f86'
     or strpos(v_qual, 'SEMI_BLIND') > 0
     or strpos(v_qual, 'is_tasting_participant') > 0
     or strpos(v_qual, '((t.host_id = auth.uid()) AND w.added_by_host)') = 0
     or strpos(v_qual, 'has_scored_guess(wine_id)') = 0 then
    raise exception '"wine_answers read" is not the live text with the two spec §10.4 (f) edits: %', v_qual;
  end if;
  select string_agg(format('%s|%s|%s|%s|%s|%s', p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'wine_answers';
  if v_text is distinct from 'wine_answers insert|INSERT|{authenticated}|PERMISSIVE|-|8f590b9d5d338417fe6b882507446975; wine_answers read|SELECT|{authenticated}|PERMISSIVE|abe0592ac72de20adfb3b8005bc86f86|-; wine_answers update|UPDATE|{authenticated}|PERMISSIVE|8f590b9d5d338417fe6b882507446975|8f590b9d5d338417fe6b882507446975' then
    raise exception 'the wine_answers policies after this file are not the expected set: %', v_text;
  end if;

  -- 5. guesses privileges (spec §10.4 (e)).
  --    a. No client role keeps table-level SELECT, INSERT or UPDATE.
  if has_table_privilege(c_anon, c_guesses, 'SELECT') or has_table_privilege(c_authenticated, c_guesses, 'SELECT')
     or has_table_privilege(c_anon, c_guesses, 'INSERT') or has_table_privilege(c_authenticated, c_guesses, 'INSERT')
     or has_table_privilege(c_anon, c_guesses, 'UPDATE') or has_table_privilege(c_authenticated, c_guesses, 'UPDATE') then
    raise exception 'a client role holds table-level SELECT, INSERT or UPDATE on guesses';
  end if;
  --    b. authenticated: SELECT on exactly the 27 columns, INSERT and UPDATE on exactly the 13;
  --       no grant option; no other grantee holds a column privilege; every guesses column
  --       except guessed_wine_id is selectable.
  if (select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
      from pg_attribute a cross join lateral aclexplode(a.attacl) x
      where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
        and x.grantee = c_authenticated and x.privilege_type = 'SELECT' and not x.is_grantable)
       is distinct from (select array_agg(c order by c collate "C") from unnest(c_read_columns) c) then
    raise exception 'authenticated does not hold SELECT on exactly the 27 guesses read columns';
  end if;
  if (select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
      from pg_attribute a cross join lateral aclexplode(a.attacl) x
      where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
        and x.grantee = c_authenticated and x.privilege_type = 'INSERT' and not x.is_grantable)
       is distinct from (select array_agg(c order by c collate "C") from unnest(c_write_columns) c)
     or (select coalesce(array_agg(a.attname::text order by a.attname::text collate "C"), '{}')
         from pg_attribute a cross join lateral aclexplode(a.attacl) x
         where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
           and x.grantee = c_authenticated and x.privilege_type = 'UPDATE' and not x.is_grantable)
       is distinct from (select array_agg(c order by c collate "C") from unnest(c_write_columns) c) then
    raise exception 'authenticated does not hold INSERT and UPDATE on exactly the 13 guesses client columns';
  end if;
  select string_agg(format('%s:%s:%s:%s', a.attname, x.grantee, x.privilege_type, x.is_grantable), ', ') into v_text
  from pg_attribute a cross join lateral aclexplode(a.attacl) x
  where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped
    and (x.grantee <> c_authenticated or x.is_grantable or x.privilege_type not in ('SELECT', 'INSERT', 'UPDATE'));
  if v_text is not null then
    raise exception 'unexpected column grants on guesses: %', v_text;
  end if;
  if (select array_agg(a.attname::text order by a.attname::text collate "C") from pg_attribute a
      where a.attrelid = c_guesses and a.attnum > 0 and not a.attisdropped and a.attname <> 'guessed_wine_id')
       is distinct from (select array_agg(c order by c collate "C") from unnest(c_read_columns) c) then
    raise exception 'the 27 read columns are not every guesses column except guessed_wine_id';
  end if;
  if has_column_privilege(c_authenticated, c_guesses, 'guessed_wine_id', 'SELECT')
     or has_column_privilege(c_authenticated, c_guesses, 'guessed_wine_id', 'INSERT')
     or has_column_privilege(c_authenticated, c_guesses, 'guessed_wine_id', 'UPDATE')
     or has_any_column_privilege(c_anon, c_guesses, 'SELECT')
     or has_any_column_privilege(c_anon, c_guesses, 'INSERT')
     or has_any_column_privilege(c_anon, c_guesses, 'UPDATE') then
    raise exception 'a client role can still read or write guessed_wine_id, or anon holds a guesses column privilege';
  end if;

  -- 6. semi_blind_candidate_keys keeps no client privilege (M9a).
  select string_agg(format('%s:%s', r.rolname, p.priv), ', ' order by r.rolname, p.priv) into v_text
  from (values ('anon'), ('authenticated')) as r (rolname)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p (priv)
  where has_table_privilege(r.rolname, c_keys, p.priv)
     or (p.priv in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and has_any_column_privilege(r.rolname, c_keys, p.priv));
  if v_text is not null
     or exists (select 1 from pg_class c, lateral aclexplode(c.relacl) x where c.oid = c_keys and x.grantee = 0) then
    raise exception 'client roles or PUBLIC hold privileges on semi_blind_candidate_keys: %', v_text;
  end if;

  -- 7. The functions that insert into or update guesses: M8's verified list plus the pool
  --    release, which clears locked_at with the candidate, so the lock pin lets it through.
  select string_agg(format('%s.%s', n.nspname, p.proname), ', ' order by format('%s.%s', n.nspname, p.proname) collate "C")
    into v_text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog', 'information_schema')
    and p.prosrc ~* '(insert\s+into|update)\s+(only\s+)?(public\.)?"?guesses"?\M';
  if v_text is distinct from 'public.assign_semi_blind_match, public.clear_semi_blind_match, public.reveal_next_category, public.reveal_own_next_category, public.reveal_wine, public.score_own_guess, public.semi_blind_release_revealed_wine' then
    raise exception 'the functions that write guesses are not M8''s list plus the pool release: %', v_text;
  end if;

  -- 8. Nothing else changed: every other public function (body, ACL, security, config,
  --    volatility), policy, trigger and privilege, and no public function or relation
  --    beyond the two functions and the index; assign_semi_blind_match changes its body only.
  select string_agg(format('%s %s', d.side, d.sig), ', ' order by d.sig) into v_text
  from (
    select case when pre.oid is null then 'new' when cur.oid is null then 'dropped' else 'changed' end as side,
           coalesce(cur.sig, pre.sig) as sig, cur.oid,
           (pre.sig, pre.acl, pre.prosecdef, pre.config, pre.provolatile)
             is not distinct from (cur.sig, cur.acl, cur.prosecdef, cur.config, cur.provolatile) as body_only
    from semi_blind_103500_functions pre
    full join (select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body,
                      p.proacl::text as acl, p.prosecdef, p.proconfig::text as config, p.provolatile
               from pg_proc p where p.pronamespace = 'public'::regnamespace) cur
      on cur.oid = pre.oid
    where pre.oid is null or cur.oid is null
       or (pre.sig, pre.body, pre.acl, pre.prosecdef, pre.config, pre.provolatile)
          is distinct from (cur.sig, cur.body, cur.acl, cur.prosecdef, cur.config, cur.provolatile)
  ) d
  where not (d.side = 'new' and d.oid in (v_release, v_locked))
    and not (d.side = 'changed' and d.oid = v_assign and d.body_only);
  if v_text is not null then
    raise exception 'public functions changed beyond the two trigger functions and the body of assign_semi_blind_match: %', v_text;
  end if;

  select string_agg(format('%s.%s', coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)), ', ')
    into v_text
  from semi_blind_103500_policies pre
  full join (select pol.tablename::text as tablename, pol.policyname::text as policyname, pol.permissive,
                    pol.roles::text as roles, pol.cmd, pol.qual, pol.with_check
             from pg_policies pol where pol.schemaname = 'public') cur
    on cur.tablename = pre.tablename and cur.policyname = pre.policyname
  where (coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname))
          is distinct from ('wine_answers', 'wine_answers read')
    and (pre.policyname is null or cur.policyname is null
         or (pre.permissive, pre.roles, pre.cmd, pre.qual, pre.with_check)
            is distinct from (cur.permissive, cur.roles, cur.cmd, cur.qual, cur.with_check));
  if v_text is not null then
    raise exception 'policies changed beyond "wine_answers read": %', v_text;
  end if;

  select string_agg(format('%s.%s', coalesce(pre.tbl, cur.tbl), coalesce(pre.tgname, cur.tgname)), ', ')
    into v_text
  from semi_blind_103500_triggers pre
  full join (select c.relname::text as tbl, t.tgname::text as tgname, t.tgenabled, t.tgtype, t.tgfoid,
                    pg_get_triggerdef(t.oid) as def
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) cur
    on cur.tbl = pre.tbl and cur.tgname = pre.tgname
  where not (pre.tgname is null and cur.tbl = 'wines'
             and cur.tgname in ('semi_blind_release_revealed_wine', 'wines_semi_blind_flight_locked'))
    and (pre.tgname is null or cur.tgname is null
         or (pre.tgenabled, pre.tgtype, pre.tgfoid, pre.def)
            is distinct from (cur.tgenabled, cur.tgtype, cur.tgfoid, cur.def));
  if v_text is not null then
    raise exception 'triggers changed beyond the two on wines: %', v_text;
  end if;

  with cur as (
    select c.relname::text as tbl, a.attname::text as col, x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join lateral aclexplode(a.attacl) x
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
    union all
    select c.relname::text, '(table)', x.grantee, x.privilege_type, x.is_grantable
    from pg_class c
    cross join lateral aclexplode(c.relacl) x
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ),
  diff as (
    (select 'lost' as side, pre.tbl, pre.col, pre.grantee, pre.privilege_type, pre.is_grantable
     from semi_blind_103500_acl pre
     except
     select 'lost', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur)
    union all
    (select 'gained', cur.tbl, cur.col, cur.grantee, cur.privilege_type, cur.is_grantable from cur
     except
     select 'gained', pre.tbl, pre.col, pre.grantee, pre.privilege_type, pre.is_grantable
     from semi_blind_103500_acl pre)
  ),
  classified as (
    select d.*,
           (d.side = 'lost' and d.tbl = 'guesses' and not d.is_grantable
            and ((d.col = '(table)' and d.grantee in (c_anon, c_authenticated) and d.privilege_type = 'SELECT')
                 or (d.col = 'guessed_wine_id' and d.grantee = c_authenticated
                     and d.privilege_type in ('INSERT', 'UPDATE')))) as expected_lost,
           (d.side = 'gained' and d.tbl = 'guesses' and not d.is_grantable and d.col = any (c_read_columns)
            and d.grantee = c_authenticated and d.privilege_type = 'SELECT') as expected_gained
    from diff d
  )
  select (count(*) filter (where expected_lost))::int,
         (count(*) filter (where expected_gained))::int,
         string_agg(format('%s %s.%s %s %s', side, tbl, col,
                           case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee)::text end, privilege_type), ', ')
           filter (where not expected_lost and not expected_gained)
    into v_lost, v_gained, v_text
  from classified;
  if v_lost <> 4 or v_gained <> 27 or v_text is not null then
    raise exception 'privileges changed beyond spec §10.4 (e) (lost % of 4, gained % of 27): %', v_lost, v_gained, v_text;
  end if;

  if (select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace)
       <> (select functions + 2 from semi_blind_103500_counts)
     or (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace)
       <> (select relations + 1 from semi_blind_103500_counts) then
    raise exception 'public functions or relations changed beyond the two trigger functions and the index';
  end if;
end $$;

drop table semi_blind_103500_functions;
drop table semi_blind_103500_policies;
drop table semi_blind_103500_triggers;
drop table semi_blind_103500_acl;
drop table semi_blind_103500_counts;
