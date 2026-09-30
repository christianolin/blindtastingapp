import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { factSheetMarkdown, pct, treeReviewMarkdown } from "./us3-notes.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";

const trees = await loadTrees();
const batches = await loadBatches();
const ttb = await loadTtb();
const waves = { core: us3Wave(trees, batches, ttb, "core"), rest: us3Wave(trees, batches, ttb, "rest") };
const art = JSON.parse(await readFile("data/wine-map/usa-california-ava.geojson", "utf8"));
const props = new Map(art.features.map((f) => [f.properties.ava_id, f.properties]));
const lf = (s) => s.replace(/\r\n/g, "\n");

test("pct keeps two decimals", () => {
  assert.equal(pct(0.8795), "87.95%");
  assert.equal(pct(0.7487), "74.87%");
});

test("the fact sheet has one row per AVA with its CFR section, TTB date and counties", () => {
  const md = factSheetMarkdown({ waves, tree: trees.CA, props });
  assert.equal((md.match(/^\| `united-states\.california\./gm) ?? []).length, 150);
  assert.match(md, /\| `united-states\.california\.north-coast\.napa-valley\.oakville` \| Oakville \| 9\.134 \| 1993-07-02 \| Napa \|/);
  assert.match(md, /\| `united-states\.california\.comptche` \| Comptche \| 9\.292 \| 2024-04-08 \| Mendocino \|/);
});

test("Review Focus 1: the tree review lists every lock a reader may not expect, with its ratio", () => {
  const md = treeReviewMarkdown({ waves, tree: trees.CA });
  for (const line of [
    /El Dorado.*Sierra Foothills.*OVERLAPS, 74\.87% inside/,
    /Russian River Valley.*Sonoma Coast.*OVERLAPS, 87\.95% inside/,
    /Cole Ranch.*Mendocino.*OVERLAPS, 69\.40% inside/,
    /High Valley.*Clear Lake.*OVERLAPS, 75\.91% inside/,
  ]) assert.match(md, line);
  assert.match(md, /## Core batch \(86 places\)/);
  assert.match(md, /## Rest batch \(64 places\)/);
});

test("the committed files are the renders", async () => {
  assert.equal(lf(await readFile("data/wine-map/review/usa-us3-fact-sheet.md", "utf8")), factSheetMarkdown({ waves, tree: trees.CA, props }));
  assert.equal(lf(await readFile("data/wine-map/review/usa-us3-tree-review.md", "utf8")), treeReviewMarkdown({ waves, tree: trees.CA }));
});
