// The phone-only meta line under the Next-up banner's title (Overview phone
// layout revision, 2026-09-12): "You're hosting · 3 glasses so far" or
// "Hosted by Gustav · No glasses yet". From `md` up the banner says the host
// in its eyebrow and draws the flight as numbered slots instead.
//
// Relative imports only: vitest has no "@/" alias.
import { glassesSoFarPhrase, joinEyebrow } from "../../lib/tasting-eyebrow";

/**
 * Glasses in the flight so far, from the banner's `nextWinePosition` (the
 * flight's wine count + 1). That count covers every wine in the tasting for
 * both wine sources, unlike the filled `slots`: for bring-your-own those count
 * the people who have brought a bottle, not the bottles.
 */
export function nextUpGlassCount(nextWinePosition: number): number {
  if (!Number.isFinite(nextWinePosition)) return 0;
  return Math.max(0, Math.floor(nextWinePosition) - 1);
}

export function nextUpMeta({
  hosting,
  hostName,
  nextWinePosition,
  joinedCount,
}: {
  hosting: boolean;
  hostName: string;
  nextWinePosition: number;
  /** JOINED participants. NextUpBanner does not carry this count yet, so the
      banner passes nothing and "{k} in" stays off until the data does. */
  joinedCount?: number | null;
}): string {
  return joinEyebrow([
    hosting ? "You're hosting" : `Hosted by ${hostName}`,
    glassesSoFarPhrase(nextUpGlassCount(nextWinePosition)),
    joinedCount != null && joinedCount > 0 ? `${joinedCount} in` : null,
  ]);
}
