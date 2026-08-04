# Overview / home page redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/taste` overview body into a mission-led landing surface (hero + app-wide KPIs + explainer cards) that flows into the existing tastings section.

**Architecture:** `src/app/taste/page.tsx` stays a server component that fetches data and composes four focused section components. Only the "Start tasting" dropdown is a client island (reuses `useTasteLauncher`). App-wide counts come from a new SECURITY DEFINER SQL function so totals are accurate despite RLS.

**Tech Stack:** Next.js 16 (App Router, server components), React 19, Tailwind, base-ui primitives (`Button`, `DropdownMenu`, `Card`), Supabase (Postgres + RLS), lucide icons.

## Global Constraints

- Verify per task: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` → EXIT=0 (run with `workdir` = repo root).
- Migrations live in `supabase/migrations/`; next free number is `20260829263500`. Apply with `node scripts/scratch-apply.mjs --file <path> --mode dry` then `--mode live` (set `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'` first).
- Commit + push per task (`git push origin master`; prints "RemoteException" on stderr but succeeds — confirm the `->` ref line + EXIT=0).
- Keep `AppHeader`/nav, `TastingsTabs`, `TastingCard` unchanged. Copy is verbatim from the spec.
- Icon vocabulary: Warehouse=cellar, NotebookPen=notes/rate, EyeOff=blind, BookOpen=learn, Wine=glass, Users=members.
- Assistant can't see renders → after each push, owner screenshots to verify.

---

### Task 1: App-wide stats — function, lib, KPI cards

**Files:**
- Create: `supabase/migrations/20260829263500_get_app_stats.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `get_app_stats` to `Functions`)
- Create: `src/lib/app-stats.ts`
- Create: `src/app/taste/app-stats-cards.tsx`
- Modify: `src/app/taste/page.tsx` (add `getAppStats()` to `Promise.all`; replace the per-user `statTiles` block with `<AppStatsCards/>`; drop `getProfileStats`)

**Interfaces:**
- Produces: `getAppStats(): Promise<AppStats>` where `AppStats = { members: number; tastings: number; winesCatalogued: number; notesCreated: number }`; `<AppStatsCards stats={AppStats} />`.
- Consumes: Supabase server client `createClient()` from `@/lib/supabase/server`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260829263500_get_app_stats.sql`:

```sql
-- get_app_stats(): app-wide headline counts for the overview hero.
-- SECURITY DEFINER so totals are accurate regardless of the caller's RLS
-- visibility (tastings + wset_notes are row-restricted; a plain COUNT via the
-- user client would undercount). Read-only; returns exactly one row.
create or replace function public.get_app_stats()
returns table (
  members bigint,
  tastings bigint,
  wines_catalogued bigint,
  notes_created bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from profiles)                                    as members,
    (select count(*) from tastings)                                    as tastings,
    (select count(*) from catalog_wines where blind_pending = false)   as wines_catalogued,
    (select count(*) from wset_notes)                                  as notes_created;
$$;

revoke all on function public.get_app_stats() from public, anon;
grant execute on function public.get_app_stats() to authenticated;
```

- [ ] **Step 2: Apply dry, then live**

Run (workdir = repo, after `$env:DB_PASSWORD='ijiVw1HMM2ReKAY3'`):
`node scripts/scratch-apply.mjs --file supabase/migrations/20260829263500_get_app_stats.sql --mode dry`
then `--mode live`. Expected: no errors.

- [ ] **Step 3: Sanity-check the function**

Run a one-off query (psql or a throwaway node snippet using `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`): `select * from get_app_stats();`
Expected: one row, four non-negative integers.

- [ ] **Step 4: Type the function in database.types.ts**

In `src/lib/supabase/database.types.ts`, find the `Functions:` block (mirror an existing entry such as `get_wine_place_context`) and add:

```ts
get_app_stats: {
  Args: Record<PropertyKey, never>;
  Returns: {
    members: number;
    tastings: number;
    wines_catalogued: number;
    notes_created: number;
  }[];
};
```

(Match the exact `Args`/`Returns` style used by the neighbouring functions in the file.)

- [ ] **Step 5: Write the lib**

`src/lib/app-stats.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

export type AppStats = {
  members: number;
  tastings: number;
  winesCatalogued: number;
  notesCreated: number;
};

// App-wide headline counts for the overview hero. Backed by the
// get_app_stats() SECURITY DEFINER function so the totals are accurate
// regardless of the caller's RLS visibility.
export async function getAppStats(): Promise<AppStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_app_stats").single();
  return {
    members: Number(data?.members ?? 0),
    tastings: Number(data?.tastings ?? 0),
    winesCatalogued: Number(data?.wines_catalogued ?? 0),
    notesCreated: Number(data?.notes_created ?? 0),
  };
}
```

