"use client";

import type { ReactNode } from "react";
import { useAddWine, type AddWineKind } from "@/components/add-wine-context";

// Opens the shared Add-wine popup instead of navigating — each pillar's "Add a
// wine" call to action renders one of these.
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
