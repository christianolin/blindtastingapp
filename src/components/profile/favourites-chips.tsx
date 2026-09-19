// Displays a profile's favourite regions and producers (profile-favourites
// spec §5.4). A plain server-renderable component — no "use client", no
// hooks — so a server page (the main session's /u/<id> at merge, §5.8) can
// render it directly with data from getProfileFavourites
// (@/lib/profile-favourites). Chips link nowhere for now (D14) and are not
// interactive, so no 44px tap-size rule applies to them.
import {
  FAVOURITE_PRODUCERS_LABEL,
  FAVOURITE_REGIONS_LABEL,
  regionLabel,
  type ProfileFavourites,
} from "@/lib/profile-favourites";
import { cn } from "@/lib/utils";

function ChipGroup({
  label,
  items,
  align,
}: {
  label: string;
  items: string[];
  align: "start" | "center";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul
        aria-label={label}
        className={cn("mt-1.5 flex flex-wrap gap-1.5", align === "center" && "justify-center")}
      >
        {items.map((item) => (
          <li
            key={item}
            className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renders nothing when `favourites` is null (a failed read, D11) or both
 * lists are empty — the owner's empty state is "show nothing". Otherwise up
 * to two groups, regions before producers, each only when non-empty.
 */
export function FavouritesChips({
  favourites,
  align = "start",
  className,
}: {
  favourites: ProfileFavourites | null;
  align?: "start" | "center";
  className?: string;
}) {
  if (favourites === null) return null;
  const { regions, producers } = favourites;
  if (regions.length === 0 && producers.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <ChipGroup label={FAVOURITE_REGIONS_LABEL} items={regions.map((r) => regionLabel(r))} align={align} />
      <ChipGroup label={FAVOURITE_PRODUCERS_LABEL} items={producers.map((p) => p.name)} align={align} />
    </div>
  );
}
