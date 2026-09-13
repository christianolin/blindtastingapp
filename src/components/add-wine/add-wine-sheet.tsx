"use client";

// The add-wine sheet's shell (spec §C.3 "First paint"; §C.4 rules 1, 3, 4 and
// 8–11; §A.4 upload path). One dialog for every entry point. The shell draws the
// header, mounts the views, runs the read pipeline (downscale → upload → read)
// and asks in the footer before closing over unfinished work. The state is
// sheet-state.ts's reducer; every write, and every decision about where a write
// goes, is the adds hook's (use-sheet-adds.ts). No view branches on the
// destination: each reads the matrix (spec §C.2).
//
// State (plan amendments 22 and 23). React renders from
// `useReducer(reduceSheet, …)`, and every action goes through `adds.send`, which
// runs `reduceSheet` on `stateRef.current` at once and hands the same action to
// React, so the adoption give-back and the reply-ticket rule take exactly the
// same step on both copies. Handlers and async continuations read
// `stateRef.current`, never the render's state. The ref is never behind the
// rendered state: it takes the rendered state back only once React has applied
// every action sent (`applied === sent`), so a render that skipped a pending
// update can never roll it back.
//
// Focus (rule 9). The search view and the by-hand form mount, hidden, from the
// first paint after `resolving`. A tap that opens either wraps its dispatch in
// `flushSync` and focuses the input in the same handler, so a phone raises its
// keyboard. Opens that finish outside a tap (an Edit that loads its glass, a
// note's partial read, a save the server refused for a missing field) focus the
// field on a device that cannot scan and only scroll it into view on one that
// can, where the form flags it.
//
// Replies. The pipeline's uploads, reads and failures are background actions:
// the reducer records them and decides whether a read may take the screen
// (amendment 20). Everything else that waits on the server is the hook's, and
// carries its ticket (amendment 23).
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, X } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { readLabelPhoto, type LabelPhotoRead } from "@/app/scan/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { emptyDraft, missingWineFields } from "@/lib/wine-identity/complete";
import { describeMissing, readDisplay } from "@/lib/wine-identity/describe";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import { searchAddWine } from "./actions";
import { loadByHandReferences, type ByHandReferences } from "./by-hand-actions";
import { ByHandForm } from "./by-hand-form";
import { CameraView } from "./camera-view";
import { listCellarForSheet, ownedBottlesFor } from "./cellar-actions";
import { CellarLotStep, SkippedLotNotice } from "./cellar-lot-step";
import { CellarView } from "./cellar-view";
import { getCellarSummary } from "./desktop-actions";
import type { CellarSummary, DesktopRow } from "./desktop-format";
import { DesktopView } from "./desktop-view";
import { downscaleForRead, ImageDecodeError } from "./downscale-image";
import { FollowUpView } from "./follow-up-view";
import { sheetMatrix, type SheetMatrix } from "./matrix";
import { Chooser, ReadConfirm, ReadingView } from "./read-confirm";
import { bottlesLabel, type CellarSheet } from "./row-format";
import { SearchView } from "./search-view";
import {
  addTargetId,
  currentDestination,
  footerCount,
  initialSheetState,
  markAddedInFlight,
  reduceSheet,
  sessionToReopen,
  stackPartialRead,
  ticketFor,
  type ScanItem,
  type SheetAction,
  type SheetState,
  type SheetView,
} from "./sheet-state";
import type {
  AddSource,
  AddWineDestination,
  AddWineOpenOptions,
  FlightHint,
  NotePick,
  SearchGroups,
  SheetRowAction,
} from "./types";
import { homeViewFor } from "./use-camera";
import { useCanScan } from "./use-can-scan";
import { useSheetAdds, type ChooserChoice, type EditingGlass } from "./use-sheet-adds";

/** A wine the sheet opens on at the lot step (the cellar's "add bottles" for a
    wine already in the catalog). `title` is set under "Into your cellar". */
export type InitialLot = { source: AddSource; title: string | null };

export type AddWineSheetProps = {
  userId: string;
  /** The profile's currency, for a new lot's price. */
  preferredCurrency: string;
  destination: AddWineDestination | null;
  options: AddWineOpenOptions;
  /** The tasting a chooser's "Tonight's flight" adopts; registered only for people who may add to it. */
  flightHint: FlightHint | null;
  onClose: () => void;
  /** A note pick (C1/C2, D3's "Taste & rate it now", E1's "Rate it now"), handed
      over as the sheet closes: the provider opens the WSET note. */
  onNote: (pick: NotePick) => void;
  initialLot?: InitialLot | null;
};

type OwnedBottles = { bottles: number; rack: string | null } | null;
type SearchResult = { query: string; tastingId: string | undefined; groups: SearchGroups };
type SearchRow = { source: "lot" | "catalog" | "tasted"; catalogWineId: string; lotId?: string };
type ItemAction = "fix" | "remove" | "retry";
type Finishing = { glass: number | null } | null;
type Header = { eyebrow: string | null; title: string; titleHidden: boolean; bottles: string | null };

/** The views drawn on the dark ground. */
const DARK_VIEWS: readonly SheetView[] = ["camera", "reading", "confirm", "choose"];
/** The views that take the card's full height on a larger screen (the photo, the viewfinder). */
const PHOTO_VIEWS: readonly SheetView[] = ["camera", "reading", "confirm"];
/** The views whose header leads with ← instead of ✕. */
const BACK_VIEWS: readonly SheetView[] = ["cellar", "byhand", "lot", "choose"];
/** The views that show the sheet's error line themselves. */
const OWN_ERROR_VIEWS: readonly SheetView[] = ["search", "desktop", "cellar", "confirm", "byhand", "lot", "choose"];

