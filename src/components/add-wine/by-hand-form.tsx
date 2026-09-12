"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { ReferenceCombobox, type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  TypeDesignationField,
  type TypeDesignationOption,
} from "@/components/type-designation-field";
import { createClient } from "@/lib/supabase/client";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import { deaccent } from "@/lib/deaccent";
import { cn } from "@/lib/utils";
import { createGrape } from "@/app/catalog/new/actions";
import {
  createAppellation,
  createCountry,
  createRegion,
  createTypeDesignation,
} from "@/app/tastings/[id]/wines/new/actions";
import { inferFromProducer, type ProducerInference } from "./actions";
import { producerSummary } from "./by-hand-actions";
import {
  actionLabel,
  applyInference,
  buildIdentity,
  missingFields,
  ORIGIN_FIELDS,
  pickProducerSuggestion,
  producerRowLabel,
  stateFromPrefill,
  type ByHandState,
  type Colour,
  type ColourGroup,
  type ProducerSummary,
  type Style,
  type VintageKind,
} from "./by-hand-logic";
import type { ByHandFormProps } from "./types";

const VINTAGE_KIND_OPTIONS: { value: VintageKind; label: string }[] = [
  { value: "YEAR", label: "Year" },
  { value: "NV", label: "NV" },
  { value: "TAWNY", label: "Tawny" },
];
const COLOUR_GROUP_OPTIONS: { value: ColourGroup; label: string }[] = [
  { value: "RED", label: "Red" },
  { value: "WHITE", label: "White" },
  { value: "OTHER", label: "Other" },
];
const OTHER_COLOUR_OPTIONS: { value: Colour; label: string }[] = [
  { value: "ROSE", label: "Rosé" },
  { value: "ORANGE", label: "Orange" },
];
const TAWNY_YEARS_ITEMS = {
  "10": "10 years",
  "20": "20 years",
  "30": "30 years",
  "40": "40+ years",
};
const STYLE_ITEMS: Record<Style, string> = {
  STILL: "Still",
  SPARKLING: "Sparkling",
  SWEET: "Sweet",
  FORTIFIED: "Fortified",
};

// The handoff's field box: 46px tall, 10px radius, white on parchment. The
// comboboxes render `<input hidden/><button/>`, so their trigger is restyled
// through the wrapper (`[&>button]`) rather than a fork of the shared control.
const INPUT = "h-12 rounded-[10px] border-border bg-card px-[13px] text-base md:text-[15px]";
const PICKER =
  "[&>button]:h-12 [&>button]:rounded-[10px] [&>button]:border-border [&>button]:bg-card [&>button]:px-[13px] [&>button]:text-[15px]";
const CHIP = "rounded-full border border-border bg-card px-[10px] py-[4px] text-[11.5px]";
const CHIP_MISSING =
  "rounded-full border border-dashed border-border-strong px-[10px] py-[4px] text-[11.5px] text-muted-foreground";
// A compact link-button whose tap area still reaches 44px on phones.
const TAP_PAD = "relative before:absolute before:inset-x-0 before:-inset-y-3 before:content-['']";

type RefData = {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
};

type Suggestion = {
  key: string;
  row: { id: string; name: string; summary: ProducerSummary; chosen: boolean } | null;
};

const fold = (s: string) => deaccent(s).toLowerCase().trim();

/**
 * By hand (7g): four required fields — producer, wine name, vintage, colour
 * — then the origin card the producer implies, then everything else folded
 * under "More detail". Every value is React state (the sheet can be open on
 * a polling page); the add itself goes through `onAdd` so the shell applies
 * the destination rules. A scan prefill seeds every field; pending grape
 * names are created on submit and a pending producer is left for the
 * server to create.
 */
