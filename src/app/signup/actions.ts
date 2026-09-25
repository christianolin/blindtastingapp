"use server";

import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { checkName } from "@/lib/auth/name";

export type SignUpFormState = { error: string } | { success: true } | null;

export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // One field, "Your name" (src/lib/auth/name.ts): normalised, never joined
  // from parts, and refused when empty or over NAME_MAX. It becomes the one
  // name shown everywhere (profiles.display_name, via handle_new_user).
  const checked = checkName(String(formData.get("name") ?? ""));
  if ("error" in checked) return { error: checked.error };
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
      // display_name only: handle_new_user copies it into the profile, and the
      // "Confirm signup" email template greets {{ .Data.display_name }}.
      data: { display_name: checked.name },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}${callback}`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
