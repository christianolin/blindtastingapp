// node scripts/usa-map/render-us3-notes.mjs — writes the fact sheet and the tree review.
import { readFile, writeFile } from "node:fs/promises";
import { loadTrees } from "./us2-wave.mjs";
import { factSheetMarkdown, treeReviewMarkdown } from "./us3-notes.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const trees = await loadTrees();
const batches = await loadBatches();
const ttb = await loadTtb();
const waves = { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
const art = JSON.parse(await readFile("data/wine-map/usa-california-ava.geojson", "utf8"));
const props = new Map(art.features.map((f) => [f.properties.ava_id, f.properties]));
await writeFile("data/wine-map/review/usa-us3-fact-sheet.md", factSheetMarkdown({ waves, tree: trees.CA, props }));
await writeFile("data/wine-map/review/usa-us3-tree-review.md", treeReviewMarkdown({ waves, tree: trees.CA }));
console.log("wrote data/wine-map/review/usa-us3-fact-sheet.md and usa-us3-tree-review.md");
