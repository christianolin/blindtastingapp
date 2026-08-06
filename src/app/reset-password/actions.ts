"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
  revokeAllSessions,
} from "@/lib/auth/session";
import { consumeToken } from "@/lib/auth/tokens";

export type ResetState = { error: string } | null;

export async function resetPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) return { error: "The two passwords do not match." };

  const claim = await consumeToken("PASSWORD_RESET", token);
  if (!claim?.userId) {
    return { error: "That link has expired or was already used. Request a new one." };
  }

  await query(
    `update auth_credentials
        set password_hash = $2,
            password_changed_at = now(),
            updated_at = now(),
            failed_attempts = 0,
            locked_until = null
      where user_id = $1`,
    [claim.userId, await hashPassword(password)],
  );

  // A reset is the response to a possible compromise, so every existing session
  // dies with it — including any the attacker holds. Then we issue a fresh one
  // so the person who just proved control of the mailbox stays signed in.
  await revokeAllSessions(claim.userId);

  const headerList = await headers();
  const newToken = await createSession(claim.userId, {
    userAgent: headerList.get("user-agent") ?? undefined,
    ip: headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
  });
  (await cookies()).set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  redirect("/taste");
}
