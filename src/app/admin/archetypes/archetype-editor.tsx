"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import type { AromaTerm, WineColour, WineStyle } from "@/lib/wset/types";
import { LABELS, HUES_BY_COLOUR } from "@/lib/wset/vocab";
import { listAppellationsForRegions } from "@/lib/reference-search";
import { EditableRange } from "@/components/wset/range-input";
import { AromaPicker } from "@/components/wset/aroma-picker";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { cn } from "@/lib/utils";
import { searchPlaces, updateArchetype, type PlaceHit } from "./actions";
import {
  appellationOptions,
  filterAppellationOptions,
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

const COLOURS: WineColour[] = ["WHITE", "ORANGE", "ROSE", "RED"];
const STYLES: WineStyle[] = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"];
const FIELD = "rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground";
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

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
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
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
  // A region's appellation list, read once per region while the editor is open.
  const appellationLists = useRef(new Map<string, AppellationOption[]>());
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
    let options = appellationLists.current.get(regionId);
    if (!options) {
      options = appellationOptions(regionName, await listAppellationsForRegions([regionId]));
      appellationLists.current.set(regionId, options);
    }
    return filterAppellationOptions(options, query);
  }

  function runPlaceSearch(value: string) {
    setPlaceQuery(value);
    if (placeTimer.current) clearTimeout(placeTimer.current);
    if (value.trim().length < 2) {
      setPlaceHits([]);
      return;
    }
    placeTimer.current = setTimeout(() => {
      searchPlaces(value).then(setPlaceHits);
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
              {COLOURS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value as WineStyle)} className={FIELD}>
              {STYLES.map((s) => (
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
            <span>Country</span>
            <ReferenceCombobox
              formFieldName="country_id"
              options={references.countries}
              value={countryId}
              onValueChange={changeCountry}
              placeholder="Pick a country"
            />
          </div>
          <div className={LABEL}>
            <span>Region</span>
            <ReferenceCombobox
              formFieldName="region_id"
              options={regionOptions}
              value={regionId}
              onValueChange={changeRegion}
              placeholder={countryId ? "Pick a region" : "Pick a country first"}
              disabled={!countryId}
            />
          </div>
          <div className={LABEL}>
            <span>Appellation</span>
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
              disabled={!regionId}
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
                    className="text-muted-foreground hover:text-foreground"
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
          <span>Map place (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            {place ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs text-foreground">
                {place.name || place.id}
                <button
                  type="button"
                  aria-label="Remove the map place"
                  onClick={() => setPlace(null)}
                  className="text-muted-foreground hover:text-foreground"
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
                className={cn(FIELD, "w-48")}
              />
              {placeHits.length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
                  {placeHits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setPlace({ id: h.id, name: h.name });
                        setPlaceQuery("");
                        setPlaceHits([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted"
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
                  className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
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
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : status === "saved" ? "Saved ✓" : "Save profile"}
        </button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </div>
  );
}
