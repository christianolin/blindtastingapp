"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ReferenceCombobox } from "@/components/reference-combobox";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { searchProducers } from "@/lib/reference-search";
import {
  ADD_PRODUCER_PLACEHOLDER,
  ADD_REGION_PLACEHOLDER,
  FAVOURITES_HINT,
  FAVOURITES_LIMIT,
  FAVOURITES_LOAD_ERROR,
  FAVOURITE_PRODUCERS_LABEL,
  FAVOURITE_PRODUCER_IDS_FIELD,
  FAVOURITE_REGIONS_LABEL,
  FAVOURITE_REGION_IDS_FIELD,
  canAddFavourite,
  regionLabel,
  serializeFavouriteIds,
  unchosen,
  withFavourite,
  withoutFavourite,
  type FavouriteProducer,
  type FavouriteRegion,
  type ProfileFavourites,
} from "@/lib/profile-favourites";

/** Same 44px-on-phone trigger the invite-field chip uses, given to both
 *  combobox components via their shared triggerClassName prop (spec §5.5). */
const TRIGGER_CLASS = "min-h-11 md:pointer-fine:min-h-8";
const CHIP_CLASS =
  "inline-flex min-h-11 items-center gap-1 rounded-full bg-secondary pl-3 pr-1 text-sm text-secondary-foreground md:pointer-fine:min-h-8";
const CHIP_REMOVE_CLASS =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-secondary-foreground/70 hover:text-secondary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:pointer-fine:size-8";

/**
 * Moves keyboard focus after a chip list changes, so a keyboard user never
 * lands on `<body>` (spec §5.2): removing a chip focuses the next chip's
 * remove button, else the previous one, else the add control; reaching the
 * 10-item cap (the add control disappearing) focuses the last chip's remove
 * button.
 */
function useChipFocus(count: number) {
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const addWrapRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(count);
  const pendingRemoveIndexRef = useRef<number | null>(null);

  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = count;
    if (count < prevCount && pendingRemoveIndexRef.current !== null) {
      const index = pendingRemoveIndexRef.current;
      pendingRemoveIndexRef.current = null;
      const target = chipRefs.current[index] ?? chipRefs.current[index - 1] ?? null;
      if (target) {
        target.focus();
      } else {
        addWrapRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    } else if (count > prevCount && count === FAVOURITES_LIMIT) {
      // Just reached the 10-item cap: the add control has just unmounted.
      chipRefs.current[count - 1]?.focus();
    }
  }, [count]);

  return {
    chipRefs,
    addWrapRef,
    markRemoved: (index: number) => {
      pendingRemoveIndexRef.current = index;
    },
  };
}

function RegionsGroup({
  regions,
  setRegions,
  regionOptions,
}: {
  regions: FavouriteRegion[];
  setRegions: (updater: (list: FavouriteRegion[]) => FavouriteRegion[]) => void;
  regionOptions: FavouriteRegion[];
}) {
  const { chipRefs, addWrapRef, markRemoved } = useChipFocus(regions.length);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm leading-none font-medium">{FAVOURITE_REGIONS_LABEL}</legend>
      <p className="text-xs text-muted-foreground">{FAVOURITES_HINT}</p>
      {regions.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {regions.map((r, i) => {
            const label = regionLabel(r);
            return (
              <li key={r.id} className={CHIP_CLASS}>
                {label}
                <button
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => {
                    markRemoved(i);
                    setRegions((list) => withoutFavourite(list, r.id));
                  }}
                  className={CHIP_REMOVE_CLASS}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {canAddFavourite(regions) ? (
        <div ref={addWrapRef}>
          <ReferenceCombobox
            formFieldName="__favourite_region_pick"
            options={unchosen(regionOptions, regions).map((r) => ({ id: r.id, name: regionLabel(r) }))}
            value=""
            onValueChange={(id) => {
              const picked = regionOptions.find((o) => o.id === id);
              if (picked) setRegions((list) => withFavourite(list, picked));
            }}
            placeholder={ADD_REGION_PLACEHOLDER}
            createLabel="Regions"
            triggerClassName={TRIGGER_CLASS}
          />
        </div>
      ) : null}
      <input
        type="hidden"
        name={FAVOURITE_REGION_IDS_FIELD}
        value={serializeFavouriteIds(regions)}
      />
    </fieldset>
  );
}

function ProducersGroup({
  producers,
  setProducers,
}: {
  producers: FavouriteProducer[];
  setProducers: (updater: (list: FavouriteProducer[]) => FavouriteProducer[]) => void;
}) {
  const { chipRefs, addWrapRef, markRemoved } = useChipFocus(producers.length);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm leading-none font-medium">{FAVOURITE_PRODUCERS_LABEL}</legend>
      <p className="text-xs text-muted-foreground">{FAVOURITES_HINT}</p>
      {producers.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {producers.map((p, i) => (
            <li key={p.id} className={CHIP_CLASS}>
              {p.name}
              <button
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => {
                  markRemoved(i);
                  setProducers((list) => withoutFavourite(list, p.id));
                }}
                className={CHIP_REMOVE_CLASS}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canAddFavourite(producers) ? (
        <div ref={addWrapRef}>
          <SearchableCombobox
            formFieldName="__favourite_producer_pick"
            value=""
            selectedLabel={null}
            onValueChange={(id, name) => {
              if (id) setProducers((list) => withFavourite(list, { id, name }));
            }}
            search={async (q) => unchosen((await searchProducers(q)).map(({ id, name }) => ({ id, name })), producers)}
            placeholder={ADD_PRODUCER_PLACEHOLDER}
            createLabel="Producers"
            triggerClassName={TRIGGER_CLASS}
          />
        </div>
      ) : null}
      <input
        type="hidden"
        name={FAVOURITE_PRODUCER_IDS_FIELD}
        value={serializeFavouriteIds(producers)}
      />
    </fieldset>
  );
}

/**
 * The two favourites groups on /profile/edit (spec §5.2). Owns both lists in
 * state, initialised from `favourites`. When either the favourites read or
 * the region option list failed (`null`, D11), renders only a load notice
 * and no hidden inputs at all — the action then leaves favourites untouched
 * rather than risk saving an empty set over a real one.
 */
export function FavouritesFields({
  favourites,
  regionOptions,
}: {
  favourites: ProfileFavourites | null;
  regionOptions: FavouriteRegion[] | null;
}) {
  const [regions, setRegions] = useState<FavouriteRegion[]>(favourites?.regions ?? []);
  const [producers, setProducers] = useState<FavouriteProducer[]>(favourites?.producers ?? []);

  if (favourites === null || regionOptions === null) {
    return <p className="text-sm text-muted-foreground">{FAVOURITES_LOAD_ERROR}</p>;
  }

  return (
    <>
      <RegionsGroup regions={regions} setRegions={setRegions} regionOptions={regionOptions} />
      <ProducersGroup producers={producers} setProducers={setProducers} />
    </>
  );
}
