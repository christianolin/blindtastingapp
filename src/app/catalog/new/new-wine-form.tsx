"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReferenceCombobox, type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { PillGroup } from "@/components/wset/pill-group";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import {
  createAppellation,
  createCatalogWine,
  createCountry,
  createRegion,
  updateCatalogWine,
} from "./actions";
import { GrapeBlendEditor, type BlendRow } from "./grape-blend-editor";
import { ImageUploader } from "@/components/image-uploader";

const COLOURS = ["WHITE", "ORANGE", "ROSE", "RED"] as const;
const STYLES = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"] as const;
const COLOUR_LABELS = { WHITE: "White", ORANGE: "Orange", ROSE: "Rosé", RED: "Red" };
const STYLE_LABELS = { STILL: "Still", SPARKLING: "Sparkling", SWEET: "Sweet", FORTIFIED: "Fortified" };

// Pre-filled values for edit mode (every field the form owns). BlendRow, the
// producer label and the region's appellations are resolved by the caller so
// the comboboxes render their current selections immediately.
export type WineFormInitial = {
  countryId: string;
  regionId: string;
  appellationId: string;
  blend: BlendRow[];
  producerId: string;
  producerLabel: string | null;
  typeDesignationId: string;
  colour: (typeof COLOURS)[number] | null;
  style: (typeof STYLES)[number] | null;
  wineName: string;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  vintageYear: string;
  tawnyYears: string;
  imageUrl: string | null;
  appellations: ReferenceOption[];
};

