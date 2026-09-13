# Dark mode, as a thing you can click

**Date:** 2026-09-13
**Status:** approved

## What is already here

`globals.css` has carried a complete dark palette since the brand handoff — a
`.dark` block at line 142, 33 tokens, commented "Wine cellar at night — near-black,
warm parchment ink, gold catching the light."

It has never rendered. Nothing in the codebase sets the `.dark` class. A grep for
`prefers-color-scheme|data-theme|\.dark|darkMode` across `src/` matches exactly one
file, and that file is the stylesheet defining it.

So this is not "add dark mode". It is: switch on a theme that was designed and
then left unreachable, and fix what has drifted in the meantime.

## What has drifted

`:root` defines 49 tokens. `.dark` overrides 33. The 16 that were never given a
dark value are all in live use:

| Token | Light value | Uses | Verdict |
|---|---|---|---|
| `--rose` | `#a8425a` | 3 | needs a dark value |
| `--gold-light` | `#d4af6a` | 2 | needs a dark value |
| `--gold-dark` | `#6e5416` | 15 | needs a dark value |
| `--live` | `#c6543f` | 3 | needs a dark value |
| `--border-light` | `#f0e6d1` | 6 | needs a dark value |
| `--border-strong` | `#dcceb0` | 12 | needs a dark value |
| `--ink-photo` | `#5a4b3c` | 2 | needs a dark value |
| `--ink-caption` | `#6b5b45` | 2 | needs a dark value |
| `--placeholder` | `#a79574` | 7 | needs a dark value |
| `--placeholder-soft` | `#c9b896` | 3 | needs a dark value |
| `--chart-oldest` | `#e5d9c0` | 3 | needs a dark value |
| `--console` | `#1b1310` | 8 | **keep** — already a dark surface |
| `--console-card` | `#241b16` | 2 | **keep** — already a dark surface |
| `--console-ink` | `#b9a98c` | 2 | **keep** — ink for that dark surface |
| `--miss` | `#e08a76` | 2 | **keep** — authored for the dark reveal |
| `--radius` | `0.625rem` | — | **keep** — not a colour |

The first eleven are what break. `--border-light` at `#f0e6d1` and `--chart-oldest`
at `#e5d9c0` would draw near-white on a `#1b1310` ground; `--ink-photo` and
`--ink-caption` are dark browns that disappear into it.

The four "keep" rows matter as much as the eleven. The reveal screen is
deliberately dark in BOTH themes — that is what `--console*` is for — and
overriding them in `.dark` would be a regression dressed up as thoroughness.

## Architecture

### 1. `src/lib/theme.ts` — the store

Mirrors `src/lib/wset/wset-lang.ts`, which already solves this exact problem for
the WSET sheet language: `useSyncExternalStore`, `localStorage`, a `storage`
listener for cross-tab agreement, no provider. Following it means one pattern for
client preferences in this codebase rather than two.

Two pieces of state, and conflating them is the mistake to avoid:

```
stored    "light" | "dark" | null      null = follow the OS
effective "light" | "dark"             what actually renders
```

`null` resolves through `matchMedia("(prefers-color-scheme: dark)")` — and
SUBSCRIBES to it, so a user who never clicks follows their OS switching at
sunset. An explicit choice pins the theme and the media query stops mattering.

Key: `blindr-theme`. Anything in storage that is not `"light"` or `"dark"` is
treated as absent, so a corrupted value degrades to following the OS rather than
throwing.

`getServerSnapshot` returns `"light"`. The server cannot know the OS preference,
and the inline script below is what prevents that default from ever being seen.

### 2. Anti-flash — an inline script in `layout.tsx`

Without this, every dark-mode user gets a parchment flash on every navigation:
React only applies the class after hydration, and paint happens first.

A synchronous script in `<head>` reads the same key and the same media query and
sets `classList.toggle("dark")` plus `style.colorScheme` on `<html>` before the
first paint. It is duplicated logic with `theme.ts` by necessity — it has to run
before any module loads — so it is deliberately kept to the smallest expression
of the rule, with a comment pointing at the store as the source of truth.

`<html>` gains `suppressHydrationWarning`, because the script mutates the element
React is about to hydrate. This is required, not cosmetic: without it React warns
on every load in development.

`style.colorScheme` is set alongside the class so native scrollbars, form
controls and the autofill background follow the theme. The class alone does not
do that.

`viewport.themeColor` becomes a two-entry array keyed on `prefers-color-scheme`
instead of the fixed `#5C1A2B`, so mobile browser chrome matches the page.

### 3. `globals.css` — the eleven tokens

Added to the existing `.dark` block, in the same order and with the same grouping
comments as `:root`, so the two blocks stay diffable side by side.

Values follow the palette's own logic rather than being invented: borders become
low-alpha parchment like the `--border` and `--input` already in `.dark`; the
ink and placeholder shades move to the muted-foreground family; `--chart-oldest`
inverts from "palest" to "darkest" because in a dark chart the oldest series is
the one closest to the ground.

### 4. `src/components/theme-toggle.tsx` — the control

An "Appearance" `Card` on `/profile/edit`, below "Edit profile". That page is the
settings home — there is no `/profile` index, only `edit` and `numbers`.

A two-state click toggle, sun and moon. When a choice is pinned, a quiet
"Match system" reset appears beneath it. Without that, one click strands the user
off their OS setting permanently with no way back — and a three-way control in
the normal state is more UI than this earns.

There is no `switch.tsx` in the ui kit, so the toggle is built from `Button`.

## Testing

`src/lib/theme.test.ts`:

- nothing stored, OS dark → `dark`
- nothing stored, OS light → `light`
- stored `"dark"`, OS light → `dark` (an explicit choice beats the OS)
- garbage in storage → falls back to the OS rather than throwing
- clearing the choice returns to following the OS

Plus `tsc --noEmit` and `lint --max-warnings=0`.

No database, no migration, no staging. This touches no wine-map or tiles path.

## Out of scope

The 207 hardcoded hex values in `.tsx`/`.ts` — 87 of them wine-map layer paint,
which needs a second map palette and a tiles-side check. Dark mode reaches the
chrome around the map; the map canvas stays light-styled.

Anything found looking visibly wrong is to be reported at the end as options, not
folded into this change.
