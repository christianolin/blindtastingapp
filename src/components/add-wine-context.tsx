"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CatalogAddWineModal } from "./catalog-add-wine-modal";
import { CellarAddWineModal } from "./cellar-add-wine-modal";
import { ScanModal } from "./scan/scan-modal";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";

// Which add-wine popup to show. Cellar + tasting plug in here as they land; the
// provider simply renders nothing for a kind it doesn't handle yet.
export type AddWineKind = "catalog" | "cellar" | "tasting";

export type AddWineOpts = {
  // Prefill the catalog form (e.g. a label scan's "add as new").
  catalog?: WineFormInitial;
  // Prefill the cellar form's new-wine fields (a scan's "add as new" launched
  // from the cellar flow — it creates the wine and adds a lot on save).
  cellarNew?: WineFormInitial;
  // Preselect an existing catalog wine in the cellar form (e.g. a scan match).
  cellarWine?: { id: string; label: string };
};
type Ctx = {
  openAddWine: (kind: AddWineKind, opts?: AddWineOpts) => void;
  openScan: (target?: "catalog" | "cellar" | "choose") => void;
};
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
  const [opts, setOpts] = useState<AddWineOpts>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState<"catalog" | "cellar" | "choose">(
    "catalog",
  );
  const close = () => {
    setOpen(null);
    setOpts({});
  };
  const openAddWine = (kind: AddWineKind, o?: AddWineOpts) => {
    setOpts(o ?? {});
    setOpen(kind);
  };
  const openScan = (target: "catalog" | "cellar" | "choose" = "catalog") => {
    setScanTarget(target);
    setScanOpen(true);
  };
  return (
    <AddWineCtx.Provider value={{ openAddWine, openScan }}>
      {children}
      {open === "catalog" ? (
        <CatalogAddWineModal
          userId={userId}
          initialWine={opts.catalog}
          onScan={() => openScan("catalog")}
          onClose={close}
        />
      ) : null}
      {open === "cellar" ? (
        <CellarAddWineModal
          userId={userId}
          initialCatalogWineId={opts.cellarWine?.id}
          initialCatalogWineLabel={opts.cellarWine?.label}
          initialWine={opts.cellarNew}
          onScan={() => openScan("cellar")}
          onClose={close}
        />
      ) : null}
      {scanOpen ? (
        <ScanModal
          userId={userId}
          onClose={() => setScanOpen(false)}
          onAddNew={(prefill) =>
            scanTarget === "cellar"
              ? openAddWine("cellar", { cellarNew: prefill })
              : openAddWine("catalog", { catalog: prefill })
          }
          onAddNewToCellar={
            scanTarget === "choose"
              ? (prefill) => openAddWine("cellar", { cellarNew: prefill })
              : undefined
          }
          onAddToCellar={(cellarWine) => openAddWine("cellar", { cellarWine })}
        />
      ) : null}
    </AddWineCtx.Provider>
  );
}
