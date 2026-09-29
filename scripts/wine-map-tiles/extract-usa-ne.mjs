// Extract the United States (lower 48) and the state outlines the USA tree
// needs from Natural Earth 1:50m "_lakes" files into repo artifacts (spec
// 2026-09-29 §5.2, §5.3). Mirrors extract-portugal-ne.mjs. The _lakes variants
// are used because in the plain ones the Great Lakes are land of the US and of
// New York, so the fills would paint Lake Erie and Lake Ontario.
//
// Wave states become REGION places in US-2. Check-only states (Idaho,
// Pennsylvania, Ohio, …) are geometry for the dominance and containment
// measurement only and never become places.
//
// Usage: node scripts/wine-map-tiles/extract-usa-ne.mjs extract
//   (reads the pinned local copies listed in data/wine-map/usa-sources.json)
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sha256hex } from "./lib.mjs";
import { lower48, pointInPolygons, polygonsOf, roundPolygon } from "./usa-ne-lib.mjs";
import { splitList } from "../wine-map-sources/usa-ava-lib.mjs";

const RAW_PATH = "data/wine-map/united-states-ne50m-raw.geojson";
const NORM_PATH = "data/wine-map/united-states-lower48-ne50m.geojson";
const STATES_PATH = "data/wine-map/usa-states-ne50m.geojson";
const CONFIG_PATH = "data/wine-map/usa-tree-config.json";
const PRECISION = 4;

if (process.argv[2] !== "extract") throw new Error("mode must be extract");
const pins = JSON.parse(await readFile("data/wine-map/usa-sources.json", "utf8")).sources;
const pinOf = (name) => {
  const pin = pins.find((s) => s.name === name);
  assert.ok(pin, `${name} is not pinned in usa-sources.json`);
  return pin;
};
const admin0Pin = pinOf("ne_50m_admin_0_countries_lakes.geojson");
const admin1Pin = pinOf("ne_50m_admin_1_states_provinces_lakes.geojson");
const admin0Buf = await readFile(admin0Pin.local_path);
const admin1Buf = await readFile(admin1Pin.local_path);
assert.equal(sha256hex(admin0Buf), admin0Pin.sha256, `${admin0Pin.local_path} no longer matches its pin`);
assert.equal(sha256hex(admin1Buf), admin1Pin.sha256, `${admin1Pin.local_path} no longer matches its pin`);
const admin0 = JSON.parse(admin0Buf.toString("utf8"));
const admin1 = JSON.parse(admin1Buf.toString("utf8"));
const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const wave = Object.keys(config.wave_states);

// Country.
const usa = admin0.features.find((f) => f.properties?.ADM0_A3 === "USA");
assert.ok(usa, "United States (ADM0_A3=USA) not found");
const all = polygonsOf(usa.geometry);
const kept = lower48(usa.geometry).map((p) => roundPolygon(p, PRECISION)).filter(Boolean);
assert.ok(kept.length > 0, "no lower-48 component survived");
for (const [label, point, want] of [
  ["Kansas", [-98, 38.5], true],
  ["Long Island", [-72.9, 40.85], true],
  ["Lake Erie", [-81.2, 42.2], false],
  ["Lake Michigan", [-87.0, 43.5], false],
  ["Alaska", [-150, 61], false],
  ["Hawaii", [-157.8, 21.3], false],
]) {
  assert.equal(pointInPolygons(point, kept), want, `${label} ${want ? "must" : "must not"} be in the lower-48 outline`);
}
for (const [label, point] of [["San Juan Islands", [-123.03, 48.53]], ["Santa Cruz Island", [-119.75, 34.0]]]) {
  const present = pointInPolygons(point, all);
  if (present) assert.ok(pointInPolygons(point, kept), `${label} is in the NE outline but the filter dropped it`);
  console.log(`${label}: ${present ? "kept" : "not drawn at 1:50m"}`);
}

// States: the four wave states, the configured check-only ones, and every state
// a UC Davis file names (so a cross-state AVA is always measured against every
// state it touches).
const usStates = admin1.features.filter((f) => f.properties?.adm0_a3 === "USA");
const nameToCode = Object.fromEntries(usStates.map((f) => [f.properties.name, f.properties.postal]));
const named = new Set();
for (const pin of pins.filter((s) => s.set === "ucd")) {
  for (const f of JSON.parse(await readFile(pin.local_path, "utf8")).features) {
    for (const token of splitList(f.properties?.state)) {
      const code = /^[A-Z]{2}$/.test(token) ? token : nameToCode[token];
      assert.ok(code, `UC Davis names an unknown state "${token}"`);
      named.add(code);
    }
  }
}
const wanted = [...new Set([...wave, ...config.check_only_states])].sort();
const missing = [...named].filter((code) => !wanted.includes(code));
assert.equal(missing.length, 0, `add ${missing.join(", ")} to check_only_states in ${CONFIG_PATH}`);
const features = wanted.map((code) => {
  const f = usStates.find((x) => x.properties.postal === code);
  assert.ok(f, `state ${code} not found in admin-1`);
  const polygons = polygonsOf(f.geometry).map((p) => roundPolygon(p, PRECISION)).filter(Boolean);
  return {
    type: "Feature",
    properties: { code, name: f.properties.name, role: wave.includes(code) ? "wave" : "check-only" },
    geometry: { type: "MultiPolygon", coordinates: polygons },
  };
});
const stateGeom = (code) => features.find((f) => f.properties.code === code).geometry.coordinates;
assert.ok(pointInPolygons([-122.3, 38.4], stateGeom("CA")), "Napa must be in California");
assert.ok(pointInPolygons([-73.97, 40.78], stateGeom("NY")), "Manhattan must be in New York");
for (const code of ["NY", "OH", "PA"]) {
  assert.equal(pointInPolygons([-81.2, 42.2], stateGeom(code)), false, `mid Lake Erie must not be in ${code}`);
}

await writeFile(RAW_PATH, `${JSON.stringify(usa)}\n`);
await writeFile(NORM_PATH, `${JSON.stringify({
  type: "Feature",
  properties: {
    source: "Natural Earth 1:50m admin_0_countries_lakes ADM0_A3=USA",
    commit: admin0Pin.commit,
    raw_sha256: admin0Pin.sha256,
    filter: "components whose outer ring lies fully inside lon [-125,-66.5], lat [24,49.5] (the lower 48; Alaska and Hawaii excluded)",
    precision: PRECISION,
  },
  geometry: { type: "MultiPolygon", coordinates: kept },
})}\n`);
await writeFile(STATES_PATH, `${JSON.stringify({
  type: "FeatureCollection",
  _provenance: {
    source: "Natural Earth 1:50m admin_1_states_provinces_lakes (public domain)",
    commit: admin1Pin.commit,
    raw_sha256: admin1Pin.sha256,
    use: "wave states become REGION places in US-2; check-only states are measurement geometry and never become places (spec §5.3)",
    precision: PRECISION,
  },
  features,
})}\n`);

console.log(`COMPONENTS total=${all.length} kept=${kept.length} points=${kept.flat(2).length}`);
console.log(`STATES ${features.map((f) => `${f.properties.code}:${f.properties.role}`).join(" ")}`);
for (const p of [RAW_PATH, NORM_PATH, STATES_PATH]) console.log(`${p} sha256=${sha256hex(await readFile(p))}`);
