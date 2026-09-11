// The two pages that hang off the signed-in person rather than a nav pillar.
// Shared by the desktop sidebar footer and the mobile drawer. A plain module
// (no "use client") so either side can import the array as a value.
export const PROFILE_LINKS = [
  { href: "/profile/numbers", label: "Your numbers" },
  { href: "/profile/edit", label: "Profile & settings" },
] as const;
