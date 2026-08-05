# Cellar bulk scan import — design

Date: 2026-08-05
Status: approved (pending spec review)

## Goal

Let someone stock their cellar quickly by scanning several bottles back to back,
then confirming them in one pass. Today each bottle costs a full round trip:
open the add-wine popup, scan, fill the form, save, repeat.

## Scope

- A **cellar-only** bulk path: scan N labels, then add N lots to *your* cellar.
  Genuinely new wines get a catalog entry created as a side effect, exactly as
  the existing single-wine cellar flow does.
- Entry point lives beside the existing "Scan the label instead" action in the
  cellar add-wine popup.
- No schema changes. No changes to the catalog or tasting add-wine flows.

Out of scope: bulk import into the catalog or a tasting; CSV import (already
exists separately); editing lots after they're saved.

## Flow

### 1. Scan loop

A modal with one prominent Scan button. Each capture:

1. uploads the photo to `wine-images` under `catalog/staging/${userId}` (same
   path the single scan uses),
2. calls `identifyWineFromLabel(publicUrl)`, then `resolveWinePrefill(extracted)`,
3. appends a row to a growing list.

The primary button then reads **"Scan another"**, so several bottles can be shot
without touching anything else. The header counts: *"8 scanned"*.

Scans resolve **in parallel and in the background** — a row that is still
resolving shows a spinner and never blocks the next scan.

Each row shows:

- the label thumbnail,
- a best-guess title (producer · wine name · vintage) from the extracted label,
- a badge: **In catalog** when the scan matched an existing catalog wine
  (`ScanResult.matches[0]`), or **New wine** when it didn't,
- an **✕** that removes *that scan only*.

A scan whose read fails shows "Couldn't read this label" with **Retry** and
**Remove**; it never aborts the batch.

### 2. Lot defaults

One short step, all fields optional, applied to every wine in the batch:

- bottle size (750 ml prefilled), price per bottle + currency (currency
  prefilled from the profile), purchase date, purchase source, storage
  location, drink-from / drink-to.

Anything left blank stays blank on every lot.

**Quantity is not asked.** Each scanned bottle is one bottle: `quantity = 1`.

### 3. Queue

Wines are confirmed one at a time: *"Wine 3 of 8"* plus a progress bar and a
running *"5 added"* tally.

Each step renders the existing `CellarLotForm`, pre-filled with:

- that scan's identity (`initialWine` from `resolveWinePrefill`, including the
  label photo as `imageUrl`), or `initialCatalogWineId` + label when the scan
  matched an existing catalog wine — which renders the form's compact
  "existing wine" mode, so a match is just a confirmation,
- the lot defaults from step 2.

This is where a wrong scan gets corrected: it is the full form, so every field
is editable before saving.

Actions per step: **Save & next** (the form's own submit) and **Skip this wine**.

Closing the modal mid-queue keeps every lot already saved — nothing is
transactional across wines.

### 4. Done

A summary — "Added 8 wines to your cellar" — then close and `router.refresh()`
so the cellar list shows the new lots.

## Architecture

- **New** `src/components/scan/bulk-scan-modal.tsx` (client): owns the whole
  flow as a small state machine — `scanning` → `defaults` → `queue` → `done` —
  and holds the scan list.
- **`add-wine-context.tsx`**: gains `openBulkScan()` and renders the modal, the
  same way `openScan` works today.
- **`cellar-add-wine-modal.tsx`**: a second button, "Scan several labels", next
  to the existing "Scan the label instead".
- **Reused unchanged**: `identifyWineFromLabel`, `resolveWinePrefill`
  (`src/app/scan/actions.ts`), `addCellarLot` (via `CellarLotForm`).
- **`CellarLotForm`**: gains one optional `initialLot` prop carrying the step-2
  defaults (bottle size, price, currency, purchased on, source, storage
  location, drink window). Its existing lot-field state simply initialises from
  it. Every current caller keeps working — the prop is optional.

### Scan record (in-memory only)

```ts
type BulkScan = {
  id: string;                 // client-side key
  imageUrl: string;           // uploaded label photo
  status: "resolving" | "ready" | "failed";
  title: string;              // producer · wine · vintage, for the row
  prefill?: WineFormInitial;  // resolved identity (new wine)
  match?: { id: string; label: string }; // matched catalog wine
  error?: string;
};
```

Nothing is persisted until each queue step saves; abandoning the scan loop
leaves only the uploaded photos in staging, which is already true of the single
scan flow.

## Error handling

- **Upload or read failure**: that row goes `failed` with Retry / Remove. The
  batch continues.
- **Prefill resolution failure**: same treatment — the row is removed or
  retried rather than entering the queue half-built.
- **Save failure in the queue**: `CellarLotForm` shows its own error and stays
  on that wine; the user can fix and retry or skip.
- **Empty batch**: "Add N wines" is disabled until at least one row is `ready`.

## Verification

- `tsc --noEmit` clean per increment.
- Owner QA: scan 3 bottles (one a known catalog wine, one new, one deliberately
  unreadable), remove one, set a storage location as a default, confirm the
  queue pre-fills correctly and the lots land in the cellar with quantity 1.

## Increments

1. `CellarLotForm` accepts `initialLot`; no UI change yet.
2. Bulk scan modal: scan loop + review list with per-row remove (ends at a
   disabled "Add N wines").
3. Lot-defaults step + queue + done summary; wire `openBulkScan` and the cellar
   popup entry point.
