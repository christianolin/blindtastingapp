"use client";

import { useId, useState } from "react";
import { Wine, X } from "lucide-react";
import { Row, RowPair, SectionCard } from "@/components/wset/wset-sheet";
import { PillGroup } from "@/components/wset/pill-group";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeDesignationField, type TypeDesignationOption } from "@/components/type-designation-field";
import { LABELS } from "@/lib/wset/vocab";
import { listAppellationsForRegions, type SearchOption } from "@/lib/reference-search";
import { createKeyedCache } from "@/lib/wine-map/keyed-cache";
import { cn } from "@/lib/utils";
import { MapPlaceField } from "./map-place-field";
import { EDITOR_COPY } from "./editor-copy";
import type { ArchetypeDraft, DraftAction } from "./profile-draft";
import {
  PROFILE_COLOURS,
  PROFILE_STYLES,
  appellationListCacheable,
  appellationOptions,
  filterAppellationOptions,
  type AppellationOption,
  type EditorReferences,
} from "./profile-rules";

// 44 px on touch, the control's own size on a laptop pointer.
const TAP = "min-h-11 md:pointer-fine:min-h-0";
// 16 px text below md, so iOS does not zoom into a focused field.
const INPUT = `${TAP} w-full rounded-[10px] border border-border bg-card px-3 py-2 text-base text-foreground md:text-[13px]`;

