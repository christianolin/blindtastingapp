// The active-tasting banner's words (spec §8). Pure; English only, like the
// rest of the app shell. The status is sentence case here and shown in the
// mono Eyebrow style, which uppercases it with CSS.
import type { ActiveTastingState } from "./select";

export type BannerDot = "ping" | "still" | "none";
export type BannerTone = "running" | "waiting";

export type BannerCopy = {
  status: string;
  dot: BannerDot;
  tone: BannerTone;
  cta: string;
};

const BACK_TO_TASTING = "Back to the tasting";

const COPY: Record<ActiveTastingState, BannerCopy> = {
  live: { status: "Live now", dot: "ping", tone: "running", cta: BACK_TO_TASTING },
  paused: { status: "Paused", dot: "still", tone: "running", cta: BACK_TO_TASTING },
  "in-progress": {
    status: "In progress",
    dot: "still",
    tone: "running",
    cta: BACK_TO_TASTING,
  },
  waiting: {
    status: "Waiting to start",
    dot: "none",
    tone: "waiting",
    cta: "Back to the lobby",
  },
};

export function bannerCopy(state: ActiveTastingState): BannerCopy {
  return COPY[state];
}

/** The strip's accessible section name. */
export const BANNER_LABEL = "Your tasting";

/** Where "+N more" goes: /taste, whose All tab lists every tasting. */
export const MORE_HREF = "/taste";

export function moreLabel(n: number): string {
  return `+${n} more`;
}

/** Starts with the visible text, so a voice command naming it still matches (WCAG 2.5.3). */
export function moreAriaLabel(n: number): string {
  return `${moreLabel(n)} ${n === 1 ? "tasting" : "tastings"} in Taste`;
}
