"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { FIRST_NAME_REQUIRED, fullName } from "@/lib/auth/full-name";

export type SignUpFormState = { error: string } | { success: true } | null;

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // First name is required, last name optional; the two become the one name
  // shown everywhere (profiles.display_name, via handle_new_user).
  const firstName = String(formData.get("first_name") ?? "");
  const lastName = String(formData.get("last_name") ?? "");
  const displayName = fullName(firstName, lastName);
  if (!fullName(firstName, "")) return { error: FIRST_NAME_REQUIRED };
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
      // The parts ride along in the auth metadata too, so a later feature can
      // use the last name on its own without asking again.
      data: {
        display_name: displayName,
        first_name: fullName(firstName, ""),
        last_name: fullName(lastName, "") || null,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}${callback}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
