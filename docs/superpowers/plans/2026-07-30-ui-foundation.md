# UI Foundation (Sub-project A) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Concise-inline (repo convention). UI has no component-test harness → verify with `npx tsc --noEmit` + visual parity; existing DB suites stay green.

**Goal:** Build the shared component kit — 7 primitives + 4 app patterns — that the page uplifts (sub-project E) consume. No behaviour or data change.

**Architecture:** Match `src/components/ui/button.tsx` conventions exactly — Base UI (`@base-ui/react`) where a primitive helps, `cva` variants, `cn` from `@/lib/utils`, `data-slot` attributes, function components with spread props (no `forwardRef`). Tabs are **Link-based** (server-safe) because the app drives subsection state through `?tab=` URLs, not client state.

## Global Constraints
- No new dependencies (`@base-ui/react`, `cva`, `clsx`, `tailwind-merge`, `cmdk`, `lucide-react` all present).
- Brand tokens only (`primary`, `gold`/`gold-deep`, `muted`, `border`, `font-heading`). No hardcoded hex.
- No behaviour/data change in this sub-project. Each task ends `tsc --noEmit` clean + commit.

---

### Task 1 — Primitives (`src/components/ui/`)

Create, each a small `cn`/`cva` component:
- `tabs.tsx` — presentational Link tabs. `Tabs({ items, activeKey, variant })` where `items: { key, label, href, count? }[]`, `variant: "underline" | "segmented"` (underline = Cellar/Taste subsections; segmented = People/Friends pill group). Active styling from `activeKey`.
- `avatar.tsx` — Base UI `Avatar` (Root/Image/Fallback). `Avatar({ src, name, size })` → rounded image, initial-letter fallback, `ring-1 ring-border`; `size: "sm"|"md"|"lg"` → `size-6/8/12`.
- `pagination.tsx` — `Pagination({ page, pageCount, hrefFor })` numbered pages + prev/next chevrons (lucide), ellipsis for gaps; renders `Link`s via `hrefFor(n)`.
- `progress.tsx` — `Progress({ value, max=100, className })`: `bg-muted` track + `bg-primary` fill at `value/max`.
- `tooltip.tsx` — Base UI `Tooltip` wrapper `Tooltip({ content, children })` + `InfoTip({ content })` (a lucide `Info` "i" trigger) for stat definitions.
- `skeleton.tsx` — `Skeleton({ className })` = `animate-pulse rounded-md bg-muted`.
- `empty-state.tsx` — `EmptyState({ icon, title, description, action? })` = dashed-border centered block (the pattern already repeated ~8×).

- [ ] Build the 7 files → `npx tsc --noEmit` clean → commit `feat(ui): shared primitives (tabs, avatar, pagination, progress, tooltip, skeleton, empty-state)`.

### Task 2 — App patterns (`src/components/patterns/`)

Compose primitives into page-level pieces:
- `page-header.tsx` — `PageHeader({ title, subtitle?, actions? })`: Cormorant H1 (`font-heading text-3xl/4xl`) + muted subtitle + right-aligned `actions` slot.
- `stat-tile.tsx` — `StatTile({ icon, value, label, sub?, hint? })` (tinted icon chip + big tabular number + label; `hint` → `InfoTip`). `stat-strip.tsx` — `StatStrip({ children })` responsive grid wrapper.
- `filter-bar.tsx` — `FilterBar({ search?, children, onClear? })`: search `Input` + filter `Select`s (children) + "Clear filters" link.
- `data-table.tsx` — generic `DataTable<T>({ columns, rows, sort?, onSort?, renderActions?, footer? })`; a `column` supports a `thumbnail` + two-line `primary`/`secondary` cell, `sortable` headers (lucide arrows), a trailing row `…` actions slot, and an optional pagination `footer`.

- [ ] Build the 4 files → `npx tsc --noEmit` clean → commit `feat(ui): page patterns (page-header, stat-strip, filter-bar, data-table)`.

### Task 3 — Prove the kit: Cellar tabs → shared `Tabs`

Swap the hand-rolled tab bar in `src/app/cellar/page.tsx` for `<Tabs variant="underline" items={…} activeKey={tab} />` (Bottles/My notes/History/Stats), preserving `?tab=` behaviour and counts. This validates the primitive against a real page without a full reskin.

- [ ] Edit `cellar/page.tsx` → `tsc` clean + cellar suites green → commit `refactor(cellar): adopt shared Tabs primitive`.

## Out of scope
Full page reskins (sub-project E); any data/behaviour change; the ⌘K palette (sub-project D reuses `command.tsx`).
