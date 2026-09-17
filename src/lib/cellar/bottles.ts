// The cellar's bottle rows (CC-D1, spec §4 "bottles.ts"; D3, D9, D12).
//
// One read path for both cellars: your own (`/cellar`) and someone else's
// (`/u/[id]/cellar`, `readOnly`). Every query runs under the viewer's RLS with
// the client the page passes in — `"cellar own select"` is
// `owner_id = auth.uid() or can_view_cellar(owner_id)`, so a friend's or a
// public cellar reads here too, and the owner-only reads (your notes, your
// pour intents) are skipped entirely in `readOnly` (D12).
//
// No money beyond the lot's own `price_per_bottle`, which only the owner's lot
// sheet renders (D4); the catalog wine's typical price is never selected, and
// nothing here computes a value or a "ready to drink" flag.
//
// Takes the Supabase client as a parameter (the `place.ts` pattern): no `next`
// import, not server-bound, so a page or an action can call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { LOT_SELECT, bottleRowFrom, type LotEmbedRow } from "./embed";
import type { BottleRow, CommunityRating, YourScore } from "./types";

export type CellarBottlesOptions = { readOnly: boolean };

/** PostgREST puts a `.in(...)` list in the query string; 200 ids a request
 *  keeps every one of them well under the URL length a proxy will accept. */
const ID_CHUNK = 200;

/** PostgREST's own `max-rows` is 1000 on Supabase, so a plain `.select()`
 *  silently truncates a cellar bigger than that (a CellarTracker import
 *  reaches it easily). Page the lots instead, with `id` as a deterministic
 *  tiebreak so two lots sharing a `created_at` can't repeat or vanish
 *  across a page boundary. */
const LOT_PAGE = 1000;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size) as T[]);
  }
  return out;
}

const NO_RATING: CommunityRating = { avg: null, count: 0 };

export async function getCellarBottles(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  viewerId: string,
  opts: CellarBottlesOptions,
): Promise<BottleRow[]> {
  const lots: LotEmbedRow[] = [];
  for (let from = 0; ; from += LOT_PAGE) {
    const { data: lotData } = await supabase
      .from("cellar_lots")
      .select(LOT_SELECT)
      .eq("owner_id", ownerId)
      .gt("quantity", 0)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + LOT_PAGE - 1);
    const page = (lotData ?? []) as unknown as LotEmbedRow[];
    lots.push(...page);
    if (page.length < LOT_PAGE) break;
  }
  if (lots.length === 0) return [];

  const wineIds = [...new Set(lots.map((l) => l.catalog_wine_id))];
  const lotIds = lots.map((l) => l.id);

  // The community average, for every cellar. `avg_score` is a numeric and
  // arrives as a string; `note_count` is a bigint and does the same.
  const community = new Map<string, CommunityRating>();
  for (const ids of chunk(wineIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("catalog_wine_ratings")
      .select("catalog_wine_id, avg_score, note_count")
      .in("catalog_wine_id", ids);
    for (const r of (data ?? []) as unknown as Array<{
      catalog_wine_id: string | null;
      avg_score: number | string | null;
      note_count: number | string | null;
    }>) {
      if (!r.catalog_wine_id) continue;
      const avg = r.avg_score == null ? null : Number(r.avg_score);
      community.set(r.catalog_wine_id, {
        avg: avg != null && Number.isFinite(avg) ? avg : null,
        count: Number(r.note_count ?? 0),
      });
    }
  }

  // D3: your score on a wine is your MOST RECENT scored note, never your
  // highest. Ordered `tasted_on desc, created_at desc`, so the first row a
  // wine appears in is the one to keep. A hidden-glass note carries no
  // identity until its glass is revealed, so it never matches `.in(...)` on
  // `catalog_wine_id` and needs no extra clause. Owner-only (D12).
  const yours = new Map<string, YourScore>();
  const inFlight = new Map<string, number>();
  if (!opts.readOnly) {
    for (const ids of chunk(wineIds, ID_CHUNK)) {
      const { data } = await supabase
        .from("wset_notes")
        .select("id, catalog_wine_id, quality_score, tasted_on, created_at")
        .eq("author_id", viewerId)
        .not("quality_score", "is", null)
        .in("catalog_wine_id", ids)
        .order("tasted_on", { ascending: false })
        .order("created_at", { ascending: false });
      for (const n of (data ?? []) as unknown as Array<{
        id: string;
        catalog_wine_id: string | null;
        quality_score: number;
        tasted_on: string;
      }>) {
        if (!n.catalog_wine_id || yours.has(n.catalog_wine_id)) continue;
        yours.set(n.catalog_wine_id, {
          noteId: n.id,
          score: n.quality_score,
          tastedOn: n.tasted_on,
        });
      }
    }

    // D9: bottles committed to a flight and not yet poured. `wine_pour_intents`
    // is owner-only ("wine_pour_intents own select") and never reaches a
    // read-only cellar.
    for (const ids of chunk(lotIds, ID_CHUNK)) {
      const { data } = await supabase
        .from("wine_pour_intents")
        .select("cellar_lot_id")
        .eq("owner_id", ownerId)
        .is("cellar_consumption_id", null)
        .in("cellar_lot_id", ids);
      for (const i of (data ?? []) as unknown as Array<{
        cellar_lot_id: string | null;
      }>) {
        if (!i.cellar_lot_id) continue;
        inFlight.set(i.cellar_lot_id, (inFlight.get(i.cellar_lot_id) ?? 0) + 1);
      }
    }
  }

  return lots.map((r) =>
    bottleRowFrom(r, {
      community: community.get(r.catalog_wine_id) ?? NO_RATING,
      yours: yours.get(r.catalog_wine_id) ?? null,
      inFlight: inFlight.get(r.id) ?? 0,
    }),
  );
}
