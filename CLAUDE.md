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
- The answer-key form (`wines/new/wine-form.tsx`) cascades
  country→region→appellation, since the host is entering one authoritative
  hierarchy. The guess form (`play/guess-form.tsx`) deliberately does NOT
  cascade — each category is scored independently (`reveal_wine` compares
  each FK separately), so a participant must be able to guess, say, the
  correct appellation while guessing the wrong region. Don't copy the
  cascading filter from one form into the other.
- Vintage is its own type: `vintage_kind` (`YEAR` | `NV` | `TAWNY`) plus
  `vintage_year` or `vintage_tawny_years`. Scoring: exact match → 2 pts;
  `YEAR` off by exactly 1 → 1 pt; anything else → 0.
- Scoring points: country 2, region 3, appellation 5 (only if the wine has
  one), primary grape 8, secondary grape 2 (only if the wine has one),
  producer 6, type designation 2 (only if the wine has one), vintage 2/1/0
  as above.
- Appellation is optional (`wine_answers.appellation_id` is nullable) —
  plenty of real wines carry nothing more specific than the region itself
  (a plain "Bourgogne rouge", "Alsace", generic "Rioja", "California", a
  Mendoza varietal) or no formal appellation at all ("Vin de France"). Every
  region got a self-named appellation added (migration
  `20260713180000_optional_regional_appellation.sql`) so "just the region"
  is always pickable — the original LWIN-import fallback only added one for
  regions with *zero* appellation candidates, missing 181 of 378 regions
  (including Bordeaux, Rhône, Alsace, Rioja, California, Mendoza) that had
  specific sub-appellations but no option matching the region's own name.
  The wine-form's appellation field is `allowClear`; leaving it blank is a
  valid, real answer key, not a placeholder for "not entered yet."
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
- A tasting also has `reveal_mode` (`BLIND` | `SEMI_BLIND`), independent of
  `wine_source` — either host or participants can still provide the wines. In
  `SEMI_BLIND`, every wine's answer key is visible to all participants up
  front as a "candidate list" (`wine_answers` RLS allows this — see
  `is_tasting_participant` + `reveal_mode` check in the read policy); guessing
  becomes "which candidate wine is this glass" (`guesses.guessed_wine_id`)
  instead of filling in each category. `reveal_wine` resolves a
  `guessed_wine_id` guess to that wine's own answer key and scores it through
  the exact same per-category logic as a normal blind guess — semi-blind adds
  an input path, not a second scoring engine. Matching is NOT enforced to be
  1-to-1 (the same candidate can be picked for more than one glass); each
  glass is still scored independently against its own true answer.
- Every profile has a public page (`/u/[id]`) and there's an open directory
  (`/people`) — any authenticated user can browse or search every profile,
  by design (confirmed with the user; not search-only), and the directory
  includes yourself (with a "You" badge), not just other people. Avatars live
  in the public `avatars` Storage bucket, one file per user at
  `avatars/<user_id>/...` (RLS on `storage.objects` restricts writes to your
  own folder); uploaded directly from the browser client in
  `profile/edit/avatar-uploader.tsx`, not through a server action.
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
  scratch/test output.
- Friends (`friendships` table) are one-way, no accept/request flow — adding
  a friend is unilateral, like saving a contact (confirmed with the user).
  A user only ever sees/manages rows where they are `user_id`; there's no
  notion of the other side consenting or even being notified.
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
- The leaderboard sidebar shows more than a bare score per participant: a
  "wine X/Y" progress readout (their own scored-guess count over the
  tasting's total wine count — this can differ between participants if one
  of them hasn't guessed an already-revealed wine, unlike a purely
  tasting-global "wines revealed" count) and "+N last round" (their points
  on whichever wine has the most recent `scored_at` across the tasting —
  `reveal_wine` scores every guess for a wine in one transaction, so the max
  `scored_at` per `wine_id` groups cleanly into "rounds" without needing a
  dedicated reveal-order column).
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
- Semi-blind matching (`play/match-guess-form.tsx` +
  `submitAllMatchGuesses` in `play/actions.ts`) is submitted as one combined
  batch, not per-glass — every still-hidden glass must be matched to a
  candidate before the submit button enables (client-side `allMatched` check)
  and the server independently re-validates the same completeness rule.
  Partial submission doesn't make sense here the way a partial blind guess
  does: blind guessing scores each category independently, so a half-filled
  guess is still meaningful, but a half-finished matching pass just means
  some glasses have no guess row at all yet.
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
- `SearchableCombobox`'s search input only gets `autoFocus` on pointer-fine
  (mouse/trackpad) devices, detected once via a lazy `useState` initializer
  guarded by `typeof window !== "undefined"` (not a `useEffect`+setState,
  which is unnecessary here and trips the `set-state-in-effect` lint rule).
  On a touch device, autofocusing immediately pops the virtual keyboard
  while the popover is still animating in, and floating-ui's anchor
  positioning reacts to the resulting viewport resize mid-animation — this
  was the main reported cause of "janky" mobile scrolling when adding a wine
  or guessing (both forms are full of these comboboxes). `ReferenceCombobox`
  never had this problem since its `CommandInput` was never autofocused.
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
- Tasting lifecycle: a new tasting is created `DRAFT` ("not started"), NOT
  `OPEN` — the create action used to force `OPEN`. While `DRAFT` the host can
  add wines, edit the schedule, and invite more people (`HostControls` in
  `tastings/[id]/host-controls.tsx` + actions in `tastings/[id]/actions.ts`);
  the host presses **Start** (`startTasting`, requires ≥1 wine) to move it to
  `IN_PROGRESS`, which opens guessing. Guessing is gated both in `play/page.tsx`
  (UI) and in `play/actions.ts`'s `resolveGuesser` helper (server): the tasting
  must not be `DRAFT` and the caller's participant `status` must be `JOINED`.
  Legacy rows created as `OPEN` count as "started" (anything ≠ `DRAFT`), so old
  demo/test tastings keep working. The host can **delete** a tasting anytime
  (`deleteTasting`, cascades via FK). Invites close once started.
- Invitations now require acceptance. An invited participant (`status`
  `INVITED`) sees an Accept/Decline card on the lobby (`respondToInvite`
  action → `JOINED`/`DECLINED`) and a bell notification in the header; only
  `JOINED` participants can guess. The dashboard groups tastings into three
  tabs — **Invited** (pending), **Hosting** (`host_id` = me), **Attending**
  (`JOINED`, not host) — in `dashboard/tastings-tabs.tsx`; the host row is
  always a `JOINED` participant so a hosted tasting is shown only under
  Hosting, never also under Attending.
- Tastings carry an optional `scheduled_at timestamptz` (date + time),
  editable while `DRAFT`. Always format it client-side via
  `src/components/local-date-time.tsx` (viewer's locale/timezone) — the
  server's timezone is not the user's. `datetime-local` inputs give/expect
  local `YYYY-MM-DDTHH:mm`; convert to/from ISO at the action/effect boundary.
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
- A guess is locked once it has `scored_at` (immediate-scored, or a revealed
  wine): `submitGuess`/`submitAllMatchGuesses` reject edits to a scored guess.
  This is app-enforced, not a DB trigger, on purpose — `reveal_wine` and
  `score_own_guess` both write `scored_at` themselves, so a trigger keying on
  "already scored" would block those legitimate SECURITY DEFINER writes.
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
