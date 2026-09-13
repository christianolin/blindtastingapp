-- hidden_glass_notes: a taster's private WSET note on a hidden glass, resolved
-- to that glass's wine at the reveal; no note can tie an unrevealed glass to a
-- wine.
--
-- Blind-tasting v3, M5 (BT-SQL5, hardened before its apply by BT-SQL5x and M5x2): spec
-- §9.4, §9.5, §11.3 item 16 (Save all's minimal notes), §15 M5, §16.1 rows 17,
-- 18, 26 and 26b, §16.2 (a BLIND note carrying a catalog identity and an
-- unrevealed glass's tasting_wine_id is public); ledger B8 (reverses "No WSET
-- note can be written while a glass is locked") and B10 (Save all's notes).
--
-- Written against the LIVE state (read-only dumps, 2026-09-13:
-- .superpowers/blind-tasting/probes/20260914094500-live-defs.sql), never an
-- older migration file:
-- * wset_notes: catalog_wine_id and unidentified_wine_id are nullable and
--   wset_notes_one_identity requires exactly one of them. "wset notes read" is
--   using (true); "wset notes insert", "update" and "delete" are author-only.
--   wset_note_aromas: "wset note aromas read" is using (true); insert, update
--   and delete go through the parent note's author. RLS is enabled, not
--   forced, on both tables.
-- * Triggers on wset_notes: wset_notes_hue_matches_colour
--   (wset_notes_check_hue: BEFORE INSERT OR UPDATE, invoker, WHITE, ROSE and
--   RED branches against catalog_wines.colour only) and
--   wset_notes_set_updated_at. wset_notes_tasting_wine_id_fkey is ON DELETE
--   SET NULL; wset_note_aromas_note_id_fkey is ON DELETE CASCADE.
-- * save_wset_note(jsonb, jsonb): SECURITY INVOKER, search_path=public,
--   Supabase's default function ACL. It never writes unidentified_wine_id, and
--   its update sets catalog_wine_id straight from the payload.
-- * resolve_unidentified_wine(uuid, uuid): SECURITY DEFINER, search_path=public,
--   Supabase's default function ACL. It re-points wine_answers and wset_notes
--   from the unidentified wine to the catalog wine and leaves a note's
--   colour_hue as it is, so wset_notes_check_hue fails the whole resolution
--   when a note's hue does not fit the catalog wine's colour.
-- * Blind marking: catalog_wine_mark_blind fires on wine_answers (AFTER INSERT
--   OR UPDATE OF catalog_wine_id) and ignores a row without a catalog id;
--   catalog_wine_unmark_blind fires on wines (AFTER UPDATE OF is_revealed).
--   Nothing on wset_notes marks anything.
-- * Data: no note carries a tasting_wine_id yet, so none is tied to an
--   unrevealed glass or written by a non-member, and every note has exactly
--   one identity.
-- M1-M3 (20260914090500 ... 20260914092500) are live and M4 (20260914093500)
-- is not. None of them touches these objects: this file applies on live as it
-- is, and after M4 (BT-SQL5x dry-ran it both ways, and its probe's chain phase
-- applies M4 first).
--
-- What this migration does:
-- 1. Spec §9.4's SQL block, verbatim (between the two banners below):
--    * the helpers can_note_tasting_wine (STABLE) and is_tasting_wine_revealed
--      (VOLATILE, so a write policy sees a reveal that committed while the
--      write waited on the glass), both SECURITY DEFINER with EXECUTE for
--      authenticated only; and wset_hue_fits_colour (IMMUTABLE, invoker, the
--      default ACL: the mapping wset_notes_check_hue enforces; ORANGE, and a
--      null hue or colour, fit anything);
--    * wset_notes_one_identity also admits an identity-less BLIND note tied to
--      a tasting glass;
--    * the read, insert and update policies on wset_notes, and the aromas read
--      policy;
--    * on wines: the resolve trigger (AFTER UPDATE OF is_revealed, false ->
--      true) and the unresolved-note delete trigger (BEFORE DELETE);
--    * on wset_notes: wset_notes_glass_move_guard (BEFORE UPDATE OF
--      tasting_wine_id, SECURITY INVOKER: moving a note onto a glass needs the
--      same membership as inserting one there, which RLS cannot check because
--      it cannot see the old glass), and wset_notes_glass_resolve_on_write
--      (BEFORE INSERT OR UPDATE OF tasting_wine_id, SECURITY DEFINER: an
--      identity-less note written onto a revealed glass takes that glass's
--      identity, reading the glass FOR SHARE so a save racing the reveal still
--      attaches, but only for a caller who may note that glass, so a write RLS
--      refuses never holds up a reveal: M5x2);
--    * EXECUTE on all four trigger functions revoked from PUBLIC, anon and
--      authenticated (the triggers still fire).
-- 2. save_wset_note recreated from pg_get_functiondef with exactly the two
--    edits spec §9.4 names: the insert also writes unidentified_wine_id, and
--    the update takes catalog_wine_id and unidentified_wine_id from the payload
--    only while the note has no identity. CREATE OR REPLACE keeps its ACL,
--    SECURITY INVOKER, search_path and volatility (asserted).
-- 3. resolve_unidentified_wine recreated from pg_get_functiondef with exactly
--    the one edit spec §9.4 names: the notes it re-points keep a hue only when
--    it fits the catalog wine's colour, the rule the reveal applies. CREATE OR
--    REPLACE keeps its ACL, SECURITY DEFINER, search_path and volatility
--    (asserted).
--
-- Security (spec §9.4 "Security reasoning", §16):
-- * Rule 1. A note tied to an unrevealed glass carries no identity, whoever
--   writes it: the host, the contributor, a guesser, or a crafted ?blindWine=
--   link. The insert and update policies refuse anything else. An
--   identity-less note is readable by its author only, and its aromas follow
--   it.
-- * Only a JOINED participant or the host of the glass's tasting can insert a
--   note tied to a glass, move a note onto a glass (the move guard), or keep
--   editing a hidden one. An author who has since left can still edit a note
--   on a revealed glass, or detach it, but cannot move it to another glass.
--   The write trigger copies only an identity the glass already shows everyone
--   (it is revealed), and the policies still decide whether the write happens.
-- * The identity arrives inside the reveal's own transaction
--   (wset_notes_resolve_on_reveal), whichever path flips is_revealed:
--   reveal_wine, the last reveal_next_category step, the ASYNC auto-reveal.
--   No reveal function is recreated. score_own_guess never sets is_revealed,
--   so an ASYNC IMMEDIATE guesser's note stays hidden until the glass is
--   revealed for everyone.
-- * A save that races the reveal still attaches (BT-SQL5x). Under READ
--   COMMITTED a save whose statement began before the reveal committed would
--   pass the policies as a hidden note after the reveal's trigger had run,
--   leaving an identity-less note on a revealed glass that nothing resolves.
--   wset_notes_glass_resolve_on_write reads the glass FOR SHARE, which
--   conflicts with the reveal's row lock. So the save either waits for the
--   reveal to commit and copies the identity itself, or commits first and the
--   reveal's trigger sees the note. The policies judge the copied identity
--   through the VOLATILE is_tasting_wine_revealed, whose fresh snapshot sees
--   the committed reveal. An edit that keeps its glass takes no lock: the
--   reveal's trigger reaches that note through its row lock, and locking the
--   glass as well could deadlock with it. That edit re-reads the resolved row,
--   and save_wset_note keeps its identity. The interleavings, with real
--   commits, are replayed on a disposable local cluster by
--   .superpowers/blind-tasting/probes/20260914094500-hidden-notes-race.mjs.
-- * A write RLS refuses never holds up a reveal (M5x2). The write resolve is a
--   BEFORE trigger, so it runs before RLS judges the row, and BT-SQL5x's version
--   took the glass FOR SHARE for every caller: anyone who knew a glass id (an
--   outsider, an INVITED or DECLINED user, anon) could make that glass's reveal,
--   reveal step or position change wait for as long as their refused write ran.
--   It now first returns, with no lock and no identity copied, for a client who
--   may not note the glass: a request whose JWT role is anon or authenticated
--   (the expression auth.role() uses; inside this SECURITY DEFINER function
--   current_user is its owner) from anyone who is neither the host nor JOINED in
--   the glass's tasting (can_note_tasting_wine). The policies then refuse the
--   write as before. service_role, and the owner outside a client request, are
--   not clients: they still lock and attach, and the move guard still refuses
--   their moves. Residual, stated: the gate reads membership with a fresh
--   snapshot and the insert policy with the statement's, so the two disagree
--   only when the writer's own membership is taken away while that write runs.
--   Such a write passes RLS without the lock, and a reveal of that glass that
--   runs before it commits can leave it identity-less on the revealed glass (its
--   author's only, deleted with the glass). After Start M4's leave guard keeps a
--   JOINED row JOINED, so this needs a guest leaving a DRAFT tasting while its
--   host reveals the glass the guest's note is being saved on.
-- * A resolved note cannot be hidden again. On a revealed glass the policies
--   require exactly one identity, save_wset_note neither removes an identity
--   a note already has nor swaps it for the payload's, and an identity-less
--   note written onto a revealed glass takes that glass's identity.
-- * A hue never fails a reveal or a resolution. A hue is judged only against a
--   known colour: the reveal and the write trigger clear one that does not fit
--   the glass's colour (a null colour fits anything), and
--   resolve_unidentified_wine clears one that does not fit the catalog wine it
--   resolves to.
-- * Owner-only callers: the move guard judges membership by auth.uid(), so a
--   caller with no signed-in user (service_role, the owner) cannot move a note
--   onto a glass. No server path re-points a note, and no later migration or
--   repair may do so as the owner.
-- * catalog_wine_mark_blind ignores notes entirely, and a hidden note has no
--   catalog id to appear under in any catalog or public list.
-- * Recursion: the new policies reach wines, tastings and tasting_participants
--   only through the SECURITY DEFINER helpers; the aromas read policy
--   subqueries wset_notes, whose policies reference no tasting table.
-- * Data loss, stated (spec §9.4): removing a glass or deleting a tasting
--   deletes the unresolved notes on it (the FK's SET NULL would otherwise
--   violate wset_notes_one_identity and fail the delete). Resolved notes stay,
--   with tasting_wine_id null.
--
-- Deployed code once applied (after add-wine V2, spec §1.5 and §15). Every path
-- that writes a note with a tasting_wine_id (rg "tastingWineId|tasting_wine_id"
-- src, 2026-09-13) saves through save_wset_note from
-- src/app/catalog/[wineId]/notes/note-editor.tsx, with { catalog_wine_id:
-- wineId, context_kind, tasting_wine_id }:
-- * src/app/tastings/[id]/open-board.tsx (NewNoteModal, context OPEN): OPEN
--   glasses are inserted revealed, and the rater is the host or JOINED. Still
--   accepted.
-- * src/app/catalog/[wineId]/notes/new/page.tsx?blindWine=<glass> (context
--   BLIND). src/app/tastings/[id]/results/page.tsx links it only for revealed
--   glasses (revealedWines), so the linked path is still accepted for the host
--   and JOINED participants. A crafted link to an unrevealed glass, or a save
--   by anyone else, is now refused on save. Spec §9.3 item 5 (BT-N1) turns
--   that into a 404 in the page.
-- * Catalog notes (add-wine-context, catalog-list, the note modal and note
--   page) carry no tasting_wine_id: unchanged. No deployed caller sends
--   unidentified_wine_id, and every editor re-sends the note's own wine, so
--   the update keeping an existing identity changes nothing they do.
--
-- No begin/commit: the applier owns the transaction.

set local lock_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Pre-state: fail closed unless live is what this file was written against.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
  v_n int;
begin
  -- 1. None of the objects M5 creates exists yet: CREATE OR REPLACE would
  --    silently overwrite a function, and a trigger of the same name would fail
  --    the apply halfway.
  select string_agg(p.oid::regprocedure::text, ', ') into v_text
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.proname in ('can_note_tasting_wine', 'is_tasting_wine_revealed', 'wset_hue_fits_colour',
                      'wset_notes_resolve_on_reveal', 'wines_drop_unresolved_notes',
                      'wset_notes_glass_move_guard', 'wset_notes_glass_resolve_on_write');
  if v_text is not null then
    raise exception 'a function M5 creates already exists: %; re-dump and rebuild this migration', v_text;
  end if;
  select string_agg(format('%s on %s', t.tgname, t.tgrelid::regclass), ', ') into v_text
  from pg_trigger t
  where t.tgname in ('wset_notes_resolve_on_reveal', 'wines_drop_unresolved_notes', 'wset_notes_glass_move_guard',
                     'wset_notes_glass_resolve_on_write');
  if v_text is not null then
    raise exception 'a trigger M5 creates already exists: %', v_text;
  end if;

  -- 2. save_wset_note: the dumped body; SECURITY INVOKER, search_path=public,
  --    volatile, plpgsql, returns uuid; Supabase's default function ACL.
  select md5(p.prosrc) as md5, p.prosecdef, p.proconfig::text as config, p.provolatile::text as volatile,
         l.lanname::text as lang, format_type(p.prorettype, null) as rettype,
         pg_get_function_identity_arguments(p.oid) as args, p.proacl::text as acl
    into v_fn
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.save_wset_note(jsonb,jsonb)');
  if not found then
    raise exception 'save_wset_note(jsonb, jsonb) does not exist';
  end if;
  if v_fn.md5 is distinct from '64cb0d9a24a4a5b91ad0a63f30c6252f' then
    raise exception 'save_wset_note is not the dumped live body (md5 %); re-dump and rebuild this migration', v_fn.md5;
  end if;
  if v_fn.prosecdef
     or v_fn.config is distinct from '{search_path=public}'
     or v_fn.volatile is distinct from 'v'
     or v_fn.lang is distinct from 'plpgsql'
     or v_fn.rettype is distinct from 'uuid'
     or v_fn.args is distinct from 'p_note jsonb, p_aromas jsonb'
     or v_fn.acl is distinct from
          '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'save_wset_note attributes differ from the dump: security definer %, config %, volatility %, language %, returns %, arguments (%), acl %',
      v_fn.prosecdef, v_fn.config, v_fn.volatile, v_fn.lang, v_fn.rettype, v_fn.args, v_fn.acl;
  end if;

  -- 2b. resolve_unidentified_wine: the dumped body; SECURITY DEFINER,
  --     search_path=public, volatile, plpgsql, returns void; Supabase's default
  --     function ACL.
  select md5(p.prosrc) as md5, p.prosecdef, p.proconfig::text as config, p.provolatile::text as volatile,
         l.lanname::text as lang, format_type(p.prorettype, null) as rettype,
         pg_get_function_identity_arguments(p.oid) as args, p.proacl::text as acl
    into v_fn
  from pg_proc p
  join pg_language l on l.oid = p.prolang
  where p.oid = to_regprocedure('public.resolve_unidentified_wine(uuid,uuid)');
  if not found then
    raise exception 'resolve_unidentified_wine(uuid, uuid) does not exist';
  end if;
  if v_fn.md5 is distinct from 'a615f723ecd96628c462b295ac3413e7' then
    raise exception 'resolve_unidentified_wine is not the dumped live body (md5 %); re-dump and rebuild this migration', v_fn.md5;
  end if;
  if not v_fn.prosecdef
     or v_fn.config is distinct from '{search_path=public}'
     or v_fn.volatile is distinct from 'v'
     or v_fn.lang is distinct from 'plpgsql'
     or v_fn.rettype is distinct from 'void'
     or v_fn.args is distinct from 'p_unidentified_id uuid, p_catalog_wine_id uuid'
     or v_fn.acl is distinct from
          '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'resolve_unidentified_wine attributes differ from the dump: security definer %, config %, volatility %, language %, returns %, arguments (%), acl %',
      v_fn.prosecdef, v_fn.config, v_fn.volatile, v_fn.lang, v_fn.rettype, v_fn.args, v_fn.acl;
  end if;

  -- 3. The complete policy set on both tables, with the dumped texts as md5:
  --    b326b506... is "true"; f15adfe1... is "(author_id = auth.uid())";
  --    44780e96... is the aromas' EXISTS on the parent note's author. So "wset
  --    notes read" and "wset note aromas read" are using (true), and "wset notes
  --    insert" / "update" are author-only. A further permissive policy would
  --    widen what this file narrows.
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', p.tablename, p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.tablename::text collate "C", p.policyname::text collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('wset_notes', 'wset_note_aromas');
  if v_text is distinct from
       'wset_note_aromas|wset note aromas delete|DELETE|{authenticated}|PERMISSIVE|44780e96f8f273a066ee4f6b0e6b4ad8|-; '
       || 'wset_note_aromas|wset note aromas insert|INSERT|{authenticated}|PERMISSIVE|-|44780e96f8f273a066ee4f6b0e6b4ad8; '
       || 'wset_note_aromas|wset note aromas read|SELECT|{authenticated}|PERMISSIVE|b326b5062b2f0e69046810717534cb09|-; '
       || 'wset_note_aromas|wset note aromas update|UPDATE|{authenticated}|PERMISSIVE|44780e96f8f273a066ee4f6b0e6b4ad8|44780e96f8f273a066ee4f6b0e6b4ad8; '
       || 'wset_notes|wset notes delete|DELETE|{authenticated}|PERMISSIVE|f15adfe1ab934c9cac79112f6685b89a|-; '
       || 'wset_notes|wset notes insert|INSERT|{authenticated}|PERMISSIVE|-|f15adfe1ab934c9cac79112f6685b89a; '
       || 'wset_notes|wset notes read|SELECT|{authenticated}|PERMISSIVE|b326b5062b2f0e69046810717534cb09|-; '
       || 'wset_notes|wset notes update|UPDATE|{authenticated}|PERMISSIVE|f15adfe1ab934c9cac79112f6685b89a|f15adfe1ab934c9cac79112f6685b89a' then
    raise exception 'the policies on wset_notes and wset_note_aromas are not the dumped set: %', v_text;
  end if;

  -- 4. wset_notes_one_identity as dumped.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from 'CHECK ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1))' then
    raise exception 'wset_notes_one_identity is not the dumped constraint';
  end if;

  -- 5. The columns the constraint, the policies, the helpers and the triggers
  --    read, with their types and nullability.
  select string_agg(format('%s.%s %s %s', c.relname, a.attname, t.typname,
                           case when a.attnotnull then 'not null' else 'null' end),
                    '; ' order by c.relname::text collate "C", a.attname::text collate "C")
    into v_text
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_type t on t.oid = a.atttypid
  where a.attnum > 0 and not a.attisdropped
    and ((c.oid = 'public.wset_notes'::regclass
          and a.attname in ('author_id', 'catalog_wine_id', 'unidentified_wine_id', 'tasting_wine_id',
                            'context_kind', 'colour_hue'))
      or (c.oid = 'public.wine_answers'::regclass and a.attname in ('wine_id', 'catalog_wine_id', 'unidentified_wine_id'))
      or (c.oid = 'public.catalog_wines'::regclass and a.attname = 'colour')
      or (c.oid = 'public.catalog_wines_unidentified'::regclass and a.attname = 'colour')
      or (c.oid = 'public.wines'::regclass and a.attname in ('id', 'tasting_id', 'is_revealed'))
      or (c.oid = 'public.tastings'::regclass and a.attname in ('id', 'host_id'))
      or (c.oid = 'public.tasting_participants'::regclass and a.attname in ('tasting_id', 'user_id', 'status')));
  if v_text is distinct from
       'catalog_wines.colour wine_colour not null; '
       || 'catalog_wines_unidentified.colour wine_colour null; '
       || 'tasting_participants.status participant_status not null; '
       || 'tasting_participants.tasting_id uuid not null; '
       || 'tasting_participants.user_id uuid not null; '
       || 'tastings.host_id uuid not null; '
       || 'tastings.id uuid not null; '
       || 'wine_answers.catalog_wine_id uuid null; '
       || 'wine_answers.unidentified_wine_id uuid null; '
       || 'wine_answers.wine_id uuid not null; '
       || 'wines.id uuid not null; '
       || 'wines.is_revealed bool not null; '
       || 'wines.tasting_id uuid not null; '
       || 'wset_notes.author_id uuid not null; '
       || 'wset_notes.catalog_wine_id uuid null; '
       || 'wset_notes.colour_hue wset_colour_hue null; '
       || 'wset_notes.context_kind wset_note_context not null; '
       || 'wset_notes.tasting_wine_id uuid null; '
       || 'wset_notes.unidentified_wine_id uuid null' then
    raise exception 'the columns M5 reads are not the dumped ones: %', v_text;
  end if;

  -- 6. The enum labels wset_hue_fits_colour spells out, and the BLIND context.
  select string_agg(format('%s=%s', t.typname,
                           (select string_agg(e.enumlabel::text, ',' order by e.enumsortorder)
                            from pg_enum e where e.enumtypid = t.oid)),
                    '; ' order by t.typname::text collate "C")
    into v_text
  from pg_type t
  where t.typnamespace = 'public'::regnamespace
    and t.typname in ('wine_colour', 'wset_colour_hue', 'wset_note_context', 'participant_status');
  if v_text is distinct from
       'participant_status=INVITED,JOINED,DECLINED; '
       || 'wine_colour=WHITE,ROSE,RED,ORANGE; '
       || 'wset_colour_hue=LEMON_GREEN,LEMON,GOLD,AMBER,BROWN,PINK,SALMON,ORANGE,PURPLE,RUBY,GARNET,TAWNY; '
       || 'wset_note_context=OPEN,BLIND,TRAINING' then
    raise exception 'the enum labels M5 relies on differ: %', v_text;
  end if;

  -- 7. The triggers on wset_notes (the resolve trigger's UPDATE fires them), and
  --    the bodies the security reasoning relies on: wset_notes_check_hue
  --    (wset_hue_fits_colour mirrors it), catalog_wine_mark_blind (fires on
  --    wine_answers only; ignores a row without a catalog id) and
  --    catalog_wine_unmark_blind.
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'wset_notes_hue_matches_colour 23 O wset_notes_check_hue; wset_notes_set_updated_at 19 O set_updated_at' then
    raise exception 'the triggers on wset_notes are not the dumped set: %', v_text;
  end if;
  select string_agg(format('%s.%s', c.relname, t.tgname), ', ' order by c.relname::text collate "C") into v_text
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where t.tgfoid = to_regprocedure('public.catalog_wine_mark_blind()');
  if v_text is distinct from 'wine_answers.trg_catalog_wine_mark_blind' then
    raise exception 'catalog_wine_mark_blind fires somewhere other than wine_answers: %', v_text;
  end if;
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.wset_notes_check_hue()'))
       is distinct from '6e31755ea4f95ddc02bd0ed40e275166'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_mark_blind()'))
       is distinct from '08dc5499a57fda78eda6e6ac31ac9f9d'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_unmark_blind()'))
       is distinct from 'f9e3bf5208ceddd18a9b334c585965cc' then
    raise exception 'wset_notes_check_hue, catalog_wine_mark_blind or catalog_wine_unmark_blind is not the dumped body';
  end if;

  -- 8. Foreign keys: a deleted glass sets tasting_wine_id null (which the
  --    delete trigger must pre-empt for hidden notes); a deleted note takes its
  --    aromas.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_tasting_wine_id_fkey')
       is distinct from 'FOREIGN KEY (tasting_wine_id) REFERENCES wines(id) ON DELETE SET NULL'
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.wset_note_aromas'::regclass and c.conname = 'wset_note_aromas_note_id_fkey')
       is distinct from 'FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE' then
    raise exception 'wset_notes_tasting_wine_id_fkey or wset_note_aromas_note_id_fkey is not the dumped definition';
  end if;

  -- 9. RLS enabled and not forced on both tables (the SECURITY DEFINER triggers
  --    write wset_notes as the owner).
  if exists (select 1 from pg_class c
             where c.oid in ('public.wset_notes'::regclass, 'public.wset_note_aromas'::regclass)
               and (not c.relrowsecurity or c.relforcerowsecurity)) then
    raise exception 'RLS on wset_notes or wset_note_aromas is disabled or forced';
  end if;

  -- 10. Data (read-only checks 2026-09-13: 0, 0 and 0). No note is tied to an
  --     unrevealed glass (the new policies would otherwise sit on top of a
  --     published glass-to-wine mapping). None is tied to a glass whose tasting
  --     its author neither hosts nor is JOINED in. Every note has exactly one
  --     identity.
  select count(*) into v_n
  from public.wset_notes n
  join public.wines w on w.id = n.tasting_wine_id
  where not w.is_revealed;
  if v_n <> 0 then
    raise exception '% notes are tied to an unrevealed glass; resolve them before applying M5', v_n;
  end if;
  select count(*) into v_n
  from public.wset_notes n
  join public.wines w on w.id = n.tasting_wine_id
  join public.tastings t on t.id = w.tasting_id
  where n.author_id is distinct from t.host_id
    and not exists (select 1 from public.tasting_participants p
                    where p.tasting_id = t.id and p.user_id = n.author_id and p.status = 'JOINED');
  if v_n <> 0 then
    raise exception '% notes are tied to a glass whose tasting their author neither hosts nor is JOINED in', v_n;
  end if;
  select count(*) into v_n
  from public.wset_notes n
  where num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) <> 1;
  if v_n <> 0 then
    raise exception '% notes do not carry exactly one identity', v_n;
  end if;
end $$;

-- ===========================================================================
-- Spec §9.4 (M5 hidden_glass_notes), verbatim.
-- ===========================================================================
-- May the caller attach a note to this tasting glass? JOINED participant or host of its tasting.
create or replace function public.can_note_tasting_wine(p_wine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from wines w join tastings t on t.id = w.tasting_id
    where w.id = p_wine_id
      and (t.host_id = auth.uid()
           or exists (select 1 from tasting_participants p
                      where p.tasting_id = t.id and p.user_id = auth.uid()
                        and p.status = 'JOINED'))
  );
$$;

-- Is this glass revealed? VOLATILE on purpose: every call reads with a fresh
-- snapshot, so the write policies below see a reveal that committed while the
-- write was waiting on the glass (wset_notes_glass_resolve_on_write). A STABLE
-- helper would judge that row by the statement's older snapshot and refuse it.
create or replace function public.is_tasting_wine_revealed(p_wine_id uuid)
returns boolean language sql volatile security definer set search_path = public as $$
  select coalesce((select is_revealed from wines where id = p_wine_id), false);
$$;

-- Does a hue fit a wine colour? The same mapping wset_notes_check_hue enforces.
create or replace function public.wset_hue_fits_colour(p_hue wset_colour_hue, p_colour wine_colour)
returns boolean language sql immutable set search_path = public as $$
  select p_hue is null or p_colour is null or case p_colour
    when 'WHITE' then p_hue in ('LEMON_GREEN', 'LEMON', 'GOLD', 'AMBER', 'BROWN')
    when 'ROSE'  then p_hue in ('PINK', 'SALMON', 'ORANGE')
    when 'RED'   then p_hue in ('PURPLE', 'RUBY', 'GARNET', 'TAWNY', 'BROWN')
    else true
  end;
$$;

alter table public.wset_notes drop constraint wset_notes_one_identity;
alter table public.wset_notes add constraint wset_notes_one_identity check (
  num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
  or (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
      and tasting_wine_id is not null
      and context_kind = 'BLIND')
);

drop policy "wset notes read" on public.wset_notes;
create policy "wset notes read" on public.wset_notes
  for select to authenticated
  using (num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1 or author_id = auth.uid());

-- A note tied to a tasting glass: on an unrevealed glass only an identity-less
-- BLIND note, so no note can publish a glass-to-wine mapping; on a revealed glass
-- only an identity-bearing note. Writing one needs the caller to be JOINED in, or
-- the host of, that tasting.
drop policy "wset notes insert" on public.wset_notes;
create policy "wset notes insert" on public.wset_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (tasting_wine_id is null
         or (public.can_note_tasting_wine(tasting_wine_id)
             and case when public.is_tasting_wine_revealed(tasting_wine_id)
                      then num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                      else num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
                           and context_kind = 'BLIND'
                 end))
  );

-- Updates keep the same shape rules. Membership is re-checked only for a hidden
-- note, so an author who later left the tasting can still edit a note on a revealed glass.
drop policy "wset notes update" on public.wset_notes;
create policy "wset notes update" on public.wset_notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (tasting_wine_id is null
         or case when public.is_tasting_wine_revealed(tasting_wine_id)
                 then num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                 else num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0
                      and context_kind = 'BLIND'
                      and public.can_note_tasting_wine(tasting_wine_id)
            end)
  );

drop policy "wset note aromas read" on public.wset_note_aromas;
create policy "wset note aromas read" on public.wset_note_aromas
  for select to authenticated
  using (exists (select 1 from wset_notes n where n.id = wset_note_aromas.note_id));

-- save_wset_note, recreated from its live definition with two edits. It stays
-- SECURITY INVOKER: the policies above still decide every write.
--   insert: also writes unidentified_wine_id = (p_note->>'unidentified_wine_id')::uuid
--   update: the identity takes the payload only while the note has none, so a sheet
--           opened before the reveal can never null what the resolve trigger set:
--     catalog_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
--                            then catalog_wine_id
--                            else (p_note->>'catalog_wine_id')::uuid end,
--     unidentified_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
--                                 then unidentified_wine_id
--                                 else (p_note->>'unidentified_wine_id')::uuid end,

-- resolve_unidentified_wine, recreated from its live definition with one edit. A
-- hue is judged only against a known colour (wset_hue_fits_colour, and
-- wset_notes_check_hue, which reads catalog_wines only), so a note on an
-- unidentified wine may hold any hue: that wine may have no colour, and no write
-- checks its colour. When the wine resolves to a catalog wine, its notes keep a
-- hue only when it fits that wine's colour (the reveal's rule), so a taster's hue
-- can never fail the resolution. It stays SECURITY DEFINER with its live checks:
--   update wset_notes
--     set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null,
--         colour_hue = case when public.wset_hue_fits_colour(colour_hue,
--                                  (select cw.colour from catalog_wines cw where cw.id = p_catalog_wine_id))
--                           then colour_hue end
--     where unidentified_wine_id = p_unidentified_id;

