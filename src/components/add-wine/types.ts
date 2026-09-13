import type { Ref } from "react";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import type { SheetMatrix } from "./matrix";
import type { CellarFilter, CellarSheet } from "./row-format";
import type { ScanItem } from "./sheet-state";

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
  /** D12 / entry-4; was `live: boolean`. Optional until every hint producer
      passes it (T10); S5c makes it required. */
  phase?: "live" | "self-paced" | "next";
  /** @deprecated removed in S5c — use `phase`. */
  live?: boolean;
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
// the shell can apply the destination rules in one place. Round 1's prop types
// stay until each S task rewrites its own view (plan F11).
// ---------------------------------------------------------------------------

/**
 * A scanned bottle waiting for a fix before it can be added (7d "Fix").
 * @deprecated removed in S5c — the sheet's `ScanItem` (sheet-state.ts) replaces it.
 */
export type PendingScan = {
  id: string;                  // client uuid
  imageUrl: string;
  prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial;
  problem: "no-vintage" | "incomplete";
};

export type SheetContext = {
  destination: AddWineDestination | null;
  multi: boolean;
  added: AddedWine[];
  pending: PendingScan[];
  flightHint: FlightHint | null;
  userId: string;
  preferredCurrency: string;
};

/**
 * The 7d inline "Fix" for a pending scan: a typed year, or NV.
 * @deprecated removed in S5c — Fix opens the by-hand form (D7).
 */
export type PendingFix = { vintageKind: "YEAR" | "NV"; vintageYear: number | null };

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

export type ByHandFormProps = {
  ctx: SheetContext;
  prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial | null;
  onAdd: (source: AddSource) => Promise<void>;
  onBack: () => void;
  busy: boolean;
};

export type DesktopViewProps = {
  ctx: SheetContext;
  onAdd: (source: AddSource) => Promise<void>;
  /** Dropped / picked label photos; each goes through the read-and-confirm
      path in turn (one label read per file). */
  onFiles: (files: File[]) => void;
  onCellar: () => void;
  onByHand: () => void;
  onDone: () => void;
  /** The pending ("Fix") rows work as in the camera view (7d). */
  onFixPending: (id: string, fix: PendingFix) => void;
  onRemovePending: (id: string) => void;
  busy: boolean;
  /** The search field, so the shell can focus it when the confirm view's
      "Search by name" lands here (a mouse device has no phone search view). */
  inputRef?: import("react").Ref<HTMLInputElement>;
};

/** A4 (dark): one row per scanned bottle, its copy from `itemRowCopy`. Fix,
    Retry and Remove report the row's id. */
export type MultiAddStackProps = {
  items: ScanItem[];
  destination: AddWineDestination | null;
  onItemAction: (itemId: string, action: "fix" | "remove" | "retry") => void;
};
