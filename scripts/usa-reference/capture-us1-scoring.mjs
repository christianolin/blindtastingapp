// READ-ONLY. Captures the scoring outputs US-1 must leave unchanged
// (us1-scoring-snapshot.mjs) to .superpowers/usa-us1/scoring-before.json, for
// check-us1-live.mjs to compare against after the apply. `.superpowers/` is
// gitignored: the file holds user ids. Nothing is written live.
// Usage: node scripts/usa-reference/capture-us1-scoring.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { withReadOnly } from "../wine-map-sources/read-only-client.mjs";
import { scoringSnapshot } from "./us1-scoring-snapshot.mjs";

const OUT_DIR = ".superpowers/usa-us1";
const snapshot = await withReadOnly((c) => scoringSnapshot(c));
await mkdir(OUT_DIR, { recursive: true });
await writeFile(`${OUT_DIR}/scoring-before.json`, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`captured ${snapshot.guesses.length} guesses, ${snapshot.user_totals.length} users, ${Object.keys(snapshot.leaderboards).length} leaderboards, ${snapshot.answer_keys.length} answer keys, ${snapshot.catalog_wines.length} catalog wines -> ${OUT_DIR}/scoring-before.json`);
