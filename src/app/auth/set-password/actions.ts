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

  // The password is already set by here, so a failed profile write must not
  // send the user back to a form that would try to set it again — but it was
  // dropping the name they just typed with no sign at all.
  if (displayName) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userData.user.id);
    if (profileError) {
      console.error("set-password: the display name was not saved", {
        code: profileError.code,
        message: profileError.message,
      });
    }
  }

  redirect("/taste");
}
