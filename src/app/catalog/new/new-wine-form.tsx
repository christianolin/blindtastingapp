"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type ReferenceOption } from "@/components/reference-combobox";
import { type TypeDesignationOption } from "@/components/type-designation-field";
import { draftFromIdentityInput } from "@/components/wine/identity-draft";
import { WineIdentityFields } from "@/components/wine/wine-identity-fields";
import { missingWineFields, normaliseDraft } from "@/lib/wine-identity/complete";
import { describeMissing } from "@/lib/wine-identity/describe";
import type { WineIdentityDraft } from "@/lib/wine-identity/types";
import {
  createCatalogWine,
  updateCatalogWine,
  type CatalogWineInput,
  type WineProfileInput,
} from "./actions";
import { type BlendRow } from "./grape-blend-editor";

// Types, not values: the option lists themselves live in the shared
// WineIdentityFields control, so a runtime array here was never read.
type Colour = "WHITE" | "ORANGE" | "ROSE" | "RED";
type Style = "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";

// "" and a non-numeric entry both mean "not set"; 0 is a real value (decanting
// time of zero = no decanting needed), so it must survive.
const numOrNull = (s: string): number | null =>
  s.trim() && Number.isFinite(Number(s)) ? Number(s) : null;

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
  colour: Colour | null;
  style: Style | null;
  wineName: string;
  description: string | null;
  /** The wine's structured profile (producer background, nose, palate,
      pairing, serving), edited under "Wine profile". */
  profile?: WineProfileInput | null;
  /** Estimated market price per bottle, DKK, as form text ("" = unknown). */
  estimatedPrice: string;
  /** @deprecated removed in S5c */
  vintagePrompt?: boolean;
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
  typeDesignations: initialTypeDesignations,
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
  const [typeDesignations, setTypeDesignations] = useState<TypeDesignationOption[]>(
    () =>
      initialTypeDesignations.map((t) => ({
        ...t,
        category: null,
        country_id: null,
      })),
  );

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
  const [colour, setColour] = useState<Colour | null>(
    initialWine?.colour ?? null,
  );
  const [style, setStyle] = useState<Style | null>(
    initialWine?.style ?? null,
  );
  const [wineName, setWineName] = useState(initialWine?.wineName ?? "");
  const [description, setDescription] = useState(initialWine?.description ?? "");
  const [vintageKind, setVintageKind] = useState<"YEAR" | "NV" | "TAWNY">(
    initialWine?.vintageKind ?? "YEAR",
  );
  const [vintageYear, setVintageYear] = useState(initialWine?.vintageYear ?? "");
  const [tawnyYears, setTawnyYears] = useState(initialWine?.tawnyYears ?? "");
  const [estimatedPrice, setEstimatedPrice] = useState(
    initialWine?.estimatedPrice ?? "",
  );
  // The structured profile. Editable here so a curator can correct a bad label
  // read — without this the fields would be write-only from the scanner.
  const p0 = initialWine?.profile;
  const [wineryDescription, setWineryDescription] = useState(
    p0?.wineryDescription ?? "",
  );
  const [aroma, setAroma] = useState(p0?.aroma ?? "");
  const [tastingNotes, setTastingNotes] = useState(p0?.tastingNotes ?? "");
  const [foodPairing, setFoodPairing] = useState(p0?.foodPairing ?? "");
  const [tempMin, setTempMin] = useState(
    p0?.servingTempC ? String(p0.servingTempC.min) : "",
  );
  const [tempMax, setTempMax] = useState(
    p0?.servingTempC ? String(p0.servingTempC.max) : "",
  );
  const [decantMinutes, setDecantMinutes] = useState(
    p0?.decantMinutes != null ? String(p0.decantMinutes) : "",
  );
  const [alcoholPercent, setAlcoholPercent] = useState(
    p0?.alcoholPercent != null ? String(p0.alcoholPercent) : "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialWine?.imageUrl ?? null);

  // The identity as a draft for the one completeness rule and the one write
  // path (D2). A pending producer or grape name travels in it and is found or
  // created by the write, so nothing is created before the save.
  function currentDraft(): WineIdentityDraft {
    const draft = draftFromIdentityInput(
      {
        countryId,
        regionId,
        appellationId,
        blend,
        producerId,
        producerLabel,
        typeDesignationId,
        wineName,
        colour: colour ?? "",
        style: style ?? "",
        vintageKind,
        vintageYear,
        vintageTawnyYears: tawnyYears,
        imageUrl,
      },
      { grapes: Object.fromEntries(grapes.map((g) => [g.id, g.name])) },
    );
    return normaliseDraft({ ...draft, description, alcohol: numOrNull(alcoholPercent) });
  }

  function fail(message: string) {
    setError(message);
    setPending(false);
  }

  async function submit() {
    setError(null);
    const draft = currentDraft();
    const missing = missingWineFields(draft);
    if (missing.length > 0) {
      setError(`This wine ${describeMissing(missing)}.`);
      return;
    }
    setPending(true);
    const input: CatalogWineInput = {
      draft,
      estimatedPrice,
      profile: {
        wineryDescription: wineryDescription.trim() || null,
        aroma: aroma.trim() || null,
        tastingNotes: tastingNotes.trim() || null,
        foodPairing: foodPairing.trim() || null,
        // A range needs both ends to mean anything, so a half-filled pair is
        // stored as no range rather than a bound the UI can't render.
        servingTempC:
          numOrNull(tempMin) != null && numOrNull(tempMax) != null
            ? { min: numOrNull(tempMin)!, max: numOrNull(tempMax)! }
            : null,
        decantMinutes: numOrNull(decantMinutes),
        alcoholPercent: numOrNull(alcoholPercent),
      },
    };
    try {
      // Both actions return a refusal instead of throwing; its message already
      // names the missing fields ("This wine needs a vintage.").
      if (wineId) {
        const result = await updateCatalogWine(wineId, input);
        if ("error" in result) return fail(result.error);
        if (onSaved) onSaved(wineId);
        else router.push(`/catalog/${wineId}`);
      } else {
        const result = await createCatalogWine(input);
        if ("error" in result) return fail(result.error);
        if (onCreated) onCreated(result.catalogWineId);
        else router.push(`/catalog/${result.catalogWineId}`);
      }
    } catch {
      fail(wineId ? "Could not save the wine." : "Could not add the wine.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <WineIdentityFields
        countries={countries}
        setCountries={setCountries}
        regions={regions}
        setRegions={setRegions}
        grapes={grapes}
        setGrapes={setGrapes}
        typeDesignations={typeDesignations}
        setTypeDesignations={setTypeDesignations}
        countryId={countryId}
        setCountryId={setCountryId}
        regionId={regionId}
        setRegionId={setRegionId}
        appellationId={appellationId}
        setAppellationId={setAppellationId}
        blend={blend}
        setBlend={setBlend}
        producerId={producerId}
        producerLabel={producerLabel}
        onProducerChange={(id, label) => {
          setProducerId(id);
          setProducerLabel(label || null);
        }}
        pendingProducerHint="New producer — we'll add it when you save, or search above to pick an existing one."
        typeDesignationId={typeDesignationId}
        setTypeDesignationId={setTypeDesignationId}
        wineName={wineName}
        setWineName={setWineName}
        description={description}
        setDescription={setDescription}
        colour={colour ?? ""}
        setColour={(v) => setColour((v || null) as Colour | null)}
        style={style ?? ""}
        setStyle={(v) => setStyle((v || null) as Style | null)}
        vintageKind={vintageKind}
        setVintageKind={setVintageKind}
        vintageYear={vintageYear}
        setVintageYear={setVintageYear}
        tawnyYears={tawnyYears}
        setTawnyYears={setTawnyYears}
        imageFolder={`catalog/staging/${userId}`}
        imageInitialUrl={imageUrl}
        imageAspect="aspect-[3/4] max-w-40"
        onImageChange={setImageUrl}
      />

      {/* The structured profile. Filled by the label scan, editable here so a
          bad read can be corrected — otherwise these fields would be
          write-only. Every part is optional. */}
      <details className="rounded-lg border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Wine profile
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          {(
            [
              ["The producer", wineryDescription, setWineryDescription],
              ["Aroma", aroma, setAroma],
              ["Tasting notes", tastingNotes, setTastingNotes],
              ["Food pairing", foodPairing, setFoodPairing],
            ] as [string, string, (v: string) => void][]
          ).map(([labelText, value, set]) => (
            <div key={labelText} className="flex flex-col gap-2">
              <Label htmlFor={`profile-${labelText}`}>{labelText}</Label>
              <Textarea
                id={`profile-${labelText}`}
                rows={3}
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["Serve from (°C)", tempMin, setTempMin],
                ["Serve to (°C)", tempMax, setTempMax],
                ["Decant (min)", decantMinutes, setDecantMinutes],
                ["Alcohol (%)", alcoholPercent, setAlcoholPercent],
              ] as [string, string, (v: string) => void][]
            ).map(([labelText, value, set]) => (
              <div key={labelText} className="flex w-32 flex-col gap-2">
                <Label htmlFor={`profile-${labelText}`}>{labelText}</Label>
                <Input
                  id={`profile-${labelText}`}
                  type="number"
                  step="0.1"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* Wine-level, not lot-level: a typical retail price the cellar sums
          (scan-suggested, always editable), not what someone paid. */}
      <div className="flex max-w-56 flex-col gap-2">
        <Label htmlFor="estimated-price">Average retail price (DKK)</Label>
        <Input
          id="estimated-price"
          type="number"
          min={0}
          step="1"
          value={estimatedPrice}
          onChange={(e) => setEstimatedPrice(e.target.value)}
          placeholder="e.g. 250"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        <Plus />
        {pending
          ? wineId
            ? "Saving…"
            : "Adding wine…"
          : wineId
            ? "Save changes"
            : "Add wine"}
      </Button>
    </div>
  );
}
