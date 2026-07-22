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
const targetsPath = path.join(workDir, "cote-de-nuits-targets.json");
const targets = JSON.parse(await readFile(targetsPath, "utf8"));
const only = process.argv[2] ?? null; // optional slug substring filter

const client = new pg.Client(pgConfig());
await client.connect();
const staged = new Set(
  (
    await client.query(
      `select p.canonical_key
         from wine_places p
         join wine_place_boundaries b on b.wine_place_id = p.id and b.quality_status = 'DRAFT'
        where p.canonical_key like 'france.bourgogne.cote-de-nuits%'`,
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
  run("build-boundary.mjs", [
    "--slug", t.slug, "--target-key", t.key,
    "--presimplify", String(t.presimplify),
    "--tolerance", String(t.tolerance),
    "--min-share", String(t.minShare),
    "--min-part-share", String(t.minPartShare),
    "--closing", String(t.closing ?? 0.02),
  ]);
  done += 1;
}
console.log(`TARGETS DONE (${done} built this run)`);
