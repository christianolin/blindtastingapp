"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/auth/db";
import { hashPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
} from "@/lib/auth/session";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { verifyEmailTemplate } from "@/lib/email/templates";

export type SignUpFormState = { error: string } | null;

// Verify-later: the account works immediately and a banner nudges until the
// address is confirmed. So this redirects on success rather than returning a
// "check your email" state — there is nothing to wait for.
export async function signUp(
  _prevState: SignUpFormState,
  formData: FormData,
): Promise<SignUpFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (ip && !(await checkRateLimit(`signup-ip:${ip}`, 5, 3600))) {
    return { error: "Too many sign-ups from here. Try again later." };
  }

  const existing = await query<{ user_id: string }>(
    `select user_id from auth_credentials where lower(email) = lower($1)`,
    [email],
  );
  if (existing.length > 0) {
    // Deliberately not "that email is already registered": this form is
    // unauthenticated, so a precise answer would let anyone test whether a
    // given address has an account here.
    return { error: "That email cannot be used. Try signing in instead." };
  }

  const userId = randomUUID();
  await query(
    `insert into profiles (id, display_name, email) values ($1, $2, $3)`,
    [userId, displayName || email.split("@")[0], email],
  );
  await query(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, $3)`,
    [userId, email, await hashPassword(password)],
  );

  const token = await createSession(userId, {
    userAgent: headerList.get("user-agent") ?? undefined,
    ip: ip || undefined,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  const verifyToken = await issueToken({
    purpose: "EMAIL_VERIFY",
    userId,
    email,
    ttlMinutes: 60 * 24,
  });
  const { subject, html } = verifyEmailTemplate(
    `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify?token=${verifyToken}`,
  );
  // sendEmail logs and continues on failure: a bounced verification mail must
  // not cost the user the account they just created. The banner will still
  // nudge them, and resending is cheap.
  await sendEmail({ to: email, subject, html });

  redirect("/taste");
}
