// mountTarget decides which region shards are mounted (spec 2026-09-23 §7.4).
// All countries is today's rule. One country mounts only the focus country's
// shards below z8, which is what makes the default genuinely lighter on the
// first zoom. Bboxes are the live manifest's.
import { describe, expect, it } from "vitest";
import {
  countryOfShard,
  keepAcrossSync,
  mountTarget,
  NEIGHBOUR_MIN_ZOOM,
  SHARD_MIN_ZOOM,
  type MountInput,
} from "./mount-policy";
import type { Bbox } from "./shard-specs";

const SHARDS: MountInput["shards"] = [
  ["alsace", { bbox: [7.051, 47.79, 7.612, 48.701] }],
  ["baden", { bbox: [7.521, 47.546, 9.768, 49.786] }],
  ["bourgogne", { bbox: [3.609, 46.243, 5.005, 47.885] }],
  // A transitional v1 shard: no bbox, no country. It is never hidden.
  ["legacy", {}],
  ["pfalz", { bbox: [7.943, 49.03, 8.418, 49.67] }],
  ["toscana", { bbox: [9.706, 42.238, 12.368, 44.472] }],
];
const COUNTRIES: Record<string, string> = {
  alsace: "france",
  baden: "germany",
  bourgogne: "france",
  pfalz: "germany",
  toscana: "italy",
};
// Colmar: Alsace in the middle, Baden's bbox across the Rhine, Pfalz and
// Bourgogne just outside the 50% pad.
const COLMAR: Bbox = [7.0, 47.9, 7.6, 48.3];
// West of Colmar: Alsace inside the 50% pad, Baden only inside the 150% keep.
const WEST_OF_COLMAR: Bbox = [6.5, 47.9, 7.0, 48.3];
// Far west: Alsace and Baden are past even the 150% keep; Bourgogne is in.
const FAR_WEST: Bbox = [5.0, 47.9, 5.5, 48.3];

function input(overrides: Partial<MountInput> = {}): MountInput {
  return {
    shards: SHARDS,
    view: COLMAR,
    zoom: 6,
    selectedShard: null,
    prev: new Set(),
    detail: "one",
    focusCountry: "france",
    shardCountries: COUNTRIES,
    ...overrides,
  };
}

