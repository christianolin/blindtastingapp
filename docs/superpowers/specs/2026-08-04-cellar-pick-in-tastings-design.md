# Feature A — Pick a Wine From Your Cellar

Date: 2026-08-04
Status: Approved design (Approach 1 — app-only, no schema change)
Sequence: first of three specs (A → B → C). B = per-user tasting-note visibility; C = notes on blind/semi-blind tasting wines.

## Goal

Let a user choose a wine from their own cellar when (1) adding a wine to a blind or semi-blind tasting, and (2) using Taste & Rate — instead of only catalog-search / manual / scan. Optionally draw the poured bottle down from cellar stock.

## Surfaces

- **Tasting Add-wine** — `src/app/tastings/[id]/wines/new/wine-form.tsx`. Shared by BLIND and SEMI_BLIND (only `reveal_mode` differs; the add-wine form is the same). Reached inside a created tasting; whoever adds a wine (host, or a contributing participant) picks from their own cellar.
- **Taste & Rate** — the "rate" launcher chain: `RateWineModal` (wine picker) → `NewNoteModal` → `NoteEditor`.

The Taste launcher's "blind"/"semi-blind" tiles only *create* a tasting via `NewTastingModal`; wines are added later through the Add-wine form — that is the surface A touches.

## Design (Approach 1 — app-only, reuse existing RPCs)

### Data layer (no migration)

- **`listMyCellarLots()`** — new server action in `src/app/cellar/new/actions.ts`. Returns the caller's in-stock lots:
  - query `cellar_lots` where `owner_id = auth.uid()` and `quantity > 0`, embedding `catalog_wines` for the label.
  - shape: `{ lotId, catalogWineId, label, vintageLabel, bottleSizeMl, storageLocation, quantity }[]`, ordered by label.
- **`addTastingWineFromCellarLot(tastingId, lotId, { consume })`** — new wrapper action in `src/app/tastings/[id]/wines/new/actions.ts`:
  1. load the lot; verify `owner_id = auth.uid()` and `quantity > 0`; read its `catalog_wine_id`.
  2. call existing `addWineFromCatalog(tastingId, catalogWineId)` → inserts `wines` + `wine_answers`.
  3. if `consume`: `supabase.rpc("consume_cellar_lot", { p: { lot_id, quantity: 1, reason: "DRANK", occasion: <tasting name> } })` — best-effort (try/catch → warning).
  - returns `{ ok: true, warning?: string }`.
- **Reuses** `consume_cellar_lot(p jsonb)` — confirmed keys `lot_id`, `quantity` (default 1), `reason` (default DRANK), `consumed_on`, `occasion`, `wset_note_id`; returns the consumption id; SECURITY INVOKER (RLS applies); raises if `quantity > stock`.

### Tasting Add-wine form (`wine-form.tsx`)

- Add a **"From my cellar"** source next to the existing Catalog search / Manual / Scan.
- On select: `listMyCellarLots()`; render a picker of in-stock lots labeled `Producer Wine Vintage · 750 ml · Location · N btl`.
- Checkbox **"Remove a bottle from my cellar"** (default **off**) below the picker.
- Submit → `addTastingWineFromCellarLot(tastingId, lotId, { consume })`; then close/refresh like the other paths; surface `warning` if present.
- Empty state (no in-stock lots): a short message + link to `/cellar`.

### Taste & Rate (`RateWineModal` → `NewNoteModal` → `NoteEditor`)

- Add a **"From my cellar"** source in `RateWineModal` alongside the existing catalog search.
- Picking a lot passes `{ catalogWineId, lotId, consume }` upward (extend `onPick`); a **"Remove a bottle"** checkbox lives in the modal (default off).
- `NewNoteModal` gains an optional `cellarConsume?: { lotId: string }` prop. When set, after the note saves it calls `consume_cellar_lot({ p: { lot_id, wset_note_id: <saved note id>, reason: "DRANK" } })`. This requires `NoteEditor.onSaved` to pass the saved note id (returned by `save_wset_note`).
- If not checked → behaves exactly as today (rate the wine, no cellar change).

### Edge cases / errors

- Adding the wine (or writing the note) is the **primary** action; the draw-down is **best-effort**. If the lot hit 0 in a race, `consume_cellar_lot` raises → caught → the primary action still succeeds, with a non-blocking warning ("Added — couldn't update your cellar").
- Multiple lots of the same wine are listed separately, so the draw-down always targets the exact lot the user picked.
- Blind integrity unchanged: identity flows into `wine_answers` (hidden until reveal); `catalog_wines.blind_pending` behaviour is unaffected.

## Files touched

- `src/app/cellar/new/actions.ts` — add `listMyCellarLots`.
- `src/app/tastings/[id]/wines/new/actions.ts` — add `addTastingWineFromCellarLot`.
- `src/app/tastings/[id]/wines/new/wine-form.tsx` — cellar source + lot picker + checkbox.
- `src/components/rate-wine-modal.tsx` — cellar source + checkbox; `onPick` carries `{ catalogWineId, lotId, consume }`.
- `src/components/new-note-modal.tsx` — optional `cellarConsume` prop; consume on save.
- `src/app/catalog/[wineId]/notes/note-editor.tsx` — ensure `onSaved` passes the saved note id.
- `src/components/taste-launcher-context.tsx` — thread the lot/consume from `RateWineModal` → `NewNoteModal`.

## Non-goals

- No `cellar_consumptions.tasting_id` link (that was Approach 2). No schema change at all.
- No changes to the catalog / manual / scan add paths.
- No "bottles I've poured in tastings" history views.

## Testing

- `tsc --noEmit` clean (clear `.next` first).
- Manual QA (screenshots): pick from cellar in a blind and a semi-blind tasting; Taste & Rate from cellar; with the checkbox on, the lot draws down (qty −1 in `/cellar`, a `cellar_consumptions` row appears); with it off, stock is unchanged; empty-cellar state; a 1-bottle lot consumed then gone from the picker.

## Risks

- Threading lot + consume through the rate chain (`RateWineModal → NewNoteModal → NoteEditor.onSaved`) is the fiddliest part; all pieces exist (`save_wset_note` returns the note id; `consume_cellar_lot` accepts `wset_note_id`).
