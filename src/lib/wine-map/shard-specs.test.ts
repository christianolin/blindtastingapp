// Per-shard colour expressions must paint every feature exactly the colour the
// old catalogue-wide expression painted it. That is measured here, not argued:
// the old expression is copied below VERBATIM from tile-wine-map.tsx (as it
// stood at cd9acd5) as the oracle, and both are compiled and evaluated by
// MapLibre's own expression engine for every region in both palettes, every
// area slug of a realistic tree, every tint, classification, zoom band, ramp
// state and theme.
import { describe, expect, it } from "vitest";
import {
  createExpression,
  latest,
  type StyleExpression,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import type { Theme } from "../theme";
import { areaSlugsFromTree, paletteArms } from "./fill-palette";
import {
  classificationShades,
  MAP_PALETTES,
  SHADE_STEPS,
  shiftLightness,
  type MapPalette,
} from "./map-palette";
import * as specs from "./shard-specs";
import type { WinePlaceTreeNode } from "./tree";

// ---- The oracle: tile-wine-map.tsx at cd9acd5, verbatim ----------------------
const AREA_PALETTE_ZOOM = 8;
function regionMatchExpression(palette: MapPalette) {
  return [
    "match",
    ["get", "region"],
    ...Object.entries(palette.regions).flatMap(([key, color]) => [
      key,
      [
        "match",
        ["to-number", ["coalesce", ["get", "tint"], 2]],
        ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(color, step)]),
        color,
      ],
    ]),
    palette.fallback,
  ];
}
const REGION_MATCH: Record<Theme, unknown[]> = {
  light: regionMatchExpression(MAP_PALETTES.light),
  dark: regionMatchExpression(MAP_PALETTES.dark),
};
const classificationExpr = [
  "coalesce",
  ["get", "classification"],
  ["get", "level"],
  "",
];
const areaExpr = ["coalesce", ["get", "area_key"], ["get", "group"], ""];
function rampExpression(rampedRegions: string[]) {
  return rampedRegions.length
    ? ["match", ["coalesce", ["get", "region"], ""], rampedRegions, true, false]
    : false;
}
function paletteShadeExpression(color: string, palette: MapPalette) {
  const shades = classificationShades(color, palette);
  const tinted = [
    "match",
    ["to-number", ["coalesce", ["get", "tint"], 2]],
    ...SHADE_STEPS.flatMap((step, i) => [i, shiftLightness(shades.base, step)]),
    shades.base,
  ];
  return [
    "case",
    ["var", "ramp"],
    [
      "match",
      classificationExpr,
      "grand_cru",
      shades.grand_cru,
      "premier_cru",
      shades.premier_cru,
      tinted,
    ],
    tinted,
  ];
}
function fillColorExpression(areaSlugs: string[], rampedRegions: string[], theme: Theme) {
  const palette = MAP_PALETTES[theme];
  const regionMatch = REGION_MATCH[theme];
  const arms = paletteArms(areaSlugs, palette.districts.length);
  const present = palette.districts.map((_, i) => arms[i].length > 0);
  const paletteIndex = present.some(Boolean)
    ? [
        "match",
        areaExpr,
        ...arms.flatMap((slugs, i) => (slugs.length ? [slugs, i] : [])),
        -1,
      ]
    : -1;
  const areaMatch = present.some(Boolean)
    ? [
        "match",
        ["var", "pi"],
        ...palette.districts.flatMap((color, i) =>
          present[i] ? [i, paletteShadeExpression(color, palette)] : [],
        ),
        regionMatch,
      ]
    : regionMatch;
  return [
    "let",
    "pi",
    paletteIndex,
    "ramp",
    rampExpression(rampedRegions),
    ["step", ["zoom"], regionMatch, AREA_PALETTE_ZOOM, areaMatch],
  ] as unknown as string;
}
// ---- end of the oracle -------------------------------------------------------

const FILL_COLOR = latest.paint_fill["fill-color"] as StylePropertySpecification;

/** Compiles through the engine the tile worker runs; throws on a parse error
    exactly as addLayer({validate:false}) would. */
