"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ReferenceCombobox,
  type ReferenceOption,
} from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { PillGroup } from "@/components/wset/pill-group";
import {
  listAppellationsForRegions,
  searchProducers,
} from "@/lib/reference-search";
import {
  createAppellation,
  createCountry,
  createGrape,
  createRegion,
} from "@/app/catalog/new/actions";
import { addCellarLot, searchCellarCatalog } from "./actions";

const COLOURS = ["WHITE", "ORANGE", "ROSE", "RED"] as const;
const STYLES = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"] as const;
const COLOUR_LABELS = { WHITE: "White", ORANGE: "Orange", ROSE: "Rosé", RED: "Red" };
const STYLE_LABELS = {
  STILL: "Still",
  SPARKLING: "Sparkling",
  SWEET: "Sweet",
  FORTIFIED: "Fortified",
};
const SIZES = [375, 750, 1500, 3000];
const SIZE_LABELS: Record<number, string> = {
  375: "375 ml",
  750: "750 ml",
  1500: "1.5 L",
  3000: "3 L",
};

export function CellarLotForm({
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations,
  defaultCurrency,
}: {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [countries, setCountries] = useState(initialCountries);
  const [regions, setRegions] = useState(initialRegions);
  const [grapes, setGrapes] = useState(initialGrapes);
  const [appellations, setAppellations] = useState<ReferenceOption[]>([]);
  const [, startAppellations] = useTransition();

  const [catalogWineId, setCatalogWineId] = useState("");
  const [catalogWineLabel, setCatalogWineLabel] = useState<string | null>(null);

  const [countryId, setCountryId] = useState("");
  const [regionId, setRegionId] = useState("");
  const [appellationId, setAppellationId] = useState("");
  const [primaryGrapeId, setPrimaryGrapeId] = useState("");
  const [secondaryGrapeId, setSecondaryGrapeId] = useState("");
  const [producerId, setProducerId] = useState("");
  const [producerLabel, setProducerLabel] = useState<string | null>(null);
  const [typeDesignationId, setTypeDesignationId] = useState("");
  const [colour, setColour] = useState<(typeof COLOURS)[number] | null>(null);
  const [style, setStyle] = useState<(typeof STYLES)[number] | null>(null);
  const [wineName, setWineName] = useState("");
  const [vintageKind, setVintageKind] = useState<"YEAR" | "NV" | "TAWNY">("YEAR");
  const [vintageYear, setVintageYear] = useState("");
  const [tawnyYears, setTawnyYears] = useState("");

  const [quantity, setQuantity] = useState("1");
  const [bottleSize, setBottleSize] = useState(750);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [purchasedOn, setPurchasedOn] = useState("");
  const [purchaseSource, setPurchaseSource] = useState("");
  const [drinkFrom, setDrinkFrom] = useState("");
  const [drinkTo, setDrinkTo] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [lotNote, setLotNote] = useState("");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startAppellations(async () => {
      setAppellations(
        regionId ? await listAppellationsForRegions([regionId]) : [],
      );
    });
  }, [regionId]);

  async function submit() {
    setError(null);
    const qty = Number(quantity);
    if (!qty || qty < 1) {
      setError("Enter how many bottles you have (at least 1).");
      return;
    }
    if (!catalogWineId) {
      if (
        !countryId || !regionId || !appellationId || !primaryGrapeId ||
        !producerId || !colour || !style
      ) {
        setError(
          "Pick an existing wine, or fill country, region, appellation, primary grape, producer, colour and style.",
        );
        return;
      }
      if (vintageKind === "YEAR" && !vintageYear) {
        setError("Enter the vintage year (or switch to NV / tawny).");
        return;
      }
    }
    if (drinkFrom && drinkTo && Number(drinkTo) < Number(drinkFrom)) {
      setError("Drink-to year can't be before drink-from.");
      return;
    }
    setPending(true);
    try {
      await addCellarLot({
        catalogWineId: catalogWineId || null,
        countryId,
        regionId,
        appellationId,
        primaryGrapeId,
        secondaryGrapeId: secondaryGrapeId || null,
        producerId,
        typeDesignationId: typeDesignationId || null,
        colour: colour ?? undefined,
        style: style ?? undefined,
        wineName: wineName.trim() || null,
        vintageKind,
        vintageYear:
          vintageKind === "YEAR" && vintageYear ? Number(vintageYear) : null,
        vintageTawnyYears:
          vintageKind === "TAWNY" && tawnyYears ? Number(tawnyYears) : null,
        quantity: qty,
        bottleSizeMl: bottleSize,
        pricePerBottle: price ? Number(price) : null,
        currency: currency || null,
        purchasedOn: purchasedOn || null,
        purchaseSource: purchaseSource.trim() || null,
        drinkFrom: drinkFrom ? Number(drinkFrom) : null,
        drinkTo: drinkTo ? Number(drinkTo) : null,
        storageLocation: storageLocation.trim() || null,
        lotNote: lotNote.trim() || null,
      });
      router.push("/cellar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the wine.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Already added? Find it</Label>
        <SearchableCombobox
          formFieldName="catalog_wine_id"
          value={catalogWineId}
          selectedLabel={catalogWineLabel}
          onValueChange={(id, label) => {
            setCatalogWineId(id);
            setCatalogWineLabel(label || null);
          }}
          search={async (q) => await searchCellarCatalog(q)}
          placeholder="Search by producer, wine or appellation"
        />
        <p className="text-xs text-muted-foreground">
          Pick an existing wine to skip the details, or fill them in below to add
          a new one.
        </p>
      </div>

      {catalogWineId ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span>
            <span className="text-muted-foreground">Wine:</span>{" "}
            <span className="font-medium">{catalogWineLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setCatalogWineId("");
              setCatalogWineLabel(null);
            }}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Change
          </button>
        </div>
      ) : (
        <>
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
                  onOptionCreated={(o) =>
                    setRegions((r) => [...r, { ...o, country_id: countryId }])
                  }
                  placeholder={
                    countryId ? "Select a region" : "Choose a country first"
                  }
                  createLabel="region"
                  onCreate={
                    countryId ? (name) => createRegion(countryId, name) : undefined
                  }
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
                  placeholder={
                    regionId ? "None — just the region" : "Choose a region first"
                  }
                  createLabel="appellation"
                  onCreate={
                    regionId ? (name) => createAppellation(regionId, name) : undefined
                  }
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
                <Label>Secondary grape (optional)</Label>
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
                  search={async (q) =>
                    (await searchProducers(q, regionId || undefined)).map(
                      ({ id, name }) => ({ id, name }),
                    )
                  }
                  placeholder="Search for the producer"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Wine name (optional)</Label>
                <Input
                  value={wineName}
                  onChange={(e) => setWineName(e.target.value)}
                  placeholder="e.g. Clos Sainte-Hune"
                />
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
                <PillGroup
                  options={COLOURS}
                  labels={COLOUR_LABELS}
                  value={colour}
                  onChange={setColour}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Style</Label>
                <PillGroup
                  options={STYLES}
                  labels={STYLE_LABELS}
                  value={style}
                  onChange={setStyle}
                />
              </div>
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
                  onChange={(e) =>
                    setVintageKind(e.target.value as "YEAR" | "NV" | "TAWNY")
                  }
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
        </>
      )}

      <fieldset className="rounded-lg border border-border px-3 pb-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wider text-primary">
          In your cellar
        </legend>
        <div className="flex flex-col gap-3 pt-1.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="quantity">Bottles</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bottle_size">Format</Label>
              <select
                id="bottle_size"
                value={bottleSize}
                onChange={(e) => setBottleSize(Number(e.target.value))}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              >
                {SIZES.map((s) => (
                  <option key={s} value={s}>
                    {SIZE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="price">Price / bottle (optional)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchased_on">Purchased (optional)</Label>
              <Input
                id="purchased_on"
                type="date"
                value={purchasedOn}
                onChange={(e) => setPurchasedOn(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="purchase_source">Source (optional)</Label>
              <Input
                id="purchase_source"
                value={purchaseSource}
                onChange={(e) => setPurchaseSource(e.target.value)}
                placeholder="Merchant"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="drink_from">Drink from (optional)</Label>
              <Input
                id="drink_from"
                type="number"
                min={1900}
                max={2100}
                value={drinkFrom}
                onChange={(e) => setDrinkFrom(e.target.value)}
                placeholder="e.g. 2026"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="drink_to">Drink to (optional)</Label>
              <Input
                id="drink_to"
                type="number"
                min={1900}
                max={2100}
                value={drinkTo}
                onChange={(e) => setDrinkTo(e.target.value)}
                placeholder="e.g. 2035"
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="storage_location">Storage location (optional)</Label>
            <Input
              id="storage_location"
              value={storageLocation}
              onChange={(e) => setStorageLocation(e.target.value)}
              placeholder="e.g. Rack 3"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lot_note">Private note (optional)</Label>
            <Input
              id="lot_note"
              value={lotNote}
              onChange={(e) => setLotNote(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Adding…" : "Add to cellar"}
      </Button>
    </div>
  );
}
