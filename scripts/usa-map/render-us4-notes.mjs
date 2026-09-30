// node scripts/usa-map/render-us4-notes.mjs — writes the US-4 fact sheet and tree review.
import { writeFile } from "node:fs/promises";
import { loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { factSheetMarkdown, loadProps, treeReviewMarkdown } from "./us4-notes.mjs";
import { us4Wave } from "./us4-wave.mjs";

const trees = await loadTrees();
const wave = us4Wave(trees, await loadTtb());
await writeFile("data/wine-map/review/usa-us4-fact-sheet.md", factSheetMarkdown({ wave, trees, props: await loadProps() }));
await writeFile("data/wine-map/review/usa-us4-tree-review.md", treeReviewMarkdown({ wave, trees }));
console.log("wrote data/wine-map/review/usa-us4-fact-sheet.md and usa-us4-tree-review.md");
