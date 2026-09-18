# Platform invites — design

Date 2026-09-18. Owner approval 2026-09-18 (the five points under §2 "Owner"). Base `master` at `e9fb37c`. No hand-off; the copy the owner gave is quoted in §8. Models in the code: `/j/[code]` (`src/app/j/[code]/**`, the tasting join preview) for the landing page and `20260914093500_join_preview_and_late_join.sql` (`get_join_preview`) for an anon-callable preview RPC.

## 1. Goal

Any signed-in person can make a personal link — `/invite/<code>` — that brings someone onto Blindr as their friend. Opening it explains what Blindr is in the app's own words and offers "Join Blindr"; the invitee signs up (or in) and lands on `/overview` already friends with the inviter, both ways. The inviter can copy the link, share it, or have it emailed. One email template lives in the repo and is used by whichever sender exists; today that is Supabase Auth's invite mail, behind a seam a Resend sender can drop into later.

## 2. Decisions

Owner (2026-09-18):

- **D1 The link.** `/invite/<code>`; the code comes from the same alphabet and length as tasting join codes (`generate_join_code()`: 10 characters of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). A link is tied to its inviter, optionally to an invitee name and email, with `max_uses` (default 50) and an expiry (default 30 days). Entry points: `/community` and the person's own profile page. The landing page (signed out or in): eyebrow "You're invited", "{inviter} invited you to Blindr", three lines on what Blindr is (quoted from `src/app/about/page.tsx`, §8), and "Join Blindr" into the existing signup with `next` set so the invitee lands signed in on `/overview` with the inviter added as a friend both ways — two `friendships` rows, written by the SECURITY DEFINER RPC `accept_platform_invite(code)` after the first sign-in. A signed-in visitor who already has an account gets "Add {inviter} as a friend" instead. Expired, used-up and unknown codes get their own copy. The invitee's email is never shown on the page.
- **D2 The inviter's screen** after creating: the link, "Copy link", "Share" (Web Share API where available, hidden otherwise) and "Send by email" (asks for the address when the link carries none).
- **D3 One email template** in the repo — `src/lib/email/platform-invite.ts`: subject, preheader, text and HTML body, the button URL — used by whichever sender exists. For now `sendPlatformInvite` calls `supabase.auth.admin.inviteUserByEmail(email, { redirectTo: '/auth/confirm-hash?next=…' })` through `src/lib/supabase/admin.ts` (server only; the `redirectTo` pattern of `inviteToTasting`), with the explanation carried by the Supabase dashboard's "Invite user" template (its exact HTML, derived from the same module, documented in a docs file); a `mailto:` "Open in my mail app" link with the same subject and body as the zero-infrastructure fallback; and a marked seam, `src/lib/email/sender.ts` with a `PLATFORM_EMAIL_PROVIDER` env switch (`"supabase" | "resend"`) whose Resend branch is not built — only shaped so the sender drops in. Supabase's built-in SMTP allows a few emails per hour: the UI shows the server's error plainly.
- **D4 Data.** Migration `supabase/migrations/20260918130500_platform_invites.sql` (§4): table `platform_invites (id, code unique, inviter_id → profiles, invitee_email, invitee_name, max_uses int not null default 50, uses int not null default 0, expires_at timestamptz not null, created_at)`; RLS: the inviter reads and inserts own rows, nobody updates directly; `get_platform_invite_preview(code)` (SECURITY DEFINER, anon-callable; inviter display name, avatar and validity state only — never the email); `accept_platform_invite(code)` (SECURITY DEFINER, authenticated: validates, counts a use, inserts the two friendship rows idempotently, returns the inviter id); EXECUTE revoked from anon and PUBLIC on accept; fail-closed asserts at the end; a probe `.superpowers/invites/probes/20260918130500-platform-invites.mjs` in the `.superpowers/blind-tasting/probes/*.mjs` pattern (agents dry-run only; the main session applies live). Types in `src/lib/supabase/database.types.ts` (`Relationships: []`).
- **D5 Tests.** A pure module for the invite copy and validity states (`src/lib/invites/copy.ts` + test); the email template test (subject and body carry the inviter's name and the link); `safeNext` (`src/lib/safe-next.ts`, reused) on every `next` this feature builds; route tests in the repo's pure-router pattern (`view-route.ts`).

Defaults chosen here (no owner question outstanding):

- **D6 Version `20260918130500`.** The folder's latest file is `20260917100000`, `origin/master` holds nothing under `20260918`, and the memory rule prefers non-round seconds. The probe's before-phase and `scripts/scratch-apply.mjs`'s guard check the live `schema_migrations` row before any apply.
- **D7 The code is minted by the column default** `code text not null default public.generate_join_code()` (EXECUTE on that function is Supabase's default ACL, `authenticated` included). `authenticated`'s INSERT grant is column-limited to `inviter_id, invitee_email, invitee_name, max_uses, expires_at`, so no client can choose a code; a check pins the shape (`^[A-HJ-NP-Z2-9]{10}$`). A `23505` on insert (a collision, ~1 in 10^15) is retried by the action, twice. Lookups normalise `upper(btrim(code))` as join codes do.
- **D8 Bounds** as checks: `max_uses between 1 and 1000`; `expires_at > created_at and expires_at <= created_at + interval '1 year'`; `invitee_name` 1–80 characters when set; `invitee_email` stored `lower(btrim())` when set. The UI exposes neither `max_uses` nor the expiry (the defaults apply); the columns take a value for later.
- **D9 The preview returns four columns**: `state` (`'ok' | 'expired' | 'exhausted'`; `expired` wins when both hold), `inviter_name`, `inviter_avatar_url`, and `inviter_id` for signed-in callers only (as `get_join_preview` does with `host_id`). No row means an unknown code. `invitee_email` and `invitee_name` are never returned by any RPC; the name is used only in the email's salutation and as the invited account's `display_name`.
- **D10 `accept_platform_invite` rules**, in order: not signed in → refused; no row → "no invite has that code"; the caller is the inviter → "that is your own invite link"; expired → "that invite link has expired"; the caller already holds a `friendships` row to the inviter → the reverse row is inserted if missing and the inviter id returned, **no use counted** (idempotent, checked before the cap so a re-open never reads as used up); `uses >= max_uses` → "that invite link has been used up"; otherwise both rows are inserted (`on conflict (user_id, friend_id) do nothing`), `uses` is incremented once, the inviter id returned. EXECUTE for `authenticated` only — revoked from PUBLIC, `anon` and `service_role` (`auth.uid()` is null for it; the `transfer_tasting_host` OD-1 precedent).
- **D11 Two accept paths, one RPC.** (a) A first sign-in lands on `/invite/<code>/accept`, a route handler: no session → `/login?next=/invite/<code>/accept`; otherwise the RPC, then `/overview` (a refusal sends the visitor to `/invite/<code>`, which shows the matching state copy). (b) A signed-in visitor on the landing page taps "Add {inviter} as a friend" → the server action `acceptInvite(code)` → the RPC → `/u/<inviterId>`, where `FriendButton` now reads "Remove friend" (the visible confirmation).
- **D12 Auto-accept needs this browser's intent.** A friendship in either direction opens a FRIENDS-visibility cellar (`can_view_cellar`), so a crafted `/invite/<code>/accept` link opened by a signed-in person must not add a friend on its own. "Join Blindr" and the landing's "Already have an account? Sign in" post to the server action `beginJoin(code, "signup" | "login")`, which confirms the preview is `ok`, sets an httpOnly `blindr-invite-intent` cookie (value: the normalised code; path `/invite`; SameSite Lax; 24 h, so a slow confirmation email still counts) and redirects to `/signup?next=/invite/<code>/accept` or `/login?next=…`. The accept route accepts only when that cookie matches the code; otherwise it redirects to `/invite/<code>` for the explicit tap of D11(b). The route deletes the cookie either way.
- **D13 The email link lands on the accept route**: `redirectTo` is `${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash?next=/invite/<code>/accept` (the owner's `/auth/confirm-hash?next=/invite/<code>`, plus the accept segment so the mail and the signup share one first-sign-in path). Without the intent cookie (a different browser) the route falls to the landing's explicit tap, so an emailed invitee taps once: "Add {inviter} as a friend".
- **D14 The Supabase branch cannot email an existing account** (Auth has no plain-mail API). `sendPlatformInvite` first reads `profiles.email` as `inviteToTasting` does: a hit returns `{ ok: false, reason: "existing-account" }` with the plan-copy line, and the dialog keeps the mailto link. Otherwise `inviteUserByEmail(email, { redirectTo, data })` with `data = { platform_invite_code, platform_inviter_name, display_name? }`: `display_name` only when the inviter typed a name (`handle_new_user` copies it onto the profile; otherwise the email's local part, as today); the other two feed the dashboard template. The address typed at send time is used, not stored (the row is not client-updatable).
- **D15 The provider's message is the UI's message.** Any `inviteUserByEmail` error (the built-in SMTP's hourly cap included) comes back as `{ ok: false, reason: "provider", message }` and is rendered verbatim under the button, with "Open in my mail app" beneath — never a generic failure line.
- **D16 The seam.** `src/lib/email/sender.ts` exports `emailProvider()` (`PLATFORM_EMAIL_PROVIDER`, default `"supabase"`), `sendPlatformInviteEmail(to, message, meta)` and `SendResult`. The `"resend"` branch returns `{ ok: false, reason: "provider", message: "Email sending through Resend is not set up yet." }` — no SDK, no dependency, no key. The seam's comment records what changes when Resend lands: any address can be mailed (D14's existing-account rule goes), and the button URL becomes the plain landing link.
- **D17 The dashboard template is derived and pinned.** `platform-invite.ts` also exports `supabaseInviteTemplateHtml()`: the same HTML body with Go placeholders (`{{ .Data.platform_inviter_name }}`, `{{ .ConfirmationURL }}`) inside `{{ if .Data.platform_invite_code }} … {{ else }} … {{ end }}`, because the dashboard's one "Invite user" template also serves tasting invites — the `else` branch is a generic invite. `docs/email/supabase-invite-template.md` carries that HTML and the subject line to paste; a vitest test fails when the doc's fenced block and the module's output differ.
- **D18 The email HTML is the one place hex is written** (mail clients read no CSS variables): CLAUDE.md's brand values (`#5C1A2B` bordeaux, `#F5EFE3` parchment) inline in `platform-invite.ts` only. Everything on screen uses tokens.
- **D19 Landing views**, from a pure router `inviteView({ state, signedIn, isInviter })`: `unknown`, `expired`, `exhausted`, `own-link`, `join` (signed out, ok), `add-friend` (signed in, ok, not the inviter). No "already friends" view: the viewer can read only their own friendship row, and accepting still adds the missing reverse row.
- **D20 Entry points render one client component**, `InvitePeopleButton` → `InvitePeopleDialog` (a `Dialog`): on `/community` in `PageHeader`'s `actions` beside the tabs; on `/u/[id]` when `isOwnProfile`, beside "Edit profile".
- **D21 No list, no revoke.** No DELETE policy, no "Your invite links" surface, no `max_uses`/expiry inputs. A link is good for its lifetime (spec §10).
- **D22 `proxy.ts` is unchanged** — it only refreshes the session; `/invite/[code]` gates nothing itself, like `/j/[code]`.

## 3. Routes and entry points

| Route | Renders |
|---|---|
| `/invite/[code]` | the landing page (§5): `get_platform_invite_preview`, then the view D19 names |
| `/invite/[code]/accept` (route handler, GET) | D11(a) + D12: sign-in gate, intent cookie, `accept_platform_invite`, redirect |
| `/community` | unchanged, plus "Invite someone" in the header actions (D20) |
| `/u/[id]` | unchanged, plus "Invite someone" on the viewer's own profile (D20) |
| `/signup?next=/invite/<code>/accept`, `/login?next=…` | existing pages; `next` rides through `signUp`/`signIn`/`/auth/callback` as today |
| `/auth/confirm-hash?next=/invite/<code>/accept` | existing page; the email's `redirectTo` (D13) |

Every `next` is built by `src/lib/invites/links.ts` (`acceptPath`, `signupHref`, `loginHref`, `inviteUrl`, `confirmHashRedirect`) and passes `safeNext` unchanged — the test proves it.

## 4. Data (migration `20260918130500_platform_invites.sql`)

Written against the live state (the probe's before-phase dumps `generate_join_code`'s md5 and ACL; the migration pre-asserts them: body md5 `32e10e8b3ab902e7de729a8147a2e47e`, EXECUTE held by `authenticated`). Pre-asserts also: no `platform_invites` table, no function of either new name.

```sql
create table public.platform_invites (
  id uuid primary key default gen_random_uuid(),
  code text not null default public.generate_join_code(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_name text,
  max_uses int not null default 50,
  uses int not null default 0,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  constraint platform_invites_code_key unique (code),
  constraint platform_invites_code_shape check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  constraint platform_invites_max_uses_range check (max_uses between 1 and 1000),
  constraint platform_invites_uses_range check (uses >= 0),
  constraint platform_invites_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '1 year'),
  constraint platform_invites_invitee_name_len
    check (invitee_name is null or char_length(invitee_name) between 1 and 80),
  constraint platform_invites_invitee_email_folded
    check (invitee_email is null or invitee_email = lower(btrim(invitee_email)))
);
create index platform_invites_inviter_idx on public.platform_invites (inviter_id);
alter table public.platform_invites enable row level security;
create policy "platform invites read own" on public.platform_invites
  for select to authenticated using (inviter_id = auth.uid());
create policy "platform invites insert own" on public.platform_invites
  for insert to authenticated with check (inviter_id = auth.uid());
-- Supabase's default privileges grant everything to anon/authenticated on a new table.
revoke all on table public.platform_invites from public, anon, authenticated;
grant select on public.platform_invites to authenticated;
grant insert (inviter_id, invitee_email, invitee_name, max_uses, expires_at)
  on public.platform_invites to authenticated;

create or replace function public.get_platform_invite_preview(p_code text)
returns table (state text, inviter_name text, inviter_avatar_url text, inviter_id uuid)
language sql stable security definer set search_path = public as $$
  select case when i.expires_at <= now() then 'expired'
              when i.uses >= i.max_uses then 'exhausted'
              else 'ok' end,
         p.display_name, p.avatar_url,
         case when auth.uid() is not null then i.inviter_id end
  from platform_invites i
  join profiles p on p.id = i.inviter_id
  where i.code = upper(btrim(p_code));
$$;
revoke all on function public.get_platform_invite_preview(text) from public;
grant execute on function public.get_platform_invite_preview(text) to anon, authenticated;

create or replace function public.accept_platform_invite(p_code text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_invite platform_invites%rowtype;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into v_invite from platform_invites where code = upper(btrim(p_code)) for update;
  if not found then raise exception 'no invite has that code'; end if;
  if v_invite.inviter_id = v_uid then raise exception 'that is your own invite link'; end if;
  if v_invite.expires_at <= now() then raise exception 'that invite link has expired'; end if;
  -- Already accepted by this account (or the invitee had added the inviter
  -- by hand): make it mutual, count nothing, and never read as used up.
  if exists (select 1 from friendships f where f.user_id = v_uid and f.friend_id = v_invite.inviter_id) then
    insert into friendships (user_id, friend_id) values (v_invite.inviter_id, v_uid)
      on conflict (user_id, friend_id) do nothing;
    return v_invite.inviter_id;
  end if;
  if v_invite.uses >= v_invite.max_uses then raise exception 'that invite link has been used up'; end if;
  insert into friendships (user_id, friend_id) values (v_uid, v_invite.inviter_id)
    on conflict (user_id, friend_id) do nothing;
  insert into friendships (user_id, friend_id) values (v_invite.inviter_id, v_uid)
    on conflict (user_id, friend_id) do nothing;
  update platform_invites set uses = uses + 1 where id = v_invite.id;
  return v_invite.inviter_id;
end $$;
revoke all on function public.accept_platform_invite(text) from public, anon, service_role;
grant execute on function public.accept_platform_invite(text) to authenticated;
```

Post-state, same transaction, every check a `raise exception` (the M4 pattern): the table exists with exactly these nine columns and defaults; RLS enabled; exactly the two policies; `anon` holds no privilege on the table; `authenticated` holds SELECT, INSERT on exactly the five columns (`has_column_privilege`) and no UPDATE or DELETE; both functions SECURITY DEFINER with `search_path=public`, the preview `stable` and `sql`, accept `volatile` and `plpgsql`; EXECUTE: preview for `anon` and `authenticated`, accept for `authenticated` only (not `anon`, not `PUBLIC`, not `service_role`); the preview returns exactly the four columns in order; `generate_join_code`'s md5 and ACL unchanged; `friendships`' unique `(user_id, friend_id)` and its `user_id <> friend_id` check still present (accept relies on both).

Security reasoning: the preview exposes nothing a signed-in user could not already read from the public directory (`profiles` display name and avatar), plus a validity word; codes carry ~50 bits and the preview has no per-caller limit, as `get_join_preview`. `invitee_email` is readable only by its inviter through RLS and never leaves a server action. Accept writes only rows naming the caller, once per account; the intent cookie (D12) stops a crafted link from turning a signed-in visit into a friendship. `service_role` keeps its table privileges for the probe and the main session's fixtures.

The probe (`.superpowers/invites/probes/20260918130500-platform-invites.mjs`, gitignored): the synthetic-rollback pattern of `20260914093500-join-preview.mjs` — one `pg` client, `pgConfig()` from `scripts/wine-map-tiles/lib.mjs`, a before-phase against live and an after-phase that builds fixtures on the seeded `demo.*@blindr.invalid` accounts, applies the migration file inside the transaction, runs every scenario in a savepoint with `set local role` + `request.jwt.claims` impersonation, and ends both phases in ROLLBACK, then reads live once more to show nothing persisted. Its EXPECT table is written before the first run. Scenarios in §11.

## 5. The landing page (`/invite/[code]`)

Layout as `/j/[code]`: `Wordmark`, then one `Card` (max-w-sm). Inside, for `join` and `add-friend`: `Eyebrow` "You're invited"; `Avatar` (`lg`) + `h1` "{inviter} invited you to Blindr" (font-heading); the three lines (§8) as three paragraphs; then the action. `join`: a form posting `beginJoin(code, "signup")` with a full-width 44 px primary submit "Join Blindr", and under it "Already have an account?" + a text submit "Sign in" posting `beginJoin(code, "login")`. `add-friend`: a client button calling `acceptInvite(code)` ("Add {inviter} as a friend", pending "Adding…", the action's `{ error }` inline in `text-destructive`), and a secondary link "Not now" to `/overview`. `own-link`: the same header, the plan-copy pair for one's own link, and "Back to the overview". `expired` / `exhausted` / `unknown`: the `/j` `MessageCard` shape — title "Couldn't open that invite", the state line, "Back to the overview" (`/overview`; signed out it goes through `/login`). No invitee name or email anywhere on the page; no counts (uses, max) either — they belong to the inviter.

Signed-out `add-friend` cannot occur (`signedIn` false → `join`); a signed-in visitor on their own link gets `own-link` ahead of everything but the state.

## 6. The inviter's screen (`InvitePeopleDialog`)

A `Dialog` (`DialogContent`, `DialogTitle` "Invite a friend to Blindr"). Step 1: two controlled `Input`s — "Their name (optional)" and "Their email (optional)" — and "Make a link" (calls `createPlatformInvite({ inviteeName, inviteeEmail })`; the action's `{ error }` inline). Step 2 (the result; the dialog never auto-closes): the link in mono, wrapped, selectable (`inviteUrl`); a row of 44 px controls — "Copy link" (`navigator.clipboard.writeText`, "Copied" for 2 s, the `JoinLinkRow` pattern), "Share" (rendered only once a `useEffect` has seen `navigator.share`; `navigator.share({ url, text: subject })`, `AbortError` ignored), "Send by email" (with an email from step 1: sends at once; without: reveals a controlled email `Input` first, then sends); "Open in my mail app" as an `<a href={mailtoHref(email, message)}>` (email may be empty → `mailto:?subject=…`). Under the row: the send result — "Sent to {email}" on success, otherwise the `message` verbatim (D15). Footer line: "Works until {expiry} · up to {n} people" with the expiry through `LocalDateTime` (format `card`). Escape and the close button close it; the dialog resets to step 1 on reopen.

## 7. Email

- `platformInviteEmail({ inviterName, inviteeName, url })` → `{ subject, preheader, text, html, buttonUrl }`. Subject "{inviter} invited you to Blindr"; preheader = the first of the three lines; text: the salutation ("Hi {name}," or "Hi,"), "{inviter} invited you to Blindr.", the three lines, "Join Blindr: {url}", the sign-off line (plan copy); html: a single-column 560 px table, parchment ground, bordeaux button labelled "Join Blindr" to `buttonUrl`, the same text, the raw URL under the button for clients that strip buttons. Names are HTML-escaped; the template variant (`supabaseInviteTemplateHtml()`) substitutes Go placeholders unescaped, since Go's html/template escapes them itself.
- `mailtoHref(to, message)` → `mailto:{to}?subject={enc}&body={enc}` with `encodeURIComponent`, CRLF line breaks in the body, `to` optional.
- Sender (D16): `sendPlatformInviteEmail(to, message, { code, inviterName, inviteeName })` → `SendResult = { ok: true } | { ok: false; reason: "existing-account" | "provider"; message: string }`.
- Dashboard (D17): Subject `{{ if .Data.platform_inviter_name }}{{ .Data.platform_inviter_name }} invited you to Blindr{{ else }}You've been invited to Blindr{{ end }}`; body = `supabaseInviteTemplateHtml()`. The redirect URL allow-list must admit `${NEXT_PUBLIC_SITE_URL}/auth/confirm-hash*` (it already does for tasting invites; PI-V3 confirms).

## 8. Copy

Owner copy (verbatim): "You're invited" · "{inviter} invited you to Blindr" · "Join Blindr" · "Add {inviter} as a friend" · "Copy link" · "Share" · "Send by email" · "Open in my mail app".

The three lines, quoted from `src/app/about/page.tsx` in this order — the hero's sentence, then the two "More than a score" paragraphs:
1. "Taste with structure, challenge yourself blind, and learn more from every bottle."
2. "We believe wine deserves more than a quick score. By giving people a structured way to observe, describe, compare and learn, Blindr helps curious drinkers develop their palate."
3. "Built for enthusiasts, committed beginners, blind tasters, collectors and professionals who want to learn more from every bottle."

Reused existing strings: "Back to the overview" (`/j/[code]/page.tsx`), "Copied" (`join-link-row.tsx`), "Adding…" / "Remove friend" (`friend-button.tsx`), "Already have an account?" / "Sign in" (`signup-form.tsx`). Every other string is plan copy, listed in the plan and marked `(plan copy)` in code.

## 9. Design system

Repo primitives only (`Card`, `Button`, `Input`, `Label`, `Dialog`, `Avatar`, `Eyebrow`, `PageHeader`, `Wordmark`, `LocalDateTime`, `WineGlassLoader`), theme tokens (no hex outside the email module, D18), light and dark, 44 px tap targets on every phone control (`min-h-11`, `md:pointer-fine:min-h-0` where a laptop control may be tighter), controlled inputs throughout, lucide icons only if any (`Link2`, `Share2`, `Mail`, `Copy` ship with lucide). `Button render={<Link/>}` takes `nativeButton={false}`.

## 10. Non-goals

Listing or revoking links (D21); custom `max_uses`/expiry in the UI; the Resend sender itself (only its seam, D16); mailing an existing account through Supabase (D14); a password for an email-invited account (the existing `/auth/set-password` page is unlinked today — the same gap tasting invites have; not widened, not fixed here); any change to tasting invites beyond the shared dashboard template's `else` branch; invite analytics; rate-limiting the preview.

## 11. Verification

`npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test` (the new tests: `copy`, `links`, `platform-invite`, `invite-route`, `supabase-template-doc`), `node --test scripts/wine-map-tiles/lib.test.mjs`, `npm run build`; the probe's before/after rows all matching and `DRY-OK 20260918130500 platform_invites` from `scripts/scratch-apply.mjs --mode dry`. Probe scenarios: anon preview of an `ok`, an expired and an exhausted code (state, name, avatar, `inviter_id` null), signed-in preview (`inviter_id` set), unknown and lower-case/padded codes; an inviter's insert without `code` (a 10-character code in the alphabet, defaults applied) and with `code`, `uses` or `created_at` (refused); an insert for another `inviter_id` (refused); the inviter's `update … set uses` (refused); another user's read (no rows); accept as anon and as `service_role` (permission denied), as the inviter (own link), on an expired and an exhausted code (refused), as a stranger (both rows, `uses` +1), again (rows unchanged, `uses` unchanged), by a user who already had a one-way row to the inviter (reverse row added, `uses` unchanged); the post-state block itself raising on a deliberately broken copy of the file (one grant flipped) in a savepoint. Then the main session applies live, pastes the dashboard template, and runs the browser checks in the plan's PI-V3 at 375 px and 1280 px in both themes.
