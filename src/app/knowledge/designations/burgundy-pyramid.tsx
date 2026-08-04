"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BurgundyHierarchy } from "@/lib/designations/burgundy";
import type { PyramidTier } from "@/lib/designations/content";
import { PyramidBands } from "./pyramid-bands";

// Interactive Burgundy quality ladder: the shared band pyramid (tier label +
// count set inside each band); selecting a tier expands its vineyards below,
// grouped by sub-region → village, collapsed by default so the ~640 Premier
// Cru climats never dump at once.
export function BurgundyPyramid({
  hierarchy,
  meta,
}: {
  hierarchy: BurgundyHierarchy;
  meta: PyramidTier[];
}) {
  const tiers = hierarchy.tiers;
  const [active, setActive] = useState(0);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const activeTier = tiers[active];
  const activeMeta = meta[active];

  const bands = tiers.map((t, i) => ({
    key: t.key,
    label: t.label,
    count: t.count > 0 ? `${t.count} vineyards` : meta[i]?.count ?? "",
    color: meta[i]?.color ?? "#8A3D52",
    textColor: meta[i]?.textColor,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <PyramidBands
        bands={bands}
        activeKey={activeTier?.key ?? null}
        onSelect={(key) => {
          const i = tiers.findIndex((t) => t.key === key);
          if (i >= 0) {
            setActive(i);
            setOpenSub(null);
          }
        }}
      />

      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">
            {activeTier.label}
            <span className="font-normal text-muted-foreground">
              {" "}
              —{" "}
              {activeTier.count > 0
                ? `${activeTier.count} vineyards`
                : "regional appellations"}
            </span>
          </h3>
          {activeMeta?.pct || activeMeta?.labelling ? (
            <p className="text-xs text-muted-foreground">
              {activeMeta?.pct}
              {activeMeta?.pct && activeMeta?.labelling ? " · " : ""}
              {activeMeta?.labelling
                ? `On the label: ${activeMeta.labelling}`
                : ""}
            </p>
          ) : null}
        </div>
        {activeTier.subregions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Regional (Bourgogne) wines are blended from across the region rather
            than a single named vineyard.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
            {activeTier.subregions.map((s) => {
              const isOpen = openSub === s.subregionKey;
              const total = s.villages.reduce(
                (a, v) => a + v.vineyards.length,
                0,
              );
              return (
                <div key={s.subregionKey}>
                  <button
                    type="button"
                    onClick={() => setOpenSub(isOpen ? null : s.subregionKey)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="text-sm font-medium">{s.subregion}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {total}
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="flex flex-col gap-2 px-3 pb-3">
                      {s.villages.map((v, vi) => (
                        <div key={v.village || vi}>
                          {v.village ? (
                            <p className="text-xs font-medium text-foreground">
                              {v.village}
                            </p>
                          ) : null}
                          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            {v.vineyards.map((vy) => (
                              <li key={vy.canonicalKey}>{vy.name}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
