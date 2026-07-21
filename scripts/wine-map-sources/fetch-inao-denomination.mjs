// Fetch one denomination set from the INAO parcel layer: page the WFS with
// a LIKE bound per member, filter to exact membership client-side, retain
// the UNMODIFIED page bodies in Storage, and write the filtered parcels +
// manifest locally for build-boundary.mjs. Read-only against the WFS; no
// database writes here (source/snapshot rows are created at build time,
// when the normalized artifact exists).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { releaseVersion, sha256hex } from "../wine-map-tiles/lib.mjs";
import {
  assertKnownDenominations,
  loadMembership,
  parcelMatches,
  rawObjectPath,
  uploadRawObject,
  wfsPageUrl,
  PAGE_SIZE,
  WFS_BASE,
} from "./inao-lib.mjs";

function arg(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? null : process.argv[index + 1];
  if (required) assert.ok(value, `--${name} is required`);
  return value;
}

const slug = arg("slug");
const targetKey = arg("target-key");
const members = arg("members")
  .split(";")
  .map((name) => name.trim())
  .filter(Boolean);
assert.ok(/^[a-z0-9-]+$/.test(slug), "slug must be kebab-case");
assert.ok(members.length > 0, "at least one member denomination");

const membership = await loadMembership();
assertKnownDenominations(members, membership);
const expectedMinimum = Math.max(...members.map((m) => membership.get(m)));

const revision = releaseVersion();
const workDir = path.resolve(".tiles-build", "sources");
await mkdir(workDir, { recursive: true });

const featuresById = new Map();
const pages = [];
for (const member of members) {
  const memberSlug = member
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  let startIndex = 0;
  for (;;) {
    const url = wfsPageUrl(member, startIndex);
    const response = await fetch(url);
    assert.equal(response.status, 200, `WFS ${response.status} for ${member}`);
    const text = await response.text();
    // Raw pages are retained gzipped: regional LIKE bounds pull hundreds of
    // MB of GeoJSON, ~8-10x smaller compressed. The checksum covers the
    // stored (gzipped) bytes; the page is still the unmodified response —
    // gunzip reproduces it exactly.
    const gzipped = gzipSync(Buffer.from(text));
    const objectPath = rawObjectPath(
      revision,
      slug,
      `${memberSlug}-page-${startIndex / PAGE_SIZE}.json.gz`,
    );
    await uploadRawObject(objectPath, gzipped, "application/gzip");
    const page = JSON.parse(text);
    const features = page.features ?? [];
    pages.push({
      member,
      object_path: objectPath,
      content_encoding: "gzip",
      bytes: gzipped.byteLength,
      uncompressed_bytes: Buffer.byteLength(text),
      checksum_sha256: sha256hex(gzipped),
      returned: features.length,
      total_matched: page.totalFeatures ?? page.numberMatched ?? null,
    });
    for (const feature of features) {
      if (!parcelMatches(feature.properties?.denom, member)) continue;
      featuresById.set(feature.id ?? feature.properties?.gml_id, feature);
    }
    startIndex += features.length;
    const totalMatched = page.totalFeatures ?? page.numberMatched ?? null;
    if (features.length === 0) break;
    if (totalMatched !== null && startIndex >= totalMatched) break;
    if (totalMatched === null && features.length < PAGE_SIZE) break;
  }
}

assert.ok(
  featuresById.size >= expectedMinimum,
  `filtered ${featuresById.size} parcels < expected minimum ${expectedMinimum}`,
);

const manifest = {
  source: WFS_BASE,
  slug,
  target_key: targetKey,
  members,
  revision,
  retrieved_at: new Date().toISOString(),
  page_size: PAGE_SIZE,
  pages,
  filtered_parcels: featuresById.size,
};
const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
const manifestPath = rawObjectPath(revision, slug, "fetch-manifest.json");
await uploadRawObject(manifestPath, manifestBody);

await writeFile(
  path.join(workDir, `${slug}-fetch-manifest.json`),
  `${JSON.stringify(
    { ...manifest, manifest_object_path: manifestPath, manifest_checksum_sha256: sha256hex(manifestBody) },
    null,
    2,
  )}\n`,
);
await writeFile(
  path.join(workDir, `${slug}-parcels.geojson`),
  `${JSON.stringify({ type: "FeatureCollection", features: [...featuresById.values()] })}\n`,
);
console.log(
  `FETCHED ${slug} members=${members.length} parcels=${featuresById.size} revision=${revision}`,
);
