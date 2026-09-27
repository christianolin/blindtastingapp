// saveCellarSort (spec docs/superpowers/specs/2026-09-27-cellar-sort-memory.md
// C6): validate, sign-in check, then the viewer's own row through
// writeCellarSort. The Supabase server client is replaced by a fake.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  createClientCalls: 0,
  calls: [] as { op: string; args: unknown[] }[],
  results: [] as { data?: unknown; error: { message: string; code?: string } | null }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    state.createClientCalls += 1;
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "update", "insert", "upsert"]) {
      builder[op] = (...args: unknown[]) => {
        state.calls.push({ op, args });
        return builder;
      };
    }
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => {
      const r = state.results.shift();
      return (r ? Promise.resolve(r) : Promise.reject(new Error("no result queued"))).then(onFulfilled, onRejected);
    };
    return {
      auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
      from: (table: string) => {
        state.calls.push({ op: "from", args: [table] });
        return builder;
      },
    };
  },
}));

import { saveCellarSort } from "./sort-actions";
import { CELLAR_SORT_INVALID } from "@/lib/cellar/sort-preference";
import type { SortKey } from "@/lib/cellar/types";

beforeEach(() => {
  state.user = null;
  state.createClientCalls = 0;
  state.calls = [];
  state.results = [];
});

describe("saveCellarSort", () => {
  it("an unknown key is refused before anything else happens", async () => {
    state.user = { id: "u1" };
    expect(await saveCellarSort("price" as SortKey)).toEqual({ error: CELLAR_SORT_INVALID });
    expect(state.createClientCalls).toBe(0);
  });

  it("signed out: refused, nothing written", async () => {
    expect(await saveCellarSort("name")).toEqual({ error: "You must be signed in." });
    expect(state.calls).toEqual([]);
  });

  it("signed in: updates the viewer's own row", async () => {
    state.user = { id: "u1" };
    state.results = [{ data: [{ user_id: "u1" }], error: null }];
    expect(await saveCellarSort("name")).toEqual({ ok: true });
    expect(state.calls).toEqual([
      { op: "from", args: ["user_preferences"] },
      { op: "update", args: [{ cellar_sort: "name" }] },
      { op: "eq", args: ["user_id", "u1"] },
      { op: "select", args: ["user_id"] },
    ]);
  });

  it("the first save inserts the row, keyed by the signed-in user, never one the caller names", async () => {
    state.user = { id: "u1" };
    state.results = [{ data: [], error: null }, { error: null }];
    expect(await saveCellarSort("yours")).toEqual({ ok: true });
    expect(state.calls.filter((c) => c.op === "insert")).toEqual([
      { op: "insert", args: [{ user_id: "u1", cellar_sort: "yours" }] },
    ]);
  });

  it("a database error comes back as it is", async () => {
    state.user = { id: "u1" };
    state.results = [{ data: null, error: { message: 'relation "public.user_preferences" does not exist', code: "42P01" } }];
    expect(await saveCellarSort("name")).toEqual({ error: 'relation "public.user_preferences" does not exist' });
  });
});
