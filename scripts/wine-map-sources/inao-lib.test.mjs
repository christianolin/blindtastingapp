import assert from "node:assert/strict";
import test from "node:test";
import {
  assertKnownDenominations,
  loadMembership,
  parcelMatches,
  rawObjectPath,
  splitDenominations,
  wfsPageUrl,
  PAGE_SIZE,
  RAW_BUCKET,
  SOURCE_NAMESPACE,
} from "./inao-lib.mjs";

test("splitDenominations honors the comma-not-followed-by-space rule", () => {
  assert.deepEqual(splitDenominations("Barsac,Bordeaux,Bordeaux supérieur"), [
    "Barsac",
    "Bordeaux",
    "Bordeaux supérieur",
  ]);
  assert.deepEqual(splitDenominations("Côtes de Bourg, Bourg et Bourgeais"), [
    "Côtes de Bourg, Bourg et Bourgeais",
  ]);
  assert.deepEqual(
    splitDenominations(
      "Blaye,Bordeaux,Côtes de Bourg, Bourg et Bourgeais,Crémant de Bordeaux",
    ),
    ["Blaye", "Bordeaux", "Côtes de Bourg, Bourg et Bourgeais", "Crémant de Bordeaux"],
  );
  assert.deepEqual(splitDenominations(null), []);
});

test("parcelMatches is exact membership, not substring", () => {
  assert.equal(parcelMatches("Aloxe-Corton,Bourgogne,Crémant de Bourgogne", "Bourgogne"), true);
  assert.equal(parcelMatches("Crémant de Bourgogne", "Bourgogne"), false);
  assert.equal(
    parcelMatches("Blaye,Côtes de Bourg, Bourg et Bourgeais", "Côtes de Bourg, Bourg et Bourgeais"),
    true,
  );
});

test("membership file backs the allowlist", async () => {
  const membership = await loadMembership();
  assert.equal(membership.get("Bourgogne"), 16855);
  assert.equal(membership.get("Fronsac"), 70);
  assert.equal(membership.get("Canon Fronsac"), 20);
  assert.equal(membership.get("Blaye"), 680);
  assert.equal(membership.get("Entre-deux-Mers"), 1199);
  assert.equal(membership.get("Côtes de Bourg, Bourg et Bourgeais"), 147);
  assert.equal(membership.has("Champagne"), false);
  assertKnownDenominations(["Bourgogne", "Fronsac"], membership);
  assert.throws(
    () => assertKnownDenominations(["Champagne"], membership),
    /Unknown denominations: Champagne/,
  );
});

test("wfsPageUrl bounds with LIKE, sorts deterministically, escapes quotes", () => {
  // URLSearchParams form-encodes spaces as "+", which decodeURIComponent
  // does NOT undo — assert on the parsed parameter, not the raw string.
  const url = wfsPageUrl("L'Étoile", 5000);
  const params = new URL(url).searchParams;
  assert.equal(params.get("sortBy"), "gml_id");
  assert.equal(params.get("count"), String(PAGE_SIZE));
  assert.equal(params.get("startIndex"), "5000");
  assert.equal(params.get("cql_filter"), "denom LIKE '%L''Étoile%'");
});

test("raw object paths are namespaced and versioned", () => {
  assert.equal(RAW_BUCKET, "wine-map-sources");
  assert.equal(
    rawObjectPath("20260721T150000Z", "bourgogne", "bourgogne-page-0.json"),
    `${SOURCE_NAMESPACE}/20260721T150000Z/bourgogne/bourgogne-page-0.json`,
  );
});
