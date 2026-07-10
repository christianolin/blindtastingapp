"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
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
  appellations,
  grapes,
  producers,
  typeDesignations,
  existingGuess,
}: {
  tastingId: string;
  wineId: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  appellations: (ReferenceOption & { region_id: string })[];
  grapes: ReferenceOption[];
  producers: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  existingGuess: ExistingGuess | null;
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
  const [typeDesignationId, setTypeDesignationId] = useState(
    existingGuess?.type_designation_id ?? "",
  );
  const [vintageKind, setVintageKind] = useState(existingGuess?.vintage_kind ?? "YEAR");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="tasting_id" value={tastingId} />
      <input type="hidden" name="wine_id" value={wineId} />

      <div className="flex flex-col gap-2">
        <Label>Country</Label>
        <ReferenceCombobox
          formFieldName="country_id"
          options={countries}
          value={countryId}
          onValueChange={setCountryId}
          placeholder="Guess the country"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Region</Label>
        <ReferenceCombobox
          formFieldName="region_id"
          options={regions}
          value={regionId}
          onValueChange={setRegionId}
          placeholder="Guess the region"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>District / Appellation</Label>
        <ReferenceCombobox
          formFieldName="appellation_id"
          options={appellations}
          value={appellationId}
          onValueChange={setAppellationId}
          placeholder="Guess the appellation"
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
          placeholder="Guess the primary grape"
          allowClear
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Secondary grape (optional)</Label>
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
        <Label>Producer</Label>
        <ReferenceCombobox
          formFieldName="producer_id"
          options={producers}
          value={producerId}
          onValueChange={setProducerId}
          placeholder="Guess the producer"
          allowClear
        />
      </div>

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

      <div className="flex flex-col gap-2">
        <Label htmlFor={`vintage_kind_${wineId}`}>Vintage</Label>
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
        {pending ? "Saving…" : existingGuess ? "Update guess" : "Submit guess"}
      </Button>
    </form>
  );
}
