# P4: Taste pillar — mode launcher Implementation Plan

> **For agentic workers:** execute task-by-task; each task ends shippable + committed.

**Goal:** Turn `/dashboard` into the **Taste** pillar at `/taste`: a four-tile launcher (Open note · Blind · Semi-blind · Training room) where the tile you pick *is* the mode, replacing the generic "New tasting" button and the in-form Blindness selector.

**Architecture:** Route-move `dashboard → taste` (307 redirect keeps old links). A server-component tile grid links to `/tastings/new?mode=blind|semi-blind`; the new-tasting page reads `?mode`, locks `reveal`, and the form shows it as a read-only chip + hidden input instead of a `Select`. No DB surface — routing + UI only.

**Tech Stack:** Next.js 16 (App Router; `searchParams` is `Promise<{...}>`, `await` it), React server components, Tailwind v4 tokens (`primary`, `gold`/`gold-deep`), lucide-react icons.

## Global Constraints
- No emojis in code/UI. Match existing card idiom (`rounded-xl border border-border`, hover tints).
- `reveal_mode` still submitted to `createTasting` (unchanged server action) — via hidden input.
- Each commit: `npx tsc --noEmit` clean; no stray `/dashboard` route strings.

## File structure
- `src/app/dashboard/**` → `git mv` → `src/app/taste/**` (page, loading, tasting-card, tastings-tabs).
- Create `src/app/taste/mode-tiles.tsx` — the launcher grid (server component).
- Modify `src/app/taste/page.tsx` (tiles + drop button), `tastings-tabs.tsx` (`/dashboard`→`/taste`).
- Modify `src/app/tastings/new/page.tsx` (read `?mode`), `new-tasting-form.tsx` (chip + hidden input, drop Select).
- Modify refs: `components/app-header.tsx:67`, `components/nav-links.ts:13`, `app/page.tsx:10`, `lib/auth/roles.ts:45,57`, `app/login/actions.ts:25`, `app/auth/callback/route.ts:7`, `app/auth/confirm-hash/page.tsx:20`, `app/auth/set-password/actions.ts:37`, `app/tastings/[id]/actions.ts:85,98,276`.
- Modify `next.config.ts` (add `/dashboard`→`/taste` 307), `docs/superpowers/specs/2026-07-29-...-design.md` (§4.3 amendment).

---

### Task 1: Route-move `/dashboard` → `/taste` (mechanical, shippable)

`/taste` renders exactly as the old dashboard (button still present); only the URL + references change.

- [ ] `git mv src/app/dashboard src/app/taste`
- [ ] In `src/app/taste/tastings-tabs.tsx`: replace the two `/dashboard` URL strings with `/taste` (`select()` builds `/taste` and `/taste?tab=`).
- [ ] Replace `/dashboard` → `/taste` in: `app-header.tsx:67`, `nav-links.ts` (href + `match: ["/taste","/tastings"]`, label `Taste`), `app/page.tsx:10`, `roles.ts:45,57`, `login/actions.ts:25`, `auth/callback/route.ts:7`, `auth/confirm-hash/page.tsx:20`, `auth/set-password/actions.ts:37`, `tastings/[id]/actions.ts:85,98,276`.
- [ ] `next.config.ts`: add `{ source: "/dashboard", destination: "/taste", permanent: false }` and `{ source: "/dashboard/:path*", destination: "/taste/:path*", permanent: false }`.
- [ ] Verify: `npx tsc --noEmit` clean; `rg "/dashboard" src` returns only the `next.config.ts` redirect sources. Commit `feat(taste): move dashboard to /taste pillar route`.

### Task 2: Mode launcher + lock new-tasting to `?mode` + spec amendment

- [ ] Create `src/app/taste/mode-tiles.tsx`: server component, `grid grid-cols-1 gap-3 sm:grid-cols-2`. Three `<Link>` cards + one inert "Soon" card:
  - Open note → `/catalog`, `NotebookPen`, primary tint, "Bottle open, label in view. Capture a full WSET Level 4 note."
  - Blind → `/tastings/new?mode=blind`, `EyeOff`, gold tint, "Nothing given away. Call every wine from the glass alone."
  - Semi-blind → `/tastings/new?mode=semi-blind`, `ScanEye`, primary tint, "The line-up's on the table. Match each pour to a bottle."
  - Training room (inert `<div>`, `opacity-60`, "Soon" badge), `Target`, "Drill against typical-wine profiles and track your accuracy."
- [ ] `src/app/taste/page.tsx`: render `<ModeTiles />` above the stats strip; change subtitle to "What are you tasting today?"; **remove** the "New tasting" `Button` next to the "Your tastings" heading; drop now-unused `Link`/`Button` imports if unreferenced.
- [ ] `src/app/tastings/new/page.tsx`: `searchParams: Promise<{ mode?: string }>`; `const { mode } = await searchParams; const reveal = mode === "semi-blind" ? "SEMI_BLIND" : "BLIND";` Title `New {reveal === "BLIND" ? "blind" : "semi-blind"} tasting`. Pass `reveal={reveal}` to the form.
- [ ] `src/app/tastings/new/new-tasting-form.tsx`: add `reveal: RevealMode` prop, drop the `useState`/Select for reveal, remove `REVEAL_MODE_ITEMS`. Add `import Link from "next/link"`. Replace the Blindness block with a read-only chip (`Mode: Blind|Semi-blind` + "Change" link to `/taste`) + one-line description + `<input type="hidden" name="reveal_mode" value={reveal} />`. Flow/Leaderboard blocks stay keyed on `reveal === "BLIND"`.
- [ ] Spec `§4.3`: append that blindness is chosen at the launcher (four Taste tiles), not a form setting; semi-blind stays "wine list shown, match glass→bottle" (existing reveal machinery), superseding the disclosable-field idea.
- [ ] Verify: `npx tsc --noEmit` clean; manual — `/taste` shows four tiles, `/tastings/new?mode=semi-blind` locks Semi-blind, bare `/tastings/new` defaults Blind. Commit `feat(taste): four-mode launcher, pick blindness before the form`.

## Out of scope (later phases)
Cellar split + Community rename (P6); global search (P7); training-room interactivity (own spec).
