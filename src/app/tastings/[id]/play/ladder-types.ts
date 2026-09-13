// Contracts shared by the guess ladder (6e), the field picker (6f), the play
// actions and the composition that renders them per glass. Pure types — safe
// to import from server components, client components and "use server" files.
import type { ReferenceOption } from "@/components/reference-combobox";
import type { TypeDesignationOption } from "@/components/type-designation-field";
import type {
  AsyncRevealPolicy,
  TimingMode,
  VintageKind,
} from "@/lib/supabase/database.types";

/**
 * One participant's guess for one glass — the columns the ladder edits, plus
 * the two markers it reads. This is the row shape `guesses.select("*")`
 * returns for the ladder's purposes; `locked_at`/`scored_at` are optional so a
 * freshly composed draft (no row yet) fits the same type.
 */
export type GuessRow = {
  country_id: string | null;
  region_id: string | null;
  appellation_id: string | null;
  primary_grape_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: VintageKind | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  locked_at?: string | null;
  scored_at?: string | null;
};

/** The eight scorable fields, named as the ladder rows know them. */
export type LadderField =
  | "country"
  | "region"
  | "appellation"
  | "primary_grape"
  | "producer"
  | "vintage"
  | "secondary_grape"
  | "type_designation";

/** One segment of the flight progress bar, in serving order. */
export type FlightSegment = "revealed" | "current" | "todo";

/** What the picker says under a shortlisted grape's name ("Barolo,
 *  Barbaresco" · "white"): the places under the region that link the grape,
 *  and the grape's colour (only WHITE is called out, as drawn). */
export type GrapeShortlistDetail = {
  places: string[];
  color: "RED" | "WHITE" | null;
};

/** Result of `shortlistGrapesForRegion` — grape ids in shortlist order. */
export type GrapeShortlist = {
  grapeIds: string[];
  /** The wine_places name the shortlist was derived from ("Piedmont"), or
   *  null when the region maps to no place. */
  placeName: string | null;
  /** Secondary-line facts per shortlisted grape id (every id in `grapeIds`
   *  has an entry). */
  details: Record<string, GrapeShortlistDetail>;
};

/** Standings chip in the ladder header ("2nd · 14 pts"). */
export type RankChip = { rank: number; points: number };

/** What the composition hands the ladder for one glass. */
export type GuessLadderProps = {
  tastingId: string;
  wineId: string;
  /** Optional context for the header eyebrow ("{tasting} · blind"). */
  tastingName?: string;
  /** 1-based glass number in serving order. */
  glassNumber: number;
  /** Running count — wines.length can grow during a live tasting. */
  glassCount: number;
  /** Omitted (null) before any reveal — there is no standing yet. */
  rankChip: RankChip | null;
  /** Flight progress, one entry per wine in serving order. */
  segments: FlightSegment[];
  /** "{lockedCount} of {eligibleCount} locked" for THIS glass. */
  lockedCount: number;
  eligibleCount: number;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  /** Active designations pre-sorted by sort_order (category groups keep order). */
  typeDesignations: TypeDesignationOption[];
  /** My saved row for this glass, or null when I have not touched it yet. */
  initialGuess: GuessRow | null;
  /** Display names for the two ids the reference lists do not carry
   *  (looked up via lookupAppellationAndProducerNames by the composition). */
  initialLabels: { producer?: string; appellation?: string };
  /** Grape ids I have guessed at least twice before — drives the picker's
   *  "you guess this often" secondary line. */
  frequentGrapeIds: string[];
  /** Server-computed shortlist for initialGuess.region_id; the ladder
   *  re-fetches when the region changes. */
  shortlist?: GrapeShortlist | null;
  /** The tasting's timing and results policy. In ASYNC + IMMEDIATE, locking
   *  scores the glass and shows the answer for good, so the lock button, its
   *  footer and a confirm say so (lock-copy.ts, play-4). Omitted → today's
   *  lock copy. */
  timingMode?: TimingMode;
  asyncRevealPolicy?: AsyncRevealPolicy;
  /** Fired after lockGuess succeeds (the composition swaps to Locked in). */
  onLocked: () => void;
};

/** One row in a picker list. `sub` is the secondary line; `group` is only
 *  used by function-mode search results to bucket them under headings. */
