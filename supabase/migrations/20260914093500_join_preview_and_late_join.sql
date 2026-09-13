-- join_preview_and_late_join: the share-link preview and the signed-in
-- invitation, the host's record, joining until the tasting is CLOSED, leaving
-- only before Start, a server-owned joined_at, and 10-character join codes.
--
-- Blind-tasting v3, M4 (BT-SQL4): spec §4.4, §5.3 item 2, §5.4, §15 M4, §16.1
-- rows 1-2, §16.3 (enumeration); ledger B3 (share link: reduced preview,
-- signed-in invitation, host record) and B4 (joining late); owner defaults Q3
-- and Q6.
--
-- Written against the LIVE state (read-only dump, 2026-09-13:
-- .superpowers/blind-tasting/probes/20260914093500-live-defs.sql; re-checked
-- read-only for BT-SQL4x after M1-M3 went live), never an older migration file:
-- * join_tasting_by_code(text): SECURITY DEFINER, search_path=public, EXECUTE
--   for authenticated and service_role only. It refuses CLOSED tastings and
--   every started non-OPEN one; its upsert flips any non-JOINED row (INVITED or
--   DECLINED) to JOINED and keeps an existing joined_at. It is the only
--   function that writes tasting_participants.
-- * generate_join_code(): invoker rights, no search_path, Supabase's default
--   function ACL; 6 characters from a 32-letter alphabet. Its only caller is
--   ensure_join_code (SECURITY DEFINER, host-only, retries on the
--   tastings_join_code_key unique index). One live tasting carries a code, of
--   6 characters.
-- * tasting_participants has one trigger, tasting_participants_pin_identity
--   (BEFORE UPDATE; lane N 20260912091000). "participants update own or host"
--   lets a participant or the host write status and joined_at at any time, and
--   "participants delete host" lets the host delete any participant row at any
--   time. tasting_participants_tasting_id_fkey is ON DELETE CASCADE, so
--   deleting a tasting deletes its participant rows (and, through
--   guesses_participant_id_fkey, their guesses).
-- * The enum types are tasting_status, timing_mode and reveal_mode_type: the
--   names spec §4.4 uses.
-- * tastings.started_at and its trigger tastings_stamp_lifecycle come from M3
--   (20260914092500, live since 2026-09-13): now() at Start (DRAFT ->
--   IN_PROGRESS, or an insert as IN_PROGRESS or OPEN), then kept through every
--   later status change, a client-sent value always replaced. The three live
--   tastings started before M3 carry none (M3 has no backfill). "tastings
--   update host" lets the host write tastings.status at any time.
-- M1 and M2 (20260914090500, 20260914091500; live since 2026-09-13) touch none
-- of these objects.
--
-- What this migration does:
-- 1. Spec §4.4 (between the two banners below), verbatim: host_tastings_count
--    and get_join_preview; generate_join_code with its loop bound 6 -> 10 (the
--    rest of the body is the live one: the post-state block asserts its md5);
--    the leave guard and the joined_at stamp with their triggers; EXECUTE on
--    both trigger functions revoked from PUBLIC, anon and authenticated.
-- 2. Spec §5.4: join_tasting_by_code recreated from pg_get_functiondef with
--    exactly one edit, the "that tasting has already started" refusal removed.
--    Its joined_at = coalesce(tasting_participants.joined_at, now()) stays as
--    written and agrees with the stamp, which owns the value. CREATE OR REPLACE
--    keeps its ACL, SECURITY DEFINER, search_path and volatility (asserted).
-- 3. Hardened before the live apply (a review fix, then BT-SQL4x, 2026-09-13).
--    Spec §4.4 and §5.4 say neither a participant nor the host can move
--    joined_at; the first draft let the host do it with a JOINED -> DECLINED ->
--    JOINED round trip on a guest after Start, or by deleting the guest's row.
--    Spec §4.4's SQL block carries the same rules:
--    a. joined_at is stamped once: now() the first time a row becomes JOINED,
--       then never moved. A later flip to JOINED keeps an existing joined_at (a
--       guest who left before Start and comes back keeps the first one); a row
--       without one (a DECLINED invitee who never joined) is stamped on its
--       first join.
--    b. After Start no signed-in caller, the host included, changes a JOINED
--       row's status. The guest is told "you can only leave before the tasting
--       starts"; anyone else (only the host may write another person's row) is
--       told "A guest who has joined stays in the tasting once it has started."
--       (plan copy).
--    c. After Start no signed-in caller deletes a JOINED row, unless the
--       tasting itself is being deleted: the guard lets the row go once its
--       tasting row is gone, which is how the ON DELETE CASCADE from
--       deleteTasting reaches it. The leave guard fires BEFORE UPDATE OF status
--       OR DELETE.
--    d. "After Start" means the tasting's status is not DRAFT or its
--       started_at is set (BT-SQL4x's review fix). The host can write
--       tastings.status, so with a status test alone a host could set a
--       running tasting back to DRAFT, take a joined guest out (their guesses
--       go with the row) or set them DECLINED, and start it again. M3 keeps
--       started_at through that round trip, so the guard still refuses. Limit:
--       a tasting that reached a started status without M3's Start stamp (the
--       three live tastings started before M3, or one moved DRAFT -> OPEN or
--       DRAFT -> CLOSED by a direct update) has no started_at, and for it only
--       the status test applies.
--    service_role and the owner (auth.uid() null) are not clients and stay
--    free; the host's own row still never leaves JOINED, whoever writes it.
--
-- Security (spec §4.4 "Security reasoning", §5.4, §16):
-- * get_join_preview is the only new anon-callable function. To anon it returns
--   the reduced preview (Q3) - name, host display name and avatar, time, mode,
--   timing, pacing, glass count, status - with viewer_tasting_id, host_id and
--   joined_names null. A signed-in caller also gets the host id (the host
--   record) and the JOINED display names, host excluded, earliest joined_at
--   first; viewer_tasting_id only when they are the host or hold a JOINED or
--   INVITED row, so a DECLINED guest opening the link gets the invitation again
--   (B4). It never reads tasting_places, the description or the cover photo,
--   and no wine beyond a count (rule 1). OPEN-mode tastings return no row.
-- * host_tastings_count: one integer about a host (their started and closed
--   tastings), authenticated only.
-- * The leave guard keeps reveal_wine's eligible count once a tasting has
--   started (its status is not DRAFT, or its started_at is set: item 3d): a
--   JOINED guest cannot leave, and the host can neither move a JOINED row out
--   of JOINED nor delete it (item 3), not even after setting the tasting back
--   to DRAFT. Before Start a guest can leave and the host can still take a
--   guest off the list; the host's own row never leaves JOINED, whoever writes
--   it (service_role included). Deleting an INVITED or DECLINED row stays
--   allowed, as today. The guard reads new.tasting_id and new.user_id (old.* on
--   DELETE), which is sound only because tasting_participants_pin_identity
--   refuses changing either: a combined status + tasting_id update is still
--   refused. BEFORE triggers fire in name order: leave_guard, pin_identity,
--   stamp_joined_at.
-- * joined_at is trigger-owned and stamped once: a client-sent value is
--   replaced on every insert and update, a later flip to JOINED keeps an
--   existing stamp, and after Start no signed-in caller can take a JOINED row
--   out of JOINED or delete it. So neither a participant nor the host can move
--   it to turn glasses into, or out of, "joined after" (§5, §11). service_role
--   is unbound.
-- * Enumeration (§16.3): codes minted from now on carry 10 characters (about
--   50 bits); the existing 6-character code keeps working, so a link already
--   shared does not break. get_join_preview has no per-caller rate limit.
--
-- Deployed code once applied (after add-wine V2, spec §1.5 and §15). Every
-- write to tasting_participants in src/ and scripts/ was checked against the
-- behavioural probe (its J, LG, K and DT rows):
-- * /j/[code] calls join_tasting_by_code: it now also joins an IN_PROGRESS
--   tasting (Q6), so its "already started" message goes unused. CLOSED is still
--   refused.
-- * createTasting's host row and invites, inviteToTasting, respondToInvite
--   (accept and decline) and scripts/seed-demo-people.mjs keep working; any
--   joined_at they send is ignored.
-- * deleteTasting still deletes a tasting in any status; its participant rows
--   and their guesses go with it through the cascade.
-- * A JOINED guest's own decline after Start is refused. No deployed UI offers
--   it (the decline is shown to INVITED rows only), and respondToInvite ignores
--   the error.
-- * No deployed or planned flow moves another participant out of JOINED or
--   deletes a participant row: the host's participant writes are inserts
--   (createTasting, inviteToTasting), and the coming leaveTasting and
--   transfer_tasting_host run in DRAFT only. No flow sets a started tasting
--   back to DRAFT either: createTasting inserts DRAFT, and startTasting,
--   finishTasting and reopenTasting move DRAFT -> IN_PROGRESS, IN_PROGRESS ->
--   CLOSED and CLOSED -> IN_PROGRESS (M3 keeps started_at through all three).
--   The refusals of item 3 refuse nothing the app does.
-- * ensure_join_code mints 10-character codes for codeless tastings; nothing in
--   src/ assumes a code length.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  c_jtbc_block constant text :=
    '  if v_tasting.status <> ''DRAFT'' and v_tasting.reveal_mode <> ''OPEN'' then' || chr(10)
    || '    raise exception ''that tasting has already started'';' || chr(10)
    || '  end if;' || chr(10);
  v_text text;
  v_fn record;
