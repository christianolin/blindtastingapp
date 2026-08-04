# Overview / home page redesign — design

Date: 2026-08-04
Status: approved (pending spec review)

## Goal

Turn the authenticated overview page (`/taste`, `src/app/taste/page.tsx`) from a
plain "pick a mode" dashboard into a professional landing surface that states
Blindr's purpose and mission, then flows into the user's tastings. It should set
the tone of the app: a structured, learning-oriented wine community.

## Scope

- **Rebuild the body** of `src/app/taste/page.tsx`.
- **Keep** the existing `AppHeader` / navigation exactly as-is. The mockups show a
  reimagined left sidebar (and still say "Import CSV" etc.) — nav is explicitly
  **out of scope**; ignore those mockup details.
- **Keep** `TastingsTabs` and `TastingCard` unchanged — same tabs
  (Invited / Hosting / Attending / History) and the same tasting pills.
- **Remove** the current per-user stat tiles (Tastings / Wines guessed / Avg
  points / Total points) and the "What are you tasting today?" heading.
- **Replace** the four mode boxes (`ModeTiles`) with a single **Start tasting**
  dropdown, plus an **Explore & learn** button.

Out of scope: nav/sidebar redesign, a new "all tastings" page, any change to the
taste launcher popup flow itself.

## Approach

- The page remains a **server component**. It fetches data and composes sections.
- The only client island is the **Start tasting** dropdown, which reuses the
  existing `useTasteLauncher().openTaste(kind)` hook (same mechanism `ModeTiles`
  uses today) from `@/components/taste-launcher-context`. Kinds: `blind`,
  `semi-blind`, `rate`.
- The KPI row and explainer cards are **static server-rendered** markup.

### App-wide stats (accurate totals)

Raw `COUNT`s issued through the user's Supabase client are **RLS-scoped** —
`tastings` and `wset_notes` are row-restricted, so a logged-in user would get
undercounts rather than true app-wide totals. We add a **SECURITY DEFINER**
SQL function so the four headline numbers are correct regardless of RLS.

- New migration: `supabase/migrations/20260829263500_get_app_stats.sql`
  (next free number after the current highest, `20260829263400`).
- Function `public.get_app_stats()` returns one row:
  - `members` = `count(*)` from `profiles`
  - `tastings` = `count(*)` from `tastings`
  - `wines_catalogued` = `count(*)` from `catalog_wines WHERE blind_pending = false`
    (matches the browsable catalog, which filters `blind_pending = false`)
  - `notes_created` = `count(*)` from `wset_notes`
- `SECURITY DEFINER`, `SET search_path = public`, `STABLE`. Revoke from
  `public`/`anon`; `GRANT EXECUTE` to `authenticated`.
- New lib `src/lib/app-stats.ts` → `getAppStats(): Promise<AppStats>` calls the
  RPC and returns `{ members, tastings, winesCatalogued, notesCreated }` (numbers,
  defaulting to 0). Called from the page's existing `Promise.all`.
- Formatting: show the raw integer; abbreviate with a `k` suffix only at ≥10,000
  (e.g. `12.4k`). Real numbers are currently small — that is expected and fine.

## Sections (top → bottom)

### A. Hero

- **Desktop:** two columns — copy on the left, the blurred Romanée-Conti photo on
  the right, bleeding to the top/right edge with a soft gradient fade into the
  cream background on the copy side.
- **Mobile:** stacked per the phone mockup (title, subtexts, actions; photo sits
  top-right / as a banner).
- **Title** (serif heading, large): `Understand what's in the glass.`
- **Subtext paragraph 1** (regular weight):
  > We believe wine deserves more than a quick score. By giving people a
  > structured way to observe, describe, compare and learn, Blindr helps curious
  > drinkers develop their palate, appreciate complexity and build real wine
  > knowledge over time.
- **Subtext paragraph 2** (bold):
  > We built Blindr for wine enthusiasts, committed beginners, blind tasters,
  > collectors and professionals who want to learn more from every bottle — and
  > share that with a community of like-minded people.
- **Actions:**
  - **Start tasting ▾** — primary button opening a dropdown menu:
    Taste Blind → `openTaste("blind")`, Taste Semi-Blind → `openTaste("semi-blind")`,
    Taste & Rate → `openTaste("rate")`. Training Room appears **disabled** with a
    "Soon" tag (mirrors the nav / current teaser).
  - **Explore & learn** — outline button, navigates to the Wine Map at
    `/knowledge/map`.
