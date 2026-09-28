// /u/[id]'s "Level & achievements" card as plain data (levels spec §8.4 and
// L32, as amended by
// docs/superpowers/specs/2026-09-28-profile-achievements-card-design.md §8):
// the collapsed summary (a trio of level · XP in all · achievements, one level
// row, the Latest and, on your own profile, Closest facts) and the expanded
// lists (earned by category with dates; on your own profile, the ones not yet
// earned, by category, with their progress). Pure: relative imports only.
//
// Rule 1: someone else's profile (`locked === null`) gets a visible-only
// count — never a total, a per-category count, a "Closest" or a Not yet list.
import { levelProgress } from "./curve";
import {
  ACHIEVEMENTS,
  CARD_COPY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  achievementsLabel,
  bonusText,
  cardFact,
  earnedOfTotal,
  earnedOfTotalSpoken,
  formatUtcDate,
  formatXp,
  levelHeading,
  progressText,
  toLevel,
  xpOfSpan,
} from "./copy";
import type { AchievementCategory, AchievementKey, EarnedAchievement, ProfileLevel } from "./types";

/** One trio stat; `spoken` (sr-only) stands in for the visible value for a
    screen reader when set ("7/20" reads "7 of 20"). */
export type TrioStat = { value: string; label: string; spoken: string | null };

export type EarnedItem = { key: AchievementKey; name: string; description: string; when: string };

export type NotYetItem = {
  key: AchievementKey;
  name: string;
  description: string;
  fraction: number;
  progress: string;
  bonus: string;
};

export type CardGroup<T> = { category: AchievementCategory; label: string; items: T[] };

export type LevelCardView = {
  /** [level, XP in all, achievements]. */
  trio: TrioStat[];
  levelRow: { label: string; fraction: number; value: string };
  /** The newest achievement as "name · when"; null exactly when `empty` is set. */
  latest: string | null;
  /** Your own profile only: the locked achievement nearest done; null when
      nothing has progress (and always on someone else's). */
  closest: string | null;
  /** "No achievements yet." when nothing is earned (or visible), else null. */
  empty: string | null;
  earnedGroups: CardGroup<EarnedItem>[];
  /** Your own profile only; null on someone else's. */
  notYetGroups: CardGroup<NotYetItem>[] | null;
  /** The expanded view adds something (dates, or what is not yet earned):
      the "All achievements" toggle shows. */
  canExpand: boolean;
};

function whenText(a: EarnedAchievement): string {
  return a.backfill ? CARD_COPY.beforeLevels : formatUtcDate(a.unlockedAt);
}

/** CATEGORY_ORDER groups, each in the rows' own (catalogue) order; an empty
    category is left out. */
function groupByCategory<T>(rows: { category: AchievementCategory; item: T }[]): CardGroup<T>[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: rows.filter((r) => r.category === category).map((r) => r.item),
  })).filter((g) => g.items.length > 0);
}

/** A stamp's time; an unparseable one sorts as the oldest. */
function stampTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** A14: not backfilled first, then the newest unlockedAt; ties keep catalogue
    order (Array.prototype.sort is stable). */
function newestEarned(earned: EarnedAchievement[]): EarnedAchievement | null {
  const ordered = [...earned].sort((a, b) => {
    if (a.backfill !== b.backfill) return a.backfill ? 1 : -1;
    const ta = stampTime(a.unlockedAt);
    const tb = stampTime(b.unlockedAt);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
  return ordered[0] ?? null;
}

const fractionOf = (progress: number, target: number): number =>
  target > 0 ? Math.min(1, progress / target) : 0;

export function levelCardView(p: ProfileLevel): LevelCardView {
  const progress = levelProgress(p.xp);
  const earnedCount = p.earned.length;
  const lockedCount = p.locked?.length ?? 0;

  const achievements: TrioStat =
    p.locked !== null
      ? {
          value: earnedOfTotal(earnedCount, earnedCount + lockedCount),
          label: achievementsLabel(earnedCount, earnedCount + lockedCount),
          spoken: earnedOfTotalSpoken(earnedCount, earnedCount + lockedCount),
        }
      : { value: String(earnedCount), label: achievementsLabel(earnedCount, null), spoken: null };
  const trio: TrioStat[] = [
    { value: String(progress.level), label: CARD_COPY.levelLabel, spoken: null },
    { value: formatXp(p.xp), label: CARD_COPY.xpLabel, spoken: null },
    achievements,
  ];

  const levelRow =
    progress.next === null
      ? { label: CARD_COPY.topLevel, fraction: 1, value: levelHeading(progress.level) }
      : { label: toLevel(progress.next), fraction: progress.fraction, value: xpOfSpan(progress.into, progress.span) };

  const newest = newestEarned(p.earned);
  const latest = newest ? cardFact(ACHIEVEMENTS[newest.key].name, whenText(newest)) : null;

  // A15: the largest fraction above 0; a strict ">" keeps catalogue order on ties.
  let closest: string | null = null;
  let best = 0;
  for (const l of p.locked ?? []) {
    const f = fractionOf(l.progress, l.target);
    if (f > best) {
      best = f;
      closest = cardFact(ACHIEVEMENTS[l.key].name, progressText(l.progress, l.target));
    }
  }

  const earnedGroups = groupByCategory(
    p.earned.map((a) => ({
      category: a.category,
      item: {
        key: a.key,
        name: ACHIEVEMENTS[a.key].name,
        description: ACHIEVEMENTS[a.key].description,
        when: whenText(a),
      },
    })),
  );

  const notYetGroups =
    p.locked === null
      ? null
      : groupByCategory(
          p.locked.map((l) => ({
            category: l.category,
            item: {
              key: l.key,
              name: ACHIEVEMENTS[l.key].name,
              description: ACHIEVEMENTS[l.key].description,
              fraction: fractionOf(l.progress, l.target),
              progress: progressText(l.progress, l.target),
              bonus: bonusText(l.bonusXp),
            },
          })),
        );

  return {
    trio,
    levelRow,
    latest,
    closest,
    empty: earnedCount === 0 ? CARD_COPY.noneYet : null,
    earnedGroups,
    notYetGroups,
    canExpand: earnedCount > 0 || lockedCount > 0,
  };
}
