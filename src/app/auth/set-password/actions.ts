"use server";

import { fullName } from "@/lib/auth/full-name";
import { createClient } from "@/lib/supabase/server";
import {
  passwordCopy,
  passwordMode,
  passwordNext,
  passwordUpdateData,
} from "@/lib/auth/password-copy";

// `done` carries the checked destination back to the form, which leaves with
// a full browser navigation rather than a server-action redirect: `next` can
// be the route handler /invite/<code>/accept, and an action redirect to it is
// fetched server-side with the 307 followed and its Set-Cookie (the invite
// intent cookie's delete) dropped, then rendered under the handler's own URL,
// where the landing page's next action POSTs into a GET-only route (405).
export type SetPasswordFormState = { error: string } | { done: string } | null;

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function setPassword(
  _prevState: SetPasswordFormState,
  formData: FormData,
): Promise<SetPasswordFormState> {
  // `mode` and `next` come back from hidden fields the page rendered; both
  // are re-read through the same rules here rather than trusted. `mode` only
  // picks the copy and whether a name is written.
  const mode = passwordMode(field(formData, "mode"));
  const next = passwordNext(field(formData, "next"));
  const password = field(formData, "password");
  // Setup mode asks for a first name (required by the form) and an optional
  // last name; together they become the one name shown everywhere.
  const displayName =
    mode === "setup" ? fullName(field(formData, "first_name"), field(formData, "last_name")) : "";

  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: passwordCopy(mode).expired };
  }

  // The password_set flag rides in the same write as the password, so the
  // middleware's password step ends exactly when a password exists.
  const { error } = await supabase.auth.updateUser({
    password,
    data: passwordUpdateData(mode, displayName),
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

  return { done: next };
}
