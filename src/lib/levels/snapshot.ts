// The server reads' raw rows as the app's types (spec §6): get_my_level_state's
// jsonb, profile_levels rows, get_my_achievement_progress rows and
// profile_achievements rows. Every parser drops what it cannot read instead of
// throwing — a malformed row never breaks a page — and skips an achievement key
// the app has no copy for (spec §8.4). Pure: relative imports only.
import { ACHIEVEMENTS, ACHIEVEMENT_KEYS, isAchievementKey } from "./copy";
import type {
  EarnedAchievement,
  LevelSnapshot,
  LockedAchievement,
  OwnLevel,
  ProfileLevel,
  XpEvent,
} from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseEvent(raw: unknown): XpEvent | null {
  if (!isObj(raw)) return null;
  const id = int(raw.id);
  const kind = str(raw.kind);
  const xp = int(raw.xp);
  const xpAfter = int(raw.xp_after);
  const createdAt = str(raw.created_at);
  if (id === null || kind === null || xp === null || xpAfter === null || createdAt === null) return null;
  return {
    id,
    kind,
    xp,
    xpAfter,
    units: int(raw.units),
    achievement: str(raw.achievement),
    createdAt,
  };
}

/** get_my_level_state's jsonb. Null when the shape is not the documented one. */
export function parseLevelSnapshot(raw: unknown, userId: string): LevelSnapshot | null {
  if (!isObj(raw)) return null;
  const xp = int(raw.xp);
  const level = int(raw.level);
  const checkedAt = str(raw.checked_at);
  if (xp === null || level === null || checkedAt === null || !Array.isArray(raw.unseen)) return null;
  return {
    userId,
    xp,
    level,
    welcome: raw.welcome === true,
    checkedAt,
    unseen: raw.unseen.flatMap((e) => parseEvent(e) ?? []),
  };
}

/** A profile_levels row ({ xp, level }); a missing row is level 1 with 0 XP. */
export function ownLevelFromRow(row: { xp: number; level: number } | null | undefined): OwnLevel {
  return row ? { xp: row.xp, level: row.level } : { xp: 0, level: 1 };
}

/** /community's batched read: user id → level; someone with no row is level 1. */
export function levelsById(
  ids: readonly string[],
  rows: readonly { user_id: string; level: number }[] | null | undefined,
): Map<string, number> {
  const found = new Map((rows ?? []).map((r) => [r.user_id, r.level] as const));
  return new Map(ids.map((id) => [id, found.get(id) ?? 1] as const));
}

const order = (key: string) => ACHIEVEMENT_KEYS.indexOf(key as (typeof ACHIEVEMENT_KEYS)[number]);

export type ProgressRow = {
  key: string;
  bonus_xp: number;
  target: number;
  progress: number;
  unlocked_at: string | null;
  backfill: boolean;
};

export type EarnedRow = { achievement_key: string; unlocked_at: string; backfill: boolean };

/** Your own profile: get_my_achievement_progress's rows, split into earned and
    not yet, in the copy's order. */
export function ownProfileLevel(level: OwnLevel, rows: readonly ProgressRow[]): ProfileLevel {
  const known = rows.filter((r) => isAchievementKey(r.key)).sort((a, b) => order(a.key) - order(b.key));
  const earned: EarnedAchievement[] = [];
  const locked: LockedAchievement[] = [];
  for (const r of known) {
    const key = r.key as EarnedAchievement["key"];
    if (r.unlocked_at) {
      earned.push({ key, category: ACHIEVEMENTS[key].category, unlockedAt: r.unlocked_at, backfill: r.backfill });
    } else {
      locked.push({
        key,
        category: ACHIEVEMENTS[key].category,
        progress: Math.max(0, Math.min(r.progress, r.target)),
        target: r.target,
        bonusXp: r.bonus_xp,
      });
    }
  }
  return { ...level, earned, locked };
}

/** Someone else's profile: the profile_achievements rows RLS lets the viewer
    read (a hidden cellar's are simply absent), in the copy's order. */
export function otherProfileLevel(level: OwnLevel, rows: readonly EarnedRow[]): ProfileLevel {
  const earned = rows
    .filter((r) => isAchievementKey(r.achievement_key))
    .sort((a, b) => order(a.achievement_key) - order(b.achievement_key))
    .map((r) => {
      const key = r.achievement_key as EarnedAchievement["key"];
      return { key, category: ACHIEVEMENTS[key].category, unlockedAt: r.unlocked_at, backfill: r.backfill };
    });
  return { ...level, earned, locked: null };
}
