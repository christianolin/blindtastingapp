import type { Bar, CellarStats } from "./stats";

function BarList({ items }: { items: Bar[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate text-muted-foreground">
            {i.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }}
            />
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums">
            {i.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
      <h3 className="font-heading text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

export function StatsPanel({ stats }: { stats: CellarStats }) {
  if (stats.totalBottles === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="font-heading text-lg font-medium">No stats yet</p>
        <p className="text-sm text-muted-foreground">
          Add wines to your cellar to see value, drink windows and breakdowns.
        </p>
      </div>
    );
  }
  const tiles = [
    { label: "bottles", value: stats.totalBottles },
    { label: "wines", value: stats.distinctWines },
        { label: `${stats.currency} est. value`, value: stats.value },
    { label: `${stats.currency} spent`, value: stats.spend },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border p-4">
            <div className="font-heading text-2xl font-semibold tabular-nums">
              {t.value.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </div>
        ))}
      </div>
      {stats.mixedCurrency ? (
        <p className="text-xs text-muted-foreground">
          Value and spend cover lots priced in {stats.currency}; other currencies
          are excluded.
        </p>
      ) : null}
      {stats.readiness.length > 0 ? (
        <Section title="Drink-window readiness">
          <BarList items={stats.readiness} />
        </Section>
      ) : null}
      {stats.byColour.length > 0 ? (
        <Section title="By colour">
          <BarList items={stats.byColour} />
        </Section>
      ) : null}
      {stats.byRegion.length > 0 ? (
        <Section title="By region">
          <BarList items={stats.byRegion} />
        </Section>
      ) : null}
      {stats.byDecade.length > 0 ? (
        <Section title="By vintage decade">
          <BarList items={stats.byDecade} />
        </Section>
      ) : null}
      {stats.spendByYear.length > 0 ? (
        <Section title={`Spend by year (${stats.currency})`}>
          <BarList items={stats.spendByYear} />
        </Section>
      ) : null}
    </div>
  );
}
