import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Contracts from docs/superpowers/specs/2026-09-12-add-wine-sheet-and-tasting-
// flow-design.md ("Contracts"). Verbatim — every view and the provider build
// against these; change the spec first.
// ---------------------------------------------------------------------------

export type AddWineDestination =
  | {
      kind: "flight";
      tastingId: string;
      tastingName: string;
      revealMode: RevealMode;
      wineSource: WineSourceMode;
      /** Next glass number = existing wine count + 1; re-read after each add. */
      position: number;
    }
  | { kind: "cellar" }
  | { kind: "catalog" };

export type AddWineStart = "camera" | "search" | "cellar" | "byhand";

export type AddWineOpenOptions = {
  start?: AddWineStart;        // default: camera on phones, search on desktop
  multi?: boolean;             // open straight into the 7d stacked mode (bulk)
  /** Called after every successful add (the sheet stays open in multi mode). */
  onAdded?: (added: AddedWine) => void;
};

export type AddedWine = {
  catalogWineId: string;
  label: string;               // "Produttori del Barbaresco 2018"
  destination: NonNullable<AddWineDestination>["kind"];
  glass?: number;              // flight
  lotId?: string;              // cellar
  wineId?: string;             // flight: wines.id
};

/** A scanned bottle waiting for a fix before it can be added (7d "Fix"). */
export type PendingScan = {
  id: string;                  // client uuid
  imageUrl: string;
  prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial;
  problem: "no-vintage" | "incomplete";
};

export type SearchGroups = {
  cellar: {
    lotId: string; catalogWineId: string; title: string; imageUrl: string | null;
    rack: string | null; quantity: number; drinkNow: boolean; inFlight: boolean;
  }[];
  catalog: {
    catalogWineId: string; title: string; subtitle: string | null; imageUrl: string | null;
    avgScore: number | null; noteCount: number; inFlight: boolean;
  }[];
  tasted: {
    catalogWineId: string; title: string; imageUrl: string | null;
    myScore: number | null; tastedOn: string;
  }[];
};

export type ByHandIdentity = {
  producerId: string | null; producerName: string;    // pending producer when id is null
  wineName: string | null;
  vintageKind: "YEAR" | "NV" | "TAWNY"; vintageYear: number | null; vintageTawnyYears: number | null;
  colour: "RED" | "WHITE" | "ROSE" | "ORANGE"; style: "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";
  countryId: string; regionId: string; appellationId: string;
  primaryGrapeId: string; secondaryGrapeId: string | null; typeDesignationId: string | null;
  imageUrl: string | null; description: string | null;
  alcoholPercent: number | null;
};

export type AddSource =
  | { kind: "catalog"; catalogWineId: string }
  | { kind: "lot"; lotId: string; consume: boolean }
  | { kind: "identity"; identity: ByHandIdentity };

export type AddResult =
  | { ok: true; added: AddedWine; warning?: string }
  | { error: string };

// ---------------------------------------------------------------------------
// View contracts. The sheet shell (add-wine-sheet.tsx) owns the state machine
// and passes these down; each view file implements exactly one of them. Views
// never write to the database themselves — every add goes through `onAdd`, so
// the shell can apply the destination rules (cellar footer first, 7i chooser,
// multi mode, close + refresh) in one place.
// ---------------------------------------------------------------------------

/** The tasting a destination-less scan (7i) can be dropped into: the tasting
    page's registration, or the Overview's live / next-up banner. */
export type FlightHint = {
  tastingId: string;
  tastingName: string;
  position: number;
  live: boolean;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
};

export type SheetContext = {
  destination: AddWineDestination | null;
  multi: boolean;
  added: AddedWine[];
  pending: PendingScan[];
  flightHint: FlightHint | null;
  userId: string;
  preferredCurrency: string;
  /** `md+` viewport (matchMedia "(min-width: 768px)"). */
  isDesktop: boolean;
  /** `navigator.mediaDevices.getUserMedia` exists. The camera hook may still
      report `unavailable` / `denied` once it actually asks. */
  hasCamera: boolean;
};

/** The 7d inline "Fix" for a pending scan: a typed year, or NV. */
export type PendingFix = { vintageKind: "YEAR" | "NV"; vintageYear: number | null };

export type CameraViewProps = {
  ctx: SheetContext;
  /** A shutter capture (JPEG Blob) or a Library file. The shell uploads it,
      reads the label and moves to the reading / confirm views. */
  onCaptured: (file: Blob | File) => void;
  onSearch: () => void;
  onCellar: () => void;
  onByHand: () => void;
  onToggleMulti: () => void;
  /** Multi mode's "Done · n wines added" — closes the sheet. */
  onDone: () => void;
  onFixPending: (id: string, fix: PendingFix) => void;
  onRemovePending: (id: string) => void;
  busy: boolean;
};

export type ScanConfirmProps = {
  ctx: SheetContext;
  imageUrl: string;
  result: import("@/app/scan/actions").ScanResult;
  prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial;
  onRescan: () => void;
  onSearch: () => void;
  /** Opens the by-hand form prefilled from the read (the view may edit the
      prefill first, e.g. swap the vintage). */
  onByHand: (prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial) => void;
  /** Performs the add for the current destination. `source` is the primary
      catalog match ({kind:"catalog"}) or, with no match, the identity built
      from the prefill (`identityFromPrefill` in ./format). `andScanNext`
      keeps the sheet open in multi mode and returns to the camera. */
  onAdd: (source: AddSource, opts: { andScanNext: boolean }) => Promise<void>;
  /** 7c → 7d: "Add and scan the next" on a read with no vintage and no
      catalog match — the shell stacks a Fix row for the prefill, switches
      to multi mode and returns to the camera, exactly as its read pipeline
      does for later bottles, so the first bottle never lands in the
      blocking by-hand form. */
  onPending: (prefill: import("@/app/catalog/new/new-wine-form").WineFormInitial) => void;
  /** 7i, null destination only. The shell ADOPTS the choice as the sheet's
      destination (flight → `ctx.flightHint`'s tasting; cellar → the cellar
      footer fields; rate / catalog-only → catalog) and resolves. The view
      then calls `onAdd(source, { andScanNext: false })` exactly as it would
      with a fixed destination; for "rate" the shell opens the WSET note once
      that catalog add succeeds. */
  onChoose: (
    choice: { kind: "flight" } | { kind: "cellar" } | { kind: "rate" } | { kind: "catalog-only" },
  ) => Promise<void>;
  busy: boolean;
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
      path in turn (one FastCork credit per file). */
  onFiles: (files: File[]) => void;
  onCellar: () => void;
  onByHand: () => void;
  onDone: () => void;
  /** The pending ("Fix") rows work as in the camera view (7d). */
  onFixPending: (id: string, fix: PendingFix) => void;
  onRemovePending: (id: string) => void;
  busy: boolean;
};

/** 7d: the added rows / pending "Fix" rows stacked above the viewfinder. */
export type MultiAddStackProps = {
  added: AddedWine[];
  pending: PendingScan[];
  /** Glass number the next bottle would take (flight only). */
  nextGlass: number | null;
  onFixPending: (id: string, fix: PendingFix) => void;
  onRemovePending: (id: string) => void;
};
