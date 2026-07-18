# Tasting UX refinements — design

Date: 2026-07-18
Status: approved (all decisions confirmed via multiple-choice review)

## Scope

Four small, independent UX improvements to the tasting flow. No scoring
changes, no answer-key requirement changes, no table schema changes (one
RPC function replacement only).

## 1. Richer participants card (tasting page)

The Participants card on `tastings/[id]/page.tsx` currently shows a bare
name + In/Invited/Declined badge. Each row becomes a clickable link to
`/u/[id]` showing:

- **Avatar**: `profiles.avatar_url`, falling back to the existing
  initial-in-a-circle style (same markup pattern as `people/page.tsx`).
- **Name** + host badge + the existing status badge.
- **Info line**: `location` · `favorite_wine_type` (each shown only when
  set; line hidden if both empty).
- **Stats line**: "N tastings · X.X avg pts" via the existing
  `getBulkProfileSummaries(profileIds)` helper (one batched query). Hidden
  when the person has no scored guesses yet.

The page's profile select expands to include `avatar_url`, `location`,
`favorite_wine_type`.

## 2. Producer dropdown: instant region list + two-group search

Applies to the producer `SearchableCombobox` in both `wines/new/wine-form.tsx`
and `play/guess-form.tsx`.

- **On open with a region selected**: immediately show the first 30 of
  that region's producers alphabetically under a
  **"Specific to {Region}"** group header — no typing needed. A muted
  hint below the list says typing searches all producers.
- **When typing**: two groups — "Specific to {Region}" first, then
  **"Other producers"** (matches linked to other regions plus unlinked
  producers). This *widens* the current behavior, which hides
  other-region producers entirely: a wrong region guess can no longer
  make the right producer unfindable.
- **No region selected**: unchanged (type-to-search, single ungrouped
  list, no instant page).

Backend: migration `search_producers(p_query text, p_region_id uuid)` v3 —
returns `(id, name, in_region boolean)`; empty/blank query with a region
returns that region's first page (alphabetical, limit 30); a typed query
returns region matches first, then others, limit 25 total.

Frontend: `SearchOption` gains an optional `group?: string` label;
`SearchableCombobox` renders consecutive same-group results under
`CommandGroup` headings (no group → today's flat list, so the appellation
field is unaffected). The two forms wrap `searchProducers` to map
`in_region` → the two group labels. The combobox fires its search on open
even with an empty query, and shows returned results instead of the
"Type to search…" placeholder when there are any.

## 3. Type designation: plain list

Remove the "For {country}" priority group from `type-designation-field.tsx`
entirely (both forms — it's one shared component): drop the
`priorityCountryId`/`priorityCountryName` props and the priority-group
rendering, leaving the plain fixed-order category groups.

## 4. Guess form: "everything is optional" note

One muted line under the "How scoring works ↗" link in
`play/guess-form.tsx`:

> Every field is optional — skip anything you're unsure of; a blank simply
> scores 0 for that category.

No validation changes: every guess field is already optional server-side.

## Out of scope

- Making producer optional on the add-wine answer key (explicitly deferred;
  guessing was already optional).
- Any change to reveal_wine / scoring.
- The People directory and results page (already rich enough).
