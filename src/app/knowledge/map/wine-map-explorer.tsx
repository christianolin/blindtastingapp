"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type WineMapNode = Database["public"]["Tables"]["wine_map_nodes"]["Row"];

// maplibre-gl touches `window` on import — must never be server-rendered.
const InteractiveWineMap = dynamic(
  () => import("./interactive-wine-map").then((m) => m.InteractiveWineMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-lg border bg-muted" />
    ),
  },
);

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
            <InteractiveWineMap
              region={selectedRegion ?? null}
              appellations={appellations}
              focusedId={focusedId}
              onFocus={setFocusedId}
            />

            {/* Plain clickable list — always shown, both as a mobile-
                friendly alternative to the diagram and as the fallback for
                any region without boundary data. */}
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
