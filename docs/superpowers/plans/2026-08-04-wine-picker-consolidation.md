# Wine Picker Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated "find/add a wine" UI into two shared components (`WineIdentityFields` + `WinePicker`) and migrate the four add-wine surfaces to them, so scan/catalog/manual/cellar logic lives in one place.

**Architecture:** Lift-and-shift refactor. `WineIdentityFields` = the manual Location/Identity/Age form (owns reference dropdowns + pending producer/grape resolution). `WinePicker` = a source switcher (`sources` prop: scan/catalog/manual/cellar) composing ScanModal + catalog SearchableCombobox + CellarLotPicker + WineIdentityFields, normalizing every choice to a `WinePick` result. Each surface keeps its trigger/modal and destination logic; its body becomes `<WinePicker …/>`. Incremental — one surface per commit, no UX change.

**Tech Stack:** Next.js 16 (App Router) + React 19, TypeScript, Tailwind, Supabase.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-wine-picker-consolidation-design.md`.
- No UX/trigger changes; no DB migrations. Reuse existing server actions (`addWine`, `addWineFromCatalog`, `addTastingWineFromCellarLot`, `addCellarLot`, `createCatalogWine`, `searchCatalogWines`, `listMyCellarLots`, `createProducer`/`createGrape`/`createCountry`/`createRegion`/`createAppellation`/`createTypeDesignation`). One new app-layer helper (`createCatalogWineFromIdentity`).
- Each increment ends `tsc` clean: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` (expect `EXIT=0`).
- Commit per task; push from repo root (stderr "RemoteException" + ref line + `EXIT=0` = success).
- UI is verified by `tsc` + owner screenshots (no UI unit tests).
- Preserve exactly: pending producer/grape create-on-save, scan "add as new" prefill, cellar duplicate-lot prompt, tasting blind integrity (`blind_pending`), photo carry-through.

## File Structure

**Create:**
- `src/components/wine/wine-identity-types.ts` — `WineIdentityInput`, `ResolvedWineIdentity`, `WinePick` types (server-safe, no "use client").
- `src/components/wine/wine-identity-fields.tsx` — the manual identity form (lifted from `wine-form.tsx`).
- `src/components/wine/wine-picker.tsx` — the source switcher.

**Modify (one per increment):**
- `src/app/tastings/[id]/wines/new/wine-form.tsx` — use `WineIdentityFields`, then `WinePicker`.
- `src/app/cellar/new/cellar-lot-form.tsx` — use `WinePicker` (lot fields + dup prompt stay).
- `src/components/rate-wine-modal.tsx` — use `WinePicker`; + `createCatalogWineFromIdentity`.
- `src/app/catalog/new/new-wine-form.tsx` — use `WinePicker` (sources scan/manual).
- `src/app/catalog/new/actions.ts` (or `tastings/.../actions.ts`) — add `createCatalogWineFromIdentity`.

---

### Task 1: Extract `WineIdentityFields` from the tasting form

**Files:**
- Create: `src/components/wine/wine-identity-types.ts`
- Create: `src/components/wine/wine-identity-fields.tsx`
- Modify: `src/app/tastings/[id]/wines/new/wine-form.tsx`

**Interfaces:**
- Produces:
  ```ts
  // wine-identity-types.ts
  export type WineIdentityInput = {
    countryId: string; regionId: string; appellationId: string | null;
    blend: { grapeId: string; percentage: string; pendingName?: string }[];
    producerId: string; producerLabel: string | null;
    typeDesignationId: string | null; wineName: string | null;
    colour: string; style: string;
    vintageKind: "YEAR" | "NV" | "TAWNY";
    vintageYear: string; vintageTawnyYears: string;
    imageUrl: string | null;
  };
  // Real ids after pending producer/grape are find-or-created on submit.
  export type ResolvedWineIdentity = {
    countryId: string; regionId: string; appellationId: string | null;
    grapes: { grapeId: string; percentage: number | null }[];
    producerId: string; typeDesignationId: string | null;
    wineName: string | null; colour: string; style: string;
    vintageKind: "YEAR" | "NV" | "TAWNY";
    vintageYear: number | null; vintageTawnyYears: number | null;
    imageUrl: string | null;
  };
  export type WinePick =
    | { kind: "existing"; catalogWineId: string; label: string; lotId?: string; consumeLot?: boolean }
    | { kind: "new"; identity: ResolvedWineIdentity; imageUrl: string | null };
  ```
