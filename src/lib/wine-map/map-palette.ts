// The wine map's two fixed colour tables, one per app theme, and the helpers
// that derive shades from them. MapLibre paint expressions cannot read CSS
// variables, so every colour the map canvas draws is a literal hex here.
//
// Both tables are keyed exactly alike — region slug -> hex, and
// districtHash(slug) % 12 -> hex — and nothing is ever computed per feature:
// the map builds its expressions from whichever table is current (see
// tile-wine-map.tsx), so a theme flip rewrites each colour paint once and
// nothing else. Change both tables together; map-palette.test.ts holds the
// floors each must clear.
//
// The light table is the one the map has always painted, moved here verbatim.
// The dark table was derived from it ONCE, offline, by one rule, then frozen
// as literal hex (docs/superpowers/specs/2026-09-19-map-dark-mode.md §7.1):
// in OKLCH, L' = 0.72 + 0.4·(L − 0.53), C' = 1.1·C, reducing chroma in 2%
// steps until in the sRGB gamut, hue unchanged. That keeps each key's hue
// family (Bordeaux claret vs Sud-Ouest amber, Rhône rust vs Provence
// olive-gold) and lifts every colour into L 0.64–0.79, where it reads as a line
// and as a wash on Dark Matter's black. Only the table ships, not the rule: to
// adjust a hue that reads wrong, edit that one entry and re-run the tests.
import type { Theme } from "../theme";
import { districtHash } from "./fill-palette";

export type ClassificationStep = readonly [lightness: number, saturation: number];

export type MapPalette = {
  /** Region slug (the `region` tile property) -> hue. */
  regions: Readonly<Record<string, string>>;
  /** Any region the table does not name. */
  fallback: string;
  /** Area hues from AREA_PALETTE_ZOOM, indexed by districtHash(slug) % 12. */
  districts: readonly string[];
  /** shade() parameters for the classification ramp. */
  classification: { grandCru: ClassificationStep; premierCru: ClassificationStep };
  /** How the legend describes grand cru: the ramp runs toward the ground's
      opposite, so darker on Positron and brighter on Dark Matter. */
  grandCruLegend: "darkest" | "brightest";
  /** The selection's gold line. */
  selectedRing: string;
  /** The keyline under it (drawn at 0.85 opacity, 5px). */
  selectedCasing: string;
  label: {
    /** Every label when nothing is selected. */
    text: string;
    selected: string;
    /** Children, siblings and the parent of the selection (at 0.95 opacity). */
    related: string;
    /** Everything else while something is selected (at 0.8 opacity). */
    distant: string;
    halo: string;
  };
};

// The grounds each table was measured against, read from the Carto style JSONs
// (map-palette.test.ts checks them against __fixtures__/carto-styles.json).
/** Dark Matter's `background` and every `landcover`/`landuse` stop. */
export const DARK_MATTER_LAND = "#0e0e0e";
/** Dark Matter's `water` fill. */
export const DARK_MATTER_WATER = "#2C353C";
/** Positron's `background`. */
export const POSITRON_LAND = "#fafaf8";
/** Positron's `water` fill. */
export const POSITRON_WATER = "#d4dadc";

