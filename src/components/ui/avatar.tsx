import { cn } from "@/lib/utils";
import { StorageImg } from "@/components/storage-img";

// Image avatar with an initial-letter fallback — matches the inline pattern
// already used in AppHeader / profile / community (src presence, not onError).
const SIZES = {
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-12 text-lg",
} as const;

// The drawn width (CSS px) of each size, so the photo is fetched at that size
// (StorageImg). A caller that enlarges the avatar with className passes
// renderWidth too.
const RENDER_WIDTH = { sm: 24, md: 32, lg: 48 } as const;

export function Avatar({
  src,
  name,
  size = "md",
  className,
  renderWidth,
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  renderWidth?: number;
}) {
  const initial = (name ?? "").trim().slice(0, 1).toUpperCase() || "?";
  return src ? (
    <StorageImg
      renderWidth={renderWidth ?? RENDER_WIDTH[size]}
      src={src}
      alt=""
      className={cn(
        "shrink-0 rounded-full object-cover ring-1 ring-border",
        SIZES[size],
        className,
      )}
    />
  ) : (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground ring-1 ring-border",
        SIZES[size],
        className,
      )}
    >
      {initial}
    </span>
  );
}
