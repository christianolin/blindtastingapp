// The add-wine sheet's one lookup (spec §C.2, ledger D4). The destination
// (null is "none") and `canScan` decide every destination-dependent string
// and rule the sheet renders: the header, the camera chips, the search groups
// and row actions, the laptop upload zone and tiles, the footers, the confirm
// and by-hand copy, partial reads and follow-ups. Views read the matrix and
// never test the destination themselves (spec §G.1 gate 4).
//
// Pure: no React, no Supabase, and only relative runtime imports (vitest has
// no `@/` alias). Unit-tested in matrix.test.ts.
import type { RevealMode } from "@/lib/supabase/database.types";
import type { CellarSummary } from "./desktop-format";
import { glassLabel } from "./format";
import { bottlesLabel } from "./row-format";
import { flightNote } from "./scan-copy";
import type { AddWineDestination } from "./types";

export type DestinationKind = "flight" | "cellar" | "note" | "catalog" | "none";

export type SheetMatrix = {
  kind: DestinationKind;
  home: "camera" | "desktop";
  eyebrow: string | null;
  title: (phase: "home" | "read") => string;
  multiTitle: string | null;
  searchPlaceholder: string;
  enterHint: string;
  chips: readonly ("cellar" | "byhand")[];
  showMany: boolean;
  searchGroups: readonly ("cellar" | "catalog" | "tasted")[];
  cellarGroupSubtitle: ((bottles: number) => string) | null;
  row: (r: { source: "lot" | "catalog" | "tasted"; inFlight: boolean; owned: boolean }) => {
    label: string;
    action: "add" | "plusOne" | "open" | "pick" | "choose";
    disabled: boolean;
    affordance: "plus" | "chevron"; // phone; the laptop always draws RowActionButton with `label`
  };
  consumeLabel: string | null;
  inFlightMeta: string; // "in flight": the phone row meta; the laptop button reads "In flight"
  cellarSource: boolean;
  upload: { multiple: boolean; title: string; body: string; drop: string; choose: string };
  cellarTileSubtitle: ((summary: CellarSummary | null) => string) | null;
  byHandTileSubtitle: string;
  lotPreviewTile: boolean;
  leadLine: string | null;
  neitherOfThese: boolean;
  resultCount: (n: number) => string;
  footer: { primary: string; secondary: string | null; button: "Done" | "Close"; sentence: (added: number) => string };
  confirm: { eyebrowMatch: string; eyebrowNoMatch: string; primaryMatch: string; primaryNoMatch: string; note: string | null };
  byHand: { eyebrow: string; footerNote: string; primary: (finishing: boolean) => string; unidentifiedToggle: boolean };
  partialRead: {
    single: "incomplete-glass" | "by-hand";
    stacked: "incomplete-glass" | "pending-row" | "by-hand";
    skipConfirm: boolean;
  };
  followUps: readonly ("cellar" | "note")[];
};

type FlightDestination = Extract<AddWineDestination, { kind: "flight" }>;
type FlightPhase = "live" | "self-paced" | "next";

const ALL_GROUPS = ["cellar", "catalog", "tasted"] as const;
const CATALOG_GROUPS = ["catalog", "tasted"] as const;
const CELLAR_AND_BY_HAND = ["cellar", "byhand"] as const;
const BY_HAND_ONLY = ["byhand"] as const;
const TERMINAL = [] as const;

const REVEAL_MODE_WORD: Record<RevealMode, string> = {
  BLIND: "blind",
  SEMI_BLIND: "semi-blind",
  OPEN: "open",
};

const PHASE_WORDS: Record<FlightPhase, string> = {
  live: "live now",
  "self-paced": "in progress",
  next: "next up",
};

const ADDS_FIRST_HIT = "↵ adds the first hit";
const MATCHED = "Matched in the catalog";
const NOT_IN_CATALOG = "Not in the catalog yet";
const POUR_CONSUME = "Take it out of the cellar when we pour it";
const CATALOG_TOO = "Saved to the catalog too, so nobody types it again.";
const CHOOSE = "Choose where it goes";
const NOTE_LEAD_LINE =
  "Scanning lives on your phone and tablet, where the camera faces the bottle. It is not offered here.";
const UPLOAD_TITLE = "Upload label photos";
const DROP_PHOTOS = "Drop photos here";
const CHOOSE_FILES = "or choose files";
const CHOOSE_FILES_WITH_LIMITS = "or choose files · JPG, PNG, up to 5MB each";

