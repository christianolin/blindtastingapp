"use client";

import { useMemo, useState } from "react";
import type { BurgundyHierarchy } from "@/lib/designations/burgundy";
import type { PyramidTier } from "@/lib/designations/content";
import { PyramidBands } from "./pyramid-bands";
import { ClassificationTable, type ClassificationRow } from "./classification-table";

// Interactive Burgundy quality ladder: the shared band pyramid on the left,
// the selected tier's vineyards in the shared searchable table on the right —
// the same reading as the Bordeaux classification. (This replaced a nested
// accordion, which buried the ~640 Premier Cru climats two clicks deep and had
// no search.)
export function BurgundyPyramid({
  hierarchy,
  meta,
}: {
  hierarchy: BurgundyHierarchy;
  meta: PyramidTier[];
}) {
  const tiers = hierarchy.tiers;
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const activeTier = tiers[active];
  const activeMeta = meta[active];

  const bands = tiers.map((t, i) => ({
    key: t.key,
    label: t.label,
    count: t.count > 0 ? `${t.count} vineyards` : (meta[i]?.count ?? ""),
    color: meta[i]?.color ?? "#8A3D52",
    textColor: meta[i]?.textColor,
  }));

  // Flatten subregion → village → vineyard into table rows.
  const allRows = useMemo<ClassificationRow[]>(() => {
    if (!activeTier) return [];
    const out: ClassificationRow[] = [];
    for (const s of activeTier.subregions) {
      for (const v of s.villages) {
        for (const vy of v.vineyards) {
          out.push({
            id: vy.canonicalKey,
            cells: [vy.name, v.village || "—", s.subregion],
            placeKey: vy.canonicalKey,
            placeLabel: "Map",
          });
        }
      }
    }
    return out;
  }, [activeTier]);

  const q = query.trim().toLowerCase();
  const rows = q
    ? allRows.filter((r) =>
        r.cells.some((c) => (c ?? "").toLowerCase().includes(q)),
      )
    : allRows;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className="flex flex-col gap-3">
        <PyramidBands
          bands={bands}
          activeKey={activeTier?.key ?? null}
          onSelect={(key) => {
            const i = tiers.findIndex((t) => t.key === key);
            if (i >= 0) {
              setActive(i);
              setQuery("");
            }
          }}
        />
        {/* What the selected tier actually means — share of production and how
            it appears on a label. */}
        {activeMeta?.pct || activeMeta?.labelling ? (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">
              {activeTier?.label}
            </span>
            {activeMeta?.pct ? ` — ${activeMeta.pct}` : ""}
            {activeMeta?.labelling
              ? `. On the label: ${activeMeta.labelling}.`
              : ""}
          </p>
        ) : null}
      </div>

      {allRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Regional (Bourgogne) wines are blended from across the region rather
          than a single named vineyard, so there are no individual sites to list.
        </p>
      ) : (
        <ClassificationTable
          columns={["Vineyard", "Village", "Sub-region"]}
          rows={rows}
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Search vineyards, villages…"
          summary={
            q
              ? `${rows.length} of ${allRows.length}`
              : `All ${allRows.length} ${activeTier?.label ?? ""} sites`
          }
        />
      )}
    </div>
  );
}
