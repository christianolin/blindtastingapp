import { Check } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { rankDelta } from "@/lib/guess-ladder-math";
import {
  heroLabel,
  inPlayKeys,
  keyLabel,
  keyMaxPoints,
  type RevealKey,
} from "@/lib/reveal-rows-math";
import { ordinal, rankLabel, rankRows } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import type { GuessRow } from "./ladder-types";

// The spoiler-safe progressive read shape (get_wine_reveal). Only categories
// <= reveal_step are present; unrevealed ones are omitted entirely.
type Rev = {
  reveal_step: number;
  in_play_count: number;
  is_fully_revealed: boolean;
  revealed_keys: string[];
  correct: Record<string, string | number | null>;
  guesses: {
    participant_id: string;
    values: Record<string, string | number | null>;
    points: Record<string, number | null>;
  }[];
};

type Cell = Record<string, string | number | null>;

/** A competitor row from getTastingLeaderboard, already filtered to the
 *  people who compete (JOINED, not the host who set the wines). */
export type RevealStanding = {
  participantId: string;
  name: string;
  isMe: boolean;
  total: number;
  lastRoundPoints: number | null;
};

// A revealed category the answer key has nothing for (reveal-3). There was
// nothing to match, so it reads "Not recorded" with a neutral "not scored"
// verdict, never the rose miss style. Null points mean "not applicable",
// never 0, so they stay null all the way to the markup.
const NOT_RECORDED = "Not recorded";
const NOT_SCORED = "not scored";

function vintageLabel(v: {
  vintage_kind?: string | number | null;
  vintage_year?: string | number | null;
  vintage_tawny_years?: string | number | null;
}): string | null {
  if (v.vintage_kind === "YEAR")
    return v.vintage_year != null ? String(v.vintage_year) : null;
  if (v.vintage_kind === "NV") return "NV";
  if (v.vintage_kind === "TAWNY")
    return v.vintage_tawny_years != null
      ? `${v.vintage_tawny_years} years tawny`
      : null;
  return null;
}

type Row = {
  key: RevealKey;
  label: string;
  /** The truth as text; null while hidden, "Not recorded" when a revealed
   *  category has nothing on record. */
  truth: string | null;
  /** A revealed category the answer key has nothing for: nothing to match. */
  notRecorded: boolean;
  /** My answer as text; null when I skipped (or have not answered a hidden row). */
  mine: string | null;
  /** Points exactly as scored: null while hidden, and null when the row scored
   *  nobody or my guess carries no score on it. Never coerced to 0. */
  points: number | null;
  /** What the row is worth — shown on hidden rows. */
  max: number;
  hidden: boolean;
};

type Verdict = "hit" | "miss" | "skipped" | "unscored";

/**
 * My verdict on a revealed row. Nothing on record, or no score on my guess,
 * is a neutral "unscored": a hit or a miss needs real points (points !== null).
 */
function verdictOf(row: Row): Verdict {
  if (row.notRecorded) return "unscored";
  if (row.mine == null) return "skipped";
  if (row.points === null) return "unscored";
  return row.points > 0 ? "hit" : "miss";
}

function verdictText(row: Row, verdict: Verdict): string {
  if (verdict === "skipped") return "You skipped this";
  if (verdict === "unscored") {
    return row.mine == null
      ? `You skipped this · ${NOT_SCORED}`
      : `You said ${row.mine} · ${NOT_SCORED}`;
  }
  const points = row.points ?? 0;
  return `You said ${row.mine} · ${points > 0 ? `+${points}` : "0"} pts`;
}

/**
 * The participant's view of a glass mid-reveal (6h): the newest revealed
 * category as the hero with my verdict, then every in-play row — revealed
 * ones with the truth, my answer and the points; hidden ones dashed with the
 * stakes still legible — and the standings with how my rank moved.
 *
 * Reads only get_wine_reveal (the SECURITY DEFINER RPC that omits every
 * unrevealed key), my own saved row (for "you: …" on hidden rows — my data,
 * no one else's) and the leaderboard aggregates. Which optional categories
 * are in play is inferred from in_play_count + the revealed prefix
 * (`inPlayKeys`), never from the answer key.
 *
 * Standings use dense ranks (`rankRows`): ties share a rank and read "=2",
 * and the delta pill's ordinal is the same dense rank, so list and pill agree.
 */
