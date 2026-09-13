import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import type { WineFieldKey, WineIdentityDraft } from "@/lib/wine-identity/types";
import type { SheetMatrix } from "./matrix";
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

export type SearchViewProps = {
  ctx: SheetContext;
  onAdd: (source: AddSource) => Promise<void>;
  onScan: () => void;
  onByHand: () => void;
  onBack: () => void;
  busy: boolean;
  /** The shell keeps this view mounted (display:none) while another view is
      up, so the search field already exists when "Or search by name" is
      tapped and can be focused synchronously inside that tap — the only way
      a phone raises its keyboard (CLAUDE.md's combobox rule). `hidden` tells
      the view it is parked so it does not fetch on a stale query. */
  inputRef?: import("react").Ref<HTMLInputElement>;
  hidden?: boolean;
};

export type CellarViewProps = {
  ctx: SheetContext;
  onAdd: (source: AddSource) => Promise<void>;
  onBack: () => void;
  busy: boolean;
  /** The bottle total once the cellar has loaded — the shell shows it in
      the header's trailing slot ("38 bottles", 7f). */
  onLoaded?: (totalBottles: number) => void;
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
