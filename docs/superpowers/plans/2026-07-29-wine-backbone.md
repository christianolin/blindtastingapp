# Wine Backbone (P1+P2) Implementation Plan

> **For agentic workers:** execute task-by-task with TDD; steps use `- [ ]`.
> Owner chose **concise + inline** — exact SQL/tests are written during
> execution and verified against the live pooled DB; this plan fixes the shape,
> file paths, and test intent.

**Goal:** Make `catalog_wines` the single source of truth that every blind-tasting
answer and every tasting note links to — without breaking blind-tasting secrecy or
any past score.

**Architecture:** Add a mandatory, **protected** `wine_answers.catalog_wine_id`
(inherits the pre-reveal RLS) while keeping the answer FK columns as a **frozen
snapshot**. A shared `find_or_create_catalog_wine` links every new answer on
insert; a one-time backfill links historical answers; then enforce `NOT NULL`.
Curation (creator/curator edit + audit + merge) and the note↔tasting context link
round it out. Scoring/reveal RPCs are **untouched** — they read the snapshot.

**Tech stack:** Supabase Postgres (SQL migrations via `scripts/scratch-apply.mjs`
dry→live), Next.js server actions, `node --test` DB suites on the pooled DB.

## Global Constraints
- Migrations: new timestamped files after `20260829202000` (next `20260829203000`+).
  Idempotent (guarded enums, `if not exists`, `drop policy if exists`) with a
  final-state assert block. Apply `node scripts/scratch-apply.mjs --file <path>
  --mode dry` then `--mode live`. `DB_PASSWORD`/`DB_PORT` via env, never committed;
  `scratch-apply.mjs` stays untracked.
- DB env: `DB_PORT=5432`, host `aws-0-eu-central-1.pooler.supabase.com`, user
  `postgres.eqzwmkpeysqiihuojmuj`, password via env only.
- Tests: new `scripts/wine-backbone.test.mjs` following `scripts/wset-notes.test.mjs`
  patterns (pg client, `withRollback`, `set local role authenticated` +
  `request.jwt.claims` for RLS probes). Keep `tsc --noEmit` clean; hand-update
  `src/lib/supabase/database.types.ts` for every schema change.
- **Snapshot immutability is sacred:** never change how scores are computed;
  `wine_answers` FK columns stay as-is. Identity match tuple = country, region,
  appellation, primary_grape, secondary_grape, producer, type_designation,
  vintage_kind, vintage_year, vintage_tawny_years (null-safe `is not distinct from`).
  colour/style/cuvee are non-identity attributes.
- Writes truncate ~4.5KB — split large files. Delete any `scripts/tmp-*.mjs`
  before committing.

---

## Task 1 — Curation columns, nullable colour/style, edit audit
**Files:** create `supabase/migrations/20260829203000_catalog_curation.sql`;
modify `src/lib/supabase/database.types.ts`; add tests to `scripts/wine-backbone.test.mjs`.

**Schema:**
- `profiles.is_curator boolean not null default false`.
- `catalog_wines`: `colour`/`style` → `drop not null`; add `merged_into uuid
  references catalog_wines(id)`, `lwin_code text`, `external_source
  external_wine_source not null default 'MANUAL'` (enum `MANUAL`/`LWIN`),
  `updated_at timestamptz not null default now()` + reuse `set_updated_at` trigger.
- `catalog_wine_edits` audit table: `id`, `catalog_wine_id`, `editor_id`,
  `edited_at default now()`, `before jsonb`, `after jsonb`.
- RLS: add `catalog update` policy — `using`/`with check` =
  `created_by = auth.uid() OR exists(select 1 from profiles where id = auth.uid()
  and is_curator)`. Keep existing read/insert (net 3 policies).
- AFTER UPDATE trigger on `catalog_wines` → insert `catalog_wine_edits`
  (`to_jsonb(old)`, `to_jsonb(new)`, `editor_id = auth.uid()`).

**Steps:** write failing tests → migration → dry→live → tests pass → `tsc` → commit.
**Tests:** creator updates own row; non-creator/non-curator update → 0 rows;
curator updates another's row; colour/style accept null; one update writes exactly
one `catalog_wine_edits` row.
**Commit:** `feat(backbone): catalog curation — nullable colour/style, curator edit + audit`

## Task 2 — `find_or_create_catalog_wine` RPC
**Files:** `supabase/migrations/20260829204000_find_or_create_catalog_wine.sql`;
tests.

**RPC:** `find_or_create_catalog_wine(p jsonb) returns uuid`, `security invoker`,
`set search_path = public`. Match an existing `catalog_wines` on the identity
tuple (Global Constraints) with `is not distinct from`; return the first match.
Else insert `created_by = auth.uid()`, colour/style/cuvee from `p` when present,
and return the new id. `grant execute ... to authenticated`.

**Tests:** two calls with identical identity → same id (dedup); differing producer
→ different id; `created_by` = caller; colour/style optional.
**Commit:** `feat(backbone): find_or_create_catalog_wine RPC`

