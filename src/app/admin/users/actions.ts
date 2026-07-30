"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

// Change a user's role. The SECURITY DEFINER RPC enforces that the caller is an
// admin and blocks self-demotion, so any violation returns its message.
export async function setUserRole(
  userId: string,
  role: UserRole,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_role", {
    p_user_id: userId,
    p_role: role,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { ok: true };
}
