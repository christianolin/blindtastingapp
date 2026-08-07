// The cellar's money maths, now that value prefers the wine's market estimate
// over the lot's purchase price. Pure function — no DB, no env.
// Run: node --experimental-strip-types --test scripts/cellar-stats.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { computeCellarStats } from "../src/app/cellar/stats.ts";

const lot = (over = {}) => ({
  quantity: 2,
  purchasedQuantity: 2,
  pricePerBottle: null,
  currency: "DKK",
  estimatedPrice: null,
  estimatedPriceCurrency: "DKK",
  purchasedOn: null,
  drinkFrom: null,
  drinkTo: null,
  catalogWineId: "w1",
  colour: "RED",
  vintageKind: "YEAR",
  vintageYear: 2019,
  regionName: null,
  countryName: null,
  ...over,
});

test("the estimate outranks the purchase price for value", () => {
  const s = computeCellarStats(
    [lot({ pricePerBottle: 100, estimatedPrice: 250 })],
    "DKK",
    2026,
  );
  assert.equal(s.value, 2 * 250, "value must use the estimate, not the price paid");
  assert.equal(s.spend, 2 * 100, "spend must stay purchase history");
});

test("no estimate falls back to the purchase price", () => {
  const s = computeCellarStats([lot({ pricePerBottle: 100 })], "DKK", 2026);
  assert.equal(s.value, 200);
});

test("an estimate values a lot that has no purchase price at all", () => {
  // The whole point of the feature: most lots carry no price.
  const s = computeCellarStats([lot({ estimatedPrice: 300 })], "DKK", 2026);
  assert.equal(s.value, 600);
  assert.equal(s.spend, 0);
});

test("an estimate in another currency does not pollute the sum", () => {
  const s = computeCellarStats(
    [lot({ estimatedPrice: 40, estimatedPriceCurrency: "EUR", pricePerBottle: 100 })],
    "DKK",
    2026,
  );
  assert.equal(s.value, 200, "must fall back to the DKK purchase price");
  assert.equal(s.mixedCurrency, false, "the fallback covered it — nothing was dropped");
});

test("a lot valuable only in a foreign currency flags mixedCurrency", () => {
  const s = computeCellarStats(
    [lot({ estimatedPrice: 40, estimatedPriceCurrency: "EUR" })],
    "DKK",
    2026,
  );
  assert.equal(s.value, 0);
  assert.equal(s.mixedCurrency, true, "money existed but none could be counted");
});

test("wholly unpriced lots count bottles and no value", () => {
  const s = computeCellarStats([lot()], "DKK", 2026);
  assert.equal(s.totalBottles, 2);
  assert.equal(s.value, 0);
  assert.equal(s.mixedCurrency, false);
});
