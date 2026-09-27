// The level ring's geometry (spec §8.2, L30): one circle drawn as an arc of
// 360° − g, starting at 12 o'clock + g/2 and running clockwise, so the gap sits
// under the badge and no progress ever hides beneath it. Lengths are in px for
// strokeDasharray/strokeDashoffset. Pure: no imports.

export type RingGeometry = {
  /** Stroke width. */
  stroke: number;
  /** Space between the stroke and the avatar. */
  gap: number;
  /** The badge's gap in the arc, in degrees. */
  gapDegrees: number;
  radius: number;
  circumference: number;
  /** The arc's length (the track). */
  arc: number;
  /** The filled length. */
  fill: number;
  /** strokeDashoffset that shows exactly `fill` of the arc from its start. */
  offset: number;
  /** SVG rotate() angle that puts the arc's start at 12 o'clock + g/2. */
  rotate: number;
  /** The avatar's diameter inside the ring. */
  inner: number;
  badgeHeight: number;
  badgeFontSize: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Half the badge's width at a two-digit level (level-ring.tsx: min-width =
    its height, px-1, tabular digits), plus its ring-2 halo, which is painted in
    the surrounding colour and so erases the stroke beneath it. */
const BADGE_HALF = { small: 9.5 + 2, big: 12 + 2 } as const;

/** Below 64 px: stroke 2.5, gap 1.5, a 14 px badge with 9 px text; from 64 px:
    3, 2, 20 px, 12 px. The badge gap g is worked out from the badge: the
    smallest whole angle whose arc ends (stroke included) clear the badge and
    its halo at a two-digit level (34 px 109°, 40 px 86°, 74 px 52°, 90 px 42°). */
export function ringGeometry(size: number, fraction: number): RingGeometry {
  const big = size >= 64;
  const stroke = big ? 3 : 2.5;
  const gap = big ? 2 : 1.5;
  const radius = (size - stroke) / 2;
  const clear = (big ? BADGE_HALF.big : BADGE_HALF.small) + stroke / 2;
  const gapDegrees = Math.min(
    360,
    Math.ceil((2 * Math.asin(Math.min(1, clear / Math.max(radius, 1e-6))) * 180) / Math.PI),
  );
  const circumference = 2 * Math.PI * radius;
  const arc = (circumference * (360 - gapDegrees)) / 360;
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const fill = arc * f;
  return {
    stroke,
    gap,
    gapDegrees,
    radius: round2(radius),
    circumference: round2(circumference),
    arc: round2(arc),
    fill: round2(fill),
    offset: round2(arc - fill),
    rotate: -90 + gapDegrees / 2,
    inner: size - 2 * (stroke + gap),
    badgeHeight: big ? 20 : 14,
    badgeFontSize: big ? 12 : 9,
  };
}