// Round 1's sentences (desktop-format.ts `footerSentence` / `uploadZoneCopy`),
// kept unchanged where spec §C.2 says "today's …, unchanged".
const KEEP_GOING = "Adding does not close this — keep going.";
const FLIGHT_KEEP_GOING = "Adding does not close this — keep going until the flight is full.";
const UPLOAD_HEAD =
  "Drop in the photos you took of the bottles — several at once. Each one is read and matched exactly as it is on the phone, and ";

/** "Barolo night, live now" · "…, in progress" (self-paced) · "…, next up" — entry-4. */
export function flightHintSubtitle(hint: { tastingName: string; phase: FlightPhase }): string {
  return `${hint.tastingName}, ${PHASE_WORDS[hint.phase]}`;
}

export function sheetMatrix(destination: AddWineDestination | null, canScan: boolean): SheetMatrix {
  if (destination === null) return noneMatrix(canScan);
  switch (destination.kind) {
    case "flight":
      return flightMatrix(destination, canScan);
    case "cellar":
      return cellarMatrix(canScan);
    case "note":
      return noteMatrix(canScan);
    case "catalog":
      return catalogMatrix(canScan);
    default: {
      const unknown: never = destination;
      throw new Error(`Unknown add-wine destination: ${JSON.stringify(unknown)}`);
    }
  }
}

/** The cells that are the same for every destination. */
function shared(
  canScan: boolean,
): Pick<SheetMatrix, "home" | "searchPlaceholder" | "inFlightMeta" | "byHandTileSubtitle"> {
  return {
    home: canScan ? "camera" : "desktop",
    searchPlaceholder: canScan ? "Or search wine catalog" : "Search by producer, wine or appellation",
    inFlightMeta: "in flight",
    byHandTileSubtitle: "Producer, name, vintage, colour",
  };
}

function found(n: number): string {
  return `${n} found`;
}

function nearMatches(n: number): string {
  return `${n} ${n === 1 ? "near match" : "near matches"}`;
}

/** The laptop's "From my cellar" tile: round 1's loading and empty states,
    then "{n} bottles · {the destination's tail}". */
function cellarTile(tail: (summary: CellarSummary) => string): (summary: CellarSummary | null) => string {
  return (summary) => {
    if (!summary) return "Counting bottles…";
    if (summary.bottles === 0) return "No bottles in stock";
    return `${bottlesLabel(summary.bottles)} · ${tail(summary)}`;
  };
}

const readyToDrinkTile = cellarTile((s) => `${s.readyToDrink} ready to drink`);

/** A flight's footer describes the flight itself: the glasses already set are
    the next position minus one (the sheet re-reads position after each add). */
function flightSentence(position: number): string {
  const set = Math.max(0, position - 1);
  if (set === 0) return `No glasses are set yet. ${FLIGHT_KEEP_GOING}`;
  if (set === 1) return `Glass 1 is set. ${FLIGHT_KEEP_GOING}`;
  return `Glasses 1–${set} are set. ${FLIGHT_KEEP_GOING}`;
}

function flightMatrix(d: FlightDestination, canScan: boolean): SheetMatrix {
  const glass = glassLabel(d.position);
  const addAs = `Add as ${glass}`;
  const title = `Add wine · ${glass}`;
  return {
    kind: "flight",
    ...shared(canScan),
    eyebrow: canScan ? d.tastingName : `${d.tastingName} · ${REVEAL_MODE_WORD[d.revealMode]}`,
    title: () => title,
    multiTitle: "Adding to the flight",
    enterHint: ADDS_FIRST_HIT,
    chips: CELLAR_AND_BY_HAND,
    showMany: true,
    searchGroups: ALL_GROUPS,
    cellarGroupSubtitle: (bottles) => `${bottlesLabel(bottles)} you can pour tonight`,
    // C.9: `inFlight` is only ever true for a wine the caller already knows.
    row: ({ inFlight }) =>
      inFlight
        ? { label: "In flight", action: "add", disabled: true, affordance: "plus" }
        : { label: addAs, action: "add", disabled: false, affordance: "plus" },
    consumeLabel: POUR_CONSUME,
    cellarSource: true,
    upload: {
      multiple: true,
      title: UPLOAD_TITLE,
      body: `${UPLOAD_HEAD}lands in this flight.`,
      drop: DROP_PHOTOS,
      choose: CHOOSE_FILES_WITH_LIMITS,
    },
    cellarTileSubtitle: readyToDrinkTile,
    lotPreviewTile: false,
    leadLine: null,
    neitherOfThese: false,
    resultCount: found,
    footer: {
      primary: addAs,
      secondary: canScan ? "Add and scan the next" : null,
      button: "Done",
      sentence: () => flightSentence(d.position),
    },
    confirm: {
      eyebrowMatch: MATCHED,
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: addAs,
      primaryNoMatch: addAs,
      note: flightNote(d),
    },
    byHand: {
      eyebrow: `${title} · by hand`,
      footerNote: "Only you see this until the reveal. It joins the catalog once this glass is revealed.",
      primary: (finishing) => (finishing ? `Save · ${glass}` : addAs),
      unidentifiedToggle: true,
    },
    // C.8: an OPEN tasting inserts every glass revealed, so an incomplete
    // glass could never be finished there — its partial reads go to By hand
    // (or stack as pending rows) like the cellar's.
    partialRead:
      d.revealMode === "OPEN"
        ? { single: "by-hand", stacked: "pending-row", skipConfirm: false }
        : { single: "incomplete-glass", stacked: "incomplete-glass", skipConfirm: false },
    followUps: TERMINAL,
  };
}

