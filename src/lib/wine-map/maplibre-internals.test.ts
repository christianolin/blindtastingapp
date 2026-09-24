// The wine map leans on MapLibre internals that no semver promise covers, and
// package.json allows `^5.24.0`, so `npm install` can move the minor version
// under it. This file fails loudly when that happens, instead of letting a
// renamed internal fail silently in production or in a measurement.
//
// Internals in use (re-verify each against the new version's src/ before
// raising the pin below):
// - Style#_reloadSource(id) — perf-stats.ts's reload counter (the probe's
//   A2 column). Checked here in the shipped bundle as well.
// - The dev bundle's `define('shared'` / `define('worker'` chunks and the
//   shared chunk's featureFilter / createExpression / v8Spec exports —
//   testing/bundled-style-engine.ts evaluates that chunk to run the
//   expression engine production runs (its global-state reads differ from
//   the standalone style-spec package's). Checked in maplibre-gl-dev.js, the
//   file that loader reads.
// - Style#_checkLoaded(), whose "Style is not done loading." throw
//   Style#setGlobalStateProperty and Style#set/removeFeatureState run first —
//   MapStateSync defers its writes around it.
// - Style#_loaded, set once Style#_load takes a style in, which
//   react-maplibre's <Layer> and the shard controller read before adding
//   anything.
// - Map#_updateDiff, whose catch falls back to the full style rebuild
//   (_updateStyle, a new Style with empty global state and no feature-state)
//   that MapStateSync re-sends everything after.
// - The "Style is not done loading." message and the order inside
//   Style.addLayer (a duplicate id or a missing `before` fires an ErrorEvent
//   and adds nothing; a layer whose source is missing enters the order
//   BEFORE _updateLayer throws) — shard-controller.ts's not-loaded test and
//   its transactional rollback.
// - Style's {validate:false} skip in _validate, and Map#setGlobalStateProperty
//   calling _update(true) unconditionally — the controller's add path and its
//   one wm_tick dirty mark per batch.
// - How an unreadable archive surfaces: VectorTileSource#load's catch sets
//   _loaded = true and THEN fires an ErrorEvent with no `tile`; TileManager
//   flags that source _sourceErrored and its loaded() returns true for it;
//   a single tile's failure (TileManager#_loadTile) fires an ErrorEvent WITH
//   {tile}; Style#addSource tags every source event with its sourceId —
//   shard-controller.ts's unreadable-archive rule, which drops a shard on a
//   tile-less error naming its source (else the readiness latch hands its
//   region to a shard with nothing to draw).
// - @vis.gl/react-maplibre 8.1: <Layer> guards on style._loaded, and hover
//   queries run only while a hover prop is set (why TileWineMap sets the
//   cursor from hover-cursor.ts instead of an onMouseMove prop).
// These four are checked in the packages' src/ (shipped with them): an
// order inside a method cannot be read off the minified bundle.
// Later phases add their own lines here as they start relying on one.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(
  readFileSync(path.join(process.cwd(), "node_modules/maplibre-gl/package.json"), "utf8"),
) as { version: string; main: string };

// The bundle the app actually ships (package.json `main`), not the dev one.
const bundle = readFileSync(
  path.join(process.cwd(), "node_modules/maplibre-gl", pkg.main),
  "utf8",
);

// The dev bundle, which testing/bundled-style-engine.ts evaluates in tests.
const devBundle = readFileSync(
  path.join(process.cwd(), "node_modules/maplibre-gl/dist/maplibre-gl-dev.js"),
  "utf8",
);

/** The next `span` characters of the bundle from `marker`, or "" when the
    marker is gone. */
function after(marker: string, span: number): string {
  const at = bundle.indexOf(marker);
  return at === -1 ? "" : bundle.slice(at, at + span);
}

