"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eyebrow } from "@/components/overview/eyebrow";
import { actionButtonClass } from "@/components/overview/action-button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { ImageUploader } from "@/components/image-uploader";
import { ReferenceCombobox } from "@/components/reference-combobox";
import {
  SearchableCombobox,
  optionFoldsEqual,
  type SearchOption,
} from "@/components/searchable-combobox";
import {
  TypeDesignationField,
  type TypeDesignationOption,
} from "@/components/type-designation-field";
import {
  GrapeBlendEditor,
  type BlendRow as EditorBlendRow,
} from "@/app/catalog/new/grape-blend-editor";
import {
  createAppellation,
  createCountry,
  createGrape,
  createRegion,
  createTypeDesignation,
} from "@/app/tastings/[id]/wines/new/actions";
import { createClient } from "@/lib/supabase/client";
import {
  listAppellationsForRegions,
  searchAppellations,
  searchProducers,
} from "@/lib/reference-search";
import { emptyDraft, missingWineFields, normaliseDraft } from "@/lib/wine-identity/complete";
import { describeMissing } from "@/lib/wine-identity/describe";
import { foldName } from "@/lib/wine-identity/fold";
import type { GrapeSuggestion } from "@/lib/wine-identity/grape-suggestion";
import type {
  BlendRow,
  FieldProvenance,
  ProvenanceKey,
  RefChoice,
  VintageKind,
  WineColour,
  WineFieldKey,
  WineIdentityDraft,
  WineStyle,
} from "@/lib/wine-identity/types";
import { cn } from "@/lib/utils";
import { producerHomeRegion, suggestGrapeForAppellation, type ProducerHomeRegion } from "./actions";
import { regionSelfNamedAppellation } from "./by-hand-actions";
import {
  NO_GI_HINT,
  applyProducerRegion,
  blendScoredLine,
  byHandHeader,
  fieldChip,
  grapeSuggestionNote,
  parseAlcohol,
  pickProducerAdoption,
  regionFirstLabel,
  type ChipField,
  type FieldChipContext,
} from "./by-hand-logic";
import { appellationHint, appellationPlaceholder } from "./self-named-appellation";
import type { ByHandFormProps } from "./types";

// ---------------------------------------------------------------------------
// Copy (spec §C.5 A7 and A4b, §B.7, §2.1 row 17)

const VINTAGE_OPTIONS: { value: VintageKind; label: string }[] = [
  { value: "YEAR", label: "Year" },
  { value: "NV", label: "NV" },
  { value: "TAWNY", label: "Tawny" },
];
const COLOUR_OPTIONS: { value: WineColour; label: string }[] = [
  { value: "RED", label: "Red" },
  { value: "WHITE", label: "White" },
  { value: "ROSE", label: "Rosé" },
  { value: "ORANGE", label: "Other" },
];
const STYLE_OPTIONS: { value: WineStyle; label: string }[] = [
  { value: "STILL", label: "Still" },
  { value: "SPARKLING", label: "Sparkling" },
  { value: "SWEET", label: "Sweet" },
  { value: "FORTIFIED", label: "Fortified" },
];
const TAWNY_AGES = [10, 20, 30, 40] as const;

const UNIDENTIFIED_TOGGLE = "I can't identify this bottle";
const UNIDENTIFIED_NOTE =
  "Unidentified wines are kept out of the shared catalog — no community rating, not searchable, excluded from stats. Only vintage, country, region and grape are required. Use this only when the bottle genuinely can't be identified.";
const UNIDENTIFIED_FOOTER_NOTE = "Kept out of the shared catalog";
const PENDING_PRODUCER_HINT = "New producer — we'll add it when you save.";
const PENDING_GRAPE_HINT = "New grape — we'll add it when you save, or pick an existing one above.";
const MORE_DETAIL_SUBLINE = "Second grape, designation, alcohol, a photo";
const SEARCH_INSTEAD = "Search instead";
const LEAVE_FOR_LATER = "Leave it for later";

/** The sentinel region and appellation every country carries (20260829263700). */
const NONE = "None";
const NO_GI = "No geographic indication";

// The handoff's field box: 48px tall, 10px radius, white on parchment. The
// comboboxes render `<input hidden/><button/>`, so their trigger is restyled
// through the wrapper (`[&>button]`) rather than a fork of the shared control.
const INPUT = "h-12 rounded-[10px] border-border bg-card px-[13px] text-base md:text-[15px]";
const PICKER =
  "[&>button]:h-12 [&>button]:rounded-[10px] [&>button]:border-border [&>button]:bg-card [&>button]:px-[13px] [&>button]:text-[15px]";
// A compact link-button whose tap area still reaches 44px on phones.
const TAP_PAD = "relative before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']";

const EMPTY_DRAFT = emptyDraft();

type RefRow = { id: string; name: string };
type RegionRow = { id: string; name: string; countryId: string };
type AppellationInfo = { id: string; name: string; regionId: string | null };
type RegionAppellations = { regionId: string; list: RefRow[]; selfNamed: RefRow | null; failed: boolean };
type Marks =Partial<Record<ProvenanceKey, FieldProvenance | null>>;

// ---------------------------------------------------------------------------
// Small pure helpers

/** The no-geographic-indication sentinel reads as words (spec §C.5 A7). */
function placeName(name: string): string {
  return name === NONE ? NO_GI : name;
}

/** "Just the region · Barolo DOCG"; the None region's own row is simply "No geographic indication". */
function justTheRegionLabel(row: RefRow): string {
  return row.name === NONE ? NO_GI : `Just the region · ${row.name}`;
}

/** An appellation option. A label that differs from the stored name keeps that
    name as `matchName`, so the combobox never offers to add it again (spec §B.7). */
function appellationOption(row: RefRow, label: string, group?: string): SearchOption {
  return {
    id: row.id,
    name: label,
    ...(label === row.name ? {} : { matchName: row.name }),
    ...(group === undefined ? {} : { group }),
  };
}

/** "Just the region" first, then the rest of the region's list. */
function regionAppellationOptions(data: RegionAppellations, group?: string): SearchOption[] {
  const { selfNamed, list } = data;
  return [
    ...(selfNamed ? [appellationOption(selfNamed, justTheRegionLabel(selfNamed), group)] : []),
    ...list
      .filter((a) => a.id !== selfNamed?.id)
      .map((a) => appellationOption(a, placeName(a.name), group)),
  ];
}

