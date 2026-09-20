import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ARCHETYPES_FOR_PLACE_SELECT } from "../wset/archetype-query";
import { PLACE_STYLES_SELECT } from "./place-styles";

// The other query tests run against a recording stub, which proves what the
// functions ASK for. This one proves what actually goes over the wire: it
// builds the same calls with the REAL supabase-js in package.json and reads the
// URL its builder produced. Two things are load-bearing and neither is obvious
// from the source:
//
//   1. `.eq("wine_places.canonical_key", …)` has to serialise as a filter on
//      the EMBEDDED resource (`wine_places.canonical_key=eq.…`), which is what
//      turns `wine_places!inner(...)` into a join filter rather than a second
//      request. A dotted column name is not special-cased anywhere in our code
//      — it works because PostgREST reads the prefix as the embed's alias.
//   2. `.order("sort_order")` has to stay a TOP-LEVEL order (`order=`), not an
//      embedded one (`wine_places.order=`), or the placements come back in
//      whatever order the join produced.
//
// If a supabase-js upgrade ever changed either, every stub test would still
// pass and the panel would quietly reorder or refetch. This one fails.
//
// No network: PostgrestBuilder only issues a request when it is awaited, and
// nothing here awaits one.

type Builder = { url: URL };

function client(): SupabaseClient<Database> {
  return createClient<Database>("http://postgrest.invalid", "anon-key-not-used", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function urlOf(builder: unknown): URL {
  return (builder as Builder).url;
}

describe("the wire format of the two per-place queries", () => {
  it("archetypes: one path, an embedded filter, a top-level order", () => {
    const url = urlOf(
      client()
        .from("wine_archetype_placements")
        .select(ARCHETYPES_FOR_PLACE_SELECT)
        .eq("wine_places.canonical_key", "france.bourgogne")
        .order("sort_order"),
    );

    expect(url.pathname).toBe("/rest/v1/wine_archetype_placements");
    // Whitespace is stripped by postgrest-js; the embeds survive verbatim.
    expect(url.searchParams.get("select")).toBe(
      "sort_order,wine_archetypes!inner(id,name,colour,style),wine_places!inner(canonical_key)",
    );
    expect(url.searchParams.get("wine_places.canonical_key")).toBe(
      "eq.france.bourgogne",
    );
    expect(url.searchParams.get("order")).toBe("sort_order.asc");
    // Not an order scoped to the embedded resource.
    expect(url.searchParams.get("wine_places.order")).toBeNull();
    // Exactly three parameters: select, the embedded filter, the order.
    expect([...url.searchParams.keys()].sort()).toEqual([
      "order",
      "select",
      "wine_places.canonical_key",
    ]);
  });

  it("styles: same shape, keyed by the canonical key rather than a place id", () => {
    const url = urlOf(
      client()
        .from("wine_place_styles")
        .select(PLACE_STYLES_SELECT)
        .eq("wine_places.canonical_key", "france.savoie")
        .order("sort_order"),
    );

    expect(url.pathname).toBe("/rest/v1/wine_place_styles");
    expect(url.searchParams.get("select")).toBe(
      "style,colour,note,sort_order,wine_places!inner(canonical_key)",
    );
    expect(url.searchParams.get("wine_places.canonical_key")).toBe(
      "eq.france.savoie",
    );
    expect(url.searchParams.get("order")).toBe("sort_order.asc");
    // No wine_place_id anywhere: nothing here waits for the context RPC.
    expect(url.search).not.toContain("wine_place_id");
  });

  it("a key with a dot, a dash or a space survives the filter value intact", () => {
    for (const key of [
      "france.bourgogne.cote-de-nuits.vosne-romanee",
      "germany.mosel.saar.scharzberg.wiltingen-braunfels",
      "italy.trentino-alto-adige",
    ]) {
      const url = urlOf(
        client()
          .from("wine_place_styles")
          .select(PLACE_STYLES_SELECT)
          .eq("wine_places.canonical_key", key)
          .order("sort_order"),
      );
      expect(url.searchParams.get("wine_places.canonical_key")).toBe(`eq.${key}`);
    }
  });
});
