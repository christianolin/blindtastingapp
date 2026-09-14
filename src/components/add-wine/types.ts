import type { Ref } from "react";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import type { SheetMatrix } from "./matrix";
import type { ByHandReferences } from "./by-hand-actions";
import type { CellarSummary, DesktopRow } from "./desktop-format";
import type { CellarFilter, CellarSheet } from "./row-format";
import type { ByHandSession, ScanItem } from "./sheet-state";

// ---------------------------------------------------------------------------
// Contracts from docs/superpowers/specs/2026-09-12-add-wine-v2-scan-and-flow-
// fixes-design.md §C.1 (they replace the 2026-09-12 flows spec's "Contracts").
// Verbatim — every view and the provider build against these; change the spec
// first. Destination-dependent copy and rules live in ./matrix (§C.2).
// ---------------------------------------------------------------------------

export type AddWineDestination =
  | {
      kind: "flight";
      tastingId: string;
      tastingName: string;
      revealMode: RevealMode;
      wineSource: WineSourceMode;
      position: number;            // existing wine count + 1; re-read after each add
    }
  | { kind: "cellar" }
  | { kind: "catalog" }
  /** Taste & rate: one wine, then its WSET note opens (D4; was "rate"). */
  | { kind: "note" };

export type AddWineStart = "camera" | "search" | "cellar" | "byhand";

export type AddWineOpenOptions = {
  start?: AddWineStart;            // routed by canScan (C.3); cellar and byhand open those views on every device
  multi?: boolean;                 // ignored for note
  onAdded?: (added: AddedWine) => void;
  /** flight only: open the by-hand form on an existing glass (Edit; finishing an incomplete glass) */
  edit?: { wineId: string };
  /** flight only, BT-L3 (S4c): open straight into swap mode for an existing
      glass — the flight destination's ordinary start view, with `swap` set
      from the first paint (the glass number is resolved once the edit form,
      opened separately, has loaded it). */
  swap?: { wineId: string };
};

/** wines.added_via (E.3) */
export type AddedVia = "SCAN" | "CATALOG" | "CELLAR" | "BY_HAND";

export type AddSource =
  | { kind: "catalog"; catalogWineId: string; via: "scan" | "search" }
  | { kind: "lot"; lotId: string; consume: boolean; catalogWineId?: string }
  | { kind: "plusOne"; lotId: string }                                          // cellar destination, a wine you own (D9)
  | { kind: "identity"; draft: WineIdentityDraft; via: "scan" | "byhand"; readId: string | null }
  | { kind: "unidentified"; draft: WineIdentityDraft }                          // flight only (byhand-7)
  | { kind: "incomplete"; draft: WineIdentityDraft; via: "scan" | "byhand" };   // flight only (D7)

export type AddedWine = {
  label: string;                   // "Produttori del Barbaresco 2018"
  destination: "flight" | "cellar" | "catalog";
  catalogWineId: string | null;    // null for an incomplete or unidentified glass
  glass?: number;                  // flight
  wineId?: string;                 // flight: wines.id
  lotId?: string;                  // cellar
  incomplete?: { missing: WineFieldKey[] };
  written?: boolean;               // catalog: a new row was created (D3's header)
};

export type AddResult =
  | { ok: true; added: AddedWine; warning?: string }
  | { error: string; missing?: WineFieldKey[] };

/** What a note pick hands the provider (was RatePick). */
export type NotePick = { catalogWineId: string; lotId?: string | null; consume?: boolean };

/** The tasting a destination-less add can go to. */
export type FlightHint = {
  tastingId: string;
  tastingName: string;
  position: number;
  /** D12 / entry-4: the chooser reads it "live now", "in progress" or "next up". */
  phase: "live" | "self-paced" | "next";
  revealMode: RevealMode;
  wineSource: WineSourceMode;
};

export type SearchGroups = {
  cellar: {
    lotId: string; catalogWineId: string; title: string; imageUrl: string | null;
    rack: string | null; quantity: number; drinkNow: boolean; inFlight: boolean;
  }[];
  catalog: {
    catalogWineId: string; title: string; subtitle: string | null; imageUrl: string | null;
    avgScore: number | null; noteCount: number; inFlight: boolean;
    /** Filled after the RPC so D1's row metas can compare a row with a draft (spec §C.1). */
    producerId: string; wineName: string | null; appellationId: string; vintageLabel: string;
  }[];
  tasted: {
    catalogWineId: string; title: string; imageUrl: string | null;
    myScore: number | null; tastedOn: string;
    producerId: string; wineName: string | null; appellationId: string; vintageLabel: string;
    /** sources-8: tasted rows beyond the catalog RPC's first page carry their own flag. */
    inFlight: boolean;
  }[];
};

// ---------------------------------------------------------------------------
// View contracts. The sheet shell (add-wine-sheet.tsx) owns the state machine
// and passes these down; each view file implements exactly one of them. Views
// never write to the database themselves — every add goes through `onAdd`, so
// the shell can apply the destination rules in one place.
// ---------------------------------------------------------------------------