function compile(expression: unknown): StyleExpression {
  const compiled = createExpression(expression, FILL_COLOR);
  if (compiled.result !== "success") {
    throw new Error(compiled.value.map((error) => error.message).join("; "));
  }
  return compiled.value;
}

function colorAt(
  expression: StyleExpression,
  zoom: number,
  properties: Record<string, unknown>,
): string {
  return String(expression.evaluate({ zoom }, { type: 3, properties } as never));
}

function node(
  key: string,
  tier: number,
  children: WinePlaceTreeNode[] = [],
): WinePlaceTreeNode {
  return {
    id: `id-${key}`,
    key,
    name: key.split(".").at(-1) ?? key,
    kind: tier === 0 ? "COUNTRY" : tier === 1 ? "REGION" : "APPELLATION",
    tier,
    parent_key: key.includes(".") ? key.slice(0, key.lastIndexOf(".")) : null,
    has_children: children.length > 0,
    children,
  };
}

// The catalogue's real shapes: Burgundy's district → village → climat depth,
// Champagne's village keyed off the region but parented onto its sub-region,
// Bordeaux districts with appellations beneath, a Tuscan subzone, a region with
// no areas at all (Baden, which the palette does not name either), and a
// VERIFIED place whose parent is unpublished, so the tree makes it a root.
const TREE: WinePlaceTreeNode[] = [
  node("france", 0, [
    node("france.bourgogne", 1, [
      node("france.bourgogne.cote-de-nuits", 2, [
        node("france.bourgogne.cote-de-nuits.gevrey-chambertin", 3, [
          node("france.bourgogne.cote-de-nuits.gevrey-chambertin.chambertin", 4),
        ]),
        node("france.bourgogne.cote-de-nuits.vosne-romanee", 3, [
          node("france.bourgogne.cote-de-nuits.vosne-romanee.la-tache", 4),
        ]),
      ]),
      node("france.bourgogne.cote-de-beaune", 2, [
        node("france.bourgogne.cote-de-beaune.meursault", 3),
      ]),
    ]),
    node("france.champagne", 1, [
      node("france.champagne.montagne-de-reims", 2, [node("france.champagne.ay", 4)]),
    ]),
    node("france.bordeaux", 1, [
      node("france.bordeaux.medoc", 2, [
        node("france.bordeaux.medoc.pauillac", 3),
        node("france.bordeaux.medoc.margaux", 3),
      ]),
    ]),
  ]),
  node("germany", 0, [node("germany.baden", 1)]),
  node("italy", 0, [
    node("italy.toscana", 1, [
      node("italy.toscana.chianti", 2, [node("italy.toscana.chianti.chianti-classico", 3)]),
    ]),
  ]),
  node("france.bordeaux.graves.pessac-leognan", 3),
];

const THEMES: Theme[] = ["light", "dark"];
// Every region either palette names, plus Baden, which neither does.
const REGIONS = [
  ...new Set([
    ...Object.keys(MAP_PALETTES.light.regions),
    ...Object.keys(MAP_PALETTES.dark.regions),
    "baden",
  ]),
].sort();
const ALL_SLUGS = areaSlugsFromTree(TREE);
const BY_SHARD = specs.areaSlugsByShard(TREE);
const TINTS: (number | undefined)[] = [0, 1, 2, 3, 4, 5, undefined];
const CLASSES: Record<string, unknown>[] = [
  { classification: "grand_cru" },
  { classification: "premier_cru" },
  { classification: "communal" },
  // Tiles from before `classification` existed carry `level` only.
  { level: "grand_cru" },
  {},
];
const ZOOMS = [5, 7.99, 8, 10, 13];

/** Every feature shape a shard of `region` can carry: no area, an area the
    tree does not know (a newer tile release), and each of the shard's own
    slugs as `area_key` and as a bare `group` (older tiles). */
function featuresFor(region: string): Record<string, unknown>[] {
  const own = BY_SHARD[region] ?? [];
  const areas: Record<string, unknown>[] = [
    {},
    { area_key: "no-such-area" },
    ...own.map((slug) => ({ area_key: slug })),
    ...own.map((slug) => ({ group: slug })),
  ];
  const features: Record<string, unknown>[] = [];
  for (const area of areas) {
    for (const tint of TINTS) {
      for (const cls of CLASSES) {
        features.push({
          region,
          tier: 3,
          ...area,
          ...cls,
          ...(tint === undefined ? {} : { tint }),
        });
      }
    }
  }
  return features;
}

