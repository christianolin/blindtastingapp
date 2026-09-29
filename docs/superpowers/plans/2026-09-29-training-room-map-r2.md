# Training Room on the Wine Map — Phase R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The on-demand likelihood map in the training room (R2): a List | Map switch on the laptop column and List | Map tabs in the phone sheet; on Map, a lean MapLibre map with one dot per typical wine, coloured and sized by its closeness relative to the leader, the list's own % on the three best spots (more from z7, and on hover), a tap opening the same detail as a list row, curated display-only points for the 18 wines with no map place, and honest fallbacks — behind a build-time kill switch.

**Architecture:** Every rule is pure and pinned in `src/lib/training/map-view.ts` (heat, features, labels, fingerprint, camera, chooser order, the MapLibre paint/layout). `TrainingMap` (`src/app/taste/training/training-map.tsx`) only wires those rules to MapLibre: one GeoJSON source (`wine-training`, which `basemap.ts`'s `isWineSourceId` learns so a theme swap carries it), a frozen `mapStyle`, one `setData` per frame at most. It is its own chunk, loaded through ONE loader (`training-map-loader.ts`) by `room-map-slot.tsx`'s `next/dynamic(…, { ssr: false })` and by the Map tab's warm-up, and mounted only while the Map view is open — in the laptop column from lg, in the phone sheet below it, never both. The List | Map choice and the map's failure state are a pure reducer (`room-map-state.ts`) that `TrainingRoom` owns. The laptop column's popover is extracted as `CandidateDetailPopover` so a dot (a virtual anchor at its point) opens the same detail or a chooser a row does; the phone sheet shows them over the kept, inert map. The curated points are two nullable columns on `wine_archetypes`, read by their own fail-soft select.

**Tech Stack:** Next.js 16 App Router (TypeScript, client components, `next/dynamic`), Tailwind tokens, base-ui Popover/Dialog, `maplibre-gl` 5 through `react-map-gl/maplibre` 8, Supabase Postgres (a data migration), vitest (node env, static markup through `react-dom/server`, `@maplibre/maplibre-gl-style-spec`'s `validateStyleMin`), node:test DB suite (`scripts/training-room.test.mjs`, rolled-back transactions against live).

**Spec:** `docs/superpowers/specs/2026-09-29-training-room-map-design.md`. This plan builds ONLY phase R2: RM11–RM27, §4.3, §4.4 (the columns), §4.5 (R2 rows), §5 (`map-view.ts`, `MapPalette.heat`), §6.2–§6.4, §7, §8 (R2), §9 (R2 rows), §10 (R2), §11 (R2 tests), §12. R1 (links, R1a, R1b) is live on master up to `caf84e7`; migrations `20260929140000` and `20260929141000` are applied. Owner decisions O3 (three always-on labels, zoom-in labels, hover), O4 (Europe before any answer) and O5 (the two Wachau wines share one point) are taken as the spec's defaults. Also in scope: the R1 review nit — the expanded group's region link used the map's local place name ("Vallée du Rhône on the wine map") while the explorer shows English by default; it now uses the explorer's `englishName` ("Rhône Valley on the wine map").

**Verified before writing (2026-09-29).** Every code block below was built in a scratch copy of this worktree at `caf84e7` (`git archive HEAD`, `node_modules` junctioned) and checked:
- `npx tsc --noEmit` exits 0;
- `npx eslint` prints nothing on every touched file;
- `npx vitest run` passes **263 files, 4669 tests** (the worktree baseline is **259 files, 4568 tests**; this plan adds 4 files and 101 tests; the per-task counts are in each task);
- `node --check` passes on every touched script;
- the R2 migration, then `rollback-r2.sql`, ran against live inside ONE `begin … rollback` (nothing kept; the `alter` held its lock for ~150 ms): 102 archetypes, 18 display points, 0 on a placed archetype, both Wachau wines at `15.42, 48.39`, a half-set and an out-of-range update each refused with `23514`; the rollback dropped both columns;
- the new DB test skips with `TRAINING_ROOM_APPLY` unset and passes with `TRAINING_ROOM_APPLY=supabase/migrations/20260929150000_training_room_display_points.sql` (run alone with `--test-name-pattern`, together with the suite's "leave the owner's session with no auth.uid()" guard, which also passes);
- `npx next build --webpack` succeeds (Turbopack refuses a junctioned `node_modules` in a scratch copy; the main session's real build uses the default bundler). In that build the `/taste/training` page's client chunks contain no `maplibregl`, no `wine-training`, no heat hex and no Carto URL; MapLibre, `basemap.ts` and `map-palette.ts` sit only in the dynamic chunks.
- **Budget deviation, flagged (spec §12):** the room's pre-map client JS grows by **+5.9 KB gzip** in that webpack build (28 → 29 chunks; 340,521 → 346,446 bytes, per-chunk gzip), against the spec's "≤ 3 KB gzip for links, tablist, fallback and loader". It is not MapLibre: it is the popover's generalization and the chooser (RM18), the sheet's map/overlay branch (RM18, RM20), the tablist, reducer and fallbacks, `next/dynamic`'s loader runtime, and three small modules the explorer already ships and the room now shares (`map-error-boundary.tsx` ≈ 0.7 KB, `localize-names.ts` ≈ 0.6 KB for the R1 nit, `use-is-phone.ts`'s `mediaStore` ≈ 0.4 KB). Spec §4.5 makes "pre-map JS grows by more than the §12 budget" a revert trigger, so the main session re-measures on the real build and gets the owner's go-ahead for the measured number before deploying (see "Main session afterwards", step 3). Nothing in this plan tries to hide it.

Not executed while planning (they write to live, sign in, or need a browser): the real apply, the full DB suite, `check-display-points.mjs` (it mints a demo session), the Vercel preview and every browser check. They are the main session's (see "Main session afterwards").

## Global Constraints

- Every shell command starts with `cd C:/Users/Public/repos/blindtastingapp-friends && …` (worktree, branch `room-map`; the shell's cwd resets). Never touch `C:/Users/Public/repos/blindtastingapp` (the owner's checkout). Never push.
- Implementers never write to the live database or Storage: no applier, no `run-sql.mjs` without `--dry`, no `check-display-points.mjs`, no dev server against live. Read-only queries only (`node --env-file=.env.local` + `pg` inside `begin read only … rollback`); a migration may be dry-run inside `begin … rollback`, never committed. The main session applies migrations. The migration applier now needs `scripts/migration-preflight.mjs`, which exists only on branch `usa-map`: for a dry run use your own `begin … rollback` runner, or the DB suite's `TRAINING_ROOM_APPLY`.
- Never recreate `get_wine_place_context` or any other shared map function from the repo copy (a collaborator's live-only `20260925190000` is not in the repo). Nothing here writes `wine_places` or `wine_place_boundaries`: no neighbour-cache refresh, no tiles run.
- No Anthropic API calls anywhere (AGENTS.md).
- AGENTS.md: this Next.js differs from training data — read `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (next/dynamic, `ssr: false` only in a client component) and `…/02-guides/environment-variables.md` (NEXT_PUBLIC_ values are inlined at BUILD time) before Tasks 7–9.
- RM1: nothing from this plan appears in a tasting, a lobby or the play page. `training-map.tsx` and `src/lib/training/map-view.ts` are imported only from under `src/app/taste/training/` (and `map-view.ts`'s own test); Task 9's source test pins it.
- The room's first load carries no MapLibre, `react-map-gl`, `basemap.ts` or `map-palette.ts` value import: only `training-map.tsx` imports them statically; the warm-up uses `import()`. `import type` is allowed anywhere.
- Copy: every new user-facing string is **PROVISIONAL** (spec §9, O6) and lives in `src/lib/training/copy.ts` (listed in "Provisional copy" at the end). English only (D20). No string says "likely", "chance" or "probability" (RM27; Task 5 pins it).
- Design tokens only for UI (`text-primary`, `text-muted-foreground`, `border-border-light`, `outline-ring`, `bg-muted`, `bg-card`, `bg-popover`); the map canvas and its legend swatches use the palette's literal hex (MapLibre paint cannot read CSS variables — CLAUDE.md). Every tap target is 44 px on touch: `min-h-11 md:pointer-fine:min-h-0` (each component declares its own `TAP` constant, the house pattern).
- Pure modules under `src/lib/training/` import relatively (house style).
- `database.types.ts` is hand-written and must match the migration (CLAUDE.md).
- **Never run prettier on an existing file**: the repo has no prettier config, and a default run reflows every line of the file (80 columns). Keep the surrounding style (about 110–120 columns).
- The working tree is CRLF (`core.autocrlf=true`); the Edit tool matches either ending and git normalises new files.
- Commits: `GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit …`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only the files a task lists.
- The migration version `20260929150000` is later than the latest applied `20260929141000`; the main session may still re-pick it at apply time (spec §4). Nothing depends on it: the rollback file removes its history row by NAME and the source tests find it by name suffix.

## Review Focus

1. **The window crosses lg while Map is open** (a laptop window narrowed, an iPad rotated) — the laptop aside is `hidden lg:block`, so a map mounted there below lg would be a second, invisible WebGL context. The column mounts the map only when `useMedia(LG_QUERY)` holds and the sheet only when it does not. Pinned by Task 9's source test ("the slot only inside the Map view": `{mapView && wide ? (<RoomMapSlot` in the panel, `!wide ? (<RoomMapSlot` in the sheet).
2. **A theme flip right after the warm-up filled the style cache** — a `mapStyle` recomputed from the cache would change from the URL to the object, react-map-gl would `setStyle` it with no `transformStyle`, and every dot would vanish. Pinned by Task 9's source test ("mapStyle is frozen at mount and passed once") and Task 4's basemap test (the training source and its layers ride a swap, and the diff never names them).
3. **The RPC fails (or a stale schema cache) but the display-point read works, or the reverse** — the room must still rank; the 18 curated dots still show when only the RPC failed; nothing curated shows when only the display read failed. Pinned by Task 2's `pool.test.ts` ("a failed display-point read logs once…") and `pool-shape.test.ts` ("the RPC's fail-soft path still shows the curated points").
4. **A popover left open across a view change** (List → Map, or the map stops and the room drops to List) — a row's popover anchored to a now-hidden row, or a map popover anchored to an unmounted map. Pinned by Task 9's `visibleTarget` test (a row's popover shows only on List, a map's only on Map); a stopped map's `dispatch({ type: "stopped" })` switches the view, so the derived target is null at once.
5. **Everything ruled out** (a colour answer that caps every wine — "Nothing fits yet") — no leader: the camera must go to Europe (not stay nowhere), every dot is a ring, no labels, and the legend shows the ramp (not "Start describing the wine", which is only for no answers at all). Pinned by Task 6's `cameraTarget` test ("before any answer, and when everything is ruled out: Europe") and `labelledPositions` test ("a spot whose wines are all ruled out … has no label").

## Spec coverage and interpretations

RM11 → Tasks 7, 8 (loader, slot, `TrainingMap`, CSS imports) and Task 9 (source tests). RM12 → Tasks 1, 2, 6. RM13 → Task 6 (`heatOf`, ramp, rings, sort key). RM14 → Task 3. RM15 → Task 6 (labels, hover text) and Task 8 (symbol layer, tooltip). RM16 → Task 6 (fingerprint) and Task 8 (one `setData` per frame). RM17 → Task 6 (camera rules) and Task 8 (settle timer, user move, "Fit to the closest", reduced motion). RM18 → Task 4 (hover options), Task 8 (tap box, anchors) and Task 9 (`CandidateDetailPopover`, chooser, sheet overlay). RM19 → Tasks 7, 9. RM20 → Tasks 8, 9. RM21 → Tasks 4, 8. RM22 → Tasks 4, 7, 8, 9. RM23 → Tasks 1, 2. RM24 → Tasks 7–9. RM25 → Tasks 7–9. RM26 → Task 6. RM27 → Task 5. §4.3/§4.4 → Task 1. §4.5 R2 rows → Task 1 (rollback, runner, PostgREST check) and "Main session afterwards". §6.2–§6.4 → Tasks 8, 9. §7 → Task 1. §9 R2 rows → Task 5. §11 R2 tests → Tasks 1–9. §12 → "Verified before writing" and "Main session afterwards".

Where this plan chooses (flagged for review):
- **`labelledPositions` returns more than the spec's `{ id, text, rank }`**: also `ids` (every wine at the spot, ranking order), `lon` and `lat`, so the "Closest on the map" buttons open the spot's chooser anchored to its dot.
- **Extra pure exports in `map-view.ts`**: `leaderCloseness`, `dotText`, `closestSpots`, `cameraKey` (what the camera follows, so it moves only on a membership change), `hoverLabel`, `DOT_LAYOUT` (`circle-sort-key` is a LAYOUT property, so it is its own constant), `LABEL_FILTER`, `labelPaint`, `LABEL_TEXT_SIZE`. The expression builders are plain arrays cast once each, and validated with `validateStyleMin` in the test.
- **Feature properties are `{ id, state, heat, label, rank, sort }`** with `state` `"scored" | "neutral" | "capped"` instead of a `capped` boolean (neutral and scored-at-0 must differ), and `heat` rounded to 2 dp in the feature itself so the fingerprint (`id:heat:state:label:rank`) is exactly what `setData` would change.
- **"No leader" includes "everything ruled out"**: `cameraTarget` returns Europe whenever no uncapped wine has a closeness, not only before the first answer. The legend's "Start describing the wine" still means no answer at all (`isBeforeAnswers`).
- **The gold ring is feature-state**: the source uses `promoteId: "id"`, and the open detail's dots (every wine of an open chooser, then the chosen one) get `selected`, re-applied after a style rebuild.
- **The laptop chooser has a Back button** (reusing `TRAINING_COPY.back`): choosing a wine swaps the popover to its detail; Back returns to "{n} wines here".
- **A spot scrolled out of view** (the viewer panned away, then used a "Closest on the map" button) anchors the popover to the button, not to an off-screen point.
- **Hover is installed only when `(hover: hover) and (pointer: fine)` matches at load**; the tooltip sits above the pointer, is `aria-hidden` (the list and the buttons are the accessible path), and hides on any camera move.
- **A render (non-chunk) error inside the boundary** shows the "stopped" card with "Try the map again" in place of the map, rather than switching to List: a boundary cannot dispatch during render. The constructor path and a lost context DO switch to List (`onStopped`).
- **The warm-up reads the theme from `<html>`'s class** (`themeOfRoot`) at hover time, and runs once per page visit; a style-fetch failure is ignored there (the map handles its own), an import rejection marks `chunkFailed`.
- **The sheet renders the other tab's panel empty and `hidden`** so both tabs' `aria-controls` resolve; the laptop column keeps the list's panel mounted and `hidden` under Map (which is how its open regions and Show all survive, §6.2).
- **The short-screen note is the sheet's only** (below lg); a laptop is never 480 px tall at lg in practice, and 1024×768 is not short.
- **The R1 nit is fixed at display** (`GroupMapLink` wraps the name in `englishName`), so `MapPlaceRef.name` stays the place's own name. ("Andalucía" → "Andalusia", "Vallée du Rhône" → "Rhône Valley"; names with no exonym — Veneto, Bordeaux, Douro — are unchanged.) This changes visible R1 copy, so it goes to the owner with the R2 copy.
- **The DB test does not require every unplaced archetype to carry a curated point**: a future unplaced batch without one simply has no dot and is listed under "{n} not on the wine map yet".
- **Two helper-script changes the spec implies**: `run-sql.mjs` also accepts `rollback-r2.sql`, and a new `scripts/training-room-map/check-display-points.mjs` is §4.5's "select the two columns through PostgREST as a signed-in demo user".

## File map

| File | Task | Responsibility |
|---|---|---|
| `supabase/migrations/20260929150000_training_room_display_points.sql` (create) | 1 | two nullable columns + check; the 18 points by id and live name, while unplaced; asserts |
| `scripts/training-room-map/rollback-r2.sql`, `check-display-points.mjs` (create); `run-sql.mjs` | 1 | the down file (abandonment only), the pre-deploy PostgREST check, the runner's allow-list |
| `src/lib/supabase/database.types.ts` | 1 | `wine_archetypes` Row/Insert (Update follows Insert) gain `display_lon`/`display_lat` |
| `src/lib/training/room-map-migrations.test.ts` | 1 | the R2 migration writes no `wine_places`/boundary row |
| `scripts/training-room.test.mjs` | 1 | the R2 DB test (skips until the columns exist) |
| `src/lib/training/pool-shape.ts` (+ test), `pool.ts` (+ test) | 2 | `DisplayPointRaw`, `displayPoints`, the curated fallback; the fail-soft read in round one |
| `src/lib/wine-map/map-palette.ts` (+ test) | 3 | the `heat` block, last in both tables |
| `src/lib/wine-map/basemap.ts` (+ test), `hover-cursor.ts` (+ test), `src/app/knowledge/map/map-error-boundary.tsx` (+ test) | 4 | `TRAINING_SOURCE_ID`; `isClickable`/`box`/`onHover`; optional `fallback` — all additive |
| `src/lib/training/copy.ts` (+ test); `src/app/taste/training/map-link.tsx` (+ test) | 5 | the R2 strings; the English region name |
| `src/lib/training/map-view.ts` (+ test) (create) | 6 | every rule of the map, pure |
| `src/app/taste/training/room-map-state.ts` (+ test), `map-types.ts`, `use-media.ts`, `map-switch.tsx`, `map-fallback.tsx`, `room-map-markup.test.tsx` (create) | 7 | the reducer and kill switch, the shared types, media queries, the tablist, the fallback states |
| `src/app/taste/training/training-map.tsx`, `training-map-legend.tsx`, `training-map-loader.ts`, `room-map-slot.tsx` (create) | 8 | the chunk, its one loader, and where it mounts |
| `src/app/taste/training/candidates-panel.tsx`, `candidates-sheet.tsx`, `training-room.tsx`; `training-room-map-imports.test.ts` (create) | 9 | the wiring on both widths; the source rules |
| `CLAUDE.md` | 10 | the R2 bullet |

---

### Task 1: The curated display points — migration, rollback, types, runner, PostgREST check and DB test

**Files:**
- Create: `supabase/migrations/20260929150000_training_room_display_points.sql`
- Create: `scripts/training-room-map/rollback-r2.sql`, `scripts/training-room-map/check-display-points.mjs`
- Modify: `scripts/training-room-map/run-sql.mjs` (the allow-list), `src/lib/supabase/database.types.ts` (`wine_archetypes`), `src/lib/training/room-map-migrations.test.ts` (`NAMES`), `scripts/training-room.test.mjs` (append a section)

**Interfaces:**
- Produces: `wine_archetypes.display_lon` / `display_lat` (`double precision`, both null or both set, lon in [−180, 180], lat in [−90, 90]; constraint `wine_archetypes_display_point_check`); `Database["public"]["Tables"]["wine_archetypes"]["Row"]` gains `display_lon: number | null; display_lat: number | null` (Insert: optional; Update is `Partial<Insert>`).

- [ ] **Step 1: Write the failing tests**

(a) In `src/lib/training/room-map-migrations.test.ts`, replace

```ts
const NAMES = ["training_archetype_places.sql", "training_region_placements.sql"];
```

with

```ts
const NAMES = [
  "training_archetype_places.sql",
  "training_region_placements.sql",
  "training_room_display_points.sql",
];
```

and rename the test `"are both there, once each"` to `"are all there, once each"`.

(b) Append to the END of `scripts/training-room.test.mjs` (it already defines `client`, `withRollback`, `asOwner`, `asUser`, `expectError`, and imports `randomUUID`, `assert`, `test`):

```js

// --- Phase R2: curated display points (spec §4.3, RM23) -------------------------
// Before 20260929150000 is live, name its file in TRAINING_ROOM_APPLY.

async function displayPointsLive() {
  return (
    await client.query(
      `select count(*) = 2 as live from information_schema.columns
        where table_schema = 'public' and table_name = 'wine_archetypes'
          and column_name in ('display_lon', 'display_lat')`,
    )
  ).rows[0].live;
}

test("R2: every unplaced typical wine of the curated list carries a point a signed-in reader sees", async (t) => {
  await withRollback(async () => {
    await asOwner();
    if (!(await displayPointsLive())) {
      t.skip("R2's display points are neither live nor in TRAINING_ROOM_APPLY");
      return;
    }
    // Any signed-in caller: wine_archetypes is readable to every member.
    await asUser(randomUUID());
    const got = (
      await client.query(
        `select count(*) filter (where display_lon is not null)::int with_point,
                count(*) filter (where display_lon is not null and wine_place_id is not null)::int placed_with_point
           from wine_archetypes`,
      )
    ).rows[0];
    // 18 before the USA wave places its three, 15 after; never a placed one.
    assert.ok([15, 18].includes(got.with_point), `with_point = ${got.with_point}`);
    assert.equal(got.placed_with_point, 0);
    const wachau = (
      await client.query(
        `select display_lon, display_lat from wine_archetypes
          where name in ('A typical Wachau Grüner Veltliner', 'A typical Wachau Riesling')`,
      )
    ).rows;
    assert.deepEqual(wachau, [
      { display_lon: 15.42, display_lat: 48.39 },
      { display_lon: 15.42, display_lat: 48.39 },
    ]);
    await asOwner();
    // Both or neither, and in range (wine_archetypes_display_point_check).
    await expectError(
      () => client.query("update wine_archetypes set display_lon = 1 where name = 'A typical Pauillac'"),
      "23514",
    );
    await expectError(
      () =>
        client.query("update wine_archetypes set display_lon = 181, display_lat = 1 where name = 'A typical Pauillac'"),
      "23514",
    );
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/room-map-migrations.test.ts && node --check scripts/training-room.test.mjs`
Expected: vitest FAIL — `are all there, once each` (the file list lacks `training_room_display_points.sql`); `node --check` passes.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260929150000_training_room_display_points.sql` (the full ids were read from live, read-only, on 2026-09-29; the names are the live names):

```sql
-- Training room on the wine map, phase R2 (spec
-- docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.3, RM12, RM23).
-- Curated, display-only points for the typical wines that have no map place:
-- two nullable columns on wine_archetypes and the spec's §7 values, set BY ID,
-- each guarded by the live name, and only while the archetype is still
-- unplaced (wine_place_id is null). An archetype already placed (the USA wave
-- may place Napa, Sonoma and Willamette first) is skipped with a notice: it has
-- a real point, and the room never reads a curated one while a place point
-- exists.
--
-- These are approximate centres of each wine's growing area, NOT boundaries
-- and NOT appellation claims; they are never a wine_places row. The two Wachau
-- wines share one point on purpose (owner decision O5).
--
-- The room reads them with its own fail-soft select (spec RM23), so the app
-- deployed before this migration keeps working. Grants on wine_archetypes are
-- table-level (authenticated holds SELECT), so the new columns need no grant;
-- the asserts check that. It writes no wine_places or wine_place_boundaries
-- row: no neighbour-cache refresh (CLAUDE.md), no tiles run.
-- No begin/commit: the applier owns the transaction.

-- The alter takes an ACCESS EXCLUSIVE lock: never queue behind a neighbour
-- refresh or a collaborator's write. On timeout the apply fails; retry it.
set local lock_timeout = '5s';

alter table public.wine_archetypes
  add column display_lon double precision,
  add column display_lat double precision,
  add constraint wine_archetypes_display_point_check check (
    (display_lon is null and display_lat is null)
    or (display_lon is not null and display_lat is not null
        and display_lon between -180 and 180
        and display_lat between -90 and 90)
  );

do $$
declare
  r record;
  n int;
  v_expected int := 0;
  v_got int;
begin
  for r in
    select * from (values
      ('569e2a6f-a31b-4a88-86c2-d49c3eb7c83e'::uuid, 'A typical Mendoza Malbec',                 -68.88::float8, -33.05::float8),
      ('8c350884-ab3d-4e14-906d-b9046dd6ba23'::uuid, 'A typical Barossa Shiraz',                 138.96, -34.52),
      ('b4abafcc-03e4-4b9d-9288-4384fe685bcb'::uuid, 'A typical Clare Valley Riesling',          138.61, -33.83),
      ('6de675c2-0611-460d-8b89-506e26f9fff9'::uuid, 'A typical Coonawarra Cabernet Sauvignon',  140.83, -37.29),
      ('4d159a28-6ee3-445e-a821-e314c6bd58c2'::uuid, 'A typical Eden Valley Riesling',           139.10, -34.65),
      ('43805ec4-e7ea-4b06-a651-834da6299acb'::uuid, 'A typical Hunter Valley Semillon',         151.29, -32.78),
      ('cf054f8a-07e9-4d23-ac6c-ac9eca9e59df'::uuid, 'A typical Blaufränkisch',                   16.63,  47.60),
      ('a92188eb-fc36-4ad1-89c9-dda9a9d53594'::uuid, 'A typical Wachau Grüner Veltliner',         15.42,  48.39),
      ('5a8a879d-03c7-445f-85b8-63837dcdb104'::uuid, 'A typical Wachau Riesling',                 15.42,  48.39),
      ('05235473-fc75-4f5c-8908-df19b911ab55'::uuid, 'A typical Chilean Cabernet Sauvignon',     -70.57, -33.61),
      ('3d7aa7a4-846d-4210-a109-b3f07f6cf466'::uuid, 'A typical Santorini Assyrtiko',             25.44,  36.39),
      ('a8097ab3-0200-4ccc-8ab3-0881e21fd535'::uuid, 'A typical Tokaji Aszú',                     21.28,  48.19),
      ('d46a437c-cba9-4966-894f-2da4d808b075'::uuid, 'A typical Central Otago Pinot Noir',       169.20, -45.07),
      ('cd76ac56-06a3-4eb1-8ac6-97a359913f5d'::uuid, 'A typical Marlborough Sauvignon Blanc',    173.83, -41.51),
      ('3ff0167e-6b23-415e-912c-d978a02adf9d'::uuid, 'A typical Stellenbosch Chenin Blanc',       18.86, -33.93),
      ('75e4e467-3929-4844-bbc4-ffe8b12523a1'::uuid, 'A typical Napa Cabernet Sauvignon',       -122.40,  38.43),
      ('c4ea77f3-5599-43dd-bdc3-4287c1e0ea15'::uuid, 'A typical Sonoma Chardonnay',             -122.82,  38.40),
      ('bab8537e-b0bc-4f7c-8547-242537322f8a'::uuid, 'A typical Willamette Pinot Noir',         -123.03,  45.28)
    ) v(id, name, lon, lat)
  loop
    select count(*) into n from public.wine_archetypes where id = r.id and name = r.name;
    if n <> 1 then
      raise exception 'display points: "%" (%) is not a live archetype by that id and name', r.name, r.id;
    end if;
    if exists (select 1 from public.wine_archetypes where id = r.id and wine_place_id is not null) then
      raise notice 'display points: "%" already has a map place; skipped', r.name;
      continue;
    end if;
    update public.wine_archetypes
       set display_lon = r.lon, display_lat = r.lat
     where id = r.id and wine_place_id is null;
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'display points: "%" updated % rows, expected 1', r.name, n;
    end if;
    v_expected := v_expected + 1;
  end loop;

  -- 18 on 2026-09-29; 15 once the USA wave has placed its three.
  select count(*) into v_got from public.wine_archetypes where display_lon is not null;
  if v_got <> v_expected then
    raise exception 'display points: % archetypes carry a point, % expected', v_got, v_expected;
  end if;
  if not (has_column_privilege('authenticated', 'public.wine_archetypes', 'display_lon', 'SELECT')
          and has_column_privilege('authenticated', 'public.wine_archetypes', 'display_lat', 'SELECT')) then
    raise exception 'display points: authenticated cannot read the new columns';
  end if;
end $$;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: The rollback file, the runner and the PostgREST check**

Create `scripts/training-room-map/rollback-r2.sql`:

```sql
-- Undo R2's data (supabase/migrations/<version>_training_room_display_points.sql):
-- spec docs/superpowers/specs/2026-09-29-training-room-map-design.md §4.5.
-- NEVER under supabase/migrations. For completeness only: the R2 rollback is
-- an app revert, or NEXT_PUBLIC_TRAINING_MAP=0 and a redeploy. The two columns
-- are nullable and harmless to the old app, so this runs only if the feature
-- is abandoned, after the R2 app is reverted (a still-deployed R2 app's read
-- fails soft anyway: no curated dots). Run with
-- scripts/training-room-map/run-sql.mjs, --dry first, then for real, only
-- with the owner's go-ahead. Also removes R2's schema_migrations row, by name.

set local lock_timeout = '5s';

alter table public.wine_archetypes
  drop constraint if exists wine_archetypes_display_point_check,
  drop column if exists display_lon,
  drop column if exists display_lat;
delete from supabase_migrations.schema_migrations where name = 'training_room_display_points';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'wine_archetypes'
                and column_name in ('display_lon', 'display_lat')) then
    raise exception 'wine_archetypes still carries a display point column';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where name = 'training_room_display_points') then
    raise exception 'R2''s history row is still recorded';
  end if;
end $$;

notify pgrst, 'reload schema';
```

In `scripts/training-room-map/run-sql.mjs`, replace

```js
if (!/^scripts\/training-room-map\/rollback-r1[ab]\.sql$/.test(normalized)) {
  console.error("run-sql.mjs only runs scripts/training-room-map/rollback-r1a.sql or rollback-r1b.sql");
```

with

```js
if (!/^scripts\/training-room-map\/rollback-r(1a|1b|2)\.sql$/.test(normalized)) {
  console.error("run-sql.mjs only runs scripts/training-room-map/rollback-r1a.sql, rollback-r1b.sql or rollback-r2.sql");
```

Create `scripts/training-room-map/check-display-points.mjs` (main session only; it mints a demo session):

```js
// The pre-deploy check for R2 (training-room-map spec §4.3, §4.5): reads the
// curated display points THROUGH POSTGREST as a signed-in demo person, with
// the room's own select, so a schema cache that has not reloaded shows up here
// and not on production. Main session only, after the R2 apply and before the
// app deploy. Signs in with a magic link + verifyOtp (CLAUDE.md's demo-session
// recipe), never a password. Writes nothing.
//
//   node --env-file=.env.local scripts/training-room-map/check-display-points.mjs [demo.name@blindr.invalid]
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const email = process.argv[2] ?? "demo.isabelle@blindr.invalid";
if (!/^demo\.[a-z]+@blindr\.invalid$/.test(email)) throw new Error("demo accounts only");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkErr) throw linkErr;
const reader = createClient(url, anonKey, opts);
const { error: otpErr } = await reader.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (otpErr) throw otpErr;

// The room's own read (src/lib/training/pool.ts, readDisplayPoints).
const t0 = Date.now();
const { data: points, error: readErr } = await reader
  .from("wine_archetypes")
  .select("id, display_lon, display_lat")
  .not("display_lon", "is", null);
const ms = Date.now() - t0;
if (readErr) throw new Error(`the display-point read through PostgREST failed: ${readErr.message}`);

const { data: all, error: allErr } = await admin.from("wine_archetypes").select("id, name, wine_place_id, display_lon");
if (allErr) throw allErr;
const byId = new Map(all.map((a) => [a.id, a]));
const got = {
  withPoint: points.length,
  placedWithPoint: points.filter((p) => byId.get(p.id)?.wine_place_id).length,
  halfSet: points.filter((p) => p.display_lat === null).length,
  wachauShared:
    new Set(
      points
        .filter((p) => /Wachau/.test(byId.get(p.id)?.name ?? ""))
        .map((p) => `${p.display_lon},${p.display_lat}`),
    ).size === 1,
};
console.log(JSON.stringify({ ...got, archetypes: all.length, ms }));
// 18 before the USA wave places Napa, Sonoma and Willamette; 15 after.
assert.ok([15, 18].includes(got.withPoint), `withPoint = ${got.withPoint}`);
assert.deepEqual({ placedWithPoint: got.placedWithPoint, halfSet: got.halfSet, wachauShared: got.wachauShared }, {
  placedWithPoint: 0,
  halfSet: 0,
  wachauShared: true,
});
console.log("OK: PostgREST serves the curated display points to a signed-in reader");
```

- [ ] **Step 5: The types**

In `src/lib/supabase/database.types.ts`, in `wine_archetypes`, replace the Row's tail

```ts
          typical_age_high: number | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
```

with

```ts
          typical_age_high: number | null;
          sort_order: number;
          created_at: string;
          // 20260929150000 (training-room-map spec RM23): a curated,
          // display-only map point for a typical wine with no map place.
          // Both null or both set (wine_archetypes_display_point_check).
          display_lon: number | null;
          display_lat: number | null;
        };
        Insert: {
```

and the Insert's tail

```ts
          typical_age_high?: number | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wine_archetypes"]["Insert"]>;
```

with

```ts
          typical_age_high?: number | null;
          sort_order?: number;
          created_at?: string;
          display_lon?: number | null;
          display_lat?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["wine_archetypes"]["Insert"]>;
```

(`Update` is `Partial<Insert>`, so it gains both. Every table keeps `Relationships: []`.)

- [ ] **Step 6: Run the tests and a read-only dry run**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/room-map-migrations.test.ts && npx tsc --noEmit && node --check scripts/training-room-map/check-display-points.mjs && node --check scripts/training-room-map/run-sql.mjs && node --check scripts/training-room.test.mjs`
Expected: vitest PASS, 5 tests (4 + 1); `tsc` silent; the three `node --check` silent.

Optional, read-only against live (implementers may run it; it keeps nothing): a throwaway runner in your scratchpad that opens `pg`, runs `begin`, the migration file, then `select count(*)::int total, count(display_lon)::int pts from wine_archetypes`, the rollback file, and ALWAYS `rollback`. Expected: `{ total: 102, pts: 18 }` (15 if the USA wave has placed its three), then 0 display columns after the rollback file. Or, equivalently, `TRAINING_ROOM_APPLY=supabase/migrations/20260929150000_training_room_display_points.sql node --env-file=.env.local --test --test-name-pattern="R2:|leave the owner" scripts/training-room.test.mjs` → 2 pass.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add supabase/migrations/20260929150000_training_room_display_points.sql scripts/training-room-map/rollback-r2.sql scripts/training-room-map/check-display-points.mjs scripts/training-room-map/run-sql.mjs src/lib/supabase/database.types.ts src/lib/training/room-map-migrations.test.ts scripts/training-room.test.mjs && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(db): curated display points for the 18 unplaced typical wines (not applied)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 259 files, 4569 tests.

---

### Task 2: The curated dot — pure shaping and the pool's fail-soft read

**Files:**
- Modify: `src/lib/training/pool-shape.ts`, `src/lib/training/pool.ts`
- Test: `src/lib/training/pool-shape.test.ts`, `src/lib/training/pool.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `DisplayPointRaw = { id: string; display_lon: number | null; display_lat: number | null }`; `DisplayPoint = { lon: number; lat: number }`; `displayPoints(rows: readonly DisplayPointRaw[]): Map<string, DisplayPoint>`; `PoolRaw.displayPoints: ReadonlyMap<string, DisplayPoint>` (required). `shapeCandidates` sets `mapPoint` to the place/ancestor point from `placeLinks`, else `{ ...curated, source: "curated" }`, else null. `placeCanonicalKey` and `mapRegion` never come from a curated point (RM7).

- [ ] **Step 1: Write the failing tests**

(a) `src/lib/training/pool-shape.test.ts`: in the import from `./pool-shape`, add `displayPoints,` before `placeLinks,`. In the `pool()` helper, after `    placeLinks: placeLinks([PAUILLAC_PLACE, NO_PLACE]),` add `    displayPoints: new Map(),`. Immediately before `describe("shapeCandidates", () => {` add:

```ts
describe("curated display points (training-room-map spec RM12, RM23)", () => {
  it("displayPoints keeps a whole, finite, in-range point by archetype id", () => {
    expect(displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 15.42, display_lat: 48.39 }])).toEqual(
      new Map([[ARCH_BOURGOGNE, { lon: 15.42, lat: 48.39 }]]),
    );
  });

  it("drops a half-set, non-finite or out-of-range point", () => {
    for (const bad of [
      { display_lon: 15.42, display_lat: null },
      { display_lon: null, display_lat: 48.39 },
      { display_lon: Number.NaN, display_lat: 48.39 },
      { display_lon: 180.01, display_lat: 0 },
      { display_lon: 0, display_lat: -90.5 },
    ]) {
      expect(displayPoints([{ id: ARCH_BOURGOGNE, ...bad }]).size).toBe(0);
    }
  });

  it("an unplaced wine takes its curated point, as 'curated', and stays off the map's links", () => {
    const shaped = shapeCandidates(
      pool({ displayPoints: displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 4.8, display_lat: 47.1 }]) }),
    );
    expect(shaped.find((c) => c.id === ARCH_BOURGOGNE)).toMatchObject({
      placeCanonicalKey: null,
      mapRegion: null,
      mapPoint: { lon: 4.8, lat: 47.1, source: "curated" },
    });
  });

  it("a place point wins over a curated one", () => {
    const shaped = shapeCandidates(
      pool({ displayPoints: displayPoints([{ id: ARCH_PAUILLAC, display_lon: 1, display_lat: 1 }]) }),
    );
    expect(shaped.find((c) => c.id === ARCH_PAUILLAC)?.mapPoint).toEqual({
      lon: -0.7708,
      lat: 45.1971,
      source: "place",
    });
  });

  it("the RPC's fail-soft path still shows the curated points, and nothing else", () => {
    const shaped = shapeCandidates(
      pool({
        placeLinks: placeLinks([]),
        displayPoints: displayPoints([{ id: ARCH_BOURGOGNE, display_lon: 4.8, display_lat: 47.1 }]),
      }),
    );
    expect(shaped.find((c) => c.id === ARCH_PAUILLAC)?.mapPoint).toBeNull();
    expect(shaped.find((c) => c.id === ARCH_BOURGOGNE)?.mapPoint?.source).toBe("curated");
  });
});

```

(b) `src/lib/training/pool.test.ts`: replace the whole `fakeClient` block — from `/** A PostgREST stand-in: every builder method chains, awaiting it answers` through the closing `},` of its `from(table: string) {…}` method — with:

```ts
const UNPLACED_ROW = {
  archetype_id: ARCH,
  place_key: null,
  region_key: null,
  region_name: null,
  point_key: null,
  point_lon: null,
  point_lat: null,
};

// The display-point read's select (spec RM23): answered from `display`, not TABLES.
const DISPLAY_COLUMNS = "id, display_lon, display_lat";

/** A PostgREST stand-in: every builder method chains, awaiting it answers
    that table's rows (or `fails`'s error, by table and selected columns);
    `calls` records the order. */
function fakeClient(
  rpc: Rpc,
  fails: (table: string, columns: string) => boolean = () => false,
  display: unknown[] = [],
) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      let columns = "";
      const result = () => {
        if (fails(table, columns)) return Promise.resolve({ data: null, error: { message: "boom" } });
        const rows = table === "wine_archetypes" && columns === DISPLAY_COLUMNS ? display : (TABLES[table] ?? []);
        return Promise.resolve({ data: rows, error: null });
      };
      const builder: Record<string, unknown> = {};
      for (const m of ["order", "range", "in", "eq", "not"]) builder[m] = () => builder;
      builder.select = (c: string) => {
        columns = c;
        return builder;
      };
      builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => result().then(ok, bad);
      return builder;
    },
```

(the `rpc(fn)` method and the rest of the helper stay as they are). Then replace the last test of the file, `it("a failed archetype read still fails the page", …)` and the `});` closing its `describe`, with:

```ts
  it("a failed archetype read still fails the page", async () => {
    const { readTrainingPool } = await import("./pool");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      async () => ({ data: [PLACE_ROW], error: null }),
      (table) => table === "wine_archetypes",
    );

    await expect(readTrainingPool(client)).rejects.toThrow("Training room: the archetypes read failed (boom)");
  });
});

