// Everything the lot sheet renders about one lot (CC-D2, spec §4
// "lot-sheet.ts", §5.5; D3, D7, D8, D9).
//
// Refinement 21: this is an OWNER-ONLY read. `"cellar own select"` is
// `owner_id = auth.uid() or can_view_cellar(owner_id)`, so a friend's lot row
// would come back under RLS — the sheet still refuses it, because everything
// below it (your note, the lot's history, its pour intents, its purchase
// price) belongs to the owner alone. A lot that is not the viewer's returns
// `null` exactly as a missing one does.
//
// Money: the lot's own `price_per_bottle` rides along inside `BottleRow`
// (D4 — the owner's own sheet is the single place it renders). The catalog
// wine's typical price is never selected, here or in `LOT_SELECT`, and
// nothing is valued.
//
// D8: the tasting a bottle was poured at is the exact pour-intent link
// (`tastingLinksFor`), never the `occasion` text — `occasion` is carried
// through to the row untouched and compared with nothing.
//
// Takes the Supabase client as a parameter (the `place.ts` pattern): no
// `next` import, not server-bound, so a page or a server action can call it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  summarizeNoteRow,
  type WsetNoteAromaRow,
  type WsetNoteRow,
} from "@/lib/wset/note-summary";
import { qualityBand } from "@/lib/wset/quality-curve.mjs";
import { chunk } from "./bottles";
import {
  LOT_SELECT,
  bottleRowFrom,
  unwrapEmbed,
  type LotEmbedRow,
} from "./embed";
import { tastingLinksFor } from "./history";
import { ratingSpread, type ScoredNote } from "./rating-spread";
import type {
  CommunityRating,
  ConsumptionReason,
  LotConsumption,
  LotSheetData,
  YourScore,
} from "./types";

/** PostgREST puts a `.in(...)` list in the query string; 200 ids a request
 *  keeps every one of them well under the URL length a proxy will accept. */
const ID_CHUNK = 200;

/** Refinement 19: one PostgREST page of this wine's scored notes, a stated
 *  cap rather than paging — the spread is a shape, not a ledger. */
const SPREAD_LIMIT = 1000;

const NO_RATING: CommunityRating = { avg: null, count: 0 };

type ConsumptionRow = {
  id: string;
  consumed_on: string;
  reason: ConsumptionReason;
  quantity: number;
  occasion: string | null;
  wset_note_id: string | null;
  created_at: string;
};

/**
 * The lot, its two ratings, your most recent note and the lot's own history.
 *
 * `null` when there is no such lot or it is not the viewer's (refinement 21).
 */
