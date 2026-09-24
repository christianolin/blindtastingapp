// The specs ShardController adds with {validate:false}. MapLibre no longer
// validates them at runtime (that validation was the whole-style serialize
// behind the first-zoom freeze), so this file is the validation: every shard
// of a real manifest, in both themes, ramped or not, with and without a known
// country, fills on and off, has to pass validateStyleMin — the same check
// basemap.test.ts runs over a swapped basemap.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  diff,
  featureFilter,
  validateStyleMin,
  type LayerSpecification,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { tuneBasemapStyle, withWineLayers, WORLD_SOURCE_ID } from "./basemap";
import { MAP_PALETTES } from "./map-palette";
import { deepStateName } from "./map-state";
import {
  selectedLabelLayout,
  selectedLabelPaint,
  selectedPlaceFilter,
  selectionCasingPaint,
  selectionRingPaint,
  shardColorExpression,
  shardFilter,
  shardLayerIds,
  shardLayerSpecs,
  shardOverlayIds,
  shardOverlaySpecs,
  staticFillPaint,
  staticLabelLayout,
  staticLabelPaint,
  staticOutlinePaint,
  type ShardSpecInputs,
} from "./shard-specs";

// Every shard of release 20260916T213650Z, and the country the place tree puts
// it in (tree roots are countries, their children the regions).
const SHARD_COUNTRY: Record<string, string> = {
  abruzzo: "italy", ahr: "germany", alentejo: "portugal", alsace: "france",
  andalucia: "spain", aragon: "spain", asturias: "spain", baden: "germany",
  bairrada: "portugal", baleares: "spain", basilicata: "italy", beaujolais: "france",
  bordeaux: "france", bourgogne: "france", calabria: "italy", campania: "italy",
  "castilla-la-mancha": "spain", "castilla-y-leon": "spain", cataluna: "spain",
  champagne: "france", corse: "france", dao: "portugal", douro: "portugal",
  "emilia-romagna": "italy", extremadura: "spain", franken: "germany", friuli: "italy",
  galicia: "spain", "hessische-bergstrasse": "germany", jura: "france",
  "la-rioja": "spain", "languedoc-roussillon": "france", lazio: "italy",
  liguria: "italy", loire: "france", lombardia: "italy", madeira: "portugal",
  madrid: "spain", marche: "italy", minho: "portugal", mittelrhein: "germany",
  molise: "italy", mosel: "germany", murcia: "spain", nahe: "germany",
  navarra: "spain", "pais-vasco": "spain", "peninsula-de-setubal": "portugal",
  pfalz: "germany", piemonte: "italy", provence: "france", puglia: "italy",
  rheingau: "germany", rheinhessen: "germany", rhone: "france",
  "saale-unstrut": "germany", sardegna: "italy", savoie: "france", sicilia: "italy",
  "sud-ouest": "france", toscana: "italy", "trentino-alto-adige": "italy",
  umbria: "italy", valencia: "spain", "valle-d-aosta": "italy", veneto: "italy",
  wuerttemberg: "germany",
};
const SHARDS = Object.keys(SHARD_COUNTRY).sort();
const url = (key: string) =>
  `https://tiles.test/wine-map-tiles/tiles/releases/20260916T213650Z/${key}.pmtiles`;

// Realistic per-shard area slugs: a dozen district/village slugs each, with
// Bourgogne's real ones, so the palette `match` has several arms (and the
// duplicate-label check in validation has something to catch).
function slugsFor(key: string): string[] {
  if (key === "bourgogne") {
    return [
      "chablis", "cote-chalonnaise", "cote-de-beaune", "cote-de-nuits", "grand-auxerrois",
      "maconnais", "vosne-romanee", "gevrey-chambertin", "meursault", "pommard",
    ];
  }
  return Array.from({ length: 12 }, (_, i) => `${key}-area-${i}`);
}

