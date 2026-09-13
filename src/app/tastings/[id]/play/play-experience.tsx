import { ChevronDown, Wine } from "lucide-react";
import { AnswerFacts, type AnswerFact } from "../answer-facts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsiblePanel } from "@/components/collapsible-panel";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getReferenceOptions,
  getTastingRow,
  getWineRows,
} from "@/lib/tasting-request-cache";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { makeWineLabeler } from "@/lib/wine-label";
import { getTastingLeaderboard } from "@/lib/tasting-leaderboard";
import { eligibleForGlass } from "@/lib/glass-eligibility";
import { shortlistGrapesForRegion } from "@/lib/grape-shortlist";
import { getReferenceCounts } from "@/lib/reference-counts";
import { canNoteHiddenGlass } from "@/lib/wset/hidden-note";
import { assessedOf, summarizeNoteRow } from "@/lib/wset/note-summary";
import { buildPickCounts, type PickCounts } from "./pick-counts";
import { flightSegments, pointsAtStake } from "@/lib/guess-ladder-math";
import { currentGlass, pouredThrough, type PointerGlass } from "@/lib/pour-pointer";
import { rankLabel, rankRows } from "@/lib/stats-math";
import {
  getSemiBlindBoard,
  getSemiBlindCandidates,
  getSemiBlindRevealedPicks,
} from "@/lib/semi-blind-data";
import type { BoardGlass } from "@/lib/semi-blind-board";
import { candidateLabel } from "@/lib/semi-blind-copy";
import {
  pendingAnswerNotice,
  type IncompleteGlass,
} from "@/lib/wine-identity/incomplete";
import { listIncompleteGlasses } from "@/lib/wine-identity/server/incomplete-glasses";
import { AutoRefresh } from "@/components/auto-refresh";
import { RevealSync } from "@/components/reveal-sync";
import { cn } from "@/lib/utils";
import type { GrapeShortlist, GuessRow, RankChip } from "./ladder-types";
import { GlassStage, type LockedInPerson } from "./locked-in";
import { MatchBoard } from "./match-board";
import type { NoteThisGlassData } from "./note-this-glass";
import { PausedBand } from "./paused-band";
import { RevealButton } from "./reveal-button";
import { RevealControls } from "./reveal-controls";
import { RevealView, type RevealStanding } from "./reveal-view";
import { SemiBlindReveal, type SemiBlindRevealProps } from "./semi-blind-reveal";