- [ ] **Step 6: Write the KPI cards component**

`src/app/taste/app-stats-cards.tsx`:

```tsx
import { Users, Wine, BookOpen, NotebookPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AppStats } from "@/lib/app-stats";

// >=10k shows "12.4k"; below that shows the exact count.
function formatCount(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return n.toLocaleString();
}

export function AppStatsCards({ stats }: { stats: AppStats }) {
  const tiles = [
    { icon: Users, label: "Members", value: stats.members },
    { icon: Wine, label: "Tastings", value: stats.tastings },
    { icon: BookOpen, label: "Wines catalogued", value: stats.winesCatalogued },
    { icon: NotebookPen, label: "Notes created", value: stats.notesCreated },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t, i) => (
        <Card
          key={t.label}
          className="animate-rise-in gap-2 overflow-hidden py-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <CardContent className="flex flex-col gap-1.5 px-4">
            <t.icon className="size-4 text-gold-deep" strokeWidth={2} />
            <span className="font-heading text-2xl font-semibold tabular-nums">
              {formatCount(t.value)}
            </span>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Wire into page.tsx (KPIs replace per-user tiles)**

In `src/app/taste/page.tsx`:
- Add imports: `import { getAppStats } from "@/lib/app-stats";` and `import { AppStatsCards } from "./app-stats-cards";`.
- In the `Promise.all`, replace `getProfileStats(user.id)` with `getAppStats()` and rename the destructured `stats` to `appStats`.
- Delete the `statTiles` array (lines ~126-151) and its render block (`{stats.summary.winesGuessed > 0 ? (...grid...) : null}`), and insert `<AppStatsCards stats={appStats} />` where that block was.
- Remove now-unused imports: `getProfileStats`, and the icons `Sparkles, Wine, Target, Trophy` (KPIs use their own icons in the new component). Keep `Card, CardContent` only if still referenced — after this task they are not, so remove them too.

- [ ] **Step 8: Verify + commit**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` → EXIT=0.
```bash
git add -A
git commit -m "Overview: app-wide KPI cards via get_app_stats() SECURITY DEFINER fn (replaces per-user tiles)"
git push origin master
```

---

### Task 2: Hero (Start tasting dropdown + Explore & learn + image)

**Files:**
- Create: `src/app/taste/start-tasting-menu.tsx` (client)
- Create: `src/app/taste/overview-hero.tsx` (server)
- Modify: `src/app/taste/page.tsx` (replace the old heading + `<ModeTiles/>` with `<OverviewHero/>`)
- Remove: `src/app/taste/mode-tiles.tsx` (unused after this task; grep confirms only `page.tsx` imports it)
- Asset (owner-provided): `public/hero/romanee-conti-1945.jpg`

**Interfaces:**
- Consumes: `useTasteLauncher()` from `@/components/taste-launcher-context` (`openTaste("blind"|"semi-blind"|"rate")`).
- Produces: `<OverviewHero />` (renders `<StartTastingMenu />` + Explore link + blurred image + copy).

- [ ] **Step 1: Start tasting dropdown (client island)**

`src/app/taste/start-tasting-menu.tsx`:

```tsx
"use client";

import { ChevronDown, EyeOff, ScanEye, NotebookPen, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTasteLauncher } from "@/components/taste-launcher-context";

export function StartTastingMenu() {
  const { openTaste } = useTasteLauncher();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="lg" className="h-11 px-5 text-[0.95rem]" />}
      >
        Start tasting
        <ChevronDown className="size-4 opacity-80" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onClick={() => openTaste("blind")}>
          <EyeOff /> Taste Blind
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaste("semi-blind")}>
          <ScanEye /> Taste Semi-Blind
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openTaste("rate")}>
          <NotebookPen /> Taste &amp; Rate
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Target /> Training Room
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">
            Soon
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Hero section**

`src/app/taste/overview-hero.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StartTastingMenu } from "./start-tasting-menu";

