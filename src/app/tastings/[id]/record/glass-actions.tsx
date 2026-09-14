"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAddWine } from "@/components/add-wine-context";
import { NewNoteModal } from "@/components/new-note-modal";

/**
 * "Do something with it" (S13c, spec §11.3 items 18-19): the record glass's
 * three actions, each starting an existing flow rather than a new one.
 *
 * BT-A0 amendments (see the plan's Does section): an identified wine's "Add
 * to my cellar" reuses the provider's existing `openAddWine("cellar", {
 * cellarWine })` path — it already opens straight on the lot step with a
 * title — instead of a new preselect/initialLot path. "Rate it" for an
 * identified wine routes through `openAddWineSheet({ kind: "note" },
 * { preselect })`, which the provider intercepts and opens NewNoteModal on
 * directly, skipping the sheet.
 *
 * An unidentified wine (no catalog match) has no `NotePick`/preselect
 * plumbing to reuse for "Rate it" — every existing path assumes a
 * `catalogWineId` — and no catalog page, so there is no "Open it in the
 * catalog" for it either. "Rate it" mounts `NewNoteModal` itself, here, on
 * its `unidentifiedWineId` alternative; "Add to my cellar" opens the sheet
 * on its cellar destination with the unidentified preselect, which loads the
 * draft and lands the by-hand form (add-wine-sheet.tsx).
 */
export function GlassActions({
  catalogWineId,
  unidentifiedWineId,
  tastingWineId,
  title,
}: {
  catalogWineId: string | null;
  unidentifiedWineId: string | null;
  tastingWineId: string;
  title: string;
}): React.JSX.Element {
  const { openAddWineSheet, openAddWine } = useAddWine();
  const [rateUnidentified, setRateUnidentified] = useState(false);

  const onRate = () => {
    if (catalogWineId) {
      openAddWineSheet({ kind: "note" }, { preselect: { catalogWineId, tastingWineId } });
      return;
    }
    if (unidentifiedWineId) setRateUnidentified(true);
  };

  const onCellar = () => {
    if (catalogWineId) {
      openAddWine("cellar", { cellarWine: { id: catalogWineId, label: title } });
      return;
    }
    if (unidentifiedWineId) {
      openAddWineSheet({ kind: "cellar" }, { preselect: { unidentifiedWineId } });
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onRate} className="min-h-11">
        Rate it
      </Button>
      <Button onClick={onCellar} variant="outline" className="min-h-11">
        Add to my cellar
      </Button>
      {catalogWineId ? (
        <Button
          render={<Link href={`/catalog/${catalogWineId}`} />}
          nativeButton={false}
          variant="ghost"
          className="min-h-11"
        >
          Open it in the catalog
        </Button>
      ) : null}
      {rateUnidentified && unidentifiedWineId ? (
        <NewNoteModal
          unidentifiedWineId={unidentifiedWineId}
          tastingWineId={tastingWineId}
          contextKind="BLIND"
          onClose={() => setRateUnidentified(false)}
        />
      ) : null}
    </div>
  );
}
