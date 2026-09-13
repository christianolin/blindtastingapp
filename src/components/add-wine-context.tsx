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
import type {
  RevealMode,
  TastingStatus,
  TimingMode,
  WineSourceMode,
} from "@/lib/supabase/database.types";
import { AddWineSheet, type InitialLot } from "@/components/add-wine/add-wine-sheet";
import { NewNoteModal } from "@/components/new-note-modal";
import type {
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  NotePick,
} from "@/components/add-wine/types";

// Which destination a pillar's add button means: the catalog's "Add a wine" or
// the cellar's "Add a bottle". Every other launcher calls openAddWineSheet.
export type AddWineKind = "catalog" | "cellar";

export type AddWineOpts = {
  /** Cellar only: open on the lot step for a wine already in the catalog (a
      catalog row's "Add to cellar"). `label` is set under "Into your cellar". */
  cellarWine?: { id: string; label: string };
};

/** The tasting the viewer is on and may add wines to (registered by the
    tasting page). `position` is the next glass number; `phase` is how the
    chooser names it (D12, entry-4). */
export type ActiveTasting = {
  tastingId: string;
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  position: number;
  phase: FlightHint["phase"];
};

/** A tasting's flight-hint phase (spec §D.4 #2): a DRAFT is next up, a running
    ASYNC tasting is self-paced ("in progress"), anything else is live. */
export function tastingPhase(
  status: TastingStatus | undefined,
  timingMode: TimingMode | undefined,
): FlightHint["phase"] {
  if (status === "DRAFT") return "next";
  return timingMode === "ASYNC" ? "self-paced" : "live";
}

/** A registration may carry only the id; the provider then reads the rest
    itself, so the sheet still gets a full flight destination and hint. */
type ActiveTastingInput = { tastingId: string } & Partial<Omit<ActiveTasting, "tastingId">>;

type Ctx = {
  /** A pillar's add button: the catalog, or the cellar (on a wine's lot step with `cellarWine`). */
  openAddWine: (kind: AddWineKind, opts?: AddWineOpts) => void;
  activeTasting: ActiveTasting | null;
  setActiveTasting: (t: ActiveTastingInput | null) => void;
  /** Any destination. `{ kind: "note" }` is Taste & rate: pick one wine, then its WSET note opens. */
  openAddWineSheet: (
    destination: AddWineDestination | null,
    options?: AddWineOpenOptions,
  ) => void;
  /** The Overview's live or next-up tasting, offered by the E1 chooser. */
  registerFlightHint: (hint: FlightHint | null) => void;
};
const AddWineCtx = createContext<Ctx | null>(null);

// Any client component under the app shell can open the add-wine sheet.
export function useAddWine(): Ctx {
  const ctx = useContext(AddWineCtx);
  if (!ctx) throw new Error("useAddWine must be used within <AddWineProvider>");
  return ctx;
}

/** One open of the sheet. `seq` counts opens and keys the sheet, so every open
    starts on a fresh reducer. */
type OpenSheet = {
  seq: number;
  destination: AddWineDestination | null;
  options: AddWineOpenOptions;
  initialLot: InitialLot | null;
};

