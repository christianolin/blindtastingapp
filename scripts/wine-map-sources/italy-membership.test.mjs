// Guard the Italian comune membership against the geometry built from it.
//
// The failure this exists to catch is the one that made the Italian footprints
// unauditable in the first place: the shapes were committed and the lists that
// produced them were not, so nobody could tell whether a footprint still
// matched its membership. italy-doc-membership.json now holds the lists and
// build-italy-comuni-dissolved.mjs builds the shapes from them, which only
// helps while the two stay in step. Edit a comune list and forget to rebuild --
// or rebuild and forget to commit -- and the repo goes back to asserting
// something it cannot show.
//
// These checks are deliberately pure JSON. The full geometric proof is
// `build-italy-comuni-dissolved.mjs --verify`, which re-unions every footprint
// and compares areas, but that needs PostGIS and the 35 MB ISTAT gazetteer,
// and the gazetteer lives under the git-ignored .tiles-build/. Neither exists
// on a CI runner. comuni_count is the part of the relationship that CAN be
// checked from the repo alone, and it moves whenever the membership moves, so
// it catches the realistic desync. Run --verify by hand after any rebuild.
//
// Usage: node --test scripts/wine-map-sources/italy-membership.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MEMBERSHIP = "data/wine-map/italy-doc-membership.json";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const membership = read(MEMBERSHIP);
const splitKey = (k) => [k.slice(0, k.indexOf("/")), k.slice(k.indexOf("/") + 1)];

const artifacts = new Map();
const artifactFor = (slug) => {
  if (!artifacts.has(slug)) artifacts.set(slug, read(`data/wine-map/${slug}-comuni-dissolved.geojson`));
  return artifacts.get(slug);
};

test("every footprint has a feature, and its comuni_count matches the list", () => {
  for (const [key, fp] of Object.entries(membership.footprints)) {
    const [slug, name] = splitKey(key);
    const feat = artifactFor(slug).features.find((f) => f.properties.name === name);
    assert.ok(feat, `${key}: no feature of that name in ${slug}-comuni-dissolved.geojson`);
    assert.equal(
      feat.properties.comuni_count, fp.comuni.length,
      `${key}: the artifact was built from ${feat.properties.comuni_count} comuni but the membership `
      + `lists ${fp.comuni.length}. Re-run build-italy-comuni-dissolved.mjs "${key}", or `
      + `--sync-counts if only the count is stale.`,
    );
  }
});

test("every feature has a footprint, so no shape is unaccounted for", () => {
  const known = new Set(Object.keys(membership.footprints));
  for (const slug of new Set(Object.keys(membership.footprints).map((k) => splitKey(k)[0]))) {
    for (const f of artifactFor(slug).features) {
      assert.ok(known.has(`${slug}/${f.properties.name}`),
        `${slug}/${f.properties.name}: a committed footprint with no entry in ${MEMBERSHIP}`);
    }
  }
});

test("comune lists are well formed: unique 6-digit ISTAT codes, non-empty", () => {
  for (const [key, fp] of Object.entries(membership.footprints)) {
    assert.ok(fp.comuni.length > 0, `${key}: empty comune list`);
    const codes = fp.comuni.map((c) => c.istat);
    assert.equal(new Set(codes).size, codes.length,
      `${key}: duplicate ISTAT code(s) — ${codes.filter((c, i) => codes.indexOf(c) !== i).join(", ")}`);
    for (const c of fp.comuni) {
      assert.match(String(c.istat), /^\d{6}$/, `${key}: "${c.name}" has ISTAT code ${c.istat}`);
      assert.ok(c.name?.trim(), `${key}: a comune with ISTAT ${c.istat} has no name`);
    }
  }
});

test("every footprint carries an audit verdict, and none is left open", () => {
  // record-italy-audit.mjs writes "open" for anything the diff flagged that no
  // one has explained. Failing here is the point: an unexplained difference
  // against the EU register should block, not sit in a file being ignored.
  for (const [key, fp] of Object.entries(membership.footprints)) {
    assert.ok(fp.audit?.verdict, `${key}: no audit verdict — re-run record-italy-audit.mjs`);
    assert.notEqual(fp.audit.verdict, "open",
      `${key}: audit verdict is "open" — ${fp.audit.note ?? "resolve it against the disciplinare"}`);
  }
});
