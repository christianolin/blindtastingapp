"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAddWine } from "./add-wine-context";
import { NewTastingSheet } from "./new-tasting-sheet";

// Which Taste flow to launch. "blind" opens the create-tasting sheet (BLIND
// by default; the sheet's own mode control switches to semi-blind). "rate"
// opens the universal add-wine sheet with the rate destination: pick one wine
// (the camera on a phone or tablet, search + a label-photo upload on a PC),
// then its WSET note opens (owner feedback, 2026-09-12 — this replaced the
// separate RateWineModal). "open" (group Taste & Rate) is not a launcher flow
// — OPEN is drawn as "Soon" in the create sheet.
export type TasteKind = "blind" | "rate";

type Ctx = { openTaste: (kind: TasteKind) => void };
const TasteCtx = createContext<Ctx | null>(null);

export function useTasteLauncher(): Ctx {
  const ctx = useContext(TasteCtx);
  if (!ctx) throw new Error("useTasteLauncher must be used within <TasteLauncherProvider>");
  return ctx;
}

// One shared Taste launcher for the whole authed app, so the mode tiles and the
// sidebar sub-nav open the same popups instead of navigating to a page. It
// renders inside AddWineProvider (app-shell.tsx), which owns the rate flow's
// sheet and the WSET note it opens.
export function TasteLauncherProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const { openAddWineSheet } = useAddWine();
  const [creating, setCreating] = useState(false);

  const openTaste = useCallback(
    (kind: TasteKind) => {
      if (kind === "rate") openAddWineSheet({ kind: "rate" });
      else setCreating(true);
    },
    [openAddWineSheet],
  );
  const value = useMemo<Ctx>(() => ({ openTaste }), [openTaste]);

  return (
    <TasteCtx.Provider value={value}>
      {children}
      {creating ? (
        // Mounted per launch, so a second open starts on a fresh step 1.
        <NewTastingSheet
          userId={userId}
          defaultReveal="BLIND"
          onClose={() => setCreating(false)}
        />
      ) : null}
    </TasteCtx.Provider>
  );
}
