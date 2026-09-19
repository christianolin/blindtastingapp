import { RESET_NEXT } from "../auth/paths";

// The Supabase dashboard's "Reset Password" email template (spec part D).
// `supabaseResetTemplateHtml()` is a pure function returning the exact HTML
// to paste into Authentication → Emails → Reset Password — the same visual
// language as `platform-invite.ts`'s `supabaseInviteTemplateHtml()`
// (Bordeaux `#5C1A2B`, Parchment `#F5EFE3`, serif heading, one button, table
// layout for email clients), but its own template: a reset email has no
// inviter/invitee to interpolate, and — unlike the invite template, which
// points at Supabase's own PKCE `{{ .ConfirmationURL }}` — its link must
// work from any device, not just the browser that asked for the reset. The
// button therefore targets the token-hash route (`/auth/confirm`, backed by
// `supabase.auth.verifyOtp`, CLAUDE.md "Auth link handling"), not
// `{{ .ConfirmationURL }}`. `next` is `RESET_NEXT`
// (`src/lib/auth/paths.ts`) URI-encoded — imported, not retyped, so this
// template can never drift from what the set-password page expects.
//
// Pure module: only a relative runtime import, nothing from the framework
// or the environment.

const BORDEAUX = "#5C1A2B";
const PARCHMENT = "#F5EFE3";

export const SUPABASE_RESET_SUBJECT = "Choose a new Blindr password";

const HEADING = "Choose a new password";
const BODY_TEXT =
  "Someone asked to reset the password for your Blindr account. Use the button to choose a new one. The link works once.";
const BUTTON_LABEL = "Choose a new password";
const FOOTER_TEXT = "If you didn't ask for this, you can ignore this email. Your password stays the same.";

// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Fauth%2Fset-password%3Freason%3Dreset
const RESET_URL =
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}` +
  `&amp;type=recovery&amp;next=${encodeURIComponent(RESET_NEXT)}`;

export function supabaseResetTemplateHtml(): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PARCHMENT};">`,
    `  <tr><td align="center" style="padding:32px 16px;">`,
    `    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${PARCHMENT};">`,
    `      <tr><td style="padding:24px;font-family:Georgia,serif;">`,
    `        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BORDEAUX};">${HEADING}</h1>`,
    `        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BORDEAUX};">${BODY_TEXT}</p>`,
    `        <p style="margin:24px 0;">`,
    `          <a href="${RESET_URL}" style="display:inline-block;padding:12px 24px;background:${BORDEAUX};color:${PARCHMENT};text-decoration:none;border-radius:6px;font-size:15px;">${BUTTON_LABEL}</a>`,
    `        </p>`,
    `        <p style="margin:0 0 16px;font-size:13px;color:${BORDEAUX};">${RESET_URL}</p>`,
    `        <p style="margin:0;font-size:13px;color:${BORDEAUX};">${FOOTER_TEXT}</p>`,
    `      </td></tr>`,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");
}