export async function RevealView({
  wineId,
  glassNumber,
  myParticipantId,
  myGuess,
  names,
  standings,
  spectator = false,
  leaderboardReveal = "PER_ATTRIBUTE",
}: {
  wineId: string;
  glassNumber: number;
  myParticipantId: string;
  myGuess: GuessRow | null;
  /** id → display name for countries, regions, grapes, designations, plus
   *  the appellation/producer ids of my own guess (looked up upstream). */
  names: Map<string, string>;
  standings: RevealStanding[];
  /** True for someone who never guessed this glass (its contributor, or the
   *  host who set the wines): no verdict, no "you:" column. */
  spectator?: boolean;
  /** The tasting's `leaderboard_reveal`. Under PER_WINE the standings only
   *  move once a glass is fully revealed, so the rank delta is hidden while
   *  this glass is partly revealed (it would describe the previous glass).
   *  PER_ATTRIBUTE keeps the glass-so-far delta on every step (6h/6i).
   *  Optional only until play-experience passes it (T8); absent behaves as
   *  PER_ATTRIBUTE, the column's default and this view's behaviour before the
   *  prop existed. */
  leaderboardReveal?: "PER_ATTRIBUTE" | "PER_WINE";
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_wine_reveal", { p_wine_id: wineId });
  const rev = data as Rev | null;
  if (!rev || rev.reveal_step === 0) return null;

  const me =
    rev.guesses.find((g) => g.participant_id === myParticipantId) ?? null;
  const myValues: Cell = me?.values ?? {};
  const myPoints = me?.points ?? {};
  // A missing key and a JSON null both stay null — never read as 0 points.
  const pointsOf = (key: string): number | null => {
    const value = myPoints[key];
    return typeof value === "number" ? value : null;
  };

  // Only the truth's appellation/producer and my own can be missing from the
  // upstream map — nobody else's answers are rendered here.
  const looked = await lookupAppellationAndProducerNames({
    appellationIds: [
      rev.correct.appellation as string | null,
      myValues.appellation as string | null,
    ],
    producerIds: [
      rev.correct.producer as string | null,
      myValues.producer as string | null,
    ],
  });
  const nameOf = (id: string | number | null | undefined): string | null => {
    if (id == null) return null;
    return names.get(String(id)) ?? looked.get(String(id)) ?? "—";
  };

  const revealedKeys = rev.revealed_keys as RevealKey[];
  const revealedSet = new Set<string>(revealedKeys);
  const { keys } = inPlayKeys(revealedKeys, rev.in_play_count);
  const hasSecondary = rev.correct.secondary_grape != null;

  // My saved answer for a still-hidden row, from my own row.
  const savedMine = (key: RevealKey): string | null => {
    if (!myGuess) return null;
    switch (key) {
      case "country":
        return nameOf(myGuess.country_id);
      case "region":
        return nameOf(myGuess.region_id);
      case "appellation":
        return nameOf(myGuess.appellation_id);
      case "grapes":
        return myGuess.primary_grape_id
          ? nameOf(myGuess.primary_grape_id)! +
              (myGuess.secondary_grape_id
                ? ` / ${nameOf(myGuess.secondary_grape_id)}`
                : "")
          : null;
      case "producer":
        return nameOf(myGuess.producer_id);
      case "type_designation":
        return nameOf(myGuess.type_designation_id);
      case "vintage":
        return vintageLabel(myGuess);
    }
  };

  const rows: Row[] = keys.map((key) => {
    const max = keyMaxPoints(key);
    if (!revealedSet.has(key)) {
      return {
        key,
        label: keyLabel(key),
        truth: null,
        notRecorded: false,
        mine: savedMine(key),
        points: null,
        max,
        hidden: true,
      };
    }
    if (key === "grapes") {
      const notRecorded = rev.correct.primary_grape == null;
      const truth = notRecorded
        ? NOT_RECORDED
        : nameOf(rev.correct.primary_grape) +
          (hasSecondary ? ` / ${nameOf(rev.correct.secondary_grape)}` : "");
      const mine =
        myValues.primary_grape != null
          ? nameOf(myValues.primary_grape)! +
            (myValues.secondary_grape
              ? ` / ${nameOf(myValues.secondary_grape)}`
              : "")
          : null;
      // Each half keeps its own null (a null secondary means the wine has no
      // second grape); the row is unscored only when neither half scored.
      const primaryPoints = pointsOf("primary_grape");
      const secondaryPoints = pointsOf("secondary_grape");
      const points =
        primaryPoints === null && secondaryPoints === null
          ? null
          : (primaryPoints ?? 0) + (secondaryPoints ?? 0);
      return {
        key,
        label: keyLabel(key, hasSecondary),
        truth,
        notRecorded,
        mine,
        points,
        max: hasSecondary ? 10 : 8,
        hidden: false,
      };
    }
    if (key === "vintage") {
      const truth = vintageLabel(rev.correct);
      return {
        key,
        label: keyLabel(key),
        truth: truth ?? NOT_RECORDED,
        notRecorded: truth == null,
        mine: vintageLabel(myValues),
        points: pointsOf("vintage"),
        max,
        hidden: false,
      };
    }
    const truthId = rev.correct[key];
    return {
      key,
      label: keyLabel(key),
      truth: truthId == null ? NOT_RECORDED : nameOf(truthId),
      notRecorded: truthId == null,
      mine: nameOf(myValues[key]),
      points: pointsOf(key),
      max,
      hidden: false,
    };
  });

  const newestKey = revealedKeys[revealedKeys.length - 1];
  const hero = rows.find((r) => r.key === newestKey) ?? null;
  const verdict: Verdict = hero ? verdictOf(hero) : "skipped";

  // Dense ranks for the list; the delta pill below reads the same dense rank
  // (rankDelta → competitorRank), and the gold top row keys on rank === 1.
  const ranked = rankRows(standings, (s) => s.total);
  const anyTied = ranked.some((r) => r.tied);
  // Under PER_WINE the leaderboard holds still until the glass is fully
  // revealed, so a mid-glass delta would restate the previous glass's move.
  const showDelta = leaderboardReveal !== "PER_WINE" || rev.is_fully_revealed;
  const delta = showDelta
    ? rankDelta(
        standings.map((s) => ({
          participantId: s.participantId,
          total: s.total,
          lastRoundPoints: s.lastRoundPoints,
        })),
        myParticipantId,
      )
    : null;

  return (
    <div className="flex flex-col bg-console text-background">
      {/* Header */}
      <div className="flex items-center gap-[9px] px-4 pt-3 pb-[11px]">
        <span className="flex items-center gap-[7px]">
          <LiveDot size={6} />
          <Eyebrow size="lg" className="tracking-[.15em] text-gold-light">
            Revealing glass {glassNumber}
          </Eyebrow>
        </span>
        <span className="ml-auto text-[11.5px] text-console-ink tabular-nums">
          {rev.reveal_step} of {rev.in_play_count} attributes
        </span>
      </div>

      <div className="flex flex-col gap-[14px] px-4 pb-4">
        {/* Hero: the newest revealed category */}
        {hero ? (
          <div className="flex flex-col items-center gap-[9px] pt-[10px] pb-1 text-center">
            <Eyebrow size="lg" className="text-console-ink">
              {heroLabel(hero.key, hero.key === "grapes" && hasSecondary)}
            </Eyebrow>
            <span
              className={cn(
                "font-heading text-[46px] font-semibold leading-none lining-nums tabular-nums",
                hero.notRecorded ? "text-console-ink" : "text-gold-light",
              )}
            >
              {hero.truth}
            </span>
            {spectator ? null : (
              <span
                className={cn(
                  "flex items-center gap-[9px] rounded-full px-4 py-2",
                  verdict === "hit" &&
                    "border border-gold-light bg-gold-light/16",
                  verdict === "miss" && "border border-rose/60 bg-rose/15",
                  verdict === "skipped" &&
                    "border border-dashed border-background/30 text-console-ink",
                  verdict === "unscored" &&
                    "border border-background/30 text-console-ink",
                )}
              >
                {verdict === "hit" ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-gold-light text-console">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                ) : null}
                <span className="text-[14.5px] font-bold">
                  {verdictText(hero, verdict)}
                </span>
              </span>
            )}
          </div>
        ) : null}

        {/* Every in-play row */}
        <div className="flex flex-col gap-[7px]">
          {rows.map((r) => {
            const isHero = hero?.key === r.key;
            // Hit and miss both need a real score: a row with nothing on
            // record, or null points on my guess, stays neutral.
            const scored = !r.hidden && !r.notRecorded && r.points !== null;
            const hit = scored && (r.points ?? 0) > 0;
            const miss = scored && r.mine != null && r.points === 0;
            return (
              <div
                key={r.key}
                className={cn(
                  "flex items-center gap-[11px] rounded-[11px] p-[11px_13px]",
                  r.hidden
                    ? "border border-dashed border-background/20 opacity-55"
                    : hit
                      ? "border-[1.5px] border-gold-light bg-gold-light/14"
                      : miss
                        ? "border border-rose/50 bg-console-card"
                        : "border border-background/14 bg-console-card",
                )}
              >
                <span
                  className={cn(
                    "w-16 shrink-0 text-[11px]",
                    hit ? "text-gold-light" : "text-console-ink",
                  )}
                >
                  {r.label}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13.5px]",
                    r.hidden || r.notRecorded
                      ? "text-console-ink"
                      : isHero
                        ? "font-bold"
                        : "font-semibold",
                  )}
                >
                  {r.hidden ? "still hidden" : r.truth}
                </span>
                {spectator ? null : (
                  <span
                    className={cn(
                      "max-w-[40%] truncate text-[12.5px]",
                      miss
                        ? "text-miss"
                        : hit
                          ? "text-gold-light"
                          : "text-console-ink",
                    )}
                  >
                    you: {r.mine ?? "—"}
                  </span>
                )}
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    r.hidden
                      ? "text-[13px] text-console-ink"
                      : r.notRecorded
                        ? "text-[12px] text-console-ink"
                        : hit
                          ? "text-[13px] font-bold text-gold-light"
                          : "text-[13px] font-bold text-console-ink",
                  )}
                >
                  {r.hidden
                    ? r.max
                    : r.notRecorded
                      ? NOT_SCORED
                      : r.points === null
                        ? "—"
                        : r.points > 0
                          ? `+${r.points}`
                          : "0"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Standings */}
        {ranked.length > 0 ? (
          <div className="flex flex-col gap-[9px] rounded-[14px] border border-background/14 bg-console-card p-[13px_14px]">
            <div className="flex items-baseline gap-[9px]">
              <Eyebrow size="md" className="text-console-ink">
                Standings
              </Eyebrow>
              {delta ? (
                <span
                  className={cn(
                    "ml-auto flex items-center gap-[6px] text-[12px] font-bold tabular-nums",
                    delta.after < delta.before
                      ? "text-gold-light"
                      : delta.after > delta.before
                        ? "text-miss"
                        : "text-console-ink",
                  )}
                >
                  {delta.after < delta.before
                    ? `▲ ${ordinal(delta.before)} → ${ordinal(delta.after)}`
                    : delta.after > delta.before
                      ? `▼ ${ordinal(delta.before)} → ${ordinal(delta.after)}`
                      : `= ${ordinal(delta.after)}`}
                </span>
              ) : null}
            </div>
            {ranked.map(({ row: s, rank, tied }, i) => (
              <span
                key={s.participantId}
                className={cn(
                  "flex items-baseline gap-[10px] py-1.5",
                  i < ranked.length - 1 && "border-b border-background/12",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 font-heading text-[15px] lining-nums tabular-nums",
                    anyTied ? "w-6" : "w-[15px]",
                    rank === 1 ? "text-gold-light" : "text-console-ink",
                  )}
                >
                  {rankLabel({ rank, tied })}
                </span>
                <span
                  className={cn(
                    "flex-1 truncate text-[13.5px]",
                    s.isMe && "font-bold",
                  )}
                >
                  {s.isMe ? "You" : s.name}
                </span>
                <span
                  className={cn(
                    "text-[13.5px] text-gold-light tabular-nums",
                    s.isMe && "font-bold",
                  )}
                >
                  {s.total}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
