"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search, Wine, X } from "lucide-react";
import {
  searchPlaces,
  addPlacement,
  removePlacement,
  type PlaceHit,
} from "./actions";
import { ArchetypeEditor, type ArchetypeProfile } from "./archetype-editor";
import type { AromaTerm } from "@/lib/wset/types";

export type PlacementView = {
  placeId: string;
  name: string;
  kind: string;
  canonicalKey: string;
  sortOrder: number;
};
export type ArchetypeAdmin = ArchetypeProfile & {
  placements: PlacementView[];
};

const COLOUR_HEX: Record<string, string> = {
  RED: "#8E1F3B",
  WHITE: "#B78E42",
  ROSE: "#D98A9E",
  ORANGE: "#C0692E",
};
const KIND_LABEL: Record<string, string> = {
  COUNTRY: "Country",
  MACRO_REGION: "Macro region",
  REGION: "Region",
  SUBREGION: "Subregion",
  APPELLATION: "Appellation",
  SITE: "Site",
  VINEYARD: "Vineyard",
};

// A debounced place search that adds the chosen place to this archetype.
function AddPlace({
  archetypeId,
  existing,
  onDone,
}: {
  archetypeId: string;
  existing: Set<string>;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(() => {
      searchPlaces(value).then((results) => {
        setHits(results);
        setSearching(false);
      });
    }, 250);
  }, []);

  const add = (placeId: string) =>
    startTransition(async () => {
      await addPlacement(archetypeId, placeId);
      setQuery("");
      setHits([]);
      onDone();
    });

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Add a place…"
          className="w-40 bg-transparent text-sm outline-none"
        />
      </div>
      {query.trim().length >= 2 ? (
        <div className="absolute z-10 mt-1 max-h-64 w-72 overflow-auto rounded-md border border-border bg-popover shadow-md">
          {searching ? (
            <p className="p-2 text-xs text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground">No matches.</p>
          ) : (
            hits.map((h) => {
              const already = existing.has(h.id);
              return (
                <button
                  key={h.id}
                  type="button"
                  disabled={already || pending}
                  onClick={() => add(h.id)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span className="truncate">{h.name}</span>
                  <span className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                    {already ? "added" : KIND_LABEL[h.kind] ?? h.kind}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function PlacementEditor({
  archetypes,
  terms,
}: {
  archetypes: ArchetypeAdmin[];
  terms: AromaTerm[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const remove = (archetypeId: string, placeId: string) =>
    startTransition(async () => {
      await removePlacement(archetypeId, placeId);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {archetypes.map((a) => (
        <div key={a.id} className="rounded-lg border border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <Wine
                className="size-4 shrink-0"
                style={{ color: COLOUR_HEX[a.colour] ?? "#8A8A85" }}
              />
              <span className="truncate font-medium">{a.name}</span>
            </span>
            <button
              type="button"
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3.5" />
              {openId === a.id ? "Close" : "Edit profile"}
            </button>
          </div>
          <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Shown on
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {a.placements.length === 0 ? (
              <span className="text-xs text-muted-foreground">No places yet.</span>
            ) : (
              a.placements.map((p) => (
                <span
                  key={p.placeId}
                  title={p.canonicalKey}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-xs"
                >
                  {p.name}
                  <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                    {KIND_LABEL[p.kind] ?? p.kind}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => remove(a.id, p.placeId)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
            <AddPlace
              archetypeId={a.id}
              existing={new Set(a.placements.map((p) => p.placeId))}
              onDone={() => router.refresh()}
            />
          </div>

          {openId === a.id ? (
            <ArchetypeEditor archetype={a} terms={terms} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
