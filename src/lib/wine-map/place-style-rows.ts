// Row mapping for a place's wine styles. Pure (no imports at all) so vitest can
// load it; ./place-styles owns the query.
//
// The panel needs `colour` to read "White sparkling" / "Rosé sparkling", and
// get_wine_place_context's style_list carries only `{style, note}` — so this
// stays a separate request rather than being served from the context payload.
// What changed is only WHEN it starts: it is keyed by canonical_key now, so it
// fires alongside the context RPC instead of waiting for the place id.
// See docs/superpowers/specs/2026-09-20-wine-map-data-latency.md §4.3.

export type StyleRow = { style: string; colour: string | null; note: string | null };

/** Maps the query's rows, dropping anything without a style. Order is the
    server's (`.order("sort_order")`) and is never re-sorted here. */
export function placeStyleRows(data: unknown): StyleRow[] {
  if (!Array.isArray(data)) return [];
  const rows: StyleRow[] = [];
  for (const raw of data) {
    if (typeof raw !== "object" || raw === null) continue;
    const row = raw as { style?: unknown; colour?: unknown; note?: unknown };
    if (typeof row.style !== "string") continue;
    rows.push({
      style: row.style,
      colour: typeof row.colour === "string" ? row.colour : null,
      note: typeof row.note === "string" ? row.note : null,
    });
  }
  return rows;
}
