"use server";
import { getOptionalUser } from "@/lib/auth/dal";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const cap = (s: string) => (s ? s[0] + s.slice(1).toLowerCase() : s);

export async function searchCatalogForResolve(query: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_catalog_wines", {
    p_query: query,
    p_limit: 20,
  });
  return (data ?? []).map((w) => {
    const vintage =
      w.vintage_kind === "YEAR" ? (w.vintage_year ? String(w.vintage_year) : "")
      : w.vintage_kind === "TAWNY" ? (w.vintage_tawny_years ? `${w.vintage_tawny_years}yo` : "Tawny")
      : "NV";
    const seen = new Set<string>();
    const label = [w.producer, w.wine_name, w.appellation, vintage]
      .filter(Boolean)
      .filter((p) => {
        const k = p.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .join(" ");
    return { id: w.id, name: label, group: `${cap(w.colour)} · ${cap(w.style)}` };
  });
}

export async function resolveUnidentifiedWine(
  unidentifiedId: string,
  catalogWineId: string,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const user = await getOptionalUser();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.rpc("resolve_unidentified_wine", {
    p_unidentified_id: unidentifiedId,
    p_catalog_wine_id: catalogWineId,
  });
  if (error) return { error: error.message };
  revalidatePath("/catalog/unidentified");
  return { ok: true };
}
