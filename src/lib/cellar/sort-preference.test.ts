// The saved cellar sort (spec docs/superpowers/specs/2026-09-27-cellar-sort-memory.md
// C3, C5, C6): the viewer's own `user_preferences` row, read by the server
// pages and written by `saveCellarSort`.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "../supabase/database.types";
import { CELLAR_SORT_INVALID, readCellarSort, writeCellarSort } from "./sort-preference";

type Call = { op: string; args: unknown[] };
type Result = { data?: unknown; error: { message: string; code?: string } | null };

/** A query builder that records its chain; each awaited query (a `then` or a
 *  `maybeSingle`) takes the next result from `results`, or rejects with it
 *  when it is an Error. */
function fakeClient(results: (Result | Error)[]) {
  const calls: Call[] = [];
  const queue = results.slice();
  const next = () => {
    const r = queue.shift();
    if (r === undefined) throw new Error("no result queued for this query");
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const builder: Record<string, unknown> = {};
  for (const op of ["select", "eq", "update", "insert", "upsert", "delete"]) {
    builder[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return builder;
    };
  }
  builder.maybeSingle = () => {
    calls.push({ op: "maybeSingle", args: [] });
    return next();
  };
  builder.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
    next().then(onFulfilled, onRejected);
  const client = {
    from: (table: string) => {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls, queue };
}

const UPDATE_CALLS = (sort: string) => [
  { op: "from", args: ["user_preferences"] },
  { op: "update", args: [{ cellar_sort: sort }] },
  { op: "eq", args: ["user_id", "u1"] },
  { op: "select", args: ["user_id"] },
];
const INSERT_CALLS = (sort: string) => [
  { op: "from", args: ["user_preferences"] },
  { op: "insert", args: [{ user_id: "u1", cellar_sort: sort }] },
];

describe("readCellarSort", () => {
  it("reads the viewer's own row", async () => {
    const { client, calls } = fakeClient([{ data: { cellar_sort: "name" }, error: null }]);
    expect(await readCellarSort(client, "u1")).toBe("name");
    expect(calls).toEqual([
      { op: "from", args: ["user_preferences"] },
      { op: "select", args: ["cellar_sort"] },
      { op: "eq", args: ["user_id", "u1"] },
      { op: "maybeSingle", args: [] },
    ]);
  });

  it("no row, a null sort, an error or a thrown read: no saved value", async () => {
    expect(await readCellarSort(fakeClient([{ data: null, error: null }]).client, "u1")).toBeNull();
    expect(await readCellarSort(fakeClient([{ data: { cellar_sort: null }, error: null }]).client, "u1")).toBeNull();
    expect(
      await readCellarSort(fakeClient([{ data: null, error: { message: 'relation "user_preferences" does not exist' } }]).client, "u1"),
    ).toBeNull();
    expect(await readCellarSort(fakeClient([new Error("fetch failed")]).client, "u1")).toBeNull();
  });
});

describe("writeCellarSort", () => {
  it("updates the viewer's existing row, and nothing else", async () => {
    const { client, calls } = fakeClient([{ data: [{ user_id: "u1" }], error: null }]);
    expect(await writeCellarSort(client, "u1", "name")).toEqual({ ok: true });
    expect(calls).toEqual(UPDATE_CALLS("name"));
  });

  it("inserts the row the first time a person picks a sort", async () => {
    const { client, calls } = fakeClient([
      { data: [], error: null },
      { error: null },
    ]);
    expect(await writeCellarSort(client, "u1", "community")).toEqual({ ok: true });
    expect(calls).toEqual([...UPDATE_CALLS("community"), ...INSERT_CALLS("community")]);
  });

  it("a second tab that inserted first: the unique key refuses the insert, so it updates again", async () => {
    const { client, calls } = fakeClient([
      { data: [], error: null },
      { error: { message: 'duplicate key value violates unique constraint "user_preferences_pkey"', code: "23505" } },
      { data: [{ user_id: "u1" }], error: null },
    ]);
    expect(await writeCellarSort(client, "u1", "bottles")).toEqual({ ok: true });
    expect(calls).toEqual([...UPDATE_CALLS("bottles"), ...INSERT_CALLS("bottles"), ...UPDATE_CALLS("bottles")]);
  });

  it("never a PostgREST upsert: its ON CONFLICT DO UPDATE SET names user_id, which the client may not update", async () => {
    const { client, calls } = fakeClient([
      { data: [], error: null },
      { error: null },
    ]);
    await writeCellarSort(client, "u1", "added");
    expect(calls.map((c) => c.op)).not.toContain("upsert");
    expect(calls.map((c) => c.op)).not.toContain("delete");
  });

  it("an update error comes back as it is, and nothing is inserted", async () => {
    const { client, calls } = fakeClient([{ data: null, error: { message: "permission denied for table user_preferences", code: "42501" } }]);
    expect(await writeCellarSort(client, "u1", "name")).toEqual({ error: "permission denied for table user_preferences" });
    expect(calls).toEqual(UPDATE_CALLS("name"));
  });

  it("an insert error other than the unique key comes back as it is", async () => {
    const { client } = fakeClient([
      { data: [], error: null },
      { error: { message: 'new row violates row-level security policy for table "user_preferences"', code: "42501" } },
    ]);
    expect(await writeCellarSort(client, "u1", "name")).toEqual({
      error: 'new row violates row-level security policy for table "user_preferences"',
    });
  });

  it("a retry that still finds no row is an error, not a silent success", async () => {
    const { client } = fakeClient([
      { data: [], error: null },
      { error: { message: "duplicate key", code: "23505" } },
      { data: [], error: null },
    ]);
    const r = await writeCellarSort(client, "u1", "name");
    expect("error" in r).toBe(true);
  });

  it("a thrown request comes back as an error", async () => {
    const { client } = fakeClient([new Error("fetch failed")]);
    expect(await writeCellarSort(client, "u1", "name")).toEqual({ error: "fetch failed" });
  });

  it("an unknown key is refused before any write", async () => {
    for (const bad of ["price", "Added", "", null, 3, "constructor"]) {
      const { client, calls } = fakeClient([]);
      expect(await writeCellarSort(client, "u1", bad)).toEqual({ error: CELLAR_SORT_INVALID });
      expect(calls).toEqual([]);
    }
  });
});
