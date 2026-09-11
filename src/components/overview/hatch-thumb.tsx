import { cn } from "@/lib/utils";

// A bottle/cover thumbnail: the real image when there is one, otherwise the
// parchment hatch that the whole redesign uses as its empty-image state.
export function HatchThumb({
  src,
  alt = "",
  width,
  height,
  className,
}: {
  src: string | null;
  alt?: string;
  width: number | string;
  height: number | string;
  className?: string;
}) {
  const box = cn(
    "block shrink-0 overflow-hidden rounded-[4px] border border-border",
    className,
  );
  const style = { width, height };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn(box, "object-cover")} style={style} />
  ) : (
    <span className={cn(box, "hatch")} style={style} aria-hidden />
  );
}
