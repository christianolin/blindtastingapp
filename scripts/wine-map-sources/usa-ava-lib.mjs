// Pure helpers for the USA map's UC Davis AVA data (spec 2026-09-29 §4, §5.3).
import { simplifyRing } from "./concave-engine.mjs";

export const KEPT_PROPERTIES = [
  "ava_id", "name", "aka", "state", "county", "within", "contains", "cfr_index", "valid_start",
];
// Present on every UC Davis feature we rely on; a missing one stops the run.
export const REQUIRED_UCD_PROPERTIES = ["ava_id", "name", "state", "county", "within", "contains", "cfr_index"];

export function splitList(value) {
  if (value === null || value === undefined) return [];
  return String(value).split("|").map((s) => s.trim()).filter(Boolean);
}

export function stateCodes(value, nameToCode = {}) {
  return splitList(value)
    .map((token) => {
      if (/^[A-Z]{2}$/.test(token)) return token;
      if (Object.hasOwn(nameToCode, token)) return nameToCode[token];
      throw new Error(`unknown state "${token}"`);
    })
    .sort();
}

export function isCurrent(props) {
  const end = props?.valid_end;
  return end === null || end === undefined || String(end).trim() === "";
}

export function trimProperties(props) {
  return Object.fromEntries(KEPT_PROPERTIES.map((k) => [k, props[k] ?? null]));
}

export function normalizeCfr(value) {
  const m = /9\.(\d+)/.exec(String(value ?? ""));
  return m ? `9.${Number(m[1])}` : null;
}

const stripAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Name identity for matching TTB, UC Davis and scoring rows: case, accents,
    punctuation and a trailing "AVA" do not count. */
export function foldAvaName(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\s+ava$/, "")
    .replace(/&/g, " and ")
    .replace(/[.,'’()]/g, " ")
    .replace(/[-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A key segment from a legal name (spec §4): "Sta. Rita Hills" -> sta-rita-hills. */
export function placeSlug(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\s+ava$/, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function closeRing(ring) {
  const r = ring.map(([x, y]) => [x, y]);
  const [f, l] = [r[0], r[r.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) r.push([f[0], f[1]]);
  return r;
}

/** Douglas-Peucker per ring (spec §5.3: 0.0001°, under the 12.2 m source
    accuracy), rounded; consecutive duplicates removed; a ring under 4 points is
    dropped, and a polygon whose outer ring collapses is dropped. */
export function simplifyGeometry(geometry, tolerance = 0.0001, decimals = 5) {
  const polygons =
    geometry?.type === "Polygon" ? [geometry.coordinates]
      : geometry?.type === "MultiPolygon" ? geometry.coordinates
        : null;
  if (!polygons) throw new Error(`unexpected geometry ${geometry?.type}`);
  const factor = 10 ** decimals;
  const round = (n) => Math.round(n * factor) / factor;
  const out = [];
  for (const polygon of polygons) {
    const rings = [];
    for (const [index, ring] of polygon.entries()) {
      const simplified = simplifyRing(closeRing(ring), tolerance);
      const rounded = [];
      for (const [x, y] of simplified) {
        const p = [round(x), round(y)];
        const prev = rounded[rounded.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) rounded.push(p);
      }
      const closed = rounded.length > 0 ? closeRing(rounded) : rounded;
      if (closed.length >= 4) rings.push(closed);
      else if (index === 0) { rings.length = 0; break; }
    }
    if (rings.length > 0) out.push(rings);
  }
  if (out.length === 0) throw new Error("geometry collapsed under simplification");
  return { type: "MultiPolygon", coordinates: out };
}
