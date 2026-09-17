// Storage-place merge (CC-P2; spec D1, §4 "storage-merge.ts", §5.4 "Near-duplicate
// places"). `storage_location` is free text on purpose (D1) — no racks/bins schema.
// Typing the same place two ways splits it into two groups; this module finds those
// near-duplicates by folding, and drafts the merge notice offered above the grouped
// list (screen C3).
//
// Pure: relative imports only, not server-bound, no React, no Supabase client.

import { countWord } from "../count-words";

/** Trim, collapse internal whitespace to one space, lower-case. No accent
 * folding — "Kælder" and "Kaelder" are different words the owner typed (D1). */
export function foldPlace(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

export type PlaceVariant = { spelling: string; bottles: number; lots: number };
export type MergeGroup = { target: string; variants: PlaceVariant[] };

/** Group the owner's lots' distinct stored spellings whose fold is equal. A group
 * is only returned when it has two or more spellings. The suggested `target` is
 * the spelling holding the most bottles (tie → the most lots, tie → the spelling
 * that sorts first). `variants` lists every spelling, the target first, the rest
 * by bottles desc. */
export function mergeGroups(
  lots: readonly { storageLocation: string | null; quantity: number }[],
): MergeGroup[] {
  const bySpelling = new Map<string, PlaceVariant>();
  for (const { storageLocation, quantity } of lots) {
    const spelling = storageLocation?.trim() ?? "";
    if (spelling === "") continue;
    const existing = bySpelling.get(spelling);
    if (existing) {
      existing.bottles += quantity;
      existing.lots += 1;
    } else {
      bySpelling.set(spelling, { spelling, bottles: quantity, lots: 1 });
    }
  }

  const byFold = new Map<string, PlaceVariant[]>();
  for (const variant of bySpelling.values()) {
    const fold = foldPlace(variant.spelling);
    const group = byFold.get(fold);
    if (group) group.push(variant);
    else byFold.set(fold, [variant]);
  }

  const groups: MergeGroup[] = [];
  for (const variants of byFold.values()) {
    if (variants.length < 2) continue;
    const sorted = [...variants].sort((a, b) => {
      if (b.bottles !== a.bottles) return b.bottles - a.bottles;
      if (b.lots !== a.lots) return b.lots - a.lots;
      // Plain codepoint order (not localeCompare): the mock's "spelling that
      // sorts first" wants ASCII order, where an uppercase letter sorts before
      // its lowercase form ("Floor" before "floor").
      if (a.spelling < b.spelling) return -1;
      if (a.spelling > b.spelling) return 1;
      return 0;
    });
    groups.push({ target: sorted[0].spelling, variants: sorted });
  }
  return groups;
}

/** The C3 notice, interpolating the first group's two most-used spellings; `null`
 * when there is nothing to merge. */
export function mergeNotice(
  groups: readonly MergeGroup[],
): { title: string; body: string; button: string } | null {
  if (groups.length === 0) return null;

  const totalSpellings = groups.reduce((n, g) => n + g.variants.length, 0);
  // (plan copy): the "{n} places look like {m}." form beyond one pair.
  const title =
    groups.length === 1 && groups[0].variants.length === 2
      ? "Two places look like one."
      : `${countWord(totalSpellings, { capital: true })} places look like ${countWord(groups.length)}.`;

  const [a, b] = groups[0].variants;
  const body = `“${a.spelling}” and “${b.spelling}” are separate groups because the field is free text. Grouping is where that becomes visible, so it is also where it should be fixable.`;

  return { title, body, button: "Merge them" };
}
