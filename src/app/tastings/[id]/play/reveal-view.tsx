import { Check } from "lucide-react";
import { Eyebrow } from "@/components/overview/eyebrow";
import { LiveDot } from "@/components/overview/live-dot";
import { createClient } from "@/lib/supabase/server";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { rankDelta } from "@/lib/guess-ladder-math";
import { glassFacts, type FactRow } from "@/lib/host-facts";
import { lockedLine, rankDeltaPill, revealHeaderMeta, revealingGlass } from "@/lib/reveal-copy";
import {
  heroLabel,
  inPlayKeys,
  keyLabel,
  keyMaxPoints,
  type RevealKey,
} from "@/lib/reveal-rows-math";
import { rankLabel, rankRows } from "@/lib/stats-math";
import { cn } from "@/lib/utils";
import type { GuessRow } from "./ladder-types";

// The spoiler-safe progressive read shape (get_wine_reveal). Only categories
// <= reveal_step are present; unrevealed ones are omitted entirely.
// `in_play_count` is null only at step 0 (M1) — never read here, since
// RevealView returns before that point.
type Rev = {
  reveal_step: number;
  in_play_count: number | null;
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
  hostName,
  eligibleIds,
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
  /** Whoever is driving the reveal — the laptop header's "{host} is driving". */
  hostName: string;
  /** Eligible guessers for this glass (`eligibleForGlass`), for "This glass"'s
   *  "k of n" facts — never every participant. */
  eligibleIds: string[];
}) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_wine_reveal", { p_wine_id: wineId });
  const rev = data as Rev | null;
  if (!rev || rev.reveal_step === 0) return null;
  // Guaranteed non-null past step 0 (M1 nulls it only at step 0) — the
  // fallback is for the type checker, not a real case.
  const inPlayCount = rev.in_play_count ?? 0;

  const me =
    rev.guesses.find((g) => g.participant_id === myParticipantId) ?? null;
  const myValues: Cell = me?.values ?? {};
  const myPoints = me?.points ?? {};
  // A missing key and a JSON null both stay null — never read as 0 points.
  const pointsOf = (key: string): number | null => {
    const value = myPoints[key];
    return typeof value === "number" ? value : null;
  };

  // The truth's appellation/producer, mine, and — for the "This glass" facts
  // rail below, which polls every guess on the glass currently revealing —
  // every OTHER guesser's appellation pick too (`rev.guesses[].values`, from
  // the spoiler-safe RPC; nobody else's answers are rendered outside the
  // facts rail, only tallied into "Most said {appellation}"). Mirrors the
  // host console's identical `rpcAppellationIds` collection in
  // host/page.tsx.
  const looked = await lookupAppellationAndProducerNames({
    appellationIds: [
      rev.correct.appellation as string | null,
      myValues.appellation as string | null,
      ...rev.guesses.map((g) => g.values.appellation as string | null | undefined),
    ],
    producerIds: [
      rev.correct.producer as string | null,
      myValues.producer as string | null,
    ],
  });
  // Strict: null when unresolved, so `glassFacts`/`mostSaidAppellation` can
  // drop a fact whose name can't be looked up rather than showing a "—"
  // placeholder as if it were a real answer.
  const strictNameOf = (id: string | number | null | undefined): string | null => {
    if (id == null) return null;
    return names.get(String(id)) ?? looked.get(String(id)) ?? null;
  };
  // Display: same lookup, but a resolvable id that still comes up empty
  // reads as the placeholder dash rather than vanishing — used for the
  // truth/mine cells, never for `glassFacts`.
  const nameOf = (id: string | number | null | undefined): string | null => {
    if (id == null) return null;
    return strictNameOf(id) ?? "—";
  };

  const revealedKeys = rev.revealed_keys as RevealKey[];
  const revealedSet = new Set<string>(revealedKeys);
  const { keys } = inPlayKeys(revealedKeys, inPlayCount);
  const hasSecondary = rev.correct.secondary_grape != null;

  // "This glass" facts (spec §11.3 item 3; shared rule in host-facts.ts):
  // counted from categories already revealed to everyone. From the first
  // revealed category every guess on this glass is already frozen and scored
  // (`reveal_next_category` stamps `scored_at` on every row) — get_wine_reveal
  // doesn't carry `locked_at`/`scored_at` itself, so a truthy placeholder here
  // marks every row "counted" without a second read (mirrors the host
  // console's identical `glassFacts` call in host/page.tsx).
  const factRows: FactRow[] = rev.guesses.map((g) => ({
    participant_id: g.participant_id,
    primary_grape_id: (g.values.primary_grape as string | null | undefined) ?? null,
    appellation_id: (g.values.appellation as string | null | undefined) ?? null,
    locked_at: null,
    scored_at: "revealed",
  }));
  const facts = glassFacts({
    revealedKeys,
    answer: {
      primary_grape_id: (rev.correct.primary_grape as string | undefined) ?? "",
      appellation_id: (rev.correct.appellation as string | null | undefined) ?? null,
    },
    rows: factRows,
    eligibleIds: new Set(eligibleIds),
    nameOf: strictNameOf,
  });

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
  // Null both while the delta is withheld (PER_WINE, mid-glass) and once the
  // rank genuinely did not move — the pill shows only a change (rankDeltaPill).
  const deltaLabel = delta ? rankDeltaPill(delta) : null;
  const deltaUp = delta !== null && delta.after < delta.before;

  // The locked line under the rows (spec §11.3 item 2): every still-hidden
  // row's label and what it is worth, summed.
  const lockedText = lockedLine(
    rows.filter((r) => r.hidden).map((r) => ({ label: r.label, points: r.max })),
  );

  // Standings cap (refinement 16, REVEAL-09): top 3 on phones, top 5 on
  // laptops, the viewer's own row always included even outside the cap.
  const capStandings = (limit: number) => {
    const capped = ranked.slice(0, limit);
    if (capped.some((r) => r.row.isMe)) return capped;
    const mine = ranked.find((r) => r.row.isMe);
    return mine ? [...capped, mine] : capped;
  };
  const standingsPhone = capStandings(3);
  const standingsLaptop = capStandings(5);

  return (
    <div className="flex flex-col bg-background text-foreground">
      {/* Header. Laptop: the attribute/host meta line and the rank-delta
          pill share the header row (spec §11.3 item 1); phones keep the bare
          attribute count here and the delta on the standings card below. */}
      <div className="flex items-center gap-[9px] px-4 pt-3 pb-[11px]">
        <span className="flex items-center gap-[7px]">
          <LiveDot size={6} />
          <Eyebrow size="lg" className="tracking-[.15em] text-gold-dark">
            {revealingGlass(glassNumber)}
          </Eyebrow>
        </span>
        <span className="ml-auto hidden items-center gap-[10px] md:flex">
          <span className="text-[11.5px] text-muted-foreground tabular-nums">
            {revealHeaderMeta(rev.reveal_step, inPlayCount, hostName)}
          </span>
          {deltaLabel ? (
            <span
              key={rev.reveal_step}
              className={cn(
                "animate-rise-in text-[12px] font-bold tabular-nums",
                deltaUp ? "text-gold-dark" : "text-destructive",
              )}
            >
              {deltaLabel}
            </span>
          ) : null}
        </span>
        <span className="ml-auto text-[11.5px] text-muted-foreground tabular-nums md:hidden">
          {rev.reveal_step} of {inPlayCount} attributes
        </span>
      </div>

      <div className="flex flex-col gap-[14px] px-4 pb-4 md:flex-row md:items-start md:gap-6">
        {/* Left: the hero, every in-play row, the locked line */}
        <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
          {/* Hero: the newest revealed category. Keyed on reveal_step so it
              (and its verdict pill) remount and animate in on every advance
              (MISSED-03); nothing moves under prefers-reduced-motion. */}
          {hero ? (
            <div
              key={rev.reveal_step}
              className="animate-rise-in flex flex-col items-center gap-[9px] pt-[10px] pb-1 text-center"
            >
              <Eyebrow size="lg" className="text-muted-foreground">
                {heroLabel(hero.key, hero.key === "grapes" && hasSecondary)}
              </Eyebrow>
              <span
                className={cn(
                  "font-heading text-[46px] font-semibold leading-none lining-nums tabular-nums",
                  hero.notRecorded ? "text-muted-foreground" : "text-gold-dark",
                )}
              >
                {hero.truth}
              </span>
              {spectator ? null : (
                <span
                  className={cn(
                    "flex items-center gap-[9px] rounded-full px-4 py-2",
                    verdict === "hit" &&
                      "border border-gold bg-gold/16",
                    verdict === "miss" && "border border-rose/60 bg-rose/15",
                    verdict === "skipped" &&
                      "border border-dashed border-border text-muted-foreground",
                    verdict === "unscored" &&
                      "border border-border text-muted-foreground",
                  )}
                >
                  {verdict === "hit" ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-gold text-on-accent">
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
                      ? "border border-dashed border-border-light opacity-55"
                      : hit
                        ? "border-[1.5px] border-gold bg-gold/14"
                        : miss
                          ? "border border-rose/50 bg-card"
                          : "border border-border-light bg-card",
                  )}
                >
                  <span
                    className={cn(
                      "w-16 shrink-0 text-[11px]",
                      hit ? "text-gold-dark" : "text-muted-foreground",
                    )}
                  >
                    {r.label}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13.5px]",
                      r.hidden || r.notRecorded
                        ? "text-muted-foreground"
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
                          ? "text-destructive"
                          : hit
                            ? "text-gold-dark"
                            : "text-muted-foreground",
                      )}
                    >
                      you: {r.mine ?? "—"}
                    </span>
                  )}
                  <span
                    key={isHero ? rev.reveal_step : undefined}
                    className={cn(
                      "shrink-0 tabular-nums",
                      isHero && "animate-rise-in",
                      r.hidden
                        ? "text-[13px] text-muted-foreground"
                        : r.notRecorded
                          ? "text-[12px] text-muted-foreground"
                          : hit
                            ? "text-[13px] font-bold text-gold-dark"
                            : "text-[13px] font-bold text-muted-foreground",
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

          {lockedText ? (
            <p className="text-[11.5px] text-muted-foreground">{lockedText}</p>
          ) : null}

          {/* Phone: standings sit under the rows, capped to the top 3 with
              the delta the header hides on this width. Laptop keeps its own
              copy in the right rail below. */}
          <div className="md:hidden">
            <StandingsCard
              rows={standingsPhone}
              anyTied={anyTied}
              deltaLabel={deltaLabel}
              deltaUp={deltaUp}
              revealStep={rev.reveal_step}
            />
          </div>
        </div>

        {/* Right rail (laptop only): "This glass" facts, then standings
            capped to the top 5 — the delta already lives in the header up
            there, so this copy never repeats it. */}
        <div className="hidden shrink-0 flex-col gap-[16px] md:flex md:w-[300px]">
          {facts.length > 0 ? (
            <div className="flex flex-col gap-[9px]">
              <Eyebrow size="md" className="text-muted-foreground">
                This glass
              </Eyebrow>
              <div className="flex flex-col gap-[7px]">
                {facts.map((fact) => (
                  <span
                    key={fact.label}
                    className="flex justify-between gap-3 text-[12.5px]"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {fact.label}
                    </span>
                    <span className="shrink-0 truncate font-semibold tabular-nums">
                      {fact.value}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <StandingsCard rows={standingsLaptop} anyTied={anyTied} deltaLabel={null} deltaUp={false} revealStep={rev.reveal_step} />
        </div>
      </div>
    </div>
  );
}

/** One standings card, shared by the phone (under the rows) and laptop (right
 *  rail) placements above — only their row cap and whether they carry the
 *  delta pill differ. `deltaLabel` null suppresses the pill outright, so the
 *  laptop copy (whose delta already sits in the header) never repeats it. */
function StandingsCard({
  rows,
  anyTied,
  deltaLabel,
  deltaUp,
  revealStep,
}: {
  rows: { row: RevealStanding; rank: number; tied: boolean }[];
  anyTied: boolean;
  deltaLabel: string | null;
  deltaUp: boolean;
  revealStep: number;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-[9px] rounded-[14px] border border-border-light bg-card p-[13px_14px]">
      <div className="flex items-baseline gap-[9px]">
        <Eyebrow size="md" className="text-muted-foreground">
          Standings
        </Eyebrow>
        {deltaLabel ? (
          <span
            key={revealStep}
            className={cn(
              "animate-rise-in ml-auto flex items-center gap-[6px] text-[12px] font-bold tabular-nums",
              deltaUp ? "text-gold-dark" : "text-destructive",
            )}
          >
            {deltaLabel}
          </span>
        ) : null}
      </div>
      {rows.map(({ row: s, rank, tied }, i) => (
        <span
          key={s.participantId}
          className={cn(
            "flex items-baseline gap-[10px] py-1.5",
            i < rows.length - 1 && "border-b border-border-light",
          )}
        >
          <span
            className={cn(
              "shrink-0 font-heading text-[15px] lining-nums tabular-nums",
              anyTied ? "w-6" : "w-[15px]",
              rank === 1 ? "text-gold-dark" : "text-muted-foreground",
            )}
          >
            {rankLabel({ rank, tied })}
          </span>
          <span className={cn("flex-1 truncate text-[13.5px]", s.isMe && "font-bold")}>
            {s.isMe ? "You" : s.name}
          </span>
          <span
            className={cn(
              "text-[13.5px] text-gold-dark tabular-nums",
              s.isMe && "font-bold",
            )}
          >
            {s.total}
          </span>
        </span>
      ))}
    </div>
  );
}
