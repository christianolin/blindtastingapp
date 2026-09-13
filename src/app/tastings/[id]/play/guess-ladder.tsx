"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import type { ReferenceOption } from "@/components/reference-combobox";
import type { TypeDesignationOption } from "@/components/type-designation-field";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import { shortlistGrapesForRegion } from "@/lib/grape-shortlist";
import {
  LADDER_ORDER,
  MAX_POINTS,
  OPTIONAL_FIELDS,
  fieldPoints,
  grapeSecondaryLine,
  isFieldAnswered,
  nextUnanswered,
  pointsAtStake,
} from "@/lib/guess-ladder-math";
import { ordinal } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import { lockGuess, saveGuessFields } from "./actions";
import { FieldPicker } from "./field-picker";
import {
  GROUP_COLUMNS,
  groupForField,
  vintageOptions,
  type GuessFieldGroup,
} from "./guess-write";
import {
  allSettled,
  initialSaveQueue,
  saveQueueReducer,
  saveResultEvent,
  visibleRow,
  type SaveQueueEvent,
  type SaveQueueState,
} from "./guess-save-queue";
import { LADDER_EXTRAS_NOTE, lockButtonLabel, lockConfirm, lockFooter } from "./lock-copy";
import {
  VINTAGE_NV_ID,
  VINTAGE_TAWNY_OTHER_ID,
  vintageTawnyId,
  vintageYearId,
  type GrapeShortlist,
  type GuessLadderProps,
  type GuessRow,
  type LadderField,
  type PickerGroup,
  type PickerOption,
} from "./ladder-types";

const FIELD_LABEL: Record<LadderField, string> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Grape",
  producer: "Producer",
  vintage: "Vintage",
  secondary_grape: "Secondary grape",
  type_designation: "Type designation",
};

// The row label as drawn — two rows carry their rule inline.
const ROW_LABEL: Record<LadderField, string> = {
  ...FIELD_LABEL,
  primary_grape: "Grape · worth the most",
  vintage: "Vintage · 1 pt if you are a year out",
  secondary_grape: "Secondary grape · +2 if the wine has one",
  type_designation: "Type designation · +2 if the wine has one",
};

const EMPTY_TEXT: Record<LadderField, string> = {
  country: "Skip, or name one",
  region: "Skip, or name one",
  appellation: "Skip, or name one",
  primary_grape: "Skip, or name one",
  producer: "Skip, or name one",
  vintage: "Skip, or pick a year",
  secondary_grape: "Skip, or name one",
  type_designation: "Skip, or name one",
};

const JUST_SAVED_MS = 3000;

const EMPTY_ROW: GuessRow = {
  country_id: null,
  region_id: null,
  appellation_id: null,
  primary_grape_id: null,
  secondary_grape_id: null,
  producer_id: null,
  type_designation_id: null,
  vintage_kind: null,
  vintage_year: null,
  vintage_tawny_years: null,
};

function toRow(guess: GuessRow | null): GuessRow {
  if (!guess) return EMPTY_ROW;
  return {
    country_id: guess.country_id,
    region_id: guess.region_id,
    appellation_id: guess.appellation_id,
    primary_grape_id: guess.primary_grape_id,
    secondary_grape_id: guess.secondary_grape_id,
    producer_id: guess.producer_id,
    type_designation_id: guess.type_designation_id,
    vintage_kind: guess.vintage_kind,
    vintage_year: guess.vintage_year,
    vintage_tawny_years: guess.vintage_tawny_years,
  };
}

/** Exactly the columns `group` writes, taken from `row` — what a pick sends
 *  to `saveGuessFields` (BT-P5's GROUP_COLUMNS). */
function groupValues(group: GuessFieldGroup, row: GuessRow): Partial<GuessRow> {
  const values: Record<string, unknown> = {};
  for (const key of GROUP_COLUMNS[group]) values[key] = row[key];
  return values as Partial<GuessRow>;
}

function vintageLabel(g: GuessRow): string | null {
  if (g.vintage_kind === "YEAR") return g.vintage_year != null ? String(g.vintage_year) : null;
  if (g.vintage_kind === "NV") return "NV";
  if (g.vintage_kind === "TAWNY")
    return g.vintage_tawny_years != null ? `${g.vintage_tawny_years} years tawny` : null;
  return null;
}

function vintagePickerId(g: GuessRow, tawnyPresets: readonly number[]): string {
  if (g.vintage_kind === "YEAR" && g.vintage_year != null) return vintageYearId(g.vintage_year);
  if (g.vintage_kind === "NV") return VINTAGE_NV_ID;
  if (g.vintage_kind === "TAWNY" && g.vintage_tawny_years != null) {
    return tawnyPresets.includes(g.vintage_tawny_years)
      ? vintageTawnyId(g.vintage_tawny_years)
      : VINTAGE_TAWNY_OTHER_ID;
  }
  return "";
}