function inputs(key: string, over: Partial<ShardSpecInputs> = {}): ShardSpecInputs {
  return {
    country: SHARD_COUNTRY[key] ?? null,
    areaSlugs: slugsFor(key),
    ramp: false,
    palette: MAP_PALETTES.light,
    fillsVisible: true,
    ...over,
  };
}

function styleOf(sources: Record<string, unknown>, layers: unknown[]): StyleSpecification {
  return { version: 8, sources, layers } as unknown as StyleSpecification;
}

describe("shardLayerSpecs", () => {
  it("1. keeps every id the JSX mounted, in fills, outlines, labels order", () => {
    const specs = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne"));
    expect(specs.sourceId).toBe("wine-shard-bourgogne");
    expect(specs.source).toEqual({
      type: "vector",
      url: `pmtiles://${url("bourgogne")}`,
      promoteId: "key",
    });
    expect(specs.layers.map((l) => [l.id, l.type, (l as { "source-layer"?: string })["source-layer"]]))
      .toEqual([
        ["shard-fills-bourgogne", "fill", "places"],
        ["shard-outlines-bourgogne", "line", "places"],
        ["shard-labels-bourgogne", "symbol", "labels"],
      ]);
    for (const layer of specs.layers) {
      expect((layer as { source?: string }).source).toBe("wine-shard-bourgogne");
    }
    expect(shardLayerIds("bourgogne")).toEqual({
      fills: "shard-fills-bourgogne",
      outlines: "shard-outlines-bourgogne",
      labels: "shard-labels-bourgogne",
    });
  });

  it("2. builds each layer from the shared static builders, with no world handoff", () => {
    const i = inputs("bourgogne", { ramp: true, palette: MAP_PALETTES.dark });
    const color = shardColorExpression({ region: "bourgogne", areaSlugs: i.areaSlugs, ramp: true, palette: i.palette });
    const [fills, outlines, labels] = shardLayerSpecs("bourgogne", url("bourgogne"), i).layers as {
      paint?: unknown; layout?: unknown; filter?: unknown;
    }[];
    expect(fills.paint).toEqual(staticFillPaint({ color, ramp: true, worldHandoff: false }));
    expect(outlines.paint).toEqual(staticOutlinePaint({ color, worldHandoff: false }));
    expect(labels.layout).toEqual(staticLabelLayout());
    expect(labels.paint).toEqual(staticLabelPaint({ palette: MAP_PALETTES.dark, worldHandoff: false }));
    for (const layer of [fills, outlines, labels]) expect(layer.filter).toEqual(shardFilter("france"));
  });

  it("3. an unknown country gets no depth term: full depth, as before the tree", () => {
    const known = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne")).layers[0] as { filter: unknown };
    const unknown = shardLayerSpecs("bourgogne", url("bourgogne"), inputs("bourgogne", { country: null }))
      .layers[0] as { filter: unknown };
    expect(unknown.filter).toEqual(shardFilter(null));
    const village = { type: 1, properties: { key: "france.bourgogne.cote-de-nuits.vosne-romanee", tier: 3 } };
    const region = { type: 1, properties: { key: "france.bourgogne", tier: 1 } };
    const run = (filter: unknown, state: Record<string, unknown>, feature: unknown) =>
      featureFilter(filter as never, state).filter({ zoom: 12 }, feature as never);
    // Unknown country: every tier renders whatever the global state says.
    expect(run(unknown.filter, {}, village)).toBe(true);
    // Known country: tier >= 2 only while that country's deep flag is on.
    expect(run(known.filter, {}, village)).toBe(false);
    expect(run(known.filter, {}, region)).toBe(true);
    expect(run(known.filter, { [deepStateName("france")]: true }, village)).toBe(true);
    expect(run(known.filter, { [deepStateName("italy")]: true }, village)).toBe(false);
  });

  it("4. hides fills through layout.visibility, never by leaving layout out", () => {
    const shown = shardLayerSpecs("alsace", url("alsace"), inputs("alsace")).layers;
    const hidden = shardLayerSpecs("alsace", url("alsace"), inputs("alsace", { fillsVisible: false })).layers;
    expect((shown[0] as { layout?: unknown }).layout).toEqual({ visibility: "visible" });
    expect((hidden[0] as { layout?: unknown }).layout).toEqual({ visibility: "none" });
    // Outlines and labels stay visible either way: ?debugFills=off drops fills only.
    for (const layer of hidden.slice(1)) {
      expect((layer as { layout?: { visibility?: string } }).layout?.visibility).not.toBe("none");
    }
  });

  it("5. returns a fresh, fully independent object tree on every call", () => {
    const i = inputs("bourgogne", { ramp: true });
    const a = shardLayerSpecs("bourgogne", url("bourgogne"), i);
    const b = shardLayerSpecs("bourgogne", url("bourgogne"), i);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.source).not.toBe(b.source);
    a.layers.forEach((layer, n) => {
      const other = b.layers[n] as Record<string, unknown>;
      const self = layer as Record<string, unknown>;
      expect(self).not.toBe(other);
      for (const part of ["paint", "layout", "filter"]) {
        if (self[part] !== undefined) expect(self[part]).not.toBe(other[part]);
      }
    });
    // Deep: scribbling over every nested array of one result leaves the next
    // call's untouched, so no builder constant is shared with a live layer.
    const scribble = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(scribble);
        value.push("scribbled");
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(scribble);
      }
    };
    scribble(a);
    expect(JSON.stringify(shardLayerSpecs("bourgogne", url("bourgogne"), i))).toBe(JSON.stringify(b));
  });

  it("6. every shard of the manifest validates, both themes, ramp, country and fills either way", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const ramp of [false, true]) {
        for (const treeLoaded of [true, false]) {
          for (const fillsVisible of [true, false]) {
            const sources: Record<string, unknown> = {};
            const layers: unknown[] = [];
            for (const key of SHARDS) {
              const specs = shardLayerSpecs(key, url(key), {
                // No tree: no country and no area slugs, which is also what a
                // shard newer than the loaded tree gets.
                country: treeLoaded ? SHARD_COUNTRY[key] : null,
                areaSlugs: treeLoaded ? slugsFor(key) : [],
                ramp,
                palette: MAP_PALETTES[theme],
                fillsVisible,
              });
              sources[specs.sourceId] = specs.source;
              layers.push(...specs.layers, ...shardOverlaySpecs(key, MAP_PALETTES[theme]));
            }
            const errors = validateStyleMin(styleOf(sources, layers));
            expect(errors, `${theme} ramp=${ramp} tree=${treeLoaded} fills=${fillsVisible}`).toEqual([]);
          }
        }
      }
    }
  });
});