/** A note pick waiting on its WSET note. `seq` counts picks and keys the modal. */
type OpenNote = { seq: number; pick: NotePick };

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
  const [note, setNote] = useState<OpenNote | null>(null);
  const [activeTasting, setActiveTastingState] = useState<ActiveTasting | null>(null);
  const [overviewHint, setOverviewHint] = useState<FlightHint | null>(null);
  const [preferredCurrency, setPreferredCurrency] = useState("DKK");
  const supabase = useMemo(() => createClient(), []);
  const openCount = useRef(0);
  const pickCount = useRef(0);

  // The profile currency labels and stores a new lot's price, so it is read
  // lazily — once, the first time a sheet that can reach the lot step opens:
  // the cellar, the catalog (D3's "Add it to my cellar") or no destination (the
  // E1 chooser may pick the cellar). A flight or a note never writes a lot.
  // Until it lands the step shows "DKK", the same fallback it always had. The
  // guard is set before the request so two quick opens do not fetch twice; a
  // failed read clears it for a retry.
  const currencyLoadedRef = useRef(false);
  const ensureCurrency = useCallback(
    (destination: AddWineDestination | null) => {
      if (destination?.kind === "flight" || destination?.kind === "note") return;
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
        t.position !== undefined &&
        t.phase !== undefined
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
            .select("id, name, reveal_mode, wine_source, status, timing_mode")
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
          phase: t.phase ?? tastingPhase(tasting.status, tasting.timing_mode),
        });
      })().catch(() => {});
    },
    [supabase],
  );

  const openSheet = useCallback(
    (
      destination: AddWineDestination | null,
      options: AddWineOpenOptions,
      initialLot: InitialLot | null,
    ) => {
      ensureCurrency(destination);
      openCount.current += 1;
      setSheet({ seq: openCount.current, destination, options, initialLot });
    },
    [ensureCurrency],
  );

  const openAddWineSheet = useCallback(
    (destination: AddWineDestination | null, options: AddWineOpenOptions = {}) =>
      openSheet(destination, options, null),
    [openSheet],
  );

  const openAddWine = useCallback(
    (kind: AddWineKind, opts: AddWineOpts = {}) => {
      if (kind === "catalog") {
        openSheet({ kind: "catalog" }, {}, null);
        return;
      }
      // A catalog row's "Add to cellar" opens on that wine's lot step, where
      // the merge card still checks for a lot already held.
      const wine = opts.cellarWine;
      openSheet(
        { kind: "cellar" },
        {},
        wine
          ? { source: { kind: "catalog", catalogWineId: wine.id, via: "search" }, title: wine.label }
          : null,
      );
    },
    [openSheet],
  );

  // A sheet's close and its note pick act only for that open: a late call from
  // a sheet a newer open replaced neither closes the new sheet nor opens a note.
  const closeSheet = useCallback((seq: number) => {
    setSheet((open) => (open?.seq === seq ? null : open));
  }, []);
  const pickNote = useCallback((seq: number, pick: NotePick) => {
    if (seq !== openCount.current) return;
    pickCount.current += 1;
    setNote({ seq: pickCount.current, pick });
  }, []);

  const registerFlightHint = useCallback((hint: FlightHint | null) => setOverviewHint(hint), []);

  // The registered tasting is also the E1 "Tonight's flight" candidate, ahead
  // of the Overview's hint (you are looking at it right now), and it keeps its
  // own phase. Otherwise the Overview's hint.
  const flightHint = useMemo<FlightHint | null>(
    () =>
      activeTasting
        ? {
            tastingId: activeTasting.tastingId,
            tastingName: activeTasting.tastingName,
            position: activeTasting.position,
            phase: activeTasting.phase,
            revealMode: activeTasting.revealMode,
            wineSource: activeTasting.wineSource,
          }
        : overviewHint,
    [activeTasting, overviewHint],
  );

  const value = useMemo<Ctx>(
    () => ({
      openAddWine,
      activeTasting,
      setActiveTasting,
      openAddWineSheet,
      registerFlightHint,
    }),
    [openAddWine, activeTasting, setActiveTasting, openAddWineSheet, registerFlightHint],
  );

  return (
    <AddWineCtx.Provider value={value}>
      {children}
      {sheet ? (
        <AddWineSheet
          key={sheet.seq}
          userId={userId}
          preferredCurrency={preferredCurrency}
          destination={sheet.destination}
          options={sheet.options}
          flightHint={flightHint}
          initialLot={sheet.initialLot}
          onClose={() => closeSheet(sheet.seq)}
          onNote={(pick) => pickNote(sheet.seq, pick)}
        />
      ) : null}
      {note ? (
        <NewNoteModal
          // Keyed per pick, so a second pick never starts on the last note.
          key={note.seq}
          wineId={note.pick.catalogWineId}
          // The sheet draws nothing down: the bottle leaves the cellar only
          // once the note saves, and only when the pick asked for it.
          cellarConsume={
            note.pick.consume && note.pick.lotId ? { lotId: note.pick.lotId } : null
          }
          onClose={() => setNote(null)}
        />
      ) : null}
    </AddWineCtx.Provider>
  );
}
