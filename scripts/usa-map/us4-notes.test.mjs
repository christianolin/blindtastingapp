import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadTrees } from "./us2-wave.mjs";
import { loadTtb } from "./us3-wave.mjs";
import { factSheetMarkdown, loadProps, treeReviewMarkdown } from "./us4-notes.mjs";
import { us4Wave } from "./us4-wave.mjs";

const trees = await loadTrees();
const wave = us4Wave(trees, await loadTtb());
const props = await loadProps();
const lf = (s) => s.replace(/\r\n/g, "\n");

test("the fact sheet: one row per AVA with CFR section, TTB date, counties and TTB states", () => {
  const md = factSheetMarkdown({ wave, trees, props });
  assert.equal((md.match(/^\| `united-states\.(washington|oregon|new-york)\./gm) ?? []).length, 42);
  assert.match(md, /## New York \(8 places\)[\s\S]*## Oregon \(18 places\)[\s\S]*## Washington \(16 places\)/);
  assert.match(md, /\| `united-states\.washington\.columbia-valley\.yakima-valley\.red-mountain` \| Red Mountain \| 9\.167 \| 2001-04-10 \| Benton \| WA \|/);
  assert.match(md, /\| `united-states\.washington\.columbia-valley\.walla-walla-valley` \| Walla Walla Valley \| 9\.91 \| 1984-02-06 \| Umatilla, Walla Walla \| OR, WA \|/);
});

test("Review Focus 1: the tree review lists every lock a reader may not expect, with its figure", () => {
  const md = treeReviewMarkdown({ wave, trees });
  for (const line of [
    /\| Walla Walla Valley \| `washington\.columbia-valley\.walla-walla-valley` \(dominant\) \| OR, WA \| OR 31\.01%, WA 68\.99% \| oregon \| US-4 \|/,
    /\| Columbia Gorge \| `oregon\.columbia-gorge` \(override\) \| OR, WA \| OR 65\.20%, WA 34\.80% \| washington \| US-4 \|/,
    /\| Columbia Valley \| `washington\.columbia-valley` \(dominant\) \| OR, WA \| OR 22\.40%, WA 77\.60% \| oregon \| US-2 \|/,
    /\| ALTERNATE_PARENT \| `oregon\.the-rocks-district-of-milton-freewater` \| `washington\.columbia-valley\.walla-walla-valley` \| within \|/,
    /Candy Mountain keyed under `washington\.columbia-valley\.yakima-valley` \(override, 89\.31% measured inside\): T\.D\. TTB-163/,
    /Candy Mountain and Goose Gap: no containment and no edge \(legal exclusion, 1\.34% measured inside\)/,
    /The Burn of Columbia Valley: OR 38\.21% \(TTB lists WA\)/,
    /Lake Erie: dominant state OH is outside wave 1/,
    /Snake River Valley: dominant state ID is outside wave 1/,
    /Columbia Hills \(WA; 27 CFR 9\.301; established 2026-08-17\)/,
  ]) assert.match(md, line);
});

test("the committed files are the renders", async () => {
  assert.equal(lf(await readFile("data/wine-map/review/usa-us4-fact-sheet.md", "utf8")), factSheetMarkdown({ wave, trees, props }));
  assert.equal(lf(await readFile("data/wine-map/review/usa-us4-tree-review.md", "utf8")), treeReviewMarkdown({ wave, trees }));
});
