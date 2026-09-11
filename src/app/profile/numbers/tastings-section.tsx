import { AccuracyRows } from "@/components/overview/accuracy-rows";
import { ColumnChart } from "@/components/overview/column-chart";
import { DistributionBar } from "@/components/overview/distribution-bar";
import { LinkPill } from "@/components/overview/link-pill";
import { percent } from "@/lib/stats-math";
import type { NumbersTastings } from "@/lib/your-numbers-types";
import { SectionHeader } from "./section-header";
import {
  StatCard,
  StatCardGrid,
  StatFooter,
  StatFooterRow,
  toneForShare,
} from "./stat-card";

const EMPTY = "No scored guesses yet";

// Blind tastings: hit rate per field, points over the last eight tastings and
// how you place. Everything comes from scored guesses in the chosen range, so
// all three cards share one empty state — except that the placement card's
// inputs are narrower than "any scored guess": placements only count finished
// (fully revealed) tastings and "Where you taste best" needs a region with at
// least two wines, so it gets a second, more specific empty state when guesses
// exist but neither of those does yet.
export function TastingsSection({ data }: { data: NumbersTastings }) {
  const {
    played,
    glasses,
    averagePoints,
    accuracy,
    recent,
    best,
    trend,
    placements,
    bestRegions,
  } = data;
  const none = glasses === 0;
  const summary = `${played} played · ${glasses} glasses guessed · ${averagePoints.toFixed(1)} average points`;

  const accuracyRows = accuracy.map((r) => {
    const pct = percent(r.correct, r.applicable);
    return {
      label: r.label,
      pct,
      value: r.applicable === 0 ? "—" : `${pct}%`,
    };
  });

  // The chart shows the newest `recent.length` of `played` tastings, so the
  // first column is tasting number played − shown + 1 (12 played, 8 shown →
  // "Tasting 5").
  const firstShown = Math.max(1, played - recent.length + 1);
  const trendText = trend
    ? `${trend.delta < 0 ? "−" : "+"}${Math.abs(trend.delta).toFixed(1)} pts over ${trend.over} tastings`
    : "needs a few more tastings";

  const maxRegion = Math.max(0, ...bestRegions.map((r) => r.avgPoints));
  const regionRows = bestRegions.map((r) => {
    const pct = maxRegion > 0 ? (r.avgPoints / maxRegion) * 100 : 0;
    return {
      label: r.label,
      pct,
      value: r.avgPoints.toFixed(1),
      tone: toneForShare(pct),
    };
  });
  const placed =
    placements.first + placements.second + placements.third + placements.lower;

  return (
    <section className="flex flex-col gap-[14px] p-[24px_30px_10px] max-md:p-[14px_16px]">
      <SectionHeader
        title="Blind tastings"
        summary={summary}
        pill={
          <LinkPill href="/taste?tab=history" size="md" tone="card">
            History
          </LinkPill>
        }
      />
      <StatCardGrid>
        <StatCard
          title="What you get right"
          empty={none ? EMPTY : null}
          className="gap-[11px]"
        >
          <AccuracyRows rows={accuracyRows} />
        </StatCard>

        <StatCard title="Points per tasting" empty={none ? EMPTY : null}>
          <ColumnChart
            columns={recent.map((r) => ({ value: r.points, label: r.name }))}
            height={100}
            axis={{ kind: "ends", start: `Tasting ${firstShown}`, end: "latest" }}
          />
          <StatFooter>
            <StatFooterRow
              label="Best score"
              value={best ? `${best.points} pts · ${best.name}` : "—"}
            />
            <StatFooterRow label="Trend" value={trendText} />
          </StatFooter>
        </StatCard>

        <StatCard
          title="How you place"
          empty={
            none
              ? EMPTY
              : placed === 0 && regionRows.length === 0
                ? "No finished tastings yet"
                : null
          }
          className="gap-[13px]"
        >
          {/* The "×" marks these as occurrence counts ("1st ×2"), not ranks
              with points, matching the handoff legend. */}
          {placed > 0 ? (
            <DistributionBar
              countPrefix="×"
              items={[
                { label: "1st", count: placements.first },
                { label: "2nd", count: placements.second },
                { label: "3rd", count: placements.third },
                { label: "Lower", count: placements.lower },
              ]}
            />
          ) : null}
          {regionRows.length > 0 ? (
            <div className="flex flex-col gap-[7px]">
              <span className="text-[11.5px] font-semibold">
                Where you taste best
              </span>
              <AccuracyRows
                rows={regionRows}
                trackHeight={6}
                valueWidth="auto"
                className="gap-[7px]"
              />
            </div>
          ) : null}
        </StatCard>
      </StatCardGrid>
    </section>
  );
}
