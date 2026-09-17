// The viewer's own lots for one catalog wine, and the gold cellar strip's
// summary (CC-D5; spec §4 "catalog/[wineId]/page.tsx adds getOwnLotsForWine",
// §6.2 item 3).
//
// One owner-scoped read — `cellar_lots` filtered to the viewer and the wine,
// under the viewer's own RLS — plus the pure maths the strip renders. No
// money: `price_per_bottle` is not selected here at all (D4), and nothing is
// valued.
//
// Runtime imports are relative only (`./format`, `../count-words`), everything
// under `@/` is `import type`, so vitest can load this file without the `@/`
// alias.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { countWord } from "../count-words";
import { addedMonth, plural } from "./format";

/** One of the viewer's lots of a wine, as the strip needs it. */
export type OwnLot = {
  id: string;
  quantity: number;
  purchasedQuantity: number;
  storageLocation: string | null;
  purchasedOn: string | null;
  createdAt: string;
};

/**
 * The viewer's still-held lots of one catalog wine, oldest first.
 *
 * `gt("quantity", 0)` drops emptied lots: the strip says what you own now, and
 * the drunk count comes from the lots you still hold, the same way the cellar
 * rows count them.
 */
export async function getOwnLotsForWine(
  supabase: SupabaseClient<Database>,
  viewerId: string,
  wineId: string,
): Promise<OwnLot[]> {
  const { data } = await supabase
    .from("cellar_lots")
    .select(
      "id, quantity, purchased_quantity, storage_location, purchased_on, created_at",
    )
    .eq("owner_id", viewerId)
    .eq("catalog_wine_id", wineId)
    .gt("quantity", 0)
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    quantity: number | string | null;
    purchased_quantity: number | string | null;
    storage_location: string | null;
    purchased_on: string | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    quantity: Number(r.quantity ?? 0),
    purchasedQuantity: Number(r.purchased_quantity ?? 0),
    storageLocation: r.storage_location,
    purchasedOn: r.purchased_on,
    createdAt: r.created_at,
  }));
}

export type StripSummary = {
  bottles: number;
  place: string | null;
  drunk: number;
  bought: number;
  addedMonth: string;
  lotsWord: string;
  firstLotId: string;
};

/** Oldest first by `created_at`, keeping the given order for equal stamps —
 *  `getOwnLotsForWine` already returns them this way, and a caller that does
 *  not still gets "the oldest lot" for the month and the strip's target id. */
function oldestFirst(lots: readonly OwnLot[]): OwnLot[] {
  return [...lots].sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
  );
}

/**
 * The strip's numbers, or `null` when the viewer owns none of this wine.
 *
 * `place` is the storage location holding the most bottles; ties go to the
 * oldest lot's place, and a lot with no place set never names one.
 */
export function stripSummary(lots: readonly OwnLot[]): StripSummary | null {
  if (lots.length === 0) return null;
  const ordered = oldestFirst(lots);

  let bottles = 0;
  let bought = 0;
  // Insertion order is oldest-lot-first, so the first entry to reach a count
  // wins a tie — "the oldest lot's place".
  const byPlace = new Map<string, number>();
  for (const l of ordered) {
    bottles += l.quantity;
    bought += l.purchasedQuantity;
    if (l.storageLocation != null) {
      byPlace.set(
        l.storageLocation,
        (byPlace.get(l.storageLocation) ?? 0) + l.quantity,
      );
    }
  }

  let place: string | null = null;
  let most = 0;
  for (const [name, count] of byPlace) {
    if (count > most) {
      place = name;
      most = count;
    }
  }

  const first = ordered[0];
  const n = ordered.length;
  return {
    bottles,
    place,
    drunk: bought - bottles,
    bought,
    addedMonth: addedMonth(first),
    lotsWord: `${countWord(n)} ${n === 1 ? "lot" : "lots"}`,
    firstLotId: first.id,
  };
}

/** "You own 3 bottles" / "You own 1 bottle". */
export function stripTitle(s: StripSummary): string {
  return `You own ${plural(s.bottles, "bottle", "bottles")}`;
}

/**
 * "{place} · {drunk} of {bought} drunk · added {Mon yyyy} · {lotsWord}" —
 * the place only when one is set, the drunk part only when anything has been
 * drunk, and the lots word only on a laptop (W2b drops it).
 */
export function stripLine(s: StripSummary, opts: { phone: boolean }): string {
  const parts: string[] = [];
  if (s.place != null) parts.push(s.place);
  if (s.drunk > 0) parts.push(`${s.drunk} of ${s.bought} drunk`);
  parts.push(`added ${s.addedMonth}`);
  if (!opts.phone) parts.push(s.lotsWord);
  return parts.join(" · ");
}
