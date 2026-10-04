// One scoped hunk of data/wine-map/boundary-expectations.json, and only that
// hunk (spec 2026-09-29 §12; plan 2026-09-29-usa-wine-map-us2 Task 13; widened
// for the fp-1 footprint waves, review 2026-10-04 F5).
// generate-boundary-expectations.mjs rewrites the whole file from live, which
// would also commit any other place's live-but-unpinned rows: the friend's
// drift, never ours to commit. This takes the in-scope rows from live and keeps
// every other row of the committed file byte for byte, in the live order (the
// boundary-expectations test compares in that order). It reports the out-of-scope
// differences instead.
//
// The scope (default united-states): --scope <key prefix>[,<key prefix>...]
// (a whole country or region), or --keys-from <footprints review file>: exactly
// the places that wave changed (a footprint promote turns a cleaned MANUAL row
// into GENERALIZED_FROM_OFFICIAL_SOURCE, so its pin moves; nothing else does).
//
//   node --env-file=.env.local scripts/usa-map/splice-boundary-expectations.mjs [scope]
//     read-only: prints the in-scope row count and the out-of-scope differences.
//   ... --check data/wine-map/review/usa-us2-expected-boundaries.json
//     also fails unless the live in-scope rows equal that file (the rehearsal's).
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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A scope predicate over rows: key prefixes (a whole segment-wise subtree each), or an exact key set. */
export function scopeOf({ prefixes = [], keys = null } = {}) {
  if (keys) {
    const set = new Set(keys);
    return (r) => set.has(r.canonical_key);
  }
  if (!prefixes.length) throw new Error("an empty scope");
  return (r) => prefixes.some((p) => r.canonical_key === p || r.canonical_key.startsWith(`${p}.`));
}
const inCountry = (country) => scopeOf({ prefixes: [country] });

/** The keys whose rows differ (changed, added or removed) between two row lists. */
function diffKeys(a, b) {
  const am = new Map(a.map((r) => [r.canonical_key, r]));
  const bm = new Map(b.map((r) => [r.canonical_key, r]));
  const keys = new Set([...am.keys(), ...bm.keys()]);
  return [...keys].filter((k) => !am.has(k) || !bm.has(k) || !same(am.get(k), bm.get(k))).sort();
}

/**
 * The spliced rows: in-scope rows from live, every other row as committed, in the
 * live order; a committed out-of-scope row live no longer has stays (after its
 * committed predecessor), and a live out-of-scope row the file lacks stays out.
 */
export function spliceScope(existing, fresh, mine) {
  const committed = new Map(existing.map((r) => [r.canonical_key, r]));
  const rows = [];
  for (const r of fresh) {
    if (mine(r)) rows.push(r);
    else if (committed.has(r.canonical_key)) rows.push(committed.get(r.canonical_key));
  }
  const live = new Set(fresh.map((r) => r.canonical_key));
  let after = null;
  for (const r of existing) {
    if (mine(r)) continue;
    if (!live.has(r.canonical_key)) {
      const at = after === null ? 0 : rows.findIndex((x) => x.canonical_key === after) + 1;
      rows.splice(at, 0, r);
    }
    after = r.canonical_key;
  }
  const otherCountryDiffs = diffKeys(existing.filter((r) => !mine(r)), fresh.filter((r) => !mine(r)));
  return { rows, otherCountryDiffs };
}

export function spliceCountry(existing, fresh, country) {
  return spliceScope(existing, fresh, inCountry(country));
}

/** The in-scope keys whose live rows differ from the expected hunk (either direction). */
export function compareHunk(expected, fresh, country = "united-states", mine = inCountry(country)) {
  return diffKeys(expected.filter(mine), fresh.filter(mine));
}

export const serialize = (rows) => `${JSON.stringify(rows, null, 2)}\n`;

/** The scope from argv: --keys-from <review file> (its changed places), --scope a,b, or united-states. */
export async function scopeFromArgs(argv, read = (p) => readFile(p, "utf8")) {
  const at = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  if (at("--keys-from")) {
    const review = JSON.parse(await read(at("--keys-from")));
    const keys = review.places.filter((p) => p.changed).map((p) => p.key);
    return { label: `${keys.length} changed place(s) of ${at("--keys-from")}`, mine: scopeOf({ keys }) };
  }
  const prefixes = (at("--scope") ?? "united-states").split(",").map((s) => s.trim()).filter(Boolean);
  return { label: prefixes.join(", "), mine: scopeOf({ prefixes }) };
}

async function main() {
  const argv = process.argv.slice(2);
  const checkPath = argv.includes("--check") ? argv[argv.indexOf("--check") + 1] : null;
  const write = argv.includes("--write");
  const { label, mine } = await scopeFromArgs(argv);
  const { withReadOnly } = await import("../wine-map-sources/read-only-client.mjs");
  const fresh = await withReadOnly(async (c) => (await c.query(EXPECTATIONS_SQL)).rows);
  const existing = JSON.parse(await readFile(EXPECTATIONS_PATH, "utf8"));
  const { rows, otherCountryDiffs } = spliceScope(existing, fresh, mine);
  console.log(`scope ${label}: ${fresh.filter(mine).length} live rows; out-of-scope differences: ${otherCountryDiffs.length}`);
  if (otherCountryDiffs.length) console.log(`  (not ours to commit) ${otherCountryDiffs.join(", ")}`);
  if (checkPath) {
    const expected = JSON.parse(await readFile(checkPath, "utf8"));
    const off = compareHunk(expected, fresh, null, mine);
    if (off.length) {
      console.error(`CHECK FAILED: live in-scope rows differ from ${checkPath}: ${off.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`CHECK OK: the live in-scope rows equal ${checkPath}`);
  }
  if (write) {
    await writeFile(EXPECTATIONS_PATH, serialize(rows));
    console.log(`WROTE ${EXPECTATIONS_PATH} (${rows.length} rows; scope ${label} only)`);
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
