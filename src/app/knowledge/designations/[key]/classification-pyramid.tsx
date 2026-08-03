import type { PyramidTier } from "@/lib/designations/content";

// A proper classification pyramid: N colour bands (SVG trapezoids, rarest on
// top) with the tier name + share of production inside, beside a legend of what
// each tier means — its count and what appears on the wine label. Maturation
// windows are deliberately omitted: they are typical, not a legal requirement.
export function ClassificationPyramid({ tiers }: { tiers: PyramidTier[] }) {
  const n = tiers.length;
  const W = 320;
  const H = 300;
  const topHalf = 26; // truncated apex so the top band has room for its label
  const bandH = H / n;
  const halfAt = (y: number) => topHalf + (W / 2 - topHalf) * (y / H);
  const cx = W / 2;

  return (
    <figure className="m-0 flex flex-col gap-5 sm:flex-row sm:items-center">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[320px] shrink-0"
        role="img"
        aria-label="Classification pyramid"
      >
        {tiers.map((t, i) => {
          const yTop = i * bandH;
          const yBot = (i + 1) * bandH;
          const hwTop = halfAt(yTop);
          const hwBot = halfAt(yBot);
          const cy = yTop + bandH / 2;
          const fg = t.textColor ?? "#ffffff";
          return (
            <g key={t.name}>
              <polygon
                points={`${cx - hwTop},${yTop} ${cx + hwTop},${yTop} ${cx + hwBot},${yBot} ${cx - hwBot},${yBot}`}
                fill={t.color}
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              <text
                x={cx}
                y={cy - 2}
                textAnchor="middle"
                fill={fg}
                fontSize={13}
                fontWeight={700}
              >
                {t.name}
              </text>
              {t.pct ? (
                <text
                  x={cx}
                  y={cy + 12}
                  textAnchor="middle"
                  fill={fg}
                  fontSize={9}
                  opacity={0.9}
                >
                  {t.pct}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <ul className="flex flex-1 flex-col gap-2.5">
        {tiers.map((t) => (
          <li key={t.name} className="flex gap-2.5">
            <span
              className="mt-1 size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: t.color }}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {t.name}
                {t.count ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {t.count}
                  </span>
                ) : null}
              </p>
              {t.labelling ? (
                <p className="text-xs text-muted-foreground">
                  On the label: {t.labelling}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
