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
import { ReferenceCombobox, type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  TypeDesignationField,
  type TypeDesignationOption,
} from "@/components/type-designation-field";
import { listAppellationsForRegions, searchProducers } from "@/lib/reference-search";
import { submitGuess, type GuessFormState } from "./actions";

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

export type ExistingGuess = {
  country_id: string | null;
  region_id: string | null;
  appellation_id: string | null;
  primary_grape_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: "YEAR" | "NV" | "TAWNY" | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
};

export function GuessForm({
  tastingId,
  wineId,
  countries,
  regions,
  grapes,
  typeDesignations,
  existingGuess,
  initialProducerLabel,
}: {
  tastingId: string;
  wineId: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
  existingGuess: ExistingGuess | null;
  initialProducerLabel?: string | null;
}) {
  const [state, formAction, pending] = useActionState<GuessFormState, FormData>(
    submitGuess,
    null,
  );

  const [countryId, setCountryId] = useState(existingGuess?.country_id ?? "");
  const [regionId, setRegionId] = useState(existingGuess?.region_id ?? "");
  const [appellationId, setAppellationId] = useState(
    existingGuess?.appellation_id ?? "",
  );
  const [primaryGrapeId, setPrimaryGrapeId] = useState(
    existingGuess?.primary_grape_id ?? "",
  );
  const [secondaryGrapeId, setSecondaryGrapeId] = useState(
    existingGuess?.secondary_grape_id ?? "",
  );
  const [producerId, setProducerId] = useState(existingGuess?.producer_id ?? "");
  const [producerLabel, setProducerLabel] = useState<string | null>(
    initialProducerLabel ?? null,
  );
  const [typeDesignationId, setTypeDesignationId] = useState(
    existingGuess?.type_designation_id ?? "",
  );
  const [vintageKind, setVintageKind] = useState(existingGuess?.vintage_kind ?? "YEAR");

  // Cascade country → region → appellation so the region list is scoped to the
  // country you guessed (picking France shows French regions, not all 378).
  const visibleRegions = countryId
    ? regions.filter((r) => r.country_id === countryId)
    : regions;

  // Appellations for the chosen region are loaded in full and shown in a plain
  // dropdown (no type-to-search) — same as the answer-key form. An appellation
  // only ever belongs to one region, so the list stays short.
  const [appellations, setAppellations] = useState<ReferenceOption[]>([]);
  const [appellationsPending, startAppellationsTransition] = useTransition();
  useEffect(() => {
    startAppellationsTransition(async () => {
      setAppellations(
        regionId ? await listAppellationsForRegions([regionId]) : [],
      );
    });
  }, [regionId]);

  // Producer search: opening the dropdown with a region guessed instantly
  // lists that region's producers ("Specific to {region}"); typed matches
  // from elsewhere still appear under "Other producers" so guessing the
  // wrong region never hides the right producer.
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

  function onCountryChange(id: string) {
    setCountryId(id);
    // Drop a now-mismatched region/appellation.
    if (regionId && !regions.some((r) => r.id === regionId && r.country_id === id)) {
      setRegionId("");
      setAppellationId("");
    }
  }

  function onRegionChange(id: string) {
    setRegionId(id);
    setAppellationId("");
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <input type="hidden" name="wine_id" value={wineId} />

      <div className="flex flex-col gap-1">
        <a
          href="/rules"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-4"
        >
          How scoring works ↗
        </a>
        <p className="text-xs text-muted-foreground">
          Every field is optional — skip anything you&apos;re unsure of; a
          blank simply scores 0 for that category.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Country (2 pts)</Label>
        <ReferenceCombobox
          formFieldName="country_id"
          options={countries}
          value={countryId}
          onValueChange={onCountryChange}
          placeholder="Guess the country"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Region (3 pts)</Label>
        <ReferenceCombobox
          formFieldName="region_id"
          options={visibleRegions}
          value={regionId}
          onValueChange={onRegionChange}
          placeholder={countryId ? "Guess the region" : "Pick a country first"}
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>District / Appellation (5 pts, if this wine has one)</Label>
        <ReferenceCombobox
          formFieldName="appellation_id"
          options={appellations}
          value={appellationId}
          onValueChange={setAppellationId}
          placeholder={
            !regionId
              ? "Guess a region first"
              : appellationsPending
                ? "Loading appellations…"
                : "Guess the appellation"
          }
          disabled={!regionId || appellationsPending}
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Primary grape (8 pts)</Label>
        <ReferenceCombobox
          formFieldName="primary_grape_id"
          options={grapes}
          value={primaryGrapeId}
          onValueChange={setPrimaryGrapeId}
          placeholder="Guess the primary grape"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Secondary grape (2 pts, if this wine has one)</Label>
        <ReferenceCombobox
          formFieldName="secondary_grape_id"
          options={grapes}
          value={secondaryGrapeId}
          onValueChange={setSecondaryGrapeId}
          placeholder="None"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Producer (6 pts)</Label>
        <SearchableCombobox
          formFieldName="producer_id"
          value={producerId}
          selectedLabel={producerLabel}
          onValueChange={(id, label) => {
            setProducerId(id);
            setProducerLabel(label || null);
          }}
          search={searchProducersGrouped}
          placeholder="Guess the producer"
          allowClear
          emptyQueryHint={regionId ? "Type to search all producers" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Type designation (2 pts, if this wine has one)</Label>
        <TypeDesignationField
          formFieldName="type_designation_id"
          options={typeDesignations}
          value={typeDesignationId}
          onValueChange={setTypeDesignationId}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`vintage_kind_${wineId}`}>
          Vintage (2 pts exact, 1 pt if off by 1 year)
        </Label>
        <Select
          name="vintage_kind"
          items={VINTAGE_KIND_ITEMS}
          value={vintageKind}
          onValueChange={(v) => setVintageKind(v as "YEAR" | "NV" | "TAWNY")}
        >
          <SelectTrigger id={`vintage_kind_${wineId}`} className="w-full">
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
            defaultValue={existingGuess?.vintage_year ?? undefined}
          />
        ) : null}

        {vintageKind === "TAWNY" ? (
          <Select
            name="vintage_tawny_years"
            items={TAWNY_YEARS_ITEMS}
            defaultValue={
              existingGuess?.vintage_tawny_years
                ? String(existingGuess.vintage_tawny_years)
                : undefined
            }
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

      {state && "error" in state ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && "success" in state ? (
        <p className="text-sm text-muted-foreground">Guess saved.</p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <WineGlassLoader /> Saving…
          </>
        ) : existingGuess ? (
          "Update guess"
        ) : (
          "Submit guess"
        )}
      </Button>
    </form>
  );
}
