# Knowledge Map — Explorer sticky-sidebar redesign

Date: 2026-07-31
Status: Draft for owner review

## Context

First of the two "held" prototype-fidelity screens (the live `/play` screen is a
separate spec→build cycle, next). The Knowledge map (`/knowledge/map`) is already a
mature client component; this brings it to the "Knowledge Explorer" prototype, led
by the owner's request to re-anchor the left region tree as a full-height sticky
sidebar.

Verification loop (the assistant cannot see renders): each increment is pushed to
Vercel `master`; the owner previews and screenshots back before the next increment.
`tsc --noEmit` clean per increment.

## Goal

Match the Knowledge Explorer prototype **without changing map behavior**: rename the
header, move the region tree into a fixed-width, full-height **sticky left sidebar**
(collapsible, with a tree search), and lightly restyle the filter bar + detail
panel — leaving the maplibre engine and all data fetching untouched.

## Current state

- `knowledge/map/page.tsx`: AppHeader, KnowledgeTabs, "Wine Map" title + "Click
  through from country to region to appellation." subtitle, then `TileWineMapExplorer`.
- `tile-wine-map-explorer.tsx` (588 lines, client): a flex row of three Cards — a
  collapsible **tree** Card (`treeOpen`, "Hierarchy" header, `WineMapTree`), the
  **map** Card (`flex-1`, a grape `Filter` bar + dynamic `TileWineMap`, 70vh), and
  the **details** Card (`lg:w-[320px]`, place context via `KnowledgeSections`).
  Also: grape filter (`visibleKeys`), an `expanded` full-view mode, `detailsOpen`.
  Code comments flag flex-sizing bugs ("the map collapses to zero") if the
  flex-1 / min-h-0 chain is broken.
- `wine-map-tree.tsx`: the tree (no text search today). `tile-wine-map.tsx`: the
  maplibre engine — OUT OF SCOPE.

## Changes

### 1. Header rename (page.tsx)
"Wine Map" → **"Knowledge Explorer"**; subtitle → "Explore the world of wine
through places, grapes, styles and the rules that shape them."

### 2. Left Explorer → full-height sticky sidebar (the core change)
Restructure the explorer shell into two zones: a fixed-width (~15rem) **sticky,
full-height** left sidebar (`lg:sticky lg:top-6 lg:self-start`, mirroring the
Cellar sidebar) + a right main zone holding the map and detail panel.

Sidebar contents: an "Explorer" heading with the **collapse toggle kept** (collapses
to the existing thin `PanelLeftOpen` button so the map can take the full width); a
**search input** that filters the tree by place name (client-side — matched nodes
and their ancestors stay visible); then `WineMapTree` (unchanged props:
roots / selectedKey / onSelect / filterKeys).

Hard constraint: preserve the map's flex-1 / min-h-0 sizing chain so the map never
collapses to zero (the documented bug). On mobile the sidebar stacks above the map
as today. Verified by the owner's screenshot after this increment.

### 3. Map area + detail panel — light styling only
The maplibre `TileWineMap` is untouched. Restyle the `Filter` bar and the right
detail panel toward the prototype (badge/kind → place name → Climate / Key grapes /
Wine styles / Relationships / "Explore X wines" CTA). Most already exists via
`KnowledgeSections`; changes are presentational (spacing, headings, chips).

### 4. Preserve all behavior (must-not-break)
Selection (tree + map), camera fly-to, grape filter + `visibleKeys`, `expanded`
full-view, panel collapse (`treeOpen` / `detailsOpen`), deep-link `?place=`, and
mobile stacking. No changes to `tile-wine-map.tsx` or any `lib/wine-map/*` fetch.

## Build increments (each pushed to Vercel → owner screenshot → next)

- **a. Header rename** (`page.tsx`). Trivial.
- **b. Sticky sidebar + tree search** — the core change; screenshot-verify the map
  still sizes correctly (no collapse-to-zero).
- **c. Filter bar + detail panel styling** polish.

## Verification & delivery

- `tsc --noEmit` clean (clear `.next` first) per increment; commit + push each; the
  owner previews on Vercel and screenshots back before the next.
- No DB changes. No automated test harness for the map — verification is the owner's
  screenshot plus `tsc`.

## Out of scope

- The maplibre engine (`tile-wine-map.tsx`) and all `lib/wine-map/*` data/fetch.
- The live `/play` screen — a separate spec→build cycle, after this one.
