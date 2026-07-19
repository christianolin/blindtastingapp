"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight } from "lucide-react";
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

// Navigation is depth-agnostic: appellations can nest inside other
// appellations (Margaux sits inside Haut-Médoc inside Bordeaux), so instead
// of fixed country/region/appellation tiers there's a single focused node,
// a breadcrumb of its ancestors, and a pill list of its children. The map
// always renders the focused node's whole REGION subtree (every depth at
// once), so a deeply nested shape stays directly clickable from the top.
export function WineMapExplorer({ nodes }: { nodes: WineMapNode[] }) {
  const { byId, childrenByParent } = useMemo(() => {
    const byId = new Map<string, WineMapNode>();
    const childrenByParent = new Map<string | null, WineMapNode[]>();
    for (const n of nodes) {
      byId.set(n.id, n);
      const key = n.parent_id;
      childrenByParent.set(key, [...(childrenByParent.get(key) ?? []), n]);
    }
    return { byId, childrenByParent };
  }, [nodes]);

  const countries = childrenByParent.get(null) ?? [];

  // Default focus: the first country's first region — lands the user on a
  // populated map (Bordeaux) rather than the boundary-less country node.
  const [focusedId, setFocusedId] = useState<string | null>(() => {
    const firstCountry = countries[0];
    if (!firstCountry) return null;
    return childrenByParent.get(firstCountry.id)?.[0]?.id ?? firstCountry.id;
  });

  const focused = focusedId ? (byId.get(focusedId) ?? null) : null;

  // Ancestor chain, root (country) first, focused node last.
  const breadcrumb = useMemo(() => {
    const chain: WineMapNode[] = [];
    let cursor: WineMapNode | null = focused;
    while (cursor) {
      chain.unshift(cursor);
      cursor = cursor.parent_id ? (byId.get(cursor.parent_id) ?? null) : null;
    }
    return chain;
  }, [focused, byId]);

  const countryId = breadcrumb[0]?.id ?? null;

  // The map's view root: the REGION ancestor of the focused node (so the
  // whole region stays in view while drilling), or the focused node itself
  // when focus is at country level (which shows its regions as shapes).
  const viewRoot = useMemo(() => {
    if (!focused) return null;
    if (focused.level === "COUNTRY") return focused;
    return breadcrumb.find((n) => n.level === "REGION") ?? focused;
  }, [focused, breadcrumb]);

  // Every descendant of the view root with its nesting depth (1 = direct
  // child). Depth drives both paint order and deepest-wins click handling.
  const mapItems = useMemo(() => {
    if (!viewRoot) return [];
    const out: { node: WineMapNode; depth: number }[] = [];
    const walk = (parentId: string, depth: number) => {
      for (const child of childrenByParent.get(parentId) ?? []) {
        out.push({ node: child, depth });
        walk(child.id, depth + 1);
      }
    };
    walk(viewRoot.id, 1);
    return out;
  }, [viewRoot, childrenByParent]);

  const children = focusedId ? (childrenByParent.get(focusedId) ?? []) : [];

  function selectCountry(id: string) {
    setFocusedId(childrenByParent.get(id)?.[0]?.id ?? id);
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

      {breadcrumb.length > 0 ? (
        <nav
          aria-label="Wine map breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          {breadcrumb.map((n, i) => {
            const isLast = i === breadcrumb.length - 1;
            return (
              <span key={n.id} className="flex items-center gap-1">
                {i > 0 ? (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                ) : null}
                {isLast ? (
                  <span className="font-medium text-foreground">{n.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFocusedId(n.id)}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {n.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 pt-6">
            <InteractiveWineMap
              viewRoot={viewRoot}
              items={mapItems}
              focusedId={focusedId}
              onFocus={setFocusedId}
            />

            {/* Children of the focused node — the drill-down affordance,
                and the fallback for nodes without boundary data. */}
            {children.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Within {focused?.name}:
                </span>
                {children.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setFocusedId(a.id)}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            ) : null}
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