const NO_REFERENCES: ByHandReferences = { countries: [], regions: [], grapes: [], typeDesignations: [] };
const NO_GROUPS: SearchGroups = { cellar: [], catalog: [], tasted: [] };
const NO_NAMES = { producer: null, appellation: null, region: null, country: null, primaryGrape: null };
const SEARCH_DEBOUNCE_MS = 250;
const PHOTO_BUCKET = "wine-images";
/** E1: search, cellar and by-hand picks with no destination reach the chooser under this header. */
const CHOOSE_TITLE = "Add wine";
/** On the way back from the lot step, ← passes over these (rule 10). */
const CHAIN_SKIPS: readonly SheetView[] = ["lot", "choose", "reading"];

const countStep = (n: number): number => n + 1;

/**
 * The universal add-wine sheet (spec §C, handoff screen M). Rendered once by
 * AddWineProvider; full-screen on phones, a centred 760px card on larger
 * screens. `canScan` (use-can-scan.ts), never the width, picks the views: a
 * device that can scan opens on the camera, one that cannot on the laptop view,
 * and while it is unknown the sheet shows only its header and a loader.
 */
export function AddWineSheet({
  userId,
  preferredCurrency,
  destination,
  options,
  flightHint,
  onClose,
  onNote,
  initialLot = null,
}: AddWineSheetProps) {
  const router = useRouter();
  const detectedCanScan = useCanScan();

  // --- state: the reducer, and the ref every handler reads --------------------

  const [state, reactDispatch] = useReducer(
    reduceSheet,
    { destination, options, canScan: null, initialLot: initialLot?.source ?? null },
    initialSheetState,
  );
  // Both are dispatched in the same call, so they share a lane: a render that
  // applied every sheet action sent has `applied === sent.current`.
  const [applied, countApplied] = useReducer(countStep, 0);
  const sent = useRef(0);
  const stateRef = useRef(state);
  const dispatch = useCallback((action: SheetAction) => {
    sent.current += 1;
    reactDispatch(action);
    countApplied();
  }, []);
  useLayoutEffect(() => {
    if (applied === sent.current) stateRef.current = state;
  }, [state, applied]);

  // --- data loaded for this open ------------------------------------------------

  const [references, setReferences] = useState<ByHandReferences>(NO_REFERENCES);
  const [cellarSummary, setCellarSummary] = useState<CellarSummary | null>(null);
  const [cellar, setCellar] = useState<{ sheet: CellarSheet | null; failed: boolean }>({ sheet: null, failed: false });
  const [owned, setOwned] = useState<Record<string, OwnedBottles>>({});
  const [titles, setTitles] = useState<Record<string, string>>(() => initialTitles(initialLot));
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [searchPending, setSearchPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ field: WineFieldKey; seq: number } | null>(null);
  // An Edit open shows a loader on the form until its glass has loaded (or failed to).
  const [editLoaded, setEditLoaded] = useState(options.edit === undefined);

  const mounted = useRef(false);
  const photoUrls = useRef<Set<string>>(new Set());
  const draining = useRef(false);
  const searchSeq = useRef(0);
  const cellarSeq = useRef(0);
  const focusSeq = useRef(0);
  const started = useRef({ references: false, summary: false, edit: false, firstView: false });
  const ownedRequested = useRef<Set<string>>(new Set());
  const refusalFocused = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const fieldRefs = useRef<Partial<Record<WineFieldKey, HTMLElement | null>>>({});

  const adds = useSheetAdds({
    stateRef,
    dispatch,
    flightHint,
    options,
    currency: preferredCurrency,
    onNote,
    onClose,
    refresh: () => router.refresh(),
    refreshSearch: () => {
      const s = stateRef.current;
      runSearch(queryOf(s).trim(), searchTastingId(s, flightHint));
    },
  });
  // A stable way in for a view that lists the callback in an effect's deps.
  const sendRef = useRef(adds.send);
  useLayoutEffect(() => {
    sendRef.current = adds.send;
  });
  const focusDesktopRow = useCallback((row: number) => sendRef.current({ type: "desktopFocus", row }), []);

  // --- derived ------------------------------------------------------------------

  const view = state.view;
  const canScan = state.canScan === true;
  const dest = currentDestination(state);
  const matrix = sheetMatrix(dest, canScan);
  const activeItem =
    state.activeItemId === null ? null : (state.items.find((item) => item.id === state.activeItemId) ?? null);
  const query = queryOf(state).trim();
  const tastingId = searchTastingId(state, flightHint);
  const groups = query === "" ? null : (search?.groups ?? null);
  const loading =
    query !== "" && (searchPending || search === null || search.query !== query || search.tastingId !== tastingId);
  // Rule 11: a row just poured reads "in flight" before any refetch.
  const shownGroups = useMemo(
    () => (groups === null ? null : markAddedInFlight(groups, state.addedRowKeys)),
    [groups, state.addedRowKeys],
  );
  const ownedFor = dest === null ? chooserWineId(state, activeItem) : null;
  const cellarHint =
    cellarSummary === null
      ? null
      : { owned: ownedFor === null ? null : (owned[ownedFor] ?? null), totalBottles: cellarSummary.bottles };
  const finishing = finishingFor(state, adds.editing);
  const editLoading = !editLoaded && view === "byhand";
  const lot = state.lot;
  const lotSource = lot?.source.kind === "catalog" ? lot.source : null;
  const chooserItem = view === "choose" && state.chooseFor === null ? itemInHand(state) : null;
  const refusal =
    view === "byhand" && state.byHand?.attempted && state.byHand.focusField !== null && state.error !== null
      ? `${state.flow}|${state.byHand.focusField}|${state.error}`
      : null;

  // --- effects --------------------------------------------------------------------

  useEffect(() => {
    mounted.current = true;
    const urls = photoUrls.current;
    return () => {
      mounted.current = false;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  // C.3: the first view waits for `canScan`. Resolved before paint, so a reopened
  // sheet (the value is cached) paints its view straight away.
  const resolveCanScan = useEffectEvent((value: boolean) => {
    if (stateRef.current.canScan !== value) adds.send({ type: "canScanResolved", canScan: value });
    if (started.current.firstView) return;
    started.current.firstView = true;
    // `start: "byhand"` opens a new wine's form (A7); an Edit opens its glass once it loads.
    const s = stateRef.current;
    if (options.edit === undefined && s.view === "byhand" && s.byHand === null) openNewByHand(false);
  });
  useLayoutEffect(() => {
    if (detectedCanScan !== null) resolveCanScan(detectedCanScan);
  }, [detectedCanScan]);

  // An Edit open (spec §C.8): the glass loads, then its form opens.
  const startEdit = useEffectEvent(() => {
    const wineId = options.edit?.wineId;
    if (wineId === undefined || started.current.edit) return;
    started.current.edit = true;
    void adds.openEdit(wineId).then((field) => {
      if (!mounted.current) return;
      setEditLoaded(true);
      if (field !== null) requestFocus(field);
    });
  });
  useEffect(() => {
    startEdit();
  }, []);

  /** Rule 9, outside a tap: focus on a device that cannot scan; otherwise scroll the flagged field into view. */
  const focusOutsideTap = useEffectEvent((field: WineFieldKey) => {
    const s = stateRef.current;
    const element = fieldRefs.current[field];
    if (s.view !== "byhand" || !element) return;
    if (s.canScan === false) element.focus();
    else element.scrollIntoView({ block: "center" });
  });
  useEffect(() => {
    if (focusRequest !== null) focusOutsideTap(focusRequest.field);
  }, [focusRequest]);

  // A save the server refused for a missing field lands back on the form after the tap.
  useEffect(() => {
    if (refusal === null) {
      refusalFocused.current = null;
      return;
    }
    if (refusalFocused.current === refusal) return;
    refusalFocused.current = refusal;
    const field = stateRef.current.byHand?.focusField;
    if (field) focusOutsideTap(field);
  }, [refusal]);

  // A7 "Data": the reference lists, once per open.
  useEffect(() => {
    if (started.current.references) return;
    started.current.references = true;
    loadByHandReferences().then(
      (loaded) => {
        if (mounted.current) setReferences(loaded);
      },
      (error: unknown) => console.error("add-wine sheet: the reference lists did not load", error),
    );
  }, []);

  // The laptop's "From my cellar" tile and E1's "My cellar" subtitle.
  const needsSummary = state.canScan === false || dest === null;
  useEffect(() => {
    if (!needsSummary || started.current.summary) return;
    started.current.summary = true;
    getCellarSummary().then(
      (summary) => {
        if (mounted.current) setCellarSummary(summary);
      },
      (error: unknown) => {
        started.current.summary = false;
        console.error("add-wine sheet: the cellar counts did not load", error);
      },
    );
  }, [needsSummary]);

  // E1: the bottles you already hold of the wine being chosen for.
  useEffect(() => {
    if (ownedFor === null || ownedRequested.current.has(ownedFor)) return;
    const catalogWineId = ownedFor;
    ownedRequested.current.add(catalogWineId);
    ownedBottlesFor(catalogWineId).then(
      (found) => {
        if (mounted.current) setOwned((known) => ({ ...known, [catalogWineId]: found }));
      },
      (error: unknown) => {
        ownedRequested.current.delete(catalogWineId);
        console.error("add-wine sheet: the owned bottles did not load", error);
      },
    );
  }, [ownedFor]);

  // A6: the cellar, loaded each time the view opens so its in-flight rows are current.
  const cellarOpen = view === "cellar";
  useEffect(() => {
    if (!cellarOpen) return;
    const seq = ++cellarSeq.current;
    listCellarForSheet(tastingId).then(
      (sheet) => {
        if (!mounted.current || seq !== cellarSeq.current) return;
        setCellar({ sheet, failed: false });
        setTitles((known) => withTitles(known, sheet.lots.map((row) => [row.catalogWineId, row.title] as const)));
      },
      (error: unknown) => {
        console.error("add-wine sheet: the cellar did not load", error);
        if (mounted.current && seq === cellarSeq.current) setCellar((current) => ({ sheet: current.sheet, failed: true }));
      },
    );
  }, [cellarOpen, tastingId]);

  // A5 / A8: the search, for the query on screen and the tasting it would pour into.
  const searchReady = state.canScan !== null;
  const searchDue = useEffectEvent((due: string, tasting: string | undefined) => runSearch(due, tasting));
  useEffect(() => {
    if (!searchReady) return;
    const timer = window.setTimeout(() => searchDue(query, tastingId), query === "" ? 0 : SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchReady, query, tastingId]);

  // --- the search ------------------------------------------------------------------

  /** Runs `searchAddWine` now. Only the newest search lands. Rule 11's refresh after an add calls it too. */
  function runSearch(due: string, tasting: string | undefined): void {
    const seq = ++searchSeq.current;
    if (due === "") {
      setSearchPending(false);
      return;
    }
    setSearchPending(true);
    searchAddWine(due, { tastingId: tasting }).then(
      (found) => {
        if (!mounted.current || seq !== searchSeq.current) return;
        setSearch({ query: due, tastingId: tasting, groups: found });
        setTitles((known) => withTitles(known, groupTitles(found)));
        setSearchPending(false);
      },
      (error: unknown) => {
        console.error("add-wine sheet: the search failed", error);
        if (!mounted.current || seq !== searchSeq.current) return;
        setSearch({ query: due, tastingId: tasting, groups: NO_GROUPS });
        setSearchPending(false);
      },
    );
  }

  // --- focus ------------------------------------------------------------------------

  /** Runs `run` and commits what it dispatched before returning, so the input it opens is on screen. */
  function inTap<T>(run: () => T): T {
    let result!: T;
    flushSync(() => {
      result = run();
    });
    return result;
  }

  /** Rule 9: open the form (or not) and focus the field it names, inside the same tap. A form reopened with
      typing in it (rule 1) may have filled that field since, so the form's own first gap takes the focus instead. */
  function openFormInTap(run: () => WineFieldKey | null): void {
    const field = inTap(run);
    if (field === null) return;
    const s = stateRef.current;
    const session = s.view === "byhand" ? s.byHand : null;
    const gaps = session === null ? [] : missingWineFields(session.draft, { unidentified: session.unidentified });
    fieldRefs.current[gaps.length === 0 || gaps.includes(field) ? field : gaps[0]]?.focus();
  }

  function requestFocus(field: WineFieldKey): void {
    focusSeq.current += 1;
    setFocusRequest({ field, seq: focusSeq.current });
  }

  /** "Or search wine catalog", the confirm's Search, "Search instead": the phone search view, or the laptop view's own field. */
  function openSearch(text?: string): void {
    if (stateRef.current.canScan === false) {
      inTap(() => {
        if (text !== undefined) adds.send({ type: "desktopQuery", query: text });
        adds.send({ type: "go", view: "desktop" });
      });
      desktopInputRef.current?.focus({ preventScroll: true });
      return;
    }
    inTap(() => {
      if (text !== undefined) adds.send({ type: "searchQuery", query: text });
      adds.send({ type: "go", view: "search" });
    });
    searchInputRef.current?.focus({ preventScroll: true });
  }

  /** A7 for a new wine: the By hand chip and tile, "Add it by hand", "Neither of these". An unsaved new wine
      reopens, whether it is the form on screen or one another form's open set aside (rule 1). A form with
      typing in it that this open covers is set aside by the reducer, never dropped. */
  function openNewByHand(inGesture: boolean): void {
    const open = (): WineFieldKey | null => {
      const reused = sessionToReopen(stateRef.current, { kind: "new" });
      const draft = reused?.draft ?? emptyDraft();
      const first = missingWineFields(draft, { unidentified: reused?.unidentified ?? false })[0] ?? null;
      // Nothing has been read or attempted yet, so no field is flagged; the first gap only takes the focus.
      adds.send({ type: "openByHand", origin: { kind: "new" }, draft, focusField: reused?.focusField ?? null });
      return stateRef.current.view === "byhand" ? first : null;
    };
    if (inGesture) openFormInTap(open);
    else open();
  }

  function chooseInTap(choice: ChooserChoice): void {
    openFormInTap(() => adds.choose(choice));
  }

  // --- the read pipeline (spec §A.4, §C.4 rules 3 and 4) -------------------------------

  function enqueuePhotos(blobs: readonly Blob[]): void {
    const s = stateRef.current;
    // A note is one wine: one photo.
    const picked = sheetMatrix(currentDestination(s), s.canScan === true).upload.multiple ? blobs : blobs.slice(0, 1);
    if (picked.length === 0) return;
    const items = picked.map((blob) => {
      const photoUrl = URL.createObjectURL(blob);
      photoUrls.current.add(photoUrl);
      return { id: newId(), photoUrl, blob };
    });
    // Each row reads "Reading the label…" from here on.
    adds.send({ type: "enqueue", items });
    void drain();
  }

  function retryItem(id: string): void {
    adds.send({ type: "itemRetry", id });
    void drain();
  }

  /** One photo at a time, oldest first. A failure never stops the queue. */
  async function drain(): Promise<void> {
    if (draining.current) return;
    draining.current = true;
    let last: string | null = null;
    try {
      while (mounted.current) {
        const item = nextQueued(stateRef.current);
        if (item === null) break;
        const key = `${item.id}|${item.status}|${item.imagePath ?? ""}`;
        if (key === last) {
          // Nothing moved it on: it becomes a failed row rather than spinning.
          adds.send({ type: "itemFailed", id: item.id });
          continue;
        }
        last = key;
        try {
          await processItem(item);
        } catch (error) {
          console.error("add-wine sheet: a photo could not be read", error);
          if (mounted.current) adds.send({ type: "itemFailed", id: item.id, error: "service" });
        }
      }
    } finally {
      draining.current = false;
    }
  }

  async function processItem(item: ScanItem): Promise<void> {
    let imagePath = item.imagePath;
    if (imagePath === null) {
      imagePath = await uploadPhoto(item);
      if (imagePath === null) return;
      adds.send({ type: "itemUploaded", id: item.id, imagePath });
    }
    // A photo removed meanwhile, or a closed sheet, spends no read. Retry reads an uploaded path again.
    if (!mounted.current || !isQueued(stateRef.current, item.id)) return;
    let outcome: Awaited<ReturnType<typeof readLabelPhoto>>;
    try {
      outcome = await readLabelPhoto({ imagePath });
    } catch (error) {
      console.error("add-wine sheet: the label read did not come back", error);
      outcome = { ok: false, reason: "network" };
    }
    if (!mounted.current) return;
    if (outcome.ok) landRead(item.id, outcome);
    else adds.send({ type: "itemFailed", id: item.id, error: outcome.reason });
  }

  /** Downscaled and re-encoded as a JPEG, then uploaded to the caller's own staging folder. Null once it failed (and says so). */
  async function uploadPhoto(item: ScanItem): Promise<string | null> {
    const failed = (reason: string): null => {
      if (mounted.current) adds.send({ type: "itemFailed", id: item.id, error: reason });
      return null;
    };
    if (item.blob === null) return failed("image");
    let jpeg: Blob;
    try {
      jpeg = await downscaleForRead(item.blob);
    } catch (error) {
      if (!(error instanceof ImageDecodeError)) console.error("add-wine sheet: a photo could not be prepared", error);
      return failed("image");
    }
    if (!mounted.current || !isQueued(stateRef.current, item.id)) return null;
    // `readLabelPhoto` accepts only `catalog/staging/<own user id>/scan-….jpg`.
    const path = `catalog/staging/${userId}/scan-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    try {
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, jpeg, { contentType: "image/jpeg" });
      if (error) throw error;
    } catch (error) {
      console.error("add-wine sheet: a photo did not upload", error);
      return failed("network");
    }
    return path;
  }

  function landRead(id: string, read: LabelPhotoRead): void {
    const before = stateRef.current;
    const readMatrix = sheetMatrix(currentDestination(before), before.canScan === true);
    // In Many, or a laptop queue, a partial read the matrix stacks is a pending row with no confirm.
    const stack = stackPartialRead(before, read.missing, readMatrix);
    adds.send({ type: "itemRead", id, read, stack });
    const gap = read.missing[0];
    if (stack || gap === undefined || !readMatrix.partialRead.skipConfirm) return;
    // D7: a note's partial read opens the form on the gap instead of its confirm,
    // only where the reducer has just put that confirm on screen.
    const after = stateRef.current;
    if (after.view !== "confirm" || after.activeItemId !== id) return;
    adds.send({ type: "openByHand", origin: { kind: "item", itemId: id }, draft: read.draft, focusField: gap, ticket: ticketFor(after) });
    if (stateRef.current.view === "byhand") requestFocus(gap);
  }

  // --- rows and sources ---------------------------------------------------------------

  function itemAction(itemId: string, action: ItemAction): void {
    switch (action) {
      case "fix":
        openFormInTap(() => adds.fixItem(itemId));
        return;
      case "remove":
        adds.send({ type: "itemRemove", id: itemId });
        return;
      case "retry":
        retryItem(itemId);
        return;
    }
  }

  /** A5: a phone result row. "Open" leaves for the catalog page. */
  function searchRow(row: SearchRow, action: SheetRowAction): void {
    if (action === "open") {
      router.push(catalogHref(row.catalogWineId));
      adds.requestClose();
      return;
    }
    const source = rowSource(row, action, stateRef.current.desktop.consume);
    if (source !== null) void adds.performAdd(source, { title: titles[row.catalogWineId] });
  }

  /** A8 / B1 / C1 / D1: a laptop result row. An "Open" row's own link navigates; the sheet only closes. */
  function desktopRow(row: DesktopRow, action: SheetRowAction): void {
    if (action === "open") {
      adds.requestClose();
      return;
    }
    const lotId = row.source.kind === "lot" ? row.source.lotId : undefined;
    const source = rowSource(
      { source: row.listedAs, catalogWineId: row.catalogWineId, lotId },
      action,
      stateRef.current.desktop.consume,
    );
    if (source !== null) void adds.performAdd(source, { title: row.title });
  }

  /** A6's primary: the selected lot, carrying its wine (amendment 22) and the consume choice. */
  function addSelectedLot(): void {
    const s = stateRef.current;
    const picked = cellar.sheet?.lots.find((row) => row.lotId === s.cellar.selectedLotId);
    if (picked === undefined) return;
    void adds.performAdd(
      { kind: "lot", lotId: picked.lotId, consume: s.cellar.consume, catalogWineId: picked.catalogWineId },
      { title: picked.title },
    );
  }

  // --- render -----------------------------------------------------------------------

  const dark = DARK_VIEWS.includes(view);
  const header = headerFor(state, matrix, cellar.sheet);
  const addedCount = footerCount(state);
  const stripError = OWN_ERROR_VIEWS.includes(view) ? null : state.error;
  const strip = stripError ?? adds.notice;
  const formMatrix = formMatrixFor(dest, finishing, canScan, matrix);
  const close = () => adds.requestClose();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) adds.requestClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          "inset-0 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0",
          // The frame alone is width-based: full-screen below `sm`, a centred card
          // above, content-height and scrolling except on the photo views.
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88vh] sm:w-[calc(100vw-3rem)] sm:max-w-[760px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          PHOTO_VIEWS.includes(view) && "sm:h-[88vh]",
          dark ? "bg-console text-primary-foreground" : "bg-card text-foreground",
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center gap-3 p-[8px_16px_10px] md:gap-[14px] md:p-[18px_22px_14px]",
            !dark && "border-b border-border",
          )}
        >
          {BACK_VIEWS.includes(view) ? (
            <HeaderIconButton label="Back" dark={dark} onClick={() => adds.send({ type: "back" })}>
              <ArrowLeft className="size-5" />
            </HeaderIconButton>
          ) : (
            <HeaderIconButton label="Close" dark={dark} className="md:hidden" onClick={close}>
              <X className="size-5" />
            </HeaderIconButton>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {header.eyebrow ? (
              <Eyebrow size="md" className={cn("truncate", dark && "text-console-ink")}>
                {header.eyebrow}
              </Eyebrow>
            ) : null}
            <div className="flex items-center gap-[10px]">
              <DialogTitle
                className={cn(
                  header.titleHidden
                    ? "sr-only"
                    : "truncate font-heading text-[20px] font-semibold leading-[1.05] md:text-[25px]",
                  dark ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {header.title}
              </DialogTitle>
              {state.multi && addedCount > 0 && !header.titleHidden ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-[11px] py-[5px] text-[11.5px] font-bold",
                    dark ? "border-gold-light bg-gold-light/20 text-gold-light" : "border-gold bg-gold/15 text-gold-dark",
                  )}
                >
                  +{addedCount} added
                </span>
              ) : null}
            </div>
          </div>
          {view === "search" && canScan ? (
            <button
              type="button"
              onClick={() => adds.send({ type: "go", view: "camera" })}
              className="flex min-h-11 shrink-0 items-center gap-[6px] rounded-full border border-border px-[13px] text-[13px] font-semibold text-primary transition-colors hover:border-gold hover:bg-surface-raised"
            >
              <Camera className="size-4" aria-hidden />
              Scan
            </button>
          ) : null}
          {header.bottles ? (
            <span className="shrink-0 text-[11.5px] text-muted-foreground">{header.bottles}</span>
          ) : null}
          <HeaderIconButton label="Close" dark={dark} className="hidden md:flex" onClick={close}>
            <X className="size-5" />
          </HeaderIconButton>
        </header>

        {strip ? (
          <p
            role="status"
            className={cn(
              "shrink-0 px-4 pb-2 text-[12.5px] md:px-[22px]",
              stripError ? (dark ? "text-miss" : "text-rose") : dark ? "text-gold-light" : "text-gold-dark",
            )}
          >
            {strip}
          </p>
        ) : null}
        {state.skippedLot && (view === "camera" || view === "search") ? (
          <SkippedLotNotice
            lotId={state.skippedLot.lotId}
            tone={dark ? "dark" : "light"}
            onOpen={close}
            className="shrink-0 px-4 md:px-[22px]"
          />
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {view === "resolving" ? (
            <Centered>
              <WineGlassLoader className="text-primary" />
            </Centered>
          ) : (
            <>
              {/* Mounted from the first paint and hidden until current (rule 9),
                  so the input exists before the tap that opens it. */}
              <div className={view === "search" ? "contents" : "hidden"}>
                <SearchView
                  matrix={matrix}
                  query={state.search.query}
                  onQuery={(text) => adds.send({ type: "searchQuery", query: text })}
                  inputRef={searchInputRef}
                  groups={canScan ? shownGroups : null}
                  loading={canScan && loading}
                  consume={state.desktop.consume}
                  onConsume={(consume) => adds.send({ type: "consume", surface: "desktop", consume })}
                  onRow={searchRow}
                  onByHand={() => openNewByHand(true)}
                  busy={adds.busy}
                  error={state.error}
                />
              </div>
              <div className={view === "byhand" && !editLoading ? "contents" : "hidden"}>
                <ByHandForm
                  session={state.byHand}
                  matrix={formMatrix}
                  destination={dest}
                  references={references}
                  finishing={finishing}
                  busy={adds.busy}
                  error={state.error}
                  userId={userId}
                  onChange={(draft) => adds.send({ type: "byHandChange", draft })}
                  onUnidentified={(on) => adds.send({ type: "byHandUnidentified", on })}
                  onSave={() => openFormInTap(() => adds.saveByHand())}
                  onLeaveForLater={offersLeaveForLater(state, finishing, matrix) ? () => adds.leaveForLater() : null}
                  onSearchInstead={() => openSearch()}
                  fieldRefs={fieldRefs}
                />
              </div>
              {view === "byhand" && editLoading ? (
                <Centered>
                  <WineGlassLoader className="text-primary" />
                </Centered>
              ) : null}

              {view === "camera" ? (
                <CameraView
                  matrix={matrix}
                  destination={dest}
                  multi={state.multi}
                  items={state.items}
                  addedCount={addedCount}
                  onCapture={(blob) => enqueuePhotos([blob])}
                  onLibrary={(files) => enqueuePhotos(files)}
                  onOpenSearch={() => openSearch()}
                  onChip={(chip) => (chip === "cellar" ? adds.send({ type: "go", view: "cellar" }) : openNewByHand(true))}
                  onMany={() => adds.send({ type: "setMulti", multi: true })}
                  onDone={close}
                  onItemAction={itemAction}
                />
              ) : null}

              {view === "reading" ? <ReadingView imageUrl={activeItem?.photoUrl ?? null} /> : null}

              {view === "confirm" && activeItem ? (
                <ReadConfirm
                  key={activeItem.id}
                  item={activeItem}
                  matrix={matrix}
                  destination={dest}
                  canScan={canScan}
                  flightHint={flightHint}
                  cellarHint={cellarHint}
                  sourceIsLot={false}
                  busy={adds.busy}
                  error={state.error}
                  onPrimary={() => openFormInTap(() => adds.primaryFromConfirm(activeItem))}
                  onScanNext={() => openFormInTap(() => adds.primaryFromConfirm(activeItem, { scanNext: true }))}
                  onFix={() => openFormInTap(() => adds.fixItem(activeItem.id))}
                  onByHand={() => openFormInTap(() => adds.byHandFromConfirm(activeItem))}
                  onSearch={(text) => openSearch(text)}
                  onRescan={() => adds.send({ type: "itemRemove", id: activeItem.id })}
                  onRetry={() => retryItem(activeItem.id)}
                  onRemove={() => adds.send({ type: "itemRemove", id: activeItem.id })}
                  onChoose={chooseInTap}
                />
              ) : null}

              {view === "choose" ? (
                <ChooseBody
                  title={state.chooseFor?.title ?? chooserItem?.read?.display.title ?? ""}
                  missing={state.chooseFor?.missing ?? []}
                  error={state.error}
                >
                  {/* Amendment 22: with no chooser wine left, the rows are for the bottle in hand. */}
                  {state.chooseFor !== null || chooserItem?.read ? (
                    <Chooser
                      flightHint={flightHint}
                      cellarHint={cellarHint}
                      sourceIsLot={state.chooseFor?.source?.kind === "lot"}
                      busy={adds.busy}
                      onChoose={chooseInTap}
                    />
                  ) : null}
                </ChooseBody>
              ) : null}

              {view === "cellar" ? (
                <CellarView
                  matrix={matrix}
                  sheet={cellar.sheet}
                  filter={state.cellar.filter}
                  onFilter={(filter) => adds.send({ type: "cellarFilter", filter })}
                  selectedLotId={state.cellar.selectedLotId}
                  onSelect={(lotId) => adds.send({ type: "cellarSelect", lotId })}
                  consume={state.cellar.consume}
                  onConsume={(consume) => adds.send({ type: "consume", surface: "cellar", consume })}
                  onAdd={addSelectedLot}
                  onScanOrSearch={() => adds.send({ type: "go", view: homeViewFor(canScan) })}
                  loadFailed={cellar.failed}
                  busy={adds.busy}
                  error={state.error}
                />
              ) : null}

              {view === "lot" && lot && lotSource ? (
                <CellarLotStep
                  key={lotSource.catalogWineId}
                  matrix={matrix}
                  catalogWineId={lotSource.catalogWineId}
                  title={lotTitle(state, titles)}
                  quantity={lot.quantity}
                  rack={lot.rack}
                  price={lot.price}
                  onField={(field, value) => adds.send({ type: "lotField", field, value })}
                  currency={preferredCurrency}
                  busy={adds.busy}
                  error={state.error}
                  onAdd={() => void adds.lotAdd()}
                  onMerge={(target) => void adds.lotMerge(target)}
                  onSkip={(lotId) => adds.lotSkip(lotId)}
                />
              ) : null}

              {view === "followup" && state.followUp ? (
                <FollowUpView
                  followUp={state.followUp}
                  onCellar={() => adds.followUpCellar()}
                  onNote={() => adds.followUpNote()}
                  onDone={() => adds.followUpDone()}
                />
              ) : null}

              {view === "desktop" ? (
                <DesktopView
                  matrix={matrix}
                  destination={dest}
                  query={state.desktop.query}
                  onQuery={(text) => adds.send({ type: "desktopQuery", query: text })}
                  inputRef={desktopInputRef}
                  groups={canScan ? null : shownGroups}
                  loading={!canScan && loading}
                  focusedRow={state.desktop.focusedRow}
                  onFocusRow={focusDesktopRow}
                  consume={state.desktop.consume}
                  onConsume={(consume) => adds.send({ type: "consume", surface: "desktop", consume })}
                  items={state.items}
                  draftForMeta={latestDraft(state)}
                  cellarSummary={cellarSummary}
                  lastRack={state.lastRack}
                  addedCount={addedCount}
                  onRow={desktopRow}
                  onFiles={(files) => enqueuePhotos(files)}
                  onCellarTile={() => adds.send({ type: "go", view: "cellar" })}
                  onByHand={() => openNewByHand(true)}
                  onNeither={() => openNewByHand(true)}
                  onItemAction={itemAction}
                  onFooterButton={close}
                  busy={adds.busy}
                  error={state.error}
                  skippedLot={state.skippedLot}
                  onSkippedOpen={close}
                />
              ) : null}
            </>
          )}
        </div>

        {/* Rule 7: never a modal. Discard hands on a note pick the ask holds; Keep going keeps every bottle. */}
        {state.closeAsk ? (
          <CloseAskFooter
            unfinished={state.closeAsk.unfinished}
            dark={dark}
            onDiscard={() => adds.discardAndClose()}
            onKeepGoing={() => adds.send({ type: "cancelClose" })}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function HeaderIconButton({
  label,
  dark,
  className,
  onClick,
  children,
}: {
  label: string;
  dark: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full",
        dark ? "text-primary-foreground/75" : "text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Rule 7's ask: "{n} wine not added yet" · Discard · Keep going, in the footer. */
function CloseAskFooter({
  unfinished,
  dark,
  onDiscard,
  onKeepGoing,
}: {
  unfinished: number;
  dark: boolean;
  onDiscard: () => void;
  onKeepGoing: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] sm:pb-3 md:px-[22px]",
        dark ? "border-primary-foreground/[.16] bg-console-card text-primary-foreground" : "border-border bg-background text-foreground",
      )}
    >
      <p className="min-w-0 flex-1 text-[13.5px] font-semibold">{unfinishedLabel(unfinished)}</p>
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onDiscard}
          className={cn(
            "h-11 rounded-[10px] px-4 text-[13.5px] font-semibold",
            dark && "border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground",
          )}
        >
          Discard
        </Button>
        <Button
          type="button"
          onClick={onKeepGoing}
          className={cn(
            "h-11 rounded-[10px] px-4 text-[13.5px] font-semibold",
            dark && "bg-gold-light text-console hover:bg-gold",
          )}
        >
          Keep going
        </Button>
      </div>
    </div>
  );
}

/** E1's rows in the `choose` view: the wine they are for, what it still needs, and the chooser. */
function ChooseBody({
  title,
  missing,
  error,
  children,
}: {
  title: string;
  missing: readonly WineFieldKey[];
  error: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col justify-end gap-[14px] px-4 pt-6 pb-[max(22px,env(safe-area-inset-bottom))] text-primary-foreground sm:pb-[22px] md:px-[22px]">
      {title ? <h3 className="font-heading text-[29px] font-semibold leading-[1.06]">{title}</h3> : null}
      {missing.length > 0 ? (
        <p className="text-[13px] font-semibold text-gold-light">{describeMissing(missing)}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[12.5px] text-miss">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8">{children}</div>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function unfinishedLabel(n: number): string {
  return `${n} ${n === 1 ? "wine" : "wines"} not added yet`;
}

function catalogHref(catalogWineId: string): string {
  return `/catalog/${encodeURIComponent(catalogWineId)}`;
}

/** The query on screen: the laptop view's field, or the phone search view's. */
function queryOf(s: SheetState): string {
  return s.canScan === false ? s.desktop.query : s.search.query;
}

/** The tasting a search marks rows "in flight" for: the flight destination's, or the flight hint's (rule 11). */
function searchTastingId(s: SheetState, hint: FlightHint | null): string | undefined {
  const destination = currentDestination(s);
  return destination?.kind === "flight" ? destination.tastingId : hint?.tastingId;
}

/** The next photo waiting for its upload or its read, in queue order. */
function nextQueued(s: SheetState): ScanItem | null {
  for (const id of s.queue) {
    const item = s.items.find((row) => row.id === id);
    if (item && (item.status === "uploading" || item.status === "reading")) return item;
  }
  return null;
}

function isQueued(s: SheetState, id: string): boolean {
  return s.queue.includes(id) && s.items.some((item) => item.id === id);
}

function itemInHand(s: SheetState): ScanItem | null {
  const id = addTargetId(s);
  return id === null ? null : (s.items.find((item) => item.id === id) ?? null);
}

/** E1: the catalog wine whose owned bottles the chooser's "My cellar" names, or null. */
function chooserWineId(s: SheetState, active: ScanItem | null): string | null {
  if (s.view === "confirm") return active?.read?.match?.catalogWineId ?? null;
  if (s.view !== "choose") return null;
  const source = s.chooseFor?.source;
  if (source?.kind === "catalog") return source.catalogWineId;
  if (source?.kind === "lot") return source.catalogWineId ?? null;
  const itemId = s.chooseFor?.itemId ?? null;
  const item = itemId === null ? itemInHand(s) : (s.items.find((row) => row.id === itemId) ?? null);
  return item?.read?.match?.catalogWineId ?? null;
}

/** A row's add. A lot carries its wine (amendment 22) and the footer's consume choice. */
function rowSource(row: SearchRow, action: SheetRowAction, consume: boolean): AddSource | null {
  if (action === "plusOne") return row.lotId === undefined ? null : { kind: "plusOne", lotId: row.lotId };
  if (row.source === "lot") {
    return row.lotId === undefined ? null : { kind: "lot", lotId: row.lotId, consume, catalogWineId: row.catalogWineId };
  }
  return { kind: "catalog", catalogWineId: row.catalogWineId, via: "search" };
}

function headerFor(s: SheetState, matrix: SheetMatrix, cellarSheet: CellarSheet | null): Header {
  switch (s.view) {
    case "cellar":
      // A6: the destination's title as eyebrow, "From my cellar", "{n} bottles".
      return {
        eyebrow: matrix.title("home"),
        title: "From my cellar",
        titleHidden: false,
        bottles: cellarSheet === null ? null : bottlesLabel(cellarSheet.totalBottles),
      };
    case "byhand":
      // A7 / A4b: the form draws its own header (eyebrow, title, gaps, "Search instead").
      return { eyebrow: null, title: matrix.byHand.eyebrow, titleHidden: true, bottles: null };
    case "choose":
      return { eyebrow: null, title: CHOOSE_TITLE, titleHidden: false, bottles: null };
    default: {
      const phase = s.items.some((item) => item.read !== null) ? "read" : "home";
      return {
        eyebrow: matrix.eyebrow,
        title: s.multi && matrix.multiTitle ? matrix.multiTitle : matrix.title(phase),
        titleHidden: false,
        bottles: null,
      };
    }
  }
}

/** A4b's finishing header: a glass (its number when known), or a read being fixed. A new wine has none. */
function finishingFor(s: SheetState, editing: EditingGlass | null): Finishing {
  const origin = s.byHand?.origin;
  if (origin === undefined || origin.kind === "new") return null;
  if (origin.kind !== "glass") return { glass: null };
  if (editing?.wineId === origin.wineId) return { glass: editing.glass };
  const row = s.items.find((item) => item.added?.wineId === origin.wineId);
  return { glass: row?.added?.glass ?? null };
}

/** An existing glass saves as its own number ("Save · glass 3"), not as the flight's next one. */
function formMatrixFor(
  destination: AddWineDestination | null,
  finishing: Finishing,
  canScan: boolean,
  matrix: SheetMatrix,
): SheetMatrix {
  if (destination?.kind !== "flight" || finishing?.glass == null) return matrix;
  return sheetMatrix({ ...destination, position: finishing.glass }, canScan);
}

/** A4b's footer: "Leave it for later" while finishing an incomplete glass, or a
    read wherever a partial read can wait (a pending row, or an incomplete
    glass). A note takes a single pick, so it has none. */
function offersLeaveForLater(s: SheetState, finishing: Finishing, matrix: SheetMatrix): boolean {
  const origin = s.byHand?.origin;
  if (origin === undefined || finishing === null) return false;
  if (origin.kind === "glass") return origin.incomplete;
  return matrix.partialRead.stacked !== "by-hand";
}

/** D1's metas compare rows with the latest draft: the form's, or the newest read's. */
function latestDraft(s: SheetState): WineIdentityDraft | null {
  if (s.byHand !== null) return s.byHand.draft;
  for (let i = s.items.length - 1; i >= 0; i--) {
    const draft = s.items[i].draft ?? s.items[i].read?.draft ?? null;
    if (draft !== null) return draft;
  }
  return null;
}

/** The lot step was opened by the by-hand form's save (catalog-then-lot). */
function lotFromForm(s: SheetState): boolean {
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (!CHAIN_SKIPS.includes(s.history[i])) return s.history[i] === "byhand";
  }
  return false;
}

/** The lot step's wine title: what the sheet already shows for that wine. */
function lotTitle(s: SheetState, titles: Record<string, string>): string | null {
  const source = s.lot?.source;
  if (source?.kind !== "catalog") return null;
  const id = source.catalogWineId;
  if (s.followUp?.catalogWineId === id && s.followUp.title) return s.followUp.title;
  const chosen = s.chooseFor;
  if (chosen?.title && chosen.source?.kind === "catalog" && chosen.source.catalogWineId === id) return chosen.title;
  if (titles[id]) return titles[id];
  for (const item of s.items) {
    if (item.read?.match?.catalogWineId === id && item.read.display.title) return item.read.display.title;
    if (item.added?.catalogWineId === id && item.added.label) return item.added.label;
  }
  if (s.byHand !== null && lotFromForm(s)) return readDisplay(s.byHand.draft, NO_NAMES).title || null;
  return itemInHand(s)?.read?.display.title || null;
}

function initialTitles(initial: InitialLot | null): Record<string, string> {
  return initial?.source.kind === "catalog" && initial.title ? { [initial.source.catalogWineId]: initial.title } : {};
}

function groupTitles(groups: SearchGroups): (readonly [string, string])[] {
  return [...groups.cellar, ...groups.catalog, ...groups.tasted].map((row) => [row.catalogWineId, row.title] as const);
}

function withTitles(
  known: Record<string, string>,
  entries: readonly (readonly [string, string])[],
): Record<string, string> {
  let next: Record<string, string> | null = null;
  for (const [id, title] of entries) {
    if (!title || known[id] === title) continue;
    next ??= { ...known };
    next[id] = title;
  }
  return next ?? known;
}
