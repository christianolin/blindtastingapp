// Renders the owner-review file for the US-2 knowledge (plan
// 2026-09-29-usa-wine-map-us2 Task 15; spec §18) from the data file, the wave
// and the rehearsal's evidence (for the §10.3 grape-shortlist table).
// usa-knowledge.test.mjs proves the committed file equals this render, so
// re-run this after any change to place-profiles-usa.json or a new rehearsal.
//
//   node scripts/usa-map/render-usa-us2-review.mjs
import { readFile, writeFile } from "node:fs/promises";
import { reviewMarkdown } from "./usa-knowledge.mjs";
import { loadTrees, us2Wave } from "./us2-wave.mjs";

export const REVIEW_PATH = "data/wine-map/review/usa-us2-knowledge.md";

const source = JSON.parse(await readFile("data/wine-map/place-profiles-usa.json", "utf8"));
const rehearsal = JSON.parse(await readFile("data/wine-map/review/usa-us2-rehearsal.json", "utf8"));
const wave = us2Wave(await loadTrees());
await writeFile(REVIEW_PATH, reviewMarkdown({ source, wave, rehearsal }));
console.log(`wrote ${REVIEW_PATH}`);