function cellarMatrix(canScan: boolean): SheetMatrix {
  return {
    kind: "cellar",
    ...shared(canScan),
    eyebrow: "Cellar",
    title: () => "Add a bottle",
    multiTitle: "Adding to the cellar",
    enterHint: ADDS_FIRST_HIT,
    chips: BY_HAND_ONLY,
    showMany: true,
    searchGroups: ALL_GROUPS,
    cellarGroupSubtitle: null,
    // D9 / B3: the label changes only when the action does — a lot you own
    // reads "+1 bottle" (plusOne needs that lot id). Catalog and tasted rows
    // carry no lot, so they always read "Add to cellar" and go through the lot
    // step (and its merge card); a wine you own is listed as its lot rows (C.2).
    row: ({ source }) =>
      source === "lot"
        ? { label: "+1 bottle", action: "plusOne", disabled: false, affordance: "plus" }
        : { label: "Add to cellar", action: "add", disabled: false, affordance: "plus" },
    consumeLabel: null,
    cellarSource: false,
    upload: {
      multiple: true,
      title: UPLOAD_TITLE,
      body: "Several at once — a delivery of six is one drop. Each lands in your cellar.",
      drop: DROP_PHOTOS,
      choose: CHOOSE_FILES,
    },
    cellarTileSubtitle: null,
    lotPreviewTile: true,
    leadLine: null,
    neitherOfThese: false,
    resultCount: found,
    footer: {
      primary: "Add to cellar",
      secondary: null,
      button: "Done",
      sentence: (added) =>
        added === 0
          ? `Nothing added to your cellar yet. ${KEEP_GOING}`
          : `Added ${added} to your cellar so far. ${KEEP_GOING}`,
    },
    confirm: {
      eyebrowMatch: MATCHED,
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: "Add to cellar",
      primaryNoMatch: "Add to cellar",
      note: null,
    },
    byHand: {
      eyebrow: "Cellar · by hand",
      footerNote: CATALOG_TOO,
      primary: () => "Add to cellar",
      unidentifiedToggle: false,
    },
    partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
    followUps: TERMINAL,
  };
}

function noteMatrix(canScan: boolean): SheetMatrix {
  return {
    kind: "note",
    ...shared(canScan),
    eyebrow: "Taste & rate",
    title: () => (canScan ? "Which wine?" : "Which wine are you tasting?"),
    multiTitle: null,
    enterHint: "↵ opens a note on the first hit",
    chips: CELLAR_AND_BY_HAND,
    // A note is a single pick.
    showMany: false,
    searchGroups: ALL_GROUPS,
    cellarGroupSubtitle: null,
    row: () => ({ label: "Start the note", action: "pick", disabled: false, affordance: "chevron" }),
    consumeLabel: "Take a bottle out of the cellar when I save the note",
    cellarSource: true,
    upload: {
      multiple: false,
      title: "Upload a label photo",
      body: "Read and matched exactly as it is on the phone, then the note opens.",
      drop: "Drop a photo here",
      choose: "or choose a file",
    },
    cellarTileSubtitle: cellarTile(() => "rating one you own is the common case"),
    lotPreviewTile: false,
    leadLine: NOTE_LEAD_LINE,
    neitherOfThese: false,
    resultCount: found,
    footer: { primary: "Start the note", secondary: null, button: "Close", sentence: () => NOTE_LEAD_LINE },
    confirm: {
      eyebrowMatch: MATCHED,
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: "Start the note",
      primaryNoMatch: "Start the note",
      note: null,
    },
    byHand: {
      eyebrow: "Taste & rate · by hand",
      footerNote: CATALOG_TOO,
      primary: () => "Start the note",
      unidentifiedToggle: false,
    },
    // D7: a partial read opens A7 directly, skipping the confirm screen.
    partialRead: { single: "by-hand", stacked: "by-hand", skipConfirm: true },
    followUps: TERMINAL,
  };
}