// Deterministic colour per region (canonical-key segment carried as the
// `region` tile property). Every live region is named — the fallback used to
// equal Bordeaux's claret, which painted Sud-Ouest/Beaujolais/Jura/etc. the
// identical maroon (owner: "Sud-Ouest and Bordeaux are too similar").
// Neighbouring regions get contrasting hue families: Bordeaux claret vs
// Sud-Ouest amber, Rhône rust vs Provence olive-gold, Bourgogne petrol vs
// Beaujolais plum.
const LIGHT_REGIONS: Record<string, string> = {
  france: "#6B6257",
  alsace: "#44548C",
  beaujolais: "#9A4E7A",
  bordeaux: "#5C1A2B",
  bourgogne: "#1F4E5F",
  champagne: "#8A6D3B",
  corse: "#A34D2B",
  jura: "#7A4E8C",
  "languedoc-roussillon": "#2F7A78",
  loire: "#2F6B4F",
  piemonte: "#7B2233",
  provence: "#9A6A2F",
  rhone: "#7A3B2E",
  savoie: "#5C7A3B",
  "sud-ouest": "#B0722C",
  toscana: "#C0872E",
  // Spain: the country outline is neutral context (like France's); each
  // comunidad shard gets its own hue as its DO wave ships (the comunidad REGION
  // node carries a region-overview boundary = union of its DOs' municipios).
  spain: "#6B6257",
  "castilla-y-leon": "#A8324A",
  cataluna: "#B5642A",
  aragon: "#6E7A34",
  murcia: "#8C3E7A",
  andalucia: "#C99A2E",
  galicia: "#2E7A5C",
  valencia: "#C0503A",
  "castilla-la-mancha": "#A6842E",
  navarra: "#9A4E3A",
  extremadura: "#6E8C5A",
  "la-rioja": "#8C2F39",
  "pais-vasco": "#4E6E8C",
  baleares: "#2E9AA6",
  madrid: "#9A6A4E",
  asturias: "#3E7A6E",
  "trentino-alto-adige": "#3A6E8C",
  veneto: "#4E8A5C",
  sicilia: "#C25A2C",
  lombardia: "#6E4E8C",
  friuli: "#B0507A",
  "emilia-romagna": "#8C2F5E",
  campania: "#2E8C86",
  puglia: "#A65A2E",
  umbria: "#6E8C3A",
  abruzzo: "#7A3B5C",
  marche: "#B03A5E",
  lazio: "#3E5EA0",
  sardegna: "#1F8A8A",
  liguria: "#3E8AA0",
  calabria: "#A03A2E",
  basilicata: "#6E5AA0",
  "valle-d-aosta": "#8AA83E",
  molise: "#A0633E",
  // Germany — Anbaugebiete.
  mosel: "#4E8C6E",
  rheinhessen: "#9A5C2E",
  pfalz: "#8C6E2E",
  nahe: "#5C6E9A",
  ahr: "#A83E4E",
  mittelrhein: "#3E8C9A",
  // Portugal. Neighbouring regions run down the country in order, so the hues
  // alternate warm/cool: Minho green, Douro slate-blue, Bairrada and Dão
  // (which touch) copper vs moss, Setúbal teal, Alentejo terracotta.
  portugal: "#6B6257",
  minho: "#3E8C5E",
  douro: "#2E5C8C",
  dao: "#6E8C3E",
  bairrada: "#B06A2E",
  "peninsula-de-setubal": "#2E8C9A",
  alentejo: "#B04A2E",
  madeira: "#8C3E7A",
};

// The light table lifted by the §7.1 rule: same keys, same order, same
// equality classes (france = spain = portugal = fallback, murcia = madeira).
// Bordeaux lands on a dusty claret — #5C1A2B is 1.5:1 on black — while the
// UI's own bordeaux --primary is untouched. Beaujolais, friuli, marche and
// emilia-romagna lift into pinks; if they read as hot pink, lower only those
// entries' chroma.
const DARK_REGIONS: Record<string, string> = {
  france: "#AA9F92",
  alsace: "#8398DC",
  beaujolais: "#DD83B5",
  bordeaux: "#C36F7F",
  bourgogne: "#699DB2",
  champagne: "#C4A269",
  corse: "#EA845E",
  jura: "#BD89D3",
  "languedoc-roussillon": "#63B5B2",
  loire: "#6CAF8D",
  piemonte: "#DA6E7C",
  provence: "#D49C5B",
  rhone: "#CF8170",
  savoie: "#90B36B",
  "sud-ouest": "#E49C50",
  toscana: "#E8A746",
  spain: "#AA9F92",
  "castilla-y-leon": "#F76D83",
  cataluna: "#EF9152",
  aragon: "#A2B162",
  murcia: "#D77ABF",
  andalucia: "#E7B23A",
  galicia: "#64B793",
  valencia: "#FE7F65",
  "castilla-la-mancha": "#D2AC4D",
  navarra: "#E1876F",
  extremadura: "#97BA81",
  "la-rioja": "#E3737A",
  "pais-vasco": "#83A8CC",
  baleares: "#50C4D2",
  madrid: "#D39B7A",
  asturias: "#71B5A6",
  "trentino-alto-adige": "#70ABCF",
  veneto: "#79BD88",
  sicilia: "#FE8553",
  lombardia: "#B18CD6",
  friuli: "#EF7FAE",
  "emilia-romagna": "#E071A4",
  campania: "#59BFB8",
  puglia: "#E78D5C",
  umbria: "#98BC5F",
  abruzzo: "#CB7EA4",
  marche: "#F97095",
  lazio: "#779EED",
  sardegna: "#4FBEBE",
  liguria: "#66BAD4",
  calabria: "#EF7766",
  basilicata: "#A993E6",
  "valle-d-aosta": "#A6C851",
  molise: "#DD956A",
  mosel: "#77BE9B",
  rheinhessen: "#DB925E",
  pfalz: "#C5A25B",
  nahe: "#8FA5D9",
  ahr: "#F37685",
  mittelrhein: "#65BCCC",
  portugal: "#AA9F92",
  minho: "#69C08A",
  douro: "#6BA1DB",
  dao: "#98BB63",
  bairrada: "#E89655",
  "peninsula-de-setubal": "#58BDCD",
  alentejo: "#F67E5E",
  madeira: "#D77ABF",
};

