// Top-level nav data — a plain (server-safe) module so both the server AppHeader
// and the client AppNav/MobileNav can import the array as a real value. Kept out
// of app-nav.tsx ("use client"): a value imported from a client module across
// the server boundary becomes a client reference, so spreading it server-side
// (AppHeader building the admin-aware list) threw "NAV_LINKS is not iterable".

export type NavLink = { href: string; label: string; match: string[] };

// Flat links, no dropdowns and no nav pages (owner UX brief 2026-07-23). Each
// destination uses in-page tabs for its subsections. Profile isn't a link here —
// it's the avatar chip in AppHeader.
export const NAV_LINKS: NavLink[] = [
  { href: "/taste", label: "Taste", match: ["/taste", "/tastings"] },
  {
    href: "/knowledge/map",
    label: "Knowledge",
    match: ["/knowledge", "/rules"],
  },
  { href: "/catalog", label: "Catalog", match: ["/catalog"] },
  { href: "/people", label: "Friends", match: ["/people", "/friends"] },
];

// A link is active when the current path is one of its section roots or sits
// underneath one — so /tastings/[id] keeps "Tastings" lit and /rules keeps
// "Knowledge" lit.
export function isNavActive(pathname: string, link: NavLink) {
  return link.match.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
