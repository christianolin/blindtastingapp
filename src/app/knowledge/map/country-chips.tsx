"use client";

// Country chips (spec 2026-09-23 §7.1, §7.3). A tap focuses a country's
// subregions without selecting it, so the details panel and ?place= stay. It
// flies there only when the country is off screen. The row is a single tab
// stop (roving tabindex, arrows move) in one scrolling line with faded edges.
// The chip whose subregions are actually drawn is marked by shape, a glyph and
// an sr-only phrase, never by aria-pressed: these are navigation, not toggles.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chipScrollLeft,
  rovingIndex,
  type CountryChip,
} from "@/lib/wine-map/country-chips";

const SKELETON_CHIPS = 5;

/** Scroll the row, not the page, so a chip sits clear of the faded edges. The
    page column is itself a scroll container, and scrollIntoView would move it
    too. */
function scrollChipIntoView(scroller: HTMLElement, chip: HTMLElement) {
  const left = chipScrollLeft({
    chipLeft: chip.offsetLeft,
    chipWidth: chip.offsetWidth,
    scrollLeft: scroller.scrollLeft,
    viewWidth: scroller.clientWidth,
  });
  if (left === null) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
}

export function CountryChips({
  chips,
  markedKey,
  loading,
  onChoose,
}: {
  chips: CountryChip[];
  /** The country whose subregions are drawn right now (One country only). */
  markedKey: string | null;
  /** The place tree is still loading: placeholders hold the row's height. */
  loading: boolean;
  onChoose: (key: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  // The tab stop is the last chip the viewer moved to, else the marked one,
  // else the first.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const has = (key: string | null): key is string =>
    key !== null && chips.some((chip) => chip.key === key);
  const tabKey = has(activeKey)
    ? activeKey
    : has(markedKey)
      ? markedKey
      : (chips[0]?.key ?? null);

  // A focus that moves to a country whose chip is scrolled out of sight (a pan
  // across a border, a chip flight landing) brings that chip into view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = markedKey ? chipRefs.current.get(markedKey) : undefined;
    if (scroller && chip) scrollChipIntoView(scroller, chip);
  }, [markedKey, chips]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = rovingIndex(event.key, index, chips.length, "horizontal");
    if (next === null) return;
    event.preventDefault();
    const key = chips[next].key;
    setActiveKey(key);
    const chip = chipRefs.current.get(key);
    if (!chip) return;
    chip.focus({ preventScroll: true });
    if (scrollerRef.current) scrollChipIntoView(scrollerRef.current, chip);
  };

  const empty = loading || chips.length === 0;
  return (
    <div
      ref={scrollerRef}
      role="toolbar"
      aria-label="Countries"
      aria-hidden={empty ? true : undefined}
      className="no-scrollbar relative flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto px-3 [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%_-_12px),transparent)] md:h-8"
    >
      {loading
        ? Array.from({ length: SKELETON_CHIPS }, (_, i) => (
            <span key={i} className="h-7 w-16 shrink-0 animate-pulse rounded-full bg-muted" />
          ))
        : chips.map((chip, index) => {
            const marked = chip.key === markedKey;
            return (
              <button
                key={chip.key}
                ref={(element) => {
                  if (element) chipRefs.current.set(chip.key, element);
                  else chipRefs.current.delete(chip.key);
                }}
                type="button"
                tabIndex={chip.key === tabKey ? 0 : -1}
                onFocus={() => setActiveKey(chip.key)}
                onClick={() => onChoose(chip.key)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs outline-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:h-7",
                  marked
                    ? "border-foreground font-semibold text-foreground ring-1 ring-foreground"
                    : "border-border font-medium text-muted-foreground hover:text-foreground",
                  chip.count === 0 ? "border-dashed opacity-70" : "",
                )}
              >
                {marked ? <Layers className="size-3.5" aria-hidden /> : null}
                <span lang={chip.lang}>{chip.label}</span>
                {chip.count !== null ? (
                  <span className="tabular-nums text-muted-foreground">
                    {chip.count}
                    <span className="sr-only"> places</span>
                  </span>
                ) : null}
                {marked ? <span className="sr-only">, subregions shown</span> : null}
              </button>
            );
          })}
    </div>
  );
}
