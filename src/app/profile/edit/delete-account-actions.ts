"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCOUNT_DELETED_LOGIN_PATH,
  avatarPathsToRemove,
  isDeleteConfirmed,
  lastAdminRefusal,
  type DeleteAccountState,
} from "@/lib/account/delete-account";
import { DELETE_WORD_MISMATCH } from "@/lib/account/delete-copy";

// Self-service account deletion (account-deletion spec §5.1, D13). The only
// export is this action: a "use server" module re-exports every export as an
// action, so `DeleteAccountState` lives in the plain `delete-account.ts` and
// is imported here with `import type`, never re-exported.
//
// The database does the data work: GoTrue's delete of the `auth.users` row
// fires `on_auth_user_deleted` → `scrub_deleted_account`, inside the same
// transaction, so a raise there rolls the whole delete back and nothing here
// has changed yet when the error comes back.
export async function deleteAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  // 1. The session user. The form carries no id; only `user.id` is used.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // 2. The dialog only enables the button for the exact word; re-check it.
  if (!isDeleteConfirmed(String(formData.get("confirmation") ?? ""))) {
    return { error: DELETE_WORD_MISMATCH };
  }

  // 3. D14: the only active admin cannot delete themselves in the app.
  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (meError) return { error: meError.message };
  if (me?.role === "ADMIN") {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "ADMIN")
      .is("deleted_at", null);
    if (countError) return { error: countError.message };
    const refusal = lastAdminRefusal(me.role, count ?? 0);
    if (refusal) return { error: refusal };
  }

  // 4. The hard delete. Never pass `shouldSoftDelete`: the hard delete is what
  //    frees the email for a new signup and fires `on_auth_user_deleted`.
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return { error: deleteError.message };

  // 5. D15: the avatar files, best-effort. The account is already gone, so a
  //    failure here is logged (name and message only) and never shown.
  try {
    const bucket = admin.storage.from("avatars");
    const { data: listed, error: listError } = await bucket.list(user.id, { limit: 1000 });
    if (listError) {
      console.error("deleteAccount: avatars not listed", {
        name: listError.name,
        message: listError.message,
      });
    } else {
      const paths = avatarPathsToRemove(user.id, listed ?? []);
      if (paths.length > 0) {
        const { error: removeError } = await bucket.remove(paths);
        if (removeError) {
          console.error("deleteAccount: avatars not removed", {
            name: removeError.name,
            message: removeError.message,
          });
        }
      }
    }
  } catch (e) {
    console.error("deleteAccount: avatars not removed", {
      name: e instanceof Error ? e.name : "Error",
      message: e instanceof Error ? e.message : String(e),
    });
  }

  // 6. This browser's session. Scope "local" removes the cookies on every
  //    branch, whatever GoTrue answers for a user that no longer exists; its
  //    `error` is ignored, and so is a throw, so the redirect always runs.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // The account is gone either way; the login page is still the landing.
  }

  // 7. The login page, with its "Your account has been deleted." notice.
  redirect(ACCOUNT_DELETED_LOGIN_PATH);
}