export function NewWineForm({
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations,
  userId,
  onCreated,
  wineId,
  initialWine,
  onSaved,
}: {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  userId: string;
  // When set (e.g. rendered inside the Add-wine popup), called with the new
  // wine's id instead of navigating — the modal decides what happens next.
  onCreated?: (id: string) => void;
  // Edit mode: the wine id to update + its current values. When absent the form
  // creates. onSaved fires after an edit (like onCreated after a create).
  wineId?: string;
  initialWine?: WineFormInitial;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [countries, setCountries] = useState(initialCountries);
  const [regions, setRegions] = useState(initialRegions);
  const [grapes, setGrapes] = useState(initialGrapes);
  const [appellations, setAppellations] = useState<ReferenceOption[]>(
    initialWine?.appellations ?? [],
  );
  const [, startAppellations] = useTransition();

  const [countryId, setCountryId] = useState(initialWine?.countryId ?? "");
  const [regionId, setRegionId] = useState(initialWine?.regionId ?? "");
  const [appellationId, setAppellationId] = useState(initialWine?.appellationId ?? "");
  const [blend, setBlend] = useState<BlendRow[]>(
    initialWine?.blend ?? [{ grapeId: "", percentage: "" }],
  );
  const [producerId, setProducerId] = useState(initialWine?.producerId ?? "");
  const [producerLabel, setProducerLabel] = useState<string | null>(
    initialWine?.producerLabel ?? null,
  );
  const [typeDesignationId, setTypeDesignationId] = useState(
    initialWine?.typeDesignationId ?? "",
  );
  const [colour, setColour] = useState<(typeof COLOURS)[number] | null>(
    initialWine?.colour ?? null,
  );
  const [style, setStyle] = useState<(typeof STYLES)[number] | null>(
    initialWine?.style ?? null,
  );
  const [wineName, setWineName] = useState(initialWine?.wineName ?? "");
  const [vintageKind, setVintageKind] = useState<"YEAR" | "NV" | "TAWNY">(
    initialWine?.vintageKind ?? "YEAR",
  );
  const [vintageYear, setVintageYear] = useState(initialWine?.vintageYear ?? "");
  const [tawnyYears, setTawnyYears] = useState(initialWine?.tawnyYears ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialWine?.imageUrl ?? null);

  useEffect(() => {
    startAppellations(async () => {
      setAppellations(regionId ? await listAppellationsForRegions([regionId]) : []);
    });
  }, [regionId]);

  async function submit() {
    setError(null);
    if (
      !countryId || !regionId || !appellationId || !blend[0]?.grapeId ||
      !producerId || !colour || !style
    ) {
      setError(
        "Country, region, appellation, primary grape, producer, colour and style are required.",
      );
      return;
    }
    if (vintageKind === "YEAR" && !vintageYear) {
      setError("Enter the vintage year (or switch to NV / tawny).");
      return;
    }
    setPending(true);
    try {
      const filled = blend.filter((r) => r.grapeId);
      const payload = {
        countryId,
        regionId,
        appellationId,
        primaryGrapeId: filled[0].grapeId,
        secondaryGrapeId: filled[1]?.grapeId ?? null,
        grapes: filled.map((r) => ({
          grapeId: r.grapeId,
          percentage: r.percentage.trim() ? Number(r.percentage) : null,
        })),
        producerId,
        typeDesignationId: typeDesignationId || null,
        colour,
        style,
        wineName: wineName.trim() || null,
        vintageKind,
        vintageYear: vintageKind === "YEAR" ? Number(vintageYear) : null,
        vintageTawnyYears: vintageKind === "TAWNY" && tawnyYears ? Number(tawnyYears) : null,
        imageUrl,
      };
      if (wineId) {
        await updateCatalogWine(wineId, payload);
        if (onSaved) onSaved(wineId);
        else router.push(`/catalog/${wineId}`);
      } else {
        const { id } = await createCatalogWine(payload);
        if (onCreated) onCreated(id);
        else router.push(`/catalog/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the wine.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          Location
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
          <div className="flex flex-col gap-2">
            <Label>Country</Label>
            <ReferenceCombobox
              formFieldName="country_id"
              options={countries}
              value={countryId}
              onValueChange={(id) => {
                setCountryId(id);
                setRegionId("");
                setAppellationId("");
              }}
              onOptionCreated={(o) => setCountries((c) => [...c, o])}
              placeholder="Select a country"
              createLabel="country"
              onCreate={createCountry}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Region</Label>
            <ReferenceCombobox
              formFieldName="region_id"
              options={regions.filter((r) => r.country_id === countryId)}
              value={regionId}
              onValueChange={(id) => {
                setRegionId(id);
                setAppellationId("");
              }}
              onOptionCreated={(o) => setRegions((r) => [...r, { ...o, country_id: countryId }])}
              placeholder={countryId ? "Select a region" : "Choose a country first"}
              createLabel="region"
              onCreate={countryId ? (name) => createRegion(countryId, name) : undefined}
              disabled={!countryId}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>District / Appellation</Label>
            <ReferenceCombobox
              formFieldName="appellation_id"
              options={appellations}
              value={appellationId}
              onValueChange={setAppellationId}
              onOptionCreated={(o) => setAppellations((a) => [...a, o])}
              placeholder={regionId ? "None — just the region" : "Choose a region first"}
              createLabel="appellation"
              onCreate={regionId ? (name) => createAppellation(regionId, name) : undefined}
              disabled={!regionId}
              allowClear
            />
          </div>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          Identity
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
          <div className="flex flex-col gap-2">
            <Label>Grapes &amp; blend</Label>
            <GrapeBlendEditor
              grapes={grapes}
              onGrapeCreated={(o) => setGrapes((g) => [...g, o])}
              value={blend}
              onChange={setBlend}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Producer</Label>
            <SearchableCombobox
              formFieldName="producer_id"
              value={producerId}
              selectedLabel={producerLabel}
              onValueChange={(id, label) => {
                setProducerId(id);
                setProducerLabel(label || null);
              }}
              search={async (q) =>
                (await searchProducers(q, regionId || undefined)).map(({ id, name }) => ({ id, name }))
              }
              placeholder="Search for the producer"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Wine name (optional)</Label>
            <Input value={wineName} onChange={(e) => setWineName(e.target.value)} placeholder="e.g. Chateau Lascombes, or Clos Sainte-Hune" />
          </div>
          {typeDesignations.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Label>Type designation (optional)</Label>
              <ReferenceCombobox
                formFieldName="type_designation_id"
                options={typeDesignations}
                value={typeDesignationId}
                onValueChange={setTypeDesignationId}
                placeholder="None"
                allowClear
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label>Colour</Label>
            <PillGroup options={COLOURS} labels={COLOUR_LABELS} value={colour} onChange={setColour} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <PillGroup options={STYLES} labels={STYLE_LABELS} value={style} onChange={setStyle} />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          Photo
        </legend>
        <div className="pt-1.5">
          <ImageUploader
            name="catalog_image"
            bucket="wine-images"
            folder={`catalog/staging/${userId}`}
            label="Add a bottle photo"
            aspectClassName="aspect-[3/4] max-w-40"
            initialUrl={imageUrl ?? undefined}
            onChange={setImageUrl}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          Age
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="vintage_kind">Vintage</Label>
            <select
              id="vintage_kind"
              value={vintageKind}
              onChange={(e) => setVintageKind(e.target.value as "YEAR" | "NV" | "TAWNY")}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="YEAR">A specific vintage year</option>
              <option value="NV">NV — non-vintage</option>
              <option value="TAWNY">XX years tawny</option>
            </select>
            {vintageKind === "YEAR" ? (
              <Input
                type="number"
                min={1900}
                max={2100}
                value={vintageYear}
                onChange={(e) => setVintageYear(e.target.value)}
                placeholder="e.g. 2018"
              />
            ) : null}
            {vintageKind === "TAWNY" ? (
              <Input
                type="number"
                min={1}
                max={99}
                value={tawnyYears}
                onChange={(e) => setTawnyYears(e.target.value)}
                placeholder="e.g. 20"
              />
            ) : null}
          </div>
        </div>
      </fieldset>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Adding wine…" : "Add wine"}
      </Button>
    </div>
  );
}
