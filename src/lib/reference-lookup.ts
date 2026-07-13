import { createClient } from "@/lib/supabase/server";

// Targeted id->name lookup for the reference tables too large to preload in
// full (appellations, producers). Callers collect only the ids they'll
// actually render (e.g. revealed answers, a participant's own guess) instead
// of fetching every row in the table.
export async function lookupAppellationAndProducerNames(ids: {
  appellationIds: (string | null | undefined)[];
  producerIds: (string | null | undefined)[];
}): Promise<Map<string, string>> {
  const appellationIds = [...new Set(ids.appellationIds.filter((id): id is string => Boolean(id)))];
  const producerIds = [...new Set(ids.producerIds.filter((id): id is string => Boolean(id)))];

  const supabase = await createClient();
  const [{ data: appellations }, { data: producers }] = await Promise.all([
    appellationIds.length > 0
      ? supabase.from("appellations").select("id, name").in("id", appellationIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    producerIds.length > 0
      ? supabase.from("producers").select("id, name").in("id", producerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const map = new Map<string, string>();
  for (const row of appellations ?? []) map.set(row.id, row.name);
  for (const row of producers ?? []) map.set(row.id, row.name);
  return map;
}