function catalogMatrix(canScan: boolean): SheetMatrix {
  return {
    kind: "catalog",
    ...shared(canScan),
    eyebrow: "Catalog",
    title: () => "Add a wine",
    multiTitle: "Adding to the catalog",
    enterHint: "↵ opens the first hit",
    chips: BY_HAND_ONLY,
    showMany: true,
    searchGroups: CATALOG_GROUPS,
    cellarGroupSubtitle: null,
    // D9 / D1: catalog hits are offered as "Open" (a link to the wine), never Add.
    row: () => ({ label: "Open", action: "open", disabled: false, affordance: "chevron" }),
    consumeLabel: null,
    cellarSource: false,
    upload: {
      multiple: true,
      title: UPLOAD_TITLE,
      body: "Read a label and it fills the form below — still checked against the catalog before it is written.",
      drop: DROP_PHOTOS,
      choose: CHOOSE_FILES,
    },
    cellarTileSubtitle: null,
    lotPreviewTile: false,
    leadLine: "First, check it is not already here",
    neitherOfThese: true,
    resultCount: nearMatches,
    footer: {
      primary: "Add to the catalog",
      secondary: null,
      button: "Done",
      sentence: () => "Adding here only records the wine. The sheet then asks what you want to do with it.",
    },
    confirm: {
      eyebrowMatch: "Already in the catalog · nothing new will be written",
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: "Yes, that is the wine",
      primaryNoMatch: "Add it",
      note: "Confirming only tells us we have the right wine. What happens to it comes next.",
    },
    byHand: {
      eyebrow: "Catalog · by hand",
      footerNote: CATALOG_TOO,
      primary: () => "Add to the catalog",
      unidentifiedToggle: false,
    },
    partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
    // D3: "Add it to my cellar" · "Taste & rate it now".
    followUps: ["cellar", "note"],
  };
}

function noneMatrix(canScan: boolean): SheetMatrix {
  return {
    kind: "none",
    ...shared(canScan),
    eyebrow: null,
    title: (phase) => (canScan ? (phase === "home" ? "Scan" : "Scanned") : "Add wine"),
    multiTitle: "Adding wines",
    enterHint: ADDS_FIRST_HIT,
    chips: CELLAR_AND_BY_HAND,
    showMany: true,
    searchGroups: ALL_GROUPS,
    cellarGroupSubtitle: null,
    // D12: with no destination every add goes through the E1 chooser, never
    // silently into a hinted flight.
    row: () => ({ label: "Add", action: "choose", disabled: false, affordance: "plus" }),
    consumeLabel: POUR_CONSUME,
    cellarSource: true,
    upload: {
      multiple: true,
      title: UPLOAD_TITLE,
      body: `${UPLOAD_HEAD}you choose where each one goes.`,
      drop: DROP_PHOTOS,
      choose: CHOOSE_FILES_WITH_LIMITS,
    },
    cellarTileSubtitle: readyToDrinkTile,
    lotPreviewTile: false,
    leadLine: null,
    neitherOfThese: false,
    resultCount: found,
    footer: {
      primary: CHOOSE,
      secondary: null,
      button: "Done",
      sentence: (added) =>
        added === 0 ? `Nothing added yet. ${KEEP_GOING}` : `Added ${added} so far. ${KEEP_GOING}`,
    },
    // The primary is the chooser's rows; the label names what the tap opens.
    confirm: {
      eyebrowMatch: "Found in the catalog",
      eyebrowNoMatch: NOT_IN_CATALOG,
      primaryMatch: CHOOSE,
      primaryNoMatch: CHOOSE,
      note: null,
    },
    byHand: {
      eyebrow: "Add wine · by hand",
      footerNote: CATALOG_TOO,
      primary: () => CHOOSE,
      unidentifiedToggle: false,
    },
    partialRead: { single: "by-hand", stacked: "pending-row", skipConfirm: false },
    // The chosen destination's matrix decides what follows; "save to the
    // catalog only" is terminal.
    followUps: TERMINAL,
  };
}
