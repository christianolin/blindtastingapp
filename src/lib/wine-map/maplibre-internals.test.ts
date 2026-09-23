// The wine map leans on MapLibre internals that no semver promise covers, and
// package.json allows `^5.24.0`, so `npm install` can move the minor version
// under it. This file fails loudly when that happens, instead of letting a
// renamed internal fail silently in production or in a measurement.
//
// Internals in use (re-verify each against the new version's src/ before
// raising the pin below):
// - Style#_reloadSource(id) — perf-stats.ts's reload counter (the probe's
//   A2 column). Checked here in the shipped bundle as well.
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
});
