# Knowledge Map Explorer sticky-sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This plan is **human-verified**: each task ends by pushing to Vercel and waiting for the owner's screenshot before the next.

**Goal:** Bring `/knowledge/map` to the "Knowledge Explorer" prototype — rename the header and re-anchor the region tree as a full-height sticky left sidebar — without changing any map behavior.

**Architecture:** Presentational-only edits to two files (`page.tsx`, `tile-wine-map-explorer.tsx`). The maplibre engine, the tree component (which already has its own search), and all data fetching are untouched. Three small increments, each pushed and screenshot-verified.

**Tech Stack:** Next.js 16 App Router, React client component, Tailwind v4, lucide-react.

## Global Constraints

- **No automated tests for the map.** Each task = clear `.next` → `npx tsc --noEmit` prints `TSC 0` → commit → push to `master` (Vercel auto-deploy). PowerShell shows git stderr as "RemoteException"; success = `EXIT=0`.
- **Human verification gate:** after each push, STOP and wait for the owner's Vercel screenshot before starting the next task.
- **MUST NOT change** (verify unchanged): `tile-wine-map.tsx` (maplibre), any `lib/wine-map/*`, or map behavior — selection (tree+map), camera fly-to, grape filter/`visibleKeys`, `expanded` full-view, panel collapse (`treeOpen`/`detailsOpen`), `?place=` deep links, mobile stacking.
- Sticky reference (Cellar sidebar): `lg:sticky lg:top-6 lg:self-start`.

## Files touched

- Modify `src/app/knowledge/map/page.tsx` — header text (Task a).
- Modify `src/app/knowledge/map/tile-wine-map-explorer.tsx` — sticky tree card + "Hierarchy"→"Explorer" (Task b), light filter/detail polish (Task c).
- No new files. `wine-map-tree.tsx` and `tile-wine-map.tsx` untouched.

---

### Task a: Header rename

**Files:** Modify `src/app/knowledge/map/page.tsx` (the `<h1>`/`<p>` block).

- [ ] **Step 1: Edit the heading + subtitle.**

Replace:
```tsx
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Wine Map
          </h1>
          <p className="mt-2 text-muted-foreground">
            Click through from country to region to appellation.
          </p>
```
with:
```tsx
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Knowledge Explorer
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explore the world of wine through places, grapes, styles and the
            rules that shape them.
          </p>
```

- [ ] **Step 2:** `if (Test-Path .next) { Remove-Item -Recurse -Force .next }; npx tsc --noEmit` → expect `TSC 0`.
- [ ] **Step 3:** commit `feat: knowledge map header → "Knowledge Explorer"`, push.
- [ ] **Step 4:** STOP — wait for the owner's Vercel screenshot before Task b.

---

### Task b: Sticky Explorer sidebar + rename

**Files:** Modify `src/app/knowledge/map/tile-wine-map-explorer.tsx` — the open-tree `<Card>` (`order-3 lg:order-1 lg:w-[280px] lg:shrink-0`), the collapsed-tree `<button>` (`lg:w-9`), and the "Hierarchy" label.

- [ ] **Step 1: Make the tree card sticky in normal (non-expanded) view.** On the open-tree `<Card>`, append a conditional class so it detaches from the stretch row and sticks:
```tsx
className={`order-3 lg:order-1 lg:w-[280px] lg:shrink-0 ${
  expanded ? "" : "lg:sticky lg:top-6 lg:self-start"
}`}
```
Apply the same `${expanded ? "" : "lg:sticky lg:top-6 lg:self-start"}` suffix to the collapsed-tree `<button>` so the thin rail sticks too. Leave `expanded` (fixed-overlay) mode exactly as-is.

- [ ] **Step 2: Rename the panel heading.** Change the tree panel label text `Hierarchy` → `Explorer`.
- [ ] **Step 3:** clear `.next`, `npx tsc --noEmit` → `TSC 0`.
- [ ] **Step 4:** commit `feat: knowledge map — sticky Explorer sidebar`, push.
- [ ] **Step 5:** STOP — owner screenshot. Verify: sidebar sticks while the page scrolls; the map still renders at full size (NO collapse-to-zero); collapse toggle still works; mobile still stacks. Tune `lg:top-6` / the tree height only if the screenshot calls for it.

---

### Task c: Filter bar + detail panel polish (screenshot-driven)

**Files:** Modify `tile-wine-map-explorer.tsx` — the `Filter` bar (grape `ReferenceCombobox` row) and the details `<Card>` (`KnowledgeSections` + place header).

- [ ] **Step 1:** Re-read the current filter bar and details card, then apply **presentational-only** tweaks to close any gaps the owner flags from the Task-b screenshot (spacing, heading weight, chip styling). No behavior/logic changes. If a/b already match the prototype closely, this task may be a no-op — that's an acceptable outcome, not a placeholder.
- [ ] **Step 2:** clear `.next`, `npx tsc --noEmit` → `TSC 0`.
- [ ] **Step 3:** commit `polish: knowledge map filter bar + detail panel`, push, owner screenshot.

## Self-review

- **Spec coverage:** header rename (Task a), sticky sidebar + Explorer rename (Task b), filter/detail polish (Task c), preserve-behavior (Global Constraints). All four spec changes mapped. The corrected "no new search" is reflected (Task b adds none).
- **Placeholders:** Task a/b carry exact code. Task c is intentionally screenshot-driven (human-in-the-loop) and states a no-op is acceptable — not a hidden TODO.
- **Consistency:** the `${expanded ? "" : "lg:sticky lg:top-6 lg:self-start"}` suffix is identical on both the card and the collapsed button.
