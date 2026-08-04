"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Fingerprint, MapPin } from "lucide-react";
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
import { GrapeBlendEditor, type BlendRow } from "@/app/catalog/new/grape-blend-editor";
import { orderedBlend } from "@/lib/wine-blend";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import {
  createAppellation,
  createCountry,
  createProducer,
  createRegion,
  createTypeDesignation,
} from "@/app/tastings/[id]/wines/new/actions";

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
const COLOUR_ITEMS = { WHITE: "White", ORANGE: "Orange", ROSE: "Rosé", RED: "Red" };
const STYLE_ITEMS = { STILL: "Still", SPARKLING: "Sparkling", SWEET: "Sweet", FORTIFIED: "Fortified" };

// The shared manual wine-identity fieldset (Location / Identity / Age + photo),
// lifted once from the add-wine forms. Controlled: the caller owns the state and
// keeps its own submit; the fields still carry `name` attrs so a caller that
// submits via `<form action>` (the tasting answer flow) serializes unchanged.
// The appellation loader and region-scoped producer search live here so no
// caller repeats them.
export function WineIdentityFields({
  countries,
  setCountries,
  regions,
  setRegions,
  grapes,
  setGrapes,
  typeDesignations,
  setTypeDesignations,
  countryId,
  setCountryId,
  regionId,
  setRegionId,
  appellationId,
  setAppellationId,
  blend,
  setBlend,
  producerId,
  producerLabel,
  onProducerChange,
  typeDesignationId,
  setTypeDesignationId,
  wineName,
  setWineName,
  colour,
  setColour,
  style,
  setStyle,
  vintageKind,
  setVintageKind,
  vintageYear,
  setVintageYear,
  tawnyInitial,
  unidentified = false,
  imageFolder,
  imageInitialUrl,
  onImageChange,
  photoHint,
}: {
  countries: ReferenceOption[];
  setCountries: React.Dispatch<React.SetStateAction<ReferenceOption[]>>;
  regions: (ReferenceOption & { country_id: string })[];
  setRegions: React.Dispatch<
    React.SetStateAction<(ReferenceOption & { country_id: string })[]>
  >;
  grapes: ReferenceOption[];
  setGrapes: React.Dispatch<React.SetStateAction<ReferenceOption[]>>;
  typeDesignations: TypeDesignationOption[];
  setTypeDesignations: React.Dispatch<React.SetStateAction<TypeDesignationOption[]>>;
  countryId: string;
  setCountryId: (id: string) => void;
  regionId: string;
  setRegionId: (id: string) => void;
  appellationId: string;
  setAppellationId: (id: string) => void;
  blend: BlendRow[];
  setBlend: (rows: BlendRow[]) => void;
  producerId: string;
  producerLabel: string | null;
  onProducerChange: (id: string, label: string | null) => void;
  typeDesignationId: string;
  setTypeDesignationId: (id: string) => void;
  wineName: string;
  setWineName: (v: string) => void;
  colour: string;
  setColour: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  vintageKind: "YEAR" | "NV" | "TAWNY";
  setVintageKind: (v: "YEAR" | "NV" | "TAWNY") => void;
  vintageYear: string;
  setVintageYear: (v: string) => void;
  tawnyInitial?: number | null;
  unidentified?: boolean;
  imageFolder: string;
  imageInitialUrl: string | null;
  onImageChange?: (url: string | null) => void;
  photoHint?: string;
}) {
  const [appellations, setAppellations] = useState<ReferenceOption[]>([]);
  const [appellationsPending, startAppellations] = useTransition();

  useEffect(() => {
    startAppellations(async () => {
      setAppellations(regionId ? await listAppellationsForRegions([regionId]) : []);
    });
  }, [regionId]);

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
    <>
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
            <Label>Grapes &amp; blend</Label>
            <GrapeBlendEditor
              grapes={grapes}
              onGrapeCreated={(o) => setGrapes((g) => [...g, o])}
              value={blend}
              onChange={setBlend}
            />
            <input
              type="hidden"
              name="grape_blend"
              value={JSON.stringify(orderedBlend(blend))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Producer</Label>
            <SearchableCombobox
              formFieldName="producer_id"
              value={producerId}
              selectedLabel={producerLabel}
              onValueChange={onProducerChange}
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
            <Label>Wine name (optional)</Label>
            <Input
              name="wine_name"
              value={wineName}
              onChange={(e) => setWineName(e.target.value)}
              placeholder="e.g. Chateau Lascombes, or Clos Sainte-Hune"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Colour</Label>
            <Select
              name="colour"
              items={COLOUR_ITEMS}
              value={colour}
              onValueChange={(v) => setColour(v ?? "")}
              required={!unidentified}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose the colour" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WHITE">White</SelectItem>
                <SelectItem value="ORANGE">Orange</SelectItem>
                <SelectItem value="ROSE">Rosé</SelectItem>
                <SelectItem value="RED">Red</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Style</Label>
            <Select
              name="style"
              items={STYLE_ITEMS}
              value={style}
              onValueChange={(v) => setStyle(v ?? "")}
              required={!unidentified}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose the style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STILL">Still</SelectItem>
                <SelectItem value="SPARKLING">Sparkling</SelectItem>
                <SelectItem value="SWEET">Sweet</SelectItem>
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
                value={vintageYear}
                onChange={(e) => setVintageYear(e.target.value)}
                required
              />
            ) : null}
            {vintageKind === "TAWNY" ? (
              <Select
                name="vintage_tawny_years"
                items={TAWNY_YEARS_ITEMS}
                defaultValue={tawnyInitial != null ? String(tawnyInitial) : undefined}
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
        {photoHint ? (
          <p className="text-xs text-muted-foreground">{photoHint}</p>
        ) : null}
        <ImageUploader
          name="image_url"
          bucket="wine-images"
          folder={imageFolder}
          label="Add a photo"
          aspectClassName="aspect-square max-w-48"
          initialUrl={imageInitialUrl}
          onChange={onImageChange}
        />
      </div>
    </>
  );
}