describe("shardOverlaySpecs", () => {
  it("7. casing, ring and selected label on the shard's own source, in that order", () => {
    const overlays = shardOverlaySpecs("bourgogne", MAP_PALETTES.light);
    expect(overlays.map((l) => [l.id, l.type, (l as { "source-layer"?: string })["source-layer"]]))
      .toEqual([
        ["shard-selected-casing-bourgogne", "line", "places"],
        ["shard-selected-ring-bourgogne", "line", "places"],
        ["shard-selected-label-bourgogne", "symbol", "labels"],
      ]);
    expect(shardOverlayIds("bourgogne")).toEqual({
      casing: "shard-selected-casing-bourgogne",
      ring: "shard-selected-ring-bourgogne",
      label: "shard-selected-label-bourgogne",
    });
    for (const layer of overlays) {
      expect((layer as { source?: string }).source).toBe("wine-shard-bourgogne");
      expect((layer as { filter?: unknown }).filter).toEqual(selectedPlaceFilter());
    }
  });

  it("8. paints the ring and the label from the palette it is given", () => {
    for (const theme of ["light", "dark"] as const) {
      const palette = MAP_PALETTES[theme];
      const [casing, ring, label] = shardOverlaySpecs("mosel", palette) as {
        paint?: unknown; layout?: unknown;
      }[];
      expect(casing.paint).toEqual({ "line-color": palette.selectedCasing, "line-width": 5, "line-opacity": 0.85 });
      expect(casing.paint).toEqual(selectionCasingPaint(palette));
      expect(ring.paint).toEqual({ "line-color": palette.selectedRing, "line-width": 2.5 });
      expect(ring.paint).toEqual(selectionRingPaint(palette));
      expect(label.layout).toEqual(selectedLabelLayout());
      expect(label.paint).toEqual(selectedLabelPaint({ palette, worldHandoff: false }));
    }
  });

  it("9. fresh objects per call", () => {
    const a = shardOverlaySpecs("mosel", MAP_PALETTES.light);
    const b = shardOverlaySpecs("mosel", MAP_PALETTES.light);
    expect(a).toEqual(b);
    a.forEach((layer, n) => {
      expect(layer).not.toBe(b[n]);
      expect((layer as { filter?: unknown }).filter).not.toBe((b[n] as { filter?: unknown }).filter);
    });
  });
});

