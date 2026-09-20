// Row mapping for the map's "typical wine from here" list. Pure — type-only
// imports, no runtime `@/` import — so vitest (node, no path alias) can load
// it; ./queries re-exports the type and calls this from the one query.
//
// The query is a single PostgREST request with an embedded filter
// (`wine_archetypes!inner(...)` joined through `wine_places!inner(canonical_key)`),
// which replaced a three-request chain: place id → placements → archetypes.
// See docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.2.
//
// The one thing that could not be proven without an authenticated PostgREST
// session is whether a to-one embed arrives as an object or a one-element
// array; postgrest-js has shipped both. This mapper accepts either, the same
// hedge ./queries already applies to `grapes(name)` embeds.
//
// Order is the server's: `.order("sort_order")` fully determines it, because no
// two placements of one place share a sort_order (checked live). So this mapper
// NEVER re-sorts — it preserves the incoming order verbatim.
import type { WineColour, WineStyle } from "@/lib/wset/types";

export type ArchetypeListItem = {
  id: string;
  name: string;
  colour: WineColour;
  style: WineStyle;
};

type Embedded = {
  id?: unknown;
  name?: unknown;
  colour?: unknown;
  style?: unknown;
};

function embedded(value: unknown): Embedded | null {
  const row = Array.isArray(value) ? value[0] : value;
  return typeof row === "object" && row !== null ? (row as Embedded) : null;
}

/** Maps the embedded rows to the list the panel renders, dropping any row
    whose archetype is missing or malformed. Never throws. */
export function archetypeRows(data: unknown): ArchetypeListItem[] {
  if (!Array.isArray(data)) return [];
  const items: ArchetypeListItem[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const archetype = embedded((raw as { wine_archetypes?: unknown }).wine_archetypes);
    if (!archetype) continue;
    const { id, name, colour, style } = archetype;
    if (
      typeof id !== "string" ||
      typeof name !== "string" ||
      typeof colour !== "string" ||
      typeof style !== "string"
    ) {
      continue;
    }
    items.push({
      id,
      name,
      colour: colour as WineColour,
      style: style as WineStyle,
    });
  }
  return items;
}
