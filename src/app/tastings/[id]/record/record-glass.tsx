import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CountryFlag } from "@/components/country-flag";
import { HatchThumb } from "@/components/overview/hatch-thumb";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import {
  eligibleForGlass,
  joinedAfterReveal,
  type EligibilityParticipant,
} from "@/lib/glass-eligibility";
import { GUESS_READ_COLUMNS } from "@/lib/guess-columns";
import { lookupAppellationAndProducerNames } from "@/lib/reference-lookup";
import { shortWineName } from "@/lib/result-copy";
import {
  CATEGORY_ORDER,
  CATEGORY_POINTS,
  categoryMark,
  glassMaxPoints,
  isInPlay,
  type BlindGuessRow,
  type ResultCategory,
} from "@/lib/result-math";
import { getSemiBlindRevealedPicks } from "@/lib/semi-blind-data";
import { GlassActions } from "./glass-actions";

// One revealed glass, its own page (S13c, spec §11.3 items 18-19). Rendered
// at the route segment `/tastings/[id]/results/[glass]` with `layout="page"`
// (phones, and the route's own fallback), and by `record-view.tsx` with
// `layout="inline"` for a laptop row it expands in place. Self-fetching (own
// RLS reads) so either caller only ever hands it ids — this mirrors
// record-view.tsx's own data shape rather than importing from it, since nothing
// there is exported for reuse.
//
// Rule 1: it walks revealed glasses only. `glass` is untrusted (it comes
// straight off the URL, unlike every other place in the record that only
// ever sees a glass number it computed itself from list order) — a number
// outside [1, wines.length], or one whose wine is not revealed, 404s. It
// never shows another participant's hidden answer: the six/eight category
// lines are the viewer's own guess only, gated by the same eligibility rule
// as the rest of the record.

const CATEGORY_LABEL: Readonly<Record<ResultCategory, string>> = {
  country: "Country",
  region: "Region",
  appellation: "Appellation",
  primary_grape: "Grape",
  secondary_grape: "2nd grape",
  producer: "Producer",
  type_designation: "Designation",
  vintage: "Vintage",
};

type RefRow = {
  country_id: string | null;
  region_id: string | null;
  appellation_id: string | null;
  primary_grape_id: string | null;
  secondary_grape_id: string | null;
  producer_id: string | null;
  type_designation_id: string | null;
  vintage_kind: string | null;
  vintage_year: number | null;
  vintage_tawny_years: number | null;
};

function refId(category: ResultCategory, row: RefRow): string | null {
  switch (category) {
    case "country":
      return row.country_id;
    case "region":
      return row.region_id;
    case "appellation":
      return row.appellation_id;
    case "primary_grape":
      return row.primary_grape_id;
    case "secondary_grape":
      return row.secondary_grape_id;
    case "producer":
      return row.producer_id;
    case "type_designation":
      return row.type_designation_id;
    case "vintage":
      return null;
  }
}

function vintageLabel(row: Pick<RefRow, "vintage_kind" | "vintage_year" | "vintage_tawny_years">): string {
  if (row.vintage_kind === "YEAR") return row.vintage_year != null ? String(row.vintage_year) : "—";
  if (row.vintage_kind === "NV") return "NV";
  if (row.vintage_kind === "TAWNY") {
    return row.vintage_tawny_years != null ? `${row.vintage_tawny_years}-year tawny` : "Tawny";
  }
  return "—";
}

const isText = (value: string | null | undefined): value is string =>
  value != null && value.trim() !== "";

function finishedRecently(finishedAt: string | null): boolean {
  if (!finishedAt) return false;
  return Date.now() - Date.parse(finishedAt) < 24 * 60 * 60 * 1000;
}

