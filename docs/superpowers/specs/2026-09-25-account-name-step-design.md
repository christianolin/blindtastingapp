# Account creation: one name, everywhere — design

Date: 2026-09-25. Owner decisions 2026-09-24: keep signup short (name, email,
password); the optional "set up your profile" step after first sign-in belongs to
the first-run tour (spec `2026-09-25-first-run-tour-design.md`, its last step).
This spec fixes how a person's name is collected, which produced the live bug
"Carsten Olin Olin" (profile 42eec649…, corrected by hand 2026-09-24 with the
owner's OK), and tidies what invited accounts are called.

## 1. What went wrong

Since commit 4995d6a (2026-09-19) the signup form and the invited-account
"Welcome to Blindr" step ask for *First name* + *Last name (optional)* and join
them with `fullName()`. The welcome step pre-fills the FIRST-name box with the
whole name the inviter typed ("Carsten", or the full name, or an email local part
like `carsten.olin`) and leaves the last-name box empty; completing the first box
to "Carsten Olin" and typing "Olin" in the second (or iPhone autofill doing it)
yields "Carsten Olin Olin". Nothing downstream ever uses first and last name
separately: `profiles.display_name` is the one rendered name, `/profile/edit`
edits it as one field, and the `first_name`/`last_name` metadata keys are read by
nothing. The split is the bug's cause and has no consumer.

## 2. Decisions

- **D1 One field: "Your name".** Signup and the welcome step each show a single
  required text field labelled "Your name" with the helper "How you'll appear to
  other tasters." (owner copy approval needed), `autoComplete="name"`,
  `maxLength` 80. `/profile/edit`'s single "Name" field is unchanged.
- **D2 Normalise, never concatenate.** A pure `normalizeName(raw)` (trim, collapse
  internal whitespace) replaces `fullName(first, last)`. Server actions refuse an
  empty result ("Please enter your name.") and one longer than 80 characters
  ("Please use a shorter name (80 characters at most)."). `first_name`/`last_name`
  are no longer written to auth metadata; `display_name` still is (the dashboard
  email templates read `.Data.display_name`, so they need no change).
- **D3 Welcome-step pre-fill.** The invited account's field is pre-filled with the
  best suggestion available, fully editable: `user_metadata.display_name` when the
  inviter typed a name; otherwise a prettified email local part through a pure
  `suggestNameFromEmail(email)` — split on `.`, `_`, `-` and digits, title-case
  each part, join with spaces (`carsten.olin` → "Carsten Olin", `cdo` → "Cdo",
  `jens_h2` → "Jens H"); never an empty string (falls back to the raw local part).
  The suggestion is a suggestion: nothing is saved until the person presses "Save
  and continue".
- **D4 Tasting invites keep passing no name** (the host types only an email or
  picks a friend); D3's pre-fill now gives those accounts a readable name to
  confirm instead of `carsten.olin`.
- **D5 The inviter's "Their name (optional)"** in the platform-invite dialog keeps
  feeding the email salutation and the welcome-step pre-fill (spec D9/D14 of
  platform invites), and nothing else — unchanged, but its helper text says
  "They'll confirm it when they join." (owner copy approval).
- **D6 Everything else unchanged**: the confirmation-link flow (`/auth/callback`),
  the fragment-token invite flow (`/auth/confirm-hash`), the password gate and
  `PASSWORD_SET_FLAG` written in the same `updateUser` call as the password, the
  `window.location.replace(next)` exit that the invite accept route relies on, the
  reset-password mode (no name field), the `sameSiteNext` rule.

## 3. Files

- `src/lib/auth/full-name.ts` → renamed in place to `src/lib/auth/name.ts`:
  `normalizeName`, `suggestNameFromEmail`, `NAME_MAX = 80`, `NAME_REQUIRED`,
  `NAME_TOO_LONG` copy; `full-name.test.ts` replaced by `name.test.ts`.
- `src/app/signup/signup-form.tsx`, `src/app/signup/actions.ts`: one field; the
  action reads `name`, normalises, validates, `auth.signUp({ data: { display_name } })`.
- `src/app/auth/set-password/page.tsx`, `set-password-form.tsx`, `actions.ts`;
  `src/lib/auth/password-copy.ts` + test: labels ("Your name", helper), the
  pre-fill from D3, `passwordUpdateData(mode, displayName)` unchanged in shape.
- `src/components/invite/invite-people-dialog.tsx`: helper text (D5).
- Tests: `name.test.ts` (normalise cases: trims, collapses, empty, 81 chars;
  suggestion cases above), `password-copy.test.ts` (new labels), signup/set-password
  action unit tests if present (grep first).
- CLAUDE.md: replace any first/last-name description (none exists yet) with one
  bullet: one name field everywhere, `normalizeName`, the pre-fill rule, and the
  2026-09-19 "Carsten Olin Olin" incident as the reason.

## 4. Copy (owner approval needed)

"Your name" · "How you'll appear to other tasters." · "Please enter your name." ·
"Please use a shorter name (80 characters at most)." · invite dialog helper
"They'll confirm it when they join."

## 5. Tests and rollout

Unit tests as above; `tsc`, eslint, build. One production deploy, no migration.
Smoke on the live site: `/signup` renders one name field; the welcome step for an
invited demo account pre-fills a readable name (mint an invite to a fresh
`.invalid` address is not possible without email delivery — verify the pre-fill
rule with the unit tests and the form render with a signed-in demo account opening
`/auth/set-password` directly, which the page treats as setup mode).

## 6. Out of scope

Collecting avatar, location or favourites at signup (the tour's last step handles
that, optionally); changing `handle_new_user()`; storing first/last names.
