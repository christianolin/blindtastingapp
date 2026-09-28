// Every string levels and achievements show (spec §4, §8; C3: the drafts ship
// as written and the owner edits them live), and the helpers that fill their
// templates. The numbers (XP values, caps, targets, bonuses) live in the
// database (`xp_sources`, `achievements`, L22); scripts/levels.test.mjs pins
// the achievement keys here to the seeded rows, in `sort_order`.
// Pure: relative imports only, no React, no browser globals.
import { levelProgress } from "./curve";
import type { AchievementCategory, AchievementKey } from "./types";

type AchievementCopy = { name: string; description: string; category: AchievementCategory };

/** Spec §4's table, in `achievements.sort_order`. */
export const ACHIEVEMENTS: Record<AchievementKey, AchievementCopy> = {
  first_bottle: { name: "First bottle", description: "Add your first bottle to your cellar.", category: "cellar" },
  cellar_25: { name: "Well stocked", description: "Hold 25 bottles in your cellar at once.", category: "cellar" },
  cellar_100: { name: "Serious cellar", description: "Hold 100 bottles in your cellar at once.", category: "cellar" },
  first_drink: { name: "First cork", description: "Drink your first bottle from your cellar.", category: "cellar" },
  drank_50: { name: "Fifty corks", description: "Drink 50 bottles from your cellar.", category: "cellar" },
  first_tasting: { name: "First flight", description: "Finish your first blind tasting.", category: "tastings" },
  tastings_10: { name: "Regular", description: "Finish 10 blind tastings.", category: "tastings" },
  first_host: {
    name: "Host for the night",
    description: "Host a blind tasting to the end, with at least one guest.",
    category: "tastings",
  },
  perfect_glass: { name: "Perfect glass", description: "Get every part of a blind glass right.", category: "tastings" },
  winner: { name: "Top of the table", description: "Win a blind tasting of three or more players.", category: "tastings" },
  glasses_50: { name: "Fifty glasses", description: "Guess 50 blind glasses.", category: "tastings" },
  first_note: { name: "First impressions", description: "Write your first tasting note.", category: "notes" },
  notes_25: { name: "Note taker", description: "Write 25 tasting notes.", category: "notes" },
  notes_100: { name: "Critic", description: "Write 100 tasting notes.", category: "notes" },
  note_countries_10: { name: "Well travelled", description: "Write notes on wines from 10 countries.", category: "notes" },
  first_training: { name: "Practice round", description: "Finish your first round in the training room.", category: "training" },
  training_10: { name: "In training", description: "Finish 10 rounds in the training room.", category: "training" },
  training_ace: { name: "Spot on", description: "Score every possible point in a training round.", category: "training" },
  first_friend: { name: "Good company", description: "Make your first friend on Blindr.", category: "friends" },
  friends_10: { name: "Full table", description: "Have 10 friends at once.", category: "friends" },
};

/** The keys in display order (= `achievements.sort_order`). */
export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENTS) as AchievementKey[];

/** A key the app has copy for. A key it does not know (the database ahead of
    a deploy) is skipped everywhere, never rendered raw (spec §8.4). */
export function isAchievementKey(key: unknown): key is AchievementKey {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, key);
}

export const CATEGORY_ORDER: readonly AchievementCategory[] = [
  "cellar",
  "tastings",
  "notes",
  "training",
  "friends",
];

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  cellar: "Cellar",
  tastings: "Tastings",
  notes: "Notes",
  training: "Training",
  friends: "Friends",
};

/** 1234567 → "1,234,567". Deterministic (no locale), so a server render and
    a client render always agree. */
