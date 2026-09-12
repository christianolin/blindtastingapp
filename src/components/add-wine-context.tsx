"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import { AddWineSheet, type InitialSource } from "@/components/add-wine/add-wine-sheet";
import { NewNoteModal } from "@/components/new-note-modal";
import type {
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  RatePick,
} from "@/components/add-wine/types";

// Which destination a legacy caller means. All three now open the one
// universal sheet with the matching destination.
export type AddWineKind = "catalog" | "cellar" | "tasting";

export type AddWineOpts = {
  // Prefill the by-hand form (e.g. a label scan's "add as new").
  catalog?: WineFormInitial;
  // Prefill the by-hand form for a cellar add (creates the wine + a lot).
  cellarNew?: WineFormInitial;
  // Open straight on the cellar fields for an existing catalog wine.
  cellarWine?: { id: string; label: string };
};

/** The tasting the viewer is on and may add wines to (registered by the
    tasting page). `position` is the next glass number. */
export type ActiveTasting = {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  position: number;
};

/** A registration may carry only the id (the pre-sheet registrar); the
    provider then reads the rest itself so the sheet still gets a full
    flight destination. */
type ActiveTastingInput = { tastingId: string } & Partial<Omit<ActiveTasting, "tastingId">>;

type Ctx = {
  openAddWine: (kind: AddWineKind, opts?: AddWineOpts) => void;
  openScan: (target?: "catalog" | "cellar" | "choose") => void;
  // Scan a stack of labels into the cellar in one pass (7d multi mode).
  openBulkScan: () => void;
  activeTasting: ActiveTasting | null;
  setActiveTasting: (t: ActiveTastingInput | null) => void;
  // The header camera while a tasting is registered: scan straight into it.
  openTastingScan: () => void;
  // `{ kind: "rate" }` is Taste & rate: pick one wine, then its WSET note opens.
  openAddWineSheet: (
    destination: AddWineDestination | null,
    options?: AddWineOpenOptions,
  ) => void;
  // The Overview's live / next-up tasting, offered by the 7i chooser.
  registerFlightHint: (hint: FlightHint | null) => void;
};
const AddWineCtx = createContext<Ctx | null>(null);

// Any client component under the app shell can open the add-wine sheet.
export function useAddWine(): Ctx {
  const ctx = useContext(AddWineCtx);
  if (!ctx) throw new Error("useAddWine must be used within <AddWineProvider>");
  return ctx;
}

type OpenSheet = {
  destination: AddWineDestination | null;
  options: AddWineOpenOptions;
  initialSource: InitialSource | null;
  initialPrefill: WineFormInitial | null;
};

function flightOf(t: ActiveTasting): AddWineDestination {
  return {
    kind: "flight",
    tastingId: t.tastingId,
    tastingName: t.tastingName,
    revealMode: t.revealMode,
    wineSource: t.wineSource,
    position: t.position,
  };
}

