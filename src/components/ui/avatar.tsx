import { cn } from "@/lib/utils";

// Image avatar with an initial-letter fallback — matches the inline pattern
// already used in AppHeader / profile / community (src presence, not onError).
const SIZES = {
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-12 text-lg",
} as const;

export function Avatar({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initial = (name ?? "").trim().slice(0, 1).toUpperCase() || "?";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
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
