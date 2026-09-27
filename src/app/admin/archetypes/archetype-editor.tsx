"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { LABELS, HUES_BY_COLOUR } from "@/lib/wset/vocab";
import { listAppellationsForRegions, type SearchOption } from "@/lib/reference-search";
import { createKeyedCache } from "@/lib/wine-map/keyed-cache";
import { EditableRange } from "@/components/wset/range-input";
import { AromaPicker } from "@/components/wset/aroma-picker";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { cn } from "@/lib/utils";
import { searchPlaces, updateArchetype, type PlaceHit } from "./actions";
import {
  PROFILE_COLOURS,
  PROFILE_STYLES,
  appellationListCacheable,
  appellationOptions,
  filterAppellationOptions,
  satForStyle,
  scalesFor,
  toggleSignature,
  validateProfile,
  withTermIds,
  type AppellationOption,
  type ArchetypeProfile,
  type ArchetypeProfileInput,
  type AromaLink,
  type EditorReferences,
} from "./profile-rules";

// 44 px tap targets on touch, the control's own size on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";
// 16 px text below md, so iOS does not zoom into a focused field.
const FIELD = `${TAP} rounded-md border border-border bg-background px-2 py-1 text-base text-foreground md:text-sm`;
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";
const TAP_ICON =
  "inline-flex min-h-11 min-w-11 items-center justify-center md:pointer-fine:min-h-0 md:pointer-fine:min-w-0";

function numberOrNull(s: string): number | null {
  return s.trim() === "" ? null : Number(s);
}

