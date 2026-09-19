import { cn } from "@/lib/utils";

// The bottle photo at the start of a wine row: the cellar list, the catalog
// list and the cellar history all use this one box, so a row looks the same
// wherever a wine is listed. Rounded and bordered like the grid's
// HatchThumb, object-contain on a card ground so a label never crops, and
// the same hatch fallback for a wine with no photo. The caller sets the size
// (e.g. "h-14 w-10" in a laptop table, "h-12 w-9" in a phone card).
//
// Photos are full-size uploads, so the image is lazy and decoded off the main
// thread: a long list only fetches the rows that scroll into view.
export function BottleThumb({
  src,
  className,
}: {
  src: string | null;
  className: string;
}): React.JSX.Element {
  const box = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-[4px] border border-border",
    className,
  );
  if (!src) {
    return <span className={cn(box, "hatch")} aria-hidden />;
  }
  return (
    <span className={cn(box, "bg-card")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
    </span>
  );
}