- `WineIdentityFields` component: `{ countries, regions, grapes, typeDesignations, initial?, onValidityChange?, ref/handle to read value }`. Exposes a `resolve(): Promise<ResolvedWineIdentity | { error: string }>` that runs the pending producer/grape create-on-save and validation currently in `wine-form`'s `doCreateLot`/`submit`.

- [ ] **Step 1: Create the types file** — write `wine-identity-types.ts` with the three types above.

- [ ] **Step 2: Create `WineIdentityFields`** — lift the manual-entry JSX from `wine-form.tsx` (the `manualMode` form body: the LOCATION, IDENTITY, and AGE fieldsets — country/region/appellation selects, `GrapeBlendEditor`, producer `SearchableCombobox`, `TypeDesignationField`, wine name, colour/style selects, vintage kind/year/tawny, and the `ImageUploader`) into the new component. Move the related `useState`/`useEffect` (countryId/regionId/appellationId/blend/producerId/producerLabel/typeDesignationId/wineName/colour/style/vintageKind/vintageYear/tawnyYears/imageUrl/appellations loader) into it. Add a `resolve()` that reproduces `wine-form`'s validation + `createProducer`/`resolvePendingBlend(createGrape)` resolution and returns `ResolvedWineIdentity`. Expose it via `useImperativeHandle` on a `ref`.

- [ ] **Step 3: Wire `wine-form` to `WineIdentityFields`** — in the `isEditing || manualMode` branch, replace the lifted fieldsets with `<WineIdentityFields ref={identityRef} countries={countries} regions={regions} grapes={grapes} typeDesignations={typeDesignations} initial={initial} />`. In the submit paths (`addWine` manual submit + edit `updateWine`), call `identityRef.current.resolve()` and pass the resolved identity to the existing server action. Keep the catalog-pick / scan / cellar sections as they are (Task 2 folds them into WinePicker).

- [ ] **Step 4: Typecheck** — `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` → `EXIT=0`.

- [ ] **Step 5: Commit** —
```powershell
git add src/components/wine/wine-identity-types.ts src/components/wine/wine-identity-fields.tsx "src/app/tastings/[id]/wines/new/wine-form.tsx"
git commit -m "Wine: extract shared WineIdentityFields (manual identity form) from the tasting form"
```

- [ ] **Step 6: QA** — tasting Add-wine → "Add manually" and Edit: all identity fields work; adding a new wine with a pending (new) producer/grape still creates them on save; photo saves.

---

### Task 2: Build `WinePicker` and migrate the tasting add path

**Files:**
- Create: `src/components/wine/wine-picker.tsx`
- Modify: `src/app/tastings/[id]/wines/new/wine-form.tsx`

**Interfaces:**
- Consumes: `WineIdentityFields`, `WineIdentityInput`/`ResolvedWineIdentity`/`WinePick` (Task 1); `ScanModal`, `SearchableCombobox`, `CellarLotPicker`, `searchCatalogWines`, `listMyCellarLots`.
- Produces:
  ```ts
  export function WinePicker(props: {
    userId?: string;
    sources: { scan?: boolean; catalog?: boolean; manual?: boolean; cellar?: boolean };
    countries: ReferenceOption[]; regions: (ReferenceOption & { country_id: string })[];
    grapes: ReferenceOption[]; typeDesignations: TypeDesignationOption[];
    submitLabel: string;
    onPick: (pick: WinePick) => void | Promise<void>;
  }): JSX.Element;
  ```

