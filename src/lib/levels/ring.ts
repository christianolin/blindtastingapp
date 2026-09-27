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

/** Below 64 px: stroke 2.5, gap 1.5, a 50° badge gap, a 14 px badge with 9 px
    text; from 64 px: 3, 2, 36°, 20 px, 12 px. */
export function ringGeometry(size: number, fraction: number): RingGeometry {
  const big = size >= 64;
  const stroke = big ? 3 : 2.5;
  const gap = big ? 2 : 1.5;
  const gapDegrees = big ? 36 : 50;
  const radius = (size - stroke) / 2;
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