-- At the reveal every hidden note on the glass takes the glass's identity,
-- and a hue that does not fit the revealed colour is cleared so the reveal
-- can never fail on a taster's colour guess.
create or replace function public.wset_notes_resolve_on_reveal()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update wset_notes n
     set catalog_wine_id = a.catalog_wine_id,
         unidentified_wine_id = a.unidentified_wine_id,
         colour_hue = case
           when public.wset_hue_fits_colour(n.colour_hue, coalesce(cw.colour, u.colour))
           then n.colour_hue
         end
    from wine_answers a
    left join catalog_wines cw on cw.id = a.catalog_wine_id
    left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
   where a.wine_id = new.id
     and n.tasting_wine_id = new.id
     and num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) = 0;
  return null;
end $$;
create trigger wset_notes_resolve_on_reveal
  after update of is_revealed on public.wines
  for each row when (new.is_revealed and not old.is_revealed)
  execute function public.wset_notes_resolve_on_reveal();

-- A deleted glass (Remove, or a deleted tasting) takes its unresolved notes
-- with it: they have no identity to keep, and the FK's "set null" would
-- otherwise violate wset_notes_one_identity and fail the delete.
create or replace function public.wines_drop_unresolved_notes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from wset_notes
   where tasting_wine_id = old.id
     and num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0;
  return old;
