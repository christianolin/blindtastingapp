# Designations → Library Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Learn nav to Wine Map · Library and rebuild Designations as an editorial overview + browsable directory + per-topic deep-dive pages, with two flagship deep-dives (Bordeaux 1855 Médoc, Burgundy Grand Cru).

**Architecture:** Next.js App Router server components read the existing `wine_designations` / `wine_designation_members` / `type_designations` / `wine_places` tables through shared helpers in `src/lib/designations/queries.ts`. One deep-dive route (`/knowledge/designations/[key]`) renders two data-chosen shapes (tiered table vs place-linked map). Bespoke copy/images live in a static `src/lib/designations/content.ts`. No schema changes.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Supabase Postgres (supabase-js, typed), Tailwind, MapLibre via existing `TileWineMap`.

## Global Constraints

Copied verbatim from the spec (`docs/superpowers/specs/2026-08-03-designations-library-restructure-design.md`). Every task implicitly includes these.

- **No DB schema changes.** No migrations, no new RPCs. All reads via the typed client from `@/lib/supabase/server`; RLS already restricts to published rows.
- **No test runner for UI/queries in this repo.** Verify each task with `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` (expect no output, exit 0) plus manual visual check by the owner (push `master` → Vercel). Commit per task.
- **Auth guard:** every page is a server component that calls `redirect("/login")` when `supabase.auth.getUser()` returns no user (mirror `src/app/knowledge/grapes/page.tsx:29-34`).
- **Query-helper typing:** helpers take `supabase: SupabaseClient<Database>` (`@supabase/supabase-js`, `Database` from `@/lib/supabase/database.types`), mirroring `src/lib/wine-map/context.ts`.
- **Page shell conventions:** `AppHeader`; outer `div.flex.flex-1.flex-col`; inner `div.flex.w-full.max-w-[1500px].flex-1.flex-col.gap-6.p-6.sm:p-8`; page title `h1.font-heading.text-3xl.font-semibold.tracking-tight`; use `Card`/`Badge` from `@/components/ui/*`.
- **Tabs** use `?tab=` link tabs via `Tabs` from `@/components/ui/tabs.tsx` (`TabItem = { key; label; href; count? }`).
- **Map** uses `TileWineMap` from `@/app/knowledge/map/tile-wine-map` via `dynamic(..., { ssr: false })`; manifest via `fetchWineMapManifest()`.
- **Nav pillar "Learn"** children become exactly Wine Map (`/knowledge/map`) and Library (`/knowledge`).
- **git note:** `git push` prints "RemoteException" on stderr but succeeds — confirm the `old..new master -> master` ref line / `EXIT=0`.

---

## File Structure

**Create:**

- `src/lib/designations/queries.ts` — shared server query helpers (`listDesignationTopics`, `getDesignationSystem`, `getGlossaryCategory`) + the pure `groupBySubregion` helper + the `categorySlug` helper. One responsibility: turn the four DB tables into view-model shapes.
- `src/lib/designations/content.ts` — static bespoke content: per-system `DESIGNATION_CONTENT` (hero, intro, hierarchy pyramid) and the overview editorial copy (why-cards, variation-cards). No DB.
- `src/app/knowledge/page.tsx` — **Library** hub (card grid front door).
- `src/app/knowledge/designations/page.tsx` — Designations **overview** (editorial + directory).
- `src/app/knowledge/designations/[key]/page.tsx` — system **deep-dive** (both shapes + `?tab=` tabs).
- `src/app/knowledge/designations/[key]/designation-map.tsx` — client wrapper mounting `TileWineMap` scoped to a system's member sites.
- `src/app/knowledge/designations/glossary/[category]/page.tsx` — glossary category term list.

**Modify:**

- `src/components/nav-links.ts` — Learn pillar children → Wine Map + Library.
- `src/app/knowledge/type-designations/page.tsx` — replace whole body with a permanent redirect to `/knowledge/designations`.

**Task order & dependencies:** Task 1 (queries) and Task 2 (content) are leaf modules with no deps. Task 3 (nav + redirect) is independent. Tasks 4–8 consume Tasks 1–2. Task 6 (map wrapper) precedes Task 7 (deep-dive), which imports it. Each task ends tsc-clean and committed.

---

## Task 1: Designation query helpers

**Files:**
- Create: `src/lib/designations/queries.ts`

**Interfaces:**
- Consumes: `SupabaseClient<Database>` (the value returned by `createClient()` from `@/lib/supabase/server`).
- Produces (used by Tasks 4–8): `categorySlug`, `groupBySubregion`, `listDesignationTopics`, `getDesignationSystem`, `getGlossaryCategory`, and the types `DesignationSystemRow`, `DesignationMemberRow`, `SubregionCount`, `DesignationSystemDetail`, `DirectoryGroup`, `GlossaryCategory`.

