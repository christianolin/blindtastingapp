"use server";

import { getOptionalUser } from "@/lib/auth/dal";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { issueToken } from "@/lib/auth/tokens";
import { sendEmail } from "@/lib/email/client";
import { verifyEmailTemplate } from "@/lib/email/templates";

// Re-send the confirmation link, for the banner's "Resend" button. Returns
// whether it went out, so the banner can say so.
//
// The address is taken from the session, never from the caller: accepting one
// would turn this into an open relay that emails arbitrary people on our behalf.
export async function resendVerification(): Promise<boolean> {
  const user = await getOptionalUser();
  if (!user || user.emailVerified) return false;

  // Tight limit — this is a send-email button behind a single click.
  if (!(await checkRateLimit(`verify-resend:${user.id}`, 3, 3600))) return false;

  const token = await issueToken({
    purpose: "EMAIL_VERIFY",
    userId: user.id,
    email: user.email,
    ttlMinutes: 60 * 24,
  });
  const { subject, html } = verifyEmailTemplate(
    `${process.env.NEXT_PUBLIC_SITE_URL}/auth/verify?token=${token}`,
  );
  await sendEmail({ to: user.email, subject, html });
  return true;
}
