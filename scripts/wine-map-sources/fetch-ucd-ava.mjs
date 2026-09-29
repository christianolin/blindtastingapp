// Download the approved US sources at a pinned commit into .tiles-build/usa/
// (gitignored: raw files never enter git), and record or verify their sha256
// pins in data/wine-map/usa-sources.json (spec 2026-09-29 §5.1, §5.2).
// US-0 writes nothing live and nothing to Storage; US-2's stage run uploads
// these to the private wine-map-sources bucket as its first step.
//
// Usage:
//   node scripts/wine-map-sources/fetch-ucd-ava.mjs --set ucd --commit <40-hex> --pin
//   node scripts/wine-map-sources/fetch-ucd-ava.mjs --set ne  --commit <40-hex> --pin
//   node scripts/wine-map-sources/fetch-ucd-ava.mjs --set ucd --commit <40-hex>   (re-fetch, must match the pins)
//   node scripts/wine-map-sources/fetch-ucd-ava.mjs --verify                      (re-hash local copies, no network)
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkPinnedBody, githubRawUrl, parseFeatureCollection } from "./pinned-fetch.mjs";

const PINS = "data/wine-map/usa-sources.json";
const SETS = {
  ucd: {
    owner: "UCDavisLibrary",
    repo: "ava",
    licence: "CC0-1.0 (American Viticultural Areas Digitizing Project)",
    paths: [
      "avas_by_state/CA_avas.geojson",
      "avas_by_state/WA_avas.geojson",
      "avas_by_state/OR_avas.geojson",
      "avas_by_state/NY_avas.geojson",
    ],
  },
  ne: {
    owner: "nvkelso",
    repo: "natural-earth-vector",
    licence: "Public domain (Natural Earth)",
    paths: [
      "geojson/ne_50m_admin_0_countries_lakes.geojson",
      "geojson/ne_50m_admin_1_states_provinces_lakes.geojson",
    ],
  },
};
// Sizes the spec read from the GitHub API on 2026-09-29: a tripwire, not a pin.
const SPEC_SIZES = {
  "avas_by_state/CA_avas.geojson": 16129799,
  "avas_by_state/WA_avas.geojson": 3728958,
  "avas_by_state/OR_avas.geojson": 7128533,
  "avas_by_state/NY_avas.geojson": 1525079,
  "geojson/ne_50m_admin_0_countries_lakes.geojson": 3138521,
  "geojson/ne_50m_admin_1_states_provinces_lakes.geojson": 2357849,
};

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const readPins = async () =>
  existsSync(PINS)
    ? JSON.parse(await readFile(PINS, "utf8"))
    : {
        _note:
          "Raw downloads for the USA map (spec 2026-09-29 §5). The files live under .tiles-build/usa/ and never enter git; each is identified by its commit and checked by size and sha256 (uppercase hex). Written by scripts/wine-map-sources/fetch-ucd-ava.mjs.",
        sources: [],
      };

if (process.argv.includes("--verify")) {
  const pins = await readPins();
  let bad = 0;
  for (const s of pins.sources) {
    try {
      checkPinnedBody(await readFile(s.local_path), s);
      console.log(`OK ${s.local_path}`);
    } catch (error) {
      bad += 1;
      console.error(`BAD ${s.local_path}: ${error.message}`);
    }
  }
  process.exit(bad === 0 && pins.sources.length > 0 ? 0 : 1);
}

const setName = arg("--set");
const set = Object.hasOwn(SETS, setName ?? "") ? SETS[setName] : null;
if (!set) throw new Error(`--set must be one of ${Object.keys(SETS).join(", ")}`);
const commit = arg("--commit");
const pinMode = process.argv.includes("--pin");
const pins = await readPins();
for (const p of set.paths) {
  const url = githubRawUrl({ owner: set.owner, repo: set.repo, commit, path: p });
  const existing = pins.sources.find((s) => s.url === url) ?? null;
  if (!existing && !pinMode) throw new Error(`${url} has no pin; rerun with --pin to record one`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { bytes, sha256 } = checkPinnedBody(buffer, existing);
  parseFeatureCollection(buffer);
  if (SPEC_SIZES[p] !== undefined && SPEC_SIZES[p] !== bytes) {
    console.warn(`NOTE ${p}: ${bytes} B, the spec read ${SPEC_SIZES[p]} B on 2026-09-29 (a newer commit?)`);
  }
  const out = path.posix.join(".tiles-build", "usa", setName, commit, path.posix.basename(p));
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, buffer);
  if (!existing) {
    pins.sources.push({
      set: setName,
      name: path.posix.basename(p),
      repo: `${set.owner}/${set.repo}`,
      commit,
      path: p,
      url,
      licence: set.licence,
      bytes,
      sha256,
      retrieved_at: new Date().toISOString(),
      local_path: out,
    });
  }
  console.log(`${existing ? "VERIFIED" : "PINNED"} ${p} ${bytes} B sha256=${sha256}`);
}
pins.sources.sort((a, b) => a.url.localeCompare(b.url));
await writeFile(PINS, `${JSON.stringify(pins, null, 2)}\n`);
