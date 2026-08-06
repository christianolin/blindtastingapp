import "server-only";
import { Resend } from "resend";

// Lazy: constructing Resend at module load would make every route that merely
// imports this file fail when the key is absent (local dev, CI, preview builds
// without secrets).
let client: Resend | null = null;
function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Returns whether the message was handed to Resend. Callers deliberately ignore
// this: a bounced verification mail must not roll back a completed signup, and
// a failed reset mail must not tell the caller whether the address exists.
// It is returned anyway so tests can assert on it.
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const api = resend();
  if (!api) {
    // Loud in the log, harmless to the request. Without this an unset key looks
    // exactly like a delivered email.
    console.error(
      `email NOT sent (RESEND_API_KEY unset): "${subject}" to ${to.replace(/(.).*(@.*)/, "$1***$2")}`,
    );
    return false;
  }
  const { error } = await api.emails.send({
    from: process.env.EMAIL_FROM ?? "Blindr <onboarding@resend.dev>",
    to,
    subject,
    html,
  });
  if (error) {
    console.error(`email send failed: ${error.message}`);
    return false;
  }
  return true;
}
