# Scan Extraction Quality — Factual Descriptions, Estimated Price, Designation

Date: 2026-08-07
Status: Approved design

## Problem

Three complaints about what the Claude label scan returns today:

1. **Descriptions read like marketing copy.** Every wine is amazing, every
   producer legendary. The owner wants an enthusiast's reference notes — cold
   facts about terroir, appellation rules, élevage and production scale — with
   no bottle-appearance prose and no praise.
2. **No price.** The cellar's value is summed from purchase prices, which most
   lots don't carry. Claude should estimate a typical retail price at scan time;
   the user can edit it; cellar value prefers it over purchase price.
3. **Designation is never extracted.** Labels print *Gran Reserva*, *Kabinett*,
   *Brut Nature* — the form has a `type_designations` field, but scans leave it
   blank.

A fourth, structural: the extraction asks for JSON in a text prompt and parses
the reply by slicing from the first `{` to the last `}`. One chatty preamble or
a `max_tokens` truncation (currently 1024, with `rawText` + description inside)
and the scan fails.

## Design

### Extraction (`src/lib/label-scan/extract.ts`)

- **Tool-use structured output.** The schema becomes a forced tool call
  (`tool_choice: { type: "tool" }`), so the API returns schema-valid JSON or
  nothing. `parseJson()` is deleted; `coerce()` stays as a final type guard.
- **Model:** `claude-sonnet-5` (from `claude-sonnet-4-6`). `max_tokens: 2048`.
  One retry on 429/5xx/network, small backoff.
- **Description register**, enforced in the tool's field description: facts an
  enthusiast would want — terroir/soils, the appellation's rules as they apply
  to this wine, élevage, production scale when known, house style stated
  neutrally. Banned: bottle/label appearance, promotional adjectives
  ("legendary", "prestigious", "stunning") unless part of a verifiable
  classification name, food-pairing filler. Short and factual beats padded and
  glowing; claims the model cannot stand behind are omitted, not softened.
- **New fields:**
  - `designation: string | null` — the label's quality/ageing/style term in
    canonical form (Gran Reserva, Kabinett, Brut Nature, Riserva, VORS…).
  - `estimatedPriceDkk: number | null` — typical current retail price for this
    wine and vintage in DKK; null when genuinely unknown. An estimate is the one
    *judgement* (vs reading) we ask for, hence editable and nullable.
- **Fix:** `vintageKind` no longer silently defaults to `"YEAR"`; unknown with
  no year parsed coerces to `"NV"`.

### Prefill (`src/app/scan/actions.ts` → `resolveWinePrefill`)

- `designation` resolves against `type_designations` (is_active only):
  accent-insensitive exact name match; a row whose `country_id` matches the
  resolved country beats a global row. Sets `typeDesignationId`.
- `estimatedPriceDkk` rides into `WineFormInitial` as an editable string field.

### Schema

Migration `20260829266000_catalog_wine_estimated_price.sql`:

```sql
alter table catalog_wines
  add column estimated_price numeric check (estimated_price >= 0),
  add column estimated_price_currency text not null default 'DKK';
```

Wine-level and shared (owner decision): a market estimate is a property of the
wine, not of one person's purchase. Editable in the wine form next to the
description.

### Cellar value

Per lot, the effective per-bottle value is:

1. the catalog wine's `estimated_price`, when `estimated_price_currency`
   matches the viewer's preferred currency (same guard purchase prices use);
2. else the lot's `price_per_bottle` under the existing currency guard;
3. else the lot contributes bottles but no value.

Touches `src/app/cellar/page.tsx`, `src/app/u/[id]/cellar/page.tsx`,
`src/app/cellar/stats.ts`. The summary card is relabelled **"Estimated value"**
so the number is honest about what it is.

## Out of scope

- FX conversion between estimate currencies (everything defaults DKK today).
- Re-estimating existing catalog wines (scan-time + manual edit only).
- The auth-branch scan changes (`auth-phase-1` touches `scan/actions.ts`; the
  merge is handled when that branch goes live).

## Verification

- Live probe: scan a real label and inspect the description register, price
  plausibility, designation mapping.
- `scripts/` test for designation resolution and coerce edge cases where the
  logic is pure.
- `tsc`, eslint, `next build` clean; cellar totals spot-checked against a lot
  with and without an estimate.
