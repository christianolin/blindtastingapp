// Levels and achievements: the types shared by the server reads, the "use
// server" action, the pure rules and the client components (spec
// docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md §6.2).
// A plain module — src/lib/levels/actions.ts is a "use server" file and may
// export only async functions, so it imports these with `import type`.

/** What `xp_events.kind` holds (spec §2). A kind the app does not know yet
    (the database ahead of a deploy) still arrives, typed as a plain string. */
export type XpKind =
  | "guess"
  | "guess_match"
  | "tasting_finished"
  | "tasting_hosted"
  | "cellar_add"
  | "drink"
  | "note"
  | "training"
  | "achievement";

export type AchievementCategory = "cellar" | "tastings" | "notes" | "training" | "friends";

/** The twenty keys of spec §4, in `achievements.sort_order`. */
export type AchievementKey =
  | "first_bottle"
  | "cellar_25"
  | "cellar_100"
  | "first_drink"
  | "drank_50"
  | "first_tasting"
  | "tastings_10"
  | "first_host"
  | "perfect_glass"
  | "winner"
  | "glasses_50"
  | "first_note"
  | "notes_25"
  | "notes_100"
  | "note_countries_10"
  | "first_training"
  | "training_10"
  | "training_ace"
  | "first_friend"
  | "friends_10";

/** One unseen ledger row, as get_my_level_state returns it (camelCased). */
export type XpEvent = {
  id: number;
  kind: string;
  xp: number;
  xpAfter: number;
  units: number | null;
  achievement: string | null;
  /** ISO 8601, UTC, server clock. */
  createdAt: string;
};

/** The viewer's own level state, read by AppHeader on every render. */
export type LevelSnapshot = {
  userId: string;
  xp: number;
  level: number;
  welcome: boolean;
  /** ISO 8601, UTC, server clock: when the read ran. */
  checkedAt: string;
  /** The oldest (at most 50) unseen ledger rows, by id. */
  unseen: XpEvent[];
};

/** A level as the ring and the pill need it. */
export type OwnLevel = { xp: number; level: number };

export type EarnedAchievement = {
  key: AchievementKey;
  category: AchievementCategory;
  /** ISO 8601. */
  unlockedAt: string;
  /** Unlocked by the launch backfill: shown as "Before levels", no date (L25). */
  backfill: boolean;
};

export type LockedAchievement = {
  key: AchievementKey;
  category: AchievementCategory;
  progress: number;
  target: number;
  bonusXp: number;
};

/** /u/[id]'s level card: someone else's (earned only) or your own (with the
    locked ones and their progress). */
export type ProfileLevel = {
  xp: number;
  level: number;
  earned: EarnedAchievement[];
  /** Your own profile only; null on someone else's. */
  locked: LockedAchievement[] | null;
};

export type ToastKind = "welcome" | "xp" | "achievement" | "level";

/** One pop-up card (spec §8.1). */
export type Toast = {
  /** Stable within a tab: the kind plus the ids it carries. */
  id: string;
  userId: string;
  kind: ToastKind;
  title: string;
  detail: string | null;
  /** The ledger rows this card marks seen when it first shows. */
  eventIds: number[];
  /** True on the welcome card: showing it clears welcome_pending. */
  welcome: boolean;
  durationMs: number;
  /** "gold": the filled level-up card. */
  tone: "plain" | "gold";
};
