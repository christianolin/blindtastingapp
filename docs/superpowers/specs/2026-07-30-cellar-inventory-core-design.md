# Cellar — Inventory Core Design

**Status:** Approved design (2026-07-30). Sub-project 1 of 5 in the Cellar
pillar — a reframing of the foundation spec's one-line "P6 — Cellar". Refined as
later sub-projects land.

**Project:** Blindr (blind wine-tasting app) — Next.js 16 + Supabase; `master`
auto-deploys to Vercel.

## 1. Purpose & context

The foundation spec (2026-07-29) sketched P6 as "`/cellar` = my notes." That was
wrong. **Cellar is a per-user wine inventory system** — a management pillar where
each user records the bottles they physically own, sees stats on them, drinks
them (into tastings/notes), imports from CellarTracker-style tools, and browses
other collectors' cellars. Because a cellar wine is created through the shared
`catalog_wines` identity, cellars also feed the catalog that tastings and notes
already use.

This is large enough to **decompose into five sub-projects**, each its own
spec → plan → build, plus a small standalone Community route-rename that rides
along:

1. **Inventory core (this spec)** — the `cellar_lots` data model + add / edit /
   list / adjust UI; owner-only.
2. **Drink + notes** — consume a bottle (decrement a lot) and link it to a WSET
   note; the "drink it" path from the cellar into Taste.
3. **Stats** — cellar value, spend-over-time, drink-window readiness, breakdowns
   by region / colour / vintage.
4. **Import** — CellarTracker (and similar) CSV import, mapping rows to catalog
   identities + lots.
5. **Social** — view other users' cellars; per-lot / collection visibility +
   broadened RLS.

### Success criteria (inventory core)
- A user can add a wine they own, choosing an existing catalog identity or
  creating a new one, and set quantity, format, and optional purchase details.
- The cellar lists their lots grouped by wine with a live bottle count and (when
  priced) a total value.
- Editing a lot, adjusting its count, or deleting it never affects another
  user's data or any past tasting result.
- A user can reach their own tasting notes from the cellar.
- No other user can read or modify a user's lots.

### Non-goals (this sub-project)
Consuming/decrementing via a tasting flow, stats graphs, CSV import, viewing
others' cellars, visibility controls, market/valuation pricing, multi-currency
conversion. Columns/hooks that *enable* these are in scope only where cheap and
named here.

## 2. Data model

### 2.1 `cellar_lots` (new table)
A **lot** is one purchase line of one wine: the same catalog wine bought on two
dates, or in two formats, is two lots. `quantity` is **live** — it mutates as
bottles leave (via the later drink sub-project, or a manual adjust here) — while
`purchased_quantity` is frozen so spend history survives drinking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `owner_id` | uuid not null → profiles(id) on delete cascade | the collector |
| `catalog_wine_id` | uuid not null → catalog_wines(id) on delete restrict | shared identity |
| `bottle_size_ml` | int not null default 750 | format (375/750/1500…) |
| `quantity` | int not null check (quantity >= 0) | live count |
| `purchased_quantity` | int not null check (purchased_quantity >= 1) | frozen original, for spend |
| `price_per_bottle` | numeric(10,2) null check (>= 0) | optional |
| `currency` | text not null default from profile | ISO-4217; no conversion in core |
| `purchased_on` | date null | powers spend-over-time |
| `purchase_source` | text null | merchant |
| `drink_from` | int null | drink-window start year |
| `drink_to` | int null | drink-window end year |
| `storage_location` | text null | |
| `lot_note` | text null | private |
| `created_at` / `updated_at` | timestamptz not null default now() | `updated_at` via `set_updated_at` trigger |

Checks: `quantity >= 0` (a manual adjust may correct an over-count, so
`quantity <= purchased_quantity` is **not** enforced); `drink_to >= drink_from`
when both are set.

### 2.2 `profiles.preferred_currency`
Add `profiles.preferred_currency text not null default 'DKK'`. A new lot defaults
its `currency` from it; stored per-lot so changing the preference never rewrites
history. No conversion in core.

