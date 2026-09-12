"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

export type SignUpFormState = { error: string } | { success: true } | null;

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "");
  // Where the confirmation link lands after the code exchange — a share link
  // (`/j/<code>`) opened by someone without an account comes back to it.
  const next = safeNext(String(formData.get("next") ?? ""));
  const callback = next
    ? `/auth/callback?next=${encodeURIComponent(next)}`
    : "/auth/callback";

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}${callback}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
