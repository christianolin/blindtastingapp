@AGENTS.md

# Blindr

A web app for running blind wine tastings using VM/DM scoring rules.

## Stack

- Next.js (TypeScript, App Router), Tailwind CSS, shadcn/ui components.
- Supabase: Postgres, Auth (email + password/magic link), Realtime.
- Deployed to Vercel (not yet wired up).

## Brand assets

`src/components/logo.tsx` — `BlindrMark`, `BlindrAppIcon`, `BlindrWordmark`,
`BlindrLockup` — is the "Sip Blind" logo (a blindfolded taster tipping a
glass), ported from a design handoff. Brand hex values (Bordeaux `#5C1A2B`,
Gold `#C3A25B`, Gold deep `#B78E42`, Parchment `#F5EFE3`) are wired into
`globals.css`'s `--primary`/`--gold`/`--gold-deep`/`--background` tokens —
change the palette there, not by hand-editing the logo component. Wordmark
font is Cormorant Garamond (`--font-heading`), UI font is Manrope
(`--font-sans`), both loaded in `src/app/layout.tsx`.

The app is light by default; dark only renders once the user explicitly picks
it from the theme menu (`src/lib/theme.ts`'s `readTheme`, `THEME_SCRIPT` in
`src/app/layout.tsx` — both ignore the OS preference on first paint now,
2026-09-14 hotfix). The dark palette keeps the same bordeaux `--primary` light
uses, never blue (`globals.css`'s `.dark` block — ruled out after trying rose
and indigo).

`src/app/icon.svg` (static file, native SVG rendering — used as the browser
favicon) renders correctly. `src/app/apple-icon.tsx` generates the iOS icon
via `next/og`'s `ImageResponse`, which uses Satori — **Satori does not
correctly interpret an SVG `transform="rotate(...)"` on a group**; it was
tried two ways (raw shapes with the transform, and re-embedding the whole
SVG as a base64 data-URI `<img>`) and both rendered the glass mangled. The
fix was to bake the rotation into each path/line's coordinates by hand
(precompute the rotated points) so no `transform` attribute exists at all.
If the mark's geometry ever changes, apple-icon.tsx's coordinates need to be
recomputed the same way — don't just copy the source SVG's `<g transform>`
in.

## Environment

Copy `.env.example` to `.env.local` and fill in from the Supabase project
dashboard (Project Settings → API):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, used for inviting participants by
  email (`supabase.auth.admin.inviteUserByEmail`). Never import
  `src/lib/supabase/admin.ts` from client components.

`src/lib/supabase/database.types.ts` is hand-written (Docker isn't available
for `supabase gen types --local`, and `--linked` needs a logged-in CLI
session). It must match `supabase/migrations/*_init_schema.sql` — update both
together. Every table needs `Relationships: []` and the schema needs
`Views: {}`, or postgrest-js's generic inference silently collapses to
`never` with no clear error.

Schema/RLS changes go through `supabase/migrations/`, pushed with
`npx supabase db push --db-url "<pooler-connection-string>"`. The direct
`db.<ref>.supabase.co` host is IPv6-only and won't resolve on IPv4-only
networks — use the connection pooler string from Project Settings → Database
→ Connection pooling instead.

## Dev server gotcha: spurious 404s on nested dynamic routes

Turbopack's dev cache has repeatedly gone stale on routes like
`/tastings/[id]/wines/new` — a fresh `npm run dev` (or one that's been
stop/started a few times in the same session) sometimes 404s a route that
demonstrably exists and worked before. Tell: the 404 page itself renders
unstyled (plain black/white, ignoring globals.css) — a sign it's a
framework-level routing miss, not our own `notFound()`. Fix: stop the
server, `rm -rf .next`, start it again.

## Auth link handling (important gotcha)

`@supabase/ssr`'s browser client hardcodes `flowType: "pkce"`. That means:
- Self-serve `signUp()` / `signInWithOtp()` confirmation links use `?code=`
  and are exchanged server-side in `src/app/auth/callback/route.ts` via
  `exchangeCodeForSession` — this works out of the box.
- Admin-generated links (`supabase.auth.admin.inviteUserByEmail`,
  `generateLink`, password recovery) redirect with tokens in a URL **fragment**
  (`#access_token=...&refresh_token=...`), which never reaches the server and
  is NOT auto-parsed by the pkce-flow browser client. These must redirect to
  `src/app/auth/confirm-hash/page.tsx`, a client component that manually reads
  `window.location.hash` and calls `supabase.auth.setSession(...)` before
  handing off to a server-rendered page. Point any future invite/recovery
  `redirectTo` at `/auth/confirm-hash?next=<destination>`, not `/auth/callback`.
- **The password step.** An account created by an email invite (platform or
  tasting) is signed in straight from the link and never chooses a
  password — Supabase stamps `user.invited_at` on it, so on sign-out or
  another device it's stuck. `src/lib/auth/password-gate.ts`'s pure
  `needsPassword(user)` (`invited_at` set AND `user_metadata.password_set`
  is not `=== true`, `src/lib/auth/paths.ts`'s `PASSWORD_SET_FLAG`) is
  applied in `src/lib/supabase/middleware.ts`'s `updateSession`, right after
  its existing `supabase.auth.getUser()` call, to every GET/HEAD page
  request outside an allowlist (`/auth/*`, `/login*`, `/signup*`, `/api/*`,
  any path whose last segment has a file extension, and any non-GET/HEAD
  request — server actions POST). A gated request redirects to
  `setPasswordHref(pathname + search)` (`/auth/set-password?next=<back-to>`),
  copying every cookie the Supabase client set on the response onto the
  redirect (required per Supabase SSR guidance, or the refreshed session is
  dropped). `src/app/auth/set-password/actions.ts` is the only place
  `PASSWORD_SET_FLAG` (`password_set`) is written — set `true` in the same
  `updateUser({ password, data })` call that sets the password, so the gate
  never fires again for that account.
- **Forgot password.** `/login/forgot` → `requestPasswordReset`
  (`src/app/login/actions.ts`) calls
  `supabase.auth.resetPasswordForEmail`, and always answers the same way
  whether or not the address has an account — it never reveals which.
  `docs/email/supabase-reset-password-template.md` (derived from
  `src/lib/email/password-reset.ts`) must be pasted into the Supabase
  dashboard's Authentication → Emails → Reset Password template, the same
  way `docs/email/supabase-invite-template.md` must be pasted into "Invite
  user".
- **`/auth/confirm` (token-hash route).** A password-reset link, like other
  admin-generated links, may be opened on a different device/browser than
  the one that requested it — the PKCE `?code=` flow (`/auth/callback`)
  only resolves in the same browser that started it, and `/auth/confirm-hash`
  needs a URL **fragment**, which an email link never carries either.
  `src/app/auth/confirm/route.ts` instead reads `token_hash`/`type`/`next`
  from the query string and calls `supabase.auth.verifyOtp({ type,
  token_hash })` server-side, which needs no matching browser state and so
  works from any device. The reset template's button points here
  (`type=recovery`, `next` = `RESET_NEXT` =
  `/auth/set-password?reason=reset`).
- **`safeNext` alone is not enough for a bare-path redirect.** A URL parser
  strips tab/CR/LF anywhere and reads `\` as `/`, so `"/\t/evil.example"`
  passes `safeNext`'s prefix checks yet resolves to `//evil.example` —
  another host — and Next resolves a server action's `redirect(next)` with
  `new URL(location, base)` in the browser. Sign-in, the login page's `next`
  relay, the set-password page and `/auth/confirm` therefore take `next`
  through `src/lib/auth/login-copy.ts`'s `sameSiteNext` (safeNext plus
  `/[\x00-\x1f\x7f\\]/`); sign-in's target is `signInNext`. The same check
  still belongs in `src/lib/safe-next.ts` itself, for `/auth/confirm-hash`'s
  `router.replace` and the signup/callback path.

## RLS recursion (important gotcha)

`tastings` and `tasting_participants` policies used to subquery each other
directly (host check → tasting_participants, participant check → tastings),
which Postgres detects as infinite recursion ("infinite recursion detected in
policy for relation..."). Fixed via two `SECURITY DEFINER` helper functions —
`is_tasting_host(tasting_id)` and `is_tasting_participant(tasting_id)` — which
bypass RLS internally. Any new policy that needs to check "is this user the
host/participant of tasting X" should call these functions, not write a raw
`exists (select ... from tastings/tasting_participants ...)` subquery, or the
recursion comes back. This bit again one hop further out: the (never-updated)
`wines read` policy still raw-subqueries `tasting_participants`, so a new
`tastings`/`tasting_participants` policy that raw-subqueried `wines` recreated
the exact same cycle. Fixed the same way — a `tasting_has_revealed_wine(tasting_id)`
SECURITY DEFINER helper. Moral: any new cross-table RLS check involving
tastings/tasting_participants/wines should go through a helper function, never
a raw subquery, regardless of which two tables look involved at a glance.

## Base UI component gotchas (shadcn/ui here uses @base-ui/react, not Radix)

- `Button` composed with a non-button element via its own `render` prop (e.g.
  `<Button render={<Link .../>}>`) needs `nativeButton={false}` on that same
  `Button` — otherwise it logs "expected a native `<button>`". But when
  `Button` is passed as *another* component's `render` target (e.g.
  `<PopoverTrigger render={<Button .../>}>`) and isn't itself composed with
  anything, leave `nativeButton` alone — `Button` still renders a real
  `<button>` there, and forcing `nativeButton={false}` causes the opposite
  error ("expected a non-`<button>`"). There's no `asChild` prop like Radix;
  it's always the `render` prop, and `nativeButton` describes what the
  *innermost* rendered element actually is.
- `Select` does NOT infer option labels from `<SelectItem>` children text —
  it only shows a label if you pass an `items` prop (a `{value: label}` map)
  to `Select` (`Select.Root`), otherwise the trigger displays the raw value
  string once selected.

## Domain rules

- A tasting has `timing_mode` (`LIVE` | `ASYNC`) and `wine_source`
  (`HOST_PROVIDES` | `PARTICIPANT_CONTRIBUTED`), both chosen by the host at
  creation.
- Every guessable field (country, region, appellation, primary/secondary
  grape, producer, type designation) is a dropdown backed by a reference
  table, never free text — matching is a plain FK id comparison. The host can
  add a new reference entry inline when entering a wine's answer key;
  participants guessing can only pick existing entries.
- Both the answer-key forms (`add-wine/by-hand-form.tsx` and the legacy
  `wine/wine-identity-fields.tsx`) and the guess ladder (`play/guess-ladder.tsx`
  with `play/field-picker.tsx`) cascade country→region→appellation: the region list
  is filtered to the chosen country and the appellation search is scoped to
  the chosen region. Scoring is still independent per category (`reveal_wine`
  compares each FK separately) — the cascade only constrains the input.
  (This was originally NOT cascaded in the guess form on the theory you might
  want the right appellation with a wrong region, but showing all 378 regions
  regardless of country read as a broken filter, so per the user it now
  cascades like the answer-key form. Changing country clears a now-mismatched
  region/appellation; changing region clears the appellation.)
