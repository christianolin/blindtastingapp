import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmHashRedirect } from "@/lib/invites/links";
import type { PlatformInviteMessage } from "@/lib/email/platform-invite";

// The platform-invite sender seam (spec §2 D3, D14, D15, D16; plan PI-D1).
// This is the ONE file in the feature that imports `createAdminClient`: the
// service role stays here — never in a page, a component, a pure module or
// `src/app/invite/actions.ts` itself.
//
// Today the only real provider is Supabase Auth's invite mail
// (`auth.admin.inviteUserByEmail`, the `inviteToTasting` pattern). Its body
// is NOT `message.html`: Auth sends the dashboard's "Invite user" template,
// which `supabaseInviteTemplateHtml()` derives from the same module and
// `docs/email/supabase-invite-template.md` pins. `data.platform_invite_code`
// and `data.platform_inviter_name` feed that template's personalised branch;
// `data.display_name` is passed only when the inviter typed a name
// (`handle_new_user` copies it onto the new profile — otherwise the email's
// local part, as today). The link Auth mails lands on
// `/auth/confirm-hash?next=/invite/<code>/accept` (D13): admin-generated
// links carry their tokens in a URL fragment, so they go through
// confirm-hash, never /auth/callback (CLAUDE.md "Auth link handling").
//
// D14 — what the Supabase branch cannot do: Auth has no plain-mail API, so an
// address that already has an account cannot be emailed through it. The
// action (`sendPlatformInvite`) checks `profiles.email` first and answers
// `existing-account` without reaching this seam. The address typed at send
// time is used, never stored.
//
// D16 — what changes when Resend lands: the "resend" branch below will send
// `message` (subject, preheader, text, html) itself, to any address — so
// D14's existing-account rule in the action goes away, and
// `message.buttonUrl` becomes the plain landing link (`inviteUrl`) rather
// than an Auth confirmation link. Until then the branch is only shaped: no
// SDK, no dependency, no key.
//
// D15 — the provider's message is the UI's message: any error comes back as
// `{ ok: false, reason: "provider", message }` verbatim (the built-in SMTP's
// hourly cap included), never wrapped in a generic line.

export type EmailProvider = "supabase" | "resend";

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "existing-account" | "provider"; message: string };

// (plan copy) D16: the Resend branch is a seam, not a sender.
const RESEND_NOT_SET_UP = "Email sending through Resend is not set up yet.";

/** `PLATFORM_EMAIL_PROVIDER`: "resend" only when it says exactly that, else "supabase". */
export function emailProvider(): EmailProvider {
  return process.env.PLATFORM_EMAIL_PROVIDER === "resend" ? "resend" : "supabase";
}

export async function sendPlatformInviteEmail(
  to: string,
  message: PlatformInviteMessage,
  meta: { code: string; inviterName: string; inviteeName: string | null },
): Promise<SendResult> {
  if (emailProvider() === "resend") {
    // Shaped only (D16). `message` is what this branch will send once built.
    return { ok: false, reason: "provider", message: RESEND_NOT_SET_UP };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(to, {
    redirectTo: confirmHashRedirect(process.env.NEXT_PUBLIC_SITE_URL ?? "", meta.code),
    data: {
      platform_invite_code: meta.code,
      platform_inviter_name: meta.inviterName,
      ...(meta.inviteeName ? { display_name: meta.inviteeName } : {}),
    },
  });
  if (error) return { ok: false, reason: "provider", message: error.message };
  return { ok: true };
}
