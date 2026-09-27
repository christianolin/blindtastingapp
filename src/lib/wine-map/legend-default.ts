// Whether the wine map's legend starts open (spec
// 2026-09-27-desktop-map-layout-design M12, owner ruling). It used to open
// from 1024 px wide; at the owner's ~1675x865 window that covered about a
// third of the map by default, so it now also needs a tall window:
// 64rem x 56rem (1024 x 896 CSS px) and up. Decided once, when TileWineMap
// mounts; after that the Legend button alone opens and closes it. Phones
// (below md) stay closed, as before.

export const LEGEND_OPEN_QUERY = "(width >= 64rem) and (height >= 56rem)";

/** All the legend default needs of `window.matchMedia` (use-is-phone.ts's
    `browserMatchMedia()` fits). */
export type MatchesMedia = (query: string) => { readonly matches: boolean };

/** True when the window meets LEGEND_OPEN_QUERY. Closed without matchMedia. */
export function legendStartsOpen(matchMedia: MatchesMedia | null): boolean {
  return matchMedia ? matchMedia(LEGEND_OPEN_QUERY).matches : false;
}
