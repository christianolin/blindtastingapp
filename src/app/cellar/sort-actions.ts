"use server";

// Remembering the cellar list's sort (spec
// docs/superpowers/specs/2026-09-27-cellar-sort-memory.md C6). Every change of
// the Sort select, on any cellar list (your own or someone else's), saves the
// viewer's choice on their own `user_preferences` row.
//
// No revalidate or refresh: the list already shows the new order, and the
// next render of any cellar list reads the saved value itself. The caller
// logs a failure and carries on — a lost preference is not worth interrupting
// anyone.
//
// This file exports async functions only (a "use server" module re-exports
// every export as an action); the result type lives in @/lib/cellar/types.

import { isSortKey } from "@/lib/cellar/cellar-rows";
import { CELLAR_SORT_INVALID, writeCellarSort } from "@/lib/cellar/sort-preference";
import type { SaveCellarSortResult, SortKey } from "@/lib/cellar/types";
import { createClient } from "@/lib/supabase/server";

export async function saveCellarSort(sort: SortKey): Promise<SaveCellarSortResult> {
  // The argument crosses the network, so its type is a promise, not a fact.
  if (!isSortKey(sort)) return { error: CELLAR_SORT_INVALID };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };
  return writeCellarSort(supabase, user.id, sort);
}
