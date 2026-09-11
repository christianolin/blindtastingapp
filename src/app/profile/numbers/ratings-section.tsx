import { AccuracyRows } from "@/components/overview/accuracy-rows";
import { ColumnChart, type ColumnTone } from "@/components/overview/column-chart";
import { DistributionBar } from "@/components/overview/distribution-bar";
import { LinkPill } from "@/components/overview/link-pill";
import type { NumbersRange, NumbersRatings } from "@/lib/your-numbers-types";
import { SectionHeader } from "./section-header";
import { StatCard, StatCardGrid, StatFooter, toneForShare } from "./stat-card";

const EMPTY = "No notes yet";

// Score buckets <80 · 80–84 · 85–89 · 90–94 · 95+ in the handoff's tones.
const SCORE_TONES: ColumnTone[] = ["oldest", "gold", "primary", "primary", "rose"];

// Ratings: how your scores fall, what you rate, and how often you write.
// Every card is fed by your WSET notes, but they are not filtered alike:
// "Score distribution" and "What you rate" follow the chosen range (so their
// empty copy says so when a range is active), while "Notes per month" and
// its streak are deliberately all-time (a fixed eight-month window) and are
// gated on their own data, not the range-filtered note count.
export function RatingsSection({
  data,
  range,
}: {
  data: NumbersRatings;
  range: NumbersRange;
}) {
  const {
    winesRated,
    notes,
    averageScore,
    scoreBuckets,
    byType,
    byCountry,
    topGrapes,
    perMonth,
    thisMonth,
    longestStreakWeeks,
  } = data;
  const none = notes === 0;
  const rangeEmpty = range === "all" ? EMPTY : "No notes in this range";
  const noMonths = perMonth.every((m) => m.count === 0);
  const summary = `${winesRated} wines rated · ${notes} notes · average ${averageScore ?? "—"}`;

  const maxGrape = Math.max(0, ...topGrapes.map((g) => g.count));
  const grapeRows = topGrapes.map((g) => {
    const pct = maxGrape > 0 ? (g.count / maxGrape) * 100 : 0;
    return {
      label: g.label,
      pct,
      value: String(g.count),
      tone: toneForShare(pct),
    };
  });

  const streak = `Longest streak: ${longestStreakWeeks} ${
    longestStreakWeeks === 1 ? "week" : "weeks"
  } running`;

  return (
    <section className="flex flex-col gap-[14px] p-[20px_30px_10px] max-md:p-[0_16px_14px]">
      <SectionHeader
        rule
        title="Ratings"
        summary={summary}
        pill={
          <LinkPill href="/cellar?tab=notes" size="md" tone="card">
            All notes
          </LinkPill>
        }
      />
      <StatCardGrid>
        <StatCard title="Score distribution" empty={none ? rangeEmpty : null}>
          <ColumnChart
            columns={scoreBuckets.map((b, i) => ({
              value: b.count,
              label: b.label,
              tone: SCORE_TONES[i],
            }))}
            height={96}
            gap={8}
            showCounts
            axis={{ kind: "per-column" }}
          />
        </StatCard>

        <StatCard
          title="What you rate"
          empty={none ? rangeEmpty : null}
          className="gap-[13px]"
        >
          <DistributionBar caption="Wine type" captionStyle="bold" items={byType} />
          <DistributionBar caption="Country" captionStyle="bold" items={byCountry} />
          {grapeRows.length > 0 ? (
            <div className="border-t border-border-light pt-[11px]">
              <AccuracyRows
                rows={grapeRows}
                trackHeight={6}
                labelWidth={74}
                valueWidth="auto"
                className="gap-1.5"
              />
            </div>
          ) : null}
        </StatCard>

        <StatCard title="Notes per month" empty={noMonths ? EMPTY : null}>
          <ColumnChart
            columns={perMonth.map((m) => ({ value: m.count, label: m.label }))}
            height={96}
            axis={{
              kind: "ends",
              start: perMonth[0]?.label ?? "",
              end: perMonth[perMonth.length - 1]?.label ?? "",
            }}
          />
          <StatFooter className="gap-1">
            <span className="text-[12.5px]">
              {thisMonth.count === 0 ? (
                "No notes this month"
              ) : (
                <>
                  <strong className="font-semibold">
                    {thisMonth.count} {thisMonth.count === 1 ? "note" : "notes"}
                  </strong>{" "}
                  this month{thisMonth.isBest ? ", your best yet" : ""}
                </>
              )}
            </span>
            <span className="text-[11.5px] text-muted-foreground">{streak}</span>
          </StatFooter>
        </StatCard>
      </StatCardGrid>
    </section>
  );
}
