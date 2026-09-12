"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WineGlassLoader } from "@/components/wine-glass-loader";
import { Label } from "@/components/ui/label";
import { Camera, Warehouse } from "lucide-react";
import { type ReferenceOption } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { type TypeDesignationOption } from "@/components/type-designation-field";
import { useAddWine } from "@/components/add-wine-context";
import type { RevealMode, WineSourceMode } from "@/lib/supabase/database.types";
import {
  addWine,
  addWineFromCatalog,
  addWineUnidentified,
  updateWine,
  searchCatalogWines,
  type AddWineFormState,
} from "./actions";
import { type BlendRow } from "@/app/catalog/new/grape-blend-editor";
import { WineIdentityFields } from "@/components/wine/wine-identity-fields";

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

/** The tasting as an add-wine sheet destination — what the "Scan the label
    instead" / "Choose from my cellar" shortcuts open the sheet with. Absent
    in edit mode (nothing to add there). */
export type WineFormFlight = {
  tastingName: string;
  revealMode: RevealMode;
  wineSource: WineSourceMode;
  /** Next glass number = existing wine count + 1. */
  position: number;
};

export function WineForm({
  tastingId,
  countries: initialCountries,
  regions: initialRegions,
  grapes: initialGrapes,
  typeDesignations: initialTypeDesignations,
  wineId,
  initial,
  flight,
}: {
  tastingId: string;
  countries: ReferenceOption[];
  regions: (ReferenceOption & { country_id: string })[];
  grapes: ReferenceOption[];
  typeDesignations: TypeDesignationOption[];
  /** When set (with `initial`), the form edits this wine instead of adding one. */
  wineId?: string;
  initial?: WineFormInitial;
  /** When set, the scan / cellar shortcuts open the universal add-wine sheet
      with this flight as the destination. */
  flight?: WineFormFlight;
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
  const { openAddWineSheet } = useAddWine();

  // The scan and cellar paths are the universal add-wine sheet's (camera /
  // cellar views) with this tasting as the flight destination; an add there
  // lands on the tasting page, as the old redirecting actions did.
  function openSheet(start: "camera" | "cellar") {
    if (!flight) return;
    openAddWineSheet(
      {
        kind: "flight",
        tastingId,
        tastingName: flight.tastingName,
        revealMode: flight.revealMode,
        wineSource: flight.wineSource,
        position: flight.position,
      },
      { start, onAdded: () => router.push(`/tastings/${tastingId}`) },
    );
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
          {flight && !manualMode ? (
            <button
              type="button"
              onClick={() => openSheet("camera")}
              className="inline-flex items-center gap-1.5 self-start rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Camera className="size-4" /> Scan the label instead
            </button>
          ) : null}
          {flight && !manualMode ? (
            <button
              type="button"
              onClick={() => openSheet("cellar")}
              className="inline-flex items-center gap-1.5 self-start rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Warehouse className="size-4" /> Choose from my cellar
            </button>
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
