# Feature A — Pick a Wine From Your Cellar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add a wine to a blind/semi-blind tasting, or start a Taste & Rate note, by picking one of their in-stock cellar lots — with an optional "remove a bottle" draw-down.

**Architecture:** App-only, no schema change. A new `listMyCellarLots()` action feeds a "From my cellar" picker on two surfaces (the tasting Add-wine form and the Taste & Rate `RateWineModal`). The tasting path uses a new `addTastingWineFromCellarLot` wrapper that reuses an extracted non-redirecting insert core plus the existing `consume_cellar_lot` RPC; the rate path threads the chosen lot through to a post-save `consume_cellar_lot` call.

**Tech Stack:** Next.js 16 (App Router, server actions) + React 19, TypeScript, Supabase (`@supabase/supabase-js`), hand-maintained `database.types.ts`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-04-cellar-pick-in-tastings-design.md`.
- No DB migration. Reuse `cellar_lots`, `catalog_wines`, `addWineFromCatalog`'s logic, and `consume_cellar_lot(p jsonb)` (keys `lot_id`, `quantity`, `reason`, `consumed_on`, `occasion`, `wset_note_id`; returns consumption id; raises if `quantity > stock`).
- Each TS increment ends `tsc` clean: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit` (expect `EXIT=0`).
- Commit per task; push with `git push` from the repo root (stderr "RemoteException" with a ref line + `EXIT=0` = success).
- UI can't be unit-tested here — verify UI tasks with `tsc` + owner screenshots.
- "Remove a bottle" checkbox defaults **off**. Draw-down is best-effort (never blocks the add/note).

## File Structure

**Modify:**
- `src/app/cellar/new/actions.ts` — add `listMyCellarLots()` + `CellarLotOption` type.
- `src/app/tastings/[id]/wines/new/actions.ts` — extract `insertTastingWineFromCatalog` core; add `addTastingWineFromCellarLot`.
- `src/app/tastings/[id]/wines/new/wine-form.tsx` — "From my cellar" source (picker + checkbox).
- `src/components/rate-wine-modal.tsx` — "From my cellar" source + checkbox; richer `onPick`.
- `src/components/taste-launcher-context.tsx` — thread lot/consume into `NewNoteModal`.
- `src/components/new-note-modal.tsx` — optional `cellarConsume` prop; consume on save.
- `src/app/catalog/[wineId]/notes/note-editor.tsx` — `onSaved` passes the saved note id.

---

### Task 1: `listMyCellarLots()` — in-stock lots for the pickers

**Files:**
- Modify: `src/app/cellar/new/actions.ts`

**Interfaces:**
- Produces: `CellarLotOption = { lotId, catalogWineId, label, bottleSizeMl, storageLocation, quantity }`; `listMyCellarLots(): Promise<CellarLotOption[]>`.

- [ ] **Step 1: Add the `catalogWineTitle` import**

At the top of `src/app/cellar/new/actions.ts`, replace:

```ts
import { createClient } from "@/lib/supabase/server";
```

with:

```ts
import { createClient } from "@/lib/supabase/server";
import type { VintageKind } from "@/lib/supabase/database.types";
import { catalogWineTitle } from "@/lib/wset/queries";
```

- [ ] **Step 2: Add the action (append at end of file)**