- [ ] **Step 1: Create `WinePicker`** — a client component that renders, gated by `props.sources`:
  - catalog: the catalog `SearchableCombobox` (search `searchCatalogWines`) → on pick, `onPick({ kind: "existing", catalogWineId, label })`.
  - scan (needs `userId`): a red "Scan the label instead" button → `ScanModal`; a match's action → `onPick({ kind: "existing", … })`; "add as new" → prefill the manual `WineIdentityFields` (switch to manual mode with the scan payload as `initial`).
  - cellar (needs `userId`): a red "Choose from my cellar" button → `CellarLotPicker` + a "Remove a bottle" checkbox → on pick `onPick({ kind: "existing", catalogWineId: lot.catalogWineId, label: lot.label, lotId: lot.lotId, consumeLot })`.
  - manual: a "Add it manually" toggle → `WineIdentityFields` + a `{submitLabel}` button → on submit calls `identityRef.resolve()` then `onPick({ kind: "new", identity, imageUrl })`.
  Lift the toggle/scan/cellar wiring from the current `wine-form` add block so behaviour matches.

- [ ] **Step 2: Migrate `wine-form`'s add block** — replace the `!isEditing` catalog/scan/cellar/manual block with:
  ```tsx
  <WinePicker
    userId={userId}
    sources={{ scan: Boolean(userId), catalog: true, manual: true, cellar: Boolean(userId) }}
    countries={countries} regions={regions} grapes={grapes} typeDesignations={typeDesignations}
    submitLabel="Add this wine to the tasting"
    onPick={async (pick) => {
      if (pick.kind === "existing" && pick.lotId) {
        const r = await addTastingWineFromCellarLot(tastingId, pick.lotId, { consume: Boolean(pick.consumeLot) });
        /* handle r.error / r.warning / navigate as today */
      } else if (pick.kind === "existing") {
        const r = await addWineFromCatalog(tastingId, pick.catalogWineId); /* handle r?.error */
      } else {
        await addWine(/* build FormData/args from pick.identity + pick.imageUrl */);
      }
    }}
  />
  ```
  Keep the `isEditing` branch on `WineIdentityFields` directly (edit has nothing to "pick"). Remove the now-dead local state/handlers superseded by `WinePicker`.

- [ ] **Step 3: Typecheck** — `…npx tsc --noEmit` → `EXIT=0`.

- [ ] **Step 4: Commit + push** —
```powershell
git add src/components/wine/wine-picker.tsx "src/app/tastings/[id]/wines/new/wine-form.tsx"
git commit -m "Wine: WinePicker source switcher; tasting add uses it"
git push
```

- [ ] **Step 5: QA** — tasting Add-wine: scan (match → adds; new → prefilled manual), catalog search, manual add, from-cellar (+ remove-a-bottle draws down). Behaviour identical to before.

---

### Task 3: Migrate the cellar add form

**Files:**
- Modify: `src/app/cellar/new/cellar-lot-form.tsx`

**Interfaces:** Consumes `WinePicker` + `WineIdentityFields` (Tasks 1–2).

- [ ] **Step 1: Swap the catalog/scan/manual block** — replace `cellar-lot-form`'s "Already added?" catalog combobox + manual identity fieldsets with `<WinePicker sources={{ scan: true, catalog: true, manual: true }} … submitLabel="Add to cellar" onPick={…} />`. On `existing` → set the selected `catalogWineId` (skip identity, keep the lot fields). On `new` → hold the `ResolvedWineIdentity` to pass into `addCellarLot`. The **lot fields** (bottles/format/price/currency/purchased/source/drink window/location/note) and the **duplicate-lot prompt** (`findMyCellarLotsForWine` → merge vs new lot) stay in this form, below the picker.
- [ ] **Step 2: Rewire submit** — `addCellarLot` gets `catalogWineId` (existing) or the resolved identity (new) from the picker, plus the lot fields from this form. Preserve the dup-lot prompt flow.
- [ ] **Step 3: Typecheck** — `…npx tsc --noEmit` → `EXIT=0`.
- [ ] **Step 4: Commit + push** —
```powershell
git add src/app/cellar/new/cellar-lot-form.tsx
git commit -m "Cellar: add form uses WinePicker (lot fields + dup-lot prompt unchanged)"
git push
```
- [ ] **Step 5: QA** — cellar Add-wine: scan/catalog/manual all set the wine; lot fields + duplicate-lot prompt work; new pending producer/grape still create on save.

