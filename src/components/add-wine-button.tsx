"use client";

import type { ReactNode } from "react";
import { useAddWine, type AddWineKind } from "@/components/add-wine-context";

// Opens the shared add-wine sheet instead of navigating: the catalog's "Add a
// wine" and the cellar's "Add a bottle" calls to action render one of these.
export function AddWineButton({
  kind,
  className,
  children,
}: {
  kind: AddWineKind;
  className?: string;
  children: ReactNode;
}) {
  const { openAddWine } = useAddWine();
  return (
    <button type="button" onClick={() => openAddWine(kind)} className={className}>
      {children}
    </button>
  );
}