describe("mountTarget", () => {
  it("1. names the zoom floors", () => {
    expect(SHARD_MIN_ZOOM).toBe(5);
    expect(NEIGHBOUR_MIN_ZOOM).toBe(8);
  });

  it("2. mounts nothing below z5 but the selected shard, whatever was mounted before", () => {
    expect(mountTarget(input({ zoom: 4.4 }))).toEqual([]);
    expect(mountTarget(input({ zoom: 4.4, selectedShard: "bourgogne" }))).toEqual(["bourgogne"]);
    expect(
      mountTarget(input({ zoom: 4.99, prev: new Set(["alsace", "baden"]) })),
    ).toEqual([]);
  });

  it("3. All countries is today's rule: every shard in the 50% pad at z >= 5", () => {
    expect(mountTarget(input({ detail: "all" }))).toEqual(["alsace", "baden", "legacy"]);
    expect(mountTarget(input({ detail: "all", focusCountry: null }))).toEqual([
      "alsace",
      "baden",
      "legacy",
    ]);
  });

  it("4. One country mounts only the focus country's shards below z8", () => {
    expect(mountTarget(input())).toEqual(["alsace", "legacy"]);
    expect(mountTarget(input({ zoom: 7.99 }))).toEqual(["alsace", "legacy"]);
    expect(mountTarget(input({ focusCountry: "germany" }))).toEqual(["baden", "legacy"]);
  });

  it("5. One country mounts other countries' shards from z8", () => {
    expect(mountTarget(input({ zoom: NEIGHBOUR_MIN_ZOOM }))).toEqual([
      "alsace",
      "baden",
      "legacy",
    ]);
  });

  it("6. One country with no focus mounts no known-country shard below z8", () => {
    expect(mountTarget(input({ focusCountry: null }))).toEqual(["legacy"]);
  });

  it("7. an unknown country (tree not loaded) keeps today's rule in One country", () => {
    // Review Focus "Tree never arrives": a failed or slow tree must never cost
    // detail, so every shard mounts exactly as it does in All countries.
    expect(mountTarget(input({ shardCountries: {} }))).toEqual(["alsace", "baden", "legacy"]);
  });

  it("8. always mounts the selected shard, even another country's, but only if the manifest has it", () => {
    expect(mountTarget(input({ selectedShard: "toscana" }))).toEqual([
      "alsace",
      "legacy",
      "toscana",
    ]);
    expect(mountTarget(input({ selectedShard: "atlantis" }))).toEqual(["alsace", "legacy"]);
  });

  it("9. keeps a mounted shard until it leaves the 150% pad, whichever country it is", () => {
    // Baden is outside the 50% pad here but inside 150%. A focus flip at a
    // border must not unmount and refetch it.
    expect(
      mountTarget(input({ view: WEST_OF_COLMAR, prev: new Set(["alsace", "baden"]) })),
    ).toEqual(["alsace", "baden", "legacy"]);
    expect(mountTarget(input({ view: WEST_OF_COLMAR, prev: new Set(["alsace"]) }))).toEqual([
      "alsace",
      "legacy",
    ]);
    expect(mountTarget(input({ view: WEST_OF_COLMAR, detail: "all" }))).toEqual([
      "alsace",
      "legacy",
    ]);
  });

  it("10. drops a kept shard once it is past the 150% pad", () => {
    expect(
      mountTarget(input({ view: FAR_WEST, prev: new Set(["alsace", "baden"]) })),
    ).toEqual(["bourgogne", "legacy"]);
  });

  it("11. returns a sorted list that does not depend on the input order", () => {
    const reversed = [...SHARDS].reverse();
    expect(mountTarget(input({ shards: reversed, detail: "all" }))).toEqual(
      mountTarget(input({ detail: "all" })),
    );
  });
});

describe("countryOfShard", () => {
  it("reads own properties only", () => {
    expect(countryOfShard(COUNTRIES, "baden")).toBe("germany");
    expect(countryOfShard(COUNTRIES, "legacy")).toBeNull();
    expect(countryOfShard(COUNTRIES, "constructor")).toBeNull();
    expect(countryOfShard(COUNTRIES, "__proto__")).toBeNull();
  });
});

describe("keepAcrossSync", () => {
  // What All countries mounts at Colmar z6 (case 3).
  const MOUNTED_IN_ALL = ["alsace", "baden", "legacy"];

  it("hands the mounted set on while the mode holds", () => {
    expect([...keepAcrossSync(MOUNTED_IN_ALL, "one", "one")]).toEqual(MOUNTED_IN_ALL);
    expect([...keepAcrossSync(MOUNTED_IN_ALL, "all", "all")]).toEqual(MOUNTED_IN_ALL);
  });

  it("drops it on a mode change, so One country unmounts the neighbours at once", () => {
    expect(keepAcrossSync(MOUNTED_IN_ALL, "all", "one").size).toBe(0);
    expect(mountTarget(input({ detail: "all" }))).toEqual(MOUNTED_IN_ALL);
    // Switched to One at the same view: the 150% keep would otherwise hold
    // Baden (it is inside the pad), mounted for nothing until a long pan.
    expect(
      mountTarget(input({ prev: keepAcrossSync(MOUNTED_IN_ALL, "all", "one") })),
    ).toEqual(["alsace", "legacy"]);
    // A later sync in One country keeps it, as case 9 pins for a border pan.
    expect(
      mountTarget(input({ prev: keepAcrossSync(MOUNTED_IN_ALL, "one", "one") })),
    ).toEqual(MOUNTED_IN_ALL);
  });

  it("switching to All loses nothing: All mounts every shard in the pad anyway", () => {
    expect(
      mountTarget(
        input({ detail: "all", prev: keepAcrossSync(["alsace", "legacy"], "one", "all") }),
      ),
    ).toEqual(MOUNTED_IN_ALL);
  });
});
