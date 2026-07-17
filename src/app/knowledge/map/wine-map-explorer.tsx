"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type WineMapNode = Database["public"]["Tables"]["wine_map_nodes"]["Row"];

// Hand-positioned schematic layout for appellations under a given region, by
// slug — NOT geographically precise, just a simplified diagram conveying real
// relative positions (Left Bank communes running north–south along the
// Gironde, Graves/Sauternes south of the city, Saint-Émilion/Pomerol on the
// Right Bank). A region with no entry here just skips the diagram and shows
// the plain clickable list instead — that's the extension point for adding
// a new region's map later without needing one.
const REGION_LAYOUTS: Record<
  string,
  {
    viewBox: string;
    river: string;
    cityLabel?: { x: number; y: number; label: string };
    boxes: Record<string, { x: number; y: number; w: number; h: number }>;
  }
> = {
  bordeaux: {
    viewBox: "0 0 320 480",
    // A loose river shape: Gironde estuary running south, splitting into the
    // Garonne (continuing south) and Dordogne (bending southeast).
    river:
      "M150 0 L170 0 L172 260 Q172 270 180 275 L300 340 L295 350 L172 285 Q160 290 160 300 L165 470 L150 470 L145 300 Q145 285 135 278 L20 350 L14 340 L140 268 Q150 262 150 250 Z",
    cityLabel: { x: 158, y: 272, label: "Bordeaux" },
    boxes: {
      medoc: { x: 40, y: 20, w: 100, h: 32 },
      "haut-medoc": { x: 40, y: 62, w: 100, h: 30 },
      "saint-estephe": { x: 85, y: 104, w: 100, h: 28 },
      pauillac: { x: 85, y: 144, w: 100, h: 28 },
      "saint-julien": { x: 85, y: 184, w: 100, h: 28 },
      margaux: { x: 85, y: 224, w: 100, h: 28 },
      "pessac-leognan": { x: 40, y: 300, w: 110, h: 28 },
      graves: { x: 40, y: 336, w: 110, h: 28 },
      sauternes: { x: 60, y: 400, w: 100, h: 28 },
      barsac: { x: 60, y: 436, w: 100, h: 28 },
      "saint-emilion": { x: 200, y: 300, w: 100, h: 28 },
      pomerol: { x: 200, y: 336, w: 100, h: 28 },
    },
  },
};

export function WineMapExplorer({ nodes }: { nodes: WineMapNode[] }) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, WineMapNode[]>();
    for (const n of nodes) {
      const key = n.parent_id;
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return map;
  }, [nodes]);

  const countries = childrenByParent.get(null) ?? [];
  const [countryId, setCountryId] = useState<string | null>(
    countries[0]?.id ?? null,
  );
  const regions = countryId ? (childrenByParent.get(countryId) ?? []) : [];
  const [regionId, setRegionId] = useState<string | null>(
    regions[0]?.id ?? null,
  );
  const appellations = regionId ? (childrenByParent.get(regionId) ?? []) : [];

  // What the detail panel currently shows — defaults to the region itself
  // (regions are clickable content too, not just navigation), and resets
  // whenever the region changes.
  const [focusedId, setFocusedId] = useState<string | null>(regionId);

  const byId = useMemo(() => {
    const map = new Map<string, WineMapNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const selectedRegion = regionId ? byId.get(regionId) : null;
  const layout = selectedRegion ? REGION_LAYOUTS[selectedRegion.slug] : null;
  const focused = focusedId ? byId.get(focusedId) : null;

  function selectCountry(id: string) {
    setCountryId(id);
    const firstRegion = childrenByParent.get(id)?.[0]?.id ?? null;
    setRegionId(firstRegion);
    setFocusedId(firstRegion);
  }

  function selectRegion(id: string) {
    setRegionId(id);
    setFocusedId(id);
  }

  if (countries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No wine map content yet — check back soon.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {countries.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => selectCountry(c.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              c.id === countryId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {regions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectRegion(r.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                r.id === regionId
                  ? "border-gold-deep bg-gold/15 text-gold-deep"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 pt-6">
            {layout ? (
              <svg
                viewBox={layout.viewBox}
                className="w-full max-w-xs mx-auto"
                role="img"
                aria-label={`Map of ${selectedRegion?.name}`}
              >
                <path
                  d={layout.river}
                  className="fill-[#c3a25b]/12 stroke-[#c3a25b]/40"
                  strokeWidth={1}
                />
                {layout.cityLabel ? (
                  <g>
                    <circle
                      cx={layout.cityLabel.x}
                      cy={layout.cityLabel.y}
                      r={2.5}
                      className="fill-muted-foreground"
                    />
                    <text
                      x={layout.cityLabel.x + 6}
                      y={layout.cityLabel.y + 3}
                      className="fill-muted-foreground text-[8px]"
                    >
                      {layout.cityLabel.label}
                    </text>
                  </g>
                ) : null}
                {appellations.map((a) => {
                  const box = layout.boxes[a.slug];
                  if (!box) return null;
                  const isSelected = focusedId === a.id;
                  return (
                    <g
                      key={a.id}
                      onClick={() => setFocusedId(a.id)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={box.x}
                        y={box.y}
                        width={box.w}
                        height={box.h}
                        rx={6}
                        className={cn(
                          "transition-colors",
                          isSelected
                            ? "fill-primary stroke-primary"
                            : "fill-primary/10 stroke-primary/40 hover:fill-primary/20",
                        )}
                        strokeWidth={1}
                      />
                      <text
                        x={box.x + box.w / 2}
                        y={box.y + box.h / 2 + 3}
                        textAnchor="middle"
                        className={cn(
                          "select-none text-[9px] font-medium",
                          isSelected ? "fill-primary-foreground" : "fill-foreground",
                        )}
                      >
                        {a.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : null}

            {/* Plain clickable list — always shown, both as a mobile-
                friendly alternative to the diagram and as the fallback for
                any region without a hand-tuned layout yet. */}
            <div className="flex flex-wrap gap-2">
              {appellations.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setFocusedId(a.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    focusedId === a.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            {!focused ? (
              <p className="text-sm text-muted-foreground">
                Select a region or appellation to see details.
              </p>
            ) : (
              <>
                <div>
                  <Badge variant="secondary" className="mb-1.5">
                    {focused.level === "COUNTRY"
                      ? "Country"
                      : focused.level === "REGION"
                        ? "Region"
                        : "Appellation"}
                  </Badge>
                  <h2 className="font-heading text-xl font-semibold">
                    {focused.name}
                  </h2>
                </div>
                {focused.description ? (
                  <p className="text-sm text-muted-foreground">
                    {focused.description}
                  </p>
                ) : null}
                <dl className="flex flex-col gap-2 text-sm">
                  {focused.climate ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Climate
                      </dt>
                      <dd>{focused.climate}</dd>
                    </div>
                  ) : null}
                  {focused.grape_varieties ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Main grape varieties
                      </dt>
                      <dd>{focused.grape_varieties}</dd>
                    </div>
                  ) : null}
                  {focused.wine_styles ? (
                    <div>
                      <dt className="text-xs font-medium text-muted-foreground">
                        Wine styles
                      </dt>
                      <dd>{focused.wine_styles}</dd>
                    </div>
                  ) : null}
                </dl>
                {focused.key_facts && focused.key_facts.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Key facts
                    </p>
                    <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                      {focused.key_facts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
