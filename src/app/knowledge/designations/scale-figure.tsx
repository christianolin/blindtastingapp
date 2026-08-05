import { cn } from "@/lib/utils";

export type ScaleStep = {
  name: string;
  /** The measured band, e.g. "0–3 g/L" or "min. 24 months". */
  value?: string;
  /** One line of plain explanation. */
  note?: string;
};

// A textbook-style figure for an ordered classification: a labelled axis, the
// steps in order along it, and each step's measured band. Shared by every scale
// in the library (dosage, Prädikat, sweetness, ageing) so they read alike.
//
// `source` is not decoration: several of these scales are legally fixed while
// others vary by region, and a figure that shows numbers has to say which it is.
export function ScaleFigure({
  title,
  axisFrom,
  axisTo,
  steps,
  source,
  columns,
}: {
  title: string;
  axisFrom: string;
  axisTo: string;
  steps: ScaleStep[];
  source: string;
  columns?: number;
}) {
  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <figcaption className="flex flex-col gap-1">
        <h3 className="font-heading text-lg font-semibold">{title}</h3>
        <div className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
          <span>{axisFrom}</span>
          <span
            aria-hidden
            className="h-px flex-1 bg-gradient-to-r from-primary/30 via-gold/60 to-primary/30"
          />
          <span>{axisTo}</span>
        </div>
      </figcaption>

      <ol
        className={cn(
          "grid gap-2",
          columns === 3
            ? "sm:grid-cols-3"
            : columns === 6
              ? "sm:grid-cols-3 lg:grid-cols-6"
              : "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        {steps.map((s, i) => (
          <li
            key={s.name}
            className="relative flex flex-col gap-1 rounded-lg border border-border bg-background p-3"
          >
            {/* Intensity ramps with position, so the order is readable at a
                glance without reading the labels. */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 rounded-t-lg"
              style={{
                backgroundColor: "var(--gold)",
                opacity: 0.25 + (0.75 * i) / Math.max(steps.length - 1, 1),
              }}
            />
            <span className="mt-1 font-heading text-[0.95rem] font-semibold leading-tight">
              {s.name}
            </span>
            {s.value ? (
              <span className="text-sm font-medium tabular-nums lining-nums text-primary">
                {s.value}
              </span>
            ) : null}
            {s.note ? (
              <span className="text-xs leading-snug text-muted-foreground">
                {s.note}
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="text-[0.7rem] leading-snug text-muted-foreground">{source}</p>
    </figure>
  );
}
