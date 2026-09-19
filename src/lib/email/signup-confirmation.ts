import { ABOUT_LINES } from "../invites/copy";

// The Supabase dashboard's "Confirm signup" template: what someone gets after
// signing up on /signup. docs/email/supabase-confirm-signup-template.md holds
// the exact text to paste, pinned to this module by
// supabase-confirm-signup-doc.test.ts.
//
// The button keeps Supabase's own {{ .ConfirmationURL }}: it carries the
// sign-up's emailRedirectTo, which is how a `next` such as /j/<code> or
// /invite/<code>/accept survives the confirmation.
//
// Supabase renders templates with Go's html/template, so the {{ .Data.… }}
// value in the greeting is HTML-escaped for us. The subject has no
// placeholder at all: html/template would HTML-escape an interpolated value
// there too, and a subject line shows entities literally.
//
// Mail clients read no CSS variables, so brand hex is inlined here, as in
// platform-invite.ts.

const BORDEAUX = "#5C1A2B";
const PARCHMENT = "#F5EFE3";

export const SUPABASE_CONFIRM_SIGNUP_SUBJECT = "Confirm your email for Blindr";

const GREETING =
  "{{ if .Data.display_name }}Hi {{ .Data.display_name }},{{ else }}Hi,{{ end }}";
const CONFIRMATION_URL = "{{ .ConfirmationURL }}";

export function supabaseConfirmSignupTemplateHtml(): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PARCHMENT};">`,
    `  <tr><td align="center" style="padding:32px 16px;">`,
    `    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${PARCHMENT};">`,
    `      <tr><td style="padding:24px;font-family:Georgia,serif;">`,
    `        <p style="margin:0 0 16px;font-size:15px;color:${BORDEAUX};">${GREETING}</p>`,
    `        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BORDEAUX};">Welcome to Blindr</h1>`,
    `        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BORDEAUX};">${ABOUT_LINES[0]}</p>`,
    `        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BORDEAUX};">Confirm your email address to finish creating your account.</p>`,
    `        <p style="margin:24px 0;">`,
    `          <a href="${CONFIRMATION_URL}" style="display:inline-block;padding:12px 24px;background:${BORDEAUX};color:${PARCHMENT};text-decoration:none;border-radius:6px;font-size:15px;">Confirm my email</a>`,
    `        </p>`,
    `        <p style="margin:0 0 16px;font-size:13px;color:${BORDEAUX};">${CONFIRMATION_URL}</p>`,
    `        <p style="margin:0;font-size:13px;color:${BORDEAUX};">If you didn't sign up for Blindr, you can ignore this email.</p>`,
    `      </td></tr>`,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");
}
