// UC Davis per-state AVA files -> committed, sha256-pinnable normalized
// artifacts (spec 2026-09-29 §5.3): current boundaries only, properties
// trimmed, Douglas-Peucker 0.0001° per ring, 5 decimals, NAD83 read as WGS84
// (D10). A cross-state AVA stays in every state file UC Davis puts it in;
// measure-usa-ava.mjs dedupes by ava_id and requires the geometry to agree.
//
// Usage: node scripts/wine-map-sources/normalize-ucd-ava.mjs
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sha256hex } from "../wine-map-tiles/lib.mjs";
import {
  KEPT_PROPERTIES, REQUIRED_UCD_PROPERTIES, isCurrent, simplifyGeometry, trimProperties,
} from "./usa-ava-lib.mjs";

const FILES = {
  "CA_avas.geojson": "california",
  "WA_avas.geojson": "washington",
  "OR_avas.geojson": "oregon",
  "NY_avas.geojson": "new-york",
};
const TOLERANCE = 0.0001;
const DECIMALS = 5;
const BUDGET = 10_000_000;

const pins = JSON.parse(await readFile("data/wine-map/usa-sources.json", "utf8")).sources.filter((s) => s.set === "ucd");
assert.equal(pins.length, 4, "expected four pinned UC Davis files");
let total = 0;
for (const pin of pins) {
  const slug = FILES[pin.name];
  assert.ok(slug, `unexpected UC Davis file ${pin.name}`);
  const buffer = await readFile(pin.local_path);
  assert.equal(sha256hex(buffer), pin.sha256, `${pin.local_path} no longer matches its pin`);
  const raw = JSON.parse(buffer.toString("utf8"));
  for (const f of raw.features) {
    for (const key of REQUIRED_UCD_PROPERTIES) {
      assert.ok(Object.hasOwn(f.properties ?? {}, key),
        `${pin.name}: a feature lacks "${key}" (it has ${Object.keys(f.properties ?? {}).join(", ")})`);
    }
    assert.ok(f.geometry, `${pin.name}: ${f.properties.ava_id} has no geometry`);
  }
  const current = raw.features.filter((f) => isCurrent(f.properties));
  const seen = new Set();
  const features = current
    .map((f) => {
      const id = f.properties.ava_id;
      assert.ok(!seen.has(id), `${pin.name}: ${id} has two current boundaries`);
      seen.add(id);
      return { type: "Feature", properties: trimProperties(f.properties), geometry: simplifyGeometry(f.geometry, TOLERANCE, DECIMALS) };
    })
    .sort((a, b) => a.properties.ava_id.localeCompare(b.properties.ava_id));
  const out = {
    type: "FeatureCollection",
    _provenance: {
      source: "UC Davis Library, American Viticultural Areas Digitizing Project (github.com/UCDavisLibrary/ava)",
      commit: pin.commit,
      raw_file: pin.path,
      raw_bytes: pin.bytes,
      raw_sha256: pin.sha256,
      licence: pin.licence,
      method: `current boundaries only (valid_end empty); properties trimmed to ${KEPT_PROPERTIES.join(", ")}; Douglas-Peucker ${TOLERANCE}° per ring (under the 12.2 m accuracy of the USGS 1:24,000 base); coordinates rounded to ${DECIMALS} decimals. A generalized digitization of 27 CFR Part 9, not TTB's legal boundary.`,
      crs: { crs_in: "EPSG:4269", crs_out: "EPSG:4326", transform: "identity" },
      generated_at: new Date().toISOString().slice(0, 10),
    },
    features,
  };
  const path = `data/wine-map/usa-${slug}-ava.geojson`;
  const text = `${JSON.stringify(out)}\n`;
  await writeFile(path, text);
  total += Buffer.byteLength(text);
  console.log(`${path}: ${features.length} current of ${raw.features.length}, ${Buffer.byteLength(text)} B, sha256=${sha256hex(Buffer.from(text))}`);
}
console.log(`total ${total} B (budget ${BUDGET})`);
assert.ok(total <= BUDGET,
  "over the 10 MB budget: stop and report. Spec §5.3 moves California's artifact to the bucket, which is US-2 work; US-0 writes nothing to Storage.");
