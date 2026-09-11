# Overview, About and Your numbers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three redesigned pages from the Claude Design handoff — `/overview` (new logged-in landing), `/about` (information only) and `/profile/numbers` (personal stats) — plus the nav/shell changes they need, at desktop, tablet and mobile.

**Architecture:** Server components fetch through two new data modules (`overview-data.ts`, `your-numbers.ts`) whose pure maths live in unit-tested `*-math.ts` files. A small set of shared presentational components under `src/components/overview/` (cards, pills, distribution bars, column charts, photo band) is built first so every page composes the same primitives. Client islands are limited to the invitation accept/decline row, the modal launchers, the range control and the sidebar rail.

**Tech Stack:** Next.js 16 App Router (async `params`/`searchParams`, `next/image` with `preload`, not the deprecated `priority`), React 19, Tailwind v4 (`@theme inline` tokens), base-ui primitives, Supabase JS (RLS-scoped user client + existing SECURITY DEFINER RPCs `get_tasting_leaderboard`, `get_wine_reveal`), lucide-react, vitest (node environment, pure modules only).

**Spec:** `docs/superpowers/specs/2026-09-11-overview-about-numbers-design.md` (this plan argues from it; the visual truth is the handoff README + `Blindr Front Page v3.dc.html` at `C:\Users\ChristianDahlOlin\Downloads\Wine app design planning\design_handoff_blindr_pages\`).

## Global Constraints

- Verify per task: `npx tsc --noEmit` → exit 0, `npx eslint <changed files>` → clean, `npx vitest run` → green.
- Use tokens, never raw hex, wherever a token exists (`bg-card`, `border-border-strong`, `text-muted-foreground`, `bg-rose`, …). Raw hex only for the two hover colours the handoff gives that have no token (`#4A1523` primary hover, `#FFFFFF` white fills) — write them as Tailwind arbitrary values.
- Fonts: `font-heading` (Cormorant Garamond 600) for every heading, numeral and wine name; `font-sans` (Manrope) for UI; `font-mono` for eyebrows. Numerals in Cormorant always carry `lining-nums tabular-nums`.
- Never below 10px text; mobile tap targets ≥ 44px tall.
- No new DB migrations: every number is computed from RLS-readable rows or the existing RPCs.
- Copy is verbatim from the handoff README / mockup where it gives copy.
- Do not reintroduce "ready to drink" or "rated by you".
- Commit after each task; push to `master` at the end of the plan.

---

### Task 1: Tokens, keyframes and the hatch utility

**Files:**
- Modify: `src/app/globals.css` (`@theme inline` block, `:root` block, base layer)

**Interfaces:**
- Produces: Tailwind utilities `bg-rose / text-rose`, `text-gold-light`, `text-gold-dark`, `bg-live`, `border-border-light`, `border-border-strong`, `text-ink-photo`, `text-ink-caption`, `text-placeholder`, `text-placeholder-soft`, `bg-chart-oldest`; CSS class `.hatch`; `@keyframes live-ping`.

- [ ] **Step 1: Add the CSS variables to `:root`** (after `--gold-deep`):

```css
  --rose: #a8425a;
  --gold-light: #d4af6a;
  --gold-dark: #6e5416;
  --live: #c6543f;
  --border-light: #f0e6d1;
  --border-strong: #dcceb0;
  --ink-photo: #5a4b3c;
  --ink-caption: #6b5b45;
  --placeholder: #a79574;
  --placeholder-soft: #c9b896;
  --chart-oldest: #e5d9c0;
```

- [ ] **Step 2: Map them in `@theme inline`** (next to `--color-gold-deep`):

```css
  --color-rose: var(--rose);
  --color-gold-light: var(--gold-light);
  --color-gold-dark: var(--gold-dark);
  --color-live: var(--live);
  --color-border-light: var(--border-light);
  --color-border-strong: var(--border-strong);
  --color-ink-photo: var(--ink-photo);
  --color-ink-caption: var(--ink-caption);
  --color-placeholder: var(--placeholder);
  --color-placeholder-soft: var(--placeholder-soft);
  --color-chart-oldest: var(--chart-oldest);
```

- [ ] **Step 3: Add the keyframes + utility** at the end of the file:

```css
@keyframes live-ping {
  0% { transform: scale(1); opacity: 0.7; }
  70%, 100% { transform: scale(2.4); opacity: 0; }
}
.animate-live-ping { animation: live-ping 1.7s ease-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .animate-live-ping { animation: none; opacity: 0; }
}
.hatch {
  background: repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--chart-oldest) 6px 12px);
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` (unchanged) and a throwaway `className="bg-rose"` compiles in the dev build (checked in Task 4's components).
- [ ] **Step 5: Commit** — `git commit -am "feat(tokens): add the redesign palette tokens, live-ping and hatch"`.

---

### Task 2: Data contracts and shared maths

**Files:**
- Create: `src/lib/overview-types.ts`
- Create: `src/lib/your-numbers-types.ts`
- Create: `src/lib/stats-math.ts`
- Test: `src/lib/stats-math.test.ts`

**Interfaces:**
- Produces (types): everything in the two type files below — page components and fetchers import from here.
- Produces (functions):
  - `foldOther(items: DistributionItem[], keep: number): DistributionItem[]` — sorts by count desc, keeps `keep` items, folds the rest into `{ label: "Other", count }` (omitted when zero).
  - `wineTypeLabel(colour: string | null, style: string | null): string` — `SPARKLING → "Sparkling"`, `FORTIFIED → "Fortified"`, `SWEET → "Sweet"`, else colour `RED/WHITE/ROSE/ORANGE → Red/White/Rosé/Orange`, else `"Other"`.
  - `ordinal(n: number): string` — `1 → "1st"`, `2 → "2nd"`, `3 → "3rd"`, `4 → "4th"`, `11 → "11th"`, `22 → "22nd"`.
  - `relativeTime(iso: string, now: Date): string` — "today", "yesterday", "N days ago", "1 week ago", "N weeks ago", "1 month ago", "N months ago", "N years ago".
  - `competitorRank(rows: { participantId: string; total: number }[], me: string): { rank: number; of: number } | null` — dense ranking on `total` desc (ties share a rank); `null` when `me` is absent.
  - `percent(part: number, whole: number): number` — rounded integer percent, `0` when whole is 0.

- [ ] **Step 1: Write the type files** exactly as follows.

`src/lib/overview-types.ts`:
```ts
export type DistributionItem = { label: string; count: number };

export type LiveBanner = {
  kind: "live";
  tastingId: string;
  name: string;
  hosting: boolean;
  hostName: string;
  revealMode: "BLIND" | "SEMI_BLIND" | "OPEN";
  wineIndex: number;   // 1-based index of the wine in play
  wineCount: number;
  stage: string;       // "guessing open" | "region revealed" | "all revealed" | ""
  standing: { rank: number; competitors: number; points: number; matchedOf?: number } | null;
  peopleCount: number;
};
export type NextUpBanner = {
  kind: "next";
  tastingId: string;
  name: string;
  hosting: boolean;
  hostName: string;
  scheduledAt: string | null;
  slots: { label: string; filled: boolean }[]; // ≤ 6
  canAddWine: boolean;
  nextWinePosition: number;
};
export type EmptyBanner = { kind: "none" };
export type OverviewBanner = LiveBanner | NextUpBanner | EmptyBanner;

export type TastingRow =
  | { kind: "invite"; tastingId: string; name: string; hostName: string; scheduledAt: string | null }
  | { kind: "hosting"; tastingId: string; name: string; scheduledAt: string | null; detail: string }
  | { kind: "self-paced"; tastingId: string; name: string; detail: string }
  | { kind: "finished"; tastingId: string; name: string; finishedAt: string; placement: { rank: number; points: number } | null };

export type OverviewTastings = {
  tastings: number;
  averagePoints: number;
  regionHitPct: number | null;
  rows: TastingRow[]; // ≤ 5, ordered invite → hosting → self-paced → finished
};

export type RatingRow = {
  noteId: string;
  catalogWineId: string;
  title: string;
  imageUrl: string | null;
  tastedOn: string;
  contextKind: "OPEN" | "BLIND" | "TRAINING";
  score: number | null;
};
export type OverviewRatings = {
  winesRated: number;
  averageScore: number | null;
  notes: number;
  rows: RatingRow[]; // ≤ 5, newest first
};

export type CellarTile = { lotId: string; catalogWineId: string; title: string; imageUrl: string | null };
export type CellarRecent = { lotId: string; catalogWineId: string; title: string; location: string | null; quantity: number };
export type OverviewCellar = {
  bottles: number;
  producers: number;
  countries: number;
  tiles: CellarTile[];        // ≤ 4, newest first
  remainingBottles: number;   // bottles − Σ quantity of the tiles' lots
  byCountry: DistributionItem[]; // ≤ 4 incl. Other
  byType: DistributionItem[];    // ≤ 4 incl. Other
  recent: CellarRecent[];        // ≤ 3, newest first
};

export type OverviewData = {
  banner: OverviewBanner;
  tastings: OverviewTastings;
  ratings: OverviewRatings;
  cellar: OverviewCellar;
};
```

`src/lib/your-numbers-types.ts`:
```ts
import type { DistributionItem } from "@/lib/overview-types";

export type NumbersRange = "all" | "year" | "90d";
export const NUMBERS_RANGES: NumbersRange[] = ["all", "year", "90d"];

export type AccuracyRow = { label: string; correct: number; applicable: number };
export type PointsPerTasting = { tastingId: string; name: string; points: number; scoredAt: string };
export type CountRow = { label: string; count: number };

export type NumbersTastings = {
  played: number;
  glasses: number;
  averagePoints: number;
  accuracy: AccuracyRow[]; // Country, Region, Appellation, Grape, Vintage ±1, Producer — in this order
  recent: PointsPerTasting[]; // oldest → newest, ≤ 8
  best: { points: number; name: string } | null;
  trend: { delta: number; over: number } | null; // null when < 4 tastings
  placements: { first: number; second: number; third: number; lower: number };
  bestRegions: { label: string; avgPoints: number; wines: number }[]; // ≤ 4, ≥ 2 wines each
};

export type NumbersRatings = {
  winesRated: number;
  notes: number;
  averageScore: number | null;
  scoreBuckets: CountRow[]; // "<80", "80–84", "85–89", "90–94", "95+"
  byType: DistributionItem[];
  byCountry: DistributionItem[];
  topGrapes: CountRow[]; // ≤ 4
  perMonth: CountRow[];  // 8 months oldest → newest, label = short month ("Feb")
  thisMonth: { count: number; isBest: boolean };
  longestStreakWeeks: number;
};

export type NumbersCellar = {
  bottles: number;
  producers: number;
  countries: number;
  byCountry: DistributionItem[];
  byType: DistributionItem[];
  redsByGrape: DistributionItem[];
  vintageBuckets: CountRow[]; // "≤2010", "2011–14", "2015–17", "2018–20", "2021+"
  oldest: { title: string; year: number } | null;
  medianVintage: number | null;
  movements: { label: string; added: number; drunk: number }[]; // 6 months oldest → newest
  addedInRange: number;
  openedInRange: number;
};

export type YourNumbers = {
  range: NumbersRange;
  userId: string;
  displayName: string;
  since: string; // profiles.created_at ISO
  tastings: NumbersTastings;
  ratings: NumbersRatings;
  cellar: NumbersCellar;
};
```

- [ ] **Step 2: Write the failing tests** in `src/lib/stats-math.test.ts` (vitest, `describe/it/expect`): `foldOther` keeps top-N and folds the rest; omits Other when nothing remains; `wineTypeLabel` prefers style over colour and maps ROSE → "Rosé"; `ordinal` handles 1/2/3/4/11/12/13/21/22/23/101; `relativeTime` for today / yesterday / 3 days / 1 week / 2 weeks / 1 month / 5 months / 2 years; `competitorRank` dense ties (`[10, 10, 8]` → the third is rank 2 of 3) and `null` when absent; `percent(0, 0) === 0`, `percent(1, 3) === 33`.
- [ ] **Step 3: Run** `npx vitest run src/lib/stats-math.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement `stats-math.ts`** with pure functions (no imports from Next/Supabase).
- [ ] **Step 5: Run** the test → PASS. `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit** — `feat(stats): data contracts and shared stats maths`.

---

### Task 3: Shell — nav, header pill, sidebar footer, root redirect

**Files:**
- Modify: `src/components/nav-links.ts`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/mobile-nav.tsx`
- Modify: `src/components/app-header.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/tastings/[id]/actions.ts` (`respondToInvite`: add `revalidatePath("/overview")`)

**Interfaces:**
- Produces: `AppHeader` prop `title?: string` (mobile page title). `NAV_LINKS[0]` is Overview. Sidebar footer sub-items under `/profile/*`.

- [ ] **Step 1: `nav-links.ts`** — insert the Overview link first; delete `{ href: "/taste", label: "Overview" }` from Taste's children.
- [ ] **Step 2: `app-sidebar.tsx`** — `ICONS.overview = LayoutDashboard`; logo link `/overview`; footer: when `pathname.startsWith("/profile")` render the profile row with the active background (`bg-primary-foreground/15`, weight 600) and beneath it an indented list (`ml-6 border-l border-primary-foreground/18 pl-3`) with `Your numbers` → `/profile/numbers` (active when pathname starts with it) and `Profile & settings` → `/profile/edit`. Sign-out button stays.
- [ ] **Step 3: `mobile-nav.tsx`** — `ICONS.overview = LayoutDashboard`; logo link `/overview`; the same two profile sub-items always shown under the profile row (there is no room for conditional expansion in a drawer; always-visible is fine).
- [ ] **Step 4: `app-header.tsx`** — add `title?: string`; render `<span className="font-heading text-xl font-semibold md:hidden">{title}</span>` after `MobileNav` when set; add the "Your numbers" pill `<Link href="/profile/numbers">` with `ChartColumn` (label hidden below `md`, "Numbers" shown instead) styled `inline-flex items-center gap-1.5 rounded-lg border border-gold bg-card px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-white`; give `ScanButton` and `NotificationsBell` the bordered look (`border border-border bg-card rounded-lg hover:border-gold hover:bg-white`) via a `className` prop on each (add the prop; both forward it to their `Button`).
- [ ] **Step 5: `src/app/page.tsx`** — redirect signed-in users to `/overview`.
- [ ] **Step 6: `respondToInvite`** — also `revalidatePath("/overview")`.
- [ ] **Step 7: Verify** `npx tsc --noEmit`, `npx eslint src/components src/app/page.tsx`.
- [ ] **Step 8: Commit** — `feat(nav): Overview pillar, Your numbers pill and profile sub-nav`.

---

### Task 4: Shared presentational components

**Files:**
- Create: `src/components/overview/eyebrow.tsx`
- Create: `src/components/overview/link-pill.tsx`
- Create: `src/components/overview/stat-trio.tsx`
- Create: `src/components/overview/subject-card.tsx` (exports `SubjectCard`, `CardRow`, `CardActionBlock`)
- Create: `src/components/overview/hatch-thumb.tsx`
- Create: `src/components/overview/action-button.tsx` (server: `ActionButton` link/button; client: `action-button-client.tsx` `ActionButtonClient` with `launch: "taste-blind" | "taste-rate" | "cellar"`)
- Create: `src/components/overview/distribution-bar.tsx`
- Create: `src/components/overview/accuracy-rows.tsx`
- Create: `src/components/overview/column-chart.tsx` (exports `ColumnChart`, `StackedColumnChart`)
- Create: `src/components/overview/about-band.tsx`
- Create: `src/components/overview/live-dot.tsx`
- Create: `src/components/overview/range-control.tsx` (client)

**Interfaces:** the props in the spec's "Shared components" section, verbatim.

- [ ] **Step 1: Build each component** against the handoff pixel values (see spec). Every measurement in px uses Tailwind arbitrary values (`p-[16px_18px_14px]`, `text-[13.5px]`), tokens for colour.
- [ ] **Step 2: Add a throwaway route** `src/app/_dev-kit/page.tsx` that renders every component with sample data; open it in the browser preview, compare with the mockup, fix, then delete the route.
- [ ] **Step 3: Verify** `npx tsc --noEmit`, `npx eslint src/components/overview`.
- [ ] **Step 4: Commit** — `feat(ui): overview card, chart and band primitives`.

---

### Task 5: Overview data (`getOverviewData`)

**Files:**
- Create: `src/lib/overview-data.ts`
- Create: `src/lib/overview-math.ts` + `src/lib/overview-math.test.ts`

**Interfaces:**
- Consumes: `getProfileStats` (`profile-stats.ts`), `getTastingLeaderboard` (`tasting-leaderboard.ts`), `catalogWineTitle` (`wset/queries.ts`), `makeWineLabeler` (`wine-label.ts`), `stats-math.ts`.
- Produces: `getOverviewData(userId: string): Promise<OverviewData>`.
- Pure (`overview-math.ts`): `pickLiveTasting(rows)`, `pickNextTasting(rows, now)`, `bannerStage(revealedKeys: string[], allRevealed: boolean)`, `orderTastingRows(invites, hosting, selfPaced, finished, cap = 5)`.

- [ ] **Step 1: Tests first** for the four pure helpers (LIVE preferred over ASYNC; newest created wins ties; next = soonest future schedule, then unscheduled, then most recent; stage strings `"guessing open"`, `"appellation revealed"`, `"all revealed"`; row ordering and cap).
- [ ] **Step 2: Implement `overview-math.ts`**, run tests → PASS.
- [ ] **Step 3: Implement `getOverviewData`**: one participant-rows query → tasting ids; parallel: tastings, wines (id, tasting_id, position, is_revealed, reveal_step, contributor_participant_id), all participants for those tastings + host profiles, my guesses (wine_id, participant_id, scored_at) for progress, `getProfileStats`; for the live banner call `get_wine_reveal` for the current wine and `getTastingLeaderboard`; for ≤ 2 finished rows call `getTastingLeaderboard` each for placement; notes query (5 newest + counts) with the same embed as `cellar/page.tsx`; lots query (quantity > 0) with producer/country/colour/style/image embeds. Never preload full appellations/producers tables.
- [ ] **Step 4: Verify** `npx tsc --noEmit`; commit `feat(overview): data assembly`.

---

### Task 6: Overview page

**Files:**
- Create: `src/app/overview/page.tsx`, `src/app/overview/loading.tsx`, `src/app/overview/banner.tsx`, `src/app/overview/tastings-card.tsx`, `src/app/overview/ratings-card.tsx`, `src/app/overview/cellar-card.tsx`, `src/app/overview/invitation-row.tsx` (client, `useOptimistic` + `respondToInvite`), `src/app/overview/start-tasting-row.tsx` (client).

**Interfaces:** consumes `OverviewData`; the launchers via `useTasteLauncher` / `useAddWine`.

- [ ] Build to the spec's Overview section: desktop grid, tablet auto-fit, mobile one-screen rule (lists hidden below `md`, one row per card, `mt-auto` action, root `min-h-full flex flex-col`).
- [ ] `AppHeader title="Overview"`.
- [ ] Verify in the browser at 1360, 900 and 390 widths: three buttons on one line at desktop; on mobile each card's `scrollHeight === clientHeight` (check with `javascript_tool`).
- [ ] Commit — `feat(overview): the new front page`.

---

### Task 7: About page

**Files:**
- Create: `src/app/about/page.tsx`

- [ ] Build to the spec's About section (static, no CTAs, only the back link is interactive; the scoring section uses the Danish Championship table and the semi-blind rule).
- [ ] Verify at desktop and mobile widths.
- [ ] Commit — `feat(about): information page`.

---

### Task 8: Your numbers data

**Files:**
- Create: `src/lib/your-numbers-math.ts` + `src/lib/your-numbers-math.test.ts`
- Create: `src/lib/your-numbers.ts`

**Interfaces:**
- Produces: `getYourNumbers(userId: string, range: NumbersRange): Promise<YourNumbers>`; pure helpers `inRange`, `accuracyRows`, `pointsPerTasting`, `trend`, `placementBuckets`, `bestRegions`, `scoreBuckets`, `monthlyCounts`, `longestWeeklyStreak`, `vintageBuckets`, `weightedMedian`, `movementsByMonth`.

- [ ] Tests first for every pure helper (fixed `now = 2026-09-11T12:00:00Z`): range edges (90 days inclusive, year = calendar year), accuracy pct, trend needs ≥ 4, placement with dense ties, best regions min 2 wines, score bucket edges (79/80/84/85/89/90/94/95), 8-month window labels and zero-fill, streak across a year boundary, vintage bucket edges (2010/2011/2014/2015/2017/2018/2020/2021), weighted median, movements zero-fill.
- [ ] Implement, tests green, then `getYourNumbers` (queries: my participants → fully revealed wines → my scored guesses with points + `scored_at`; `wine_answers.region_id` → region names; `get_tasting_leaderboard` for up to 40 most recent tastings in parallel; my notes with wine embeds; my lots and consumptions).
- [ ] Commit — `feat(numbers): stats maths and assembly`.

---

### Task 9: Your numbers page

**Files:**
- Create: `src/app/profile/numbers/page.tsx`, `src/app/profile/numbers/loading.tsx`, plus one file per section (`tastings-section.tsx`, `ratings-section.tsx`, `cellar-section.tsx`).

- [ ] Build to the spec's Your numbers section; `searchParams.range` validated against `NUMBERS_RANGES`; `RangeControl` in the header; `AboutBand` at the foot.
- [ ] Verify at 1360 / 1000 / 390 widths.
- [ ] Commit — `feat(numbers): personal stats page`.

---

### Task 10: Trim `/taste` and tablet sidebar rail

**Files:**
- Modify: `src/app/taste/page.tsx` (remove `OverviewHero`, `ExplainerCards`, mission section; add a `PageHeader` "Taste" with `StartTastingMenu` as the action)
- Delete: `src/app/taste/overview-hero.tsx`, `src/app/taste/explainer-cards.tsx`, `src/app/taste/app-stats-row.tsx` (and `src/lib/app-stats.ts` if nothing else imports it)
- Modify: `src/components/app-sidebar.tsx` (rail mode `md:`–`xl:`; expand overlay)

- [ ] Trim `/taste`; keep `TastingsTabs`/`TastingCard` intact.
- [ ] Sidebar: `md:w-15 xl:w-60`; in rail mode hide labels/children, show icon + 10px label; an expand button (chevron) opens a `fixed` 240px overlay drawer with the full sidebar markup; close on navigation.
- [ ] Verify at 1000 and 1360 widths.
- [ ] Commit — `feat(shell): taste pillar trimmed, tablet rail`.

---

### Task 11: Verification, review and push

- [ ] `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` all clean.
- [ ] Browser pass on every page at 1360 / 1000 / 390: hover states, live banner variants (force each by data where possible), invitation accept/decline optimism, range control round-trip via URL.
- [ ] Update `CLAUDE.md` domain notes (new routes, dropped metrics, token additions).
- [ ] `git push origin master`.
