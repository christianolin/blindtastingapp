"use server";

import { query } from "@/lib/auth/db";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { resetPasswordTemplate } from "@/lib/email/templates";

export type ForgotState = { sent: true } | { error: string } | null;

export async function requestReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  if (!(await checkRateLimit(`reset:${email.toLowerCase()}`, 3, 3600))) {
    return { error: "Too many requests. Try again in an hour." };
  }

  // Only a VERIFIED address may reset. An unverified one has never been proven
  // to belong to the account holder, so honouring it would turn signup into an
  // account-takeover path: register someone else's address, then "reset" it.
  const rows = await query<{ user_id: string }>(
    `select user_id from auth_credentials
      where lower(email) = lower($1) and email_verified_at is not null`,
    [email],
  );

  if (rows.length > 0) {
    const token = await issueToken({
      purpose: "PASSWORD_RESET",
      userId: rows[0].user_id,
      email,
      ttlMinutes: 60,
    });
    const { subject, html } = resetPasswordTemplate(
      `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}`,
    );
    await sendEmail({ to: email, subject, html });
  }

  // The same answer either way, so this form cannot be used to discover which
  // addresses have accounts.
  return { sent: true };
}
