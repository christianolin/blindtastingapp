# Wine Label Scan → Identify & Add (+ Wine Description Field)

**Status:** Design approved 2026-08-02. Next step: implementation plan (writing-plans skill).

## Goal

Let a user photograph a wine label and have the app identify the wine —
"scan-to-identify-and-add" (Vivino-like, for v1):

- **Match** the wine if it already exists in the catalog → offer to add it to the
  cellar, taste & rate it, or view its page.
- Otherwise **prefill** an Add-a-wine form from the label so the user reviews and
  saves (creating the catalog wine).
- Nothing is persisted without explicit user confirmation.

This also adds a **free-text `description`** to catalog wines. Claude drafts it from
the label during a scan; anyone can fill it when adding a wine; the creator and
curators (ADMIN/CONTRIBUTOR) can edit it afterward.

## Decisions (from the brainstorm)

- Primary job: **both** — match existing, else prefill new.
- Entry point: an **app-wide Scan button** (in `AppHeader`, beside search).
- Automation level: **assisted** — show matches + the read-off details; the user
  confirms; never auto-save.
- Approach: **Claude vision** structured extraction (not OCR-plus-match, not a
  third-party wine API).
- Description draft source: **label text + well-known facts, as an editable draft.**
- AI provider: **Anthropic API** with `ANTHROPIC_API_KEY` (Anthropic Console,
  pay-as-you-go, server-side only). A personal Claude subscription cannot back an
  app's server calls. ~$0.01–0.03 per scan.

## Existing pieces to reuse

- Supabase Storage `wine-images` bucket + `ImageUploader` (returns a public URL).
- `search_catalog_wines` RPC (accent-insensitive pg_trgm) for matching.
- Add-a-wine forms: `src/app/catalog/new/new-wine-form.tsx` (catalog),
  `src/app/cellar/new/cellar-lot-form.tsx` (cellar); find-or-create actions
  (`createProducer` / `createAppellation` / `createRegion` / `createCountry` / `createGrape`).
- `createCatalogWine` / `updateCatalogWine` (`src/app/catalog/new/actions.ts`),
  `addCellarLot` (`src/app/cellar/new/actions.ts`).
- Catalog edit RLS (creator OR `is_curator`) + the `catalog_wine_edits` audit trigger.
- Wine hub page `src/app/catalog/[wineId]/page.tsx` (for display).
- `NoteModal` and the cellar/taste flows for the follow-on actions.

## User flow

1. **Scan button** (camera icon) in `AppHeader`, app-wide. Mobile opens the camera
   via `<input type="file" accept="image/*" capture="environment">`; desktop is a
   file picker.
2. The photo uploads to Storage (`wine-images`, `scans/{userId}/…`) → public URL.
3. Client calls the server action `identifyWineFromLabel(imageUrl)`.
4. The server action: (a) calls Claude vision with the image + a strict JSON schema
   → `extracted`; (b) runs `search_catalog_wines` on `producer + wineName +
   appellation` → `matches` (top ~5); (c) returns `{ extracted, matches }`.
5. **Results sheet** (mobile-first modal):
   - Header: the scanned photo + read-off details (producer, wine, appellation,
     vintage, colour, grapes) + a confidence badge.
   - **Matches:** cards for the top catalog matches, best guess highlighted.
     Selecting a match → actions that reuse existing flows: **Add to cellar** (the
     cellar add-lot form with this wine preselected — the user just enters
     bottles/price), **Taste & Rate** (the WSET note popup for this wine), and
     **View wine** (its hub page).
   - **"Not these / not found"** → **Add as new**: opens the Add-a-wine form
     prefilled from `extracted` (including the description draft), with the scan set
     as the bottle photo. The user reviews and saves.
6. Any create requires explicit confirmation.

## Architecture / components

**New**

- `src/components/scan/scan-button.tsx` — the header button + capture input (client).
- `src/components/scan/scan-modal.tsx` — capture → upload → results sheet (client);
  state machine: idle → uploading → identifying → results | error. Mounted app-wide
  via a small provider (same pattern as the Add-wine popup).
- `src/lib/label-scan/schema.ts` — zod schema for the extraction result.
- `src/lib/label-scan/extract.ts` — Anthropic wrapper `extractLabel(imageUrl) →
  ExtractedLabel`, behind a mockable interface so tests never hit the live API.
