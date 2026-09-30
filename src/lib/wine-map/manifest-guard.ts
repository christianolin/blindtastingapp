// The production guard for NEXT_PUBLIC_WINE_MAP_MANIFEST_URL (manifest.ts).
// That override exists only for a LOCAL build that loads a draft tiles
// release. NEXT_PUBLIC_ values are inlined at build time, so if it ever
// reached Vercel's production environment every visitor would fetch the draft
// path (public/wine-map-draft is gitignored, so a 404) and get the map's error
// card, with one console line as the only warning (review 2026-09-30).
// next.config.ts calls this and fails the build instead. VERCEL_ENV, not
// NODE_ENV: a local `next build && next start` of a draft is production to
// Node, and is exactly what the override is for. Plain module, no imports:
// next.config.ts loads it.

/** Why this build must not go ahead, or null. */
export function manifestOverrideBuildError(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const value = env.NEXT_PUBLIC_WINE_MAP_MANIFEST_URL?.trim();
  if (!value) return null;
  return `NEXT_PUBLIC_WINE_MAP_MANIFEST_URL is set ("${value}") on a Vercel production build. It is for a local check of a draft tiles release only; remove it from the production environment.`;
}