// Each picked aroma as a chip; a starred one is a signature (training-room D5:
// picking that exact term earns a bonus). Module-level so React keeps one
// component identity across renders.
function SignatureToggles({
  links,
  termById,
  onToggle,
}: {
  links: AromaLink[];
  termById: Map<string, string>;
  onToggle: (termId: string) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">Signature terms — an exact hit earns a bonus</span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <button
            key={l.termId}
            type="button"
            aria-pressed={l.signature}
            onClick={() => onToggle(l.termId)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1 rounded-full border px-2 py-0.5 text-xs md:pointer-fine:min-h-0",
              l.signature ? "border-gold bg-gold/15 text-foreground" : "border-border/70 text-muted-foreground",
            )}
          >
            <Star className={cn("size-3", l.signature && "fill-current")} />
            {termById.get(l.termId) ?? l.termId}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ArchetypeEditor({
  archetype,
  terms,
  references,
}: {
  archetype: ArchetypeProfile;
  terms: AromaTerm[];
  references: EditorReferences;
}) {
  const router = useRouter();
  const [name, setName] = useState(archetype.name);
  const [colour, setColour] = useState<WineColour>(archetype.colour);
  const [style, setStyle] = useState<WineStyle>(archetype.style);
  const [description, setDescription] = useState(archetype.description ?? "");
  const [qLow, setQLow] = useState(archetype.qualityLow?.toString() ?? "");
  const [qHigh, setQHigh] = useState(archetype.qualityHigh?.toString() ?? "");
  const [sat, setSat] = useState<Record<string, [string, string]>>(archetype.sat ?? {});
  const [nose, setNose] = useState<AromaLink[]>(archetype.nose);
  const [palate, setPalate] = useState<AromaLink[]>(archetype.palate);
  const [countryId, setCountryId] = useState(archetype.countryId);
  const [regionId, setRegionId] = useState(archetype.regionId);
  const [appellationId, setAppellationId] = useState(archetype.appellationId);
  const [appellationLabel, setAppellationLabel] = useState<string | null>(archetype.appellationName);
  const [designationIds, setDesignationIds] = useState<string[]>(archetype.designationIds);
  const [ageLow, setAgeLow] = useState(archetype.typicalAgeLow?.toString() ?? "");
  const [ageHigh, setAgeHigh] = useState(archetype.typicalAgeHigh?.toString() ?? "");
  const [place, setPlace] = useState<{ id: string; name: string } | null>(
    archetype.winePlaceId ? { id: archetype.winePlaceId, name: archetype.winePlaceName ?? "" } : null,
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeHits, setPlaceHits] = useState<PlaceHit[]>([]);
  const placeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by every keystroke and pick: only the newest search may land.
  const placeRequest = useRef(0);
  useEffect(
    () => () => {
      if (placeTimer.current) clearTimeout(placeTimer.current);
    },
    [],
  );
  // A region's appellation list, read once per region while the editor is
  // open. A failed or empty read is not kept (every region has at least its
  // self-named appellation), so the next search reads it again.
  const [appellationLists] = useState(() =>
    createKeyedCache<null, SearchOption[]>({
      capacity: 50,
      load: (_client, regionId) => listAppellationsForRegions([regionId]),
      cacheable: appellationListCacheable,
    }),
  );
  const countryLabelId = useId();
  const regionLabelId = useId();
  const appellationLabelId = useId();
  const placeLabelId = useId();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const scales = scalesFor(colour, style);
  const termById = new Map(terms.map((t) => [t.id, t.term]));
  const regionOptions = references.regions
    .filter((r) => r.countryId === countryId)
    .map((r) => ({ id: r.id, name: r.name }));
  const regionName = references.regions.find((r) => r.id === regionId)?.name ?? null;
  const designationName = new Map(references.typeDesignations.map((d) => [d.id, d.name]));
  const designationOptions: TypeDesignationOption[] = references.typeDesignations.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    country_id: null,
  }));

  const setRange = (key: string, r: [string, string]) => {
    setSat((s) => ({ ...s, [key]: r }));
    setStatus("idle");
  };
  const clearRange = (key: string) =>
    setSat((s) => {
      const next = { ...s };
      delete next[key];
      return next;
    });
  // A new style drops what it cannot hold (an alcohol range off its ladder,
  // mousse off sparkling), as a new colour drops a hue from another colour.
  const changeStyle = (st: WineStyle) => {
    setStyle(st);
    setSat((s) => satForStyle(s, colour, st));
    setStatus("idle");
  };
  const changeColour = (c: WineColour) => {
    setColour(c);
    setSat((s) => {
      const hue = s.colourHue;
      if (hue && !(HUES_BY_COLOUR[c] as string[]).includes(hue[0])) {
        const next = { ...s };
        delete next.colourHue;
        return next;
      }
      return s;
    });
  };

  // The answer-key cascade: a new country drops a region from elsewhere, a new
  // region drops the appellation.
  const changeCountry = (id: string) => {
    setCountryId(id);
    if (references.regions.find((r) => r.id === regionId)?.countryId !== id) {
      setRegionId("");
      setAppellationId("");
      setAppellationLabel(null);
    }
  };
  const changeRegion = (id: string) => {
    setRegionId(id);
    setAppellationId("");
    setAppellationLabel(null);
  };

  async function searchRegionAppellations(query: string): Promise<AppellationOption[]> {
    if (!regionId || !regionName) return [];
    try {
      const list = await appellationLists.load(null, regionId);
      return filterAppellationOptions(appellationOptions(regionName, list), query);
    } catch {
      return [];
    }
  }

  // Cancels the pending search and drops any reply still on its way.
  function stopPlaceSearch() {
    if (placeTimer.current) clearTimeout(placeTimer.current);
    placeTimer.current = null;
    placeRequest.current += 1;
  }

  function runPlaceSearch(value: string) {
    setPlaceQuery(value);
    stopPlaceSearch();
    if (value.trim().length < 2) {
      setPlaceHits([]);
      return;
    }
    const request = placeRequest.current;
    placeTimer.current = setTimeout(() => {
      placeTimer.current = null;
      searchPlaces(value)
        .then((hits) => {
          if (request === placeRequest.current) setPlaceHits(hits);
        })
        .catch(() => {
          // A failed search shows nothing; it never reopens a closed list.
          if (request === placeRequest.current) setPlaceHits([]);
        });
    }, 250);
  }

  function profileInput(): ArchetypeProfileInput {
    return {
      name: name.trim(),
      colour,
      style,
      description: description.trim() || null,
      qualityLow: numberOrNull(qLow),
      qualityHigh: numberOrNull(qHigh),
      sat,
      nose,
      palate,
      countryId,
      regionId,
      appellationId,
      primaryGrapeId: archetype.primaryGrapeId,
      secondaryGrapeId: archetype.secondaryGrapeId,
      designationIds,
      typicalAgeLow: numberOrNull(ageLow),
      typicalAgeHigh: numberOrNull(ageHigh),
      winePlaceId: place?.id ?? null,
    };
  }

  const save = () =>
    startTransition(async () => {
      const input = profileInput();
      const invalid = validateProfile(input);
      if (invalid) {
        setStatus("error");
        setError(invalid);
        return;
      }
      setError(null);
      const res = await updateArchetype(archetype.id, input);
      if ("error" in res) {
        setStatus("error");
        setError(res.error);
      } else {
        setStatus("saved");
        router.refresh();
      }
    });

  return (
    <div className="mt-3 flex flex-col gap-4 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={LABEL}>
            Colour
            <select value={colour} onChange={(e) => changeColour(e.target.value as WineColour)} className={FIELD}>
              {PROFILE_COLOURS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Style
            <select value={style} onChange={(e) => changeStyle(e.target.value as WineStyle)} className={FIELD}>
              {PROFILE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
        <p className="text-xs font-medium text-muted-foreground">Where it scores</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={LABEL}>
            <span id={countryLabelId}>Country</span>
            <ReferenceCombobox
              formFieldName="country_id"
              options={references.countries}
              value={countryId}
              onValueChange={changeCountry}
              placeholder="Pick a country"
              createLabel="countries"
              labelledBy={countryLabelId}
              triggerClassName={TAP}
            />
          </div>
          <div className={LABEL}>
            <span id={regionLabelId}>Region</span>
            <ReferenceCombobox
              formFieldName="region_id"
              options={regionOptions}
              value={regionId}
              onValueChange={changeRegion}
              placeholder={countryId ? "Pick a region" : "Pick a country first"}
              createLabel="regions"
              labelledBy={regionLabelId}
              disabled={!countryId}
              triggerClassName={TAP}
            />
          </div>
          <div className={LABEL}>
            <span id={appellationLabelId}>Appellation</span>
            <SearchableCombobox
              formFieldName="appellation_id"
              value={appellationId}
              selectedLabel={appellationLabel}
              onValueChange={(id, label) => {
                setAppellationId(id);
                setAppellationLabel(label);
              }}
              search={searchRegionAppellations}
              placeholder={regionId ? "Just the region, or pick one" : "Pick a region first"}
              createLabel="appellations"
              labelledBy={appellationLabelId}
              disabled={!regionId}
              triggerClassName={TAP}
            />
          </div>
        </div>

        <div className={LABEL}>
          <span>Designations the label would carry</span>
          {designationIds.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {designationIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground"
                >
                  {designationName.get(id) ?? id}
                  <button
                    type="button"
                    aria-label={`Remove ${designationName.get(id) ?? id}`}
                    onClick={() => setDesignationIds((ids) => ids.filter((x) => x !== id))}
                    className={cn(TAP_ICON, "text-muted-foreground hover:text-foreground")}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <TypeDesignationField
            formFieldName="designation_add"
            options={designationOptions}
            value=""
            onValueChange={(id) => {
              if (id) setDesignationIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
            }}
            placeholder="Add a designation"
            allowClear={false}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className={LABEL}>
            Typical age from (years)
            <input
              type="number"
              min={0}
              max={100}
              value={ageLow}
              onChange={(e) => setAgeLow(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
          <label className={LABEL}>
            to
            <input
              type="number"
              min={0}
              max={100}
              value={ageHigh}
              onChange={(e) => setAgeHigh(e.target.value)}
              className={cn(FIELD, "w-20")}
            />
          </label>
        </div>

        <div className={LABEL}>
          <span id={placeLabelId}>Map place (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {place ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground">
                {place.name || place.id}
                <button
                  type="button"
                  aria-label="Remove the map place"
                  onClick={() => setPlace(null)}
                  className={cn(TAP_ICON, "text-muted-foreground hover:text-foreground")}
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">None — not on the map</span>
            )}
            <div className="relative">
              <input
                value={placeQuery}
                onChange={(e) => runPlaceSearch(e.target.value)}
                placeholder="Search the map…"
                aria-labelledby={placeLabelId}
                className={cn(FIELD, "w-48")}
              />
              {placeHits.length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {placeHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        stopPlaceSearch();
                        setPlace({ id: h.id, name: h.name });
                        setPlaceQuery("");
                        setPlaceHits([]);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted",
                        TAP,
                      )}
                    >
                      <span className="truncate">{h.name}</span>
                      <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                        {h.kind}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <label className={LABEL}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={FIELD} />
      </label>

      <div className="flex items-end gap-3">
        <label className={LABEL}>
          Quality from
          <input
            type="number"
            min={50}
            max={100}
            value={qLow}
            onChange={(e) => setQLow(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
        <label className={LABEL}>
          to
          <input
            type="number"
            min={50}
            max={100}
            value={qHigh}
            onChange={(e) => setQHigh(e.target.value)}
            className={cn(FIELD, "w-20")}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium text-muted-foreground">Structured tasting ranges</p>
        {scales.map((sc) => (
          <div key={sc.key} className="rounded-md border border-border/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium">{sc.label}</span>
              {sat[sc.key] ? (
                <button
                  type="button"
                  onClick={() => clearRange(sc.key)}
                  className={cn(
                    "px-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground",
                    TAP,
                  )}
                >
                  clear
                </button>
              ) : (
                <span className="text-[10px] text-muted-foreground">not set — click to set</span>
              )}
            </div>
            <EditableRange
              stops={sc.ladder}
              labels={LABELS}
              value={sat[sc.key] ?? null}
              onChange={(r) => setRange(sc.key, r)}
            />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Nose — aroma characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={nose.map((l) => l.termId)}
          onChange={(ids) => setNose((links) => withTermIds(links, ids))}
          colour={colour}
        />
        <SignatureToggles
          links={nose}
          termById={termById}
          onToggle={(id) => setNose((links) => toggleSignature(links, id))}
        />
      </div>
      <div className="rounded-md border border-border/60 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Palate — flavour characteristics</p>
        <AromaPicker
          terms={terms}
          selectedIds={palate.map((l) => l.termId)}
          onChange={(ids) => setPalate((links) => withTermIds(links, ids))}
          colour={colour}
          copyFrom={{ label: "Copy from nose", ids: nose.map((l) => l.termId) }}
        />
        <SignatureToggles
          links={palate}
          termById={termById}
          onToggle={(id) => setPalate((links) => toggleSignature(links, id))}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className={cn(
            "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60",
            TAP,
          )}
        >
          {pending ? "Saving…" : status === "saved" ? "Saved ✓" : "Save profile"}
        </button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
