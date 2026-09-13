-- M6 flight_edits_until_first_step (blind-tasting v3 · BT-SQL6)
-- Spec §3.4 (SQL, verbatim below except one reviewed line: see "Deviation
-- from the spec block"), §3.5, §15 M6, §16.1 rows 6-7, §16.2 (the host bypass,
-- the mode flip, the bring-your-own host's write on a contributor's key);
-- ledger B2 (Edit / Swap / Remove until the glass's first reveal step), B0
-- "F10 / S7 edit guard"; plan refinement 19.
--
-- What it does (spec §3.4):
-- 1. wines.added_by_host records who added a glass, fixed at insert: backfilled
--    as (contributor_participant_id is null), then owned by the wines_pin_adder
--    trigger, so nulling or deleting a contributor never turns their glass
--    into a host-added one.
-- 2. Clients lose UPDATE on wines. authenticated keeps UPDATE on exactly
--    position and added_via; anon has none. is_revealed, reveal_step,
--    contributor_participant_id and tasting_id are written by SECURITY DEFINER
--    functions only (reveal_wine, reveal_next_category, the RPCs below).
-- 3. tastings_lock_setup_after_start: reveal_mode, timing_mode and wine_source
--    lock once the tasting has started: its status is not DRAFT, or M3 has
--    stamped its started_at (see "Deviation from the spec block").
-- 4. is_wine_adder, recreated so its adder test keys on added_by_host (below).
-- 5. The adder's window, can_edit_flight_glass (the wine_answers insert and
--    update policies), can_remove_flight_glass and can_delete_flight_glass_row
--    ("wines delete host" becomes "wines delete adder").
-- 6. remove_flight_glass (delete and renumber in one transaction),
--    move_flight_glass (atomic reorder), set_flight_glass_added_via (Swap's
--    provenance write) and glass_removal_impact (two counts).
--
-- is_wine_adder, recreated from its live pg_get_functiondef (dumped to
-- .superpowers/blind-tasting/probes/20260914095500-live-defs.sql). The spec text
-- replaces the live adder test
--       and (
--         (w.contributor_participant_id is null and t.host_id = auth.uid())
--         or p.user_id = auth.uid()
--       )
-- with
--       and ((w.added_by_host and t.host_id = auth.uid())
--            or (not w.added_by_host and p.user_id = auth.uid()))
-- The rest of the body is the live one. CREATE OR REPLACE keeps its ACL, and
-- its SECURITY DEFINER, STABLE and search_path (asserted). The contributor
-- clause also gains "not w.added_by_host", so a host-added glass has no adder
-- but its host, whatever contributor_participant_id holds later.
--
-- Live facts this file was written against (read-only dump, 2026-09-13):
-- * anon and authenticated hold table-level UPDATE on every wines column, with
--   no column-level ACL. "wines update host" and "wines delete host" check only
--   the host. "wine_answers update" lets the host update any key of the tasting,
--   revealed or not, and the contributor while unrevealed. "wine_answers insert"
--   lets the host or the contributor insert at any time.
-- * 8 wines rows, every one with a contributor (7 of them the host's own
--   participant row in a bring-your-own tasting). 0 bring-your-own glasses have
--   a null contributor and 0 host-provides glasses have a contributor. So the
--   backfill sets added_by_host = false on all 8, and is_wine_adder answers
--   exactly as before for each of them.
-- * Only reveal_wine and reveal_next_category write wines, both SECURITY
--   DEFINER. No SECURITY INVOKER function updates or deletes wines (asserted
--   before and after), so narrowing the privileges breaks no function.
-- * The BEFORE UPDATE triggers on wines (wines_full_reveal_step,
--   wines_stamp_revealed_at) act only on the is_revealed flip (bodies pinned),
--   so the backfill and the position statements wake nothing.
--
-- Order: after M5 (spec §15: the removal count reads M5's identity-less notes).
-- The pre-state requires M5's two triggers on wines, so this file fails closed
-- when applied before M5. While M4 and M5 are not live it is dry-run as the
-- concatenation M4 + M5 + M6.
--
-- Deployed code once applied (BT-M6; probe rows H4, R1, C1-C4, O1-O4):
-- * `rg -n -U 'from\("wines"\)\s*\.update' src` (2026-09-13): moveWine and
--   removeWine (src/app/tastings/[id]/actions.ts) update position only. Still
--   allowed: the column grant plus "wines update host".
-- * removeWine deletes as the DRAFT host, then renumbers. Still allowed:
--   can_delete_flight_glass_row's DRAFT host clause.
-- * AW-F13's tasting-wine-writes.ts (a68833b):
--   - insertGlassRow inserts wines (INSERT is not narrowed; OPEN glasses are
--     inserted revealed). Still allowed.
--   - The answer key's insert and writeAnswer's update go through the adder's
--     window. Still allowed for the adder.
--   - removeGlassIfHost deletes the host's just-added last glass. Still allowed.
--   - adderRefusal calls is_wine_adder. Unchanged for every live row.
-- * No deployed path writes is_revealed, reveal_step, contributor_participant_id
--   or tasting_id from a client, or changes reveal_mode, timing_mode or
--   wine_source outside DRAFT.
--
-- Deviation from the spec block (BT-SQL6 review fix; the matching spec §3.4
-- amendment is reported to the orchestrator). Spec §3.4's
-- tastings_lock_setup_after_start tests
--       if old.status <> 'DRAFT'
-- and this file tests
--       if (old.status <> 'DRAFT' or old.started_at is not null)
-- Every other byte of the block is the spec's (probe row L0 checks exactly
-- that). Why: "tastings update host" lets the host write tastings.status, so a
-- status test alone let a host set a running tasting back to DRAFT, change its
-- mode, timing or wine source, and start it again (probe row L3). That is the
-- mode flip spec §16.2 says M6 closes, and the attack spec §4.4 names for M4's
-- leave guard, which uses this same "has started" test. M3's
-- tastings_stamp_lifecycle stamps started_at at Start (DRAFT -> IN_PROGRESS, or
-- an insert as IN_PROGRESS or OPEN), keeps it through every later status change
-- and replaces any client-sent value, so no client can clear it (its body and
-- trigger are pinned in pre-state 8, the column in pre-state 6).
-- Limit, as for M4's leave guard: a tasting that left DRAFT without that stamp
-- has no started_at, so for it only the status test applies (probe row L7).
-- That covers the three live tastings started before M3 (2026-09-13: none has
-- an unrevealed glass) and a tasting moved from DRAFT straight to OPEN or
-- CLOSED by a direct update.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_n int;
begin
  -- 1. None of the objects M6 creates exists yet. CREATE OR REPLACE would
  --    silently overwrite a function, and a trigger, policy or column of the
  --    same name would fail the apply halfway.
  select concat_ws(' / ',
     (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('wines_pin_adder', 'tastings_lock_setup_after_start', 'can_edit_flight_glass', 'can_remove_flight_glass',
                           'can_delete_flight_glass_row', 'move_flight_glass', 'remove_flight_glass', 'set_flight_glass_added_via',
                           'glass_removal_impact')),
     (select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") from pg_trigger t
       where t.tgname in ('wines_pin_adder', 'tastings_lock_setup_after_start')),
     (select string_agg(p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'wines' and p.policyname = 'wines delete adder'),
     (select 'wines.added_by_host' from pg_attribute a where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host' and not a.attisdropped))
    into v_text;
  if v_text is distinct from '' then
    raise exception 'an object M6 creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;

  -- 2. is_wine_adder is the dumped live function: body, SECURITY DEFINER,
  --    search_path=public, STABLE, sql, boolean, its argument and its ACL.
  select format('secdef=%s config=%s volatile=%s lang=%s returns=%s args=(%s) acl=%s md5=%s',
           p.prosecdef, p.proconfig::text, p.provolatile, l.lanname, pg_get_function_result(p.oid),
           pg_get_function_identity_arguments(p.oid), p.proacl::text, md5(replace(p.prosrc, chr(13), '')))
    into v_text
  from pg_proc p join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.is_wine_adder(uuid)');
  if v_text is distinct from 'secdef=t config={search_path=public} volatile=s lang=sql returns=boolean args=(p_wine_id uuid) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=9ef85039f5b959374284340bb24225e3' then
    raise exception 'is_wine_adder is not the dumped live function: %; re-dump and rebuild this migration', v_text;
  end if;

  -- 3. The helpers the new functions call, and the only SQL writers of
  --    wine_answers outside the flight (spec §3.4 security reasoning), are
  --    SECURITY DEFINER with search_path=public.
  select string_agg(format('%s %s %s', p.proname, p.prosecdef, p.proconfig::text), '; ' order by p.proname::text collate "C")
    into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.is_tasting_host(uuid)'),
                  to_regprocedure('public.merge_catalog_wines(uuid,uuid)'),
                  to_regprocedure('public.resolve_unidentified_wine(uuid,uuid)'));
  if v_text is distinct from
       'is_tasting_host t {search_path=public}; merge_catalog_wines t {search_path=public}; resolve_unidentified_wine t {search_path=public}' then
    raise exception 'is_tasting_host, merge_catalog_wines or resolve_unidentified_wine is not SECURITY DEFINER with search_path=public: %', v_text;
  end if;

  -- 4. The complete policy sets on wines and wine_answers, as md5 of the dumped
  --    texts. "wine_answers insert" (4229209e...), "wine_answers update"
  --    (78ce376a...) and "wines delete host" (6d12dabb...) are the three this
  --    file replaces; any further permissive policy would widen what it narrows.
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', p.tablename, p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.tablename::text collate "C", p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename in ('wines', 'wine_answers');
  if v_text is distinct from 'wine_answers|wine_answers insert|INSERT|{authenticated}|PERMISSIVE|-|4229209e6f64d4e48d6904110dddffa4; wine_answers|wine_answers read|SELECT|{authenticated}|PERMISSIVE|dabdc0e3b678ed52b96d817c5cf9c242|-; wine_answers|wine_answers update|UPDATE|{authenticated}|PERMISSIVE|78ce376a5b0c64d990e91bc2ba0e7675|78ce376a5b0c64d990e91bc2ba0e7675; wines|revealed wines are public|SELECT|{authenticated}|PERMISSIVE|71447085708389003781fb6be6b30a27|-; wines|wines delete host|DELETE|{authenticated}|PERMISSIVE|6d12dabbdee718e6a16f15c6bace7c22|-; wines|wines insert|INSERT|{authenticated}|PERMISSIVE|-|dc3fac83bf593aa43960365c7228c393; wines|wines read|SELECT|{authenticated}|PERMISSIVE|e2796ba8cb83c6376c89d1efd2810538|-; wines|wines update host|UPDATE|{authenticated}|PERMISSIVE|6d12dabbdee718e6a16f15c6bace7c22|6d12dabbdee718e6a16f15c6bace7c22' then
    raise exception 'the policies on wines and wine_answers are not the dumped set: %', v_text;
  end if;

  -- 5. The state this closes: anon, authenticated and service_role hold UPDATE on
  --    every wines column, through the table-level grant only (no column ACL).
  select string_agg(format('%s:%s%s%s', a.attname,
           case when has_column_privilege('authenticated', 'public.wines', a.attname, 'UPDATE') then 'A' else '-' end,
           case when has_column_privilege('anon', 'public.wines', a.attname, 'UPDATE') then 'N' else '-' end,
           case when has_column_privilege('service_role', 'public.wines', a.attname, 'UPDATE') then 'S' else '-' end),
         ' ' order by a.attnum)
    into v_text
  from pg_attribute a where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'id:ANS tasting_id:ANS position:ANS contributor_participant_id:ANS is_revealed:ANS created_at:ANS reveal_step:ANS added_via:ANS revealed_at:ANS' then
    raise exception 'UPDATE on the wines columns is not the dumped state: %', v_text;
  end if;
  select c.relacl::text || ' | ' || coalesce((select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
           from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null), '-')
    into v_text
  from pg_class c where c.oid = 'public.wines'::regclass;
  if v_text is distinct from '{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres} | -' then
    raise exception 'the wines table or column ACL is not the dumped one: %', v_text;
  end if;

  -- 6. The columns the new functions, triggers and policies read, with their
  --    types and nullability (every wines column).
  select string_agg(format('%s.%s %s %s', c.relname, a.attname, t.typname, case when a.attnotnull then 'not null' else 'null' end),
                    '; ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_type t on t.oid = a.atttypid
  where a.attnum > 0 and not a.attisdropped
    and (c.oid = 'public.wines'::regclass
      or (c.oid = 'public.tastings'::regclass and a.attname in ('id', 'host_id', 'status', 'reveal_mode', 'timing_mode', 'wine_source', 'started_at'))
      or (c.oid = 'public.tasting_participants'::regclass and a.attname in ('id', 'user_id'))
      or (c.oid = 'public.guesses'::regclass and a.attname = 'wine_id')
      or (c.oid = 'public.wine_answers'::regclass and a.attname = 'wine_id')
      or (c.oid = 'public.wset_notes'::regclass and a.attname in ('tasting_wine_id', 'catalog_wine_id', 'unidentified_wine_id')));
  if v_text is distinct from 'guesses.wine_id uuid not null; tasting_participants.id uuid not null; tasting_participants.user_id uuid not null; tastings.host_id uuid not null; tastings.id uuid not null; tastings.reveal_mode reveal_mode_type not null; tastings.started_at timestamptz null; tastings.status tasting_status not null; tastings.timing_mode timing_mode not null; tastings.wine_source wine_source_mode not null; wine_answers.wine_id uuid not null; wines.added_via text null; wines.contributor_participant_id uuid null; wines.created_at timestamptz not null; wines.id uuid not null; wines.is_revealed bool not null; wines.position int4 not null; wines.reveal_step int2 not null; wines.revealed_at timestamptz null; wines.tasting_id uuid not null; wset_notes.catalog_wine_id uuid null; wset_notes.tasting_wine_id uuid null; wset_notes.unidentified_wine_id uuid null' then
    raise exception 'the columns M6 reads are not the dumped ones: %', v_text;
  end if;

  -- 7. The enum labels the new functions compare against.
  select string_agg(format('%s=%s', t.typname, (select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
                                                 from pg_enum e where e.enumtypid = t.oid)), '; ' order by t.typname::text collate "C")
    into v_text
  from pg_type t where t.typnamespace = 'public'::regnamespace
    and t.typname in ('tasting_status', 'reveal_mode_type', 'timing_mode', 'wine_source_mode');
  if v_text is distinct from 'reveal_mode_type=BLIND,SEMI_BLIND,OPEN; tasting_status=DRAFT,OPEN,IN_PROGRESS,CLOSED; timing_mode=LIVE,ASYNC; wine_source_mode=HOST_PROVIDES,PARTICIPANT_CONTRIBUTED' then
    raise exception 'the enum labels M6 relies on differ: %', v_text;
  end if;

  -- 8. The triggers on wines (M1's full-reveal step, M3's revealed_at stamp,
  --    the blind-pending unmark, and M5's two, which must be applied first) and
  --    on tastings (M3's lifecycle stamp). The two BEFORE UPDATE bodies on wines
  --    act only on the is_revealed flip (security reasoning: the position
  --    statements wake nothing).
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal;
  if v_text is distinct from 'trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind; wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes; wines_full_reveal_step 19 O wines_full_reveal_step; wines_stamp_revealed_at 23 O wines_stamp_revealed_at; wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal' then
    raise exception 'the triggers on wines are not the dumped set plus M5''s two (apply M5 first): %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.tastings'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle' then
    raise exception 'the triggers on tastings are not the dumped set: %', v_text;
  end if;
  --    M3's tastings_stamp_lifecycle owns tastings.started_at, which the setup
  --    lock reads: now() at Start, kept through every later status change, a
  --    client-sent value replaced. Its live body, and its trigger with no WHEN.
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.tastings_stamp_lifecycle()'))
       is distinct from '5d7702a39d76b3a8b6fd3ddf2d30fe1d'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.tastings'::regclass
                      and t.tgname = 'tastings_stamp_lifecycle'
                      and t.tgfoid = to_regprocedure('public.tastings_stamp_lifecycle()')
                      and t.tgtype = 23 and t.tgenabled = 'O' and t.tgqual is null) then
    raise exception 'tastings_stamp_lifecycle is not the live M3 trigger that owns tastings.started_at, which the setup lock reads';
  end if;
  if (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.wines_full_reveal_step()'))
       is distinct from '5c8215b1df122773ec07058e31337c0e'
     or (select md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.oid = to_regprocedure('public.wines_stamp_revealed_at()'))
       is distinct from 'bf1b359ff2cb2faadef14d3559557e42' then
    raise exception 'wines_full_reveal_step or wines_stamp_revealed_at is not the dumped body';
  end if;

  -- 9. Constraints on wines (the non-deferrable (tasting_id, position) key the
  --    renumbering works around; the contributor FK's SET NULL; the added_via
  --    values) and every foreign key into wines (guesses cascade with a
  --    removed glass).
  select string_agg(format('%s %s%s', c.conname, pg_get_constraintdef(c.oid), case when c.condeferrable then ' DEFERRABLE' else '' end),
                    '; ' order by c.conname::text collate "C")
    into v_text
  from pg_constraint c where c.conrelid = 'public.wines'::regclass;
  if v_text is distinct from 'wines_added_via_check CHECK ((added_via = ANY (ARRAY[''SCAN''::text, ''CATALOG''::text, ''CELLAR''::text, ''BY_HAND''::text]))); wines_contributor_participant_id_fkey FOREIGN KEY (contributor_participant_id) REFERENCES tasting_participants(id) ON DELETE SET NULL; wines_pkey PRIMARY KEY (id); wines_tasting_id_fkey FOREIGN KEY (tasting_id) REFERENCES tastings(id) ON DELETE CASCADE; wines_tasting_id_position_key UNIQUE (tasting_id, "position")' then
    raise exception 'the constraints on wines are not the dumped set: %', v_text;
  end if;
  select string_agg(format('%s.%s %s', c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)),
                    '; ' order by c.conrelid::regclass::text collate "C", c.conname::text collate "C")
    into v_text
  from pg_constraint c where c.confrelid = 'public.wines'::regclass;
  if v_text is distinct from 'guesses.guesses_guessed_wine_id_fkey FOREIGN KEY (guessed_wine_id) REFERENCES wines(id) ON DELETE SET NULL; guesses.guesses_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; tastings.tastings_current_wine_id_fkey FOREIGN KEY (current_wine_id) REFERENCES wines(id) ON DELETE SET NULL; wine_answers.wine_answers_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wine_identity_drafts.wine_identity_drafts_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wine_pour_intents.wine_pour_intents_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wset_notes.wset_notes_tasting_wine_id_fkey FOREIGN KEY (tasting_wine_id) REFERENCES wines(id) ON DELETE SET NULL' then
    raise exception 'the foreign keys into wines are not the dumped set: %', v_text;
  end if;

  -- 10. RLS enabled and not forced (the SECURITY DEFINER functions write as the owner).
  select string_agg(format('%s %s %s', c.relname, c.relrowsecurity, c.relforcerowsecurity), '; ' order by c.relname::text collate "C")
    into v_text
  from pg_class c where c.oid in ('public.wines'::regclass, 'public.wine_answers'::regclass, 'public.tastings'::regclass);
  if v_text is distinct from 'tastings t f; wine_answers t f; wines t f' then
    raise exception 'RLS on wines, wine_answers or tastings is not enabled-and-not-forced: %', v_text;
  end if;

  -- 11. No SECURITY INVOKER function updates or deletes wines: revoking client
  --     UPDATE and replacing the delete policy breaks no function.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p where p.pronamespace = 'public'::regnamespace and not p.prosecdef
    and p.prosrc ~* '(update\s+(only\s+)?(public\.)?wines\M|delete\s+from\s+(only\s+)?(public\.)?wines\M)';
  if v_text is not null then
    raise exception 'a SECURITY INVOKER function writes wines and would break under M6: %', v_text;
  end if;

  -- 12. Data (read-only check 2026-09-13: 0). The backfill classifies a glass
  --     with no contributor as host-added, so no bring-your-own glass may have
  --     lost its contributor.
  select count(*) into v_n
  from public.wines w join public.tastings t on t.id = w.tasting_id
  where t.wine_source = 'PARTICIPANT_CONTRIBUTED' and w.contributor_participant_id is null;
  if v_n <> 0 then
    raise exception '% bring-your-own glasses have a null contributor; M6 would mark them host-added', v_n;
  end if;
end $$;

-- Snapshot of everything this file must leave alone, compared in the post-state.
create temp table m6_pre_functions on commit drop as
  select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body, p.proacl::text as acl,
         p.prosecdef, p.proconfig::text as config, p.provolatile
  from pg_proc p where p.pronamespace = 'public'::regnamespace;
create temp table m6_pre_policies on commit drop as
  select p.tablename::text as tablename, p.policyname::text as policyname, p.cmd, p.roles::text as roles, p.permissive,
         p.qual, p.with_check
  from pg_policies p where p.schemaname = 'public';
create temp table m6_pre_triggers on commit drop as
  select t.tgrelid::regclass::text as tbl, t.tgname::text as tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;
create temp table m6_pre_acls on commit drop as
  select c.relname::text as relname, c.relacl::text as relacl,
         (select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
            from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null) as attacl
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm');

-- ===========================================================================
-- Spec §3.4 (M6 flight_edits_until_first_step), verbatim except one line of
-- tastings_lock_setup_after_start (see "Deviation from the spec block").
-- ===========================================================================
-- 1. Who added a glass is fixed when it is inserted. Nulling
--    contributor_participant_id later (a host's update, or the FK when the
--    contributor's participant row is deleted) no longer turns a contributor's
--    glass into a host-added one.
alter table public.wines add column added_by_host boolean;
update public.wines set added_by_host = (contributor_participant_id is null);
alter table public.wines alter column added_by_host set not null;

create or replace function public.wines_pin_adder()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.added_by_host := (new.contributor_participant_id is null);
  else
    new.added_by_host := old.added_by_host;
  end if;
  return new;
end $$;
create trigger wines_pin_adder
  before insert or update on public.wines
  for each row execute function public.wines_pin_adder();

-- 2. Clients update only position and added_via. is_revealed, reveal_step,
--    contributor_participant_id and tasting_id are written by SECURITY DEFINER
--    functions only (reveal_wine, reveal_next_category, the RPCs below).
revoke update on public.wines from anon, authenticated;
grant update (position, added_via) on public.wines to authenticated;

-- 3. Mode, timing and wine source lock once the tasting has started (§3.3 item 14,
--    in the database). The policies below and §10's semi-blind RPCs branch on
--    reveal_mode, so a host must not be able to flip it mid-tasting.
create or replace function public.tastings_lock_setup_after_start()
returns trigger language plpgsql set search_path = public as $$
begin
  if (old.status <> 'DRAFT' or old.started_at is not null)
     and (new.reveal_mode is distinct from old.reveal_mode
          or new.timing_mode is distinct from old.timing_mode
          or new.wine_source is distinct from old.wine_source) then
    raise exception 'mode, timing and who brings the wines lock once the tasting has started'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger tastings_lock_setup_after_start
  before update of reveal_mode, timing_mode, wine_source on public.tastings
  for each row execute function public.tastings_lock_setup_after_start();

-- 4. The adder, keyed on the pinned flag. Recreated from its live definition;
--    only the host test changes (F10's write path calls it).
create or replace function public.is_wine_adder(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    left join tasting_participants p on p.id = w.contributor_participant_id
    where w.id = p_wine_id
      and ((w.added_by_host and t.host_id = auth.uid())
           or (not w.added_by_host and p.user_id = auth.uid()))
  )
$$;

-- 5. The adder's edit window: one helper for the policies and the RPCs.
--    OPEN (Taste & rate) glasses are inserted already revealed
--    (tasting-wine-writes.ts:281), so OPEN keeps its add path: the adder may
--    write while the tasting is not CLOSED.
create or replace function public.can_edit_flight_glass(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and t.status <> 'CLOSED'
      and public.is_wine_adder(p_wine_id)
      and (t.reveal_mode = 'OPEN' or (not w.is_revealed and w.reveal_step = 0))
  );
$$;

-- Remove: the edit window, or the host for any glass while DRAFT. Never a
-- semi-blind glass after Start (§10.4), and never while a later glass has been
-- revealed or has started its reveal, because removing would renumber it
-- (OPEN boards are exempt: every glass there is revealed).
create or replace function public.can_remove_flight_glass(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from wines w
    join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and (public.can_edit_flight_glass(p_wine_id)
           or (t.status = 'DRAFT' and t.host_id = auth.uid()))
      and not (t.reveal_mode = 'SEMI_BLIND' and t.status <> 'DRAFT')
      and (t.reveal_mode = 'OPEN' or not exists (
            select 1 from wines later
            where later.tasting_id = w.tasting_id
              and later.position > w.position
              and (later.is_revealed or later.reveal_step > 0)))
  );
$$;

-- A direct row delete: the host while DRAFT (deployed removeWine renumbers as
-- the host), or the adder's last glass (F10's undo of a half-added glass).
-- Every other removal goes through remove_flight_glass, which renumbers.
create or replace function public.can_delete_flight_glass_row(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_remove_flight_glass(p_wine_id)
     and exists (
       select 1 from wines w join tastings t on t.id = w.tasting_id
       where w.id = p_wine_id
         and ((t.status = 'DRAFT' and t.host_id = auth.uid())
              or not exists (select 1 from wines later
                             where later.tasting_id = w.tasting_id
                               and later.position > w.position)));
$$;

-- wine_answers: the live policies replaced by the adder's window.
drop policy "wine_answers insert" on public.wine_answers;
create policy "wine_answers insert" on public.wine_answers
  for insert to authenticated
  with check (public.can_edit_flight_glass(wine_id));

drop policy "wine_answers update" on public.wine_answers;
create policy "wine_answers update" on public.wine_answers
  for update to authenticated
  using (public.can_edit_flight_glass(wine_id))
  with check (public.can_edit_flight_glass(wine_id));

-- wines: delete through the helper. Deleting a tasting still cascades
-- (FK cascades do not go through RLS).
drop policy "wines delete host" on public.wines;
create policy "wines delete adder" on public.wines
  for delete to authenticated
  using (public.can_delete_flight_glass_row(id));

-- Remove a glass and close the gap, whoever the adder is.
create or replace function public.remove_flight_glass(p_wine_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting uuid;
begin
  if not public.can_remove_flight_glass(p_wine_id) then
    raise exception 'you cannot remove this glass';
  end if;
  select tasting_id into v_tasting from wines where id = p_wine_id;
  perform 1 from wines where tasting_id = v_tasting for update;
  delete from wines where id = p_wine_id;
  -- Two statements, so the (tasting_id, position) unique constraint never collides.
  with ordered as (
    select id, row_number() over (order by position) as ord
    from wines where tasting_id = v_tasting
  )
  update wines w set position = -o.ord from ordered o where w.id = o.id;
  update wines set position = -position where tasting_id = v_tasting;
end $$;

-- Swap's provenance write: a contributor holds no UPDATE on wines rows.
create or replace function public.set_flight_glass_added_via(p_wine_id uuid, p_added_via text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_edit_flight_glass(p_wine_id)
     or exists (select 1 from wines w join tastings t on t.id = w.tasting_id
                where w.id = p_wine_id and t.reveal_mode = 'SEMI_BLIND' and t.status <> 'DRAFT') then
    raise exception 'you cannot change this glass';
  end if;
  update wines set added_via = p_added_via where id = p_wine_id;
end $$;

-- Reorder atomically. Host only; never renumbers a glass the table has seen.
create or replace function public.move_flight_glass(p_wine_id uuid, p_to_index int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tasting uuid;
  v_ids uuid[];
  v_new uuid[];
begin
  select w.tasting_id into v_tasting from wines w where w.id = p_wine_id;
  if v_tasting is null or not is_tasting_host(v_tasting) then
    raise exception 'only the host can reorder the flight';
  end if;
  if exists (select 1 from tastings where id = v_tasting and status = 'CLOSED') then
    raise exception 'this tasting is finished';
  end if;

  select array_agg(id order by position) into v_ids
  from wines where tasting_id = v_tasting;
  if p_to_index < 1 or p_to_index > coalesce(array_length(v_ids, 1), 0) then
    raise exception 'no such place in the flight';
  end if;

  v_new := array_remove(v_ids, p_wine_id);
  v_new := v_new[1:p_to_index - 1] || p_wine_id || v_new[p_to_index:];

  if exists (
    select 1 from wines w
    where w.tasting_id = v_tasting
      and (w.is_revealed or w.reveal_step > 0)
      and array_position(v_ids, w.id) <> array_position(v_new, w.id)
  ) then
    raise exception 'a glass the table has already seen cannot change its number';
  end if;

  -- Two statements, so the (tasting_id, position) unique constraint never collides.
  update wines set position = -position - 1 where tasting_id = v_tasting;
  update wines w set position = o.ord
  from unnest(v_new) with ordinality as o(id, ord)
  where w.id = o.id;
end $$;

-- What a removal takes with it: counts only (private notes are §9's).
create or replace function public.glass_removal_impact(p_wine_id uuid)
returns table (guesses int, private_notes int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int from guesses g where g.wine_id = p_wine_id),
    (select count(*)::int from wset_notes n
      where n.tasting_wine_id = p_wine_id
        and num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) = 0)
  where public.can_remove_flight_glass(p_wine_id);
$$;

revoke all on function public.wines_pin_adder(), public.tastings_lock_setup_after_start()
  from public, anon, authenticated;
revoke all on function public.can_edit_flight_glass(uuid), public.can_remove_flight_glass(uuid),
  public.can_delete_flight_glass_row(uuid), public.move_flight_glass(uuid, int),
  public.glass_removal_impact(uuid), public.remove_flight_glass(uuid),
  public.set_flight_glass_added_via(uuid, text) from public, anon;
grant execute on function public.can_edit_flight_glass(uuid), public.can_remove_flight_glass(uuid),
  public.can_delete_flight_glass_row(uuid), public.move_flight_glass(uuid, int),
  public.glass_removal_impact(uuid), public.remove_flight_glass(uuid),
  public.set_flight_glass_added_via(uuid, text) to authenticated;
-- ===========================================================================
-- End of spec §3.4.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Post-state (spec §3.4 "Assertions"), same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_n int;
  v_sig text;
  v_expected text;
begin
  -- 1. Every object M6 creates exists.
  select concat_ws(' / ',
     (select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C") from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and p.proname in ('wines_pin_adder', 'tastings_lock_setup_after_start', 'can_edit_flight_glass', 'can_remove_flight_glass',
                           'can_delete_flight_glass_row', 'move_flight_glass', 'remove_flight_glass', 'set_flight_glass_added_via',
                           'glass_removal_impact')),
     (select string_agg(t.tgname, ', ' order by t.tgname::text collate "C") from pg_trigger t
       where t.tgname in ('wines_pin_adder', 'tastings_lock_setup_after_start')),
     (select string_agg(p.policyname, ', ') from pg_policies p where p.schemaname = 'public' and p.tablename = 'wines' and p.policyname = 'wines delete adder'),
     (select 'wines.added_by_host' from pg_attribute a where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host' and not a.attisdropped))
    into v_text;
  if v_text is distinct from 'can_delete_flight_glass_row(uuid), can_edit_flight_glass(uuid), can_remove_flight_glass(uuid), glass_removal_impact(uuid), move_flight_glass(uuid,integer), remove_flight_glass(uuid), set_flight_glass_added_via(uuid,text), tastings_lock_setup_after_start(), wines_pin_adder() / tastings_lock_setup_after_start, wines_pin_adder / wines delete adder / wines.added_by_host' then
    raise exception 'the objects M6 creates are not all present, or others share their names: %', v_text;
  end if;

  -- 2. added_by_host is boolean NOT NULL with no default (the trigger owns it),
  --    and the backfill classified every row: host-added exactly when the glass
  --    has no contributor.
  select string_agg(format('%s.%s %s %s', c.relname, a.attname, t.typname, case when a.attnotnull then 'not null' else 'null' end),
                    '; ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_type t on t.oid = a.atttypid
  where a.attnum > 0 and not a.attisdropped
    and (c.oid = 'public.wines'::regclass
      or (c.oid = 'public.tastings'::regclass and a.attname in ('id', 'host_id', 'status', 'reveal_mode', 'timing_mode', 'wine_source', 'started_at'))
      or (c.oid = 'public.tasting_participants'::regclass and a.attname in ('id', 'user_id'))
      or (c.oid = 'public.guesses'::regclass and a.attname = 'wine_id')
      or (c.oid = 'public.wine_answers'::regclass and a.attname = 'wine_id')
      or (c.oid = 'public.wset_notes'::regclass and a.attname in ('tasting_wine_id', 'catalog_wine_id', 'unidentified_wine_id')));
  if v_text is distinct from 'guesses.wine_id uuid not null; tasting_participants.id uuid not null; tasting_participants.user_id uuid not null; tastings.host_id uuid not null; tastings.id uuid not null; tastings.reveal_mode reveal_mode_type not null; tastings.started_at timestamptz null; tastings.status tasting_status not null; tastings.timing_mode timing_mode not null; tastings.wine_source wine_source_mode not null; wine_answers.wine_id uuid not null; wines.added_by_host bool not null; wines.added_via text null; wines.contributor_participant_id uuid null; wines.created_at timestamptz not null; wines.id uuid not null; wines.is_revealed bool not null; wines.position int4 not null; wines.reveal_step int2 not null; wines.revealed_at timestamptz null; wines.tasting_id uuid not null; wset_notes.catalog_wine_id uuid null; wset_notes.tasting_wine_id uuid null; wset_notes.unidentified_wine_id uuid null' then
    raise exception 'the columns after M6 are not the expected ones: %', v_text;
  end if;
  if exists (select 1 from pg_attribute a where a.attrelid = 'public.wines'::regclass and a.attname = 'added_by_host' and a.atthasdef) then
    raise exception 'wines.added_by_host has a default; the trigger owns it';
  end if;
  select count(*) into v_n from public.wines w where w.added_by_host is distinct from (w.contributor_participant_id is null);
  if v_n <> 0 then
    raise exception '% wines rows have added_by_host different from (contributor_participant_id is null) after the backfill', v_n;
  end if;

  -- 3. wines_pin_adder (BEFORE INSERT OR UPDATE, row) and
  --    tastings_lock_setup_after_start (BEFORE UPDATE OF reveal_mode,
  --    timing_mode, wine_source, row), both enabled, beside the live triggers.
  select string_agg(format('%s %s', t.tgenabled, pg_get_triggerdef(t.oid)), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t where t.tgname in ('wines_pin_adder', 'tastings_lock_setup_after_start') and not t.tgisinternal;
  if v_text is distinct from 'O CREATE TRIGGER tastings_lock_setup_after_start BEFORE UPDATE OF reveal_mode, timing_mode, wine_source ON public.tastings FOR EACH ROW EXECUTE FUNCTION tastings_lock_setup_after_start(); O CREATE TRIGGER wines_pin_adder BEFORE INSERT OR UPDATE ON public.wines FOR EACH ROW EXECUTE FUNCTION wines_pin_adder()' then
    raise exception 'wines_pin_adder or tastings_lock_setup_after_start is not as spec §3.4 defines it: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.wines'::regclass and not t.tgisinternal;
  if v_text is distinct from 'trg_catalog_wine_unmark_blind 17 O catalog_wine_unmark_blind; wines_drop_unresolved_notes 11 O wines_drop_unresolved_notes; wines_full_reveal_step 19 O wines_full_reveal_step; wines_pin_adder 23 O wines_pin_adder; wines_stamp_revealed_at 23 O wines_stamp_revealed_at; wset_notes_resolve_on_reveal 17 O wset_notes_resolve_on_reveal' then
    raise exception 'the triggers on wines after M6 are not the expected set: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'public.tastings'::regclass and not t.tgisinternal;
  if v_text is distinct from 'tastings_lock_setup_after_start 19 O tastings_lock_setup_after_start; tastings_stamp_lifecycle 23 O tastings_stamp_lifecycle' then
    raise exception 'the triggers on tastings after M6 are not the expected set: %', v_text;
  end if;

  -- 4. authenticated holds UPDATE on exactly position and added_via; anon on
  --    none; service_role keeps every column. INSERT, SELECT and DELETE stay
  --    table-level for every role (the relacl string).
  select string_agg(format('%s:%s%s%s', a.attname,
           case when has_column_privilege('authenticated', 'public.wines', a.attname, 'UPDATE') then 'A' else '-' end,
           case when has_column_privilege('anon', 'public.wines', a.attname, 'UPDATE') then 'N' else '-' end,
           case when has_column_privilege('service_role', 'public.wines', a.attname, 'UPDATE') then 'S' else '-' end),
         ' ' order by a.attnum)
    into v_text
  from pg_attribute a where a.attrelid = 'public.wines'::regclass and a.attnum > 0 and not a.attisdropped;
  if v_text is distinct from 'id:--S tasting_id:--S position:A-S contributor_participant_id:--S is_revealed:--S created_at:--S reveal_step:--S added_via:A-S revealed_at:--S added_by_host:--S' then
    raise exception 'UPDATE on the wines columns is not authenticated position+added_via only: %', v_text;
  end if;
  select c.relacl::text || ' | ' || coalesce((select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
           from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null), '-')
    into v_text
  from pg_class c where c.oid = 'public.wines'::regclass;
  if v_text is distinct from '{postgres=arwdDxtm/postgres,anon=ardDxtm/postgres,authenticated=ardDxtm/postgres,service_role=arwdDxtm/postgres} | position={authenticated=w/postgres} added_via={authenticated=w/postgres}' then
    raise exception 'the wines table or column ACL after M6 is not the expected one: %', v_text;
  end if;

  -- 5. The new policy set on both tables: "wine_answers insert" and
  --    "wine_answers update" through can_edit_flight_glass, "wines delete adder"
  --    through can_delete_flight_glass_row; "wine_answers read", "wines insert",
  --    "wines read", "wines update host" and "revealed wines are public" unchanged.
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', p.tablename, p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.tablename::text collate "C", p.policyname::text collate "C")
    into v_text
  from pg_policies p where p.schemaname = 'public' and p.tablename in ('wines', 'wine_answers');
  if v_text is distinct from 'wine_answers|wine_answers insert|INSERT|{authenticated}|PERMISSIVE|-|8f590b9d5d338417fe6b882507446975; wine_answers|wine_answers read|SELECT|{authenticated}|PERMISSIVE|dabdc0e3b678ed52b96d817c5cf9c242|-; wine_answers|wine_answers update|UPDATE|{authenticated}|PERMISSIVE|8f590b9d5d338417fe6b882507446975|8f590b9d5d338417fe6b882507446975; wines|revealed wines are public|SELECT|{authenticated}|PERMISSIVE|71447085708389003781fb6be6b30a27|-; wines|wines delete adder|DELETE|{authenticated}|PERMISSIVE|e8504e16a9a539404d03a4c81866ee48|-; wines|wines insert|INSERT|{authenticated}|PERMISSIVE|-|dc3fac83bf593aa43960365c7228c393; wines|wines read|SELECT|{authenticated}|PERMISSIVE|e2796ba8cb83c6376c89d1efd2810538|-; wines|wines update host|UPDATE|{authenticated}|PERMISSIVE|6d12dabbdee718e6a16f15c6bace7c22|6d12dabbdee718e6a16f15c6bace7c22' then
    raise exception 'the policies on wines and wine_answers after M6 are not the spec §3.4 set: %', v_text;
  end if;
  if (select p.with_check from pg_policies p where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers insert')
       is distinct from 'can_edit_flight_glass(wine_id)'
     or (select p.qual || ' / ' || p.with_check from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'wine_answers' and p.policyname = 'wine_answers update')
       is distinct from 'can_edit_flight_glass(wine_id) / can_edit_flight_glass(wine_id)'
     or (select p.qual from pg_policies p where p.schemaname = 'public' and p.tablename = 'wines' and p.policyname = 'wines delete adder')
       is distinct from 'can_delete_flight_glass_row(id)' then
    raise exception 'a replaced policy does not read exactly its spec §3.4 helper';
  end if;

  -- 6. The ten functions this file creates or recreates: SECURITY DEFINER with
  --    search_path=public for is_wine_adder and the seven helpers and RPCs
  --    (EXECUTE authenticated-only: no PUBLIC, no anon); the two trigger
  --    functions invoker with no client EXECUTE; volatility, language, result,
  --    arguments and the reviewed bodies (md5 without carriage returns).
  --    is_wine_adder keeps its live ACL.
  foreach v_sig in array array[
    'public.is_wine_adder(uuid)', 'public.wines_pin_adder()', 'public.tastings_lock_setup_after_start()',
    'public.can_edit_flight_glass(uuid)', 'public.can_remove_flight_glass(uuid)', 'public.can_delete_flight_glass_row(uuid)',
    'public.remove_flight_glass(uuid)', 'public.set_flight_glass_added_via(uuid,text)', 'public.move_flight_glass(uuid,integer)',
    'public.glass_removal_impact(uuid)'] loop
    select format('secdef=%s config=%s volatile=%s lang=%s returns=%s args=(%s) acl=%s md5=%s',
             p.prosecdef, p.proconfig::text, p.provolatile, l.lanname, pg_get_function_result(p.oid),
             pg_get_function_identity_arguments(p.oid), p.proacl::text, md5(replace(p.prosrc, chr(13), '')))
      into v_text
    from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = to_regprocedure(v_sig);
    v_expected := case v_sig
      when 'public.is_wine_adder(uuid)' then 'secdef=t config={search_path=public} volatile=s lang=sql returns=boolean args=(p_wine_id uuid) acl={=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=465968d5cd9fb36c4e9736994e4677a6'
      when 'public.wines_pin_adder()' then 'secdef=f config={search_path=public} volatile=v lang=plpgsql returns=trigger args=() acl={postgres=X/postgres,service_role=X/postgres} md5=11cc3e61f6b0b3d3834ced2f57115696'
      when 'public.tastings_lock_setup_after_start()' then 'secdef=f config={search_path=public} volatile=v lang=plpgsql returns=trigger args=() acl={postgres=X/postgres,service_role=X/postgres} md5=d7d77729acdda9fa74a3f28da06d1c76'
      when 'public.can_edit_flight_glass(uuid)' then 'secdef=t config={search_path=public} volatile=s lang=sql returns=boolean args=(p_wine_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=6aacec397272d6f516e6a78874edb593'
      when 'public.can_remove_flight_glass(uuid)' then 'secdef=t config={search_path=public} volatile=s lang=sql returns=boolean args=(p_wine_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=4007670477293d2546712945fb3d8d4f'
      when 'public.can_delete_flight_glass_row(uuid)' then 'secdef=t config={search_path=public} volatile=s lang=sql returns=boolean args=(p_wine_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=0d2cca2e61c3efad642635f9e8c64a1e'
      when 'public.remove_flight_glass(uuid)' then 'secdef=t config={search_path=public} volatile=v lang=plpgsql returns=void args=(p_wine_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=a9024e9f26888d86828dbc1b4bde19ba'
      when 'public.set_flight_glass_added_via(uuid,text)' then 'secdef=t config={search_path=public} volatile=v lang=plpgsql returns=void args=(p_wine_id uuid, p_added_via text) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=56b8e5892701b736ef351a5ecf1b1e87'
      when 'public.move_flight_glass(uuid,integer)' then 'secdef=t config={search_path=public} volatile=v lang=plpgsql returns=void args=(p_wine_id uuid, p_to_index integer) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=94c8fce389f3dded21115d09f68b752f'
      when 'public.glass_removal_impact(uuid)' then 'secdef=t config={search_path=public} volatile=s lang=sql returns=TABLE(guesses integer, private_notes integer) args=(p_wine_id uuid) acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} md5=abc8a6f847b0dd87292c3c18505f3ad6'
    end;
    if v_text is distinct from v_expected then
      raise exception '% is not the reviewed function: %', v_sig, v_text;
    end if;
  end loop;
  if exists (
       select 1
       from unnest(array['public.can_edit_flight_glass(uuid)', 'public.can_remove_flight_glass(uuid)',
                         'public.can_delete_flight_glass_row(uuid)', 'public.move_flight_glass(uuid,integer)',
                         'public.glass_removal_impact(uuid)', 'public.remove_flight_glass(uuid)',
                         'public.set_flight_glass_added_via(uuid,text)']) as f(sig)
       where not has_function_privilege('authenticated', f.sig, 'EXECUTE')
          or has_function_privilege('anon', f.sig, 'EXECUTE')
          or has_function_privilege('public', f.sig, 'EXECUTE'))
     or has_function_privilege('authenticated', 'public.wines_pin_adder()', 'EXECUTE')
     or has_function_privilege('anon', 'public.wines_pin_adder()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.tastings_lock_setup_after_start()', 'EXECUTE')
     or has_function_privilege('anon', 'public.tastings_lock_setup_after_start()', 'EXECUTE') then
    raise exception 'EXECUTE is not: the seven helpers and RPCs authenticated only; the two trigger functions no client role';
  end if;

  -- 7. Still no SECURITY INVOKER function writes wines.
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text collate "C")
    into v_text
  from pg_proc p where p.pronamespace = 'public'::regnamespace and not p.prosecdef
    and p.prosrc ~* '(update\s+(only\s+)?(public\.)?wines\M|delete\s+from\s+(only\s+)?(public\.)?wines\M)';
  if v_text is not null then
    raise exception 'a SECURITY INVOKER function writes wines after M6: %', v_text;
  end if;

  -- 8. Everything else is untouched: every other public function (body, ACL,
  --    definer, config, volatility; the scoring engine among them), every other
  --    policy, every other trigger, every other relation's ACL, the constraints
  --    on wines and the foreign keys into it.
  select string_agg(coalesce(pre.sig, cur.sig), ', ' order by coalesce(pre.sig, cur.sig) collate "C")
    into v_text
  from m6_pre_functions pre
  full join (select p.oid, p.oid::regprocedure::text as sig, md5(replace(p.prosrc, chr(13), '')) as body, p.proacl::text as acl,
                    p.prosecdef, p.proconfig::text as config, p.provolatile
             from pg_proc p where p.pronamespace = 'public'::regnamespace) cur on cur.oid = pre.oid
  where coalesce(pre.sig, cur.sig) not in (
          'is_wine_adder(uuid)', 'wines_pin_adder()', 'tastings_lock_setup_after_start()', 'can_edit_flight_glass(uuid)',
          'can_remove_flight_glass(uuid)', 'can_delete_flight_glass_row(uuid)', 'remove_flight_glass(uuid)',
          'set_flight_glass_added_via(uuid,text)', 'move_flight_glass(uuid,integer)', 'glass_removal_impact(uuid)')
    and (pre.oid is null or cur.oid is null
         or (pre.sig, pre.body, pre.acl, pre.prosecdef, pre.config, pre.provolatile)
            is distinct from (cur.sig, cur.body, cur.acl, cur.prosecdef, cur.config, cur.provolatile));
  if v_text is not null then
    raise exception 'M6 changed a function it does not own: %', v_text;
  end if;
  select string_agg(format('%s.%s', coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)), ', ')
    into v_text
  from m6_pre_policies pre
  full join (select p.tablename::text as tablename, p.policyname::text as policyname, p.cmd, p.roles::text as roles, p.permissive,
                    p.qual, p.with_check
             from pg_policies p where p.schemaname = 'public') cur
    on cur.tablename = pre.tablename and cur.policyname = pre.policyname
  where (coalesce(pre.tablename, cur.tablename), coalesce(pre.policyname, cur.policyname)) not in
          (('wine_answers', 'wine_answers insert'), ('wine_answers', 'wine_answers update'),
           ('wines', 'wines delete host'), ('wines', 'wines delete adder'))
    and (pre.policyname is null or cur.policyname is null
         or (pre.cmd, pre.roles, pre.permissive, pre.qual, pre.with_check)
            is distinct from (cur.cmd, cur.roles, cur.permissive, cur.qual, cur.with_check));
  if v_text is not null then
    raise exception 'M6 changed a policy it does not own: %', v_text;
  end if;
  select string_agg(format('%s.%s', coalesce(pre.tbl, cur.tbl), coalesce(pre.tgname, cur.tgname)), ', ')
    into v_text
  from m6_pre_triggers pre
  full join (select t.tgrelid::regclass::text as tbl, t.tgname::text as tgname, t.tgenabled, pg_get_triggerdef(t.oid) as def
             from pg_trigger t join pg_class c on c.oid = t.tgrelid
             where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) cur
    on cur.tbl = pre.tbl and cur.tgname = pre.tgname
  where coalesce(pre.tgname, cur.tgname) not in ('wines_pin_adder', 'tastings_lock_setup_after_start')
    and (pre.tgname is null or cur.tgname is null or (pre.tgenabled, pre.def) is distinct from (cur.tgenabled, cur.def));
  if v_text is not null then
    raise exception 'M6 changed a trigger it does not own: %', v_text;
  end if;
  select string_agg(coalesce(pre.relname, cur.relname), ', ')
    into v_text
  from m6_pre_acls pre
  full join (select c.relname::text as relname, c.relacl::text as relacl,
                    (select string_agg(format('%s=%s', a.attname, a.attacl::text), ' ' order by a.attnum)
                       from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attacl is not null) as attacl
             from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')) cur
    on cur.relname = pre.relname
  where coalesce(pre.relname, cur.relname) <> 'wines'
    and (pre.relname is null or cur.relname is null or (pre.relacl, pre.attacl) is distinct from (cur.relacl, cur.attacl));
  if v_text is not null then
    raise exception 'M6 changed the ACL of a relation other than wines: %', v_text;
  end if;
  select string_agg(format('%s %s%s', c.conname, pg_get_constraintdef(c.oid), case when c.condeferrable then ' DEFERRABLE' else '' end),
                    '; ' order by c.conname::text collate "C")
    into v_text
  from pg_constraint c where c.conrelid = 'public.wines'::regclass;
  if v_text is distinct from 'wines_added_via_check CHECK ((added_via = ANY (ARRAY[''SCAN''::text, ''CATALOG''::text, ''CELLAR''::text, ''BY_HAND''::text]))); wines_contributor_participant_id_fkey FOREIGN KEY (contributor_participant_id) REFERENCES tasting_participants(id) ON DELETE SET NULL; wines_pkey PRIMARY KEY (id); wines_tasting_id_fkey FOREIGN KEY (tasting_id) REFERENCES tastings(id) ON DELETE CASCADE; wines_tasting_id_position_key UNIQUE (tasting_id, "position")' then
    raise exception 'the constraints on wines changed: %', v_text;
  end if;
  select string_agg(format('%s.%s %s', c.conrelid::regclass::text, c.conname, pg_get_constraintdef(c.oid)),
                    '; ' order by c.conrelid::regclass::text collate "C", c.conname::text collate "C")
    into v_text
  from pg_constraint c where c.confrelid = 'public.wines'::regclass;
  if v_text is distinct from 'guesses.guesses_guessed_wine_id_fkey FOREIGN KEY (guessed_wine_id) REFERENCES wines(id) ON DELETE SET NULL; guesses.guesses_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; tastings.tastings_current_wine_id_fkey FOREIGN KEY (current_wine_id) REFERENCES wines(id) ON DELETE SET NULL; wine_answers.wine_answers_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wine_identity_drafts.wine_identity_drafts_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wine_pour_intents.wine_pour_intents_wine_id_fkey FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE CASCADE; wset_notes.wset_notes_tasting_wine_id_fkey FOREIGN KEY (tasting_wine_id) REFERENCES wines(id) ON DELETE SET NULL' then
    raise exception 'the foreign keys into wines changed: %', v_text;
  end if;

  -- Informational.
  select format('wines %s: added_by_host %s, contributor-added %s', count(*), count(*) filter (where w.added_by_host),
                count(*) filter (where not w.added_by_host))
    into v_text
  from public.wines w;
  raise notice 'flight edits until first step: %', v_text;
end $$;
