"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, revokeSession } from "@/lib/auth/session";

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  // Revoke server-side as well as clearing the cookie: a token that was copied
  // off this machine must stop working, not merely disappear from this browser.
  if (token) await revokeSession(token);
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
