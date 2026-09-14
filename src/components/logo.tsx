/**
 * Blindr logo — "Sip Blind" mark: a blindfolded taster in profile, tipping a
 * glass. Ported from the design handoff's dependency-free React component;
 * colors default to the brand tokens in globals.css but can be overridden.
 *
 *   <BlindrAppIcon size={64} />       // rounded Bordeaux tile — favicon/avatar shape
 *   <BlindrMark size={40} onDark />   // bare mark, transparent background
 *   <BlindrWordmark size={32} />      // "Blindr." — needs Cormorant Garamond
 *   <BlindrLockup size={40} />        // mark + wordmark, horizontal
 */
import { type SVGProps } from "react";

// The brand hexes, for the places that must be a FIXED colour whatever the
// theme: the app-icon tile, and the figure drawn on it.
const BORDEAUX = "#5C1A2B";
const GOLD = "#C3A25B";
const GOLD_DEEP = "#B78E42";
const PARCHMENT = "#F5EFE3";

// ...and the same colours as tokens, for the places drawn straight onto the
// page, which have to follow the theme. In light these resolve to exactly the
// hexes above; in dark --primary-ink is the indigo-family #8a87c8 (5.56:1 on
// the page) and --gold the lighter #d4af6a, both of which read on near-black.
//
// INK is --primary-ink, not --primary. In light the two are the same #5c1a2b.
// In dark --primary is a SURFACE colour (the #2b2a4f rail and filled buttons)
// and as ink on the #1b1310 ground it measures 1.35:1, which made the wordmark
// vanish again on /login, /signup and /j/[code]. globals.css's
// `.dark .text-primary` rule cannot rescue it: these are inline style and SVG
// fill values, not classes.
//
// This is not cosmetic. The wordmark defaulted to the literal BORDEAUX and
// rendered #5C1A2B on the #1B1310 dark ground -- about 1.5:1, invisible -- on
// the login and signup pages, which is the first screen anyone sees.
const INK = "var(--primary-ink)";
const ACCENT = "var(--gold)";
const ACCENT_DEEP = "var(--gold-deep)";

// ...and the menu rail's own tokens, for the mark drawn ON the rail. The rail is
// one colour in every theme (owner, 2026-09-14), so the mark on it must be too:
// --gold, which the dark theme lightens, would shift its accents.
const RAIL_FIGURE = "var(--rail-foreground)";
const RAIL_ACCENT = "var(--rail-accent)";
const RAIL_ACCENT_DEEP = "var(--rail-accent-deep)";

function MarkPaths({
  figure,
  accent,
  knot,
}: {
  figure: string;
  accent: string;
  knot: string;
}) {
  return (
    <>
      <path d="M40 74 L40 92 L60 92 L60 70 Z" fill={figure} />
      <circle cx="48" cy="50" r="19" fill={figure} />
      <path d="M66 46 L74 51 L66 56 Z" fill={figure} />
      <rect x="27" y="42" width="40" height="8.5" rx="2.5" fill={accent} />
      <ellipse cx="28" cy="46.2" rx="5" ry="5.3" fill={knot} />
      <path d="M24 43 L14 39 L18 47 Z" fill={accent} />
      <path d="M24 50 L14 55 L19 49 Z" fill={accent} />
      <g
        transform="rotate(-66 66 56)"
        fill="none"
        stroke={accent}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M56 56 C55 67 62 73 66 73 C70 73 77 67 76 56 Z" />
        <line x1="66" y1="73" x2="66" y2="88" />
        <line x1="59" y1="89" x2="73" y2="89" />
      </g>
    </>
  );
}

type MarkProps = {
  size?: number;
  onDark?: boolean;
  accent?: string;
  knot?: string;
} & Omit<SVGProps<SVGSVGElement>, "viewBox" | "role" | "aria-label">;

/** Bare mark on a transparent background. Pass `onDark` when it sits on the menu rail. */
export function BlindrMark({
  size = 40,
  onDark = false,
  accent,
  knot,
  ...rest
}: MarkProps) {
  // `onDark` means "drawn on the menu rail", which is the same Bordeaux in
  // every theme, so the whole mark takes the rail's tokens: in light they are
  // the parchment and gold it always had, and dark leaves them alone. The
  // other branch is drawn on the page and follows the theme.
  const figure = onDark ? RAIL_FIGURE : INK;
  const accentFill = accent ?? (onDark ? RAIL_ACCENT : ACCENT);
  const knotFill = knot ?? (onDark ? RAIL_ACCENT_DEEP : ACCENT_DEEP);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Blindr"
      {...rest}
    >
      <MarkPaths figure={figure} accent={accentFill} knot={knotFill} />
    </svg>
  );
}

type AppIconProps = {
  size?: number;
  radius?: number;
  bg?: string;
  figure?: string;
  accent?: string;
  knot?: string;
} & Omit<SVGProps<SVGSVGElement>, "viewBox" | "role" | "aria-label">;

/** Rounded Bordeaux tile — use for the app icon / favicon / avatar. */
export function BlindrAppIcon({
  size = 64,
  radius = 27,
  bg = BORDEAUX,
  figure = PARCHMENT,
  accent = GOLD,
  knot = GOLD_DEEP,
  ...rest
}: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Blindr"
      {...rest}
    >
      <rect width={120} height={120} rx={radius} fill={bg} />
      <MarkPaths figure={figure} accent={accent} knot={knot} />
    </svg>
  );
}

/** "Blindr." wordmark. Requires the Cormorant Garamond font. */
export function BlindrWordmark({
  size = 32,
  color = INK,
  dot = ACCENT,
  className,
  style,
}: {
  size?: number;
  color?: string;
  dot?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        fontFamily: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif",
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color,
        ...style,
      }}
    >
      Blindr<span style={{ color: dot }}>.</span>
    </span>
  );
}

/** Mark + wordmark, horizontal lockup. `onDark` flips both for dark surfaces. */
export function BlindrLockup({
  size = 40,
  onDark = false,
  gap = 12,
  className,
  style,
}: {
  size?: number;
  onDark?: boolean;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap, ...style }}
    >
      <BlindrAppIcon size={size} radius={Math.round(size * 0.24)} />
      <BlindrWordmark size={size * 0.8} color={onDark ? PARCHMENT : INK} />
    </span>
  );
}
