"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
} from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";

export type SetPasswordFormState = { error: string } | null;

// Redeeming an invite. The token in the form IS the authorisation — the caller
// is not signed in yet, and cannot be, because the account has no usable
// password until this runs.
export async function setPassword(
  _prevState: SetPasswordFormState,
  formData: FormData,
): Promise<SetPasswordFormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const claim = await consumeToken("INVITE", token);
  if (!claim?.userId) {
    return { error: "Your invite link has expired. Please ask for a new one." };
  }

  // Following a link sent to that address proves control of the mailbox, so the
  // address is verified by the same act that sets the password.
  await query(
    `update auth_credentials
        set password_hash = $2,
            password_changed_at = now(),
            updated_at = now(),
            email_verified_at = coalesce(email_verified_at, now())
      where user_id = $1`,
    [claim.userId, await hashPassword(password)],
  );

  if (displayName) {
    await query(`update profiles set display_name = $2 where id = $1`, [
      claim.userId,
      displayName,
    ]);
  }

  const session = await createSession(claim.userId);
  (await cookies()).set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  // Land them on the tasting they were invited to, when we know which.
  const tastingId = claim.payload?.tastingId;
  redirect(typeof tastingId === "string" ? `/tastings/${tastingId}` : "/taste");
}
