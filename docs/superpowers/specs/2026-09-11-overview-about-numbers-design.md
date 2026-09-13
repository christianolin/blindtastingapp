# Overview, About and Your numbers — design spec

Implements the Claude Design handoff `design_handoff_blindr_pages` (README +
`Blindr Front Page v3.dc.html`, anchors `#5a` Overview, `#5c` About, `#5b`
Your numbers). The handoff README is the visual source of truth — colours,
type, spacing, radii, hover states and copy are final. This spec records how
that design maps onto the repo, which numbers the schema can actually back,
and the decisions taken where the handoff was open or diverged from the app.

## Routes

| Route | Role | Notes |
|---|---|---|
| `/overview` | Logged-in landing page | `/` now redirects here. Sidebar gets an **Overview** top-level item above Taste. |
| `/about` | Information-only page | Hero photo, mission copy, four modes, scoring, "what Blindr keeps". Reached from the photo band at the foot of Overview and Your numbers. Nothing in the sidebar is active. |
| `/profile/numbers` | Personal stats | Not a nav pillar. Reached from the "Your numbers" pill in the top bar and from the profile block at the foot of the sidebar. |
| `/taste` | Taste pillar page (kept) | Loses the marketing hero, explainer cards and mission copy (all moved to `/about`). Keeps the Start-tasting menu and the Invited / Hosting / Attending / History tabs. "History" pills link to `/taste?tab=history`. |

Link targets the handoff proposed that do not exist in the repo are mapped to
the nearest real page rather than creating new routes: "All notes" →
`/cellar?tab=notes`; "History" → `/taste?tab=history`; "Open cellar" →
`/cellar`. The About top bar's back link goes to `/overview` (labelled
"← Back to Overview") — the handoff wrote "Back to Taste" against the old
landing page.

## Shell changes

- `nav-links.ts`: prepend `{ key: "overview", href: "/overview", label: "Overview", match: ["/overview"] }`; remove the "Overview" child from Taste. Everything else unchanged.
- Sidebar and mobile drawer logo → `/overview`. Icon for the Overview pillar: `LayoutDashboard`.
- Sidebar footer: the profile block becomes the active item with two indented sub-items — **Your numbers** (`/profile/numbers`) and **Profile & settings** (`/profile/edit`) — whenever the path starts with `/profile`. On other pages it stays the plain avatar + name link (to `/u/[id]`).
- Top bar (`AppHeader`): adds a **Your numbers** pill (`ChartColumn` icon, 1px gold border on card background, radius 8, bordeaux 12.5px/600 text) before the scan button. Below `md` it is an icon-only button styled like scan and bell (`aria-label` "Your numbers"; phone layout revision, 2026-09-12). The scan and bell buttons become 1px `border` on `card`, radius 8, hover `border-gold bg-white`. `AppHeader` accepts an optional `title` rendered as a Cormorant 20px page title next to the burger below `md` (Overview passes "Overview"; other pages pass nothing and look as before).
- Tablet (`md`–`xl`): the sidebar collapses to a 60px rail — logo mark, one icon per pillar with a 10px label under it, avatar pinned at the bottom. Tapping the rail's expand control opens the full 240px sidebar as an overlay drawer over the content (closes on backdrop tap, on navigation, or with the X). Below `md` the existing `MobileNav` hamburger is unchanged.

## Tokens

Added to `globals.css` `:root` and mapped in `@theme inline` so Tailwind utilities exist (`bg-rose`, `text-gold-dark`, `border-border-strong`, …). Hex values are the handoff's.

| Token | Value | Use |
|---|---|---|
| `--rose` | `#A8425A` | third chart series, "decline" accents |
| `--gold-light` | `#D4AF6A` | eyebrow + numerals inside the live banner |
| `--gold-dark` | `#6E5416` | small gold text on parchment (SOON badge) |
| `--live` | `#C6543F` | the pulsing live dot |
| `--border-light` | `#F0E6D1` | row dividers inside cards |
| `--border-strong` | `#DCCEB0` | card outer border, page-section rules |
| `--ink-photo` | `#5A4B3C` | body text over the photo band |
| `--ink-caption` | `#6B5B45` | captions over the photo band |
| `--placeholder` | `#A79574` | chevrons, empty-slot text |
| `--placeholder-soft` | `#C9B896` | breadcrumb separators |
| `--chart-oldest` | `#E5D9C0` | oldest columns in a time series, hatch stripe |