- `src/app/scan/actions.ts` — `identifyWineFromLabel(imageUrl)` server action:
  calls `extractLabel`, runs `search_catalog_wines`, returns `{ extracted, matches }`.
- Dependency: `@anthropic-ai/sdk`; env `ANTHROPIC_API_KEY` (server only, uncommitted).

**Changed**

- `AppHeader` — mount the `ScanButton` (+ provider/modal).
- Add-a-wine forms (catalog + cellar) — accept an optional `initial` prefill (from a
  scan), a new **Description** textarea, and an initial image URL for the uploader.
- Edit-wine modal (`src/app/catalog/[wineId]/edit-wine-modal.tsx`) — Description textarea.
- `createCatalogWine` / `updateCatalogWine` / `addCellarLot` — accept & persist
  `description` (cellar sets it on the newly-created wine, like the photo).
- Wine hub page — render the description.

## Extraction schema + prompt

`ExtractedLabel` (zod):

```
{
  producer:    string | null,
  wineName:    string | null,   // cuvée / special name
  appellation: string | null,
  region:      string | null,
  country:     string | null,
  vintageKind: "YEAR" | "NV" | "TAWNY",
  vintageYear: number | null,
  colour:      "WHITE" | "ROSE" | "RED" | "ORANGE" | null,
  grapes:      string[],
  description: string | null,   // 2–4 sentence editable draft (label + well-known facts)
  confidence:  "high" | "medium" | "low",
  rawText:     string           // everything read, for fallback/debug
}
```

Prompt requirements: strict JSON output only; distinguish label-printed facts
(reliable) from well-known facts (may be wrong → clearly a draft); if the image is
not a wine label, set fields null, confidence "low", and note it in `rawText`.
Model: a current capable Claude vision model (default to the latest, per house style).

## Matching

- Query `search_catalog_wines(p_query, p_limit=5)` with
  `[producer, wineName, appellation].filter(Boolean).join(' ')`.
- Show the top 5; mark the first as "best guess". Never auto-select.
- Zero results → the results sheet goes straight to "Add as new (prefilled)".

## Data model / migration

`20260829258000_catalog_wine_description.sql` (next free number):

- `alter table catalog_wines add column if not exists description text;`
- No RLS change — the column is governed by the existing "catalog update" policy
  (creator OR `is_curator`) and the `catalog_wine_edits` audit trigger.
- Applied via `scripts/scratch-apply.mjs` (dry → live), then committed.

## Permissions

- Set on **add** by whoever creates the wine (the creator).
- Edited afterward by **creator OR curator** — the existing `catalog_wines` update
  RLS. No new policy or code.
- Audited by the existing `catalog_wine_edits` trigger.

## Error handling / edge cases

- Blurry / unreadable → low confidence + null fields → the results sheet shows
  "Couldn't read it clearly — retry or enter manually," keeping `rawText` + the photo.
- Not a wine label → same, with a hint.
- Anthropic error/timeout → graceful message; the uploaded photo is retained so the
  user can still add manually.
- Description hallucination → editable **draft only**, with an "AI draft — check
  before saving" hint; never stored as authoritative on its own.
- Cost guard: one vision call per scan; per-user rate limiting deferred (not v1).

## Cost / latency / dependencies

~$0.01–0.03 per scan, ~2–5 s latency. Pay-as-you-go via the Anthropic Console.
`ANTHROPIC_API_KEY` server-side only, added to Vercel + local `.env` (uncommitted).

## Testing

- DB/RLS — the existing `node --test scripts/*.test.mjs` harness (`withRollback` +
  `set local role authenticated`): the `description` column exists and is writable
  by the creator/curator but denied (42501) for an unrelated authenticated user.
- `extractLabel` sits behind a mockable interface so no test hits the live Anthropic
  API; its response parsing is checked against canned Claude JSON.
- Pure TS logic (schema parse/validate, match-query construction, extracted →
  reference-option prefill mapping): the repo has **no TS unit runner today**, so the
  implementation plan picks one — add a lightweight runner (e.g. vitest) for these
  helpers, or keep them trivial and rely on `tsc` + the manual pass. Flagged as a
  plan decision, not assumed here.
- Manual: a set of easy + hard real label photos to eyeball accuracy.

## Out of scope (v1 / YAGNI)

Vivino-style ratings/community, external wine databases, barcode scanning,
batch/multi-bottle scan, an offline model, auto-save, and per-user rate limiting.
