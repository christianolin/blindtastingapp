import assert from "node:assert/strict";
import test from "node:test";
import { loadWave, WAVES } from "./waves.mjs";

test("the four stageable waves", async () => {
  assert.deepEqual(WAVES, ["us2", "us3-core", "us3-rest", "us4"]);
  const us2 = await loadWave("us2");
  assert.deepEqual([us2.places.length, us2.priorKeys.length, us2.scopeKey, us2.priorPromote], [16, 0, "united-states", null]);
  assert.equal(us2.knowledgeSource, "data/wine-map/place-profiles-usa.json");
  const core = await loadWave("us3-core");
  assert.deepEqual([core.name, core.places.length, core.scopeKey], ["us3-core", 86, "united-states.california"]);
  const us4 = await loadWave("us4");
  assert.deepEqual([us4.name, us4.places.length, us4.scopeKeys.length], ["us4", 42, 3]);
  await assert.rejects(() => loadWave("us5"), /unknown wave us5/);
});