export function OverviewHero() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {/* Blurred hero photo on the right, fading into the card on the left. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full sm:w-3/5 lg:w-[55%]">
        <img
          src="/hero/romanee-conti-1945.jpg"
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-center blur-[2px]"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 to-transparent sm:via-card/40" />
      </div>
      <div className="relative flex max-w-xl flex-col gap-6 p-6 sm:p-10">
        <div className="flex flex-col gap-4">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
            Understand what&apos;s in the glass.
          </h1>
          <p className="text-muted-foreground">
            We believe wine deserves more than a quick score. By giving people a
            structured way to observe, describe, compare and learn, Blindr helps
            curious drinkers develop their palate, appreciate complexity and build
            real wine knowledge over time.
          </p>
          <p className="font-medium">
            We built Blindr for wine enthusiasts, committed beginners, blind
            tasters, collectors and professionals who want to learn more from every
            bottle — and share that with a community of like-minded people.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <StartTastingMenu />
          <Button
            variant="outline"
            size="lg"
            className="h-11 px-5 text-[0.95rem]"
            render={<Link href="/knowledge/map" />}
          >
            Explore &amp; learn
          </Button>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into page.tsx; drop the old launcher**

In `src/app/taste/page.tsx`:
- Add `import { OverviewHero } from "./overview-hero";`.
- Delete the `<div>` with the `<h1>What are you tasting today?</h1>` + subtext and the `<ModeTiles />` line; put `<OverviewHero />` first inside the `max-w-5xl` container.
- Remove `import { ModeTiles } from "./mode-tiles";`.

- [ ] **Step 4: Delete the dead ModeTiles file**

Run: `git rm src/app/taste/mode-tiles.tsx`

- [ ] **Step 5: Verify + commit**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` → EXIT=0.
```bash
git add -A
git commit -m "Overview: mission hero with Start-tasting dropdown + Explore & learn + Romanee-Conti image"
git push origin master
```

(The image renders once the owner saves `public/hero/romanee-conti-1945.jpg`.)

---

### Task 3: Explainer cards + remove old heading path + polish

**Files:**
- Create: `src/app/taste/explainer-cards.tsx` (server)
- Modify: `src/app/taste/page.tsx` (insert `<ExplainerCards/>`; refresh the empty-state copy)

**Interfaces:**
- Produces: `<ExplainerCards />` — four static info cards.

- [ ] **Step 1: Explainer cards**

`src/app/taste/explainer-cards.tsx`:

```tsx
import { Wine, EyeOff, BookOpen, Warehouse } from "lucide-react";

const CARDS = [
  {
    icon: Wine,
    title: "Taste with structure",
    body: "Create thoughtful tasting notes and scores using a consistent method inspired by WSET.",
  },
  {
    icon: EyeOff,
    title: "Taste & challenge",
    body: "Host blind, semi-blind and open tastings, compare impressions and share experiences with friends and fellow wine enthusiasts.",
  },
  {
    icon: BookOpen,
    title: "Understand the wine",
    body: "Explore regions, grapes, styles, classifications and more to connect what's in the glass with its origin.",
  },
  {
    icon: Warehouse,
    title: "Build your cellar",
    body: "Organise your bottles, track your collection and keep your tasting notes in one place. Choose what to keep private and what to share.",
  },
];

export function ExplainerCards() {
  return (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
      {CARDS.map((c) => (
        <div key={c.title} className="flex flex-col gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <c.icon className="size-4.5" strokeWidth={2} />
          </span>
          <span className="font-heading text-base font-medium">{c.title}</span>
          <span className="text-sm text-muted-foreground">{c.body}</span>
        </div>
      ))}
    </div>
  );
}
```

(If `size-4.5` is not defined in this Tailwind build, use `size-5`.)

- [ ] **Step 2: Wire into page.tsx + refresh empty-state copy**

In `src/app/taste/page.tsx`:
- Add `import { ExplainerCards } from "./explainer-cards";`.
- Insert `<ExplainerCards />` between `<AppStatsCards .../>` and the `Your tastings` `<h2>`.
- In the "No tastings yet" empty state, change the sub-copy from "Pick a mode above to start your first tasting." to "Use Start tasting above to begin your first tasting."

- [ ] **Step 3: Verify + commit**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` → EXIT=0.
```bash
git add -A
git commit -m "Overview: four mission explainer cards; refresh empty-state copy"
git push origin master
```

---

## Self-review notes

- Spec coverage: hero copy/actions (Task 2), app-wide KPIs via SECURITY DEFINER fn (Task 1), static explainer cards (Task 3), tastings kept + per-user tiles/heading removed (Tasks 1–3), image path + `/knowledge/map` link (Task 2), "View all" intentionally omitted. Covered.
- Copy verbatim from spec; apostrophes escaped only in JSX text (hero title), not inside JS string literals (card arrays).
- Type consistency: `AppStats` field names (`members/tastings/winesCatalogued/notesCreated`) match between `app-stats.ts` and `app-stats-cards.tsx`; RPC row keys (`wines_catalogued`, `notes_created`) match the SQL `returns table` columns.
