import { cn } from "@/lib/utils";
import type { DistributionItem } from "@/lib/overview-types";
import { Eyebrow } from "./eyebrow";

// Series colours in the redesign's fixed order — bordeaux, rose, gold, ink.
// Validated against the card surface: adjacent pairs stay apart under every
// colour-vision simulation in THIS order, so never reorder or cycle it. Gold's
// low contrast is relieved by the legend, the 2px gaps and the segment titles.
const SERIES = ["bg-primary", "bg-rose", "bg-gold", "bg-muted-foreground"];

/**
 * The pattern the whole design reuses for "share of a whole": an optional
 * caption, a rounded track holding proportional segments, and a spaced legend
 * of "Label count". Callers pass at most four items (fold the rest with
 * `foldOther`).
 */
export function DistributionBar({
  caption,
  captionStyle = "eyebrow",
  items,
  height = 7,
  countPrefix = "",
  className,
}: {
  caption?: string;
  captionStyle?: "eyebrow" | "bold";
  items: DistributionItem[];
  height?: 6 | 7;
  /** Text before each legend count — "×" gives "1st ×2" (occurrences). */
  countPrefix?: string;
  className?: string;
}) {
  const total = items.reduce((n, i) => n + i.count, 0);
  return (
    <div className={cn("flex flex-col gap-[7px] max-md:gap-[5px]", className)}>
      {caption ? (
        captionStyle === "bold" ? (
          <span className="text-[11.5px] font-semibold">{caption}</span>
        ) : (
          <Eyebrow size="sm">{caption}</Eyebrow>
        )
      ) : null}
      <span
        className="flex gap-[2px] overflow-hidden rounded-full bg-muted"
        style={{ height }}
        role="img"
        aria-label={items.map((i) => `${i.label} ${i.count}`).join(", ")}
      >
        {total > 0
          ? items.map((item, i) => (
              <span
                key={item.label}
                title={`${item.label} · ${item.count}`}
                className={cn("h-full", SERIES[i % SERIES.length])}
                style={{ flex: `${item.count} 1 0%` }}
              />
            ))
          : null}
      </span>
      <span className="flex justify-between gap-2 text-[11px] text-muted-foreground max-md:text-[10.5px]">
        {items.map((i) => (
          <span key={i.label} className="truncate">
            {i.label} {countPrefix}
            {i.count}
          </span>
        ))}
      </span>
    </div>
  );
}
