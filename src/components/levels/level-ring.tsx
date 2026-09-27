import type { ReactNode } from "react";
import { levelProgress } from "@/lib/levels/curve";
import { ringLabel } from "@/lib/levels/copy";
import { ringGeometry } from "@/lib/levels/ring";
import { cn } from "@/lib/utils";

// Tokens only (L30): on the bordeaux sidebar and drawer the fill is gold over
// primary-foreground/20; on the page (/u/[id]) gold-deep over border-light,
// supplementary to the card's own text. The badge is always gold with
// on-accent ink, ringed in the colour around it so it reads apart from the arc.
const TONES = {
  sidebar: { track: "stroke-primary-foreground/20", fill: "stroke-gold", badgeRing: "ring-primary" },
  surface: { track: "stroke-border-light", fill: "stroke-gold-deep", badgeRing: "ring-background" },
} as const;

/**
 * The XP ring around an avatar, with the level in a badge above it (spec
 * §8.2, L8). Hook-free, so server components render it; the viewer's own
 * ring goes through LiveLevelRing. One circle drawn as an arc with a gap under
 * the badge; the fill is the same arc cut short with strokeDashoffset.
 * `labelled`: a standalone ring (role="img" + its label); otherwise it is
 * aria-hidden and the link around it carries ringLinkLabel.
 */
export function LevelRing({
  level,
  xp,
  size,
  tone,
  labelled = false,
  className,
  children,
}: {
  level: number;
  xp: number;
  /** Outer diameter, px. */
  size: number;
  tone: keyof typeof TONES;
  labelled?: boolean;
  className?: string;
  /** The avatar, sized to fit inside (ringGeometry(size).inner px). */
  children: ReactNode;
}) {
  const progress = levelProgress(xp);
  const g = ringGeometry(size, progress.fraction);
  const t = TONES[tone];
  const c = size / 2;
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      {...(labelled ? { role: "img", "aria-label": ringLabel(xp) } : { "aria-hidden": true })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0" fill="none">
        <g transform={`rotate(${g.rotate} ${c} ${c})`}>
          <circle
            cx={c}
            cy={c}
            r={g.radius}
            strokeWidth={g.stroke}
            strokeDasharray={`${g.arc} ${g.circumference}`}
            className={t.track}
          />
          <circle
            cx={c}
            cy={c}
            r={g.radius}
            strokeWidth={g.stroke}
            strokeDasharray={`${g.arc} ${g.circumference}`}
            strokeDashoffset={g.offset}
            className={cn(t.fill, "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700")}
          />
        </g>
      </svg>
      <span className="relative flex items-center justify-center" style={{ width: g.inner, height: g.inner }}>
        {children}
      </span>
      <span
        className={cn(
          "absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold px-1 leading-none font-semibold text-on-accent tabular-nums ring-2",
          t.badgeRing,
        )}
        style={{ height: g.badgeHeight, minWidth: g.badgeHeight, fontSize: g.badgeFontSize }}
      >
        {level}
      </span>
    </span>
  );
}