function groupDesignations(items: TypeDesignationOption[]): PickerGroup[] {
  const groups: PickerGroup[] = [];
  const index = new Map<string, number>();
  for (const item of items) {
    const cat = item.category ?? "Other";
    let i = index.get(cat);
    if (i === undefined) {
      i = groups.length;
      index.set(cat, i);
      groups.push({ heading: cat, options: [] });
    }
    groups[i].options.push({ id: item.id, name: item.name });
  }
  return groups;
}

/**
 * The 6e guess ladder for one glass: six rows (plus two optional under
 * "More"), each opening the 6f picker and autosaving on pick — one
 * `saveGuessFields` call per pick, writing only that field's group of
 * `guesses` columns (spec §8.3 item 5), so a failed save reverts just that
 * group instead of the whole row (critic on `XCUT-53`). Every value is React
 * state (the play page polls `router.refresh()`; an uncontrolled input would
 * be wiped). Locking is the explicit act: "Lock in glass N" waits for every
 * group's pending save, then `lockGuess` → `onLocked`.
 *
 * Cascade (same rules as the old guess-form): a country change drops a
 * mismatched region/appellation, a region change drops the appellation and
 * refetches the grape shortlist; the pickers get the same scoped data.
 *
 * Save queue. `stateRef` holds the pure `SaveQueueState` (guess-save-queue.ts)
 * — a `useState` counter only forces the re-render, so `dispatch` and
 * `currentGuess()` always see the latest value even mid-handler, the same
 * role `latestRef` played before. `pumpsRef` holds one promise chain per
 * group: a pick appends to that group's chain, and the chain keeps sending
 * the newest pending value for the group until nothing is left pending — the
 * same coalescing behaviour the old single whole-row pump had, just scoped
 * per group so an in-flight producer save never blocks a grape pick.
 */