describe("a theme swap", () => {
  it("10. carries the controller's shards and overlays across untouched, in the order it left them", () => {
    // After a theme diff ShardController only re-checks: it relies on
    // withWineLayers handing every imperatively added shard source and layer,
    // overlays included, to the incoming basemap as they are, and on the diff
    // then leaving them alone. Built the way the controller leaves a style:
    // the world layers, each shard's base layers (selected first, then
    // alphabetical), and the selected shard's overlays on top.
    const { positron, darkMatter } = JSON.parse(
      readFileSync(path.join(process.cwd(), "src/lib/wine-map/__fixtures__/carto-styles.json"), "utf8"),
    ) as { positron: StyleSpecification; darkMatter: StyleSpecification };
    const light = tuneBasemapStyle(positron);
    const world = [
      "world-fills", "world-outlines", "world-region-fills", "world-region-outlines",
      "world-selected-casing", "world-selected-ring", "world-labels", "world-selected-label",
    ].map((id) =>
      id.includes("label")
        ? { id, type: "symbol", source: WORLD_SOURCE_ID, "source-layer": "labels" }
        : { id, type: "line", source: WORLD_SOURCE_ID, "source-layer": "places" },
    );
    const shards = ["bourgogne", "alsace", "mosel"].map((key) =>
      shardLayerSpecs(key, url(key), inputs(key, { ramp: key === "bourgogne" })),
    );
    const wineLayers = [
      ...world,
      ...shards.flatMap((specs) => specs.layers),
      ...shardOverlaySpecs("bourgogne", MAP_PALETTES.light),
    ] as LayerSpecification[];
    const live = {
      ...light,
      sources: {
        ...light.sources,
        [WORLD_SOURCE_ID]: { type: "vector", url: "pmtiles://https://tiles.test/world.pmtiles", promoteId: "region" },
        ...Object.fromEntries(shards.map((specs) => [specs.sourceId, specs.source])),
      },
      layers: [...light.layers, ...wineLayers],
    } as StyleSpecification;

    const next = withWineLayers(live, tuneBasemapStyle(darkMatter));
    expect(next.layers.slice(-wineLayers.length)).toEqual(wineLayers);
    for (const specs of shards) expect(next.sources[specs.sourceId]).toEqual(specs.source);
    const wineIds = [WORLD_SOURCE_ID, ...shards.map((specs) => specs.sourceId), ...wineLayers.map((l) => l.id)];
    const commands = diff(live, next);
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) {
      const args = JSON.stringify(command.args);
      for (const id of wineIds) {
        expect(args.includes(JSON.stringify(id)), `${command.command} names ${id}`).toBe(false);
      }
    }
    expect(validateStyleMin(next)).toEqual([]);
  });
});
