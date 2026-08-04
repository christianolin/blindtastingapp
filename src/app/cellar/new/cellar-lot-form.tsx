"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { type TypeDesignationOption } from "@/components/type-designation-field";
import { WineIdentityFields } from "@/components/wine/wine-identity-fields";
import { createGrape, createProducer } from "@/app/catalog/new/actions";
import { type BlendRow } from "@/app/catalog/new/grape-blend-editor";
import { orderedBlend, resolvePendingBlend } from "@/lib/wine-blend";
import type { WineFormInitial } from "@/app/catalog/new/new-wine-form";
import {
  addCellarLot,
  findMyCellarLotsForWine,
  increaseCellarLotQuantity,
  searchCellarCatalog,
} from "./actions";

const COLOURS = ["WHITE", "ORANGE", "ROSE", "RED"] as const;
const STYLES = ["STILL", "SPARKLING", "SWEET", "FORTIFIED"] as const;
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
  typeDesignations: initialTypeDesignations,
  defaultCurrency,
  userId,
  initialCatalogWineId,
  initialCatalogWineLabel,
  initialWine,
  onAdded,
}: {
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: ReferenceOption[];
  defaultCurrency: string;
  userId: string;
  // Preselect an existing catalog wine (e.g. from a label scan match) so the
  // user only fills the lot details.
  initialCatalogWineId?: string;
  initialCatalogWineLabel?: string | null;
  // Prefill the NEW-wine fields (e.g. a label scan's "add as new" launched from
  // the cellar flow) so the user reviews the wine + fills the lot, then saves.
  initialWine?: WineFormInitial;
  // When set (rendered in the Add-wine popup), called after a successful add
  // instead of navigating — the modal closes + refreshes.
  onAdded?: () => void;
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

  const [catalogWineId, setCatalogWineId] = useState(initialCatalogWineId ?? "");
  const [catalogWineLabel, setCatalogWineLabel] = useState<string | null>(
    initialCatalogWineLabel ?? null,
  );

  const [countryId, setCountryId] = useState(initialWine?.countryId ?? "");
  const [regionId, setRegionId] = useState(initialWine?.regionId ?? "");
  const [appellationId, setAppellationId] = useState(
    initialWine?.appellationId ?? "",
  );
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
  const [description, setDescription] = useState(initialWine?.description ?? "");
  const [vintageKind, setVintageKind] = useState<"YEAR" | "NV" | "TAWNY">(
    initialWine?.vintageKind ?? "YEAR",
  );
  const [vintageYear, setVintageYear] = useState(initialWine?.vintageYear ?? "");
  const [tawnyYears, setTawnyYears] = useState(initialWine?.tawnyYears ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    initialWine?.imageUrl ?? null,
  );

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
  const [duplicateLots, setDuplicateLots] = useState<
    Awaited<ReturnType<typeof findMyCellarLotsForWine>> | null
  >(null);
  const [mergeTargetLotId, setMergeTargetLotId] = useState("");

  async function submit() {
    setError(null);
    const qty = Number(quantity);
    if (!qty || qty < 1) {
      setError("Enter how many bottles you have (at least 1).");
      return;
    }
    if (!catalogWineId) {
      const hasProducer = Boolean(producerId || producerLabel?.trim());
      const hasPrimaryGrape = Boolean(
        blend[0]?.grapeId || blend[0]?.pendingName?.trim(),
      );
      if (
        !countryId || !regionId || !appellationId || !hasPrimaryGrape ||
        !hasProducer || !colour || !style
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
    // Warn before silently creating a duplicate lot of a wine already held.
    if (catalogWineId) {
      const lots = await findMyCellarLotsForWine(catalogWineId);
      if (lots.length > 0) {
        setDuplicateLots(lots);
        setMergeTargetLotId(lots[0].id);
        return;
      }
    }
    await doCreateLot();
  }

  async function doCreateLot() {
    const qty = Number(quantity);
    if (!qty || qty < 1) {
      setError("Enter how many bottles you have (at least 1).");
      return;
    }
    setPending(true);
    try {
      // Create a scanned-but-unmatched (pending) producer on save — only when
      // adding a new wine, since an existing catalog pick ignores these fields.
      let resolvedProducerId = producerId;
      if (!catalogWineId && !resolvedProducerId && producerLabel?.trim()) {
        const created = await createProducer(producerLabel.trim(), regionId || null);
        resolvedProducerId = created.id;
      }
      // Same for pending (scanned-but-unmatched) grapes — resolved to real ids
      // only for a new wine; an existing catalog pick ignores the blend.
      const resolvedGrapes = catalogWineId
        ? []
        : orderedBlend(await resolvePendingBlend(blend, createGrape));
      await addCellarLot({
        catalogWineId: catalogWineId || null,
        countryId,
        regionId,
        appellationId,
        grapes: resolvedGrapes,
        producerId: resolvedProducerId,
        typeDesignationId: typeDesignationId || null,
        colour: colour ?? undefined,
        style: style ?? undefined,
        wineName: wineName.trim() || null,
        description: description.trim() || null,
        vintageKind,
        vintageYear:
          vintageKind === "YEAR" && vintageYear ? Number(vintageYear) : null,
        vintageTawnyYears:
          vintageKind === "TAWNY" && tawnyYears ? Number(tawnyYears) : null,
        imageUrl,
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
      if (onAdded) onAdded();
      else router.push("/cellar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the wine.");
      setPending(false);
    }
  }

  async function mergeIntoLot() {
    const qty = Number(quantity);
    if (!qty || qty < 1) {
      setError("Enter how many bottles to add (at least 1).");
      return;
    }
    setPending(true);
    try {
      await increaseCellarLotQuantity(mergeTargetLotId, qty);
      if (onAdded) onAdded();
      else router.push("/cellar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the lot.");
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
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="min-w-0 break-words">
            <span className="text-muted-foreground">Wine:</span>{" "}
            <span className="font-medium">{catalogWineLabel}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setCatalogWineId("");
              setCatalogWineLabel(null);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Change
          </button>
        </div>
      ) : (
        <>
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
            setColour={(v) =>
              setColour((v || null) as (typeof COLOURS)[number] | null)
            }
            style={style ?? ""}
            setStyle={(v) =>
              setStyle((v || null) as (typeof STYLES)[number] | null)
            }
            vintageKind={vintageKind}
            setVintageKind={setVintageKind}
            vintageYear={vintageYear}
            setVintageYear={setVintageYear}
            tawnyYears={tawnyYears}
            setTawnyYears={setTawnyYears}
            imageFolder={`catalog/staging/${userId}`}
            imageInitialUrl={imageUrl}
            imageAspect="aspect-[3/4] max-w-40"
            imageLabel="Add a bottle photo"
            onImageChange={setImageUrl}
          />
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
                className="appearance-none"
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

      {duplicateLots && duplicateLots.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div>
            <p className="font-medium">You already have this wine in your cellar.</p>
            <p className="mt-1 text-muted-foreground">
              Add {quantity} bottle{Number(quantity) === 1 ? "" : "s"} to an
              existing lot, or keep it as a separate lot?
            </p>
          </div>
          {duplicateLots.length > 1 ? (
            <select
              value={mergeTargetLotId}
              onChange={(e) => setMergeTargetLotId(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            >
              {duplicateLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.quantity} × {SIZE_LABELS[l.bottleSizeMl] ?? `${l.bottleSizeMl} ml`}
                  {l.storageLocation ? ` · ${l.storageLocation}` : ""}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={mergeIntoLot} disabled={pending}>
              {pending ? "Adding…" : "Add to existing lot"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={doCreateLot}
              disabled={pending}
            >
              Create a separate lot
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {duplicateLots ? null : (
        <Button type="button" onClick={submit} disabled={pending}>
          <Warehouse />
          {pending ? "Adding…" : "Add to cellar"}
        </Button>
      )}
    </div>
  );
}
