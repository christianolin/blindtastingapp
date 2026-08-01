"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { NewTastingModal } from "./new-tasting-modal";
import { RateWineModal } from "./rate-wine-modal";
import { NewNoteModal } from "./new-note-modal";

// Which Taste flow to launch. Blind / semi-blind open a tasting-creation popup;
// rate opens the "find a wine to note" picker.
export type TasteKind = "blind" | "semi-blind" | "rate";

type Ctx = { openTaste: (kind: TasteKind) => void };
const TasteCtx = createContext<Ctx | null>(null);

export function useTasteLauncher(): Ctx {
  const ctx = useContext(TasteCtx);
  if (!ctx) throw new Error("useTasteLauncher must be used within <TasteLauncherProvider>");
  return ctx;
}

// One shared Taste launcher for the whole authed app, so the mode tiles and the
// sidebar sub-nav open the same popups instead of navigating to a page.
export function TasteLauncherProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<TasteKind | null>(null);
  const [rateWineId, setRateWineId] = useState<string | null>(null);
  return (
    <TasteCtx.Provider value={{ openTaste: setOpen }}>
      {children}
      {open === "blind" ? (
        <NewTastingModal reveal="BLIND" userId={userId} onClose={() => setOpen(null)} />
      ) : null}
      {open === "semi-blind" ? (
        <NewTastingModal reveal="SEMI_BLIND" userId={userId} onClose={() => setOpen(null)} />
      ) : null}
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
    </TasteCtx.Provider>
  );
}
