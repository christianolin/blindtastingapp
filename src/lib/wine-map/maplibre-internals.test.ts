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
