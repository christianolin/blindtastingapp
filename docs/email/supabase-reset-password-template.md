# Supabase dashboard: "Reset Password" email template

This is what to paste into the Supabase dashboard for **Authentication →
Emails → Reset Password** — the template `supabase.auth.resetPasswordForEmail`
sends, triggered by `requestPasswordReset` (`src/app/login/actions.ts`) from
the "Forgot password?" flow (`/login/forgot`).

It is **not** hand-written. Both blocks below are the exact output of
`src/lib/email/password-reset.ts`'s `supabaseResetTemplateHtml()` (body) and
`SUPABASE_RESET_SUBJECT` (subject). A vitest test,
`src/lib/email/supabase-reset-template-doc.test.ts`, fails the moment this
file and the module disagree.

Unlike the invite template (`docs/email/supabase-invite-template.md`), this
one does not use Supabase's PKCE `{{ .ConfirmationURL }}` — that link only
resolves in the same browser that asked for the reset. A password reset has
no such guarantee (the recipient may open the email on a different device or
in a different browser), so the button targets the token-hash route,
`/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
(`src/app/auth/confirm/route.ts`), which calls `supabase.auth.verifyOtp`
server-side and needs no matching PKCE verifier — it works wherever the link
is opened (CLAUDE.md "Auth link handling"). `next` is `RESET_NEXT`
(`src/lib/auth/paths.ts`, `/auth/set-password?reason=reset`) URI-encoded, so
the link lands the recipient on the reset-mode set-password page the moment
the session exists.

## Subject

```text
Choose a new Blindr password
```

## Body (HTML)

```html
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#F5EFE3;">
      <tr><td style="padding:24px;font-family:Georgia,serif;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#5C1A2B;">Choose a new password</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#5C1A2B;">Someone asked to reset the password for your Blindr account. Use the button to choose a new one. The link works once.</p>
        <p style="margin:24px 0;">
          <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Fauth%2Fset-password%3Freason%3Dreset" style="display:inline-block;padding:12px 24px;background:#5C1A2B;color:#F5EFE3;text-decoration:none;border-radius:6px;font-size:15px;">Choose a new password</a>
        </p>
        <p style="margin:0 0 16px;font-size:13px;color:#5C1A2B;">{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=%2Fauth%2Fset-password%3Freason%3Dreset</p>
        <p style="margin:0;font-size:13px;color:#5C1A2B;">If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

## Before pasting

- **Site URL.** `{{ .SiteURL }}` is filled in from the Supabase dashboard's
  own Authentication → URL Configuration → Site URL setting, not from the
  app's `NEXT_PUBLIC_SITE_URL` env var — this template builds the button
  href by concatenating `{{ .SiteURL }}` onto a path itself (it has no
  `{{ .ConfirmationURL }}` to lean on), so that setting must stay
  `https://blindrapp.vercel.app`, with **no trailing slash** (checked
  2026-09-19), or the button and the plain-text link below it point at the
  wrong place.
- **Redirect URL allow-list** (Authentication → URL Configuration) must
  admit `https://blindrapp.vercel.app/auth/confirm*` — the same allow-list
  entry the token-hash route needs for any admin-generated link that uses
  it, not only this one.
- **PKCE fallback, unused by this template.** `resetPasswordForEmail`'s own
  `redirectTo` (`src/app/login/actions.ts`) still points at
  `/auth/callback?next=…` — that is only Supabase's built-in default-template
  fallback (`?code=`, same-browser-only) and is never reached once this
  dashboard template is pasted in, since this template's button carries its
  own `/auth/confirm` link instead.

## Regenerating this file

This file is derived, not authored: if `password-reset.ts`'s template
changes, `src/lib/email/supabase-reset-template-doc.test.ts` fails first
(its fenced blocks no longer match `supabaseResetTemplateHtml()` /
`SUPABASE_RESET_SUBJECT`). Re-run it, copy the new HTML and subject into the
two fenced blocks above exactly as printed, run the test again until it
passes, then re-paste into the dashboard.