begin
  -- 1. None of the objects M4 creates exists yet: create or replace would
  --    silently overwrite a function, and a trigger of the same name would fail
  --    the apply halfway.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('host_tastings_count', 'get_join_preview',
                      'tasting_participants_leave_guard', 'tasting_participants_stamp_joined_at');
  if v_text is not null then
    raise exception 'a function M4 creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;
  select string_agg(format('%s on %s', t.tgname, t.tgrelid::regclass), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('tasting_participants_leave_guard', 'tasting_participants_stamp_joined_at');
  if v_text is not null then
    raise exception 'a trigger M4 creates already exists: %', v_text;
  end if;

  -- 2. join_tasting_by_code: the live body (one "already started" refusal),
  --    SECURITY DEFINER, search_path=public, volatile, returns uuid,
  --    authenticated and service_role only.
  select p.prosrc, p.prosecdef, p.proconfig, p.provolatile, p.prorettype, l.lanname, p.proacl::text as acl
    into v_fn
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.join_tasting_by_code(text)');
  if not found then
    raise exception 'public.join_tasting_by_code(text) does not exist';
  end if;
  if md5(v_fn.prosrc) <> '643c88a3715ef76b808725eecef044fd'
     or array_length(string_to_array(v_fn.prosrc, c_jtbc_block), 1) <> 2
     or not v_fn.prosecdef
     or v_fn.proconfig is distinct from array['search_path=public']::text[]
     or v_fn.provolatile <> 'v'
     or v_fn.prorettype <> 'uuid'::regtype
     or v_fn.lanname <> 'plpgsql'
     or v_fn.acl is distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'join_tasting_by_code differs from the live function this migration was built from (acl %); rebuild it from pg_get_functiondef', v_fn.acl;
  end if;

  -- 3. generate_join_code: the live 6-character body, invoker rights, no
  --    search_path, volatile, returns text, Supabase's default ACL.
  select p.prosrc, p.prosecdef, p.proconfig, p.provolatile, p.prorettype, l.lanname, p.proacl::text as acl
    into v_fn
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.generate_join_code()');
  if not found then
    raise exception 'public.generate_join_code() does not exist';
  end if;
  if md5(v_fn.prosrc) <> '95d0ce9c7a7cc5b579d04353594595a7'
     or array_length(string_to_array(v_fn.prosrc, '  for i in 1..6 loop' || chr(10)), 1) <> 2
     or v_fn.prosecdef
     or v_fn.proconfig is not null
     or v_fn.provolatile <> 'v'
     or v_fn.prorettype <> 'text'::regtype
     or v_fn.lanname <> 'plpgsql'
     or v_fn.acl is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'generate_join_code differs from the live function this migration was built from (acl %)', v_fn.acl;
  end if;

  -- 4. ensure_join_code (generate_join_code's only caller) has the live body,
  --    and the lane N identity pin is the only trigger on tasting_participants.
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.ensure_join_code(uuid)'))
       is distinct from 'f6bf45f6da6ffa2221f687e763b4c152' then
    raise exception 'ensure_join_code differs from the live body this migration was written against';
  end if;
  select string_agg(format('%s %s %s', t.tgname, t.tgtype, t.tgenabled), ', ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.tasting_participants'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tasting_participants_pin_identity 19 O'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.tasting_participants'::regclass
                      and t.tgname = 'tasting_participants_pin_identity'
                      and t.tgfoid = to_regprocedure('public.pin_tasting_participant_identity()'))
     or (select md5(p.prosrc) from pg_proc p
         where p.oid = to_regprocedure('public.pin_tasting_participant_identity()'))
          is distinct from '32f3c8c10f6106303dcdc3ff5c062cca' then
    raise exception 'triggers on tasting_participants differ from the live state this file was written against: %', v_text;
  end if;

  -- 5. The enum types spec §4.4 names, with their live labels.
  select string_agg(format('%s:%s', s.typname, s.labels), '; ' order by s.typname collate "C") into v_text
  from (
    select t.typname::text as typname, string_agg(e.enumlabel::text, ',' order by e.enumsortorder) as labels
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace
      and t.typname in ('tasting_status', 'timing_mode', 'reveal_mode_type', 'participant_status')
    group by t.typname
  ) s;
  if v_text is distinct from 'participant_status:INVITED,JOINED,DECLINED; reveal_mode_type:BLIND,SEMI_BLIND,OPEN; '
                             || 'tasting_status:DRAFT,OPEN,IN_PROGRESS,CLOSED; timing_mode:LIVE,ASYNC' then
    raise exception 'enum types differ from the ones spec §4.4 names: %', v_text;
  end if;

  -- 6. The columns the new functions and triggers read.
  select string_agg(format('%s.%s %s%s%s', c.relname, a.attname,
                           case when t.typtype = 'e' then t.typnamespace::regnamespace::text || '.' else '' end,
                           t.typname,
                           case when a.attnotnull then ' not null' else '' end),
                    ', ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_type t on t.oid = a.atttypid
  where a.attnum > 0 and not a.attisdropped
    and ((a.attrelid = 'public.tastings'::regclass
          and a.attname in ('id', 'name', 'host_id', 'scheduled_at', 'reveal_mode', 'timing_mode',
                            'sequential_guessing', 'started_at', 'status', 'join_code'))
      or (a.attrelid = 'public.tasting_participants'::regclass
          and a.attname in ('tasting_id', 'user_id', 'status', 'joined_at', 'created_at'))
      or (a.attrelid = 'public.profiles'::regclass and a.attname in ('id', 'display_name', 'avatar_url'))
      or (a.attrelid = 'public.wines'::regclass and a.attname = 'tasting_id'));
  if v_text is distinct from
       'profiles.avatar_url text, profiles.display_name text not null, profiles.id uuid not null, '
       || 'tasting_participants.created_at timestamptz not null, tasting_participants.joined_at timestamptz, '
       || 'tasting_participants.status public.participant_status not null, '
       || 'tasting_participants.tasting_id uuid not null, tasting_participants.user_id uuid not null, '
       || 'tastings.host_id uuid not null, tastings.id uuid not null, tastings.join_code text, '
       || 'tastings.name text not null, tastings.reveal_mode public.reveal_mode_type not null, '
       || 'tastings.scheduled_at timestamptz, tastings.sequential_guessing bool not null, '
       || 'tastings.started_at timestamptz, '
       || 'tastings.status public.tasting_status not null, tastings.timing_mode public.timing_mode not null, '
       || 'wines.tasting_id uuid not null' then
    raise exception 'columns read by M4 differ from the live state this file was written against: %', v_text;
  end if;

  -- 7. What the hardened leave guard relies on (header item 3): deleting a
  --    tasting reaches its participant rows through ON DELETE CASCADE (the
  --    guard lets a JOINED row go once its tasting row is gone); the update
  --    and delete policies on tasting_participants are the dumped ones; and
  --    M3's tastings_stamp_lifecycle is the live trigger (its body, BEFORE
  --    INSERT OR UPDATE, enabled, no WHEN), which stamps started_at at Start
  --    and keeps it through every later status change (item 3d).
  if (select pg_get_constraintdef(k.oid) from pg_constraint k
      where k.conrelid = 'public.tasting_participants'::regclass
        and k.conname = 'tasting_participants_tasting_id_fkey')
       is distinct from 'FOREIGN KEY (tasting_id) REFERENCES tastings(id) ON DELETE CASCADE' then
    raise exception 'tasting_participants_tasting_id_fkey is not tasting_id -> tastings(id) ON DELETE CASCADE';
  end if;
  select string_agg(format('%s %s %s %s', p.polname, p.polcmd,
                           coalesce(pg_get_expr(p.polqual, p.polrelid), '-'),
                           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')),
                    '; ' order by p.polname::text collate "C")
    into v_text
  from pg_policy p
  where p.polrelid = 'public.tasting_participants'::regclass and p.polcmd in ('w', 'd');
  if v_text is distinct from
       'participants delete host d is_tasting_host(tasting_id) -; '
       || 'participants update own or host w ((user_id = auth.uid()) OR is_tasting_host(tasting_id)) '
       || '((user_id = auth.uid()) OR is_tasting_host(tasting_id))' then
    raise exception 'the update and delete policies on tasting_participants differ from the dumped ones: %', v_text;
  end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.tastings_stamp_lifecycle()'))
       is distinct from '5d7702a39d76b3a8b6fd3ddf2d30fe1d'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.tastings'::regclass
                      and t.tgname = 'tastings_stamp_lifecycle'
                      and t.tgfoid = to_regprocedure('public.tastings_stamp_lifecycle()')
                      and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null) then
    raise exception 'tastings_stamp_lifecycle is not the live M3 trigger that owns tastings.started_at, which the leave guard reads';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Spec §4.4, verbatim (it carries the pre-apply hardening: header item 3).
-- ---------------------------------------------------------------------------
create or replace function public.host_tastings_count(p_user_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int
  from tastings
  where host_id = p_user_id and status in ('IN_PROGRESS', 'CLOSED');
$$;
revoke all on function public.host_tastings_count(uuid) from public, anon;
grant execute on function public.host_tastings_count(uuid) to authenticated;

create or replace function public.get_join_preview(p_code text)
returns table (
  name text,
  host_name text,
  host_avatar_url text,
  scheduled_at timestamptz,
  reveal_mode reveal_mode_type,
  timing_mode timing_mode,
  sequential_guessing boolean,
  glass_count int,
  status tasting_status,
  viewer_tasting_id uuid,   -- only when auth.uid() is the host or has a JOINED or INVITED row
  host_id uuid,             -- signed-in callers only (the host record)
  joined_names text[]       -- signed-in callers only: JOINED display names, host excluded, earliest first
)
language sql stable security definer set search_path = public as $$
  select t.name, p.display_name, p.avatar_url, t.scheduled_at,
         t.reveal_mode, t.timing_mode, t.sequential_guessing,
         (select count(*)::int from wines w where w.tasting_id = t.id),
         t.status,
         case
           when auth.uid() is not null
                and (t.host_id = auth.uid()
                     or exists (select 1 from tasting_participants tp
                                where tp.tasting_id = t.id and tp.user_id = auth.uid()
                                  and tp.status in ('JOINED', 'INVITED')))
           then t.id
         end,
         case when auth.uid() is not null then t.host_id end,
         case when auth.uid() is not null then (
           select coalesce(array_agg(jp.display_name order by tp.joined_at nulls last, tp.created_at), '{}')
           from tasting_participants tp
           join profiles jp on jp.id = tp.user_id
           where tp.tasting_id = t.id and tp.status = 'JOINED' and tp.user_id <> t.host_id
         ) end
  from tastings t
  join profiles p on p.id = t.host_id
  where t.join_code = upper(btrim(p_code))
    and t.reveal_mode <> 'OPEN';
$$;
revoke all on function public.get_join_preview(text) from public;
grant execute on function public.get_join_preview(text) to anon, authenticated;

-- Codes minted from now on carry 10 characters (about 50 bits). Recreated from
-- the live definition; only the loop bound changes. Existing codes keep working.
create or replace function public.generate_join_code()
returns text language plpgsql as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
begin
  for i in 1..10 loop
    code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return code;
end;
$$;

-- A guest may leave only before Start, and the host never leaves their own
-- tasting. Once the tasting has started (its status is not DRAFT, or M3 has
-- stamped its started_at, which no later status change clears) a JOINED row
-- stays JOINED, and stays in the table, for every signed-in caller, the host
-- included; only deleting the tasting itself removes it. service_role
-- (auth.uid() null) is not a client and stays free.
create or replace function public.tasting_participants_leave_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status tasting_status;
  v_started timestamptz;
  v_host uuid;
begin
  if tg_op = 'DELETE' then
    if old.status = 'JOINED' and auth.uid() is not null then
      select status, started_at into v_status, v_started from tastings where id = old.tasting_id;
      -- No tasting row: the tasting itself is being deleted (the cascade from deleteTasting).
      if found and (v_status <> 'DRAFT' or v_started is not null) then
        raise exception 'A guest who has joined stays in the tasting once it has started.'; -- (plan copy)
      end if;
    end if;
    return old;
  end if;
  if old.status = 'JOINED' and new.status <> 'JOINED' then
    select status, started_at, host_id into v_status, v_started, v_host from tastings where id = new.tasting_id;
    if new.user_id = v_host then
      raise exception 'the host cannot leave their own tasting';
    end if;
    if auth.uid() is not null and (v_status <> 'DRAFT' or v_started is not null) then
      if auth.uid() = new.user_id then
        raise exception 'you can only leave before the tasting starts';
      end if;
      raise exception 'A guest who has joined stays in the tasting once it has started.'; -- (plan copy)
    end if;
  end if;
  return new;
end $$;

create trigger tasting_participants_leave_guard
  before update of status or delete on public.tasting_participants
  for each row execute function public.tasting_participants_leave_guard();

-- joined_at belongs to the server and is stamped once: now() the first time a
-- row becomes JOINED (on insert, by accepting, or by the link), then never
-- moved. A later flip to JOINED keeps an existing joined_at (a guest who left
-- before Start and comes back keeps the first one); a DECLINED invitee who
-- never joined gets theirs on the first join. A client-sent value is never
-- taken (respondToInvite and the create action send one today).
create or replace function public.tasting_participants_stamp_joined_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.joined_at := case when new.status = 'JOINED' then now() end;
  else
    new.joined_at := old.joined_at;
    if new.status = 'JOINED' and old.status is distinct from 'JOINED' and old.joined_at is null then
      new.joined_at := now();
    end if;
  end if;
  return new;
end $$;

create trigger tasting_participants_stamp_joined_at
  before insert or update on public.tasting_participants
  for each row execute function public.tasting_participants_stamp_joined_at();

revoke all on function public.tasting_participants_leave_guard(),
  public.tasting_participants_stamp_joined_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Spec §5.4: join_tasting_by_code refuses only CLOSED. The live
-- pg_get_functiondef with one edit: the "already started" refusal is removed.
-- ---------------------------------------------------------------------------
create or replace function public.join_tasting_by_code(p_code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tasting tastings%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sign in to join a tasting';
  end if;
  select * into v_tasting from tastings where join_code = upper(trim(p_code));
  if not found then
    raise exception 'no tasting has that code';
  end if;
  if v_tasting.status = 'CLOSED' then
    raise exception 'that tasting has finished';
  end if;
  insert into tasting_participants (tasting_id, user_id, status, joined_at)
  values (v_tasting.id, v_uid, 'JOINED', now())
  on conflict (tasting_id, user_id) do update
    set status = 'JOINED',
        joined_at = coalesce(tasting_participants.joined_at, now())
    where tasting_participants.status <> 'JOINED';
  return v_tasting.id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  c_jtbc_block constant text :=
    '  if v_tasting.status <> ''DRAFT'' and v_tasting.reveal_mode <> ''OPEN'' then' || chr(10)
    || '    raise exception ''that tasting has already started'';' || chr(10)
    || '  end if;' || chr(10);
  v_fn record;
  v_text text;
begin
  -- 1. Every function M4 creates or recreates: security, search_path,
  --    volatility, language, return type, arguments, body (md5 of prosrc with
  --    any CR stripped) and the roles holding EXECUTE ("OWNER" is the function
  --    owner). The two recreated bodies are the live ones with their single
  --    edit (live md5s in the pre-state block).
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
      ('public.host_tastings_count(uuid)', true, '{search_path=public}', 's', 'sql', 'integer', false,
       'p_user_id uuid', 'ec5041ee5b08e487edbb886c3d3e6e8f', 'OWNER,authenticated,service_role'),
      ('public.get_join_preview(text)', true, '{search_path=public}', 's', 'sql', 'record', true,
       'p_code text', 'cd3348ada136e6d34a6b8782c300d00c', 'OWNER,anon,authenticated,service_role'),
      ('public.generate_join_code()', false, null, 'v', 'plpgsql', 'text', false,
       '', '32e10e8b3ab902e7de729a8147a2e47e', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.join_tasting_by_code(text)', true, '{search_path=public}', 'v', 'plpgsql', 'uuid', false,
       'p_code text', '8cdb47c824001d0ad6b0440ede72dc11', 'OWNER,authenticated,service_role'),
      ('public.tasting_participants_leave_guard()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'a13d0de839df497a9bc8619cb29af30d', 'OWNER,service_role'),
      ('public.tasting_participants_stamp_joined_at()', false, '{search_path=public}', 'v', 'plpgsql', 'trigger', false,
       '', 'd09e02f6e7f0837c6aa53a540c2ea219', 'OWNER,service_role')
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

  -- 2. The recreated functions: their one edit, and their ACLs exactly as live.
  --    The hardening (header item 3): the leave guard binds every signed-in
  --    caller after Start (the status or started_at), refuses the host in its
  --    own words and covers DELETE; the stamp keeps an existing joined_at.
  if (select strpos(replace(p.prosrc, chr(13), ''), c_jtbc_block) from pg_proc p
      where p.oid = to_regprocedure('public.join_tasting_by_code(text)')) <> 0 then
    raise exception 'join_tasting_by_code still refuses a started tasting';
  end if;
  if (select strpos(replace(p.prosrc, chr(13), ''), '  for i in 1..10 loop' || chr(10)) from pg_proc p
      where p.oid = to_regprocedure('public.generate_join_code()')) = 0 then
    raise exception 'generate_join_code does not draw 10 characters';
  end if;
  if (select strpos(replace(p.prosrc, chr(13), ''),
                    '    if auth.uid() is not null and (v_status <> ''DRAFT'' or v_started is not null) then' || chr(10))
      from pg_proc p where p.oid = to_regprocedure('public.tasting_participants_leave_guard()')) = 0
     or (select strpos(replace(p.prosrc, chr(13), ''),
                       '      if found and (v_status <> ''DRAFT'' or v_started is not null) then' || chr(10))
         from pg_proc p where p.oid = to_regprocedure('public.tasting_participants_leave_guard()')) = 0 then
    raise exception 'the leave guard does not refuse every signed-in caller after Start, counting a set started_at as started';
  end if;
  if (select strpos(replace(p.prosrc, chr(13), ''), '  if tg_op = ''DELETE'' then' || chr(10))
      from pg_proc p where p.oid = to_regprocedure('public.tasting_participants_leave_guard()')) = 0
     or (select array_length(string_to_array(replace(p.prosrc, chr(13), ''),
                 'raise exception ''A guest who has joined stays in the tasting once it has started.'';'), 1)
         from pg_proc p where p.oid = to_regprocedure('public.tasting_participants_leave_guard()')) <> 3 then
    raise exception 'the leave guard does not refuse deleting a JOINED row after Start, or lacks the host-worded refusal';
  end if;
  if (select strpos(replace(p.prosrc, chr(13), ''),
                    '    if new.status = ''JOINED'' and old.status is distinct from ''JOINED'' and old.joined_at is null then' || chr(10))
      from pg_proc p where p.oid = to_regprocedure('public.tasting_participants_stamp_joined_at()')) = 0 then
    raise exception 'the joined_at stamp does not keep an existing joined_at';
  end if;
  if (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.join_tasting_by_code(text)'))
       is distinct from '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
     or (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.generate_join_code()'))
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'join_tasting_by_code or generate_join_code grants changed post-migration';
  end if;

  -- 3. What each client role can call: the preview for anon and authenticated;
  --    the host record and the join for authenticated only; neither trigger
  --    function for any client role.
  if not has_function_privilege('anon', 'public.get_join_preview(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_join_preview(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.host_tastings_count(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.host_tastings_count(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.join_tasting_by_code(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.join_tasting_by_code(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.tasting_participants_leave_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.tasting_participants_leave_guard()', 'EXECUTE')
     or has_function_privilege('anon', 'public.tasting_participants_stamp_joined_at()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.tasting_participants_stamp_joined_at()', 'EXECUTE') then
    raise exception 'EXECUTE on the M4 functions is not: preview anon + authenticated; host count and join authenticated only; trigger functions no client role';
  end if;

  -- 4. get_join_preview returns exactly the twelve columns of spec §4.4, in order.
  select string_agg(format('%s %s', x.n,
                           case when t.typtype = 'e' then t.typnamespace::regnamespace::text || '.' else '' end
                           || t.typname),
                    ', ' order by x.ord)
    into v_text
  from pg_proc p
  cross join lateral unnest(p.proallargtypes, p.proargmodes, p.proargnames)
    with ordinality as x (typ, mode, n, ord)
  join pg_type t on t.oid = x.typ
  where p.oid = to_regprocedure('public.get_join_preview(text)')
    and x.mode = 't';
  if v_text is distinct from
       'name text, host_name text, host_avatar_url text, scheduled_at timestamptz, '
       || 'reveal_mode public.reveal_mode_type, timing_mode public.timing_mode, sequential_guessing bool, '
       || 'glass_count int4, status public.tasting_status, viewer_tasting_id uuid, host_id uuid, joined_names _text' then
    raise exception 'get_join_preview columns differ from spec §4.4: %', v_text;
  end if;

  -- 5. The triggers on tasting_participants, in firing (name) order: the leave
  --    guard BEFORE UPDATE OF status OR DELETE, the lane N pin BEFORE UPDATE, the
  --    stamp BEFORE INSERT OR UPDATE; all row-level (tgtype ROW 1 | BEFORE 2 |
  --    INSERT 4 | DELETE 8 | UPDATE 16), enabled, without WHEN.
  select string_agg(format('%s %s %s %s %s', t.tgname, t.tgtype, t.tgenabled,
                           coalesce((select string_agg(a.attname::text, ',' order by a.attnum)
                                     from pg_attribute a
                                     where a.attrelid = t.tgrelid and a.attnum = any (t.tgattr::int2[])), '-'),
                           case when t.tgqual is null then p.proname::text else 'WHEN' end),
                    '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.tasting_participants'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'tasting_participants_leave_guard 27 O status tasting_participants_leave_guard; '
       || 'tasting_participants_pin_identity 19 O - pin_tasting_participant_identity; '
       || 'tasting_participants_stamp_joined_at 23 O - tasting_participants_stamp_joined_at'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.tasting_participants'::regclass
                      and t.tgname = 'tasting_participants_leave_guard'
                      and t.tgfoid = to_regprocedure('public.tasting_participants_leave_guard()'))
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.tasting_participants'::regclass
                      and t.tgname = 'tasting_participants_stamp_joined_at'
                      and t.tgfoid = to_regprocedure('public.tasting_participants_stamp_joined_at()')) then
    raise exception 'triggers on tasting_participants are not the expected set: %', v_text;
  end if;

  -- 6. What M4 relies on without changing it.
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.ensure_join_code(uuid)'))
       is distinct from 'f6bf45f6da6ffa2221f687e763b4c152'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.pin_tasting_participant_identity()'))
       is distinct from '32f3c8c10f6106303dcdc3ff5c062cca'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.tastings_stamp_lifecycle()'))
       is distinct from '5d7702a39d76b3a8b6fd3ddf2d30fe1d' then
    raise exception 'ensure_join_code, pin_tasting_participant_identity or tastings_stamp_lifecycle changed post-migration';
  end if;

  -- Informational: the new functions' ACLs.
  select string_agg(format('%s %s', p.proname, p.proacl), '; ' order by p.proname::text collate "C") into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.get_join_preview(text)'), to_regprocedure('public.host_tastings_count(uuid)'));
  raise notice 'join preview: EXECUTE %', v_text;
end $$;