```ts
export type CellarLotOption = {
  lotId: string;
  catalogWineId: string;
  label: string;
  bottleSizeMl: number;
  storageLocation: string | null;
  quantity: number;
};

// The caller's in-stock lots (quantity > 0) with a readable wine label — feeds
// the "add from my cellar" pickers in tastings and Taste & Rate.
export async function listMyCellarLots(): Promise<CellarLotOption[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("cellar_lots")
    .select(
      "id, catalog_wine_id, bottle_size_ml, quantity, storage_location, " +
        "catalog_wines(wine_name, vintage_kind, vintage_year, vintage_tawny_years, " +
        "producer:producers(name), appellation:appellations(name))",
    )
    .eq("owner_id", user.id)
    .gt("quantity", 0);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    catalog_wine_id: string;
    bottle_size_ml: number;
    quantity: number;
    storage_location: string | null;
    catalog_wines: Record<string, unknown> | Record<string, unknown>[] | null;
  }>;
  const relName = (rel: unknown): string | null => {
    if (!rel) return null;
    const row = Array.isArray(rel) ? rel[0] : rel;
    return (row as { name?: string } | undefined)?.name ?? null;
  };
  return rows
    .map((l) => {
      const cw = (Array.isArray(l.catalog_wines)
        ? l.catalog_wines[0]
        : l.catalog_wines) as Record<string, unknown> | null;
      const label = cw
        ? catalogWineTitle({
            producerName: relName(cw.producer),
            wineName: (cw.wine_name as string | null) ?? null,
            vintageKind: cw.vintage_kind as VintageKind,
            vintageYear: (cw.vintage_year as number | null) ?? null,
            vintageTawnyYears: (cw.vintage_tawny_years as number | null) ?? null,
            appellationName: relName(cw.appellation),
          })
        : "Untitled wine";
      return {
        lotId: l.id,
        catalogWineId: l.catalog_wine_id,
        label,
        bottleSizeMl: l.bottle_size_ml,
        storageLocation: l.storage_location,
        quantity: l.quantity,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
```

- [ ] **Step 3: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 4: Commit**

```powershell
git add src/app/cellar/new/actions.ts
git commit -m "Cellar: listMyCellarLots() for the add-from-cellar pickers"
```

---

### Task 2: non-redirecting insert core + `addTastingWineFromCellarLot`

**Files:**
- Modify: `src/app/tastings/[id]/wines/new/actions.ts`

**Interfaces:**
- Consumes: `consume_cellar_lot` RPC.
- Produces: `addTastingWineFromCellarLot(tastingId, lotId, { consume }): Promise<{ error: string } | { ok: true; warning?: string }>`; internal `insertTastingWineFromCatalog(supabase, userId, tastingId, catalogWineId)`.

**Why the refactor:** `addWineFromCatalog` ends in `redirect()` (throws on success), so a draw-down placed after it would never run. Extracting a non-redirecting core lets the cellar wrapper insert, then consume, then return a warning for the client to show.

- [ ] **Step 1: Add the `revalidatePath` import**

At the top of `actions.ts`, replace:

```ts
import { redirect } from "next/navigation";
```

with:

```ts
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
```

- [ ] **Step 2: Replace `addWineFromCatalog` with core + wrapper**

Replace the existing `addWineFromCatalog` function (currently at `actions.ts:550-624`, from `export async function addWineFromCatalog(` through its closing `}`) with these three definitions:

```ts
type TastingDb = Awaited<ReturnType<typeof createClient>>;

// The insert half of "add a catalog wine to a tasting" (wines + wine_answers),
// with NO redirect — so callers that must run more work afterwards (drawing a
// cellar bottle down) can. Caller resolves auth first.
async function insertTastingWineFromCatalog(
  supabase: TastingDb,
  userId: string,
  tastingId: string,
  catalogWineId: string,
): Promise<{ error: string } | { ok: true }> {
  const { data: tasting } = await supabase
    .from("tastings")
    .select("id, host_id, wine_source")
    .eq("id", tastingId)
    .maybeSingle();
  if (!tasting) return { error: "Tasting not found." };

  let contributorParticipantId: string | null = null;
  if (tasting.wine_source === "PARTICIPANT_CONTRIBUTED") {
    const { data: participant } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("tasting_id", tastingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!participant) return { error: "You're not a participant in this tasting." };
    contributorParticipantId = participant.id;
  } else if (tasting.host_id !== userId) {
    return { error: "Only the host can add wines to this tasting." };
  }

  const { data: cw } = await supabase
    .from("catalog_wines")
    .select(
      "country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years",
    )
    .eq("id", catalogWineId)
    .maybeSingle();
  if (!cw) return { error: "That catalog wine no longer exists." };

  const { count } = await supabase
    .from("wines")
    .select("id", { count: "exact", head: true })
    .eq("tasting_id", tastingId);
  const { data: wine, error: wineError } = await supabase
    .from("wines")
    .insert({
      tasting_id: tastingId,
      position: (count ?? 0) + 1,
      contributor_participant_id: contributorParticipantId,
    })
    .select()
    .single();
  if (wineError || !wine) return { error: wineError?.message ?? "Could not add the wine." };

  const { error: answerError } = await supabase.from("wine_answers").insert({
    wine_id: wine.id,
    country_id: cw.country_id,
    region_id: cw.region_id,
    appellation_id: cw.appellation_id,
    primary_grape_id: cw.primary_grape_id,
    secondary_grape_id: cw.secondary_grape_id,
    producer_id: cw.producer_id,
    type_designation_id: cw.type_designation_id,
    vintage_kind: cw.vintage_kind,
    vintage_year: cw.vintage_year,
    vintage_tawny_years: cw.vintage_tawny_years,
    catalog_wine_id: catalogWineId,
  });
  if (answerError) {
    await supabase.from("wines").delete().eq("id", wine.id);
    return { error: answerError.message };
  }
  return { ok: true };
}

export async function addWineFromCatalog(
  tastingId: string,
  catalogWineId: string,
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const r = await insertTastingWineFromCatalog(supabase, user.id, tastingId, catalogWineId);
  if ("error" in r) return { error: r.error };
  redirect(`/tastings/${tastingId}`);
}

// Add a wine to a tasting from one of the caller's cellar lots, optionally
// drawing one bottle down. Returns (no redirect) so the client can show a
// best-effort draw-down warning and then navigate.
export async function addTastingWineFromCellarLot(
  tastingId: string,
  lotId: string,
  opts: { consume: boolean },
): Promise<{ error: string } | { ok: true; warning?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: lot } = await supabase
    .from("cellar_lots")
    .select("id, owner_id, catalog_wine_id, quantity")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot || lot.owner_id !== user.id) return { error: "That lot is not in your cellar." };
  if (lot.quantity < 1) return { error: "That lot has no bottles left." };

  const r = await insertTastingWineFromCatalog(
    supabase,
    user.id,
    tastingId,
    lot.catalog_wine_id,
  );
  if ("error" in r) return { error: r.error };

  let warning: string | undefined;
  if (opts.consume) {
    const { data: t } = await supabase
      .from("tastings")
      .select("name")
      .eq("id", tastingId)
      .maybeSingle();
    const { error: consumeError } = await supabase.rpc("consume_cellar_lot", {
      p: { lot_id: lotId, quantity: 1, reason: "DRANK", occasion: t?.name ?? "Tasting" },
    });
    if (consumeError) {
      warning = "couldn't update your cellar (the bottle wasn't drawn down).";
    }
  }
  revalidatePath(`/tastings/${tastingId}`);
  return { ok: true, warning };
}
```

- [ ] **Step 3: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 4: Commit**

```powershell
git add "src/app/tastings/[id]/wines/new/actions.ts"
git commit -m "Tastings: addTastingWineFromCellarLot (non-redirecting insert core + optional draw-down)"
```

---

### Task 3: "From my cellar" in the tasting Add-wine form

**Files:**
- Modify: `src/app/tastings/[id]/wines/new/wine-form.tsx`

**Interfaces:**
- Consumes: `listMyCellarLots`, `CellarLotOption` (Task 1); `addTastingWineFromCellarLot` (Task 2).

- [ ] **Step 1a: Add the router import**

Replace:

```ts
import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
```

with:

```ts
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
```

- [ ] **Step 1b: Import the new action into the `./actions` list**

Replace:

```ts
import {
  addWine,
  addWineFromCatalog,
  addWineUnidentified,
```

with:

```ts
import {
  addWine,
  addWineFromCatalog,
  addTastingWineFromCellarLot,
  addWineUnidentified,
```

- [ ] **Step 1c: Import the cellar-lot list action**

Replace:

```ts
  searchCatalogWines,
  type AddWineFormState,
} from "./actions";
```

with:

```ts
  searchCatalogWines,
  type AddWineFormState,
} from "./actions";
import { listMyCellarLots, type CellarLotOption } from "@/app/cellar/new/actions";
```

- [ ] **Step 2: Add cellar state + handlers**

Immediately after the `submitPick` function (ends with its closing `}` near `actions.ts` call `addWineFromCatalog(tastingId, pickedWine.id)`), insert:

```ts
  const router = useRouter();
  const [cellarMode, setCellarMode] = useState(false);
  const [cellarLots, setCellarLots] = useState<CellarLotOption[] | null>(null);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [consumeBottle, setConsumeBottle] = useState(false);
  const [cellarError, setCellarError] = useState<string | null>(null);
  const [cellarWarning, setCellarWarning] = useState<string | null>(null);
  const [cellarPending, startCellar] = useTransition();

  function openCellar() {
    setCellarMode(true);
    setCellarError(null);
    if (cellarLots === null) {
      startCellar(async () => {
        setCellarLots(await listMyCellarLots());
      });
    }
  }

  function submitCellar() {
    if (!selectedLotId) return;
    setCellarError(null);
    setCellarWarning(null);
    startCellar(async () => {
      const r = await addTastingWineFromCellarLot(tastingId, selectedLotId, {
        consume: consumeBottle,
      });
      if (r && "error" in r && r.error) {
        setCellarError(r.error);
        return;
      }
      if (r && "warning" in r && r.warning) {
        setCellarWarning(r.warning);
        return;
      }
      router.push(`/tastings/${tastingId}`);
      router.refresh();
    });
  }
```

- [ ] **Step 3: Render the "Choose from my cellar" button + picker**

In the `!isEditing` catalog block, replace the tail of the Scan block:

```tsx
                setImageUrl(catalog.imageUrl);
              }}
            />
          ) : null}
        </div>
      ) : null}
```

