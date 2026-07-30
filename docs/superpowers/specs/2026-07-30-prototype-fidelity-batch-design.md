# Prototype-fidelity batch — wine hub, uploads, catalog, tastings, pagination

Date: 2026-07-30
Status: Draft for owner review

## Context

Owner reviewed 9 prototype screens (`Desktop\wine prototype screens`) and requested
a batch of fixes plus prototype-fidelity rebuilds, to be done "in one pass." The
design system already matches the prototypes (bordeaux `#5c1a2b`, gold `#c3a25b`,
parchment `#f5efe3`, Cormorant/Manrope, Base UI + cva + `data-slot`). This is a
component/feature pass, not a rebrand.

Held for owner preview (OUT OF SCOPE here): live `/play` screen, Knowledge map.
Cellar stays top-tabs; the mockup's left sidebar is deferred to its own project.

Migrations start at `20260829250000` (latest live = `20260829249000`). DB changes
applied via the untracked scratch applier (dry then live) and covered by
`node --test` suites (pgConfig, `withRollback`, `set local role authenticated`,
jwt claims), mirroring `scripts/wset-notes.test.mjs`. UI verified by `tsc --noEmit`
(clear `.next` first) + visual match to prototypes. Commit + push per item.

## Items

### 1. Fix catalog wine-hub photo upload (Storage RLS) — the "can't upload jpeg" bug

Root cause: `src/app/catalog/[wineId]/wine-image.tsx` uploads to the `wine-images`
bucket at path `catalog/{wineId}/…`. That bucket's only INSERT/UPDATE/DELETE
policies (migration `20260714120000`) cast `(storage.foldername(name))[1]::uuid`
and require `is_tasting_host / is_tasting_participant`. The literal first segment
`catalog` cannot cast to uuid, so Postgres throws and Storage rejects the write —
for ALL image types, not just jpeg. There is no jpeg-specific block (`accept="image/*"`,
no bucket `allowed_mime_types` in the migration).

Fix: migration `20260829250000_wine_images_catalog_policy.sql` adding
insert/update/delete policies on `storage.objects` for
`bucket_id = 'wine-images' AND (storage.foldername(name))[1] = 'catalog'`, role
`authenticated`. Real "who may edit this wine" authorization already lives in the
`setCatalogWineImage` server action; the storage blob is public-read like the
existing tasting images. Verify with a jpeg + png upload round-trip from the hub.
If a dashboard-set `allowed_mime_types` exists on the bucket, clear it.

### 2. Map icon on "View … on the map" buttons

`src/app/catalog/[wineId]/page.tsx` (~L107-112): add a lucide `MapPin` before the
label on the appellation map pill. It is the only such button today; any future
"… on the map" action reuses the same icon+pill pattern.

### 3. Kill the "white arrows" (native scrollbars on tab strips)

Root cause: `overflow-x-auto` on tab strips forces `overflow-y` to compute to
`auto` (CSS spec), so Windows renders a vertical scrollbar's up/down arrow buttons
whenever the strip content is a hair too tall (`-mb-px`, badges). Fix: add a real
`.no-scrollbar` utility to `globals.css` (`scrollbar-width: none` +
`::-webkit-scrollbar { display: none }`) and apply it plus `overflow-y-hidden` to
the three strips: `components/ui/tabs.tsx` (underline variant), `knowledge-tabs.tsx`,
`app/taste/tastings-tabs.tsx`. Side benefit: makes `command.tsx`'s already-referenced
`no-scrollbar` class real.

### 4. Catalog "date added" column + sort

`catalog_wines.created_at` already exists and the catalog query already orders by
it (`app/catalog/page.tsx:47`), so NO migration. Add `created_at` to the select and
to `CatalogRow`; render an **Added** column in the desktop table (formatted date,
`tabular-nums`) and include it in the mobile card; add SortKey `"added"` plus a
"Recently added" entry in the sort control. Enables future default-sort-by-newest.

### 5. Pagination page-jump dropdown

