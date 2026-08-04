import { createClient } from "@/lib/supabase/server";

export type AppStats = {
  members: number;
  tastings: number;
  winesCatalogued: number;
  notesCreated: number;
};

// App-wide headline counts for the overview hero. Backed by the
// get_app_stats() SECURITY DEFINER function so the totals are accurate
// regardless of the caller's RLS visibility (tastings + wset_notes are
// row-restricted; a plain COUNT via the user client would undercount).
export async function getAppStats(): Promise<AppStats> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_app_stats").single();
  return {
    members: Number(data?.members ?? 0),
    tastings: Number(data?.tastings ?? 0),
    winesCatalogued: Number(data?.wines_catalogued ?? 0),
    notesCreated: Number(data?.notes_created ?? 0),
  };
}
