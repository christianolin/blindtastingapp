"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Warehouse } from "lucide-react";
import { type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { ScanModal } from "@/components/scan/scan-modal";
import { type TypeDesignationOption } from "@/components/type-designation-field";
import {
  addWine,
  addWineFromCatalog,
  addTastingWineFromCellarLot,
  addWineUnidentified,
  updateWine,
  searchCatalogWines,
  type AddWineFormState,
} from "./actions";
import { type BlendRow } from "@/app/catalog/new/grape-blend-editor";
import { WineIdentityFields } from "@/components/wine/wine-identity-fields";
import { listMyCellarLots, type CellarLotOption } from "@/app/cellar/new/actions";
import { CellarLotPicker } from "@/components/cellar-lot-picker";

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
  colour: "WHITE" | "ROSE" | "RED" | "ORANGE" | null;
  style: "STILL" | "SPARKLING" | "FORTIFIED" | "SWEET" | null;
  description: string | null;
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

const COLOUR_ITEMS = { WHITE: "White", ORANGE: "Orange", ROSE: "Rosé", RED: "Red" };
const STYLE_ITEMS = { STILL: "Still", SPARKLING: "Sparkling", SWEET: "Sweet", FORTIFIED: "Fortified" };

export function WineForm({
  tastingId,
  userId,
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations: initialTypeDesignations,
  wineId,
  initial,
  autoScan,
}: {
  tastingId: string;
  userId?: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
  /** When set (with `initial`), the form edits this wine instead of adding one. */
  wineId?: string;
  initial?: WineFormInitial;
  /** Open the label scanner immediately (app-header scan into this tasting). */
  autoScan?: boolean;
}) {
  const isEditing = Boolean(wineId && initial);
  const [state, formAction, pending] = useActionState<
    AddWineFormState,
    FormData
  >(isEditing ? updateWine : addWine, null);
  const [uState, uAction, uPending] = useActionState<AddWineFormState, FormData>(
    addWineUnidentified,
    null,
  );

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
  const [blend, setBlend] = useState<BlendRow[]>(
    initial?.primary_grape_id
      ? [
          { grapeId: initial.primary_grape_id, percentage: "" },
          ...(initial.secondary_grape_id
            ? [{ grapeId: initial.secondary_grape_id, percentage: "" }]
            : []),
        ]
      : [{ grapeId: "", percentage: "" }],
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
  const [description, setDescription] = useState(initial?.description ?? "");
  const [colour, setColour] = useState<string>(initial?.colour ?? "");
  const [style, setStyle] = useState<string>(initial?.style ?? "");
  const [vintageYear, setVintageYear] = useState<string>(
    initial?.vintage_year != null ? String(initial.vintage_year) : "",
  );
  const [imageUrl, setImageUrl] = useState<string | null>(
    initial?.image_url ?? null,
  );

  // Catalog-first: pick an existing wine (default), or reveal the full creator.
  const [manualMode, setManualMode] = useState(false);
  const [scanning, setScanning] = useState(Boolean(autoScan));
  const [unidentified, setUnidentified] = useState(false);
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

  const router = useRouter();
  const [cellarMode, setCellarMode] = useState(false);
  const [cellarLots, setCellarLots] = useState<CellarLotOption[] | null>(null);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [consumeBottle, setConsumeBottle] = useState(false);
  const [cellarError, setCellarError] = useState<string | null>(null);
  const [cellarWarning, setCellarWarning] = useState<string | null>(null);
  const [cellarPending, startCellar] = useTransition();

  function openCellar() {
    setCellarMode(true);
    setCellarError(null);
    if (cellarLots === null) {
      startCellar(async () => {
        setCellarLots(await listMyCellarLots());
      });
    }
  }

  function submitCellar() {
    if (!selectedLotId) return;
    setCellarError(null);
    setCellarWarning(null);
    startCellar(async () => {
      const r = await addTastingWineFromCellarLot(tastingId, selectedLotId, {
        consume: consumeBottle,
      });
      if (r && "error" in r && r.error) {
        setCellarError(r.error);
        return;
      }
      if (r && "warning" in r && r.warning) {
        setCellarWarning(r.warning);
        return;
      }
      router.push(`/tastings/${tastingId}`);
      router.refresh();
    });
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
            className="self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {manualMode
              ? "← Back to catalog search"
              : "Not in the catalog? Add it manually"}
          </button>
          {userId && !manualMode ? (
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Camera className="size-4" /> Scan the label instead
            </button>
          ) : null}
          {scanning && userId ? (
            <ScanModal
              userId={userId}
              pickLabel="Add to tasting"
              onClose={() => setScanning(false)}
              onAddToCellar={(wine) => {
                setScanning(false);
                setPickError(null);
                startPick(async () => {
                  const r = await addWineFromCatalog(tastingId, wine.id);
                  if (r?.error) setPickError(r.error);
                });
              }}
              onAddNew={(catalog) => {
                // Prefill the manual form from the scan so "add as new" isn't a
                // blank form — including the label photo. An unmatched producer
                // arrives as a label to pick or create.
                setScanning(false);
                setManualMode(true);
                setCountryId(catalog.countryId);
                setRegionId(catalog.regionId);
                setAppellationId(catalog.appellationId);
                setBlend(catalog.blend);
                setProducerId(catalog.producerId);
                setProducerLabel(catalog.producerLabel);
                setTypeDesignationId(catalog.typeDesignationId);
                setWineName(catalog.wineName);
                setDescription(catalog.description ?? "");
                setColour(catalog.colour ?? "");
                setStyle(catalog.style ?? "");
                setVintageKind(catalog.vintageKind);
                setVintageYear(catalog.vintageYear);
                setImageUrl(catalog.imageUrl);
              }}
            />
          ) : null}
          {userId && !manualMode ? (
            <button
              type="button"
              onClick={() => (cellarMode ? setCellarMode(false) : openCellar())}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Warehouse className="size-4" />{" "}
              {cellarMode ? "Hide my cellar" : "Choose from my cellar"}
            </button>
          ) : null}
          {cellarMode && userId ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
              <CellarLotPicker
                lots={cellarLots}
                selectedLotId={selectedLotId}
                onPick={(l) => setSelectedLotId(l.lotId)}
              />
              {cellarLots && cellarLots.length > 0 ? (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={consumeBottle}
                      onChange={(e) => setConsumeBottle(e.target.checked)}
                    />
                    Remove a bottle from my cellar
                  </label>
                  {cellarWarning ? (
                    <div className="flex flex-col gap-2 text-sm text-amber-600">
                      <span>Added to the tasting — {cellarWarning}</span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          router.push(`/tastings/${tastingId}`);
                          router.refresh();
                        }}
                      >
                        Go to the tasting
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      onClick={submitCellar}
                      disabled={cellarPending || !selectedLotId}
                    >
                      {cellarPending ? (
                        <>
                          <WineGlassLoader /> Adding…
                        </>
                      ) : (
                        "Add this bottle to the tasting"
                      )}
                    </Button>
                  )}
                  {cellarError ? (
                    <p className="text-sm text-destructive">{cellarError}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {isEditing || manualMode ? (
        <form action={unidentified ? uAction : formAction} className="flex flex-col gap-6">
      <input type="hidden" name="tasting_id" value={tastingId} />
      {isEditing ? (
        <input type="hidden" name="wine_id" value={wineId} />
      ) : null}

      {!isEditing ? (
        <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={unidentified}
            onChange={(e) => setUnidentified(e.target.checked)}
            className="size-4 accent-primary"
          />
          I can&apos;t identify this bottle
        </label>
      ) : null}
      {unidentified ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Unidentified wines are kept out of the shared catalog — no community
          rating, not searchable, excluded from stats. Only country, region and
          grape are required. Use this only when the bottle genuinely can&apos;t be
          identified.
        </p>
      ) : null}

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
        typeDesignationId={typeDesignationId}
        setTypeDesignationId={setTypeDesignationId}
        wineName={wineName}
        setWineName={setWineName}
        description={description}
        setDescription={setDescription}
        colour={colour}
        setColour={setColour}
        style={style}
        setStyle={setStyle}
        vintageKind={vintageKind}
        setVintageKind={setVintageKind}
        vintageYear={vintageYear}
        setVintageYear={setVintageYear}
        tawnyInitial={initial?.vintage_tawny_years ?? null}
        unidentified={unidentified}
        imageFolder={tastingId}
        imageInitialUrl={imageUrl}
        onImageChange={setImageUrl}
        photoHint="Revealed alongside the rest of the answer — not shown until then."
      />

      {state?.error || uState?.error ? (
        <p className="text-sm text-destructive">{state?.error ?? uState?.error}</p>
      ) : null}

      <Button type="submit" disabled={pending || uPending}>
        {pending || uPending ? (
          <>
            <WineGlassLoader /> {isEditing ? "Saving…" : "Adding wine…"}
          </>
        ) : isEditing ? (
          "Save changes"
        ) : unidentified ? (
          "Add unidentified wine"
        ) : (
          "Add wine"
        )}
      </Button>
    </form>
      ) : null}
    </div>
  );
}
