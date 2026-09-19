"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resetEmail, resetRedirectTo, signInNext } from "@/lib/auth/login-copy";

export type AuthFormState = { error: string } | null;

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  // The browser resolves this redirect with `new URL(next, base)`, which
  // strips tab/CR/LF — so "/\t/evil.example" would leave the site as
  // "//evil.example". signInNext refuses those as well as safeNext's shapes.
  const next = signInNext(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(next);
}

export type ForgotFormState = { sent: string } | { error: string } | null;

/**
 * "Forgot password?": asks Supabase for a reset email. The answer never says
 * whether the address has an account — Supabase replies the same either way,
 * and the page's sent line is conditional. A Supabase error (rate limit,
 * malformed address) is shown verbatim.
 */
export async function requestPasswordReset(
  _prevState: ForgotFormState,
  formData: FormData,
): Promise<ForgotFormState> {
  const email = resetEmail(formData.get("email"));

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: resetRedirectTo(process.env.NEXT_PUBLIC_SITE_URL),
  });

  if (error) {
    return { error: error.message };
  }

  return { sent: email };
}