`components/ui/pagination.tsx` already renders prev/next chevron buttons + numbered
links + ellipsis (matches the prototype). Add an optional compact **page-jump
dropdown** ("Page X / N") built on Base UI Select, shown alongside the buttons
(prop-gated so callers opt in). Confirm catalog / community / cellar lists use this
`Pagination` component; no bespoke arrow controls remain after item 3.

### 6. Wine hub — nose/palate Structure panel + Overview alignment

The structural SAT fields are stored per note on `wset_notes` but never aggregated:
`nose_intensity, sweetness, acidity, tannin, alcohol, body, flavour_intensity,
finish` (all ordinal) plus `development`. Today only aroma descriptors
("What people find") and blind guess stats are surfaced.

DB: new SECURITY DEFINER RPC `catalog_wine_structure(p_catalog_wine_id uuid)` that
averages each structural dimension across ALL notes (any author), returning per
present dimension `{ dimension, avg_index, max_index, n }` — same public-aggregate
privacy model as `catalog_wine_guess_stats` (aggregates only, no per-user rows).
Each enum maps to an ordinal index via CASE. Dimensions with `n = 0` are omitted,
which auto-hides tannin for whites. Migration `20260829251000_catalog_wine_structure.sql`.

Query: `fetchWineStructure` in `lib/wset/queries.ts` returning typed rows.

UI: a read-only **Structure** panel beside "What people find", rendering each
dimension as a labelled mini level-scale (single marker at `avg_index/max_index`),
reusing `LEVEL_STOPS` and the WSET label vocab (like `archetype-sheet.tsx`'s
`RangeSlider`, single-marker variant). Bring the Overview toward the prototype:
What people find + Structure + About this wine + Blind track record arranged in a
responsive grid that fits without vertical scroll on desktop. The aggregate spans
all `context_kind`s (OPEN/BLIND/TRAINING) — every real assessment of the same
physical wine — with per-dimension nulls excluded.

### 7. Results screen rebuild (read-only, safe)

Rebuild `app/tastings/[id]/results/page.tsx` to the prototype: optional cover-image
header, title + status/meta line, wine chips + completion progress, a "Wine N
results" table (Attribute / Correct answer / Your guess / Points, per-attribute
icons, green when the guess matches / red when it misses), a Standings (Final)
panel with rank medals and score bars, "Download results (PDF)" (wire to the
existing export if present, else omit), and "Back to tasting overview". READ-ONLY
render only — no changes to scoring, `wine_answers`, or guess logic.

### 8. New-tasting form restyle (cosmetic)

Restyle `app/tastings/new/new-tasting-form.tsx` to the prototype: sectioned card,
icon-led field rows (format / wine source / mode / flow / leaderboard reveal),
cover-photo dropzone labelled "JPG, PNG up to 5MB", Cancel / Create-tasting footer.
NO changes to the submit action, field `name`s, or validation — visual only. (Its
photo upload targets the `tasting-images` bucket, which is already correctly
scoped, so item 1 does not affect it.)

## Testing & delivery

- `tsc --noEmit` clean (clear `.next` first) after each item; commit + push per item.
- New RPC + storage policy: apply via scratch applier (dry then live); cover with
  `node --test` (pgConfig, `withRollback`, `set local role authenticated`, jwt
  claims) — structure RPC returns aggregates for a seeded wine; storage policy
  permits a `catalog/` insert and still denies a bogus non-catalog/non-tasting path.
- Migrations: `20260829250000` (wine-images catalog policy), `20260829251000`
  (catalog_wine_structure RPC).
- UI verified by `tsc` + visual match (no component test harness).

## Out of scope / deferred

- Live `/play` screen and Knowledge map — owner preview before any change.
- Cellar left-sidebar navigation (mockup shows it) — deferred; Cellar stays top-tabs.
- Full Cellar inventory rebuild (Added column / sort / view toggle) — not requested
  this pass; only incidental fixes (white-arrows, pagination, flags) land there.