describe("readTrainingPool's curated display points (spec RM23)", () => {
  it("reads them in the first round and gives an unplaced wine its curated dot", async () => {
    const { readTrainingPool } = await import("./pool");
    const { client, calls } = fakeClient(
      async () => ({ data: [UNPLACED_ROW], error: null }),
      () => false,
      [{ id: ARCH, display_lon: 15.42, display_lat: 48.39 }],
    );

    const [wine] = await readTrainingPool(client);

    expect(wine).toMatchObject({
      placeCanonicalKey: null,
      mapRegion: null,
      mapPoint: { lon: 15.42, lat: 48.39, source: "curated" },
    });
    const archetypeReads = calls.flatMap((c, i) => (c === "from:wine_archetypes" ? [i] : []));
    expect(archetypeReads).toHaveLength(2);
    expect(Math.max(...archetypeReads)).toBeLessThan(calls.indexOf("from:countries"));
  });

  it("a place point wins: the curated one is ignored", async () => {
    const { readTrainingPool } = await import("./pool");
    const { client } = fakeClient(
      async () => ({ data: [PLACE_ROW], error: null }),
      () => false,
      [{ id: ARCH, display_lon: 1, display_lat: 1 }],
    );

    const [wine] = await readTrainingPool(client);

    expect(wine.mapPoint).toEqual({ lon: -0.7708, lat: 45.1971, source: "place" });
  });

  it("a failed display-point read logs once and shows no curated dot; the pool still comes back", async () => {
    const { readTrainingPool } = await import("./pool");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fakeClient(
      async () => ({ data: [UNPLACED_ROW], error: null }),
      (table, columns) => table === "wine_archetypes" && columns === DISPLAY_COLUMNS,
      [{ id: ARCH, display_lon: 15.42, display_lat: 48.39 }],
    );

    const pool = await readTrainingPool(client);

    expect(pool).toHaveLength(1);
    expect(pool[0].mapPoint).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe("training pool: display points");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/pool-shape.test.ts src/lib/training/pool.test.ts`
Expected: FAIL — `displayPoints is not a function`; the pool tests find no curated `mapPoint` and only one `from:wine_archetypes` call.

- [ ] **Step 3: Implement the shaping**

In `src/lib/training/pool-shape.ts`, replace

```ts
  placeLinks: ReadonlyMap<string, PlaceLink>;
};
```

(the end of `PoolRaw`) with

```ts
  placeLinks: ReadonlyMap<string, PlaceLink>;
  /** By archetype id, from displayPoints(); an empty map (the display-point
      read's fail-soft path, spec RM23) leaves no curated dot. */
  displayPoints: ReadonlyMap<string, DisplayPoint>;
};

/** One row of the room's display-point read (training-room-map spec RM23). */
export type DisplayPointRaw = { id: string; display_lon: number | null; display_lat: number | null };

/** A curated, display-only map point: never a map place (spec RM7, RM23). */
export type DisplayPoint = { lon: number; lat: number };

/**
 * The curated display points by archetype id (spec RM23). A half-set,
 * non-finite or out-of-range point is no point: the database's check refuses
 * one, and the room never trusts a row it did not check.
 */
export function displayPoints(rows: readonly DisplayPointRaw[]): Map<string, DisplayPoint> {
  const out = new Map<string, DisplayPoint>();
  for (const r of rows) {
    if (inRange(r.display_lon, 180) && inRange(r.display_lat, 90)) {
      out.set(r.id, { lon: r.display_lon, lat: r.display_lat });
    }
  }
  return out;
}
```

(`inRange` is the file's existing function declaration, hoisted.) In `shapeCandidates`, replace

```ts
    out.push({
      id: a.id,
      name: a.name,
```

with

```ts
    // A dot's position, in order (spec RM12): the home's label point, the
    // nearest ancestor's (both from placeLinks), else the curated point.
    const place = raw.placeLinks.get(a.id) ?? UNPLACED;
    const curated = raw.displayPoints.get(a.id);
    out.push({
      id: a.id,
      name: a.name,
```

and replace

```ts
      ...(raw.placeLinks.get(a.id) ?? UNPLACED),
      qualityLow: a.quality_low,
```

with

```ts
      ...place,
      mapPoint: place.mapPoint ?? (curated ? { ...curated, source: "curated" } : null),
      qualityLow: a.quality_low,
```

- [ ] **Step 4: Implement the read**

In `src/lib/training/pool.ts`: in the import from `./pool-shape` add `displayPoints,` after `pageOf,` and `type DisplayPointRaw,` after `type CatalogDisplayRaw,`. Immediately before `const ARCHETYPE_COLUMNS: string =` add:

```ts
// The curated display points (training-room-map spec RM23), a separate read
// that fails SOFT like the RPC above: it serves the likelihood map's dots
// only. The main archetype read never selects these columns, so an app
// deployed before 20260929150000 keeps working (the select fails, is logged
// once, and no curated dot shows). Only rows that carry a point come back
// (18 on 2026-09-29), far under PostgREST's 1000-row answer.
async function readDisplayPoints(supabase: Client): Promise<DisplayPointRaw[]> {
  try {
    const { data, error } = await supabase
      .from("wine_archetypes")
      .select("id, display_lon, display_lat")
      .not("display_lon", "is", null);
    if (error) {
      console.error("training pool: display points", error);
      return [];
    }
    return (data ?? []) as DisplayPointRaw[];
  } catch (error) {
    console.error("training pool: display points", error);
    return [];
  }
}

```

Replace `  const [archetypesRaw, aromasRaw, termsRaw, designationsRaw, placeRows] = await Promise.all([` with `  const [archetypesRaw, aromasRaw, termsRaw, designationsRaw, placeRows, pointRows] = await Promise.all([`; replace

```ts
    readArchetypePlaces(supabase),
  ]);
```

with

```ts
    readArchetypePlaces(supabase),
    // Also first round, and also fail-soft (spec RM23).
    readDisplayPoints(supabase),
  ]);
```

and replace

```ts
    placeLinks: placeLinks(placeRows),
  });
```

with

```ts
    placeLinks: placeLinks(placeRows),
    // The 18 unplaced typical wines' curated dots (spec §7), used only where
    // no place or ancestor point resolves (RM12).
    displayPoints: displayPoints(pointRows),
  });
```

- [ ] **Step 5: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/pool-shape.test.ts src/lib/training/pool.test.ts && npx tsc --noEmit`
Expected: PASS — pool-shape 33 tests (28 + 5), pool 7 tests (4 + 3); `tsc` silent.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/lib/training/pool-shape.ts src/lib/training/pool-shape.test.ts src/lib/training/pool.ts src/lib/training/pool.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): unplaced typical wines get their curated map point, read fail-soft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 259 files, 4577 tests.

---

### Task 3: The heat block in both palettes

**Files:**
- Modify: `src/lib/wine-map/map-palette.ts`
- Test: `src/lib/wine-map/map-palette.test.ts`

**Interfaces:**
- Produces: `MapPalette.heat: { stops: readonly [string, string, string, string]; capped: string; neutral: string; casing: string }`, appended LAST in both tables (spec §13: a collaborator also edits this file; the block is merged in by hand after theirs).

- [ ] **Step 1: Write the failing tests**

In `src/lib/wine-map/map-palette.test.ts`, extend `colorLeaves` so the hex check covers the new block — replace

```ts
    p.selectedRing,
    p.selectedCasing,
    ...Object.values(p.label),
  ];
}
```

with

```ts
    p.selectedRing,
    p.selectedCasing,
    ...Object.values(p.label),
    ...p.heat.stops,
    p.heat.capped,
    p.heat.neutral,
    p.heat.casing,
  ];
}
```

and append to the END of the file:

```ts

// The training room's likelihood dots (training-room-map spec RM13, RM14,
// §11): lightness and size both carry heat, and a ruled-out wine is a ring,
// so the ramp must read by lightness alone, away from the ground.
describe("the heat ramp (training room)", () => {
  const grounds = [
    ["light", light, POSITRON_LAND],
    ["dark", dark, DARK_MATTER_LAND],
  ] as const;

  it("is keyed alike in both tables, four stops each", () => {
    expect(Object.keys(dark.heat).sort()).toEqual(Object.keys(light.heat).sort());
    expect(light.heat.stops).toHaveLength(4);
    expect(dark.heat.stops).toHaveLength(4);
  });

  it("pins the measured values; light's hottest stop is the brand bordeaux", () => {
    expect(light.heat).toEqual({
      stops: ["#A7813A", "#A95834", "#8C2D3C", "#5C1A2B"],
      capped: "#8A8580",
      neutral: "#8A7A6A",
      casing: "#FFFDF7",
    });
    expect(dark.heat).toEqual({
      stops: ["#8E6A42", "#BF7253", "#E88A92", "#F7D6AE"],
      capped: "#8A847D",
      neutral: "#978A7D",
      casing: "#120E0C",
    });
  });

  for (const [name, p, land] of grounds) {
    describe(name, () => {
      it("every stop, the capped ring and the neutral dot clear 3:1 on the land", () => {
        for (const c of [...p.heat.stops, p.heat.capped, p.heat.neutral]) {
          expect(contrast(c, land), c).toBeGreaterThanOrEqual(3);
        }
      });

      it("the hottest stop clears 3:1 against the coldest", () => {
        expect(contrast(p.heat.stops[3], p.heat.stops[0])).toBeGreaterThanOrEqual(3);
      });

      it("OKLab lightness moves away from the ground at every step, by at least 0.07", () => {
        const direction = oklab(land)[0] > 0.5 ? -1 : 1;
        const ls = [land, ...p.heat.stops].map((c) => oklab(c)[0]);
        for (let i = 1; i < ls.length; i += 1) {
          expect(direction * (ls[i] - ls[i - 1]), `step ${i}`).toBeGreaterThanOrEqual(0.07);
        }
      });

      it("adjacent stops are at least 0.09 apart (OKLab ΔE)", () => {
        for (let i = 1; i < 4; i += 1) {
          expect(deltaE(p.heat.stops[i], p.heat.stops[i - 1]), `stop ${i}`).toBeGreaterThanOrEqual(0.09);
        }
      });

      it("the ring and the neutral dot are not mistaken for the coldest stop", () => {
        expect(deltaE(p.heat.capped, p.heat.stops[0])).toBeGreaterThanOrEqual(0.08);
        expect(deltaE(p.heat.neutral, p.heat.stops[0])).toBeGreaterThanOrEqual(0.07);
      });

      it("the casing reads as ground, and is the theme's selectedCasing", () => {
        expect(contrast(p.heat.casing, land)).toBeLessThanOrEqual(1.2);
        expect(p.heat.casing).toBe(p.selectedCasing);
      });
    });
  }
});
```

(Measured on these values: stop contrast light 3.44 / 4.86 / 7.86 / 12.27:1, dark 3.94 / 5.28 / 7.80 / 13.96:1; hottest vs coldest 3.57 / 3.54; L steps from the land −0.359 / −0.075 / −0.107 / −0.113 (light), +0.388 / +0.078 / +0.105 / +0.159 (dark); adjacent ΔE ≥ 0.104 / 0.094; capped ΔE vs coldest 0.091 / 0.088, neutral 0.079 / 0.102; casing 1.03 / 1.01.)

- [ ] **Step 2: Run to see it fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/wine-map/map-palette.test.ts`
Expected: FAIL — TypeScript-level `p.heat` is undefined at runtime (`Cannot read properties of undefined (reading 'stops')`) in `colorLeaves` and every new case.

- [ ] **Step 3: Implement**

In `src/lib/wine-map/map-palette.ts`, replace the end of the `MapPalette` type

```ts
    distant: string;
    halo: string;
  };
};
```

with

```ts
    distant: string;
    halo: string;
  };
  /** The training room's likelihood dots (training-room-map spec RM13,
      RM14): four stops from least close to closest (heat 0.5 / 0.75 / 0.9 /
      1), a ruled-out wine's hollow ring, a dot with no number yet, and the
      keyline that cuts overlapping dots apart (the theme's selectedCasing).
      The ramp runs away from the ground like the classification ramp:
      darker toward bordeaux on Positron, brighter toward cream on Dark
      Matter. Kept LAST in each table: a collaborator also edits this file,
      and the block is merged in by hand after theirs (spec §13). */
  heat: {
    stops: readonly [string, string, string, string];
    capped: string;
    neutral: string;
    casing: string;
  };
};
```

Replace the end of the LIGHT table

```ts
      distant: "#7a666f",
      halo: "#FFFDF7",
    },
  },
```

with

```ts
      distant: "#7a666f",
      halo: "#FFFDF7",
    },
    // On Positron #fafaf8: stops 3.44 / 4.86 / 7.86 / 12.27:1, the hottest
    // the brand bordeaux; capped 3.50:1, neutral 3.96:1.
    heat: {
      stops: ["#A7813A", "#A95834", "#8C2D3C", "#5C1A2B"],
      capped: "#8A8580",
      neutral: "#8A7A6A",
      casing: "#FFFDF7",
    },
  },