export type PickerOption = {
  id: string;
  name: string;
  sub?: string;
  group?: string;
};

/** A picker section: provenance eyebrow ("In Italy"), an optional note
 *  ("from your region guess") and its rows. */
export type PickerGroup = {
  heading?: string;
  note?: string;
  options: PickerOption[];
};

/** `"client"` = cmdk filters the given groups locally (accent-insensitive);
 *  a function = server search, debounced, results replace the groups. */
export type PickerSearch = "client" | ((query: string) => Promise<PickerOption[]>);

export type FieldPickerProps = {
  open: boolean;
  field: LadderField;
  /** Point value shown in the gold pill. */
  points: number;
  /** "Which grape?" */
  title: string;
  groups: PickerGroup[];
  /** Currently chosen option id ("" when none). */
  value: string;
  /** A row tap; null = the footer's skip button (clears the field). */
  onPick: (id: string | null) => void;
  /** "Next: {field} →" / "Back to the glass". */
  onNext: () => void;
  nextLabel: string;
  search: PickerSearch;
  onClose: () => void;
  /** The search input — the ladder focuses it synchronously inside the tap
   *  that opens the picker (the sheet stays mounted so it always exists). */
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Placeholder for the search field ("Search grapes"). */
  searchPlaceholder?: string;
  /** Extra key folded into the picker's reset-on-change (query + results
   *  clear whenever `open`, `field` or this changes); pass the glass index
   *  when the same `field` is reused across glasses. */
  resetKey?: string | number;
  /** The footer's skip button label (default "Not sure — skip it"); null
   *  hides the button and "Next" takes the full width. The match ladder
   *  passes null: every glass must be matched before it can lock, so a skip
   *  would only lead to a dead end (play-7). */
  skipLabel?: string | null;
  /** "sheet" (default, unchanged) is the phone bottom sheet. "popover" (S8b)
   *  anchors to `anchorRef` instead: base-ui `Popover`, `positionMethod`
   *  `"fixed"`, `keepMounted`, no dimming backdrop — outside click or
   *  Escape closes it (the caller's `onClose` is what returns focus to the
   *  row; the picker itself does not). Both presentations stay mounted, so
   *  the ladder's synchronous `inputRef.current.focus()` inside the opening
   *  tap always has an input to focus. */
  presentation?: "sheet" | "popover";
  /** The row to anchor the popover to (base-ui's `Positioner` `anchor`).
   *  Required, and only read, when `presentation` is `"popover"`. */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** The field's full reference-table size, unfiltered (S9; spec §8.3 item
   *  8) — grapes/countries/regions from `getReferenceOptions()` lengths,
   *  appellations/producers from a `head: true` count, type designations
   *  from the preloaded active list, vintages from
   *  `vintageOptions(now).years.length`. Drives
   *  `searchPlaceholder(field, totalCount, { phone })` (phone = the sheet
   *  presentation) in place of the plain `searchPlaceholder` prop, and
   *  overrides a group literally headed "Everything else" to
   *  `everythingElseHeading(totalCount)`, laid out two columns wide on the
   *  popover. Omitted keeps both as the caller wrote them. */
  totalCount?: number;
  /** Ids the viewer has picked at least `OFTEN_THRESHOLD` times before, for
   *  this field (`pick-counts.ts`'s `buildPickCounts` + `oftenPicked`). A
   *  row whose id is a member gets ladder-copy's `OFTEN_SUFFIX` appended to
   *  its context line (or, for a row with no context line of its own, shown
   *  bare). */
  oftenIds?: ReadonlySet<string>;
};

/** Vintage option ids the picker emits; the ladder maps them onto
 *  vintage_kind / vintage_year / vintage_tawny_years. */
export const VINTAGE_NV_ID = "nv";
export const vintageYearId = (year: number) => `year:${year}`;
export const vintageTawnyId = (years: number) => `tawny:${years}`;

/** The tawny group's "enter it yourself" row for an age outside the four
 *  presets (10/20/30/40). Never written as-is — picking it opens a number
 *  input (1–100), and the save uses vintageTawnyId(years) like any other
 *  tawny age. */
export const VINTAGE_TAWNY_OTHER_ID = "tawny:other";
