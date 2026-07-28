import test from "node:test";
import assert from "node:assert/strict";
import {
  scoreToPct,
  pctToScore,
  qualityBand,
} from "../src/lib/wset/quality-curve.mjs";

test("breakpoints map exactly, both directions", () => {
  const pairs = [
    [50, 0],
    [80, 20],
    [85, 40],
    [90, 70],
    [95, 90],
    [100, 100],
  ];
  for (const [s, p] of pairs) {
    assert.equal(scoreToPct(s), p);
    assert.equal(pctToScore(p), s);
  }
});

test("round-trips and monotonic across the whole scale", () => {
  let prev = -1;
  for (let s = 50; s <= 100; s++) {
    const pct = scoreToPct(s);
    assert.ok(pct > prev, `pct must increase at score ${s}`);
    prev = pct;
    assert.equal(pctToScore(pct), s);
  }
});

test("clamps out-of-range input", () => {
  assert.equal(scoreToPct(40), 0);
  assert.equal(scoreToPct(120), 100);
  assert.equal(pctToScore(-10), 50);
  assert.equal(pctToScore(150), 100);
});

test("bands", () => {
  assert.equal(qualityBand(97), "Extraordinary");
  assert.equal(qualityBand(90), "Outstanding");
  assert.equal(qualityBand(89), "Very good");
  assert.equal(qualityBand(84), "Above average");
  assert.equal(qualityBand(79), "Average");
  assert.equal(qualityBand(69), "Below average");
  assert.equal(qualityBand(59), "Unacceptable");
});
