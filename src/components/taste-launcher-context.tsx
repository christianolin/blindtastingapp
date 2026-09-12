"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { NewTastingSheet } from "./new-tasting-sheet";
import { RateWineModal } from "./rate-wine-modal";
import { NewNoteModal } from "./new-note-modal";

// Which Taste flow to launch. Blind / semi-blind open the create-tasting
// sheet with that mode as the DEFAULT (the tiles inside switch it); rate
// opens the solo "find a wine to note" picker. "open" (group Taste & Rate)
// is not a launcher flow — OPEN is drawn as "Soon" in the sheet.
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
  const [ratePick, setRatePick] = useState<{
    catalogWineId: string;
    lotId?: string;
    consume?: boolean;
  } | null>(null);
  const sheetOpen = open === "blind" || open === "semi-blind";
  return (
    <TasteCtx.Provider value={{ openTaste: setOpen }}>
      {children}
      {sheetOpen ? (
        <NewTastingSheet
          // Remount per launch so a second open starts on a fresh step 1.
          key={open}
          userId={userId}
          defaultReveal={open === "semi-blind" ? "SEMI_BLIND" : "BLIND"}
          onClose={() => setOpen(null)}
        />
      ) : null}
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
    </TasteCtx.Provider>
  );
}
