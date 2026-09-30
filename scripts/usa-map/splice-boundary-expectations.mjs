// The united-states hunk of data/wine-map/boundary-expectations.json, and only
// that hunk (spec 2026-09-29 §12; plan 2026-09-29-usa-wine-map-us2 Task 13).
// generate-boundary-expectations.mjs rewrites the whole file from live, which
// would also commit any other country's live-but-unpinned rows: the friend's
// drift, never ours to commit. This keeps every non-US row of the committed
// file byte for byte, drops any united-states rows, and appends the fresh US
// rows in live order (united-states sorts after every other country prefix, in
// SQL and in JS). It reports the other countries' differences instead.
//
//   node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs
//     read-only: prints the US row count and the other-country differences.
//   ... --check data/wine-map/review/usa-us2-expected-boundaries.json
//     also fails unless the live US rows equal that file (the rehearsal's).
//   ... --write
//     writes the spliced data/wine-map/boundary-expectations.json (local file
//     only; with --check, only when the check passes).
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** generate-boundary-expectations.mjs's SELECT, verbatim. */
export const EXPECTATIONS_SQL = `select p.canonical_key, b.boundary_method, s.source_feature_id,
          snapshot.normalized_checksum_sha256,
          snapshot.raw_snapshot_uri,
          snapshot.raw_checksum_sha256,
          snapshot.provenance_note is not null documented
     from wine_place_boundaries b
     join wine_places p on p.id = b.wine_place_id
     join wine_boundary_source_snapshots snapshot
       on snapshot.id = b.source_snapshot_id
     join wine_boundary_sources s on s.id = snapshot.source_id
    where b.is_current
    order by p.canonical_key`;

export const EXPECTATIONS_PATH = "data/wine-map/boundary-expectations.json";
const inCountry = (country) => (r) => r.canonical_key === country || r.canonical_key.startsWith(`${country}.`);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The keys whose rows differ (changed, added or removed) between two row lists. */
function diffKeys(a, b) {
  const am = new Map(a.map((r) => [r.canonical_key, r]));
  const bm = new Map(b.map((r) => [r.canonical_key, r]));
  const keys = new Set([...am.keys(), ...bm.keys()]);
  return [...keys].filter((k) => !am.has(k) || !bm.has(k) || !same(am.get(k), bm.get(k))).sort();
}

export function spliceCountry(existing, fresh, country) {
  const mine = inCountry(country);
  const rows = [...existing.filter((r) => !mine(r)), ...fresh.filter(mine)];
  const otherCountryDiffs = diffKeys(existing.filter((r) => !mine(r)), fresh.filter((r) => !mine(r)));
  return { rows, otherCountryDiffs };
}

/** The US keys whose live rows differ from the expected hunk (either direction). */
export function compareHunk(expected, fresh, country = "united-states") {
  return diffKeys(expected.filter(inCountry(country)), fresh.filter(inCountry(country)));
}

export const serialize = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

async function main() {
  const argv = process.argv.slice(2);
  const checkPath = argv.includes("--check") ? argv[argv.indexOf("--check") + 1] : null;
  const write = argv.includes("--write");
  const { withReadOnly } = await import("../wine-map-sources/read-only-client.mjs");
  const fresh = await withReadOnly(async (c) => (await c.query(EXPECTATIONS_SQL)).rows);
  const existing = JSON.parse(await readFile(EXPECTATIONS_PATH, "utf8"));
  const { rows, otherCountryDiffs } = spliceCountry(existing, fresh, "united-states");
  const us = fresh.filter(inCountry("united-states"));
  console.log(`united-states rows: ${us.length}; other-country differences: ${otherCountryDiffs.length}`);
  if (otherCountryDiffs.length) console.log(`  (not ours to commit) ${otherCountryDiffs.join(", ")}`);
  if (checkPath) {
    const expected = JSON.parse(await readFile(checkPath, "utf8"));
    const off = compareHunk(expected, fresh);
    if (off.length) {
      console.error(`CHECK FAILED: live united-states rows differ from ${checkPath}: ${off.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`CHECK OK: the live united-states rows equal ${checkPath}`);
  }
  if (write) {
    await writeFile(EXPECTATIONS_PATH, serialize(rows));
    console.log(`WROTE ${EXPECTATIONS_PATH} (${rows.length} rows; united-states hunk only)`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