describe("MapLibre internals the wine map relies on", () => {
  it("is the minor version they were verified against", () => {
    // A failure here is not a bug: read the list at the top of this file
    // against the new version, then update this line.
    expect(pkg.version).toMatch(/^5\.24\./);
  });

  it("Style still reloads a source through _reloadSource(id)", () => {
    // The method itself…
    expect(bundle).toMatch(/[;}]_reloadSource\([\w$]+\)\{this\.tileManagers\[/);
    // …called from Style#update for a filter/layout/data-driven paint change…
    expect(after('"reload"===', 60)).toContain("this._reloadSource(");
    // …and from the global-state path (setGlobalStateProperty).
    expect(after('this.dispatcher.broadcast("UGS"', 120)).toContain("this._reloadSource(");
  });

  it("the dev bundle still has the 'shared' chunk bundled-style-engine.ts evaluates", () => {
    const start = devBundle.indexOf("define('shared'");
    const end = devBundle.indexOf("define('worker'");
    expect(start, "define('shared' is gone").toBeGreaterThan(-1);
    expect(end, "define('worker' no longer follows the shared chunk").toBeGreaterThan(start);
    const shared = devBundle.slice(start, end);
    for (const name of ["featureFilter", "createExpression", "v8Spec"]) {
      expect(shared, `the shared chunk no longer exports ${name}`).toMatch(
        new RegExp(`\\bexports(?:\\$\\d+)?\\.${name} = `),
      );
    }
  });

  it("Style's global-state and feature-state writes throw until the style has loaded", () => {
    // _checkLoaded throws while the style JSON has not landed…
    expect(bundle, "Style#_checkLoaded").toMatch(
      /[;}]_checkLoaded\(\)\{if\(!this\._loaded\)throw new Error\("Style is not done loading\."\)\}/,
    );
    // …and each write MapStateSync makes runs it first.
    expect(bundle, "Style#setGlobalStateProperty").toMatch(
      /[;}]setGlobalStateProperty\([\w$]+,[\w$]+\)\{(?:var [\w$,]+;)?this\._checkLoaded\(\);/,
    );
    expect(bundle, "Style#setFeatureState").toMatch(
      /[;}]setFeatureState\([\w$]+,[\w$]+\)\{this\._checkLoaded\(\);/,
    );
    expect(bundle, "Style#removeFeatureState").toMatch(
      /[;}]removeFeatureState\([\w$]+,[\w$]+\)\{this\._checkLoaded\(\);/,
    );
    // Map#setGlobalStateProperty is a straight hand-off to the Style's.
    expect(bundle, "Map#setGlobalStateProperty").toMatch(
      /setGlobalStateProperty\(([\w$]+),([\w$]+)\)\{return this\.style\.setGlobalStateProperty\(\1,\2\),/,
    );
  });

  it("Style#_loaded is still the style-ready flag", () => {
    // Set when Style#_load takes a style in…
    expect(bundle, "Style#_load").toMatch(
      /[;}]_load\([\w$]+,[\w$]+,[\w$]+\)\{[\s\S]{0,200}?this\._loaded=!0,this\.stylesheet=/,
    );
    // …and read off the map's style, as react-maplibre and the controller do.
    expect(bundle.includes("this.style._loaded"), "Map reads this.style._loaded").toBe(true);
  });

  it("Map#_updateDiff still falls back to a full style rebuild", () => {
    expect(bundle, "Map#_updateDiff").toMatch(
      /[;}]_updateDiff\(([\w$]+),([\w$]+)\)\{try\{this\.style\.setState\(\1,\2\)&&this\._update\(!0\);?\}catch\([\w$]+\)\{[\s\S]{0,160}?Rebuilding the style from scratch\.`\),this\._updateStyle\(\1,\2\);?\}\}/,
    );
  });
});

// Phase 1c: ShardController and the hover cursor.
const MODULES = path.join(process.cwd(), "node_modules");
const readModule = (file: string) => readFileSync(path.join(MODULES, file), "utf8");

/** The text of one method: from its signature up to the next one's. */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThan(-1);
  const end = source.indexOf(to, start + from.length);
  expect(end, to).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("MapLibre internals the shard controller relies on", () => {
  it("react-maplibre is the minor version they were verified against", () => {
    const { version } = JSON.parse(readModule("@vis.gl/react-maplibre/package.json")) as {
      version: string;
    };
    expect(version, "re-verify the list at the top of this file, then move the pin").toMatch(/^8\.1\./);
  });

  it("Style keeps its loaded flag, its not-loaded message and the validate:false skip", () => {
    const style = readModule("maplibre-gl/src/style/style.ts");
    // The controller reads style._loaded directly (react-maplibre's own guard)
    // and tells a not-loaded throw from a real failure by its message.
    expect(style).toContain("_loaded: boolean;");
    expect(style).toContain("throw new Error('Style is not done loading.');");
    // {validate:false} skips _validate, whose serialize() of the whole style
    // was the first-zoom freeze.
    expect(style).toContain("if (options?.validate === false) {");
  });

  it("Style.addLayer refuses by event, and inserts a layer before it can throw", () => {
    const addLayer = between(
      readModule("maplibre-gl/src/style/style.ts"),
      "addLayer(layerObject: AddLayerObject",
      "moveLayer(id: string",
    );
    // A duplicate id or a missing `before` fires an ErrorEvent and adds
    // nothing, so the controller checks getLayer after every add.
    expect(addLayer).toContain("already exists on this map.");
    expect(addLayer).toContain("before non-existing layer");
    // The id enters the order BEFORE _updateLayer, which throws on a missing
    // source, so a rollback has to remove every id of the shard that exists.
    const inserted = addLayer.indexOf("this._order.splice(index, 0, id);");
    expect(inserted).toBeGreaterThan(-1);
    expect(inserted).toBeLessThan(addLayer.indexOf("this._updateLayer(layer);"));
  });

  it("Map.setGlobalStateProperty still repaints unconditionally", () => {
    // The controller's one wm_tick write per batch is its dirty mark:
    // Style.* writes do not schedule a render themselves.
    const body = between(
      readModule("maplibre-gl/src/ui/map.ts"),
      "setGlobalStateProperty(propertyName: string, value: any) {",
      "getGlobalState()",
    );
    expect(body).toContain("return this._update(true);");
  });

  it("an unreadable archive fires an error with no tile, and its source then reads as loaded", () => {
    // VectorTileSource#load: a header that cannot be fetched is "pretended"
    // loaded FIRST, then reported by an ErrorEvent with no second argument —
    // no `tile`, which is how the controller tells it from one tile's error.
    const load = between(
      readModule("maplibre-gl/src/source/vector_tile_source.ts"),
      "async load(",
      "loaded(): boolean {",
    );
    const caught = load.slice(load.indexOf("} catch (err) {"));
    const pretended = caught.indexOf("this._loaded = true;");
    const reported = caught.indexOf("this.fire(new ErrorEvent(ensureError(err)));");
    expect(load.indexOf("} catch (err) {"), "load() has no catch").toBeGreaterThan(-1);
    expect(pretended, "the catch no longer sets _loaded = true").toBeGreaterThan(-1);
    expect(reported, "the catch's ErrorEvent changed shape (a `tile`?)").toBeGreaterThan(-1);
    expect(pretended, "_loaded must be set before the error fires").toBeLessThan(reported);

    // TileManager: the error flags the source errored (because the source
    // already reads loaded), and an errored source is LOADED — which is why
    // isSourceLoaded cannot be trusted for it.
    const tileManager = readModule("maplibre-gl/src/tile/tile_manager.ts");
    expect(tileManager).toContain("this._sourceErrored = this._source.loaded();");
    expect(between(tileManager, "loaded(): boolean {", "getSource(): Source {")).toContain(
      "if (this._sourceErrored) { return true; }",
    );
  });

  it("a single tile's error carries its tile, and every source event its sourceId", () => {
    // TileManager#_loadTile reports one failed tile WITH {tile}; the
    // controller leaves those to MapLibre.
    const loadTile = between(
      readModule("maplibre-gl/src/tile/tile_manager.ts"),
      "async _loadTile(tile: Tile",
      "_unloadTile(tile: Tile)",
    );
    expect(loadTile).toContain("this._source.fire(new ErrorEvent(ensureError(err), {tile}));");
    // Style#addSource: the map sees every source event with `sourceId`, the
    // field the controller reads to find the shard.
    const addSource = between(
      readModule("maplibre-gl/src/style/style.ts"),
      "addSource(id: string, source: SourceSpecification",
      "tileManager.onAdd(this.map);",
    );
    expect(addSource).toContain("tileManager.setEventedParent(this, () => ({");
    expect(addSource).toContain("sourceId: id");
  });

  it("react-maplibre guards on style._loaded and hover-queries only for hover props", () => {
    expect(readModule("@vis.gl/react-maplibre/src/components/layer.ts")).toContain("map.style._loaded");
    // Why TileWineMap has no onMouseMove prop: with one, every mousemove
    // queries every interactive layer.
    expect(readModule("@vis.gl/react-maplibre/src/maplibre/maplibre.ts")).toContain(
      "props.interactiveLayerIds && (props.onMouseMove || props.onMouseEnter || props.onMouseLeave)",
    );
  });
});
