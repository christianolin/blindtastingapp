# Supabase dashboard: "Confirm signup" email template

Paste this into the Supabase dashboard under **Authentication → Emails →
"Confirm signup"**. It is the mail someone gets after signing up on
`/signup`. Supabase only allows editing it once custom SMTP is set up
(done 2026-09-19, Gmail `blindrappinvite@gmail.com`).

It is **not** hand-written. Both blocks below are the exact output of
`src/lib/email/signup-confirmation.ts`: `SUPABASE_CONFIRM_SIGNUP_SUBJECT`
(subject) and `supabaseConfirmSignupTemplateHtml()` (body). A vitest test,
`src/lib/email/supabase-confirm-signup-doc.test.ts`, fails the moment this
file and the module disagree.

The button keeps Supabase's own `{{ .ConfirmationURL }}`. That link carries
the sign-up's `emailRedirectTo` (`/auth/callback?next=…`), which is how a
`next` such as `/j/<code>` or `/invite/<code>/accept` survives the
confirmation, exactly as with Supabase's default template.

## Subject

```text
Confirm your email for Blindr
```

## Body (HTML)

Paste into the **Source** tab, replacing everything there.

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#F5EFE3;">
      <tr><td style="padding:24px;font-family:Georgia,serif;">
        <p style="margin:0 0 16px;font-size:15px;color:#5C1A2B;">{{ if .Data.display_name }}Hi {{ .Data.display_name }},{{ else }}Hi,{{ end }}</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#5C1A2B;">Welcome to Blindr</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">Taste with structure, challenge yourself blind, and learn more from every bottle.</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">Confirm your email address to finish creating your account.</p>
        <p style="margin:24px 0;">
          <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;background:#5C1A2B;color:#F5EFE3;text-decoration:none;border-radius:6px;font-size:15px;">Confirm my email</a>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#5C1A2B;">{{ .ConfirmationURL }}</p>
        <p style="margin:0;font-size:13px;color:#5C1A2B;">If you didn't sign up for Blindr, you can ignore this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

## Regenerating this file

If `signup-confirmation.ts` changes, the pin test fails first. Copy the new
subject and HTML into the two fenced blocks above exactly as the module
prints them, run the test until it passes, then re-paste into the dashboard.