Existing tokens already cover the rest: `--background` page, `--card` raised, `--muted` sunken/chart track, `--border`, `--primary` bordeaux, `--gold`, `--gold-deep` (gold hover), `--muted-foreground` ink-muted, `--foreground` ink.

Also added: `@keyframes live-ping` (dropped under `prefers-reduced-motion`, the dot stays) and a `.hatch` utility (`repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--chart-oldest) 6px 12px)`) for empty bottle/tasting images.

The pages commit to the parchment look; they do not define a dark palette (the app's `.dark` class is not used anywhere today).

## Shared components (`src/components/overview/`)

All server-safe unless noted. Sizes are the handoff's desktop values; the mobile scale is applied with responsive classes inside each component.

- `Eyebrow` — mono uppercase label (`font-mono`, 9.5–10.5px, tracking .12–.16em, `text-muted-foreground`).
- `LinkPill` — `<Link>` pill: 1px `border`, `bg-background`, radius full, 5/11px, 11.5px/600 bordeaux text, trailing `›`; hover `border-gold bg-white`. Props: `href`, `children`, `size?: "sm" | "md"` (md = 6/13px, 12px on the stats page).
- `StatTrio` — row of up to three `{ value, label }` stats: Cormorant 27px numeral (`lining-nums tabular-nums`) over 11px muted label; 21px / 10px on mobile, where the stats are three equal grid columns spanning the card.
- `SubjectCard` — the Overview card shell: 1px `border-strong`, `bg-card`, radius 13, `overflow-hidden`, flex column. Slots: `title`, `pill` (a `LinkPill`), `stats` (a `StatTrio`), `children` (rows), `action` (the button block: `mt-auto`, 14/18px padding, 1px `border` top). Card height stretches to the grid row so the three action buttons align. `hideActionOnPhone` drops the action below `md` (the Overview's tile row replaces it) and pads the body instead.
- `CardRow` — a row inside a card: 12/18px padding, 1px `border-light` bottom, optional 30×40 thumb (`HatchThumb`), a two-line block (13px/600 title + 11.5px muted meta), optional right value, and a `›` chevron in `placeholder`. Renders a `<Link>` when `href` is given, hover `bg-background`. Below `md` the mobile density (9/14px, 12.5px title, 11px meta) applies.
- `HatchThumb` — `img` when `src` is set, else the hatch, at the given size; 1px `border`, radius 4.
- `ActionButton` — full-width button/link, 14px/600, 13px padding, radius 10, icon + label, `shadow-[0_2px_0_0_rgba(42,33,30,.18)]`. Variants: `gold` (gold on ink, 700, hover `gold-deep`), `primary` (bordeaux on parchment, hover `#4A1523`), `outline` (white fill, 1.5px bordeaux border, bordeaux text, hover `bg-background`). Renders `<Link>` with `href`, or a `<button>` with `onClick` (client wrapper component `ActionButtonClient` for the modal launchers).
- `DistributionBar` — caption (optional, 11.5px/600 or an `Eyebrow`), a 7px `rounded-full` track in `muted` with percentage-width segments in fixed series order `primary → rose → gold → muted-foreground`, 2px surface gaps between segments, each segment carrying `title="Label · count"`; then a `justify-between` legend row of "Label count" in 11px muted. Props: `caption?`, `captionStyle?: "eyebrow" | "bold"`, `items: { label: string; count: number }[]` (max 4; callers fold the rest into "Other"), `height?: 6 | 7`.
- `AccuracyRows` — label (72px) / 7px track / right-aligned value rows. Props: `rows: { label: string; pct: number; value?: string }[]`, `tone?: (pct) => "primary" | "gold" | "rose"` (default: ≥50 primary, 30–49 gold, else rose), `trackHeight?: 6 | 7`.
- `ColumnChart` — flex row of `flex:1` columns at a fixed plot height (96–100px), radius 3 top corners, optional count label above each column (11px muted, tabular), optional axis row below (10.5px muted, either one label per column centred or a two-ended "first / last" pair). Props: `columns: { value: number; label?: string; tone?: "oldest" | "gold" | "primary" | "rose" }[]`, `height?`, `axis?: { kind: "per-column" } | { kind: "ends"; start: string; end: string }`, `showCounts?`. Each column has `title="label: value"`. A stacked variant `StackedColumnChart` takes `columns: { added: number; removed: number; label: string }[]` and draws `primary` over `gold` with a 2px gap.
- `AboutBand` — the photo band linking to `/about`: `next/image` `romanee.webp` (`fill`, `object-cover`, `object-[center_76%]`, `sepia(.24) saturate(.9)`), a left-to-right veil with **pixel stops** `linear-gradient(to right, rgba(245,239,227,.97) 0, rgba(245,239,227,.95) min(620px, 62%), rgba(245,239,227,.3) 84%, rgba(245,239,227,.08) 100%)`, h2 "More than a score" (Cormorant 29px), the verbatim paragraph, an "About Blindr ›" pill (1.5px bordeaux border on `card`), caption "Pictured: Romanée-Conti 1945" in `ink-caption`. `alt` text "A bottle of Romanée-Conti 1945". Hover lifts the whole surface (`shadow-[0_8px_20px_-8px_rgba(42,33,30,.5)]`).
- `LiveDot` — 7px dot in `live` with the ping duplicate behind it.
- `RangeControl` (client) — the segmented range switch for Your numbers: `EDE4D1` group, radius 9, 3px padding; active item `bg-card`, radius 7, 7/14px, 12.5px/600, `shadow-[0_1px_2px_rgba(42,33,30,.08)]`. Writes `?range=all|year|90d` with `router.replace` (server re-renders the sections). Full width, `flex:1` items, below `md`.

Chart accessibility (dataviz skill): the categorical order above was validated against the card surface — it passes the colour-vision separation checks in that fixed order; the gold segment's contrast (2.27:1) is relieved by the legend row, the 2px gaps and the per-segment `title`. Text never wears series colour: values and labels stay in `foreground`/`muted-foreground`. One series per chart, no dual axes.

## Overview page (`/overview`)

Server component. Fetches everything through `getOverviewData(userId)`; the only client state is the invitation accept/decline optimism and the modal launchers (Start a blind tasting → `openTaste("blind")`, Rate a wine → `openTaste("rate")`, Add a bottle → `openAddWine("cellar")`).

Layout (≥ `xl`): content column `p-[22px_26px_26px]`, flex column, gap 22px: banner, card grid (`grid-cols-3`, gap 20, `items-stretch`, `flex-1`), then `AboutBand` pinned to the bottom (`mt-auto`). The page fills the content column (`min-h-full`) and scrolls only if the cards overflow.

Tablet (`md`–`xl`): cards `grid-cols-[repeat(auto-fit,minmax(320px,1fr))]`; the bottle grid drops to 4-up under one column.

**Phone layout revision (2026-09-12).** Below `md` the page scrolls like every other page instead of forcing the banner and three cards onto one screen (with real browser chrome that collapsed each card's content row and pressed its button against the border). Body `gap-[11px] p-[11px_14px_14px]`, in order: the banner, a row of three action tiles, then the three cards at their natural height. The tiles (`quick-actions.tsx`: `grid-cols-3`, gap 8px, each ≥ 64px tall, radius 11, a 20px icon over a 12px/600 label, the action buttons' press shadow) are "Taste blind" (`EyeOff`, `bg-gold`, `gold-deep` border), "Rate a wine" (`Wine`) and "Add a bottle" (`Amphora`), the last two bordeaux on `card` with `border-strong`; they open exactly what the card actions open (`useActionLauncher` in `action-button-client.tsx`). One exception to the gold: on the "nothing scheduled" banner the row would repeat that banner's own full-width gold "Start a tasting" — same sheet, 11px apart, the very wall of buttons this revision removes — so `page.tsx` passes `bannerKind` down and the Taste-blind tile takes the parchment surface too, leaving a single gold call to action on the screen. (The live banner keeps the gold tile: its gold chip sits inside the bordeaux banner and leads somewhere else.) So each card drops its action below `md` (`SubjectCard hideActionOnPhone`) and keeps its header (h2 18px, pill), a three-column `StatTrio` (21px / 10px) and exactly **one** content row: the first invitation or tasting, the newest note, or the Countries bar (empty states point "above" instead of "below"), with bottom body padding and no trailing row rule. Lists stay behind the header pill. The Next-up banner keeps "Next up · {date}" and adds a meta line under the title: "You're hosting" / "Hosted by {host}" · "{n} glasses so far" (`n` = `nextWinePosition − 1`; no "{k} in" while the banner data carries no joined count). Its two buttons stay side by side and the add button reads "Add a wine". The top bar's Your numbers pill becomes an icon-only button styled like scan and bell (`aria-label` "Your numbers") on every page's phone header. `AboutBand` stays hidden; tablet and desktop are unchanged.

### Live banner (conditional)

1. **Live** — a tasting with status `IN_PROGRESS` where I am a `JOINED` participant (the host is always JOINED). Prefer `timing_mode = LIVE`, then most recently created. Bordeaux banner, whole surface is a link to `/tastings/[id]`.
   - Eyebrow: `LiveDot` + "Live now · you are hosting" / "Live now · hosted by {host}" (gold-light mono 10px).
   - Title: tasting name, Cormorant 31px (24px mobile).
   - Meta (13px, parchment at 75%): `Wine {n} of {total} · {stage} · you are {rank} of {competitors} on {pts} pts`. `n` = index of the first not-fully-revealed wine (or `total` when all are revealed). `stage` = "guessing open" when that wine's `reveal_step` is 0, otherwise "{last revealed category} revealed" using `get_wine_reveal(wine).revealed_keys` (country, region, appellation, grapes, producer, designation, vintage); "all revealed" when every wine is revealed. Rank/points from `get_tasting_leaderboard` using the StandingsPanel competitor rule (JOINED, minus the host when `wine_source = HOST_PROVIDES`); the standings clause is omitted when I am not a competitor (host of a host-provides tasting). Semi-blind: "you are {rank} of {n} on {matched}/{total}". OPEN (Taste & Rate) tastings: meta `{wines} wines · {people} people · Taste & Rate` and no standings.
   - Action: gold chip "Back to the table" with the `Wine` icon. Mobile: eyebrow "Live now · hosting · 2nd of 7", title, full-width gold button.
2. **Next up** — no live tasting: the nearest upcoming `DRAFT` tasting where I am host or JOINED (scheduled in the future first, then unscheduled, then the most recently created). Parchment variant: 1px `border-strong` on `card`, eyebrow "Next up · {LocalDateTime} · you are hosting" (or "· hosted by {host}"), title 44px, a right-hand numbered list of the flight — for host-provides tastings one line per wine ("Wine 1 · set" / italic "Empty" in muted for slots the host has not filled, up to 6 slots; for bring-your-own one line per JOINED participant, "{name}'s wine" or "Empty" until they add). Actions: "Open the tasting" (primary, → `/tastings/[id]`) and, when I may add a wine, "Add a wine" (outline; it opens the universal add-wine sheet with this tasting as the flight destination, and carries no glass number).
3. **Nothing scheduled** — a single parchment row: "No tasting on the calendar" + a `Start a tasting` `ActionButtonClient` (gold) that opens the blind-tasting launcher. Never an empty bordeaux block.

### Blind tastings card

- Pill: History → `/taste?tab=history`.
- Stats: `{tastings}` tastings · `{avg}` avg points (1 decimal) · `{pct}%` region hit rate. From `getProfileStats(userId).summary` (`tastingsAttended`, `averagePoints`, `categoryAccuracy.region`). Mobile label "region hits".
- Rows, in this order, capped at 5 in total (mobile shows only the first): pending invitations (title, "{host} · {LocalDateTime | 'date to be set'}", inline **Accept** / **Decline**), then drafts I host ("Hosting · {date} · {wines} wines set" or, for bring-your-own, "{bottles} of {joined} bottles in"), then self-paced tastings in progress that I am attending ("Self-paced · {guessed} of {total} wines guessed"), then finished tastings I took part in, newest first ("{d Mon} · finished", right value "{ordinal} · {pts}" from `get_tasting_leaderboard`). Empty: one muted row "No tastings yet — start one below."
- Accept/Decline call `respondToInvite` (revalidates `/overview` too) inside a client `InvitationRow` with `useOptimistic` removing the row.
- Action: **Start a blind tasting** (gold, `EyeOff` icon) → `openTaste("blind")`.

### Your ratings card

- Pill: All notes → `/cellar?tab=notes`.
- Stats: `{wines}` wines rated (distinct catalog wines with a scored note) · `{avg}` avg score (mean `quality_score`, integer) · `{notes}` notes (all my notes). The handoff's "WSET notes" stat is dropped: every rating here is a WSET note, there is no separate quick rating.
- Rows: five most recent notes by `tasted_on` (then `created_at`): thumb = `catalog_wines.image_url`, title = `catalogWineTitle`, meta "{relative time} · Blind tasting | Training | WSET note" by `context_kind`, right value = score in Cormorant 20px bordeaux (omitted when null). Link → `/catalog/[wineId]`.
- Action: **Rate a wine** (primary, `Wine` icon) → `openTaste("rate")`.

### Your cellar card

- Pill: Open cellar → `/cellar`.
- Stats: `{bottles}` bottles (Σ quantity of lots with quantity > 0) · `{producers}` producers (distinct producer ids) · `{countries}` countries (distinct country ids).
- Body (14/18px padding, gap 13): 5-up bottle tile grid (4 most recently added lots, `HatchThumb` 64px high radius 5, `title` = wine title, link → `/catalog/[wineId]`, hover gold border + lift; 5th tile dashed gold "+{remaining bottles}" → `/cellar`); **Countries** `DistributionBar` (eyebrow caption, top 3 + Other); **Wine type** `DistributionBar` (top 4); **Recently added** — three lines "title · {storage_location ?? 'no rack'} · {qty}" linking to `/catalog/[wineId]`. Wine type = style when not `STILL` (Sparkling / Fortified / Sweet) else colour (Red / White / Rosé / Orange). Mobile shows only the Countries bar.
- Empty cellar: the grid shows one dashed tile "Add your first bottle" and the bars are omitted.
- Action: **Add a bottle** (outline, `Amphora` icon) → `openAddWine("cellar")`.
- No "ready to drink" and no "rated by you" statistic.

## About page (`/about`)

Static server component, login required. Top bar: thin strip (13/30px, 1px `border` bottom, `background/90`): "← Back to Overview" (13px/600 bordeaux) left, mono eyebrow "About Blindr" right. Nothing else on the page is interactive.

1. **Hero** — full-bleed `romanee.webp` (`object-[center_72%]`, sepia veil) with the pixel-stop veil `.97 0 → .94 min(600px,62%) → .3 82% → .06 100%`, padding 52/30/56, `shrink-0`. h1 "Understand what's in the glass." Cormorant 56px (40px `md`, 36px mobile), `tracking-[-.025em]`, `max-w-[15ch]`. Sub 16px/1.6 `ink-photo`: "Taste with structure, challenge yourself blind, and learn more from every bottle." Caption "Pictured: Romanée-Conti 1945" 12px `ink-caption`. Mobile: hero 394px tall with the bottom-up veil `to top, #F5EFE3 3%, rgba(245,239,227,.9) 40%, rgba(42,33,30,.3) 100%`, the back link and eyebrow rendered in parchment over the photo.
2. **More than a score** — flex row, gap 40, 40/30 padding, 1px `border` bottom: h2 (Cormorant 34px, 260px fixed) + two paragraphs (14.5px/1.75, `flex: 1 1 340px`, `max-w-[48ch]`), verbatim copy. Second paragraph weight 500 in `foreground`.
3. **Four ways to taste** — `bg-card`, 36/30 padding, h2 28px + note "Alone or around a table, on a phone or on a laptop."; four blocks `grid-cols-4` (2×2 at `md`, 1-up mobile), gap 14, radius 12, padding 20, `bg-background`; first block bordered gold, the rest `border`, the fourth dashed. 22px lucide icon (`EyeOff`, `ScanEye`, `Wine`, `Target`), Cormorant 22px title, 13px/1.55 `ink-photo` description. Copy verbatim from the mockup; Training Room carries the `SOON` badge (mono 9px, 1px gold border, `gold-dark` text).
4. **How a blind tasting is scored** — 260px heading block (h2 "How a blind tasting is scored" + 13px muted lead "Points are awarded per field as the host reveals, following the rule set chosen for the tasting.") + content: the static pills (Country, Region, Appellation, Grape, Vintage, Producer), then the real table — rule-set name **Danish Championship scoring**: Country 2 · Region 3 · Appellation 5 (only if the wine has one) · Primary grape 8 · Secondary grape 2 (only for a recorded blend) · Producer 6 · Type designation 2 (only if the wine has one) · Vintage 2 / 1 / 0 (exact / off by one year / otherwise; NV and tawny exact-only); a full wine is worth up to 30 points. Semi-blind: 1 point per glass matched to the right wine. Then the verbatim closing paragraph ("Every guess you commit is locked before the reveal…"). Rendered as a plain definition list with a 1px `border-light` rule between rows — no card, no links.
5. **What Blindr keeps** — `bg-card`, `flex-1`, heading + one 14px/1.75 paragraph, verbatim.

## Your numbers page (`/profile/numbers`)

Server component; `searchParams.range` ∈ `all | year | 90d` (default `all`). Header (18/30/16 padding, 1px `border` bottom): breadcrumb eyebrow "**{display name}** / Your numbers · since {Month YYYY}" (name links to `/u/[id]`, `since` = `profiles.created_at`), h1 "Your numbers" Cormorant 32px, `RangeControl` on the right. Mobile: back arrow (→ `/overview`) + stacked eyebrow/title, then the control full width.

Body: three sections (Blind tastings, Ratings, Cellar), each a header row (h2 26px, 13px muted summary, `LinkPill` right) + three cards (`grid-cols-3`, gap 18 → 2-up ≤ 1100px → 1-up ≤ 820px; 1px `border-strong`, `bg-card`, radius 12, 16/18 padding, mono eyebrow at the top). Sections 2 and 3 carry a 1px `border` top rule with 22px padding. `AboutBand` at the foot.

Data comes from `getYourNumbers(userId, range)` (pure maths in `your-numbers-math.ts`, unit-tested). The range filters: tastings by the guess's `scored_at`; ratings by `tasted_on`; cellar movements by lot `purchased_on ?? created_at` and consumption `consumed_on`. Cellar **Distributions** and **Vintages in the rack** describe current holdings and ignore the range (their eyebrows say "current holdings" when the range is not all-time).

**Blind tastings** — summary "{n} played · {glasses} glasses guessed · {avg} average points", pill History.
- *What you get right* — `AccuracyRows`: Country, Region, Appellation, Grape, Vintage ±1 (exact + off-by-one credit), Producer; pct = correct / applicable over scored guesses on fully revealed wines. Rows with 0 applicable read "—".
- *Points per tasting* — `ColumnChart` of my points in each of the last 8 tastings (oldest → newest, tones oldest ×2 → gold ×3 → primary ×3), axis "Tasting {first ordinal}" / "latest"; footer rows "Best score {pts} pts · {tasting name}" and "Trend {±x.x} pts over {k} tastings" (mean of the newest half minus mean of the oldest half; needs ≥ 4 tastings, else "Trend needs a few more tastings").
- *How you place* — placement `DistributionBar` (1st / 2nd / 3rd / Lower, counts) from `get_tasting_leaderboard` per finished-or-fully-revealed tasting (competitor rule as above; ties share a rank), plus "Where you taste best": avg points per wine grouped by the wine's **region**, regions with ≥ 2 wines, top 4, as `AccuracyRows` with the value = avg points (bar width relative to the best region; tone by share of the maximum).

**Ratings** — summary "{wines} wines rated · {notes} notes · average {avg}", pill All notes.
- *Score distribution* — `ColumnChart` with counts: `<80`, `80–84`, `85–89`, `90–94`, `95+` (tones oldest, gold, primary, primary, rose).
- *What you rate* — two `DistributionBar`s with bold captions (**Wine type**, **Country**; top 3 + Other) and four grape rows (`AccuracyRows`, value = count, width relative to the top grape) by the noted wines' primary grape.
- *Notes per month* — `ColumnChart` of the last 8 calendar months (ends axis "Mon / Mon"), footer "**{n} notes** this month, your best yet" (or "{n} notes this month" when not the best) and "Longest streak: {w} weeks running" (consecutive ISO weeks with ≥ 1 note).

**Cellar** — summary "{bottles} bottles · {producers} producers · {countries} countries", pill Open cellar.
- *Distributions* — three bold-caption bars: **Country**, **Wine type**, **Reds by grape** (red wines only, top 2 grapes + Other; captioned as grape data).
- *Vintages in the rack* — counted `ColumnChart`: `≤2010`, `2011–14`, `2015–17`, `2018–20`, `2021+` (quantity-weighted, `YEAR` vintages only); footer "Oldest {title}" and "Median vintage {year}" (quantity-weighted median).
- *Bottles in, bottles out* — `StackedColumnChart` over the last 6 months: added (Σ `purchased_quantity` by `purchased_on ?? created_at`) over drunk (Σ consumption quantity with reason `DRANK` by `consumed_on`), swatch legend "added / drunk", axis "{Mon} → {Mon}"; footer "Added this year {n}" and "Opened this year {n}" (labels become "in the last 90 days" for `90d`). **"Poured into tastings" is dropped** — the schema does not model which consumptions went into a tasting.

Any card whose inputs are empty renders its eyebrow and a one-line muted empty state ("No scored guesses yet", "No notes yet", "No bottles yet") instead of an empty chart.

## Data contracts

Defined in `src/lib/overview-types.ts` and `src/lib/your-numbers-types.ts` so the page components and the fetchers can be built independently. See the plan for the exact TypeScript.

## Out of scope

The `/tastings/[id]` add-wine redesign (`3a`–`3c`), real bottle/cover photography, dark-mode variants of the three pages, and a `/profile/notes` route.
