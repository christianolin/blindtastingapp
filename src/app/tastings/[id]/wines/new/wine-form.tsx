"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ReferenceCombobox,
  type ReferenceOption,
} from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  TypeDesignationField,
  type TypeDesignationOption,
} from "@/components/type-designation-field";
import { ImageUploader } from "@/components/image-uploader";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import {
  addWine,
  createAppellation,
  createCountry,
  createGrape,
  createProducer,
  createRegion,
  createTypeDesignation,
  type AddWineFormState,
} from "./actions";

const VINTAGE_KIND_ITEMS = {
  YEAR: "A specific vintage year",
  NV: "NV — non-vintage",
  TAWNY: "XX years tawny",
};

const TAWNY_YEARS_ITEMS = {
  "10": "10 years",
  "20": "20 years",
  "30": "30 years",
  "40": "40+ years",
};

export function WineForm({
  tastingId,
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations: initialTypeDesignations,
}: {
  tastingId: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
}) {
  const [state, formAction, pending] = useActionState<
    AddWineFormState,
    FormData
  >(addWine, null);

  const [countries, setCountries] = useState(initialCountries);
  const [regions, setRegions] = useState(initialRegions);
  const [grapes, setGrapes] = useState(initialGrapes);
  const [typeDesignations, setTypeDesignations] = useState(
    initialTypeDesignations,
  );

  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [appellationId, setAppellationId] = useState("");
  const [primaryGrapeId, setPrimaryGrapeId] = useState("");
  const [secondaryGrapeId, setSecondaryGrapeId] = useState("");
  const [producerId, setProducerId] = useState("");
  const [producerLabel, setProducerLabel] = useState<string | null>(null);
  const [typeDesignationId, setTypeDesignationId] = useState("");
  const [vintageKind, setVintageKind] = useState("YEAR");

  // Appellations are too large to preload in full (LWIN import), but an
  // appellation only ever belongs to one region (Pauillac is Bordeaux, full
  // stop) so scoping by region keeps the list small enough to just list in
  // full — no debounced search needed, unlike the producer field. Loaded
  // fresh whenever the region changes, then filtered client-side.
  const [appellations, setAppellations] = useState<ReferenceOption[]>([]);
  const [appellationsPending, startAppellationsTransition] = useTransition();

  useEffect(() => {
    startAppellationsTransition(async () => {
      setAppellations(regionId ? await listAppellationsForRegions([regionId]) : []);
    });
  }, [regionId]);

  // Producer search: opening the dropdown with a region chosen instantly
  // lists that region's producers ("Specific to {region}"); typed matches
  // from elsewhere still appear under "Other producers" so a producer is
  // never unfindable.
  const regionName = regions.find((r) => r.id === regionId)?.name;
  async function searchProducersGrouped(query: string) {
    const found = await searchProducers(query, regionId || undefined);
    return found.map(({ id, name, in_region }) => ({
      id,
      name,
      group: regionId
        ? in_region
          ? `Specific to ${regionName ?? "the region"}`
          : "Other producers"
        : undefined,
    }));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="tasting_id" value={tastingId} />

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
          onOptionCreated={(o) =>
            setRegions((r) => [...r, { ...o, country_id: countryId }])
          }
          placeholder={countryId ? "Select a region" : "Choose a country first"}
          createLabel="region"
          onCreate={countryId ? (name) => createRegion(countryId, name) : undefined}
          disabled={!countryId}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>District / Appellation (optional)</Label>
        <ReferenceCombobox
          formFieldName="appellation_id"
          options={appellations}
          value={appellationId}
          onValueChange={setAppellationId}
          onOptionCreated={(o) => setAppellations((a) => [...a, o])}
          placeholder={
            !regionId
              ? "Choose a region first"
              : appellationsPending
                ? "Loading appellations…"
                : "None — just the region above"
          }
          createLabel="appellation"
          onCreate={regionId ? (name) => createAppellation(regionId, name) : undefined}
          disabled={!regionId || appellationsPending}
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Primary grape</Label>
        <ReferenceCombobox
          formFieldName="primary_grape_id"
          options={grapes}
          value={primaryGrapeId}
          onValueChange={setPrimaryGrapeId}
          onOptionCreated={(o) => setGrapes((g) => [...g, o])}
          placeholder="Select the primary grape"
          createLabel="grape"
          onCreate={createGrape}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Secondary grape (optional, blends only)</Label>
        <ReferenceCombobox
          formFieldName="secondary_grape_id"
          options={grapes}
          value={secondaryGrapeId}
          onValueChange={setSecondaryGrapeId}
          onOptionCreated={(o) => setGrapes((g) => [...g, o])}
          placeholder="None"
          createLabel="grape"
          onCreate={createGrape}
          allowClear
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
          search={searchProducersGrouped}
          placeholder="Search for the producer"
          createLabel="producer"
          onCreate={regionId ? (name) => createProducer(regionId, name) : undefined}
          emptyQueryHint={regionId ? "Type to search all producers" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Type designation (optional)</Label>
        <TypeDesignationField
          formFieldName="type_designation_id"
          options={typeDesignations}
          value={typeDesignationId}
          onValueChange={setTypeDesignationId}
          onCreate={async (name) => {
            const created = await createTypeDesignation(name);
            return { ...created, category: null, country_id: null };
          }}
          onOptionCreated={(o) => setTypeDesignations((t) => [...t, o])}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Photo (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Revealed alongside the rest of the answer — not shown until then.
        </p>
        <ImageUploader
          name="image_url"
          bucket="wine-images"
          folder={tastingId}
          label="Add a photo"
          aspectClassName="aspect-square max-w-48"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="vintage_kind">Vintage</Label>
        <Select
          name="vintage_kind"
          items={VINTAGE_KIND_ITEMS}
          value={vintageKind}
          onValueChange={(v) => setVintageKind(v as string)}
          required
        >
          <SelectTrigger id="vintage_kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="YEAR">{VINTAGE_KIND_ITEMS.YEAR}</SelectItem>
            <SelectItem value="NV">{VINTAGE_KIND_ITEMS.NV}</SelectItem>
            <SelectItem value="TAWNY">{VINTAGE_KIND_ITEMS.TAWNY}</SelectItem>
          </SelectContent>
        </Select>

        {vintageKind === "YEAR" ? (
          <Input
            name="vintage_year"
            type="number"
            placeholder="e.g. 2018"
            min={1900}
            max={2100}
            required
          />
        ) : null}

        {vintageKind === "TAWNY" ? (
          <Select name="vintage_tawny_years" items={TAWNY_YEARS_ITEMS} required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose the age statement" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TAWNY_YEARS_ITEMS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Adding wine…
          </>
        ) : (
          "Add wine"
        )}
      </Button>
    </form>
  );
}
