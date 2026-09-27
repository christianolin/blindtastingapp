// The level curve (spec §3.1, L5): threshold(L) = 25·L·(L−1) XP, capped at
// level 60 (88,500 XP). The same rule is public.level_for_xp in SQL; both are
// pinned to __fixtures__/curve.json (curve.test.ts here, scripts/levels.test.mjs
// there). Pure: no imports, so vitest and client components load it.

export const MAX_LEVEL = 60;

/** The XP at which `level` starts: 0 for level 1, 50 for 2, 88,500 for 60. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 25 * l * (l - 1);
}

/** The largest level ≤ 60 whose threshold is ≤ xp. The square root gives a
    first guess; the integer thresholds correct it by ±1, so no floating-point
    edge ever lands a person one level off. */
export function levelForXp(xp: number): number {
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  let v = Math.floor((1 + Math.sqrt(1 + (4 * x) / 25)) / 2);
  while (v > 1 && xpForLevel(v) > x) v -= 1;
  while (v < MAX_LEVEL && xpForLevel(v + 1) <= x) v += 1;
  return Math.min(Math.max(v, 1), MAX_LEVEL);
}

export type LevelProgress = {
  level: number;
  /** XP earned since this level started. */
  into: number;
  /** XP this level spans (0 at the top level). */
  span: number;
  /** 0..1; 1 at the top level. */
  fraction: number;
  /** The next level, or null at the top. */
  next: number | null;
};

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const x = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  if (level >= MAX_LEVEL) {
    return { level, into: x - xpForLevel(level), span: 0, fraction: 1, next: null };
  }
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  const into = x - start;
  return { level, into, span, fraction: into / span, next: level + 1 };
}