export async function getLotSheet(
  supabase: SupabaseClient<Database>,
  lotId: string,
  viewerId: string,
): Promise<LotSheetData | null> {
  const { data: lotData } = await supabase
    .from("cellar_lots")
    .select(LOT_SELECT)
    .eq("id", lotId)
    .maybeSingle();
  const lot = lotData as unknown as LotEmbedRow | null;
  if (!lot || lot.owner_id !== viewerId) return null;

  const wineId = lot.catalog_wine_id;

  // 2. The community average for the row itself — the same view every cellar
  // surface reads. `avg_score` is a numeric and `note_count` a bigint, both
  // of which arrive as strings.
  let community: CommunityRating = NO_RATING;
  {
    const { data } = await supabase
      .from("catalog_wine_ratings")
      .select("catalog_wine_id, avg_score, note_count")
      .eq("catalog_wine_id", wineId)
      .maybeSingle();
    const r = data as unknown as {
      avg_score: number | string | null;
      note_count: number | string | null;
    } | null;
    if (r) {
      const avg = r.avg_score == null ? null : Number(r.avg_score);
      community = {
        avg: avg != null && Number.isFinite(avg) ? avg : null,
        count: Number(r.note_count ?? 0),
      };
    }
  }

  // 3. D3: your score is your MOST RECENT scored note on this wine, never
  // your highest. `select("*")` because `summarizeNoteRow` reads every
  // assessment column to count what has been filled in.
  const { data: noteData } = await supabase
    .from("wset_notes")
    .select("*")
    .eq("author_id", viewerId)
    .eq("catalog_wine_id", wineId)
    .not("quality_score", "is", null)
    .order("tasted_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let yours: LotSheetData["yours"] = null;
  let rowYours: YourScore | null = null;
  if (noteData && noteData.quality_score != null) {
    const { data: aromaData } = await supabase
      .from("wset_note_aromas")
      .select("term_id, sensed_on_nose, sensed_on_palate")
      .eq("note_id", noteData.id);
    const aromas = (aromaData ?? []) as unknown as WsetNoteAromaRow[];
    const summary = summarizeNoteRow(
      noteData as unknown as WsetNoteRow,
      aromas,
      // The wine's style decides whether mousse counts toward the total.
      unwrapEmbed(lot.catalog_wines)?.style ?? null,
    );
    const score = noteData.quality_score;
    rowYours = { noteId: noteData.id, score, tastedOn: noteData.tasted_on };
    yours = {
      noteId: noteData.id,
      score,
      band: qualityBand(score),
      tastedOn: noteData.tasted_on,
      assessed: { done: summary.done, total: summary.total },
    };
  }

  // 4. D7: the spread from the wine's own scored notes plus the viewer's
  // friendships. A note with an identity is readable by every signed-in user
  // (`"wset_notes read"`), so this needs no view widening and no migration.
  const { data: spreadData } = await supabase
    .from("wset_notes")
    .select("quality_score, author_id")
    .eq("catalog_wine_id", wineId)
    .not("quality_score", "is", null)
    .limit(SPREAD_LIMIT);
  const { data: friendData } = await supabase
    .from("friendships")
    .select("friend_id")
    .eq("user_id", viewerId);
  const friendIds = new Set(
    ((friendData ?? []) as unknown as Array<{ friend_id: string }>).map(
      (f) => f.friend_id,
    ),
  );
  const spread = ratingSpread(
    ((spreadData ?? []) as unknown as Array<{
      quality_score: number | null;
      author_id: string;
    }>).map((n): ScoredNote => ({ score: n.quality_score, authorId: n.author_id })),
    friendIds,
  );

  // 5. This lot's own history, newest first. `cellar_consumptions` has no read
  // policy beyond the owner, so it can only ever answer for the viewer's own
  // lot — which is the only lot that reaches this line.
  const { data: consData } = await supabase
    .from("cellar_consumptions")
    .select("id, consumed_on, reason, quantity, occasion, wset_note_id, created_at")
    .eq("lot_id", lotId)
    .order("consumed_on", { ascending: false })
    .order("created_at", { ascending: false });
  const consumptions = (consData ?? []) as unknown as ConsumptionRow[];

  const noteIds = [
    ...new Set(
      consumptions
        .map((c) => c.wset_note_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const scores = new Map<string, number | null>();
  for (const ids of chunk(noteIds, ID_CHUNK)) {
    const { data } = await supabase
      .from("wset_notes")
      .select("id, quality_score")
      .in("id", ids);
    for (const n of (data ?? []) as unknown as Array<{
      id: string;
      quality_score: number | null;
    }>) {
      scores.set(n.id, n.quality_score);
    }
  }

  const tastings = await tastingLinksFor(
    supabase,
    viewerId,
    consumptions.map((c) => c.id),
  );

  const history: LotConsumption[] = consumptions.map((c) => ({
    id: c.id,
    consumedOn: c.consumed_on,
    reason: c.reason,
    quantity: c.quantity,
    occasion: c.occasion,
    note: c.wset_note_id
      ? { id: c.wset_note_id, score: scores.get(c.wset_note_id) ?? null }
      : null,
    tasting: tastings.get(c.id) ?? null,
  }));

  // 6. D9: bottles of this lot committed to a flight and not yet poured.
  // `wine_pour_intents` is owner-only and is filtered by owner on top of that.
  const { data: intentData } = await supabase
    .from("wine_pour_intents")
    .select("wine_id")
    .eq("owner_id", viewerId)
    .eq("cellar_lot_id", lotId)
    .is("cellar_consumption_id", null);
  const inFlight = (intentData ?? []).length;

  return {
    row: bottleRowFrom(lot, { community, yours: rowYours, inFlight }),
    yours,
    community: spread,
    history,
  };
}
