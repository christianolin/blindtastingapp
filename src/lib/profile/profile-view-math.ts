// Pure logic for the `/u/[id]` profile view (spec
// docs/superpowers/specs/2026-09-19-profile-view-redesign.md §4). Runtime
// imports are relative only — vitest has no `@/` alias — and `stats-math`'s
// own `@/` import is type-only, so it is erased before this ever runs there.
import type { OriginStat, ProfileStatsSummary, TastingHistoryEntry } from "../profile-stats";
import { joinedLabel } from "../community/community-math";
import { FAVORITE_WINE_TYPE_ITEMS } from "../wine-types";
import { percent } from "../stats-math";

export const MIN_SAMPLE = 3;
export const NOTHING_YET = "Nothing to show yet";
export const MIN_SAMPLE_FOOTNOTE = "A category shows a rate once it covers 3 wines.";
export const SEMI_BLIND_ONLY =
  "Semi-blind glasses score a plain match, so there is no category breakdown yet.";

/** A profile's `favorite_wine_type` code as the label shown on `/profile/edit`, falling back to the raw value. Null/empty stays null. */
export function favoriteWineLabel(code: string | null): string | null {
  if (!code) return null;
  return FAVORITE_WINE_TYPE_ITEMS[code] ?? code;
}

/** The header meta line: "{location} · Favorite: {label} · Joined {Mon YYYY}", each part only when set. */
export function profileMeta(p: {
  location: string | null;
  favoriteWineType: string | null;
  createdAt: string;
}): string {
  const parts: string[] = [];
  const location = p.location?.trim();
  if (location) parts.push(location);
  const favorite = favoriteWineLabel(p.favoriteWineType);
  if (favorite) parts.push(`Favorite: ${favorite}`);
  parts.push(`Joined ${joinedLabel(p.createdAt)}`);
  return parts.join(" · ");
}

/** The tastings / wines guessed / avg points trio, or null when nobody has guessed a wine yet. */
export function profileStatTrio(
  s: Pick<ProfileStatsSummary, "tastingsAttended" | "winesGuessed" | "averagePoints">,
): { value: string; label: string }[] | null {
  if (s.winesGuessed === 0) return null;
  return [
    {
      value: s.tastingsAttended.toLocaleString("en-US"),
      label: s.tastingsAttended === 1 ? "tasting" : "tastings",
    },
    {
      value: s.winesGuessed.toLocaleString("en-US"),
      label: s.winesGuessed === 1 ? "wine guessed" : "wines guessed",
    },
    { value: s.averagePoints.toFixed(1), label: "avg points" },
  ];
}

export type AccuracyView = {
  rows: { label: string; pct: number; value: string }[];
  strongest: string | null;
  footnote: string | null;
  empty: string | null;
};

// Row order and the "hits" rule per category — Your numbers' six labels
// (Country … Producer) plus this page's two extra scored categories.
// "Vintage ±1" folds the exact-match count and the off-by-one partial credit
// into one hit tally, same as `getProfileStats`' old "(+N off by 1yr)" note.
function accuracyDefs(
  a: ProfileStatsSummary["categoryAccuracy"],
  vintagePartialCredit: number,
): { label: string; hits: number; applicable: number }[] {
  return [
    { label: "Country", hits: a.country.correct, applicable: a.country.applicable },
    { label: "Region", hits: a.region.correct, applicable: a.region.applicable },
    { label: "Appellation", hits: a.appellation.correct, applicable: a.appellation.applicable },
    { label: "Grape", hits: a.primary_grape.correct, applicable: a.primary_grape.applicable },
    {
      label: "Vintage ±1",
      hits: a.vintage.correct + vintagePartialCredit,
      applicable: a.vintage.applicable,
    },
    { label: "Producer", hits: a.producer.correct, applicable: a.producer.applicable },
    {
      label: "Second grape",
      hits: a.secondary_grape.correct,
      applicable: a.secondary_grape.applicable,
    },
    {
      label: "Designation",
      hits: a.type_designation.correct,
      applicable: a.type_designation.applicable,
    },
  ];
}

/**
 * The "Accuracy by category" card: rows in the fixed order above (0-applicable
 * ones omitted), a rate once a row covers `MIN_SAMPLE` wines else "—", the
 * strongest row computed from those same rows (so it can never disagree with
 * one), and a footnote when any shown row is below the sample floor. A
 * semi-blind-only profile (every category inapplicable, but wines were
 * guessed) gets `empty` instead of any rows.
 */
