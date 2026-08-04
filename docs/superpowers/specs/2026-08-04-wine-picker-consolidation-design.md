# Wine Picker Consolidation — Design

Date: 2026-08-04
Status: Approved design (shared internals, keep the existing triggers; shared piece = a wine picker)

## Goal

Remove the duplicated "find/add a wine" logic spread across four surfaces by extracting two shared components — a manual **identity form** and a **source switcher** (Scan · Search catalog · Add manually · From my cellar). Every existing trigger/modal stays; its body becomes a thin caller of the shared picker plus its own destination logic. A change to scanning, the manual fields, or styling then lands in one place instead of four.

## Current duplication

- `src/app/tastings/[id]/wines/new/wine-form.tsx` (tasting add): catalog search + manual identity + scan (inline `ScanModal`) + from-cellar.
- `src/app/catalog/new/new-wine-form.tsx` (catalog add): manual identity (+ scan via the catalog modal wrapper).
- `src/app/cellar/new/cellar-lot-form.tsx` (cellar add): catalog search + manual identity + from-cellar duplicate-check + lot fields.
- `src/components/rate-wine-modal.tsx` (Taste & Rate): scan + catalog search + from-cellar + add-new handoff.

Already shared: `src/components/scan/scan-modal.tsx`, `src/components/cellar-lot-picker.tsx`. The **manual identity fieldset** (Location / Identity / Age) and the **pending-producer / pending-grape create-on-save** logic are copy-pasted across wine-form, new-wine-form and cellar-lot-form — that is the core duplication.

## Design

### `WineIdentityFields` (new) — `src/components/wine/wine-identity-fields.tsx`

The manual identity form: **Location** (country / region / appellation), **Identity** (grape blend, producer, type designation, wine name, colour, style), **Age** (vintage kind / year / tawny). Owns the reference dropdowns and the pending-producer / pending-grape state. Props: reference data (`countries`, `regions`, `grapes`, `typeDesignations`), an optional `initial` (edit / scan-prefill), and an imperative/`onChange` way to read its value. On resolve it produces a `ResolvedWineIdentity` — pending producer/grape find-or-created to real ids. Reused by the picker's "manual" source **and** by the existing edit modes (wine-form edit, catalog edit), so the fieldset lives once.

### `WinePicker` (new) — `src/components/wine/wine-picker.tsx`

Composes the already-shared parts + `WineIdentityFields`:
- **Scan** → `ScanModal`
- **Search catalog** → `SearchableCombobox` (`searchCatalogWines`)
- **From my cellar** → `CellarLotPicker` (`listMyCellarLots`)
- **Add manually** → `WineIdentityFields`

Props:

```ts
{
  userId?: string;                                  // scan + cellar need it
  sources: { scan?: boolean; catalog?: boolean; manual?: boolean; cellar?: boolean };
  countries; regions; grapes; typeDesignations;     // for the manual form
  submitLabel: string;                              // e.g. "Add to the tasting"
  onPick: (pick: WinePick) => void | Promise<void>;
}
```

Result union (the picker normalizes every source to this):

```ts
type WinePick =
  | { kind: "existing"; catalogWineId: string; label: string; lotId?: string; consumeLot?: boolean }
  | { kind: "new"; identity: ResolvedWineIdentity; imageUrl: string | null };
```

Centralized here (once): scan match → `existing`; scan "add as new" → prefill the manual form; catalog pick → `existing`; cellar lot pick (+ optional draw-down) → `existing` with `lotId`/`consumeLot`; manual submit → `new` (pending producer/grape resolved).

### Callers (thin — same trigger/modal as today)

Each surface renders `<WinePicker sources={…} onPick={…} />` plus its destination-only UI, and reuses today's server actions:

- **Tasting add** (`wine-form.tsx`) — `sources {scan, catalog, manual, cellar}`. onPick: `existing` → `addWineFromCatalog`; `existing` + `lotId` → `addTastingWineFromCellarLot`; `new` → `addWine` (identity + answer + photo). Keeps edit mode via `WineIdentityFields`.
- **Cellar add** (`cellar-lot-form.tsx`) — `sources {scan, catalog, manual}` (no "from cellar" — you're adding *to* it). onPick: `existing` → preselect that catalog wine; `new` → identity feeds the lot. The **lot fields** (bottles / price / drink window / location) and the **duplicate-lot prompt** stay in this form.
- **Taste & Rate** (`rate-wine-modal.tsx`) — `sources {scan, catalog, manual, cellar}`. onPick: `existing` (incl. cellar) → open the WSET note; `new` → `createCatalogWineFromIdentity` then open the note.
- **Catalog add** (`new-wine-form.tsx`) — `sources {scan, manual}`. onPick `new` → `createCatalogWine`. Keeps edit mode via `WineIdentityFields`.

### New server helper

`createCatalogWineFromIdentity(identity) → { id }` for the Taste & Rate "new wine → note" path (rate only handles existing wines today). App-layer, reusing the existing catalog-create path / `find_or_create_catalog_wine`. Everything else reuses existing actions (`addWine`, `addWineFromCatalog`, `addTastingWineFromCellarLot`, `addCellarLot`, `createCatalogWine`).

## Migration (incremental — no UX change, no big-bang)

1. Extract `WineIdentityFields`; migrate `wine-form` to use it. Ship.
2. Add `WinePicker`; migrate `wine-form`'s add path to it. Ship.
3. Migrate `cellar-lot-form` to `WinePicker` (lot fields + dup prompt stay). Ship.
4. Migrate `rate-wine-modal` to `WinePicker` + add `createCatalogWineFromIdentity`. Ship.
5. Migrate `new-wine-form` (catalog add) to `WinePicker`. Ship.

Each step: `tsc --noEmit` clean, commit, push, QA before the next.

## Non-goals

- No changes to triggers/entry points or the overall UX (the four popups stay).
- No DB migrations. One small new app-layer helper (`createCatalogWineFromIdentity`) using the existing create path.
- Edit-only forms (wine-form edit, catalog edit, cellar lot edit) keep `WineIdentityFields` prefilled but **not** the picker — there's nothing to "pick" when editing an existing wine.

## Testing

- `tsc --noEmit` per increment (clear `.next` first).
- Manual QA per migrated surface (owner screenshots): scan (match → correct action; "add as new" → prefilled manual form), catalog search, manual add **including pending producer/grape create-on-save**, from-cellar (+ draw-down where applicable). Confirm no behaviour change vs today.

## Risks

- Large refactor → strictly one surface per commit, each fully QA'd before the next; the shared components are built first from the richest existing form (`wine-form`) so behaviour is lifted, not rewritten.
- Must preserve exactly: pending producer/grape resolution, the scan "add as new" prefill mapping, the cellar duplicate-lot prompt, tasting blind integrity (answers hidden until reveal, `blind_pending`), and photo carry-through.
