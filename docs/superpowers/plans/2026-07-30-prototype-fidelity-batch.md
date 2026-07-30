# Prototype-fidelity Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the owner's prototype-fidelity batch — fix catalog photo uploads, real SVG flags, map icon, remove stray scrollbar "arrows", catalog date-added, a page-jump pagination dropdown, a wine-hub Structure panel, results rebuild, new-tasting restyle, cellar import button, and create-time wine photos.

**Architecture:** Brownfield Next.js 16 App Router + Supabase. Two DB migrations (Storage RLS policy; an aggregate RPC) applied via the untracked scratch applier and covered by `node --test`. The rest are component/UI changes reusing the existing Base UI + cva kit. Each task is independently testable and shippable.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (Postgres + Storage + RLS), Tailwind v4, Base UI (`@base-ui/react`), cva, lucide-react, `flag-icons` (new dep).

## Global Constraints

- Migrations: filenames `20260829250000+`; apply with `node scripts/scratch-apply.mjs --file <path> --mode dry` then `--mode live`. NEVER commit the applier or `DB_PASSWORD` (env only). Latest live before this batch = `20260829249000`.
- DB tests: `node --test scripts/<name>.test.mjs`; `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`; wrap in `withRollback`; RLS probes use `set local role authenticated` + `set_config('request.jwt.claims', …)`. Model: `scripts/wset-notes.test.mjs`.
- UI verification: remove `.next` first, then `npx tsc --noEmit` must print `TSC 0`. No component/UI test harness exists.
- Commit AND push per task (`master` → Vercel auto-deploy). PowerShell shows git stderr as "RemoteException"; success = `EXIT=0`.
- Design tokens already in `globals.css`: bordeaux `#5c1a2b`, gold `#c3a25b`, parchment `#f5efe3`; Cormorant headings, Manrope body. Kit = Base UI + `cva` + `cn` + `data-slot`.
- OUT OF SCOPE / do not touch: live `/play` screen, Knowledge map. Cellar stays top-tabs.

## Files touched (map)

- Create: `supabase/migrations/20260829250000_wine_images_catalog_policy.sql`, `supabase/migrations/20260829251000_catalog_wine_structure.sql`
- Create: `scripts/wine-images-catalog-policy.test.mjs`, `scripts/catalog-wine-structure.test.mjs`
- Create: `src/components/country-flag.tsx` (SVG flag component), `src/app/catalog/[wineId]/wine-structure.tsx` (Structure panel)
- Rewrite: `src/lib/country-flag.ts` (name→ISO2 code map), `src/app/tastings/[id]/results/page.tsx`
- Modify: `src/components/ui/pagination.tsx`, `src/app/globals.css`, `src/components/ui/tabs.tsx`, `src/components/knowledge-tabs.tsx`, `src/app/taste/tastings-tabs.tsx`, `src/app/catalog/catalog-list.tsx`, `src/app/catalog/page.tsx`, `src/app/catalog/[wineId]/page.tsx`, `src/lib/wset/queries.ts`, `src/app/cellar/page.tsx`, `src/app/catalog/new/new-wine-form.tsx`, `src/app/catalog/new/actions.ts`, `src/app/tastings/new/new-tasting-form.tsx`, `src/lib/supabase/database.types.ts`
- Dependency: add `flag-icons` (import its CSS once, e.g. in `src/app/globals.css` or root layout).

---

## Tasks (each: implement → clear `.next` + `tsc --noEmit` = TSC 0 → commit + push)

### Task 1 — Real SVG flags (spec item 9)
- Add dep `flag-icons`; import `flag-icons/css/flag-icons.min.css` once (globals.css `@import` at top, or root layout).
- Rewrite `src/lib/country-flag.ts`: keep the name-keyed map but map name→ISO2 (`france→"fr"`, `"united states"→"us"`, …); export `countryCode(name): string | null` (lowercase/trim lookup). Keep old `countryFlag` deleted/replaced.
- Create `src/components/country-flag.tsx`: `CountryFlag({ name, className })` → `const c = countryCode(name); if (!c) return null; return <span className={cn("fi", ` + "`fi-${c}`" + `, "rounded-[2px]", className)} aria-hidden />`.
- Swap render sites to `<CountryFlag name={...} />` + text: `catalog-list.tsx` desktop Country cell and mobile card; `catalog/[wineId]/page.tsx` country Badge; `results/page.tsx` country line. NOTE: native `<option>` can't hold an SVG — the country filter dropdown shows the **name only** (no flag) there.

### Task 2 — Storage policy: catalog wine-hub uploads (spec item 1)
- Create `supabase/migrations/20260829250000_wine_images_catalog_policy.sql`: three policies (insert/update/delete) `to authenticated` with `bucket_id='wine-images' and (storage.foldername(name))[1]='catalog'`. Public read already exists.
- Test `scripts/wine-images-catalog-policy.test.mjs`: as `authenticated` (+jwt uid), `insert into storage.objects(bucket_id,name,owner)` with `name='catalog/<uuid>/probe.jpg'` succeeds; with `name='<uuid-not-a-tasting>/probe.jpg'` raises RLS violation. `withRollback`.
- `--mode dry`; run test (fails — policy absent); `--mode live`; run test (passes). Commit migration + test only.

