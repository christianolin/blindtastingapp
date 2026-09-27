// The wine map's keyboard focus ring: a solid 2 px outline in the ring colour,
// 2 px outside the control. Every map control draws this one, so tabbing from
// one to the next never goes from a clear ring to the base layer's faint
// `outline-ring/50` (globals.css recolours the browser's own outline to 50%
// alpha, about 1.4:1 on the light background). The phone sheet's tabs and
// chevron, the md-xl Explore | Details switch, Hide panel and Show panel, and
// the xl collapse buttons and strips use it (spec 2026-09-27 §5.2, §5.3).
export const MAP_FOCUS_RING =
  "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