- [ ] **Step 1: Create `src/lib/designations/queries.ts` with the types + pure helpers:**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export type DesignationSystemRow = {
  id: string;
  key: string;
  name: string;
  appellationSystem: string | null;
  description: string;
  displayGroup: string | null;
  typeDesignationId: string | null;
};

export type DesignationMemberRow = {
  id: string;
  name: string;
  tier: string | null;
  tierRank: number | null;
  commune: string | null;
  memberKind: string;
  winePlaceId: string | null;
  canonicalKey: string | null;
  placeName: string | null;
};

export type SubregionCount = { subregion: string; canonicalKey: string; count: number };

export type DesignationSystemDetail = {
  system: DesignationSystemRow;
  members: DesignationMemberRow[];
  hasPlaces: boolean;
  subregions: SubregionCount[];
  visibleKeys: string[];
};

export type DirectoryGroup = {
  group: string;
  systems: { key: string; name: string; memberCount: number }[];
};

export type GlossaryCategory = {
  category: string;
  slug: string;
  terms: { id: string; name: string; description: string | null }[];
};

// Accent/case-insensitive slug used for glossary category routes.
export function categorySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Pure: group place-linked members under their nearest SUBREGION ancestor by
// walking wine_places.primary_parent_id. `places` is the region subtree.
// Returns counts (desc) plus the SUBREGION canonical keys, for map visibleKeys.
export function groupBySubregion(
  members: { winePlaceId: string | null }[],
  places: {
    id: string;
    primary_parent_id: string | null;
    kind: string;
    name: string;
    canonical_key: string;
  }[],
): { subregions: SubregionCount[]; subregionKeys: string[] } {
  const byId = new Map(places.map((p) => [p.id, p]));
  const counts = new Map<string, { name: string; key: string; count: number }>();
  for (const m of members) {
    let node = m.winePlaceId ? byId.get(m.winePlaceId) : undefined;
    while (node && node.kind !== "SUBREGION") {
      node = node.primary_parent_id ? byId.get(node.primary_parent_id) : undefined;
    }
    if (!node) continue;
    const entry =
      counts.get(node.id) ?? { name: node.name, key: node.canonical_key, count: 0 };
    entry.count += 1;
    counts.set(node.id, entry);
  }
  const subregions = [...counts.values()]
    .map((e) => ({ subregion: e.name, canonicalKey: e.key, count: e.count }))
    .sort((a, b) => b.count - a.count || a.subregion.localeCompare(b.subregion));
  return { subregions, subregionKeys: subregions.map((s) => s.canonicalKey) };
}
```

- [ ] **Step 2: Append `getDesignationSystem` to the same file:**

```ts
export async function getDesignationSystem(
  supabase: Client,
  key: string,
): Promise<DesignationSystemDetail | null> {
  const { data: sys } = await supabase
    .from("wine_designations")
    .select(
      "id, key, name, appellation_system, description, display_group, type_designation_id",
    )
    .eq("key", key)
    .maybeSingle();
  if (!sys) return null;

  const { data: memberRows } = await supabase
    .from("wine_designation_members")
    .select("id, name, tier, tier_rank, commune, member_kind, wine_place_id")
    .eq("designation_id", sys.id)
    .order("tier_rank", { ascending: true })
    .order("sort_order", { ascending: true });
  const rows = memberRows ?? [];

  const placeIds = [
    ...new Set(rows.map((r) => r.wine_place_id).filter((id): id is string => !!id)),
  ];
  const placeById = new Map<string, { name: string; canonical_key: string }>();
  if (placeIds.length > 0) {
    const { data: places } = await supabase
      .from("wine_places")
      .select("id, name, canonical_key")
      .in("id", placeIds);
    for (const p of places ?? []) placeById.set(p.id, p);
  }

  const members: DesignationMemberRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    tier: r.tier == null ? null : String(r.tier),
    tierRank: r.tier_rank,
    commune: r.commune,
    memberKind: r.member_kind,
    winePlaceId: r.wine_place_id,
    canonicalKey: r.wine_place_id
      ? placeById.get(r.wine_place_id)?.canonical_key ?? null
      : null,
    placeName: r.wine_place_id ? placeById.get(r.wine_place_id)?.name ?? null : null,
  }));
  const hasPlaces = members.some((m) => m.winePlaceId);

  let subregions: SubregionCount[] = [];
  let visibleKeys: string[] = [];
  if (hasPlaces) {
    const memberKeys = members
      .map((m) => m.canonicalKey)
      .filter((k): k is string => !!k);
    const regionPrefix = (memberKeys[0] ?? "").split(".").slice(0, 2).join(".");
    if (regionPrefix) {
      const { data: subtree } = await supabase
        .from("wine_places")
        .select("id, primary_parent_id, kind, name, canonical_key")
        .like("canonical_key", `${regionPrefix}%`);
      const grouped = groupBySubregion(
        members.map((m) => ({ winePlaceId: m.winePlaceId })),
        subtree ?? [],
      );
      subregions = grouped.subregions;
      visibleKeys = [regionPrefix, ...grouped.subregionKeys, ...memberKeys];
    } else {
      visibleKeys = memberKeys;
    }
  }

  return {
    system: {
      id: sys.id,
      key: sys.key,
      name: sys.name,
      appellationSystem: sys.appellation_system,
      description: sys.description,
      displayGroup: sys.display_group,
      typeDesignationId: sys.type_designation_id,
    },
    members,
    hasPlaces,
    subregions,
    visibleKeys,
  };
}
```

- [ ] **Step 3: Append `listDesignationTopics` + `getGlossaryCategory` to the same file:**

```ts
export async function listDesignationTopics(supabase: Client): Promise<{
  groups: DirectoryGroup[];
  glossary: { category: string; slug: string; count: number }[];
}> {
  const { data: systems } = await supabase
    .from("wine_designations")
    .select("id, key, name, display_group, sort_order")
    .order("display_group", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  const { data: members } = await supabase
    .from("wine_designation_members")
    .select("designation_id");
  const countById = new Map<string, number>();
  for (const m of members ?? [])
    countById.set(m.designation_id, (countById.get(m.designation_id) ?? 0) + 1);

  const groups: DirectoryGroup[] = [];
  for (const s of systems ?? []) {
    const memberCount = countById.get(s.id) ?? 0;
    if (memberCount === 0) continue; // hide empty systems (spec: no seeding)
    const groupName = s.display_group ?? "Other";
    let g = groups.find((x) => x.group === groupName);
    if (!g) {
      g = { group: groupName, systems: [] };
      groups.push(g);
    }
    g.systems.push({ key: s.key, name: s.name, memberCount });
  }

  const { data: cats } = await supabase
    .from("type_designations")
    .select("category")
    .eq("is_active", true);
  const catCounts = new Map<string, number>();
  for (const c of cats ?? []) {
    if (!c.category) continue;
    catCounts.set(c.category, (catCounts.get(c.category) ?? 0) + 1);
  }
  const glossary = [...catCounts.entries()]
    .map(([category, count]) => ({ category, slug: categorySlug(category), count }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { groups, glossary };
}

export async function getGlossaryCategory(
  supabase: Client,
  slug: string,
): Promise<GlossaryCategory | null> {
  const { data } = await supabase
    .from("type_designations")
    .select("id, name, description, category")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []).filter(
    (r) => r.category && categorySlug(r.category) === slug,
  );
  if (rows.length === 0) return null;
  return {
    category: rows[0].category as string,
    slug,
    terms: rows.map((r) => ({ id: r.id, name: r.name, description: r.description })),
  };
}
```

- [ ] **Step 4: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 5: Commit.**

```
git add src/lib/designations/queries.ts
git commit -m "Designations: shared query helpers (systems, members, subregion, glossary)"
```

---

## Task 2: Static content module

Bespoke copy/imagery the DB does not hold (spec: no schema changes). Hero images are optional drop-ins under `/public/designations/`; Task 6 renders them as a CSS `background-image` layered over a gradient, so a not-yet-uploaded file degrades to the gradient (no broken `<img>`).

**Files:**
- Create: `src/lib/designations/content.ts`

**Interfaces:**
- Produces (used by Tasks 5 & 6): `DesignationContent`, `DESIGNATION_CONTENT`, `OVERVIEW_INTRO`, `WHY_CARDS`, `VARIATION_INTRO`, `VARIATION_CARDS`, `BLIND_TASTING_NOTE`.

- [ ] **Step 1: Create `src/lib/designations/content.ts`:**

```ts
export type DesignationContent = {
  hero?: { src: string; alt: string };
  intro?: string;
  hierarchy?: { tier: string; label: string; count?: string; note?: string }[];
};

// Keyed by wine_designations.key. Only flagships need entries; other systems
// fall back to their DB `description` and get no hero/pyramid.
export const DESIGNATION_CONTENT: Record<string, DesignationContent> = {
  "medoc-1855": {
    hero: { src: "/designations/medoc-1855.jpg", alt: "A château in the Médoc" },
    intro:
      "The Classification of 1855 was created for the Exposition Universelle in Paris. It ranks the top châteaux of the Médoc into five growths based on reputation and market price at the time.",
  },
  "burgundy-grand-cru": {
    hero: {
      src: "/designations/burgundy-grand-cru.jpg",
      alt: "Grand Cru vineyards in Burgundy",
    },
    intro:
      "Burgundy's Grand Cru vineyards represent the finest expression of the region. 33 sites are recognized for their exceptional terroir and tradition.",
    hierarchy: [
      { tier: "grand-cru", label: "Grand Cru", count: "33 vineyards" },
      { tier: "premier-cru", label: "Premier Cru", count: "~640 vineyards" },
      { tier: "village", label: "Village / Communal", count: "44 appellations" },
      { tier: "regional", label: "Regional", count: "23 appellations" },
      { tier: "bourgogne", label: "Bourgogne", note: "Regional blend" },
    ],
  },
};

export const OVERVIEW_INTRO =
  "Wine designations describe where, how and by what rules a wine is made. They help us understand quality, style and origin — from broad regions to very specific vineyards.";

export const WHY_CARDS: { title: string; body: string }[] = [
  { title: "Indicate origin", body: "They show where the grapes come from and how the area is defined." },
  { title: "Set standards", body: "Rules for grape varieties, yields, winemaking and aging ensure consistency and quality." },
  { title: "Create hierarchy", body: "From country to region to vineyard, each level adds more specificity." },
  { title: "Reflect tradition", body: "Many designations are rooted in history and local knowledge." },
];

export const VARIATION_INTRO =
  "Wine is one of the world's most diverse drinks. Differences in climate, soils, grape varieties and winemaking traditions create an incredible range of styles.";

export const VARIATION_CARDS: { title: string; body: string }[] = [
  { title: "Country to country", body: "Climate and culture shape the overall style." },
  { title: "Region to region", body: "Terroir and tradition create distinct expressions." },
  { title: "Village to village", body: "Even small areas can have unique character." },
  { title: "Vineyard to vineyard", body: "The best wines often come from single vineyards." },
];

export const BLIND_TASTING_NOTE =
  "For blind tasting, understanding designations helps you place a wine in the right context and make more accurate, confident guesses.";
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Commit.**

```
git add src/lib/designations/content.ts
git commit -m "Designations: static content module (flagship copy, hero, pyramid, overview cards)"
```

---

## Task 3: Nav consolidation + old-route redirect

**Files:**
- Modify: `src/components/nav-links.ts` (Learn pillar children, currently lines 47–53)
- Modify: `src/app/knowledge/type-designations/page.tsx` (replace whole file)

**Dependency note:** the new nav "Library" link points at `/knowledge` (Task 4) and the overview lives at `/knowledge/designations` (Task 5). Commit this task, but push it together with Tasks 4 & 5 so the live nav never links to a 404.

- [ ] **Step 1: Replace the Learn pillar's `children` array in `src/components/nav-links.ts`.**

Find (lines 47–53):

```ts
    children: [
      { href: "/knowledge/map", label: "Wine map" },
      { href: "/knowledge/archetypes", label: "Typical wines" },
      { href: "/knowledge/grapes", label: "Grapes" },
      { href: "/knowledge/type-designations", label: "Designations" },
      { href: "/rules", label: "Rules" },
    ],
```

Replace with:

```ts
    children: [
      { href: "/knowledge/map", label: "Wine map" },
      { href: "/knowledge", label: "Library" },
    ],
```

Leave the pillar's `match: ["/knowledge", "/rules"]` unchanged — it already keeps Learn lit across `/knowledge/*` and `/rules`.

- [ ] **Step 2: Replace the entire contents of `src/app/knowledge/type-designations/page.tsx` with a redirect:**

```tsx
import { redirect } from "next/navigation";

// The old Designations route now lives under the Library at
// /knowledge/designations. Permanent client-visible redirect for any bookmarks.
export default function TypeDesignationsRedirect() {
  redirect("/knowledge/designations");
}
```

- [ ] **Step 3: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 4: Commit.**

```
git add src/components/nav-links.ts src/app/knowledge/type-designations/page.tsx
git commit -m "Nav: collapse Learn to Wine Map + Library; redirect old designations route"
```

---

## Task 4: Library hub page (`/knowledge`)

**Files:**
- Create: `src/app/knowledge/page.tsx` (if a `/knowledge` index already exists, replace it with this hub)

**Interfaces:** none exported. Reads nothing but auth.

- [ ] **Step 1: Create `src/app/knowledge/page.tsx`:**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, Grape, Map as MapIcon, Scale, Wine } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Library · Knowledge · Blindr" };

const SECTIONS: {
  href: string;
  label: string;
  description: string;
  icon: typeof BookOpen;
}[] = [
  { href: "/knowledge/designations", label: "Designations", description: "Where, how and by what rules a wine is made — from broad regions to single vineyards.", icon: Scale },
  { href: "/knowledge/grapes", label: "Grapes", description: "The varieties behind every wine, with tasting-note profiles for the classics.", icon: Grape },
  { href: "/knowledge/archetypes", label: "Typical wines", description: "What a classic wine from each place looks, smells and tastes like.", icon: Wine },
  { href: "/rules", label: "Rules", description: "How blind and semi-blind tasting is scored in Blindr.", icon: BookOpen },
];

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Library
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Everything to learn about wine — regions, grapes, styles and the
            rules of the game.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href}>
              <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                <CardContent className="flex flex-col gap-2 pt-6">
                  <s.icon className="size-6 text-primary" />
                  <h2 className="font-heading text-lg font-semibold">{s.label}</h2>
                  <p className="text-sm text-muted-foreground">{s.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}

          <Link href="/knowledge/map">
            <Card className="h-full border-primary/30 bg-primary/5 transition-colors hover:bg-primary/10">
              <CardContent className="flex flex-col gap-2 pt-6">
                <MapIcon className="size-6 text-primary" />
                <h2 className="font-heading text-lg font-semibold">
                  Explore the Wine Map
                </h2>
                <p className="text-sm text-muted-foreground">
                  The interactive atlas of the world&apos;s wine regions.
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Manual check** (after push): `/knowledge` shows the Library hub; each card navigates to its section.

