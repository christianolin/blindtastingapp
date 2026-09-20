// A recording stand-in for the Supabase browser client. It is NOT a model of
// PostgREST's behaviour — it only records the calls a query builder makes and
// replays a canned payload, so a test can pin the exact table, select string,
// filter path and ordering that would go over the wire, and count how many
// round trips a function costs.
//
// Test-only: shared by the wine-map and wset query tests, never imported by app
// code. It lives under src/ because that is where vitest looks.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type RecordedQuery = {
  table: string;
  select?: string;
  eq: [string, unknown][];
  in: [string, unknown[]][];
  order?: string;
  /** Inclusive [from, to], as `.range()` takes them. */
  range?: [number, number];
  /** Set by `.maybeSingle()`, which asks for one row rather than a list. */
  single?: boolean;
};

export type RecordedRpc = { fn: string; args: unknown };

export type StubResult = { data: unknown; error: { message: string } | null };

export type StubCalls = {
  queries: RecordedQuery[];
  rpcs: RecordedRpc[];
};

/**
 * `tables` and `rpcs` return the payload for a given table / function name; a
 * missing entry answers `{ data: null, error: null }`.
 */
export function stubClient(options: {
  tables?: Record<string, (query: RecordedQuery) => StubResult>;
  rpcs?: Record<string, (args: unknown) => StubResult>;
}): { client: SupabaseClient<Database>; calls: StubCalls } {
  const calls: StubCalls = { queries: [], rpcs: [] };

  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, eq: [], in: [] };
      calls.queries.push(query);
      const settle = () =>
        Promise.resolve(
          options.tables?.[table]?.(query) ?? { data: null, error: null },
        );
      const builder = {
        select(columns: string) {
          query.select = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          query.eq.push([column, value]);
          return builder;
        },
        order(column: string) {
          query.order = column;
          return settle();
        },
        in(column: string, values: unknown[]) {
          query.in.push([column, values]);
          return builder;
        },
        range(from: number, to: number) {
          query.range = [from, to];
          return builder;
        },
        maybeSingle() {
          query.single = true;
          return settle();
        },
        then(
          onFulfilled?: (value: StubResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return settle().then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    rpc(fn: string, args: unknown) {
      calls.rpcs.push({ fn, args });
      return Promise.resolve(
        options.rpcs?.[fn]?.(args) ?? { data: null, error: null },
      );
    },
  };

  return { client: client as unknown as SupabaseClient<Database>, calls };
}
