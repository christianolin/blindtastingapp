"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  identifyWineFromLabel,
  resolveWinePrefill,
  type ScanResult,
} from "@/app/scan/actions";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import { addToCatalog, addToCellar, addToFlight } from "./actions";
import {
  cameraSupported,
  homeViewFor,
  isTouchPrimary,
  startViewFor,
  useTouchPrimary,
  viewForDevice,
} from "./use-camera";
import {
  glassLabel,
  identityFromPrefill,
  ratePickPlan,
  scanTitle,
  vintageLabel,
} from "./format";
import { bottlesLabel } from "./row-format";
import { chooserEyebrow } from "./scan-copy";
import { DestinationFooter, type CellarLotFields } from "./destination-footer";
import { CameraView } from "./camera-view";
import { Chooser, ScanConfirm, type Choice } from "./scan-confirm";
import { SearchView } from "./search-view";
import { CellarView } from "./cellar-view";
import { ByHandForm } from "./by-hand-form";
import { DesktopView } from "./desktop-view";
import type {
  AddResult,
  AddSource,
  AddWineDestination,
  AddWineOpenOptions,
  AddedWine,
  FlightHint,
  PendingFix,
  PendingScan,
  RatePick,
  SheetContext,
} from "./types";

// "lot" is the shell's own step: the cellar fields (quantity · rack · price)
// shown before a cellar write. "choose" is the 7i "Where does it go?" chooser
// for a search hit or a by-hand entry made with no destination (a scan asks
// the same question inside ScanConfirm). Views never see either.
type View =
  | "camera"
  | "reading"
  | "confirm"
  | "search"
  | "cellar"
  | "byhand"
  | "desktop"
  | "lot"
  | "choose";

type Scan = { imageUrl: string; result: ScanResult; prefill: WineFormInitial };

/** What the shell's chooser (view "choose") is asking about. */
type ChooseFor = {
  source: AddSource;
  title: string;
  meta: string;
  eyebrow: string;
  matched: boolean;
};

/** A wine the sheet opens on (the old `cellarWine` preselect): straight to
    the destination step for that catalog wine. */
export type InitialSource = { source: AddSource; label: string };

const DARK_VIEWS: View[] = ["camera", "reading", "confirm", "choose"];
// The views that need the card's full height on a larger screen (`sm+`): a
// tablet's viewfinder, and the photo on reading / confirm on either device.
// The card is content-height everywhere else, capped and scrolling.
const SCAN_VIEWS: View[] = ["camera", "reading", "confirm"];
const READ_FAILED = "Couldn't read the label — try again or search by name";

const noopSubscribe = () => () => {};

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function flightFromHint(h: FlightHint): AddWineDestination {
  return {
    kind: "flight",
    tastingId: h.tastingId,
    tastingName: h.tastingName,
    revealMode: h.revealMode,
    wineSource: h.wineSource,
    position: h.position,
  };
}

function identityLabel(source: AddSource): string {
  if (source.kind !== "identity") return "Selected wine";
  const i = source.identity;
  return (
    [i.producerName, i.wineName, vintageLabel(i.vintageKind, i.vintageYear, i.vintageTawnyYears)]
      .filter(Boolean)
      .join(" ") || "Unnamed wine"
  );
}

/**
 * The universal add-wine sheet (spec Part 1, "The sheet"). Rendered once by
 * AddWineProvider; full-screen on phones, a centred 760px card on larger
 * screens. Which views it offers follows the device, not the width (owner,
 * 2026-09-12 — the device rule in use-camera.ts): a touch device opens on
 * the live camera, a mouse / trackpad device on the desktop layout (7h) and
 * never reaches the camera or a Scan / Scan next / Many control. Every
 * branch — camera, reading, confirm, search, cellar, by hand, the desktop
 * layout and the cellar fields — happens inside this one dialog. Views
 * render UI and call back; this shell owns the state machine, the capture →
 * read pipeline and the destination rules for every add. The rate
 * destination (Taste & rate) reuses the same views for a single pick that
 * opens the WSET note instead of adding anything (`pickToRate`).
 */
