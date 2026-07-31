"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CatalogAddWineModal } from "./catalog-add-wine-modal";

// Which add-wine popup to show. Cellar + tasting plug in here as they land; the
// provider simply renders nothing for a kind it doesn't handle yet.
export type AddWineKind = "catalog" | "cellar" | "tasting";

type Ctx = { openAddWine: (kind: AddWineKind) => void };
const AddWineCtx = createContext<Ctx | null>(null);

// Any client component under the app shell can trigger an add-wine popup.
export function useAddWine(): Ctx {
  const ctx = useContext(AddWineCtx);
  if (!ctx) throw new Error("useAddWine must be used within <AddWineProvider>");
  return ctx;
}

// Holds the single add-wine popup for the whole authed app, so the sidebar and
// any page's button open the same dialog instead of navigating to a page.
export function AddWineProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<AddWineKind | null>(null);
  return (
    <AddWineCtx.Provider value={{ openAddWine: (kind) => setOpen(kind) }}>
      {children}
      {open === "catalog" ? (
        <CatalogAddWineModal userId={userId} onClose={() => setOpen(null)} />
      ) : null}
    </AddWineCtx.Provider>
  );
}
