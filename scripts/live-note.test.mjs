import test from "node:test";
import assert from "node:assert/strict";
import { composeLiveNote } from "../src/lib/wset/live-note.mjs";

// A tiny label fixture (the app passes vocab.LABELS; the composer stays
// dependency-free by taking labels as a parameter).
const LABELS = {
  CLEAR: "clear",
  MEDIUM_PLUS: "medium(+)",
  RUBY: "ruby",
  LEGS_TEARS: "legs / tears",
  CLEAN: "clean",
  DEVELOPING: "developing",
  DRY: "dry",
};

const termLabels = new Map([
  ["t-blackcurrant", "blackcurrant"],
  ["t-black-cherry", "black cherry"],
  ["t-plum", "plum"],
  ["t-violet", "violet"],
  ["t-black-pepper", "black pepper"],
  ["t-cedar", "cedar"],
  ["t-vanilla", "vanilla"],
]);

const empty = {
  clarity: null, appearanceIntensity: null, colourHue: null, observations: [],
  condition: null, faults: [], noseIntensity: null, development: null,
  noseTermIds: [], sweetness: null, acidity: null, tannin: null, alcohol: null,
  body: null, mousse: null, flavourIntensity: null, palateTermIds: [],
  finish: null, qualityScore: null, priceCategory: null, readiness: null,
  tasterNotes: "",
};

test("empty state composes no sections", () => {
  assert.deepEqual(composeLiveNote(empty, termLabels, LABELS), {});
});

test("appearance-only composes just the appearance line", () => {
  const state = {
    ...empty,
    clarity: "CLEAR",
    appearanceIntensity: "MEDIUM_PLUS",
    colourHue: "RUBY",
    observations: ["LEGS_TEARS"],
  };
  const out = composeLiveNote(state, termLabels, LABELS);
  assert.equal(
    out.appearance,
    "Clear, medium(+) intensity, ruby; legs / tears.",
  );
  assert.equal(out.nose, undefined);
});

test("nose line joins scales then aromas after an em-dash", () => {
  const state = {
    ...empty,
    condition: "CLEAN",
    noseIntensity: "MEDIUM_PLUS",
    development: "DEVELOPING",
    noseTermIds: [
      "t-blackcurrant", "t-black-cherry", "t-plum", "t-violet",
      "t-black-pepper", "t-cedar", "t-vanilla",
    ],
  };
  const out = composeLiveNote(state, termLabels, LABELS);
  assert.equal(
    out.nose,
    "Clean, medium(+) intensity, developing — blackcurrant, black cherry, " +
      "plum, violet, black pepper, cedar, vanilla.",
  );
});

test("palate joins structure scales then flavour aromas (handoff format)", () => {
  const state = {
    ...empty,
    sweetness: "DRY",
    acidity: "MEDIUM_PLUS",
    palateTermIds: ["t-blackcurrant", "t-black-cherry"],
  };
  const out = composeLiveNote(state, termLabels, LABELS);
  assert.equal(
    out.palate,
    "Dry, medium(+) acidity — blackcurrant, black cherry.",
  );
});

test("observations-only appearance has no stray leading separator", () => {
  const out = composeLiveNote(
    { ...empty, observations: ["LEGS_TEARS"] },
    termLabels,
    LABELS,
  );
  assert.equal(out.appearance, "Legs / tears.");
});

test("conclusions render score with band, lower-cased", () => {
  const out = composeLiveNote({ ...empty, qualityScore: 89 }, termLabels, LABELS);
  assert.equal(out.conclusions, "89 points (very good).");
});
