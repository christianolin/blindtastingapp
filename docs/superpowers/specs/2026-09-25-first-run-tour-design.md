# First-run tour ("Get started") — design

Date: 2026-09-25. Owner decisions 2026-09-24: a getting-started tour that explains
the app's functions, shown once per person (not per device or IP), to new accounts
AND to every existing user once after release, with a way to see it again; and the
optional "set up your profile" step after first sign-in (photo, location,
favourites), skippable, never shown again.

## 1. Decisions

- **D1 Per-account flag, not device or IP.** Every app page is signed in, so the
  person is known. New column `profiles.tour_seen_at timestamptz null`
  (migration `20260925010000_tour_seen.sql`): added to the client UPDATE column
  grant, to `database.types.ts`, left alone by `scrub_deleted_account` (not
  personal data). Null = show the tour. All 38 existing profiles start null, so
  everyone sees it once. Rejected: `user_metadata` (not queryable, not readable in
  the server render without an Auth call) and localStorage (repeats per device —
  the exact complaint).
- **D2 One dismissal.** "Skip", "Done", the close control and Escape all stamp
  `tour_seen_at = now()` through a `"use server"` action `markTourSeen()`. If the
  write fails, the tour stays hidden for the rest of the visit (React state) and
  may show again next time — acceptable. `/profile/edit` gets a "Getting started"
  card with "Show the tour again", which sets the column to null and sends the
  person to `/overview`, where it opens.
- **D3 Form: a step-through sheet, not anchored coach marks.** The nav renders in
  three breakpoint-toggled layouts, tasting pages re-render every few seconds, and
  five overlays already share z-50 — anchored marks would be fragile. The tour is
  one `Dialog` (the existing base-ui wrapper): a bottom sheet on phones (rounded
  top, drag-handle pill, `max-h-[88dvh]`, the field-picker idiom), a centred 480 px
  card from `md`. It is modal while open, never steals focus on touch (the
  Popover/Dialog rules), tokens only, works in `.dark`. Step dots + "Back" /
  "Next" / "Done", "Skip tour" as a quiet link on every step.
- **D4 Where it opens.** Mounted once in `AppShell` (every signed-in page, has the
  profile), it opens after mount when `tour_seen_at` is null and the path is not
  excluded: `/auth/*`, `/login*`, `/signup*`, `/invite/*`, `/j/*`, `/tastings/*`
  (never inside a tasting — a join-link newcomer sees it on their first page
  after the tasting), and `/profile/edit` while the person is already there. So
  a self-serve newcomer sees it on `/taste`, an invited one on `/overview`.
- **D5 Steps** (copy provisional — owner approval needed; each step has a lucide
  icon, a title, two or three sentences, no screenshots):
  1. **Welcome to Blindr** — "Blind tastings with friends, scored the way the
     Danish championship scores them; notes on every wine you drink; your cellar;
     and a map of the wine world. This takes a minute."
  2. **Taste** — "Taste Blind: start a tasting, invite friends, everyone guesses
     country, region, grape, producer and vintage, the host reveals glass by
     glass, points per category. Taste & Rate: a WSET-style note on any wine, no
     game." Mentions Live vs self-paced in one clause.
  3. **Cellar & Catalog** — "Add bottles by {scanning a label with the camera at
     the top | searching the shared catalog} — the catalog is everyone's reference,
     your cellar is yours and private unless you say otherwise." The camera clause
     appears only where `canScan` is true (coarse pointer AND a camera).
  4. **Learn** — "The wine map: pinch into a country for its regions and
     appellations; the Library explains designations and grapes."
  5. **Community** — "Find people, send a friend request, share your invite link.
     Friends can see each other's cellars when you allow it." (Written for the
     friend-requests release; if that ships later, the sentence reads "add
     friends" until then — the plan pins one version.)
  6. **Make it yours** — shown only when the profile is bare (no avatar AND no
     location): "Add a photo and your city so friends recognise you; pick your
     favourite regions." Buttons: "Set up my profile" (→ `/profile/edit`, stamps
     seen) and "Later" (stamps seen). Otherwise step 5's button is "Done".
- **D6 Cost.** No polling and no extra request: the flag rides on the profile
  `AppShell` already reads; one server action on dismissal.
- **D7 Hydration.** The client component receives `{ tourSeen, profileBare }` as
  props and `useCanScan()`; it renders nothing on the server and opens in a
  `useEffect`, so there is no SSR flash and no storage read at first render.
- **D8 Z-order and focus.** z-50, above the header; below nothing that matters
  (the MobileNav drawer cannot be open at the same time). Focus goes to the
  dialog on fine pointers only. Escape = Skip.
- **D9 Rule 1.** Copy only; no real tasting, glass or answer is shown.

## 2. Files

- Migration `supabase/migrations/20260925010000_tour_seen.sql`: column;
  `grant update (tour_seen_at) on public.profiles to authenticated`; pre-state
  assert of the current nine-column grant list (the exact list is asserted in
  `20260919101300` and `20260919141700` — copy the idiom); post-state assert of the
  ten-column list. `database.types.ts` profiles Row/Insert/Update.
- `src/lib/first-run/tour.ts` (pure): `TourStep` type, `tourSteps({ canScan,
  profileBare, friendRequestsLive })`, `tourVisibleOn(pathname)`,
  `TOUR_STEP_IDS`; `tour.test.ts`.
- `src/lib/first-run/actions.ts` (`"use server"`): `markTourSeen()`,
  `resetTour()` (both write the column as the signed-in user; the grant makes the
  client-side RLS `profiles update own` sufficient).
- `src/components/first-run/tour-sheet.tsx` (client): the Dialog, step state,
  dots, buttons; `src/components/app-shell.tsx`: select `tour_seen_at, avatar_url,
  location` for the current profile and mount `<TourSheet tourSeen profileBare />`.
- `/profile/edit`: "Getting started" card with "Show the tour again" (pattern: the
  Appearance card).
- CLAUDE.md: a "First-run tour" bullet (flag, exclusions, steps source of truth,
  the reset control, the per-device-vs-per-user reasoning).

## 3. Tests

Pure: `tourVisibleOn` for every exclusion and a normal path; `tourSteps` — camera
clause only with `canScan`; step 6 only when bare; friend sentence variant. DB
script `scripts/tour-seen.test.mjs` (pattern `scripts/cellar-social.test.mjs`):
a user can update their own `tour_seen_at` and not another's; `anon` cannot.
Browser: opens once on `/overview` for a demo account with null flag; Skip stamps
it; reload → no tour; "Show the tour again" → `/overview` shows it; not shown on a
tasting page; phone sheet at 375×812 and laptop card; dark mode.

## 4. Rollout

Migration first (additive: a nullable column and a grant; the deployed app ignores
it), then the app deploy. Every existing user sees the tour once on their next
page load; the morning report tells the owner so.

## 5. Out of scope

Anchored coach marks; per-feature tips beyond the six steps; analytics on tour
completion; tour on the tasting pages.