### Task 3 — Add bottle photo during catalog wine creation (spec item 11)
- Read `catalog/new/new-wine-form.tsx` + `actions.ts` first. Add `<ImageUploader name="catalog_image" bucket="wine-images" folder={`catalog/staging/${userId}`} label="Add a bottle photo" aspectClassName="aspect-[3/4] max-w-40" />` into the form; thread `userId` (from server page) as a prop. In the create action, read `catalog_image` and include `image_url` in the `catalog_wines` insert.

### Task 4 — Cellar import button (spec item 10)
- `app/cellar/page.tsx`: replace the "Import" text `Link` with an outline `Button` (asChild `Link` to `/cellar/import`) labelled `Import CSV from CellarTracker` (add an `Upload`/`FileUp` lucide icon).

### Task 5 — Map icon on map button (spec item 2)
- `app/catalog/[wineId]/page.tsx` (~L107-112): add lucide `MapPin` before the label; drop the trailing `→`.

### Task 6 — Remove the "white arrows" (spec item 3)
- `globals.css`: add `.no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }`.
- Add `no-scrollbar overflow-y-hidden` to the three strips: `ui/tabs.tsx` underline variant class, `components/knowledge-tabs.tsx:48`, `app/taste/tastings-tabs.tsx:68`.

### Task 7 — Catalog "date added" column + sort (spec item 4)
- `app/catalog/page.tsx`: add `created_at` to the select; map to `addedAt` on the row.
- `catalog-list.tsx`: add `addedAt: string` to `CatalogRow`; render an **Added** column (desktop) + include in mobile card (`toLocaleDateString`); add SortKey `"added"` + a "Recently added" sort option (desc by addedAt).

### Task 8 — Pagination page-jump dropdown (spec item 5)
- `ui/pagination.tsx`: add optional `showJump?: boolean` prop; when set, render a Base UI `Select` ("Page N / M") next to the chevrons that navigates via `hrefFor`. Keep existing numbered links.

### Task 9 — `catalog_wine_structure` RPC (spec item 6, DB)
- Create `supabase/migrations/20260829251000_catalog_wine_structure.sql`: SECURITY DEFINER function `catalog_wine_structure(p_catalog_wine_id uuid)` returning `table(dimension text, avg_index numeric, max_index int, n int)`; per dimension (nose_intensity, sweetness, acidity, tannin, alcohol, body, flavour_intensity, finish) map enum→ordinal via CASE, `avg` + `count` over all `wset_notes` for the wine, `having count>0`. `grant execute to authenticated`.
- Test `scripts/catalog-wine-structure.test.mjs`: seed a catalog wine + 2 notes with known levels (rollback), assert returned avg_index for a dimension. `withRollback`.
- dry → live → test → commit migration + test.

### Task 10 — Wine-hub Structure panel + Overview (spec item 6, UI)
- `lib/wset/queries.ts`: `fetchWineStructure(supabase, wineId)` calling the RPC, returning typed `{ dimension, avgIndex, maxIndex, n }[]`.
- `database.types.ts`: add the RPC to `Functions`.
- Create `catalog/[wineId]/wine-structure.tsx`: read-only panel; each dimension a labelled mini scale (dot at `avgIndex/maxIndex` on a track), reuse `LEVEL_STOPS`/labels vocabulary; dimension label map (e.g. `nose_intensity → "Nose"`).
- `catalog/[wineId]/page.tsx`: render `<WineStructure>` beside "What people find" in a responsive `grid` (`sm:grid-cols-2`) that fits without vertical scroll.

### Task 11 — Results screen rebuild (spec item 7, read-only)
- Rewrite `app/tastings/[id]/results/page.tsx` to the prototype: cover-image header (if `tasting.image_url`), title + status/meta, wine chips + progress, "Wine N results" table (Attribute / Correct answer / Your guess / Points, per-attr lucide icon, green match / red miss), Standings (Final) with rank medals + score bars, existing PDF link if present else omit, "Back to tasting overview". No scoring/logic changes.

### Task 12 — New-tasting form restyle (spec item 8, cosmetic)
- Restyle `app/tastings/new/new-tasting-form.tsx` to the prototype: sectioned card, icon-led rows (format/wine source/mode/flow/leaderboard), cover-photo dropzone ("JPG, PNG up to 5MB"), Cancel / Create tasting footer. Do NOT change the submit action, field `name`s, or validation.

## Self-review

- Spec coverage: items 1→8 = Tasks 5/2,3 /6 /4/8 /9,10 /11 /12; items 9,10,11 = Tasks 1/4/3. All covered.
- No placeholders except the two rebuild tasks (11,12) which are prototype-driven — implementer reads the current file + matches the screenshot; field wiring preserved.
- Type consistency: `countryCode`/`CountryFlag` (Task 1) consumed in 7,10,11; `fetchWineStructure` types (Task 10) match the RPC columns (Task 9).
