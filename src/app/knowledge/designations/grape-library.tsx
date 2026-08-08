"use client";

import { useState } from "react";
import Link from "next/link";
import { Grape as GrapeIcon, LayoutList, Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GrapeLineageTree } from "./grape-lineage-tree";

export type GrapeRow = {
  id: string;
  name: string;
  color: string | null;
  skin_color: string | null;
  description: string | null;
  typical_aromas: string | null;
  typical_acidity: string | null;
  typical_tannin: string | null;
  typical_body: string | null;
  typical_alcohol: string | null;
  main_regions: string | null;
};

const COLOR_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "RED", label: "Red" },
  { value: "WHITE", label: "White" },
] as const;

const dot = (c: string | null) =>
  c === "RED" ? "#7E1B26" : c === "WHITE" ? "#B78E42" : "#8A8A85";

// The Grapes section, as a client panel (search + colour filter + cards) so it
// lives inside the instant Library tab shell. Mirrors the standalone grape page
// minus its desktop jump-nav.
export function GrapeLibrary({
  grapes,
  placesByGrape,
}: {
  grapes: GrapeRow[];
  placesByGrape: Record<string, { name: string; key: string }[]>;
}) {
  const [q, setQ] = useState("");
  const [color, setColor] = useState<"ALL" | "RED" | "WHITE">("ALL");
  const [view, setView] = useState<"cards" | "lineage">("cards");
  // name -> card id, so the lineage tree can deep-link a known grape to its
  // profile card below.
  const grapeIds = Object.fromEntries(grapes.map((g) => [g.name, g.id]));
  const needle = q.trim().toLowerCase();
  const filtered = grapes.filter(
    (g) =>
      (color === "ALL" || g.color === color) &&
      (!needle || g.name.toLowerCase().includes(needle)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Grapes
          </h2>
          <p className="mt-1 text-muted-foreground">
            The same grape list used across every tasting, with tasting notes for
            the most common varieties.
          </p>
        </div>
        {/* Two ways to read the grapes: profile cards, or the parentage tree. */}
        <div className="flex shrink-0 gap-1 rounded-lg bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => setView("cards")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "cards"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutList className="size-4" /> Cards
          </button>
          <button
            type="button"
            onClick={() => setView("lineage")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === "lineage"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Network className="size-4" /> Lineage
          </button>
        </div>
      </div>

      {view === "lineage" ? (
        <GrapeLineageTree
          grapeIds={grapeIds}
          onOpenCard={(id) => {
            // Cards carry the anchors; flip to them, then jump once painted.
            setView("cards");
            requestAnimationFrame(() =>
              document.getElementById(`grape-${id}`)?.scrollIntoView(),
            );
          }}
        />
      ) : null}

      <div className={cn("flex gap-8", view === "lineage" && "hidden")}>
        <nav className="sticky top-20 hidden h-[calc(100vh-6rem)] w-52 shrink-0 flex-col overflow-y-auto lg:flex">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
            {filtered.length} grape{filtered.length === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-col">
            {filtered.map((g) => (
              <li key={g.id}>
                <a
                  href={`#grape-${g.id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <GrapeIcon
                    className="size-4 shrink-0"
                    style={{ color: dot(g.color) }}
                  />
                  <span className="truncate">{g.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search grapes"
          className="sm:max-w-xs"
        />
        <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
          {COLOR_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setColor(f.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                color === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No grapes found.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((g) => (
            <Card key={g.id} id={`grape-${g.id}`} className="scroll-mt-24">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GrapeIcon
                    className="size-5 shrink-0"
                    style={{ color: dot(g.color) }}
                  />
                  {g.name}
                  {g.color ? (
                    <Badge
                      variant="secondary"
                      className={
                        g.color === "RED"
                          ? "bg-primary/10 text-primary"
                          : "bg-gold/15 text-gold-deep"
                      }
                    >
                      {g.color === "RED" ? "Red" : "White"}
                    </Badge>
                  ) : null}
                </CardTitle>
                {g.skin_color ? (
                  <p className="text-xs text-muted-foreground">
                    Skin: {g.skin_color}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent>
                {g.description ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      {g.description}
                    </p>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                      {g.typical_aromas ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Typical aromas
                          </dt>
                          <dd>{g.typical_aromas}</dd>
                        </div>
                      ) : null}
                      {g.typical_acidity ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Acidity
                          </dt>
                          <dd>{g.typical_acidity}</dd>
                        </div>
                      ) : null}
                      {g.typical_tannin ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Tannin
                          </dt>
                          <dd>{g.typical_tannin}</dd>
                        </div>
                      ) : null}
                      {g.typical_body ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">Body</dt>
                          <dd>{g.typical_body}</dd>
                        </div>
                      ) : null}
                      {g.typical_alcohol ? (
                        <div>
                          <dt className="text-xs text-muted-foreground">
                            Alcohol
                          </dt>
                          <dd>{g.typical_alcohol}</dd>
                        </div>
                      ) : null}
                      {g.main_regions ? (
                        <div className="col-span-2 sm:col-span-3">
                          <dt className="text-xs text-muted-foreground">
                            Main growing regions
                          </dt>
                          <dd>{g.main_regions}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No profile yet.
                  </p>
                )}
                {(placesByGrape[g.id] ?? []).length > 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    On the wine map:{" "}
                    {(placesByGrape[g.id] ?? []).slice(0, 6).map((p, i) => (
                      <span key={p.key}>
                        {i > 0 ? " · " : ""}
                        <Link
                          className="text-primary transition-colors hover:text-primary/80"
                          href={`/knowledge/map?place=${p.key}`}
                        >
                          {p.name}
                        </Link>
                      </span>
                    ))}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
