import { ABOUT_LINES } from "../invites/copy";

// The one platform-invite email template (spec §7; D3, D17, D18; plan
// refinement 9). `platformInviteEmail` builds the real message (escaped
// names, real URL) used for the "Open in my mail app" mailto fallback.
// `supabaseInviteTemplateHtml` derives the same body with Go template
// placeholders for the Supabase dashboard's "Invite user" template, which
// also serves tasting invites — hence the `{{ if .Data.platform_invite_code
// }} … {{ else }} … {{ end }}` wrap, with a generic `else` branch. Pure
// module: only a relative runtime import, nothing from the framework or the
// environment.
//
// D18: mail clients read no CSS variables, so this is the one place in the
// app brand hex is written — `#5C1A2B` (bordeaux) and `#F5EFE3`
// (parchment), CLAUDE.md's tokens, inlined here only.

const BORDEAUX = "#5C1A2B";
const PARCHMENT = "#F5EFE3";

export type PlatformInviteMessage = {
  subject: string;
  preheader: string;
  text: string;
  html: string;
  buttonUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "Hi Anna," / "Hi," (plan copy).
function salutationLine(inviteeName: string | null, escape: boolean): string {
  if (!inviteeName) return "Hi,";
  const name = escape ? escapeHtml(inviteeName) : inviteeName;
  return `Hi ${name},`;
}

// "{inviter} invited you to Blindr." (plan copy) — the sentence inside the
// body; the subject line itself has no trailing period.
function titleSentence(inviterName: string, escape: boolean): string {
  const name = escape ? escapeHtml(inviterName) : inviterName;
  return `${name} invited you to Blindr.`;
}

// (plan copy)
const SIGN_OFF_LINE = "If you weren't expecting this, you can ignore it.";
const JOIN_BUTTON_LABEL = "Join Blindr";

function textBody(input: { inviterName: string; inviteeName: string | null; url: string }): string {
  return [
    salutationLine(input.inviteeName, false),
    "",
    titleSentence(input.inviterName, false),
    "",
    ...ABOUT_LINES,
    "",
    `Join Blindr: ${input.url}`, // (plan copy)
    "",
    SIGN_OFF_LINE,
  ].join("\n");
}

// One HTML body for both the real send and the dashboard-template variant
// (refinement 9). `escape: false` is used only for the Go-placeholder
// variant, whose `{{ .Data.… }}` values Go's html/template escapes itself.
// `url` is never HTML-escaped either way — a real link needs none, and a Go
// placeholder must stay literal.
function htmlBody(
  input: { inviterName: string; inviteeName: string | null; url: string },
  { escape }: { escape: boolean },
): string {
  const hello = salutationLine(input.inviteeName, escape);
  const title = titleSentence(input.inviterName, escape);
  const paragraphs = ABOUT_LINES.map(
    (line) => `        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BORDEAUX};">${line}</p>`,
  ).join("\n");
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PARCHMENT};">`,
    `  <tr><td align="center" style="padding:32px 16px;">`,
    `    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${PARCHMENT};">`,
    `      <tr><td style="padding:24px;font-family:Georgia,serif;">`,
    `        <p style="margin:0 0 16px;font-size:15px;color:${BORDEAUX};">${hello}</p>`,
    `        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BORDEAUX};">${title}</h1>`,
    paragraphs,
    `        <p style="margin:24px 0;">`,
    `          <a href="${input.url}" style="display:inline-block;padding:12px 24px;background:${BORDEAUX};color:${PARCHMENT};text-decoration:none;border-radius:6px;font-size:15px;">${JOIN_BUTTON_LABEL}</a>`,
    `        </p>`,
    `        <p style="margin:0 0 16px;font-size:13px;color:${BORDEAUX};">${input.url}</p>`,
    `        <p style="margin:0;font-size:13px;color:${BORDEAUX};">${SIGN_OFF_LINE}</p>`,
    `      </td></tr>`,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");
}

export function platformInviteEmail(input: {
  inviterName: string;
  inviteeName: string | null;
  url: string;
}): PlatformInviteMessage {
  return {
    subject: `${input.inviterName} invited you to Blindr`,
    preheader: ABOUT_LINES[0],
    text: textBody(input),
    html: htmlBody(input, { escape: true }),
    buttonUrl: input.url,
  };
}

export function mailtoHref(to: string | null, message: Pick<PlatformInviteMessage, "subject" | "text">): string {
  const address = to ? encodeURIComponent(to) : "";
  const subject = encodeURIComponent(message.subject);
  const body = encodeURIComponent(message.text.replace(/\n/g, "\r\n"));
  return `mailto:${address}?subject=${subject}&body=${body}`;
}

// The Supabase dashboard's "Invite user" template also serves tasting
// invites (`inviteToTasting`), which never set `platform_invite_code` — the
// `else` branch is their generic invite (D17; plan copy: "You've been
// invited to Blindr" · "You have been invited to Blindr. Follow this link
// to accept the invite:" · "Accept the invite").
const DASHBOARD_INVITER_NAME = "{{ .Data.platform_inviter_name }}";
const DASHBOARD_CONFIRMATION_URL = "{{ .ConfirmationURL }}";

export const SUPABASE_INVITE_SUBJECT =
  "{{ if .Data.platform_inviter_name }}{{ .Data.platform_inviter_name }} invited you to Blindr{{ else }}You've been invited to Blindr{{ end }}";

function genericInviteHtml(): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PARCHMENT};">`,
    `  <tr><td align="center" style="padding:32px 16px;">`,
    `    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${PARCHMENT};">`,
    `      <tr><td style="padding:24px;font-family:Georgia,serif;">`,
    `        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BORDEAUX};">You've been invited to Blindr</h1>`,
    `        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BORDEAUX};">You have been invited to Blindr. Follow this link to accept the invite:</p>`,
    `        <p style="margin:24px 0;">`,
    `          <a href="${DASHBOARD_CONFIRMATION_URL}" style="display:inline-block;padding:12px 24px;background:${BORDEAUX};color:${PARCHMENT};text-decoration:none;border-radius:6px;font-size:15px;">Accept the invite</a>`,
    `        </p>`,
    `        <p style="margin:0;font-size:13px;color:${BORDEAUX};">${DASHBOARD_CONFIRMATION_URL}</p>`,
    `      </td></tr>`,
    `    </table>`,
    `  </td></tr>`,
    `</table>`,
  ].join("\n");
}

export function supabaseInviteTemplateHtml(): string {
  const personalized = htmlBody(
    { inviterName: DASHBOARD_INVITER_NAME, inviteeName: null, url: DASHBOARD_CONFIRMATION_URL },
    { escape: false },
  );
  return [
    "{{ if .Data.platform_invite_code }}",
    personalized,
    "{{ else }}",
    genericInviteHtml(),
    "{{ end }}",
  ].join("\n");
}