export function ByHandForm({ ctx, prefill, onAdd, busy }: ByHandFormProps) {
  const [state, setState] = useState<ByHandState>(() => stateFromPrefill(prefill));
  const patch = (p: Partial<ByHandState>) => setState((s) => ({ ...s, ...p }));

  // Reference lists, fetched once with the browser client (small tables —
  // never appellations/producers, which search server-side).
  const [ref, setRef] = useState<RefData | null>(null);
  const [refFailed, setRefFailed] = useState(false);
  const [refAttempt, setRefAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    Promise.all([
      supabase.from("countries").select("id, name").order("name"),
      supabase.from("regions").select("id, name, country_id").order("name"),
      supabase.from("grapes").select("id, name").order("name"),
      supabase
        .from("type_designations")
        .select("id, name, category, country_id")
        .eq("is_active", true)
        .order("sort_order"),
    ])
      .then(([c, r, g, t]) => {
        if (cancelled) return;
        if (c.error || r.error || g.error || t.error) {
          setRefFailed(true);
          return;
        }
        setRefFailed(false);
        setRef({
          countries: c.data ?? [],
          regions: (r.data ?? []) as (ReferenceOption & { country_id: string })[],
          grapes: g.data ?? [],
          typeDesignations: (t.data ?? []) as TypeDesignationOption[],
        });
      })
      .catch(() => {
        if (!cancelled) setRefFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refAttempt]);

  // The chosen region's appellations (seeded from the prefill's list so a
  // scanned appellation shows its name before the first fetch lands).
  const [appellations, setAppellations] = useState<ReferenceOption[]>(() =>
    prefill && prefill.regionId ? prefill.appellations : [],
  );
  const [appellationsPending, startAppellations] = useTransition();
  useEffect(() => {
    startAppellations(async () => {
      setAppellations(state.regionId ? await listAppellationsForRegions([state.regionId]) : []);
    });
  }, [state.regionId]);

  // Inference: what the producer alone says about the origin. Keyed by the
  // producer it answered for, so a stale answer is never shown or applied.
  const [inference, setInference] = useState<{
    producerId: string;
    result: ProducerInference | null;
  } | null>(null);
  useEffect(() => {
    const producerId = state.producerId;
    if (!producerId) return;
    let cancelled = false;
    inferFromProducer(producerId)
      .then((result) => {
        if (cancelled) return;
        setInference({ producerId, result });
        setState((s) => (s.producerId === producerId ? applyInference(s, result) : s));
      })
      .catch(() => {
        if (!cancelled) setInference({ producerId, result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [state.producerId]);

  // The gold suggestion row: for a pending name, the existing producer it
  // most likely is (so nobody forks the reference data); for a chosen
  // producer, its place and catalog depth as confirmation.
  const suggestionKey = state.producerId
    ? `id:${state.producerId}`
    : state.producerName.trim()
      ? `name:${fold(state.producerName)}`
      : "";
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  useEffect(() => {
    if (!suggestionKey) return;
    let cancelled = false;
    const key = suggestionKey;
    const run = async (): Promise<Suggestion["row"]> => {
      if (state.producerId) {
        const summary = await producerSummary(state.producerId);
        return summary
          ? { id: state.producerId, name: summary.name, summary, chosen: true }
          : null;
      }
      const hits = await searchProducers(state.producerName, state.regionId || undefined);
      const pick = pickProducerSuggestion(state.producerName, hits);
      if (!pick) return null;
      const summary = await producerSummary(pick.id);
      return summary ? { id: pick.id, name: pick.name, summary, chosen: false } : null;
    };
    run()
      .then((row) => {
        if (!cancelled) setSuggestion({ key, row });
      })
      .catch(() => {
        if (!cancelled) setSuggestion({ key, row: null });
      });
    return () => {
      cancelled = true;
    };
  }, [suggestionKey, state.producerId, state.producerName, state.regionId]);
  const suggestionRow = suggestion?.key === suggestionKey ? suggestion.row : null;

  const [originOpen, setOriginOpen] = useState<boolean | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const working = busy || submitting;

  // --- derived ---------------------------------------------------------------

  const regionsForCountry = useMemo(
    () => (ref ? ref.regions.filter((r) => r.country_id === state.countryId) : []),
    [ref, state.countryId],
  );
  const countryName =
    ref?.countries.find((c) => c.id === state.countryId)?.name ?? state.labels.country;
  const regionName =
    ref?.regions.find((r) => r.id === state.regionId)?.name ?? state.labels.region;
  const appellationName =
    appellations.find((a) => a.id === state.appellationId)?.name ?? state.labels.appellation;
  const grapeName = state.primaryGrapeId
    ? (ref?.grapes.find((g) => g.id === state.primaryGrapeId)?.name ?? state.labels.grape)
    : state.primaryGrapePending.trim() || null;

  const inferenceForProducer =
    inference && inference.producerId === state.producerId ? inference : null;
  const inferring = Boolean(state.producerId) && !inferenceForProducer;
  const inferenceFailed = Boolean(inferenceForProducer) && inferenceForProducer?.result === null;
  const originMissing = missingFields(state).filter((f) =>
    (ORIGIN_FIELDS as readonly string[]).includes(f),
  );
  // Auto-expand the pickers when the inference could not fill the origin
  // (or a prefill left gaps); an explicit Change / Done wins over that.
  const autoOpen =
    originMissing.length > 0 &&
    (Boolean(inferenceForProducer) || (!state.producerId && state.originSource !== "none"));
  const originExpanded = originOpen ?? autoOpen;

  const originTitle = inferring
    ? "Looking up the producer…"
    : state.originSource === "inferred"
      ? "Filled in from the producer"
      : state.originSource === "prefill"
        ? "Filled in from the label"
        : "Origin";
  const originCaveat =
    originMissing.length > 0 && inferenceFailed
      ? "We couldn't guess the origin — pick it here."
      : state.originSource === "inferred"
        ? "Guessed from the producer and the wine name. Check the appellation if it matters for scoring."
        : state.originSource === "prefill"
          ? "Read from the label. Check the appellation if it matters for scoring."
          : state.originSource === "none" && !state.producerId
            ? "Pick a producer and we'll fill this in."
            : null;

  const imageFolder =
    ctx.destination?.kind === "flight"
      ? ctx.destination.tastingId
      : `catalog/staging/${ctx.userId}`;

  // --- handlers ----------------------------------------------------------------

  async function searchProducersGrouped(query: string) {
    const found = await searchProducers(query, state.regionId || undefined);
    return found.map(({ id, name, in_region }) => ({
      id,
      name,
      group: state.regionId
        ? in_region
          ? `Specific to ${regionName ?? "the region"}`
          : "Other producers"
        : undefined,
    }));
  }

  function setColourGroup(group: ColourGroup) {
    if (group === "OTHER") {
      patch({
        colourGroup: "OTHER",
        colour: state.colour === "ROSE" || state.colour === "ORANGE" ? state.colour : null,
      });
    } else {
      patch({ colourGroup: group, colour: group });
    }
  }

  async function submit() {
    setError(null);
    const missing = missingFields(state);
    if (missing.length > 0) {
      setError(`Still missing: ${missing.join(", ")}.`);
      if (missing.some((f) => (ORIGIN_FIELDS as readonly string[]).includes(f))) {
        setOriginOpen(true);
      }
      return;
    }
    setSubmitting(true);
    try {
      // Pending (scanned-but-unmatched) grapes become real rows only now, on
      // submit — createGrape is find-or-create, so nothing is duplicated.
      let primaryGrapeId = state.primaryGrapeId;
      if (!primaryGrapeId) {
        primaryGrapeId = (await createGrape(state.primaryGrapePending.trim())).id;
        patch({ primaryGrapeId, primaryGrapePending: "" });
      }
      let secondaryGrapeId: string | null = state.secondaryGrapeId || null;
      if (!secondaryGrapeId && state.secondaryGrapePending.trim()) {
        secondaryGrapeId = (await createGrape(state.secondaryGrapePending.trim())).id;
        patch({ secondaryGrapeId, secondaryGrapePending: "" });
      }
      const identity = buildIdentity(state, { primaryGrapeId, secondaryGrapeId });
      if (!identity) {
        setError(`Still missing: ${missingFields(state).join(", ") || "a required field"}.`);
        return;
      }
      await onAdd({ kind: "identity", identity });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add the wine.");
    } finally {
      setSubmitting(false);
    }
  }

  // --- render ------------------------------------------------------------------

  return (
    <div className="flex min-h-full flex-col">
      {/* The sheet's header carries ← · "Add wine · glass N" · "By hand" and
          the "Scan instead" pill (7g) — nothing is repeated here. */}
      <div className="flex w-full flex-col gap-[13px] p-[14px_16px] md:mx-auto md:max-w-[600px] md:p-[18px_22px]">
        {/* 1 · Producer */}
        <Field label="Producer" required>
          <div className={PICKER}>
            <SearchableCombobox
              formFieldName="producer_id"
              value={state.producerId}
              selectedLabel={state.producerName || null}
              onValueChange={(id, label) => patch({ producerId: id, producerName: label })}
              search={searchProducersGrouped}
              placeholder="Search for the producer"
              createLabel="producer"
              // Pending: the name is kept and created on save, never at pick time.
              onCreate={async (name) => ({ id: "", name })}
              emptyQueryHint={state.regionId ? "Type to search all producers" : undefined}
              disabled={working}
            />
          </div>
          {suggestionRow ? (
            <div className="flex items-center gap-[9px] rounded-[9px] border border-gold bg-background p-[9px_11px]">
              <span className="min-w-0 flex-1 text-[12.5px]">
                <strong className="font-semibold">{suggestionRow.name}</strong>
                {" · "}
                {producerRowLabel("", suggestionRow.summary)}
              </span>
              {suggestionRow.chosen ? (
                <Check className="size-4 shrink-0 text-gold-dark" aria-label="Chosen" />
              ) : (
                <button
                  type="button"
                  disabled={working}
                  onClick={() =>
                    patch({ producerId: suggestionRow.id, producerName: suggestionRow.name })
                  }
                  className={cn(
                    "shrink-0 text-[12px] font-semibold text-primary hover:text-[#4A1523]",
                    TAP_PAD,
                  )}
                >
                  Use
                </button>
              )}
            </div>
          ) : !state.producerId && state.producerName.trim() ? (
            <p className="text-[11px] leading-[1.45] text-muted-foreground">
              New producer — we&apos;ll add it when you save, or search above to pick an
              existing one.
            </p>
          ) : null}
        </Field>

        {/* 2 · Wine name */}
        <Field label="Wine name" required htmlFor="byhand-wine-name">
          <Input
            id="byhand-wine-name"
            value={state.wineName}
            onChange={(e) => patch({ wineName: e.target.value })}
            placeholder="e.g. Barbaresco Serraboella"
            disabled={working}
            className={INPUT}
          />
        </Field>

        {/* 3 · Vintage  4 · Colour */}
        <div className="grid grid-cols-2 gap-[10px]">
          <Field label="Vintage" required>
            <Segmented
              label="Vintage type"
              value={state.vintageKind}
              options={VINTAGE_KIND_OPTIONS}
              onChange={(v) => patch({ vintageKind: v })}
              disabled={working}
            />
            {state.vintageKind === "YEAR" ? (
              <Input
                aria-label="Vintage year"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={state.vintageYear}
                onChange={(e) => patch({ vintageYear: e.target.value.replace(/\D/g, "") })}
                placeholder="e.g. 2017"
                disabled={working}
                className={cn(INPUT, "lining-nums tabular-nums")}
              />
            ) : state.vintageKind === "TAWNY" ? (
              <Select
                items={TAWNY_YEARS_ITEMS}
                value={state.tawnyYears}
                onValueChange={(v) => patch({ tawnyYears: v ?? "" })}
                disabled={working}
              >
                <SelectTrigger
                  aria-label="Tawny age statement"
                  className="w-full rounded-[10px] border-border bg-card px-[13px] text-base data-[size=default]:h-12 md:text-[15px]"
                >
                  <SelectValue placeholder="Age statement" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TAWNY_YEARS_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-12 items-center px-[2px] text-[12px] text-muted-foreground">
                Non-vintage — no year on the label.
              </p>
            )}
          </Field>
          <Field label="Colour" required>
            <Segmented
              label="Colour"
              value={state.colourGroup}
              options={COLOUR_GROUP_OPTIONS}
              onChange={setColourGroup}
              disabled={working}
            />
            {state.colourGroup === "OTHER" ? (
              <Segmented
                label="Other colour"
                value={state.colour === "ROSE" || state.colour === "ORANGE" ? state.colour : null}
                options={OTHER_COLOUR_OPTIONS}
                onChange={(v) => patch({ colour: v })}
                disabled={working}
              />
            ) : null}
          </Field>
        </div>

        {/* The origin card: chips + Change ▾ → the full pickers. */}
        <div className="flex flex-col gap-[6px] rounded-[11px] border border-gold bg-background p-[12px_13px]">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-semibold">{originTitle}</span>
            <button
              type="button"
              aria-expanded={originExpanded}
              onClick={() => setOriginOpen(!originExpanded)}
              className={cn(
                "ml-auto flex items-center gap-[3px] text-[11.5px] font-semibold text-primary hover:text-[#4A1523]",
                TAP_PAD,
              )}
            >
              {originExpanded ? "Done" : "Change"}
              <ChevronDown
                className={cn("size-3.5 transition-transform", originExpanded && "rotate-180")}
              />
            </button>
          </div>
          <div className="flex flex-wrap gap-[6px]">
            <OriginChip label="Country" value={countryName} />
            <OriginChip label="Region" value={regionName} />
            <OriginChip label="Appellation" value={appellationName} />
            <OriginChip label="Grape" value={grapeName} />
          </div>
          {originCaveat ? (
            <span className="text-[11px] leading-[1.45] text-muted-foreground">{originCaveat}</span>
          ) : null}

          {originExpanded ? (
            <div className="mt-[6px] flex flex-col gap-[10px] border-t border-border-light pt-[10px]">
              {refFailed ? (
                <p className="text-[12px] text-rose">
                  Couldn&apos;t load the lists.{" "}
                  <button
                    type="button"
                    onClick={() => setRefAttempt((n) => n + 1)}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Try again
                  </button>
                </p>
              ) : !ref ? (
                <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <WineGlassLoader size={16} /> Loading the lists…
                </p>
              ) : (
                <>
                  <Field label="Country">
                    <div className={PICKER}>
                      <ReferenceCombobox
                        formFieldName="country_id"
                        options={ref.countries}
                        value={state.countryId}
                        onValueChange={(id) =>
                          patch({
                            countryId: id,
                            regionId: "",
                            appellationId: "",
                            originSource: "manual",
                            labels: { ...state.labels, region: null, appellation: null },
                          })
                        }
                        onOptionCreated={(o) =>
                          setRef((r) => (r ? { ...r, countries: [...r.countries, o] } : r))
                        }
                        placeholder="Select a country"
                        createLabel="country"
                        onCreate={createCountry}
                        disabled={working}
                      />
                    </div>
                  </Field>
                  <Field label="Region">
                    <div className={PICKER}>
                      <ReferenceCombobox
                        formFieldName="region_id"
                        options={regionsForCountry}
                        value={state.regionId}
                        onValueChange={(id) =>
                          patch({
                            regionId: id,
                            appellationId: "",
                            originSource: "manual",
                            labels: { ...state.labels, appellation: null },
                          })
                        }
                        onOptionCreated={(o) =>
                          setRef((r) =>
                            r
                              ? { ...r, regions: [...r.regions, { ...o, country_id: state.countryId }] }
                              : r,
                          )
                        }
                        placeholder={state.countryId ? "Select a region" : "Choose a country first"}
                        createLabel="region"
                        onCreate={
                          state.countryId ? (name) => createRegion(state.countryId, name) : undefined
                        }
                        disabled={working || !state.countryId}
                      />
                    </div>
                  </Field>
                  <Field label="Appellation">
                    <div className={PICKER}>
                      <ReferenceCombobox
                        formFieldName="appellation_id"
                        options={appellations}
                        value={state.appellationId}
                        selectedLabel={state.labels.appellation}
                        onValueChange={(id) => patch({ appellationId: id, originSource: "manual" })}
                        onOptionCreated={(o) => setAppellations((a) => [...a, o])}
                        placeholder={
                          !state.regionId
                            ? "Choose a region first"
                            : appellationsPending
                              ? "Loading appellations…"
                              : "Pick one — or just the region"
                        }
                        createLabel="appellation"
                        onCreate={
                          state.regionId
                            ? (name) => createAppellation(state.regionId, name)
                            : undefined
                        }
                        disabled={working || !state.regionId || appellationsPending}
                      />
                    </div>
                  </Field>
                  <Field label="Grape">
                    <div className={PICKER}>
                      <ReferenceCombobox
                        formFieldName="primary_grape_id"
                        options={ref.grapes}
                        value={state.primaryGrapeId}
                        selectedLabel={state.primaryGrapePending || null}
                        onValueChange={(id) =>
                          patch({
                            primaryGrapeId: id,
                            primaryGrapePending: "",
                            originSource: state.originSource === "none" ? "manual" : state.originSource,
                          })
                        }
                        onOptionCreated={(o) =>
                          setRef((r) => (r ? { ...r, grapes: [...r.grapes, o] } : r))
                        }
                        placeholder="Primary grape"
                        createLabel="grape"
                        onCreate={createGrape}
                        disabled={working}
                      />
                    </div>
                    {state.primaryGrapePending && !state.primaryGrapeId ? (
                      <p className="text-[11px] leading-[1.45] text-muted-foreground">
                        New grape — we&apos;ll add it when you save, or pick an existing one above.
                      </p>
                    ) : null}
                  </Field>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* More detail (collapsed) */}
        <div className="rounded-[11px] border border-border bg-card">
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
            className="flex w-full items-center gap-[10px] p-[12px_13px] text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="text-[13px] font-semibold">More detail</span>
              <span className="text-[11px] text-muted-foreground">
                Secondary grape, type designation, style, alcohol, a label photo
              </span>
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
              <Eyebrow size="md">Optional</Eyebrow>
              <Field label="Secondary grape">
                <div className={PICKER}>
                  <ReferenceCombobox
                    formFieldName="secondary_grape_id"
                    options={ref?.grapes ?? []}
                    value={state.secondaryGrapeId}
                    selectedLabel={state.secondaryGrapePending || null}
                    onValueChange={(id) => patch({ secondaryGrapeId: id, secondaryGrapePending: "" })}
                    onOptionCreated={(o) =>
                      setRef((r) => (r ? { ...r, grapes: [...r.grapes, o] } : r))
                    }
                    placeholder={ref ? "None" : "Loading grapes…"}
                    createLabel="grape"
                    onCreate={createGrape}
                    disabled={working || !ref}
                    allowClear
                  />
                </div>
              </Field>
              <Field label="Type designation">
                <div className={PICKER}>
                  <TypeDesignationField
                    formFieldName="type_designation_id"
                    options={ref?.typeDesignations ?? []}
                    value={state.typeDesignationId}
                    onValueChange={(id) => patch({ typeDesignationId: id })}
                    onCreate={async (name) => {
                      const created = await createTypeDesignation(name);
                      return { ...created, category: null, country_id: null };
                    }}
                    onOptionCreated={(o) =>
                      setRef((r) =>
                        r ? { ...r, typeDesignations: [...r.typeDesignations, o] } : r,
                      )
                    }
                  />
                </div>
              </Field>
              <Field label="Style">
                <Select
                  items={STYLE_ITEMS}
                  value={state.style}
                  onValueChange={(v) => patch({ style: (v ?? "STILL") as Style })}
                  disabled={working}
                >
                  <SelectTrigger
                    aria-label="Style"
                    className="w-full rounded-[10px] border-border bg-card px-[13px] text-base data-[size=default]:h-12 md:text-[15px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STYLE_ITEMS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Alcohol %" htmlFor="byhand-alcohol">
                <Input
                  id="byhand-alcohol"
                  inputMode="decimal"
                  value={state.alcohol}
                  onChange={(e) => patch({ alcohol: e.target.value })}
                  placeholder="e.g. 13.5"
                  disabled={working}
                  className={cn(INPUT, "max-w-[140px] lining-nums tabular-nums")}
                />
              </Field>
              <Field label="Description" htmlFor="byhand-description">
                <Textarea
                  id="byhand-description"
                  rows={3}
                  value={state.description}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="Background on the wine — style, vineyard, story…"
                  disabled={working}
                  className="rounded-[10px] border-border bg-card px-[13px] py-[10px] text-base md:text-[15px]"
                />
              </Field>
              <Field label="Label photo">
                {ctx.destination?.kind === "flight" ? (
                  <p className="text-[11px] leading-[1.45] text-muted-foreground">
                    Revealed alongside the rest of the answer — not shown until then.
                  </p>
                ) : null}
                <ImageUploader
                  name="image_url"
                  bucket="wine-images"
                  folder={imageFolder}
                  initialUrl={state.imageUrl}
                  aspectClassName="aspect-[3/4] max-w-40"
                  onChange={(url) => patch({ imageUrl: url })}
                />
              </Field>
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-[12.5px] text-rose">
            {error}
          </p>
        ) : null}
      </div>

      {/* Footer: sticks to the bottom of the sheet's scroller so the action
          stays in reach while the form scrolls. */}
      <footer className="sticky bottom-0 mt-auto shrink-0 border-t border-border bg-background">
        <div className="flex w-full flex-col gap-[8px] p-[11px_16px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pb-4 md:mx-auto md:max-w-[600px] md:px-[22px]">
          <button
            type="button"
            disabled={working}
            onClick={() => void submit()}
            className={actionButtonClass("primary", "text-[16.5px] disabled:opacity-60")}
          >
            {working ? <WineGlassLoader /> : null}
            {actionLabel(ctx.destination)}
          </button>
          <p className="text-center text-[11.5px] text-muted-foreground">
            Also saved to the catalog, so nobody has to type it again.
          </p>
        </div>
      </footer>
    </div>
  );
}

// --- small local pieces ---------------------------------------------------

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const text = (
    <>
      <span className="text-[12px] font-semibold">{label}</span>
      {required ? <span className="text-[11px] text-muted-foreground">required</span> : null}
    </>
  );
  return (
    <div className="flex flex-col gap-[6px]">
      {/* A real <label> only for a plain input; wrapping a combobox trigger
          in one would forward the label tap to the button. */}
      {htmlFor ? (
        <label htmlFor={htmlFor} className="flex items-baseline gap-[7px]">
          {text}
        </label>
      ) : (
        <div className="flex items-baseline gap-[7px]">{text}</div>
      )}
      {children}
    </div>
  );
}

// The handoff's segmented control: a muted track with a bordeaux thumb;
// every segment is a 44px tap target.
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-[4px] rounded-[10px] bg-muted p-[3px]"
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
              "min-h-11 min-w-0 flex-1 rounded-[8px] px-1 text-[12px] transition-colors disabled:opacity-60",
              active
                ? "bg-primary font-semibold text-primary-foreground"
                : "font-medium text-muted-foreground hover:bg-white hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function OriginChip({ label, value }: { label: string; value: string | null }) {
  return value ? (
    <span className={CHIP}>{value}</span>
  ) : (
    <span className={CHIP_MISSING}>{label}?</span>
  );
}