- **Image:** `/hero/romanee-conti-1945.jpg` (owner drops the file at
  `public/hero/romanee-conti-1945.jpg`). Rendered blurred (light Gaussian blur +
  gradient mask), decorative (empty `alt`), non-interactive.

### B. App-wide KPIs

Row of four cards (2×2 on mobile, 4-up on desktop), each icon + big number +
label. Values from `getAppStats()`:

| Label | Source |
| --- | --- |
| Members | `profiles` |
| Tastings | `tastings` |
| Wines catalogued | `catalog_wines` (blind_pending = false) |
| Notes created | `wset_notes` |

Icons (lucide, from our established vocabulary; refine during build): Members →
`Users`, Tastings → `Wine` (glass), Wines catalogued → catalog glyph
(`BookOpen`/closest — lucide has no bottle), Notes created → `NotebookPen`.

### C. Four explainer cards

**Static / informational** (not links), matching the mockup. Icon + title + body,
verbatim copy:

1. **Taste with structure** — Create thoughtful tasting notes and scores using a
   consistent method inspired by WSET.
2. **Taste & challenge** — Host blind, semi-blind and open tastings, compare
   impressions and share experiences with friends and fellow wine enthusiasts.
3. **Understand the wine** — Explore regions, grapes, styles, classifications and
   more to connect what's in the glass with its origin.
4. **Build your cellar** — Organise your bottles, track your collection and keep
   your tasting notes in one place. Choose what to keep private and what to share.

Icons: structure → `Wine`, challenge → `EyeOff`, understand → `BookOpen`, cellar →
`Warehouse`.

### D. Your tastings

Unchanged. Heading `Your tastings`, then `TastingsTabs` with the same four buckets
and `TastingCard` pills, and the same empty state. The mockup's "View all →" link
is **omitted**: the tabs already show the complete list, and no separate
destination page exists. (If a truncated preview + full-list page is wanted later,
that's a follow-up.)

## Data flow (page)

`page.tsx` keeps its current tastings queries (participant rows, tastings, all
participants, wines) and its bucket logic. Changes:

- Add `getAppStats()` to the `Promise.all`.
- **Drop** `getProfileStats(user.id)` from this page (only used for the removed
  per-user tiles and the empty-state condition; the tasting buckets don't need
  it). `getProfileStats` stays in the codebase for the profile pages.
- The tastings empty state currently keys off `stats.summary.winesGuessed`;
  re-key it off `(tastings ?? []).length === 0` (already the outer condition).

## Files

- **New:** `supabase/migrations/20260829263500_get_app_stats.sql`
- **New:** `src/lib/app-stats.ts` (`getAppStats`, `AppStats` type)
- **New:** `src/app/taste/start-tasting-menu.tsx` (client; the dropdown)
- **New (optional):** small section components (`overview-hero.tsx`, etc.) if
  `page.tsx` grows unwieldy — decided during planning.
- **Modify:** `src/app/taste/page.tsx` (compose new sections; remove per-user
  tiles, old heading, `getProfileStats` use, `ModeTiles` use).
- **Remove:** `src/app/taste/mode-tiles.tsx` (unused once the dropdown replaces
  it — confirm no other importers; grep shows only `page.tsx`).
- **Asset (owner-provided):** `public/hero/romanee-conti-1945.jpg`.

## Increments (ship one at a time)

1. **App stats + KPI row.** Migration `get_app_stats()` (dry → live) +
   `src/lib/app-stats.ts` + wire into `page.tsx`, replacing the per-user stat
   tiles with the four app-wide KPI cards. Verifiable on its own.
2. **Hero.** Title, subtexts, `Start tasting` dropdown (`start-tasting-menu.tsx`)
   + `Explore & learn`, and the blurred hero image reference. Remove `ModeTiles`
   usage + file. (Image renders once the owner drops the file.)
3. **Explainer cards + polish.** The four static cards, remove the old
   "What are you tasting today?" heading, responsive spacing/animation polish.

## Verification

- `tsc --noEmit` clean per increment (`Remove-Item -Recurse -Force .next; npx tsc
  --noEmit`, EXIT=0).
- Migration: `node scripts/scratch-apply.mjs --file <path> --mode dry` then
  `--mode live`; sanity-check `get_app_stats()` returns sane counts.
- Owner screenshots each pushed increment (assistant can't see renders).

## Assumptions / open items

- Owner saves the exact attached two-bottle Romanée-Conti 1945 photo to
  `public/hero/romanee-conti-1945.jpg`.
- KPI labels are the four in the provided copy (phone mockup's "Countries" is
  superseded by "Wines catalogued").
- Real (small) counts are acceptable; `k` abbreviation only kicks in at ≥10k.
