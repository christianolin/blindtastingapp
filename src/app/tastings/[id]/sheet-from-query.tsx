"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAddWine } from "@/components/add-wine-context";
import type { AddWineDestination } from "@/components/add-wine/types";

// The lobby's query launcher (spec §C.6, D13). The legacy routes land here:
// `/tastings/[id]/wines/new` redirects to `?addWine=byhand`, and a glass's edit
// route to `?editWine=<wineId>`. It opens the add-wine sheet once for the query
// it finds, then drops the parameters with router.replace, so a refresh or Back
// never opens the sheet again. The page decides who may add and which glasses
// the viewer may edit; a parameter the viewer has no right to is dropped without
// opening anything. The sheet loads an edited glass before its form can take
// focus, so it focuses the field on a mouse device and only flags it on a touch
// device (spec §C.4 rule 9).
export function SheetFromQuery({
  destination,
  canAddWine,
  editableWineIds,
}: {
  destination: AddWineDestination | null;
  canAddWine: boolean;
  editableWineIds: string[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { openAddWineSheet } = useAddWine();
  // The query this launcher last acted on. It keeps a second run of the effect
  // (Strict Mode, a refresh before the replace lands) from opening the sheet
  // again, and clears once the parameters are gone, so a later visit with a
  // new query opens it.
  const handled = useRef<string | null>(null);

  const addWine = searchParams.get("addWine");
  const editWine = searchParams.get("editWine");

  useEffect(() => {
    if (addWine === null && editWine === null) {
      handled.current = null;
      return;
    }
    const key = `${addWine ?? ""}|${editWine ?? ""}`;
    if (handled.current === key) return;
    handled.current = key;

    if (editWine !== null) {
      // `edit` is a flight option (spec §C.1).
      if (destination?.kind === "flight" && editableWineIds.includes(editWine)) {
        openAddWineSheet(destination, { start: "byhand", edit: { wineId: editWine } });
      }
    } else if (addWine === "byhand" && canAddWine && destination !== null) {
      openAddWineSheet(destination, { start: "byhand" });
    }

    const rest = new URLSearchParams(searchParams.toString());
    rest.delete("addWine");
    rest.delete("editWine");
    const query = rest.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  }, [
    addWine,
    editWine,
    destination,
    canAddWine,
    editableWineIds,
    openAddWineSheet,
    pathname,
    router,
    searchParams,
  ]);

  return null;
}
