// Top-level nav data — a plain (server-safe) module so the server shell and the
// client sidebar / mobile drawer can all import the array as a real value.
// Kept out of any "use client" module: a value imported from a client module
// across the server boundary becomes a client reference and isn't iterable
// server-side.

export type NavChild = { href: string; label: string };
export type NavLink = {
  key: string;
  href: string;
  label: string;
  match: string[];
  // Real sub-pages under the pillar, surfaced as sidebar sub-nav to cut clicks.
  children?: NavChild[];
};

// The five pillars (owner UX brief). Sub-nav lists only pages that exist today.
export const NAV_LINKS: NavLink[] = [
  { key: "taste", href: "/taste", label: "Taste", match: ["/taste", "/tastings"] },
  {
    key: "catalog",
    href: "/catalog",
    label: "Catalog",
    match: ["/catalog"],
    children: [{ href: "/catalog/new", label: "Add a wine" }],
  },
  {
    key: "cellar",
    href: "/cellar",
    label: "Cellar",
    match: ["/cellar"],
    children: [
      { href: "/cellar/new", label: "Add a wine" },
      { href: "/cellar/import", label: "Import CSV" },
    ],
  },
  {
    key: "learn",
    href: "/knowledge/map",
    label: "Learn",
    match: ["/knowledge", "/rules"],
    children: [
      { href: "/knowledge/archetypes", label: "Typical wines" },
      { href: "/knowledge/grapes", label: "Grapes" },
      { href: "/knowledge/type-designations", label: "Designations" },
      { href: "/rules", label: "Rules" },
    ],
  },
  {
    key: "community",
    href: "/community",
    label: "Community",
    match: ["/community", "/people", "/friends"],
  },
];

// Managers (ADMIN / CONTRIBUTOR) get an extra Admin pillar appended.
export function navWithAdmin(isManager: boolean): NavLink[] {
  return isManager
    ? [
        ...NAV_LINKS,
        { key: "admin", href: "/admin", label: "Admin", match: ["/admin"] },
      ]
    : NAV_LINKS;
}

// A link is active when the current path is one of its section roots or sits
// underneath one — so /tastings/[id] keeps "Taste" lit and /rules keeps "Learn"
// lit.
export function isNavActive(pathname: string, link: { match: string[] }) {
  return link.match.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}