- [ ] **Step 4: Commit.**

```
git add src/app/knowledge/page.tsx
git commit -m "Library: hub page at /knowledge linking the reading sections"
```

---

## Task 5: Designations overview (`/knowledge/designations`)

Editorial (per mockup) + the browse directory from `listDesignationTopics`. Icons are assigned by index from parallel arrays so `content.ts` stays React-free.

**Files:**
- Create: `src/app/knowledge/designations/page.tsx`

**Interfaces:**
- Consumes: `listDesignationTopics` (Task 1); `OVERVIEW_INTRO`, `WHY_CARDS`, `VARIATION_INTRO`, `VARIATION_CARDS`, `BLIND_TASTING_NOTE` (Task 2).

- [ ] **Step 1: Create `src/app/knowledge/designations/page.tsx`:**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Globe,
  Grape,
  Home,
  Info,
  Landmark,
  Layers,
  Map as MapIcon,
  ScrollText,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AppHeader } from "@/components/app-header";
import { createClient } from "@/lib/supabase/server";
import { listDesignationTopics } from "@/lib/designations/queries";
import {
  BLIND_TASTING_NOTE,
  OVERVIEW_INTRO,
  VARIATION_CARDS,
  VARIATION_INTRO,
  WHY_CARDS,
} from "@/lib/designations/content";

