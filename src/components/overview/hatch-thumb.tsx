import { cn } from "@/lib/utils";
import { StorageImg } from "@/components/storage-img";

// A bottle/cover thumbnail: the real image when there is one, otherwise the
// parchment hatch that the whole redesign uses as its empty-image state.
export function HatchThumb({
  src,
  alt = "",
  width,
  height,
  className,
  renderWidth,
}: {
  src: string | null;
  alt?: string;
  width: number | string;
  height: number | string;
  className?: string;
  /** The drawn width in CSS px when `width` is not a number (e.g. "100%"). */
  renderWidth?: number;
}) {
  const box = cn(
    "block shrink-0 overflow-hidden rounded-[4px] border border-border",
    className,
  );
  const style = { width, height };
  return src ? (
    <StorageImg
      renderWidth={renderWidth ?? (typeof width === "number" ? width : 128)}
      src={src}
      alt={alt}
      className={cn(box, "object-cover")}
      style={style}
    />
  ) : (
    <span className={cn(box, "hatch")} style={style} aria-hidden />
  );
}