export function GuessLadder({
  tastingId,
  wineId,
  tastingName,
  glassNumber,
  glassCount,
  rankChip,
  segments,
  lockedCount,
  eligibleCount,
  countries,
  regions,
  grapes,
  typeDesignations,
  initialGuess,
  initialLabels,
  frequentGrapeIds,
  shortlist: initialShortlist,
  timingMode,
  asyncRevealPolicy,
  onLocked,
}: GuessLadderProps) {
  const stateRef = useRef<SaveQueueState>(initialSaveQueue(toRow(initialGuess)));
  const [, forceRender] = useState(0);

  const dispatch = useCallback((event: SaveQueueEvent) => {
    stateRef.current = saveQueueReducer(stateRef.current, event);
    forceRender((n) => n + 1);
  }, []);

  const currentGuess = useCallback((): GuessRow => visibleRow(stateRef.current), []);

  // Producer and appellation names never come back with the row (only their
  // ids do — see GuessRow), so the row's label is looked up by id from
  // whatever names have been seen so far (the initial answer's own label,
  // plus every id the pickers have since searched or listed), never tracked
  // as "the last picked name" on its own: a failed save reverts the group's
  // id in `guess` (guess-save-queue.ts), and a scalar "last label" would
  // keep showing the failed pick's name for the reverted id (review round 2
  // — the producer row still read "Conterno" after a failed save put
  // `producer_id` back to Vietti's id). Seeded once from the server-supplied
  // initial label so the row has a name before any search has run.
  const producerNamesRef = useRef(
    new Map<string, string>(
      initialGuess?.producer_id && initialLabels.producer
        ? [[initialGuess.producer_id, initialLabels.producer]]
        : [],
    ),
  );
  const appellationNamesRef = useRef(
    new Map<string, string>(
      initialGuess?.appellation_id && initialLabels.appellation
        ? [[initialGuess.appellation_id, initialLabels.appellation]]
        : [],
    ),
  );
  const [appellations, setAppellations] = useState<ReferenceOption[]>([]);
  const [appellationsPending, startAppellations] = useTransition();
  const [shortlist, setShortlist] = useState<GrapeShortlist | null>(
    initialShortlist ?? null,
  );
  const [, startShortlist] = useTransition();
  const [justSaved, setJustSaved] = useState<LadderField | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(
    () =>
      initialGuess?.secondary_grape_id != null || initialGuess?.type_designation_id != null,
  );
  const [picker, setPicker] = useState<{ open: boolean; field: LadderField }>({
    open: false,
    field: "country",
  });
  const [tawnyOtherOpen, setTawnyOtherOpen] = useState(false);
  const [tawnyOtherValue, setTawnyOtherValue] = useState("");
  const [locking, setLocking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tawnyOtherInputRef = useRef<HTMLInputElement>(null);
  // The row buttons by field, so closing the picker can hand focus back to
  // the row it was opened for (keyboard users otherwise land on <body>).
  const rowRefs = useRef(new Map<LadderField, HTMLButtonElement>());
  const openFieldRef = useRef<LadderField>("country");

  const saveState = stateRef.current;
  const guess = visibleRow(saveState);

  // ---- per-group save pump -------------------------------------------------
  // One promise chain per group: a pick appends a send to its group's chain,
  // which keeps re-reading the group's pending slot and sending the newest
  // value until nothing is left pending (a pick that lands while a save is
  // still in flight is picked up by the next iteration, not lost).
  const pumpsRef = useRef<Partial<Record<GuessFieldGroup, Promise<void>>>>({});
  // Set once "Lock in glass N" has actually locked the row: a save that was
  // already in flight can still land after that, and if the pin refuses it
  // (42501 → LOCKED_EDIT_REFUSAL) the row must not flash a revert or an
  // error for a glass that is already locked (spec §8.3 item 5).
  const lockedRef = useRef(false);

  const pumpGroup = useCallback(
    (group: GuessFieldGroup) => {
      const prior = pumpsRef.current[group] ?? Promise.resolve();
      const run: Promise<void> = prior.then(async () => {
        for (;;) {
          const slot = stateRef.current.pending[group];
          if (!slot) return;
          let result: Awaited<ReturnType<typeof saveGuessFields>>;
          try {
            result = await saveGuessFields(tastingId, wineId, group, slot.values);
          } catch (e) {
            result = { error: e instanceof Error ? e.message : String(e) };
          }
          // saveResultEvent maps a 42501 that lands after the lock already
          // committed to a quiet "confirmed" (review round 1: dispatching
          // nothing here left this group's pending slot uncleared forever,
          // so the loop above resent the same save every iteration).
          dispatch(saveResultEvent(group, slot.seq, slot.values, result, lockedRef.current));
        }
      });
      pumpsRef.current[group] = run;
      run.finally(() => {
        if (pumpsRef.current[group] === run) delete pumpsRef.current[group];
      });
    },
    [dispatch, tastingId, wineId],
  );

  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    [],
  );

  // ---- reference lookups -------------------------------------------------
  const countryName = countries.find((c) => c.id === guess.country_id)?.name;
  const region = regions.find((r) => r.id === guess.region_id);
  const regionName = region?.name;
  const grapeName = (id: string | null) => grapes.find((g) => g.id === id)?.name ?? null;
  const { years: vintageYears, tawny: tawnyPresets } = vintageOptions(new Date());

  // Appellations for the chosen region, loaded in full (an appellation only
  // ever belongs to one region, so the list stays short).
  useEffect(() => {
    const regionId = guess.region_id;
    startAppellations(async () => {
      const next = regionId ? await listAppellationsForRegions([regionId]) : [];
      for (const a of next) appellationNamesRef.current.set(a.id, a.name);
      // Ignore a late answer for a region that is no longer the guess (A
      // then B in quick succession must not leave A's list under "In B").
      if (currentGuess().region_id === regionId) setAppellations(next);
    });
  }, [guess.region_id, currentGuess]);

  // The currently-loaded region's list first (covers the common case with no
  // stale-map risk), falling back to whatever name has been seen for this id
  // — e.g. an appellation whose region's list hasn't finished loading yet.
  const appellationName =
    appellations.find((a) => a.id === guess.appellation_id)?.name ??
    (guess.appellation_id ? appellationNamesRef.current.get(guess.appellation_id) : undefined);

  function refetchShortlist(regionId: string | null) {
    if (!regionId) {
      setShortlist(null);
      return;
    }
    startShortlist(async () => {
      const next = await shortlistGrapesForRegion(regionId);
      // Ignore a late answer for a region that is no longer the guess.
      if (currentGuess().region_id === regionId) setShortlist(next);
    });
  }

  // ---- picks --------------------------------------------------------------
  // No-op once "Lock in glass N" has been tapped (review round 1: a chip or
  // row tap that landed while lockGuess was still in flight could start a
  // brand-new save for a group with no pump currently running — a promise
  // onLock's earlier snapshot-based wait never captured — whose eventual
  // save then raced the lock and, on "Change it", overwrote the row with a
  // value picked after Lock was pressed and meant nothing by then).
  function pick(field: LadderField, id: string | null, label?: string) {
    if (locking) return;
    const g = currentGuess();
    let next: GuessRow = g;
    switch (field) {
      case "country": {
        next = { ...g, country_id: id };
        // Drop a now-mismatched region/appellation.
        if (g.region_id && !regions.some((r) => r.id === g.region_id && r.country_id === id)) {
          next = { ...next, region_id: null, appellation_id: null };
          refetchShortlist(null);
        }
        break;
      }
      case "region": {
        next = { ...g, region_id: id, appellation_id: null };
        // A region implies its country, so picking one — even from another
        // country's "Everything else" rows — sets the Country row to match;
        // the guess never saves as "Italy · Bordeaux" (play-3).
        const picked = regions.find((r) => r.id === id);
        if (picked) next = { ...next, country_id: picked.country_id };
        refetchShortlist(id);
        break;
      }
      case "appellation":
        next = { ...g, appellation_id: id };
        if (id && label) appellationNamesRef.current.set(id, label);
        break;
      case "primary_grape":
        next = { ...g, primary_grape_id: id };
        break;
      case "secondary_grape":
        next = { ...g, secondary_grape_id: id };
        break;
      case "producer":
        next = { ...g, producer_id: id };
        if (id && label) producerNamesRef.current.set(id, label);
        break;
      case "type_designation":
        next = { ...g, type_designation_id: id };
        break;
      case "vintage": {
        if (!id) {
          next = { ...g, vintage_kind: null, vintage_year: null, vintage_tawny_years: null };
        } else if (id === VINTAGE_NV_ID) {
          next = { ...g, vintage_kind: "NV", vintage_year: null, vintage_tawny_years: null };
        } else if (id.startsWith("year:")) {
          next = {
            ...g,
            vintage_kind: "YEAR",
            vintage_year: parseInt(id.slice(5), 10),
            vintage_tawny_years: null,
          };
        } else if (id.startsWith("tawny:")) {
          next = {
            ...g,
            vintage_kind: "TAWNY",
            vintage_year: null,
            vintage_tawny_years: parseInt(id.slice(6), 10),
          };
        }
        break;
      }
    }
    const group = groupForField(field);
    setJustSaved(field);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(null), JUST_SAVED_MS);
    dispatch({ type: "picked", group, values: groupValues(group, next) });
    pumpGroup(group);
  }

  // ---- picker wiring ------------------------------------------------------
  const order: LadderField[] = moreOpen ? [...LADDER_ORDER, ...OPTIONAL_FIELDS] : [...LADDER_ORDER];

  function openPicker(field: LadderField) {
    if (locking) return;
    if (field === "vintage") setTawnyOtherOpen(false);
    openFieldRef.current = field;
    setPicker({ open: true, field });
    // Focus synchronously, in the same tap that opens the sheet — see the
    // combobox rule; the picker stays mounted so the input already exists.
    inputRef.current?.focus();
  }

  const closePicker = useCallback(() => {
    setPicker((p) => ({ ...p, open: false }));
    // Back to the row the sheet was opened for — this also takes focus (and
    // the keyboard) off the search input; the picker blurs it as a fallback.
    rowRefs.current.get(openFieldRef.current)?.focus({ preventScroll: true });
  }, []);

  const rowRef = (field: LadderField) => (el: HTMLButtonElement | null) => {
    if (el) rowRefs.current.set(field, el);
    else rowRefs.current.delete(field);
  };

  function advanceFrom(field: LadderField) {
    const next = nextUnanswered(currentGuess(), order, field);
    if (next) openPicker(next);
    else closePicker();
  }

  function pickerValue(field: LadderField): string {
    switch (field) {
      case "country":
        return guess.country_id ?? "";
      case "region":
        return guess.region_id ?? "";
      case "appellation":
        return guess.appellation_id ?? "";
      case "primary_grape":
        return guess.primary_grape_id ?? "";
      case "secondary_grape":
        return guess.secondary_grape_id ?? "";
      case "producer":
        return guess.producer_id ?? "";
      case "type_designation":
        return guess.type_designation_id ?? "";
      case "vintage":
        return vintagePickerId(guess, tawnyPresets);
    }
  }

  // ---- vintage "Other age…" -----------------------------------------------
  // Tawny ages outside the four presets are entered by hand: picking "Other
  // age…" closes the picker sheet and opens a controlled number input
  // (1–100) in its place on the ladder itself, rather than inside the
  // generic picker list (field-picker.tsx has no row shape for a free-form
  // control). Confirming feeds vintageTawnyId(years) through the same pick()
  // path as any other tawny option.
  const tawnyOtherYears = Number(tawnyOtherValue);
  const validTawnyOther =
    tawnyOtherValue.trim() !== "" &&
    Number.isInteger(tawnyOtherYears) &&
    tawnyOtherYears >= 1 &&
    tawnyOtherYears <= 100;

  function openTawnyOtherInput() {
    const current = currentGuess();
    setTawnyOtherValue(
      current.vintage_kind === "TAWNY" &&
        current.vintage_tawny_years != null &&
        !tawnyPresets.includes(current.vintage_tawny_years)
        ? String(current.vintage_tawny_years)
        : "",
    );
    setTawnyOtherOpen(true);
    // Close the sheet directly, not via closePicker() — that hands focus to
    // the vintage row button, which would fight the synchronous .focus()
    // below (and, being the last one applied, usually win, landing focus —
    // and on a phone, no keyboard at all — on the row instead of the input).
    setPicker((p) => ({ ...p, open: false }));
    tawnyOtherInputRef.current?.focus();
  }

  function confirmTawnyOther() {
    if (!validTawnyOther) return;
    pick("vintage", vintageTawnyId(tawnyOtherYears));
    setTawnyOtherOpen(false);
    advanceFrom("vintage");
  }

  // "Barolo, Barbaresco · you guess this often" — the shortlist rows carry
  // the secondary line (from the shortlist's linked places + colour); the
  // "Everything else" rows are plain, as drawn.
  const frequent = (id: string) => frequentGrapeIds.includes(id);
  const grapeSub = (id: string) =>
    grapeSecondaryLine(shortlist?.details[id], frequent(id));

  function grapeGroups(): PickerGroup[] {
    const ids = shortlist?.grapeIds ?? [];
    if (ids.length === 0) {
      // No shortlist (region unmapped or not guessed yet): one flat list,
      // keeping the frequent-guess clause as its only hint.
      return [
        {
          options: grapes.map((g) => ({
            id: g.id,
            name: g.name,
            sub: grapeSecondaryLine(undefined, frequent(g.id)),
          })),
        },
      ];
    }
    const listed = new Set(ids);
    const short: PickerOption[] = ids
      .map((id) => grapes.find((g) => g.id === id))
      .filter((g): g is ReferenceOption => Boolean(g))
      .map((g) => ({ id: g.id, name: g.name, sub: grapeSub(g.id) }));
    const rest: PickerOption[] = grapes
      .filter((g) => !listed.has(g.id))
      .map((g) => ({ id: g.id, name: g.name }));
    return [
      {
        heading: `Grown in ${shortlist?.placeName ?? regionName ?? "the region"}`,
        note: "from your region guess",
        options: short,
      },
      { heading: "Everything else", options: rest },
    ];
  }

  function pickerGroups(field: LadderField): PickerGroup[] {
    switch (field) {
      case "country":
        return [{ options: countries }];
      case "region": {
        if (!guess.country_id) return [{ options: regions }];
        const inCountry = regions.filter((r) => r.country_id === guess.country_id);
        // Another country's regions name their country, so the taster sees
        // the Country row switch coming (a region pick sets it, play-3) and
        // same-named regions in different countries can be told apart.
        const countryNameById = new Map(countries.map((c) => [c.id, c.name]));
        const others: PickerOption[] = regions
          .filter((r) => r.country_id !== guess.country_id)
          .map((r) => ({ id: r.id, name: r.name, sub: countryNameById.get(r.country_id) }));
        return [
          { heading: `In ${countryName ?? "the country"}`, options: inCountry },
          { heading: "Everything else", options: others },
        ];
      }
      case "appellation":
        if (!guess.region_id) {
          return [
            { note: "Guess the region first — the appellation list comes from it.", options: [] },
          ];
        }
        return [
          {
            heading: `In ${regionName ?? "the region"}`,
            note: appellationsPending ? "loading…" : undefined,
            options: appellations,
          },
        ];
      case "primary_grape":
      case "secondary_grape":
        return grapeGroups();
      case "producer":
        // Static fallback only — the producer picker searches server-side.
        return [];
      case "type_designation":
        return groupDesignations(typeDesignations);
      case "vintage": {
        const years: PickerOption[] = vintageYears.map((y) => ({
          id: vintageYearId(y),
          name: String(y),
        }));
        return [
          { heading: "Year", options: years },
          {
            heading: "Non-vintage",
            options: [{ id: VINTAGE_NV_ID, name: "NV", sub: "Non-vintage" }],
          },
          {
            heading: "Tawny",
            options: [
              ...tawnyPresets.map((n) => ({ id: vintageTawnyId(n), name: `${n} years` })),
              { id: VINTAGE_TAWNY_OTHER_ID, name: "Other age…" },
            ],
          },
        ];
      }
    }
  }

  // Producer search: opening with a region guessed instantly lists that
  // region's producers ("Specific to {region}"); typed matches from elsewhere
  // still appear under "Everything else" so guessing the wrong region never
  // hides the right producer. The picker does not hand results back, so
  // id → name is recorded into producerNamesRef (declared above, alongside
  // appellationNamesRef) for the row's value line on pick.
  const producerSearch = useCallback(
    async (query: string): Promise<PickerOption[]> => {
      const regionId = currentGuess().region_id ?? undefined;
      const rName = regions.find((r) => r.id === regionId)?.name;
      const found = await searchProducers(query, regionId);
      for (const o of found) producerNamesRef.current.set(o.id, o.name);
      return found.map(({ id, name, in_region }) => ({
        id,
        name,
        group: regionId
          ? in_region
            ? `Specific to ${rName ?? "the region"}`
            : "Everything else"
          : undefined,
      }));
    },
    [regions, currentGuess],
  );

  function searchPlaceholder(field: LadderField): string {
    switch (field) {
      case "country":
        return `Search ${countries.length} countries`;
      case "region":
        return `Search ${regions.length} regions`;
      case "appellation":
        return appellations.length ? `Search ${appellations.length} appellations` : "Search appellations";
      case "primary_grape":
      case "secondary_grape":
        return `Search ${grapes.length} grapes`;
      case "producer":
        return guess.region_id ? "Search all producers" : "Search producers";
      case "type_designation":
        return "Search designations";
      case "vintage":
        return "Search years";
    }
  }

  // A row tap saves and moves on, like Next and skip do — the next unanswered
  // field's picker opens, or the sheet closes once the pass is complete, so
  // a full guess is one pass ("one tap answers and closes"). "Next: {field}"
  // stays for leaving a reopened, already-answered row unchanged. The two
  // ids the reference lists do not carry (producer, appellation) remember
  // their label on pick. Vintage's "Other age…" is intercepted before it
  // reaches pick() — it opens the number input instead of writing a value.
  function onPickerPick(id: string | null) {
    const field = picker.field;
    if (field === "vintage" && id === VINTAGE_TAWNY_OTHER_ID) {
      openTawnyOtherInput();
      return;
    }
    if (id === null) {
      pick(field, null);
      advanceFrom(field);
      return;
    }
    const label =
      field === "appellation"
        ? appellations.find((a) => a.id === id)?.name
        : field === "producer"
          ? producerNamesRef.current.get(id)
          : undefined;
    pick(field, id, label);
    advanceFrom(field);
  }

  const nextField = nextUnanswered(guess, order, picker.field);
  const nextLabel = nextField ? `Next: ${FIELD_LABEL[nextField].toLowerCase()} →` : "Back to the glass";

  // ---- display values -----------------------------------------------------
  function displayValue(field: LadderField): string | null {
    switch (field) {
      case "country":
        return countryName ?? null;
      case "region":
        return regionName ?? null;
      case "appellation":
        return guess.appellation_id ? (appellationName ?? "…") : null;
      case "primary_grape":
        return grapeName(guess.primary_grape_id);
      case "secondary_grape":
        return grapeName(guess.secondary_grape_id);
      case "producer":
        return guess.producer_id ? (producerNamesRef.current.get(guess.producer_id) ?? "…") : null;
      case "type_designation":
        return typeDesignations.find((t) => t.id === guess.type_designation_id)?.name ?? null;
      case "vintage":
        return vintageLabel(guess);
    }
  }

  const stake = pointsAtStake(guess);
  const chipIds = (shortlist?.grapeIds ?? []).slice(0, 3);
  const chips = chipIds
    .map((id) => grapes.find((g) => g.id === id))
    .filter((g): g is ReferenceOption => Boolean(g));
  // ASYNC + IMMEDIATE: locking runs score_own_guess, so it is a final submit
  // that shows the answer — the button, footer and a confirm say so (play-4).
  // Null in every other mode, where locking stays a take-back-able signal.
  const submitLabel = lockButtonLabel({
    timingMode,
    asyncRevealPolicy,
    glass: glassNumber,
    match: false,
  });

  async function onLock() {
    if (
      submitLabel !== null &&
      !window.confirm(lockConfirm({ glass: glassNumber, blank: pointsAtStake(guess) === 0 }))
    ) {
      return;
    }
    setLocking(true);
    setLockError(null);
    try {
      // Wait for every group's save to settle before locking, so a save
      // racing the lock never meets the lock pin's refusal (spec §8.3 item 5).
      // A single Promise.allSettled over one snapshot of pumpsRef is not
      // enough (review round 1): pick()/openPicker() now refuse once
      // `locking` is true, but re-check the pure state anyway rather than
      // trust that alone — a group with no pump running yet is not in the
      // snapshot, and pumpGroup adds its promise to pumpsRef synchronously,
      // so looping here until the state says nothing is pending always
      // catches it.
      while (!allSettled(stateRef.current)) {
        await Promise.allSettled(Object.values(pumpsRef.current));
      }
      lockedRef.current = true;
      const result = await lockGuess(tastingId, wineId);
      if ("error" in result) {
        lockedRef.current = false;
        setLockError(result.error);
        return;
      }
      onLocked();
    } finally {
      setLocking(false);
    }
  }

  // ---- render -------------------------------------------------------------
  // A render function, not a nested component: a component declared inside
  // render remounts its subtree on every state change (every autosave).
  function renderRow(field: LadderField) {
    const value = displayValue(field);
    const answered = isFieldAnswered(guess, field) && value !== null;
    const saved = justSaved === field && answered;
    const isGrape = field === "primary_grape" && chips.length > 0;
    // The chips already show a grape picked from among them (6e draws the
    // grape row as label + chips, no value line); a grape picked from the
    // full list keeps the value line so the answer is still visible.
    const chipShowsValue = isGrape && chips.some((c) => c.id === guess.primary_grape_id);
    const rowClass = cn(
      "flex flex-col gap-[6px] rounded-[11px] px-[13px] py-3 text-left transition-colors",
      saved
        ? "border-[1.5px] border-primary bg-white"
        : answered
          ? "border border-border bg-white md:hover:bg-background"
          : "border border-dashed border-border bg-card md:hover:bg-background",
    );
    const inner = (
      <>
        <span
          className={cn(
            "w-[22px] shrink-0 text-center font-heading text-[15px] font-semibold lining-nums tabular-nums",
            saved ? "text-primary" : answered ? "text-gold-deep" : "text-placeholder-soft",
          )}
        >
          {fieldPoints(field)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="text-[11px] text-muted-foreground">{ROW_LABEL[field]}</span>
          {answered && !chipShowsValue ? (
            <span className={cn("truncate text-[15px] font-semibold", saved && "text-primary")}>
              {value}
            </span>
          ) : isGrape ? null : (
            <span className="text-[14px] text-muted-foreground">{EMPTY_TEXT[field]}</span>
          )}
        </span>
        {saved ? (
          <Eyebrow size="sm" className="shrink-0 text-primary">
            just now
          </Eyebrow>
        ) : isGrape ? null : (
          // 6e draws the grape row without a chevron — the chips are its
          // affordance.
          <ChevronRight className="size-4 shrink-0 text-placeholder" aria-hidden />
        )}
      </>
    );
    const row = !isGrape ? (
      <button
        ref={rowRef(field)}
        type="button"
        onClick={() => openPicker(field)}
        className={cn(rowClass, "min-h-[56px]")}
      >
        <span className="flex w-full items-center gap-[11px]">{inner}</span>
      </button>
    ) : (
      // The grape row: the shortlist chips are one-tap answers, so they sit
      // beside (not inside) the button that opens the full picker.
      <div className={rowClass}>
        <button
          ref={rowRef(field)}
          type="button"
          onClick={() => openPicker(field)}
          className="flex min-h-11 w-full items-center gap-[11px] text-left"
        >
          {inner}
        </button>
        {/* Chips are ~26px tall; the pseudo hit area extends 9px each side
            so the one-tap answer for the 8-point row meets the 44px target. */}
        <span className="flex flex-wrap gap-x-[6px] gap-y-[8px] pl-[33px]">
          {chips.map((g) => {
            const on = guess.primary_grape_id === g.id;
            return (
              <button
                key={g.id}
                type="button"
                aria-pressed={on}
                onClick={() => pick("primary_grape", on ? null : g.id)}
                className={cn(
                  "relative rounded-full border px-[11px] py-1 text-[12.5px] transition-colors before:absolute before:inset-x-0 before:-inset-y-[9px] before:content-['']",
                  on
                    ? "border-gold bg-gold/15 font-semibold text-primary"
                    : "border-border text-muted-foreground hover:border-gold hover:bg-white",
                )}
              >
                {g.name}
              </button>
            );
          })}
        </span>
      </div>
    );
    const groupError = saveState.errors[groupForField(field)] ?? null;
    return (
      <div key={field} className="flex flex-col gap-1">
        {row}
        {groupError ? <p className="px-1 text-[11.5px] text-rose">{groupError}</p> : null}
        {field === "vintage" ? (
          // Always mounted, not only once tawnyOtherOpen is true — the same
          // combobox rule every picker's search input follows (CLAUDE.md):
          // openTawnyOtherInput() focuses this input synchronously, in the
          // same tap that picks "Other age…", and a node that only enters
          // the DOM after that tap has nothing to focus at the instant it
          // needs to (review round 1 — this had regressed to the exact
          // wrong design CLAUDE.md's combobox history already ruled out:
          // focus deferred to a useEffect, after the tap has ended, so the
          // virtual keyboard never opens on a phone). Collapsed with
          // opacity/max-height/pointer-events rather than `hidden` —
          // display:none (or visibility:hidden) would block focus() too.
          <div
            className={cn(
              "flex flex-col gap-2 rounded-[11px] border border-primary bg-white px-[13px] py-3 transition-[opacity,max-height]",
              tawnyOtherOpen
                ? "max-h-40 opacity-100"
                : "pointer-events-none max-h-0 overflow-hidden border-0 px-0 py-0 opacity-0",
            )}
            aria-hidden={!tawnyOtherOpen}
          >
            <span className="text-[11px] text-muted-foreground">Tawny age (years)</span>
            <div className="flex items-center gap-[10px]">
              <input
                ref={tawnyOtherInputRef}
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={tawnyOtherValue}
                onChange={(e) => setTawnyOtherValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmTawnyOther();
                  }
                }}
                placeholder="e.g. 25"
                tabIndex={tawnyOtherOpen ? undefined : -1}
                className="min-h-11 w-24 rounded-[10px] border border-border bg-white px-3 text-[15.5px] text-foreground"
              />
              <button
                type="button"
                tabIndex={tawnyOtherOpen ? undefined : -1}
                onClick={() => setTawnyOtherOpen(false)}
                className="flex min-h-11 items-center px-2 text-[13px] font-semibold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                tabIndex={tawnyOtherOpen ? undefined : -1}
                disabled={!validTawnyOther}
                onClick={confirmTawnyOther}
                className="ml-auto flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-[16px] text-[13.5px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                Set age
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-[11px] border-b border-border px-4 pt-2 pb-[11px]">
        <Link
          href={`/tastings/${tastingId}`}
          aria-label="Back to the tasting"
          className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground before:absolute before:-inset-1.5 before:content-['']"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="flex min-w-0 flex-1 flex-col">
          <Eyebrow size="md" className="truncate">
            {tastingName ? `${tastingName} · blind` : "Blind"}
          </Eyebrow>
          <span className="font-heading text-[19px] font-semibold lining-nums tabular-nums">
            Glass {glassNumber} of {glassCount}
          </span>
        </span>
        {rankChip ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-[10px] py-[5px] text-[11px] font-semibold text-primary lining-nums tabular-nums">
            {ordinal(rankChip.rank)} · {rankChip.points} pts
          </span>
        ) : null}
      </div>

      {/* Flight progress */}
      <div className="flex items-center gap-1 px-4 py-[9px]">
        {segments.map((s, i) => (
          <span
            key={i}
            className={cn(
              "h-[5px] flex-1 rounded-full",
              s === "revealed" ? "bg-primary" : s === "current" ? "bg-gold" : "bg-border",
            )}
          />
        ))}
        <span className="ml-[5px] shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
          {lockedCount} of {eligibleCount} locked
        </span>
      </div>

      {/* Rows — inert while locking (review round 1): pick()/openPicker()
          already refuse, this just shows it so a tap does not look ignored. */}
      <div
        className={cn(
          "flex flex-col gap-2 px-4 pt-1",
          locking && "pointer-events-none opacity-60",
        )}
      >
        <div className="flex items-center gap-[10px] rounded-[11px] border border-border bg-card p-[11px_13px]">
          <span className="flex-1 text-[12.5px] text-muted-foreground">Your guess so far</span>
          <span className="font-heading text-[20px] font-semibold text-primary lining-nums tabular-nums">
            {stake}
            <span className="text-[13px] text-muted-foreground"> / {MAX_POINTS} pts at stake</span>
          </span>
        </div>
        {lockError ? <p className="px-1 text-[12.5px] text-rose">{lockError}</p> : null}

        {LADDER_ORDER.map(renderRow)}

        <p className="px-1 pt-0.5 text-[11px] text-muted-foreground">{LADDER_EXTRAS_NOTE}</p>

        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
          className="flex min-h-11 items-center gap-1 self-start px-1 text-[12.5px] font-semibold text-primary"
        >
          {moreOpen ? "Less" : "More"}
          <ChevronDown className={cn("size-4 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {moreOpen ? OPTIONAL_FIELDS.map(renderRow) : null}
      </div>

      {/* Footer */}
      <div className="mt-3 flex flex-col gap-2 border-t border-border bg-card px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] md:pb-4">
        <button
          type="button"
          onClick={onLock}
          disabled={locking}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-primary p-[15px] text-[16px] font-semibold text-primary-foreground shadow-[0_2px_0_0_rgba(42,33,30,.18)] transition-colors hover:bg-[#4A1523] disabled:opacity-60"
        >
          {locking ? (
            <>
              <WineGlassLoader size={18} /> Locking…
            </>
          ) : (
            (submitLabel ?? `Lock in glass ${glassNumber}`)
          )}
        </button>
        <span className="text-center text-[11.5px] text-muted-foreground">
          {lockFooter({ timingMode, asyncRevealPolicy }) ??
            "Saved as you go. Locking stops edits and shows the others you are ready."}
        </span>
      </div>

      <FieldPicker
        open={picker.open}
        field={picker.field}
        points={fieldPoints(picker.field)}
        title={`Which ${FIELD_LABEL[picker.field].toLowerCase()}?`}
        groups={pickerGroups(picker.field)}
        value={pickerValue(picker.field)}
        onPick={onPickerPick}
        onNext={() => advanceFrom(picker.field)}
        nextLabel={nextLabel}
        search={picker.field === "producer" ? producerSearch : "client"}
        onClose={closePicker}
        inputRef={inputRef}
        searchPlaceholder={searchPlaceholder(picker.field)}
      />
    </div>
  );
}
