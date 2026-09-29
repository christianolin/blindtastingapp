// The likelihood map's own lines (training-room-map spec §9 R2 — PROVISIONAL
// until the owner approves the table before the R2 deploy). Used only inside
// the map's dynamic chunk (training-map.tsx, its legend and map-view.ts), so
// they stay out of the room's first load (spec §12's budget). The lines that
// show before or without the map — the List | Map tabs, the fallbacks and the
// chooser's title — stay in copy.ts's TRAINING_COPY. No string claims a
// probability: the % is each wine's own closeness (spec RM27, risk X1).
// Plain module, no imports: vitest pins every line (copy.test.ts).
export const MAP_COPY = {
  mapLabel: "Map of the typical wines, coloured by how close each is to your note",
  mapSrNote: "The list shows the same wines and numbers.",
  closestOnMap: "Closest on the map",
  legendLess: "Less close",
  legendClosest: "Closest",
  legendRuledOut: "Ruled out",
  legendRelative: "Colours compare the wines with each other; the % is each wine's own closeness.",
  legendApprox: "Wines outside the mapped countries sit at an approximate spot.",
  fitClosest: "Fit to the closest",
} as const;

/** A shared spot's suffix on the map: "+2" when two more wines sit there (RM15). */
export function stackMore(n: number): string {
  return `+${n}`;
}

/** The legend's count of typical wines with no dot at all (hidden at 0). */
export function unmappedLine(n: number): string {
  return `${n} not on the wine map yet`;
}
