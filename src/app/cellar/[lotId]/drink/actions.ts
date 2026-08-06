"use server";
import { getOptionalUser } from "@/lib/auth/dal";

import { createClient } from "@/lib/supabase/server";

export type ConsumeInput = {
  lotId: string;
  quantity: number;
  consumedOn?: string | null;
  reason?: string | null;
  occasion?: string | null;
  wsetNoteId?: string | null;
};

// Decrement a lot and log the removal via the consume_cellar_lot RPC (atomic;
// RLS + auth.uid() enforced inside). Returns the new consumption id.
export async function consumeLot(input: ConsumeInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const user = await getOptionalUser();
  if (!user) throw new Error("You must be signed in.");

  const p: Record<string, unknown> = {
    lot_id: input.lotId,
    quantity: input.quantity,
    consumed_on: input.consumedOn ?? null,
    reason: input.reason ?? null,
    occasion: input.occasion ?? null,
    wset_note_id: input.wsetNoteId ?? null,
  };
  const { data, error } = await supabase.rpc("consume_cellar_lot", { p });
  if (error) throw new Error(error.message);
  return { id: data as string };
}
