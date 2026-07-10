"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordFormState = { error: string } | null;

export async function setPassword(
  _prevState: SetPasswordFormState,
  formData: FormData,
): Promise<SetPasswordFormState> {
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "");

  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: "Your invite link has expired. Please ask for a new one." };
  }

  const { error } = await supabase.auth.updateUser({
    password,
    data: { display_name: displayName },
  });
  if (error) {
    return { error: error.message };
  }

  if (displayName) {
    await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userData.user.id);
  }

  redirect("/dashboard");
}