export const metadata = { title: "Designations · Library · Blindr" };

const WHY_ICONS = [Landmark, ScrollText, Layers, Sparkles];
const VARIATION_ICONS = [Globe, MapIcon, Home, Grape];

export default async function DesignationsOverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { groups, glossary } = await listDesignationTopics(supabase);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-10 p-6 sm:p-8">
        <div>
          <nav className="mb-2 text-sm text-muted-foreground">
            <Link href="/knowledge" className="hover:text-foreground">Library</Link>
            <span className="px-1.5">›</span>
            <span className="text-foreground">Designations</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Designations
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{OVERVIEW_INTRO}</p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-semibold">Why designations matter</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CARDS.map((c, i) => {
              const Icon = WHY_ICONS[i];
              return (
                <div key={c.title} className="flex flex-col gap-2">
                  <Icon className="size-6 text-primary" />
                  <h3 className="font-medium">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="font-heading text-xl font-semibold">Variation in wine</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{VARIATION_INTRO}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VARIATION_CARDS.map((c, i) => {
              const Icon = VARIATION_ICONS[i];
              return (
                <div key={c.title} className="flex flex-col gap-2">
                  <Icon className="size-6 text-primary" />
                  <h3 className="font-medium">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">{c.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <Info className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">{BLIND_TASTING_NOTE}</p>
        </div>

        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-xl font-semibold">Browse designations</h2>
          {groups.map((group) => (
            <div key={group.group} className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                {group.group}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.systems.map((s) => (
                  <Link key={s.key} href={`/knowledge/designations/${s.key}`}>
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardContent className="flex items-center justify-between gap-2 pt-6">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.memberCount}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {glossary.length > 0 ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary">
                Glossary
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {glossary.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/knowledge/designations/glossary/${c.slug}`}
                  >
                    <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
                      <CardContent className="flex items-center justify-between gap-2 pt-6">
                        <span className="font-medium">{c.category}</span>
                        <span className="text-xs text-muted-foreground">{c.count}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Manual check** (after push): `/knowledge/designations` shows the editorial sections and a Browse directory grouped by Bordeaux / Burgundy / Alsace; the flagship cards link to `/knowledge/designations/medoc-1855` and `.../burgundy-grand-cru`; glossary cards link to `.../glossary/<slug>`.

- [ ] **Step 4: Commit.**

```
git add src/app/knowledge/designations/page.tsx
git commit -m "Designations: editorial overview + browse directory"
```

---

## Task 6: Scoped designation map wrapper

A read-only client map for place-linked deep-dives: renders only a system's member sites (+ region/sub-region context) via `visibleKeys`, framed on the region using that region place's boundary bbox. Built before Task 7 because the deep-dive imports it.

**Files:**
- Create: `src/app/knowledge/designations/[key]/designation-map.tsx`

**Interfaces:**
- Consumes: `TileWineMap` + type `CameraTarget` (`@/app/knowledge/map/tile-wine-map`), `fetchWineMapManifest` (`@/lib/wine-map/manifest`), `fetchWinePlaceContext` (`@/lib/wine-map/context`), `createClient` (`@/lib/supabase/client`).
- Produces (used by Task 7): `DesignationMap({ visibleKeys: string[]; regionKey: string })`.

- [ ] **Step 1: Create `src/app/knowledge/designations/[key]/designation-map.tsx`:**

```tsx
"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  fetchWineMapManifest,
  type WineMapManifest,
} from "@/lib/wine-map/manifest";
import { fetchWinePlaceContext } from "@/lib/wine-map/context";
import type { CameraTarget } from "@/app/knowledge/map/tile-wine-map";

// maplibre-gl touches `window` on import — never server-render it.
const TileWineMap = dynamic(
  () => import("@/app/knowledge/map/tile-wine-map").then((m) => m.TileWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

// Read-only, scoped map for a designation deep-dive: only the system's member
// sites (+ their region/sub-region context) render, framed on the region.
// Clicking a place opens it in the full explorer.
export function DesignationMap({
  visibleKeys,
  regionKey,
}: {
  visibleKeys: string[];
  regionKey: string;
}) {
  const router = useRouter();
  const [manifest, setManifest] = useState<WineMapManifest | null>(null);
  const [camera, setCamera] = useState<CameraTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWineMapManifest()
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    fetchWinePlaceContext(supabase, regionKey)
      .then((ctx) => {
        if (!cancelled && ctx?.boundary) {
          setCamera({
            bbox: ctx.boundary.bbox,
            minZoom: 0,
            maxZoom: 10,
            source: "ui",
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [regionKey]);

  if (!manifest) {
    return (
      <div className="h-[60vh] min-h-[420px] animate-pulse rounded-lg border bg-muted" />
    );
  }

  return (
    <div className="h-[60vh] min-h-[420px]">
      <TileWineMap
        manifest={manifest}
        selectedKey={null}
        selectedId={null}
        selectedParentId={null}
        cameraTarget={camera}
        onSelect={(key) => router.push(`/knowledge/map?place=${key}`)}
        visibleKeys={visibleKeys}
        expanded={false}
        onToggleExpanded={() => {}}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Commit.** (PowerShell globs `[key]`, so use a literal git pathspec.)

```
git add -- ':(literal)src/app/knowledge/designations/[key]/designation-map.tsx'
git commit -m "Designations: scoped read-only map wrapper for place-linked deep-dives"
```

---

## Task 7: Designation deep-dive page (`/knowledge/designations/[key]`)

One route, two data-chosen shapes: place-linked systems (`hasPlaces`) get the hierarchy pyramid + scoped map + by-sub-region list; tiered-estate systems get the "growths" tier cards. `?tab=overview|list` link tabs; the list tab is the full member list. The header hero is a CSS `background-image` over a gradient (missing file → gradient only).

**Files:**
- Create: `src/app/knowledge/designations/[key]/page.tsx`

**Interfaces:**
- Consumes: `getDesignationSystem` (Task 1), `DESIGNATION_CONTENT` (Task 2), `DesignationMap` (Task 6), `Tabs` (`@/components/ui/tabs`).

- [ ] **Step 1: Create `src/app/knowledge/designations/[key]/page.tsx`:**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Tabs } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getDesignationSystem } from "@/lib/designations/queries";
import { DESIGNATION_CONTENT } from "@/lib/designations/content";
import { DesignationMap } from "./designation-map";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return { title: `${key} · Designations · Blindr` };
}

export default async function DesignationDeepDivePage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { key } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const detail = await getDesignationSystem(supabase, key);
  if (!detail) notFound();

  const { system, members, hasPlaces, subregions, visibleKeys } = detail;
  const content = DESIGNATION_CONTENT[key] ?? {};
  const intro = content.intro ?? system.description;
  const activeTab = tab === "list" ? "list" : "overview";
  const secondLabel =
    members[0]?.memberKind === "ESTATE" ? "Châteaux" : "Vineyards";
  const base = `/knowledge/designations/${key}`;
  const regionKey = visibleKeys[0] ?? "";

  // Group members by tier for the tiered (estate) shape; members already come
  // ordered by tier_rank, so first-seen order is correct.
  const tiers: { tier: string; members: typeof members }[] = [];
  for (const m of members) {
    const label = m.tier ?? "Classified";
    let t = tiers.find((x) => x.tier === label);
    if (!t) {
      t = { tier: label, members: [] };
      tiers.push(t);
    }
    t.members.push(m);
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Link href="/knowledge" className="hover:text-foreground">Library</Link>
              <span>›</span>
              <Link href="/knowledge/designations" className="hover:text-foreground">
                Designations
              </Link>
              {system.displayGroup ? (
                <>
                  <span>›</span>
                  <span>{system.displayGroup}</span>
                </>
              ) : null}
              <span>›</span>
              <span className="text-foreground">{system.name}</span>
            </nav>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">
              {system.name}
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">{intro}</p>
          </div>
          {content.hero ? (
            <div
              className="hidden aspect-[16/9] w-64 shrink-0 rounded-lg bg-cover bg-center sm:block"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(92,26,43,0.25), rgba(183,142,66,0.25)), url(${content.hero.src})`,
              }}
              role="img"
              aria-label={content.hero.alt}
            />
          ) : null}
        </div>

        <Tabs
          items={[
            { key: "overview", label: "Overview", href: `${base}?tab=overview` },
            {
              key: "list",
              label: secondLabel,
              href: `${base}?tab=list`,
              count: members.length,
            },
          ]}
          activeKey={activeTab}
        />

        {activeTab === "overview" ? (
          hasPlaces ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-2">
                {content.hierarchy ? (
                  <div className="flex flex-col gap-2">
                    <h2 className="font-heading text-xl font-semibold">
                      The hierarchy
                    </h2>
                    <div className="flex flex-col gap-1.5">
                      {content.hierarchy.map((h, i) => (
                        <div
                          key={h.tier}
                          className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2"
                          style={{ width: `${100 - i * 12}%` }}
                        >
                          <span className="font-medium">{h.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {h.count ?? h.note ?? ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="min-h-[420px]">
                  {regionKey ? (
                    <DesignationMap
                      visibleKeys={visibleKeys}
                      regionKey={regionKey}
                    />
                  ) : null}
                </div>
              </div>
              {subregions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h2 className="font-heading text-xl font-semibold">
                    By sub-region
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {subregions.map((s) => (
                      <Link
                        key={s.canonicalKey}
                        href={`/knowledge/map?place=${s.canonicalKey}`}
                        className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                      >
                        <span className="font-medium">{s.subregion}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.count} {s.count === 1 ? "vineyard" : "vineyards"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <h2 className="font-heading text-xl font-semibold">
                The {tiers.length} growths
              </h2>
              <div className="flex flex-col gap-3">
                {tiers.map((t) => (
                  <Card key={t.tier}>
                    <CardContent className="flex flex-col gap-2 pt-6">
                      <div className="flex items-center justify-between">
                        <span className="font-heading text-lg font-semibold">
                          {t.tier}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.members.length}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t.members.map((m) => m.name).join(" · ")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="font-medium">{m.name}</span>
                <span className="text-xs text-muted-foreground">
                  {[m.commune, m.tier].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Manual check** (after push): `/knowledge/designations/medoc-1855` shows five growth cards (Overview) and the full château list (Châteaux tab); `/knowledge/designations/burgundy-grand-cru` shows the hierarchy pyramid, the Burgundy map, and the By sub-region list, plus the full vineyard list. A non-flagship key (e.g. `alsace-grand-cru`) renders through the same template.

- [ ] **Step 4: Commit.**

```
git add -- ':(literal)src/app/knowledge/designations/[key]/page.tsx'
git commit -m "Designations: deep-dive page (tiered + place-linked shapes, tabs)"
```

---

## Task 8: Glossary category pages (`/knowledge/designations/glossary/[category]`)

A clean term list for a `type_designations` category (Prädikat, Sparkling Dosage, …). `[category]` is the `categorySlug` of the category name.

**Files:**
- Create: `src/app/knowledge/designations/glossary/[category]/page.tsx`

**Interfaces:**
- Consumes: `getGlossaryCategory` (Task 1).

- [ ] **Step 1: Create `src/app/knowledge/designations/glossary/[category]/page.tsx`:**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getGlossaryCategory } from "@/lib/designations/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  return { title: `${category} · Designations · Blindr` };
}

export default async function GlossaryCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const data = await getGlossaryCategory(supabase, category);
  if (!data) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <div className="flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-6 sm:p-8">
        <div>
          <nav className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/knowledge" className="hover:text-foreground">Library</Link>
            <span>›</span>
            <Link href="/knowledge/designations" className="hover:text-foreground">
              Designations
            </Link>
            <span>›</span>
            <span className="text-foreground">{data.category}</span>
          </nav>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {data.category}
          </h1>
        </div>

        <div className="flex flex-col gap-3">
          {data.terms.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex flex-col gap-1 pt-6">
                <h2 className="font-heading text-lg font-semibold">{t.name}</h2>
                {t.description ? (
                  <p className="text-sm text-muted-foreground">{t.description}</p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 3: Manual check** (after push): a glossary card on the overview (e.g. Prädikat) opens `/knowledge/designations/glossary/pradikat` listing its terms with descriptions.

- [ ] **Step 4: Commit.**

```
git add -- ':(literal)src/app/knowledge/designations/glossary/[category]/page.tsx'
git commit -m "Designations: glossary category pages (Prädikat, dosage, …)"
```

---

## Task 9: Ship & full QA

Push the whole feature at once (Task 3's nav links must not go live before Tasks 4 & 5), then verify against the mockup.

**Files:** none (integration + verification).

- [ ] **Step 1: Final type check.** Run `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`. Expected: no output, exit 0.

- [ ] **Step 2: Push.** (`git push` prints "RemoteException" on stderr but succeeds — confirm the `old..new master -> master` ref line.)

```
git push
```

- [ ] **Step 3: Manual QA (owner, in the browser).** Confirm each:
  - Learn nav shows exactly **Wine map** and **Library**.
  - `/knowledge` = Library hub; cards open Designations, Grapes, Typical wines, Rules, Wine Map.
  - `/knowledge/type-designations` redirects to `/knowledge/designations`.
  - Overview: Why-cards, Variation-cards, blind-tasting callout, and a Browse directory grouped by Bordeaux / Burgundy / Alsace + a Glossary group. No empty systems (Cru Bourgeois, Burgundy Premier/Village) appear.
  - **1855 Médoc**: Overview shows five growth cards (1er–5e) with château names; the Châteaux tab lists all 61; breadcrumb `Library › Designations › Bordeaux › …`; no map.
  - **Burgundy Grand Cru**: Overview shows the hierarchy pyramid, a Burgundy-framed map with the grand-cru sites, and a By sub-region list (Côte de Nuits, Côte de Beaune, …); the All vineyards tab lists all 33; clicking a sub-region opens it on the full Wine Map.
  - A non-flagship system (e.g. Alsace Grand Cru) renders a tidy tier/member page via the same template.
  - A glossary category (e.g. Prädikat) lists its terms.
  - Legible at phone width.

- [ ] **Step 4: Hero images.** Deep-dive heroes read from `/public/designations/<key>.jpg` (`medoc-1855.jpg`, `burgundy-grand-cru.jpg`); until those files exist the header shows the gradient fallback. Owner drops real images in and redeploys — no code change.

---

## Notes for the implementer

- **`supabase-js` embedded-count avoidance:** member counts are tallied in JS from a flat `designation_id` select (Task 1) rather than an embedded aggregate, to keep the typed client happy.
- **`[key]` / `[category]` git adds** need a literal pathspec in PowerShell (`git add -- ':(literal)…'`) — brackets otherwise glob.
- **Hand-patched types:** if `tsc` complains that a selected column is missing from `Database`, the generated `src/lib/supabase/database.types.ts` may need the column added by hand (repo convention) — but this plan selects only pre-existing columns, so none is expected.