export function AddWineSheet({
  userId,
  preferredCurrency,
  destination,
  options,
  flightHint,
  onClose,
  onRate,
  initialSource = null,
  initialPrefill = null,
}: {
  userId: string;
  preferredCurrency: string;
  destination: AddWineDestination | null;
  options: AddWineOpenOptions;
  flightHint: FlightHint | null;
  onClose: () => void;
  /** A rate pick (the rate destination, or 7i "Rate it now"), handed over as
      the sheet closes: the provider opens the WSET note for this wine and
      draws `lotId` down on save only when `consume` says so. */
  onRate: (pick: RatePick) => void;
  /** Open on the destination step for a known wine (cellar "To cellar"). */
  initialSource?: InitialSource | null;
  /** Open on the by-hand form prefilled (a legacy scan hand-off). */
  initialPrefill?: WineFormInitial | null;
}) {
  const router = useRouter();
  // The device rule: route by input type (`(pointer: coarse)`), never by
  // width. Only the frame's CSS below stays width-based.
  const touch = useTouchPrimary();
  const hasCamera = useSyncExternalStore(noopSubscribe, cameraSupported, () => false);

  const [rawView, setView] = useState<View>(() => {
    if (initialSource) return "lot";
    if (initialPrefill) return "byhand";
    // The provider mounts the sheet on the client only (after a tap), so the
    // plain read already knows the device.
    return startViewFor(options.start, isTouchPrimary());
  });
  // Derived, not stored: a mouse device never renders the camera or the phone
  // search view, even if the pointer type changes while the sheet is open.
  const view: View = viewForDevice(rawView, touch);
  const [dest, setDestState] = useState<AddWineDestination | null>(destination);
  // Async handlers (an add that follows a 7i choice) must see the destination
  // the moment it changes, not the closure's stale copy.
  const destRef = useRef<AddWineDestination | null>(destination);
  const setDestination = useCallback((d: AddWineDestination | null) => {
    destRef.current = d;
    setDestState(d);
  }, []);

  // A rate pick is single: never multi, whatever the caller passed.
  const [multi, setMultiState] = useState(
    Boolean(options.multi) && destination?.kind !== "rate",
  );
  const multiRef = useRef(multi);
  const setMulti = useCallback((m: boolean) => {
    multiRef.current = m;
    setMultiState(m);
  }, []);

  const [added, setAdded] = useState<AddedWine[]>([]);
  const [pending, setPending] = useState<PendingScan[]>([]);
  const [scan, setScan] = useState<Scan | null>(null);
  const [readingImage, setReadingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [byHandPrefill, setByHandPrefill] = useState<WineFormInitial | null>(initialPrefill);
  const [prevView, setPrevView] = useState<View | null>(null);
  // The shell's 7i chooser: the wine a destination is still needed for.
  const [chooseFor, setChooseFor] = useState<ChooseFor | null>(null);
  // "38 bottles" for the cellar view's header slot, reported by the view.
  const [cellarBottles, setCellarBottles] = useState<number | null>(null);
  // The search view stays mounted (parked) so its field exists before the
  // tap that opens it; both refs serve that tap (see `openSearch`).
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // A mouse device's search is the desktop view's own field; "Search by
  // name" from the confirm view focuses it once that view is up.
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const focusDesktopSearchRef = useRef(false);
  // The cellar step's pending write (7c "Add to cellar" opens the fields first).
  const [lotStep, setLotStep] = useState<{
    source: AddSource;
    label: string;
    andScanNext: boolean;
  } | null>(initialSource ? { ...initialSource, andScanNext: false } : null);
  // Desktop multi-file upload: read the files one at a time. `drainRef` lets
  // the read pipeline (declared first) pull the next file after a Fix row or
  // a failed read, so one bad photo never stalls the rest of the drop.
  const queueRef = useRef<File[]>([]);
  const drainRef = useRef<() => boolean>(() => false);

  const close = useCallback(() => {
    onClose();
    router.refresh();
  }, [onClose, router]);

  // Where a read, a confirm or an add returns: the camera on touch (it falls
  // back to Library without getUserMedia), the desktop view on a mouse.
  const home = useCallback((): View => homeViewFor(touch), [touch]);
  const go = useCallback(
    (next: View) => {
      // A cellar choice on the chooser leads to the cellar fields; ← from
      // there returns to the screen the wine came from, not to the answered
      // chooser (the destination is set by then, so that screen's footer
      // already reads "Add to cellar").
      setPrevView((p) => (view === "choose" && next === "lot" ? p : view));
      setView(next);
    },
    [view],
  );
  const back = useCallback(() => {
    setView(
      prevView && prevView !== "reading" && prevView !== "lot" && prevView !== "choose"
        ? prevView
        : home(),
    );
    setPrevView(null);
  }, [prevView, home]);

  // --- capture → upload → read → confirm ----------------------------------

  const readFile = useCallback(
    async (file: Blob | File) => {
      setError(null);
      const localUrl = URL.createObjectURL(file);
      setReadingImage(localUrl);
      setView("reading");
      setBusy(true);
      try {
        const supabase = createClient();
        const named = file instanceof File ? file.name : "";
        const ext = /\.[a-z0-9]+$/i.test(named) ? named.split(".").pop()!.toLowerCase() : "jpg";
        const path = `catalog/staging/${userId}/scan-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const bucket = supabase.storage.from("wine-images");
        const { error: uploadError } = await bucket.upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (uploadError) throw new Error(uploadError.message);
        const {
          data: { publicUrl },
        } = bucket.getPublicUrl(path);
        // Exactly one FastCork credit per captured photo.
        const result = await identifyWineFromLabel(publicUrl);
        const prefill: WineFormInitial = {
          ...(await resolveWinePrefill(result.extracted)),
          imageUrl: publicUrl,
        };
        // 7d: in multi mode an unread vintage with no catalog match becomes a
        // "Fix" row instead of a confirm screen — the camera stays open.
        if (multiRef.current && prefill.vintagePrompt && result.matches.length === 0) {
          setPending((p) => [
            ...p,
            { id: uid(), imageUrl: publicUrl, prefill, problem: "no-vintage" },
          ]);
          if (!drainRef.current()) setView(home());
          return;
        }
        setScan({ imageUrl: publicUrl, result, prefill });
        setView("confirm");
      } catch {
        setError(READ_FAILED);
        if (!drainRef.current()) setView(home());
      } finally {
        setBusy(false);
        setReadingImage(null);
        URL.revokeObjectURL(localUrl);
      }
    },
    [userId, home],
  );

  const drainQueue = useCallback((): boolean => {
    const next = queueRef.current.shift();
    if (!next) return false;
    void readFile(next);
    return true;
  }, [readFile]);
  useEffect(() => {
    drainRef.current = drainQueue;
  }, [drainQueue]);

  const onFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (destRef.current?.kind === "rate") {
        // A rate pick is one wine: one photo, one read (one FastCork credit).
        queueRef.current = files.slice(0, 1);
      } else {
        if (files.length > 1) setMulti(true);
        queueRef.current.push(...files);
      }
      if (!busy) drainQueue();
    },
    [busy, drainQueue, setMulti],
  );

  // --- the add dispatcher --------------------------------------------------

  const performAdd = useCallback(
    async (d: AddWineDestination, source: AddSource, lot?: CellarLotFields): Promise<AddResult> => {
      if (d.kind === "flight") return addToFlight(d.tastingId, source);
      if (source.kind === "lot") {
        return {
          error:
            d.kind === "cellar"
              ? "That bottle is already in your cellar."
              : "That bottle is already in the catalog.",
        };
      }
      if (d.kind === "cellar") {
        if (!lot) return { error: "Choose how many bottles and where they go." };
        return addToCellar(source, lot);
      }
      return addToCatalog(source);
    },
    [],
  );

  const afterAdd = useCallback(
    (d: AddWineDestination, r: Extract<AddResult, { ok: true }>, andScanNext: boolean) => {
      setAdded((a) => [...a, r.added]);
      options.onAdded?.(r.added);
      setNotice(r.warning ? `Added — ${r.warning}` : null);
      // The next glass is re-read from the server's inserted position, not
      // bumped locally — another BYO bottle may have landed since we opened.
      if (d.kind === "flight") {
        setDestination({ ...d, position: (r.added.glass ?? d.position) + 1 });
      }
      setScan(null);
      setLotStep(null);
      setChooseFor(null);
      if (drainQueue()) return;
      if (andScanNext) {
        setMulti(true);
        setView(home());
        return;
      }
      // Multi mode and the desktop layout (every mouse device) both keep the
      // sheet open.
      if (multiRef.current || !touch) {
        setView(home());
        return;
      }
      close();
    },
    [options, setDestination, drainQueue, setMulti, home, touch, close],
  );

  // --- the rate destination ------------------------------------------------

  // Taste & rate (owner feedback, 2026-09-12): a pick never writes to a
  // flight or a cellar and never stacks. It resolves the catalog wine — a
  // catalog row or matched scan as it is, a cellar lot's wine carried on the
  // row, a by-hand identity or unmatched scan found-or-created first
  // (`ratePickPlan`) — then closes the sheet and hands the pick to the
  // provider, which opens the WSET note and draws a cellar bottle down only
  // once that note saves.
  const pickToRate = useCallback(
    async (source: AddSource) => {
      const plan = ratePickPlan(source);
      if (plan.kind === "error") {
        setError(plan.error);
        return;
      }
      let pick: RatePick | null = plan.kind === "pick" ? plan.pick : null;
      if (plan.kind === "catalog-first") {
        setBusy(true);
        try {
          const r = await addToCatalog(plan.source);
          if ("error" in r) {
            setError(r.error);
            return;
          }
          pick = { catalogWineId: r.added.catalogWineId };
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't find that wine in the catalog.");
          return;
        } finally {
          setBusy(false);
        }
      }
      if (!pick) return;
      queueRef.current = [];
      onRate(pick);
      onClose();
    },
    [onRate, onClose],
  );

  const handleAdd = useCallback(
    async (source: AddSource, opts: { andScanNext: boolean }, lot?: CellarLotFields) => {
      setError(null);
      let d = destRef.current;
      // A rate pick: no chooser, no cellar fields, no write to a flight or cellar.
      if (d?.kind === "rate") {
        await pickToRate(source);
        return;
      }
      // A cellar bottle picked with no destination can only go into tonight's flight.
      if (!d && source.kind === "lot" && flightHint) {
        d = flightFromHint(flightHint);
        setDestination(d);
      }
      if (!d) {
        if (source.kind === "lot") {
          setError("No tasting tonight to pour a bottle into — scan or search instead.");
          return;
        }
        // 7i for a search hit or a by-hand entry: ask where it goes, then
        // come back through here with the destination adopted.
        let title = identityLabel(source);
        if (source.kind === "catalog") {
          title = scan?.result.matches.find((m) => m.id === source.catalogWineId)?.name ?? "";
          if (!title) {
            const looked = await addToCatalog(source); // no-op read: returns the title
            title = "ok" in looked ? looked.added.label : "Selected wine";
          }
        }
        setChooseFor({
          source,
          title,
          meta: "",
          eyebrow: source.kind === "catalog" ? chooserEyebrow(1) : "Entered by hand",
          matched: source.kind === "catalog",
        });
        go("choose");
        return;
      }
      if (d.kind === "cellar" && source.kind !== "lot" && !lot) {
        // Quantity · rack · price come first (destination footer), then the write.
        let label = identityLabel(source);
        if (source.kind === "catalog") {
          label = scan?.result.matches.find((m) => m.id === source.catalogWineId)?.name ?? label;
          if (label === "Selected wine") {
            const looked = await addToCatalog(source); // no-op read: returns the title
            if ("ok" in looked) label = looked.added.label;
          }
        } else if (scan) {
          label = scanTitle(scan.prefill);
        }
        setLotStep({ source, label, andScanNext: opts.andScanNext });
        // `go`, so ← on the fields returns to the list / confirm / form the
        // wine was picked from rather than to whatever preceded that.
        go("lot");
        return;
      }
      setBusy(true);
      try {
        const r = await performAdd(d, source, lot);
        if ("error" in r) {
          setError(r.error);
          return;
        }
        afterAdd(d, r, opts.andScanNext);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add the wine.");
      } finally {
        setBusy(false);
      }
    },
    [flightHint, setDestination, scan, performAdd, afterAdd, go, pickToRate],
  );

  const onChoose = useCallback(
    async (choice: { kind: "flight" | "cellar" | "rate" | "catalog-only" }) => {
      setError(null);
      if (choice.kind === "flight") {
        if (!flightHint) {
          setError("No tasting tonight — pick the cellar or the catalog.");
          return;
        }
        setDestination(flightFromHint(flightHint));
      } else if (choice.kind === "cellar") {
        setDestination({ kind: "cellar" });
      } else if (choice.kind === "rate") {
        // "Rate it now" adopts the rate destination, so the add that follows
        // is a rate pick: single, and it closes into the note.
        setMulti(false);
        setDestination({ kind: "rate" });
      } else {
        setDestination({ kind: "catalog" });
      }
    },
    [flightHint, setDestination, setMulti],
  );

  // The shell's chooser (view "choose"): adopt the choice exactly as
  // ScanConfirm does, then run the add it was asked for — `handleAdd` reads
  // the destination from `destRef`, so the second pass proceeds to the write
  // (or to the cellar fields).
  const chooseAndAdd = useCallback(
    async (kind: Choice) => {
      if (!chooseFor || busy) return;
      await onChoose({ kind });
      if (!destRef.current) return; // onChoose said why (no tasting tonight)
      await handleAdd(chooseFor.source, { andScanNext: false });
    },
    [chooseFor, busy, onChoose, handleAdd],
  );

  const onFixPending = useCallback(
    (id: string, fix: PendingFix) => {
      const p = pending.find((x) => x.id === id);
      if (!p) return;
      const prefill: WineFormInitial = {
        ...p.prefill,
        vintagePrompt: false,
        vintageKind: fix.vintageKind,
        vintageYear:
          fix.vintageKind === "YEAR" && fix.vintageYear ? String(fix.vintageYear) : "",
        tawnyYears: "",
      };
      setPending((list) => list.filter((x) => x.id !== id));
      const identity = identityFromPrefill(prefill);
      if (!identity) {
        setByHandPrefill(prefill);
        go("byhand");
        return;
      }
      void handleAdd({ kind: "identity", identity }, { andScanNext: false });
    },
    [pending, go, handleAdd],
  );

  const onRemovePending = useCallback(
    (id: string) => setPending((list) => list.filter((x) => x.id !== id)),
    [],
  );

  const onMergedIntoLot = useCallback(
    async (info: { lotId: string }) => {
      const d = destRef.current;
      if (!d || !lotStep || lotStep.source.kind !== "catalog") return;
      afterAdd(
        d,
        {
          ok: true,
          added: {
            catalogWineId: lotStep.source.catalogWineId,
            label: lotStep.label,
            destination: "cellar",
            lotId: info.lotId,
          },
        },
        lotStep.andScanNext,
      );
    },
    [lotStep, afterAdd],
  );

  // --- derived ---------------------------------------------------------------

  const ctx: SheetContext = useMemo(
    () => ({
      destination: dest,
      multi,
      added,
      pending,
      flightHint,
      userId,
      preferredCurrency,
      // The desktop layout, by the device rule: a mouse / trackpad device at
      // any width. Views read it to keep their Scan controls touch-only.
      isDesktop: !touch,
      hasCamera,
    }),
    [dest, multi, added, pending, flightHint, userId, preferredCurrency, touch, hasCamera],
  );

  const dark = DARK_VIEWS.includes(view);
  const scanning = SCAN_VIEWS.includes(view);
  // The destination line: the title on most views, the eyebrow on the
  // cellar / by-hand branches (7f, 7g put the branch name in the title slot).
  // Taste & rate: eyebrow "Taste & rate", title the question (never multi).
  const rate = dest?.kind === "rate";
  const destTitle = multi
    ? dest?.kind === "flight"
      ? "Adding to the flight"
      : dest?.kind === "cellar"
        ? "Adding to the cellar"
        : dest?.kind === "catalog"
          ? "Adding to the catalog"
          : "Adding wines"
    : dest?.kind === "flight"
      ? `Add wine · ${glassLabel(dest.position)}`
      : dest?.kind === "cellar"
        ? "Add a bottle"
        : dest?.kind === "catalog"
          ? "Add a wine"
          : rate
            ? "Which wine are you tasting?"
            : scanning && touch
              ? "Scan"
              : "Add wine";
  const branchTitle =
    view === "cellar" ? "From my cellar" : view === "byhand" ? "By hand" : null;
  // On the cellar / by-hand branches the eyebrow carries the destination
  // line; for a rate pick that stays "Taste & rate", not the question.
  const eyebrow = branchTitle
    ? rate
      ? "Taste & rate"
      : destTitle
    : dest?.kind === "flight"
      ? dest.tastingName
      : dest?.kind === "cellar"
        ? "Cellar"
        : dest?.kind === "catalog"
          ? "Catalog"
          : rate
            ? "Taste & rate"
            : null;
  const title = branchTitle ?? destTitle;
  const showBack =
    view === "cellar" || view === "byhand" || view === "lot" || view === "choose";
  // Scan / "Scan instead" — only ever rendered on touch, where home is the
  // camera (Library when getUserMedia is missing).
  const toCamera = useCallback(() => {
    setScan(null);
    go(home());
  }, [go, home]);
  const toByHand = useCallback(() => {
    setByHandPrefill(null);
    go("byhand");
  }, [go]);
  // "Or search by name" / the Catalog chip / "Search by name": the search
  // field is already in the DOM (parked), so unhide it and focus it INSIDE
  // this tap — a phone only raises its keyboard for a focus() that runs
  // synchronously in the user's gesture (CLAUDE.md's combobox rule). The
  // state change then renders the same display value it was given here.
  // A mouse device has no phone search view: its search is the desktop
  // view's own field, which is not mounted yet — the effect below focuses
  // it once that view is up (no keyboard to raise, so no gesture needed).
  const openSearch = useCallback(() => {
    if (!touch) {
      focusDesktopSearchRef.current = true;
      go("desktop");
      return;
    }
    const wrap = searchWrapRef.current;
    if (wrap) wrap.style.display = "";
    searchInputRef.current?.focus({ preventScroll: true });
    go("search");
  }, [go, touch]);
  useEffect(() => {
    if (view !== "desktop" || !focusDesktopSearchRef.current) return;
    focusDesktopSearchRef.current = false;
    desktopSearchRef.current?.focus({ preventScroll: true });
  }, [view]);
  const onRescan = useCallback(() => {
    setScan(null);
    if (!drainQueue()) setView(home());
  }, [drainQueue, home]);
  const simpleAdd = useCallback(
    (source: AddSource) => handleAdd(source, { andScanNext: false }),
    [handleAdd],
  );
  // The by-hand form stays mounted (parked) under the chooser and the cellar
  // fields it leads to, so ← from either brings the typed fields back.
  const byHandMounted =
    view === "byhand" || ((view === "lot" || view === "choose") && prevView === "byhand");
  const scanPillClass =
    "flex min-h-11 shrink-0 items-center gap-[6px] rounded-[8px] border border-border bg-background px-[11px] text-[11.5px] font-semibold text-primary transition-colors hover:border-gold hover:bg-white";

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0",
          // The frame is width-based on purpose — full-screen below `sm`, a
          // centred card above — and separate from routing (the device rule
          // picks the views). Content-height on larger screens (7h: the
          // footer sits under the tiles), capped and scrolling via the body;
          // only the photo views need the full height.
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:max-w-[760px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          scanning && "sm:h-[88vh]",
          dark ? "bg-[#15100D] text-primary-foreground" : "bg-card text-foreground",
        )}
      >
        {/* Header: ✕ (or ← inside cellar / by hand / the cellar fields), the
            context eyebrow + title, and the search view's Scan shortcut. */}
        <header
          className={cn(
            "flex shrink-0 items-center gap-3 p-[8px_16px_10px] md:gap-[14px] md:p-[18px_22px_14px]",
            !dark && "border-b border-border",
          )}
        >
          {showBack ? (
            <button
              type="button"
              aria-label="Back"
              onClick={back}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full",
                dark ? "text-primary-foreground/75" : "text-muted-foreground",
              )}
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full md:hidden",
                dark ? "text-primary-foreground/75" : "text-muted-foreground",
              )}
            >
              <X className="size-5" />
            </button>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {eyebrow ? (
              <Eyebrow
                size="md"
                className={cn("truncate", dark ? "text-console-ink" : undefined)}
              >
                {eyebrow}
              </Eyebrow>
            ) : null}
            <div className="flex items-center gap-[10px]">
              <DialogTitle
                className={cn(
                  "truncate font-heading text-[20px] font-semibold leading-[1.05] md:text-[25px]",
                  dark ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {title}
              </DialogTitle>
              {multi && added.length > 0 ? (
                <span className="shrink-0 rounded-full border border-gold-light bg-gold-light/20 px-[11px] py-[5px] text-[11.5px] font-bold text-gold-light">
                  +{added.length} added
                </span>
              ) : null}
            </div>
          </div>
          {/* Trailing slot: Scan (search), "Scan instead" (by hand, 7g) or
              the bottle count (cellar, 7f). Both scan pills are touch-only. */}
          {view === "search" && touch && hasCamera ? (
            <button
              type="button"
              onClick={toCamera}
              className="flex min-h-11 shrink-0 items-center gap-[6px] rounded-full border border-border px-[13px] text-[13px] font-semibold text-primary hover:border-gold hover:bg-white"
            >
              <Camera className="size-4" />
              Scan
            </button>
          ) : view === "byhand" && touch ? (
            <button type="button" onClick={toCamera} className={scanPillClass}>
              <Camera className="size-4" />
              Scan instead
            </button>
          ) : view === "cellar" && cellarBottles != null ? (
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {bottlesLabel(cellarBottles)}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            className={cn(
              "hidden size-11 shrink-0 items-center justify-center rounded-full md:flex",
              dark ? "text-primary-foreground/75" : "text-muted-foreground",
            )}
          >
            <X className="size-5" />
          </button>
        </header>

        {error || notice ? (
          <p
            role="status"
            className={cn(
              "shrink-0 px-4 pb-2 text-[12.5px] md:px-[22px]",
              error ? (dark ? "text-miss" : "text-rose") : "text-gold-dark",
            )}
          >
            {error ?? notice}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Parked views: `display: contents` keeps each view's own root
              in the scroller's layout; the inline display:none hides it. */}
          <div
            ref={searchWrapRef}
            className="contents"
            style={{ display: view === "search" ? undefined : "none" }}
          >
            <SearchView
              ctx={ctx}
              onAdd={simpleAdd}
              onScan={toCamera}
              onByHand={toByHand}
              onBack={back}
              busy={busy}
              inputRef={searchInputRef}
              hidden={view !== "search"}
            />
          </div>
          {byHandMounted ? (
            <div className="contents" style={{ display: view === "byhand" ? undefined : "none" }}>
              <ByHandForm
                ctx={ctx}
                prefill={byHandPrefill}
                onAdd={simpleAdd}
                onBack={back}
                busy={busy}
              />
            </div>
          ) : null}

          {view === "camera" ? (
            <CameraView
              ctx={ctx}
              onCaptured={(file) => void readFile(file)}
              onSearch={openSearch}
              onCellar={() => go("cellar")}
              onByHand={toByHand}
              onToggleMulti={() => setMulti(!multi)}
              onDone={close}
              onFixPending={onFixPending}
              onRemovePending={onRemovePending}
              busy={busy}
            />
          ) : view === "reading" ? (
            <ReadingView imageUrl={readingImage} />
          ) : view === "confirm" && scan ? (
            <ScanConfirm
              ctx={ctx}
              imageUrl={scan.imageUrl}
              result={scan.result}
              prefill={scan.prefill}
              onRescan={onRescan}
              onSearch={openSearch}
              onByHand={(prefill) => {
                setByHandPrefill(prefill);
                go("byhand");
              }}
              onAdd={handleAdd}
              onPending={(prefill) => {
                // 7c → 7d, the same route the read pipeline takes in multi
                // mode: a Fix row above the viewfinder (or in the desktop
                // list), and back home.
                setPending((p) => [
                  ...p,
                  { id: uid(), imageUrl: scan.imageUrl, prefill, problem: "no-vintage" },
                ]);
                setScan(null);
                setMulti(true);
                if (!drainQueue()) setView(home());
              }}
              onChoose={onChoose}
              busy={busy}
            />
          ) : view === "choose" && chooseFor ? (
            <Chooser
              title={chooseFor.title}
              meta={chooseFor.meta}
              eyebrow={chooseFor.eyebrow}
              matched={chooseFor.matched}
              flightHint={flightHint}
              busy={busy}
              onChoose={chooseAndAdd}
            />
          ) : view === "cellar" ? (
            <CellarView
              ctx={ctx}
              onAdd={simpleAdd}
              onBack={back}
              busy={busy}
              onLoaded={setCellarBottles}
            />
          ) : view === "lot" && lotStep ? (
            <div className="flex flex-col gap-3 p-4 md:p-[18px_22px]">
              <Eyebrow size="md">Into your cellar</Eyebrow>
              <p className="font-heading text-[21px] font-semibold leading-[1.12]">
                {lotStep.label}
              </p>
              <p className="text-[12.5px] text-muted-foreground">
                How many bottles, and where do they live? Price is optional.
              </p>
            </div>
          ) : view === "desktop" ? (
            <DesktopView
              ctx={ctx}
              onAdd={simpleAdd}
              onFiles={onFiles}
              onCellar={() => go("cellar")}
              onByHand={toByHand}
              onDone={close}
              onFixPending={onFixPending}
              onRemovePending={onRemovePending}
              busy={busy}
              inputRef={desktopSearchRef}
            />
          ) : null}
        </div>

        {view === "lot" && lotStep && dest?.kind === "cellar" ? (
          <footer className="shrink-0 border-t border-border bg-background pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4">
            <DestinationFooter
              destination={dest}
              label={lotStep.label}
              currency={preferredCurrency}
              busy={busy}
              catalogWineIdForDuplicateCheck={
                lotStep.source.kind === "catalog" ? lotStep.source.catalogWineId : null
              }
              onConfirm={async (lot) => {
                if (!lot) return;
                await handleAdd(lotStep.source, { andScanNext: lotStep.andScanNext }, lot);
              }}
              // "Add and scan the next" follows a camera read: touch only.
              onSecondary={
                scan && touch
                  ? async () => {
                      setLotStep({ ...lotStep, andScanNext: true });
                    }
                  : undefined
              }
              secondaryLabel={
                scan && touch
                  ? lotStep.andScanNext
                    ? "Scanning the next after this one"
                    : "Add and scan the next"
                  : undefined
              }
              onMergedIntoLot={onMergedIntoLot}
            />
          </footer>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// The "reading" state: the captured photo, a gold scanline sweeping it, and
// the brand loader — no modal error state; a failure is an inline line.
function ReadingView({ imageUrl }: { imageUrl: string | null }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 p-6">
      <div className="relative w-full max-w-[280px] overflow-hidden rounded-[8px] bg-console-card">
        {imageUrl ? (
          // A blob: URL from the capture — next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="block max-h-[46vh] w-full object-cover" />
        ) : (
          <div className="aspect-[3/4] w-full" />
        )}
        <div className="animate-scanline absolute inset-x-0 h-[2px] bg-linear-to-r from-transparent via-gold-light to-transparent shadow-[0_0_14px_2px_rgba(212,175,106,.5)]" />
      </div>
      <WineGlassLoader className="text-primary-foreground" />
      <p className="text-[13.5px] text-primary-foreground">Reading the label…</p>
    </div>
  );
}