export const MAP_PALETTES: Record<Theme, MapPalette> = {
  light: {
    regions: LIGHT_REGIONS,
    fallback: "#6B6257",
    // Curated palette for district colouring; slug-hashed (districtHash in
    // fill-palette) so a group keeps its colour across sessions and
    // republish cycles, and the fill expression's palette arms and the legend
    // swatches cannot drift apart.
    districts: [
      "#8C2D3C", "#3E6B54", "#4A5D8C", "#9A6A2F", "#5C7A3B", "#7A4E8C",
      "#2F7A78", "#A34D2B", "#5B4A8C", "#3B6E8C", "#8C6D3B", "#6B4430",
    ],
    // Owner: the previous 0.52/0.74 steps read too alike at wash opacity —
    // grand cru drops to 45% lightness with a strong saturation push, premier
    // cru sits clearly between it and the plain village hue.
    classification: { grandCru: [0.45, 0.3], premierCru: [0.68, 0.14] },
    grandCruLegend: "darkest",
    selectedRing: "#B78E42",
    selectedCasing: "#FFFDF7",
    label: {
      text: "#2b0f18",
      selected: "#1d0a11",
      related: "#3a2830",
      distant: "#7a666f",
      halo: "#FFFDF7",
    },
  },
  dark: {
    regions: DARK_REGIONS,
    fallback: "#AA9F92",
    districts: [
      "#E3717E", "#79AD91", "#869ED6", "#D49C5B", "#90B36B", "#BD89D3",
      "#63B5B2", "#EA845E", "#9F8DDD", "#71ABCE", "#C6A168", "#BC8B73",
    ],
    // On a black ground, darkening grand cru sinks it into the land: with the
    // light parameters adjacent classes composite to 1.00:1 and 1.02:1. Here
    // the ramp runs the other way — grand cru the brightest, most saturated
    // shade — which separates the classes as well as light does on Positron.
    classification: { grandCru: [1.2, 0.2], premierCru: [1.08, 0.1] },
    grandCruLegend: "brightest",
    // The app's dark --gold; light keeps its --gold-deep.
    selectedRing: "#D4AF6A",
    // A warm near-black keyline, the mirror of light's cream: it cuts the ring
    // out of the fills rather than glowing around it.
    selectedCasing: "#120E0C",
    label: {
      text: "#F5EFE3",
      selected: "#FFF8EC",
      related: "#E6DCCD",
      // Still the quiet tier: 4.03:1 on its halo (light's is 3.47:1).
      distant: "#978A7D",
      halo: "#120E0C",
    },
  },
};

// One hue per region is right when you're looking at regions, but at vineyard
// zoom it means a dozen neighbouring sites render as one indistinguishable
// block of colour. Each place carries a stable `tint` (0..5, hashed from its
// canonical key in the tile build), and we spread those across a lightness
// ramp of the region's own colour — so adjacent shapes separate, while the
// whole region still reads as one family. Stable hash => a place keeps its
// shade across rebuilds.
// Widened after seeing it rendered: at wash opacity the first pass was too
// subtle to read as distinct shapes. Adjacent steps must be separable at ~40%
// fill opacity, which needs a bigger spread than it does at full strength.
// Shared by both themes: on Dark Matter adjacent steps separate about twice as
// well as they do on Positron, so dark needs no ramp of its own.
export const SHADE_STEPS = [-0.3, -0.16, -0.04, 0.12, 0.28, 0.44] as const;

/** Shift a hex colour's lightness by `amount` (-1..1). Used to derive a small
    family of shades from each region colour. */
export function shiftLightness(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)),
  );
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

/** Scale a hex colour's HSL lightness and push its saturation. Shades are
    computed here in JS because MapLibre expressions cannot manipulate colours. */
export function shade(hex: string, lightness: number, saturation = 0): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l2 = Math.max(0, Math.min(1, l * lightness));
  const s2 = Math.max(0, Math.min(1, s + saturation));
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const [r2, g2, b2] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

/** Classification reads as INTENSITY of the area hue (vineyard-atlas style):
    grand cru the strongest shade, premier cru a step toward the plain hue,
    village land the plain hue. "Strongest" runs away from the ground — darker
    on Positron, brighter on Dark Matter — per the palette's parameters.
    Called while an expression is built, never per feature. */
export function classificationShades(hex: string, palette: MapPalette) {
  const { grandCru, premierCru } = palette.classification;
  return {
    grand_cru: shade(hex, grandCru[0], grandCru[1]),
    premier_cru: shade(hex, premierCru[0], premierCru[1]),
    base: hex,
  };
}

/** The area hue a slug paints in this palette: the same hash, and so the same
    index, in both themes. */
export function districtColor(slug: string, palette: MapPalette): string {
  return palette.districts[districtHash(slug) % palette.districts.length];
}