### 2.3 RLS
`cellar_lots` is **owner-only** for every verb: `using (owner_id = auth.uid())`
for select/update/delete and `with check (owner_id = auth.uid())` for
insert/update. The social sub-project later adds a `visibility` column and a
broadened `select` policy — not now, so the column and the policy that reads it
ship together.

## 3. Add-to-cellar flow

A cellar wine is a first-class catalog identity, reusing the P5 catalog-first
machinery:
- **Pick existing:** `search_catalog_wines(query)` → choose a row → its
  `catalog_wine_id`.
- **Create new:** fill the identity fields (producer, name, appellation, colour,
  style, vintage, grape…) → `find_or_create_catalog_wine(p)` → `catalog_wine_id`.
- Then insert the lot. A single SECURITY INVOKER RPC
  **`add_cellar_lot(p jsonb) returns uuid`** wraps find-or-create + the lot
  insert so both happen atomically and RLS still applies (`owner_id =
  auth.uid()`). Lot-only edits/deletes go through PostgREST under RLS (no RPC).

## 4. App surface

### 4.1 Routes
| Route | Purpose |
|---|---|
| `/cellar` | your cellar — **Bottles** tab and **My notes** tab |
| `/cellar/new` | catalog-first add + lot fields |
| `/cellar/[lotId]/edit` | edit fields, adjust count, delete |

Reclaims `/cellar`: remove the P3 `next.config` redirects `/cellar → /catalog`
and `/cellar/:path* → /catalog/:path*`. The shared catalog stays at `/catalog`;
the P3 redirects were explicitly temporary for this handoff.

### 4.2 Cellar page
- **Bottles tab:** lots grouped by catalog wine (title via `catalogWineTitle`),
  each row showing format, live count, drink window, location; a summary bar —
  total bottles · distinct wines · total value when any prices exist, in the
  user's preferred currency. "Add wine" CTA → `/cellar/new`. Empty state nudges
  to add (import is deferred).
- **My notes tab:** the user's own `wset_notes`, newest first — wine title,
  point score, tasted date, context chip — linking to
  `/catalog/[wineId]/notes/[noteId]`. Read-only list; notes are authored
  elsewhere.

### 4.3 Nav
`nav-links.ts` → five pillars: **Taste · Catalog · Cellar · Knowledge ·
Community**. The People/Friends → Community rename is a separate small change
tracked with this pillar, not blocking inventory core.

## 5. Testing
- **DB (`node --test`, pooled DB):** `cellar_lots` RLS — a second user cannot
  select / update / delete another's lots; `add_cellar_lot` inserts under
  `auth.uid()` and find-or-creates the identity (no duplicate catalog row for an
  existing identity); the quantity and drink-window checks reject bad rows; the
  `preferred_currency` default is applied to a new lot.
- **Types:** `database.types.ts` gains `cellar_lots` Row/Insert/Update, the
  `add_cellar_lot` RPC, and `profiles.preferred_currency`; `tsc --noEmit` clean.
- **Manual smoke:** add a wine (existing + new identity), edit count, delete;
  My-notes tab renders.

## 6. Risks & open questions
- **R1:** duplicate catalog identities from cellar adds. Mitigation: the same
  find-or-create + `search_catalog_wines` picker as tastings; the identity index
  already dedups.
- **R2:** live-quantity loses per-bottle drink history (chosen over a ledger).
  Accepted; `purchased_quantity` preserves spend math, and the drink sub-project
  can add a lightweight consumption log later if wanted.
- **R3:** currency without conversion means a mixed-currency cellar has no single
  true total. Accepted for core; the value summary sums the preferred currency
  and notes any excluded lots. The stats sub-project owns conversion.
- **Open:** grouped vs flat lot list on the Bottles tab — start grouped by wine;
  revisit if noisy.

## 7. Deferred (roadmap)
Sub-projects 2–5 above, each its own spec. The lot's live `quantity`,
`purchased_quantity`, `purchased_on`, and `price_per_bottle` are the hooks the
drink and stats pieces build on; `add_cellar_lot` + catalog reuse is the hook
import builds on; owner-only RLS is what social broadens.
