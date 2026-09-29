// The training room's likelihood map, as pure rules (training-room-map spec
// RM12-RM18, RM26): which dots it draws and how hot each is, which spots carry
// a label and what it says, where the camera goes, what a tap on a spot opens,
// and the MapLibre paint and layout it all draws with. training-map.tsx only
// wires these to MapLibre. Imported only from under src/app/taste/training/
// and by its own test (spec RM1; training-room-map-imports.test.ts pins it).
//
// The % on the map is literally the list's: labels and the hover tooltip are
// shortName + percentLabel from ./copy. Heat is relative to the leader (RM13):
// the % is each wine's own closeness, not a probability, and early on many
// wines sit near 100 %, so an absolute ramp would saturate.
//
// Pure: relative imports only (the house style for src/lib/training/), and
// the maplibre-gl and palette imports are types, erased from the bundle.
import type { CircleLayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import type { MapPalette } from "../wine-map/map-palette";
import { CLOSE_WINDOW, percentLabel, shortName } from "./copy";
import { stackMore } from "./map-copy";
import type { MapPoint, RankedCandidate, TrainingCandidate } from "./types";

/** [west, south, east, north] in degrees. */
export type Bbox = [number, number, number, number];

/** The heat stops the palette's four colours sit at (RM13). */
export const HEAT_STOPS = [0.5, 0.75, 0.9, 1] as const;
/** Spots labelled at every zoom: the three best-ranked (RM15, owner O3). */
export const LABEL_COUNT = 3;
/** From this zoom every labelled spot may show its label (RM15). */
export const LABEL_ALL_ZOOM = 7;
/** Before any answer: Portugal to Santorini, Jerez to the Mosel (RM17, owner O4). */
export const EUROPE_BOX: Bbox = [-10, 35.5, 27, 52.5];
export const FIT_MAX_ZOOM = 10;
export const FIT_PADDING = 40;
/** A lone spot is padded this much each way, so its neighbours show. */
export const FIT_MIN_SPAN_DEG = 0.6;
/** The camera fits at most this many close wines… */
export const CAMERA_SET_MAX = 12;
/** …and only those within this many degrees of the first one, in lon and lat. */
export const CAMERA_REACH_DEG = 25;
/** The camera follows the close set this long after its membership last changed. */
export const CAMERA_SETTLE_MS = 600;
/** A tap queries a box this size around the point (a coarse pointer gets 44 px). */
export const HIT_SLOP_PX = { coarse: 22, fine: 6 } as const;
/** The text size the labels are set in, px (their offset is set in ems). */
export const LABEL_TEXT_SIZE = 12;

/** One dot's kind: a number to colour by, no number yet, or ruled out. */
export type DotState = "scored" | "neutral" | "capped";

export type DotProperties = {
  id: string;
  state: DotState;
  /** 0..1, two decimals; 0 when not scored. */
  heat: number;
  /** The spot's label on its carrier dot; "" on every other dot. */
  label: string;
  /** The spot's label rank (1 = best); 0 on a dot that carries no label. */
  rank: number;
  /** circle-sort-key: heat when scored, −0.5 neutral, −1 capped. */
  sort: number;
};

export type DotFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: DotProperties;
};

export type DotCollection = {
  type: "FeatureCollection";
  features: DotFeature[];
};

/** One labelled spot (RM15). `ids` is every wine there, in ranking order. */
export type LabelledSpot = {
  id: string;
  text: string;
  rank: number;
  ids: string[];
  lon: number;
  lat: number;
};

/**
 * A wine's heat relative to the leader (RM13): null without a closeness; 0
 * when there is no leader (`top` null or ≤ 0); otherwise closeness / top,
 * linear. The colour and size ramps put their stops on this number.
 */
export function heatOf(closeness: number | null, top: number | null): number | null {
  if (closeness === null) return null;
  if (top === null || top <= 0) return 0;
  return closeness / top;
}

/** Nothing answered yet: no wine has a number and none is ruled out. panel.ts's
    isBeforeAnswers, restated here so the map's chunk imports nothing the
    room's first load owns (spec §12); map-view.test.ts pins that they agree. */
export function noAnswersYet(ranked: readonly RankedCandidate[]): boolean {
  return ranked.every((r) => r.closeness === null && r.capped === null);
}

/** The best uncapped closeness in the ranking, or null when none has one. */
export function leaderCloseness(ranked: readonly RankedCandidate[]): number | null {
  let top: number | null = null;
  for (const r of ranked) {
    if (r.capped === null && r.closeness !== null && (top === null || r.closeness > top)) top = r.closeness;
  }
  return top;
}

function spotKey(p: MapPoint): string {
  return `${p.lon},${p.lat}`;
}

