// node scripts/usa-map/render-usa-us3-review.mjs --batch core|rest
// Writes data/wine-map/review/usa-us3-<batch>-knowledge-<n>.md (at most 40
// places each, §18) from the batch's knowledge file, and, when the batch's
// rehearsal evidence exists, its shortlist, nearby and dots sections.
import { readFile, writeFile } from "node:fs/promises";
import { reviewChunks, US3_KNOWLEDGE } from "./us3-wave.mjs";
import { mergeSources, us3ReviewMarkdown } from "./usa-us3-knowledge.mjs";
import { loadWave } from "./waves.mjs";

export const reviewPath = (batch, n) => `data/wine-map/review/usa-us3-${batch}-knowledge-${n}.md`;
export const rehearsalPath = (batch) => `data/wine-map/review/usa-us3-${batch}-rehearsal.json`;
const json = async (p) => JSON.parse(await readFile(p, "utf8"));
const maybe = async (p) => { try { return await json(p); } catch { return null; } };

export async function renderReview(batch) {
  const wave = await loadWave(`us3-${batch}`);
  const source = await json(wave.knowledgeSource);
  const us2 = await json("data/wine-map/place-profiles-usa.json");
  const core = batch === "core" ? source : await json(US3_KNOWLEDGE.core);
  const allSource = mergeSources(us2, core, ...(batch === "rest" ? [source] : []));
  const rehearsal = await maybe(rehearsalPath(batch));
  const chunks = reviewChunks(wave.places);
  return chunks.map((chunk, i) => [reviewPath(batch, i + 1), us3ReviewMarkdown({
    source, wave, keys: chunk.map((p) => p.key), part: i + 1, parts: chunks.length, allSource, rehearsal,
  })]);
}

if (process.argv[1]?.endsWith("render-usa-us3-review.mjs")) {
  const batch = process.argv[process.argv.indexOf("--batch") + 1];
  if (!["core", "rest"].includes(batch)) { console.error("usage: render-usa-us3-review.mjs --batch core|rest"); process.exit(2); }
  for (const [path, text] of await renderReview(batch)) { await writeFile(path, text); console.log(`wrote ${path}`); }
}
