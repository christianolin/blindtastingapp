# WSET aroma/flavour pill icons

## Goal

Give every aroma/flavour term pill in the WSET tasting sheet a small, colourful
icon to the left of its text (a *yellow lemon* beside "lemon"), so a taster can
scan the lexicon visually instead of reading ~90 words. The icons must render
**identically on desktop, tablet and phone** — a consistent vendored SVG emoji
set, not the OS's native emoji font.

## Non-goals

- No change to the WSET data model, seeded lexicon, selection logic, colour
  filtering, section progress, or the saved note. Icons are purely presentational.
- Not adding icons to the non-lexicon pills (clarity, sweetness, tannin nature,
  faults, etc.) — this is only the aroma/flavour terms.
- No user-configurable icons, no per-user overrides, no theming.

## Source lexicon

The ~90 terms live in `wset_aroma_terms` (seeded), grouped into 19 families
(`group_name`): Floral, Green fruit, Citrus fruit, Stone fruit, Tropical fruit,
Red fruit, Black fruit, Herbaceous, Herbal, Spice, Fruit ripeness, Other, Yeast,
Malolactic, Oak, Red wine, White wine, Deliberately oxidised. Each pill already
renders the term string; that string is the mapping key.

## Icon set

**jdecked/twemoji** (the maintained Twemoji fork) **colour SVGs**, CC-BY 4.0.
Chosen for recognizability (a genuinely yellow lemon). We vendor only the subset
we use (~60–70 files) into `public/emoji/` under friendly slugs (`lemon.svg`,
`cherries.svg`, `wood.svg`), copied from the fork's `assets/svg/` by codepoint.
A one-line attribution ("Emoji graphics © Twemoji, CC-BY 4.0") is added to the
app's existing licenses/about surface (exact location chosen during
implementation; if none exists, a `NOTICE` note in `public/emoji/`).

## Components

Three small, isolated units.

### 1. `src/lib/wset/aroma-icons.ts` — mapping (pure data + one function)

```ts
export const TERM_ICON: Record<string, string>;   // term string -> slug
export const FAMILY_ICON: Record<string, string>; // group_name  -> fallback slug
export function iconForTerm(term: string, family: string): string;
```

- `iconForTerm` returns `TERM_ICON[term]` if present, else `FAMILY_ICON[family]`,
  else a generic default slug (`"sparkles"`). It never returns empty.
- `TERM_ICON` is keyed by the exact seeded `term` strings. It is built against the
  live seed list (see Testing) so every concrete term with a sensible emoji gets
  one; abstract terms (wet stones, flint, forest floor, savoury, farmyard,
  "simple", resinous, tar, petrol if no emoji, …) are intentionally omitted here
  and picked up by the family fallback.
- **`FAMILY_ICON` (complete, 19 rows):**
  Floral→`blossom`, Green fruit→`green-apple`, Citrus fruit→`lemon`,
  Stone fruit→`peach`, Tropical fruit→`pineapple`, Red fruit→`cherries`,
  Black fruit→`blueberries`, Herbaceous→`herb`, Herbal→`herb`, Spice→`pepper`,
  Fruit ripeness→`grapes`, Other→`rock`, Yeast→`bread`, Malolactic→`butter`,
  Oak→`wood`, Red wine→`fallen-leaf`, White wine→`fallen-leaf`,
  Deliberately oxidised→`peanuts`.
  (`butter`/`peanuts`/`rock`/`herb`/`wood`/`fallen-leaf` etc. resolve to the
  nearest Twemoji glyph during vendoring; the slug names are stable regardless.)

### 2. `src/components/wset/aroma-icon.tsx` — presentation

```tsx
export function AromaIcon({ term, family, size = 15 }:
  { term: string; family: string; size?: number }): JSX.Element;
```

Renders `<img src={`/emoji/${iconForTerm(term, family)}.svg`} alt="" width={size}
height={size} loading="lazy" decoding="async" className="shrink-0" />`. Decorative
(`alt=""` — the visible term text carries the meaning); fixed `width`/`height` so
there is no layout shift. No state, no effects.

### 3. `public/emoji/*.svg` — vendored assets

The curated subset of Twemoji colour SVGs, one per slug that `iconForTerm` can
return (both `TERM_ICON` values and `FAMILY_ICON` values and the generic default).

## Wiring

The term-pill markup lives in two files; both currently render `{term.term}` (or a
plain string) inside a styled pill. Add `<AromaIcon>` immediately before the label,
with a small gap, in each:

- `src/components/wset/aroma-picker.tsx` — the cluster-grid option buttons and the
  selected-summary chips, in **both** the desktop layout and the mobile bottom
  sheet (the four `{term.term}` / `{term.term} ×` sites). The remove chips become
  `<icon> lemon ×`.
- `src/components/wset/archetype-sheet.tsx` — `AromaPills` (read-only archetype +
  community pills); its `terms: string[]` maps to `<span>` pills. Family is not in
  scope there, so it calls `iconForTerm(term, "")` and relies on the family
  fallback only where the term itself isn't mapped. (Term-level icons still work,
  which covers the large majority; abstract terms fall to the generic default.)

Pills stay the same size/colours; only an icon + gap is added. Selected (burgundy)
pills keep the colour icon on the dark background — colour emoji read fine on
burgundy; verified during implementation, and a subtle text-shadow/opacity tweak is
available if any icon is illegible.

## Data flow

Term string (already present) → `iconForTerm(term, family)` → slug → local
`/emoji/{slug}.svg`. Pure, synchronous, offline, no DB or network. No schema or
query change anywhere.

## Testing

Unit tests (Node, matching the repo's `*.test.mjs` style) over the **seeded term
list** — the test imports the family/term list (from the vocab seed or a small
fixture mirroring `wset_aroma_terms`) and asserts:

1. **Coverage:** `iconForTerm(term, family)` returns a non-empty slug for *every*
   term — the fallback guarantees no pill ever renders bare.
2. **No broken images:** every slug `iconForTerm` can return (all `TERM_ICON`
   values, all `FAMILY_ICON` values, and the generic default) has a matching
   `public/emoji/{slug}.svg` on disk.

These two together guarantee every term shows a real icon before ship. `tsc` +
`eslint` green.

## Edge cases / accessibility / performance

- **Missing icon:** impossible given test 2; if one slipped through, `alt=""` +
  the text label degrade to plain text (no broken-image cruft).
- **Accessibility:** icons are decorative (`alt=""`), not separate tab stops; the
  term text remains the accessible name of each pill button.
- **Performance:** a few dozen fixed-size, lazy, async-decoded SVGs per sheet —
  negligible, consistent with the cellar thumbnail approach.
- **Subjectivity:** the ~90-row `TERM_ICON` table is a judgement call per term;
  it's built against the exact seeded list and is trivially tweakable row-by-row
  after review (changing a row is a one-line edit + a re-run of the coverage test).

## Files touched

- New: `src/lib/wset/aroma-icons.ts`, `src/components/wset/aroma-icon.tsx`,
  `public/emoji/*.svg`, `src/lib/wset/aroma-icons.test.mjs`.
- Edited: `src/components/wset/aroma-picker.tsx`,
  `src/components/wset/archetype-sheet.tsx`, and one attribution line in the
  licenses/about surface.
