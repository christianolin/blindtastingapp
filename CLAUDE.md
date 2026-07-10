@AGENTS.md

# Blind Tasting App

A web app for running blind wine tastings using VM/DM scoring rules.

## Stack

- Next.js (TypeScript, App Router), Tailwind CSS, shadcn/ui components.
- Supabase: Postgres, Auth (email + password/magic link), Realtime.
- Deployed to Vercel (not yet wired up).

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
recursion comes back.

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
- Vintage is its own type: `vintage_kind` (`YEAR` | `NV` | `TAWNY`) plus
  `vintage_year` or `vintage_tawny_years`. Scoring: exact match → 2 pts;
  `YEAR` off by exactly 1 → 1 pt; anything else → 0.
- Scoring points: country 2, region 3, appellation 5, primary grape 8,
  secondary grape 2 (only if the wine has one), producer 6, type designation 2
  (only if the wine has one), vintage 2/1/0 as above.
- Reveal + scoring for a wine happens via the Postgres RPC `reveal_wine(wine_id)`
  (security definer, host-only) — this is the single source of truth for
  scoring, not duplicated in the client.