## Task 3 — Protected link column; drop the unused `wines` link
**Files:** `supabase/migrations/20260829205000_wine_answers_catalog_link.sql`;
`database.types.ts`; tests.

**Schema:** `alter table wine_answers add column if not exists catalog_wine_id
uuid references catalog_wines(id) on delete restrict` (nullable for now).
`alter table wines drop column if exists catalog_wine_id`. **No RLS change** — the
new column rides the existing `wine_answers` read policy, so it is invisible
pre-reveal like the rest of the answer.

**Tests:** a joined participant (authenticated, pre-reveal) selecting the answer
row gets 0 rows (secrecy now covers `catalog_wine_id`); the host can set and read
it; `information_schema` confirms `wines.catalog_wine_id` is gone.
**Commit:** `feat(backbone): wine_answers.catalog_wine_id (protected); drop wines link`

## Task 4 — Link every new answer on insert
**Files:** modify `src/app/tastings/[id]/wines/new/actions.ts` (insert near `:243`;
answer-update path near `:369`).

**Change:** immediately before the `.from("wine_answers").insert(...)`, call
`supabase.rpc("find_or_create_catalog_wine", { p: <snapshot> })` and add the
returned id as `catalog_wine_id` on the insert payload. Do the same on the
answer-edit path so the link follows FK edits. `<snapshot>` = the same
country/region/appellation/grape/producer/type-designation/vintage object the
action already assembles (include colour/style only if the form carries them).

**Tests:** no unit test for the server action — verify `tsc` clean, plus a DB smoke
in `wine-backbone.test.mjs`: as an authenticated user, `find_or_create_catalog_wine`
then insert a `wine_answers` row with the returned id → row links. Manual smoke:
add a wine to a tasting, confirm its `wine_answers.catalog_wine_id` is set.
**Commit:** `feat(backbone): add-wine links its answer to the catalog`

## Task 5 — Backfill historical answers; enforce `NOT NULL`
**Files:** `supabase/migrations/20260829206000_backfill_catalog_links.sql`; tests.

**Migration (guarded, idempotent):** for every `wine_answers` with
`catalog_wine_id is null`, find-or-create (in-SQL, running as the owner role) a
`catalog_wines` row matched on the identity tuple, `created_by =` the tasting's
`host_id`, deduped so identical tuples collapse to one row; set the link. Then
`alter table wine_answers alter column catalog_wine_id set not null`. Guard the
whole body so re-apply is a no-op (e.g. skip when no null links remain).
**Final-state asserts:** `count(*) filter (where catalog_wine_id is null) = 0`.

**Tests:** post-migration every answer is linked; two historical answers with an
identical identity tuple share one catalog wine.
**Commit:** `feat(backbone): backfill + enforce catalog link on all answers`

## Task 6 — Note ↔ tasting context
**Files:** `supabase/migrations/20260829207000_wset_note_context.sql`;
`database.types.ts`; tests.

**Schema:** enum `wset_note_context` (`OPEN`/`BLIND`/`TRAINING`); `wset_notes` add
`context_kind wset_note_context not null default 'OPEN'` and `tasting_wine_id uuid
references wines(id) on delete set null`.

**Tests:** default is `OPEN`; can insert `BLIND` + a `tasting_wine_id`; note rows
stay owner-gated (existing RLS unaffected).
**Commit:** `feat(backbone): wset_notes context_kind + tasting_wine_id`

## Task 7 — Merge duplicate catalog wines
**Files:** `supabase/migrations/20260829208000_merge_catalog_wines.sql`; tests.

**RPC:** `merge_catalog_wines(p_loser uuid, p_winner uuid) returns void`,
`security invoker`. Guard: caller is creator or curator of the loser. Repoint
`wset_notes.catalog_wine_id` and `wine_answers.catalog_wine_id` from loser →
winner; set `catalog_wines.merged_into = p_winner` on the loser. (Cellar-holdings
repoint is added when that table lands.)

**Tests:** merge repoints a note and an answer, sets `merged_into`, and leaves the
answer's snapshot FK columns **unchanged**; a non-creator/non-curator caller
raises.
**Commit:** `feat(backbone): merge_catalog_wines RPC`

---

## Self-review
- **Spec coverage:** §3.2 protected link + snapshot → T3, T5; §3.3 curation/merge →
  T1, T7 (search-first UI is P5, out of this plan); §3.4 LWIN columns → T1; §3.5
  note context → T6; §6 migration → T5. Scoring/reveal untouched (confirmed all
  read `wine_answers%rowtype`).
- **Sequencing:** colour/style nullable (T1) precedes creation-from-answers (T2,
  T5); nullable link (T3) + insert wiring (T4) precede `NOT NULL` (T5) so the
  add-wine flow never violates the constraint mid-rollout. Each task ships green
  and the app keeps working after each.
- **Deferred (own specs):** catalog pillar & wine hub (P3), Taste pillar + semi-blind
  + note-context wiring in play (P4), add-wine catalog **picker** UI + merge UI (P5),
  Cellar/Community (P6), global search (P7). The WSET sheet's colour-when-unknown
  handling belongs to P3.