// One aligned row per scored attribute — the correct value, the taster's
// guess, and the points — so the score reads as an auditable result sheet
// instead of a loose row of chips. Colour is paired with an icon + text.
function AttributeSheet({
  rows,
}: {
  rows: {
    label: string;
    correct: string;
    guessed: string | null;
    points: number;
  }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      {rows.map((r) => {
        const got = r.points > 0;
        const missed = r.guessed !== null && r.points === 0;
        return (
          <div
            key={r.label}
            className="flex items-baseline gap-2 border-t border-border/50 px-3 py-1.5 text-sm first:border-t-0"
          >
            <span className="w-24 shrink-0 text-xs text-muted-foreground">
              {r.label}
            </span>
            <span className="min-w-0 flex-1">
              {r.correct}
              {r.guessed !== r.correct ? (
                <span className="text-muted-foreground">
                  {" · you: "}
                  {r.guessed ?? "not answered"}
                </span>
              ) : null}
            </span>
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 tabular-nums",
                got
                  ? "text-[#3f5b42]"
                  : missed
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              <span aria-hidden>{got ? "✓" : missed ? "✕" : "—"}</span>
              {r.points > 0 ? `+${r.points}` : "0"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// The columns the ladder edits, picked off a full guesses row so only plain
// data crosses into the client components.
function toGuessRow(g: {
  country_id: string | null;
  region_id: string | null;
  appellation_id: string | null;
  primary_grape_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: GuessRow["vintage_kind"];
  vintage_year: number | null;
  vintage_tawny_years: number | null;
  locked_at: string | null;
  scored_at: string | null;
}): GuessRow {
  return {
    country_id: g.country_id,
    region_id: g.region_id,
    appellation_id: g.appellation_id,
    primary_grape_id: g.primary_grape_id,
    secondary_grape_id: g.secondary_grape_id,
    producer_id: g.producer_id,
    type_designation_id: g.type_designation_id,
    vintage_kind: g.vintage_kind,
    vintage_year: g.vintage_year,
    vintage_tawny_years: g.vintage_tawny_years,
    locked_at: g.locked_at,
    scored_at: g.scored_at,
  };
}

/**
 * The whole guess-and-reveal-and-results experience for a tasting, as an
 * embeddable server component. Rendered inline on the tasting main page (so
 * everything lives on one page) and also by the standalone /play route.
 * Shows, per wine, one of: the 6e guess ladder (autosaving, "Lock in"), the
 * 6g locked-in wait, the 6h participant reveal while the host steps through
 * the categories, or — once resolved — the answer plus EVERY participant's
 * per-category breakdown. Semi-blind glasses go through the match ladder.
 *
 * Readiness keys off `locked` (tasting_guess_status.locked): a draft row
 * that has only been autosaved is "in progress", not "guessed".
 *
 * Assumes the caller only renders it for a JOINED participant of a started
 * tasting; it still guards, rendering nothing otherwise.
 */
export async function PlayExperience({
  tastingId,
  embedded = false,
}: {
  tastingId: string;
  embedded?: boolean;
}) {
  const supabase = await createClient();
  // Shared with the enclosing tasting page and StandingsPanel via the
  // per-request cache, so when this renders embedded these cost nothing.
  const user = await getCurrentUser();
  if (!user) return null;

  const tasting = await getTastingRow(tastingId);
  if (!tasting) return null;

  const isHost = tasting.host_id === user.id;
  const isSemiBlind = tasting.reveal_mode === "SEMI_BLIND";
  // Guided pacing is LIVE-only (spec §D.1 #1): a self-paced tasting may still
  // carry a flag stored before that rule, and it is ignored on read — no
  // backfill. This one flag drives both the per-attribute reveal UI and the
  // one-glass-at-a-time locking below.
  const guidedLive =
    tasting.timing_mode === "LIVE" && tasting.sequential_guessing && !isSemiBlind;
  // ASYNC + IMMEDIATE: locking a COMPLETE glass scores it and shows the answer
  // straight away, and a scored guess can no longer be unlocked — so the lock
  // confirm's "it can't be changed afterwards" holds without the UI hiding
  // anything. An INCOMPLETE glass is the one case that waits: it locks
  // unscored, and the deferred-scoring pair below carries it.
  const scoresOnLock =
    tasting.timing_mode === "ASYNC" && tasting.async_reveal_policy === "IMMEDIATE";
  // The host who provided all the wines set the answers — they host, they
  // don't guess. (In bring-your-own the host guesses everyone else's bottles.)
  const hostProvidesHost = tasting.wine_source === "HOST_PROVIDES" && isHost;

  const { data: myParticipant } = await supabase
    .from("tasting_participants")
    .select("id, status")
    .eq("tasting_id", tastingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!myParticipant || myParticipant.status !== "JOINED") return null;
  const finished = tasting.status === "CLOSED";
  if (tasting.status === "DRAFT") return null;

  const [wines, reference, { data: typeDesignations }, referenceCounts] = await Promise.all([
    getWineRows(tastingId),
    getReferenceOptions(),
    supabase
      .from("type_designations")
      .select("id, name, category, country_id")
      .eq("is_active", true)
      .order("sort_order"),
    getReferenceCounts(),
  ]);
  const { countries, regions, grapes } = reference;

  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }

  function vintageLabel(row: {
    vintage_kind: string | null;
    vintage_year: number | null;
    vintage_tawny_years: number | null;
  }) {
    if (row.vintage_kind === "YEAR") return String(row.vintage_year ?? "—");
    if (row.vintage_kind === "NV") return "NV";
    if (row.vintage_kind === "TAWNY")
      return `${row.vintage_tawny_years ?? "?"} years tawny`;
    return "—";
  }

  type AnswerLike = {
    country_id: string;
    region_id: string;
    appellation_id: string | null;
    primary_grape_id: string;
    secondary_grape_id: string | null;
    producer_id: string | null;
    type_designation_id: string | null;
    vintage_kind: string | null;
    vintage_year: number | null;
    vintage_tawny_years: number | null;
  };

  const name = (id: string | null) => (id ? (nameById.get(id) ?? "—") : "—");

  // Same answer, as labelled columns for the post-reveal card.
  function answerFacts(answer: AnswerLike): AnswerFact[] {
    const grapes = [answer.primary_grape_id, answer.secondary_grape_id]
      .filter(Boolean)
      .map((id) => name(id as string))
      .join(" / ");
    return [
      { label: "Country", value: name(answer.country_id) },
      { label: "Region", value: name(answer.region_id) },
      ...(answer.appellation_id
        ? [{ label: "Appellation", value: name(answer.appellation_id) }]
        : []),
      {
        label: answer.secondary_grape_id ? "Grapes" : "Grape",
        value: grapes,
      },
      {
        label: "Producer",
        value: answer.producer_id ? name(answer.producer_id) : "Unknown",
      },
      ...(answer.type_designation_id
        ? [{ label: "Designation", value: name(answer.type_designation_id) }]
        : []),
      { label: "Vintage", value: vintageLabel(answer) },
    ];
  }

  const wineIds = (wines ?? []).map((w) => w.id);
  const { data: myGuesses } = await supabase
    .from("guesses")
    .select("*")
    .eq("participant_id", myParticipant.id)
    .in("wine_id", wineIds.length > 0 ? wineIds : [""]);
  const myGuessByWineId = new Map((myGuesses ?? []).map((g) => [g.wine_id, g]));

  // BT-N2: the viewer's own identity-less ("hidden-glass") notes on this
  // tasting's glasses, for "Note this glass"'s "Your note · {d} of {t}
  // assessed" (it reopens the note instead of starting a blank one). The
  // "wset notes read" policy grants a row with no identity to its author
  // only, so no explicit author filter is needed here (spec §9.4).
  const { data: myHiddenNotes } = await supabase
    .from("wset_notes")
    .select("*")
    .in("tasting_wine_id", wineIds.length > 0 ? wineIds : [""])
    .is("catalog_wine_id", null)
    .is("unidentified_wine_id", null)
    .order("updated_at", { ascending: false });
  const hiddenNoteIds = (myHiddenNotes ?? []).map((n) => n.id);
  const { data: hiddenNoteAromas } =
    hiddenNoteIds.length > 0
      ? await supabase
          .from("wset_note_aromas")
          .select("note_id, term_id, sensed_on_nose, sensed_on_palate")
          .in("note_id", hiddenNoteIds)
      : { data: [] };
  const hiddenNoteAromasByNoteId = new Map<
    string,
    { term_id: string; sensed_on_nose: boolean; sensed_on_palate: boolean }[]
  >();
  for (const a of hiddenNoteAromas ?? []) {
    const arr = hiddenNoteAromasByNoteId.get(a.note_id) ?? [];
    arr.push(a);
    hiddenNoteAromasByNoteId.set(a.note_id, arr);
  }
  // At most one note per glass in the ordinary flow; ordered by most
  // recently updated first so a stray duplicate still resolves to the one
  // the viewer actually worked on last.
  const hiddenNoteByWineId = new Map<string, NonNullable<typeof myHiddenNotes>[number]>();
  for (const n of myHiddenNotes ?? []) {
    if (n.tasting_wine_id && !hiddenNoteByWineId.has(n.tasting_wine_id)) {
      hiddenNoteByWineId.set(n.tasting_wine_id, n);
    }
  }

  const [{ data: participantRows }, { data: guessStatus }] = await Promise.all([
    supabase
      .from("tasting_participants")
      .select("id, user_id, status")
      .eq("tasting_id", tastingId),
    supabase.rpc("tasting_guess_status", { p_tasting_id: tastingId }),
  ]);
  const pUserIds = (participantRows ?? []).map((p) => p.user_id);
  const { data: pProfiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", pUserIds.length > 0 ? pUserIds : [""]);
  const profileByUserId = new Map((pProfiles ?? []).map((p) => [p.id, p]));
  const nameByParticipantId = new Map(
    (participantRows ?? []).map((p) => [
      p.id,
      profileByUserId.get(p.user_id)?.display_name ??
        profileByUserId.get(p.user_id)?.email ??
        "Someone",
    ]),
  );
  // Q1: the host's name for the paused band (below). The host is always a
  // JOINED participant, so their profile is already in the fetch above.
  const hostName =
    profileByUserId.get(tasting.host_id)?.display_name ??
    profileByUserId.get(tasting.host_id)?.email ??
    "Someone";
  // Per wine: who has a guess row, and whether it is locked. A row that
  // exists but is not locked is an autosaved draft — "in progress".
  const statusByWineId = new Map<string, Map<string, boolean>>();
  for (const row of guessStatus ?? []) {
    const m = statusByWineId.get(row.wine_id) ?? new Map<string, boolean>();
    m.set(row.participant_id, Boolean(row.locked));
    statusByWineId.set(row.wine_id, m);
  }
  const joinedParticipants = (participantRows ?? []).filter(
    (p) => p.status === "JOINED",
  );
  const isHostProvidesHostRow = (p: { user_id: string }) =>
    tasting.wine_source === "HOST_PROVIDES" && p.user_id === tasting.host_id;
  // How many people compete on this tasting (JOINED, minus a HOST_PROVIDES
  // host, who set the answers rather than guessing them) — the ladder
  // header's rank chip "of {competitors}" on laptops.
  const competitors = joinedParticipants.filter((p) => !isHostProvidesHostRow(p)).length;
  // Single source of truth (BT-P2) for who's expected to guess a glass, so
  // this never drifts from the console, the ASYNC auto-reveal or the result
  // and record loaders. joinedAt is unused by eligibleForGlass itself (only
  // joinedAfterReveal reads it), so it's fine left null here.
  const eligibleGuessers = (wine: {
    contributor_participant_id: string | null;
    is_revealed: boolean;
  }) =>
    (participantRows ?? []).filter((p) =>
      eligibleForGlass(
        { id: p.id, userId: p.user_id, status: p.status, joinedAt: null },
        {
          contributorParticipantId: wine.contributor_participant_id,
          isRevealed: wine.is_revealed,
          revealedAt: null,
        },
        { wineSource: tasting.wine_source, hostId: tasting.host_id },
      ),
    );
  const lockedFor = (wineId: string, participantId: string) =>
    statusByWineId.get(wineId)?.get(participantId) === true;
  const hasRowFor = (wineId: string, participantId: string) =>
    statusByWineId.get(wineId)?.has(participantId) === true;

  const wineTitle = makeWineLabeler(
    wines ?? [],
    tasting.wine_source,
    nameByParticipantId,
  );
  // "Glass 3" in the ladders (the handoff's word), the contributor label in
  // bring-your-own.
  const glassLabel = (wine: Parameters<typeof wineTitle>[0], index: number) =>
    tasting.wine_source === "HOST_PROVIDES" ? `Glass ${index + 1}` : wineTitle(wine);

  // Every glass with no answer key yet (spec §C.8). It can be guessed and
  // locked; in ASYNC + IMMEDIATE its score waits until the adder finishes it.
  // listIncompleteGlasses throws on an RPC error so nothing reads a failure as
  // "every glass is complete"; here the failure is caught (a play surface that
  // still renders beats an error boundary) and remembered, so the glasses stay
  // *unknown* rather than silently complete. Same degrade as the host console.
  let incompleteGlasses: IncompleteGlass[] = [];
  let incompleteKnown = true;
  try {
    incompleteGlasses = await listIncompleteGlasses(supabase, tasting.id);
  } catch (e) {
    incompleteKnown = false;
    console.warn(
      `incomplete glasses for tasting ${tasting.id}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const incompleteByWineId = new Map(incompleteGlasses.map((g) => [g.wineId, g]));

  // A shared step reveal is under way: at least one category is out and the
  // glass is not fully revealed yet. Since 20260912090000 no guesser can read
  // its answer row in this state.
  const midStepReveal = (wine: { is_revealed: boolean; reveal_step: number | null }) =>
    !wine.is_revealed && (wine.reveal_step ?? 0) > 0;
  // The shared reveal owns a blind glass from its first revealed category: the
  // 6h reveal view, never a ladder. A semi-blind glass has no per-category
  // view, so a stray step (reveal_next_category refuses no semi-blind glass)
  // leaves it in the match ladder's batch instead of pulling it out.
  const ownedByReveal = (wine: { is_revealed: boolean; reveal_step: number | null }) =>
    !isSemiBlind && midStepReveal(wine);
  // "Resolved for me" = the answer is mine to see — the glass is revealed for
  // everyone, or my own guess is scored (ASYNC + IMMEDIATE). A glass mid
  // step-reveal is never resolved, in either mode, even with a scored guess
  // (amendment 14): reveal_next_category stamps scored_at on every row from
  // step 1, so reading that as "mine to see" would print a semi-blind match's
  // result — which the category steps score 0 — before the glass is revealed.
  const resolvedForMe = (wine: {
    id: string;
    is_revealed: boolean;
    reveal_step: number | null;
  }) =>
    wine.is_revealed ||
    (Boolean(myGuessByWineId.get(wine.id)?.scored_at) && !midStepReveal(wine));

  // Deferred scoring (spec §C.8): my locked guess on a glass that was
  // incomplete when I locked it, now that the adder has finished it. "Once the
  // glass is complete" means known-complete: while the read is unknown nothing
  // is due, so a failed read costs no server action rather than one per glass.
  const scoringDueFor = (wineId: string) => {
    const guess = myGuessByWineId.get(wineId);
    return (
      scoresOnLock &&
      incompleteKnown &&
      !incompleteByWineId.has(wineId) &&
      Boolean(guess?.locked_at) &&
      !guess?.scored_at
    );
  };
  // Why the answer is still hidden while that wait lasts.
  const pendingNoticeFor = (wineId: string) => {
    const row = incompleteByWineId.get(wineId);
    return scoresOnLock && row ? pendingAnswerNotice(row.glass) : null;
  };

  // The pacing half of that same flag: one glass at a time, in order.
  const sequential = guidedLive;
  // The pour pointer's glass (BT-P3), not a bare lowest-position check: a
  // Skip moves tastings.current_wine_id, and a late joiner should open on
  // whichever glass is actually pouring now, skips included.
  const pointerGlasses: PointerGlass[] = (wines ?? []).map((w) => ({
    id: w.id,
    isRevealed: w.is_revealed,
    revealStep: w.reveal_step ?? 0,
  }));
  const currentWineId = sequential
    ? (currentGlass(pointerGlasses, tasting.current_wine_id)?.id ?? null)
    : null;

  const revealedWineIds = (wines ?? [])
    .filter((w) => w.is_revealed)
    .map((w) => w.id);

  // Progress: overall reveal progress drives the bar; in guided (sequential)
  // mode we also surface which wine is live as "Wine N of M".
  const totalWines = (wines ?? []).length;
  const revealedCount = revealedWineIds.length;
  const progressPct = totalWines > 0 ? Math.round((revealedCount / totalWines) * 100) : 0;
  const currentWinePosition = currentWineId
    ? ((wines ?? []).find((w) => w.id === currentWineId)?.position ?? null)
    : null;

  // The one wine the player should focus on now: the guided current wine, or
  // (free mode) the first wine they can still guess. Its card gets the
  // "Now tasting" spotlight; everything else reads as secondary.
  const activeWineId =
    isSemiBlind || finished
      ? null
      : sequential
        ? currentWineId
        : ((wines ?? []).find(
            (w) =>
              !w.is_revealed &&
              !ownedByReveal(w) &&
              !resolvedForMe(w) &&
              !myGuessByWineId.get(w.id)?.locked_at &&
              w.contributor_participant_id !== myParticipant.id &&
              !(tasting.wine_source === "HOST_PROVIDES" && isHost),
          )?.id ?? null);

  const answerWineIds = [
    ...new Set(
      (wines ?? [])
        .filter((w) => resolvedForMe(w))
        .map((w) => w.id),
    ),
  ];
  const { data: resolvedAnswers } =
    answerWineIds.length > 0
      ? await supabase.from("wine_answers").select("*").in("wine_id", answerWineIds)
      : { data: [] };
  const answerByWineId = new Map(
    (resolvedAnswers ?? []).map((a) => [a.wine_id, a]),
  );

  // A wine picked from the catalog carries no photo on its own answer row, so
  // fall back to the linked catalog entry's label photo.
  const catalogIdsNeedingImage = [
    ...new Set(
      [...answerByWineId.values()]
        .filter((a) => !a.image_url && a.catalog_wine_id)
        .map((a) => a.catalog_wine_id as string),
    ),
  ];
  const { data: catalogImages } =
    catalogIdsNeedingImage.length > 0
      ? await supabase
          .from("catalog_wines")
          .select("id, image_url")
          .in("id", catalogIdsNeedingImage)
      : { data: [] };
  const catalogImageById = new Map(
    (catalogImages ?? []).map((c) => [c.id, c.image_url]),
  );

  // Everyone's guesses on revealed wines (RLS opens them once revealed) — for
  // the per-participant breakdown shown after reveal.
  const { data: allRevealedGuesses } = await supabase
    .from("guesses")
    .select("*")
    .in("wine_id", revealedWineIds.length > 0 ? revealedWineIds : [""]);
  type Guess = NonNullable<typeof allRevealedGuesses>[number];
  const revealedGuessesByWineId = new Map<string, Guess[]>();
  for (const g of allRevealedGuesses ?? []) {
    const arr = revealedGuessesByWineId.get(g.wine_id) ?? [];
    arr.push(g);
    revealedGuessesByWineId.set(g.wine_id, arr);
  }

  const lookedUpNames = await lookupAppellationAndProducerNames({
    appellationIds: [
      ...(resolvedAnswers ?? []).map((a) => a.appellation_id),
      ...(allRevealedGuesses ?? []).map((g) => g.appellation_id),
      ...(myGuesses ?? []).map((g) => g.appellation_id),
    ],
    producerIds: [
      ...(resolvedAnswers ?? []).map((a) => a.producer_id),
      ...(allRevealedGuesses ?? []).map((g) => g.producer_id),
      ...(myGuesses ?? []).map((g) => g.producer_id),
    ],
  });
  for (const [id, n] of lookedUpNames) nameById.set(id, n);

  // Semi-blind: the matching board (BT-S3, SB2/SB3). Its list and pool never
  // read wine_answers directly (rule 1) — get_semi_blind_candidates and
  // get_semi_blind_board are the only source, one call each for the whole
  // flight, never per glass. Skipped for the host-provides host (nothing to
  // match) and once the tasting is finished.
  const showMatchBoard = isSemiBlind && !hostProvidesHost && !finished;
  const semiBlindCandidates = showMatchBoard ? await getSemiBlindCandidates(tastingId) : null;
  const boardGlasses: BoardGlass[] = (wines ?? []).map((w, i) => ({
    wineId: w.id,
    glass: i + 1,
    isRevealed: w.is_revealed,
    revealStep: w.reveal_step ?? 0,
    ownBottle: w.contributor_participant_id === myParticipant.id,
  }));
  const semiBlindBoard = showMatchBoard ? await getSemiBlindBoard(tastingId, boardGlasses) : null;
  // The semi-blind flight has its own guided pointer, separate from
  // `sequential`/`guidedLive` above (blind-only — Q8's step reveal never
  // applies here): LIVE + sequential_guessing paces one glass at a time for
  // matching too (refinement 6), otherwise every glass is open at once.
  const semiBlindGuided = isSemiBlind && tasting.timing_mode === "LIVE" && tasting.sequential_guessing;
  const semiBlindPouredThroughIndex = semiBlindGuided
    ? pouredThrough(pointerGlasses, tasting.current_wine_id)
    : null;
  const semiBlindCurrentWineId = semiBlindGuided
    ? (currentGlass(pointerGlasses, tasting.current_wine_id)?.id ?? null)
    : null;

  // SB4 (BT-S4, spec §10.3 item 3): the one glass a `reveal_wine` call most
  // recently finished revealing gets the full reveal treatment below
  // (`SemiBlindReveal`); every other glass — open, locked, not-poured, or
  // revealed earlier — stays inside the persistent MatchBoard above (BT-S3),
  // which already draws a compact "Glass N was …" row for it. `revealed_at`
  // (a plain, non-spoiler `wines` column, same RLS as is_revealed/reveal_step)
  // is the only reliable "most recent" signal: reveal order need not follow
  // list order once glasses resolve independently — ASYNC's per-glass reveal,
  // or a LIVE host's Skip, can both leave a later glass revealed first.
  let semiBlindReveal: { wineId: string; props: SemiBlindRevealProps } | null = null;
  if (showMatchBoard && semiBlindBoard && semiBlindCandidates && revealedWineIds.length > 0) {
    const { data: revealTimestamps } = await supabase
      .from("wines")
      .select("id, revealed_at")
      .in("id", revealedWineIds);
    let latestWineId: string | null = null;
    let latestAt = "";
    for (const row of revealTimestamps ?? []) {
      const at = row.revealed_at ?? "";
      if (at > latestAt) {
        latestAt = at;
        latestWineId = row.id;
      }
    }
    const answer = latestWineId ? answerByWineId.get(latestWineId) : undefined;
    const glassIndex = latestWineId ? (wines ?? []).findIndex((w) => w.id === latestWineId) : -1;
    if (latestWineId && answer && glassIndex >= 0) {
      // Every guesses row on a revealed glass, with no eligibility filter of
      // its own (refinement 18) — a host-provides host's blank row or a
      // contributor's own never counts towards "the table split" or the
      // standings, so both are filtered through the same eligibleGuessers
      // rule the rest of this page already uses.
      const revealedPicks = await getSemiBlindRevealedPicks(tastingId);
      const wineByIdForPicks = new Map((wines ?? []).map((w) => [w.id, w]));
      const eligiblePicks = revealedPicks.filter((p) => {
        const w = wineByIdForPicks.get(p.glassWineId);
        return w ? eligibleGuessers(w).some((e) => e.id === p.participantId) : false;
      });
      const myPick = revealedPicks.find(
        (p) => p.glassWineId === latestWineId && p.participantId === myParticipant.id,
      );
      const trueKey = semiBlindBoard.revealedKeyByGlass[latestWineId] ?? null;
      const cardByKey = new Map(semiBlindCandidates.cards.map((c) => [c.key, c]));
      const splitRows = (semiBlindBoard.splitByGlass[latestWineId] ?? []).map((row) => ({
        label: candidateLabel(
          cardByKey.get(row.key) ?? { producer: null, wineName: null, vintageLabel: "" },
        ),
        count: row.count,
        correct: row.key === trueKey,
      }));
      const semiBlindCompetitors = joinedParticipants.filter((p) => !isHostProvidesHostRow(p));
      const matchesByParticipant = new Map<string, number>();
      for (const p of eligiblePicks) {
        if (!p.correct) continue;
        matchesByParticipant.set(p.participantId, (matchesByParticipant.get(p.participantId) ?? 0) + 1);
      }
      const semiBlindStandingsRows = semiBlindCompetitors.map((p) => ({
        name: p.id === myParticipant.id ? "You" : (nameByParticipantId.get(p.id) ?? "Someone"),
        matches: matchesByParticipant.get(p.id) ?? 0,
      }));
      semiBlindReveal = {
        wineId: latestWineId,
        props: {
          glass: glassIndex + 1,
          revealedCount,
          total: totalWines,
          identity: {
            producer: name(answer.producer_id),
            vintage: vintageLabel(answer),
            meta: [
              name(answer.appellation_id),
              name(answer.region_id),
              [
                name(answer.primary_grape_id),
                answer.secondary_grape_id ? name(answer.secondary_grape_id) : null,
              ]
                .filter(Boolean)
                .join(" / "),
            ]
              .filter(Boolean)
              .join(" · "),
          },
          result: {
            hit: myPick?.correct ?? false,
            pickLabel: myPick?.pickLabel ?? null,
            mine: eligiblePicks.filter((p) => p.participantId === myParticipant.id && p.correct)
              .length,
          },
          split: splitRows,
          poolCards: semiBlindCandidates.cards.filter(
            (c) => !(c.key in semiBlindCandidates.revealedGlassByKey),
          ),
          standings: rankRows(semiBlindStandingsRows, (s) => s.matches).map(
            ({ row, rank, tied }) => ({ rank, tied, name: row.name, matches: row.matches }),
          ),
        },
      };
    }
  }

  // Standings: rank chip on the ladder / locked-in header, the rank delta on
  // the reveal, and the standalone leaderboard. Reuses getTastingLeaderboard
  // so partial per-attribute reveals count exactly as on the main page — not
  // just fully revealed wines. Fetched once any reveal has started.
  const revealStarted = (wines ?? []).some(
    (w) => w.is_revealed || (w.reveal_step ?? 0) > 0,
  );
  const joinedUserId = new Map(joinedParticipants.map((p) => [p.id, p.user_id]));
  const standings: RevealStanding[] =
    !isSemiBlind && revealStarted
      ? (await getTastingLeaderboard(tastingId))
          .filter(
            (r) =>
              joinedUserId.has(r.participantId) &&
              !isHostProvidesHostRow({ user_id: joinedUserId.get(r.participantId)! }),
          )
          .map((r) => ({
            participantId: r.participantId,
            name: nameByParticipantId.get(r.participantId) ?? r.name,
            isMe: r.participantId === myParticipant.id,
            total: r.total,
            lastRoundPoints: r.lastRoundPoints,
          }))
      : [];
  // One dense rank feeds every surface here (reveal-6): the chip on the ladder
  // and the locked-in header, and the standalone /play leaderboard — so the
  // numbers never disagree, and the top row keys on rank === 1, never on the
  // list index. The leaderboard prints the tie as "=2" (rankLabel); the chip
  // shows the bare rank, because `RankChip` (ladder-types.ts, T6's file)
  // carries no `tied` flag yet — reported to the orchestrator.
  const ranked = rankRows(standings, (s) => s.total);
  const mine = ranked.find((r) => r.row.isMe) ?? null;
  const rankChip: RankChip | null = mine
    ? { rank: mine.rank, points: mine.row.total }
    : null;
  // The laptop rail's "Standings after glass {N-1}" (S8b; spec §8.3 item 7):
  // the current top three, hidden until any glass has been revealed. Same
  // cumulative standings as the leaderboard above — not a per-glass replay.
  const standingsAfterPrevious =
    revealStarted
      ? ranked
          .slice(0, 3)
          .map(({ row, rank, tied }) => ({ rank, tied, name: row.name, total: row.total }))
      : null;
  const leaderboard = !embedded
    ? ranked.map(({ row, rank, tied }) => ({
        participantId: row.participantId,
        name: row.name,
        isMe: row.isMe,
        total: row.total,
        delta: row.lastRoundPoints ?? 0,
        rank,
        rankText: rankLabel({ rank, tied }),
      }))
    : [];
  // The 6g "Standings after glass N" row scrolls to the standings when this
  // surface renders them — the tasting page's rail (embedded) or the
  // standalone leaderboard below (blind /play) — else it opens /results.
  const standingsHref =
    embedded || !isSemiBlind ? "#standings" : `/tastings/${tastingId}/results`;

  // Which glasses can carry a ladder — drives the two server-side ladder
  // inputs below (grape shortlist, "you guess this often"). Locked glasses
  // are included: "Change it" reopens the ladder client-side, and its props
  // must already be right when it does.
  const ladderWines = (wines ?? []).filter(
    (w) =>
      !isSemiBlind &&
      !finished &&
      !hostProvidesHost &&
      !w.is_revealed &&
      !ownedByReveal(w) &&
      !resolvedForMe(w) &&
      w.contributor_participant_id !== myParticipant.id &&
      (!sequential || w.id === currentWineId),
  );

  // "you guess this often" (S9; spec §8.3 item 8): every id I have picked
  // before, per field, from my own guesses across every tasting (my rows are
  // always readable under RLS; nobody else's are touched). Threshold and
  // suffix live in pick-counts.ts/ladder-copy.ts, shared by every field —
  // this replaces the ladder's old grape-only, threshold-2 array.
  let pickCounts: PickCounts = {};
  const shortlistByWineId = new Map<string, GrapeShortlist>();
  if (ladderWines.length > 0) {
    const { data: myParticipations } = await supabase
      .from("tasting_participants")
      .select("id")
      .eq("user_id", user.id);
    const myParticipantIds = (myParticipations ?? []).map((p) => p.id);
    const [{ data: myAllGuesses }, ...shortlists] = await Promise.all([
      supabase
        .from("guesses")
        .select(
          "country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id",
        )
        .in("participant_id", myParticipantIds.length > 0 ? myParticipantIds : [""]),
      ...ladderWines.map(async (w) => {
        const regionId = myGuessByWineId.get(w.id)?.region_id ?? null;
        return [w.id, regionId ? await shortlistGrapesForRegion(regionId) : null] as const;
      }),
    ]);
    pickCounts = buildPickCounts(myAllGuesses ?? []);
    for (const [wineId, shortlist] of shortlists) {
      if (shortlist) shortlistByWineId.set(wineId, shortlist);
    }
  }

  // Correct value + the taster's guess + points, per scored attribute. null
  // points mean the category isn't in play for this wine, so it's skipped.
  const scoredRows = (answer: AnswerLike, g: Guess) => {
    const rows: {
      label: string;
      correct: string;
      guessed: string | null;
      points: number;
    }[] = [];
    const add = (
      label: string,
      correctId: string | null,
      guessedId: string | null,
      points: number | null,
    ) => {
      if (points === null) return;
      rows.push({
        label,
        correct: name(correctId),
        guessed: guessedId != null ? name(guessedId) : null,
        points,
      });
    };
    add("Country", answer.country_id, g.country_id, g.country_points);
    add("Region", answer.region_id, g.region_id, g.region_points);
    add(
      "Appellation",
      answer.appellation_id,
      g.appellation_id,
      g.appellation_points,
    );
    add(
      "Primary grape",
      answer.primary_grape_id,
      g.primary_grape_id,
      g.primary_grape_points,
    );
    add(
      "Secondary grape",
      answer.secondary_grape_id,
      g.secondary_grape_id,
      g.secondary_grape_points,
    );
    add("Producer", answer.producer_id, g.producer_id, g.producer_points);
    add(
      "Designation",
      answer.type_designation_id,
      g.type_designation_id,
      g.type_designation_points,
    );
    if (g.vintage_points !== null) {
      rows.push({
        label: "Vintage",
        correct: vintageLabel(answer),
        guessed: g.vintage_kind != null ? vintageLabel(g) : null,
        points: g.vintage_points,
      });
    }
    return rows;
  };

  // The 6g "What you said" chips from my own row — "no producer" muted when
  // a category was skipped; the two optional rows only when answered.
  const answerChips = (g: GuessRow) => {
    const chip = (label: string, value: string | null) =>
      value ? { text: value } : { text: `no ${label}`, muted: true };
    const chips = [
      chip("country", g.country_id ? name(g.country_id) : null),
      chip("region", g.region_id ? name(g.region_id) : null),
      chip("appellation", g.appellation_id ? name(g.appellation_id) : null),
      chip("grape", g.primary_grape_id ? name(g.primary_grape_id) : null),
    ];
    if (g.secondary_grape_id) chips.push({ text: name(g.secondary_grape_id) });
    chips.push(chip("producer", g.producer_id ? name(g.producer_id) : null));
    if (g.type_designation_id) chips.push({ text: name(g.type_designation_id) });
    chips.push(chip("vintage", g.vintage_kind ? vintageLabel(g) : null));
    return chips;
  };

  // The people chips for a glass's 6g state: me first, then the rest.
  const peopleFor = (
    eligible: { id: string }[],
    isLocked: (participantId: string) => boolean,
  ): LockedInPerson[] =>
    eligible
      .map((p) => ({
        id: p.id,
        name: nameByParticipantId.get(p.id) ?? "Someone",
        isMe: p.id === myParticipant.id,
        state: isLocked(p.id) ? ("locked" as const) : ("deciding" as const),
      }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe));

  return (
    <div className="flex flex-col gap-6">
      {tasting.timing_mode === "LIVE" ? (
        <RevealSync
          tastingId={tastingId}
          // Sum of every wine's reveal step: changes on each advance, so it
          // marks the moment refreshed content actually committed.
          watermark={(wines ?? []).reduce(
            (n, w) => n + (w.reveal_step ?? 0) + (w.is_revealed ? 1000 : 0),
            0,
          )}
        />
      ) : (
        <AutoRefresh />
      )}

      {/* Q1: reveals and Skip wait while the host has paused; guessing and
          locking still work, so nothing else on this page is gated by it. */}
      {tasting.paused_at ? <PausedBand hostName={hostName} /> : null}

      {/* Always-visible progress so players know where they are in the flight.
          Suppressed when embedded — the tasting page shows it in the left rail. */}
      {!embedded && totalWines > 0 ? (
        <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-heading text-lg font-semibold">
              {finished
                ? "Tasting finished"
                : sequential && currentWinePosition
                  ? `Wine ${currentWinePosition} of ${totalWines}`
                  : `${revealedCount} of ${totalWines} revealed`}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {progressPct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Live leaderboard — updates on every reveal, with the points each
          taster gained on the last wine so the standings feel alive.
          Suppressed when embedded — the tasting page shows standings in the
          right rail. The id is the "Standings" link target from Locked in. */}
      {!embedded && !isSemiBlind && leaderboard.length > 0 ? (
        <div id="standings" className="scroll-mt-24 rounded-xl border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
            <span className="font-heading text-sm font-semibold">Leaderboard</span>
            <span className="text-xs text-muted-foreground">
              {revealedCount > 0
                ? `after ${revealedCount} of ${totalWines}`
                : "live"}
            </span>
          </div>
          <ol className="flex flex-col">
            {leaderboard.map((row, i) => (
              <li
                key={row.participantId}
                className={cn(
                  "flex items-center gap-3 px-4 py-2",
                  i > 0 && "border-t border-border/60",
                  row.isMe && "bg-primary/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    row.rank === 1
                      ? "bg-gold/20 text-gold-deep"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {row.rankText}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.name}
                  {row.isMe ? (
                    <span className="text-muted-foreground"> (you)</span>
                  ) : null}
                </span>
                {row.delta > 0 ? (
                  <span className="rounded-full bg-[#3f5b42]/12 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[#3f5b42]">
                    +{row.delta}
                  </span>
                ) : null}
                <span className="w-12 text-right font-heading text-sm font-semibold tabular-nums">
                  {row.total}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {(wines ?? []).map((wine, index) => {
        // Semi-blind: every glass except the one just revealed is the
        // matching board's job (rendered once, below, over the whole
        // flight) — this per-wine card never renders the blind flow's
        // parchment answer card (BT-S3; the old candidate intro and the
        // per-glass "resolved" card it grew into are both superseded by
        // MatchBoard, revealed rows included). The glass a reveal just
        // finished gets SB4's own full-bleed treatment instead (BT-S4).
        if (isSemiBlind) {
          if (semiBlindReveal && wine.id === semiBlindReveal.wineId) {
            return (
              <Card key={wine.id} id={`wine-${wine.id}`} className="scroll-mt-24">
                <div className="-my-4">
                  <SemiBlindReveal {...semiBlindReveal.props} />
                </div>
              </Card>
            );
          }
          return null;
        }

        const isMine = wine.contributor_participant_id === myParticipant.id;
        const answer = answerByWineId.get(wine.id);
        const guess = myGuessByWineId.get(wine.id);
        const resolved = resolvedForMe(wine);
        const locked = Boolean(guess?.locked_at);
        // A draft (autosaved, unlocked) row is "in progress", not "guessed".
        const hasDraft = Boolean(guess);
        const glassNumber = index + 1;

        const statusBadge = wine.is_revealed
          ? { label: "Revealed", variant: "default" as const }
          : resolved
            ? { label: "Your result", variant: "default" as const }
            : isMine
              ? { label: "Your wine", variant: "outline" as const }
              : hostProvidesHost
                ? { label: "Hidden", variant: "outline" as const }
                : locked
                  ? { label: "Guessed", variant: "secondary" as const }
                  : hasDraft
                    ? { label: "In progress", variant: "outline" as const }
                    : { label: "Not guessed", variant: "outline" as const };

        const everyone = wine.is_revealed
          ? (revealedGuessesByWineId.get(wine.id) ?? [])
              .slice()
              .sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))
          : [];

        const isActive = wine.id === activeWineId;
        const eligible = eligibleGuessers(wine);
        const lockedCount = eligible.filter((p) => lockedFor(wine.id, p.id)).length;

        // Which body this card gets. The three "live" states (6h reveal, 6g
        // locked in, 6e ladder) are full-bleed sections in their own palette;
        // everything else is ordinary card content.
        // Once a category is out, the shared reveal owns the glass whether or
        // not the tasting is guided: the 6h reveal view takes over, never a
        // ladder and never an answer card.
        const revealing = ownedByReveal(wine);
        const canGuessNow =
          !revealing &&
          !(resolved && answer) &&
          !isMine &&
          !hostProvidesHost &&
          !finished &&
          !isSemiBlind &&
          !(sequential && wine.id !== currentWineId);
        const fullBleed = revealing || (canGuessNow && (locked || isActive || sequential));
        // The ladder states describe the glass themselves; the card header
        // only stays for bring-your-own titles ("Gustav's wine") and for the
        // host's reveal controls.
        const hostControls = isHost && !wine.is_revealed && !finished;
        const showHeader = !fullBleed || hostControls || tasting.wine_source !== "HOST_PROVIDES";

        const ladderRow = guess ? toGuessRow(guess) : null;
        // BT-N2: "Note this glass" is offered only to an eligible guesser
        // (never the host-provides host or the bottle's own contributor —
        // both already computed above as isMine/hostProvidesHost) on a
        // glass that is not yet revealed, through the pure
        // `canNoteHiddenGlass`. When the viewer already has a hidden note on
        // this glass, `existing` carries its id and "{d} of {t} assessed"
        // (summarizeNoteRow with a null style — the wine's colour/style is
        // unknown before the reveal, same rule as the note sheet itself) so
        // the entry point reopens it instead of starting a blank one.
        const noteThisGlassData: NoteThisGlassData | null = canNoteHiddenGlass({
          status: tasting.status,
          isRevealed: wine.is_revealed,
          eligible: !hostProvidesHost && !isMine,
        })
          ? (() => {
              const note = hiddenNoteByWineId.get(wine.id);
              return {
                tastingWineId: wine.id,
                tastingName: tasting.name,
                glassLabel: glassLabel(wine, index),
                existing: note
                  ? {
                      noteId: note.id,
                      assessed: assessedOf(
                        summarizeNoteRow(note, hiddenNoteAromasByNoteId.get(note.id) ?? [], null),
                        "en",
                        "long",
                      ),
                    }
                  : null,
              };
            })()
          : null;
        const stage = canGuessNow ? (
          <GlassStage
            initialLocked={locked}
            ladder={{
              tastingId,
              wineId: wine.id,
              tastingName: tasting.name,
              glassNumber,
              glassCount: totalWines,
              rankChip,
              segments: flightSegments(wines ?? [], sequential ? currentWineId : wine.id),
              lockedCount,
              eligibleCount: eligible.length,
              countries: countries ?? [],
              regions: regions ?? [],
              grapes: grapes ?? [],
              typeDesignations: typeDesignations ?? [],
              initialGuess: ladderRow,
              initialLabels: {
                producer: guess?.producer_id ? nameById.get(guess.producer_id) : undefined,
                appellation: guess?.appellation_id
                  ? nameById.get(guess.appellation_id)
                  : undefined,
              },
              shortlist: shortlistByWineId.get(wine.id) ?? null,
              // ASYNC + IMMEDIATE gets its own lock label, footer and confirm
              // (play-4); every other mode keeps today's copy.
              timingMode: tasting.timing_mode,
              asyncRevealPolicy: tasting.async_reveal_policy,
              pickCounts,
              referenceCounts,
              hostName,
              competitors,
              roster: peopleFor(eligible, (pid) => lockedFor(wine.id, pid)).map((p) => ({
                name: p.name,
                locked: p.state === "locked",
                isMe: p.isMe,
              })),
              standingsAfterPrevious,
              noteThisGlass: noteThisGlassData,
            }}
            lockedIn={{
              tastingId,
              wineIds: [wine.id],
              eyebrow: tasting.name,
              title: `${glassLabel(wine, index)} · locked in`,
              rankChip,
              people: peopleFor(eligible, (pid) => lockedFor(wine.id, pid)),
              lockedCount,
              eligibleCount: eligible.length,
              chips: ladderRow ? answerChips(ladderRow) : [],
              stakeLine: `${pointsAtStake(ladderRow)} pts at stake`,
              standingsLabel:
                glassNumber > 1 ? `Standings after glass ${glassNumber - 1}` : "See the standings",
              standingsHref,
              // No explicit `canChange` producer in this wave: the
              // blind-tasting ledger drops the semi-blind freeze (amendment
              // 3), which was its only one. `LockedIn` still hides "Change
              // it" once `revealStep` is above 0 (PLAY-37) — a glass mid
              // step-reveal shows the reveal view rather than this card at
              // all, so that gate mostly guards the moment reveal_step just
              // flipped, before the next poll swaps the view.
              pendingNotice: pendingNoticeFor(wine.id),
              needsScoring: scoringDueFor(wine.id),
              hostName,
              revealStep: wine.reveal_step ?? 0,
              timingMode: tasting.timing_mode,
              asyncRevealPolicy: tasting.async_reveal_policy,
              noteThisGlass: noteThisGlassData,
            }}
          />
        ) : null;

        // Guided guessing: the ladder only renders for the current glass;
        // the others are collapsed rows until the reveal advances to them.
        // The host keeps the card (reveal controls live in its header).
        if (
          sequential &&
          wine.id !== currentWineId &&
          !resolved &&
          !isMine &&
          !hostProvidesHost &&
          !finished &&
          !isHost
        ) {
          return (
            <div
              key={wine.id}
              id={`wine-${wine.id}`}
              className="flex min-h-[44px] scroll-mt-24 items-center rounded-[12px] border border-dashed border-border-light bg-card px-[16px] text-[13.5px] text-muted-foreground"
            >
              {glassLabel(wine, index)} · opens after the reveal
            </div>
          );
        }

        return (
          <Card
            key={wine.id}
            id={`wine-${wine.id}`}
            className={cn(
              "scroll-mt-24",
              isActive && "border-primary/50 shadow-md ring-1 ring-primary/30",
              !isActive && !wine.is_revealed && !resolved && !fullBleed && "opacity-80",
            )}
          >
            {showHeader ? (
              <CardHeader>
                {isActive ? (
                  <span className="mb-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                    Now tasting
                  </span>
                ) : null}
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{wineTitle(wine)}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                    {/* Guided live tastings get progressive controls (reveal one
                        attribute at a time or skip to full); everything else the
                        plain full-reveal button. */}
                    {hostControls ? (
                      guidedLive ? (
                        <RevealControls
                          wineId={wine.id}
                          revealStep={wine.reveal_step ?? 0}
                          started={(wine.reveal_step ?? 0) > 0}
                        />
                      ) : (
                        <RevealButton tastingId={tastingId} wineId={wine.id} />
                      )
                    ) : null}
                  </div>
                </CardTitle>
              </CardHeader>
            ) : null}

            {fullBleed ? (
              <div className={showHeader ? "-mb-4" : "-my-4"}>
                {revealing ? (
                  <RevealView
                    wineId={wine.id}
                    glassNumber={glassNumber}
                    myParticipantId={myParticipant.id}
                    myGuess={ladderRow}
                    names={nameById}
                    standings={standings}
                    spectator={isMine || hostProvidesHost}
                    leaderboardReveal={tasting.leaderboard_reveal}
                  />
                ) : (
                  stage
                )}
              </div>
            ) : (
              <CardContent>
                {resolved && answer ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <h3 className="mb-1.5 text-sm font-medium">Answer</h3>
                      {/* Label photo as a left thumbnail (blank bottle when there
                          is none), matching the cellar and catalog rows. */}
                      <div className="flex items-start gap-3">
                        {answer.image_url ??
                        (answer.catalog_wine_id
                          ? catalogImageById.get(answer.catalog_wine_id)
                          : null) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={
                              answer.image_url ??
                              (catalogImageById.get(
                                answer.catalog_wine_id as string,
                              ) as string)
                            }
                            alt=""
                            className="size-16 shrink-0 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <span className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
                            <Wine className="size-6" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <AnswerFacts facts={answerFacts(answer)} />
                        </div>
                      </div>
                    </div>

                    {/* Once globally revealed, show everyone's result; otherwise
                        (immediate async) just mine. */}
                    {wine.is_revealed ? (
                      everyone.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No one guessed this wine.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {everyone.map((g) => (
                            // Native disclosure per player: the name+score row
                            // is the summary; tap to expand the attribute
                            // sheet. Collapsed by default so a revealed wine
                            // reads as a compact list of final scores.
                            <details
                              key={g.id}
                              className="group rounded-lg border border-border/70"
                            >
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-2.5 [&::-webkit-details-marker]:hidden">
                                <span className="text-sm font-medium">
                                  {nameByParticipantId.get(g.participant_id)}
                                  {g.participant_id === myParticipant.id
                                    ? " (you)"
                                    : ""}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <span className="font-heading text-sm font-semibold tabular-nums">
                                    {g.total_points ?? 0} pts
                                  </span>
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                                </span>
                              </summary>
                              <div className="px-2.5 pb-2.5">
                                <AttributeSheet rows={scoredRows(answer, g)} />
                              </div>
                            </details>
                          ))}
                        </div>
                      )
                    ) : guess ? (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-medium">
                          Your result — {guess.total_points ?? 0} pts
                        </p>
                        <AttributeSheet rows={scoredRows(answer, guess)} />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        You didn&apos;t submit a guess for this wine.
                      </p>
                    )}
                  </div>
                ) : isMine ? (
                  <p className="text-sm text-muted-foreground">
                    This is your wine — nothing to guess.
                  </p>
                ) : hostProvidesHost ? (
                  <p className="text-sm text-muted-foreground">
                    You set the wines — you&apos;re hosting, not guessing.
                  </p>
                ) : finished ? (
                  <p className="text-sm text-muted-foreground">
                    This tasting is finished — guessing is closed.
                  </p>
                ) : sequential && wine.id !== currentWineId ? (
                  // Only the bring-your-own host reaches this (participants
                  // get the collapsed row above): same line, inside the card
                  // that carries their reveal controls.
                  <p className="text-[13.5px] text-muted-foreground">
                    {glassLabel(wine, index)} · opens after the reveal
                  </p>
                ) : (
                  // Free mode, not the spotlighted glass: the ladder waits
                  // behind a button so one glass at a time is expanded.
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">
                      {hasDraft
                        ? "You've started this wine. You can keep editing until you lock it in."
                        : "You haven't guessed this wine yet."}
                    </p>
                    <CollapsiblePanel
                      label={hasDraft ? "Edit your guess" : "Guess this wine"}
                      variant={hasDraft ? "outline" : "default"}
                    >
                      <div className="overflow-hidden rounded-lg border border-border">
                        {stage}
                      </div>
                    </CollapsiblePanel>
                  </div>
                )}

                {/* Readiness: locked = ✓, an autosaved draft = ○ in progress,
                    nothing yet = ○. The ladder/locked-in states carry their
                    own count, so this only follows ordinary card content. */}
                {!wine.is_revealed && !finished
                  ? (() => {
                      if (eligible.length === 0) return null;
                      const pendingNames = eligible
                        .filter((p) => !lockedFor(wine.id, p.id))
                        .map((p) => nameByParticipantId.get(p.id) ?? "Someone");
                      const allReady = pendingNames.length === 0;
                      // Name who we're still waiting on (up to two) rather than a
                      // bare count — it feels like a live room, not a form.
                      const waitingLine = allReady
                        ? "Everyone's ready to reveal"
                        : pendingNames.length <= 2
                          ? `Waiting for ${pendingNames.join(" and ")}…`
                          : `${lockedCount} of ${eligible.length} locked in`;
                      return (
                        <div className="mt-4 border-t pt-3">
                          <p
                            className={cn(
                              "mb-1.5 text-xs font-medium",
                              allReady ? "text-[#3f5b42]" : "text-muted-foreground",
                            )}
                          >
                            {allReady ? "✓ " : ""}
                            {waitingLine}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {eligible.map((p) => {
                              const ready = lockedFor(wine.id, p.id);
                              const draft = !ready && hasRowFor(wine.id, p.id);
                              return (
                                <span
                                  key={p.id}
                                  className={ready ? "text-[#3f5b42]" : ""}
                                >
                                  {ready ? "✓" : "○"} {nameByParticipantId.get(p.id)}
                                  {draft ? " · in progress" : ""}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Semi-blind: one persistent board over the whole flight (BT-S3;
          SB2 phone, SB3 laptop) — every glass renders here (open, locked,
          not-poured, revealed, the viewer's own bottle), never a batch that
          shrinks as glasses resolve. Data comes only from the two RPCs
          above, never wine_answers or the picked-wine column (rule 1). */}
      {showMatchBoard && semiBlindBoard ? (
        <Card id="match-glasses" className="scroll-mt-24">
          <div className="-my-4">
            <MatchBoard
              tastingId={tastingId}
              tastingName={tasting.name}
              hostName={hostName}
              cards={semiBlindCandidates?.cards ?? []}
              board={semiBlindBoard}
              pouredThroughIndex={semiBlindPouredThroughIndex}
              currentGlassWineId={semiBlindCurrentWineId}
              timingMode={tasting.timing_mode}
              asyncRevealPolicy={tasting.async_reveal_policy}
              pending={semiBlindCandidates?.pending ?? 0}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
