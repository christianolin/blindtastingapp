import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeComuneName, matchComune } from "./istat-lib.mjs";

test("normalizeComuneName folds case, accents, apostrophes", () => {
  assert.equal(normalizeComuneName("Serralunga d'Alba"), "serralunga d alba");
  assert.equal(normalizeComuneName("SERRALUNGA D'ALBA"), "serralunga d alba"); // curly apostrophe U+2019
  assert.equal(normalizeComuneName("Monforte d'Alba"), "monforte d alba");
});

test("matchComune compares on normalized ISTAT name property", () => {
  const feature = { properties: { COMUNE: "Grinzane Cavour" } };
  assert.equal(matchComune(feature, "Grinzane Cavour", "COMUNE"), true);
  assert.equal(matchComune(feature, "Diano d'Alba", "COMUNE"), false);
});
