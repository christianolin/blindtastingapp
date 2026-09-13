import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import {
  PLACE_LABEL,
  PLACE_MAX,
  PLACE_PLACEHOLDER,
  PLACE_TOO_LONG,
  getTastingPlace,
  normalisePlace,
  setTastingPlace,
} from "./place";

describe("normalisePlace (B12)", () => {
  it("trims and collapses whitespace", () => {
    expect(normalisePlace("  Christian's   place,\n Nørrebro ")).toEqual({ place: "Christian's place, Nørrebro" });
  });
  it("empty clears", () => {
    expect(normalisePlace("")).toEqual({ place: null });
    expect(normalisePlace(" \n ")).toEqual({ place: null });
  });
  it("200 characters at most", () => {
    expect(normalisePlace("x".repeat(200))).toEqual({ place: "x".repeat(200) });
    expect(normalisePlace("x".repeat(201))).toEqual({ error: PLACE_TOO_LONG });
    expect(PLACE_TOO_LONG).toBe("Keep the place under 200 characters.");
  });
});

// Beyond the plan's cases.
describe("normalisePlace edges", () => {
  it("counts characters the way Postgres char_length does, not UTF-16 units", () => {
    expect(normalisePlace("🍷".repeat(200))).toEqual({ place: "🍷".repeat(200) });
    expect(normalisePlace("🍷".repeat(201))).toEqual({ error: PLACE_TOO_LONG });
  });
  it("the cap applies after collapsing, so padding never refuses a short place", () => {
    expect(normalisePlace(`  Nørrebro${" ".repeat(300)}Copenhagen  `)).toEqual({ place: "Nørrebro Copenhagen" });
  });
  it("tabs and no-break spaces collapse too", () => {
    expect(normalisePlace("Vesterbro\t  7")).toEqual({ place: "Vesterbro 7" });
  });
  it("the row copy", () => {
    expect(PLACE_MAX).toBe(200);
    expect(PLACE_LABEL).toBe("Where?");
    expect(PLACE_PLACEHOLDER).toBe("a place or an address");
  });
});

type Call = { op: string; args: unknown[] };
type Result = { data?: unknown; error: { message: string } | null };

/** A query builder that records its chain and resolves to `result`. */
function fakeClient(result: Result) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const op of ["delete", "upsert", "select", "eq"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.maybeSingle = () => {
    calls.push({ op: "maybeSingle", args: [] });
    return Promise.resolve(result);
  };
  builder.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe("setTastingPlace", () => {
  it("a too-long place is refused before any write", async () => {
    const { client, calls } = fakeClient({ error: null });
    expect(await setTastingPlace(client, "t1", "x".repeat(201))).toEqual({ error: PLACE_TOO_LONG });
    expect(calls).toEqual([]);
  });
  it("an empty place deletes the row", async () => {
    const { client, calls } = fakeClient({ error: null });
    expect(await setTastingPlace(client, "t1", "  \n ")).toEqual({ ok: true });
    expect(calls).toEqual([
      { op: "from", args: ["tasting_places"] },
      { op: "delete", args: [] },
      { op: "eq", args: ["tasting_id", "t1"] },
    ]);
  });
  it("a place upserts the normalised text on tasting_id", async () => {
    const { client, calls } = fakeClient({ error: null });
    expect(await setTastingPlace(client, "t1", "  Christian's   place ")).toEqual({ ok: true });
    expect(calls).toEqual([
      { op: "from", args: ["tasting_places"] },
      { op: "upsert", args: [{ tasting_id: "t1", place: "Christian's place" }, { onConflict: "tasting_id" }] },
    ]);
  });
  it("a refused write or delete returns the database's message", async () => {
    const refused = { error: { message: "new row violates row-level security policy" } };
    expect(await setTastingPlace(fakeClient(refused).client, "t1", "Nørrebro")).toEqual({ error: refused.error.message });
    expect(await setTastingPlace(fakeClient(refused).client, "t1", "")).toEqual({ error: refused.error.message });
  });
});

describe("getTastingPlace", () => {
  it("reads the viewer's row", async () => {
    const { client, calls } = fakeClient({ data: { place: "Nørrebro" }, error: null });
    expect(await getTastingPlace(client, "t1")).toBe("Nørrebro");
    expect(calls).toEqual([
      { op: "from", args: ["tasting_places"] },
      { op: "select", args: ["place"] },
      { op: "eq", args: ["tasting_id", "t1"] },
      { op: "maybeSingle", args: [] },
    ]);
  });
  it("null when RLS hides the row, and null when the read fails", async () => {
    expect(await getTastingPlace(fakeClient({ data: null, error: null }).client, "t1")).toBeNull();
    expect(await getTastingPlace(fakeClient({ data: null, error: { message: "boom" } }).client, "t1")).toBeNull();
  });
});
