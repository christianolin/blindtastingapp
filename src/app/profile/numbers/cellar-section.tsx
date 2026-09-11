import {
  ColumnChart,
  StackedColumnChart,
  type ColumnTone,
} from "@/components/overview/column-chart";
import { DistributionBar } from "@/components/overview/distribution-bar";
import { LinkPill } from "@/components/overview/link-pill";
import { rangeLabel } from "@/lib/your-numbers-math";
import type { NumbersCellar, NumbersRange } from "@/lib/your-numbers-types";
import { SectionHeader } from "./section-header";
import { StatCard, StatCardGrid, StatFooter, StatFooterRow } from "./stat-card";

const EMPTY = "No bottles yet";

// Vintage buckets ≤2010 · 2011–14 · 2015–17 · 2018–20 · 2021+ in the
// handoff's tones.
const VINTAGE_TONES: ColumnTone[] = ["oldest", "gold", "primary", "primary", "rose"];

// Cellar: what is in the rack now (distributions, vintages — these ignore the
// range and say so in their eyebrow) and what moved in and out of it over the
// last six months. "Poured into tastings" from the handoff is not rendered:
// the schema does not record which consumptions went into a tasting.
export function CellarSection({
  data,
  range,
}: {
  data: NumbersCellar;
  range: NumbersRange;
}) {
  const {
    bottles,
    producers,
    countries,
    byCountry,
    byType,
    redsByGrape,
    vintageBuckets,
    oldest,
    medianVintage,
    movements,
    addedInRange,
    openedInRange,
  } = data;
  const none = bottles === 0;
  const holdings = range === "all" ? "" : " · current holdings";
  const period = rangeLabel(range);
  // An emptied rack can still have a movement history worth showing.
  const moved =
    movements.some((m) => m.added > 0 || m.drunk > 0) ||
    addedInRange > 0 ||
    openedInRange > 0;
  const summary = `${bottles} bottles · ${producers} producers · ${countries} countries`;

  return (
    <section className="flex flex-col gap-[14px] p-[20px_30px_30px] max-md:p-[0_16px_20px]">
      <SectionHeader
        rule
        title="Cellar"
        summary={summary}
        pill={
          <LinkPill href="/cellar" size="md" tone="card">
            Open cellar
          </LinkPill>
        }
      />
      <StatCardGrid>
        <StatCard
          title={`Distributions${holdings}`}
          empty={none ? EMPTY : null}
          className="gap-[14px]"
        >
          <DistributionBar caption="Country" captionStyle="bold" items={byCountry} />
          <DistributionBar caption="Wine type" captionStyle="bold" items={byType} />
          {redsByGrape.length > 0 ? (
            <DistributionBar
              caption="Reds by grape"
              captionStyle="bold"
              items={redsByGrape}
            />
          ) : null}
        </StatCard>

        <StatCard
          title={`Vintages in the rack${holdings}`}
          empty={none ? EMPTY : null}
        >
          <ColumnChart
            columns={vintageBuckets.map((b, i) => ({
              value: b.count,
              label: b.label,
              tone: VINTAGE_TONES[i],
            }))}
            height={100}
            gap={7}
            showCounts
            axis={{ kind: "per-column" }}
          />
          <StatFooter>
            <StatFooterRow
              label="Oldest"
              value={oldest?.title ?? "—"}
              valueClassName="max-w-[60%] font-heading text-[14px] leading-none"
            />
            <StatFooterRow label="Median vintage" value={medianVintage ?? "—"} />
          </StatFooter>
        </StatCard>

        <StatCard
          title="Bottles in, bottles out"
          empty={none && !moved ? EMPTY : null}
        >
          <StackedColumnChart
            columns={movements.map((m) => ({
              label: m.label,
              added: m.added,
              removed: m.drunk,
            }))}
            height={100}
          />
          <StatFooter>
            <StatFooterRow label={`Added ${period}`} value={addedInRange} />
            <StatFooterRow label={`Opened ${period}`} value={openedInRange} />
          </StatFooter>
        </StatCard>
      </StatCardGrid>
    </section>
  );
}
