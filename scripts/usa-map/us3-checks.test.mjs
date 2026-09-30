import assert from "node:assert/strict";
import test from "node:test";
import { CHILDREN, CLICK_KEYS, EXPECTED_EDGES, NEARBY_KEYS } from "./us3-checks.mjs";
import { loadWave } from "./waves.mjs";

const waves = { core: await loadWave("us3-core"), rest: await loadWave("us3-rest") };

test("every key a check names is a place of that batch (or an earlier one), and every expected edge is in the batch", () => {
  for (const batch of ["core", "rest"]) {
    const w = waves[batch];
    const known = new Set([...w.priorKeys, ...w.places.map((p) => p.key)]);
    for (const k of [...NEARBY_KEYS[batch], ...CLICK_KEYS[batch], ...Object.keys(CHILDREN[batch])]) assert.ok(known.has(k), `${batch}: ${k}`);
    for (const e of EXPECTED_EDGES[batch]) {
      assert.ok(w.edges.some((x) => x.type === e.type && x.source_key === e.source && x.target_key === e.target), `${batch}: ${JSON.stringify(e)}`);
    }
    for (const [k, n] of Object.entries(CHILDREN[batch])) {
      const tree = [...waves.core.places, ...waves.rest.places];
      const children = [...known].filter((x) => tree.find((p) => p.key === x)?.parent_key === k).length;
      assert.equal(children, n, `${batch}: children of ${k}`);
    }
  }
});
