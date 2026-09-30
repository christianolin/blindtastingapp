// node scripts/usa-map/render-usa-us4-review.mjs
// Writes data/wine-map/review/usa-us4-<state>-knowledge.md, one per state,
// from the US-4 knowledge file and, once it exists, the rehearsal evidence
// (shortlists, nearby chips, the Willamette typical wine). The shortlist table
// is labelled from the US-2 data the rehearsal measured (the post-release
// corrections put back), and each correction is noted under its state's table.
import { readFile, writeFile } from "node:fs/promises";
import { releasedSource, US2_CORRECTIONS } from "./usa-knowledge.mjs";
import { mergeSources } from "./usa-us3-knowledge.mjs";
import { us4ReviewMarkdown } from "./usa-us4-knowledge.mjs";
import { loadWave } from "./waves.mjs";

export const reviewPath = (state) => `data/wine-map/review/usa-us4-${state.key.split(".")[1]}-knowledge.md`;
export const REHEARSAL_PATH = "data/wine-map/review/usa-us4-rehearsal.json";
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const maybe = async (p) => { try { return await json(p); } catch { return null; } };

export async function renderReview() {
  const wave = await loadWave("us4");
  const source = await json(wave.knowledgeSource);
  const us2 = releasedSource(await json("data/wine-map/place-profiles-usa.json"), US2_CORRECTIONS);
  const allSource = mergeSources(us2, source);
  const rehearsal = await maybe(REHEARSAL_PATH);
  return wave.states.map((state) => [reviewPath(state),
    us4ReviewMarkdown({ source, wave, state, allSource, rehearsal, corrections: US2_CORRECTIONS })]);
}

if (process.argv[1]?.endsWith("render-usa-us4-review.mjs")) {
  for (const [path, text] of await renderReview()) { await writeFile(path, text); console.log(`wrote ${path}`); }
}
