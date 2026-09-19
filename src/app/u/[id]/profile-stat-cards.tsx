import { AccuracyRows } from "@/components/overview/accuracy-rows";
import {
  StatCard,
  StatCardGrid,
  StatFooter,
  StatFooterRow,
  toneForShare,
} from "@/app/profile/numbers/stat-card";
import {
  NOTHING_YET,
  type AccuracyView,
  type ShareRow,
} from "@/lib/profile/profile-view-math";

// The tone helper is applied here, not in the pure module (spec §4: "the tone
// helper lives in a component file, so it stays out of the pure module").
function tonedRows(rows: ShareRow[]) {
  return rows.map((r) => ({ ...r, tone: toneForShare(r.pct) }));
}

const SHARE_ROWS_PROPS = {
  trackHeight: 6 as const,
  labelWidth: 96,
  valueWidth: 28,
  className: "gap-1.5",
};

/**
 * `/u/[id]`'s three stat cards (spec §2.4, D3): accuracy by category, and the
 * two "tasted most" cards — built on the same `StatCard`/`AccuracyRows`
 * primitives Your numbers uses (`u/[id]/cellar` already imports from
 * `app/profile/numbers` the same way, rather than duplicating the shell).
 */
export function ProfileStatCards({
  accuracy,
  countries,
  regions,
  grapes,
}: {
  accuracy: AccuracyView;
  countries: ShareRow[];
  regions: ShareRow[];
  grapes: ShareRow[];
}) {
  const showFooter = Boolean(accuracy.strongest || accuracy.footnote);

  return (
    <StatCardGrid>
      <StatCard title="Accuracy by category" empty={accuracy.empty} className="gap-[13px]">
        <AccuracyRows rows={accuracy.rows} labelWidth={84} />
        {showFooter ? (
          <StatFooter>
            {accuracy.strongest ? (
              <StatFooterRow label="Strongest" value={accuracy.strongest} />
            ) : null}
            {accuracy.footnote ? (
              <p className="text-[11.5px] text-muted-foreground">{accuracy.footnote}</p>
            ) : null}
          </StatFooter>
        ) : null}
      </StatCard>

      <StatCard
        title="Origins tasted most"
        empty={countries.length === 0 && regions.length === 0 ? NOTHING_YET : null}
        className="gap-[13px]"
      >
        {countries.length > 0 ? (
          <div className="flex flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold">Countries</span>
            <AccuracyRows rows={tonedRows(countries)} {...SHARE_ROWS_PROPS} />
          </div>
        ) : null}
        {regions.length > 0 ? (
          <div className="flex flex-col gap-[7px]">
            <span className="text-[11.5px] font-semibold">Regions</span>
            <AccuracyRows rows={tonedRows(regions)} {...SHARE_ROWS_PROPS} />
          </div>
        ) : null}
      </StatCard>

      <StatCard title="Grapes tasted most" empty={grapes.length === 0 ? NOTHING_YET : null}>
        <AccuracyRows rows={tonedRows(grapes)} {...SHARE_ROWS_PROPS} />
      </StatCard>
    </StatCardGrid>
  );
}
