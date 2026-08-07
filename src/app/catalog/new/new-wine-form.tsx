"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ReferenceOption } from "@/components/reference-combobox";
import { type TypeDesignationOption } from "@/components/type-designation-field";
import { WineIdentityFields } from "@/components/wine/wine-identity-fields";
import {
  createCatalogWine,
  createGrape,
  createProducer,
  updateCatalogWine,
} from "./actions";
import { type BlendRow } from "./grape-blend-editor";
import { resolvePendingBlend } from "@/lib/wine-blend";

// Types, not values: the option lists themselves live in the shared
// WineIdentityFields control, so a runtime array here was never read.
type Colour = "WHITE" | "ORANGE" | "ROSE" | "RED";
type Style = "STILL" | "SPARKLING" | "SWEET" | "FORTIFIED";

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
  /** Estimated market price per bottle, DKK, as form text ("" = unknown). */
  estimatedPrice: string;
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialWine?.imageUrl ?? null);

  async function submit() {
    setError(null);
    const hasProducer = Boolean(producerId || producerLabel?.trim());
    const hasPrimaryGrape = Boolean(
      blend[0]?.grapeId || blend[0]?.pendingName?.trim(),
    );
    if (
      !countryId || !regionId || !appellationId || !hasPrimaryGrape ||
      !hasProducer || !colour || !style
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
      // A scanned-but-unmatched producer is pending (label set, no id): create
      // it now, on save, so opening the scanner never spawns a possibly-misread
      // winery. createProducer is find-or-create, so an existing exact name is
      // reused rather than duplicated.
      let resolvedProducerId = producerId;
      if (!resolvedProducerId && producerLabel?.trim()) {
        const created = await createProducer(producerLabel.trim(), regionId || null);
        resolvedProducerId = created.id;
      }
      // Turn any pending (scanned-but-unmatched) grapes into real ids now, on
      // save — mirrors the producer handling. Row order is preserved; the
      // catalog_wine_grapes trigger recomputes the primary grape.
      const resolvedBlend = await resolvePendingBlend(blend, createGrape);
      const payload = {
        countryId,
        regionId,
        appellationId,
        primaryGrapeId: resolvedBlend[0].grapeId,
        secondaryGrapeId: resolvedBlend[1]?.grapeId ?? null,
        grapes: resolvedBlend.map((r) => ({
          grapeId: r.grapeId,
          percentage: r.percentage.trim() ? Number(r.percentage) : null,
        })),
        producerId: resolvedProducerId,
        typeDesignationId: typeDesignationId || null,
        colour,
        style,
        wineName: wineName.trim() || null,
        description: description.trim() || null,
        vintageKind,
        vintageYear: vintageKind === "YEAR" ? Number(vintageYear) : null,
        vintageTawnyYears: vintageKind === "TAWNY" && tawnyYears ? Number(tawnyYears) : null,
        imageUrl,
        estimatedPrice:
          estimatedPrice.trim() && Number.isFinite(Number(estimatedPrice))
            ? Number(estimatedPrice)
            : null,
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

      {/* Wine-level, not lot-level: this is the market estimate the cellar sums
          (scan-suggested, always editable), not what someone paid. */}
      <div className="flex max-w-56 flex-col gap-2">
        <Label htmlFor="estimated-price">Estimated price (DKK)</Label>
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
