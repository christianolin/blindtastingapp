import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getOptionalUser } from "@/lib/auth/dal";
import { mintSupabaseToken } from "@/lib/auth/jwt";

// Supabase is now a data plane only: it has no idea who the user is except
// through the token we mint. Signed-in callers get `sub` + `role: authenticated`,
// so RLS behaves exactly as it did under GoTrue; signed-out callers get the
// plain anon key and see only what anon policies allow.
export async function createClient() {
  const user = await getOptionalUser();
  const token = user ? await mintSupabaseToken(user.id) : null;

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(token
        ? { global: { headers: { Authorization: `Bearer ${token}` } } }
        : {}),
    },
  );
}