```

and the end of the DARK table

```ts
      distant: "#978A7D",
      halo: "#120E0C",
    },
  },
};
```

with

```ts
      distant: "#978A7D",
      halo: "#120E0C",
    },
    // On Dark Matter #0e0e0e: stops 3.94 / 5.28 / 7.80 / 13.96:1, the
    // hottest a cream; capped 5.22:1, neutral 5.74:1.
    heat: {
      stops: ["#8E6A42", "#BF7253", "#E88A92", "#F7D6AE"],
      capped: "#8A847D",
      neutral: "#978A7D",
      casing: "#120E0C",
    },
  },
};
```

- [ ] **Step 4: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/wine-map/map-palette.test.ts && npx tsc --noEmit`
Expected: PASS, 31 tests (17 + 14); `tsc` silent (the explorer's other palette readers are untouched).

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/lib/wine-map/map-palette.ts src/lib/wine-map/map-palette.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(map): the training room's heat ramp in both map palettes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 259 files, 4591 tests.

---

### Task 4: Shared map modules, additively — the training source id, hover options, the boundary's fallback

**Files:**
- Modify: `src/lib/wine-map/basemap.ts`, `src/lib/wine-map/hover-cursor.ts`, `src/app/knowledge/map/map-error-boundary.tsx`
- Test: `src/lib/wine-map/basemap.test.ts`, `src/lib/wine-map/hover-cursor.test.ts`, `src/app/knowledge/map/map-error-boundary.test.ts`

**Interfaces:**
- Produces: `TRAINING_SOURCE_ID = "wine-training"` and `isWineSourceId(TRAINING_SOURCE_ID) === true` (so `withWineLayers` carries it); `HoverFeature` (now exported), `HoverGeometry = [number, number] | [[number, number], [number, number]]`, `hoverGeometry(point, box)`, and `installHoverCursor(map, { layers, raf?, cancelRaf?, isClickable?, box?, onHover? })` — with none of the new options the explorer's behaviour and listeners are unchanged; `MapErrorBoundary`'s optional `fallback?: (error: Error, isChunk: boolean) => ReactNode`.

- [ ] **Step 1: Write the failing tests**

(a) `src/lib/wine-map/basemap.test.ts`: in the import from `./basemap`, add `TRAINING_SOURCE_ID,` after `shardSourceId,`. Append to the END of the file:

```ts

// The training room's likelihood map (training-room-map spec RM21) swaps its
// basemap with the same contract: its GeoJSON source and its two layers ride
// across in order, and the diff never names them.
describe("the training room's dots across a swap", () => {
  const TRAINING_SOURCE = {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-0.77, 45.2] },
          properties: { id: "a1", state: "scored", heat: 1, label: "Pauillac 91 %", rank: 1, sort: 1 },
        },
      ],
    },
    promoteId: "id",
  } as const;
  const TRAINING_LAYERS = [
    {
      id: "training-dots",
      type: "circle",
      source: TRAINING_SOURCE_ID,
      layout: { "circle-sort-key": ["get", "sort"] },
      paint: { "circle-radius": 6, "circle-color": "#5C1A2B" },
    },
    {
      id: "training-labels",
      type: "symbol",
      source: TRAINING_SOURCE_ID,
      filter: ["!=", ["get", "label"], ""],
      layout: { "text-field": ["get", "label"], "symbol-sort-key": ["get", "rank"] },
      paint: { "text-color": "#2b0f18" },
    },
  ] as LayerSpecification[];
  const roomStyle = (basemap: StyleSpecification): StyleSpecification => {
    const tuned = tuneBasemapStyle(basemap);
    return {
      ...tuned,
      sources: { ...tuned.sources, [TRAINING_SOURCE_ID]: structuredClone(TRAINING_SOURCE) as never },
      layers: [...tuned.layers, ...structuredClone(TRAINING_LAYERS)],
    };
  };

  it("is one of our sources, and nothing that merely starts like it is", () => {
    expect(TRAINING_SOURCE_ID).toBe("wine-training");
    expect(isWineSourceId(TRAINING_SOURCE_ID)).toBe(true);
    expect(isWineSourceId("wine-trainingx")).toBe(false);
    expect(isWineSourceId("wine-train")).toBe(false);
  });

  it("withWineLayers carries the source and both layers, byte for byte, last and in order", () => {
    const prev = roomStyle(positron);
    const next = tuneBasemapStyle(darkMatter);
    const result = withWineLayers(prev, next);
    expect(result.sources[TRAINING_SOURCE_ID]).toEqual(prev.sources[TRAINING_SOURCE_ID]);
    expect(result.layers.slice(-2)).toEqual(TRAINING_LAYERS);
    expect(result.layers.slice(0, -2)).toEqual(next.layers);
  });

  it("the diff of a light-to-dark swap never names the training source or its layers", () => {
    const prev = roomStyle(positron);
    const next = withWineLayers(prev, tuneBasemapStyle(darkMatter));
    const ids = [TRAINING_SOURCE_ID, ...TRAINING_LAYERS.map((l) => l.id)];
    for (const command of diff(prev, next)) {
      for (const id of ids) {
        expect(JSON.stringify(command.args).includes(JSON.stringify(id)), `${command.command} names ${id}`).toBe(false);
      }
    }
    expect(validateStyleMin(next)).toEqual([]);
  });

  it("basemapTweaks never touches a training layer", () => {
    expect(basemapTweaks(TRAINING_LAYERS)).toEqual({ remove: [], zoomRanges: [] });
  });
});
```

(b) `src/lib/wine-map/hover-cursor.test.ts`: replace the import line with

```ts
import {
  hoverGeometry,
  hoverIsClickable,
  installHoverCursor,
  type HoverGeometry,
  type HoverMap,
  type HoverPoint,
} from "./hover-cursor";
```

In `fakeMap`, replace `    queries: [] as { point: [number, number]; layers: string[] }[],` with `    queries: [] as { point: HoverGeometry; layers: string[] }[],`, and replace

```ts
    for (const fn of [...of("moveend")]) (fn as () => void)();
  };
  return { map, state, move, moveEnd, listeners };
```

with

```ts
    for (const fn of [...of("moveend")]) (fn as () => void)();
  };
  // The pointer leaving the canvas.
  const out = () => {
    for (const fn of [...of("mouseout")]) (fn as () => void)();
  };
  return { map, state, move, moveEnd, out, listeners };
```

Append to the END of the file:

```ts

// The training room's options (training-room-map spec RM15, RM18): all three
// optional; the explorer passes none and keeps every behaviour above.
describe("installHoverCursor's room options", () => {
  const DOTS = ["training-dots"];

  it("with no new option it queries the exact point and never listens for mouseout", () => {
    const { map, state, move, listeners } = fakeMap([{ properties: { tier: 3 } }], { layers: DOTS });
    const f = frames();
    installHoverCursor(map, { layers: () => DOTS, raf: f.raf, cancelRaf: f.cancelRaf });
    expect(listeners.size).toBe(2);
    move(10, 20);
    f.flush();
    expect(state.queries[0].point).toEqual([10, 20]);
  });

  it("hoverGeometry: the exact point at 0, a square of that half-size otherwise", () => {
    expect(hoverGeometry({ x: 10, y: 20 }, 0)).toEqual([10, 20]);
    expect(hoverGeometry({ x: 10, y: 20 }, 6)).toEqual([
      [4, 14],
      [16, 26],
    ]);
  });

  it("isClickable replaces the tier rule, and box queries the square", () => {
    // Room dots carry no tier: hoverIsClickable would say no past z5.
    const { map, state, move } = fakeMap([{ properties: { id: "a1" } }], { zoom: 8, layers: DOTS });
    const f = frames();
    installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      box: 6,
    });
    move(50, 60);
    f.flush();
    expect(state.queries).toEqual([
      {
        point: [
          [44, 54],
          [56, 66],
        ],
        layers: DOTS,
      },
    ]);
    expect(state.canvas.style.cursor).toBe("pointer");
  });

  it("onHover gets the hits once per frame, [] over nothing, and [] when the pointer leaves", () => {
    const { map, state, move, out, listeners } = fakeMap([{ properties: { id: "a1" } }], { layers: DOTS });
    const f = frames();
    const seen: { ids: unknown[]; point: HoverPoint }[] = [];
    const dispose = installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      onHover: (features, point) => seen.push({ ids: features.map((x) => x.properties?.id), point }),
    });
    expect(listeners.size).toBe(3);
    move(1, 1);
    move(2, 2);
    f.flush();
    expect(seen).toEqual([{ ids: ["a1"], point: { x: 2, y: 2 } }]);

    state.features = [];
    move(3, 3);
    f.flush();
    expect(seen[1]).toEqual({ ids: [], point: { x: 3, y: 3 } });

    // Leaving cancels a pending frame, clears the cursor and reports nothing under it.
    state.features = [{ properties: { id: "a1" } }];
    move(4, 4);
    state.canvas.style.cursor = "pointer";
    out();
    expect(f.pending).toBe(0);
    expect(state.canvas.style.cursor).toBe("");
    expect(seen[2]).toEqual({ ids: [], point: { x: 4, y: 4 } });

    dispose();
    expect(listeners.size).toBe(0);
  });

  it("a throwing query reports [] to onHover and no pointer", () => {
    const { map, state, move } = fakeMap([{ properties: { id: "a1" } }], { layers: DOTS });
    state.throwOnQuery = true;
    const f = frames();
    const seen: unknown[][] = [];
    installHoverCursor(map, {
      layers: () => DOTS,
      raf: f.raf,
      cancelRaf: f.cancelRaf,
      isClickable: (features) => features.length > 0,
      onHover: (features) => seen.push([...features]),
    });
    move(1, 1);
    expect(() => f.flush()).not.toThrow();
    expect(seen).toEqual([[]]);
    expect(state.canvas.style.cursor).toBe("");
  });
});
```

(c) `src/app/knowledge/map/map-error-boundary.test.ts`: replace the import `import { isChunkLoadError, MapErrorBoundary } from "./map-error-boundary";` with `import { isChunkLoadError, MapErrorBoundary, MapUnavailableCard } from "./map-error-boundary";` and append to the END:

```ts

// The training room's optional fallback (training-room-map spec RM22): the
// room renders its own two states; the explorer passes none and keeps its card.
describe("MapErrorBoundary's fallback prop", () => {
  function renderWith(error: Error, fallback?: (e: Error, isChunk: boolean) => unknown) {
    const boundary = new MapErrorBoundary({
      resetKey: 0,
      onRetry: () => {},
      fallback: fallback as never,
      children: "the map",
    });
    boundary.state = { error, resetKey: 0 };
    return boundary.render();
  }

  it("renders fallback(error, true) for a chunk error", () => {
    const chunk = new Error("Loading chunk 482 failed.");
    chunk.name = "ChunkLoadError";
    const calls: [string, boolean][] = [];
    const out = renderWith(chunk, (e, isChunk) => {
      calls.push([e.message, isChunk]);
      return "reload card";
    });
    expect(out).toBe("reload card");
    expect(calls).toEqual([["Loading chunk 482 failed.", true]]);
  });

  it("renders fallback(error, false) for any other error", () => {
    const calls: boolean[] = [];
    renderWith(new Error("Style is not done loading."), (_e, isChunk) => {
      calls.push(isChunk);
      return null;
    });
    expect(calls).toEqual([false]);
  });

  it("without a fallback renders the explorer's own card, and the children while healthy", () => {
    const out = renderWith(new Error("x")) as { type: unknown };
    expect(out.type).toBe(MapUnavailableCard);
    const healthy = new MapErrorBoundary({ resetKey: 0, onRetry: () => {}, children: "the map" });
    expect(healthy.render()).toBe("the map");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/wine-map/basemap.test.ts src/lib/wine-map/hover-cursor.test.ts src/app/knowledge/map/map-error-boundary.test.ts`
Expected: FAIL — `TRAINING_SOURCE_ID` undefined (`isWineSourceId(undefined)`), `hoverGeometry is not a function`, and the boundary's `fallback` ignored (it renders `MapUnavailableCard`).

- [ ] **Step 3: Implement `basemap.ts`**

Replace

```ts
/** Is this one of the map's own sources, as opposed to the basemap's? */
export function isWineSourceId(id: string): boolean {
  return (
    id === WORLD_SOURCE_ID ||
    (id.startsWith(SHARD_SOURCE_PREFIX) && id.length > SHARD_SOURCE_PREFIX.length)
  );
}
```

with

```ts
/** The training room's likelihood map: its one GeoJSON source of typical-wine
    dots (training-room-map spec RM16, RM21). Carried across a theme swap like
    the explorer's own sources; no explorer source uses this id, so the
    explorer is unaffected. */
export const TRAINING_SOURCE_ID = "wine-training";

/** Is this one of the map's own sources, as opposed to the basemap's? */
export function isWineSourceId(id: string): boolean {
  return (
    id === WORLD_SOURCE_ID ||
    id === TRAINING_SOURCE_ID ||
    (id.startsWith(SHARD_SOURCE_PREFIX) && id.length > SHARD_SOURCE_PREFIX.length)
  );
}
```

- [ ] **Step 4: Implement `hover-cursor.ts`**

Replace the whole file with (the explorer's lines are kept; the three options are additive, and `mouseout` is listened to only when `onHover` is given):

```ts
// The map's pointer cursor, set from a throttled mousemove listener.
//
// It used to be react-map-gl's `onMouseMove` prop. Any hover prop makes
// react-map-gl run queryRenderedFeatures over every interactive layer (two per
// mounted shard plus the world ones) on EVERY mousemove, mid-pan included,
// just to decide between two cursors. Here: at most one query per animation
// frame, none while the map is moving (a drag or an ease owns the cursor
// then), and only over the interactive layers that exist. At moveend the
// resting pointer is re-checked once, since the map moved under it and no
// mousemove may follow.
//
// Three optional, additive options serve the training room's likelihood map
// (training-room-map spec RM15, RM18); the explorer passes none of them and
// behaves exactly as before: `isClickable` replaces hoverIsClickable (the
// room's dots carry no `tier`), `box` queries a square of that half-size
// around the pointer instead of the exact point (a 6 px dot is hard to hit
// exactly), and `onHover` receives the hits once per frame — and [] when the
// pointer leaves the canvas — to drive a tooltip.
// Pure: no imports; TileWineMap passes the MapLibre map.

export type HoverPoint = { x: number; y: number };

export type HoverFeature = { properties?: Record<string, unknown> | null };

/** A pixel point, or a [top-left, bottom-right] pixel box. */
export type HoverGeometry = [number, number] | [[number, number], [number, number]];

/** The slice of a MapLibre map the cursor needs. */
export type HoverMap = {
  on(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  on(type: "moveend" | "mouseout", fn: () => void): unknown;
  off(type: "mousemove", fn: (e: { point: HoverPoint }) => void): unknown;
  off(type: "moveend" | "mouseout", fn: () => void): unknown;
  isMoving(): boolean;
  getZoom(): number;
  getLayer(id: string): unknown;
  queryRenderedFeatures(geometry: HoverGeometry, options: { layers: string[] }): HoverFeature[];
  getCanvas(): { style: { cursor: string } };
};

/** Mirrors onClick's tier-0 guard: past z5 a click on the country wash is
    discarded, so the country must not advertise a pointer there either. */
export function hoverIsClickable(features: readonly HoverFeature[], zoom: number): boolean {
  return features.some((feature) => {
    const tier = feature.properties?.tier;
    return (typeof tier === "number" ? tier : 0) > 0 || zoom <= 5;
  });
}

/** The exact point, or a square of half-size `box` px around it. */
export function hoverGeometry(point: HoverPoint, box: number): HoverGeometry {
  return box > 0
    ? [
        [point.x - box, point.y - box],
        [point.x + box, point.y + box],
      ]
    : [point.x, point.y];
}

/** Installs the listener; returns its disposer. `layers` is read per frame,
    so it follows the mounted shards without re-installing. */
export function installHoverCursor(
  map: HoverMap,
  opts: {
    layers: () => readonly string[];
    raf?: (cb: () => void) => number;
    cancelRaf?: (handle: number) => void;
    /** Whether the hits under the pointer are clickable (default hoverIsClickable). */
    isClickable?: (features: readonly HoverFeature[], zoom: number) => boolean;
    /** Half-size in px of the square queried around the pointer (default 0: the exact point). */
    box?: number;
    /** The hits under the pointer, once per frame; [] when there are none or the pointer left. */
    onHover?: (features: readonly HoverFeature[], point: HoverPoint) => void;
  },
): () => void {
  const raf = opts.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((handle: number) => cancelAnimationFrame(handle));
  const isClickable = opts.isClickable ?? hoverIsClickable;
  const box = opts.box ?? 0;
  const onHover = opts.onHover;
  let frame: number | null = null;
  let point: HoverPoint | null = null;
  const update = () => {
    frame = null;
    if (!point || map.isMoving()) return;
    let features: readonly HoverFeature[] = [];
    let clickable = false;
    try {
      const layers = opts.layers().filter((id) => map.getLayer(id));
      if (layers.length > 0) {
        features = map.queryRenderedFeatures(hoverGeometry(point, box), { layers });
        clickable = isClickable(features, map.getZoom());
      }
    } catch {
      // Style mid-rebuild: no pointer this frame.
      features = [];
      clickable = false;
    }
    map.getCanvas().style.cursor = clickable ? "pointer" : "";
    onHover?.(features, point);
  };
  const onMove = (e: { point: HoverPoint }) => {
    point = e.point;
    if (frame === null) frame = raf(update);
  };
  // The map settled under a resting pointer (a drag, a wheel zoom, an ease):
  // what is under it may have changed, so re-check once.
  const onMoveEnd = () => {
    if (point && frame === null) frame = raf(update);
  };
  // Only with onHover (the explorer passes none, and its listeners are
  // unchanged): the pointer left the canvas, so nothing is under it.
  const onOut = () => {
    const last = point;
    point = null;
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.getCanvas().style.cursor = "";
    if (last) onHover?.([], last);
  };
  map.on("mousemove", onMove);
  map.on("moveend", onMoveEnd);
  if (onHover) map.on("mouseout", onOut);
  return () => {
    if (frame !== null) cancelRaf(frame);
    frame = null;
    map.off("mousemove", onMove);
    map.off("moveend", onMoveEnd);
    if (onHover) map.off("mouseout", onOut);
  };
}
```

- [ ] **Step 5: Implement the boundary's `fallback`**

In `src/app/knowledge/map/map-error-boundary.tsx`, replace

```tsx
  onRetry: () => void;
  children: ReactNode;
};
```

with

```tsx
  onRetry: () => void;
  /** Optional, additive (training-room-map spec RM22): renders in place of
      MapUnavailableCard. `isChunk` says whether only a page load can fix it
      (isChunkLoadError). The explorer passes none. */
  fallback?: (error: Error, isChunk: boolean) => ReactNode;
  children: ReactNode;
};
```

and in `render()`, replace `    if (!error) return this.props.children;` with

```tsx
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, isChunkLoadError(error));
```

- [ ] **Step 6: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/wine-map/basemap.test.ts src/lib/wine-map/hover-cursor.test.ts src/app/knowledge/map/map-error-boundary.test.ts && npx tsc --noEmit`
Expected: PASS — basemap 31 (27 + 4), hover-cursor 12 (7 + 5), map-error-boundary 10 (7 + 3); `tsc` silent (`tile-wine-map.tsx` still passes the MapLibre map as a `HoverMap` and no new option).

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/lib/wine-map/basemap.ts src/lib/wine-map/basemap.test.ts src/lib/wine-map/hover-cursor.ts src/lib/wine-map/hover-cursor.test.ts src/app/knowledge/map/map-error-boundary.tsx src/app/knowledge/map/map-error-boundary.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(map): a training source id, hover options and a boundary fallback (additive)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 259 files, 4603 tests.

---

### Task 5: The R2 copy (PROVISIONAL) and the R1 English-name nit

**Files:**
- Modify: `src/lib/training/copy.ts`, `src/app/taste/training/map-link.tsx`
- Test: `src/lib/training/copy.test.ts`, `src/app/taste/training/map-link.test.tsx`

**Interfaces:**
- Produces: `TRAINING_COPY.listTab`, `.mapTab`, `.viewsLabel`, `.mapLabel`, `.mapSrNote`, `.closestOnMap`, `.legendLess`, `.legendClosest`, `.legendRuledOut`, `.legendRelative`, `.legendApprox`, `.fitClosest`, `.mapStopped`, `.mapRetry`, `.mapNeedsReload`, `.mapReload`, `.mapUpright`, `.showList`; `stackMore(n: number): string` ("+2"), `unmappedLine(n: number): string`, `chooserTitle(n: number): string`. `GroupMapLink` names the region with `englishName`.

- [ ] **Step 1: Write the failing tests**

(a) `src/lib/training/copy.test.ts`: in the import from `./copy`, add `chooserTitle,` after `bestLine,`, `stackMore,` after `signaturesLine,`, and `unmappedLine,` after `typicalWinesHeading,`. In the exact `TRAINING_COPY` `toEqual`, after `      practiseBlind: "Practise blind in the training room →",` add:

```ts
      listTab: "List",
      mapTab: "Map",
      viewsLabel: "What it could be, as a list or a map",
      mapLabel: "Map of the typical wines, coloured by how close each is to your note",
      mapSrNote: "The list shows the same wines and numbers.",
      closestOnMap: "Closest on the map",
      legendLess: "Less close",
      legendClosest: "Closest",
      legendRuledOut: "Ruled out",
      legendRelative: "Colours compare the wines with each other; the % is each wine's own closeness.",
      legendApprox: "Wines outside the mapped countries sit at an approximate spot.",
      fitClosest: "Fit to the closest",
      mapStopped: "The map stopped working — the list has every wine.",
      mapRetry: "Try the map again",
      mapNeedsReload: "The map needs a page reload to load.",
      mapReload: "Reload the page",
      mapUpright: "Turn your phone upright to see the map.",
      showList: "Show the list",
```

Immediately before `describe("dates", () => {` add:

```ts
describe("the likelihood map's lines (training-room-map spec §9, R2)", () => {
  it("fills the three templates", () => {
    expect(stackMore(2)).toBe("+2");
    expect(stackMore(1)).toBe("+1");
    expect(unmappedLine(18)).toBe("18 not on the wine map yet");
    expect(unmappedLine(1)).toBe("1 not on the wine map yet");
    expect(chooserTitle(3)).toBe("3 wines here");
  });

  it("no map string claims a probability (spec RM27, risk X1)", () => {
    const mapKeys = [
      "listTab", "mapTab", "viewsLabel", "mapLabel", "mapSrNote", "closestOnMap", "legendLess",
      "legendClosest", "legendRuledOut", "legendRelative", "legendApprox", "fitClosest", "mapStopped",
      "mapRetry", "mapNeedsReload", "mapReload", "mapUpright", "showList",
    ] as const;
    const lines = [...mapKeys.map((k) => TRAINING_COPY[k]), stackMore(2), unmappedLine(3), chooserTitle(3)];
    for (const line of lines) expect(line, line).not.toMatch(/likel|chance|probab/i);
  });
});

```

(b) `src/app/taste/training/map-link.test.tsx`: immediately before `  it("reads 'Not on the wine map yet' with no link when the group has no map region", () => {` (inside `describe("GroupMapLink", …)`) add:

```tsx
  it("names the region in English, as the explorer does by default, and keeps its key", () => {
    // R1 review nit: the map's place names are local ("Vallée du Rhône"); the
    // explorer shows English by default (localize-names.ts), so the link does too.
    const rhone = renderToStaticMarkup(<GroupMapLink region={{ key: "france.rhone", name: "Vallée du Rhône" }} />);
    expect(rhone).toContain("Rhône Valley on the wine map");
    expect(rhone).toContain('href="/knowledge/map?place=france.rhone"');
    expect(renderToStaticMarkup(<GroupMapLink region={{ key: "spain.andalucia", name: "Andalucía" }} />)).toContain(
      "Andalusia on the wine map",
    );
    // A name with no English exonym is unchanged.
    expect(renderToStaticMarkup(<GroupMapLink region={{ key: "italy.veneto", name: "Veneto" }} />)).toContain(
      "Veneto on the wine map",
    );
  });

```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/copy.test.ts src/app/taste/training/map-link.test.tsx`
Expected: FAIL — `stackMore is not a function`, the `TRAINING_COPY` `toEqual` missing 18 keys, and "Vallée du Rhône on the wine map" where "Rhône Valley on the wine map" is expected.

- [ ] **Step 3: Implement the copy**

In `src/lib/training/copy.ts`, replace

```ts
  practiseBlind: "Practise blind in the training room →",
} as const;
```

with

```ts
  practiseBlind: "Practise blind in the training room →",
  // the likelihood map (training-room-map spec §9 R2 — PROVISIONAL until the
  // owner approves the table before the R2 deploy). No string claims a
  // probability: the % is each wine's own closeness (spec RM27, risk X1).
  listTab: "List",
  mapTab: "Map",
  viewsLabel: "What it could be, as a list or a map",
  mapLabel: "Map of the typical wines, coloured by how close each is to your note",
  mapSrNote: "The list shows the same wines and numbers.",
  closestOnMap: "Closest on the map",
  legendLess: "Less close",
  legendClosest: "Closest",
  legendRuledOut: "Ruled out",
  legendRelative: "Colours compare the wines with each other; the % is each wine's own closeness.",
  legendApprox: "Wines outside the mapped countries sit at an approximate spot.",
  fitClosest: "Fit to the closest",
  mapStopped: "The map stopped working — the list has every wine.",
  mapRetry: "Try the map again",
  mapNeedsReload: "The map needs a page reload to load.",
  mapReload: "Reload the page",
  mapUpright: "Turn your phone upright to see the map.",
  showList: "Show the list",
} as const;
```

and immediately after the `typicalWinesHeading` function add:

```ts

/** A shared spot's suffix on the map: "+2" when two more wines sit there (RM15). */
export function stackMore(n: number): string {
  return `+${n}`;
}

/** The legend's count of typical wines with no dot at all (hidden at 0). */
export function unmappedLine(n: number): string {
  return `${n} not on the wine map yet`;
}

/** The chooser a tap on a shared spot opens (RM18): "3 wines here". */
export function chooserTitle(n: number): string {
  return `${n} wines here`;
}
```

- [ ] **Step 4: Implement the English region name**

In `src/app/taste/training/map-link.tsx`, add `import { englishName } from "@/lib/wine-map/localize-names";` after `import { cn } from "@/lib/utils";`, and replace

```tsx
/** An expanded group's first row: its map region, or "Not on the wine map yet". */
export function GroupMapLink({ region }: { region: MapPlaceRef | null }) {
```

with

```tsx
/** An expanded group's first row: its map region, or "Not on the wine map yet".
    The region is named as the explorer names it by default, in English
    ("Rhône Valley", not "Vallée du Rhône": localize-names.ts). */
export function GroupMapLink({ region }: { region: MapPlaceRef | null }) {
```

and `      {regionOnMap(region.name)}` with `      {regionOnMap(englishName(region.name))}`.

- [ ] **Step 5: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/copy.test.ts src/app/taste/training/map-link.test.tsx && npx tsc --noEmit`
Expected: PASS — copy 45 (43 + 2), map-link 9 (8 + 1); `tsc` silent.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/lib/training/copy.ts src/lib/training/copy.test.ts src/app/taste/training/map-link.tsx src/app/taste/training/map-link.test.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
copy(training): the likelihood map's lines (provisional, spec §9 R2); English region names in the group link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 259 files, 4606 tests.

---

### Task 6: `map-view.ts` — every rule of the map, pure

**Files:**
- Create: `src/lib/training/map-view.ts`, `src/lib/training/map-view.test.ts`

**Interfaces:**
- Consumes: `TrainingCandidate.mapPoint` (Task 2), `MapPalette.heat` (Task 3), `stackMore`, `percentLabel`, `shortName`, `CLOSE_WINDOW` (`copy.ts`).
- Produces (used by Task 8 only): `Bbox`; constants `HEAT_STOPS`, `LABEL_COUNT`, `LABEL_ALL_ZOOM`, `EUROPE_BOX`, `FIT_MAX_ZOOM`, `FIT_PADDING`, `FIT_MIN_SPAN_DEG`, `CAMERA_SET_MAX`, `CAMERA_REACH_DEG`, `CAMERA_SETTLE_MS`, `HIT_SLOP_PX`, `LABEL_TEXT_SIZE`; types `DotState`, `DotProperties`, `DotFeature`, `DotCollection`, `LabelledSpot`; `heatOf`, `leaderCloseness`, `dotText`, `labelledPositions`, `closestSpots`, `trainingFeatures`, `featuresFingerprint`, `closeSet`, `fitSet`, `cameraTarget`, `cameraKey`, `shouldAutoFit`, `chooserOrder`, `hoverLabel`, `unmappedCandidates`, `DOT_LAYOUT`, `dotPaint`, `labelLayout`, `LABEL_FILTER`, `labelPaint`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/training/map-view.test.ts`:

```ts
import { validateStyleMin, type StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import { MAP_PALETTES } from "../wine-map/map-palette";
import { arch } from "./__fixtures__/archetypes";
import { stripLine } from "./copy";
import {
  CAMERA_REACH_DEG,
  CAMERA_SET_MAX,
  CAMERA_SETTLE_MS,
  DOT_LAYOUT,
  EUROPE_BOX,
  FIT_MAX_ZOOM,
  FIT_MIN_SPAN_DEG,
  HEAT_STOPS,
  LABEL_ALL_ZOOM,
  LABEL_COUNT,
  LABEL_FILTER,
  cameraKey,
  cameraTarget,
  chooserOrder,
  closeSet,
  closestSpots,
  dotPaint,
  featuresFingerprint,
  fitSet,
  heatOf,
  hoverLabel,
  labelLayout,
  labelPaint,
  labelledPositions,
  shouldAutoFit,
  trainingFeatures,
  unmappedCandidates,
} from "./map-view";
import type { CapReason, MapPoint, RankedCandidate, TrainingCandidate } from "./types";

// The likelihood map's pure rules (training-room-map spec RM12-RM18, RM26, §11).

/** A fixture wine given a dot. */
function at(key: string, lon: number, lat: number, source: MapPoint["source"] = "place"): TrainingCandidate {
  return { ...arch(key), mapPoint: { lon, lat, source } };
}

function rc(c: TrainingCandidate, closeness: number | null, capped: CapReason | null = null): RankedCandidate {
  return {
    candidate: c,
    closeness,
    capped,
    explanation: null,
    signatureHits: [],
  };
}

// Real label points, roughly (spec §2, §7).
const MARGAUX = at("margaux", -0.67, 45.04);
const COTE_ROTIE = at("cote-rotie", 4.78, 45.49);
const CDP = at("cdp", 4.83, 44.06);
const BANDOL = at("bandol", 5.75, 43.14);
const ALSACE: [number, number] = [7.3, 48.1];
const ALSACE_RIESLING = at("alsace-riesling", ...ALSACE);
const STACK_B = at("sancerre", ...ALSACE);
const STACK_C = at("chablis", ...ALSACE);
const BAROSSA = at("vosne", 138.96, -34.52, "curated");
const OFF_MAP = arch("champagne"); // mapPoint null

describe("constants (spec RM13, RM15, RM17, RM18)", () => {
  it("are the spec's values", () => {
    expect(HEAT_STOPS).toEqual([0.5, 0.75, 0.9, 1]);
    expect(LABEL_COUNT).toBe(3);
    expect(LABEL_ALL_ZOOM).toBe(7);
    expect(EUROPE_BOX).toEqual([-10, 35.5, 27, 52.5]);
    expect(FIT_MAX_ZOOM).toBe(10);
    expect(FIT_MIN_SPAN_DEG).toBe(0.6);
    expect(CAMERA_SET_MAX).toBe(12);
    expect(CAMERA_REACH_DEG).toBe(25);
    expect(CAMERA_SETTLE_MS).toBe(600);
  });
});

describe("heatOf (RM13)", () => {
  it("is null without a closeness", () => {
    expect(heatOf(null, 90)).toBeNull();
    expect(heatOf(null, null)).toBeNull();
  });
  it("is 0 with no leader, or a leader at 0", () => {
    expect(heatOf(40, null)).toBe(0);
    expect(heatOf(0, 0)).toBe(0);
    expect(heatOf(10, -5)).toBe(0);
  });
  it("is linear in the leader's closeness", () => {
    expect(heatOf(90, 90)).toBe(1);
    expect(heatOf(45, 90)).toBe(0.5);
    expect(heatOf(35, 35)).toBe(1); // a 35 % leader is as hot as a 95 % one (risk X1)
    expect(heatOf(81, 90)).toBeCloseTo(0.9);
  });
});

describe("labelledPositions (RM15)", () => {
  it("one label per spot: its best-ranked uncapped wine with a number, +n for the others there", () => {
    const ranked = [
      rc(ALSACE_RIESLING, 88),
      rc(MARGAUX, 80),
      rc(STACK_B, 70),
      rc(COTE_ROTIE, 60),
      rc(STACK_C, 10, "colour"),
    ];
    const spots = [...labelledPositions(ranked).values()];
    expect(spots.map((s) => [s.text, s.rank])).toEqual([
      ["Alsace Riesling 88 % +2", 1],
      ["Margaux 80 %", 2],
      ["Côte-Rôtie 60 %", 3],
    ]);
    expect(spots[0].ids).toEqual(["arch-alsace-riesling", "arch-sancerre", "arch-chablis"]);
    expect(spots[0]).toMatchObject({
      id: "arch-alsace-riesling",
      lon: 7.3,
      lat: 48.1,
    });
  });

  it("a spot whose wines are all ruled out, or not yet measured, has no label", () => {
    const ranked = [rc(MARGAUX, 80), rc(COTE_ROTIE, null), rc(BANDOL, 12, "colour")];
    expect([...labelledPositions(ranked).keys()]).toEqual(["-0.67,45.04"]);
  });

  it("ranks run past three; closestSpots keeps the first three", () => {
    const ranked = [rc(MARGAUX, 90), rc(COTE_ROTIE, 85), rc(CDP, 84), rc(BANDOL, 83), rc(ALSACE_RIESLING, 70)];
    expect([...labelledPositions(ranked).values()].map((s) => s.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(closestSpots(ranked).map((s) => s.text)).toEqual([
      "Margaux 90 %",
      "Côte-Rôtie 85 %",
      "Châteauneuf-du-Pape 84 %",
    ]);
  });

  it("no answers, no labels", () => {
    expect(labelledPositions([rc(MARGAUX, null), rc(CDP, null)]).size).toBe(0);
  });
});

describe("trainingFeatures (RM12, RM13, RM15)", () => {
  it("one feature per wine with a dot, in ranking order; a wine with no dot has none", () => {
    const fc = trainingFeatures([rc(MARGAUX, 90), rc(OFF_MAP, 80), rc(BAROSSA, 45)]);
    expect(fc.features.map((f) => f.properties.id)).toEqual(["arch-margaux", "arch-vosne"]);
    expect(fc.features[1].geometry).toEqual({
      type: "Point",
      coordinates: [138.96, -34.52],
    });
  });

  it("scored: heat relative to the leader (2 dp), sort = heat; the label and rank on the carrier only", () => {
    const fc = trainingFeatures([rc(ALSACE_RIESLING, 90), rc(STACK_B, 60), rc(MARGAUX, 30)]);
    const [a, b, m] = fc.features.map((f) => f.properties);
    expect(a).toEqual({
      id: "arch-alsace-riesling",
      state: "scored",
      heat: 1,
      label: "Alsace Riesling 90 % +1",
      rank: 1,
      sort: 1,
    });
    expect(b).toEqual({
      id: "arch-sancerre",
      state: "scored",
      heat: 0.67,
      label: "",
      rank: 0,
      sort: 0.67,
    });
    expect(m).toEqual({
      id: "arch-margaux",
      state: "scored",
      heat: 0.33,
      label: "Margaux 30 %",
      rank: 2,
      sort: 0.33,
    });
  });

  it("a capped wine is a ring whatever its capped closeness; before any answer every dot is neutral", () => {
    const capped = trainingFeatures([rc(MARGAUX, 50), rc(CDP, 15, "colour")]).features[1].properties;
    expect(capped).toEqual({
      id: "arch-cdp",
      state: "capped",
      heat: 0,
      label: "",
      rank: 0,
      sort: -1,
    });
    const before = trainingFeatures([rc(MARGAUX, null), rc(CDP, null)]).features.map((f) => f.properties);
    for (const p of before)
      expect(p).toMatchObject({
        state: "neutral",
        heat: 0,
        label: "",
        rank: 0,
        sort: -0.5,
      });
  });
});

describe("featuresFingerprint (RM16)", () => {
  const base = [rc(MARGAUX, 90), rc(CDP, 60), rc(BANDOL, 15, "colour")];
  it("is stable for the same ranking", () => {
    expect(featuresFingerprint(trainingFeatures(base))).toBe(featuresFingerprint(trainingFeatures([...base])));
  });
  it("changes with a heat, a label, a rank or a cap", () => {
    const fp = featuresFingerprint(trainingFeatures(base));
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 90), rc(CDP, 50), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 91), rc(CDP, 60), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(CDP, 90), rc(MARGAUX, 60), rc(BANDOL, 15, "colour")]))).not.toBe(
      fp,
    );
    expect(featuresFingerprint(trainingFeatures([rc(MARGAUX, 90), rc(CDP, 60), rc(BANDOL, 15)]))).not.toBe(fp);
  });
});

describe("closeSet (RM17)", () => {
  it("is the leader plus stripLine's 'N more close'", () => {
    const ranked = [rc(MARGAUX, 91), rc(COTE_ROTIE, 85), rc(BANDOL, 81), rc(CDP, 80), rc(STACK_C, 15, "colour")];
    expect(stripLine(ranked)).toBe("Top match: Bordeaux · Margaux 91 % · 2 more close");
    expect(closeSet(ranked).map((r) => r.candidate.id)).toEqual(["arch-margaux", "arch-cote-rotie", "arch-bandol"]);
  });
  it("is empty with no leader", () => {
    expect(closeSet([rc(MARGAUX, null)])).toEqual([]);
    expect(closeSet([rc(MARGAUX, 12, "colour")])).toEqual([]);
  });
});

describe("fitSet and cameraTarget (RM17)", () => {
  it("before any answer, and when everything is ruled out: Europe", () => {
    expect(cameraTarget([rc(MARGAUX, null), rc(BAROSSA, null)])).toEqual({
      box: EUROPE_BOX,
      maxZoom: 10,
    });
    expect(cameraTarget([rc(MARGAUX, 12, "colour")])).toEqual({
      box: EUROPE_BOX,
      maxZoom: 10,
    });
    expect(cameraKey([rc(MARGAUX, null)])).toBe("europe");
  });

  it("after answers: the fit set's box, at most maxZoom 10", () => {
    const target = cameraTarget([rc(MARGAUX, 90), rc(CDP, 85), rc(COTE_ROTIE, 70)]);
    expect(target).toEqual({ box: [-0.67, 44.06, 4.83, 45.04], maxZoom: 10 });
  });

  it("drops a far curated point (Barossa) when the leader is in Europe", () => {
    const ranked = [rc(MARGAUX, 90), rc(BAROSSA, 88), rc(CDP, 85)];
    expect(fitSet(ranked).map((r) => r.candidate.id)).toEqual(["arch-margaux", "arch-cdp"]);
    expect(cameraTarget(ranked)?.box).toEqual([-0.67, 44.06, 4.83, 45.04]);
  });

  it("fits at most CAMERA_SET_MAX wines", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      rc({ ...at("margaux", i * 0.1, 45), id: `w${String(i).padStart(2, "0")}` }, 95 - i * 0.1),
    );
    expect(fitSet(many)).toHaveLength(CAMERA_SET_MAX);
    expect(fitSet(many)[0].candidate.id).toBe("w00");
  });

  it("pads a single spot by FIT_MIN_SPAN_DEG each way (a stack is one spot)", () => {
    expect(cameraTarget([rc(ALSACE_RIESLING, 90), rc(STACK_B, 88), rc(MARGAUX, 20)])?.box).toEqual([
      7.3 - 0.6,
      48.1 - 0.6,
      7.3 + 0.6,
      48.1 + 0.6,
    ]);
  });

  it("is null when the close set has no dot: the camera stays", () => {
    expect(cameraTarget([rc(OFF_MAP, 90), rc(MARGAUX, 40)])).toBeNull();
    expect(cameraKey([rc(OFF_MAP, 90), rc(MARGAUX, 40)])).toBe("");
  });

  it("cameraKey follows membership, not order or numbers", () => {
    const a = cameraKey([rc(MARGAUX, 90), rc(CDP, 85)]);
    expect(cameraKey([rc(CDP, 91), rc(MARGAUX, 84)])).toBe(a);
    expect(cameraKey([rc(MARGAUX, 90), rc(CDP, 70)])).not.toBe(a);
  });
});

describe("shouldAutoFit (RM17)", () => {
  it("waits CAMERA_SETTLE_MS after the membership last changed", () => {
    expect(shouldAutoFit({ userMoved: false, membershipChangedAt: 1000, now: 1599 })).toBe(false);
    expect(shouldAutoFit({ userMoved: false, membershipChangedAt: 1000, now: 1600 })).toBe(true);
  });
  it("never after the viewer moved the map", () => {
    expect(shouldAutoFit({ userMoved: true, membershipChangedAt: 0, now: 99_999 })).toBe(false);
  });
});

describe("a tap and a hover (RM15, RM18)", () => {
  const ranked = [rc(ALSACE_RIESLING, 88), rc(MARGAUX, 80), rc(STACK_B, 70), rc(STACK_C, 10, "colour")];
  it("chooserOrder follows ranking order, each wine once", () => {
    const ids = chooserOrder(["arch-chablis", "arch-alsace-riesling", "arch-sancerre", "arch-chablis"], ranked);
    expect(ids.map((r) => r.candidate.id)).toEqual(["arch-alsace-riesling", "arch-sancerre", "arch-chablis"]);
  });
  it("hoverLabel is the best hit's label text, +n for the other hits; null for none", () => {
    expect(hoverLabel(["arch-sancerre", "arch-alsace-riesling", "arch-chablis"], ranked)).toBe(
      "Alsace Riesling 88 % +2",
    );
    expect(hoverLabel(["arch-margaux"], ranked)).toBe("Margaux 80 %");
    expect(hoverLabel(["arch-chablis"], ranked)).toBe("Chablis 10 %");
    expect(hoverLabel([], ranked)).toBeNull();
  });
});

describe("unmappedCandidates (RM12)", () => {
  it("lists the wines with no dot at all, in the order given", () => {
    expect(unmappedCandidates([MARGAUX, OFF_MAP, BAROSSA, arch("bandol")]).map((c) => c.id)).toEqual([
      "arch-champagne",
      "arch-bandol",
    ]);
  });
});

describe("the MapLibre expressions (RM13-RM15)", () => {
  it("validate as a style in both themes", () => {
    for (const palette of [MAP_PALETTES.light, MAP_PALETTES.dark]) {
      const style = {
        version: 8,
        glyphs: "https://example.test/{fontstack}/{range}.pbf",
        sources: {
          "wine-training": {
            type: "geojson",
            data: trainingFeatures([rc(MARGAUX, 90)]),
            promoteId: "id",
          },
        },
        layers: [
          {
            id: "training-dots",
            type: "circle",
            source: "wine-training",
            layout: DOT_LAYOUT,
            paint: dotPaint(palette),
          },
          {
            id: "training-labels",
            type: "symbol",
            source: "wine-training",
            filter: LABEL_FILTER,
            layout: labelLayout(),
            paint: labelPaint(palette),
          },
        ],
      } as unknown as StyleSpecification;
      expect(validateStyleMin(style)).toEqual([]);
    }
  });

  it("colour the stops from the palette's heat block, and ring a capped wine", () => {
    const paint = dotPaint(MAP_PALETTES.light) as Record<string, unknown>;
    const color = JSON.stringify(paint["circle-color"]);
    for (const stop of MAP_PALETTES.light.heat.stops) expect(color).toContain(stop);
    expect(color).toContain(MAP_PALETTES.light.heat.capped);
    expect(paint["circle-opacity"]).toEqual(["case", ["==", ["get", "state"], "capped"], 0, 1]);
    expect(JSON.stringify(paint["circle-stroke-color"])).toContain(MAP_PALETTES.light.selectedRing);
  });

  it("label the top three at every zoom and the rest from z7", () => {
    const layout = labelLayout() as Record<string, unknown>;
    expect(layout["text-field"]).toEqual([
      "step",
      ["zoom"],
      ["case", ["<=", ["get", "rank"], 3], ["get", "label"], ""],
      7,
      ["get", "label"],
    ]);
    expect(layout["symbol-sort-key"]).toEqual(["get", "rank"]);
    expect(layout["text-variable-anchor"]).toEqual(["right", "left", "top", "bottom"]);
    expect(layout["text-allow-overlap"]).toBeUndefined();
  });
});
```

(The fixture's names: `arch("alsace-riesling")` is "A typical Alsace Riesling", `cote-rotie` "A typical Côte-Rôtie", `cdp` "A typical Châteauneuf-du-Pape", `margaux` "A typical Margaux" in region Bordeaux; `shortName` drops "A typical ".)

- [ ] **Step 2: Run to see it fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/map-view.test.ts`
Expected: FAIL — `Failed to resolve import "./map-view"`.

- [ ] **Step 3: Implement**

Create `src/lib/training/map-view.ts`:

```ts
// The training room's likelihood map, as pure rules (training-room-map spec
// RM12-RM18, RM26): which dots it draws and how hot each is, which spots carry
// a label and what it says, where the camera goes, what a tap on a spot opens,
// and the MapLibre paint and layout it all draws with. training-map.tsx only
// wires these to MapLibre. Imported only from under src/app/taste/training/
// and by its own test (spec RM1; training-room-map-imports.test.ts pins it).
//
// The % on the map is literally the list's: labels and the hover tooltip are
// shortName + percentLabel from ./copy. Heat is relative to the leader (RM13):
// the % is each wine's own closeness, not a probability, and early on many
// wines sit near 100 %, so an absolute ramp would saturate.
//
// Pure: relative imports only (the house style for src/lib/training/), and
// the maplibre-gl and palette imports are types, erased from the bundle.
import type { CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { MapPalette } from "../wine-map/map-palette";
import { CLOSE_WINDOW, percentLabel, shortName, stackMore } from "./copy";
import type { MapPoint, RankedCandidate, TrainingCandidate } from "./types";

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

/** The heat stops the palette's four colours sit at (RM13). */
export const HEAT_STOPS = [0.5, 0.75, 0.9, 1] as const;
/** Spots labelled at every zoom: the three best-ranked (RM15, owner O3). */
export const LABEL_COUNT = 3;
/** From this zoom every labelled spot may show its label (RM15). */
export const LABEL_ALL_ZOOM = 7;
/** Before any answer: Portugal to Santorini, Jerez to the Mosel (RM17, owner O4). */
export const EUROPE_BOX: Bbox = [-10, 35.5, 27, 52.5];
export const FIT_MAX_ZOOM = 10;
export const FIT_PADDING = 40;
/** A lone spot is padded this much each way, so its neighbours show. */
export const FIT_MIN_SPAN_DEG = 0.6;
/** The camera fits at most this many close wines… */
export const CAMERA_SET_MAX = 12;
/** …and only those within this many degrees of the first one, in lon and lat. */
export const CAMERA_REACH_DEG = 25;
/** The camera follows the close set this long after its membership last changed. */
export const CAMERA_SETTLE_MS = 600;
/** A tap queries a box this size around the point (a coarse pointer gets 44 px). */
export const HIT_SLOP_PX = { coarse: 22, fine: 6 } as const;
/** The text size the labels are set in, px (their offset is set in ems). */
export const LABEL_TEXT_SIZE = 12;

/** One dot's kind: a number to colour by, no number yet, or ruled out. */
export type DotState = "scored" | "neutral" | "capped";

export type DotProperties = {
  id: string;
  state: DotState;
  /** 0..1, two decimals; 0 when not scored. */
  heat: number;
  /** The spot's label on its carrier dot; "" on every other dot. */
  label: string;
  /** The spot's label rank (1 = best); 0 on a dot that carries no label. */
  rank: number;
  /** circle-sort-key: heat when scored, −0.5 neutral, −1 capped. */
  sort: number;
};

export type DotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DotProperties;
};

export type DotCollection = {
  type: "FeatureCollection";
  features: DotFeature[];
};

/** One labelled spot (RM15). `ids` is every wine there, in ranking order. */
export type LabelledSpot = {
  id: string;
  text: string;
  rank: number;
  ids: string[];
  lon: number;
  lat: number;
};

/**
 * A wine's heat relative to the leader (RM13): null without a closeness; 0
 * when there is no leader (`top` null or ≤ 0); otherwise closeness / top,
 * linear. The colour and size ramps put their stops on this number.
 */
export function heatOf(closeness: number | null, top: number | null): number | null {
  if (closeness === null) return null;
  if (top === null || top <= 0) return 0;
  return closeness / top;
}

/** The best uncapped closeness in the ranking, or null when none has one. */
export function leaderCloseness(ranked: readonly RankedCandidate[]): number | null {
  let top: number | null = null;
  for (const r of ranked) {
    if (r.capped === null && r.closeness !== null && (top === null || r.closeness > top)) top = r.closeness;
  }
  return top;
}

function spotKey(p: MapPoint): string {
  return `${p.lon},${p.lat}`;
}

function dotState(r: RankedCandidate): DotState {
  if (r.capped !== null) return "capped";
  return r.closeness === null ? "neutral" : "scored";
}

/** "Pauillac 91 %", "Alsace Riesling 88 % +2", "Bandol" (no number yet). */
export function dotText(r: RankedCandidate, others: number): string {
  const pct = r.closeness === null ? "" : ` ${percentLabel(r.closeness)}`;
  const more = others > 0 ? ` ${stackMore(others)}` : "";
  return `${shortName(r.candidate.name)}${pct}${more}`;
}

/** The ranking's wines that have a dot, grouped by exact spot, each group in
    ranking order; the groups in the order their first wine ranks. */
function spots(ranked: readonly RankedCandidate[]): RankedCandidate[][] {
  const bySpot = new Map<string, RankedCandidate[]>();
  for (const r of ranked) {
    const p = r.candidate.mapPoint;
    if (!p) continue;
    const key = spotKey(p);
    const list = bySpot.get(key);
    if (list) list.push(r);
    else bySpot.set(key, [r]);
  }
  return [...bySpot.values()];
}

/**
 * The labelled spots by "lon,lat" (RM15), best first. Dots at exactly the same
 * coordinates are one spot; its label is its best-ranked uncapped wine with a
 * closeness, "+n" counting every other wine there. A spot with no such wine
 * has no label. Ranks run 1, 2, 3, … in ranking order; only the first
 * LABEL_COUNT show below LABEL_ALL_ZOOM.
 */
export function labelledPositions(ranked: readonly RankedCandidate[]): Map<string, LabelledSpot> {
  const order = new Map(ranked.map((r, i) => [r.candidate.id, i] as const));
  const carried: { carrier: RankedCandidate; group: RankedCandidate[] }[] = [];
  for (const group of spots(ranked)) {
    const carrier = group.find((r) => r.capped === null && r.closeness !== null);
    if (carrier) carried.push({ carrier, group });
  }
  carried.sort((a, b) => (order.get(a.carrier.candidate.id) ?? 0) - (order.get(b.carrier.candidate.id) ?? 0));
  const out = new Map<string, LabelledSpot>();
  carried.forEach(({ carrier, group }, i) => {
    const p = carrier.candidate.mapPoint as MapPoint;
    out.set(spotKey(p), {
      id: carrier.candidate.id,
      text: dotText(carrier, group.length - 1),
      rank: i + 1,
      ids: group.map((r) => r.candidate.id),
      lon: p.lon,
      lat: p.lat,
    });
  });
  return out;
}

/** The labelled spots always shown, and offered as buttons under the map (RM25). */
export function closestSpots(ranked: readonly RankedCandidate[]): LabelledSpot[] {
  return [...labelledPositions(ranked).values()].filter((s) => s.rank <= LABEL_COUNT);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One Point feature per wine with a dot, in ranking order (RM12, RM13, RM15). */
export function trainingFeatures(ranked: readonly RankedCandidate[]): DotCollection {
  const top = leaderCloseness(ranked);
  const carriers = new Map([...labelledPositions(ranked).values()].map((s) => [s.id, s] as const));
  const features: DotFeature[] = [];
  for (const r of ranked) {
    const p = r.candidate.mapPoint;
    if (!p) continue;
    const state = dotState(r);
    const heat = state === "scored" ? round2(heatOf(r.closeness, top) ?? 0) : 0;
    const spot = carriers.get(r.candidate.id);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        id: r.candidate.id,
        state,
        heat,
        label: spot ? spot.text : "",
        rank: spot ? spot.rank : 0,
        sort: state === "scored" ? heat : state === "neutral" ? -0.5 : -1,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** What setData would change (RM16): equal fingerprints need no setData. */
export function featuresFingerprint(fc: DotCollection): string {
  return fc.features
    .map((f) => {
      const p = f.properties;
      return `${p.id}:${p.heat.toFixed(2)}:${p.state}:${p.label}:${p.rank}`;
    })
    .join("|");
}

/**
 * The close set (RM17): the leader and every uncapped wine within
 * CLOSE_WINDOW points of it — the strip's "N more close" plus the leader, so
 * closeSet(r).length - 1 is stripLine's N. Ranking order; [] with no leader.
 */
export function closeSet(ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const top = leaderCloseness(ranked);
  if (top === null) return [];
  return ranked.filter((r) => r.capped === null && r.closeness !== null && top - r.closeness <= CLOSE_WINDOW);
}

/**
 * The wines the camera fits (RM17): the close set's wines with a dot, cut to
 * the CAMERA_SET_MAX best-ranked, then to those within CAMERA_REACH_DEG of the
 * first one's dot in both longitude and latitude — so a claret note's
 * leaders are not fitted together with a New World curated point.
 */
export function fitSet(ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const withDot = closeSet(ranked)
    .filter((r) => r.candidate.mapPoint !== null)
    .slice(0, CAMERA_SET_MAX);
  if (withDot.length === 0) return [];
  const anchor = withDot[0].candidate.mapPoint as MapPoint;
  return withDot.filter((r) => {
    const p = r.candidate.mapPoint as MapPoint;
    return Math.abs(p.lon - anchor.lon) <= CAMERA_REACH_DEG && Math.abs(p.lat - anchor.lat) <= CAMERA_REACH_DEG;
  });
}

/**
 * Where the camera goes (RM17): Europe before any leader (nothing answered,
 * or everything ruled out); else the fit set's box, a lone spot padded by
 * FIT_MIN_SPAN_DEG each way; null when the close set has no dot (the camera
 * stays where it is).
 */
export function cameraTarget(ranked: readonly RankedCandidate[]): { box: Bbox; maxZoom: number } | null {
  if (leaderCloseness(ranked) === null) return { box: EUROPE_BOX, maxZoom: FIT_MAX_ZOOM };
  const set = fitSet(ranked);
  if (set.length === 0) return null;
  const points = set.map((r) => r.candidate.mapPoint as MapPoint);
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  let box: Bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  if (box[0] === box[2] && box[1] === box[3]) {
    box = [box[0] - FIT_MIN_SPAN_DEG, box[1] - FIT_MIN_SPAN_DEG, box[2] + FIT_MIN_SPAN_DEG, box[3] + FIT_MIN_SPAN_DEG];
  }
  return { box, maxZoom: FIT_MAX_ZOOM };
}

/** What the camera is following, as a key: it moves only when this changes. */
export function cameraKey(ranked: readonly RankedCandidate[]): string {
  if (leaderCloseness(ranked) === null) return "europe";
  return fitSet(ranked)
    .map((r) => r.candidate.id)
    .sort()
    .join(",");
}

/** Follow the fit set once it has held still CAMERA_SETTLE_MS — never after the viewer moved the map. */
export function shouldAutoFit(state: { userMoved: boolean; membershipChangedAt: number; now: number }): boolean {
  return !state.userMoved && state.now - state.membershipChangedAt >= CAMERA_SETTLE_MS;
}

/** The wines a tap hit, once each, in ranking order (RM18). */
export function chooserOrder(hitIds: readonly string[], ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const hit = new Set(hitIds);
  return ranked.filter((r) => hit.has(r.candidate.id));
}

/** The hover tooltip (RM15): the best-ranked hit's own label text, "+n" for the other hits. */
export function hoverLabel(hitIds: readonly string[], ranked: readonly RankedCandidate[]): string | null {
  const hits = chooserOrder(hitIds, ranked);
  return hits.length === 0 ? null : dotText(hits[0], hits.length - 1);
}

/** The typical wines with no dot at all (the legend's line, RM12). */
export function unmappedCandidates(candidates: readonly TrainingCandidate[]): TrainingCandidate[] {
  return candidates.filter((c) => c.mapPoint === null);
}

// --- MapLibre expressions: built once per landed theme, never per feature ------
// Written as plain arrays and cast once each: the style-spec's expression
// tuples cannot type an array built up in pieces. map-view.test.ts validates
// them with validateStyleMin instead.

const STATE = ["get", "state"];
const IS_CAPPED = ["==", STATE, "capped"];
const IS_NEUTRAL = ["==", STATE, "neutral"];
const IS_SELECTED = ["boolean", ["feature-state", "selected"], false];

/** A dot's radius at zoom 3..8 before the zoom scale: 4 px (heat ≤ 0.5) to 11 px (heat 1); rings 4, neutral 5. */
const BASE_RADIUS = ["case", IS_CAPPED, 4, IS_NEUTRAL, 5, ["interpolate", ["linear"], ["get", "heat"], 0.5, 4, 1, 11]];

/** ×0.85 at z3, ×1.2 at z8: zoom must be the top-level interpolate's input. */
function byZoom(inner: (scale: number) => unknown): unknown {
  return ["interpolate", ["linear"], ["zoom"], 3, inner(0.85), 8, inner(1.2)];
}

export const DOT_LAYOUT: CircleLayerSpecification["layout"] = {
  "circle-sort-key": ["get", "sort"],
};

/** The dots' paint in one palette (RM13, RM14): lightness and size carry heat, a capped wine is a hollow ring. */
export function dotPaint(palette: MapPalette): CircleLayerSpecification["paint"] {
  const { stops, capped, neutral, casing } = palette.heat;
  return {
    "circle-radius": byZoom((s) => ["*", BASE_RADIUS, s]),
    "circle-color": [
      "case",
      IS_CAPPED,
      capped,
      IS_NEUTRAL,
      neutral,
      [
        "interpolate",
        ["linear"],
        ["get", "heat"],
        HEAT_STOPS[0],
        stops[0],
        HEAT_STOPS[1],
        stops[1],
        HEAT_STOPS[2],
        stops[2],
        HEAT_STOPS[3],
        stops[3],
      ],
    ],
    "circle-opacity": ["case", IS_CAPPED, 0, 1],
    "circle-stroke-color": ["case", IS_SELECTED, palette.selectedRing, IS_CAPPED, capped, casing],
    "circle-stroke-width": ["case", IS_SELECTED, 2.5, IS_CAPPED, 1.5, 1],
  } as unknown as CircleLayerSpecification["paint"];
}

/** Labels (RM15): the top LABEL_COUNT always; the rest from LABEL_ALL_ZOOM, where they fit. */
export function labelLayout(): SymbolLayerSpecification["layout"] {
  const text = ["get", "label"];
  return {
    "text-field": ["step", ["zoom"], ["case", ["<=", ["get", "rank"], LABEL_COUNT], text, ""], LABEL_ALL_ZOOM, text],
    "text-size": LABEL_TEXT_SIZE,
    "text-variable-anchor": ["right", "left", "top", "bottom"],
    // The dot's radius plus 2 px, in ems of LABEL_TEXT_SIZE.
    "text-radial-offset": byZoom((s) => ["/", ["+", ["*", BASE_RADIUS, s], 2], LABEL_TEXT_SIZE]),
    "text-justify": "auto",
    "symbol-sort-key": ["get", "rank"],
  } as unknown as SymbolLayerSpecification["layout"];
}

/** Only a spot's carrier dot draws a label. */
export const LABEL_FILTER: SymbolLayerSpecification["filter"] = ["!=", ["get", "label"], ""];

export function labelPaint(palette: MapPalette): SymbolLayerSpecification["paint"] {
  return {
    "text-color": palette.label.text,
    "text-halo-color": palette.label.halo,
    "text-halo-width": 1.7,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/lib/training/map-view.test.ts && npx tsc --noEmit && npx eslint src/lib/training/map-view.ts src/lib/training/map-view.test.ts`
Expected: PASS, 30 tests; `tsc` and eslint silent.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/lib/training/map-view.ts src/lib/training/map-view.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): the likelihood map's rules, pure (heat, labels, camera, paint)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 260 files, 4636 tests.

---

### Task 7: The room map's state, types, media queries, tablist and fallbacks

**Files:**
- Create: `src/app/taste/training/room-map-state.ts`, `room-map-state.test.ts`, `map-types.ts`, `use-media.ts`, `map-switch.tsx`, `map-fallback.tsx`, `room-map-markup.test.tsx`

**Interfaces:**
- Consumes: Task 5's copy.
- Produces:
  - `room-map-state.ts`: `CandidatesView = "list" | "map"`; `MapFault = null | "stopped" | "reload"`; `RoomMapState = { view; fault; attempt: number }`; `RoomMapAction = { type: "select"; view } | { type: "stopped" } | { type: "retry" } | { type: "chunkFailed" }`; `ROOM_MAP_START`; `roomMapReducer`; `trainingMapEnabled(value)`; `TRAINING_MAP_ENABLED`; `RoomMap = { state; dispatch; warm: () => void }`.
  - `map-types.ts`: `VirtualAnchor`, `MapOpenRequest = { ids: string[]; anchor: Element | VirtualAnchor; returnFocus: HTMLElement }`, `TrainingMapLayout = "column" | "sheet"`, `TrainingMapProps = { ranked; layout; selectedIds; onOpen; onMoveStart?; onStopped }`, `MAP_BOX`, `MAP_BOX_ANY`, `pointAnchor(container, x, y)`.
  - `use-media.ts`: `LG_QUERY = "(width >= 64rem)"`, `SHORT_QUERY = "(max-height: 480px)"`, `useMedia(query, serverValue)`, `mediaMatches(query)`.
  - `map-switch.tsx`: `nextTab(key, current)`, `tabId(base, view)`, `panelId(base, view)`, `MapSwitch({ idBase, view, onSelect, onWarm, className? })`.
  - `map-fallback.tsx`: `MapFallback({ kind: "stopped" | "reload", onRetry? })`, `MapUpright({ onShowList })`, `MapLoading()`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/taste/training/room-map-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ROOM_MAP_START, roomMapReducer, trainingMapEnabled, type RoomMapState } from "./room-map-state";

// The List | Map choice and the map's failure state (training-room-map spec
// RM19, RM22).

const at = (s: Partial<RoomMapState>): RoomMapState => ({
  ...ROOM_MAP_START,
  ...s,
});

describe("roomMapReducer", () => {
  it("starts on List, healthy, at attempt 0", () => {
    expect(ROOM_MAP_START).toEqual({ view: "list", fault: null, attempt: 0 });
  });

  it("selects a view; the same view again is a no-op (same object)", () => {
    expect(roomMapReducer(ROOM_MAP_START, { type: "select", view: "map" })).toEqual(at({ view: "map" }));
    expect(roomMapReducer(ROOM_MAP_START, { type: "select", view: "list" })).toBe(ROOM_MAP_START);
  });

  it("a stopped map goes back to List with the fault; Try again remounts it on Map", () => {
    const stopped = roomMapReducer(at({ view: "map" }), { type: "stopped" });
    expect(stopped).toEqual({ view: "list", fault: "stopped", attempt: 0 });
    expect(roomMapReducer(stopped, { type: "retry" })).toEqual({
      view: "map",
      fault: null,
      attempt: 1,
    });
  });

  it("choosing Map again after it stopped is a retry too", () => {
    const stopped = at({ fault: "stopped" });
    expect(roomMapReducer(stopped, { type: "select", view: "map" })).toEqual({
      view: "map",
      fault: null,
      attempt: 1,
    });
  });

  it("a failed chunk sticks: Map shows the reload state, and nothing clears it", () => {
    const failed = roomMapReducer(ROOM_MAP_START, { type: "chunkFailed" });
    expect(failed).toEqual({ view: "list", fault: "reload", attempt: 0 });
    expect(roomMapReducer(failed, { type: "select", view: "map" })).toEqual({
      view: "map",
      fault: "reload",
      attempt: 0,
    });
    expect(roomMapReducer(failed, { type: "stopped" })).toBe(failed);
    expect(roomMapReducer(failed, { type: "retry" }).fault).toBe("reload");
    expect(roomMapReducer(failed, { type: "chunkFailed" })).toBe(failed);
  });
});

describe("trainingMapEnabled (the kill switch)", () => {
  it("is off only for '0'", () => {
    expect(trainingMapEnabled("0")).toBe(false);
    expect(trainingMapEnabled(undefined)).toBe(true);
    expect(trainingMapEnabled("")).toBe(true);
    expect(trainingMapEnabled("1")).toBe(true);
  });
});
```

Create `src/app/taste/training/room-map-markup.test.tsx` (Tasks 8 and 9 add to it):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapFallback, MapUpright } from "./map-fallback";
import { MapSwitch, nextTab } from "./map-switch";

// The likelihood map's markup outside its chunk, and its legend (training-room-map
// spec RM19, RM22, RM25, §6.4, §11 "component markup tests").

describe("MapSwitch (RM25)", () => {
  const html = renderToStaticMarkup(<MapSwitch idBase="t" view="map" onSelect={() => {}} onWarm={() => {}} />);

  it("is a labelled tablist of two tabs with a roving tabIndex", () => {
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="What it could be, as a list or a map"');
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*id="t-tab-list"[^>]*aria-selected="false"[^>]*aria-controls="t-panel-list"[^>]*tabindex="-1"[^>]*>List<\/button>/,
    );
    expect(html).toMatch(
      /<button[^>]*role="tab"[^>]*id="t-tab-map"[^>]*aria-selected="true"[^>]*aria-controls="t-panel-map"[^>]*tabindex="0"[^>]*>Map<\/button>/,
    );
  });

  it("nextTab: either arrow flips, Home and End go to the ends, other keys do nothing", () => {
    expect(nextTab("ArrowRight", "list")).toBe("map");
    expect(nextTab("ArrowLeft", "list")).toBe("map");
    expect(nextTab("ArrowLeft", "map")).toBe("list");
    expect(nextTab("ArrowRight", "map")).toBe("list");
    expect(nextTab("Home", "map")).toBe("list");
    expect(nextTab("End", "list")).toBe("map");
    expect(nextTab("Enter", "list")).toBeNull();
    expect(nextTab("Tab", "map")).toBeNull();
  });
});

describe("the fallbacks (RM20, RM22)", () => {
  it("stopped: a status line and a retry", () => {
    const html = renderToStaticMarkup(<MapFallback kind="stopped" onRetry={() => {}} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("The map stopped working — the list has every wine.");
    expect(html).toContain(">Try the map again</button>");
  });

  it("a chunk that could not load: an alert, a reload, and no Try again", () => {
    const html = renderToStaticMarkup(<MapFallback kind="reload" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("The map needs a page reload to load.");
    expect(html).toContain(">Reload the page</button>");
    expect(html).not.toContain("Try the map again");
  });

  it("a short screen: the upright note and Show the list", () => {
    const html = renderToStaticMarkup(<MapUpright onShowList={() => {}} />);
    expect(html).toContain("Turn your phone upright to see the map.");
    expect(html).toContain(">Show the list</button>");
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training/room-map-state.test.ts src/app/taste/training/room-map-markup.test.tsx`
Expected: FAIL — `Failed to resolve import "./room-map-state"` and `"./map-fallback"`.

- [ ] **Step 3: Implement the reducer and the kill switch**

Create `src/app/taste/training/room-map-state.ts`:

```ts
// The candidates column's List | Map choice and the map's failure state
// (training-room-map spec RM19, RM22), as a pure reducer TrainingRoom owns.
// It lives in TrainingRoom, not the panel or the sheet, so it survives the
// phone sheet closing and reopening and a new session started without a
// reload, and resets with the page: every page visit starts on List. It is
// never written to browser storage — a remembered "Map" would make the map
// the default by stealth (training-room-map-imports.test.ts pins that).
//
// Plain module: no React, so vitest pins it.

export type CandidatesView = "list" | "map";

/** null: healthy. "stopped": a lost WebGL context or a map that could not
    start — back to List with a line and "Try the map again". "reload": its
    code could not load (a rejected import stays rejected), so only a page
    reload helps. */
export type MapFault = null | "stopped" | "reload";

export type RoomMapState = {
  view: CandidatesView;
  fault: MapFault;
  /** Bumped by every retry: the map remounts under a new key. */
  attempt: number;
};

export type RoomMapAction =
  { type: "select"; view: CandidatesView } | { type: "stopped" } | { type: "retry" } | { type: "chunkFailed" };

export const ROOM_MAP_START: RoomMapState = {
  view: "list",
  fault: null,
  attempt: 0,
};

export function roomMapReducer(state: RoomMapState, action: RoomMapAction): RoomMapState {
  switch (action.type) {
    case "select":
      if (action.view === state.view) return state;
      // Choosing Map again after it stopped is a retry.
      if (action.view === "map" && state.fault === "stopped") {
        return { view: "map", fault: null, attempt: state.attempt + 1 };
      }
      return { ...state, view: action.view };
    case "stopped":
      // A chunk that never loaded outranks a map that stopped.
      if (state.fault === "reload") return state;
      return { ...state, view: "list", fault: "stopped" };
    case "retry":
      if (state.fault === "reload") return { ...state, view: "map" };
      return { view: "map", fault: null, attempt: state.attempt + 1 };
    case "chunkFailed":
      return state.fault === "reload" ? state : { ...state, fault: "reload" };
  }
}

/** The build-time kill switch (RM19): NEXT_PUBLIC_TRAINING_MAP=0 hides the Map
    tab and the room is exactly R1. Unset, or any other value, means on. */
export function trainingMapEnabled(value: string | undefined): boolean {
  return value !== "0";
}

// Next inlines NEXT_PUBLIC_ variables at build time, so this reads the value
// the deployment was BUILT with: turning it off is an env change and a
// redeploy, not a code revert.
export const TRAINING_MAP_ENABLED = trainingMapEnabled(process.env.NEXT_PUBLIC_TRAINING_MAP);

/** What the panel and the sheet get from TrainingRoom; null when the switch is off. */
export type RoomMap = {
  state: RoomMapState;
  dispatch: (action: RoomMapAction) => void;
  /** Warm on intent (RM24): the map's code and the basemap style, once. */
  warm: () => void;
};
```

- [ ] **Step 4: Implement the shared types, the media hook, the tablist and the fallbacks**

Create `src/app/taste/training/map-types.ts`:

```ts
// The training room's likelihood map, as seen from outside its dynamic chunk
// (training-room-map spec RM11, RM18): the props TrainingMap takes, what a
// tap on a dot (or a "Closest on the map" button) asks the room to open, and
// the map box's size classes. Types and constants only: the candidates panel,
// the phone sheet and the map slot import this without pulling MapLibre, the
// basemap or the palette into the room's first load (RM24).
import type { RankedCandidate } from "@/lib/training/types";

/** A point on screen, for base-ui's Positioner (floating-ui's VirtualElement). */
export type VirtualAnchor = {
  getBoundingClientRect(): DOMRect;
  contextElement?: Element;
};

/** What a dot, a spot's button or an unmapped name asks the room to open (RM18, RM25). */
export type MapOpenRequest = {
  /** The wines there, once each, in ranking order: one opens its detail, more a chooser. */
  ids: string[];
  /** The dot's point on screen, or the button pressed. */
  anchor: Element | VirtualAnchor;
  /** Where focus goes back on close: the map container (tabIndex -1), or the button pressed. */
  returnFocus: HTMLElement;
};

/** The laptop column, or the phone and tablet sheet. */
export type TrainingMapLayout = "column" | "sheet";

export type TrainingMapProps = {
  ranked: readonly RankedCandidate[];
  layout: TrainingMapLayout;
  /** The wines whose detail or chooser is open: their dots wear the gold ring. */
  selectedIds: readonly string[];
  onOpen: (request: MapOpenRequest) => void;
  /** Any camera move (a gesture or a fit): the laptop popover's anchor would drift, so it closes. */
  onMoveStart?: () => void;
  /** A lost WebGL context, or a map that could not start: the room goes back to List (RM22). */
  onStopped: () => void;
};

/** The map box (spec §6.2, §6.3): on the laptop column a height that keeps the
    whole panel inside the aside with no scroll; in the sheet whatever the
    sheet's 88dvh leaves. The loading placeholder uses the same classes by
    breakpoint, since the column is lg+ and the sheet below lg. */
export const MAP_BOX: Record<TrainingMapLayout, string> = {
  column: "h-[clamp(240px,calc(100dvh-380px),520px)] w-full",
  sheet: "min-h-0 w-full flex-1",
};
export const MAP_BOX_ANY = "w-full max-lg:min-h-0 max-lg:flex-1 lg:h-[clamp(240px,calc(100dvh-380px),520px)]";

/** A screen point inside `container`, read when the popover asks (it closes on any camera move). */
export function pointAnchor(container: HTMLElement, x: number, y: number): VirtualAnchor {
  return {
    getBoundingClientRect: () => {
      const r = container.getBoundingClientRect();
      return new DOMRect(r.left + x, r.top + y, 0, 0);
    },
    contextElement: container,
  };
}
```

Create `src/app/taste/training/use-media.ts`:

```ts
"use client";

// The training room's media queries (training-room-map spec RM19, RM20): which
// of the laptop column and the phone sheet may mount the map (never both — one
// WebGL context), and whether the phone sheet is too short for one. Built on
// use-is-phone.ts's mediaStore, one store per query, created on first client
// use. The server snapshot is `serverValue`; nothing here matters before the
// viewer has opened the Map tab, which only happens after hydration.
import { useSyncExternalStore } from "react";
import { browserMatchMedia, mediaStore, type MediaStore } from "@/lib/use-is-phone";

/** Exactly what Tailwind's `lg:` compiles to (the aside is `hidden lg:block`). */
export const LG_QUERY = "(width >= 64rem)";
/** A phone on its side: 88dvh would leave a map under 200 px (RM20). */
export const SHORT_QUERY = "(max-height: 480px)";

const stores = new Map<string, MediaStore>();
function store(query: string, fallback: boolean): MediaStore {
  let s = stores.get(query);
  if (!s) {
    s = mediaStore(query, browserMatchMedia(), fallback);
    stores.set(query, s);
  }
  return s;
}

export function useMedia(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => store(query, serverValue).subscribe(onChange),
    () => store(query, serverValue).getSnapshot(),
    () => serverValue,
  );
}

/** Read once, at the moment it matters (a tap, a fit); false without matchMedia. */
export function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}
```

Create `src/app/taste/training/map-switch.tsx`:

```tsx
"use client";

// The candidates column's List | Map tablist (training-room-map spec RM19,
// RM25), written here rather than borrowed: RangeControl has the look but no
// keyboard handling. role="tablist" with an aria-label; each tab role="tab"
// with aria-selected, aria-controls naming its tabpanel, and a roving
// tabIndex (0 on the selected tab, -1 on the other). ArrowLeft/ArrowRight
// move AND select (two tabs: either arrow flips), Home/End go to the ends.
// Pointing at or focusing Map warms its code and the basemap (RM24).
// No state of its own and no browser storage: TrainingRoom owns the choice.
import { useRef } from "react";
import { TRAINING_COPY } from "@/lib/training/copy";
import { cn } from "@/lib/utils";
import type { CandidatesView } from "./room-map-state";

// 44 px on touch, compact on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

const VIEWS: readonly CandidatesView[] = ["list", "map"];

/** The tab a key moves to and selects; null for any other key. */
export function nextTab(key: string, current: CandidatesView): CandidatesView | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowRight":
      return current === "list" ? "map" : "list";
    case "Home":
      return "list";
    case "End":
      return "map";
    default:
      return null;
  }
}

/** The tab's and its panel's element ids under one per-instance base (useId):
    the laptop column and the phone sheet can both be in the DOM at once. */
export function tabId(base: string, view: CandidatesView): string {
  return `${base}-tab-${view}`;
}
export function panelId(base: string, view: CandidatesView): string {
  return `${base}-panel-${view}`;
}

export function MapSwitch({
  idBase,
  view,
  onSelect,
  onWarm,
  className,
}: {
  idBase: string;
  view: CandidatesView;
  onSelect: (view: CandidatesView) => void;
  onWarm: () => void;
  className?: string;
}) {
  const tabs = useRef<Partial<Record<CandidatesView, HTMLButtonElement | null>>>({});
  return (
    <div
      role="tablist"
      aria-label={TRAINING_COPY.viewsLabel}
      className={cn("flex shrink-0 gap-[3px] rounded-[9px] bg-muted p-[3px]", className)}
    >
      {VIEWS.map((v) => {
        const selected = v === view;
        return (
          <button
            key={v}
            ref={(el) => {
              tabs.current[v] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, v)}
            aria-selected={selected}
            aria-controls={panelId(idBase, v)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(v)}
            onKeyDown={(e) => {
              const next = nextTab(e.key, view);
              if (!next) return;
              e.preventDefault();
              onSelect(next);
              tabs.current[next]?.focus();
            }}
            onPointerEnter={v === "map" ? onWarm : undefined}
            onFocus={v === "map" ? onWarm : undefined}
            className={cn(
              "rounded-[7px] px-3 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-1",
              TAP,
              selected
                ? "bg-card font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {v === "list" ? TRAINING_COPY.listTab : TRAINING_COPY.mapTab}
          </button>
        );
      })}
    </div>
  );
}
```

Create `src/app/taste/training/map-fallback.tsx`:

```tsx
"use client";

// The likelihood map's states that are not the map (training-room-map spec
// RM20, RM22), outside its dynamic chunk so they show when the chunk itself
// failed: the map stopped (a lost WebGL context, or a map that could not
// start) — the list has every wine, and "Try the map again" remounts it; its
// code could not load (a stale tab after a deploy, usually) — only a page
// reload helps, which is safe for the note because the draft is written on
// every change (D13), and it reloads only on the viewer's tap; a phone on its
// side, where 88dvh leaves a map under 200 px; and the placeholder while the
// chunk loads. No hooks, no portal, so the markup test renders them.
import { TRAINING_COPY } from "@/lib/training/copy";
import { cn } from "@/lib/utils";
import { MAP_BOX_ANY } from "./map-types";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";
const ACTION = cn(
  "inline-flex items-center justify-center self-start rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring",
  TAP,
);
const BOX = "flex flex-col gap-2 rounded-[10px] border border-border-light bg-muted/40 px-3 py-3 text-[12.5px]";

export function MapFallback({ kind, onRetry }: { kind: "stopped" | "reload"; onRetry?: () => void }) {
  if (kind === "reload") {
    return (
      <div role="alert" className={BOX}>
        <p>{TRAINING_COPY.mapNeedsReload}</p>
        <button type="button" className={ACTION} onClick={() => window.location.reload()}>
          {TRAINING_COPY.mapReload}
        </button>
      </div>
    );
  }
  return (
    <div role="status" className={BOX}>
      <p>{TRAINING_COPY.mapStopped}</p>
      {onRetry ? (
        <button type="button" className={ACTION} onClick={onRetry}>
          {TRAINING_COPY.mapRetry}
        </button>
      ) : null}
    </div>
  );
}

/** A short screen (a phone on its side): the map would be too small to use. */
export function MapUpright({ onShowList }: { onShowList: () => void }) {
  return (
    <div className={cn(BOX, "m-2")}>
      <p>{TRAINING_COPY.mapUpright}</p>
      <button type="button" className={ACTION} onClick={onShowList}>
        {TRAINING_COPY.showList}
      </button>
    </div>
  );
}

/** Where the map will be, while its code and style load. */
export function MapLoading() {
  return <div aria-hidden className={cn("animate-pulse rounded-[10px] bg-muted", MAP_BOX_ANY)} />;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training/room-map-state.test.ts src/app/taste/training/room-map-markup.test.tsx && npx tsc --noEmit && npx eslint src/app/taste/training`
Expected: PASS — room-map-state 6 tests, room-map-markup 5 tests; `tsc` and eslint silent.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/app/taste/training/room-map-state.ts src/app/taste/training/room-map-state.test.ts src/app/taste/training/map-types.ts src/app/taste/training/use-media.ts src/app/taste/training/map-switch.tsx src/app/taste/training/map-fallback.tsx src/app/taste/training/room-map-markup.test.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): the List | Map switch, its state, the kill switch and the map's fallbacks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 262 files, 4647 tests.

---

### Task 8: The chunk — `TrainingMap`, its legend, its one loader, and the slot it mounts in

**Files:**
- Create: `src/app/taste/training/training-map.tsx`, `training-map-legend.tsx`, `training-map-loader.ts`, `room-map-slot.tsx`
- Test: `src/app/taste/training/room-map-markup.test.tsx` (the legend)

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 7.
- Produces: `TrainingMap(props: TrainingMapProps)` (the chunk's only export the room uses); `TrainingMapLegend({ palette, before, curated, unmapped, onOpenUnmapped })`; `loadTrainingMap = () => import("./training-map")`; `RoomMapSlot({ roomMap, ranked, layout, selectedIds, onOpen, onMoveStart? })`. In non-production builds `window.__trainingMap` is the MapLibre map (for the §12 checks).

- [ ] **Step 1: Write the failing legend test**

In `src/app/taste/training/room-map-markup.test.tsx`, add these imports (keep the list sorted by path as the file shows):

```tsx
import { arch } from "@/lib/training/__fixtures__/archetypes";
import { MAP_PALETTES } from "@/lib/wine-map/map-palette";
import { TrainingMapLegend } from "./training-map-legend";
```

(the first two after `import { describe, expect, it } from "vitest";`, the last after `import { MapSwitch, nextTab } from "./map-switch";`) and append to the END of the file:

```tsx

describe("TrainingMapLegend (§6.4)", () => {
  const legend = (props: Partial<Parameters<typeof TrainingMapLegend>[0]> = {}) =>
    renderToStaticMarkup(
      <TrainingMapLegend
        palette={MAP_PALETTES.light}
        before={false}
        curated={false}
        unmapped={[]}
        onOpenUnmapped={() => {}}
        {...props}
      />,
    );

  it("before any answer: only 'Start describing the wine'", () => {
    expect(legend({ before: true })).toBe(
      '<p class="text-[12.5px] text-muted-foreground">Start describing the wine</p>',
    );
  });

  it("the ramp through the four stops, the ring, and the relative line", () => {
    const html = legend();
    expect(html).toContain("Less close");
    expect(html).toContain("Closest");
    expect(html).toContain(`linear-gradient(to right, ${MAP_PALETTES.light.heat.stops.join(", ")})`);
    expect(html).toContain("Ruled out");
    expect(html).toContain(`border-color:${MAP_PALETTES.light.heat.capped}`);
    expect(html).toContain("Colours compare the wines with each other; the % is each wine&#x27;s own closeness.");
    expect(html).not.toContain("approximate spot");
    expect(html).not.toContain("not on the wine map yet");
  });

  it("the approximate-spot line only while a dot is curated", () => {
    expect(legend({ curated: true })).toContain("Wines outside the mapped countries sit at an approximate spot.");
  });

  it("wines with no dot: the count and each name as a real button", () => {
    const html = legend({ unmapped: [arch("champagne"), arch("bandol")] });
    expect(html).toContain("2 not on the wine map yet");
    expect(html).toMatch(/<button type="button"[^>]*>A typical Champagne<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*>A typical Bandol<\/button>/);
  });

  it("dark uses the dark table's stops", () => {
    expect(legend({ palette: MAP_PALETTES.dark })).toContain(MAP_PALETTES.dark.heat.stops.join(", "));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training/room-map-markup.test.tsx`
Expected: FAIL — `Failed to resolve import "./training-map-legend"`.

- [ ] **Step 3: The legend**

Create `src/app/taste/training/training-map-legend.tsx`:

```tsx
"use client";

// The likelihood map's legend (training-room-map spec §6.4), rendered only by
// training-map.tsx so it and map-palette.ts ride in the map's own chunk.
// Before any answer it says only "Start describing the wine". Otherwise: the
// ramp through the palette's four heat stops, "Less close" to "Closest"; the
// hollow ring, "Ruled out"; the line saying colours compare wines with each
// other (risk X1); the approximate-spot line while any dot is curated; and the
// typical wines with no dot at all, each a real button opening its detail
// (RM25). The swatches are the canvas's own colours — the palette's literal
// hex, as the explorer's legend does — so they always match what is drawn.
import { TRAINING_COPY, unmappedLine } from "@/lib/training/copy";
import type { MapPalette } from "@/lib/wine-map/map-palette";
import type { TrainingCandidate } from "@/lib/training/types";
import { cn } from "@/lib/utils";

// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

export function TrainingMapLegend({
  palette,
  before,
  curated,
  unmapped,
  onOpenUnmapped,
}: {
  palette: MapPalette;
  /** Nothing answered yet (panel.ts's isBeforeAnswers). */
  before: boolean;
  /** Whether any dot sits at a curated, approximate spot. */
  curated: boolean;
  unmapped: readonly TrainingCandidate[];
  onOpenUnmapped: (id: string, button: HTMLElement) => void;
}) {
  if (before) {
    return <p className="text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>;
  }
  const { stops, capped } = palette.heat;
  return (
    <div className="flex flex-col gap-1.5 text-[11.5px] text-muted-foreground">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-2">
          <span>{TRAINING_COPY.legendLess}</span>
          <span
            aria-hidden
            className="h-2 w-[120px] rounded-full"
            style={{
              background: `linear-gradient(to right, ${stops.join(", ")})`,
            }}
          />
          <span>{TRAINING_COPY.legendClosest}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full border-[1.5px]" style={{ borderColor: capped }} />
          <span>{TRAINING_COPY.legendRuledOut}</span>
        </span>
      </div>
      <p>{TRAINING_COPY.legendRelative}</p>
      {curated ? <p>{TRAINING_COPY.legendApprox}</p> : null}
      {unmapped.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <span>{unmappedLine(unmapped.length)}</span>
          {unmapped.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={(e) => onOpenUnmapped(c.id, e.currentTarget)}
              className={cn(
                "rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                TAP,
              )}
            >
              {c.name}
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: The map**

Create `src/app/taste/training/training-map.tsx` (the only room file with a value import of `maplibre-gl`/`react-map-gl`, `basemap.ts` and `map-palette.ts`; it imports `maplibre-gl.css` — the canvas's `touch-action: none` — and the explorer's `map-chrome.css` for the dark controls):

```tsx
"use client";

// The training room's likelihood map (training-room-map spec RM11-RM25): a
// lean MapLibre map of the typical wines, one dot each, coloured and sized by
// how close each is RELATIVE TO THE LEADER, with the list's own % on the
// three best spots (more from z7, and on hover). Never TileWineMap: no
// pmtiles, no manifest, no shards, no explorer state — a basemap and one
// GeoJSON source. Its own chunk, loaded only through ./training-map-loader
// (next/dynamic, ssr: false), mounted only while the Map view is open, and
// imported only from under src/app/taste/training/ (RM1).
//
// Contracts it keeps:
// - Theme (RM21, CLAUDE.md "never pass a changing mapStyle"): `mapStyle` is
//   frozen at mount in a useState initializer — the cached tuned style when
//   the warm-up filled it, else the URL, which onLoad then tunes with
//   basemapTweaks. A flip calls setStyle(style, { diff: true, validate: false,
//   transformStyle: withWineLayers(prev, tuneBasemapStyle(next)) }), which
//   carries the wine-training source and its two layers across unchanged
//   (basemap.ts's isWineSourceId knows the id); the paint follows the style
//   that LANDED (style.load), as the explorer's paintTheme does.
// - Data (RM16): one setData per animation frame at most, and only when the
//   features' fingerprint changed; nothing while the map is not loaded
//   (onLoad adds the source with the latest features).
// - Camera (RM17): follows the fit set CAMERA_SETTLE_MS after its membership
//   last changed, until the viewer first moves the map (a movestart carrying
//   an originalEvent, the explorer's own test); then "Fit to the closest"
//   appears and the camera never moves by itself. Reduced motion: instant.
// - Failure (RM22): a lost WebGL context, or react-maplibre's constructor
//   path (onError with target null — no WebGL), reports onStopped; any other
//   error on a running map is logged and nothing else happens.
// - Gestures (RM20): no rotation or pitch; maplibre-gl.css supplies the
//   canvas's touch-action: none.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapGL, { NavigationControl, type MapRef } from "react-map-gl/maplibre";
import type { Map as MaplibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// Dark-theme dressing for MapLibre's own controls; must follow maplibre-gl.css.
import "../../knowledge/map/map-chrome.css";
import { Eyebrow } from "@/components/overview/eyebrow";
import { useRenderedTheme } from "@/lib/rendered-theme";
import type { Theme } from "@/lib/theme";
import { TRAINING_COPY } from "@/lib/training/copy";
import {
  CAMERA_SETTLE_MS,
  DOT_LAYOUT,
  EUROPE_BOX,
  FIT_MAX_ZOOM,
  FIT_PADDING,
  HIT_SLOP_PX,
  LABEL_FILTER,
  cameraKey,
  cameraTarget,
  chooserOrder,
  closestSpots,
  dotPaint,
  featuresFingerprint,
  hoverLabel,
  labelLayout,
  labelPaint,
  shouldAutoFit,
  trainingFeatures,
  unmappedCandidates,
  type Bbox,
  type DotCollection,
} from "@/lib/training/map-view";
import { isBeforeAnswers } from "@/lib/training/panel";
import {
  BASEMAP_STYLE_URL,
  TRAINING_SOURCE_ID,
  basemapTweaks,
  cachedBasemapStyle,
  loadBasemapStyle,
  tuneBasemapStyle,
  withWineLayers,
} from "@/lib/wine-map/basemap";
import { installHoverCursor } from "@/lib/wine-map/hover-cursor";
import { MAP_PALETTES } from "@/lib/wine-map/map-palette";
import { cn } from "@/lib/utils";
import { MAP_BOX, pointAnchor, type MapOpenRequest, type TrainingMapProps } from "./map-types";
import { TrainingMapLegend } from "./training-map-legend";
import { mediaMatches } from "./use-media";

const DOTS_LAYER = "training-dots";
const LABELS_LAYER = "training-labels";
const DEV = process.env.NODE_ENV !== "production";
// 44 px on touch, the row's own height on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";

type Target = { box: Bbox; maxZoom: number };

function toBounds(box: Bbox): [[number, number], [number, number]] {
  return [
    [box[0], box[1]],
    [box[2], box[3]],
  ];
}

/** Adds the dots' source and layers when missing (the first load, or a full
    style rebuild), else repaints them in `theme`'s palette. */
function ensureLayers(map: MaplibreMap, theme: Theme, data: DotCollection) {
  const palette = MAP_PALETTES[theme];
  if (!map.getSource(TRAINING_SOURCE_ID)) {
    map.addSource(TRAINING_SOURCE_ID, {
      type: "geojson",
      data,
      promoteId: "id",
    });
  }
  if (!map.getLayer(DOTS_LAYER)) {
    map.addLayer({
      id: DOTS_LAYER,
      type: "circle",
      source: TRAINING_SOURCE_ID,
      layout: DOT_LAYOUT,
      paint: dotPaint(palette),
    });
  } else {
    for (const [name, value] of Object.entries(dotPaint(palette) ?? {})) map.setPaintProperty(DOTS_LAYER, name, value);
  }
  if (!map.getLayer(LABELS_LAYER)) {
    map.addLayer({
      id: LABELS_LAYER,
      type: "symbol",
      source: TRAINING_SOURCE_ID,
      filter: LABEL_FILTER,
      layout: labelLayout(),
      paint: labelPaint(palette),
    });
  } else {
    for (const [name, value] of Object.entries(labelPaint(palette) ?? {}))
      map.setPaintProperty(LABELS_LAYER, name, value);
  }
}

export function TrainingMap({ ranked, layout, selectedIds, onOpen, onMoveStart, onStopped }: TrainingMapProps) {
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const disposeHoverRef = useRef<(() => void) | null>(null);

  // The latest props, for listeners registered once in onLoad.
  const latest = useRef({
    ranked,
    selectedIds,
    onOpen,
    onMoveStart,
    onStopped,
  });
  useEffect(() => {
    latest.current = { ranked, selectedIds, onOpen, onMoveStart, onStopped };
  });

  // --- Theme (RM21) ---------------------------------------------------------
  const theme = useRenderedTheme();
  // Frozen at mount, NEVER recomputed: once the warm-up or a flip fills the
  // cache, a recomputed value would change from the URL to the object and
  // react-map-gl would setStyle it with no transformStyle, dropping our source.
  const [mountStyle] = useState<StyleSpecification | string>(
    () => cachedBasemapStyle(theme) ?? BASEMAP_STYLE_URL[theme],
  );
  const [paintTheme, setPaintTheme] = useState<Theme>(theme);
  const requestedRef = useRef<Theme>(theme);
  const landingRef = useRef<Theme>(theme);
  const latestThemeRef = useRef<Theme>(theme);
  const swap = useCallback((next: Theme) => {
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || requestedRef.current === next) return;
    requestedRef.current = next;
    const apply = (style: StyleSpecification | string) => {
      // A newer flip, or an unmount, while the style was fetched: stale.
      if (requestedRef.current !== next || mapRef.current?.getMap() !== map) return;
      map.setStyle(style, {
        diff: true,
        validate: false,
        transformStyle: (prev, incoming) => {
          landingRef.current = next;
          return withWineLayers(prev, tuneBasemapStyle(incoming));
        },
      });
    };
    const cached = cachedBasemapStyle(next);
    if (cached) {
      apply(cached);
      return;
    }
    // A failed fetch hands MapLibre the URL: it fails as it always did (an
    // `error` event, no style.load), and the map stays wholly on its old theme.
    loadBasemapStyle(next).then(apply, () => apply(BASEMAP_STYLE_URL[next]));
  }, []);
  useEffect(() => {
    latestThemeRef.current = theme;
    swap(theme);
  }, [theme, swap]);

  // --- Data (RM16) ----------------------------------------------------------
  // The latest features (what onLoad and a style rebuild add) and the
  // fingerprint of what the source holds now.
  const featuresRef = useRef<DotCollection>({
    type: "FeatureCollection",
    features: [],
  });
  const shownRef = useRef<string>("");
  const frameRef = useRef<number | null>(null);
  useEffect(() => {
    // The §12 budget: features + fingerprint ≤ 2 ms p95, read in a dev build
    // as the "training-map:data" performance measure.
    const t0 = performance.now();
    const features = trainingFeatures(ranked);
    const fingerprint = featuresFingerprint(features);
    if (DEV)
      performance.measure("training-map:data", {
        start: t0,
        end: performance.now(),
      });
    featuresRef.current = features;
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || fingerprint === shownRef.current) return;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const source = map.getSource(TRAINING_SOURCE_ID);
      if (!source || !("setData" in source)) return;
      const data = featuresRef.current;
      (source as { setData(d: DotCollection): unknown }).setData(data);
      shownRef.current = featuresFingerprint(data);
    });
  }, [ranked]);

  // --- Selection: the open detail's dots wear the gold ring (RM14) ----------
  const selectedRef = useRef<Set<string>>(new Set());
  const applySelection = useCallback((map: MaplibreMap, ids: readonly string[]) => {
    if (!map.getSource(TRAINING_SOURCE_ID)) return;
    const next = new Set(ids);
    for (const id of selectedRef.current) {
      if (!next.has(id)) map.removeFeatureState({ source: TRAINING_SOURCE_ID, id }, "selected");
    }
    for (const id of next) map.setFeatureState({ source: TRAINING_SOURCE_ID, id }, { selected: true });
    selectedRef.current = next;
  }, []);
  const selectedKey = selectedIds.join(",");
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && readyRef.current) applySelection(map, latest.current.selectedIds);
  }, [selectedKey, applySelection]);

  // --- Camera (RM17) --------------------------------------------------------
  const [mountTarget] = useState<Target>(() => cameraTarget(ranked) ?? { box: EUROPE_BOX, maxZoom: FIT_MAX_ZOOM });
  const camKey = useMemo(() => cameraKey(ranked), [ranked]);
  const camKeyRef = useRef(camKey);
  const followedKeyRef = useRef(camKey);
  const changedAtRef = useRef(0);
  const userMovedRef = useRef(false);
  const [userMoved, setUserMoved] = useState(false);
  const target = useMemo(() => cameraTarget(ranked), [ranked]);
  const fitTo = useCallback((next: Target | null) => {
    const map = mapRef.current?.getMap();
    if (!map || !readyRef.current || !next) return;
    map.fitBounds(toBounds(next.box), {
      padding: FIT_PADDING,
      maxZoom: next.maxZoom,
      duration: mediaMatches("(prefers-reduced-motion: reduce)") ? 0 : 500,
    });
  }, []);
  useEffect(() => {
    camKeyRef.current = camKey;
    if (camKey === followedKeyRef.current) return;
    changedAtRef.current = performance.now();
    if (userMovedRef.current) return;
    // A little past the settle window, so the pure rule below never sees a
    // timer that fired a hair early by the other clock.
    const id = window.setTimeout(() => {
      if (
        !shouldAutoFit({
          userMoved: userMovedRef.current,
          membershipChangedAt: changedAtRef.current,
          now: performance.now(),
        })
      )
        return;
      if (!readyRef.current) return; // onLoad catches up
      followedKeyRef.current = camKeyRef.current;
      fitTo(cameraTarget(latest.current.ranked));
    }, CAMERA_SETTLE_MS + 20);
    return () => window.clearTimeout(id);
  }, [camKey, fitTo]);

  // --- Hover tooltip (RM15), fine pointers only ------------------------------
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // --- Open a detail or a chooser (RM18) -------------------------------------
  const openAt = useCallback((hitIds: readonly string[], returnFocus?: HTMLElement) => {
    const map = mapRef.current?.getMap();
    const container = containerRef.current;
    const wines = chooserOrder(hitIds, latest.current.ranked);
    if (!map || !container || wines.length === 0) return;
    const p = wines[0].candidate.mapPoint;
    const point = p ? map.project([p.lon, p.lat]) : null;
    const inside =
      point !== null &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= container.clientWidth &&
      point.y <= container.clientHeight;
    const request: MapOpenRequest = {
      ids: wines.map((w) => w.candidate.id),
      // The dot on screen; a spot scrolled out of view anchors to its button.
      anchor: inside ? pointAnchor(container, point.x, point.y) : (returnFocus ?? container),
      returnFocus: returnFocus ?? container,
    };
    latest.current.onOpen(request);
  }, []);

  useEffect(
    () => () => {
      disposeHoverRef.current?.();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      readyRef.current = false;
      if (DEV) delete (window as unknown as { __trainingMap?: unknown }).__trainingMap;
    },
    [],
  );

  const before = isBeforeAnswers(ranked);
  const spots = useMemo(() => closestSpots(ranked), [ranked]);
  const unmapped = useMemo(() => unmappedCandidates(ranked.map((r) => r.candidate)), [ranked]);
  const curated = useMemo(() => ranked.some((r) => r.candidate.mapPoint?.source === "curated"), [ranked]);

  return (
    <div className={cn("flex flex-col gap-2", layout === "sheet" && "min-h-0 flex-1")}>
      <div
        ref={containerRef}
        tabIndex={-1}
        role="group"
        aria-label={TRAINING_COPY.mapLabel}
        className={cn("relative overflow-hidden rounded-[10px] outline-none", MAP_BOX[layout])}
      >
        <span className="sr-only">{TRAINING_COPY.mapSrNote}</span>
        <MapGL
          ref={mapRef}
          mapStyle={mountStyle}
          initialViewState={{
            bounds: toBounds(mountTarget.box),
            fitBoundsOptions: {
              padding: FIT_PADDING,
              maxZoom: mountTarget.maxZoom,
            },
          }}
          dragRotate={false}
          touchPitch={false}
          pitchWithRotate={false}
          fadeDuration={0}
          onError={(e) => {
            // react-maplibre's constructor path (no WebGL) has no map: target null.
            if ((e.target as unknown) == null) {
              latest.current.onStopped();
              return;
            }
            console.error("[training-map]", e.error);
          }}
          onClick={(e) => {
            const map = e.target;
            if (!map.getLayer(DOTS_LAYER)) return;
            const s = mediaMatches("(pointer: coarse)") ? HIT_SLOP_PX.coarse : HIT_SLOP_PX.fine;
            const hits = map.queryRenderedFeatures(
              [
                [e.point.x - s, e.point.y - s],
                [e.point.x + s, e.point.y + s],
              ],
              { layers: [DOTS_LAYER] },
            );
            openAt(hits.map((f) => String(f.properties?.id ?? "")));
          }}
          onLoad={(e) => {
            const map = e.target;
            // MapLibre's compact attribution mounts expanded; collapse it.
            const details = map.getContainer().querySelector("details.maplibregl-ctrl-attrib");
            details?.classList.remove("maplibregl-compact-show");
            details?.removeAttribute("open");
            // Tunes a basemap mounted from the URL; a no-op on the cached,
            // already-tuned style (basemapTweaks lists only real changes).
            const tweaks = basemapTweaks(map.getStyle().layers ?? []);
            for (const id of tweaks.remove) map.removeLayer(id);
            for (const r of tweaks.zoomRanges) map.setLayerZoomRange(r.id, r.minzoom, r.maxzoom);
            map.touchZoomRotate.disableRotation();
            map.keyboard.disableRotation();
            // The latest ranking's dots, however long the map took to load.
            const features = trainingFeatures(latest.current.ranked);
            featuresRef.current = features;
            ensureLayers(map, landingRef.current, features);
            shownRef.current = featuresFingerprint(features);
            readyRef.current = true;
            applySelection(map, latest.current.selectedIds);
            map.on("style.load", () => {
              // Never throw from style.load: it turns a good diff into a rebuild.
              try {
                ensureLayers(map, landingRef.current, featuresRef.current);
                const ids = [...selectedRef.current];
                selectedRef.current = new Set();
                applySelection(map, ids);
              } catch (error) {
                console.error("[training-map] style.load", error);
              }
              setPaintTheme(landingRef.current);
            });
            map.on("webglcontextlost", () => latest.current.onStopped());
            map.on("movestart", (ev) => {
              setTooltip(null);
              if (ev.originalEvent && !userMovedRef.current) {
                userMovedRef.current = true;
                setUserMoved(true);
              }
              latest.current.onMoveStart?.();
            });
            if (mediaMatches("(hover: hover) and (pointer: fine)")) {
              disposeHoverRef.current = installHoverCursor(map, {
                layers: () => [DOTS_LAYER],
                isClickable: (hits) => hits.length > 0,
                box: HIT_SLOP_PX.fine,
                onHover: (hits, point) => {
                  const text = hoverLabel(
                    hits.map((f) => String(f.properties?.id ?? "")),
                    latest.current.ranked,
                  );
                  setTooltip((was) =>
                    text === null
                      ? null
                      : was && was.text === text && was.x === point.x && was.y === point.y
                        ? was
                        : { text, x: point.x, y: point.y },
                  );
                },
              });
            }
            // A flip, or a new fit set, that arrived while the map loaded.
            swap(latestThemeRef.current);
            if (camKeyRef.current !== followedKeyRef.current && !userMovedRef.current) {
              followedKeyRef.current = camKeyRef.current;
              fitTo(cameraTarget(latest.current.ranked));
            }
            if (DEV) (window as unknown as { __trainingMap?: MaplibreMap }).__trainingMap = map;
          }}
        >
          <NavigationControl position="top-right" showCompass={false} />
        </MapGL>
        {userMoved && target ? (
          <button
            type="button"
            onClick={() => {
              followedKeyRef.current = camKeyRef.current;
              fitTo(target);
            }}
            className={cn(
              "absolute top-2 left-2 z-10 rounded-full border border-border bg-background/90 px-3 text-[12px] font-semibold text-primary shadow-xs backdrop-blur-sm transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-1",
              TAP,
            )}
          >
            {TRAINING_COPY.fitClosest}
          </button>
        ) : null}
        {tooltip ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 max-w-[220px] -translate-x-1/2 -translate-y-full rounded-md bg-popover px-2 py-1 text-[12px] font-semibold text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ left: tooltip.x, top: tooltip.y - 10 }}
          >
            {tooltip.text}
          </div>
        ) : null}
      </div>
      {spots.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Eyebrow size="sm">{TRAINING_COPY.closestOnMap}</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {spots.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={(e) => openAt(s.ids, e.currentTarget)}
                className={cn(
                  "rounded-full border border-border bg-background px-2.5 text-[12px] font-semibold text-foreground transition-colors hover:border-gold focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:py-0.5",
                  TAP,
                )}
              >
                {s.text}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <TrainingMapLegend
        palette={MAP_PALETTES[paintTheme]}
        before={before}
        curated={curated}
        unmapped={unmapped}
        onOpenUnmapped={(id, button) => onOpen({ ids: [id], anchor: button, returnFocus: button })}
      />
    </div>
  );
}
```

Notes for the implementer (the "why" behind lines a reviewer might "simplify"): the data effect computes the features itself rather than in a `useMemo` (react-hooks v7's `purity` rule refuses `performance.now()` during render); `latest` is written in an effect, never during render (the `refs` rule); the settle timer waits `CAMERA_SETTLE_MS + 20` and still asks `shouldAutoFit`, so a timer and `performance.now()` can never disagree by a millisecond; `MapGL` is the default import renamed so the file never shadows the global `Map`.

- [ ] **Step 5: The loader and the slot**

Create `src/app/taste/training/training-map-loader.ts`:

```ts
// The ONE import site of ./training-map (training-room-map spec RM11, RM24):
// the map slot's next/dynamic(…, { ssr: false }) and TrainingRoom's warm-up
// both call this, so the bundler emits one chunk and a warmed import is the
// same promise the dynamic component later awaits. MapLibre touches `window`
// on import, so nothing may import ./training-map statically
// (training-room-map-imports.test.ts pins both rules).
export const loadTrainingMap = () => import("./training-map");
```

Create `src/app/taste/training/room-map-slot.tsx`:

```tsx
"use client";

// Where the likelihood map mounts, in the laptop column and the phone sheet
// alike (training-room-map spec RM11, RM22). TrainingMap is its own chunk,
// loaded through next/dynamic with ssr: false (MapLibre touches `window` on
// import) from the one loader the warm-up shares, and only rendered here —
// which the panel and the sheet render only while the Map view is open.
//
// Failures: a chunk that could not load (from the boundary, or a warm-up that
// already failed: fault "reload") shows "needs a page reload"; a render error
// shows "stopped" with a retry in place; a lost WebGL context or a map that
// could not start reports onStopped, and the room goes back to List (RM22).
// Each retry remounts the map under a new key (the reducer's attempt).
import dynamic from "next/dynamic";
import { MapErrorBoundary } from "@/app/knowledge/map/map-error-boundary";
import { MapFallback, MapLoading } from "./map-fallback";
import type { TrainingMapProps } from "./map-types";
import type { RoomMap } from "./room-map-state";
import { loadTrainingMap } from "./training-map-loader";

const TrainingMap = dynamic(() => loadTrainingMap().then((m) => m.TrainingMap), {
  ssr: false,
  loading: () => <MapLoading />,
});

export function RoomMapSlot({ roomMap, ...props }: { roomMap: RoomMap } & Omit<TrainingMapProps, "onStopped">) {
  const { state, dispatch } = roomMap;
  if (state.fault === "reload") return <MapFallback kind="reload" />;
  const retry = () => dispatch({ type: "retry" });
  return (
    <MapErrorBoundary
      resetKey={state.attempt}
      onRetry={retry}
      fallback={(_error, isChunk) =>
        isChunk ? <MapFallback kind="reload" /> : <MapFallback kind="stopped" onRetry={retry} />
      }
    >
      <TrainingMap key={state.attempt} {...props} onStopped={() => dispatch({ type: "stopped" })} />
    </MapErrorBoundary>
  );
}
```

- [ ] **Step 6: Run the tests and the type and lint checks**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training/room-map-markup.test.tsx && npx tsc --noEmit && npx eslint src/app/taste/training`
Expected: PASS, room-map-markup 10 tests (5 + 5); `tsc` and eslint silent. (Nothing renders `RoomMapSlot` yet; Task 9 wires it.)

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/app/taste/training/training-map.tsx src/app/taste/training/training-map-legend.tsx src/app/taste/training/training-map-loader.ts src/app/taste/training/room-map-slot.tsx src/app/taste/training/room-map-markup.test.tsx && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): the lean likelihood map, its legend, one loader and its slot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: 262 files, 4652 tests.

---

### Task 9: Wiring — the laptop column, the phone sheet, `TrainingRoom`; markup and source tests

**Files:**
- Modify: `src/app/taste/training/candidates-panel.tsx`, `src/app/taste/training/candidates-sheet.tsx`, `src/app/taste/training/training-room.tsx`
- Test: `src/app/taste/training/room-map-markup.test.tsx`; create `src/app/taste/training/training-room-map-imports.test.ts`

**Interfaces:**
- Consumes: Tasks 5, 7, 8.
- Produces: `PopoverTarget = { kind: "row"; id; anchor: HTMLElement } | { kind: "map"; ids: string[]; chosen: string | null; anchor: Element | VirtualAnchor; returnFocus: HTMLElement }`; `targetDetailId(target)`, `selectedMapIds(target)`, `visibleTarget(target, mapView)`; `MapChooser({ wines, onChoose })`; `CandidateDetailPopover({ target, lookup, note, onChoose, onBack, onClose })`; `CandidatesPanel({ groups, ranked, note, roomMap })` and `CandidatesSheet({ open, onOpenChange, groups, ranked, note, roomMap, returnFocusRef? })` — `roomMap: RoomMap | null` (null = the kill switch is off and each renders exactly R1's markup).

- [ ] **Step 1: Write the failing tests**

(a) In `src/app/taste/training/room-map-markup.test.tsx`, add the imports

```tsx
import { groupRanking } from "@/lib/training/groups";
import type { RankedCandidate, TrainingCandidate } from "@/lib/training/types";
import { emptyNoteState } from "@/lib/wset/note-state";
import { CandidatesPanel, selectedMapIds, targetDetailId, visibleTarget, type PopoverTarget } from "./candidates-panel";
import { ROOM_MAP_START, type RoomMap, type RoomMapState } from "./room-map-state";
```

(each in path order among the existing ones), then directly under the file's header comment add:

```tsx
function rc(c: TrainingCandidate, closeness: number | null): RankedCandidate {
  return {
    candidate: c,
    closeness,
    capped: null,
    explanation: null,
    signatureHits: [],
  };
}
const RANKED = [rc(arch("margaux"), 80), rc(arch("cdp"), 60)];
const roomMap = (state: Partial<RoomMapState> = {}): RoomMap => ({
  state: { ...ROOM_MAP_START, ...state },
  dispatch: () => {},
  warm: () => {},
});
const panel = (map: RoomMap | null, ranked = RANKED) =>
  renderToStaticMarkup(
    <CandidatesPanel groups={groupRanking(ranked)} ranked={ranked} note={emptyNoteState()} roomMap={map} />,
  );
```

and append to the END of the file:

```tsx

describe("CandidatesPanel with the map switch (RM19)", () => {
  it("with the kill switch on (roomMap null) there is no tablist and no tabpanel: R1's column", () => {
    const html = panel(null);
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tabpanel"');
    expect(html).toContain(
      '<h2 id="training-candidates" class="px-3 pt-2 font-heading text-[19px] font-semibold">What it could be</h2>',
    );
  });

  it("on List: the list's panel shows, the map's is hidden and empty", () => {
    const html = panel(roomMap());
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-list" aria-labelledby="[^"]*-tab-list" class=/);
    expect(html).toMatch(
      /role="tabpanel" id="[^"]*-panel-map" aria-labelledby="[^"]*-tab-map" hidden="" class="[^"]*"><\/div>/,
    );
    expect(html).toContain("Bordeaux, France");
  });

  it("on Map: the list stays mounted but hidden (its regions and Show all come back as they were)", () => {
    const html = panel(roomMap({ view: "map" }));
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-list" aria-labelledby="[^"]*-tab-list" hidden=""/);
    // Still rendered inside the hidden panel: the same region rows.
    const listPanel = html.slice(
      html.search(/role="tabpanel" id="[^"]*-panel-list"/),
      html.search(/role="tabpanel" id="[^"]*-panel-map"/),
    );
    expect(listPanel).toContain("Bordeaux, France");
    expect(html).toMatch(/role="tabpanel" id="[^"]*-panel-map" aria-labelledby="[^"]*-tab-map" class=/);
  });

  it("before any answer, Map leaves 'Start describing the wine' to the legend", () => {
    const before = [rc(arch("margaux"), null)];
    expect(panel(roomMap(), before)).toContain("Start describing the wine");
    expect(panel(roomMap({ view: "map" }), before)).not.toContain("Start describing the wine");
  });

  it("a stopped map puts the line and 'Try the map again' at the top of the list", () => {
    const html = panel(roomMap({ fault: "stopped" }));
    expect(html).toContain("The map stopped working — the list has every wine.");
    expect(html).toContain(">Try the map again</button>");
    expect(html.indexOf("The map stopped working")).toBeLessThan(html.indexOf("Bordeaux, France"));
  });
});

describe("the popover's target rules (RM18)", () => {
  const button = {} as HTMLElement;
  const map = (ids: string[], chosen: string | null = null): PopoverTarget => ({
    kind: "map",
    ids,
    chosen,
    anchor: button,
    returnFocus: button,
  });
  const row: PopoverTarget = { kind: "row", id: "a", anchor: button };

  it("one wine opens its detail; several open a chooser until one is chosen", () => {
    expect(targetDetailId(row)).toBe("a");
    expect(targetDetailId(map(["a"]))).toBe("a");
    expect(targetDetailId(map(["a", "b", "c"]))).toBeNull();
    expect(targetDetailId(map(["a", "b", "c"], "b"))).toBe("b");
  });

  it("the gold ring: every wine of an open chooser, then the chosen one; none for a row", () => {
    expect(selectedMapIds(map(["a", "b"]))).toEqual(["a", "b"]);
    expect(selectedMapIds(map(["a", "b"], "b"))).toEqual(["b"]);
    expect(selectedMapIds(row)).toEqual([]);
    expect(selectedMapIds(null)).toEqual([]);
  });

  it("a row's popover shows only on List, a map's only on Map", () => {
    expect(visibleTarget(row, false)).toBe(row);
    expect(visibleTarget(row, true)).toBeNull();
    const m = map(["a"]);
    expect(visibleTarget(m, true)).toBe(m);
    expect(visibleTarget(m, false)).toBeNull();
  });
});
```

(b) Create `src/app/taste/training/training-room-map-imports.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source rules for the likelihood map (training-room-map spec RM1, RM11,
// RM19, RM24, §11 "source tests"). vitest has no bundler, so these read the
// files: the map is its own chunk, imported from one place, mounted only in
// the Map view, and nothing about it reaches a tasting or the room's first load.

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SRC = path.resolve(HERE, "../../..");
const read = (file: string) => readFileSync(path.join(HERE, file), "utf8");
const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const ALL = walk(SRC).map((f) => ({
  file: rel(f),
  text: readFileSync(f, "utf8"),
}));
const isTest = (file: string) => /\.test\.tsx?$/.test(file);
const ROOM = "app/taste/training/";

/** Import specifiers of `text`: static `from "x"`, side-effect `import "x"` and dynamic `import("x")`,
    each with whether it is a type-only import. */
function imports(text: string): { spec: string; typeOnly: boolean }[] {
  const out: { spec: string; typeOnly: boolean }[] = [];
  for (const m of text.matchAll(/^\s*import\s+(type\s+)?[^;'"]*?from\s+["']([^"']+)["']/gm)) {
    out.push({ spec: m[2], typeOnly: Boolean(m[1]) });
  }
  for (const m of text.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push({ spec: m[1], typeOnly: false });
  for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) out.push({ spec: m[1], typeOnly: false });
  return out;
}
const importsMap = (spec: string) => /(^|\/)training-map$/.test(spec);
const importsMapView = (spec: string) => /(^|\/)map-view$/.test(spec);

describe("the likelihood map's chunk (RM11, RM24)", () => {
  it("./training-map is imported only by training-map-loader.ts", () => {
    const importers = ALL.filter(({ text }) => imports(text).some((i) => importsMap(i.spec))).map((f) => f.file);
    expect(importers).toEqual([`${ROOM}training-map-loader.ts`]);
    expect(read("training-map-loader.ts")).toMatch(
      /export const loadTrainingMap = \(\) => import\("\.\/training-map"\);/,
    );
  });

  it("loadTrainingMap is used by the dynamic(…, { ssr: false }) call and the warm-up, and nowhere else", () => {
    const users = ALL.filter(
      ({ file, text }) => !isTest(file) && !file.endsWith("training-map-loader.ts") && /\bloadTrainingMap\b/.test(text),
    ).map((f) => f.file);
    expect(users.sort()).toEqual([`${ROOM}room-map-slot.tsx`, `${ROOM}training-room.tsx`]);
    expect(read("room-map-slot.tsx")).toMatch(
      /dynamic\(\(\) => loadTrainingMap\(\)\.then\(\(m\) => m\.TrainingMap\), \{\s*ssr: false,/,
    );
    expect(read("training-room.tsx")).toMatch(/loadTrainingMap\(\)\.catch\(/);
  });

  it("TrainingMap is rendered only by the slot, and the slot only inside the Map view", () => {
    const renderers = ALL.filter(({ file, text }) => !isTest(file) && /<TrainingMap\b/.test(text)).map((f) => f.file);
    expect(renderers).toEqual([`${ROOM}room-map-slot.tsx`]);
    // The laptop column: only while Map is open, and only at lg+.
    expect(read("candidates-panel.tsx")).toMatch(/\{mapView && wide \? \(\s*<RoomMapSlot\b/);
    // The phone sheet: only in its map branch, below lg, and never on a short screen.
    const sheet = read("candidates-sheet.tsx");
    const branch = sheet.indexOf("if (!roomMap || !mapView) {");
    const elseAt = sheet.indexOf("} else {", branch);
    expect(branch).toBeGreaterThan(-1);
    expect(sheet.indexOf("<RoomMapSlot")).toBeGreaterThan(elseAt);
    expect(sheet).toMatch(/short \? \(\s*<MapUpright[\s\S]*?\) : !wide \? \(\s*<RoomMapSlot\b/);
  });

  it("no room file but training-map.tsx has a value import of maplibre-gl or react-map-gl", () => {
    const offenders = ALL.filter(({ file }) => file.startsWith(ROOM) && !file.endsWith("training-map.tsx"))
      .filter(({ text }) => imports(text).some((i) => !i.typeOnly && /^(maplibre-gl|react-map-gl)(\/|$)/.test(i.spec)))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("no room file outside the chunk statically imports basemap or map-palette (the warm-up uses import())", () => {
    const CHUNK = [`${ROOM}training-map.tsx`];
    const offenders = ALL.filter(({ file }) => file.startsWith(ROOM) && !CHUNK.includes(file) && !isTest(file))
      .filter(({ text }) =>
        [...text.matchAll(/^\s*import\s+(?!type\b)[^;'"]*?from\s+["']([^"']+)["']/gm)].some((m) =>
          /\/wine-map\/(basemap|map-palette)$/.test(m[1]),
        ),
      )
      .map((f) => f.file);
    expect(offenders).toEqual([]);
    expect(read("training-room.tsx")).toMatch(/import\("@\/lib\/wine-map\/basemap"\)/);
  });
});

describe("the map stays in the training room (RM1)", () => {
  it("no non-test file outside src/app/taste/training/ imports training-map or map-view (map-view's own module aside)", () => {
    const offenders = ALL.filter(
      ({ file }) => !isTest(file) && !file.startsWith(ROOM) && !/^lib\/training\/map-view/.test(file),
    )
      .filter(({ text }) => imports(text).some((i) => importsMap(i.spec) || importsMapView(i.spec)))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it("map-view is imported only by training-map.tsx and its own test", () => {
    const importers = ALL.filter(({ text }) => imports(text).some((i) => importsMapView(i.spec))).map((f) => f.file);
    expect(importers.sort()).toEqual(["app/taste/training/training-map.tsx", "lib/training/map-view.test.ts"]);
  });
});

describe("the theme contract (RM21, CLAUDE.md: never pass a changing mapStyle)", () => {
  it("mapStyle is frozen at mount and passed once; a flip goes through setStyle with withWineLayers", () => {
    const map = read("training-map.tsx");
    expect(map).toMatch(/const \[mountStyle\] = useState<StyleSpecification \| string>\(/);
    expect(map.match(/mapStyle=/g)).toEqual(["mapStyle="]);
    expect(map).toContain("mapStyle={mountStyle}");
    expect(map).toMatch(/transformStyle: \(prev, incoming\) => \{[\s\S]*?withWineLayers\(prev, tuneBasemapStyle\(incoming\)\)/);
  });
});

describe("the List | Map choice is never stored (RM19)", () => {
  it("map-switch, room-map-state, training-room and training-map never touch browser storage", () => {
    for (const file of ["map-switch.tsx", "room-map-state.ts", "training-room.tsx", "training-map.tsx"]) {
      expect(read(file), file).not.toMatch(/localStorage|sessionStorage|safe-storage/);
    }
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training/room-map-markup.test.tsx src/app/taste/training/training-room-map-imports.test.ts`
Expected: FAIL — `selectedMapIds`/`targetDetailId`/`visibleTarget` are not exported; the panel renders no tablist; the source test finds `loadTrainingMap` used only by `room-map-slot.tsx`, and no `{mapView && wide ? (<RoomMapSlot` in the panel.

- [ ] **Step 3: The laptop column**

In `src/app/taste/training/candidates-panel.tsx`:

1. Header comment: after the line `// CandidateRow, RegionGroups and ShowAllRegions are shared with the phone sheet.` add

```tsx
// With the likelihood map on (training-room-map spec RM19), a List | Map
// tablist sits beside the heading: the list stays mounted (hidden) under Map,
// so its open regions and Show all come back as they were, and the map
// mounts only while Map is open, and only here at lg+ (the phone sheet owns
// it below lg). A dot, a spot's button or an unmapped name opens the SAME
// popover a row does (CandidateDetailPopover), anchored to the dot.
```

2. Imports: replace `import { useRef, useState } from "react";` with `import { useEffect, useId, useMemo, useRef, useState } from "react";`, and `import { ChevronDown } from "lucide-react";` with `import { ArrowLeft, ChevronDown } from "lucide-react";`; in the import from `@/lib/training/copy` add `chooserTitle,` after `TRAINING_COPY,`; replace `import { GroupMapLink } from "./map-link";` with

```tsx
import { MapFallback } from "./map-fallback";
import { GroupMapLink } from "./map-link";
import { MapSwitch, panelId, tabId } from "./map-switch";
import type { VirtualAnchor } from "./map-types";
import { RoomMapSlot } from "./room-map-slot";
import type { RoomMap } from "./room-map-state";
import { LG_QUERY, useMedia } from "./use-media";
```

3. Replace EVERYTHING from `export function CandidatesPanel({ groups, note }: { groups: RegionGroup[]; note: WsetNoteState }) {` to the end of the file with:

```tsx
/** What the laptop popover shows and where it is anchored (training-room-map
    spec RM18): a list row's wine, or what the map opened — a dot, a spot's
    "Closest on the map" button or an unmapped name — which is one wine's
    detail, or a chooser of the wines at one spot until one is chosen. */
export type PopoverTarget =
  | { kind: "row"; id: string; anchor: HTMLElement }
  | {
      kind: "map";
      ids: string[];
      chosen: string | null;
      anchor: Element | VirtualAnchor;
      returnFocus: HTMLElement;
    };

/** The wine a target shows in full; null while it is a chooser. */
export function targetDetailId(target: PopoverTarget): string | null {
  if (target.kind === "row") return target.id;
  return target.chosen ?? (target.ids.length === 1 ? target.ids[0] : null);
}

/** The dots that wear the gold ring: what the map opened, while it is open. */
export function selectedMapIds(target: PopoverTarget | null): string[] {
  if (!target || target.kind !== "map") return [];
  return target.chosen ? [target.chosen] : target.ids;
}

/** A target the current view can still show: a row's popover needs the list,
    a map's needs the map (the other view's anchor is hidden or gone). */
export function visibleTarget(target: PopoverTarget | null, mapView: boolean): PopoverTarget | null {
  if (!target) return null;
  return (target.kind === "map") === mapView ? target : null;
}

/** "{n} wines here": the wines a tap hit, as the list's own rows, best first (RM18). */
export function MapChooser({ wines, onChoose }: { wines: RankedCandidate[]; onChoose: (id: string) => void }) {
  return (
    <ul className="flex flex-col">
      {wines.map((r) => (
        <li key={r.candidate.id}>
          <CandidateRow r={r} onOpen={() => onChoose(r.candidate.id)} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The laptop column's one popover (extracted for training-room-map spec
 * RM18): a list row's detail anchored to the row, as before, or what the map
 * opened, anchored to the dot's point (a virtual element) or the button
 * pressed. A row's own press toggles it (pressOnOwningRow); a map target has
 * no row, so any press outside closes it. On a fine pointer focus moves in,
 * and on close goes back to the row, the map container (tabIndex -1) or the
 * button — never to <body>.
 */
export function CandidateDetailPopover({
  target,
  lookup,
  note,
  onChoose,
  onBack,
  onClose,
}: {
  target: PopoverTarget | null;
  lookup: (id: string) => RankedCandidate | null;
  note: WsetNoteState;
  /** A chooser row: show that wine. */
  onChoose: (id: string) => void;
  /** Back from a chosen wine to its chooser. */
  onBack: () => void;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  // Why it last closed, and what it belonged to: kept outside `target`, which
  // is already null by the time the focus goes back.
  const closeReason = useRef<string | null>(null);
  const owner = useRef<{ row: HTMLElement | null; returnFocus: HTMLElement | null }>({ row: null, returnFocus: null });
  useEffect(() => {
    if (!target) return;
    closeReason.current = null;
    owner.current =
      target.kind === "row"
        ? { row: target.anchor, returnFocus: target.anchor }
        : { row: null, returnFocus: target.returnFocus };
  }, [target]);

  const detailId = target ? targetDetailId(target) : null;
  const detail = detailId ? lookup(detailId) : null;
  const chooser =
    target && target.kind === "map" && detailId === null
      ? target.ids.map(lookup).filter((r): r is RankedCandidate => r !== null)
      : null;
  const canGoBack = target?.kind === "map" && target.chosen !== null && target.ids.length > 1;
  // After a swap inside the popup, keep focus in it (fine pointer only).
  const refocus = () => {
    if (finePointer()) requestAnimationFrame(() => popupRef.current?.focus());
  };

  return (
    <PopoverPrimitive.Root
      open={detail !== null || chooser !== null}
      onOpenChange={(next, details) => {
        if (next) return;
        // A press on the owning row is the row's to handle: its click, which
        // follows, closes the popover (the panel's onOpen).
        const pressed = details.event?.target;
        if (pressOnOwningRow(details.reason, owner.current.row, pressed instanceof Node ? pressed : null)) {
          details.cancel();
          return;
        }
        closeReason.current = details.reason;
        onClose();
      }}
      modal={false}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={target?.anchor ?? null}
          positionMethod="fixed"
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={16}
          className="z-50"
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            aria-label={chooser ? chooserTitle(chooser.length) : detail ? detail.candidate.name : undefined}
            initialFocus={() => (finePointer() ? popupRef.current : false)}
            finalFocus={() =>
              detailReturnsFocus(closeReason.current, finePointer()) ? (owner.current.returnFocus ?? false) : false
            }
            className="max-h-[80vh] w-[560px] overflow-y-auto overscroll-contain rounded-2xl bg-background p-4 shadow-lg ring-1 ring-foreground/10 outline-hidden"
          >
            {chooser ? (
              <div className="flex flex-col gap-2">
                <p className="px-3 font-heading text-[17px] font-semibold">{chooserTitle(chooser.length)}</p>
                <MapChooser
                  wines={chooser}
                  onChoose={(id) => {
                    onChoose(id);
                    refocus();
                  }}
                />
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-2">
                {canGoBack ? (
                  <button
                    type="button"
                    aria-label={TRAINING_COPY.back}
                    onClick={() => {
                      onBack();
                      refocus();
                    }}
                    className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring md:pointer-fine:size-8"
                  >
                    <ArrowLeft aria-hidden className="size-5" />
                  </button>
                ) : null}
                <ArchetypeDetail candidate={detail.candidate} note={note} />
              </div>
            ) : null}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function CandidatesPanel({
  groups,
  ranked,
  note,
  roomMap,
}: {
  groups: RegionGroup[];
  ranked: RankedCandidate[];
  note: WsetNoteState;
  /** The List | Map switch's state (training-room-map spec RM19); null when
      NEXT_PUBLIC_TRAINING_MAP=0, and the column is exactly R1's. */
  roomMap: RoomMap | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const [target, setTarget] = useState<PopoverTarget | null>(null);
  const idBase = useId();
  // Only the laptop column mounts the map here: below lg this aside is
  // display:none and the phone sheet owns the map (one WebGL context).
  const wide = useMedia(LG_QUERY, false);
  const view = regionPanelView(groups, showAll);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.candidate.id, r] as const)), [ranked]);
  const lookup = (id: string) => byId.get(id) ?? findMember(groups, id);
  const mapView = roomMap?.state.view === "map";
  const shown = visibleTarget(target, mapView);
  const openRowId = shown?.kind === "row" ? shown.id : null;

  const list = (
    <>
      {view.before && !mapView ? (
        <p className="px-3 text-[12.5px] text-muted-foreground">{TRAINING_COPY.beforeAnswers}</p>
      ) : null}
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        openId={openRowId}
        onOpen={(id, anchor) => {
          // The open popover's own row toggles it closed, as a trigger would.
          if (openRowId === id) {
            setTarget(null);
            return;
          }
          setTarget({ kind: "row", id, anchor });
        }}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />
    </>
  );

  return (
    <section
      aria-labelledby="training-candidates"
      className="flex flex-col gap-2 rounded-[12px] border border-border bg-card p-2"
    >
      {roomMap ? (
        <>
          <div className="flex items-center gap-2 px-3 pt-2">
            <h2 id="training-candidates" className="min-w-0 flex-1 font-heading text-[19px] font-semibold">
              {TRAINING_COPY.candidatesHeading}
            </h2>
            <MapSwitch
              idBase={idBase}
              view={roomMap.state.view}
              onSelect={(v) => roomMap.dispatch({ type: "select", view: v })}
              onWarm={roomMap.warm}
            />
          </div>
          <div
            role="tabpanel"
            id={panelId(idBase, "list")}
            aria-labelledby={tabId(idBase, "list")}
            hidden={mapView}
            className="flex flex-col gap-2"
          >
            {roomMap.state.fault === "stopped" ? (
              <div className="px-1">
                <MapFallback kind="stopped" onRetry={() => roomMap.dispatch({ type: "retry" })} />
              </div>
            ) : null}
            {list}
          </div>
          <div
            role="tabpanel"
            id={panelId(idBase, "map")}
            aria-labelledby={tabId(idBase, "map")}
            hidden={!mapView}
            className="flex flex-col gap-2 px-1 pb-1"
          >
            {mapView && wide ? (
              <RoomMapSlot
                roomMap={roomMap}
                ranked={ranked}
                layout="column"
                selectedIds={selectedMapIds(shown)}
                onOpen={(request) =>
                  setTarget({ kind: "map", chosen: null, ...request })
                }
                // Any camera move: the dot's point would drift under the popover.
                onMoveStart={() => setTarget((t) => (t?.kind === "map" ? null : t))}
              />
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h2 id="training-candidates" className="px-3 pt-2 font-heading text-[19px] font-semibold">
            {TRAINING_COPY.candidatesHeading}
          </h2>
          {list}
        </>
      )}

      <CandidateDetailPopover
        target={shown}
        lookup={lookup}
        note={note}
        onChoose={(id) => setTarget((t) => (t?.kind === "map" ? { ...t, chosen: id } : t))}
        onBack={() => setTarget((t) => (t?.kind === "map" ? { ...t, chosen: null } : t))}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}
```

(The Tailwind `hidden` ATTRIBUTE, not the class, keeps the list mounted: v4's preflight gives `[hidden]` `display: none !important`, which beats the panel's `flex`.)

- [ ] **Step 4: The phone sheet**

Replace `src/app/taste/training/candidates-sheet.tsx` with:

```tsx
"use client";

// Below lg: the ranked regions as the app's bottom sheet (spec §3.3, §8;
// region-guess addendum R3) — the tour sheet's idiom: one base-ui Dialog,
// rounded top, drag pill, at most 88dvh, the PHONE classes as max-lg: variants
// and a centred card from lg (never seen: the column takes over there). The
// top five regions, Show all N regions, a region row opening its typical wines
// in place (the top region starts open); a wine row swaps the sheet's content
// to that wine's profile with a back arrow — no stacked sheets — and back
// finds the list as it was left (the open regions and Show all live here, not
// in the list). ✕, Escape and the backdrop close it; focus moves in, and back
// to the strip on close, on a fine pointer only (the Popover touch rule). The
// list body is the only nested scroller (§8).
//
// The likelihood map (training-room-map spec RM18-RM20, §6.3), when the
// switch is on: List | Map tabs under the title, hidden on a detail or a
// chooser. On Map the sheet takes its full 88dvh (a map has no content height
// to size to) and the body stops scrolling, so the map owns every touch in it;
// a dot opens the chooser ("{n} wines here") or the detail with Back, in its
// own scroller OVER the kept map (invisible and inert, same size), so Back
// returns to the same camera with no new WebGL context. Closing the sheet
// unmounts the map; reopening remounts it and the tab stays Map (the choice
// lives in TrainingRoom). A phone on its side gets the upright note instead.
import { useId, useMemo, useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { finePointer } from "@/lib/fine-pointer";
import { TRAINING_COPY, chooserTitle } from "@/lib/training/copy";
import { findMember, regionPanelView, toggleGroup, type ExpandState } from "@/lib/training/groups";
import type { RankedCandidate, RegionGroup } from "@/lib/training/types";
import type { WsetNoteState } from "@/lib/wset/types";
import { cn } from "@/lib/utils";
import { ArchetypeDetail } from "./archetype-detail";
import { MapChooser, RegionGroups, ShowAllRegions } from "./candidates-panel";
import { MapFallback, MapUpright } from "./map-fallback";
import { MapSwitch, panelId, tabId } from "./map-switch";
import type { MapOpenRequest } from "./map-types";
import { RoomMapSlot } from "./room-map-slot";
import type { RoomMap } from "./room-map-state";
import { LG_QUERY, SHORT_QUERY, useMedia } from "./use-media";

// Overrides DialogContent's centred defaults below lg (tailwind-merge keeps the
// variants beside the defaults; a variant wins where it applies). max-w needs
// `!` to beat the default `sm:max-w-sm` between sm and lg.
const PHONE =
  "flex flex-col gap-0 overflow-hidden bg-card p-0 text-foreground max-lg:top-auto max-lg:bottom-0 max-lg:left-0 max-lg:max-h-[88dvh] max-lg:w-full max-lg:max-w-none! max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-[22px_22px_0_0] max-lg:ring-0 max-lg:data-open:zoom-in-100 max-lg:data-open:slide-in-from-bottom-8";
const CARD = "lg:max-h-[80vh] lg:w-[480px] lg:max-w-[calc(100vw-2rem)] lg:rounded-2xl";
// On Map the sheet is its full height, not its content's (RM20).
const MAP_HEIGHT = "max-lg:h-[88dvh]";
const SAFE_BOTTOM = "pb-[max(16px,env(safe-area-inset-bottom))]";

export function CandidatesSheet({
  open,
  onOpenChange,
  groups,
  ranked,
  note,
  roomMap,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: RegionGroup[];
  ranked: RankedCandidate[];
  note: WsetNoteState;
  /** The List | Map switch's state (training-room-map spec RM19); null when
      NEXT_PUBLIC_TRAINING_MAP=0, and the sheet is exactly R1's. */
  roomMap: RoomMap | null;
  /** The strip that opened the sheet: focus goes back to it on close (fine pointer only). */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  // The wines a tap on a shared spot hit, in ranking order (RM18).
  const [chooserIds, setChooserIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [expand, setExpand] = useState<ExpandState>({});
  const idBase = useId();
  // The laptop column owns the map from lg (one WebGL context); a phone on
  // its side gets the upright note (RM20).
  const wide = useMedia(LG_QUERY, false);
  const short = useMedia(SHORT_QUERY, false);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.candidate.id, r] as const)), [ranked]);
  const lookup = (id: string) => byId.get(id) ?? findMember(groups, id);
  const detail = detailId ? lookup(detailId) : null;
  const chooser = chooserIds ? chooserIds.map(lookup).filter((r): r is RankedCandidate => r !== null) : null;
  const view = regionPanelView(groups, showAll);
  const mapView = roomMap?.state.view === "map";
  const overlay = detail !== null || chooser !== null;

  const openFromMap = (request: MapOpenRequest) => {
    if (request.ids.length === 1) {
      setChooserIds(null);
      setDetailId(request.ids[0]);
    } else {
      setDetailId(null);
      setChooserIds(request.ids);
    }
  };
  // Back: a wine chosen from a chooser returns to it; anything else to the list or map.
  const back = () => {
    if (detail && chooser) setDetailId(null);
    else {
      setDetailId(null);
      setChooserIds(null);
    }
  };

  const list = (
    <div className="flex flex-col gap-2">
      <RegionGroups
        view={view}
        expand={expand}
        onToggle={(key) => setExpand((e) => toggleGroup(e, key, view.topKey))}
        onOpen={(id) => setDetailId(id)}
      />
      <ShowAllRegions view={view} onShowAll={() => setShowAll(true)} />
    </div>
  );
  const overlayBody =
    chooser && !detail ? (
      <MapChooser wines={chooser} onChoose={(id) => setDetailId(id)} />
    ) : detail ? (
      <div className="px-2">
        <ArchetypeDetail candidate={detail.candidate} note={note} />
      </div>
    ) : null;

  let body;
  if (!roomMap || !mapView) {
    body = (
      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-2", SAFE_BOTTOM)}>
        {overlayBody ?? (
          <>
            {roomMap?.state.fault === "stopped" ? (
              <div className="px-1 pb-2">
                <MapFallback kind="stopped" onRetry={() => roomMap.dispatch({ type: "retry" })} />
              </div>
            ) : null}
            {list}
          </>
        )}
      </div>
    );
  } else {
    // The map body does not scroll (RM20): the map owns every touch in it.
    body = (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">
        <div
          inert={overlay}
          className={cn("flex min-h-0 flex-1 flex-col gap-2 px-3 pt-2", SAFE_BOTTOM, overlay && "invisible")}
        >
          {short ? (
            <MapUpright onShowList={() => roomMap.dispatch({ type: "select", view: "list" })} />
          ) : !wide ? (
            <RoomMapSlot
              roomMap={roomMap}
              ranked={ranked}
              layout="sheet"
              selectedIds={detailId ? [detailId] : (chooserIds ?? [])}
              onOpen={openFromMap}
            />
          ) : null}
        </div>
        {overlayBody ? (
          <div className={cn("absolute inset-0 overflow-y-auto overscroll-contain bg-card px-2 pt-2", SAFE_BOTTOM)}>
            {overlayBody}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDetailId(null);
          setChooserIds(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={() => finePointer()}
        finalFocus={() => (finePointer() ? (returnFocusRef?.current ?? false) : false)}
        className={cn(PHONE, CARD, roomMap && mapView && MAP_HEIGHT)}
      >
        <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 pt-3 pb-3">
          <span aria-hidden className="h-1 w-[38px] self-center rounded-full bg-border lg:hidden" />
          <div className="flex items-center gap-1">
            {overlay ? (
              <button
                type="button"
                aria-label={TRAINING_COPY.back}
                onClick={back}
                className="-ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft aria-hidden className="size-5" />
              </button>
            ) : null}
            <DialogTitle className="min-w-0 flex-1 font-heading text-[20px] leading-tight font-semibold">
              {detail
                ? detail.candidate.name
                : chooser
                  ? chooserTitle(chooser.length)
                  : TRAINING_COPY.candidatesHeading}
            </DialogTitle>
            {/* 44 px on touch, a compact 32 px on a laptop pointer. */}
            <DialogClose
              aria-label={TRAINING_COPY.close}
              className="-mr-2 inline-flex size-8 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:pointer-fine:min-h-0 md:pointer-fine:min-w-0"
            >
              <X aria-hidden className="size-5" />
            </DialogClose>
          </div>
          {roomMap && !overlay ? (
            <MapSwitch
              idBase={idBase}
              view={roomMap.state.view}
              onSelect={(v) => roomMap.dispatch({ type: "select", view: v })}
              onWarm={roomMap.warm}
              className="self-start"
            />
          ) : null}
          {!overlay && !mapView && view.before ? (
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {TRAINING_COPY.beforeAnswers}
            </DialogDescription>
          ) : null}
        </div>
        {roomMap ? (
          <>
            <div
              role="tabpanel"
              id={panelId(idBase, mapView ? "map" : "list")}
              aria-labelledby={tabId(idBase, mapView ? "map" : "list")}
              className="flex min-h-0 flex-1 flex-col"
            >
              {body}
            </div>
            {/* The other tab's panel, empty and hidden, so its aria-controls resolves. */}
            <div
              role="tabpanel"
              id={panelId(idBase, mapView ? "list" : "map")}
              aria-labelledby={tabId(idBase, mapView ? "list" : "map")}
              hidden
            />
          </>
        ) : (
          body
        )}
      </DialogContent>
    </Dialog>
  );
}
```

With `roomMap` null the sheet's markup is R1's (same body classes, same description rule, same content classes).

- [ ] **Step 5: `TrainingRoom`**

In `src/app/taste/training/training-room.tsx`:

1. Header comment: after `// scrolls in this app), with keyboard focus on the new view's heading.` add

```tsx
//
// The candidates' List | Map choice (training-room-map spec RM19, RM22) is
// state HERE, not in the panel or the sheet: it survives the phone sheet
// closing and reopening and a new session started without a reload, resets
// with the page, and is never written to browser storage. With
// NEXT_PUBLIC_TRAINING_MAP=0 at build, no tablist renders and the room is R1.
// Pointing at or focusing the Map tab warms the map's code and the basemap
// style (RM24), both by dynamic import, so neither enters this first load.
```

2. Imports: add `useReducer,` after `useMemo,` in the React import; add `import { themeOfRoot } from "@/lib/rendered-theme";` before `import { cn } from "@/lib/utils";`; after `import { ResultView } from "./result-view";` add

```tsx
import { ROOM_MAP_START, TRAINING_MAP_ENABLED, roomMapReducer, type RoomMap } from "./room-map-state";
import { loadTrainingMap } from "./training-map-loader";
```

3. After `  const groups = useMemo(() => groupRanking(ranked), [ranked]);` add

```tsx

  // List | Map (training-room-map spec RM19, RM22, RM24).
  const [mapState, mapDispatch] = useReducer(roomMapReducer, ROOM_MAP_START);
  const warmed = useRef(false);
  const warmMap = useCallback(() => {
    if (warmed.current) return;
    warmed.current = true;
    // A rejected import stays rejected: opening Map then says to reload.
    loadTrainingMap().catch(() => mapDispatch({ type: "chunkFailed" }));
    import("@/lib/wine-map/basemap").then(
      // One shared request per theme; a failed style fetch is the map's own to handle.
      (m) => m.loadBasemapStyle(themeOfRoot(document.documentElement)).catch(() => {}),
      () => mapDispatch({ type: "chunkFailed" }),
    );
  }, []);
  const roomMap = useMemo<RoomMap | null>(
    () => (TRAINING_MAP_ENABLED ? { state: mapState, dispatch: mapDispatch, warm: warmMap } : null),
    [mapState, warmMap],
  );
```

4. Replace `            <CandidatesPanel groups={groups} note={session.note} />` with `            <CandidatesPanel groups={groups} ranked={ranked} note={session.note} roomMap={roomMap} />`, and in `<CandidatesSheet …>` replace

```tsx
          groups={groups}
          note={session.note}
          returnFocusRef={stripRef}
```

with

```tsx
          groups={groups}
          ranked={ranked}
          note={session.note}
          roomMap={roomMap}
          returnFocusRef={stripRef}
```

- [ ] **Step 6: Run everything**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx vitest run src/app/taste/training && npx tsc --noEmit && npx eslint src/app/taste/training src/lib/training`
Expected: PASS — room-map-markup 18 tests (10 + 8), training-room-map-imports 9 tests, and the R1 files (`map-link.test.tsx` 9, `training-room-layout.test.ts`) still pass; `tsc` and eslint silent.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add src/app/taste/training/candidates-panel.tsx src/app/taste/training/candidates-sheet.tsx src/app/taste/training/training-room.tsx src/app/taste/training/room-map-markup.test.tsx src/app/taste/training/training-room-map-imports.test.ts && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
feat(training): List | Map in the room — the laptop column, the phone sheet, a dot opens the same detail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Vitest after this task: **263 files, 4669 tests**.

---

### Task 10: CLAUDE.md and the whole branch

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Point the R1 bullet at R2**

In the `- **Training room on the wine map, R1**` bullet, replace

```markdown
  `docs/superpowers/plans/2026-09-29-training-room-map-r1.md`; R2, the
  likelihood map, is not built yet). **Training room only** (RM1): no
```

with

```markdown
  `docs/superpowers/plans/2026-09-29-training-room-map-r1.md`; R2, the
  likelihood map, is the next bullet). **Training room only** (RM1): no
```

and in the same bullet replace `  ("Veneto on the wine map" under Prosecco; `groupMapRegion`: the region` with `  ("Veneto on the wine map" under Prosecco, in the explorer's English — `englishName` — since R2; `groupMapRegion`: the region`.

- [ ] **Step 2: Add the R2 bullet**

Directly after the R1 bullet (before `- **Aroma lexicon v2** (2026-09-29, migration`), add:

```markdown
- **Training room on the wine map, R2 — the likelihood map** (2026-09-29,
  same spec, plan `docs/superpowers/plans/2026-09-29-training-room-map-r2.md`).
  Still **training room only** (RM1): `training-map.tsx` and
  `src/lib/training/map-view.ts` are imported only from under
  `src/app/taste/training/` (and map-view's own test);
  `training-room-map-imports.test.ts` pins it and the rules below. On
  demand on both widths: a List | Map tablist (`map-switch.tsx`: roving
  tabIndex, arrows, Home/End) beside "What it could be" on the laptop
  column and under the phone sheet's title. The choice is
  `roomMapReducer` state in `TrainingRoom` (`room-map-state.ts`): every page
  visit starts on List, it survives the sheet closing and a new session,
  and it is NEVER stored. The map is a lean MapLibre map (`TrainingMap`,
  never `TileWineMap`: no pmtiles, manifest or shards), its own chunk
  through ONE loader (`training-map-loader.ts`'s `loadTrainingMap`, used by
  `room-map-slot.tsx`'s `next/dynamic(…, { ssr: false })` and by the Map
  tab's warm-up on pointerenter/focus, which also `import()`s `basemap.ts`
  to fetch the style), so the room's first load carries no MapLibre,
  basemap or palette. It mounts only in the Map view — in the laptop column
  from lg (`LG_QUERY`), in the phone sheet below it, never both (one WebGL
  context). One dot per typical wine at its home's `label_point`, else the
  nearest ancestor's, else a CURATED display-only point
  (`wine_archetypes.display_lon`/`display_lat`, both or neither,
  `…_training_room_display_points.sql`: 18 values set by id and live name
  while unplaced; read by its own fail-soft select, `training pool: display
  points`). A curated point is never a map place: that wine's detail still
  reads "Not on the wine map yet", and the legend says curated spots are
  approximate. Heat is RELATIVE to the leader (`heatOf` = closeness / the
  best uncapped closeness); colour and size ramp over heat 0.5–1 through
  `MAP_PALETTES[theme].heat` (kept LAST in both tables — a collaborator
  edits the file too); a capped wine is a hollow ring, an unscored one
  neutral. The % shown is the list's own (`shortName` + `percentLabel`):
  three always-on labels, the rest from z7 where they fit, a hover tooltip
  on fine pointers, and a "Closest on the map" row of real buttons. One
  GeoJSON source, `TRAINING_SOURCE_ID` (`wine-training`, known to
  `isWineSourceId` so a theme swap carries it); `setData` at most once per
  frame and only when `featuresFingerprint` changes. Theme: `mapStyle`
  frozen at mount (the cached style or the URL), flips through
  `setStyle(…, { diff: true, validate: false, transformStyle:
  withWineLayers(prev, tuneBasemapStyle(next)) })` — never a changing
  `mapStyle`. Camera: Europe while there is no leader; then the fit set
  (the close set's wines with a dot, ≤ 12, within 25° of the first) 600 ms
  after it last changed, until the viewer moves the map; then "Fit to the
  closest". A dot opens the SAME detail a row does — laptop: the extracted
  `CandidateDetailPopover`, anchored to a virtual element at the dot, closed
  by any camera move, focus back to the map container; phone: the sheet
  swaps to the detail or a "{n} wines here" chooser OVER the kept, inert
  map. Failure: a lost WebGL context or react-maplibre's constructor error
  (`onError` with `target` null) → back to List with "The map stopped
  working"; a chunk error (`MapErrorBoundary`'s new optional `fallback`, or
  a rejected warm-up) → "The map needs a page reload". `hover-cursor.ts`
  gained optional `isClickable`/`box`/`onHover` (the explorer passes none).
  **Kill switch:** `NEXT_PUBLIC_TRAINING_MAP=0` at BUILD time removes the
  tablist and the room is exactly R1 — an env change plus a redeploy, no
  code revert. Rollback: the app revert or the kill switch; the two columns
  stay (nullable, harmless); `scripts/training-room-map/rollback-r2.sql`
  only if the feature is abandoned. `check-display-points.mjs` is the
  pre-deploy PostgREST check. The R2 copy is provisional until the owner
  approves spec §9's R2 rows. The room's pre-map JS grew by about 6 KB gzip
  in the planning build, against spec §12's 3 KB: whether that stands is the
  owner's call before the deploy (the R2 plan's "Main session afterwards",
  step 3).
```

(The main session rewrites that last sentence with the owner's answer and the re-measured number.)

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Public/repos/blindtastingapp-friends && git add CLAUDE.md && GIT_AUTHOR_NAME=christianolin GIT_AUTHOR_EMAIL=christianolin@users.noreply.github.com GIT_COMMITTER_NAME=christianolin GIT_COMMITTER_EMAIL=christianolin@users.noreply.github.com git commit -F - <<'EOF'
docs: the training room's likelihood map (R2) in CLAUDE.md

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: The whole branch**

Run: `cd C:/Users/Public/repos/blindtastingapp-friends && npx tsc --noEmit && npx vitest run && npx eslint src/lib/training src/app/taste/training src/lib/wine-map/map-palette.ts src/lib/wine-map/map-palette.test.ts src/lib/wine-map/basemap.ts src/lib/wine-map/basemap.test.ts src/lib/wine-map/hover-cursor.ts src/lib/wine-map/hover-cursor.test.ts src/app/knowledge/map/map-error-boundary.tsx src/app/knowledge/map/map-error-boundary.test.ts src/lib/supabase/database.types.ts scripts/training-room-map scripts/training-room.test.mjs && node --check scripts/training-room.test.mjs`
Expected: `tsc` silent; vitest **263 files, 4669 tests** passed; eslint silent; `node --check` silent. Then `npm run build` succeeds (the main session's check; it needs no database).

---

## Acceptance checks (spec §10, R2) → where they are met

| Check | Met by | Verified by |
|---|---|---|
| R2-1 no MapLibre JS, basemap style, `basemap.ts`/`map-palette.ts` or tiles before Map is opened or hovered; JS within budget | Tasks 7–9 (loader, slot, warm-up by `import()`) | source tests (Task 9); the planning build: none of them in the page's chunks. **Budget: measured +5.9 KB gzip vs 3 KB — owner decision, main session step 3** |
| R2-2 a dot for all 102 (84 place, 1 via an ancestor, 18 curated); the unmapped line hidden | Tasks 1, 2, 6, 8 | pool/pool-shape tests, `trainingFeatures` test, legend test; live (step 8) |
| R2-3 claret note: the three best positions labelled with the list's names and %; aromatic white: Alsace "… % +2"; capped are rings | Tasks 6, 8 | `labelledPositions`/`trainingFeatures`/expression tests; live with `__trainingMap` (dev build) |
| R2-4 only colour answered: the camera fits ≤ 12 near the leader | Task 6 (`fitSet`, `cameraTarget`), Task 8 | `fitSet` tests; live |
| R2-5 hover shows name and %; z7+ more labels | Tasks 4, 6, 8 | hover-cursor tests, `hoverLabel` test, `labelLayout` test; live |
| R2-6 a slider drag repaints within a frame, no long task > 50 ms from the map | Task 6 (fingerprint), Task 8 (one rAF) | live: `PerformanceObserver('longtask')` and the `training-map:data` measure (dev build) |
| R2-7 the camera follows until a drag; "Fit to the closest" appears and works; reduced motion instant | Tasks 6, 8 | `shouldAutoFit` test; live |
| R2-8 Alsace tap → chooser of three in ranking order; one dot → detail; phone Back keeps the camera; a long detail scrolls in the sheet | Tasks 6, 9 | `chooserOrder` test, target-rule tests; live |
| R2-9 a theme flip repaints without a remount, one WebGL context; also right after a warm-up | Tasks 4, 8 | basemap swap test, frozen-mapStyle source test; live |
| R2-10 context loss → List with the line; "Try the map again" remounts; no WebGL → same fallback | Tasks 7, 8, 9 | reducer tests, panel "stopped" markup test; live: `canvas.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`; WebGL disabled in Chrome settings |
| R2-11 a failed chunk → "needs a page reload" + Reload; Continue restores the note after it | Tasks 4, 7, 8 | boundary fallback tests, reducer `chunkFailed` test, fallback markup test; live: block the chunk in DevTools |
| R2-12 keyboard: tablist arrows, "Closest" buttons, Enter opens, Escape returns focus; a dot's popover returns focus to the map container | Tasks 7, 8, 9 | `nextTab` and tablist markup tests; live |
| R2-13 phone: panning never scrolls the sheet/page, pinch works; ✕/Escape/backdrop close; iOS toolbar | Task 9 (non-scrolling map body, full 88dvh), Task 8 (rotation off) | live, Browser pane phone preset and the owner's iPhone |
| R2-14 at 1675×865 and 1280×720 the aside does not scroll on Map; legend visible | Task 7 (`MAP_BOX.column`), Task 9 | live: `aside.scrollHeight <= aside.clientHeight` |
| R2-15 768×1024 sheet full width; 1024×768 touch: popover on tap; 812×375 upright note | Tasks 7, 9 | live |
| R2-16 `NEXT_PUBLIC_TRAINING_MAP=0` → no tablist, R1's room | Tasks 7, 9 | `trainingMapEnabled` test, "kill switch on" markup test; live: a local build with the variable |
| R2-17 nothing outside `src/app/taste/training/` (and map-view's test) imports `training-map`/`map-view` | Task 9 | the RM1 source tests |

## Main session afterwards

Every live step needs the owner's go-ahead, as every earlier live migration had.

1. **Copy (O6).** Send the owner the §9 R2 rows ("Provisional copy" below) AND the R1 change they will see: group links now read "Rhône Valley on the wine map", "Andalusia on the wine map" (English names, as the explorer shows by default). Apply any change to `copy.ts` + `copy.test.ts` first.
2. **Merge order with the collaborator (spec §13).** `map-palette.ts`: the USA wave's state colours merge first and this `heat` block is appended after them by hand (the palette tests catch a bad merge — note `map-palette.test.ts` pins 64 region keys, which their wave will change). `basemap.ts` (`isWineSourceId`) and `hover-cursor.ts` changes are additive. If R2 lands first, the USA branch rebases onto it.
3. **The JS budget (spec §12, §4.5 revert trigger).** Build this branch for real (`npm run build`, the default bundler) and re-measure the `/taste/training` page's client JS against master's: sum the gzip size of every `static/chunks/*.js` named in `.next/server/app/taste/training/page_client-reference-manifest.js` in both builds. The planning build (webpack) measured **+5.9 KB gzip** (the budget is 3 KB); what it is made of is under "Verified before writing". Ask the owner to accept the measured number (and write it into the CLAUDE.md bullet and the revert trigger) or to trim first — the cheapest trims are moving the R1 English-name fix server-side (≈0.6 KB; `placeLinks` would call `englishName`) and a room-local error boundary instead of the explorer's (≈0.7 KB); the rest is the chooser/popover/sheet logic RM18–RM20 require.
4. **Timestamp.** Re-read live `supabase_migrations.schema_migrations` (latest was `20260929141000`) and agree a range with the collaborator; `git mv` the migration if `20260929150000` is taken. The rollback file removes its history row by name.
5. **Apply R2's migration.** Dry run first (the applier needs `scripts/migration-preflight.mjs` from `usa-map`, or use a `begin … rollback` runner): expect 18 display points (15 if the USA wave placed its three; then a `NOTICE … already has a map place; skipped` per skipped one), 0 on a placed archetype. Then the DB suite with `TRAINING_ROOM_APPLY=supabase/migrations/<v>_training_room_display_points.sql` — the "R2:" test passes and nothing else changes. Apply for real; run the suite again without `TRAINING_ROOM_APPLY` (the R2 test now runs for real). Then `node --env-file=.env.local scripts/training-room-map/check-display-points.mjs` → `OK: PostgREST serves the curated display points…` (if a schema-cache error: `notify pgrst, 'reload schema'`, re-run, before any deploy).
6. **Owner's iPhone before the merge (spec §12).** Deploy the branch as a Vercel preview; the owner checks Chrome and Safari on the iPhone: open Map in the sheet (cold ≤ 4 s, warm ≤ 1.5 s to the first dots), pan and pinch, tap a dot and Back, rotate to landscape (the upright note), and five open/close cycles with Safari Web Inspector's Memory timeline (back within 10 MB). If preview sign-in fails (Supabase's redirect allow-list), run this on production right after the deploy with `NEXT_PUBLIC_TRAINING_MAP=0` + redeploy as the instant off.
7. **Deploy.** Per the standing deploy mechanics (worktree off master, staged push = production deploy, live smoke, revert). Revert triggers (spec §4.5): the training page errors or logs `training pool: display points` or `training pool: map places` on a normal load; opening Map on a laptop or the Browser pane's phone preset fails, falls back, or leaves a second WebGL context after close; the pre-map JS grows by more than the number the owner accepted in step 3. The instant off without a revert: `NEXT_PUBLIC_TRAINING_MAP=0` in Vercel's env and a redeploy.
8. **Live checks** (desktop ~1675×865 and 1280×720; Browser pane `mobile` 375×812, 768×1024, 812×375, 1024×768 with touch; light and dark; signed in with the magic-link recipe, never a typed password; the Browser pane fronted). R2-1 in the Network panel (nothing from Carto/`maplibre` until the Map tab is hovered or opened). R2-2: count dots (`__trainingMap.querySourceFeatures("wine-training").length` in a dev build → 102, de-duplicated by id). R2-3 with a claret-like note and an aromatic white; R2-4 colour only; R2-5; R2-6 with `PerformanceObserver('longtask')` during a 5 s slider drag; R2-7 drag, "Fit to the closest", then `prefers-reduced-motion` emulation; R2-8 Alsace (3 wines), a single dot, phone Back; R2-9 flip the theme with Map open and right after a hover warm-up; R2-10 `WEBGL_lose_context` and WebGL disabled; R2-11 block the chunk in DevTools, then Reload and Continue; R2-12 keyboard only; R2-13 phone gestures and ✕/Escape/backdrop; R2-14 `aside.scrollHeight <= aside.clientHeight` on Map at both desktop sizes; R2-15 the three odd sizes; R2-16 a local build with `NEXT_PUBLIC_TRAINING_MAP=0`. The console shows no new errors (no base-ui `nativeButton` warnings, no "Style is not done loading").
9. **Tune the ramp (spec §12).** On three real notes (a claret-like red, a Sauvignon-like white, "only colour answered"), if the top band reads as a flat wash, move `HEAT_STOPS` in `map-view.ts` (and its constants test); `heatOf` and the palette do not change.
10. **Rollback, if needed.** App: revert, or the kill switch. Data: nothing to do (the columns are harmless); only if the feature is abandoned, `node --env-file=.env.local scripts/training-room-map/run-sql.mjs scripts/training-room-map/rollback-r2.sql --dry`, then without `--dry`, after the app revert.
11. **The USA wave (spec §13).** Tell the collaborator: when their migration places Napa, Sonoma and Willamette, it should null those three rows' `display_lon`/`display_lat` (recommended; the room already ignores a curated point once a place point exists), and R2's migration then sets 15, not 18 — its assert follows the count it actually set.

## Provisional copy (spec §9, R2 rows — owner approval before the R2 deploy)

| Key | Text |
|---|---|
| `listTab` / `mapTab` | List / Map |
| `viewsLabel` | What it could be, as a list or a map |
| `mapLabel` | Map of the typical wines, coloured by how close each is to your note |
| `mapSrNote` | The list shows the same wines and numbers. |
| `closestOnMap` | Closest on the map |
| `stackMore(n)` | +{n} |
| `legendLess` / `legendClosest` | Less close / Closest |
| `legendRuledOut` | Ruled out |
| `legendRelative` | Colours compare the wines with each other; the % is each wine's own closeness. |
| `legendApprox` | Wines outside the mapped countries sit at an approximate spot. |
| `unmappedLine(n)` | {n} not on the wine map yet |
| `chooserTitle(n)` | {n} wines here |
| `fitClosest` | Fit to the closest |
| `mapStopped` | The map stopped working — the list has every wine. |
| `mapRetry` | Try the map again |
| `mapNeedsReload` | The map needs a page reload to load. |
| `mapReload` | Reload the page |
| `mapUpright` | Turn your phone upright to see the map. |
| `showList` | Show the list |
| (R1, changed) `regionOnMap(englishName(name))` | "{English name} on the wine map" — e.g. "Rhône Valley on the wine map", "Andalusia on the wine map" |

Reused, not new: `TRAINING_COPY.back` ("Back") on the laptop chooser's Back button, `beforeAnswers` ("Start describing the wine") in the legend.