---

### Task 4: Migrate Taste & Rate (+ note-from-new helper)

**Files:**
- Modify: `src/components/rate-wine-modal.tsx`
- Modify: `src/app/catalog/new/actions.ts`

**Interfaces:**
- Produces: `createCatalogWineFromIdentity(identity: ResolvedWineIdentity): Promise<{ id: string } | { error: string }>` — reuses the existing catalog-create path / `find_or_create_catalog_wine`.
- Consumes: `WinePicker` (Task 2).

- [ ] **Step 1: Add `createCatalogWineFromIdentity`** — in `catalog/new/actions.ts`, a server action that creates (or find-or-creates) a catalog wine from a `ResolvedWineIdentity` and returns its id. Model it on the existing `createCatalogWine` body.
- [ ] **Step 2: Swap `rate-wine-modal` body** — replace the search picker + cellar toggle + "add a new wine" handoff with `<WinePicker sources={{ scan: true, catalog: true, manual: true, cellar: true }} … submitLabel="Rate this wine" onPick={…} />`. On `existing` (incl. cellar lot) → `onPick(catalogWineId)` to open the note (existing behaviour). On `new` → `createCatalogWineFromIdentity(identity)` then open the note for the returned id. Keep the modal shell/title.
- [ ] **Step 3: Typecheck** — `…npx tsc --noEmit` → `EXIT=0`.
- [ ] **Step 4: Commit + push** —
```powershell
git add src/components/rate-wine-modal.tsx src/app/catalog/new/actions.ts
git commit -m "Taste & Rate: uses WinePicker; new wine creates catalog wine then opens the note"
git push
```
- [ ] **Step 5: QA** — Taste & Rate: scan (match → Rate note; new → manual → creates + opens note), catalog search → note, manual add → note, from-cellar → note.

---

### Task 5: Migrate the catalog add form

**Files:**
- Modify: `src/app/catalog/new/new-wine-form.tsx`

**Interfaces:** Consumes `WinePicker` + `WineIdentityFields`.

- [ ] **Step 1: Swap the add block** — the catalog add form's manual identity fields become `<WinePicker sources={{ scan: true, manual: true }} … submitLabel="Add wine" onPick={…} />`. On `new` → `createCatalogWine` (existing). Keep the `wineId` edit mode on `WineIdentityFields` directly (no picker when editing).
- [ ] **Step 2: Typecheck** — `…npx tsc --noEmit` → `EXIT=0`.
- [ ] **Step 3: Commit + push** —
```powershell
git add src/app/catalog/new/new-wine-form.tsx
git commit -m "Catalog: add form uses WinePicker (scan + manual)"
git push
```
- [ ] **Step 4: QA** — catalog Add-wine: scan (new → prefilled manual) + manual add both create a catalog wine; edit an existing catalog wine still works.

---

## Self-Review

**Spec coverage:** `WineIdentityFields` (Task 1) ✓; `WinePicker` + result union (Task 2) ✓; tasting/cellar/rate/catalog callers (Tasks 2–5) ✓; `createCatalogWineFromIdentity` (Task 4) ✓; incremental migration (one surface per task) ✓; non-goals respected (no trigger/UX/DB changes) ✓.

**Placeholder scan:** Steps reference concrete files/actions and the exact `WinePick`/identity types. Extracted bodies are *lifts* from named source regions (a refactor move, not a vague placeholder).

**Type consistency:** `WineIdentityInput` / `ResolvedWineIdentity` / `WinePick` (Task 1) are consumed unchanged by `WinePicker` (Task 2) and all callers (Tasks 2–5). `createCatalogWineFromIdentity` takes `ResolvedWineIdentity` (matches Task 1). `sources` keys (`scan`/`catalog`/`manual`/`cellar`) are consistent across callers.

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between.
2. **Inline Execution** — execute the 5 tasks in this session with checkpoints.

No DB migrations; either runs without DB access. Order is strict: Task 1 → 2 → 3/4/5 (3, 4, 5 each depend on 1–2 and are independent of each other).
