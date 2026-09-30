// Every wave the stage script and the rehearsals can take, by name.
import { COUNTRY_KEY, loadTrees, us2Wave, US2_FILES, US2_VERSIONS } from "./us2-wave.mjs";
import { loadBatches, loadTtb, us3Wave } from "./us3-wave.mjs";
import { us4Wave } from "./us4-wave.mjs";

export const WAVES = Object.freeze(["us2", "us3-core", "us3-rest", "us4"]);

export async function loadWave(name) {
  if (!WAVES.includes(name)) throw new Error(`unknown wave ${name} (use ${WAVES.join(", ")})`);
  const trees = await loadTrees();
  if (name === "us2") {
    return {
      ...us2Wave(trees), name, priorKeys: [], prior: { verified: [], present: [] }, scopeKey: COUNTRY_KEY,
      versions: US2_VERSIONS, files: US2_FILES, knowledgeSource: "data/wine-map/place-profiles-usa.json", priorPromote: null,
    };
  }
  if (name === "us4") return us4Wave(trees, await loadTtb());
  return us3Wave(trees, await loadBatches(), await loadTtb(), name.slice("us3-".length));
}
