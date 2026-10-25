// The one-time sharing notice on /overview (sharing-defaults spec 2026-09-27
// S4, S15, §7.5). Its wording follows the CURRENT cellar setting, never the
// flag alone: a variant names the cellar only while the flipped cellar is
// still Everyone — the CellarVisibilityControl rule that a label never claims
// a setting the row does not hold. Tasting notes have had no setting since
// 2026-10-25 (every note is public), so the notes flag alone decides them and
// no variant offers to change who reads them. Pure: a type-only import, relative paths.
import type { SharingAudience } from "../supabase/database.types";

export type SharingNoticeInput = {
  /** sharing_notices.cellar_flipped: M2 turned this cellar PRIVATE -> PUBLIC. */
  cellarFlipped: boolean;
  /** sharing_notices.notes_shared: a note with content became readable by others. */
  notesShared: boolean;
  /** profiles.cellar_visibility now. */
  cellar: SharingAudience;
  /** sharing_notices.dismissed_at. */
  dismissedAt: string | null;
};

/** `cta` (the settings link) is null when there is nothing to change. */
export type SharingNoticeCopy = { title: string; body: string; cta: string | null };

/** The fixed strings around the three variants. */
export const SHARING_NOTICE = {
  eyebrow: "Sharing",
  dismiss: "Got it",
  href: "/profile/edit#sharing",
} as const;

const BOTH: SharingNoticeCopy = {
  title: "Your cellar and tasting notes are now visible to everyone",
  body: "Other Blindr members can now see the bottles in your cellar and read the notes you write. You choose who sees your cellar in your settings.",
  cta: "Change who can see your cellar",
};
const NOTES_ONLY: SharingNoticeCopy = {
  title: "Your tasting notes are now visible to everyone",
  body: "Other Blindr members can now read the notes you write. Every tasting note on Blindr is public.",
  cta: null,
};
const CELLAR_ONLY: SharingNoticeCopy = {
  title: "Your cellar is now visible to everyone",
  body: "Other Blindr members can now see the bottles in your cellar. You choose who sees it in your settings.",
  cta: "Change who can see it",
};

/** The card's copy, or null when it must not show: dismissed, or nothing it
    would say is still true. */
export function sharingNoticeCopy(input: SharingNoticeInput): SharingNoticeCopy | null {
  if (input.dismissedAt !== null) return null;
  const cellar = input.cellarFlipped && input.cellar === "PUBLIC";
  const notes = input.notesShared;
  if (cellar && notes) return BOTH;
  if (notes) return NOTES_ONLY;
  if (cellar) return CELLAR_ONLY;
  return null;
}

/** The per-tab storage key that keeps the card hidden for the rest of the
    visit once dismissed, even when the server write failed. */
export function sharingNoticeHiddenKey(userId: string): string {
  return `blindr:sharing-notice-hidden:${userId}`;
}

/** What focusAfterDismiss needs of the card: the DOM's closest(), structurally. */
export type DismissedCard = {
  closest(selector: "main"): { focus(options?: { preventScroll?: boolean }): void } | null;
};

/**
 * "Got it" removes the whole card, the focused button with it, and focus would
 * fall to <body> with nothing announced. Move it first to the card's <main>
 * (tabIndex -1 on /overview), without scrolling: the card was its first child.
 */
export function focusAfterDismiss(card: DismissedCard | null): void {
  card?.closest("main")?.focus({ preventScroll: true });
}
