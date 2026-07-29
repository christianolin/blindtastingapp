"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Fingerprint, MapPin } from "lucide-react";
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
  addWineFromCatalog,
  updateWine,
  createAppellation,
  createCountry,
  createGrape,
  createProducer,
  createRegion,
  createTypeDesignation,
  searchCatalogWines,
  type AddWineFormState,
} from "./actions";

// Pre-filled values for edit mode — the wine's current answer key, plus the
// producer's display name (SearchableCombobox can't derive it from the id).
export type WineFormInitial = {
  country_id: string;
  region_id: string;
  appellation_id: string | null;
  primary_grape_id: string;
  secondary_grape_id: string | null;
  producer_id: string | null;
  producer_name: string | null;
  type_designation_id: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY" | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  image_url: string | null;
  wine_name: string | null;
  colour: "WHITE" | "ROSE" | "RED" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | null;
};

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

const COLOUR_ITEMS = { WHITE: "White", ROSE: "Rosé", RED: "Red" };
const STYLE_ITEMS = { STILL: "Still", SPARKLING: "Sparkling", FORTIFIED: "Fortified" };

export function WineForm({
  tastingId,
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations: initialTypeDesignations,
  wineId,
  initial,
}: {
  tastingId: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
  /** When set (with `initial`), the form edits this wine instead of adding one. */
  wineId?: string;
  initial?: WineFormInitial;
}) {
  const isEditing = Boolean(wineId && initial);
  const [state, formAction, pending] = useActionState<
    AddWineFormState,
    FormData
  >(isEditing ? updateWine : addWine, null);

  const [countries, setCountries] = useState(initialCountries);
  const [regions, setRegions] = useState(initialRegions);
  const [grapes, setGrapes] = useState(initialGrapes);
  const [typeDesignations, setTypeDesignations] = useState(
    initialTypeDesignations,
  );

  const [countryId, setCountryId] = useState(initial?.country_id ?? "");
  const [regionId, setRegionId] = useState(initial?.region_id ?? "");
  const [appellationId, setAppellationId] = useState(
    initial?.appellation_id ?? "",
  );
  const [primaryGrapeId, setPrimaryGrapeId] = useState(
    initial?.primary_grape_id ?? "",
  );
  const [secondaryGrapeId, setSecondaryGrapeId] = useState(
    initial?.secondary_grape_id ?? "",
  );
  const [producerId, setProducerId] = useState(initial?.producer_id ?? "");
  const [producerLabel, setProducerLabel] = useState<string | null>(
    initial?.producer_name ?? null,
  );
  const [typeDesignationId, setTypeDesignationId] = useState(
    initial?.type_designation_id ?? "",
  );
  const [vintageKind, setVintageKind] = useState(
    initial?.vintage_kind ?? "YEAR",
  );
  const [wineName, setWineName] = useState(initial?.wine_name ?? "");
  const [colour, setColour] = useState<string>(initial?.colour ?? "");
  const [style, setStyle] = useState<string>(initial?.style ?? "");

  // Catalog-first: pick an existing wine (default), or reveal the full creator.
  const [manualMode, setManualMode] = useState(false);
  const [pickedWine, setPickedWine] = useState<{ id: string; label: string } | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [pickPending, startPick] = useTransition();

  function submitPick() {
    if (!pickedWine) return;
    setPickError(null);
    startPick(async () => {
      const result = await addWineFromCatalog(tastingId, pickedWine.id);
      if (result?.error) setPickError(result.error);
    });
  }

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
    <div className="flex flex-col gap-6">
      {!isEditing ? (
        <div className="flex flex-col gap-3">
          <Label>Which wine is this?</Label>
          <SearchableCombobox
            formFieldName="catalog_pick"
            value={pickedWine?.id ?? ""}
            selectedLabel={pickedWine?.label ?? null}
            onValueChange={(id, label) =>
              setPickedWine(id ? { id, label: label ?? "" } : null)
            }
            search={searchCatalogWines}
            placeholder="Search the catalog — producer, wine, appellation…"
          />
          {pickedWine && !manualMode ? (
            <Button type="button" onClick={submitPick} disabled={pickPending}>
              {pickPending ? (
                <>
                  <WineGlassLoader /> Adding…
                </>
              ) : (
                "Add this wine to the tasting"
              )}
            </Button>
          ) : null}
          {pickError ? <p className="text-sm text-destructive">{pickError}</p> : null}
          <button
            type="button"
            onClick={() => setManualMode((m) => !m)}
            className="self-start text-sm text-muted-foreground underline underline-offset-4"
          >
            {manualMode
              ? "← Back to catalog search"
              : "Not in the catalog? Add it manually"}
          </button>
        </div>
      ) : null}

      {isEditing || manualMode ? (
        <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="tasting_id" value={tastingId} />
      {isEditing ? (
        <input type="hidden" name="wine_id" value={wineId} />
      ) : null}

      {/* Same category grouping as the guess form: bordered fieldsets with
          the legend in the border notch, so the answer key reads in the same
          Location / Identity / Age structure players score against. */}
      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="flex items-center gap-1.5 px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <MapPin className="size-3.5" />
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
        <Label>Appellation</Label>
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
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="flex items-center gap-1.5 px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <Fingerprint className="size-3.5" />
          Identity
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
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
        <Label>Wine name</Label>
        <Input
          name="wine_name"
          value={wineName}
          onChange={(e) => setWineName(e.target.value)}
          placeholder="e.g. Chateau Lascombes, or Clos Sainte-Hune"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Colour</Label>
        <Select name="colour" items={COLOUR_ITEMS} value={colour} onValueChange={(v) => setColour(v ?? "")} required>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose the colour" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WHITE">White</SelectItem>
            <SelectItem value="ROSE">Rosé</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Style</Label>
        <Select name="style" items={STYLE_ITEMS} value={style} onValueChange={(v) => setStyle(v ?? "")} required>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose the style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STILL">Still</SelectItem>
            <SelectItem value="SPARKLING">Sparkling</SelectItem>
            <SelectItem value="FORTIFIED">Fortified</SelectItem>
          </SelectContent>
        </Select>
      </div>

        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="flex items-center gap-1.5 px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          <CalendarClock className="size-3.5" />
          Age
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="vintage_kind">Vintage</Label>
        <Select
          name="vintage_kind"
          items={VINTAGE_KIND_ITEMS}
          value={vintageKind}
          onValueChange={(v) => setVintageKind(v as "YEAR" | "NV" | "TAWNY")}
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
            defaultValue={initial?.vintage_year ?? undefined}
            required
          />
        ) : null}

        {vintageKind === "TAWNY" ? (
          <Select
            name="vintage_tawny_years"
            items={TAWNY_YEARS_ITEMS}
            defaultValue={
              initial?.vintage_tawny_years != null
                ? String(initial.vintage_tawny_years)
                : undefined
            }
            required
          >
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
        </div>
      </fieldset>

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
          initialUrl={initial?.image_url ?? null}
        />
      </div>

      {state?.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> {isEditing ? "Saving…" : "Adding wine…"}
          </>
        ) : isEditing ? (
          "Save changes"
        ) : (
          "Add wine"
        )}
      </Button>
    </form>
      ) : null}
    </div>
  );
}