export function accuracyView(
  s: Pick<ProfileStatsSummary, "winesGuessed" | "categoryAccuracy" | "vintagePartialCredit">,
): AccuracyView {
  if (s.winesGuessed === 0) {
    return { rows: [], strongest: null, footnote: null, empty: null };
  }

  const defs = accuracyDefs(s.categoryAccuracy, s.vintagePartialCredit);
  const shown = defs.filter((d) => d.applicable >= 1);
  if (shown.length === 0) {
    return { rows: [], strongest: null, footnote: null, empty: SEMI_BLIND_ONLY };
  }

  const rows = shown.map((d) => {
    const qualifies = d.applicable >= MIN_SAMPLE;
    const pct = qualifies ? percent(d.hits, d.applicable) : 0;
    return { label: d.label, pct, value: qualifies ? `${pct}%` : "—" };
  });

  let best: { label: string; hits: number; applicable: number; rate: number } | null = null;
  for (const d of shown) {
    if (d.applicable < MIN_SAMPLE) continue;
    const rate = d.hits / d.applicable;
    if (!best || rate > best.rate || (rate === best.rate && d.applicable > best.applicable)) {
      best = { label: d.label, hits: d.hits, applicable: d.applicable, rate };
    }
  }
  const strongest =
    best && best.hits > 0
      ? `${best.label} · ${percent(best.hits, best.applicable)}% of ${best.applicable} ${best.applicable === 1 ? "wine" : "wines"}`
      : null;

  const footnote = shown.some((d) => d.applicable < MIN_SAMPLE) ? MIN_SAMPLE_FOOTNOTE : null;

  return { rows, strongest, footnote, empty: null };
}

export type ShareRow = { label: string; pct: number; value: string };

/**
 * "Tasted most" rows for the origins/grapes cards: same-name entries merged
 * (two countries' sentinel "None" regions, say), sorted by count desc then
 * name, capped at 5, and given a width relative to the top (merged) entry.
 */
export function shareRows(items: OriginStat[]): ShareRow[] {
  const merged = new Map<string, number>();
  for (const item of items) {
    merged.set(item.name, (merged.get(item.name) ?? 0) + item.count);
  }
  const sorted = [...merged.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5);
  const max = sorted.length > 0 ? sorted[0][1] : 0;
  return sorted.map(([label, count]) => ({
    label,
    pct: max > 0 ? Math.round((100 * count) / max) : 0,
    value: count.toLocaleString("en-US"),
  }));
}

export type ProfileTastingRow = {
  id: string;
  href: string;
  name: string;
  modeNote: string | null;
  host: string;
  date: string;
  wines: string;
  result: string;
  phoneMeta: string;
  phoneBottom: string;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "12 Sep 2026" — the Overview's shortDate rule plus the year, in UTC so this
// server-computed string can never mismatch a client hydration pass.
function fullDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function pointsResult(points: number): string {
  const n = points.toLocaleString("en-US");
  return `${n} ${points === 1 ? "pt" : "pts"}`;
}

function modeNoteFor(revealMode: TastingHistoryEntry["revealMode"]): string | null {
  if (revealMode === "SEMI_BLIND") return "Semi-blind";
  if (revealMode === "OPEN") return "Open";
  return null;
}

/**
 * The tastings list rows, newest first by this person's latest scored glass
 * in each tasting (ties by name, then id — the same order the query result
 * would otherwise arrive in arbitrarily).
 */
export function profileTastingRows(
  entries: TastingHistoryEntry[],
  ctx: { profileId: string; viewerId: string },
): ProfileTastingRow[] {
  const sorted = [...entries].sort((a, b) => {
    const ta = Date.parse(a.lastScoredAt);
    const tb = Date.parse(b.lastScoredAt);
    if (ta !== tb) return tb - ta;
    const nameCmp = a.tastingName.localeCompare(b.tastingName);
    if (nameCmp !== 0) return nameCmp;
    return a.tastingId.localeCompare(b.tastingId);
  });

  return sorted.map((t) => {
    const modeNote = modeNoteFor(t.revealMode);
    const date = fullDate(t.lastScoredAt);
    const isViewerHost = t.hostId === ctx.viewerId;
    const wines = t.winesRevealed.toLocaleString("en-US");
    const result =
      t.revealMode === "SEMI_BLIND"
        ? `${t.pointsEarned.toLocaleString("en-US")} of ${wines} matched`
        : pointsResult(t.pointsEarned);

    return {
      id: t.tastingId,
      href: `/u/${ctx.profileId}/tastings/${t.tastingId}`,
      name: t.tastingName,
      modeNote,
      host: isViewerHost ? "You" : t.hostName,
      date,
      wines,
      result,
      phoneMeta: `hosted by ${isViewerHost ? "you" : t.hostName} · ${date}`,
      phoneBottom: modeNote ?? `${wines} ${t.winesRevealed === 1 ? "wine" : "wines"}`,
    };
  });
}

/** The tastings section footer: "12 tastings · newest first". */
export function tastingsFooter(count: number): string {
  const n = count.toLocaleString("en-US");
  return `${n} ${count === 1 ? "tasting" : "tastings"} · newest first`;
}

const OWN_EMPTY_BODY =
  "Your numbers and tastings show up here once a glass you guessed has been revealed.";

/** The no-scored-guesses-yet empty state (§2.6), own profile or another's. */
export function emptyProfileCopy(p: { isOwn: boolean; name: string }): {
  title: string;
  body: string;
} {
  return {
    title: "No tastings yet",
    body: p.isOwn
      ? OWN_EMPTY_BODY
      : `${p.name}’s numbers and tastings show up here once a glass they guessed has been revealed.`,
  };
}