export function formatXp(n: number): string {
  const whole = Math.trunc(n);
  const sign = whole < 0 ? "-" : "";
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** An ISO timestamp as its UTC date, "12 Sep 2026" (spec §8.4). */
export function formatUtcDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// The ring (spec §8.2, L8)
// ---------------------------------------------------------------------------

/** "Level 4, 120 of 200 XP to level 5"; "Level 60, the top level". */
export function ringLabel(xp: number): string {
  const p = levelProgress(xp);
  if (p.next === null) return `Level ${p.level}, the top level`;
  return `Level ${p.level}, ${formatXp(p.into)} of ${formatXp(p.span)} XP to level ${p.next}`;
}

/** A link that holds the ring: the visible name first (WCAG 2.5.3). */
export function ringLinkLabel(name: string, xp: number): string {
  const p = levelProgress(xp);
  if (p.next === null) return `${name}, level ${p.level}, the top level`;
  return `${name}, level ${p.level}, ${formatXp(p.into)} of ${formatXp(p.span)} XP to level ${p.next}`;
}

// ---------------------------------------------------------------------------
// The community pill (spec §8.3)
// ---------------------------------------------------------------------------

export const pillText = (level: number): string => `Lv ${level}`;
export const pillLabel = (level: number): string => `Level ${level}`;

// ---------------------------------------------------------------------------
// Pop-ups (spec §8.1)
// ---------------------------------------------------------------------------

export const welcomeTitle = (level: number): string => `You're level ${level}`;
export const WELCOME_DETAIL_EARNED =
  "Levels are here — your tastings, cellar and notes so far already count.";
export const WELCOME_DETAIL_FRESH = "Levels are here — taste, cellar and note wines to earn XP.";

/** The migration's xp_sources.unit_cap (copy.test.ts pins them equal): one
    award pays at most this many bottles, so a row's `units` is the bottles
    PAID — a 24-bottle lot's row says 20, ten bottles opened at once say 6. */
export const UNIT_CAPS: Readonly<Record<string, number>> = { cellar_add: 20, drink: 6 };

/** A row whose paid bottles reached its kind's cap: the real count may be
    higher, so its label names none. */
export function atUnitCap(kind: string, units: number | null): boolean {
  const cap = Object.hasOwn(UNIT_CAPS, kind) ? UNIT_CAPS[kind] : undefined;
  return cap !== undefined && units !== null && units >= cap;
}

/** One kind's label on the XP card. `count` events, `units` summed (bottles for
    cellar_add and drink). `capped`: one of those rows reached its unit cap
    (atUnitCap), so the bottle labels say no number. Null for a kind the app
    has no label for. */
export function kindLabel(kind: string, count: number, units: number, capped = false): string | null {
  switch (kind) {
    case "guess":
    case "guess_match":
      return count === 1 ? "Glass revealed" : `${count} glasses revealed`;
    case "tasting_finished":
      return count === 1 ? "Tasting finished" : `${count} tastings finished`;
    case "tasting_hosted":
      return count === 1 ? "Tasting hosted" : `${count} tastings hosted`;
    case "cellar_add":
      if (capped) return "Bottles added";
      return units === 1 ? "Bottle added" : `${units} bottles added`;
    case "drink":
      if (capped) return "Bottles opened";
      return units === 1 ? "Bottle opened" : `${units} bottles opened`;
    case "note":
      return count === 1 ? "Tasting note" : `${count} tasting notes`;
    case "training":
      return count === 1 ? "Training round" : `${count} training rounds`;
    default:
      return null;
  }
}

/** "+40 XP · Tasting finished"; "+40 XP" when no label applies. */
export function xpToastTitle(sum: number, label: string | null): string {
  return label ? `+${formatXp(sum)} XP · ${label}` : `+${formatXp(sum)} XP`;
}

export const awayToastTitle = (sum: number): string => `+${formatXp(sum)} XP while you were away`;

/** "Achievement · Serious cellar"; two or more: "3 achievements · First cork, Well stocked". */
export function achievementToastTitle(names: string[]): string {
  if (names.length === 1) return `Achievement · ${names[0]}`;
  return `${names.length} achievements · ${names.slice(0, 2).join(", ")}`;
}

export const bonusDetail = (sum: number): string => `+${formatXp(sum)} XP`;
export const levelUpTitle = (level: number): string => `Level up · You're level ${level}`;

// ---------------------------------------------------------------------------
// /u/[id]'s "Level & achievements" card (spec §8.4, as amended by
// docs/superpowers/specs/2026-09-28-profile-achievements-card-design.md §7).
// The 2026-09-28 additions (levelLabel, xpLabel, latest, closest, "Show
// fewer" and the helpers below levelHeading) are PROVISIONAL until the owner
// approves the wording. Rule 1: no string here may state a total, a
// per-category count or "N of 20" on a path someone else's profile reaches —
// earnedOfTotal/earnedOfTotalSpoken are for your own profile only.
// ---------------------------------------------------------------------------

export const CARD_COPY = {
  title: "Level & achievements",
  topLevel: "Top level",
  showAll: "All achievements",
  showFewer: "Show fewer",
  earned: "Earned",
  notYet: "Not yet",
  beforeLevels: "Before levels",
  noneYet: "No achievements yet.",
  levelLabel: "level",
  xpLabel: "XP in all",
  latest: "Latest",
  closest: "Closest",
} as const;

export const levelHeading = (level: number): string => `Level ${level}`;
/** The trio's achievements label: singular only for someone else's count of
    one (your own profile always reads "0/1 achievements", "7/20 achievements"). */
export const achievementsLabel = (count: number, total: number | null): string =>
  total === null && count === 1 ? "achievement" : "achievements";
/** "7/20" — your own profile only (Rule 1). */
export const earnedOfTotal = (earned: number, total: number): string => `${earned}/${total}`;
/** "7 of 20" — the sr-only reading of earnedOfTotal. */
export const earnedOfTotalSpoken = (earned: number, total: number): string => `${earned} of ${total}`;
export const toLevel = (next: number): string => `To level ${next}`;
export const xpOfSpan = (into: number, span: number): string => `${formatXp(into)} / ${formatXp(span)} XP`;
/** "Serious cellar · 12 Sep 2026", "Note taker · 12 / 25". */
export const cardFact = (name: string, detail: string): string => `${name} · ${detail}`;
export const progressText = (progress: number, target: number): string =>
  `${formatXp(progress)} / ${formatXp(target)}`;
export const bonusText = (bonus: number): string => `+${formatXp(bonus)} XP`;