function dotState(r: RankedCandidate): DotState {
  if (r.capped !== null) return "capped";
  return r.closeness === null ? "neutral" : "scored";
}

/** "Pauillac 91 %", "Alsace Riesling 88 % +2", "Bandol" (no number yet). */
export function dotText(r: RankedCandidate, others: number): string {
  const pct = r.closeness === null ? "" : ` ${percentLabel(r.closeness)}`;
  const more = others > 0 ? ` ${stackMore(others)}` : "";
  return `${shortName(r.candidate.name)}${pct}${more}`;
}

/** The ranking's wines that have a dot, grouped by exact spot, each group in
    ranking order; the groups in the order their first wine ranks. */
function spots(ranked: readonly RankedCandidate[]): RankedCandidate[][] {
  const bySpot = new Map<string, RankedCandidate[]>();
  for (const r of ranked) {
    const p = r.candidate.mapPoint;
    if (!p) continue;
    const key = spotKey(p);
    const list = bySpot.get(key);
    if (list) list.push(r);
    else bySpot.set(key, [r]);
  }
  return [...bySpot.values()];
}

/**
 * The labelled spots by "lon,lat" (RM15), best first. Dots at exactly the same
 * coordinates are one spot; its label is its best-ranked uncapped wine with a
 * closeness, "+n" counting every other wine there. A spot with no such wine
 * has no label. Ranks run 1, 2, 3, … in ranking order; only the first
 * LABEL_COUNT show below LABEL_ALL_ZOOM.
 */
export function labelledPositions(ranked: readonly RankedCandidate[]): Map<string, LabelledSpot> {
  const order = new Map(ranked.map((r, i) => [r.candidate.id, i] as const));
  const carried: { carrier: RankedCandidate; group: RankedCandidate[] }[] = [];
  for (const group of spots(ranked)) {
    const carrier = group.find((r) => r.capped === null && r.closeness !== null);
    if (carrier) carried.push({ carrier, group });
  }
  carried.sort((a, b) => (order.get(a.carrier.candidate.id) ?? 0) - (order.get(b.carrier.candidate.id) ?? 0));
  const out = new Map<string, LabelledSpot>();
  carried.forEach(({ carrier, group }, i) => {
    const p = carrier.candidate.mapPoint as MapPoint;
    out.set(spotKey(p), {
      id: carrier.candidate.id,
      text: dotText(carrier, group.length - 1),
      rank: i + 1,
      ids: group.map((r) => r.candidate.id),
      lon: p.lon,
      lat: p.lat,
    });
  });
  return out;
}

