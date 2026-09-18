# Supabase dashboard: "Invite user" email template

This is what to paste into the Supabase dashboard for **Authentication →
Email Templates → "Invite user"** — the template `supabase.auth.admin.
inviteUserByEmail` sends (`src/lib/email/sender.ts`'s `"supabase"` branch).

It is **not** hand-written. Both blocks below are the exact output of
`src/lib/email/platform-invite.ts`'s `supabaseInviteTemplateHtml()` (body)
and `SUPABASE_INVITE_SUBJECT` (subject) — the same module that builds the
real (non-dashboard) email and the `mailto:` fallback, so the three "what
Blindr is" lines and the brand look can never drift between the two. A
vitest test, `src/lib/email/supabase-template-doc.test.ts`, fails the moment
this file and the module disagree.

**One dashboard template serves two features** (D17): this feature's
platform invites (`/invite/<code>`, `data.platform_invite_code` +
`data.platform_inviter_name` set) and the pre-existing tasting invites
(`inviteToTasting`, `src/app/tastings/[id]/actions.ts`, which set neither).
The Go `{{ if .Data.platform_invite_code }} … {{ else }} … {{ end }}` wrap
picks the personalised platform-invite copy when that key is present and
falls back to a generic "you've been invited" message otherwise — the
`else` branch is what a tasting-invited recipient sees, unchanged from
before this feature.

## Subject

```text
{{ if .Data.platform_inviter_name }}{{ .Data.platform_inviter_name }} invited you to Blindr{{ else }}You've been invited to Blindr{{ end }}
```

## Body (HTML)

```html
{{ if .Data.platform_invite_code }}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#F5EFE3;">
      <tr><td style="padding:24px;font-family:Georgia,serif;">
        <p style="margin:0 0 16px;font-size:15px;color:#5C1A2B;">Hi,</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#5C1A2B;">{{ .Data.platform_inviter_name }} invited you to Blindr.</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">Taste with structure, challenge yourself blind, and learn more from every bottle.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">We believe wine deserves more than a quick score. By giving people a structured way to observe, describe, compare and learn, Blindr helps curious drinkers develop their palate.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">Built for enthusiasts, committed beginners, blind tasters, collectors and professionals who want to learn more from every bottle.</p>
        <p style="margin:24px 0;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#5C1A2B;color:#F5EFE3;text-decoration:none;border-radius:6px;font-size:15px;">Join Blindr</a>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#5C1A2B;">{{ .ConfirmationURL }}</p>
        <p style="margin:0;font-size:13px;color:#5C1A2B;">If you weren't expecting this, you can ignore it.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
{{ else }}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#F5EFE3;">
      <tr><td style="padding:24px;font-family:Georgia,serif;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#5C1A2B;">You've been invited to Blindr</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">You have been invited to Blindr. Follow this link to accept the invite:</p>
        <p style="margin:24px 0;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#5C1A2B;color:#F5EFE3;text-decoration:none;border-radius:6px;font-size:15px;">Accept the invite</a>
        </p>
        <p style="margin:0;font-size:13px;color:#5C1A2B;">{{ .ConfirmationURL }}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
{{ end }}
```

## Before pasting

- **Redirect URL allow-list** (Authentication → URL Configuration) must
  admit `${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash*` — it already does for
  tasting invites (`inviteToTasting` uses the same `redirectTo` shape), so
  this feature needs no change there. `ConfirmationURL` in the body above is
  `${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash?next=/invite/<code>/accept`
  (D13; `confirmHashRedirect` in `src/lib/invites/links.ts`) — never
  `/auth/callback`: an admin-generated link (this is one) carries its
  tokens in a URL fragment, which only `/auth/confirm-hash` parses
  (CLAUDE.md "Auth link handling").
- **PI-V3 compares before pasting.** This doc's `else` branch is Supabase's
  default "Invite user" wording, reproduced here as the best guess at what
  the live dashboard already shows a tasting-invited recipient. Before
  pasting, the main session reads the live template first — if the actual
  wording differs, the fix goes in `genericInviteHtml()` /
  `SUPABASE_INVITE_SUBJECT`'s `{{ else }}` branch in `platform-invite.ts`
  (never hand-edited here), then this doc is regenerated (below) and the
  pin test rerun before it is pasted.
- **Rate limit.** Supabase's built-in SMTP allows only a few emails per
  hour. When it is hit, `inviteUserByEmail`'s error comes back through
  `sendPlatformInviteEmail` as `{ ok: false, reason: "provider", message }`
  and `InvitePeopleDialog` shows that `message` verbatim under the button
  (D15) — never a generic "something went wrong" line — with "Open in my
  mail app" left available beneath it.

## Regenerating this file

This file is derived, not authored: if `platform-invite.ts`'s template
changes, `src/lib/email/supabase-template-doc.test.ts` fails first (its
fenced blocks no longer match `supabaseInviteTemplateHtml()` /
`SUPABASE_INVITE_SUBJECT`). Re-run it, copy the new HTML and subject into
the two fenced blocks above exactly as printed, run the test again until it
passes, then re-paste into the dashboard.
