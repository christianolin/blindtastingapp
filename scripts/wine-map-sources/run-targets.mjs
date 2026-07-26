// Sequential fetch+build driver for a target list (Phase 3C). Resumable:
// skips any target whose place already has a DRAFT boundary, so an
// interrupted run can be re-invoked without duplicating staged rows.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { pgConfig } from "../wine-map-tiles/lib.mjs";

const workDir = path.resolve(".tiles-build", "sources");
const args = process.argv.slice(2);
const targetsFile = args.find((a) => a.endsWith(".json")) ?? "cote-de-nuits-targets.json";
const targetsPath = path.join(workDir, targetsFile);
const targets = JSON.parse(await readFile(targetsPath, "utf8"));
// optional slug substring filter (bare arg) + resume-scope prefix (--prefix=)
const only = args.find((a) => !a.endsWith(".json") && !a.startsWith("--")) ?? null;
const prefix =
  args.find((a) => a.startsWith("--prefix="))?.slice("--prefix=".length) ??
  "france.bourgogne.cote-de-nuits";

const client = new pg.Client(pgConfig());
await client.connect();
const staged = new Set(
  (
    await client.query(
      `select p.canonical_key
         from wine_places p
         join wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT'
        where p.canonical_key like $1`,
      [`${prefix}%`],
    )
  ).rows.map((r) => r.canonical_key),
);
await client.end();

function run(script, args) {
  const result = spawnSync("node", [`scripts/wine-map-sources/${script}`, ...args], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.error(`FAILED ${script} ${args.join(" ")}`);
    process.exit(1);
  }
}

let done = 0;
for (const t of targets) {
  if (only && !t.slug.includes(only)) continue;
  if (staged.has(t.key)) {
    console.log(`SKIP (already staged) ${t.slug}`);
    continue;
  }
  // Reuse an existing local fetch (same raw provenance) when present; a
  // re-stage with new generalization params does not need fresh WFS pages.
  const haveLocal = existsSync(path.join(workDir, `${t.slug}-parcels.geojson`)) &&
    existsSync(path.join(workDir, `${t.slug}-fetch-manifest.json`));
  if (haveLocal) {
    console.log(`REUSE local fetch ${t.slug}`);
  } else {
    run("fetch-inao-denomination.mjs", [
      "--slug", t.slug, "--target-key", t.key, "--members", t.members.join(";"),
    ]);
  }
  const buildArgs = [
    "--slug", t.slug, "--target-key", t.key,
    "--presimplify", String(t.presimplify ?? 0.0005),
    "--tolerance", String(t.tolerance),
    "--min-share", String(t.minShare),
    "--min-part-share", String(t.minPartShare ?? 0),
    "--closing", String(t.closing ?? 0.02),
  ];
  if (t.engine) buildArgs.push("--engine", t.engine);
  if (t.gridSize != null) buildArgs.push("--grid-size", String(t.gridSize));
  run("build-boundary.mjs", buildArgs);
  done += 1;
}
console.log(`TARGETS DONE (${done} built this run)`);