end $$;
create trigger wines_drop_unresolved_notes
  before delete on public.wines
  for each row execute function public.wines_drop_unresolved_notes();

-- Moving a note onto a glass needs the same membership as inserting one there.
-- The update policy re-checks membership only for a hidden note, and RLS cannot
-- compare a row's new tasting_wine_id with its old one, so without this guard an
-- author could point a catalog note at any revealed glass: by an update, or
-- through save_wset_note, whose update sets tasting_wine_id = coalesce(payload,
-- current). An edit that keeps the glass (by an author since set DECLINED too), a
-- detach to null (the FK's SET NULL) and the resolve paths, which never set
-- tasting_wine_id, still pass. Membership is by auth.uid(), so a caller with no
-- signed-in user (service_role, the owner) cannot move a note onto a glass either:
-- no later migration or repair may re-point notes as the owner.
create or replace function public.wset_notes_glass_move_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.tasting_wine_id is not null
     and new.tasting_wine_id is distinct from old.tasting_wine_id then
    if not public.can_note_tasting_wine(new.tasting_wine_id) then
      raise exception 'a note can only be tied to a glass of a tasting you host or have joined'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger wset_notes_glass_move_guard
  before update of tasting_wine_id on public.wset_notes
  for each row execute function public.wset_notes_glass_move_guard();

-- A note written without an identity onto a glass that is already revealed takes
-- that glass's identity as it is written, by the reveal's rule: the answer's
-- catalog (or unidentified) wine, and a hue that does not fit its colour cleared.
-- FOR SHARE waits for a reveal that is flipping the glass right now and then reads
-- the committed row, so a save that races a reveal still attaches: either the
-- reveal commits first and this copies the identity, or this write commits first
-- and the reveal's own trigger resolves the note. It runs for an insert and for an
-- update that moves the note to another glass. An edit that keeps its glass takes
-- no lock: the reveal's trigger reaches that note through its row, and a lock here
-- could deadlock with it. Nor does a client who may not note the glass: this runs
-- before RLS judges the row, so a refused write would otherwise hold up that
-- glass's reveal, reveal step or position change for as long as it ran. A client is
-- a request whose JWT role is anon or authenticated (the expression auth.role()
-- uses; current_user is this function's owner here). One who is neither the host
-- nor JOINED in the glass's tasting gets no lock and no identity, and the policies
-- refuse the write. service_role, and the owner outside a client request, still
-- lock and attach. Membership stays the policies' and the move guard's job; by name
-- this fires after the move guard and before the hue check.
create or replace function public.wset_notes_glass_resolve_on_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_revealed boolean;
  v_catalog_wine_id uuid;
  v_unidentified_wine_id uuid;
  v_colour wine_colour;
begin
  if new.tasting_wine_id is null
     or num_nonnulls(new.catalog_wine_id, new.unidentified_wine_id) <> 0 then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tasting_wine_id is not distinct from old.tasting_wine_id then
      return new;
    end if;
  end if;
  -- A client who may not note this glass: no lock, no identity; RLS refuses it.
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
              nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
              '') in ('anon', 'authenticated')
     and not public.can_note_tasting_wine(new.tasting_wine_id) then
    return new;
  end if;
  select w.is_revealed into v_revealed
    from wines w
   where w.id = new.tasting_wine_id
     for share;
  if coalesce(v_revealed, false) then
    select a.catalog_wine_id, a.unidentified_wine_id, coalesce(cw.colour, u.colour)
      into v_catalog_wine_id, v_unidentified_wine_id, v_colour
      from wine_answers a
      left join catalog_wines cw on cw.id = a.catalog_wine_id
      left join catalog_wines_unidentified u on u.id = a.unidentified_wine_id
     where a.wine_id = new.tasting_wine_id;
    if found then
      new.catalog_wine_id := v_catalog_wine_id;
      new.unidentified_wine_id := v_unidentified_wine_id;
      new.colour_hue := case when public.wset_hue_fits_colour(new.colour_hue, v_colour)
                             then new.colour_hue end;
    end if;
  end if;
  return new;
end $$;
create trigger wset_notes_glass_resolve_on_write
  before insert or update of tasting_wine_id on public.wset_notes
  for each row execute function public.wset_notes_glass_resolve_on_write();

revoke all on function public.can_note_tasting_wine(uuid), public.is_tasting_wine_revealed(uuid)
  from public, anon;
grant execute on function public.can_note_tasting_wine(uuid), public.is_tasting_wine_revealed(uuid)
  to authenticated;
-- Trigger functions: no client role may call them; the triggers still fire.
revoke execute on function public.wset_notes_resolve_on_reveal(), public.wines_drop_unresolved_notes(),
  public.wset_notes_glass_move_guard(), public.wset_notes_glass_resolve_on_write()
  from public, anon, authenticated;
-- ===========================================================================
-- End of spec §9.4.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- save_wset_note, recreated from its live pg_get_functiondef (the dump) with
-- exactly the two edits spec §9.4 names:
-- * update: catalog_wine_id and unidentified_wine_id take the payload only
--   while the note has no identity. This replaces the single line
--   "catalog_wine_id = (p_note->>'catalog_wine_id')::uuid,", so a sheet
--   opened before the reveal can never null what the resolve trigger set.
-- * insert: also writes unidentified_wine_id, in the column list and the
--   values.
-- Everything else is the live body. It stays SECURITY INVOKER with
-- search_path=public, and CREATE OR REPLACE keeps its ACL; the policies above
-- decide every write it makes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_wset_note(p_note jsonb, p_aromas jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := coalesce((p_note->>'id')::uuid, gen_random_uuid());
begin
  if exists (
    select 1 from wset_notes where id = v_id and author_id = auth.uid()
  ) then
    update wset_notes set
      catalog_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                             then catalog_wine_id
                             else (p_note->>'catalog_wine_id')::uuid end,
      unidentified_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1
                                  then unidentified_wine_id
                                  else (p_note->>'unidentified_wine_id')::uuid end,
      context_kind = coalesce((p_note->>'context_kind')::wset_note_context, context_kind),
      tasting_wine_id = coalesce((p_note->>'tasting_wine_id')::uuid, tasting_wine_id),
      tasted_on = coalesce((p_note->>'tasted_on')::date, tasted_on),
      clarity = (p_note->>'clarity')::wset_clarity,
      appearance_intensity =
        (p_note->>'appearance_intensity')::wset_appearance_intensity,
      colour_hue = (p_note->>'colour_hue')::wset_colour_hue,
      observations = coalesce(
        (select array_agg(x::wset_observation)
         from jsonb_array_elements_text(p_note->'observations') x), '{}'),
      condition = (p_note->>'condition')::wset_condition,
      faults = coalesce(
        (select array_agg(x::wset_fault)
         from jsonb_array_elements_text(p_note->'faults') x), '{}'),
      nose_intensity = (p_note->>'nose_intensity')::wset_intensity,
      development = (p_note->>'development')::wset_development,
      sweetness = (p_note->>'sweetness')::wset_sweetness,
      acidity = (p_note->>'acidity')::wset_level,
      tannin = (p_note->>'tannin')::wset_level,
      tannin_nature = coalesce(
        (select array_agg(x::wset_tannin_nature)
         from jsonb_array_elements_text(p_note->'tannin_nature') x), '{}'),
      alcohol = (p_note->>'alcohol')::wset_level,
      body = (p_note->>'body')::wset_body,
      mousse = (p_note->>'mousse')::wset_mousse,
      flavour_intensity = (p_note->>'flavour_intensity')::wset_intensity,
      finish = (p_note->>'finish')::wset_finish,
      quality_score = (p_note->>'quality_score')::smallint,
      price_category = (p_note->>'price_category')::wset_price_category,
      readiness = (p_note->>'readiness')::wset_readiness,
      taster_notes = coalesce(p_note->>'taster_notes', '')
    where id = v_id;
  else
    insert into wset_notes (
      id, catalog_wine_id, unidentified_wine_id, context_kind, tasting_wine_id, author_id, tasted_on,
      clarity, appearance_intensity, colour_hue, observations, condition,
      faults, nose_intensity, development, sweetness, acidity, tannin,
      tannin_nature, alcohol, body, mousse, flavour_intensity, finish,
      quality_score, price_category, readiness, taster_notes
    )
    values (
      v_id,
      (p_note->>'catalog_wine_id')::uuid,
      (p_note->>'unidentified_wine_id')::uuid,
      coalesce((p_note->>'context_kind')::wset_note_context, 'OPEN'),
      (p_note->>'tasting_wine_id')::uuid,
      auth.uid(),
      coalesce((p_note->>'tasted_on')::date, current_date),
      (p_note->>'clarity')::wset_clarity,
      (p_note->>'appearance_intensity')::wset_appearance_intensity,
      (p_note->>'colour_hue')::wset_colour_hue,
      coalesce(
        (select array_agg(x::wset_observation)
         from jsonb_array_elements_text(p_note->'observations') x), '{}'),
      (p_note->>'condition')::wset_condition,
      coalesce(
        (select array_agg(x::wset_fault)
         from jsonb_array_elements_text(p_note->'faults') x), '{}'),
      (p_note->>'nose_intensity')::wset_intensity,
      (p_note->>'development')::wset_development,
      (p_note->>'sweetness')::wset_sweetness,
      (p_note->>'acidity')::wset_level,
      (p_note->>'tannin')::wset_level,
      coalesce(
        (select array_agg(x::wset_tannin_nature)
         from jsonb_array_elements_text(p_note->'tannin_nature') x), '{}'),
      (p_note->>'alcohol')::wset_level,
      (p_note->>'body')::wset_body,
      (p_note->>'mousse')::wset_mousse,
      (p_note->>'flavour_intensity')::wset_intensity,
      (p_note->>'finish')::wset_finish,
      (p_note->>'quality_score')::smallint,
      (p_note->>'price_category')::wset_price_category,
      (p_note->>'readiness')::wset_readiness,
      coalesce(p_note->>'taster_notes', '')
    );
  end if;

  delete from wset_note_aromas where note_id = v_id;
  insert into wset_note_aromas (note_id, term_id, sensed_on_nose, sensed_on_palate)
  select
    v_id,
    (a->>'term_id')::uuid,
    coalesce((a->>'sensed_on_nose')::boolean, false),
    coalesce((a->>'sensed_on_palate')::boolean, false)
  from jsonb_array_elements(coalesce(p_aromas, '[]'::jsonb)) as a;

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- resolve_unidentified_wine, recreated from its live pg_get_functiondef (the
-- dump) with exactly the one edit spec §9.4 names: the notes it re-points onto
-- the catalog wine keep a hue only when it fits that wine's colour
-- (wset_hue_fits_colour, the rule the reveal applies), so a hue a note took on
-- while its wine was unidentified can never fail the resolution. Everything
-- else is the live body. It stays SECURITY DEFINER with search_path=public, and
-- CREATE OR REPLACE keeps its ACL (asserted).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_unidentified_wine(p_unidentified_id uuid, p_catalog_wine_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_is_curator boolean;
begin
  select created_by into v_created_by
  from catalog_wines_unidentified where id = p_unidentified_id;
  if v_created_by is null then
    raise exception 'unidentified wine % not found', p_unidentified_id;
  end if;

  select coalesce(is_curator, false) into v_is_curator from profiles where id = v_uid;
  if v_uid is null or (v_uid <> v_created_by and not coalesce(v_is_curator, false)) then
    raise exception 'not authorised to resolve this wine';
  end if;

  if not exists (
    select 1 from catalog_wines where id = p_catalog_wine_id and merged_into is null
  ) then
    raise exception 'target catalog wine % not found', p_catalog_wine_id;
  end if;

  update wine_answers
    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null
    where unidentified_wine_id = p_unidentified_id;
  update wset_notes
    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null,
        colour_hue = case when public.wset_hue_fits_colour(colour_hue,
                                 (select cw.colour from catalog_wines cw where cw.id = p_catalog_wine_id))
                          then colour_hue end
    where unidentified_wine_id = p_unidentified_id;
  update catalog_wines_unidentified
    set resolved_into_catalog_wine_id = p_catalog_wine_id, updated_at = now()
    where id = p_unidentified_id;
end $function$;

-- ---------------------------------------------------------------------------
-- Post-state, same transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_text text;
  v_fn record;
  v_n int;
begin
  -- 1. The seven new functions and the two recreated ones: attributes, bodies
  --    (md5 of the text as written in this file, carriage returns removed) and
  --    EXECUTE holders. The helpers are SECURITY DEFINER with search_path=public
  --    and EXECUTE for authenticated (plus the owner and service_role);
  --    can_note_tasting_wine is STABLE and is_tasting_wine_revealed VOLATILE;
  --    wset_hue_fits_colour is IMMUTABLE with the default ACL; no trigger
  --    function is callable by a client role; save_wset_note is still SECURITY
  --    INVOKER and resolve_unidentified_wine still SECURITY DEFINER, both with
  --    the default ACL.
  for v_fn in
    select s.sig, s.secdef, s.config, s.volatile, s.lang, s.rettype, s.args, s.body_md5, s.grantees,
           p.oid, p.prosecdef, p.proconfig::text as config_now, p.provolatile::text as volatile_now,
           l.lanname::text as lang_now, format_type(p.prorettype, null) as rettype_now,
           pg_get_function_identity_arguments(p.oid) as args_now,
           md5(replace(p.prosrc, chr(13), '')) as md5_now,
           (select string_agg(x.g, ',' order by x.g collate "C")
            from (select distinct case when a.grantee = 0 then 'PUBLIC'
                                       when a.grantee = p.proowner then 'OWNER'
                                       else pg_get_userbyid(a.grantee)::text end as g
                  from aclexplode(p.proacl) a
                  where a.privilege_type = 'EXECUTE') x) as grantees_now
    from (values
      ('public.can_note_tasting_wine(uuid)', true, '{search_path=public}', 's', 'sql', 'boolean',
       'p_wine_id uuid', 'a00510361d87a2361be2a01a6f4d03fd', 'OWNER,authenticated,service_role'),
      ('public.is_tasting_wine_revealed(uuid)', true, '{search_path=public}', 'v', 'sql', 'boolean',
       'p_wine_id uuid', '2f7c57ceac063efc36c01c08cfa87d98', 'OWNER,authenticated,service_role'),
      ('public.wset_hue_fits_colour(wset_colour_hue,wine_colour)', false, '{search_path=public}', 'i', 'sql', 'boolean',
       'p_hue wset_colour_hue, p_colour wine_colour', '96339c7d5a5a84074ffc33db8e89d6ba',
       'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.wset_notes_resolve_on_reveal()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger',
       '', 'f406623e9d46feb1f1aa0fb8c285529d', 'OWNER,service_role'),
      ('public.wines_drop_unresolved_notes()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger',
       '', 'adb5d9b44b1df4797afea832f1fccbf6', 'OWNER,service_role'),
      ('public.wset_notes_glass_move_guard()', false, '{search_path=public}', 'v', 'plpgsql', 'trigger',
       '', '172509fd276619b608499b9c5e80caf0', 'OWNER,service_role'),
      ('public.wset_notes_glass_resolve_on_write()', true, '{search_path=public}', 'v', 'plpgsql', 'trigger',
       '', '56a9ee62bbb11949f27debe1dda2e28d', 'OWNER,service_role'),
      ('public.save_wset_note(jsonb,jsonb)', false, '{search_path=public}', 'v', 'plpgsql', 'uuid',
       'p_note jsonb, p_aromas jsonb', '9ac29b18bbda5b08bcd9a12e19beb932', 'OWNER,PUBLIC,anon,authenticated,service_role'),
      ('public.resolve_unidentified_wine(uuid,uuid)', true, '{search_path=public}', 'v', 'plpgsql', 'void',
       'p_unidentified_id uuid, p_catalog_wine_id uuid', '915e17733e5f48577fbf777fdcd81af8',
       'OWNER,PUBLIC,anon,authenticated,service_role')
    ) as s (sig, secdef, config, volatile, lang, rettype, args, body_md5, grantees)
    left join pg_proc p on p.oid = to_regprocedure(s.sig)
    left join pg_language l on l.oid = p.prolang
  loop
    if v_fn.oid is null then
      raise exception '% does not exist post-migration', v_fn.sig;
    end if;
    if v_fn.prosecdef is distinct from v_fn.secdef
       or v_fn.config_now is distinct from v_fn.config
       or v_fn.volatile_now is distinct from v_fn.volatile
       or v_fn.lang_now is distinct from v_fn.lang
       or v_fn.rettype_now is distinct from v_fn.rettype
       or v_fn.args_now is distinct from v_fn.args then
      raise exception '% attributes differ: security definer %, config %, volatility %, language %, returns %, arguments (%)',
        v_fn.sig, v_fn.prosecdef, v_fn.config_now, v_fn.volatile_now, v_fn.lang_now, v_fn.rettype_now, v_fn.args_now;
    end if;
    if v_fn.md5_now is distinct from v_fn.body_md5 then
      raise exception '% body is not the one this migration was written with (md5 %)', v_fn.sig, v_fn.md5_now;
    end if;
    if v_fn.grantees_now is distinct from v_fn.grantees then
      raise exception '% EXECUTE is held by %, expected %', v_fn.sig, v_fn.grantees_now, v_fn.grantees;
    end if;
  end loop;

  -- 2. save_wset_note: both edits in place, the old identity line gone, and
  --    its ACL exactly the live one.
  select replace(p.prosrc, chr(13), '') into v_text
  from pg_proc p where p.oid = to_regprocedure('public.save_wset_note(jsonb,jsonb)');
  if strpos(v_text, '      catalog_wine_id = (p_note->>''catalog_wine_id'')::uuid,' || chr(10)) <> 0
     or strpos(v_text, '      catalog_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1' || chr(10)) = 0
     or strpos(v_text, '      unidentified_wine_id = case when num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1' || chr(10)) = 0
     or strpos(v_text, '      id, catalog_wine_id, unidentified_wine_id, context_kind, tasting_wine_id, author_id, tasted_on,' || chr(10)) = 0
     or strpos(v_text, '      (p_note->>''catalog_wine_id'')::uuid,' || chr(10)
                       || '      (p_note->>''unidentified_wine_id'')::uuid,' || chr(10)) = 0 then
    raise exception 'save_wset_note does not carry the two spec §9.4 edits';
  end if;
  if (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.save_wset_note(jsonb,jsonb)'))
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'save_wset_note grants changed post-migration';
  end if;
  --    resolve_unidentified_wine: the hue edit in place, the old note update
  --    gone, and its ACL exactly the live one.
  select replace(p.prosrc, chr(13), '') into v_text
  from pg_proc p where p.oid = to_regprocedure('public.resolve_unidentified_wine(uuid,uuid)');
  if strpos(v_text, '  update wset_notes' || chr(10)
                    || '    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null,' || chr(10)
                    || '        colour_hue = case when public.wset_hue_fits_colour(colour_hue,' || chr(10)) = 0
     or strpos(v_text, '  update wset_notes' || chr(10)
                       || '    set catalog_wine_id = p_catalog_wine_id, unidentified_wine_id = null' || chr(10)) <> 0 then
    raise exception 'resolve_unidentified_wine does not carry the spec §9.4 hue edit';
  end if;
  if (select p.proacl::text from pg_proc p where p.oid = to_regprocedure('public.resolve_unidentified_wine(uuid,uuid)'))
       is distinct from '{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}' then
    raise exception 'resolve_unidentified_wine grants changed post-migration';
  end if;
  --    wset_notes_glass_resolve_on_write (M5x2): a client who may not note the
  --    glass returns before the FOR SHARE, so a write RLS refuses never locks it.
  select replace(p.prosrc, chr(13), '') into v_text
  from pg_proc p where p.oid = to_regprocedure('public.wset_notes_glass_resolve_on_write()');
  if strpos(v_text, '              '''') in (''anon'', ''authenticated'')' || chr(10)
                    || '     and not public.can_note_tasting_wine(new.tasting_wine_id) then' || chr(10)
                    || '    return new;' || chr(10)) = 0
     or strpos(v_text, '     for share;' || chr(10)) = 0
     or strpos(v_text, '     and not public.can_note_tasting_wine(new.tasting_wine_id) then' || chr(10))
          > strpos(v_text, '     for share;' || chr(10)) then
    raise exception 'wset_notes_glass_resolve_on_write does not turn a client who may not note the glass away before it locks the glass';
  end if;

  -- 3. wset_notes_one_identity: exactly one identity, or none on a BLIND note
  --    tied to a tasting glass; validated against every existing row.
  if (select pg_get_constraintdef(c.oid) || case when c.convalidated then '' else ' NOT VALID' end
      from pg_constraint c
      where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_one_identity')
     is distinct from 'CHECK (((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 1) OR ((num_nonnulls(catalog_wine_id, unidentified_wine_id) = 0) AND (tasting_wine_id IS NOT NULL) AND (context_kind = ''BLIND''::wset_note_context))))' then
    raise exception 'wset_notes_one_identity is not the spec §9.4 constraint';
  end if;

  -- 4. The complete policy set on both tables: the four recreated policies
  --    with the spec §9.4 texts (as md5), the other four unchanged.
  select string_agg(format('%s|%s|%s|%s|%s|%s|%s', p.tablename, p.policyname, p.cmd, p.roles::text, p.permissive,
                           coalesce(md5(p.qual), '-'), coalesce(md5(p.with_check), '-')),
                    '; ' order by p.tablename::text collate "C", p.policyname::text collate "C")
    into v_text
  from pg_policies p
  where p.schemaname = 'public' and p.tablename in ('wset_notes', 'wset_note_aromas');
  if v_text is distinct from
       'wset_note_aromas|wset note aromas delete|DELETE|{authenticated}|PERMISSIVE|44780e96f8f273a066ee4f6b0e6b4ad8|-; '
       || 'wset_note_aromas|wset note aromas insert|INSERT|{authenticated}|PERMISSIVE|-|44780e96f8f273a066ee4f6b0e6b4ad8; '
       || 'wset_note_aromas|wset note aromas read|SELECT|{authenticated}|PERMISSIVE|20226af5400f64709ed0a92675775319|-; '
       || 'wset_note_aromas|wset note aromas update|UPDATE|{authenticated}|PERMISSIVE|44780e96f8f273a066ee4f6b0e6b4ad8|44780e96f8f273a066ee4f6b0e6b4ad8; '
       || 'wset_notes|wset notes delete|DELETE|{authenticated}|PERMISSIVE|f15adfe1ab934c9cac79112f6685b89a|-; '
       || 'wset_notes|wset notes insert|INSERT|{authenticated}|PERMISSIVE|-|9e6f7f7734d2b1e433c98d310f8b94a5; '
       || 'wset_notes|wset notes read|SELECT|{authenticated}|PERMISSIVE|e97deb3456b18269a5c7bc475db1c0ca|-; '
       || 'wset_notes|wset notes update|UPDATE|{authenticated}|PERMISSIVE|f15adfe1ab934c9cac79112f6685b89a|7e990222fc21cf10b18e3ec5ef277991' then
    raise exception 'the policies on wset_notes and wset_note_aromas are not the expected set: %', v_text;
  end if;

  -- 5. The two new triggers on wines, as spec §9.4 defines them and enabled;
  --    on wset_notes the move guard (BEFORE UPDATE OF tasting_wine_id, row) and
  --    the write resolve (BEFORE INSERT OR UPDATE OF tasting_wine_id, row) next
  --    to the two live triggers. BEFORE triggers fire in name order, so the
  --    guard runs first and the write resolve runs before the hue check.
  select string_agg(format('%s %s', t.tgenabled, pg_get_triggerdef(t.oid)), '; ' order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  where t.tgrelid = 'public.wines'::regclass
    and t.tgname in ('wset_notes_resolve_on_reveal', 'wines_drop_unresolved_notes');
  if v_text is distinct from
       'O CREATE TRIGGER wines_drop_unresolved_notes BEFORE DELETE ON public.wines FOR EACH ROW EXECUTE FUNCTION wines_drop_unresolved_notes(); '
       || 'O CREATE TRIGGER wset_notes_resolve_on_reveal AFTER UPDATE OF is_revealed ON public.wines FOR EACH ROW WHEN ((new.is_revealed AND (NOT old.is_revealed))) EXECUTE FUNCTION wset_notes_resolve_on_reveal()'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.wines'::regclass and t.tgname = 'wset_notes_resolve_on_reveal'
                      and t.tgfoid = to_regprocedure('public.wset_notes_resolve_on_reveal()'))
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.wines'::regclass and t.tgname = 'wines_drop_unresolved_notes'
                      and t.tgfoid = to_regprocedure('public.wines_drop_unresolved_notes()')) then
    raise exception 'the M5 triggers on wines are not as expected: %', v_text;
  end if;
  select string_agg(format('%s %s %s %s', t.tgname, t.tgtype, t.tgenabled, p.proname), '; '
                    order by t.tgname::text collate "C")
    into v_text
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.wset_notes'::regclass and not t.tgisinternal;
  if v_text is distinct from
       'wset_notes_glass_move_guard 19 O wset_notes_glass_move_guard; '
       || 'wset_notes_glass_resolve_on_write 23 O wset_notes_glass_resolve_on_write; '
       || 'wset_notes_hue_matches_colour 23 O wset_notes_check_hue; wset_notes_set_updated_at 19 O set_updated_at'
     or (select pg_get_triggerdef(t.oid) from pg_trigger t
         where t.tgrelid = 'public.wset_notes'::regclass and t.tgname = 'wset_notes_glass_move_guard')
       is distinct from 'CREATE TRIGGER wset_notes_glass_move_guard BEFORE UPDATE OF tasting_wine_id ON public.wset_notes FOR EACH ROW EXECUTE FUNCTION wset_notes_glass_move_guard()'
     or (select pg_get_triggerdef(t.oid) from pg_trigger t
         where t.tgrelid = 'public.wset_notes'::regclass and t.tgname = 'wset_notes_glass_resolve_on_write')
       is distinct from 'CREATE TRIGGER wset_notes_glass_resolve_on_write BEFORE INSERT OR UPDATE OF tasting_wine_id ON public.wset_notes FOR EACH ROW EXECUTE FUNCTION wset_notes_glass_resolve_on_write()'
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.wset_notes'::regclass and t.tgname = 'wset_notes_glass_move_guard'
                      and t.tgfoid = to_regprocedure('public.wset_notes_glass_move_guard()'))
     or not exists (select 1 from pg_trigger t
                    where t.tgrelid = 'public.wset_notes'::regclass and t.tgname = 'wset_notes_glass_resolve_on_write'
                      and t.tgfoid = to_regprocedure('public.wset_notes_glass_resolve_on_write()')) then
    raise exception 'the triggers on wset_notes are not the two live ones plus the move guard and the write resolve: %', v_text;
  end if;

  -- 6. Foreign keys unchanged: the aromas still cascade with their note, and a
  --    deleted glass still sets a resolved note's tasting_wine_id null.
  if (select pg_get_constraintdef(c.oid) from pg_constraint c
      where c.conrelid = 'public.wset_note_aromas'::regclass and c.conname = 'wset_note_aromas_note_id_fkey')
       is distinct from 'FOREIGN KEY (note_id) REFERENCES wset_notes(id) ON DELETE CASCADE'
     or (select pg_get_constraintdef(c.oid) from pg_constraint c
         where c.conrelid = 'public.wset_notes'::regclass and c.conname = 'wset_notes_tasting_wine_id_fkey')
       is distinct from 'FOREIGN KEY (tasting_wine_id) REFERENCES wines(id) ON DELETE SET NULL' then
    raise exception 'wset_note_aromas_note_id_fkey or wset_notes_tasting_wine_id_fkey changed post-migration';
  end if;

  -- 7. What each client role can call.
  if not has_function_privilege('authenticated', 'public.can_note_tasting_wine(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.is_tasting_wine_revealed(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.can_note_tasting_wine(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.is_tasting_wine_revealed(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.wset_notes_resolve_on_reveal()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.wset_notes_resolve_on_reveal()', 'EXECUTE')
     or has_function_privilege('anon', 'public.wines_drop_unresolved_notes()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.wines_drop_unresolved_notes()', 'EXECUTE')
     or has_function_privilege('anon', 'public.wset_notes_glass_move_guard()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.wset_notes_glass_move_guard()', 'EXECUTE')
     or has_function_privilege('anon', 'public.wset_notes_glass_resolve_on_write()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.wset_notes_glass_resolve_on_write()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_wset_note(jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.resolve_unidentified_wine(uuid,uuid)', 'EXECUTE') then
    raise exception 'EXECUTE on the M5 functions is not: helpers authenticated only; trigger functions no client role; save_wset_note and resolve_unidentified_wine authenticated';
  end if;

  -- 8. Unchanged bodies: the hue trigger the helper mirrors, and the blind
  --    marking the security reasoning relies on.
  if (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.wset_notes_check_hue()'))
       is distinct from '6e31755ea4f95ddc02bd0ed40e275166'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_mark_blind()'))
       is distinct from '08dc5499a57fda78eda6e6ac31ac9f9d'
     or (select md5(p.prosrc) from pg_proc p where p.oid = to_regprocedure('public.catalog_wine_unmark_blind()'))
       is distinct from 'f9e3bf5208ceddd18a9b334c585965cc' then
    raise exception 'wset_notes_check_hue, catalog_wine_mark_blind or catalog_wine_unmark_blind changed post-migration';
  end if;

  -- 9. Data: no existing note was reshaped (none identity-less, none tied to an
  --    unrevealed glass).
  select count(*) into v_n
  from public.wset_notes n
  where num_nonnulls(n.catalog_wine_id, n.unidentified_wine_id) = 0
     or exists (select 1 from public.wines w where w.id = n.tasting_wine_id and not w.is_revealed);
  if v_n <> 0 then
    raise exception '% notes are identity-less or tied to an unrevealed glass post-migration', v_n;
  end if;

  -- Informational: the helpers' ACLs.
  select string_agg(format('%s %s', p.proname, p.proacl), '; ' order by p.proname::text collate "C") into v_text
  from pg_proc p
  where p.oid in (to_regprocedure('public.can_note_tasting_wine(uuid)'), to_regprocedure('public.is_tasting_wine_revealed(uuid)'));
  raise notice 'hidden glass notes: EXECUTE %', v_text;
end $$;
