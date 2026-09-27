// /u/[id]'s "Level & achievements" card as plain data (spec §8.4, L32): the
// collapsed row (level, XP in all, the bar, up to six earned chips) and the
// expanded lists (earned by category with dates; on your own profile, the ones
// not yet earned with their progress). Pure: relative imports only.
import { levelProgress } from "./curve";
import {
  ACHIEVEMENTS,
  CARD_COPY,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  bonusText,
  formatUtcDate,
  levelHeading,
  progressText,
  toNextLevel,
  xpInAll,
} from "./copy";
import type { AchievementCategory, AchievementKey, ProfileLevel } from "./types";

/** Earned chips shown collapsed. */
export const CHIP_LIMIT = 6;

export type CardChip = { key: AchievementKey; category: AchievementCategory; name: string };

export type LevelCardView = {
  heading: string;
  xpLine: string;
  bar: { fraction: number; text: string };
  chips: CardChip[];
  /** "No achievements yet." when nothing is earned (or visible), else null. */
  empty: string | null;
  earnedGroups: {
    category: AchievementCategory;
    label: string;
    items: { key: AchievementKey; name: string; description: string; when: string }[];
  }[];
  /** Your own profile only; null on someone else's. */
  notYet:
    | { key: AchievementKey; name: string; description: string; fraction: number; progress: string; bonus: string }[]
    | null;
  /** The expanded view adds something (dates, the rest, or what is not yet
      earned): the "All achievements" toggle shows. */
  canExpand: boolean;
};

export function levelCardView(p: ProfileLevel): LevelCardView {
  const progress = levelProgress(p.xp);
  const chips = p.earned.slice(0, CHIP_LIMIT).map((e) => ({
    key: e.key,
    category: e.category,
    name: ACHIEVEMENTS[e.key].name,
  }));
  const earnedGroups = CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: p.earned
      .filter((e) => e.category === category)
      .map((e) => ({
        key: e.key,
        name: ACHIEVEMENTS[e.key].name,
        description: ACHIEVEMENTS[e.key].description,
        when: e.backfill ? CARD_COPY.beforeLevels : formatUtcDate(e.unlockedAt),
      })),
  })).filter((g) => g.items.length > 0);
  const notYet =
    p.locked === null
      ? null
      : p.locked.map((l) => ({
          key: l.key,
          name: ACHIEVEMENTS[l.key].name,
          description: ACHIEVEMENTS[l.key].description,
          fraction: l.target > 0 ? Math.min(1, l.progress / l.target) : 0,
          progress: progressText(l.progress, l.target),
          bonus: bonusText(l.bonusXp),
        }));
  return {
    heading: levelHeading(progress.level),
    xpLine: xpInAll(p.xp),
    bar: {
      fraction: progress.fraction,
      text: progress.next === null ? CARD_COPY.topLevel : toNextLevel(progress.into, progress.span, progress.next),
    },
    chips,
    empty: p.earned.length === 0 ? CARD_COPY.noneYet : null,
    earnedGroups,
    notYet,
    canExpand: p.earned.length > 0 || (notYet?.length ?? 0) > 0,
  };
}
