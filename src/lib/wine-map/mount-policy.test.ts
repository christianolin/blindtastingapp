// The rendered shard set walks toward the target a few shards per frame, so
// the first zoom past z5 never mounts 36-67 sources in one task. These pin the
// step's rules: removals at once, a bounded number of additions, the selected
// shard first, shard order, and identity on a no-op so setState bails out.
import { describe, expect, it } from "vitest";
import { nextMountStep } from "./mount-policy";

// Real shard keys, including the hyphenated ones whose order depends on the
// comparator (TileWineMap sorts shard keys with localeCompare).
const FRANCE = [
  "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
  "jura", "languedoc-roussillon", "loire", "provence", "rhone", "savoie",
  "sud-ouest",
];

/** Steps until nothing changes, returning every intermediate set. */
function walk(
  current: string[],
  target: string[],
  opts: { maxAdds: number; first: string | null },
): string[][] {
  const steps: string[][] = [];
  let at = current;
  for (let i = 0; i < 100; i += 1) {
    const next = nextMountStep(at, target, opts);
    if (next === at) return steps;
    steps.push(next);
    at = next;
  }
  throw new Error("never settled");
}

describe("nextMountStep", () => {
  it("adds at most maxAdds shards per step, in shard order, until it reaches the target", () => {
    const steps = walk([], FRANCE, { maxAdds: 3, first: null });
    expect(steps).toEqual([
      ["alsace", "beaujolais", "bordeaux"],
      ["alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse"],
      [
        "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
        "jura", "languedoc-roussillon", "loire",
      ],
      [
        "alsace", "beaujolais", "bordeaux", "bourgogne", "champagne", "corse",
        "jura", "languedoc-roussillon", "loire", "provence", "rhone", "savoie",
      ],
      FRANCE,
    ]);
  });

  it("mounts the selected shard in the first step, ahead of the others", () => {
    const step = nextMountStep([], FRANCE, { maxAdds: 3, first: "savoie" });
    expect(step).toEqual(["alsace", "beaujolais", "savoie"]);
  });

  it("ignores a `first` that is already mounted or not wanted", () => {
    expect(
      nextMountStep(["savoie"], FRANCE, { maxAdds: 2, first: "savoie" }),
    ).toEqual(["alsace", "beaujolais", "savoie"]);
    expect(
      nextMountStep([], ["alsace", "loire"], { maxAdds: 1, first: "toscana" }),
    ).toEqual(["alsace"]);
  });

  it("removes every unwanted shard at once, whatever the add budget", () => {
    const current = ["alsace", "bordeaux", "bourgogne", "loire", "rhone"];
    expect(nextMountStep(current, ["bourgogne"], { maxAdds: 3, first: null })).toEqual([
      "bourgogne",
    ]);
    expect(nextMountStep(current, [], { maxAdds: 0, first: null })).toEqual([]);
  });

  it("removes and adds in the same step", () => {
    const step = nextMountStep(
      ["alsace", "bordeaux"],
      ["bordeaux", "corse", "jura", "loire", "rhone", "savoie"],
      { maxAdds: 3, first: null },
    );
    expect(step).toEqual(["bordeaux", "corse", "jura", "loire"]);
  });

  it("returns `current` itself when the step changes nothing", () => {
    const current = ["bordeaux", "bourgogne"];
    expect(nextMountStep(current, ["bourgogne", "bordeaux"], { maxAdds: 3, first: null })).toBe(
      current,
    );
    // Zero budget and nothing to remove: also a no-op.
    expect(nextMountStep(current, [...current, "loire"], { maxAdds: 0, first: null })).toBe(
      current,
    );
  });

  it("sorts with localeCompare, the order TileWineMap renders shards in", () => {
    const target = ["la-rioja", "languedoc-roussillon", "castilla-y-leon", "castilla-la-mancha"];
    const step = nextMountStep([], target, { maxAdds: 10, first: null });
    expect(step).toEqual([...target].sort((a, b) => a.localeCompare(b)));
  });

  it("ignores duplicates in the target", () => {
    expect(
      nextMountStep([], ["loire", "loire", "alsace"], { maxAdds: 3, first: null }),
    ).toEqual(["alsace", "loire"]);
  });
});