// The editor's first tab: what the typical wine is and where it scores —
// everything the old inline editor had above its ranges, drawn with the WSET
// sheet's own SectionCard and rows. English labels (admin).
export function WineSection({
  hidden,
  draft,
  onChange,
  references,
}: {
  hidden: boolean;
  draft: ArchetypeDraft;
  onChange: (action: DraftAction) => void;
  references: EditorReferences;
}) {
  const ids = {
    name: useId(),
    country: useId(),
    region: useId(),
    appellation: useId(),
    primaryGrape: useId(),
    secondGrape: useId(),
    age: useId(),
    place: useId(),
    description: useId(),
  };
  // A region's appellation list, read once per region while the editor is
  // open. A failed or empty read is not kept (every region has at least its
  // self-named appellation), so the next search reads it again.
  const [appellationLists] = useState(() =>
    createKeyedCache<null, SearchOption[]>({
      capacity: 50,
      load: (_client, regionId) => listAppellationsForRegions([regionId]),
      cacheable: appellationListCacheable,
    }),
  );

  const regionOptions = references.regions
    .filter((r) => r.countryId === draft.countryId)
    .map((r) => ({ id: r.id, name: r.name }));
  const regionName = references.regions.find((r) => r.id === draft.regionId)?.name ?? null;
  const designationName = new Map(references.typeDesignations.map((d) => [d.id, d.name]));
  const designationOptions: TypeDesignationOption[] = references.typeDesignations.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    country_id: null,
  }));

  async function searchRegionAppellations(query: string): Promise<AppellationOption[]> {
    if (!draft.regionId || !regionName) return [];
    try {
      const list = await appellationLists.load(null, draft.regionId);
      return filterAppellationOptions(appellationOptions(regionName, list), query);
    } catch {
      return [];
    }
  }

  return (
    <SectionCard
      id="wine"
      numeral={<Wine aria-hidden className="size-4" />}
      title={EDITOR_COPY.wineTab}
      rated={EDITOR_COPY.wineRated}
      className={hidden ? "hidden" : undefined}
    >
      <Row label={EDITOR_COPY.name} labelId={ids.name}>
        <input
          aria-labelledby={ids.name}
          value={draft.name}
          onChange={(e) => onChange({ type: "name", value: e.target.value })}
          className={INPUT}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.colour} value={LABELS[draft.colour]}>
          <PillGroup
            options={PROFILE_COLOURS}
            labels={LABELS}
            value={draft.colour}
            onChange={(v) => {
              // A second tap on the chosen pill clears it in PillGroup; a
              // typical wine always has a colour, so that tap does nothing.
              if (v) onChange({ type: "colour", value: v });
            }}
          />
        </Row>
        <Row label={EDITOR_COPY.style} value={LABELS[draft.style]}>
          <PillGroup
            options={PROFILE_STYLES}
            labels={LABELS}
            value={draft.style}
            onChange={(v) => {
              if (v) onChange({ type: "style", value: v });
            }}
          />
        </Row>
      </RowPair>

      <RowPair>
        <Row label={EDITOR_COPY.country} labelId={ids.country}>
          <ReferenceCombobox
            formFieldName="country_id"
            options={references.countries}
            value={draft.countryId}
            onValueChange={(id) => onChange({ type: "country", id, regions: references.regions })}
            placeholder={EDITOR_COPY.pickCountry}
            createLabel="countries"
            labelledBy={ids.country}
            triggerClassName={TAP}
          />
        </Row>
        <Row label={EDITOR_COPY.region} labelId={ids.region}>
          <ReferenceCombobox
            formFieldName="region_id"
            options={regionOptions}
            value={draft.regionId}
            onValueChange={(id) => onChange({ type: "region", id })}
            placeholder={draft.countryId ? EDITOR_COPY.pickRegion : EDITOR_COPY.pickCountryFirst}
            createLabel="regions"
            labelledBy={ids.region}
            disabled={!draft.countryId}
            triggerClassName={TAP}
          />
        </Row>
      </RowPair>

      <Row label={EDITOR_COPY.appellation} labelId={ids.appellation}>
        <SearchableCombobox
          formFieldName="appellation_id"
          value={draft.appellationId}
          selectedLabel={draft.appellationLabel}
          onValueChange={(id, label) => onChange({ type: "appellation", id, label })}
          search={searchRegionAppellations}
          placeholder={draft.regionId ? EDITOR_COPY.pickAppellation : EDITOR_COPY.pickRegionFirst}
          createLabel="appellations"
          labelledBy={ids.appellation}
          disabled={!draft.regionId}
          triggerClassName={TAP}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.primaryGrape} labelId={ids.primaryGrape}>
          <ReferenceCombobox
            formFieldName="primary_grape_id"
            options={references.grapes}
            value={draft.primaryGrapeId}
            onValueChange={(id) => onChange({ type: "primaryGrape", id })}
            placeholder={EDITOR_COPY.pickGrape}
            createLabel="grapes"
            labelledBy={ids.primaryGrape}
            triggerClassName={TAP}
          />
        </Row>
        <Row label={EDITOR_COPY.secondGrape} sub={EDITOR_COPY.optional} labelId={ids.secondGrape}>
          <ReferenceCombobox
            formFieldName="secondary_grape_id"
            options={references.grapes}
            value={draft.secondaryGrapeId}
            onValueChange={(id) => onChange({ type: "secondaryGrape", id })}
            placeholder={EDITOR_COPY.noSecondGrape}
            createLabel="grapes"
            labelledBy={ids.secondGrape}
            allowClear
            triggerClassName={TAP}
          />
        </Row>
      </RowPair>

      <Row wide label={EDITOR_COPY.designations}>
        {draft.designationIds.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.designationIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full border border-border pl-2.5 text-[12.5px] text-foreground"
              >
                {designationName.get(id) ?? id}
                <button
                  type="button"
                  aria-label={EDITOR_COPY.removeItem(designationName.get(id) ?? id)}
                  onClick={() => onChange({ type: "removeDesignation", id })}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground md:pointer-fine:min-h-0 md:pointer-fine:min-w-0 md:pointer-fine:p-1.5"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <TypeDesignationField
          formFieldName="designation_add"
          options={designationOptions}
          value=""
          onValueChange={(id) => onChange({ type: "addDesignation", id })}
          placeholder={EDITOR_COPY.addDesignation}
          allowClear={false}
        />
      </Row>

      <RowPair>
        <Row label={EDITOR_COPY.typicalAge} labelId={ids.age}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              aria-label={EDITOR_COPY.typicalAgeFrom}
              value={draft.ageLow}
              onChange={(e) => onChange({ type: "age", end: "low", value: e.target.value })}
              className={cn(INPUT, "w-20")}
            />
            <span className="text-[12px] text-muted-foreground">{EDITOR_COPY.to}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              aria-label={EDITOR_COPY.typicalAgeTo}
              value={draft.ageHigh}
              onChange={(e) => onChange({ type: "age", end: "high", value: e.target.value })}
              className={cn(INPUT, "w-20")}
            />
          </div>
        </Row>
        <Row label={EDITOR_COPY.mapPlace} labelId={ids.place}>
          <MapPlaceField
            value={draft.place}
            onChange={(place) => onChange({ type: "place", place })}
            labelledBy={ids.place}
          />
        </Row>
      </RowPair>

      <Row wide label={EDITOR_COPY.description} labelId={ids.description}>
        <textarea
          aria-labelledby={ids.description}
          value={draft.description}
          onChange={(e) => onChange({ type: "description", value: e.target.value })}
          rows={3}
          className="min-h-24 w-full resize-y rounded-[12px] border border-border bg-card px-3.5 py-3 text-base leading-relaxed text-foreground md:text-[13px]"
        />
      </Row>
    </SectionCard>
  );
}
