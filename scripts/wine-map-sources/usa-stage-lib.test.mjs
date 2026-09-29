import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import {
  COUNTRY_ARTIFACT, STATE_WINDOWS, datumCheck, insideWindow, rawObjectPath, sittingGate, uploadDecision,
} from "./usa-stage-lib.mjs";

test("D10: 0.0002° is at least five times the 2 m datum shift at every state's northern edge", () => {
  for (const [code, w] of Object.entries(STATE_WINDOWS)) {
    const r = datumCheck(0.0002, w.maxLat);
    assert.ok(r.ok, `${code}: ${r.metres.toFixed(1)} m`);
    assert.equal(r.required, 10);
  }
  assert.equal(datumCheck(0.0001, 49.1).ok, false, "0.0001° at 49°N is ~7.3 m, under 10 m");
});

test("windows hold the committed state outlines and umbrella AVAs", () => {
  assert.ok(insideWindow([-124.372, 32.533, -114.125, 42.001], STATE_WINDOWS.CA));
  assert.ok(insideWindow([-121.297, 45.218, -117.039, 48.292], STATE_WINDOWS.WA), "Columbia Valley reaches into Oregon");
  assert.ok(insideWindow([-73.767, 40.573, -71.856, 41.292], STATE_WINDOWS.NY), "Long Island");
  assert.equal(insideWindow([2.35, 48.85, 2.36, 48.86], STATE_WINDOWS.NY), false, "Paris");
});

test("raw object paths are pinned by commit and file", () => {
  assert.equal(rawObjectPath("355f7da3cd6c4020fff736b7517a4a669fed7730", "CA_avas.geojson"),
    "UCD_TTB_AVA/355f7da3cd6c4020fff736b7517a4a669fed7730/CA_avas.geojson");
  assert.throws(() => rawObjectPath("main", "CA_avas.geojson"), /not a commit sha/);
  assert.throws(() => rawObjectPath("355f7da3cd6c4020fff736b7517a4a669fed7730", "../x"), /not a UC Davis state file/);
});

test("Review Focus 5: an existing object is skipped when equal and never overwritten when different", () => {
  assert.equal(uploadDecision(null, "AB"), "upload");
  assert.equal(uploadDecision("ab", "AB"), "skip");
  assert.throws(() => uploadDecision("CD", "AB"), /refusing to overwrite/);
});

test("Review Focus 1 and 2: the sitting gate", () => {
  const ok = {
    versions: { catalog: "c", knowledge: "k" }, catalogRecorded: true, knowledgeRecorded: true,
    promoteRecorded: false, ownerApproval: { answer: "OK", date: "2026-10-01" }, treeMatches: true,
    usBoundaries: 0, otherDraftBoundaries: 0, buildingReleases: 0,
  };
  assert.deepEqual(sittingGate(ok), []);
  const r = sittingGate({ ...ok, catalogRecorded: false, ownerApproval: null, usBoundaries: 16, otherDraftBoundaries: 3, buildingReleases: 1, treeMatches: false });
  assert.equal(r.length, 6);
  assert.ok(r.some((x) => /someone else is mid-batch/.test(x)));
  assert.ok(r.some((x) => /tiles run is in flight/.test(x)));
  assert.ok(r.some((x) => /already exist/.test(x)));
});

test("the country artifact is the pinned one", async () => {
  assert.equal(sha256hex(await readFile(COUNTRY_ARTIFACT.path)), COUNTRY_ARTIFACT.sha256);
});