export type SheetContext = {
  destination: AddWineDestination | null;
  multi: boolean;
  added: AddedWine[];
  flightHint: FlightHint | null;
  userId: string;
  preferredCurrency: string;
};

/** A2 (B2, C2 and D2 use the same view): the camera, its search field, the
    matrix's source chips and, in Many, the stack above the viewfinder. */
export type CameraViewProps = {
  matrix: SheetMatrix; destination: AddWineDestination | null; multi: boolean; items: ScanItem[]; addedCount: number;
  onCapture: (blob: Blob) => void; onLibrary: (files: File[]) => void;
  onOpenSearch: () => void;          // the shell unhides the parked search and focuses its input in the same tap
  onChip: (chip: "cellar" | "byhand") => void; onMany: () => void; onDone: () => void;
  onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
};

/** A3 = D2b, plus the E1/E1b footer: one read-and-confirm component for every
    destination (read-confirm.tsx). */
export type ReadConfirmProps = {
  item: ScanItem; matrix: SheetMatrix; destination: AddWineDestination | null; canScan: boolean;
  flightHint: FlightHint | null;
  cellarHint: { owned: { bottles: number; rack: string | null } | null; totalBottles: number } | null;
  sourceIsLot: boolean; busy: boolean; error: string | null;
  onPrimary: () => void; onScanNext: () => void; onFix: () => void; onByHand: () => void;
  onSearch: (query: string) => void; onRescan: () => void; onRetry: () => void; onRemove: () => void;
  onChoose: (choice: "flight" | "cellar" | "note" | "catalog") => void;
};

/** E1's "Where does it go?" rows, exported from read-confirm.tsx as `Chooser`;
    the shell's `choose` view reuses them under the header "Add wine". */
export type ChooserProps = Pick<ReadConfirmProps, "flightHint" | "cellarHint" | "sourceIsLot" | "busy" | "onChoose">;

/** D3: the catalog's follow-up after a single catalog add or confirm. */
export type FollowUpViewProps = {
  followUp: { catalogWineId: string; title: string; written: boolean };
  onCellar: () => void;
  onNote: () => void;
  onDone: () => void;
};

/** What a result row does on tap, per `matrix.row` (D9). */
export type SheetRowAction = ReturnType<SheetMatrix["row"]>["action"];

/** A5: search, one grouped list. The shell keeps this view mounted and hidden
    (spec §C.4 rule 9), holds the query in sheet state and runs `searchAddWine`;
    the field exists before "Or search wine catalog" is tapped, so the shell can
    focus `inputRef` inside that tap. Every destination rule comes from `matrix`. */
export type SearchViewProps = {
  matrix: SheetMatrix; query: string; onQuery: (q: string) => void; inputRef: Ref<HTMLInputElement>;
  groups: SearchGroups | null; loading: boolean; consume: boolean; onConsume: (v: boolean) => void;
  onRow: (row: { source: "lot" | "catalog" | "tasted"; catalogWineId: string; lotId?: string }, action: SheetRowAction) => void;
  onByHand: () => void;
  /** An add is running (spec §C.4 rule 11): the tapped row shows its loader and
      no row takes a second tap until it settles. */
  busy?: boolean;
  /** A failed add's message, shown in the footer strip. */
  error?: string | null;
};

/** A6: the cellar as a source. The shell loads the sheet (`listCellarForSheet`),
    keeps filter, selection and consume in sheet state, and renders the header:
    the matrix title as eyebrow, "From my cellar", "{n} bottles". */
export type CellarViewProps = {
  matrix: SheetMatrix; sheet: CellarSheet | null; filter: CellarFilter; onFilter: (f: CellarFilter) => void;
  selectedLotId: string | null; onSelect: (lotId: string | null) => void; consume: boolean; onConsume: (v: boolean) => void;
  onAdd: () => void;
  /** The empty cellar's "Scan or search instead" (unchanged): back to the home
      view. A failed load offers the same way out. */
  onScanOrSearch: () => void;
  /** `listCellarForSheet` failed while `sheet` is still null: the list area reads
      "Couldn't load your cellar right now." in place of the spinner (round 1's
      failed state). Ignored once a sheet is in hand. */
  loadFailed?: boolean;
  /** The add is running: the primary shows its loader and takes no second tap. */
  busy?: boolean;
  /** A failed add's message, shown above the primary. */
  error?: string | null;
};

/** The lot step behind B1/B2 and D3's "Add it to my cellar": how many bottles,
    the rack and an optional price, with the merge card when the wine is already
    held. Its source is always a catalog wine (the adds hook writes an identity
    to the catalog first), so the duplicate check always runs. The fields live
    in `state.lot`; the step writes nothing itself. */
