import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { districtHash } from "./fill-palette";
import {
  classificationShades,
  DARK_MATTER_LAND,
  DARK_MATTER_WATER,
  districtColor,
  MAP_PALETTES,
  POSITRON_LAND,
  POSITRON_WATER,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";

// The wine map's two fixed colour tables. The dark one was derived once,
// offline, from the light one (docs/superpowers/specs/2026-09-19-map-dark-mode.md
// §7.1) and frozen as literal hex; these cases are the floors that derivation
// was measured against, so a hand edit to one entry (the owner's lever for a
// hue that reads wrong) is still checked. Grounds are read from the Carto style
// JSONs in __fixtures__/carto-styles.json — see basemap.test.ts for how that
// fixture is regenerated.
//
// Contrast is WCAG 2.x; perceptual distance is OKLab ΔE. Helpers are local on
// purpose, as in src/lib/theme-contrast.test.ts.

const { light, dark } = MAP_PALETTES;

type TrimmedLayer = { id: string; paint?: Record<string, unknown> };
const FIXTURE = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/lib/wine-map/__fixtures__/carto-styles.json"), "utf8"),
) as {
  positron: { layers: TrimmedLayer[] };
  darkMatter: { layers: TrimmedLayer[] };
};

function rgb(hex: string): [number, number, number] {
  const h = hex.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`not a hex colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relative luminance, WCAG 2.x. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** A translucent fill composited over its ground: straight alpha in sRGB,
 *  which is what MapLibre's fill-opacity does. Hex in, hex out. */
function over(ink: string, alpha: number, ground: string): string {
  const [a, b] = [rgb(ink), rgb(ground)];
  return (
    "#" +
    a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("")
  );
}

function oklab(hex: string): [number, number, number] {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function deltaE(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Every area colour a palette can paint: region hues, district hues, fallback. */
function areaColors(p: MapPalette): string[] {
  return [...Object.values(p.regions), ...p.districts, p.fallback];
}

/** Every colour leaf of a palette (grandCruLegend is a word, not a colour). */
function colorLeaves(p: MapPalette): string[] {
  return [
    ...areaColors(p),
    p.selectedRing,
    p.selectedCasing,
    ...Object.values(p.label),
  ];
}

const layer = (layers: TrimmedLayer[], id: string) => {
  const found = layers.find((l) => l.id === id);
  if (!found) throw new Error(`fixture has no ${id} layer`);
  return found;
};
/** A fill colour that is either a plain colour or a legacy `{ stops }` function. */
function stopColors(value: unknown): string[] {
  if (typeof value === "string") return [value];
  const stops = (value as { stops: [number, string][] }).stops;
  return stops.map(([, color]) => color);
}

// Regions that share a border (or a coastline) on the map, where a too-close
// pair would read as one shape.
const NEIGHBOURS: [string, string][] = [
  ["bordeaux", "sud-ouest"], ["rhone", "provence"], ["bourgogne", "beaujolais"],
  ["languedoc-roussillon", "rhone"], ["languedoc-roussillon", "sud-ouest"],
  ["loire", "bordeaux"], ["champagne", "bourgogne"], ["alsace", "champagne"],
  ["jura", "savoie"], ["jura", "bourgogne"],
  ["la-rioja", "navarra"], ["la-rioja", "pais-vasco"], ["cataluna", "aragon"],
  ["valencia", "murcia"], ["castilla-y-leon", "galicia"],
  ["castilla-la-mancha", "valencia"], ["andalucia", "extremadura"],
  ["piemonte", "liguria"], ["piemonte", "lombardia"], ["toscana", "umbria"],
  ["veneto", "friuli"], ["emilia-romagna", "toscana"], ["campania", "lazio"],
  ["abruzzo", "marche"], ["sicilia", "calabria"], ["puglia", "basilicata"],
  ["mosel", "nahe"], ["mosel", "ahr"], ["pfalz", "rheinhessen"],
  ["bairrada", "dao"], ["douro", "minho"], ["alentejo", "peninsula-de-setubal"],
];

describe("the two map palettes are keyed alike", () => {
  it("has the same 64 region keys, 12 districts, label and classification keys", () => {
    expect(Object.keys(light.regions)).toHaveLength(64);
    expect(Object.keys(dark.regions).sort()).toEqual(Object.keys(light.regions).sort());
    // paletteArms(slugs, 12) keys both tables identically only if both have 12.
    expect(light.districts).toHaveLength(12);
    expect(dark.districts).toHaveLength(12);
    expect(Object.keys(dark.label).sort()).toEqual(Object.keys(light.label).sort());
    expect(Object.keys(dark.classification).sort()).toEqual(
      Object.keys(light.classification).sort(),
    );
  });

  it("uses only #rrggbb literals for every colour", () => {
    for (const p of [light, dark]) {
      for (const color of colorLeaves(p)) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("keeps every equality class the light table has, and adds none", () => {
    // france = spain = portugal (= fallback), murcia = madeira: the light table
    // shares those colours on purpose, so the dark one must too.
    const keys = Object.keys(light.regions);
    for (const a of keys) {
      for (const b of keys) {
        expect(dark.regions[a] === dark.regions[b], `${a} / ${b}`).toBe(
          light.regions[a] === light.regions[b],
        );
      }
    }
    expect(dark.fallback).toBe(dark.regions.france);
  });
});

describe("the light palette is the one the map always painted", () => {
  it("pins the moved values", () => {
    expect(light.regions.bordeaux).toBe("#5C1A2B");
    expect(light.regions.bourgogne).toBe("#1F4E5F");
    expect(light.regions.france).toBe("#6B6257");
    expect(light.districts[0]).toBe("#8C2D3C");
    expect(light.districts[11]).toBe("#6B4430");
    expect(light.fallback).toBe("#6B6257");
    expect(light.selectedRing).toBe("#B78E42");
    expect(light.selectedCasing).toBe("#FFFDF7");
    expect(light.label.text).toBe("#2b0f18");
    expect(light.label.halo).toBe("#FFFDF7");
    expect(light.classification).toEqual({ grandCru: [0.45, 0.3], premierCru: [0.68, 0.14] });
    expect(light.grandCruLegend).toBe("darkest");
  });

  it("derives the same shades the old in-component helpers did", () => {
    // Computed with the pre-move shiftLightness/shade from tile-wine-map.tsx.
    expect(SHADE_STEPS).toEqual([-0.3, -0.16, -0.04, 0.12, 0.28, 0.44]);
    expect(SHADE_STEPS.map((step) => shiftLightness("#5C1A2B", step))).toEqual([
      "#40121e", "#4d1624", "#581929", "#703544", "#8a5a66", "#a47f88",
    ]);
    expect(classificationShades("#8C2D3C", light)).toEqual({
      grand_cru: "#4b0812", premier_cru: "#681623", base: "#8C2D3C",
    });
    expect(classificationShades("#3B6E8C", light)).toEqual({
      grand_cru: "#0d354c", premier_cru: "#1f4d69", base: "#3B6E8C",
    });
  });
});

describe("the grounds are read from the Carto style JSON", () => {
  it("Dark Matter land is the background and every landcover/landuse stop", () => {
    const layers = FIXTURE.darkMatter.layers;
    const grounds = [
      layer(layers, "background").paint!["background-color"],
      ...stopColors(layer(layers, "landcover").paint!["fill-color"]),
      ...stopColors(layer(layers, "landuse").paint!["fill-color"]),
    ] as string[];
    expect(grounds.length).toBeGreaterThan(1);
    for (const g of grounds) expect(g.toLowerCase()).toBe(DARK_MATTER_LAND.toLowerCase());
    expect(
      (layer(layers, "water").paint!["fill-color"] as string).toLowerCase(),
    ).toBe(DARK_MATTER_WATER.toLowerCase());
  });

  it("Positron land is its background, and its water its water fill", () => {
    // Positron's landcover/landuse are translucent tints over the background,
    // not the ground itself, so only the background names the land colour.
    const layers = FIXTURE.positron.layers;
    expect(
      (layer(layers, "background").paint!["background-color"] as string).toLowerCase(),
    ).toBe(POSITRON_LAND.toLowerCase());
    expect(
      (layer(layers, "water").paint!["fill-color"] as string).toLowerCase(),
    ).toBe(POSITRON_WATER.toLowerCase());
  });
});

describe("the dark palette reads on Dark Matter", () => {
  it("every base colour clears 4.5:1 against the land", () => {
    for (const color of areaColors(dark)) {
      expect(contrast(color, DARK_MATTER_LAND), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every tint of the shared SHADE_STEPS ramp clears 3:1 against the land", () => {
    for (const color of areaColors(dark)) {
      for (const step of SHADE_STEPS) {
        const tint = shiftLightness(color, step);
        expect(contrast(tint, DARK_MATTER_LAND), `${color} ${step}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("a 30% wash is still visible on the land (light's own worst on Positron is 1.29)", () => {
    for (const color of areaColors(dark)) {
      const wash = over(color, 0.3, DARK_MATTER_LAND);
      expect(contrast(wash, DARK_MATTER_LAND), color).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("no wash is mistaken for water (light's own worst on Positron is 0.012)", () => {
    for (const color of areaColors(dark)) {
      for (const alpha of [0.16, 0.32, 0.5]) {
        const wash = over(color, alpha, DARK_MATTER_LAND);
        expect(deltaE(wash, DARK_MATTER_WATER), `${color} @${alpha}`).toBeGreaterThanOrEqual(0.02);
      }
    }
  });

  it("neighbouring regions stay distinct (light's own closest pair is 0.052)", () => {
    for (const [a, b] of NEIGHBOURS) {
      expect(dark.regions[a], a).toBeDefined();
      expect(dark.regions[b], b).toBeDefined();
      expect(deltaE(dark.regions[a], dark.regions[b]), `${a} / ${b}`).toBeGreaterThanOrEqual(0.05);
    }
  });
});

describe("classification reads as intensity in both themes", () => {
  // Opacities from buildFillPaint at z9 with the ramp on: grand, premier, base.
  const ALPHA = { grand: 0.65, premier: 0.45, base: 0.18 };

  it("dark: grand cru brightest, each step clearly apart, every shade readable", () => {
    for (const color of dark.districts) {
      const shades = classificationShades(color, dark);
      for (const s of [shades.grand_cru, shades.premier_cru, shades.base]) {
        expect(contrast(s, DARK_MATTER_LAND), `${color} ${s}`).toBeGreaterThanOrEqual(4.5);
      }
      const g = over(shades.grand_cru, ALPHA.grand, DARK_MATTER_LAND);
      const p = over(shades.premier_cru, ALPHA.premier, DARK_MATTER_LAND);
      const b = over(shades.base, ALPHA.base, DARK_MATTER_LAND);
      expect(luminance(g), color).toBeGreaterThan(luminance(p));
      expect(luminance(p), color).toBeGreaterThan(luminance(b));
      expect(contrast(g, p), `${color} grand/premier`).toBeGreaterThanOrEqual(1.6);
      expect(contrast(p, b), `${color} premier/base`).toBeGreaterThanOrEqual(1.6);
    }
    expect(dark.grandCruLegend).toBe("brightest");
  });

  it("light: grand cru darkest (the direction the dark palette inverts)", () => {
    for (const color of light.districts) {
      const shades = classificationShades(color, light);
      const g = over(shades.grand_cru, ALPHA.grand, POSITRON_LAND);
      const p = over(shades.premier_cru, ALPHA.premier, POSITRON_LAND);
      const b = over(shades.base, ALPHA.base, POSITRON_LAND);
      expect(luminance(g), color).toBeLessThan(luminance(p));
      expect(luminance(p), color).toBeLessThan(luminance(b));
    }
  });
});

describe("selection and labels in dark", () => {
  it("the gold ring stands out from the land and from its own casing", () => {
    expect(contrast(dark.selectedRing, DARK_MATTER_LAND)).toBeGreaterThanOrEqual(7);
    expect(contrast(dark.selectedRing, dark.selectedCasing)).toBeGreaterThanOrEqual(7);
  });

  it("label tiers stay readable on their halo, and the halo reads as ground", () => {
    const { text, selected, related, distant, halo } = dark.label;
    expect(contrast(text, halo)).toBeGreaterThanOrEqual(7);
    expect(contrast(selected, halo)).toBeGreaterThanOrEqual(7);
    expect(contrast(over(related, 0.95, halo), halo)).toBeGreaterThanOrEqual(7);
    expect(contrast(over(distant, 0.8, halo), halo)).toBeGreaterThanOrEqual(3);
    expect(contrast(halo, DARK_MATTER_LAND)).toBeLessThanOrEqual(1.2);
  });
});

describe("districtColor", () => {
  it("indexes each palette's own table by the shared slug hash", () => {
    for (const p of [light, dark]) {
      for (const slug of ["cote-de-nuits", "medoc", "gevrey-chambertin", "graves", "x"]) {
        expect(districtColor(slug, p)).toBe(p.districts[districtHash(slug) % 12]);
      }
    }
  });
});