describe("shardColorExpression — parity with the catalogue-wide expression", () => {
  it("paints every feature of every region the same colour, in both themes, ramped or not", () => {
    const mismatches: string[] = [];
    let checks = 0;
    for (const theme of THEMES) {
      for (const ramp of [false, true]) {
        const oracle = compile(fillColorExpression(ALL_SLUGS, ramp ? REGIONS : [], theme));
        for (const region of REGIONS) {
          const shard = compile(
            specs.shardColorExpression({
              region,
              areaSlugs: BY_SHARD[region] ?? [],
              ramp,
              palette: MAP_PALETTES[theme],
            }),
          );
          for (const properties of featuresFor(region)) {
            for (const zoom of ZOOMS) {
              checks += 1;
              const want = colorAt(oracle, zoom, properties);
              const got = colorAt(shard, zoom, properties);
              if (want !== got && mismatches.length < 5) {
                mismatches.push(
                  `${theme} ramp=${ramp} z${zoom} ${JSON.stringify(properties)}: ${want} vs ${got}`,
                );
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
    // The sweep really ran: 65 regions x 4 theme/ramp states x 5 zooms x at
    // least 70 feature shapes each.
    expect(checks).toBeGreaterThan(90_000);
  });

  it("keeps a region the palette does not name FLAT, never tint-ramped", () => {
    // Today's region match falls through to the bare fallback for baden and
    // the five other German shards the palette does not name. A tinted
    // fallback would make those regions change colour at the world→shard
    // handoff.
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      expect(specs.regionHue("baden", palette)).toBe(palette.fallback);
      expect(specs.regionHue("constructor", palette)).toBe(palette.fallback);
      expect(specs.regionHue("bourgogne", palette)).toEqual([
        "match",
        ["to-number", ["coalesce", ["get", "tint"], specs.SHADE_TINT_FALLBACK]],
        ...SHADE_STEPS.flatMap((step, i) => [
          i,
          shiftLightness(palette.regions.bourgogne, step),
        ]),
        palette.regions.bourgogne,
      ]);
    }
  });

  it("is the region hue alone for a shard with no area slugs, and it compiles", () => {
    // baden, franken, navarra, wuerttemberg and saale-unstrut carry only their
    // region polygon; every shard is in this state before the tree loads. An
    // arm-less `match` would not compile (and under validate:false it throws).
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      for (const region of ["baden", "navarra"]) {
        const expression = specs.shardColorExpression({
          region,
          areaSlugs: [],
          ramp: true,
          palette,
        });
        expect(expression).toEqual(specs.regionHue(region, palette));
        expect(() => compile(expression)).not.toThrow();
      }
    }
  });

  it("never carries `undefined` (JSON round-trips unchanged)", () => {
    for (const region of REGIONS) {
      const expression = specs.shardColorExpression({
        region,
        areaSlugs: BY_SHARD[region] ?? [],
        ramp: true,
        palette: MAP_PALETTES.dark,
      });
      expect(JSON.parse(JSON.stringify(expression))).toEqual(expression);
    }
  });
});

describe("worldRegionColor", () => {
  it("is today's REGION_MATCH, byte for byte, and the same object on every call", () => {
    for (const theme of THEMES) {
      const palette = MAP_PALETTES[theme];
      expect(specs.worldRegionColor(palette)).toEqual(REGION_MATCH[theme]);
      expect(specs.worldRegionColor(palette)).toBe(specs.worldRegionColor(palette));
    }
  });

  it("paints world features exactly as the catalogue-wide expression did", () => {
    // The world archive carries countries (tier 0) and regions (tier 1), never
    // an area_key or group; tier-1 classification is null or "regional", so
    // neither the area palette nor the ramp ever applied there.
    const mismatches: string[] = [];
    for (const theme of THEMES) {
      const oracle = compile(fillColorExpression(ALL_SLUGS, REGIONS, theme));
      const world = compile(specs.worldRegionColor(MAP_PALETTES[theme]));
      for (const region of REGIONS) {
        for (const tier of [0, 1]) {
          for (const tint of TINTS) {
            for (const cls of [{}, { classification: "regional" }]) {
              const properties = {
                region,
                tier,
                ...cls,
                ...(tint === undefined ? {} : { tint }),
              };
              for (const zoom of ZOOMS) {
                if (colorAt(oracle, zoom, properties) !== colorAt(world, zoom, properties)) {
                  mismatches.push(`${theme} z${zoom} ${JSON.stringify(properties)}`);
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("areaSlugsByShard", () => {
  it("buckets every slug under the shard its place routes to", () => {
    expect(BY_SHARD.bourgogne).toEqual([
      "cote-de-beaune",
      "cote-de-nuits",
      "gevrey-chambertin",
      "meursault",
      "vosne-romanee",
    ]);
    // Aÿ is keyed off the region (group "ay") but parented onto its
    // sub-region, whose slug is its area.
    expect(BY_SHARD.champagne).toEqual(["ay", "montagne-de-reims"]);
    // The orphan root still lands in its own shard's bucket.
    expect(BY_SHARD.bordeaux).toEqual(["graves", "margaux", "medoc", "pauillac", "pessac-leognan"]);
    expect(BY_SHARD.toscana).toEqual(["chianti", "chianti-classico"]);
    // No areas, no entry: the map treats a missing shard as "no slugs".
    expect(BY_SHARD.baden).toBeUndefined();
  });

  it("loses nothing: the union of the buckets is areaSlugsFromTree", () => {
    const union = [...new Set(Object.values(BY_SHARD).flat())].sort();
    expect(union).toEqual(areaSlugsFromTree(TREE));
  });

  it("is empty for an empty tree", () => {
    expect(specs.areaSlugsByShard([])).toEqual({});
  });
});

describe("shard colour expression size", () => {
  // A realistic Bourgogne: its six districts, the Hautes-Côtes and 47 village
  // appellations, each its own area slug — the largest area list of any shard.
  const VILLAGES: Record<string, string[]> = {
    "cote-de-nuits": [
      "marsannay", "fixin", "gevrey-chambertin", "morey-saint-denis",
      "chambolle-musigny", "vougeot", "flagey-echezeaux", "vosne-romanee",
      "nuits-saint-georges", "hautes-cotes-de-nuits",
    ],
    "cote-de-beaune": [
      "ladoix", "aloxe-corton", "pernand-vergelesses", "savigny-les-beaune",
      "chorey-les-beaune", "beaune", "pommard", "volnay", "monthelie",
      "auxey-duresses", "meursault", "saint-romain", "puligny-montrachet",
      "chassagne-montrachet", "saint-aubin", "santenay", "maranges",
      "hautes-cotes-de-beaune",
    ],
    chablis: ["chablis", "petit-chablis"],
    "cote-chalonnaise": ["bouzeron", "rully", "mercurey", "givry", "montagny"],
    maconnais: [
      "pouilly-fuisse", "pouilly-vinzelles", "pouilly-loche", "saint-veran",
      "vire-clesse", "macon",
    ],
    "grand-auxerrois": [
      "irancy", "saint-bris", "chitry", "coulanges-la-vineuse", "epineuil",
      "tonnerre", "vezelay",
    ],
  };
  const BOURGOGNE = [
    node("france", 0, [
      node(
        "france.bourgogne",
        1,
        Object.entries(VILLAGES).map(([district, villages]) =>
          node(
            `france.bourgogne.${district}`,
            2,
            villages.map((village) => node(`france.bourgogne.${district}.${village}`, 3)),
          ),
        ),
      ),
    ]),
  ];

  it("stays under 8 KB for the largest shard, ramped, in both themes", () => {
    const slugs = specs.areaSlugsByShard(BOURGOGNE).bourgogne;
    expect(slugs.length).toBeGreaterThanOrEqual(50);
    for (const theme of THEMES) {
      const expression = specs.shardColorExpression({
        region: "bourgogne",
        areaSlugs: slugs,
        ramp: true,
        palette: MAP_PALETTES[theme],
      });
      expect(JSON.stringify(expression).length).toBeLessThan(8 * 1024);
    }
  });
});
