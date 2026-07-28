// Weighted 100-point quality scale (Parker-style), the WSET-quality
// replacement. The slider position is NON-linear: 50-84 is compressed into
// the left, 85-92 (where most good wines land) gets the widest stretch, and
// 95+ occupies the rare right edge. Piecewise-linear over these breakpoints
// [score -> track %]; interpolated both directions. Pure, dependency-free so
// both the node test and the QualitySlider component share one source
// (allowJs infers the types on the app side).
const BREAKS = [
  [50, 0],
  [80, 20],
  [85, 40],
  [90, 70],
  [95, 90],
  [100, 100],
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function scoreToPct(score) {
  const s = clamp(score, 50, 100);
  for (let i = 1; i < BREAKS.length; i++) {
    const [s0, p0] = BREAKS[i - 1];
    const [s1, p1] = BREAKS[i];
    if (s <= s1) return p0 + ((s - s0) / (s1 - s0)) * (p1 - p0);
  }
  return 100;
}

export function pctToScore(pct) {
  const p = clamp(pct, 0, 100);
  for (let i = 1; i < BREAKS.length; i++) {
    const [s0, p0] = BREAKS[i - 1];
    const [s1, p1] = BREAKS[i];
    if (p <= p1) return Math.round(s0 + ((p - p0) / (p1 - p0)) * (s1 - s0));
  }
  return 100;
}

export function qualityBand(score) {
  if (score >= 96) return "Extraordinary";
  if (score >= 90) return "Outstanding";
  if (score >= 85) return "Very good";
  if (score >= 80) return "Above average";
  if (score >= 70) return "Average";
  if (score >= 60) return "Below average";
  return "Unacceptable";
}
