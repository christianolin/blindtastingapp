# Active tasting banner — design

Date 2026-09-19. Base `master` at `dfe7a2b` (worktree `blindtastingapp-banner`, branch `banner`). No handoff; the owner's words are quoted in §1 and the decisions announced to the owner are in §2 (D1–D8). The defaults this note adds are D9–D16. No migration, no new table, no RPC, no Anthropic API call.

## 1. Goal

Owner, verbatim: "i think when you have joined a tasting that is active, either not starter or started, you should have a banner at the top of all pages to return to the tasting. So right now you there is a button to explore the map while you wait right - we kinda need the button to go back without navigation there through overview or taste. In the overview page we kinda have it already, but its not a banner - i think a banner would be better."

So: a strip directly under the top bar on every page, naming the one tasting you are in right now, with a real button back to it. The guest lobby's "While you wait" tiles (`guest-lobby.tsx`, `invitation-copy.ts`) stay as they are. The banner is how you get back from the map. The owner dislikes duplicate entry points and action buttons styled as links. So Overview drops its own banner when it would name the same tasting, and both banner actions are `Button`s.

## 2. Decisions

Announced to the owner:

- **D1 Eligible rows.** Only tastings where the viewer's own `tasting_participants` row is `JOINED` (the host's row is always `JOINED`). Never `INVITED` or `DECLINED`. Never a `CLOSED` tasting. Never a legacy `OPEN`-status tasting. Being the host does not count on its own; only the row's status does.
- **D2 Windows.**
  - `IN_PROGRESS` + `LIVE`: shown while `IN_PROGRESS`, however long ago it started (owner decision 2026-09-24: a forgotten tasting is the host's to end, and guests must always find their way back). **Reversed 2026-09-25** (owner: "make the banner not appear when tasting is paused"): a paused LIVE tasting (`paused_at` set) is not eligible at all — the strip hides for every viewer while the host has it paused and returns with the first poll or render after Resume. It had read "paused shows too" since 2026-09-24. No time limit any more — it used to hide once `now − anchor > 24 h`, where `anchor = started_at ?? scheduled_at ?? created_at` (the fallback for legacy rows with a null `started_at`).
  - `IN_PROGRESS` + `ASYNC`: always shown.
  - `DRAFT` with `scheduled_at` set: shown while `now − 12 h ≤ scheduled_at ≤ now + 6 h`.
  - `DRAFT` with no `scheduled_at`: shown while `now − created_at ≤ 12 h`.
  - Every bound is inclusive. An unparseable timestamp makes the row ineligible.
- **D3 Priority.** LIVE running, then ASYNC running, then DRAFT by the nearest scheduled time (LIVE paused sat second until 2026-09-25; a paused tasting is no longer eligible, see D2). Show the first one. If more qualify, add a small real button, "+N more", that goes to `/taste`.
- **D4 Copy.** A status word: "Live now" with the existing `LiveDot` (its ping is already dropped under reduced motion), "In progress" (ASYNC) or "Waiting to start" (DRAFT). Then the tasting name. Then a real `Button`: "Back to the tasting" once started, "Back to the lobby" while DRAFT.
- **D5 Href.** `/tastings/<id>`. The one exception is the host of an `IN_PROGRESS` tasting where `startLandsOnConsole` (`src/lib/tasting-lifecycle-copy.ts`) is true, who goes to `/tastings/<id>/host`. That page already redirects a DRAFT or non-LIVE tasting back to the lobby.
- **D6 Placement.** The banner sits directly under the top bar, in the main column, full width of the content area, on every page that renders `AppHeader`. It is hidden on the shown tasting's own pages (`/tastings/<id>` and everything under it), using `usePathname` in a client component. It still shows on other tastings' pages. It never shows on `/login`, `/signup`, `/auth/*` or `/invite/*`. None of those render `AppHeader`, and the pure path rule refuses them anyway.
- **D7 Live updates.** A `"use server"` action is re-checked every 20 s while the tab is visible, and again on window `focus`. This is the `NotificationsBell` / `getPendingInvites` pattern. It turns "Waiting to start" into "Live now" when the host presses Start, and the banner disappears when the tasting ends.
- **D8 Overview de-dup.** If the header banner shows tasting X, Overview does not render its own live or next-up banner for X. Overview still shows its next-up card for any other tasting, and its "No tasting on the calendar" row. The phone quick-actions rule stays as it is: the Taste-blind tile is gold unless that "No tasting" row is showing.

Defaults chosen here:

- **D9 The banner scrolls with the page; it is not sticky.** The top bar stays the only sticky strip. A second sticky strip would take about 60 px of phone height on every page for up to a day. The banner is in normal flow with no z-index, so fixed overlays cover it: drawers, sheets, the map's expanded full-screen view and the map's phone details sheet. Making it sticky later means moving it inside a sticky wrapper with the `<header>`.
- **D10 Tie-breaks inside a priority group.**
  - live: newest `anchor` first (the paused group went with the paused state, 2026-09-25).
  - in-progress: newest `started_at ?? created_at` first.
  - waiting: drafts with a schedule come first, ordered by smallest `|scheduled_at − now|`, then the earlier schedule. Unscheduled drafts follow, newest `created_at` first.
  - Last resort: `id` ascending, so the order is deterministic.
- **D11 On the first item's own pages the whole banner is hidden,** "+N more" included. A second tasting's strip on top of a running tasting would be a distraction. "+N more" counts the other qualifying tastings, minus the one whose page you are on.
- **D12 Polling pauses on the first item's own pages.** On those pages the banner is hidden and `AutoRefresh`/`RevealSync` re-render the layout's `AppHeader` anyway. When the path leaves them, the client checks once at once, then resumes the 20 s cadence. It also re-checks on `visibilitychange` to visible, because a phone returning to the tab does not always fire `focus`.
- **D13 A failed read never blanks the banner.** The server read returns `null` on a query error. `AppHeader` then renders an empty snapshot stamped at the epoch, so any later poll replaces it. The client keeps its current state when a poll returns `null` or throws, as the bell does. Signed out returns an empty snapshot stamped now, a real "nothing", and the banner goes.
- **D14 Snapshots are ordered by `checkedAt`, a server clock ISO string.** The client shows whichever is newer: the server-rendered `initial` prop (a `router.refresh()` or a navigation re-renders it) or its own last poll. There is no props-to-state effect and no client clock.
- **D15 No dismiss, no dates.** The D2 windows are the only expiry (LIVE has none any more — it only ends when the host ends it), so there is no storage and no dismiss control. The banner shows no time, so `LocalDateTime` is not needed.
- **D16 Pages without the top bar get no banner:** `/about` (its own "Back to Overview" strip), `/knowledge/archetypes/[id]` (a "← Map" back link) and `/j/[code]` (a member is redirected into the tasting there anyway). Giving the archetype page `AppHeader` is a separate one-line change if the owner wants it (§10).

## 3. Selection rules — `src/lib/active-tasting/select.ts` (pure)

Relative imports only, because vitest has no `@/` alias. It imports types from `../supabase/database.types` and `startLandsOnConsole` from `../tasting-lifecycle-copy`, which has only type imports.

```ts
export type ActiveTastingCandidate = {
  id: string; name: string; hostId: string;
  status: TastingStatus; timingMode: TimingMode; revealMode: RevealMode; wineSource: WineSourceMode;
  startedAt: string | null; pausedAt: string | null; scheduledAt: string | null; createdAt: string;
  myStatus: ParticipantStatus;
};
export type ActiveTastingState = "live" | "in-progress" | "waiting"; // "paused" removed 2026-09-25
export type ActiveTastingItem = { tastingId: string; name: string; state: ActiveTastingState; href: string };
export type ActiveTastingSnapshot = { items: ActiveTastingItem[]; checkedAt: string };
export type BannerView = { item: ActiveTastingItem; more: number };

export const DRAFT_AHEAD_MS = 6 * 3_600_000;
export const DRAFT_BEHIND_MS = 12 * 3_600_000;
export const EMPTY_SNAPSHOT: ActiveTastingSnapshot = { items: [], checkedAt: "1970-01-01T00:00:00.000Z" };

export function activeState(c: ActiveTastingCandidate, now: Date): ActiveTastingState | null; // D1, D2; null = ineligible
export function activeHref(c: ActiveTastingCandidate, viewerId: string): string;             // D5
export function selectActiveTastings(rows: ActiveTastingCandidate[], viewerId: string, now: Date): ActiveTastingItem[]; // eligible, D3 + D10 order
export function isOnTastingPath(pathname: string, tastingId: string): boolean;               // "/tastings/<id>" or "/tastings/<id>/…"
export function isBannerFreePath(pathname: string): boolean;                                  // /login, /signup, /auth/…, /invite/… (segment boundary)
export function bannerView(items: ActiveTastingItem[], pathname: string): BannerView | null;  // D6, D11
export function shouldPoll(items: ActiveTastingItem[], pathname: string): boolean;            // D12
export function newerSnapshot(server: ActiveTastingSnapshot, polled: ActiveTastingSnapshot | null): ActiveTastingSnapshot; // D14
export function candidateFromRow(row: unknown): ActiveTastingCandidate | null;                // the query row → candidate (§5)
export function overviewSlot(overviewTastingId: string | null, items: ActiveTastingItem[]): "banner" | "registrar-only" | "start-row"; // D8, §7
```

`state`: `IN_PROGRESS` + `LIVE` gives `"live"`, or null (not eligible) when `pausedAt` is set — owner decision 2026-09-25; it gave `"paused"` before. `IN_PROGRESS` + `ASYNC` gives `"in-progress"` and ignores `pausedAt`, since pause is LIVE-only. `DRAFT` gives `"waiting"`.

## 4. Tests to write first

These are vitest files in node, with no DOM. Use a fixed `NOW = new Date("2026-09-19T18:00:00.000Z")`, an `h(n)` helper that returns the ISO string for `NOW + n hours`, and a `row(overrides)` builder. The builder's default is JOINED, IN_PROGRESS, LIVE, BLIND, HOST_PROVIDES, host `"host"`, viewer `"me"`, started one hour ago.

`src/lib/active-tasting/select.test.ts`

- **`activeState` windows**
  1. LIVE started 1 h ago → `"live"`. With `pausedAt` set → `null` (2026-09-25; was `"paused"`).
  2. LIVE shows however long ago it started (owner decision 2026-09-24, no
     time limit) — 24 h ago, 24 h 1 min ago, and 30 days ago all → `"live"`;
     paused 5 days in → `null` (hides however long ago it started).
  3. LIVE with null `startedAt`:
     - `scheduledAt` 2 h ago → live; 25 h ago → live.
     - Both null, `createdAt` 3 h ago → live; 30 h ago → live.
     - `scheduledAt` 3 h ahead (legacy early start) → live.
  4. `startedAt` wins over the fallbacks:
     - Started 1 h ago, scheduled 3 days ago → live.
     - Started 30 h ago, scheduled 1 h ago → live.
  5. ASYNC started 30 days ago → `"in-progress"`. ASYNC with `pausedAt` set → `"in-progress"`.
  6. DRAFT scheduled 5 h ahead → `"waiting"`. Exactly 6 h ahead → waiting. 6 h 1 min ahead → `null`.
  7. DRAFT scheduled 11 h ago → waiting. Exactly 12 h ago → waiting. 12 h 1 min ago → `null`.
  8. DRAFT with no schedule:
     - Created 2 h ago → waiting.
     - Created 12 h 1 min ago → `null`.
     - Scheduled 3 days ahead but created 1 h ago → `null` (the schedule decides).
  9. Never shown:
     - A CLOSED tasting started 1 h ago.
     - A legacy `OPEN`-status tasting started 1 h ago.
     - `myStatus` INVITED, even for a live one.
     - `myStatus` DECLINED.
     - The host whose own row is INVITED.
  10. Unparseable `startedAt` or `scheduledAt` → `null`.
- **Order (`selectActiveTastings`)**
  11. Input in reverse order still returns live, in-progress, waiting; a paused LIVE row in the input is dropped.
  11b. A paused LIVE tasting neither shows nor counts toward "+N more"; paused alone gives `[]`, a null `bannerView`, and the idle poll cadence.
  12. Two live tastings: newer anchor first. Two in-progress tastings: newer `startedAt ?? createdAt` first.
  13. Drafts:
      - Scheduled 1 h ago beats scheduled 3 h ahead.
      - Equal distance (−2 h vs +2 h): the earlier one first.
      - Scheduled drafts come before unscheduled ones.
      - Unscheduled drafts: newest created first.
  14. A full tie is broken by `id` ascending.
  15. Ineligible rows are dropped, and `[]` gives `[]`.
- **Href (`activeHref`)**
  16. Host of an IN_PROGRESS, LIVE, HOST_PROVIDES, BLIND tasting → `/tastings/t1/host`. The same holds for SEMI_BLIND, and `activeHref` alone (which never reads `pausedAt`) still answers the same for a paused row even though `activeState` now drops it.
  17. The same host while the tasting is DRAFT → `/tastings/t1`.
  18. Host of PARTICIPANT_CONTRIBUTED, host of ASYNC, host of reveal-mode OPEN → `/tastings/t1`.
  19. A guest of a console tasting → `/tastings/t1`.
- **Path and view (`isOnTastingPath`, `isBannerFreePath`, `bannerView`, `shouldPoll`)**
  20. Hidden for t1 (`bannerView` gives `null`): `/tastings/t1`, `/tastings/t1/`, `/tastings/t1/host`, `/tastings/t1/play`, `/tastings/t1/results/2`.
  21. Shown with t1: `/tastings/t10`, `/tastings/t2`, `/tastings/new`, `/u/u1/tastings/t1`, `/overview`, `/knowledge/map`.
  22. `null` on `/login`, `/signup`, `/auth/confirm-hash`, `/invite/ABC` and `/invite/ABC/accept`. `/authority` is shown (segment boundary).
  23. No items → `null`.
  24. `+N`, with items [t1, t2, t3]:
      - `/overview` → t1, `more: 2`.
      - `/tastings/t2` → t1, `more: 1`.
      - `/tastings/t1` → `null`.
  25. `shouldPoll`:
      - `false` on `/tastings/t1/**` when t1 is first, and on banner-free paths.
      - `true` with no items (a new tasting must still appear).
      - `true` on `/tastings/t2` and `/overview`.
- **Snapshots (`newerSnapshot`)**
  26. `polled` null → server. Polled newer → polled. Polled older → server (a re-render wins). Equal → server. A poll beats `EMPTY_SNAPSHOT`.
- **Row mapping (`candidateFromRow`)**
  27. An object embed → candidate. A one-element array embed → candidate. A null embed → `null`. A missing `id`, `name` or `created_at` → `null`.
- **Overview slot (`overviewSlot`)**
  28. The first item's id → `"registrar-only"`. Another id → `"banner"`. The second item's id → `"banner"` (the header shows the first). No items → `"banner"`. `null` (the Overview kind is `"none"`) → `"start-row"`, with or without items. A live or next banner never maps to `"start-row"`.

`src/lib/active-tasting/copy.test.ts`: every state gives its exact status, CTA, dot and tone from §8. `moreLabel(1) === "+1 more"`. `moreAriaLabel(1) === "+1 more tasting in Taste"`. `moreAriaLabel(3) === "+3 more tastings in Taste"`.

## 5. Server read and polling action

`src/lib/active-tasting/read.ts` starts with `import "server-only"` and is wrapped in React `cache()`. `AppHeader` and the Overview page share one read per request.

```ts
export const readActiveTastings = cache(async (userId: string): Promise<ActiveTastingSnapshot | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasting_participants")
    .select("status, tastings!inner(id, name, host_id, status, timing_mode, reveal_mode, wine_source, started_at, paused_at, scheduled_at, created_at)")
    .eq("user_id", userId)
    .eq("status", "JOINED")
    .in("tastings.status", ["DRAFT", "IN_PROGRESS"]);
  if (error) return null;
  const now = new Date();
  const candidates = ((data ?? []) as unknown[]).flatMap((r) => candidateFromRow(r) ?? []);
  return { items: selectActiveTastings(candidates, userId, now), checkedAt: now.toISOString() };
});
```

- **One round trip, RLS as the viewer.** The viewer reads their own participant row, and `!inner` drops any tasting that RLS hides.
- **The embed is unambiguous.** `tasting_participants.tasting_id` is the only FK to `tastings`, and `wines` is not a junction because its PK is `id`. No hint is needed. If PGRST201 ever appears, use `tastings!tasting_participants_tasting_id_fkey`.
- **The embed is not typed.** Every table carries `Relationships: []`, so postgrest-js does not infer it. The rows go through `candidateFromRow(unknown)`. If tsc rejects the literal select string, build it from a non-literal constant, as `notes-data.ts` does.
- **No fan-out and no limit.** The result is only the viewer's own JOINED rows in non-closed tastings, far below PostgREST's page cap. The pure rules re-check every filter.
- **Rule 1.** No column from `wines`, `wine_answers`, `guesses` or `current_wine_id` is selected. The client receives only `{ tastingId, name, state, href }`. Everything the banner shows is a tasting-level fact a JOINED member can already read: its name, its status and `paused_at`, which the play page already reads.

`src/lib/active-tasting/actions.ts` is a `"use server"` file. It exports only this async function and re-exports no types. It imports the snapshot type with `import type` from `./select`.

```ts
export async function pollActiveTastings(): Promise<ActiveTastingSnapshot | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { items: [], checkedAt: new Date().toISOString() };
  return readActiveTastings(user.id);
}
```

It takes no arguments. The user always comes from the session, never from the client.

## 6. Component tree and mount

`AppHeader` (`src/components/app-header.tsx`, server) keeps its bar unchanged and adds one read:

- `const [invites, active] = await Promise.all([getPendingInvites(), readActiveTastings(userId)])`, so it costs no extra latency.
- It returns `<><header …/>{<ActiveTastingBanner initial={active ?? EMPTY_SNAPSHOT} />}</>`.
- Every caller already places `AppHeader` as the first child of a `flex flex-col` column: the overview, taste, notes, community, profile, `u/*`, knowledge designations and map pages, and the tastings, cellar, catalog and admin layouts. So the banner lands directly under the bar at full content width, with no caller edits.
- `AppShell` is the wrong mount point: it wraps children above the bar, which the pages render themselves.
- Logged out, `AppHeader` still returns `null`, so there is no banner.

`ActiveTastingBanner` (`src/components/active-tasting-banner.tsx`, `"use client"`):

```
section[aria-label="Your tasting"]  tone classes · px-4 py-2 sm:px-6 · flex flex-wrap items-center gap-x-3 gap-y-2
├─ div  min-w-0 flex-1 basis-40 · flex flex-col gap-0.5
│   ├─ p[aria-live="polite"]  flex items-center gap-2 — LiveDot | StillDot | nothing, then Eyebrow(status)
│   └─ p  truncate font-heading text-[17px] md:text-lg font-semibold leading-tight — the tasting name
└─ div  ml-auto flex items-center gap-2
    ├─ (more > 0) Button nativeButton={false} render={<Link href="/taste" />} aria-label={moreAriaLabel(n)} — "+N more"
    └─ Button nativeButton={false} render={<Link href={item.href} />} — cta
```

**State.**

- `pathname = usePathname()`.
- `const [polled, setPolled] = useState<ActiveTastingSnapshot | null>(null)`.
- `snapshot = newerSnapshot(initial, polled)`, `view = bannerView(snapshot.items, pathname)`, `polling = shouldPoll(snapshot.items, pathname)`.
- Render `null` when `view` is null.

**Polling effect**, keyed on `polling`:

- While polling, set a 20 s `setInterval` plus `focus` and `visibilitychange` listeners.
- Each tick returns early when the document is hidden or a call is already in flight.
- `pollActiveTastings().then(s => s && setPolled(s))`. Swallow errors (D13).
- When polling resumes after a pause, check once at once (D12). There is no check on first mount, because the server snapshot is fresh.

**Tones.** Theme tokens only, and correct in both themes.

- **running** (live, in-progress; paused was in this group until 2026-09-25):
  - Strip: `bg-primary text-primary-foreground border-b border-primary`. It stays bordeaux in dark, since `.dark` keeps `--primary`.
  - Eyebrow: `text-gold-light`.
  - CTA: gold, `bg-gold text-foreground hover:bg-gold-deep font-semibold`. The existing `:where(.dark) .bg-gold.text-foreground` rule gives it `--on-accent` ink in dark.
  - "+N more": the `ghost` variant with its own `border border-primary-foreground/35 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground` and the matching `dark:hover:` classes. The variants carry `dark:` overrides that a plain class does not replace.
- **waiting**:
  - Strip: `bg-card text-foreground border-b border-border`.
  - Eyebrow: `text-muted-foreground`.
  - CTA: the `default` (bordeaux) variant with `hover:bg-primary-hover`.
  - "+N more": the `outline` variant.

**Sizes.**

- Both buttons: `max-md:min-h-11 md:h-9 px-3.5 text-[13px] font-semibold`.
- The 16 px gutter matches the bar's `px-4`.
- Width budget at 375 px (343 px content), without "+N more": text block ≈ 181 px beside a ≈150 px CTA, one row, about 60 px tall.
- With "+N more", the action group wraps onto its own right-aligned row, because of `basis-40` and `flex-wrap`. The name never squeezes below 10 rem, and there is no horizontal scroll at 375 px (sanity-check 320 px).
- Dots are `aria-hidden`. `LiveDot`'s ping is dropped under `prefers-reduced-motion` by the existing rule.

**StillDot.** Move the local `StillDot` out of `src/app/overview/banner.tsx` into `src/components/overview/live-dot.tsx` as a named export, so both banners share one static dot.

## 7. Overview de-dup and quick actions

`src/app/overview/page.tsx` adds `readActiveTastings(user.id)` to its existing `Promise.all`. This is a `cache()` hit with `AppHeader`'s read in the same request, so both see the same snapshot. On `/overview` the header always shows `items[0]`: `bannerView` never hides on that path. The page then computes:

- `slot = overviewSlot(data.banner.kind === "none" ? null : data.banner.tastingId, active?.items ?? [])`
- a null read gives `[]`, which gives `"banner"`, today's behaviour.

`OverviewBanner` (`banner.tsx`) takes `viewHidden?: boolean`, set to `slot === "registrar-only"`. When it is true, it renders only the `FlightHintRegistrar`, and only if `canAddWine` holds. So the header camera still offers "Tonight's flight" (D12 of add-wine v2). It renders no `LiveBannerView` or `NextUpBannerView`. The fragment renders no box, so the `<main>` flex gap does not leave a hole.

`"start-row"` is exactly today's `kind === "none"` path, unchanged.

2026-09-25: with a paused LIVE tasting no longer in `items` (D2), D8's de-dup would have let Overview's own banner show that tasting as "Live now" with the pulsing dot. `pickLiveTasting` (`src/lib/overview-math.ts`) therefore skips a LIVE row with `paused_at` set too (`getOverviewData` now selects `paused_at`), and /overview falls through to next-up or the "No tasting on the calendar" row while a host has the tasting paused.

`QuickActions` is unchanged. The page keeps passing `bannerKind={data.banner.kind}`. A hidden live or next banner keeps its kind, so it never becomes `"none"`. The Taste-blind tile therefore stays gold, and it goes non-gold only when the "No tasting on the calendar" row shows, as today. Test 28 pins that a live or next banner never maps to `"start-row"`.

Consequences, accepted:

- **Losing "Add a wine" for X.** For a hidden next-up X, Overview's "Add a wine" shortcut for X goes with the card. The lobby behind "Back to the lobby" and the header camera's flight row still add a wine.
- **The Overview is a snapshot page.** It has no `AutoRefresh`, so de-dup is decided at render. A later poll can change the header banner, and the slot keeps its render-time state until the next visit. At worst that is a brief duplicate or an empty slot, never a wrong tasting.

## 8. Copy — `src/lib/active-tasting/copy.ts` (pure)

| state | status | dot | tone | CTA |
|---|---|---|---|---|
| `live` | Live now | ping (`LiveDot`) | running | Back to the tasting |
| `in-progress` | In progress | still | running | Back to the tasting |
| `waiting` | Waiting to start | none | waiting | Back to the lobby |

- Section label: `BANNER_LABEL = "Your tasting"`.
- `moreLabel(n) = "+" + n + " more"`, and `MORE_HREF = "/taste"` (its All tab).
- `moreAriaLabel(n)` is "+1 more tasting in Taste" or "+N more tastings in Taste". It contains the visible text, for WCAG 2.5.3.
- English only, like the rest of the shell. `/taste`'s `makeT` dictionary is not involved.
- The status is shown in the `Eyebrow` style (mono, uppercase via CSS). The strings above are sentence case.

## 9. File plan

New:

- `src/lib/active-tasting/select.ts`: the types and pure rules from §3.
- `src/lib/active-tasting/select.test.ts`: tests 1–28 (plus 11b, 2026-09-25), written first.
- `src/lib/active-tasting/copy.ts` and `copy.test.ts`: §8.
- `src/lib/active-tasting/read.ts`: `server-only`, `cache()`, the §5 query.
- `src/lib/active-tasting/actions.ts`: `"use server"`, `pollActiveTastings` only.
- `src/components/active-tasting-banner.tsx`: the §6 client component.

Edited:

- `src/components/app-header.tsx`: the parallel read, the fragment and the banner, and a docblock line.
- `src/components/overview/live-dot.tsx`: `StillDot` export.
- `src/app/overview/banner.tsx`: import `StillDot`, add `viewHidden`.
- `src/app/overview/page.tsx`: the cached read and `overviewSlot`.
- `CLAUDE.md`: one bullet.
  - It says what the active-tasting banner is.
  - It gives the D1/D2 windows and the D3 priority.
  - It says the banner is mounted in `AppHeader` and hidden on the shown tasting's own pages.
  - It says the 20 s poll is `pollActiveTastings`.
  - It says the Overview banner for the same tasting is suppressed via `overviewSlot` while its flight hint stays.

Untouched: `QuickActions`, `overview-data.ts`, `overview-math.ts`, `notifications.ts`/`NotificationsBell`, `database.types.ts`, every migration.

Verification:

- Wait for `node_modules/.bin/tsc` and the `npm ci exit 0` log line.
- Then run `npx vitest run src/lib/active-tasting`, the full `npx vitest run`, `npx tsc --noEmit`, `npx eslint` on the changed files, and `npx next build`.
- Browser pane checks, in light and dark, at 375 px and desktop:
  - The banner sits under the bar on `/overview`, `/knowledge/map` and `/tastings/new`.
  - It is absent on `/tastings/<id>`, `/…/host` and `/…/play`.
  - On `/overview`, the Overview's own banner for the same tasting is gone and the gold tile stays.
  - There is no horizontal scroll.
- Seeing a filled banner needs a real JOINED active tasting. Agents write nothing to the database, so the main session or the owner provides one. Otherwise, check the empty state: no banner.

## 10. Out of scope

- A sticky banner (D9).
- The banner on pages without the top bar (D16). Give `/knowledge/archetypes/[id]` `AppHeader` if wanted.
- Merging the bell's 15 s poll with this 20 s poll.
- Realtime for the banner.
- A dismiss control.
- Registering a flight hint from the header banner.
- Any change to `/taste`, the guest lobby's "While you wait" tiles, or the tasting pages themselves.
