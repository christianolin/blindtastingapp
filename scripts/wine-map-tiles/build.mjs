// Build stage: runs tippecanoe (CI-only; the binary is not available on the
// Windows dev machine) with cwd=WORK_DIR. --check-determinism rebuilds each
// archive in place from identical inputs and compares SHA-256 checksums.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256hex, tippecanoeArgs, WORK_DIR } from "./lib.mjs";

const TARGETS = ["world", "france"];
const checkDeterminism = process.argv.includes("--check-determinism");

function runTippecanoe(target) {
  const result = spawnSync("tippecanoe", tippecanoeArgs(target), {
    cwd: WORK_DIR,
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `tippecanoe ${target} failed (status ${result.status})`);
}

if (!checkDeterminism) {
  for (const target of TARGETS) runTippecanoe(target);
  console.log("Built world.pmtiles and france.pmtiles.");
} else {
  for (const target of TARGETS) {
    const first = sha256hex(await readFile(path.join(WORK_DIR, `${target}.pmtiles`)));
    runTippecanoe(target); // rebuild in place from identical inputs
    const second = sha256hex(await readFile(path.join(WORK_DIR, `${target}.pmtiles`)));
    assert.equal(second, first, `${target}.pmtiles is not deterministic`);
    console.log(`${target}.pmtiles deterministic: ${first}`);
  }
}