- `type_designations` stays a single flat table but carries `category`
  (Prädikat, Quality Classification, Aging Classification, Sparkling Dosage,
  Fortified Style, Sweetness), optional `country_id`/`region_id`, `sort_order`,
  and `is_active` (migration `20260717090000_type_designations_categories.sql`,
  seeded with the official competition set). Both the answer-key and guess
  forms use `src/components/type-designation-field.tsx` — a searchable dropdown
  grouped by category in a fixed order. (It used to float the chosen
  country's designations into a "For {country}" priority group at the top —
  removed per user feedback in favor of the plain, predictable category
  list; the `country_id` column stays, it just doesn't drive UI anymore.)
  The list (~50 rows) is small enough to preload in full; fetch it with
  `.eq("is_active", true).order("sort_order")` so groups/items keep their
  intended order. Host-created designations land with `category` null (an
  "Other" group). Scoring is unchanged — still a plain `type_designation_id`
  FK comparison.
- Vintage is its own type: `vintage_kind` (`YEAR` | `NV` | `TAWNY`) plus
  `vintage_year` or `vintage_tawny_years`. Scoring: exact match → 2 pts;
  `YEAR` off by exactly 1 → 1 pt; anything else → 0.
- Scoring points: country 2, region 3, appellation 5 (only if the wine has
  one), primary grape 8, secondary grape 2 (only if the wine has one),
  producer 6, type designation 2 (only if the wine has one), vintage 2/1/0
  as above.
- Appellation is NOT optional on a catalog wine any more:
  `catalog_wines.region_id` and `catalog_wines.appellation_id` are NOT NULL
  (`wine_answers.appellation_id` stays nullable — for legacy rows written
  before add-wine v2, and for the current byhand-7 "I can't identify this
  bottle" flight-glass path: `prepareUnidentifiedWine`
  (`src/lib/wine-identity/server/write.ts`) resolves against
  `UNIDENTIFIED_WINE_FIELDS` (`src/lib/wine-identity/complete.ts`), which does
  NOT require appellation, so `ResolvedUnidentifiedWine.appellationId` can be
  `null` and `answerIdentity()` writes that straight into `wine_answers`.
  Every wine written through `prepareCompleteWine` (`COMPLETE_WINE_FIELDS`)
  names one). Every region has a
  self-named appellation (migration
  `20260713180000_optional_regional_appellation.sql`, seeded so "just the
  region" is always pickable — plenty of real wines carry nothing more
  specific, a plain "Bourgogne rouge", generic "Rioja", "California", a
  Mendoza varietal — the original LWIN-import fallback only added one for
  regions with *zero* appellation candidates, missing 181 of 378 regions
  including Bordeaux, Rhône, Alsace, Rioja, California, Mendoza), and the
  by-hand form's appellation field offers it as an explicit "Just the region"
  choice (`self-named-appellation.ts`) rather than leaving the field blank. A
  wine with no formal appellation ("Vin de France", "Vino d'Italia",
  "Deutscher Wein", a plain table wine) uses the country's national-tier
  region + appellation where one exists (France: "Vin de France",
  `20260829212000_vin_de_france_appellation.sql`) or otherwise the
  per-country sentinel "None" region + appellation
  (`20260829263700_none_region_appellation.sql`) — every wine still names a
  region and an appellation row, so the value is explicit and no join needs a
  null check.
- Appellation names include their real geographic designation as a suffix
  where one applies — "Barolo DOCG", "Napa Valley AVA", "Toscana IGT",
  "Rioja DOCa", "Bordeaux AOP" — via `scripts/add-appellation-designations.mjs`.
  LWIN's `DESIGNATION` column (not previously imported) is per-wine-row, not
  per-appellation, so the script takes the mode value per (country, region,
  sub_region/site) group — almost always unanimous or near-unanimous. It
  deliberately uses an ALLOWLIST rather than every DESIGNATION value LWIN
  has: German quality tiers (Qualitätswein, Prädikatswein, Landwein) and
  below-appellation/table-wine markers (VdF "Vin de France", VdT/VT) are not
  geographic designations — appending them to a place name would be wrong,
  not just unhelpful — and a handful of obscure low-count codes with no
  confident identification (AOG, AOR, VC, DOK, DOT, IPR) are excluded too;
  under-labeling beats mislabeling. Applied 3282 of 3282 planned updates
  cleanly (0 unmatched, 5 skipped for colliding with an existing row).
- Reveal + scoring for a wine happens via the Postgres RPC `reveal_wine(wine_id)`
  (security definer, host-only) — this is the single source of truth for
  scoring, not duplicated in the client.
- **Lifecycle stamps** (blind-tasting v3 M3,
  `20260914092500_tasting_lifecycle_stamps.sql`): `tastings.started_at`,
  `tastings.finished_at` and `wines.revealed_at` are each owned by a BEFORE
  INSERT OR UPDATE trigger (`tastings_stamp_lifecycle`,
  `wines_stamp_revealed_at`) that replaces any client-sent value — no
  signed-in caller, host or participant, can back- or forward-date a start,
  a finish, or a reveal. `revealed_at` is set only while `is_revealed` is
  true, so it reveals no wine identity on its own (rule 1). No backfill:
  existing tastings/glasses keep null stamps, so a legacy row gets no
  "joined after this glass" comparison (B4) and its record header has no
  date to show: the eyebrow reads `finished_at ?? started_at`
  (`record/record-view.tsx`), so with both stamps null `LocalDateTime`
  renders its "Scheduled" placeholder — it never falls back to
  `scheduled_at` or `created_at` (B10).
- **`in_play_steps(uuid)` is no longer callable by clients** (M1,
  `20260914090500_in_play_steps_execute_lockdown.sql`): EXECUTE is revoked
  from `PUBLIC`, `anon` and `authenticated` (previously anyone with the anon
  key could call it directly on a hidden glass and read its in-play category
  count — whether the answer key has an appellation/type designation — 5, 6
  or 7 entries). Only the owner (`postgres`) and `service_role` keep
  EXECUTE; every legitimate caller (`get_wine_reveal`,
  `reveal_next_category`, `reveal_own_next_category`, and the
  `wines_full_reveal_step` trigger) already runs as a SECURITY DEFINER
  function or the trigger owner, so nothing deployed breaks — but a client's
  direct `update wines set is_revealed = true` through PostgREST now fails
  inside that trigger with "permission denied for function in_play_steps"
  (moot since M11 also removed the client's `wines` UPDATE grant outright,
  above). Same migration: `get_wine_reveal`'s `in_play_count` is `null`
  while a glass is at `reveal_step = 0` and not revealed, instead of the
  real count — so the same response shape reaches every guest before the
  first category is revealed.
- A tasting also has `reveal_mode` (`BLIND` | `SEMI_BLIND`), independent of
  `wine_source` — either host or participants can still provide the wines.
  **Reversed** (spec §1.4 rows 6-8; ledger B9, owner default Q7): the old
  "every wine's answer key is visible up front through `wine_answers` RLS"
  design is gone. The candidate list now comes only from
  `get_semi_blind_candidates`, keyed by `semi_blind_candidate_keys` — one
  random 16-hex key per glass, unique within its tasting, never derived from
  position, id or time — readable by JOINED participants and the host. The
  list is a snapshot from Start (Q7): while `DRAFT` a caller sees only the
  cards of glasses they themselves added; from Start every caller gets every
  card, but only once no glass in the tasting is still missing its answer key
  (a late-keyed glass — `can_edit_flight_glass` allows keying a glass after
  Start until its first reveal step — would otherwise add a single new card
  mid-tasting, tying that card to that glass); until then, still only the
  caller's own cards. A started semi-blind flight is otherwise fixed:
  `wines_semi_blind_flight_locked` refuses inserting a glass into a
  non-`DRAFT` semi-blind tasting, and M6's remove/reorder refusals already
  cover removal and reordering.
  Guessing is "which candidate key is this glass" (`get_semi_blind_board`,
  `assign_semi_blind_match`/`clear_semi_blind_match` — `match-board.tsx`,
  which replaced `match-ladder.tsx`), not filling in each category, and it is
  a true permutation, not the old "not enforced to be 1-to-1": one open
  (unscored) glass may hold a given candidate per participant at a time
  (`guesses_one_open_glass_per_candidate`), so assigning an already-held
  candidate to a different glass swaps it off the old one
  (`assign_semi_blind_match`'s own retryable-swap logic). Revealing a glass
  releases its wine from every other unscored guess that still held it
  (`semi_blind_release_revealed_wine`, an `AFTER UPDATE OF is_revealed`
  trigger, same transaction as `reveal_wine`'s scoring). `reveal_wine` still
  resolves the saved `guessed_wine_id` to that wine's own answer key and
  scores it through the exact same per-category logic as a normal blind
  guess — semi-blind adds an input path, not a second scoring engine — but
  `guessed_wine_id` itself is no longer client-writable or client-readable:
  only `assign_semi_blind_match`/`clear_semi_blind_match` (SECURITY DEFINER)
  write it, and `guesses` SELECT for `authenticated` narrows to the other 27
  columns. M9 shipped as two migrations on purpose: M9a
  (`20260914102500_semi_blind_rpcs.sql`, the keys and the seven RPCs; no
  deployed behaviour change, nothing in `src/` called them yet) landed first,
  then M9b (`20260914103500_semi_blind_lockdown.sql`, the permutation
  invariant, the pool release, the flight lock, the `guesses` column
  lockdown and the narrowed `wine_answers read`) only once the app deploy
  that actually uses the RPC-based UI was live — a single combined migration
  would have broken the still-deployed direct-upsert matching UI mid-flight.
- Every profile has a public page (`/u/[id]`) and there's an open directory
  (`/people`) — any authenticated user can browse or search every profile,
  by design (confirmed with the user; not search-only), and the directory
  includes yourself (with a "You" badge), not just other people. Avatars live
  in the public `avatars` Storage bucket, one file per user at
  `avatars/<user_id>/...` (RLS on `storage.objects` restricts writes to your
  own folder); uploaded directly from the browser client in
  `profile/edit/avatar-uploader.tsx`, not through a server action.
- **Community redesign** (2026-09-19, `docs/superpowers/specs/2026-09-19-community-redesign.md`)
  aligned `/community` (renamed from "People & Friends") to the same
  toolbar/table/card pattern as Catalog and Cellar —
  `src/app/community/community-list.tsx` plus the pure
  `src/lib/community/community-math.ts`. The URL contract: `?tab=friends`
  (still the only way to open Friends; `/friends` and `/people` still
  redirect in), `?q`, `?sort` (`active`/`name`/`joined`, each view has its
  own default when absent) and `?page`. A row action's steady state (the
  friend chip's "Friends") stays visible at rest; only an action ("Add
  friend", "Cellar") fades in on hover/focus, and only on a fine pointer, so
  a touch device never has to hover an invisible button. Removing a friend
  from a row is a two-tap confirm ("Friends" → "Tap again to remove" →
  removed, `console-copy.ts`'s `twoTapState`/`TWO_TAP_WINDOW_MS`) —
  `/u/[id]`'s own remove button stays one-tap. There is still no mutual-
  friends count: `friendships` has exactly one SELECT policy (`user_id =
  auth.uid()`), so a read of someone else's friendships always comes back
  empty — a real count needs a SECURITY DEFINER RPC, out of scope here.
- A profile page also shows that person's cross-tasting stats (wines
  guessed, avg points, per-category accuracy) and a list of tastings they've
  attended, each linking to `/u/[id]/tastings/[tastingId]` — a per-tasting
  breakdown of their guess vs. the true answer for every revealed wine.
  Computed in `src/lib/profile-stats.ts`. This is visible to ANY signed-in
  viewer, not just co-participants — consistent with the open-directory
  philosophy above, and made possible by the RLS policies in
  `20260713170000_public_revealed_tasting_history.sql`
  (tastings/tasting_participants/wines go public once a tasting has at
  least one revealed wine; wine_answers/guesses were already public on
  reveal from day one). A wine still hidden in an otherwise-revealed tasting
  stays hidden — the visibility gate is per-wine, not per-tasting.
- `scripts/seed-demo-people.mjs` creates ~5 persistent fake profiles (emails
  on the `.invalid` TLD) and two fully-revealed demo tastings so the People
  directory and profile stats have real content without needing real
  participants. Idempotent — re-running skips people/tastings that already
  exist by name+host. Not meant to be deleted; this is seed data, not
  scratch/test output. Every reference is resolved by EXACT name inside its
  parent — country; region within that country; appellation within that
  region; producer by exact name, required to be linked to that region — so
  the seed never guesses across `find_producer_by_folded_name`'s fuzzier
  lookup. Each seed wine must be complete by
  `src/lib/wine-identity/complete.ts`'s rule, then is written through the
  same catalog-wine RPC the app's write path uses
  (`find_or_create_catalog_wine`, called AS THE HOST) and every glass's
  `wine_answers` is copied from that linked catalog wine with
  `catalog_wine_id` set — an answer key is never hand-typed data disconnected
  from the catalog. Tastings are inserted `IN_PROGRESS` (`reveal_wine`
  refuses CLOSED tastings), locked guesses are written through the service
  role, every glass is revealed by the HOST through `reveal_wine` while
  signed in with a magic link + `verifyOtp` (never a password), then the
  tasting is closed. If anything fails once a tasting row exists, only that
  tasting (created in this run) is deleted before rethrowing, so a rerun
  never skips a half-made one.
- Friends (`friendships` table) are one-way, no accept/request flow — adding
  a friend is unilateral, like saving a contact (confirmed with the user).
  A user only ever sees/manages rows where they are `user_id`; there's no
  notion of the other side consenting or even being notified.
- **A `"use server"` file exports only async functions — not even a type re-export.**
  `export type { SendResult }` in `src/app/invite/actions.ts` compiled (tsc, eslint
  and `next build` all passed) but Next's server-actions loader re-exports every
  export of such a module as an action, so the page failed at request time with
  `SendResult is not defined`. Shared types live in a plain module
  (`src/lib/invites/types.ts`), imported with `import type` on both sides.
  (2026-09-18, platform invites.)
- **Platform invites** (`/invite/<code>`, distinct from a tasting's own
  `/j/[code]`) are a personal link any signed-in user can make from
  `/community` or their own `/u/[id]` (`InvitePeopleButton` →
  `InvitePeopleDialog`, `src/components/invite/`) that brings the invitee in
  as the inviter's friend, both ways, on first sign-in. The code is the same
  alphabet/length as `generate_join_code()` (10 characters of
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), minted by the `platform_invites.code`
  column default so no client ever chooses one. `invitee_email` never
  leaves `src/app/invite/actions.ts` — no RPC returns it, no component prop,
  page, email body or log line carries it, and it is never read back after
  insert (`sendPlatformInvite` mails the address typed at send time, not the
  stored one). `invitee_name` is what feeds the email's salutation and, when
  set, the invited account's `display_name`. Two RPCs do the
  work: `get_platform_invite_preview(code)` (SECURITY DEFINER, EXECUTE for
  `anon` and `authenticated` — inviter display name, avatar and a validity
  state only) and `accept_platform_invite(code)` (SECURITY DEFINER, EXECUTE
  for `authenticated` only, revoked from `anon`, `PUBLIC` and
  `service_role` — writes the two `friendships` rows idempotently and counts
  a use). A friendship is never written on a bare page load: opening
  `/invite/<code>` only ever previews it; either the landing's own
  "Add {inviter} as a friend" tap (a signed-in visitor) or the first-sign-in
  route `/invite/<code>/accept` (a route handler, since it must read/delete
  a cookie and redirect) calls `accept_platform_invite`, and the accept
  route only does so when the httpOnly `blindr-invite-intent` cookie
  (`src/lib/invites/links.ts`'s `INVITE_INTENT_COOKIE`, set by `beginJoin`
  only after the preview came back `ok`) matches the code — a crafted accept
  link opened by someone who never tapped "Join Blindr"/"Sign in" on the
  landing page writes nothing. Admin-generated invite mail lands on
  `/auth/confirm-hash?next=/invite/<code>/accept`, never `/auth/callback`
  (same fragment-token reason as "Auth link handling" above); self-serve
  signup still goes through `/auth/callback`. One email template,
  `src/lib/email/platform-invite.ts`, backs three surfaces: the real send
  (`sendPlatformInviteEmail` in `src/lib/email/sender.ts`, the one other
  file besides `admin.ts` that imports `createAdminClient` for this
  feature, gated by `PLATFORM_EMAIL_PROVIDER` — `"supabase"` today,
  `"resend"` only a shaped stub), the `mailto:` "Open in my mail app"
  fallback, and the Supabase dashboard's "Invite user" template (which also
  serves tasting invites' generic `else` branch) — `docs/email/supabase-invite-template.md`
  carries the exact text to paste and a vitest test
  (`src/lib/email/supabase-template-doc.test.ts`) fails if that doc and the
  module ever disagree. The Supabase branch cannot email an address that
  already has an account (Auth has no plain-mail API); `sendPlatformInvite`
  checks `profiles.email` first and returns an `existing-account` result
  instead of calling it. Any provider error is shown to the inviter
  verbatim, never a generic wrapper line.
- **Account deletion** (2026-09-19, `20260919101300_account_deletion.sql`, spec
  `docs/superpowers/specs/2026-09-19-account-deletion-design.md`). One path for
  every deletion: AFTER DELETE (and soft-delete UPDATE OF `deleted_at`) triggers
  on `auth.users` call `scrub_deleted_account(uuid)` (SECURITY DEFINER, no client
  EXECUTE). The self-service button on `/profile/edit` (type DELETE, re-checked
  on the server) just deletes the auth user through the server-only admin
  client, removes the avatar files, signs out and lands on `/login?deleted=1`;
  a Supabase dashboard delete runs the same scrub. The profile row is KEPT and
  scrubbed (display name "Deleted user", undeliverable email, personal columns
  null, write-once `deleted_at`); there is deliberately no FK from profiles to
  `auth.users` (the own-auth branch `auth-phase-1` needs profiles without a
  login, live migration 20260829265003 dropped it). Deleted: notes, cellar lots
  and consumptions, friendships both ways, platform invites, drafts, pour
  intents, label reads, and places of tastings they hosted. Kept for others:
  tastings they hosted or joined, guesses, answer keys, catalog wines they
  created. A never-started DRAFT they host alone is deleted; any other
  unfinished hosted tasting is CLOSED with nothing revealed; in someone else's
  never-started tasting their seat and BYO glasses go, in a started one a
  JOINED seat stays. `get_semi_blind_candidates` decides "started" as
  `status <> 'DRAFT' and (started_at is not null or finished_at is null)`: a
  tasting CLOSED without ever starting keeps DRAFT visibility. Never go back
  to a bare `status <> 'DRAFT'` or `status = 'CLOSED'` test for "started" —
  that hands every candidate card of never-revealed glasses to the JOINED
  guests. Client UPDATE on `profiles` is a column grant on nine columns
  (display_name, bio, avatar_url, location, phone, favorite_wine_type,
  cellar_visibility, preferred_currency, last_seen_at); before it, any member
  could set their own `role` to ADMIN. Roles change only through
  `admin_set_user_role`. A link guard refuses new friendships or seats
  pointing at a deleted profile. Every people listing filters
  `.is("deleted_at", null)`. Never pass `shouldSoftDelete` to
  `admin.deleteUser`: the hard delete is what frees the email for a new
  signup. A dashboard delete leaves the avatar file behind (spec §7 R5).
- The tasting-invite UI (`tastings/new/invite-field.tsx`) is NOT a
  comma/newline-separated textarea — participants are added one at a time
  (typed email + "Add", or picked from a friends combobox), rendered as
  removable chips. Both paths funnel into the same hidden newline-joined
  `emails` field the `createTasting` server action already parses, so that
  action needed no changes when this UI was redesigned. The friends-picker
  half of that UI must render even when the friends list is empty (with a
  "browse People to add some" message) — hiding it entirely when
  `friends.length === 0` (the original implementation) makes the feature
  invisible to any new account, which looked like a missing feature rather
  than an empty state.
- Tastings and wines can each carry an optional image, uploaded directly
  from the browser via `src/components/image-uploader.tsx` (same
  direct-to-Storage pattern as `profile/edit/avatar-uploader.tsx`) to two
  public Storage buckets, `tasting-images` and `wine-images`. Neither bucket
  can be keyed by the row's own id, because the upload happens *before* that
  row exists (the create-tasting and add-wine forms are single-step) — so
  `tasting-images` is scoped by the host's `user_id` folder instead (known
  at upload time even though the tasting isn't), and `wine-images` is scoped
  by `tasting_id` folder (the wine doesn't exist yet, but its tasting
  does). `wine_answers.image_url` needs no RLS changes — it's just another
  column on a row already gated by the existing "visible once revealed"
  policy, so the photo is automatically hidden until reveal along with the
  rest of the answer key.
- **wine-images write lockdown** (`20260919162300`, applied 2026-09-19 with
  the owner's go-ahead): no client role holds UPDATE or DELETE on any
  `wine-images` object any more ("wine image write update"/"delete" dropped;
  insert and public read unchanged). Nothing in the app overwrites, moves or
  removes a wine photo; maintenance goes through the service key.
- **wine-images is not listable** (`20260919203000`, applied 2026-09-19 with
  the owner's go-ahead). The old SELECT policy "wine image public read"
  (PUBLIC, anon included) let anyone list the bucket, including every
  host's label scans under `catalog/staging/<uploader id>/scan-*.jpg`, which
  is tonight's flight before the reveal (rule 1). It is replaced by "wine
  image own read": `authenticated` only, and only rows where
  `coalesce(owner_id, owner::text) = auth.uid()::text`; anon gets nothing.
  Public URLs (`/storage/v1/object/public/wine-images/...`, `getPublicUrl()`)
  keep working because the bucket is public and storage-api looks the object
  up as the super user, not through SELECT RLS. That covers the catalog
  `image_url`, the scan-photos strip and the label reader, so the bucket must
  stay public. Uploads need only the insert policy. A client's `list()`,
  `info()`, `exists()` or `download()` of someone else's wine-images object
  now sees nothing. Never re-add a PUBLIC/anon SELECT policy on wine-images,
  and never add a SECURITY DEFINER function owned by a bypassrls role that
  reads or lists storage.objects (by `storage.objects`, `"storage"."objects"`,
  `storage.search`/`search_v2`/`list_objects_with_delimiter`, bare `objects`
  under a search_path naming storage, or a SQL-standard body): it would list
  every row whatever the policy says. The one that exists,
  `attach_catalog_wine_photo`, only looks up the single object its caller
  uploaded. avatars and tasting-images stay listable by design (no answer
  keys; upload names carry ~52 random bits).
- **Scan photos** (`catalog_wine_photos`, migration `20260919183100`; spec
  `docs/superpowers/specs/2026-09-19-scan-photos.md`). A label scan whose add
  lands in the catalog, a cellar or a note (never a flight —
  `scanPhotoTarget` in `src/components/add-wine/scan-photo.ts` is an
  allow-list keyed on where the add landed) and every wine-page upload become
  rows of the wine's "More photos" strip (`photo-strip.tsx`);
  `catalog_wines.image_url` stays the one main photo and the strip leaves it
  out. Rows are written only by the SECURITY DEFINER
  `attach_catalog_wine_photo(wine, path, via)` (own staging scan with `via`
  catalog/cellar/note, or own upload in `catalog/<wineId>/`, stored as
  `via = 'upload'`; object must exist, ≤ 5 MB, wine not `blind_pending`/merged,
  never a photo of the caller's own glass, 12 per person per wine,
  idempotent). Rule 1: the RPC refuses only the ADDER of a still-unrevealed
  glass of that wine, and reads never depend on glasses — hiding photos while
  a wine is poured, or refusing everyone, was rejected as an oracle (spec
  §3.1). The wine page makes an upload the main photo only when the attach
  came back `attached`/`already-attached`/`limit` (`mayBecomeMainPhoto`,
  `src/lib/catalog-photos/strip.ts`) — the statuses returned after that
  unrevealed-glass check; the database refuses it too
  (`catalog_wines_rule1_guard`, 20260919213300). A `via = 'cellar'` photo is read only by its photographer and
  whoever `can_view_cellar(added_by)` admits (the `cellar_lots` gate): a
  public cellar photo let a guest name tonight's wine when the host scanned
  it into a PRIVATE cellar and poured it from there (D11), since the lot keeps
  the wine off `blind_pending`. Residual: a catalog or note scan of an
  existing wine is a new public trace (spec §12 R6). The migration requires
  the wine-images write lockdown `20260919162300` first (it refuses
  otherwise). The photographer can unlink their own photo; the storage object
  is never deleted. Account deletion drops the rows via
  `profiles_drop_catalog_wine_photos`. All new uploads go through
  `src/lib/images/` (1,568 px, JPEG 0.82, EXIF-aware); Sonnet 5 itself accepts
  2,576 px, so 1,568 is a storage choice, not the reader's limit. Live-camera
  scans stay at the browser's default capture size (owner, 2026-09-19: no
  extra per-scan cost for sharper strip photos).
- **Rule 1 on catalog counts and a poured wine's record** (migration
  `20260919213300_rule1_usage_and_main_photo.sql`, applied 2026-09-19 with the
  owner's go-ahead; spec `docs/superpowers/specs/2026-09-19-rule1-usage-and-main-photo.md`).
  `catalog_wine_usage` and `catalog_wine_holdings` (EXECUTE `authenticated` +
  `service_role` only; PUBLIC and `anon` revoked) return numbers no unrevealed
  glass moves: `appearance_count` counts revealed glasses only, and a bottle
  drawn from a cellar lot into a glass that is not revealed yet (D11's Start
  draw-down or a running pour, found through
  `wine_pour_intents.cellar_consumption_id` by the internal
  `catalog_wine_masked_pours`) still counts as in its cellar, and not drunk,
  until that reveal. Before this, the counts ticking up at Start named the
  wine, even from a PRIVATE cellar. Any new shared count over `wine_answers`,
  `cellar_lots` or `cellar_consumptions` must follow the same rule. The adder
  of a still-unrevealed glass (host for `added_by_host`, contributor for BYO —
  `attach_catalog_wine_photo`'s step 7, as
  `catalog_wine_in_callers_unrevealed_glass`) cannot change that wine's public
  record: `catalog_wines_rule1_guard` (BEFORE UPDATE) and
  `catalog_wine_grapes_rule1_guard` refuse a signed-in client's own write
  (trigger depth 1) on a wine not `blind_pending` before and after, with 42501
  "This wine is in one of your flights that hasn't been revealed yet. Change
  it after the reveal." (`src/lib/catalog/rule1-guard.ts`) — a main photo, a
  description, a blend, even a no-op save (which still stamps `updated_at`
  and an edit-audit row naming the editor). Nobody else is ever refused for
  linkage. Writes by other triggers (the `blind_pending` mark/unmark, the
  blend seed and recompute) and by `service_role` are not judged, so a new
  trigger that writes `catalog_wines` for a client must apply rule 1 itself.
  Accepted by the owner: the adder cannot edit that wine until the reveal, and
  a glass left unrevealed in a CLOSED tasting keeps the wine locked for them.
  The add-wine write path never fills a public wine from a flight: flight
  adds, finishes, Edits and Swaps call `upsertCatalogWine(..., { fill: false })`,
  then `fillFlightCatalogWine` after the answer key is written, filling
  description, alcohol and blend only while the wine is `blind_pending` (or
  the glass is itself revealed, on an OPEN board), and never `image_url` — a
  flight scan stays on the glass's `wine_answers.image_url`
  (`catalogFillPlan`, `src/lib/wine-identity/fill-rule.ts`). A hidden row is
  readable by its creator, every curator and whoever can read an answer key
  naming it, so a curator-adder can still edit a hidden wine someone else
  created (spec R10). F4-F8, F10 and F11 are closed by "Rule 1: born-hidden
  flight wines and holds" below; F9 (new reference rows) is an accepted owner
  decision.
- **Rule 1: born-hidden flight wines and holds** (migrations
  `20260919223100_rule1_born_hidden_and_shared_cellar.sql` and
  `20260919223200_rule1_older_leaks.sql`, applied live 2026-09-19/20 with the
  owner's go-ahead; spec
  `docs/superpowers/specs/2026-09-19-rule1-older-leaks.md`; order: 223100,
  then the app, then 223200). A catalog wine is hidden (`blind_pending`) only
  when it is born for a flight: the flight path (add, finish, Edit, Swap;
  never an OPEN board) sends `"hidden": true` to
  `find_or_create_catalog_wine` (`catalogWinePayload`/`flightWineBornHidden`,
  `src/lib/wine-identity/catalog-payload.ts`), which creates it hidden and
  returns an existing row unchanged. `catalog_wine_mark_blind` is gone:
  pouring, a Swap onto an existing wine, a merge or
  `resolve_unidentified_wine` never hides a public wine. `flight_holds`
  (internal, no client access) holds a hidden wine an unrevealed glass links,
  and a cellar bottle poured into one, to that glass. A held wine stays hidden
  after an Edit, Swap or Remove (`catalog_wine_unhide_if_free` is the only
  un-hide besides a reveal), and a held pour stays masked in
  `catalog_wine_masked_pours` (so in usage, holdings and shared cellars). Only
  a reveal releases a hold: that glass's, or, for a wine, the reveal of any
  glass that links it. A close or a delete releases nothing
  (`flight_holds.tasting_id`/`wine_id` are `on delete set null`; review round
  1: releasing at a close or a delete published a wine no glass ever revealed,
  which stayed public when the host poured it again). So a brand-new wine
  whose glass is removed, or whose tasting is deleted, before its reveal stays
  hidden (its creator and curators read it, and `searchAddWine` still lists it
  for its creator, `searchShowsCatalogWine`) until a glass that pours it is
  revealed; its pour stays masked for good (everyone but the owner counts that
  bottle as unopened; owner decision OD4). Never add a trigger on `tastings`
  that releases a hold. `catalog_wines`: `authenticated` INSERTs only the
  identity columns, `created_by` and `blind_pending`, and UPDATEs only the
  columns Manage wine, the fill, the price fill and the main photo write;
  `blind_pending`, `merged_into`, `created_by` and `id` are written only by
  the database, and `anon` writes nothing. `merge_catalog_wines` is
  `authenticated` + `service_role` only: it moves only revealed glasses'
  answer keys, an unrevealed glass's key moves to `catalog_wine_merge_target`
  at its own reveal (before notes resolve), a hidden wine is never a target
  (same words as a missing one), and the adder of an unrevealed glass of a
  public loser is refused by `catalog_wines_rule1_guard`. Someone else's
  cellar is read only through `shared_cellar_lots(owner)` (`getCellarBottles`'
  `readOnly` path): masked pours still in their lot, `updated_at` =
  `created_at`; "cellar own select" is the owner alone, so a new surface that
  shows another person's lots must use the function.
  `catalog_wines_unidentified` is read by its creator, by whoever can read an
  answer key naming it (`can_read_unidentified_wine`, SECURITY INVOKER over
  "wine_answers read"), and by the author of a note naming it; curators no
  longer read an unrevealed one, so `/catalog/unidentified` lists revealed
  glasses' rows. Still open: F8b (`wines.added_via = 'CELLAR'` readable by
  participants), F9 (new reference rows are public at once; guessing needs
  them), and F12 (`catalog_wine_identity_match`/`find_or_create_catalog_wine`
  confirm an exact guessed identity of someone's hidden wine).
- The leaderboard sidebar shows more than a bare score per participant: a
  "wine X/Y" progress readout (their own scored-guess count over the
  tasting's total wine count — this can differ between participants if one
  of them hasn't guessed an already-revealed wine, unlike a purely
  tasting-global "wines revealed" count) and "+N last round" (their points
  on the tasting's round wine). Since reveal-7
  (`20260912106000_leaderboard_round_wine.sql`) the round wine for a LIVE
  tasting is chosen ONCE for the whole table, not per participant — because
  picking it per participant broke for anyone with no row on the wine being
  revealed (a BYO contributor never guesses their own bottle), who kept
  showing a stale previous glass as "last round". **Reversed** (spec §1.4
  row 19; M7, `20260914100500_tasting_pacing.sql`, which recreates
  `get_tasting_leaderboard`'s `t`/`live_round` CTEs and nothing else in it):
  the pick is no longer "the lowest-`position` wine with `reveal_step > 0`"
  first — it now tries the pour pointer's glass (`tastings.current_wine_id`)
  while its step reveal is running, ahead of the two live picks; only when
  the pointer names no such glass does it fall back to the lowest mid-step
  wine, then the wine with the newest `scored_at` among countable guesses.
  ASYNC tastings still pick it per participant, since there participants
  advance independently.
- `appellations` and `producers` are populated from a real LWIN (Liv-ex Wine
  Identification Number) database via `scripts/import-lwin.mjs`, not just
  hand-seeded data — tens of thousands of rows. Because of that:
  - Country/region dropdowns still use `ReferenceCombobox` (small tables,
    preloaded in full). Appellation and producer fields use
    `SearchableCombobox` (`src/components/searchable-combobox.tsx`) instead —
    it searches server-side via `searchAppellations`/`searchProducers` in
    `src/lib/reference-search.ts`, debounced, backed by the `pg_trgm` GIN
    indexes in `supabase/migrations/20260713124415_add_reference_search_indexes.sql`.
    Never preload the full `appellations`/`producers` tables again (Supabase's
    default page size is 1000 rows — a plain `.select()` silently truncates).
  - Any page that needs to *display* a specific appellation/producer name
    (e.g. a revealed answer, a participant's saved guess) should look up only
    the ids it actually renders via `lookupAppellationAndProducerNames` in
    `src/lib/reference-lookup.ts`, not preload the whole table just to build
    an id→name map.
  - Producer/appellation dedup during import only normalizes hyphens and
    whitespace (`safeKey()` in the import scripts) — it deliberately does
    NOT strip accents or leading words like "Chateau"/"Domaine"/"Le"/"La",
    because those can be genuinely different producers or appellations (e.g.
    a real "Domaine Montrose" is not the same estate as "Château Montrose";
    "Classico" is a legitimately distinct appellation under seven different
    Italian regions — appellation dedup must always be scoped by `region_id`,
    never by name alone).
  - LWIN stores a producer's title ("Chateau"/"Domaine"/"Maison"/...)
    separately in `PRODUCER_TITLE` for some rows but bakes it into
    `PRODUCER_NAME` (with proper French accents) for others — `import-lwin.mjs`
    concatenates title+name up front now, but the original import missed this
    and had to be corrected after the fact by
    `scripts/fix-lwin-producer-titles.mjs` (rename-in-place by id, not
    delete+reinsert, so `wine_answers`/`guesses` FK references stay valid).
    That concatenation then surfaced a second-order problem: accent-only
    duplicate producer rows (e.g. "Château Palmer" vs "Chateau Palmer") that
    didn't collide before the title fix, since the title-less LWIN spelling
    is always plain ASCII while the baked-in-title LWIN spelling keeps
    accents. `scripts/dedupe-producer-orthographic-variants.mjs` cleans these
    up — accent/punctuation-only folding, same non-destructive-elsewhere
    rename-in-place-or-reassign-FKs approach, still never stripping
    meaningful prefix words.
- **Reversed** (spec §1.4 row 7; ledger B9): semi-blind matching is no longer
  a single combined batch. `play/match-board.tsx` (replaced
  `match-ladder.tsx`) calls `assignMatch`/`clearMatch` in `play/actions.ts`,
  which run the SECURITY DEFINER `assign_semi_blind_match`/
  `clear_semi_blind_match` RPCs, per assignment — each pick autosaves and can
  swap an already-held candidate off another glass (see `reveal_mode` above).
  Locking is per glass too, through the same `lockGuess`/`unlockGuess` every
  BLIND guess uses (`semiBlindLockGuard` in `play/actions.ts` gates a
  semi-blind lock on that glass already holding an assigned candidate); there
  is no batch "Lock in all glasses" step any more.
- Semi-blind scoring is NOT the VM/DM category breakdown — `reveal_wine`
  branches on `tastings.reveal_mode` (the enum type is `reveal_mode_type`,
  not `reveal_mode` — that name collides with the column) and for
  `SEMI_BLIND` sets every category points column to `null` (not applicable)
  and `total_points` to a plain 1 (matched) / 0 (didn't), rather than summing
  category points. `src/lib/profile-stats.ts`'s `tallyGuess` treats a `null`
  category column as "not applicable, skip" for all eight categories
  uniformly (not just the three that were already nullable for BLIND mode
  wines without a secondary grape/type designation/appellation) — this is
  what keeps semi-blind guesses from being miscounted as "wrong" for
  country/region/primary_grape/producer in per-category accuracy stats.
  Every surface that renders a per-category point breakdown (`play/page.tsx`,
  `results/page.tsx`, `u/[id]/tastings/[tastingId]/page.tsx`,
  `leaderboard-sidebar.tsx`, `tasting-leaderboard.ts`) has a semi-blind
  branch showing a plain ✓/✗ (or "X/Y correct") instead — copy that branch
  to any new page that renders scoring, don't reuse the category table for
  semi-blind wines.
- A BLIND tasting shows a "Danish Championship rules" badge in the lobby
  (`tastings/[id]/page.tsx`) next to the reveal-mode badge, since the VM/DM
  point values aren't self-explanatory without that context. SEMI_BLIND
  tastings show "Semi-blind" instead — the two badges are mutually
  exclusive, not additive.
- Every combobox (`ReferenceCombobox`, `SearchableCombobox`,
  `TypeDesignationField`) focuses its search input synchronously inside the
  same `onOpenChange(true)` call that opens the popover —
  `if (next) inputRef.current?.focus()` — not an instant HTML `autoFocus`,
  and NOT deferred to a later callback. This went through two wrong designs
  before landing here, both worth knowing about since the failure modes are
  easy to reintroduce:
  1. Plain `autoFocus`, gated to pointer-fine (mouse/trackpad) devices only
     (skipped on touch): an instant focus on touch pops the virtual
     keyboard while the popover is still animating in, and floating-ui's
     anchor positioning reacts to the resulting viewport resize
     mid-animation, producing visible jank. But this meant every dropdown
     needed an extra tap on touch before you could type at all.
  2. Deferring the focus call to the popover's `onOpenChangeComplete`
     (fires once the open transition finishes): this fixed the extra-tap
     problem on desktop, but broke mobile in a different way — mobile
     browsers only pop the virtual keyboard when `.focus()` runs
     *synchronously inside the original trusted user-gesture event*. By the
     time `onOpenChangeComplete` fires, the tap is long over, so the input
     silently becomes the focused DOM element but the keyboard never
     appears (confirmed against a real phone: the popover opened, but no
     keyboard/cursor showed in the search field).
  The actual fix needed two parts together: `PopoverContent`
  (`components/ui/popover.tsx`) sets `keepMounted` on the portal so the
  popup's content — and its search input — stays in the DOM at all times
  instead of only mounting once `open` becomes true (otherwise there's
  nothing to `.focus()` yet at the exact instant of the tap); then each
  combobox calls `.focus()` directly inside its `onOpenChange` handler, in
  the same synchronous call as `setOpen(true)`, so it's still within the
  trusted gesture on mobile. `CommandInput` (`components/ui/command.tsx`)
  needed a `ref` prop added to forward to the underlying `cmdk` input for
  this to work. The original animation-vs-keyboard-resize jank this whole
  chain of fixes started from has not been re-verified on a real device
  since this change — if it resurfaces, the fix belongs in taming
  floating-ui's reposition-on-resize behavior, not in re-delaying focus().
- The app nav (`src/components/app-header.tsx`) is global and self-fetching:
  it looks up the current user/profile itself when props aren't passed, so
  any page/layout can render `<AppHeader />` with no prop-drilling (the
  `/tastings` layout does exactly this — that section previously had no menu
  at all). Below `md` it collapses into `MobileNav`'s hamburger drawer;
  the leaderboard (a desktop-only sidebar in `tastings/[id]/layout.tsx`) is
  reachable on mobile via `MobileLeaderboard`'s floating button + bottom
  sheet. Both drawers are dependency-free overlay+panel client components,
  not base-ui Dialogs (avoids fighting Dialog positioning). AppHeader also
  renders `NotificationsBell` (pending-invite count + dropdown).
- **Active-tasting banner** (2026-09-19, spec
  `docs/superpowers/specs/2026-09-19-active-tasting-banner.md`). A strip
  directly under the top bar (`ActiveTastingBanner`,
  `src/components/active-tasting-banner.tsx`, mounted by `AppHeader` after its
  `<header>`, so every page with the bar gets it; not sticky, no dismiss)
  names the one tasting you are in right now with a real Button back to it
  ("Back to the tasting", or "Back to the lobby" while DRAFT; the host of an
  IN_PROGRESS tasting where `startLandsOnConsole` holds goes to
  `/tastings/<id>/host`). Eligible: your own `tasting_participants` row is
  `JOINED` (never INVITED/DECLINED; never CLOSED or legacy `OPEN` status) and
  the tasting is inside its window — IN_PROGRESS LIVE while
  `now − (started_at ?? scheduled_at ?? created_at) ≤ 24 h`; IN_PROGRESS
  ASYNC always; DRAFT while `scheduled_at` is between 12 h ago and 6 h ahead,
  or with no schedule for 12 h after `created_at`. Priority: LIVE running,
  LIVE paused, ASYNC, then DRAFT by nearest schedule; the rest collapse into
  a "+N more" button to `/taste`. All rules are pure in
  `src/lib/active-tasting/select.ts` (vitest-covered); the one RLS-as-viewer
  read (own participant rows + `tastings!inner`, `cache()`d per request) is
  `read.ts`. Hidden on the shown tasting's own pages (`/tastings/<id>/**`,
  `usePathname`) and never on `/login`, `/signup`, `/auth/*`, `/invite/*`.
  The client re-checks through the `"use server"` `pollActiveTastings`
  (`actions.ts`) every 20 s while visible, on focus and on returning to the
  tab (paused on the shown tasting's pages); the newer server-clock
  `checkedAt` of the render and the poll wins, and a failed read never
  blanks it. On `/overview`, `overviewSlot` suppresses the Overview's own
  live/next-up banner when the strip names the same tasting — only its
  `FlightHintRegistrar` stays, and `QuickActions`' gold-tile rule is
  unchanged. Rule 1: only `{ tastingId, name, state, href }` reaches the
  client.
- Tasting lifecycle: a new tasting is created `DRAFT` ("not started"), NOT
  `OPEN` — the create action used to force `OPEN`. While `DRAFT` the host can
  add wines and invite more people (`HostControls` in
  `tastings/[id]/host-controls.tsx` + actions in `tastings/[id]/actions.ts`);
  the host presses **Start** (`startTasting`) to move it to `IN_PROGRESS`,
  which opens guessing. **Reversed** (blind-tasting v3 spec §1.4 row 1): Start
  no longer has a wine-count gate — wines can be added while the tasting runs
  (not in semi-blind, below) — and an incomplete glass never blocks Start
  either; it comes back as an inline warning naming the glass
  (`startWarning`, `src/lib/wine-identity/incomplete.ts`), and only that
  glass's own reveal is refused. Guessing is gated both in `play/page.tsx`
  (UI) and in `play/guesser.ts`'s `resolveGuesser` helper (server, split out
  of `play/actions.ts`): the tasting must not be `DRAFT` and the caller's
  participant `status` must be `JOINED`. Legacy rows created as `OPEN` count
  as "started" (anything ≠ `DRAFT`), so old demo/test tastings keep working.
  The host can **delete** a tasting anytime (`deleteTasting`, cascades via
  FK). **Reversed** (spec §1.4 row 2): invitations and the join link stay
  open until the tasting is `CLOSED`, not just while `DRAFT` — a late joiner
  is eligible for every glass not yet revealed
  (`20260914093500_join_preview_and_late_join.sql`, M4; see `/j/[code]`
  below). **Reversed** (spec §1.4 row 18): name, description, photo,
  `scheduled_at` and the place (`tasting_places`, below) stay editable after
  Start through Tasting settings (`tasting-settings-sheet.tsx`); mode, timing
  and wine source lock at Start, in the app and in the database
  (`tastings_lock_setup_after_start`, M6,
  `20260914095500_flight_edits_until_first_step.sql` — its trigger raises
  "mode, timing and who brings the wines lock once the tasting has started"
  on `reveal_mode`/`timing_mode`/`wine_source` and also refuses a started
  tasting going back to `DRAFT` for any client); the leaderboard-reveal rule
  (`setLeaderboardReveal`, PER_ATTRIBUTE/PER_WINE) locks the same way but is
  DRAFT-only in the app alone, with no DB trigger of its own. The guided-
  pacing toggle is a separate setting that stays changeable after Start (see
  "One wine at a time" pacing, below).
- Invitations now require acceptance. An invited participant (`status`
  `INVITED`) sees an Accept/Decline card on the lobby (`respondToInvite`
  action → `JOINED`/`DECLINED`) and a bell notification in the header; only
  `JOINED` participants can guess. `/taste` (`src/app/taste/page.tsx`) shows
  pending invitations in their own `InvitationsBand` (inline Accept/Decline)
  above the tasting list. `TastingsTabs` (`src/app/taste/tastings-tabs.tsx`)
  puts four filter chips over that one list: **All** (every non-declined
  membership; its count includes invitations, but its list leaves them to
  the band), **Hosting** (`host_id` = me), **Attending** (`JOINED`, not
  host) and **Finished** (`CLOSED`, in either role). The chips overlap and
  are defined by `ArchiveFilter`/`matchesFilter` in
  `src/app/taste/taste-archive-math.ts`. The active chip is in the URL
  (`?tab=`; `?tab=history` still means Finished). The host row is always a
  `JOINED` participant, so Attending's explicit not-host test is what keeps
  a hosted tasting out of Attending.
- **Hand hosting** (blind-tasting v3 BT-K1; spec §12; ledger B11, owner
  default Q4; M10, `20260914104500_transfer_tasting_host.sql`). The tasting
  settings sheet's "Hand hosting to someone" row calls the server action
  `handHosting(tastingId, newHostUserId)`
  (`src/app/tastings/[id]/hosting-actions.ts`), which is a thin wrapper
  around the SECURITY DEFINER RPC `transfer_tasting_host(p_tasting_id,
  p_new_host_user_id)` — that RPC is the actual floor, host only, and
  refuses, in order: no such tasting / not signed in / caller is not the
  host; the tasting is not `DRAFT` ("hosting can only change before the
  tasting starts"); the target is null, is the host, or is not a `JOINED`
  participant; any glass of the tasting has `added_by_host` ("remove the
  glasses you added first"); or the host still owns an unfinished
  `wine_identity_drafts` row or `wine_pour_intents` row on a glass of the
  tasting. The former host's own participant row is left untouched — they
  stay `JOINED` and become an eligible guesser of the others' bottles they
  never saw (matching CLAUDE.md's own "the host row is always a `JOINED`
  participant" rule). EXECUTE is `authenticated` only, never `service_role`
  (owner decision OD-1, 2026-09-14) — Supabase's default privileges would
  otherwise also grant a new function to `service_role`, so the migration
  explicitly revokes it there too, even though `service_role` could not
  call it meaningfully anyway (`auth.uid()` is null for it). Because a
  host-added glass blocks the transfer outright, and a bring-your-own
  flight's glasses are never `added_by_host`, the new host inherits no
  answer key they did not add.
- Tastings carry an optional `scheduled_at timestamptz` (date + time).
  **Reversed** (spec §1.4 row 18): it stays editable after Start too, through
  Tasting settings, not just while `DRAFT`. Always format it client-side via
  `src/components/local-date-time.tsx` (viewer's locale/timezone) — the
  server's timezone is not the user's. `datetime-local` inputs give/expect
  local `YYYY-MM-DDTHH:mm`; convert to/from ISO at the action/effect boundary.
  A tasting also has a private place (`tasting_places`, participant-private —
  see below), editable the same way.
- **`tasting_places`** (blind-tasting v3 M2, `20260914091500_tasting_places.sql`)
  is a one-row-per-tasting table, deliberately NOT a column on `tastings`: a
  `tastings` row goes public once any of its wines is revealed
  ("tastings with revealed wines are public"), and a place can be a home
  address, so it needs its own tighter RLS. Readers: the host and JOINED and
  INVITED participants, through the SECURITY DEFINER helper
  `is_tasting_member(tasting_id)` — a DECLINED participant or an outsider who
  can read the (now-public) tasting row gets nothing, and the place never
  reaches the record or any preview (`get_join_preview` never selects it).
  Writer: the host only, through `is_tasting_host`. `src/app/tastings/new/place.ts`
  (`setTastingPlace`/`getTastingPlace`) is the only read/write path; `getTastingPlace`
  returns null on any RLS refusal or error rather than throwing, so a missing
  or hidden place never breaks a page. Shown on the tasting header
  (`tasting-page-header.tsx`) to members only, and explicitly suppressed on
  the CLOSED record (`showPlace={false}`).
- Reveal timing. LIVE tastings are never auto-revealed — the host reveals each
  wine manually (RevealButton → `reveal_wine`); `maybeAutoRevealWine` early-
  returns unless `timing_mode = 'ASYNC'`. ASYNC tastings choose a
  `async_reveal_policy` (enum type `async_reveal_type`, values `AFTER_ALL` /
  `IMMEDIATE`; default `AFTER_ALL`) at creation: `AFTER_ALL` keeps the wine
  hidden until everyone's guessed, then auto-reveals globally; `IMMEDIATE`
  scores *your own* guess the moment you submit (via the `score_own_guess`
  RPC) and shows you the answer, WITHOUT setting `wines.is_revealed` (others
  can still guess) — the wine still auto-reveals globally once all have
  guessed. `score_own_guess` mirrors `reveal_wine`'s per-category / semi-blind
  scoring exactly and only touches the caller's own not-yet-scored guess.
- **Superseded**: locking is no longer keyed on `scored_at` alone.
  `guesses.locked_at` is the readiness signal a taster controls
  (`lockGuess`/`unlockGuess` in `play/actions.ts`, both blind and semi-blind —
  see "Guess ladder" below); `submitGuess` and `submitAllMatchGuesses` no
  longer exist (replaced by `saveGuessFields`'s per-field-group autosave and
  `assignMatch`/`clearMatch`). M8 (`20260914101500_guess_lock_pin.sql`) adds
  a DB-level pin: the `guesses_refuse_locked_edit` BEFORE UPDATE trigger
  refuses a client's change to a locked row's answers (the ten guess fields
  and `guessed_wine_id`) while it stays locked — SQLSTATE 42501, caught in
  `saveGuessFields` as the same "locked" refusal a stale read would already
  produce. A client may still lock/unlock a row (`locked_at` alone), unlock
  while editing in the same write ("Change it" unlocks first), and the
  SECURITY DEFINER scoring RPCs (`reveal_wine`, `reveal_next_category`,
  `score_own_guess`) and the semi-blind pool release all pass because they
  either run as the table owner or clear `locked_at` in the same statement
  they touch. `reveal_wine` and `score_own_guess` still write `scored_at`
  themselves — a trigger keying on "already scored" alone would block those
  legitimate SECURITY DEFINER writes, which is why the pin keys on
  `locked_at`, not `scored_at`.
- The wine_answers read RLS grants access once you have a scored guess for a
  wine (`has_scored_guess(wine_id)` SECURITY DEFINER helper) — this is what
  lets an immediate-mode guesser see the answer for a wine that isn't globally
  revealed. Added via `20260716140000_async_reveal_policy.sql`.
- Play page (`play/page.tsx`): a wine is "resolved for me" when it's globally
  revealed OR my own guess for it is scored; resolved wines show the Answer +
  my result, unresolved ones show a per-wine status badge (Not guessed /
  Guessed / Your result / Revealed) plus a `CollapsiblePanel`-wrapped guess
  form ("Guess this wine" / "Edit your guess") rather than every form being
  expanded at once. Semi-blind unresolved glasses still go through the single
  batch MatchGuessForm; a glass leaves the batch and gets its own result card
  once resolved. Fetch answers for `revealed ∪ my-scored` wine ids, not just
  revealed.
- Appellation/producer search is accent-insensitive via the
  `search_appellations` / `search_producers` RPCs (not a plain PostgREST
  `.ilike`, which can't fold accents) — `reference-search.ts` calls them.
  They fold with an IMMUTABLE `f_unaccent()` wrapper (2-arg
  `unaccent(regdictionary, text)`) so a trigram GIN index on
  `f_unaccent(name)` keeps it fast; migration
  `20260716160000_accent_insensitive_search.sql`. This is why "estephe" finds
  "Saint-Estèphe AOP" and "chateau" finds "Château …". The classic Bordeaux
  sub-appellations (Pauillac, Saint-Estèphe, Margaux, Pomerol, Saint-Émilion,
  …) were never missing from the data — they were just unsearchable without
  accent folding. Note `gin_trgm_ops` must be referenced UNqualified (pg_trgm
  lives in `extensions`, which is on the migration search_path;
  `extensions.gin_trgm_ops` errors with "operator class does not exist").
- The create-tasting timing defaults to LIVE, and the "When to show results"
  (async reveal policy) field only renders when timing is ASYNC — the timing
  Select is controlled client state in `new-tasting-form.tsx` so the async
  field can show/hide. A hidden/absent async field just means the action
  defaults it to AFTER_ALL (irrelevant for LIVE).
- Combobox popovers (`components/ui/popover.tsx`) use base-ui with
  `positionMethod="fixed"` and an `initialFocus` that returns `false` on
  touch/pen. On mobile the default `absolute` positioning mis-placed the
  dropdown ("appears randomly"), and base-ui's default of focusing the popup
  on touch yanked the page to the top before floating-ui had positioned it
  (tapping "choose a friend" scrolled to top). Fixed positioning + no
  touch-focus fixes both; mouse/keyboard still focus the search field.
- Everyone (not just the host) can see WHO has guessed each wine, so the host
  knows when to reveal. The guesses RLS still hides guess *content* until
  reveal; the `tasting_guess_status(tasting_id)` RPC (SECURITY DEFINER, gated
  via is_tasting_host/is_tasting_participant) exposes only the (wine_id,
  participant_id) pairs a guess exists for. The play page shows a
  "N/M ready to reveal" readiness footer per still-hidden wine (blind), or a
  per-person "submitted their matches" summary in the intro card (semi-blind).
  Eligible guessers for a wine = JOINED participants minus that wine's
  contributor minus the host when wine_source is HOST_PROVIDES (the host set
  the answers, so they don't guess).
- Bring-your-own (PARTICIPANT_CONTRIBUTED) wines: a participant may bring any
  number of bottles (including zero) — no one-per-person cap (removed from
  addWine and the lobby). Wines are labelled by contributor via the shared
  `src/lib/wine-label.ts` `makeWineLabeler` ("Gustav's wine", or "Gustav's
  wine #2" when someone brought several); use it anywhere a wine needs a title
  (play, results, lobby). The leaderboard "wine X/Y" denominator is
  per-participant — total wines minus the ones they contributed (you never
  guess your own), computed in `tasting-leaderboard.ts`.
- **Superseded** (blind-tasting v3 §3/§4 "the page split", B2/B5;
  `view-route.ts`): `tastings/[id]/page.tsx` no longer holds one monolithic
  render — it calls `routeTastingView` once with the tasting row and the
  viewer's own participant row and renders whichever view that names:
  `open-board` (reveal_mode OPEN, once started), `finished` (CLOSED),
  `invitation` (an INVITED non-host), `guest-lobby` / `lobby` (DRAFT), or
  `running` (IN_PROGRESS, and legacy started `OPEN`-status rows). Everything
  a running tasting needs — participants, wines, guessing, reveal, per-wine
  results — still lives on that one `running` view
  (`running-view.tsx`, "moved without change" from the old `page.tsx`), to
  avoid bouncing between routes. The guess/reveal/readiness/results UI is
  the shared server component `play/play-experience.tsx` (`PlayExperience`),
  embedded there for JOINED participants of a started tasting and also
  rendered by the thin `/play` route (kept so old links work). Revealed
  wines show EVERY participant's per-category chip breakdown inline. The
  host still gets the compact `WinesCard` overview (reveal button + reorder
  arrows + a private producer·region·vintage identity line so reordering is
  visibly doing something — hidden host-provided wines otherwise all look
  identical); a bring-your-own contributor gets it too, for their own rows;
  other participants who can guess get the full play cards instead.
  **Reversed** (spec §1.4 row 13): `/results` (`results/page.tsx`) no longer
  doubles as the finished tasting's page — it now only ever renders
  "Standings so far" plus a per-wine breakdown for a still-`IN_PROGRESS`
  tasting; a CLOSED tasting redirects it straight to the record
  (`RecordView`, below). **Superseded / reversed** (B5, decision 2026-09-14):
  the running board, the host console, the reveal and the locked-in wait no
  longer force a dark shell — `LiveShell` is deleted, and those screens
  render in whatever theme the viewer chose (see "the app is light by
  default" under Brand assets). A CLOSED tasting still shows the result
  (`result/result-view.tsx`) until the viewer dismisses it, and then the
  record (`result/closed-surface.tsx`, `finished-view.tsx`); the flag that
  decides which of the four surfaces a viewer gets — `"lobby" | "live" |
  "result" | "record"` — lives in `src/lib/live-theme.ts`'s `liveSurface`,
  keyed by a per-viewer localStorage dismiss flag
  (`resultDismissKey`/`readDismissed`/`writeDismissed`, via
  `src/lib/safe-storage.ts`), not by a global dark/light toggle. `RecordView`
  (`record/record-view.tsx`) is the sole CLOSED board now (BT-R3): its own
  "Glass by glass" rows replace the old board's wine-chip navigator,
  `WinesCard` and `PlayExperience` for a finished tasting.
- Bring-your-own has NO one-wine-per-person cap in either the add-wine action
  OR the add-wine page (`wines/new/page.tsx` — the page-level guard was a
  separate spot that also had to be removed); people can add 0, 1, or many.
- **Superseded**: live updates during a tasting are no longer polling alone.
  `src/components/auto-refresh.tsx` (`router.refresh()` on an interval while
  the tab is visible; `router.refresh()` preserves client state, so an open
  guess form isn't disrupted) still runs everywhere — the lobby, a DRAFT or
  ASYNC tasting, and even a LIVE one (belt and braces for `tastings`-row
  changes like Pause/Resume/Skip, which carry no Realtime signal of their
  own). But a LIVE tasting's play and host-console pages also mount
  `RevealSync` (`src/components/reveal-sync.tsx`): a Postgres-changes
  subscription on `wines` and `guesses` (the only two tables in
  `supabase_realtime`) for that tasting, which calls `router.refresh()` on
  each change — a `wines` change (a reveal) debounced 20ms, a `guesses`
  change (a submission) 250ms, so the thing everyone is waiting for doesn't
  pay a delay that exists only to coalesce guess-row chatter behind it.
  The `guesses` subscription survived M9b's column lockdown: BT-M9b's
  Realtime check (2026-09-14, a host and a guest on a throwaway LIVE
  semi-blind tasting) got a `guesses` event in both sessions within a second
  of an assign, a lock and a reveal, and no payload carried a
  `guessed_wine_id` key, so BT-S6's fallback (drop the `guesses` channel and
  lean on AutoRefresh) was not needed. A future change to the `guesses`
  column grants needs that two-session check again. If real push is
  ever wanted for the lobby/DRAFT/ASYNC surfaces too, `RevealSync` is the
  swap point.
- **Reversed** (spec §1.4 row 16; Q8): "One wine at a time" guided pacing —
  `tastings.sequential_guessing` — now applies to LIVE blind AND LIVE
  semi-blind tastings alike (`f.revealMode !== "OPEN" && f.timingMode ===
  "LIVE"` at create; the toggle moved from HostControls into Tasting
  settings, `tasting-settings-sheet.tsx`, and stays changeable after Start,
  unlike the setup fields that lock — `setSequentialGuessing` only refuses
  an ASYNC tasting). The current glass is no longer "the lowest `position`
  not-yet-revealed one" — it is the pour pointer's
  (`tastings.current_wine_id`, `src/lib/pour-pointer.ts`'s `currentGlass`):
  no pointer, or a pointer outside the flight, falls back to the lowest
  unrevealed glass; the pointer's own glass while unrevealed stays current;
  once it's revealed, the next unrevealed glass after it becomes current,
  wrapping back to a skipped one. Owner default Q8: only a LIVE blind
  tasting with guided pacing on reveals attribute by attribute at all — the
  single predicate `stepRevealApplies` (`src/lib/console-copy.ts`:
  `revealMode === "BLIND" && timingMode === "LIVE" && sequentialGuessing`)
  gates both the console's step chips and the participant `RevealView`, so
  the two can never drift apart; every other tasting (free-order LIVE blind,
  any ASYNC tasting, semi-blind) reveals a glass whole, never category by
  category. A semi-blind guided tasting still uses the pour pointer for
  pacing, but opens every glass poured so far (every glass up to and
  including the pointer's) rather than gating on step reveals, since
  semi-blind has no attribute-by-attribute reveal to wait on.
  `sequentialOrderError` (`play/guesser.ts`) rejects an out-of-order guess
  server-side. The host used to set the order with up/down arrows calling
  `moveWine`; `moveWine` is retired (M11,
  `20260914125500_wines_client_update_lockdown.sql`, revoked the client
  UPDATE grant it relied on) — reordering now goes through the
  `move_flight_glass` RPC (`flight-actions.ts`'s `moveFlightGlass`; see
  "Wines are editable" below). The results/play wine numbering still
  follows list order, not the raw stored position.
- Everyone (not just the host) can see WHO has guessed each wine, so the host
  knows when to reveal. The guesses RLS still hides guess *content* until
  reveal; the `tasting_guess_status(tasting_id)` RPC (SECURITY DEFINER, gated
  via is_tasting_host/is_tasting_participant) returns one (wine_id,
  participant_id) pair for every guess row that exists, each with a `locked`
  flag (`locked_at is not null`), and never the guess content. Readiness
  counts only locked guesses: a row that has only been autosaved shows as
  "in progress", not ready. The play page shows a
  "N/M ready to reveal" readiness footer per still-hidden wine (blind), or a
  per-person "submitted their matches" summary in the intro card (semi-blind).
  Eligible guessers for a wine = JOINED participants minus that wine's
  contributor minus the host when wine_source is HOST_PROVIDES (the host set
  the answers, so they don't guess).
- Bring-your-own (PARTICIPANT_CONTRIBUTED) wines are labelled by contributor
  ("Gustav's wine"), not "Wine N", on the play page (`wineTitle`). The lobby's
  Wines card, in BYO mode, lists every JOINED participant with "Added" or
  "waiting for {name} to add it" so everyone sees who's brought a
  bottle — driven off `wines.contributor_participant_id`, no answer leaked.
- `/rules` (`app/rules/page.tsx`) explains the VM/DM point system (and the
  semi-blind 1-point-per-match variant). Linked from the reveal-mode badge on
  the lobby and a "How scoring works" link atop the guess form. Vintage
  scoring (exact = 2, off-by-one year = 1, else 0; NV/tawny exact-only) is
  shown both there and inline in the guess form's Vintage field label.
- Profiles carry optional `location` and `phone` (plain text columns,
  migration `20260718090000_profile_optional_fields.sql`) set on
  `/profile/edit`. `location` is shown on the public profile (`/u/[id]`) and
  People directory, consistent with the app's open-directory philosophy;
  **phone is deliberately kept private** — only ever queried/shown on the
  owner's own `/profile/edit` page, never on `/u/[id]` or `/people`, since
  it's more sensitive PII than the rest of what's public here. If phone is
  ever wanted publicly, that's a conscious call to make separately, not a
  default.
- **Favourite regions and producers** (2026-09-19, owner: the favourite wine
  type is gone; spec `docs/superpowers/specs/2026-09-19-profile-favourites.md`,
  migration `20260919141700_profile_favourites.sql`). `favorite_wine_type`
  is retired from the app — the column stays in the database, in
  `database.types.ts`'s Row and in the nine-column `profiles` UPDATE grant,
  but nothing in `src/` reads or writes it and `src/lib/wine-types.ts` is
  deleted (`src/lib/favourite-wine-type-retired.test.ts` fails on any
  reference coming back). In its place a person picks up to 10 favourite
  regions and up to 10 favourite producers from dropdowns on `/profile/edit`
  (`favourites-fields.tsx`), stored in `profile_favourite_regions` /
  `profile_favourite_producers` (one row per favourite, `position` 1..10,
  readable by every signed-in viewer like the rest of a profile, written
  only as yourself). Saving replaces both sets at once through
  `set_profile_favourites(p_region_ids, p_producer_ids)` (SECURITY INVOKER,
  `authenticated` only); a BEFORE INSERT guard refuses a deleted profile, a
  per-country "None" sentinel region and an 11th favourite, and
  `profiles_deleted_drop_favourites` removes both sets when an account is
  deleted. `src/lib/profile-favourites.ts` is the one read/write module
  (`getProfileFavourites` returns null on any error so the profile page
  never breaks); `FavouritesChips` (`src/components/profile/favourites-chips.tsx`)
  renders them under the bio in `ProfileHeader`'s `favourites` slot.
- `getProfileStats` (`src/lib/profile-stats.ts`) also computes "what have you
  tasted most" (`topCountries`/`topRegions`/`topGrapes`, top 5 each) — tallied
  from the actual `wine_answers` for every wine with a scored guess, NOT from
  the guess itself, since tasting the glass (not guessing it correctly) is
  what counts as exposure to that origin. It no longer returns a
  `bestCategory`: the "Strongest" category shown on `/u/[id]` now comes from
  `accuracyView` (`src/lib/profile/profile-view-math.ts`), computed over the
  same rows the page displays (Your numbers' labels plus "Vintage ±1",
  `MIN_SAMPLE = 3`) so the line can never disagree with a row.
- **`/u/[id]` (2026-09-19 redesign)** reuses the Overview/Your numbers
  primitives rather than its old ad-hoc card: `ProfileHeader` (avatar, serif
  name, a meta line, bio, real-button actions), a `StatTrio`, three
  `StatCard`s (`ProfileStatCards` — accuracy by category via `AccuracyRows`,
  and two "tasted most" origin/grape cards), and `ProfileTastings` (a
  catalog-style laptop table / phone cards, newest first by this person's
  latest `scored_at`). Another person's Cellar button is gated by the
  `can_view_cellar(p_owner)` RPC (the same gate `/u/{id}/cellar` itself
  uses), not by `cellar_visibility` alone — the profile can't see a
  friendship in the other direction, so that column alone would either show
  a dead end or hide a real FRIENDS-visible cellar. The friend action is
  `FriendButton variant="header"`, the same two-tap "Friends" state
  Community's rows use, just sized for the header; the button's old
  single-tap `variant="profile"` is retired. The tastings list never shows a
  cover photo (join-preview parity — a non-member never sees one either) and
  its dates are UTC server strings, not `LocalDateTime` (a past tasting has
  no "Scheduled" placeholder to fall back through). "avg points" still
  mixes blind 0–30 totals with semi-blind 0/1 match guesses, same as
  Community, the Overview card and Your numbers — deliberately left alone so
  a person's number agrees everywhere it's shown.
- `getBulkProfileSummaries(profileIds)` (also in `profile-stats.ts`) is a
  separate, lighter batched query for the People directory — tastings
  attended / wines guessed / avg points for a whole list of profiles in a
  handful of queries, not `getProfileStats` called in a loop (which would be
  an N+1 fan-out across every user in the directory). Use this one for any
  future "stats for many people at once" surface; reach for `getProfileStats`
  only when you need one person's full detail (category accuracy, tasting
  history, top origins).
- The notifications bell polls live. `src/lib/notifications.ts`'s
  `getPendingInvites()` is a `"use server"` action (not just a plain helper)
  specifically so `NotificationsBell` (client component) can call it directly
  on a `setInterval` (15s, paused when the tab is hidden) and update just its
  own state — instead of the old behavior where a new invite only appeared
  after a full manual page reload. `AppHeader` still calls the same function
  for the initial server-rendered count, so there's one source of truth.
- `/knowledge` is a separate reference library, deliberately decoupled from
  tastings/scoring — nothing under it is scored or tasting-specific, it just
  requires login for consistency with the rest of the app. Three pages, each
  reusing existing tables rather than inventing parallel content stores:
  - **Type Designations** (`/knowledge/type-designations`) reuses the same
    `type_designations` table the answer-key/guess forms already use, via a
    new nullable `description` column (migration
    `20260719090000_type_designation_descriptions.sql`). Grouped by the same
    `category` enum used for scoring, in the same fixed `CATEGORY_ORDER` as
    `type-designation-field.tsx`'s picker groups.
  - **Grape Library** (`/knowledge/grapes`) reuses the shared `grapes` table
    (the same one every `wine_answers`/`guesses` FK points at) via new
    nullable knowledge columns — `color`, `description`, `typical_aromas`,
    `typical_acidity`, `typical_tannin`, `typical_body`, `typical_alcohol`,
    `main_regions` (migration `20260719093000_grape_knowledge_columns.sql`).
    Only 41 of 57 grapes are seeded with a profile; the rest render "No
    profile yet." — a deliberate curated-subset approach (breadth of the
    grape *list* already exists via LWIN-derived usage, depth of profile
    content is added gradually) rather than blocking launch on profiling
    every obscure variety. A grape added ad-hoc from a tasting's answer-key
    combobox just shows up here unprofiled until someone curates it.
  - **Wine Map** (`/knowledge/map`) renders the tile map:
    `TileWineMapExplorer` (client state, breadcrumb + child pills + details
    panel, `?place=<canonical key>` deep links via `history.replaceState`)
    plus `TileWineMap` (MapLibre GL via `react-map-gl/maplibre` with the
    pmtiles protocol over the archives named in `tiles/manifest.json`).
    Place context (ancestors, children, article, boundary bbox) comes from
    the `get_wine_place_context` RPC — security invoker, authenticated-only,
    RLS-bound to the canonical `wine_places` catalog. Deeper places reveal
    with zoom (tippecanoe per-feature minzoom); clicks resolve to the
    highest-tier feature; selecting a place fits the camera to its boundary
    bbox. Boundary lineage (still true of the canonical geometries):
    official INAO parcel geometries from IGN Géoplateforme WFS layer
    `AOC-VITICOLES:aire_parcellaire` (retained in source migration
    `20260726090000_wine_map_inao_boundaries.sql`), generalized into
    hole-free concave footprints (`20260726100000_wine_map_concave_boundaries.sql`)
    — cartographic footprints that fill non-vineyard whitespace, not legal
    appellation boundaries; the adaptive quality gate omits sub-2%
    components only when a hull edge exceeds 20% of its diagonal (Pauillac,
    Saint-Julien). The generator
    `scripts/generate-wine-map-concave-boundaries.mjs` is historical — it
    emits SQL against the retired `wine_map_nodes` table and its tests are
    file-fixture-based only. The map uses MapLibre
    GL with the free un-keyed Carto Positron vector basemap (no API key).
    Map components must ONLY be loaded via `next/dynamic` with `ssr: false`
    (maplibre-gl touches `window` on import). Brand colors are hardcoded hex
    in MapLibre paint expressions (paint expressions can't read CSS
    variables). If the manifest fetch fails, the page shows a retry card
    while breadcrumb, pills, and details keep working (text navigation
    survives tile failure). Hierarchy note: Saint-Estèphe, Pauillac,
    Saint-Julien, and Margaux sit under Haut-Médoc, and Barsac under
    Sauternes — matching the real INAO appellation hierarchy. The legacy
    `wine_map_nodes` implementation (`wine-map-explorer.tsx`,
    `interactive-wine-map.tsx`, full-tree fetch) is deleted, and the table
    itself was dropped in `20260730090000_wine_map_nodes_retirement.sql`.
  - Nav entry added to `AppHeader`'s `NAV_LINKS` between Friends and Rules.
- World Wine Map Phase 1 adds `wine_places` as the canonical future map
  catalog, plus aliases, articles, stable boundary-source identities,
  immutable source snapshots, reviewed PostGIS display geometries, and release
  metadata. New imports must retain genuine raw source artifacts; the migrated
  legacy Bordeaux rows explicitly record that their raw WFS responses,
  retrieval timestamps, and parcel IDs are unavailable and instead pin the
  earliest normalized Git artifacts. `wine_map_nodes` remained the active read
  source through Phase 1 and was retired in Phase 2B after the tile UI passed
  parity; there was no permanent dual-write. Existing
  country/region/appellation UUIDs and scoring behavior are unchanged. Their
  nullable `wine_place_id` and required `map_status` record curation explicitly:
  Phase 1 verifies only exact France, Bordeaux, and the 12 currently mapped
  Bordeaux appellations (accepting the clean-replay name or its live
  `AOP`-suffixed equivalent); every other row remains `PENDING`. PostGIS is the
  reviewed geometry/validation store for later offline tile builds, not a
  request-time tile service. The 13 Bordeaux footprints are
  `GENERALIZED_FROM_OFFICIAL_SOURCE`, while France is `MANUAL`; neither is a
  claim of legal boundary accuracy. PMTiles publication and map UI changes are
  Phase 2 work.
- World Wine Map Phase 2A publishes the 14 verified places as immutable PMTiles
  releases. `scripts/wine-map-tiles/` holds the pipeline (export → tippecanoe →
  validate → publish → promote); tippecanoe 2.79.0 runs only in the
  `wine-map-tiles` GitHub Actions workflow. Storage bucket `wine-map-tiles` is
  public-read; archives live at `tiles/releases/<version>/` with immutable
  cache headers and `tiles/manifest.json` (max-age=60) is the only mutable
  pointer — promotion/rollback rewrite the manifest and flip
  `wine_map_releases.status`; archives are never mutated. Releases that fail
  any gate are recorded `FAILED` and never promoted. The map UI read
  `wine_map_nodes` until the Phase 2B tile UI replaced it.
- World Wine Map Phase 2B made the tile map the only map UI: `/knowledge/map`
  renders `TileWineMapExplorer`, which reads `tiles/manifest.json` (PMTiles
  archives) for geometry and `get_wine_place_context` (RLS-bound RPC,
  authenticated-only) for place context; deep links use `?place=<canonical
  key>`. `wine_map_nodes` is retired and dropped — the canonical
  `wine_places` catalog is the single map source. New places appear on the
  map by verifying them in the catalog and publishing a release through the
  Wine Map Tiles workflow; no UI change is needed for new coverage — but see
  the neighbour-cache rule below, which every catalogue write does have to
  honour.
- **A catalogue write must be followed by a neighbour-cache refresh** (once
  `20260920090000_wine_place_neighbours.sql` is live; spec
  `docs/superpowers/specs/2026-09-20-wine-place-nearby.md`). The details
  panel's "nearby" chips used to be the whole cost of
  `get_wine_place_context` — it measured PostGIS distance over every
  candidate's full outline on every click (a country ~250 ms). They now come
  from `wine_place_neighbours`, a precomputed list of place ids, with
  `wine_place_neighbours_state.fresh` saying whether it still matches the
  catalogue. **Any** insert, update or delete on `wine_places` or
  `wine_place_boundaries` clears that flag through a statement-level trigger,
  and while it is false the function silently falls back to the live
  computation: **forgetting is slow, never wrong**, so nothing breaks — the
  map just goes back to costing what it cost before. Repair:
  - a MIGRATION that writes either table ends with
    `select public.refresh_wine_place_neighbours();` IN THE SAME TRANSACTION;
  - a PIPELINE RUN (the ~28 scripts under `scripts/wine-map-sources/` that
    commit against live — they cannot use the same-transaction form,
    `build-germany-einzellagen.mjs` commits once per place and the rebuild
    costs ~65 s) does ONE refresh as the LAST step of the batch:
    `node --env-file=.env.local scripts/wine-map-sources/refresh-neighbour-cache.mjs`.
    It is a no-op while the cache is already fresh, so it is safe to end any
    run with. `run-targets.mjs` already does it.
  Three things stop this being a rule you have to remember: every committing
  script prints a banner after its commit (`warnIfNeighbourCacheStale`,
  `scripts/wine-map-sources/neighbour-cache.mjs`), the trigger raises a NOTICE
  on the fresh→stale transition, and `scripts/wine-place-context.test.mjs`
  fails when the cache is stale. `refresh_wine_place_neighbours()` and the
  trigger function are EXECUTE-able by the owner alone — not `authenticated`,
  not `anon`, and not `service_role` either (Supabase's default privileges
  would otherwise hand it to `service_role`, the same trap
  `transfer_tasting_host` documents). The refresh refuses to publish (returns
  -1, leaves the cache stale) if any stored neighbour is one an ordinary
  reader's policies would filter.
- World Wine Map Phase 3A adds the four-axis place model and the France region
  import machinery. Classification facts live as flat columns on `wine_places`
  (`is_appellation`, `appellation_system`, `appellation_level`), legal
  relationships as typed `wine_place_relationships` edges (`REPLACES_WITHIN`
  for Pessac-Léognan→Graves, `DUAL_LABEL` for Barsac↔Sauternes) — kept
  separate from the navigation tree (`primary_parent_id`) and from the scoring
  links (`regions`/`appellations.wine_place_id`). `canonical_key` is a stable
  opaque id — never parse it for hierarchy. Boundaries come from the INAO
  parcel adapter (`scripts/wine-map-sources/`): fetch WFS parcels per
  denomination (`srsName=EPSG:4326` — the layer is natively Lambert-93 metres),
  retain the raw pages gzipped in the private `wine-map-sources` bucket, and
  dissolve to a generalized footprint — server-side PostGIS for small sets,
  the client-side clustered concave engine (`--engine concave`) for
  region-scale sets that exceed the free-tier DB. Every generated boundary is
  staged `DRAFT`/non-current and only flipped `VALIDATED`+current after human
  review. The tile split is by `display_tier` (tier 0 → world archive, tier 1
  → both, tier ≥ 2 → country shard), so new regions are pure data batches
  through the same pipeline. Reference links use exact-name matching (one
  candidate → link, multiple → abort, none → stays `PENDING`).
- World Wine Map Phases 3C/3D delivered Burgundy in full depth and the
  architecture that scales it: tiles ship as `world.pmtiles` (tier ≤ 1) plus
  ONE shard PER REGION (second key segment, e.g. `bourgogne.pmtiles`),
  manifest `schema_version: 2`, content-driven per-shard max zoom (z16 where
  climats exist), and the UI loads only the active region's shard
  (superseding 3A's tier-only split note). Burgundy = six SUBREGION districts
  (Côte de Nuits, Côte de Beaune, Chablis, Grand Auxerrois, Côte
  Chalonnaise, Mâconnais) with villages/grands crus/premier-cru groups
  generated by the wave config in
  `scripts/wine-map-sources/generate-cote-de-nuits.mjs` from the committed
  INAO vocabulary + curated `data/wine-map/burgundy-grand-crus.json`.
  `appellation_level` includes `premier_cru`/`grand_cru`; district and
  region outlines are `DERIVED_FROM_DESCENDANTS` (closed + part-filtered
  union of verified children). Plot overlaps are trimmed smallest-first
  (`trim-sibling-overlaps.mjs`); overlaps that survive the >50% guard are
  real wine law and become `DUAL_LABEL` edges (Clos de Bèze→Chambertin,
  Mazoyères→Charmes, Charlemagne→Corton-Charlemagne, Barsac→Sauternes).
  Knowledge content (articles, `wine_place_grapes`, `wine_place_styles`,
  designation links) ships as data migrations with fail-closed count
  asserts; every VERIFIED place must carry an article and Burgundy places a
  grape link. Any live apply must be verified with same-transaction
  assertions — version rows have been observed recorded without their DDL.
- **Wine map performance** (2026-09-20; specs
  `docs/superpowers/specs/2026-09-20-wine-map-performance.md` and
  `2026-09-20-wine-map-data-latency.md`; the measured profile behind them is
  `.superpowers/map-perf/findings-2026-09-20.md`, gitignored). What was
  measured on production BEFORE changing anything: camera work was already
  fine (17 ms frames panning and zooming everywhere tried, ~350 ms
  jumpTo->idle, no layer/source/heap accumulation over a 12-region tour, 0.8 ms
  hit-testing) — do not re-optimise it. The costs were elsewhere, and each fix
  below is verified live:
  - **The page preloads the tile manifest and the light basemap style**
    (`page.tsx`): preconnect only warms the socket, and both fetches sat on the
    map's critical path behind the bundle parse. Live: style 1,645 -> 936 ms,
    manifest 1,270 -> 936 ms, first tile byte 1,808 -> 1,527 ms, each still
    fetched exactly once. Keep `as="fetch"` plus anonymous CORS or the browser
    fetches twice.
  - **The grape gate is an object lookup, not an array scan**
    (`src/lib/wine-map/key-gate.ts`). MapLibre's `in` over a literal array is
    an indexOf per feature per layer; 598 keys on 15 layers meant a linear scan
    on every tile parse (20-30x slower than the object form over 360k measured
    evaluations). The shape is
    `["==", ["get", ["string", ["get","key"], ""], ["literal", keyMap]], true]`:
    the `string` assertion prevents a per-feature throw on a missing or numeric
    key, and `== true` (never `to-boolean`) keeps prototype names such as
    `constructor` out of the gate. A no-filter state must remain an always-true
    expression, never `undefined`. MapLibre deep-clones a filter per layer, so
    the style's byte count is unchanged — the win is per-feature evaluation.
  - **The basemap is trimmed to 68 of Carto's 93 layers**, and every road is
    zoom-gated to `BASEMAP_ROAD_MIN_ZOOM` (z10) rather than deleted. A road's
    surface, bridge and tunnel states are three layers with mutually exclusive
    filters, so deleting the tunnel half leaves holes in motorways and
    railways; gating saves the same parse work with no gaps, because MapLibre
    skips a gated layer before filtering a single feature. Live: road features
    4 -> 0 at z5, 23 -> 0 at z9, 129 -> 87 at z12, unchanged at z15.
  - **A theme swap gets a pre-tuned, per-theme cached style OBJECT**
    (`loadBasemapStyle` / `cachedBasemapStyle`) with `validate: false`, not a
    URL. Live: blocked main thread per swap 350 ms across four long tasks ->
    69-137 ms, and a repeat swap fetches nothing. The `setStyle` +
    `transformStyle` + `withWineLayers` contract is unchanged, and `mapStyle`
    must still never change.
  - **Place data is fetched in parallel and cached per key**
    (`src/lib/wine-map/place-cache.ts`, `keyed-cache.ts`,
    `use-place-prefetch.ts`). Selecting a place cost 614 ms across four
    requests, three chained (context -> a `wine_places` id lookup ->
    placements -> archetypes, with styles starting 512 ms in). Now one embedded
    archetype query, styles re-keyed to `canonical_key` so they start with the
    context RPC, and a bounded per-key cache. Live: first visit 560 ms with 3
    parallel requests; a revisit 115 ms with ZERO requests; a ~120 ms hover
    dwell prefetches (passing over four rows costs one place's requests, and
    clicking a hovered row costs none). Caching is safe because every policy
    behind this data is content-level rather than per-user and
    `get_wine_place_context` is SECURITY INVOKER — a future per-user policy
    would have to clear the caches.
  - **Both header pollers back off when there is nothing to report.** The
    active-tasting banner goes 20 s -> 120 s (`pollIntervalMs`,
    `src/lib/active-tasting/select.ts`) and the notifications bell 15 s -> 90 s
    (`invitePollIntervalMs`, `src/lib/notifications-poll.ts`), both re-checking
    on focus/visibilitychange so returning to the tab is still immediate, and
    both holding one request at a time. Measured on production: these two
    server actions were the app's biggest background cost on EVERY page — the
    bell alone fired every 15 s at 575-2,773 ms each. Note when measuring this
    in the Browser pane: neither poller ticks while the pane is hidden
    (`document.visibilityState !== "visible"`), and a pane that flicks visible
    fires both wake handlers, so a naive request count reads as pairs every few
    seconds. Front the pane and watch the gaps, or trust the unit tests.
  - **Nearby places are precomputed** (`20260920090000_wine_place_neighbours.sql`,
    applied live 2026-09-20 with the owner's go-ahead; spec
    `docs/superpowers/specs/2026-09-20-wine-place-nearby.md`). `nearby_list`
    was essentially the WHOLE cost of `get_wine_place_context` — replacing it
    with `'[]'` makes every key 1.3-2.2 ms — because it ran exact PostGIS
    distance over full multipolygon outlines on every request. It was NOT a
    missing index: the GiST index already exists, and forcing the
    boundaries-first plan is 3-10x SLOWER (France 260 -> 2,542 ms), so never
    "fix" this by adding one. Three clauses shipped together: a deterministic
    `order by dist, canonical_key`; an `ST_Intersects` short-circuit
    (intersection implies distance 0, provably identical — 0 of 3,257 keys
    differ); and the `wine_place_neighbours` cache with a freshness flag,
    statement-level staleness triggers and a live fallback, filled by
    `refresh_wine_place_neighbours()` (owner-only, refuses to publish a
    partial fill). Live medians: france 253 -> 29 ms, spain 270 -> 27, italy
    194 -> 26, the catalogue's worst key 558 -> under 2 ms. **Standing rule**:
    any migration or pipeline step that writes `wine_places` or
    `wine_place_boundaries` must end with
    `select public.refresh_wine_place_neighbours();` in the same transaction
    and treat a negative return as an error — otherwise the cache goes stale
    and the map silently falls back to the slow live path. The tie-break also
    fixed a real bug: the nearby order used to depend on which ROLE asked
    (1,619 of 3,257 keys differed between `postgres` and `authenticated`),
    because distance-0 ties had no tie-break; chips reordered once for those
    keys the day it shipped, and nothing outside the `nearby` array moved.
  - **Rejected on evidence**: `useDeferredValue` on the tree search. A
    like-for-like A/B on one build showed no win (64/56 ms without it, 72/64 ms
    with it, plus a new long task), so it was not shipped. Measure any
    debounce/defer attempt the same way before believing it.
- **Wine Map dark mode** (2026-09-19, spec
  `docs/superpowers/specs/2026-09-19-map-dark-mode.md`). The map follows the
  theme `<html>` is rendering (its `.dark` class, via `useRenderedTheme` in
  `src/lib/rendered-theme.ts`, a `MutationObserver` + `useSyncExternalStore`
  used only inside `TileWineMap`), live and without a reload: Carto Dark
  Matter + the dark palette in dark, Positron + the light palette in light.
  Every canvas colour lives in `src/lib/wine-map/map-palette.ts`'s
  `MAP_PALETTES` — two FIXED tables keyed exactly alike (region slug → hex,
  `districtHash(slug) % 12` → hex), never computed per feature (Plan A's
  zoom-lag rule). The light table is the old one moved verbatim; the dark one
  was derived once, offline, from the spec's §7.1 rule and frozen as literal
  hex. Change both tables together; `map-palette.test.ts` holds the contrast
  floors against Dark Matter's land/water read from
  `__fixtures__/carto-styles.json`. In dark the classification ramp inverts
  (grand cru *brightest*, legend "Grand cru (brightest)"). The basemap swap is
  `map.setStyle(url, { diff: true, transformStyle })` with
  `withWineLayers(prev, tuneBasemapStyle(next))` (`src/lib/wine-map/basemap.ts`)
  carrying every wine source and layer across unchanged, so MapLibre's diff
  touches the basemap alone — `mapStyle` on `<Map>` is frozen at the theme the
  map mounted with; **never pass a changing `mapStyle`** (react-map-gl would
  `setStyle` with no `transformStyle` and drop every wine source, tile cache
  and feature-state). The basemap tweaks (pruned source-layers, place labels
  to z7+) live in one place, `basemapTweaks`, which both `onLoad` and
  `tuneBasemapStyle` apply. Wine paint follows the basemap that actually
  landed (`style.load` → `paintTheme`), not the class, so a failed style fetch
  leaves the map wholly light. MapLibre's own controls are dressed for dark by
  `src/app/knowledge/map/map-chrome.css` (tokens only, `.dark`-scoped, inside
  `@media screen and (forced-colors: none)`).
- Producers are scoped by region so the producer field narrows once a region
  is chosen, the same way appellation already does. Unlike `appellations`,
  `producers.region_id` is **nullable** — the original LWIN import deduped
  producers purely by name (`safeKey()` in `import-lwin.mjs`), discarding
  each raw row's country/region, so a re-analysis of the source spreadsheet
  found real multi-region producers (large negociants/brands with estates in
  more than one place, e.g. "Penfolds" across several Australian regions,
  "William Fevre" in both Bourgogne and Chile) that a single required
  region_id would misrepresent. `scripts/backfill-producer-regions.mjs`
  re-derives region_id per producer from the same LWIN source file: ~92% of
  producers have a single region across all their raw mentions (assigned
  directly), ~3% have a strongly dominant region (≥80% of mentions, mode
  value assigned, same "under-labeling beats mislabeling" tradeoff as the
  appellation-designation backfill), and the remaining ~5% are genuinely
  split and are left `region_id = null` on purpose. `search_producers`
  (v3 in `20260721090000_producer_search_groups.sql`) does NOT filter a
  typed query by region at all — it returns every match with an `in_region`
  flag, and the UI groups the selected region's producers under a
  "Specific to {region}" heading with everything else (other regions +
  NULL) under "Other producers". A wrong region guess therefore never
  hides the right producer, it just ranks it lower. An empty query WITH a
  region returns that region's first 30 producers alphabetically — this is
  what makes the dropdown show real options the instant it opens (the
  combobox skips its debounce for the empty query); an empty query without
  a region returns nothing (type-to-search as before). `SearchableCombobox`
  supports this via an optional `group` label on results (no group → flat
  list, so the appellation field is untouched) and an `emptyQueryHint`
  line. The answer-key forms (`add-wine/by-hand-form.tsx`,
  `wine/wine-identity-fields.tsx`) wrap `searchProducers` in a
  `searchProducersGrouped` helper with those two labels; the guess ladder
  (`play/guess-ladder.tsx`) builds its own region-scoped groups and labels the
  rest "Everything else". A new producer is created through
  `find_or_create_producer` (a name that folds equal to an existing producer,
  or to a curated alternative name, reuses that row; the region is optional).
  Producer name stays
  globally unique (no change to that constraint) — region_id is an additive
  scoping hint, not a re-keying of the dedup identity. After running the
  backfill, 32,088 of 33,741 producers ended up linked; the ~1,650 left NULL
  are overwhelmingly the predicted ambiguous ones plus a handful of
  historical duplicates (e.g. a host once typed "Château Pétrus" as a new
  producer via the inline-create combobox, which exact-name-matches nothing
  and became a separate row from LWIN's already-linked plain "Petrus") —
  spot-checked against real usage and only 3 of the ~1,650 are actually
  referenced by an entered wine, so this wasn't worth chasing further.
- The tasting page's Participants card is rich, not a bare name list: each
  row links to the person's profile and shows their avatar (initial-circle
  fallback), a location info line, and a cross-tasting stats
  line ("N tastings · X.X avg") fetched via `getBulkProfileSummaries` —
  the batched helper, per its own rule about many-people stat surfaces.
  **Reversed** (spec §1.4 row 20): every row no longer shows a uniform Host
  badge plus a status pill regardless of that participant's status. Joined
  and Invited participants are listed individually and counted; Declined
  collapses to a single "{n} declined" summary line instead of a row each
  (`participantsSummary`'s `declinedLine`). The host's row still carries a
  "Host" badge and an In/Invited status badge when someone ELSE is viewing
  it, same as any other row — but when the viewer IS the host, their own row
  drops both: the name and badge become the single label "You · host"
  (`isViewerRow` in `participants-card.tsx`), and no status badge is shown
  next to it, since the label already says it.
- The guess ladder tells the taster up front that any field can be skipped.
  Its intro line, under "What is in glass N?", is "Each row saves as you
  answer it. Skip anything you cannot call." (`INTRO_SENTENCE` in
  `play/ladder-copy.ts`, pinned by `ladder-copy.test.ts`). The old "How
  scoring works" link and its "Every field is optional" line went away in
  the 2026-09-12 flows redesign. This is informational only: guess fields
  were always optional server-side, and nothing about validation changed
  (`lockGuess` locks a blank row, which scores 0).
  Producer stays REQUIRED on the add-wine answer key on purpose (briefly
  made optional, then reverted per the user: optional applies to guessing
  only, and guessing already was).
- Every value in the guess form must be React state, never an uncontrolled
  input with `defaultValue`: the play page's AutoRefresh polls
  `router.refresh()` every few seconds, and while client component STATE
  survives that, an uncontrolled input's DOM-only value gets wiped by the
  re-render. The vintage year/tawny fields were the one uncontrolled pair
  and users had to "type the vintage last" — now controlled like the rest.
  (The add-wine sheet's by-hand form, `add-wine/by-hand-form.tsx`, is
  controlled the same way: the vintage year is `value={yearShown}` and the
  tawny age is a controlled Select. It has to be, because
  `tastings/[id]/wines/new` now just redirects to the tasting page with
  `?addWine=byhand`, and that page's running and guest-lobby views mount
  AutoRefresh.)
- Wines are editable after being added. The legacy `WineForm`/`wine-form.tsx`
  page is gone (add-wine v2): the lobby's Edit button opens the add-wine
  sheet's by-hand form on that glass (`edit: { wineId }` →
  `openAddWineSheet`, `wine-flight-list.tsx`), prefilled from its answer key
  or its incomplete-glass draft; `/tastings/[id]/wines/[wineId]/edit`
  (`wines/[wineId]/edit/page.tsx`) is now only a legacy redirect into
  `?editWine=<id>`, which the sheet picks up. **Reversed / finalized** (spec
  §1.4 row 11; blind-tasting v3 M6,
  `20260914095500_flight_edits_until_first_step.sql`; pure rules module
  `src/lib/flight-glass-rules.ts`; supersedes the earlier "being reworked"
  note here): who can edit is still whoever added the wine — the host for a
  host-added glass, the contributing participant for their own BYO bottle —
  but that is now tracked by `wines.added_by_host` (a boolean fixed at
  insert by the `wines_pin_adder` trigger: true exactly when the glass was
  inserted with no contributor, and never changed by nulling or deleting a
  contributor's participant row afterwards) rather than by
  `contributor_participant_id is null`, which could drift. `is_wine_adder`
  keys off `added_by_host` accordingly. `glassEditRefusal`
  (`flight-glass-rules.ts`) mirrors the database's `can_edit_flight_glass`:
  a glass is editable while the tasting is not CLOSED, the glass is not
  revealed, AND the glass is incomplete OR its reveal hasn't started
  (`reveal_step === 0`) — in both DRAFT and IN_PROGRESS, so Edit stays
  reachable after Start (`wines-card.tsx`'s `getEditableWineIds` computes it
  this way for the running page's host/contributor Wines card). Swap
  (re-pointing a glass's answer key without changing its position) and
  Remove now have the SAME database rules as Edit
  (`glassSwapRefusal`/`glassRemoveRefusal`, `can_edit_flight_glass` reused
  for Swap, `can_remove_flight_glass`), plus a semi-blind flight is fixed
  from Start (`semiBlindFlightFixed`/`wines_semi_blind_flight_locked` —
  Edit alone still works, per the semi-blind snapshot rule above) and Remove
  also refuses once any LATER glass has been revealed or mid-step
  (`glassRemoveRefusal`'s `laterGlassSeen`). The `remove_flight_glass` RPC
  (deletes and renumbers in one transaction) and `set_flight_glass_added_via`
  RPC (Swap's provenance write) exist and back these rules today, but their
  UI is not fully wired up yet: the lobby's existing Remove button
  (`removeWine` in `actions.ts`) and the create sheet's per-row ✕ already
  call `remove_flight_glass` under these post-Start rules, and
  `move_flight_glass` (reorder; `flight-actions.ts`'s `moveFlightGlass`)
  likewise refuses after Start whenever a move would renumber a glass the
  table has already seen — but a "Swap" action and a one-glass detail view
  reachable from the running page's Wines card (`Edit → Swap / Remove`,
  BT-L3/BT-R5) are still pending, behind the add-wine phone verification
  pass; don't assume that UI exists yet. `tastings_lock_setup_after_start`
  (same migration) is the setup lock: `reveal_mode`, `timing_mode` and
  `wine_source` can no longer change once a tasting has started, in the
  database as well as the app (see "Tasting lifecycle", above). M6 first cut
  client UPDATE on `wines` down to just `position` and `added_via`
  (`authenticated`-only column grant); a later fix,
  `20260914125500_wines_client_update_lockdown.sql`, revoked even that once
  `moveWine`/`removeWine`'s direct `wines` writes were fully retired in
  favour of the RPCs — no client role (`anon`, `authenticated`, `PUBLIC`)
  holds UPDATE on any `wines` column any more. Every `wines` write a client
  can still cause goes through `move_flight_glass`, `remove_flight_glass` or
  `set_flight_glass_added_via` (position/added_via), `reveal_wine`/
  `reveal_next_category` (`is_revealed`/`reveal_step`, scoring only), or the
  add path's own INSERT (`tasting-wine-writes.ts`'s `insertGlassRow`, pinned
  by `wines_pin_adder`) and its undo DELETE.
- **Overview / About / Your numbers (2026-09 redesign).** `/overview` is the
  logged-in landing page (`/` redirects there): live/next-up banner, then
  three equal subject cards in a fixed order — Blind tastings → Your ratings
  → Your cellar — then the "More than a score" photo band into `/about`.
  `/taste` stays the Taste pillar page but is only the Start-tasting menu +
  the Invited/Hosting/Attending/History tabs (the old marketing hero,
  explainer cards and mission copy moved to `/about`, which is information-
  only: the back link is its sole interactive element). `/profile/numbers`
  is the personal stats page and is deliberately NOT a nav pillar — it is
  reached from the sidebar's (and the phone drawer's) footer profile block,
  which always lists "Your numbers" / "Profile & settings" under the profile
  row (owner, 2026-09-14: the top bar's Your numbers pill was removed). Spec + plan:
  `docs/superpowers/specs/2026-09-11-overview-about-numbers-design.md`; the
  Claude Design handoff (README + `Blindr Front Page v3.dc.html`) is the
  visual source of truth.
  - Shared primitives live in `src/components/overview/` (SubjectCard /
    CardRow, LinkPill, StatTrio, DistributionBar, AccuracyRows, ColumnChart /
    StackedColumnChart, AboutBand, Eyebrow, HatchThumb, ActionButton /
    ActionButtonClient, LiveDot, RangeControl). Chart series order is fixed
    bordeaux → rose → gold → ink-muted; it was validated for colour-vision
    separation in that order — never reorder or cycle it, and always keep
    the legend row (gold's contrast relies on it).
  - Tokens added to `globals.css` for the handoff palette: `--rose`,
    `--gold-light`, `--gold-dark`, `--live`, `--border-light`,
    `--border-strong`, `--ink-photo`, `--ink-caption`, `--placeholder`,
    `--placeholder-soft`, `--chart-oldest`, plus the `.hatch` empty-image
    utility and the `live-ping` keyframes (dropped under reduced motion).
  - Data: `src/lib/overview-data.ts` (`getOverviewData(userId)`) and
    `src/lib/your-numbers.ts` (`getYourNumbers(userId, range)`), with pure,
    vitest-covered maths in `overview-math.ts`, `your-numbers-math.ts` and
    `stats-math.ts` and the contracts in `overview-types.ts` /
    `your-numbers-types.ts`. Everything is RLS-readable as the viewer or
    comes from `get_tasting_leaderboard` / `get_wine_reveal`; tasting stats
    follow `profile-stats.ts`'s fully-revealed-wines rule. No migrations.
  - Metrics deliberately changed from the mockup (schema can't back them):
    no "WSET notes vs quick rating" split (every rating IS a WSET note, so
    the third ratings stat is total notes); "Vintage ±1", not ±2 (matches the
    off-by-one scoring rule); no "Poured into tastings" (consumptions don't
    record the tasting); semi-blind guesses (0/1 scale) are excluded from
    "Where you taste best". On Your numbers the cellar Distributions /
    Vintages cards describe current holdings and ignore the range (their
    eyebrow says so); the "Added / Opened this year" footer sums the
    calendar year even under All time. `range` lives in the URL
    (`?range=year|90d`, all-time is the bare path).
  - Live banner = an IN_PROGRESS tasting I'm JOINED in (LIVE timing
    preferred); next-up = the soonest DRAFT I host or joined; otherwise a
    single "No tasting on the calendar" row — never an empty bordeaux block.
  - The sidebar collapses to a 60px icon rail between `md` and `xl`; its
    expand button opens the full sidebar as an overlay drawer that closes on
    backdrop, X, Escape or navigation. Below `md` MobileNav is unchanged.
  - `LocalDateTime` now uses `useSyncExternalStore` (server snapshot "" →
    "Scheduled", client snapshot the local text) so hard-loaded pages no
    longer stay on "Scheduled" — the old lazy `useState` initialiser never
    re-rendered after hydration.
  - Dev/verification gotchas: a folder starting with `_` under `src/app` is
    private (no route) — a `_dev` preview page silently 404s. The seeded demo
    accounts (`demo.*@blindr.invalid`) currently have no `profiles` rows and
    no data, so they only exercise empty states; a signed-in preview session
    can be minted without typing a password via `auth.admin.generateLink`
    (magiclink) + `verifyOtp` and opening `/auth/confirm-hash?next=…#access_token=…`
    — and right after that hash login the first client-side navigation can
    throw "useAddWine must be used within <AddWineProvider>" once (stale
    logged-out shell); a reload clears it.
  - **Phone layout revision (2026-09-12, owner: "the front page on the phone
    doesn't look that great").** Below `md` the Overview no longer squeezes the
    banner and three cards onto one screen; the column scrolls and each card
    takes its natural height with exactly one content row. The three card
    actions are replaced on phones by one row of tiles under the banner
    (`overview/quick-actions.tsx`: Taste blind · Rate a wine · Add a bottle,
    sharing `useActionLauncher` with `ActionButtonClient`; the Taste-blind tile
    is gold except when the banner is the "No tasting on the calendar" row,
    which already carries a gold Start). `SubjectCard` takes
    `hideActionOnPhone`; `StatTrio` spreads into three equal columns on phones;
    the Next-up banner gains a phone meta line ("You're hosting · 3 glasses so
    far", `overview/next-up-meta.ts`) and its add button reads "Add a wine";
    the header's Numbers pill was icon-only below `md` (since removed from the
    header everywhere). Tablet and desktop are
    unchanged.
- **Add-wine sheet, create-tasting sheet, guess ladder, host console
  (2026-09 flows redesign).** Spec + plan:
  `docs/superpowers/specs/2026-09-12-add-wine-sheet-and-tasting-flow-design.md`
  and `docs/superpowers/plans/2026-09-12-add-wine-sheet-and-tasting-flow.md`;
  the Claude Design handoff (`design_handoff_blindr_flows/`, screens 6a–6i
  and 7a–7i) is the visual source of truth.
  - **One add-wine sheet** (`src/components/add-wine/`, rebuilt by the
    add-wine v2 rewrite — spec
    `docs/superpowers/specs/2026-09-12-add-wine-v2-scan-and-flow-fixes-design.md`,
    plan `docs/superpowers/plans/2026-09-12-add-wine-v2-scan-and-flow-fixes.md`,
    ledger `.superpowers/add-wine-v2/decisions.md`) replaced the catalog,
    cellar and tasting add-wine modals plus the scan and bulk-scan modals.
    Open it with
    `useAddWine().openAddWineSheet(destination, { start, onAdded })` —
    `AddWineDestination | null`: `{ kind: "flight" }` / `{ kind: "cellar" }` /
    `{ kind: "catalog" }` / `{ kind: "note" }` (Taste & rate: one wine, then
    its WSET note opens) / `null` (the header camera with no context: after
    the read it asks where the bottle goes, offering "tonight's flight" when
    a live or next-up tasting registered itself via `registerFlightHint` —
    D12: never silently into a hinted flight). Every destination-dependent
    string and rule — header, chips, search groups, row actions, upload
    copy, footers, confirm and by-hand copy, partial-read and follow-up
    behaviour — comes from one lookup, `sheetMatrix(destination, canScan)`
    in `matrix.ts`; views read the matrix and never branch on the
    destination themselves. `canScan` (`use-can-scan.ts`, `detectCanScan`)
    is a coarse pointer AND a video input, never a user-agent sniff — not a
    touch/width split; `NEXT_PUBLIC_FORCE_CAN_SCAN=1` forces it true outside
    production, for the Browser pane's phone emulation (no real camera).
    `canScan === true` opens on the live camera (`use-camera.ts`,
    `getUserMedia` with a file-input fallback); otherwise the search-led
    desktop view with the upload zone, which stays open after every add
    until Done. "Add it by hand" writes a catalog wine first and then adds
    it. Cellar rows add as `{ kind: "lot", consume: true }` (drawn down at
    Start/add — D11 below); the create sheet's flight-step inline search
    adds catalog rows without consuming. A photo whose vintage can't be
    read becomes a pending "Fix" row that opens the by-hand form with that
    field empty, focused and flagged "did not read — required" (the round-1
    year/NV strip, `pending-fix.tsx`, is removed).
  - **The label reader.** `readLabelPhoto` (`src/app/scan/actions.ts`) calls
    `readLabel` (`src/lib/label-scan/extract.ts`) — FastCork is gone. One
    photo is one Claude Sonnet 5 (`claude-sonnet-5`) request via the
    official SDK's `messages.parse`, structured output, `effort: "low"`, no
    tools, no web search, no batch, about $0.01/scan. Every billed call — a
    good read, "not a label", or a billed failure (a refusal, a max_tokens
    stop, an unparsed output) — is kept in `label_reads` (owner-only RLS;
    only the staging image path, never the bytes; `outcome` is `ok` /
    `not-a-label` / `not-read`). `LABEL_READ_FIXTURE` (dev only,
    `src/lib/label-scan/fixture.ts`) replays a stored `LabelRead` JSON file
    instead of calling the API, checked before the SDK client is
    constructed. `resolveLabelRead` → `missingWineFields` →
    `findConfidentMatch` → an explicit confirm screen; nothing is ever
    auto-added.
  - **One catalog text: `description` ("About this wine")** (owner,
    2026-09-19). The FastCork-era profile columns on `catalog_wines` —
    `winery_description`, `aroma`, `tasting_notes`, `food_pairing`,
    `serving_temp_min_c`/`_max_c`, `decant_minutes` — are retired from the
    app: kept in the database (and `database.types.ts`) but nothing in `src/`
    reads or writes them (`scripts/backfill-fastcork-profile.mjs` is
    historical). The catalog page shows `description` under "About this wine"
    for every wine that has one, edited as "About this wine" in Manage wine,
    the cellar form and the add-wine sheet's by-hand form, and written by the label reader under its
    `description` rules (`label-read-schema.ts`: 2-4 factual reference
    sentences, no praise, no pairings, short when little is known).
    `alcohol_percent` stays — the label reader reads it off the label.
  - **The wine-identity module** (`src/lib/wine-identity/`) is the only
    definition of a complete wine (D2): `COMPLETE_WINE_FIELDS` in
    `complete.ts` — producer, vintage, colour, style, country, region,
    appellation, primary grape — deliberately WITHOUT wine name (D3: optional
    everywhere). No "is it complete" logic exists outside this module; every
    server refusal is `"This wine " + describeMissing(missing) + "."`. One
    server write path, `src/lib/wine-identity/server/write.ts`
    (`prepareCompleteWine` / `prepareUnidentifiedWine` / `upsertCatalogWine`),
    is the only place a draft becomes catalog rows — the flight, cellar,
    catalog and note paths all go through it, so completeness and producer/
    grape resolution can never drift between them.
  - **D11: cellar draw-down at the pour.** The adder's intent to pour their
    own cellar bottle lives in the owner-only `wine_pour_intents` table
    (`wine_id` PK, `cellar_lot_id`, `consume_on_start`,
    `cellar_consumption_id`) — deliberately never on `wines`, which every
    host and participant can read; a lot id there would name a hidden glass
    through a PUBLIC/FRIENDS cellar. A glass added to a DRAFT flight just
    records the intent; Start draws every flagged lot down
    (`draw_down_flight_cellar_lots`, DRANK, occasion = the tasting name); a
    glass added to a RUNNING flight is poured at once
    (`pour_cellar_lot_into_glass`). Both are idempotent and only ever pour
    the adder's own lot.
  - **D7: incomplete glasses.** "Save · glass N" needs a complete wine;
    "Leave it for later" adds the glass anyway — a `wines` row plus an
    owner-only `wine_identity_drafts` row (`wine_id` PK, `draft` jsonb,
    `missing` text[]), no `wine_answers` until it is finished. The flight
    list shows the adder "needs a vintage — tap Edit to finish" in dark
    gold. Start does NOT refuse an incomplete flight — it warns
    (`startWarning` in `src/lib/wine-identity/incomplete.ts`; "Glass 3 still
    needs a vintage — finish it before you reveal it." under the Start
    button, nothing blocks the tap). Revealing an incomplete glass IS still
    refused (`revealRefusal`, same file).
    `tasting_incomplete_glasses(tasting_id)` is the RPC both read from.
  - **Create-tasting sheet** (`src/components/new-tasting-sheet.tsx`,
    launched by `TasteLauncherProvider`; `/tastings/new` renders the same
    sheet): step 1 setup with the mode as a control (Blind / Semi-blind /
    Taste & rate shown as "Soon"), timing, wine source and a rules
    disclosure; step 2 the flight (inline search on desktop, shortcut chips
    that open the add-wine sheet with the flight destination); step 3
    invites (friend chips, an email field, the share link) and Start. The
    tasting row is created at the end of step 1 (`createTasting` returns
    `{ id }`); later setup saves go through `updateTastingSetup`, so going
    back to change the mode keeps the wines. Escape with the add-wine sheet
    stacked on top closes only the top sheet (the create sheet ignores an
    Escape while more than one `dialog-content` is mounted).
  - **Join codes.** `tastings.join_code` + `ensure_join_code(tasting_id)`
    (host-only) mints a code, 10 characters from a 32-letter alphabet as of
    M4 (`generate_join_code`'s loop bound raised 6 → 10, ~50 bits; the
    already-shared 6-character codes keep working). **Reversed** (spec §1.4
    row 3; M4, `20260914093500_join_preview_and_late_join.sql`; ledger B3/B4,
    owner defaults Q3/Q6): opening `/j/[code]` no longer joins silently —
    every visitor first gets `get_join_preview(code)` (the only
    anon-callable function this adds): no row means an unknown code; a
    CLOSED tasting gets its own "finished" message; a signed-in member
    (host, JOINED or INVITED — `viewer_tasting_id` is set) is sent straight
    to the tasting. Anyone else — signed out, or signed in and not a member,
    a DECLINED guest coming back included — gets `JoinPreview`
    (`join-preview.tsx`): signed out, a reduced preview (name, host display
    name and avatar, time, mode, timing, pacing, glass count, status — never
    `tasting_places`, the description, the cover photo, or any wine beyond a
    count); signed in, the same plus the host record
    (`host_tastings_count`) and the JOINED names, and an explicit "I am in"
    button that then calls `join_tasting_by_code(code)` (SECURITY DEFINER;
    inserts JOINED or flips INVITED → JOINED, keeping any existing
    `joined_at`). That RPC refuses only a CLOSED tasting now — not a started
    non-OPEN one — so people join by link before OR after Start (Q6); a late
    joiner is eligible for every glass not yet revealed (see the leave guard
    below). `joined_at` is trigger-owned end to end: stamped once,
    the first time a row becomes JOINED, and never moved after — neither a
    participant nor the host (who can otherwise write
    `tasting_participants.status`/`.joined_at` directly) can turn a glass
    into, or out of, "joined after" by replaying JOINED → DECLINED → JOINED.
    The same migration adds the leave guard: once a tasting has started (its
    status is not DRAFT, or M3's `started_at` is set — a status test alone
    would let a host reset a running tasting to DRAFT and take a guest out),
    no signed-in caller — the host included — moves a JOINED row out of
    JOINED or deletes it; only deleting the tasting itself (cascade) removes
    such a row. Signed-out visitors who tap "Sign in to say yes" go through
    `/login?next=/j/<code>` (and `/signup?next=…`, whose confirmation link
    carries `next` into `/auth/callback`), validated by `safeNext` in
    `src/lib/safe-next.ts`.
  - **Start lands on the host console** for LIVE + BLIND + HOST_PROVIDES
    tastings only (`startLandsOnConsole` in
    `src/lib/tasting-lifecycle-copy.ts`; `/tastings/[id]/host`) — both from
    the sheet's step 3 and from the lobby's HostControls; a bring-your-own
    host competes for the other glasses and lands on the lobby instead
    (reveal-5). **Reversed** (spec §1.4 row 9): a LIVE semi-blind
    host-provides tasting lands on the console too now, alongside blind —
    only OPEN tastings are left on the lobby. `/tastings/[id]/host` itself
    also redirects a non-host, and a LIVE-only console reached any other way
    (a DRAFT tasting, or a non-LIVE one), back to the lobby (owner decision
    OD-5, 2026-09-14: "the console only ever makes sense for a LIVE
    tasting"). The console's reveal-in-order chips call
    `reveal_next_category(p_wine_id, p_expected_step)` (compare-and-set, so
    two taps can't skip a step). **Reversed** (spec §1.4 row 17): "Reveal
    everything" no longer runs `reveal_wine` gated by a plain
    `window.confirm` popup — it's an inline two-tap in the button itself
    ("Tap again to reveal
    everything", `console-copy.ts`'s two-tap helper, `TWO_TAP_WINDOW_MS`);
    End tasting is the one control in this area that keeps its
    `window.confirm` (`endTastingConfirm`, spec §19.2). Standings and the
    "this glass" facts come from `get_tasting_leaderboard` +
    `get_wine_reveal` (spoiler-safe: only categories ≤ `reveal_step` are
    returned). **Reversed** (spec §1.4 row 4; ledger B6, owner default Q1) —
    **Pause and the pour pointer.** The host console used to have neither a
    pause control nor a way to skip a glass, on purpose; that changed. M7
    (`20260914100500_tasting_pacing.sql`)
    adds `tastings.paused_at` (host-only write, through the live "tastings
    update host" policy; `tastings_pause_follows_status` clears it the
    moment the tasting stops being LIVE + IN_PROGRESS — Pause exists only
    for a running LIVE tasting, Q1) and `tastings.current_wine_id`, the pour
    pointer (the glass being poured; `tastings_pointer_in_tasting` pins it
    to a glass of the same tasting). `wines_refuse_reveal_while_paused`
    refuses every reveal write — `reveal_next_category`, `reveal_wine`, or
    any direct write — on a paused tasting's glass, without recreating a
    scoring function. The host's server actions
    (`src/app/tastings/[id]/pacing-actions.ts`): `setTastingPaused` (LIVE +
    IN_PROGRESS only) and `skipToGlass` ("Skip to glass N →", a
    compare-and-set write of `current_wine_id` via `src/lib/pacing-guards.ts`'s
    `skipPlan`). The pointer itself is read through `src/lib/pour-pointer.ts`'s
    `currentGlass` (see "One wine at a time" pacing, above) — reveals never
    rewrite it directly; only Skip does. `get_tasting_leaderboard` (same
    migration) tries the pointer's glass for "+N last round" ahead of its
    other picks — see the leaderboard sidebar bullet, above.
  - **Guess ladder** (`play/guess-ladder.tsx`, `field-picker.tsx`,
    `guess-ladder-math.ts`, `grape-shortlist.ts`, `play/guesser.ts`): one row
    per field with its points. **Reversed** (spec §1.4 row 10): each pick no
    longer autosaves the complete row through a `submitGuess` full-row
    replace — `submitGuess` is gone. `saveGuessFields` (`play/actions.ts`)
    autosaves only the picked `GuessFieldGroup`, one save queue per group
    (`play/guess-save-queue.ts`), so a failed save reverts just that group on
    screen instead of the whole ladder; the server validates the group's
    shape again (`groupPayload`) rather than trusting the client's. Readiness
    is `guesses.locked_at` (`lockGuess`/`unlockGuess`; `tasting_guess_status`
    returns `locked`), and `score_own_guess` + the ASYNC auto-reveal run only
    on lock. Locking is a readiness signal, not a gate: the host can reveal
    early and `reveal_wine` scores whatever is saved (a taster with no row
    locks a blank one so "N of M locked" can reach everyone). A locked row's
    answers are pinned at the database too, not just the app (M8
    `guesses_refuse_locked_edit` — see above). **Reversed** (spec §1.4 row
    12): pickers are keep-mounted, but the container differs by width —
    phone gets a bottom sheet (a centred 480px dialog), laptop a popover
    anchored to its own row (`presentation="popover"` in `field-picker.tsx`)
    — both with synchronous focus on the search field, auto-advance to the
    next field on pick, and Escape returning focus to the row. **Reversed**
    (spec §1.4 row 21): the grape shortlist heading reads "Common grapes in
    {region}" (`shortlistHeading` in `play/ladder-copy.ts`, replacing "Grown
    in {region}"); producers still group under "Specific to {region}" the
    same way the answer-key form's producer field does. Vintage is one of
    the six always-shown rows: its picker lists years (next year down to
    1900), with NV and tawny (preset ages or "Other age…") as further
    groups in that same picker; "More" holds only secondary grape and type
    designation. **Reversed** (spec §1.4 row 7):
    semi-blind is no longer one big matching pass locked together as a
    single batch — `play/match-board.tsx` (per-glass autosave/swap/lock;
    see `reveal_mode` above). **Reversed** (spec §1.4 row 5; ledger B8): a
    taster MAY write a
    WSET note on a glass that is still hidden or locked — see "Hidden-glass
    notes" below.
  - **Reveal for participants.** `RevealView` (6g) renders while a glass is
    partially revealed ("The country was France · You said Italy · 0 pts",
    hidden rows say "still hidden"); once fully revealed the classic
    revealed card with the per-category breakdown takes over and the next
    glass opens. `locked-in.tsx` is the waiting state ("N of M locked in",
    what you said, Change it, a `#standings` link — the lobby's standings
    aside carries that id). `note-this-glass.tsx` mounts here too (phone and
    laptop layouts) — see "Hidden-glass notes" below.
  - **Hidden-glass notes** (blind-tasting v3 M5,
    `20260914094500_hidden_glass_notes.sql`; ledger B8; reverses the old
    rule that no note could be written on a hidden or locked glass at all).
    A taster may write a
    private WSET note on a glass that is still hidden, locked or not
    (`note-this-glass.tsx`'s "Note this glass" entry point, mounted in
    `locked-in.tsx`'s waiting card on both widths and as a plain link under
    the lock button in `guess-ladder.tsx`); it is identity-less until the
    reveal. `wset_notes_one_identity` admits a BLIND note tied to a glass
    (`tasting_wine_id`) with neither `catalog_wine_id` nor
    `unidentified_wine_id` set, and such a note is readable by its author
    only (the read policy admits an identity-less note on a plain
    `author_id = auth.uid()`; only writing one — the insert, or an update
    while its glass is still hidden — also gates on `can_note_tasting_wine`:
    the host or a JOINED participant of that glass's tasting). The identity
    arrives inside the reveal's own
    transaction: `wset_notes_resolve_on_reveal` (`AFTER UPDATE OF
    is_revealed` on `wines`) copies the glass's now-public identity onto
    every note still attached to it, whichever path flipped `is_revealed`
    (`reveal_wine`, the last `reveal_next_category` step, or the ASYNC
    auto-reveal — never `score_own_guess`, which does not set
    `is_revealed`, so an ASYNC IMMEDIATE guesser's own note stays hidden
    until the glass is revealed for everyone). A note attached to a glass
    that is removed is deleted with it (a BEFORE DELETE trigger on `wines`
    clears any note still unresolved on that glass). `save_wset_note` never
    removes an identity a note already has — its update only ever sets
    `catalog_wine_id`/`unidentified_wine_id` from the payload while the
    note has neither. Its insert writes both straight from the payload
    (the note editor sends only `catalog_wine_id`); the insert/update
    policies, not the RPC, are what refuse an identity on an unrevealed
    glass. After that, `wset_notes_resolve_on_reveal` (at the reveal),
    `wset_notes_glass_resolve_on_write` (BEFORE INSERT OR UPDATE OF
    `tasting_wine_id`: an identity-less note written onto an
    already-revealed glass takes that glass's identity) and
    `resolve_unidentified_wine` set a note's identity.
    `wset_notes_glass_move_guard`
    (BEFORE UPDATE OF `tasting_wine_id`) refuses moving a note onto a glass
    the mover may not note, since RLS alone cannot see the note's old glass
    to compare against. Rule 1 holds end to end: no note carries an identity
    for an unrevealed glass, whoever writes it — the host, a contributor, a
    guesser, or a crafted `?blindWine=` link.
  - **RLS / migration notes** (`20260911100000_guess_lock_and_join_code.sql`,
    live-applied with same-transaction assertions): the `wine_answers read`
    policy was recreated WITH the SEMI_BLIND participant clause — the live
    DB had lost it in an earlier recreate, which silently broke semi-blind
    candidate lists at the time. **Reversed since** (spec §1.4 row 8; M9b,
    `20260914103500_semi_blind_lockdown.sql`): that clause is gone for good —
    the semi-blind candidate list now comes only from
    `get_semi_blind_candidates`, never from `wine_answers` RLS. The policy's
    live shape is `has_scored_guess(wine_id)` OR (the glass's host is
    `auth.uid()` AND `w.added_by_host` — narrowed from a bare
    `t.host_id = auth.uid()`, so a host reads only the answer keys of
    glasses they themselves added, not a bring-your-own contributor's) OR
    `w.is_revealed` OR the glass's contributor is `auth.uid()`. Any future
    recreate of `wine_answers read` must keep `has_scored_guess`, the
    `added_by_host` host clause, the revealed gate and the contributor
    clause — and must never again admit a plain SEMI_BLIND participant, the
    clause this reversal removed for good.
  - **Producer lookup order.** `find_producer_by_folded_name(p_name,
    p_region_id)` (SECURITY INVOKER) orders candidates whose names fold
    equal by: 1) the given region; 2) the exact spelling (case/whitespace
    aside); 3) a producer that holds wines (a `catalog_wines` or
    `wine_answers` row, read under the caller's RLS); 4) any region link; 5)
    name, then id (`20260914112500_producer_lookup_exact_then_wines.sql`,
    recreated from `20260912101530`'s ORDER BY with only the ranking
    changed — under-labeling beats mislabeling, so the exact spelling beats
    a copy that merely holds more wines). `producer_aliases`
    (`20260914113500_producer_aliases.sql`) is the fallback, tried only when
    no producer row folds equal to the read: a curated table of alternative
    names → producer id (`alias_folded` unique, read-only RLS, written only
    by migration) — e.g. "Borges Porto" → Sociedade dos Vinhos Borges. A
    producer row always beats an alias, and region never orders the alias
    half.
  - **Resolver: an unprinted region yields to the producer link; other
    vintages, then one follow-up lookup, fill the appellation**
    (`src/lib/wine-identity/resolve.ts`,
    `src/lib/wine-identity/appellation-follow-up.ts`; owner fixes A/B/C
    2026-09-19 after a Tridente scan — front label "TRIDENTE TEMPRANILLO",
    model guessed Castilla-La Mancha — came back with no region or
    appellation; owner: "9999/10000 bottles should scan perfectly"; spec
    `docs/superpowers/specs/2026-09-19-scan-region-appellation.md`;
    supersedes owner approval 3's blanking). **A.** A read with no
    appellation text takes its region from its region field (step 5). That
    region counts as *printed* only when the label's own rawText names it as
    whole words (the read's text, the stored name, or a `REGION_SYNONYMS`
    spelling — `regionNamedOnLabel`, `regionSynonymsOf`). When the resolved
    producer links to another region of the same country, an unprinted
    region is replaced by the link (`producer-region`); a printed one is
    kept. An unprinted region the link agrees with keeps its value but is
    marked `producer-region` too. Nothing is blanked any more. Step 7.5's
    self-named appellation still needs `provenance.region === "label"` and
    the stored region name in rawText. **B.** Step 7.6 runs only when the
    appellation is still missing, the producer is an existing row, and the
    read has a wine name and a colour. Appellation text the read carried but
    step 4 could not place blocks it, unless that text names the siblings'
    appellation as whole words (`appellationTextNames`). It reads the
    producer's catalog wines through `catalogWinesOfProducer` (the caller's
    RLS, never merged, never `blind_pending`, 200 at most; a capped or failed
    read fills nothing); the wines with the same folded name, colour, style
    (when read) and resolved primary grape (when read) must ALL name one
    appellation, taken with its region and country as `catalog-sibling`
    unless it contradicts a printed region or the draft's country. Never from
    the producer alone. **C.** `readLabelPhoto` then makes at most ONE billed
    text-only follow-up (`lookupAppellation`: claude-sonnet-5, effort low,
    max_tokens 1024, 8 s timeout plus an AbortSignal, no retries, no tools;
    ~$0.001–0.003, worst ~$0.015). It runs only when the appellation is still
    missing, the read is not no-GI, the region is printed or from the
    producer link or other vintages (never one the model only guessed), there
    is a producer or a wine name, the region holds 1–300 appellations
    (Bourgogne's 1,364 skip it), and the read was kept (`readId`). It must
    pick one NAME from our own list for that region; an answer that folds to
    no entry, or to more than one, is discarded. Provenance `lookup`: the
    confirm screen adds a muted "Appellation looked up — it is not on the
    label" line, READ OK becomes CHECK THE READ, and By hand shows "looked
    up" / "from other vintages" chips. Any follow-up failure leaves the draft
    as the resolver made it; the scan never fails because of it. Every billed
    follow-up is kept in the owner-only, append-only `label_lookups`
    (`20260919214700`, applied live 2026-09-19 before the app deploy — it must
    always exist before any code that calls `keepLookup`, which only logs a
    failed insert): one row per `label_reads` row, `ON DELETE CASCADE`, so the
    account scrub removes it with no function change; the scan quota,
    `attach_catalog_wine_photo` and the replay fixtures never see it.
    `LABEL_LOOKUP_FIXTURE` (dev only) is checked before any SDK client exists;
    with `LABEL_READ_FIXTURE` set and no lookup fixture, no follow-up is made
    at all. A curated appellation synonym
    (`APPELLATION_SYNONYMS` / `curatedAppellationName` in
    `src/lib/label-scan/region-canonical.ts`) is tried only when no
    reference row agreed with the read's own appellation text, and only
    inside the region the read itself named — e.g. three Ningxia spellings
    map to the "Ningxia" appellation. It is a curated lookup table, never a
    heuristic.
  - **"Don't add it"** (plan amendment 18, D17): the cellar lot step's merge
    card ("You already have this wine in your cellar.") gets a third,
    quieter action beside "Add N to the existing lot" / "Keep as a separate
    lot" — `onSkip` → the `lotSkipped` reducer action. It writes nothing (no
    lot, no quantity change, no catalog write). A single add returns to
    where the add started (the camera, the phone search view, or the
    desktop view) with "Not added — it's already in your cellar" and an
    "Open it" link (`SkippedLotNotice`, `state.skippedLot`); in a multi-add
    that bottle's row just leaves the stack with the same line. Opened from
    a cellar lot row's own "+1 bottle" (`initialLot`) the merge card never
    shows, so nothing changes there.
  - **Reducer rules that matter to future work** (`sheet-state.ts`, plan
    amendments 20 and 23 — read before touching the reducer):
    - **A finished read keeps its turn** (`confirmQueue`). With Many off, a
      finished read (or a failed scan) opens its confirm only when a home
      view or that bottle's own reading view is on screen; otherwise it
      waits in `confirmQueue`, oldest first. A turn ends only when the user
      acts on THAT bottle (its confirm, `lotSkipped`, or an `itemAdded` /
      `itemAddFailed` naming its id) — opening by hand, the lot step or the
      chooser from its confirm keeps the turn. Landing on a home view always
      opens the oldest waiting read next.
    - **A stale server reply never acts** (`flow`, `ReplyTicket`,
      `replyIsCurrent`). Every action that waits on the server carries the
      ticket it started with (`ticketFor`: the sheet's `flow` counter plus
      the bottle in hand and the view); `flow` increments on every user step
      that moves or closes the sheet, never on a background step. A reply
      whose ticket no longer matches is still recorded (the row keeps its
      "added" status or its error), but never navigates, closes the sheet,
      or opens the note.
    - **The close rule and warnings.** `shouldCloseAfterSingleAdd` only ever
      auto-closes a PHONE (`canScan === true`), single-add (`!multi`), home
      view, nothing-left session. A server warning ("Added — but …") always
      keeps the sheet open regardless, until the user taps Done.
    - **A note pick asks before dropping work** (`notePicked`, an accepted
      deviation from the old flows spec's "the sheet closes and opens
      NewNoteModal"). It closes and opens the note only when
      `shouldCloseAfterSingleAdd` would allow it; otherwise it raises the
      close-ask holding the pick (`closeAsk.note`) — Discard hands the pick
      on to the note, "Keep going" (`cancelClose`) cancels it and nothing
      opens.
  - **Live reads.** Every billed read's `outcome` (`ok` / `not-a-label` /
    `not-read`) and token usage lives in `label_reads`. The L1 harness
    (`.superpowers/add-wine-v2/live-label-check.test.ts`, gated on
    `LABEL_LIVE=1`) replays real Sonnet 5 calls against a fixed photo set
    and stores each response as a replay fixture under
    `src/lib/label-scan/__fixtures__/live/`, pinned by
    `src/lib/wine-identity/live-replay.test.ts`. D1's cap is 30 live reads
    total for this work; only the main session makes them, never a coding
    agent (AGENTS.md's Claude API cost rules — every agent-side test uses
    `LABEL_READ_FIXTURE` instead).
  - **Lane N security notes** (blind-tasting ledger B13.x, applied ahead of
    the redesign itself — see the migrations for the full holes each
    closed; this replaces the earlier "Known caveat, not changed" note):
    - **`has_scored_guess` narrowing**
      (`20260912090000_has_scored_guess_step_gate.sql`). It now grants only
      for the ASYNC-IMMEDIATE self-scored path: the caller's own JOINED
      participant row, that tasting is `timing_mode = 'ASYNC'` and
      `async_reveal_policy = 'IMMEDIATE'`, the guess is scored, and the
      glass has no shared step-reveal in progress (`reveal_step = 0` or
      fully revealed). Before this a guesser could read a whole answer key
      by stamping their own `scored_at` once any category had been
      step-revealed.
    - **`reveal_wine` counts only locked eligible guesses, and refuses
      CLOSED** (`20260912092000_reveal_wine_locked_gate.sql`). "Everyone
      has guessed" now means every eligible JOINED participant (minus the
      wine's contributor, minus the HOST_PROVIDES host) has a guess with
      `locked_at` set — an autosaved draft no longer counts. A CLOSED
      tasting refuses every caller, host included, and a caller with no
      `auth.uid()` (the anon key with no session) is refused rather than
      silently skipping the participant gate.
    - **`guesses` client column grants**
      (`20260912093000_guesses_client_columns.sql`). `authenticated` could
      originally INSERT/UPDATE 14 client columns (`wine_id`,
      `participant_id`, the ten guess fields, `guessed_wine_id`,
      `locked_at`); the server-only columns (the points columns,
      `scored_at`, `reveal_step`, …) got no client grant at all — only the
      SECURITY DEFINER scoring functions write them, running as the table
      owner outside RLS. A client's own write goes through the `guesses
      insert own` / `guesses update own` policies, which call two SECURITY
      DEFINER helpers: `is_own_joined_participant_for_wine(participant_id,
      wine_id)` (the caller's own JOINED row in the wine's tasting) and
      `is_open_guess_target(participant_id, wine_id, guessed_wine_id)` (not
      the glass's contributor or the HOST_PROVIDES host, glass at
      `reveal_step = 0`, a `guessed_wine_id` from the same tasting);
      `guesses update own` also requires the row itself to have
      `scored_at is null` and `reveal_step = 0`. The scoring functions
      never call either helper. The `guesses_pin_identity` BEFORE UPDATE
      trigger refuses moving a guess onto another glass or participant.
      `anon`/`PUBLIC` lose EXECUTE on every game RPC;
      `reveal_own_next_category` is revoked from clients
      entirely; `get_wine_reveal` was narrowed to serve only JOINED
      participants and the host. **Superseded** (M9b,
      `20260914103500_semi_blind_lockdown.sql`, spec §1.4 row 8/§10.4 (e)):
      `guessed_wine_id` is no longer one of the client columns at all — no
      client INSERT or UPDATE of it, and `authenticated`'s SELECT on
      `guesses` narrows to the other 27 columns (`anon`: none); only
      `assign_semi_blind_match`/`clear_semi_blind_match` (SECURITY DEFINER)
      write it now (see the semi-blind permutation, above). M8
      (`20260914101500_guess_lock_pin.sql`) adds one more BEFORE UPDATE
      trigger, `guesses_refuse_locked_edit`, pinning a locked row's answers
      (see "Guess ladder", above).
    - **Participant row pin**
      (`20260912091000_participant_row_pin.sql`). A BEFORE UPDATE trigger
      (`pin_tasting_participant_identity`) refuses any change to
      `tasting_participants.tasting_id` or `.user_id`, for every role — the
      RLS policy's own USING/WITH CHECK never looked at the OLD row's
      tasting, so a participant could otherwise PATCH their own row into
      any tasting with a public roster and set themselves JOINED there with
      no invite.
    - **A `blind_pending` catalog wine is readable only by those who may
      already see it** (BT-V3 review fix group 1, findings A-02/V2-6-01;
      `20260914126500_catalog_blind_pending_read.sql`). `catalog_wines`'
      `"catalog read"` policy used to be a bare `using (true)` — any
      signed-in user could `select` a `blind_pending` catalog row directly
      (or through `search_catalog_wines`/`search_all`, which don't filter
      it), which is the identity of someone's unrevealed glass;
      `catalog_wine_edits` and `catalog_wine_grapes` (the audit trail and
      the blend) leaked the same identity through their own `using (true)`
      read policies. Now `"catalog read"` admits a row when it is not
      `blind_pending`, OR the caller created it, OR
      `can_read_blind_pending_catalog_wine(id)` — SECURITY INVOKER on
      purpose: it reads `wine_answers` under the CALLER's own
      `wine_answers read` policy, so nobody can read a hidden catalog wine
      without already being able to read the answer key that names it, and
      it narrows automatically whenever that policy does (no DEFINER copy
      to keep in sync). `catalog_wine_edits`/`catalog_wine_grapes` reads now
      subquery `"catalog read"` the same way. `find_or_create_catalog_wine`
      stays SECURITY INVOKER; its identity lookup goes through a new
      SECURITY DEFINER helper, `catalog_wine_identity_match(jsonb)`
      (`authenticated`/`service_role` EXECUTE only), so a second adder of an
      identity that already exists as a hidden row still links to it
      instead of colliding on `catalog_wines_identity_key`. Accepted
      residual, understated before (spec `2026-09-19-rule1-older-leaks`
      F12): the helper tells any caller whether a row with an exact identity
      exists, hidden or not, and a second adder who links it reads it,
      `created_by` included; a caller's own cellar lot or note naming a
      hidden catalog wine shows no details on it until a glass that links
      the wine is revealed (no longer "or unlinked": since 20260919223200 a
      wine abandoned before any reveal stays hidden until a glass that pours
      it is revealed; its creator still reads it).
  - **Owner feedback round 1 (2026-09-12, same day as the flows shipped).**
    - Taste & rate is the sheet's `{ kind: "note" }` destination (renamed
      from the round-1 `{ kind: "rate" }`; `RateWineModal` and
      `cellar-lot-picker.tsx` are deleted). A pick is single (no multi /
      Many / chooser), never writes to a flight or cellar, and hands a
      `NotePick` (`{ catalogWineId, lotId, consume }`) to `AddWineProvider`,
      which closes the sheet and opens `NewNoteModal`; a cellar bottle is
      drawn down only once the note saves (`cellarConsume`). After the
      FIRST save of a new note, `NewNoteModal` reports it through
      `NoteSavedStepContext`, and `shouldShowNoteSaved`
      (`src/lib/wset/note-saved.ts`, Taste & Rate ledger R6) shows a
      confirmation ("Note saved" · what was saved · See all notes / Done /
      "Don't show this again") unless the visit or the device already
      dismissed it — the dismissal flag is written through
      `src/lib/safe-storage.ts`'s `readFlag`/`writeFlag` (the one try/catch
      around browser storage, shared with the live theme's dismissal), so a
      throwing or blocked store just means the confirmation shows again
      next time, never a crash.
    - Every addable row in an add-wine result list carries the same
      `RowActionButton` (exported from `desktop-view.tsx`, also used by the
      create sheet's flight step), labelled by the matrix's own `row()`
      function (round 1's separate `rowActionLabel` helper is gone — folded
      into `sheetMatrix`, spec §G.6). The row Enter adds is marked only by
      its tint and the "↵ adds the first hit" hint — never by a different
      button (owner asked why two rows differed).
    - The by-hand form never fills appellation or grape from the producer
      (owner: "nonsense" — a producer makes many wines). Only
      `producerHomeRegion` prefills country + region into an untouched origin
      (`applyProducerRegion`); the origin pickers are always expanded.
    - Step 1 of the create sheet has an optional cover photo
      (`ImageUploader`, bucket `tasting-images`, folder = host user id);
      `setupColumns` writes `image_url` (null clears, undefined leaves it).
    - "Taste Blind" and "Taste Semi-Blind" are one nav / menu item ("Taste
      Blind"); the sheet's mode tiles pick semi-blind.
      `/tastings/new?mode=semi-blind` still preselects it.
  - Dev gotcha (browser verification): when the in-app Browser pane is hidden
    (`document.visibilityState === "hidden"`, `innerWidth` 0) pages stall on
    their `loading.tsx` text ("Setting the table…") and never hydrate, so
    clicks do nothing and screenshots time out — an environment limit, not an
    app bug. The console buffer also survives navigations: a single stale
    "useAddWine must be used within <AddWineProvider>" from an earlier hash
    login keeps showing up in `onlyErrors` reads, so check message order
    against a logged marker before treating it as a new failure.
  - Dev/verification gotchas: the in-app browser tool's "Return" key does
    not reach React `onKeyDown` handlers (send "Enter"), and a
    `window.confirm` swallows automated clicks (override it in the tab).
    Demo sessions for the seeded `demo.*@blindr.invalid` people are minted
    with `.superpowers/demo-session.mjs` (magiclink + `verifyOtp` →
    `/auth/confirm-hash`), never by typing a password; switching users
    re-mints, since all tabs share one cookie jar.
- The LWIN import promoted every SITE/sub-region value to an appellation,
  which occasionally produced a nonsense row when LWIN's site column held a
  vineyard/lieu-dit name that collides with a famous term — e.g.
  "Champagne AOP" under Beaujolais (a Fleurie lieu-dit named Champagne),
  deleted as data cleanup. If a user reports a bizarre appellation under
  the wrong region, this artifact pattern is the first suspect.
