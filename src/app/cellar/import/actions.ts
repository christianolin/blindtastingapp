"use server";
import { getOptionalUser } from "@/lib/auth/dal";

import { createClient } from "@/lib/supabase/server";
import type { ImportRow } from "./parse-cellartracker";

export type ImportSummary = {
  imported: number;
  failed: number;
  errors: { row: number; error: string }[];
};

// Bulk-import parsed rows through the import_cellar_lots RPC (per-row savepoints,
// so a bad row is reported but never sinks the batch).
export async function importCellarCsv(rows: ImportRow[]): Promise<ImportSummary> {
  const supabase = await createClient();
  const user = await getOptionalUser();
  if (!user) throw new Error("You must be signed in to import.");
  if (rows.length === 0) return { imported: 0, failed: 0, errors: [] };

  const { data, error } = await supabase.rpc("import_cellar_lots", { rows });
  if (error) throw new Error(error.message);
  const summary = data as unknown as ImportSummary | null;
  return {
    imported: summary?.imported ?? 0,
    failed: summary?.failed ?? 0,
    errors: summary?.errors ?? [],
  };
}
