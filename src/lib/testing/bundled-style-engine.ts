// The expression engine maplibre-gl actually ships, for tests.
//
// maplibre-gl's dist bundle carries its OWN copy of the style-spec, and it is
// not identical to the standalone @maplibre/maplibre-gl-style-spec package the
// other wine-map tests import: in 5.24.0 the bundled `global-state` expression
// returns `getOwn(state, key)` with no `?? null`, so a name that was never set
// reads as `undefined` once any OTHER name is set, while the standalone
// package reads null. `coalesce` passes undefined through and `==` is `===`,
// so an expression that is null-safe in one engine can be wrong in the other.
// Truth tables that decide what renders run through both.
//
// The dev bundle is an AMD-style file: `define('shared', ['exports'], f)` holds
// the style-spec and the rest of the shared code, `define('worker', ...)` the
// worker. Only the shared chunk is evaluated, with a stub `define`, the same
// way the bundle's own loader hands it an exports object.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

type Globals = { zoom: number };
type Feature = { type: 1 | 2 | 3; properties: Record<string, unknown>; id?: unknown };

export type BundledStyleEngine = {
  featureFilter(
    filter: unknown,
    globalState?: Record<string, unknown>,
  ): { filter(globals: Globals, feature: Feature): boolean };
  createExpression(
    expression: unknown,
    propertySpec?: unknown,
    globalState?: Record<string, unknown>,
  ):
    | {
        result: "success";
        value: {
          evaluate(globals: Globals, feature?: Feature, featureState?: Record<string, unknown>): unknown;
        };
      }
    | { result: "error"; value: { message: string }[] };
  v8Spec: Record<string, Record<string, unknown>>;
};

let engine: BundledStyleEngine | null = null;

export function bundledStyleEngine(): BundledStyleEngine {
  if (engine) return engine;
  const require = createRequire(import.meta.url);
  const source = readFileSync(require.resolve("maplibre-gl/dist/maplibre-gl-dev.js"), "utf8");
  const start = source.indexOf("define('shared'");
  const end = source.indexOf("define('worker'");
  if (start < 0 || end <= start) {
    throw new Error("maplibre-gl's dev bundle no longer has a 'shared' chunk; update this loader");
  }
  const factories: Record<string, (exports: Record<string, unknown>) => void> = {};
  const define = (
    name: string,
    _deps: unknown,
    factory: (exports: Record<string, unknown>) => void,
  ) => {
    factories[name] = factory;
  };
  // The chunk reads `self` as its global object, as it would in a worker.
  const scope = globalThis as { self?: unknown };
  scope.self ??= globalThis;
  new Function("define", source.slice(start, end))(define);
  const shared: Record<string, unknown> = {};
  factories.shared(shared);
  for (const name of ["featureFilter", "createExpression", "v8Spec"]) {
    if (!(name in shared)) throw new Error(`maplibre-gl's shared chunk no longer exports ${name}`);
  }
  engine = shared as unknown as BundledStyleEngine;
  return engine;
}
