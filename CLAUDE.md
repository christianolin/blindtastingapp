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

`src/lib/supabase/database.types.ts` is a placeholder until the schema is
pushed to Supabase. Regenerate it with:
`npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts`

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