/** A field edit: the new values plus the provenance of whoever set them (null deletes the key). */
function patchDraft(
  draft: WineIdentityDraft,
  patch: Partial<Omit<WineIdentityDraft, "provenance">>,
  marks: Marks = {},
): WineIdentityDraft {
  const provenance = { ...draft.provenance };
  for (const key of Object.keys(marks) as ProvenanceKey[]) {
    const mark = marks[key];
    if (mark === null) delete provenance[key];
    else if (mark !== undefined) provenance[key] = mark;
  }
  return { ...draft, ...patch, provenance };
}

function mergeRows<T extends { id: string }>(base: readonly T[], extra: readonly T[]): T[] {
  if (extra.length === 0) return [...base];
  const seen = new Set(base.map((row) => row.id));
  return [...base, ...extra.filter((row) => !seen.has(row.id))];
}

function yearFromText(text: string): number | null {
  return text === "" ? null : Number(text);
}

function percentageFromText(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function refKey(choice: RefChoice | null | undefined): string {
  if (!choice) return "";
  return choice.kind === "existing" ? `id:${choice.id}` : `name:${foldName(choice.name)}`;
}

/** Stable per session origin, so a new session starts with a fresh photo picker. */
function sessionKey(session: ByHandFormProps["session"]): string {
  if (!session) return "none";
  const { origin } = session;
  switch (origin.kind) {
    case "new":
      return "new";
    case "item":
    case "match":
      return `${origin.kind}:${origin.itemId}`;
    case "glass":
      return `glass:${origin.wineId}`;
  }
}

/** "did not read — required" first, then "required", then any other chip. */
function strongerChip(a: string | null, b: string | null): string | null {
  const rank = (chip: string | null) =>
    chip === null ? 3 : chip.startsWith("did not read") ? 0 : chip === "required" ? 1 : 2;
  return rank(a) <= rank(b) ? a : b;
}

/** An appellation's name and region by id (a lookup by id, never a table read). */
async function lookupAppellation(id: string): Promise<AppellationInfo | null> {
  try {
    const { data, error } = await createClient()
      .from("appellations")
      .select("id, name, region_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id, name: data.name, regionId: data.region_id };
  } catch {
    return null;
  }
}

/**
 * A region's appellations and its "Just the region" row, as one result so the
 * list, its first option and the placeholder change together. Only a load still
 * in flight is shared (the form's effect and a search opened before the list
 * lands wait on the same one); a settled load is dropped, so a failure is asked
 * again on the next open.
 */
function loadRegionAppellations(
  loads: Map<string, Promise<RegionAppellations>>,
  regionId: string,
  regionName: string | null,
): Promise<RegionAppellations> {
  const key = `${regionId}|${regionName ?? ""}`;
  const inFlight = loads.get(key);
  if (inFlight) return inFlight;
  const load = (async (): Promise<RegionAppellations> => {
    try {
      const [list, selfNamed] = await Promise.all([
        listAppellationsForRegions([regionId]),
        regionName ? regionSelfNamedAppellation(regionId, regionName) : Promise.resolve(null),
      ]);
      return { regionId, list, selfNamed, failed: false };
    } catch {
      return { regionId, list: [], selfNamed: null, failed: true };
    }
  })();
  loads.set(key, load);
  void load.finally(() => {
    if (loads.get(key) === load) loads.delete(key);
  });
  return load;
}

// ---------------------------------------------------------------------------

/**
 * By hand (A7), and finishing a partial read or an incomplete glass (A4b): one
 * form, one field order, on every device (D8). The sheet owns the draft: every
 * value comes from `session` and every edit goes out through `onChange` (RC8),
 * so leaving the form and coming back keeps what was typed, and nothing here is
 * lost to AutoRefresh. The shell mounts the form hidden from the first paint
 * with `session: null`, so `fieldRefs` exist before Fix or By hand is tapped
 * (spec §C.4 rule 9).
 *
 * The only things taken from a producer are its region link's country and
 * region (`applyProducerRegion`); the appellation is always the user's pick, and
 * the grape is only ever suggested by the appellation, filled on tap. Whether a
 * field is missing comes from `missingWineFields` alone (D2).
 */
export function ByHandForm({
  session,
  matrix,
  destination,
  references,
  finishing,
  busy,
  error,
  userId,
  onChange,
  onUnidentified,
  onSave,
  onLeaveForLater,
  onSearchInstead,
  fieldRefs,
}: ByHandFormProps) {
  const inert = session === null;
  const draft = session?.draft ?? EMPTY_DRAFT;
  const unidentified = session?.unidentified ?? false;
  const disabled = inert || busy;

  // The latest draft, for handlers and lookups that finish after further edits:
  // they apply to those edits, never to the draft they started from.
  const draftRef = useRef(draft);
  useLayoutEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  function change(next: WineIdentityDraft) {
    draftRef.current = next;
    onChange(next);
  }

  // --- reference lists (loaded once by the shell; rows created here are added) ---

  const [created, setCreated] = useState<{
    countries: RefRow[];
    regions: RegionRow[];
    grapes: RefRow[];
    typeDesignations: TypeDesignationOption[];
    appellations: (RefRow & { regionId: string })[];
  }>({ countries: [], regions: [], grapes: [], typeDesignations: [], appellations: [] });
  // A grape created inside a combobox is picked before this form re-renders with it.
  const createdGrapeNames = useRef(new Map<string, string>());

  const countries = mergeRows(references.countries, created.countries);
  const regions = mergeRows(references.regions, created.regions);
  const grapes = mergeRows(references.grapes, created.grapes);
  const typeDesignations = mergeRows(
    references.typeDesignations.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      country_id: t.countryId,
    })),
    created.typeDesignations,
  );
  const regionById = (id: string | null) => (id ? (regions.find((r) => r.id === id) ?? null) : null);

  function grapeCreated(option: RefRow) {
    createdGrapeNames.current.set(option.id, option.name);
    setCreated((c) => ({ ...c, grapes: [...c.grapes, option] }));
  }
  function grapeName(id: string): string | undefined {
    return grapes.find((g) => g.id === id)?.name ?? createdGrapeNames.current.get(id);
  }

  const region = regionById(draft.regionId);
  const regionId = draft.regionId;
  const regionName = region?.name ?? null;
  const regionLabel = region ? placeName(region.name) : null;

  // --- producer: region link, adoption --------------------------------------

  const producer = draft.producer;
  const existingProducerId = producer?.kind === "existing" ? producer.id : null;
  const [home, setHome] = useState<{ producerId: string; link: ProducerHomeRegion | null } | null>(null);
  const homeKnown = home !== null && home.producerId === existingProducerId;
  // Set by a pick or an adoption: that producer's region link lands in the draft
  // once it loads. A producer already in the draft (a read, a glass) only names
  // its region in the "matched" chip.
  const linkPending = useRef<string | null>(null);

  function withLink(base: WineIdentityDraft, producerId: string, link: ProducerHomeRegion | null) {
    if (base.producer?.kind !== "existing" || base.producer.id !== producerId) return base;
    return applyProducerRegion(base, link ? { regionId: link.regionId, countryId: link.countryId } : null);
  }

  const homeLoaded = useEffectEvent((producerId: string, link: ProducerHomeRegion | null) => {
    setHome({ producerId, link });
    if (linkPending.current !== producerId) return;
    linkPending.current = null;
    const latest = draftRef.current;
    const next = withLink(latest, producerId, link);
    if (next !== latest) change(next);
  });

  useEffect(() => {
    if (inert || existingProducerId === null || homeKnown) return;
    let current = true;
    const producerId = existingProducerId;
    startTransition(async () => {
      let link: ProducerHomeRegion | null = null;
      try {
        link = await producerHomeRegion(producerId);
      } catch {
        // A failed lookup counts as "no link", so a previous producer's region never stays.
        link = null;
      }
      if (current) homeLoaded(producerId, link);
    });
    return () => {
      current = false;
    };
  }, [inert, existingProducerId, homeKnown]);

  /** An existing producer becomes the chosen one; its region link follows (RC10). */
  function chooseProducer(base: WineIdentityDraft, hit: RefRow, mark: FieldProvenance) {
    const next = patchDraft(base, { producer: { kind: "existing", id: hit.id, name: hit.name } }, { producer: mark });
    if (home !== null && home.producerId === hit.id) {
      linkPending.current = null;
      change(withLink(next, hit.id, home.link));
    } else {
      linkPending.current = hit.id;
      change(next);
    }
  }

  function pickProducer(id: string, label: string) {
    const base = draftRef.current;
    if (id) {
      chooseProducer(base, { id, name: label }, "manual");
      return;
    }
    // A pending producer is created only when the wine is saved (spec §B.7). It
    // has no region link, so fields a previous producer's link filled are cleared.
    const name = label.trim();
    linkPending.current = null;
    const next = patchDraft(
      base,
      { producer: name ? { kind: "pending", name } : null },
      { producer: name ? "manual" : null },
    );
    change(applyProducerRegion(next, null));
  }

  // A pending name (typed, or from a read) is searched once: a folded-equal hit
  // is adopted, so no duplicate producer is ever created (byhand-1); otherwise
  // the top hit is offered as "Did you mean".
  const pendingName = producer?.kind === "pending" ? producer.name : null;
  const adoptionKey =
    pendingName !== null && foldName(pendingName) !== ""
      ? `${foldName(pendingName)}|${regionId ?? ""}`
      : null;
  const [adoption, setAdoption] = useState<{ key: string; suggest: RefRow | null } | null>(null);
  const adoptionResult = adoption !== null && adoption.key === adoptionKey ? adoption : null;

  const adoptionLoaded = useEffectEvent((key: string, typed: string, hits: RefRow[]) => {
    const decision = pickProducerAdoption(typed, hits);
    if ("adopt" in decision) {
      setAdoption({ key, suggest: null });
      const latest = draftRef.current;
      if (latest.producer?.kind !== "pending" || foldName(latest.producer.name) !== foldName(typed)) return;
      chooseProducer(latest, decision.adopt, latest.provenance.producer ?? "manual");
      return;
    }
    setAdoption({ key, suggest: "suggest" in decision ? decision.suggest : null });
  });

  useEffect(() => {
    if (inert || adoptionKey === null || pendingName === null) return;
    let current = true;
    const key = adoptionKey;
    const typed = pendingName;
    const scope = regionId;
    startTransition(async () => {
      let hits: RefRow[] = [];
      try {
        const found = await searchProducers(typed, scope ?? undefined);
        hits = found.map(({ id, name }) => ({ id, name }));
      } catch {
        hits = [];
      }
      if (current) adoptionLoaded(key, typed, hits);
    });
    return () => {
      current = false;
    };
  }, [inert, adoptionKey, pendingName, regionId]);

  async function searchProducersGrouped(query: string): Promise<SearchOption[]> {
    try {
      const found = await searchProducers(query, regionId ?? undefined);
      return found.map(({ id, name, in_region }) => ({
        id,
        name,
        group: regionId
          ? in_region
            ? `Specific to ${regionLabel ?? "the region"}`
            : "Other producers"
          : undefined,
      }));
    } catch {
      return [];
    }
  }

  // --- vintage, name, colour, style -------------------------------------------

  // Typed text is kept while it still reads as the draft's value, so "13." or a
  // half-typed year is never rewritten under the cursor; a new session's value wins.
  const [yearText, setYearText] = useState("");
  const yearShown =
    yearFromText(yearText) === draft.vintage.year
      ? yearText
      : draft.vintage.year === null
        ? ""
        : String(draft.vintage.year);
  const tawny = draft.vintage.kind === "TAWNY";

  function pickVintageKind(kind: VintageKind) {
    const base = draftRef.current;
    if (base.vintage.kind === kind) return;
    // Tawny is always fortified (D8); Style stays locked while it is selected.
    change(
      patchDraft(
        base,
        { vintage: { ...base.vintage, kind, read: false }, ...(kind === "TAWNY" ? { style: "FORTIFIED" } : {}) },
        { vintage: "manual", ...(kind === "TAWNY" ? { style: "manual" } : {}) },
      ),
    );
  }

  function typeYear(raw: string) {
    const text = raw.replace(/\D/g, "").slice(0, 4);
    setYearText(text);
    const base = draftRef.current;
    change(
      patchDraft(
        base,
        { vintage: { kind: "YEAR", year: yearFromText(text), tawnyYears: base.vintage.tawnyYears, read: false } },
        { vintage: "manual" },
      ),
    );
  }

  function pickTawnyYears(value: string | null) {
    const base = draftRef.current;
    change(
      patchDraft(
        base,
        {
          vintage: { kind: "TAWNY", year: base.vintage.year, tawnyYears: value ? Number(value) : null, read: false },
          style: "FORTIFIED",
        },
        { vintage: "manual", style: "manual" },
      ),
    );
  }

  const tawnyItems: Record<string, string> = Object.fromEntries(
    TAWNY_AGES.map((age) => [String(age), `${age} years`]),
  );
  if (draft.vintage.tawnyYears !== null && !(String(draft.vintage.tawnyYears) in tawnyItems)) {
    tawnyItems[String(draft.vintage.tawnyYears)] = `${draft.vintage.tawnyYears} years`;
  }

  // --- origin: country, region, appellation -------------------------------------

  const [appellationData, setAppellationData] = useState<RegionAppellations | null>(null);
  // The region's load in flight, shared by the effect below and by a search that
  // opens before the list lands.
  const appellationLoads = useRef(new Map<string, Promise<RegionAppellations>>());

  /** A loaded list plus the appellations created here for its region, even while it was loading. */
  function withCreatedAppellations(data: RegionAppellations): RegionAppellations {
    const extra = created.appellations
      .filter((a) => a.regionId === data.regionId)
      .map(({ id, name }) => ({ id, name }));
    return extra.length === 0 ? data : { ...data, list: mergeRows(data.list, extra) };
  }

  const loadedAppellations =
    appellationData !== null && appellationData.regionId === regionId ? appellationData : null;
  const regionAppellations =
    loadedAppellations === null ? null : withCreatedAppellations(loadedAppellations);
  const appellationsLoading = regionId !== null && regionAppellations === null;

  useEffect(() => {
    if (inert || regionId === null) return;
    let current = true;
    const id = regionId;
    const name = regionName;
    startTransition(async () => {
      const data = await loadRegionAppellations(appellationLoads.current, id, name);
      if (current) setAppellationData(data);
    });
    return () => {
      current = false;
    };
  }, [inert, regionId, regionName]);

  const appellationId = draft.appellationId;
  const listedAppellation =
    appellationId !== null && regionAppellations !== null
      ? regionAppellations.selfNamed?.id === appellationId
        ? regionAppellations.selfNamed
        : (regionAppellations.list.find((a) => a.id === appellationId) ?? null)
      : null;
  const [appellationInfo, setAppellationInfo] = useState<AppellationInfo | null>(null);
  const infoKnown = appellationInfo !== null && appellationInfo.id === appellationId;
  // An appellation the region's list does not hold (a draft from elsewhere) is looked up by id.
  const needsLookup =
    !inert && appellationId !== null && listedAppellation === null && !infoKnown && !appellationsLoading;
  useEffect(() => {
    if (!needsLookup || appellationId === null) return;
    let current = true;
    const id = appellationId;
    void lookupAppellation(id).then((info) => {
      if (current && info) setAppellationInfo(info);
    });
    return () => {
      current = false;
    };
  }, [needsLookup, appellationId]);

  const appellationName =
    listedAppellation?.name ?? (appellationInfo !== null && infoKnown ? appellationInfo.name : null);
  const appellationLabel =
    appellationId === null
      ? null
      : appellationName !== null
        ? placeName(appellationName)
        : "Loading…";

  /** The region an appellation belongs to, when this form knows it. */
  function appellationRegionOf(id: string): string | null {
    if (
      regionAppellations !== null &&
      (regionAppellations.selfNamed?.id === id || regionAppellations.list.some((a) => a.id === id))
    ) {
      return regionAppellations.regionId;
    }
    return appellationInfo !== null && appellationInfo.id === id ? appellationInfo.regionId : null;
  }

  function pickCountry(id: string) {
    const base = draftRef.current;
    const countryId = id || null;
    if (countryId === base.countryId) return;
    // Clears a region and appellation that no longer belong (spec §C.5 A7).
    const keepRegion =
      base.regionId !== null && countryId !== null && regionById(base.regionId)?.countryId === countryId;
    const appellationRegion = base.appellationId ? appellationRegionOf(base.appellationId) : null;
    const keepAppellation =
      base.appellationId !== null &&
      keepRegion &&
      (appellationRegion === null || appellationRegion === base.regionId);
    change(
      patchDraft(
        base,
        {
          countryId,
          regionId: keepRegion ? base.regionId : null,
          appellationId: keepAppellation ? base.appellationId : null,
        },
        {
          country: countryId ? "manual" : null,
          ...(keepRegion ? {} : { region: null }),
          ...(keepAppellation ? {} : { appellation: null }),
        },
      ),
    );
  }

  function pickRegion(id: string) {
    const base = draftRef.current;
    const nextRegion = id || null;
    if (nextRegion === base.regionId) return;
    const appellationRegion = base.appellationId ? appellationRegionOf(base.appellationId) : null;
    const keepAppellation =
      base.appellationId !== null && nextRegion !== null && appellationRegion === nextRegion;
    change(
      patchDraft(
        base,
        { regionId: nextRegion, appellationId: keepAppellation ? base.appellationId : null },
        { region: nextRegion ? "manual" : null, ...(keepAppellation ? {} : { appellation: null }) },
      ),
    );
  }

  async function pickAppellation(id: string, label: string) {
    const base = draftRef.current;
    if (!id) {
      change(patchDraft(base, { appellationId: null }, { appellation: null }));
      return;
    }
    change(patchDraft(base, { appellationId: id }, { appellation: "manual" }));
    if (base.regionId !== null) return;
    // With no region the field searched every appellation. The one picked brings
    // its region and that region's country, so the three always agree (the write
    // refuses an appellation outside the chosen region).
    setAppellationInfo({ id, name: label, regionId: null });
    const info = await lookupAppellation(id);
    if (!info) return;
    setAppellationInfo(info);
    const latest = draftRef.current;
    if (latest.appellationId !== id || latest.regionId !== null || info.regionId === null) return;
    const row = regionById(info.regionId);
    change(
      patchDraft(
        latest,
        { regionId: info.regionId, countryId: row ? row.countryId : latest.countryId },
        { region: "manual", ...(row ? { country: "manual" } : {}) },
      ),
    );
  }

  /**
   * A region's list as this render holds it. Opened before the list landed (Fix
   * focuses the trigger inside the tap) or after a failed load, it waits for the
   * region's load in flight, or starts one, instead of answering with an empty
   * list: the combobox searches again only when the query changes or it reopens.
   */
  async function appellationsForRegion(forRegion: string): Promise<RegionAppellations> {
    if (
      regionAppellations !== null &&
      regionAppellations.regionId === forRegion &&
      !regionAppellations.failed
    ) {
      return regionAppellations;
    }
    const data = await loadRegionAppellations(
      appellationLoads.current,
      forRegion,
      regionById(forRegion)?.name ?? null,
    );
    if (!data.failed && draftRef.current.regionId === forRegion) setAppellationData(data);
    return withCreatedAppellations(data);
  }

  /** "{Region} first": "Just the region" leads, then the region's own list; typing filters it. */
  async function searchAppellationOptions(query: string): Promise<SearchOption[]> {
    if (regionId === null) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      try {
        const found = await searchAppellations(trimmed);
        return found.map((a) => appellationOption(a, placeName(a.name)));
      } catch {
        return [];
      }
    }
    const options = regionAppellationOptions(
      await appellationsForRegion(regionId),
      regionFirstLabel(regionLabel ?? "The region"),
    );
    const key = foldName(query);
    if (key === "") return options;
    // By what a row shows or by its stored name: "none" finds "No geographic indication".
    return options.filter((o) =>
      [o.name, o.matchName].some((n) => n !== undefined && foldName(n).includes(key)),
    );
  }

  async function createRegionAppellation(name: string): Promise<SearchOption> {
    const forRegion = draftRef.current.regionId;
    if (forRegion === null) throw new Error("Choose a region first.");
    // A name that folds equal to a row the region already has picks that row. The
    // combobox hides Add for it, but its results can be stale, and the server finds
    // by exact name only (spec §B.7, byhand-1: no duplicate is ever created).
    const existing = regionAppellationOptions(await appellationsForRegion(forRegion)).find((o) =>
      optionFoldsEqual(o, name),
    );
    if (existing) return existing;
    const row = await createAppellation(forRegion, name);
    const option = { id: row.id, name: row.name };
    // Kept apart from the loaded list, so a list still loading cannot drop it,
    // and known by id at once for the trigger's label.
    setCreated((c) => ({ ...c, appellations: [...c.appellations, { ...option, regionId: forRegion }] }));
    setAppellationInfo({ ...option, regionId: forRegion });
    return option;
  }

  // --- grape ----------------------------------------------------------------------

  const [grapeHint, setGrapeHint] = useState<{
    appellationId: string;
    suggestion: GrapeSuggestion | null;
  } | null>(null);
  const suggestion =
    grapeHint !== null && grapeHint.appellationId === appellationId ? grapeHint.suggestion : null;

  // When the appellation changes, ask what it suggests (spec §B.8). Never applied on its own.
  useEffect(() => {
    if (inert || appellationId === null) return;
    let current = true;
    const id = appellationId;
    startTransition(async () => {
      let found: GrapeSuggestion | null = null;
      try {
        found = await suggestGrapeForAppellation(id);
      } catch {
        found = null;
      }
      if (current) setGrapeHint({ appellationId: id, suggestion: found });
    });
    return () => {
      current = false;
    };
  }, [inert, appellationId]);

  const primaryGrape = draft.blend[0]?.grape ?? null;

  /** Blend row 0; the rest of the blend, with its percentages, is left as it is (byhand-4). */
  function setPrimaryGrape(grape: RefRow, mark: FieldProvenance) {
    const base = draftRef.current;
    const row: BlendRow = {
      grape: { kind: "existing", id: grape.id, name: grape.name },
      percentage: base.blend[0]?.percentage ?? null,
    };
    change(patchDraft(base, { blend: [row, ...base.blend.slice(1)] }, { primaryGrape: mark }));
  }

  function pickPrimaryGrape(id: string) {
    if (!id) return;
    const name = grapeName(id);
    if (name !== undefined) setPrimaryGrape({ id, name }, "manual");
  }

  const showSuggestedChip =
    suggestion !== null && !(primaryGrape?.kind === "existing" && primaryGrape.id === suggestion.grape.id);

  // The blend editor's rows, one per draft blend row, in the draft's own order.
  const editorRows: EditorBlendRow[] = draft.blend.map((row) => ({
    grapeId: row.grape.kind === "existing" ? row.grape.id : "",
    percentage: row.percentage === null ? "" : String(row.percentage),
    pendingName: row.grape.kind === "pending" ? row.grape.name : undefined,
  }));

  function changeBlend(rows: EditorBlendRow[]) {
    const base = draftRef.current;
    const blend: BlendRow[] = rows.map((row, index) => {
      const before = base.blend[index]?.grape;
      const grape: RefChoice = row.grapeId
        ? {
            kind: "existing",
            id: row.grapeId,
            name:
              grapeName(row.grapeId) ??
              (before?.kind === "existing" && before.id === row.grapeId ? before.name : ""),
          }
        : { kind: "pending", name: row.pendingName ?? "" };
      return { grape, percentage: percentageFromText(row.percentage) };
    });
    const primaryChanged = refKey(blend[0]?.grape) !== refKey(base.blend[0]?.grape);
    change(patchDraft(base, { blend }, { blend: "manual", ...(primaryChanged ? { primaryGrape: "manual" } : {}) }));
  }

  const scoredLine = blendScoredLine(normaliseDraft(draft).blend.map((row) => row.grape.name));

  // --- more detail --------------------------------------------------------------

  const sessionId = sessionKey(session);
  const [more, setMore] = useState<{ key: string; open: boolean }>({ key: "none", open: false });
  const moreOpen = more.key === sessionId && more.open;

  const [alcoholText, setAlcoholText] = useState("");
  const alcoholShown =
    parseAlcohol(alcoholText) === draft.alcohol
      ? alcoholText
      : draft.alcohol === null
        ? ""
        : String(draft.alcohol);
  function typeAlcohol(raw: string) {
    const text = raw.replace(/[^\d.,]/g, "");
    setAlcoholText(text);
    change(patchDraft(draftRef.current, { alcohol: parseAlcohol(text) }, { alcohol: "manual" }));
  }

  const [uploading, setUploading] = useState(false);
  const tastingId = destination !== null && "tastingId" in destination ? destination.tastingId : null;
  const imageFolder = tastingId ?? `catalog/staging/${userId}`;

  // --- chips, header, footer ------------------------------------------------------

  const chipContext: FieldChipContext = {
    attempted: session?.attempted ?? false,
    focusField: session?.focusField ?? null,
    // A draft from a label read carries `label` provenance, so an empty field is one the read missed.
    readAttempted:
      session?.origin.kind === "item" || Object.values(draft.provenance).includes("label"),
    producerRegionName: home !== null && homeKnown ? (home.link?.regionName ?? null) : null,
    unidentified,
  };
  const chip = (field: ChipField) => fieldChip(field, draft, chipContext);
  const countryChip = chip("country");
  const regionChip = chip("region");
  const originChip = strongerChip(countryChip.chip, regionChip.chip);
  const originLinkNote = countryChip.note ?? regionChip.note;
  const grapeChip = chip("primaryGrape");
  const wineNameChip = chip("wineName");

  const gaps = missingWineFields(draft, { unidentified });
  const header = byHandHeader({ matrix, finishing, gaps: gaps.length });
  const refusal = session?.attempted && gaps.length > 0 ? `This wine ${describeMissing(gaps)}.` : null;

  // Registered on every render, hidden or not: the shell focuses a missing field
  // inside the tap that opens the form (spec §C.4 rule 9).
  function registerTrigger(field: WineFieldKey) {
    return (wrapper: HTMLDivElement | null) => {
      fieldRefs.current[field] = wrapper?.querySelector<HTMLElement>("button") ?? null;
    };
  }
  function registerElement(field: WineFieldKey) {
    return (element: HTMLElement | null) => {
      fieldRefs.current[field] = element;
    };
  }

  // --- render ----------------------------------------------------------------------

  return (
    <div className="flex min-h-full flex-col" inert={inert}>
      <div className="flex w-full flex-col gap-[13px] p-[14px_16px] md:mx-auto md:max-w-[600px] md:p-[18px_22px]">
        {/* Header (A7 / A4b) */}
        <div className="flex items-start gap-[12px] border-b border-border pb-[12px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <Eyebrow size="md">{header.eyebrow}</Eyebrow>
            <p className="font-heading text-[21px] font-semibold leading-[1.08] md:text-[25px]">
              {header.title}
            </p>
          </div>
          {header.badge ? (
            <span className="shrink-0 self-center rounded-full border border-miss bg-miss/10 px-[10px] py-1 text-[10.5px] font-bold text-rose">
              {header.badge}
            </span>
          ) : null}
          {finishing === null ? (
            <button
              type="button"
              onClick={onSearchInstead}
              className="flex min-h-11 shrink-0 items-center rounded-[8px] border border-border bg-background px-[12px] text-[12px] font-semibold text-primary transition-colors hover:border-gold hover:bg-card"
            >
              {SEARCH_INSTEAD}
            </button>
          ) : null}
        </div>
        {header.intro ? (
          <p className="rounded-[10px] border border-border bg-background px-[12px] py-[10px] text-[12.5px] leading-[1.45]">
            {header.intro}
          </p>
        ) : null}

        {/* I can't identify this bottle (flights only, byhand-7) */}
        {matrix.byHand.unidentifiedToggle ? (
          <div className="flex flex-col gap-[8px]">
            <button
              type="button"
              role="switch"
              aria-checked={unidentified}
              disabled={disabled}
              onClick={() => onUnidentified(!unidentified)}
              className="flex min-h-11 items-center gap-[12px] rounded-[10px] border border-border bg-card px-[13px] py-[8px] text-left disabled:opacity-60"
            >
              <span className="flex-1 text-[13px] font-semibold">{UNIDENTIFIED_TOGGLE}</span>
              <span
                aria-hidden
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors",
                  unidentified ? "bg-primary" : "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-sm transition-transform",
                    unidentified && "translate-x-4",
                  )}
                />
              </span>
            </button>
            {unidentified ? (
              <p className="rounded-[10px] border border-gold bg-gold/15 px-[12px] py-[9px] text-[12px] leading-[1.45]">
                {UNIDENTIFIED_NOTE}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 1 · Producer   2 · Vintage */}
        <div className="grid gap-[13px] sm:grid-cols-[1.4fr_1fr] sm:gap-[12px]">
          <Field>
            <FieldHead label="Producer" chip={chip("producer").chip} />
            <div ref={registerTrigger("producer")} className={PICKER}>
              <SearchableCombobox
                formFieldName="producer_id"
                value={existingProducerId ?? ""}
                selectedLabel={producer && producer.name.trim() ? producer.name : null}
                onValueChange={pickProducer}
                search={searchProducersGrouped}
                placeholder="Search for the producer"
                createLabel="producer"
                // Pending: the name is kept and created on save, never at pick time.
                onCreate={async (name) => ({ id: "", name })}
                emptyQueryHint={regionId ? "Type to search all producers" : undefined}
                disabled={disabled}
              />
            </div>
            {producer?.kind === "pending" && adoptionResult !== null ? (
              adoptionResult.suggest !== null ? (
                <div className="flex items-center gap-[8px] rounded-[9px] border border-gold bg-background p-[9px_11px]">
                  <span className="min-w-0 flex-1 text-[12.5px]">
                    Did you mean <strong className="font-semibold">{adoptionResult.suggest.name}</strong>?
                  </span>
                  <span aria-hidden className="text-[12px] text-muted-foreground">
                    ·
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const hit = adoptionResult.suggest;
                      if (hit) chooseProducer(draftRef.current, hit, "manual");
                    }}
                    className={cn("shrink-0 text-[12.5px] font-semibold text-primary hover:text-primary/80", TAP_PAD)}
                  >
                    Use
                  </button>
                </div>
              ) : (
                <FieldNote>{PENDING_PRODUCER_HINT}</FieldNote>
              )
            ) : null}
          </Field>

          <Field>
            <FieldHead label="Vintage" chip={chip("vintage").chip} />
            <div ref={draft.vintage.kind === "NV" ? registerTrigger("vintage") : undefined}>
              <Segmented
                label="Vintage"
                value={draft.vintage.kind}
                options={VINTAGE_OPTIONS}
                onChange={pickVintageKind}
                disabled={disabled}
              />
            </div>
            {draft.vintage.kind === "TAWNY" ? (
              <Select
                items={tawnyItems}
                value={draft.vintage.tawnyYears === null ? null : String(draft.vintage.tawnyYears)}
                onValueChange={(v) => pickTawnyYears(v)}
                disabled={disabled}
              >
                <SelectTrigger
                  ref={registerElement("vintage")}
                  aria-label="Tawny age"
                  className="w-full rounded-[10px] border-border bg-card px-[13px] text-base data-[size=default]:h-12 md:text-[15px]"
                >
                  <SelectValue placeholder="Years" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(tawnyItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : draft.vintage.kind === "NV" ? null : (
              // YEAR or unset: always an input, so Fix has something to focus.
              <Input
                ref={registerElement("vintage")}
                aria-label="Vintage year"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={yearShown}
                onChange={(e) => typeYear(e.target.value)}
                placeholder="YYYY"
                disabled={disabled}
                className={cn(INPUT, "lining-nums tabular-nums")}
              />
            )}
          </Field>
        </div>

        {/* 3 · Wine name (optional, D3) */}
        <Field>
          <FieldHead label="Wine name" chip={wineNameChip.chip} htmlFor="byhand-wine-name" />
          <Input
            id="byhand-wine-name"
            value={draft.wineName ?? ""}
            onChange={(e) =>
              change(patchDraft(draftRef.current, { wineName: e.target.value }, { wineName: "manual" }))
            }
            placeholder="e.g. Barbaresco Serraboella"
            disabled={disabled}
            className={INPUT}
          />
          {wineNameChip.note ? <FieldNote>{wineNameChip.note}</FieldNote> : null}
        </Field>

        {/* 4 · Colour and Style, side by side, no defaults */}
        <div className="grid grid-cols-2 gap-[10px] sm:gap-[12px]">
          <Field>
            <FieldHead label="Colour" chip={chip("colour").chip} />
            <div ref={registerTrigger("colour")}>
              <Segmented
                label="Colour"
                value={draft.colour}
                options={COLOUR_OPTIONS}
                onChange={(colour) =>
                  change(patchDraft(draftRef.current, { colour }, { colour: "manual" }))
                }
                disabled={disabled}
                grid
              />
            </div>
          </Field>
          <Field>
            <FieldHead label="Style" chip={chip("style").chip} />
            <div ref={registerTrigger("style")}>
              <Segmented
                label="Style"
                value={tawny ? "FORTIFIED" : draft.style}
                options={STYLE_OPTIONS}
                onChange={(style) => {
                  if (draftRef.current.vintage.kind === "TAWNY") return;
                  change(patchDraft(draftRef.current, { style }, { style: "manual" }));
                }}
                disabled={disabled || tawny}
                grid
              />
            </div>
          </Field>
        </div>

        {/* 5 · Country and region */}
        <Field>
          <FieldHead label="Country and region" chip={originChip} />
          <div className="grid grid-cols-2 gap-[9px] sm:gap-[10px]">
            <div ref={registerTrigger("country")} className={PICKER}>
              <ReferenceCombobox
                formFieldName="country_id"
                options={countries}
                value={draft.countryId ?? ""}
                onValueChange={pickCountry}
                onOptionCreated={(o) => setCreated((c) => ({ ...c, countries: [...c.countries, o] }))}
                placeholder="Country"
                createLabel="country"
                onCreate={createCountry}
                disabled={disabled}
              />
            </div>
            <div ref={registerTrigger("region")} className={PICKER}>
              <ReferenceCombobox
                formFieldName="region_id"
                options={regions
                  .filter((r) => r.countryId === draft.countryId)
                  .map((r) => ({ id: r.id, name: placeName(r.name) }))}
                value={regionId ?? ""}
                selectedLabel={regionLabel}
                onValueChange={pickRegion}
                onOptionCreated={(o) => {
                  const countryId = draftRef.current.countryId;
                  if (countryId) {
                    setCreated((c) => ({ ...c, regions: [...c.regions, { ...o, countryId }] }));
                  }
                }}
                placeholder={draft.countryId ? "Region" : "Country first"}
                createLabel="region"
                onCreate={draft.countryId ? (name) => createRegion(draft.countryId ?? "", name) : undefined}
                disabled={disabled || !draft.countryId}
              />
            </div>
          </div>
          {originLinkNote ? (
            <p className="flex items-center gap-[7px] text-[11px] leading-[1.45] text-gold-dark">
              <span
                aria-hidden
                className="flex size-[14px] shrink-0 items-center justify-center rounded-full border border-gold"
              >
                <Check className="size-[9px]" strokeWidth={3} />
              </span>
              {originLinkNote}
            </p>
          ) : null}
          <FieldNote>{NO_GI_HINT}</FieldNote>
        </Field>

        {/* 6 · Appellation: chosen, never selected for you */}
        <Field>
          <FieldHead label="Appellation" chip={chip("appellation").chip} />
          <div ref={registerTrigger("appellation")} className={PICKER}>
            <SearchableCombobox
              formFieldName="appellation_id"
              value={appellationId ?? ""}
              selectedLabel={appellationLabel}
              onValueChange={(id, label) => void pickAppellation(id, label)}
              search={searchAppellationOptions}
              placeholder={
                appellationsLoading
                  ? "Loading appellations…"
                  : appellationPlaceholder(regionAppellations?.selfNamed != null)
              }
              createLabel="appellation"
              onCreate={regionId ? createRegionAppellation : undefined}
              // Never disabled while the region's list loads: a disabled native
              // button cannot take focus, and Fix focuses this trigger inside the
              // tap (spec §C.4 rule 9). A search opened early waits for the list.
              disabled={disabled}
            />
          </div>
          <FieldNote>
            {appellationHint(regionLabel, regionAppellations ? regionAppellations.selfNamed !== null : true)}
          </FieldNote>
        </Field>

        {/* 7 · Grape: confirmed; the appellation may suggest one (spec §B.8) */}
        <Field>
          <FieldHead label="Grape" chip={grapeChip.chip} />
          <div ref={registerTrigger("primaryGrape")} className={PICKER}>
            <ReferenceCombobox
              formFieldName="primary_grape_id"
              options={grapes}
              value={primaryGrape?.kind === "existing" ? primaryGrape.id : ""}
              selectedLabel={primaryGrape && primaryGrape.name.trim() ? primaryGrape.name : null}
              onValueChange={pickPrimaryGrape}
              onOptionCreated={grapeCreated}
              placeholder="Primary grape"
              createLabel="grape"
              onCreate={createGrape}
              disabled={disabled}
            />
          </div>
          {primaryGrape?.kind === "pending" && primaryGrape.name.trim() ? (
            <FieldNote>{PENDING_GRAPE_HINT}</FieldNote>
          ) : null}
          {showSuggestedChip && suggestion !== null ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPrimaryGrape(suggestion.grape, "appellation-suggestion")}
              className="flex min-h-11 w-fit items-center gap-[9px] rounded-[10px] border-[1.5px] border-gold bg-card px-[13px] text-[14px] transition-colors hover:bg-gold/15 disabled:opacity-60"
            >
              <span>{suggestion.grape.name}</span>
              <span className="text-[11px] font-semibold text-gold-dark">suggested</span>
            </button>
          ) : null}
          {suggestion !== null && appellationName !== null ? (
            <FieldNote>
              {grapeSuggestionNote({
                grape: suggestion.grape.name,
                appellation: placeName(appellationName),
                source: suggestion.source,
              })}
            </FieldNote>
          ) : null}
        </Field>

        {/* 8 · More detail (collapsed) */}
        <div className="rounded-[11px] border border-border bg-card">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMore({ key: sessionId, open: !moreOpen })}
            className="flex min-h-11 w-full items-center gap-[10px] p-[12px_13px] text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="text-[13px] font-semibold">More detail</span>
              <span className="text-[11px] text-muted-foreground">{MORE_DETAIL_SUBLINE}</span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                moreOpen && "rotate-180",
              )}
            />
          </button>
          {moreOpen ? (
            <div className="flex flex-col gap-[12px] border-t border-border-light p-[12px_13px_14px]">
              <Field>
                <FieldHead label="Grapes and blend" chip={null} />
                <GrapeBlendEditor
                  grapes={grapes}
                  onGrapeCreated={grapeCreated}
                  value={editorRows}
                  onChange={changeBlend}
                />
                {scoredLine ? <FieldNote>{scoredLine}</FieldNote> : null}
              </Field>
              <Field>
                <FieldHead label="Type designation" chip={null} />
                <div className={PICKER}>
                  <TypeDesignationField
                    formFieldName="type_designation_id"
                    options={typeDesignations}
                    value={draft.typeDesignationId ?? ""}
                    onValueChange={(id) =>
                      change(
                        patchDraft(
                          draftRef.current,
                          { typeDesignationId: id || null },
                          { typeDesignation: id ? "manual" : null },
                        ),
                      )
                    }
                    onCreate={async (name) => {
                      const row = await createTypeDesignation(name);
                      return { ...row, category: null, country_id: null };
                    }}
                    onOptionCreated={(o) =>
                      setCreated((c) => ({ ...c, typeDesignations: [...c.typeDesignations, o] }))
                    }
                  />
                </div>
              </Field>
              <Field>
                <FieldHead label="Alcohol %" chip={null} htmlFor="byhand-alcohol" />
                <Input
                  id="byhand-alcohol"
                  inputMode="decimal"
                  value={alcoholShown}
                  onChange={(e) => typeAlcohol(e.target.value)}
                  placeholder="e.g. 13.5"
                  disabled={disabled}
                  className={cn(INPUT, "max-w-[140px] lining-nums tabular-nums")}
                />
              </Field>
              <Field>
                <FieldHead label="Description" chip={null} htmlFor="byhand-description" />
                <Textarea
                  id="byhand-description"
                  rows={3}
                  value={draft.description ?? ""}
                  onChange={(e) =>
                    change(
                      patchDraft(draftRef.current, { description: e.target.value }, { description: "manual" }),
                    )
                  }
                  placeholder="Background on the wine — style, vineyard, story…"
                  disabled={disabled}
                  className="rounded-[10px] border-border bg-card px-[13px] py-[10px] text-base md:text-[15px]"
                />
              </Field>
              <Field>
                <FieldHead label="Label photo" chip={null} />
                <ImageUploader
                  key={sessionId}
                  name="image_url"
                  bucket="wine-images"
                  folder={imageFolder}
                  initialUrl={draft.imageUrl}
                  aspectClassName="aspect-[3/4] max-w-40"
                  removable
                  onPendingChange={setUploading}
                  onChange={(url) =>
                    change(patchDraft(draftRef.current, { imageUrl: url }, { imageUrl: url ? "manual" : null }))
                  }
                />
              </Field>
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer: sticks to the bottom of the sheet's scroller, so the action stays in reach. */}
      <footer className="sticky bottom-0 mt-auto shrink-0 border-t border-border bg-background">
        <div className="flex w-full flex-col gap-[8px] px-4 pt-[11px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4 md:mx-auto md:max-w-[600px] md:px-[22px]">
          <p className="text-center text-[11.5px] text-muted-foreground">
            {unidentified ? UNIDENTIFIED_FOOTER_NOTE : matrix.byHand.footerNote}
          </p>
          {refusal ? (
            <p role="alert" className="text-center text-[12.5px] font-semibold text-rose">
              {refusal}
            </p>
          ) : null}
          {error && error !== refusal ? (
            <p role="alert" className="text-center text-[12.5px] text-rose">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={onSave}
            className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
          >
            {busy ? <WineGlassLoader /> : null}
            {matrix.byHand.primary(finishing !== null)}
          </button>
          {onLeaveForLater ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onLeaveForLater}
              className="min-h-11 rounded-[9px] text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {LEAVE_FOR_LATER}
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

// --- small local pieces ---------------------------------------------------

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-[6px]">{children}</div>;
}

function FieldHead({ label, chip, htmlFor }: { label: string; chip: string | null; htmlFor?: string }) {
  const text = (
    <>
      <span className="text-[12px] font-semibold">{label}</span>
      {chip ? (
        <span
          className={cn(
            "text-[11px]",
            chip.startsWith("did not read") ? "font-semibold text-rose" : "text-muted-foreground",
          )}
        >
          {chip}
        </span>
      ) : null}
    </>
  );
  // A real <label> only for a plain input; wrapping a combobox trigger in one
  // would forward the label tap to the button.
  return htmlFor ? (
    <label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-x-[7px]">
      {text}
    </label>
  ) : (
    <div className="flex flex-wrap items-baseline gap-x-[7px]">{text}</div>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-[1.45] text-muted-foreground">{children}</p>;
}

// The handoff's segmented control: a muted track with a bordeaux thumb; every
// segment is a 44px tap target. `grid` wraps four segments two by two on a
// phone, where a half-width column cannot fit them in one row.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  grid,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
  grid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "gap-[4px] rounded-[10px] bg-muted p-[3px]",
        grid ? "grid grid-cols-2 sm:flex" : "flex",
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 min-w-0 flex-1 rounded-[8px] px-1 text-[12px] transition-colors disabled:cursor-not-allowed",
              active
                ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-60",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