export async function RecordGlass({
  tastingId,
  glass,
  layout,
}: {
  tastingId: string;
  glass: number;
  layout: "page" | "inline";
}): Promise<React.JSX.Element> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [{ data: tasting }, { data: participantRows }, { data: wineRows }] = await Promise.all([
    supabase
      .from("tastings")
      .select("id, name, host_id, wine_source, reveal_mode, status, finished_at")
      .eq("id", tastingId)
      .maybeSingle(),
    supabase
      .from("tasting_participants")
      .select("id, user_id, status, joined_at")
      .eq("tasting_id", tastingId),
    supabase
      .from("wines")
      .select("id, position, is_revealed, revealed_at, contributor_participant_id")
      .eq("tasting_id", tastingId)
      .order("position"),
  ]);
  // Same defensive "the data moved out from under the render" guard
  // record-view.tsx uses: this only ever renders once a tasting is CLOSED.
  if (!tasting || tasting.status !== "CLOSED") notFound();

  const wines = wineRows ?? [];
  const targetWine = Number.isInteger(glass) && glass >= 1 ? wines[glass - 1] : undefined;
  if (!targetWine || !targetWine.is_revealed) notFound();

  const participants = participantRows ?? [];
  const viewer = participants.find((p) => p.user_id === user.id) ?? null;
  const viewerId = viewer?.id ?? null;
  const mode: "BLIND" | "SEMI_BLIND" = tasting.reveal_mode === "SEMI_BLIND" ? "SEMI_BLIND" : "BLIND";

  const eligibilityParticipants: EligibilityParticipant[] = participants.map((p) => ({
    id: p.id,
    userId: p.user_id,
    status: p.status,
    joinedAt: p.joined_at,
  }));
  const viewerParticipant = viewerId ? eligibilityParticipants.find((p) => p.id === viewerId) : undefined;
  const targetGlass = {
    contributorParticipantId: targetWine.contributor_participant_id,
    isRevealed: targetWine.is_revealed,
    revealedAt: targetWine.revealed_at,
  };
  const eligible = viewerParticipant
    ? eligibleForGlass(viewerParticipant, targetGlass, { wineSource: tasting.wine_source, hostId: tasting.host_id })
    : false;
  const joinedAfter = viewerParticipant ? joinedAfterReveal(viewerParticipant, targetGlass) : false;
  const isCompetitor = eligible && !joinedAfter;

  const revealedWineIds = wines.filter((w) => w.is_revealed).map((w) => w.id);
  const { data: answerRows } = await supabase
    .from("wine_answers")
    .select(
      "wine_id, country_id, region_id, appellation_id, primary_grape_id, secondary_grape_id, producer_id, type_designation_id, vintage_kind, vintage_year, vintage_tawny_years, catalog_wine_id, unidentified_wine_id, image_url",
    )
    .in("wine_id", revealedWineIds.length > 0 ? revealedWineIds : [""]);
  const answerByWineId = new Map((answerRows ?? []).map((a) => [a.wine_id, a]));
  const answer = answerByWineId.get(targetWine.id);
  // Fail-closed (result-math.ts's own rule 1): a revealed glass this viewer's
  // RLS could not read an answer key for renders as not found rather than a
  // half-built page.
  if (!answer) notFound();

  let guessRow: (BlindGuessRow & RefRow) | null = null;
  if (mode === "BLIND" && viewerId) {
    const { data } = await supabase
      .from("guesses")
      .select(GUESS_READ_COLUMNS)
      .eq("wine_id", targetWine.id)
      .eq("participant_id", viewerId)
      .maybeSingle();
    guessRow = (data as unknown as (BlindGuessRow & RefRow) | null) ?? null;
  }

  // Countries/regions/grapes are small tables, preloaded in full (CLAUDE.md);
  // type designations are looked up by the two ids actually in play here;
  // appellations/producers go through the shared id-only lookup — across
  // every revealed wine, since the footer's prev/next names need theirs too.
  const [{ data: countries }, { data: regions }, { data: grapes }, { data: typeDesignations }, referenceNames] =
    await Promise.all([
      supabase.from("countries").select("id, name"),
      supabase.from("regions").select("id, name"),
      supabase.from("grapes").select("id, name"),
      supabase
        .from("type_designations")
        .select("id, name")
        .in(
          "id",
          [answer.type_designation_id, guessRow?.type_designation_id ?? null].filter(
            (id): id is string => id !== null,
          ),
        ),
      lookupAppellationAndProducerNames({
        appellationIds: [...(answerRows ?? []).map((a) => a.appellation_id), guessRow?.appellation_id ?? null],
        producerIds: [...(answerRows ?? []).map((a) => a.producer_id), guessRow?.producer_id ?? null],
      }),
    ]);
  const nameById = new Map<string, string>();
  for (const list of [countries, regions, grapes, typeDesignations]) {
    for (const row of list ?? []) nameById.set(row.id, row.name);
  }
  for (const [id, n] of referenceNames) nameById.set(id, n);
  const name = (id: string | null) => (id ? (nameById.get(id) ?? "—") : "—");

  // A wine's name and photo fallback live on whichever identity table its
  // answer points at (D3), for every revealed wine — prev/next need theirs too.
  const catalogIds = [
    ...new Set((answerRows ?? []).map((a) => a.catalog_wine_id).filter((id): id is string => Boolean(id))),
  ];
  const unidentifiedIds = [
    ...new Set(
      (answerRows ?? []).map((a) => a.unidentified_wine_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const [{ data: catalogRows }, { data: unidentifiedRows }] = await Promise.all([
    catalogIds.length > 0
      ? supabase.from("catalog_wines").select("id, wine_name, image_url").in("id", catalogIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null; image_url: string | null }[] }),
    unidentifiedIds.length > 0
      ? supabase.from("catalog_wines_unidentified").select("id, wine_name").in("id", unidentifiedIds)
      : Promise.resolve({ data: [] as { id: string; wine_name: string | null }[] }),
  ]);
  const wineNameByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.wine_name]));
  const imageByCatalogId = new Map((catalogRows ?? []).map((c) => [c.id, c.image_url]));
  const wineNameByUnidentifiedId = new Map((unidentifiedRows ?? []).map((c) => [c.id, c.wine_name]));

  function wineNameFor(a: NonNullable<typeof answer>): string | null {
    return a.catalog_wine_id
      ? (wineNameByCatalogId.get(a.catalog_wine_id) ?? null)
      : a.unidentified_wine_id
        ? (wineNameByUnidentifiedId.get(a.unidentified_wine_id) ?? null)
        : null;
  }
  function shortNameFor(a: NonNullable<typeof answer>): string {
    return shortWineName({
      wineName: wineNameFor(a),
      appellation: a.appellation_id ? name(a.appellation_id) : null,
      producer: name(a.producer_id),
    });
  }

  const producerName = name(answer.producer_id);
  const wineName = wineNameFor(answer);
  const vintage = vintageLabel(answer);
  const identity = `${producerName}${isText(wineName) ? `, ${wineName.trim()}` : ""} ${vintage}`.trim();
  const countryName = name(answer.country_id);
  const imageUrl =
    (answer.image_url as string | null) ??
    (answer.catalog_wine_id ? (imageByCatalogId.get(answer.catalog_wine_id) ?? null) : null);

  // ── prev / next: the closest REVEALED neighbours by list order ───────────
  let prevWine: (typeof wines)[number] | null = null;
  let prevIndex: number | null = null;
  for (let i = glass - 2; i >= 0; i--) {
    if (wines[i].is_revealed) {
      prevWine = wines[i];
      prevIndex = i + 1;
      break;
    }
  }
  let nextWine: (typeof wines)[number] | null = null;
  let nextIndex: number | null = null;
  for (let i = glass; i < wines.length; i++) {
    if (wines[i].is_revealed) {
      nextWine = wines[i];
      nextIndex = i + 1;
      break;
    }
  }
  const prevAnswer = prevWine ? (answerByWineId.get(prevWine.id) ?? null) : null;
  const nextAnswer = nextWine ? (answerByWineId.get(nextWine.id) ?? null) : null;

  // ── points, and (blind) the six/eight category lines ─────────────────────
  let points = 0;
  const max = glassMaxPoints(answer);
  let semiBlindLine: { correct: boolean; pickLabel: string | null } | null = null;
  if (mode === "SEMI_BLIND") {
    const picks = await getSemiBlindRevealedPicks(tastingId);
    const mine = viewerId
      ? (picks.find((p) => p.glassWineId === targetWine.id && p.participantId === viewerId) ?? null)
      : null;
    if (mine) {
      semiBlindLine = { correct: mine.correct, pickLabel: mine.pickLabel };
      points = mine.correct ? 1 : 0;
    }
  } else if (guessRow) {
    points = guessRow.total_points ?? 0;
  }

  const lines =
    mode === "BLIND"
      ? CATEGORY_ORDER.filter((category) => isInPlay(category, answer)).map((category) => {
          const truth = category === "vintage" ? vintageLabel(answer) : name(refId(category, answer));
          const guessedId = guessRow ? refId(category, guessRow) : null;
          const guessed =
            category === "vintage"
              ? guessRow && guessRow.vintage_kind
                ? vintageLabel(guessRow)
                : null
              : guessedId
                ? name(guessedId)
                : null;
          const mark = categoryMark(category, answer, guessRow);
          const delta = mark === "hit" ? CATEGORY_POINTS[category] : mark === "near" ? 1 : 0;
          return {
            category,
            label: CATEGORY_LABEL[category],
            truth,
            guessed,
            delta,
            hit: mark === "hit" || mark === "near",
          };
        })
      : [];

  const recent = finishedRecently(tasting.finished_at);
  const containerClass =
    layout === "page"
      ? "mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6 sm:p-8"
      : "flex flex-col gap-4 border-t border-border/60 bg-muted/20 p-4 sm:p-6";
  const arrowClass = (enabled: boolean) =>
    "inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors " +
    (enabled ? "hover:bg-muted hover:text-foreground" : "pointer-events-none opacity-30");

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/tastings/${tastingId}/results`}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          <ChevronLeft className="size-4" aria-hidden /> Back
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href={prevIndex ? `/tastings/${tastingId}/results/${prevIndex}` : "#"}
            aria-disabled={!prevIndex}
            className={arrowClass(prevIndex !== null)}
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <Link
            href={nextIndex ? `/tastings/${tastingId}/results/${nextIndex}` : "#"}
            aria-disabled={!nextIndex}
            className={arrowClass(nextIndex !== null)}
          >
            <ChevronRight className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {tasting.name} ·{" "}
          {recent ? "tonight" : <LocalDateTime iso={tasting.finished_at ?? ""} format="day-month" />}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Glass {glass} of {wines.length}
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <HatchThumb src={imageUrl} width={64} height={64} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-xl font-semibold">{identity}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CountryFlag name={countryName} /> {countryName}
              </p>
            </div>
          </div>

          {isCompetitor ? (
            <p className="font-heading text-2xl font-semibold text-primary">
              {points} of {max}
            </p>
          ) : null}

          {mode === "SEMI_BLIND" ? (
            <div className="rounded-lg border border-border/70 p-3 text-sm">
              {joinedAfter ? (
                <p className="text-muted-foreground">You joined after this glass</p>
              ) : !isCompetitor ? null : semiBlindLine ? (
                <p>
                  {semiBlindLine.correct
                    ? "✓ You matched it"
                    : `✗ You said ${semiBlindLine.pickLabel ?? "something else"}`}
                </p>
              ) : (
                <p className="text-muted-foreground">You skipped this glass</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {lines.map((line) => (
                <div key={line.category} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{line.label}</span>
                    <span className="block text-muted-foreground">{line.truth}</span>
                    {isCompetitor ? (
                      <span className="block text-muted-foreground">you: {line.guessed ?? "skipped it"}</span>
                    ) : null}
                  </span>
                  {isCompetitor ? (
                    <span
                      className={
                        "font-heading text-base font-semibold tabular-nums " +
                        (line.hit ? "text-gold-deep" : "text-muted-foreground")
                      }
                    >
                      {line.hit ? `+${line.delta}` : "0"}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Do something with it</p>
        <GlassActions
          catalogWineId={answer.catalog_wine_id}
          unidentifiedWineId={answer.unidentified_wine_id}
          tastingWineId={targetWine.id}
          title={identity}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm">
        <span>
          {prevIndex && prevAnswer ? (
            <Link
              href={`/tastings/${tastingId}/results/${prevIndex}`}
              className="inline-flex min-h-11 items-center text-primary hover:text-primary/80"
            >
              Glass {prevIndex} · {shortNameFor(prevAnswer)}
            </Link>
          ) : null}
        </span>
        <span>
          {nextIndex && nextAnswer ? (
            <Link
              href={`/tastings/${tastingId}/results/${nextIndex}`}
              className="inline-flex min-h-11 items-center text-primary hover:text-primary/80"
            >
              Glass {nextIndex} · {shortNameFor(nextAnswer)} ›
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}
