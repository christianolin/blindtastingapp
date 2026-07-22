// Build stage: runs tippecanoe (CI-only; the binary is not available on the
// Windows dev machine) with cwd=WORK_DIR. Targets are the world archive plus
// one shard per region present in release.json. --check-determinism rebuilds
// each archive in place from identical inputs and compares SHA-256 checksums.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256hex, tippecanoeArgs, SHARD_TARGET, WORK_DIR, WORLD_TARGET } from "./lib.mjs";

const release = JSON.parse(await readFile(path.join(WORK_DIR, "release.json"), "utf8"));
const targets = [
  ["world", WORLD_TARGET],
  ...Object.keys(release.shards).map((key) => [key, SHARD_TARGET]),
];
const checkDeterminism = process.argv.includes("--check-determinism");

function runTippecanoe(name, spec) {
  const result = spawnSync("tippecanoe", tippecanoeArgs(name, spec), {
    cwd: WORK_DIR,
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `tippecanoe ${name} failed (status ${result.status})`);
}

if (!checkDeterminism) {
  for (const [name, spec] of targets) runTippecanoe(name, spec);
  console.log(`Built ${targets.map(([name]) => `${name}.pmtiles`).join(", ")}.`);
} else {
  for (const [name, spec] of targets) {
    const first = sha256hex(await readFile(path.join(WORK_DIR, `${name}.pmtiles`)));
    runTippecanoe(name, spec); // rebuild in place from identical inputs
    const second = sha256hex(await readFile(path.join(WORK_DIR, `${name}.pmtiles`)));
    assert.equal(second, first, `${name}.pmtiles is not deterministic`);
    console.log(`${name}.pmtiles deterministic: ${first}`);
  }
}