export type CellarLotStepProps = {
  matrix: SheetMatrix;
  catalogWineId: string;
  /** The wine's display label, set under "Into your cellar". */
  title: string | null;
  quantity: number; rack: string; price: string;
  onField: (field: "quantity" | "rack" | "price", value: number | string) => void;
  /** The price currency (the profile's preferred one). */
  currency: string;
  busy: boolean; error: string | null;
  /** The primary ("Add to cellar") and the merge card's "Keep as a separate
      lot": a new lot from `quantity`, `rack` and `price`. */
  onAdd: () => void;
  /** "Add N to the existing lot": N = `quantity` more bottles on a lot already held. */
  onMerge: (target: { lotId: string; quantity: number }) => void;
  /** Plan amendment 18 (D17), "Don't add it": nothing is written. The shell
      dispatches `lotSkipped` with this lot, which "Open it" then links to. */
  onSkip: (lotId: string) => void;
};

/** A7 / A4b: the by-hand form, controlled by the sheet's `ByHandSession` (spec
    §C.4 rule 1). The shell mounts it hidden from the first paint (rule 9), so its
    field refs exist before any tap; every add and save goes through the shell. */
export type ByHandFormProps = {
  session: ByHandSession | null;                 // null: the shell has mounted the form hidden; render emptyDraft(), inert
  matrix: SheetMatrix; destination: AddWineDestination | null;
  references: ByHandReferences;                  // from F13's loadByHandReferences(), loaded once by the shell
  finishing: { glass: number | null } | null;    // the A4b header when set
  busy: boolean; error: string | null; userId: string;
  onChange: (draft: WineIdentityDraft) => void; onUnidentified: (on: boolean) => void;
  onSave: () => void; onLeaveForLater: (() => void) | null; onSearchInstead: () => void;
  fieldRefs: React.MutableRefObject<Partial<Record<WineFieldKey, HTMLElement | null>>>;  // registered even while hidden, so the shell can focus inside the tap
  /** BT-L3 (S4c): Swap and Remove, rendered at the bottom of the form only
      while `session.origin.kind === "glass"` (never a `destination.kind`
      test — the form checks its own session). Null outside that mode. */
  editGlass: EditGlassActions | null;
};

/** BT-L3 (S4c): the edit form's Swap and Remove rows. `canSwap` and Remove's
    own gate (`impact !== null`) mirror `glassSwapRefusal`/`glassRemoveRefusal`
    being null — computed by the shell from the loaded glass's `canEdit` and
    from `getGlassRemovalImpact`'s own "not yours to remove" null. */
export type EditGlassActions = {
  canSwap: boolean;
  onSwap: () => void;
  /** `getGlassRemovalImpact`'s result: null while loading, or not allowed. */
  impact: { guesses: number; privateNotes: number } | null;
  onRemove: () => void;
  removing: boolean;
  removeError: string | null;
};

/** A8 / B1 / C1 / D1: the sheet on a device that cannot scan. The shell draws
    the header, holds the query, the focused row and the consume choice in
    sheet state (`state.desktop`), runs `searchAddWine` and loads the cellar
    counts; every destination rule comes from `matrix`. The search field is the
    laptop's search, so the shell can focus `inputRef` inside the tap that lands
    here. Adding never closes the sheet. */
export type DesktopViewProps = {
  matrix: SheetMatrix; destination: AddWineDestination | null;
  query: string; onQuery: (q: string) => void; inputRef: Ref<HTMLInputElement>;
  groups: SearchGroups | null; loading: boolean;
  /** `state.desktop.focusedRow`; 0 (where a new query puts it) means the first
      addable row. ↑/↓ report the next row, never wrapping. Once ↑/↓ or an add
      pins a row, the view keeps this in step with that row as a refetch moves
      it, and reports -1 when the row's wine has left the list (no row focused:
      Enter does nothing until ↑/↓). */
  focusedRow: number; onFocusRow: (row: number) => void;
  consume: boolean; onConsume: (v: boolean) => void;
  items: ScanItem[]; draftForMeta: WineIdentityDraft | null;   // D1 metas compare against the latest read or by-hand draft
  cellarSummary: CellarSummary | null; lastRack: string | null; addedCount: number;
  /** A row's button, or Enter on the focused row. "open" is reported as the
      row's Link navigates to `/catalog/{id}` (click or Enter), so the shell
      only has to close the sheet; every other action is the shell's to run. */
  onRow: (row: DesktopRow, action: SheetRowAction) => void;
  onFiles: (files: File[]) => void; onCellarTile: () => void; onByHand: () => void; onNeither: () => void;
  onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
  onFooterButton: () => void;
  /** An add is running (spec §C.4 rule 11): the tapped row's button shows its
      loader and nothing takes a second tap or Enter until it settles. */
  busy?: boolean;
  /** A failed add's message, shown in the footer. */
  error?: string | null;
  /** Plan amendment 18 (D17): after "Don't add it" the laptop view shows "Not
      added — it's already in your cellar" with "Open it" on this lot
      (`state.skippedLot`). `onSkippedOpen` lets the shell close the sheet as
      that link navigates. */
  skippedLot?: { lotId: string } | null;
  onSkippedOpen?: () => void;
};

/** A4 (dark): one row per scanned bottle, its copy from `itemRowCopy`. Fix,
    Retry and Remove report the row's id. */
export type MultiAddStackProps = {
  items: ScanItem[];
  destination: AddWineDestination | null;
  onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
};
