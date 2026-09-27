// The pop-up rules (spec §8.1, L7, L29): one render's new ledger rows become at
// most three cards — the welcome card first, then one XP card, one achievement
// card and one level-up card — plus the validator markXpSeen runs on its
// input. Pure: relative imports only, so vitest loads it.
import { levelForXp } from "./curve";
import {
  ACHIEVEMENTS,
  WELCOME_DETAIL_EARNED,
  WELCOME_DETAIL_FRESH,
  achievementToastTitle,
  awayToastTitle,
  bonusDetail,
  isAchievementKey,
  kindLabel,
  levelUpTitle,
  welcomeTitle,
  xpToastTitle,
} from "./copy";
import type { Toast, XpEvent } from "./types";

/** How long a card stays (spec §8.1). */
export const TOAST_MS = 4000;
export const WELCOME_MS = 6000;
/** At most three cards on screen; the rest wait, oldest first. */
export const MAX_VISIBLE = 3;
/** Rows older than this (against the read's own server clock) collapse into
    "+N XP while you were away". */
export const CATCH_UP_MS = 10 * 60 * 1000;
/** markXpSeen's input limit (spec §6.2). */
export const MAX_SEEN_IDS = 100;

/** The rows no card in this tab has queued or shown yet. */
export function freshEvents(events: readonly XpEvent[], seen: ReadonlySet<number>): XpEvent[] {
  return events.filter((e) => !seen.has(e.id));
}

/** guess and guess_match share one label ("Glass revealed"). */
function labelGroup(kind: string): string {
  return kind === "guess_match" ? "guess" : kind;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** The XP card's label: one kind "{label}", two "{label1} & {label2}", more
    "{label1} & more", ordered by XP (ties: first seen). Null when no kind has
    a label. */
function xpCardLabel(events: readonly XpEvent[]): string | null {
  const groups = new Map<string, { kind: string; count: number; units: number; xp: number; first: number }>();
  events.forEach((e, index) => {
    const key = labelGroup(e.kind);
    const g = groups.get(key) ?? { kind: key, count: 0, units: 0, xp: 0, first: index };
    g.count += 1;
    g.units += e.units ?? 1;
    g.xp += e.xp;
    groups.set(key, g);
  });
  const labels = [...groups.values()]
    .sort((a, b) => b.xp - a.xp || a.first - b.first)
    .map((g) => kindLabel(g.kind, g.count, g.units))
    .filter((l): l is string => l !== null);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${lowerFirst(labels[1])}`;
  return `${labels[0]} & more`;
}

export type ToastBatch = {
  toasts: Toast[];
  /** Rows no card carries (an achievement the app has no copy for): marked
      seen without a card, so they never block the 50-row window. */
  silentIds: number[];
};

/**
 * One render's new rows as cards. `events` must already be fresh (see
 * freshEvents). With `welcome`, the welcome card comes first and the level-up
 * card is left out — "You're level N" already says it.
 */
export function buildToasts(
  events: readonly XpEvent[],
  opts: { userId: string; welcome: boolean; xp: number; checkedAt: string },
): ToastBatch {
  const toasts: Toast[] = [];
  const silentIds: number[] = [];
  const sorted = [...events].sort((a, b) => a.id - b.id);

  if (opts.welcome) {
    toasts.push({
      id: "welcome",
      userId: opts.userId,
      kind: "welcome",
      title: welcomeTitle(levelForXp(opts.xp)),
      detail: opts.xp > 0 ? WELCOME_DETAIL_EARNED : WELCOME_DETAIL_FRESH,
      eventIds: [],
      welcome: true,
      durationMs: WELCOME_MS,
      tone: "plain",
    });
  }

  const activity = sorted.filter((e) => e.kind !== "achievement");
  if (activity.length > 0) {
    const sum = activity.reduce((s, e) => s + e.xp, 0);
    const checked = Date.parse(opts.checkedAt);
    const away =
      Number.isFinite(checked) &&
      activity.some((e) => {
        const at = Date.parse(e.createdAt);
        return Number.isFinite(at) && at < checked - CATCH_UP_MS;
      });
    toasts.push({
      id: `xp:${activity.map((e) => e.id).join(",")}`,
      userId: opts.userId,
      kind: "xp",
      title: away ? awayToastTitle(sum) : xpToastTitle(sum, xpCardLabel(activity)),
      detail: null,
      eventIds: activity.map((e) => e.id),
      welcome: false,
      durationMs: TOAST_MS,
      tone: "plain",
    });
  }

  const achievements = sorted.filter((e) => e.kind === "achievement");
  const named = achievements.filter((e) => isAchievementKey(e.achievement));
  if (named.length > 0) {
    toasts.push({
      id: `achievement:${achievements.map((e) => e.id).join(",")}`,
      userId: opts.userId,
      kind: "achievement",
      title: achievementToastTitle(
        named.map((e) => ACHIEVEMENTS[e.achievement as keyof typeof ACHIEVEMENTS].name),
      ),
      detail: bonusDetail(named.reduce((s, e) => s + e.xp, 0)),
      eventIds: achievements.map((e) => e.id),
      welcome: false,
      durationMs: TOAST_MS,
      tone: "plain",
    });
  } else {
    silentIds.push(...achievements.map((e) => e.id));
  }

  if (!opts.welcome && sorted.length > 0) {
    const byTotal = [...sorted].sort((a, b) => a.xpAfter - b.xpAfter || a.id - b.id);
    const first = byTotal[0];
    const last = byTotal[byTotal.length - 1];
    const before = levelForXp(first.xpAfter - first.xp);
    const after = levelForXp(last.xpAfter);
    if (after > before) {
      toasts.push({
        id: `level:${after}`,
        userId: opts.userId,
        kind: "level",
        title: levelUpTitle(after),
        detail: null,
        eventIds: [],
        welcome: false,
        durationMs: TOAST_MS,
        tone: "gold",
      });
    }
  }

  return { toasts, silentIds };
}

/** A card line's leading "+N XP", drawn in text-gold-dark (spec §8.1), and
    the rest; null when the line does not start with one. */
export function splitXp(text: string): { xp: string; rest: string } | null {
  const m = /^(\+[\d,]+ XP)(.*)$/.exec(text);
  return m ? { xp: m[1], rest: m[2] } : null;
}

/** markXpSeen's input: at most 100 positive integers. Anything else is null —
    the action then does nothing. */
export function cleanSeenIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_SEEN_IDS) return null;
  if (!ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id > 0)) return null;
  return [...new Set(ids as number[])];
}