// Holds the single add-wine sheet for the whole authed app, so the sidebar,
// the header camera and any page's button open the same dialog instead of
// navigating to a page.
export function AddWineProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [activeTasting, setActiveTastingState] = useState<ActiveTasting | null>(null);
  const [flightHint, setFlightHint] = useState<FlightHint | null>(null);
  // A rate pick waiting on its WSET note (the rate destination, or 7i).
  const [notePick, setNotePick] = useState<RatePick | null>(null);
  const [preferredCurrency, setPreferredCurrency] = useState("DKK");
  const supabase = useMemo(() => createClient(), []);

  // The profile currency only labels the cellar fields' price, so it is read
  // lazily — once, the first time a sheet that can reach those fields opens
  // (a cellar destination, or none: the 7i chooser may pick the cellar) —
  // not on every page load. Until it lands the footer shows "DKK", the same
  // fallback it always had. The guard is set before the request so two
  // quick opens do not fetch twice; a failed read clears it for a retry.
  const currencyLoadedRef = useRef(false);
  const ensureCurrency = useCallback(
    (destination: AddWineDestination | null) => {
      if (destination && destination.kind !== "cellar") return;
      if (currencyLoadedRef.current) return;
      currencyLoadedRef.current = true;
      supabase
        .from("profiles")
        .select("preferred_currency")
        .eq("id", userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) {
            currencyLoadedRef.current = false;
            return;
          }
          if (data?.preferred_currency) setPreferredCurrency(data.preferred_currency);
        });
    },
    [supabase, userId],
  );

  // Each registration bumps the generation, so an id-only registration's
  // fetch can only land if nothing registered or cleared after it.
  const registrationRef = useRef(0);
  const setActiveTasting = useCallback(
    (t: ActiveTastingInput | null) => {
      const generation = ++registrationRef.current;
      if (!t) {
        setActiveTastingState(null);
        return;
      }
      if (
        t.tastingName !== undefined &&
        t.revealMode !== undefined &&
        t.wineSource !== undefined &&
        t.position !== undefined
      ) {
        setActiveTastingState(t as ActiveTasting);
        return;
      }
      // Id-only registration: complete it from the tasting the viewer can
      // already read (RLS: they are its host or a participant).
      (async () => {
        const [{ data: tasting }, { count }] = await Promise.all([
          supabase
            .from("tastings")
            .select("id, name, reveal_mode, wine_source")
            .eq("id", t.tastingId)
            .maybeSingle(),
          supabase
            .from("wines")
            .select("id", { count: "exact", head: true })
            .eq("tasting_id", t.tastingId),
        ]);
        if (registrationRef.current !== generation || !tasting) return;
        setActiveTastingState({
          tastingId: tasting.id,
          tastingName: t.tastingName ?? tasting.name,
          revealMode: t.revealMode ?? tasting.reveal_mode,
          wineSource: t.wineSource ?? tasting.wine_source,
          position: t.position ?? (count ?? 0) + 1,
        });
      })().catch(() => {});
    },
    [supabase],
  );

  const openAddWineSheet = useCallback(
    (destination: AddWineDestination | null, options: AddWineOpenOptions = {}) => {
      ensureCurrency(destination);
      setSheet({ destination, options, initialSource: null, initialPrefill: null });
    },
    [ensureCurrency],
  );

  const openAddWine = useCallback(
    (kind: AddWineKind, o: AddWineOpts = {}) => {
      if (kind === "catalog") {
        setSheet({
          destination: { kind: "catalog" },
          options: o.catalog ? { start: "byhand" } : {},
          initialSource: null,
          initialPrefill: o.catalog ?? null,
        });
        return;
      }
      if (kind === "cellar") {
        ensureCurrency({ kind: "cellar" });
        setSheet({
          destination: { kind: "cellar" },
          options: o.cellarNew ? { start: "byhand" } : {},
          initialSource: o.cellarWine
            ? {
                source: { kind: "catalog", catalogWineId: o.cellarWine.id },
                label: o.cellarWine.label,
              }
            : null,
          initialPrefill: o.cellarNew ?? null,
        });
        return;
      }
      // "tasting": the registered flight, or nothing to open.
      if (activeTasting) openAddWineSheet(flightOf(activeTasting));
    },
    [activeTasting, openAddWineSheet, ensureCurrency],
  );

  const openScan = useCallback(
    (target: "catalog" | "cellar" | "choose" = "catalog") => {
      openAddWineSheet(target === "choose" ? null : { kind: target }, { start: "camera" });
    },
    [openAddWineSheet],
  );

  const openBulkScan = useCallback(() => {
    openAddWineSheet({ kind: "cellar" }, { start: "camera", multi: true });
  }, [openAddWineSheet]);

  const openTastingScan = useCallback(() => {
    if (activeTasting) openAddWineSheet(flightOf(activeTasting), { start: "camera" });
  }, [activeTasting, openAddWineSheet]);

  const registerFlightHint = useCallback((hint: FlightHint | null) => setFlightHint(hint), []);

  // The registered tasting is also the 7i "Tonight's flight" candidate, ahead
  // of the Overview's banner (you are looking at it right now).
  const hint: FlightHint | null = activeTasting
    ? {
        tastingId: activeTasting.tastingId,
        tastingName: activeTasting.tastingName,
        position: activeTasting.position,
        live: flightHint?.tastingId === activeTasting.tastingId ? flightHint.live : false,
        revealMode: activeTasting.revealMode,
        wineSource: activeTasting.wineSource,
      }
    : flightHint;

  const value = useMemo<Ctx>(
    () => ({
      openAddWine,
      openScan,
      openBulkScan,
      activeTasting,
      setActiveTasting,
      openTastingScan,
      openAddWineSheet,
      registerFlightHint,
    }),
    [
      openAddWine,
      openScan,
      openBulkScan,
      activeTasting,
      setActiveTasting,
      openTastingScan,
      openAddWineSheet,
      registerFlightHint,
    ],
  );

  return (
    <AddWineCtx.Provider value={value}>
      {children}
      {sheet ? (
        <AddWineSheet
          userId={userId}
          preferredCurrency={preferredCurrency}
          destination={sheet.destination}
          options={sheet.options}
          flightHint={hint}
          initialSource={sheet.initialSource}
          initialPrefill={sheet.initialPrefill}
          onClose={() => setSheet(null)}
          onRate={(pick) => setNotePick(pick)}
        />
      ) : null}
      {notePick ? (
        <NewNoteModal
          // Remount per pick so a second rate never starts on the last note.
          key={`${notePick.catalogWineId}:${notePick.lotId ?? ""}`}
          wineId={notePick.catalogWineId}
          // The sheet draws nothing down: the bottle leaves the cellar only
          // once the note saves, and only when the pick asked for it.
          cellarConsume={
            notePick.consume && notePick.lotId ? { lotId: notePick.lotId } : null
          }
          onClose={() => setNotePick(null)}
        />
      ) : null}
    </AddWineCtx.Provider>
  );
}
