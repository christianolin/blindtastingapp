// TTB's established-AVA list against the UC Davis features (spec 2026-09-29
// §5.4). Matched by CFR section first, then by folded legal name. Three lists
// come out: in both (with renames flagged), TTB only (US-5 material), and UC
// Davis only (removed or renamed AVAs, each needing an explanation).
//
// CLI: node scripts/wine-map-sources/usa-ava-diff.mjs
//   writes data/wine-map/usa-ava-diff.json, exit 1 while any UC-Davis-only AVA
//   lacks an explanation in data/wine-map/usa-ava-diff-notes.json.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import { foldAvaName, normalizeCfr } from "./usa-ava-lib.mjs";

export const WAVE_STATES = ["CA", "NY", "OR", "WA"];

const byName = (a, b) => a.name.localeCompare(b.name);

/** `ucd` rows are already in scope (they come from the four state files) and
    deduped by ava_id; TTB rows are filtered to the four states here. */
export function diffAvaLists({ ttb, ucd, states = WAVE_STATES, explanations = {} }) {
  const t = ttb
    .filter((row) => row.states.some((s) => states.includes(s)))
    .map((row) => ({ ...row, cfr: normalizeCfr(row.cfr_section), fold: foldAvaName(row.name) }));
  const u = ucd.map((row) => ({ ...row, cfr: normalizeCfr(row.cfr_index), fold: foldAvaName(row.name) }));
  const matched = [];
  const usedT = new Set();
  const usedU = new Set();
  const take = (tr, ur, how) => {
    matched.push({ ttb_name: tr.name, ucd_id: ur.ava_id, ucd_name: ur.name, cfr: tr.cfr ?? ur.cfr, how });
    usedT.add(tr);
    usedU.add(ur.ava_id);
  };
  for (const tr of t) {
    if (!tr.cfr) continue;
    const ur = u.find((x) => !usedU.has(x.ava_id) && x.cfr === tr.cfr);
    if (ur) take(tr, ur, ur.fold === tr.fold ? "name+cfr" : "cfr");
  }
  for (const tr of t) {
    if (usedT.has(tr)) continue;
    const ur = u.find((x) => !usedU.has(x.ava_id) && x.fold === tr.fold);
    if (ur) take(tr, ur, "name");
  }
  const ttbOnly = t.filter((tr) => !usedT.has(tr))
    .map(({ name, states: s, cfr, established }) => ({ name, states: s, cfr, established })).sort(byName);
  const ucdOnly = u.filter((x) => !usedU.has(x.ava_id))
    .map((x) => ({ ucd_id: x.ava_id, name: x.name, cfr: x.cfr, state: x.state, explanation: explanations[x.ava_id] ?? null }))
    .sort(byName);
  matched.sort((a, b) => a.ttb_name.localeCompare(b.ttb_name));
  return {
    matched,
    renamed: matched.filter((m) => m.how === "cfr"),
    ttb_only: ttbOnly,
    ucd_only: ucdOnly,
    unexplained: ucdOnly.filter((x) => !x.explanation),
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const TTB_PATH = "data/wine-map/usa-ava-ttb-list.json";
  const NOTES_PATH = "data/wine-map/usa-ava-diff-notes.json";
  const FILES = ["california", "washington", "oregon", "new-york"].map((s) => `data/wine-map/usa-${s}-ava.geojson`);
  const inputs = {};
  const ttbBuf = await readFile(TTB_PATH);
  inputs[TTB_PATH] = sha256hex(ttbBuf);
  const ttb = JSON.parse(ttbBuf.toString("utf8")).avas;
  const notesBuf = await readFile(NOTES_PATH);
  inputs[NOTES_PATH] = sha256hex(notesBuf);
  const explanations = JSON.parse(notesBuf.toString("utf8")).ucd_only ?? {};
  const ucd = new Map();
  for (const file of FILES) {
    const buf = await readFile(file);
    inputs[file] = sha256hex(buf);
    for (const f of JSON.parse(buf.toString("utf8")).features) ucd.set(f.properties.ava_id, f.properties);
  }
  const d = diffAvaLists({ ttb, ucd: [...ucd.values()], explanations });
  const counts = {
    ttb_in_scope: d.matched.length + d.ttb_only.length,
    matched: d.matched.length,
    renamed: d.renamed.length,
    ttb_only: d.ttb_only.length,
    ucd_only: d.ucd_only.length,
    unexplained: d.unexplained.length,
  };
  await writeFile("data/wine-map/usa-ava-diff.json", `${JSON.stringify({
    _generated_by: "scripts/wine-map-sources/usa-ava-diff.mjs",
    _inputs: inputs,
    counts,
    matched: d.matched,
    renamed: d.renamed,
    ttb_only: d.ttb_only,
    ucd_only: d.ucd_only,
  }, null, 2)}\n`);
  console.log(JSON.stringify(counts));
  for (const x of d.unexplained) console.error(`UNEXPLAINED ${x.ucd_id} (${x.name}, ${x.cfr ?? "no CFR"})`);
  process.exit(d.unexplained.length === 0 ? 0 : 1);
}