with (adds the cellar button + picker before the section's closing `</div>`):

```tsx
                setImageUrl(catalog.imageUrl);
              }}
            />
          ) : null}
          {userId && !manualMode ? (
            <button
              type="button"
              onClick={() => (cellarMode ? setCellarMode(false) : openCellar())}
              className="self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {cellarMode ? "← Hide my cellar" : "Choose from my cellar"}
            </button>
          ) : null}
          {cellarMode && userId ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              {cellarLots === null ? (
                <p className="text-sm text-muted-foreground">Loading your cellar…</p>
              ) : cellarLots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Your cellar has no bottles in stock.{" "}
                  <a href="/cellar" className="text-primary hover:underline">
                    Add some
                  </a>
                  .
                </p>
              ) : (
                <>
                  <select
                    value={selectedLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Pick a bottle from your cellar…</option>
                    {cellarLots.map((l) => (
                      <option key={l.lotId} value={l.lotId}>
                        {l.label}
                        {l.bottleSizeMl !== 750 ? ` · ${l.bottleSizeMl} ml` : ""}
                        {l.storageLocation ? ` · ${l.storageLocation}` : ""} · {l.quantity} btl
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={consumeBottle}
                      onChange={(e) => setConsumeBottle(e.target.checked)}
                    />
                    Remove a bottle from my cellar
                  </label>
                  {cellarWarning ? (
                    <p className="text-sm text-amber-600">
                      Added to the tasting — {cellarWarning}{" "}
                      <a
                        href={`/tastings/${tastingId}`}
                        className="text-primary hover:underline"
                      >
                        Go to the tasting
                      </a>
                    </p>
                  ) : (
                    <Button
                      type="button"
                      onClick={submitCellar}
                      disabled={cellarPending || !selectedLotId}
                    >
                      {cellarPending ? (
                        <>
                          <WineGlassLoader /> Adding…
                        </>
                      ) : (
                        "Add this bottle to the tasting"
                      )}
                    </Button>
                  )}
                  {cellarError ? (
                    <p className="text-sm text-destructive">{cellarError}</p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
```

- [ ] **Step 4: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit and push**

```powershell
git add "src/app/tastings/[id]/wines/new/wine-form.tsx"
git commit -m "Tastings: add a wine from your cellar (in-stock picker + optional draw-down)"
git push
```

- [ ] **Step 6: QA after deploy (owner screenshots)**

In a DRAFT tasting (blind and semi-blind), Add wine → "Choose from my cellar": in-stock lots list; picking one and "Add this bottle to the tasting" adds it and lands on the tasting; with "Remove a bottle" checked, `/cellar` shows that lot's quantity −1; empty cellar shows the "no bottles in stock" message.

---

### Task 4: "From my cellar" in Taste & Rate

**Files:**
- Modify: `src/app/catalog/[wineId]/notes/note-editor.tsx`
- Modify: `src/components/new-note-modal.tsx`
- Modify: `src/components/taste-launcher-context.tsx`
- Modify: `src/components/rate-wine-modal.tsx`

**Interfaces:**
- Consumes: `listMyCellarLots`, `CellarLotOption` (Task 1); `consume_cellar_lot` RPC.
- Produces: `RateWineModal` `onPick({ catalogWineId, lotId?, consume? })`; `NewNoteModal` `cellarConsume?: { lotId } | null`; `NoteEditor.onSaved(savedId?)`.

- [ ] **Step 1: `NoteEditor.onSaved` passes the saved note id**

In `note-editor.tsx`, replace:

```ts
  /** Called after a successful save; a modal uses it to close itself (and skip
      the route swap the standalone page does). */
  onSaved?: () => void;
```

with:

```ts
  /** Called after a successful save (with the saved note id); a modal uses it
      to close itself (and skip the route swap the standalone page does). */
  onSaved?: (savedId?: string) => void;
```

Then replace:

```ts
      if (onSaved) {
        onSaved();
      } else if (!state.id && savedId) {
```

with:

```ts
      if (onSaved) {
        onSaved(savedId);
      } else if (!state.id && savedId) {
```

- [ ] **Step 2: `NewNoteModal` gains `cellarConsume` + consumes on save**

In `new-note-modal.tsx`, replace the component signature:

```tsx
export function NewNoteModal({
  wineId,
  onClose,
}: {
  wineId: string;
  onClose: () => void;
}) {
```

with:

```tsx
export function NewNoteModal({
  wineId,
  onClose,
  cellarConsume = null,
}: {
  wineId: string;
  onClose: () => void;
  cellarConsume?: { lotId: string } | null;
}) {
```

Then replace the `NoteEditor`'s `onSaved={onClose}`:

```tsx
            embedded
            onClose={onClose}
            onSaved={onClose}
          />
```

with:

```tsx
            embedded
            onClose={onClose}
            onSaved={async (savedId) => {
              if (cellarConsume && savedId) {
                await supabase.rpc("consume_cellar_lot", {
                  p: {
                    lot_id: cellarConsume.lotId,
                    quantity: 1,
                    reason: "DRANK",
                    wset_note_id: savedId,
                  },
                });
              }
              onClose();
            }}
          />
```

- [ ] **Step 3: Thread the pick through `taste-launcher-context.tsx`**

Replace:

```tsx
  const [rateWineId, setRateWineId] = useState<string | null>(null);
```

with:

```tsx
  const [ratePick, setRatePick] = useState<{
    catalogWineId: string;
    lotId?: string;
    consume?: boolean;
  } | null>(null);
```

Replace the `RateWineModal` block:

```tsx
      {open === "rate" ? (
        <RateWineModal
          onClose={() => setOpen(null)}
          onPick={(wineId) => {
            setOpen(null);
            setRateWineId(wineId);
          }}
        />
      ) : null}
      {rateWineId ? (
        <NewNoteModal wineId={rateWineId} onClose={() => setRateWineId(null)} />
      ) : null}
```

with:

```tsx
      {open === "rate" ? (
        <RateWineModal
          onClose={() => setOpen(null)}
          onPick={(pick) => {
            setOpen(null);
            setRatePick(pick);
          }}
        />
      ) : null}
      {ratePick ? (
        <NewNoteModal
          wineId={ratePick.catalogWineId}
          cellarConsume={
            ratePick.consume && ratePick.lotId ? { lotId: ratePick.lotId } : null
          }
          onClose={() => setRatePick(null)}
        />
      ) : null}
```

- [ ] **Step 4: `RateWineModal` — cellar source + richer `onPick`**

In `rate-wine-modal.tsx`, replace:

```ts
import { searchCatalogWines } from "@/app/tastings/[id]/wines/new/actions";
import { useAddWine } from "@/components/add-wine-context";
```

with:

```ts
import { searchCatalogWines } from "@/app/tastings/[id]/wines/new/actions";
import { listMyCellarLots, type CellarLotOption } from "@/app/cellar/new/actions";
import { useAddWine } from "@/components/add-wine-context";
```

Replace the `onPick` prop type:

```ts
  onPick?: (wineId: string) => void;
```

with:

```ts
  onPick?: (pick: { catalogWineId: string; lotId?: string; consume?: boolean }) => void;
```

Add cellar state + loader — replace:

```ts
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
```

with:

```ts
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cellarOpen, setCellarOpen] = useState(false);
  const [cellarLots, setCellarLots] = useState<CellarLotOption[] | null>(null);
  const [consume, setConsume] = useState(false);

  useEffect(() => {
    if (cellarOpen && cellarLots === null) listMyCellarLots().then(setCellarLots);
  }, [cellarOpen, cellarLots]);
```

Update the catalog hit's pick — replace:

```ts
                      if (onPick) onPick(h.id);
```

with:

```ts
                      if (onPick) onPick({ catalogWineId: h.id });
```

Insert the cellar section before the "Add a new wine" button — replace:

```tsx
        <button
          type="button"
          onClick={() => {
            onClose();
            openAddWine("catalog");
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="size-4" /> Can&apos;t find it? Add a new wine
        </button>
```

with:

```tsx
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setCellarOpen((o) => !o)}
            className="self-start text-sm font-medium text-primary hover:underline"
          >
            {cellarOpen ? "← Hide my cellar" : "…or choose from my cellar"}
          </button>
          {cellarOpen ? (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={consume}
                  onChange={(e) => setConsume(e.target.checked)}
                />
                Remove a bottle from my cellar
              </label>
              {cellarLots === null ? (
                <p className="py-2 text-sm text-muted-foreground">Loading…</p>
              ) : cellarLots.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Your cellar has no bottles in stock.
                </p>
              ) : (
                <ul className="flex max-h-[40vh] flex-col overflow-y-auto">
                  {cellarLots.map((l) => (
                    <li key={l.lotId}>
                      <button
                        type="button"
                        onClick={() =>
                          onPick?.({
                            catalogWineId: l.catalogWineId,
                            lotId: l.lotId,
                            consume,
                          })
                        }
                        className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      >
                        {l.label}
                        <span className="text-muted-foreground">
                          {l.storageLocation ? ` · ${l.storageLocation}` : ""} · {l.quantity} btl
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            openAddWine("catalog");
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="size-4" /> Can&apos;t find it? Add a new wine
        </button>
```

- [ ] **Step 5: Typecheck**

Run: `Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue; npx tsc --noEmit`
Expected: `EXIT=0`.

- [ ] **Step 6: Commit and push**

```powershell
git add "src/app/catalog/[wineId]/notes/note-editor.tsx" src/components/new-note-modal.tsx src/components/taste-launcher-context.tsx src/components/rate-wine-modal.tsx
git commit -m "Taste & Rate: choose a wine from your cellar (optional draw-down linked to the note)"
git push
```

- [ ] **Step 7: QA after deploy (owner screenshots)**

Taste & Rate → "…or choose from my cellar": in-stock lots list; picking one opens the WSET note for that wine; with "Remove a bottle" checked, saving the note draws that lot down by one (`/cellar` quantity −1, a `cellar_consumptions` row linked to the note); unchecked leaves stock unchanged; catalog search still works unchanged.

## Self-Review

**Spec coverage:**
- `listMyCellarLots` — Task 1. ✓
- Tasting add-from-cellar + optional draw-down — Tasks 2–3. ✓
- Taste & Rate add-from-cellar + optional draw-down (linked to note) — Task 4. ✓
- Edge cases (draw-down best-effort, warning surfaced, empty state, per-lot targeting) — Tasks 2/3. ✓
- Non-goals (no migration, no tasting↔consumption link) — respected. ✓

**Type consistency:** `CellarLotOption` (T1) is consumed unchanged in T3/T4. `addTastingWineFromCellarLot` return `{ error } | { ok; warning? }` (T2) matches T3's handler. `onPick({ catalogWineId, lotId?, consume? })` (T4 rate-modal) matches the launcher's `setRatePick`. `cellarConsume: { lotId } | null` (launcher) matches `NewNoteModal` prop. `onSaved(savedId?)` (note-editor) matches `NewNoteModal`'s handler. `consume_cellar_lot` is always called as `{ p: { lot_id, quantity, reason, ... } }` (T2, T4). ✓

**Placeholder scan:** none.

## Execution Handoff

Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute the four tasks in this session with checkpoints.

No live migrations in this feature, so either runs without DB access. Tasks are ordered 1 → 2 → 3 → 4 (3 needs 1+2; 4 needs 1).