/** The labelled spots always shown, and offered as buttons under the map (RM25). */
export function closestSpots(ranked: readonly RankedCandidate[]): LabelledSpot[] {
  return [...labelledPositions(ranked).values()].filter((s) => s.rank <= LABEL_COUNT);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One Point feature per wine with a dot, in ranking order (RM12, RM13, RM15). */
export function trainingFeatures(ranked: readonly RankedCandidate[]): DotCollection {
  const top = leaderCloseness(ranked);
  const carriers = new Map([...labelledPositions(ranked).values()].map((s) => [s.id, s] as const));
  const features: DotFeature[] = [];
  for (const r of ranked) {
    const p = r.candidate.mapPoint;
    if (!p) continue;
    const state = dotState(r);
    const heat = state === "scored" ? round2(heatOf(r.closeness, top) ?? 0) : 0;
    const spot = carriers.get(r.candidate.id);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lon, p.lat] },
      properties: {
        id: r.candidate.id,
        state,
        heat,
        label: spot ? spot.text : "",
        rank: spot ? spot.rank : 0,
        sort: state === "scored" ? heat : state === "neutral" ? -0.5 : -1,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** What setData would change (RM16): equal fingerprints need no setData. */
export function featuresFingerprint(fc: DotCollection): string {
  return fc.features
    .map((f) => {
      const p = f.properties;
      return `${p.id}:${p.heat.toFixed(2)}:${p.state}:${p.label}:${p.rank}`;
    })
    .join("|");
}

/**
 * The close set (RM17): the leader and every uncapped wine within
 * CLOSE_WINDOW points of it — the strip's "N more close" plus the leader, so
 * closeSet(r).length - 1 is stripLine's N. Ranking order; [] with no leader.
 */
export function closeSet(ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const top = leaderCloseness(ranked);
  if (top === null) return [];
  return ranked.filter((r) => r.capped === null && r.closeness !== null && top - r.closeness <= CLOSE_WINDOW);
}

/**
 * The wines the camera fits (RM17): the close set's wines with a dot, cut to
 * the CAMERA_SET_MAX best-ranked, then to those within CAMERA_REACH_DEG of the
 * first one's dot in both longitude and latitude — so a claret note's
 * leaders are not fitted together with a New World curated point.
 */
export function fitSet(ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const withDot = closeSet(ranked)
    .filter((r) => r.candidate.mapPoint !== null)
    .slice(0, CAMERA_SET_MAX);
  if (withDot.length === 0) return [];
  const anchor = withDot[0].candidate.mapPoint as MapPoint;
  return withDot.filter((r) => {
    const p = r.candidate.mapPoint as MapPoint;
    return Math.abs(p.lon - anchor.lon) <= CAMERA_REACH_DEG && Math.abs(p.lat - anchor.lat) <= CAMERA_REACH_DEG;
  });
}

/**
 * Where the camera goes (RM17): Europe before any leader (nothing answered,
 * or everything ruled out); else the fit set's box, a lone spot padded by
 * FIT_MIN_SPAN_DEG each way; null when the close set has no dot (the camera
 * stays where it is).
 */
export function cameraTarget(ranked: readonly RankedCandidate[]): { box: Bbox; maxZoom: number } | null {
  if (leaderCloseness(ranked) === null) return { box: EUROPE_BOX, maxZoom: FIT_MAX_ZOOM };
  const set = fitSet(ranked);
  if (set.length === 0) return null;
  const points = set.map((r) => r.candidate.mapPoint as MapPoint);
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  let box: Bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  if (box[0] === box[2] && box[1] === box[3]) {
    box = [box[0] - FIT_MIN_SPAN_DEG, box[1] - FIT_MIN_SPAN_DEG, box[2] + FIT_MIN_SPAN_DEG, box[3] + FIT_MIN_SPAN_DEG];
  }
  return { box, maxZoom: FIT_MAX_ZOOM };
}

/** What the camera is following, as a key: it moves only when this changes. */
export function cameraKey(ranked: readonly RankedCandidate[]): string {
  if (leaderCloseness(ranked) === null) return "europe";
  return fitSet(ranked)
    .map((r) => r.candidate.id)
    .sort()
    .join(",");
}

/** Follow the fit set once it has held still CAMERA_SETTLE_MS — never after the viewer moved the map. */
export function shouldAutoFit(state: { userMoved: boolean; membershipChangedAt: number; now: number }): boolean {
  return !state.userMoved && state.now - state.membershipChangedAt >= CAMERA_SETTLE_MS;
}

/** The wines a tap hit, once each, in ranking order (RM18). */
export function chooserOrder(hitIds: readonly string[], ranked: readonly RankedCandidate[]): RankedCandidate[] {
  const hit = new Set(hitIds);
  return ranked.filter((r) => hit.has(r.candidate.id));
}

/**
 * What one spot says (RM15): its label when it carries one (its best-ranked
 * uncapped wine with a number, "+n" for the others there); else its
 * best-ranked wine's own text, "+n" for the others at exactly that spot.
 * Null when no wine sits there.
 */
export function spotText(point: MapPoint, ranked: readonly RankedCandidate[]): string | null {
  const key = spotKey(point);
  const spot = labelledPositions(ranked).get(key);
  if (spot) return spot.text;
  const here = ranked.filter((r) => r.candidate.mapPoint !== null && spotKey(r.candidate.mapPoint) === key);
  return here.length === 0 ? null : dotText(here[0], here.length - 1);
}

/**
 * The hover tooltip (RM15): the text of the ONE spot under the pointer, the
 * same text its label has. The hover box (±HIT_SLOP_PX.fine) can catch dots of
 * neighbouring spots too (Pauillac and Saint-Julien a few px apart at z6), so
 * the spot is the hit nearest the pointer (`distance` measures a dot's point
 * on screen; a tie keeps the better-ranked), never a merge of every hit.
 */
export function hoverLabel(
  hitIds: readonly string[],
  ranked: readonly RankedCandidate[],
  distance: (point: MapPoint) => number,
): string | null {
  let nearest: MapPoint | null = null;
  let best = Infinity;
  for (const r of chooserOrder(hitIds, ranked)) {
    const p = r.candidate.mapPoint;
    if (!p) continue;
    const d = distance(p);
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return nearest ? spotText(nearest, ranked) : null;
}

/** The gap between the tooltip and the map box's edges, and above the pointer, px. */
const TOOLTIP_EDGE = 4;
const TOOLTIP_LIFT = 10;

/**
 * Where the hover tooltip's top-left corner goes inside the map box (RM15):
 * centred above the pointer, but clamped inside the box so a dot near an edge
 * never has its name or % cut off by the box's overflow clip; below the
 * pointer when there is no room above.
 */
export function tooltipPosition(
  pointer: { x: number; y: number },
  tip: { width: number; height: number },
  box: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(TOOLTIP_EDGE, box.width - tip.width - TOOLTIP_EDGE);
  const left = Math.min(Math.max(pointer.x - tip.width / 2, TOOLTIP_EDGE), maxLeft);
  const above = pointer.y - TOOLTIP_LIFT - tip.height;
  const top = above >= TOOLTIP_EDGE ? above : Math.min(pointer.y + TOOLTIP_LIFT, box.height - tip.height - TOOLTIP_EDGE);
  return { left, top: Math.max(TOOLTIP_EDGE, top) };
}

/** The typical wines with no dot at all (the legend's line, RM12). */
export function unmappedCandidates(candidates: readonly TrainingCandidate[]): TrainingCandidate[] {
  return candidates.filter((c) => c.mapPoint === null);
}

// --- MapLibre expressions: built once per landed theme, never per feature ------
// Written as plain arrays and cast once each: the style-spec's expression
// tuples cannot type an array built up in pieces. map-view.test.ts validates
// them with validateStyleMin instead.

const STATE = ["get", "state"];
const IS_CAPPED = ["==", STATE, "capped"];
const IS_NEUTRAL = ["==", STATE, "neutral"];
const IS_SELECTED = ["boolean", ["feature-state", "selected"], false];

/** A dot's radius at zoom 3..8 before the zoom scale: 4 px (heat ≤ 0.5) to 11 px (heat 1); rings 4, neutral 5. */
const BASE_RADIUS = ["case", IS_CAPPED, 4, IS_NEUTRAL, 5, ["interpolate", ["linear"], ["get", "heat"], 0.5, 4, 1, 11]];

/** ×0.85 at z3, ×1.2 at z8: zoom must be the top-level interpolate's input. */
function byZoom(inner: (scale: number) => unknown): unknown {
  return ["interpolate", ["linear"], ["zoom"], 3, inner(0.85), 8, inner(1.2)];
}

export const DOT_LAYOUT: CircleLayerSpecification["layout"] = {
  "circle-sort-key": ["get", "sort"],
};

/** The dots' paint in one palette (RM13, RM14): lightness and size carry heat, a capped wine is a hollow ring. */
export function dotPaint(palette: MapPalette): CircleLayerSpecification["paint"] {
  const { stops, capped, neutral, casing } = palette.heat;
  return {
    "circle-radius": byZoom((s) => ["*", BASE_RADIUS, s]),
    "circle-color": [
      "case",
      IS_CAPPED,
      capped,
      IS_NEUTRAL,
      neutral,
      [
        "interpolate",
        ["linear"],
        ["get", "heat"],
        HEAT_STOPS[0],
        stops[0],
        HEAT_STOPS[1],
        stops[1],
        HEAT_STOPS[2],
        stops[2],
        HEAT_STOPS[3],
        stops[3],
      ],
    ],
    "circle-opacity": ["case", IS_CAPPED, 0, 1],
    "circle-stroke-color": ["case", IS_SELECTED, palette.selectedRing, IS_CAPPED, capped, casing],
    "circle-stroke-width": ["case", IS_SELECTED, 2.5, IS_CAPPED, 1.5, 1],
  } as unknown as CircleLayerSpecification["paint"];
}

/** Labels (RM15): the top LABEL_COUNT always; the rest from LABEL_ALL_ZOOM, where they fit. */
export function labelLayout(): SymbolLayerSpecification["layout"] {
  const text = ["get", "label"];
  return {
    "text-field": ["step", ["zoom"], ["case", ["<=", ["get", "rank"], LABEL_COUNT], text, ""], LABEL_ALL_ZOOM, text],
    "text-size": LABEL_TEXT_SIZE,
    "text-variable-anchor": ["right", "left", "top", "bottom"],
    // The dot's radius plus 2 px, in ems of LABEL_TEXT_SIZE.
    "text-radial-offset": byZoom((s) => ["/", ["+", ["*", BASE_RADIUS, s], 2], LABEL_TEXT_SIZE]),
    "text-justify": "auto",
    "symbol-sort-key": ["get", "rank"],
  } as unknown as SymbolLayerSpecification["layout"];
}

/** Only a spot's carrier dot draws a label. */
export const LABEL_FILTER: SymbolLayerSpecification["filter"] = ["!=", ["get", "label"], ""];

export function labelPaint(palette: MapPalette): SymbolLayerSpecification["paint"] {
  return {
    "text-color": palette.label.text,
    "text-halo-color": palette.label.halo,
    "text-halo-width": 1.7,
  };
}
