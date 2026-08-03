"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BurgundyHierarchy } from "@/lib/designations/burgundy";
import type { PyramidTier } from "@/lib/designations/content";

// Interactive Burgundy quality ladder: a true-pointed SVG pyramid whose tiers
// (and the labels beside them) are clickable; the selected tier expands below
// into its vineyards grouped by sub-region → village, collapsed by default so
// the ~650 Premier Cru climats never dump at once.
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

  const n = tiers.length;
  const W = 300;
  const H = 300;
  const bandH = H / n;
  const halfAt = (y: number) => (W / 2) * (y / H); // pointed apex at y=0
  const cx = W / 2;
  const select = (i: number) => {
    setActive(i);
    setOpenSub(null);
  };
  const activeTier = tiers[active];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full max-w-[300px]"
          role="img"
          aria-label="Burgundy quality pyramid"
        >
          {tiers.map((t, i) => {
            const yTop = i * bandH;
            const yBot = (i + 1) * bandH;
            const hwTop = halfAt(yTop);
            const hwBot = halfAt(yBot);
            const m = meta[i];
            return (
              <polygon
                key={t.key}
                points={`${cx - hwTop},${yTop} ${cx + hwTop},${yTop} ${cx + hwBot},${yBot} ${cx - hwBot},${yBot}`}
                fill={m?.color ?? "#8A3D52"}
                stroke="#ffffff"
                strokeWidth={2}
                opacity={i === active ? 1 : 0.8}
                className="cursor-pointer transition-opacity hover:opacity-100"
                onClick={() => select(i)}
              />
            );
          })}
        </svg>

        <ul className="flex flex-col gap-2">
          {tiers.map((t, i) => {
            const m = meta[i];
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => select(i)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                    i === active
                      ? "border-primary bg-muted/40"
                      : "border-border hover:bg-muted/30",
                  )}
                >
                  <span
                    className="mt-1 size-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: m?.color }}
                  />
                  <span className="min-w-0">
                    <span className="text-sm font-medium">
                      {t.label}
                      <span className="font-normal text-muted-foreground">
                        {" "}
                        · {t.count > 0 ? `${t.count} vineyards` : m?.count}
                      </span>
                    </span>
                    {m?.pct ? (
                      <span className="block text-xs text-muted-foreground">
                        {m.pct}
                      </span>
                    ) : null}
                    {m?.labelling ? (
                      <span className="block text-xs text-muted-foreground">
                        On the label: {m.labelling}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
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
