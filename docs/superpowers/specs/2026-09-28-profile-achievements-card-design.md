# Profile achievements card in the site's design — design

Date: 2026-09-28. Branch `achievements-card` off production master `0beda2c`. Status: **approved to build** under the owner's standing instruction for this work ("just write the design and then implement"). It changes the approved levels spec (`docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md` §8.4 and L32's wording); the §9 step 9 amendment records that. Every new user-facing string below stays **PROVISIONAL** until the owner approves it (levels spec C3) — it ships flagged, and the owner's answer is applied afterwards. §12's base choices are taken as recommended: chips go (not O1), "Show fewer" (O2 yes), "Closest" (O3), catalogue-order tie-break (O4), no phone cap (O5 no), and the three-number trio (O6 only if the browser check finds it repetitive).

This design is built on the "Your-numbers parity" proposal. It takes grafts from the "Minimal & calm" and "Badge shelf" proposals, as all three judges recommended. All pixel sizes are estimates from Tailwind classes. Nothing was measured in a browser (§11 closes that gap).

## 0. The owner's words

> "I want to make the achievements part of your profile more in sync with the rest of the design on the website."

## 1. Summary

The `/u/[id]` "Level & achievements" card keeps its place (directly under `ProfileHeader`), its `StatCard` shell and its data. What changes is the inside: today it uses the generic Tailwind scale; the new card is built from the primitives the Your numbers page and the `/u/[id]` stat cards already use.

- **Collapsed:** a `StatTrio` (level · XP in all · achievements), then a single `AccuracyRows` level row, then `StatFooterRow`s for "Latest" and, on your own profile only, "Closest". On a laptop these three sit on one line.
- **Expanded:** Earned (and Not yet, own profile only), each under an Eyebrow group heading with a hairline rule, then 11.5px semibold category captions. The lists flow into 2 or 3 CSS columns.
- **Toggle:** a text button with a chevron, at the right of the card's header row.
- **Removed:** the chips, the category icons, the `bg-secondary` track, and the translucent `/80` hover with its `dark:` overrides.

What stays the same:
- The page (`page.tsx` only gains one prop).
- `snapshot.ts` and `read.ts`, and every RLS rule.
- The ring, `LevelPill` and the toaster.
- Rule 1 behaviour.

## 2. Decisions

- **A1 — Place, shell and data unchanged.** The card stays a `StatCard`, directly under `ProfileHeader`, and still shows when the stats empty state replaces everything below it. Reason: L32 still holds, and the data layer is correct.
- **A2 — Build the inside from shared primitives used as they are:** `StatTrio`, `AccuracyRows`, `StatFooter`/`StatFooterRow`, `Eyebrow`. Reason: this is what "in sync" means here, and hand-copied class strings drift when the primitives change.
- **A3 — The card title becomes a real heading.** It is `<h2><Eyebrow size="sm">` with `aria-labelledby` on the section. Earned and Not yet become h3; categories become h4. Reason: this matches ProfileTastings and ProfileNotes and fixes today's orphan "Earned" h2. The sibling stat cards keep span titles because they have no sub-headings.
- **A4 — Collapsed = trio | level row | footer, on one row from 1100px.** Reason: L32's "one row collapsed" actually holds. Today it wraps from about 5 chips.
- **A5 — The level bar is an `AccuracyRows` row: `bg-muted` track, `bg-gold-deep` fill.** The fill comes from a new additive `BarTone` value, `"level"`. Reasons:
  - it echoes the ring (L30);
  - `bg-muted` is the redesign's one track token;
  - `bg-gold` already means a 30–49% hit rate in the Accuracy card directly below;
  - contrast is better: 2.39:1 against 1.92:1 in light mode.
- **A6 — Not yet progress uses the same row and tone at 6px** (today it is 4px on `bg-secondary`). Reason: one series per chart. Hit-rate tones are not used because they would paint 10% progress rose, which reads as failure.
- **A7 — The collapsed chips go; the "Latest" row names the newest achievement.** Chips return only if the owner picks O1. Reason: they are the fourth chip style on the page, and their wrapping is what breaks L32's one row.
- **A8 — The toggle is a text button with a rotating `ChevronDown`, at the right of the header row, not a LinkPill-shaped pill.** Reason: on Overview a bordered pill in a card header means "go somewhere". ProfileNotes' toggle on this same page is a text button.
- **A9 — The toggle uses solid `text-primary` and `hover:underline`, with no `/80` and no `dark:` classes.** Reason: `globals.css` (430–452) measured the translucent hover under AA and already remaps `text-primary` in dark.
- **A10 — Expanded headings follow the notes-list idiom (Eyebrow plus an `h-px flex-1` rule). Category captions are 11.5px semibold with no icons.** Reason: these are the site's existing grouped-list heading and the "Countries"/"Regions" caption. No other stat card puts icons in a subhead.
- **A11 — Not yet is grouped by category like Earned, in catalogue (ladder) order, with no cap.** Reason: the card now agrees with itself; ladders read in order; "Closest" already surfaces the nearest one; and expanding is opt-in.
- **A12 — Expanded groups flow in CSS columns** (`md:columns-2 min-[1100px]:columns-3`, `break-inside-avoid`). Reason: a grid would leave ragged gaps between a 5-row and a 2-row group. Columns also stop a name sitting about 1,000px from its date. The aroma picker is the production precedent.
- **A13 — Achievement count: "7/20" (spoken "7 of 20") only when `locked !== null`, i.e. your own profile. Anyone else sees the visible count alone, singular or plural.** Reason: Rule 1. No "of N" can reach another viewer.
- **A14 — "Latest" order:** achievements that were not backfilled, newest `unlockedAt` first; then backfilled ones; ties in catalogue order. Reason: the order is deterministic, and a real unlock always beats "Before levels".
- **A15 — "Closest"** (own profile only) is the locked achievement with the largest fraction above 0, ties in catalogue order. The row is left out when nothing has progress. Reason: a calm nudge that never appears for anyone else.
- **A16 — Your own card reads XP through `useOwnLevel`** (a new `liveUserId` prop), the same way the ring does. Reason: a 27px level numeral right under the live ring must not disagree with the ring's badge.
- **A17 — "All achievements" stays as the label, including on your own profile with nothing earned.** Reason: on your own profile the panel lists every one of the 20 (Earned plus Not yet), so the label is literally true, and no new copy is needed.
- **A18 — Not yet's "+50 XP" bonus is muted, not gold-dark.** Reason: text never wears a series colour, and the redesign keeps values in foreground or muted.
- **A19 — Each row carries an sr-only state prefix:** "Earned: 12 Sep 2026", "Not yet: +50 XP". Reason: a row read out of context still says its state. The words already exist (`CARD_COPY.earned` / `notYet`).
- **A20 — Shared primitives only gain additive, optional props,** and new tests pin their current markup before the change:
  - `StatCard`: `headingId`, `action`
  - `StatFooterRow`: `labelClassName`
  - `BarTone`: `"level"`

  Reason: the Your numbers page and ProfileStatCards must not move.
- **A21 — The deviation is recorded** as a dated §8.4 amendment and an L32 note in the levels spec, plus one sentence in CLAUDE.md. Reason: the approved spec prescribes the chips, the `bg-secondary` track and the old toggle.

## 3. Collapsed card

### 3.1 Shell and header (all widths)

```tsx
<StatCard
  title={CARD_COPY.title}
  headingId={titleId}
  action={v.canExpand ? <ExpandToggle open={open} controls={panelId} onToggle={…} /> : null}
  className="gap-[13px]"
>
  <LevelCardSummary view={v} />
  {open ? <LevelCardDetails view={v} panelId={panelId} /> : null}
</StatCard>
```

**What `StatCard` renders** with the new props:
- The shell is unchanged: `rounded-xl border border-border-strong bg-card p-[16px_18px] max-md:p-[14px_16px]`.
- `gap-[13px]` is the Your numbers gap for cards with several blocks.
- The section gets `aria-labelledby={headingId}`.
- The header row is `<div className="flex items-center gap-2.5">`, holding `<h2 id={headingId} className="leading-none"><Eyebrow size="sm">Level & achievements</Eyebrow></h2>` and `<div className="ml-auto">{action}</div>`.
- With no `action`, only the h2 renders. With neither prop, the output is byte-identical to today.

**`ExpandToggle`** is local to `level-card.tsx` and not exported:

```tsx
<button
  type="button"
  aria-expanded={open}
  aria-controls={controls}
  onClick={onToggle}
  className="relative inline-flex items-center gap-1 rounded-sm text-[12.5px] leading-none font-semibold whitespace-nowrap text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring after:absolute after:-inset-x-2 after:-inset-y-[15px] after:content-[''] md:pointer-fine:after:content-none"
>
  {open ? CARD_COPY.showFewer : CARD_COPY.showAll}
  <ChevronDown aria-hidden className={cn("size-3.5 motion-safe:transition-transform", open && "rotate-180")} />
</button>
```

- **Type:** 12.5px/600 `text-primary` is the redesign's show-more type (`tastings-tabs.tsx`, `notes-list.tsx`).
- **Tap target:** the `::after` pad copies LinkPill. It gives a hit area of about 44px on any touch pointer without making the header row taller. With a fine pointer at `md` and up, the pad is dropped (the site's `md:pointer-fine` rule).
- **Chevron:** the `candidates-panel.tsx` disclosure precedent.
- **Stability:** the button stays in the header when the card opens or closes, so it never jumps. Focus stays on it.

### 3.2 Summary: laptop (owner's desktop Chrome, about 1675×865)

The content column is about 1104px and the card's inner width about 1066px.

```tsx
<div className="grid gap-[13px] md:grid-cols-2 md:items-center md:gap-x-9 min-[1100px]:grid-cols-3">
  <StatTrio stats={trioStats(v.trio)} />
  <AccuracyRows
    rows={[{ label: v.levelRow.label, pct: v.levelRow.fraction * 100, value: v.levelRow.value, tone: "level" }]}
    labelWidth={72}
    valueWidth="auto"
  />
  <StatFooter className="md:col-span-2 min-[1100px]:col-span-1 min-[1100px]:border-t-0 min-[1100px]:pt-0">
    {v.empty ? (
      <p className="text-[12.5px] text-muted-foreground italic">{v.empty}</p>
    ) : (
      <StatFooterRow label={CARD_COPY.latest} value={v.latest} />
    )}
    {v.closest ? <StatFooterRow label={CARD_COPY.closest} value={v.closest} /> : null}
  </StatFooter>
</div>
```

**The three blocks:**
- **`StatTrio`** is unchanged: 27px Cormorant numerals with `lining-nums tabular-nums` over 11px muted labels. `trioStats` maps a `spoken` entry to `<><span aria-hidden>7/20</span><span className="sr-only">7 of 20</span></>`, the LevelPill pattern.
- **`AccuracyRows`** gets a single row:
  - 7px `bg-muted` track, `bg-gold-deep` fill (`tone: "level"`);
  - a muted 72px label ("To level 13");
  - the value in muted `tabular-nums` ("210 / 600 XP");
  - the row's `title` "To level 13: 210 / 600 XP".
- **`StatFooter` / `StatFooterRow`:** a 12px muted label on the left and a semibold value on the right that truncates. At 1100px and up the footer is the third column, so its top rule is dropped there.

**Layout by width:**

At 1100px and up (three columns of about 331px):

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ LEVEL & ACHIEVEMENTS                                                   All achievements ⌄ │
│                                                                                           │
│ 12      4,210       7/20            To level 13 ▓▓▓▓▓░░░░░░░ 210 / 600 XP   Latest   Serious cellar · 12 Sep 2026 │
│ level   XP in all   achievements                                          Closest    Note taker · 12 / 25 │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

The estimated height is about 115px. Today it is about 110–150px and depends on how the chips wrap.

From `md` to 1099px there are two columns (trio | level row), with the footer across both under its hairline rule.

### 3.3 Summary: phone (375px iPhone, card inner width about 309px)

Everything stacks in one column with 13px gaps:

```
┌──────────────────────────────────────┐
│ LEVEL & ACHIEVEMENTS  All achievements ⌄ │  ← about 144px + about 123px; the pad makes a 44px target
│ 12          4,210        7/20        │  ← StatTrio's phone grid, grid-cols-3
│ level       XP in all    achievements│     21px numerals / 10px labels
│ To level 13 ▓▓▓▓▓░░░░░ 210 / 600 XP  │  ← track about 130–150px
│ ──────────────────────────────────── │
│ Latest    Serious cellar · 12 Sep 2026│
│ Closest           Note taker · 12 / 25│
└──────────────────────────────────────┘
```

- **Collapsed height:** about 190px. Today it is about 250–280px, because the chips wrap and the toggle takes its own 44px row.
- **Width:** nothing is wider than 309px, so there is no horizontal scroll.
  - Worst trio value: "88,500" at 21px is about 55px.
  - Worst level value: "2,775 / 2,900 XP" still leaves a track of about 110px.
  - Worst footer value: "Host for the night · Before levels" is about 215px and truncates if a future name is longer.

### 3.4 States

| Viewer | Trio | Level row | Footer | Toggle |
|---|---|---|---|---|
| Own profile, some earned | `12` level · `4,210` XP in all · `7/20` achievements (sr "7 of 20") | To level 13 … 210 / 600 XP | Latest, plus Closest if anything has progress | yes |
| Own profile, none earned | `1` · `30` · `0/20` (sr "0 of 20") | To level 2 … 30 / 50 XP | italic "No achievements yet.", plus Closest if any progress | yes (the panel lists all 20 under Not yet, A17) |
| Own profile, all 20 earned | `…` · `…` · `20/20` | as it stands | Latest only | yes (Earned only) |
| Someone else, some visible | `12` · `4,210` · `7` achievements (or `1` achievement) | as it stands | Latest only | yes |
| Someone else, none visible (none earned **or** all hidden, which render identically) | `1` · `0` · `0` achievements | To level 2 … 0 / 50 XP (empty track) | italic "No achievements yet." | **no** (`canExpand` false) |
| Top level | `60` · `88,500` · … | Top level … Level 60 (full track) | as it stands | as it stands |

## 4. Expanded panel

`LevelCardDetails` stays exported and hook-free (renderable with `renderToStaticMarkup`):

```tsx
<div id={panelId} className="flex flex-col gap-[18px]">
  {v.earnedGroups.length > 0 ? (
    <section aria-labelledby={`${panelId}-earned`} className="flex flex-col gap-[11px]">
      <GroupHeading id={`${panelId}-earned`}>{CARD_COPY.earned}</GroupHeading>
      <CategoryColumns groups={v.earnedGroups} renderItem={EarnedItem} />
    </section>
  ) : null}
  {v.notYetGroups && v.notYetGroups.length > 0 ? (
    <section aria-labelledby={`${panelId}-not-yet`} className="flex flex-col gap-[11px]">
      <GroupHeading id={`${panelId}-not-yet`}>{CARD_COPY.notYet}</GroupHeading>
      <CategoryColumns groups={v.notYetGroups} renderItem={NotYetItem} />
    </section>
  ) : null}
</div>
```

The old `border-t pt-3` goes, because the Earned heading's rule does the separating. The card's 13px gap sits above the panel.

- **`GroupHeading`** (local): `<div className="flex items-center gap-2.5">`, then `<h3 id={id} className="leading-none"><Eyebrow size="sm">{children}</Eyebrow></h3>`, then `<span aria-hidden className="h-px flex-1 bg-border-light" />`. This is the notes-list idiom with the in-card hairline token, and the rule stays visible on phones.
- **`CategoryColumns`** (local): `<div className="gap-x-9 md:columns-2 min-[1100px]:columns-3">`.
  - Each category is a plain block, `<div className="mb-4 break-inside-avoid last:mb-0">`. This copies the aroma-picker precedent: a block child, not a flex child.
  - Each block holds `<h4 className="mb-[7px] text-[11.5px] font-semibold">{label}</h4>` and `<ul className="flex flex-col gap-[9px] max-md:gap-2">`.
  - Categories come in `CATEGORY_ORDER`; an empty category is left out. There are no icons.
- **`EarnedItem`**, on every profile:

  ```tsx
  <li className="flex flex-col gap-px">
    <StatFooterRow
      label={item.name}
      labelClassName="font-semibold text-foreground"
      value={<><span className="sr-only">{CARD_COPY.earned}: </span>{item.when}</>}
      valueClassName="font-normal text-muted-foreground"
    />
    <span className="text-[11px] leading-snug text-muted-foreground">{item.description}</span>
  </li>
  ```

  Line 1 is 12px: the name on the left and the date in `tabular-nums` on the right, which is either a UTC `formatUtcDate` string ("12 Sep 2026") or "Before levels".
- **`NotYetItem`**, own profile only:

  ```tsx
  <li className="flex flex-col gap-[3px]">
    <AccuracyRows
      rows={[{ label: item.name, pct: item.fraction * 100, value: item.progress, tone: "level" }]}
      trackHeight={6}
      labelWidth={120}
      valueWidth={52}
    />
    <span className="flex items-baseline justify-between gap-3 text-[11px] leading-snug text-muted-foreground">
      <span className="min-w-0">{item.description}</span>
      <span className="shrink-0 tabular-nums"><span className="sr-only">{CARD_COPY.notYet}: </span>{item.bonus}</span>
    </span>
  </li>
  ```

  - The name is muted, as `AccuracyRows` labels always are, so not-yet items read quieter than earned names.
  - The right-hand column holds only numbers: "12 / 25" above, "+50 XP" below.

### 4.1 Laptop

```
│ EARNED ─────────────────────────────────────────────────────────────────────────────── │
│ Cellar                          Tastings                         Notes                   │
│ First bottle      Before levels First flight       12 Sep 2026   First impressions  …    │
│ Add your first bottle to your…  Finish your first blind tasting. Write your first …      │
│ Serious cellar     12 Sep 2026  …                                Training                │
│ …                                                                …                       │
│ NOT YET ────────────────────────────────────────────────────────────────────────────── │
│ Cellar                          Tastings                         Notes                   │
│ Fifty corks ▓▓▓▓░░░░░░  12 / 50 Host for the night ░░░░░  0 / 1  Critic ▓▓░░░░░  18 / 100│
│ Drink 50 bottles from…  +100 XP Host your first blind…  +50 XP   Write 100 tasting… +150 XP│
```

- Groups flow down column 1, then column 2, then column 3; reading order is DOM order.
- Estimated worst case, your own profile with all 20 across both sections: about 300–450px.
- Someone else's panel is as short as their visible Earned list.

### 4.2 Phone

- One column.
- Earned items are about 32–35px; Not yet items about 38–45px, since a description can wrap next to its bonus.
- Not yet progress rows: a 120px label, a track of about 120px and a 52px value.
- Worst case, your own profile with 20 items: about 1,000–1,200px. Today it is about 1,150–1,200px. It is opt-in behind the toggle; O5 below is the lever if it still feels long.
- "Fewer" / "Show fewer ⌃" stays at the top of the card. After a long read you scroll back up to press it. That was chosen over a bottom toggle, which jumps on iOS Safari because Safari has no scroll anchoring.

### 4.3 Cases

- **Your own profile:** Earned by category, then Not yet by category. With nothing earned, only Not yet renders: all 20 achievements, so "All achievements" is true.
- **Someone else's:** Earned only, from visible rows only. A PRIVATE-cellar owner's cellar achievements never arrive (RLS), so the Cellar group is simply absent: no heading, no count, no placeholder.
- **Someone else with none:** there is no toggle and no panel.

## 5. Dark mode

Only tokens are used; there are no `dark:` utilities and no hex values anywhere in the card. Values come from the `.dark` block in `globals.css`.

| Element | Token | Dark value |
|---|---|---|
| Card | `bg-card` | `#241b16` |
| Card edge | `border-border-strong` | rgba(245,239,227,.52) |
| Track | `bg-muted` | `#2e2419` |
| Fill | `bg-gold-deep` | `#c3a25b`; about 6.25:1 on the track (light: 2.39:1) |
| Toggle | `text-primary` | remapped to `--primary-ink` `#cc6b82` and to `--primary-ink-hover` on hover by `globals.css` 446–452; the light-mode hover changes only the underline |
| Rules | `bg-border-light` / `border-border-light` | rgba(245,239,227,.22) |
| Text | `text-foreground`, `text-muted-foreground` | — |
| Focus | `outline-ring` | — |

The app is light by default. Dark renders only after the user picks it from the theme menu (`readTheme`, `THEME_SCRIPT`), so check it by switching the menu, not by emulating `prefers-color-scheme`.

## 6. Accessibility

**Heading outline** (your own profile, expanded):
- h1 name
- h2 Level & achievements
  - h3 Earned, then h4 per category
  - h3 Not yet, then h4 per category
- h2 Tastings
- h2 Notes

No level is skipped. Collapsed, the card still has its h2.

**Landmarks:** the card `section` is `aria-labelledby` its h2; the Earned and Not yet sections are `aria-labelledby` their h3s.

**Disclosure:**
- It is a native `<button type="button">` with `aria-expanded` and `aria-controls={panelId}`.
- The chevron is `aria-hidden`, and its rotation is `motion-safe` only.
- Focus stays on the button. It has a focus-visible outline in `outline-ring`.
- The panel still mounts only when open, as today. If an audit flags `aria-controls` pointing at a panel that is not rendered, render it with `hidden` instead.

**Tap targets:** the toggle is the card's only control. It gets 44px or more through the `::after` pad on every non-fine pointer. The chips are gone, so there are no other targets.

**Spoken text:**
- The trio reads "12 level", "4,210 XP in all", "7 of 20 achievements". The visible "7/20" is `aria-hidden` because VoiceOver can read it as a date.
- Earned rows read "{name}, Earned: 12 Sep 2026, {description}".
- Not yet rows read "{name}, 12 / 25, {description}, Not yet: +50 XP".
- Bar tracks carry no text. Every number is stated in visible text, which is L30's basis for accepting the low-contrast gold-deep fill.

**Contrast:** text is `text-foreground` or `text-muted-foreground` on `bg-card`, and the toggle is solid `text-primary` with no translucent hover.

## 7. Copy

All copy lives in `src/lib/levels/copy.ts`: relative imports only, no React.

**Reused unchanged:**
- `CARD_COPY.title` "Level & achievements"
- `CARD_COPY.showAll` "All achievements"
- `CARD_COPY.earned` "Earned"
- `CARD_COPY.notYet` "Not yet"
- `CARD_COPY.beforeLevels` "Before levels"
- `CARD_COPY.noneYet` "No achievements yet."
- `CARD_COPY.topLevel` "Top level"
- `levelHeading(60)` "Level 60" (now only the top-level row's value)
- `progressText(12, 25)` "12 / 25"
- `bonusText(50)` "+50 XP"
- `formatXp` "4,210"
- `formatUtcDate` "12 Sep 2026"
- every `ACHIEVEMENTS` name and description
- `CATEGORY_LABELS` (Cellar, Tastings, Notes, Training, Friends)

**sr-only composition** (no new words): `${CARD_COPY.earned}: ` gives "Earned: ", and `${CARD_COPY.notYet}: ` gives "Not yet: ".

**New, PROVISIONAL:**

| Key / helper | Output |
|---|---|
| `CARD_COPY.levelLabel` | "level" |
| `CARD_COPY.xpLabel` | "XP in all" |
| `CARD_COPY.latest` | "Latest" |
| `CARD_COPY.closest` | "Closest" (alternative for the owner: "Nearly there") |
| `achievementsLabel(count, total)` | "achievement" when `total === null && count === 1`, else "achievements" |
| `earnedOfTotal(7, 20)` | "7/20" (own profile only) |
| `earnedOfTotalSpoken(7, 20)` | "7 of 20" (sr-only) |
| `toLevel(13)` | "To level 13" |
| `xpOfSpan(210, 600)` | "210 / 600 XP" (uses `formatXp`: "2,775 / 2,900 XP") |
| `cardFact(name, detail)` | "Serious cellar · 12 Sep 2026", "Note taker · 12 / 25" |

**Recommended change, PROVISIONAL, ships only on the owner's yes:** `CARD_COPY.showFewer` "Fewer" → "Show fewer". That matches `SHARED_NOTES_COPY.showFewer` in ProfileNotes on the same page. If the owner declines, it stays "Fewer".

**Removed:** `xpInAll` ("420 XP in all") and `toNextLevel` ("120 / 200 XP to level 5"). `card.ts` is their only caller and `copy.test.ts` does not pin them. Their words move into `xpLabel`, `toLevel` and `xpOfSpan`. `ringLabel` and `ringLinkLabel` keep their own "of" wording for the ring.

**Rule for future copy:** no string may state a total, a per-category count or "N of 20" on any code path that someone else's profile can reach.

## 8. View model (`src/lib/levels/card.ts`, pure)

```ts
export type TrioStat = { value: string; label: string; spoken: string | null };

export type LevelCardView = {
  trio: TrioStat[]; // [level, XP in all, achievements]
  levelRow: { label: string; fraction: number; value: string };
  latest: string | null;   // null exactly when `empty` is set
  closest: string | null;  // own profile only; null when nothing has progress
  empty: string | null;    // "No achievements yet." when nothing is earned (or visible)
  earnedGroups: {
    category: AchievementCategory;
    label: string;
    items: { key: AchievementKey; name: string; description: string; when: string }[];
  }[];
  notYetGroups:
    | {
        category: AchievementCategory;
        label: string;
        items: { key: AchievementKey; name: string; description: string; fraction: number; progress: string; bonus: string }[];
      }[]
    | null; // null on someone else's profile
  canExpand: boolean; // earned.length > 0 || own locked.length > 0
};
```

**Derivations:**
- **Level:** `levelProgress(p.xp)`, giving the level, into, span, fraction and next.
- **`trio`:**
  - `[String(level), CARD_COPY.levelLabel, null]`
  - `[formatXp(xp), CARD_COPY.xpLabel, null]`
  - the achievements count:
    - own profile (`locked !== null`): `earnedOfTotal(e, e + l)`, then `achievementsLabel(e, e + l)`, then `earnedOfTotalSpoken(e, e + l)`;
    - anyone else: `String(e)`, then `achievementsLabel(e, null)`, then `null`.
- **`levelRow`:**
  - usually `{ label: toLevel(next), fraction, value: xpOfSpan(into, span) }`;
  - at the top level `{ label: CARD_COPY.topLevel, fraction: 1, value: levelHeading(level) }`.
- **`latest`:**
  - order: a stable sort of `p.earned` with non-backfilled first, then `Date.parse(unlockedAt)` descending (NaN counts as oldest); ties keep catalogue order;
  - value: `cardFact(name, when)` for the first one.
- **`closest`:**
  - own profile only;
  - picks the entry of `p.locked` with the largest `min(1, progress / target)` above 0 (a strict `>`, so ties keep catalogue order);
  - value: `cardFact(name, progressText(progress, target))`.
- **`earnedGroups`:** unchanged from today.
- **`notYetGroups`:** `CATEGORY_ORDER` groups over `p.locked`, with the same item objects the flat `notYet` has today. Empty groups are dropped.
- **Removed:** `heading`, `xpLine`, `bar`, `chips`, `CardChip`, `CHIP_LIMIT`.

**Live XP** (A16): `LevelCard({ level, liveUserId })` calls `useOwnLevel(liveUserId ?? "", liveUserId ? { xp: level.xp, level: level.level } : null)` unconditionally.
- It then passes `{ ...level, xp: liveUserId && live ? live.xp : level.xp }` to `levelCardView`.
- On the server, `useSyncExternalStore`'s server snapshot returns the initial value, so there is no hydration mismatch.
- The card and the ring then share one XP source. `levelProgress(xp).level` equals the ring badge's `profile_levels.level` whenever the database's `level_for_xp` matches `curve.ts`; both are pinned to `curve.json`.

## 9. Files to change

In order:

1. **`src/app/profile/numbers/stat-card.test.tsx`** (new, written **first**, against the current code): pin the exact default `renderToStaticMarkup` output of `StatCard` (with and without `empty`), `StatFooter` and `StatFooterRow`.
2. **`src/components/overview/accuracy-rows.test.tsx`** (new, first): pin a default row's markup and `toneForPct` (50 → primary, 30 → gold, 29 → rose).
3. **`src/app/profile/numbers/stat-card.tsx`:**
   - `StatCard` gains `headingId?: string` and `action?: ReactNode` (§3.1);
   - `StatFooterRow` gains `labelClassName?: string`, applied as `cn("shrink-0 text-muted-foreground", labelClassName)`;
   - with the props omitted, the output is byte-identical (pinned by step 1).
4. **`src/components/overview/accuracy-rows.tsx`:** `BarTone` becomes `"primary" | "gold" | "rose" | "level"`, and `TONE.level` is `"bg-gold-deep"`. Add a comment: level and achievement progress only, echoes the ring (levels L30), never a hit rate or share. `toneForPct` and `toneForShare` are unchanged.
5. **`src/lib/levels/copy.ts`:** add the §7 keys and helpers, delete `xpInAll` and `toNextLevel`, and update the section comment to point at this spec. `showFewer` changes only if the owner says yes.
6. **`src/lib/levels/card.ts`:** the §8 view model, still pure with relative imports only.
7. **`src/app/u/[id]/level-card.tsx`:**
   - Rewrite it: `'use client'`, `useState`, two `useId`s (title and panel), `useOwnLevel`, the local `ExpandToggle`, `LevelCardSummary`, `GroupHeading` and `CategoryColumns`, and the exported hook-free `LevelCardDetails`.
   - Delete the local `Bar`, the lucide `ICONS` and their imports (except `ChevronDown`), the chip list, `hover:text-primary/80`, `dark:text-primary-ink`, `dark:hover:text-primary-ink/80` and `md:pointer-fine:min-h-8`.
   - Update both doc comments: the outline is now h2 title > h3 Earned/Not yet > h4 category, and the comment should point at this spec.
8. **`src/app/u/[id]/page.tsx`:** one prop only, `<LevelCard level={profileLevel} liveUserId={isOwnProfile ? user.id : undefined} />`. The placement (L32), the `flex flex-1 flex-col` root and the `mx-auto max-w-6xl gap-5 p-4 md:p-6` column are untouched.
9. **`docs/superpowers/specs/2026-09-27-levels-and-achievements-design.md`:**
   - add to §8.4: "**Amended 2026-09-28** (owner: 'more in sync with the rest of the design'; see `2026-09-28-profile-achievements-card-design.md`): the card is rebuilt from the Your numbers primitives — StatTrio (level · XP in all · achievements, '7/20' on your own profile only), one AccuracyRows level row (`bg-gold-deep` on `bg-muted`, was `bg-secondary`), Latest/Closest footer rows; the chips and category icons are gone; the toggle is a text button with a chevron in the header row; the title is an h2 (Earned/Not yet h3, categories h4); Not yet is grouped by category with 6px bars; expanded groups flow in 2/3 columns. Rule 1 wording unchanged: someone else's count is visible-only, never 'of N'. Owner approved on {date}."
   - add to L32's row: "One row collapsed now holds on laptops from 1100px (trio | level row | footer); amended 2026-09-28."
   - update §8.5's file list if it names `CHIP_LIMIT`.
10. **`CLAUDE.md`,** in the levels bullet after the `useOwnLevel` sentence, add: "/u/[id]'s Level & achievements card (spec `2026-09-28-profile-achievements-card-design.md`, amending levels §8.4) is built from the Your numbers primitives — StatTrio, AccuracyRows with the `level` BarTone (`bg-gold-deep`, for level/achievement progress only, never a hit rate), StatFooterRow, Eyebrow group headings; its XP is live through `useOwnLevel` on your own profile, and '7/20' shows only while `locked` is non-null (your own profile) — never a total, a per-category count or a placeholder on someone else's."

**Do not touch:** `snapshot.ts`, `read.ts`, `level-ring.tsx`, `live-level-ring.tsx` (only imported), `level-pill.tsx`, the toaster, any migration or RLS, and `scripts/levels.test.mjs`. **Never run** that script, because it connects to the production database.

## 10. Tests

**`src/lib/levels/card.test.ts`** (rewritten):
- **Collapsed** (`{ xp: 420, level: 4, earned: [], locked: null }`):
  - `trio` toEqual `[{value:"4",label:"level",spoken:null},{value:"420",label:"XP in all",spoken:null},{value:"0",label:"achievements",spoken:null}]`
  - `levelRow` toEqual `{label:"To level 5",fraction:0.6,value:"120 / 200 XP"}`
  - `latest` null, `closest` null, `empty` "No achievements yet.", `notYetGroups` null, `canExpand` false
- **Top level** (xp 90,000): `levelRow` toEqual `{label:"Top level",fraction:1,value:"Level 60"}`.
- **Earned groups:** keep today's `[["Cellar",5],["Tastings",3]]`, the exact item `{key:"first_bottle",name:"First bottle",description:"Add your first bottle to your cellar.",when:"Before levels"}` and the second item's `"12 Sep 2026"`.
- **Latest:**
  - a later `unlockedAt` wins;
  - with equal stamps, the first non-backfilled one in catalogue order wins ("Well stocked · 12 Sep 2026" for today's 8-key fixture);
  - for a person whose achievements are all backfilled, it is "First bottle · Before levels".
- **Own profile** (`xp: 30`, `locked: [cellar_25 12/25 +50]`):
  - `notYetGroups` toEqual `[{category:"cellar",label:"Cellar",items:[{key:"cellar_25",name:"Well stocked",description:"Hold 25 bottles in your cellar at once.",fraction:0.48,progress:"12 / 25",bonus:"+50 XP"}]}]`
  - `trio[2]` toEqual `{value:"0/1",label:"achievements",spoken:"0 of 1"}`
  - `closest` "Well stocked · 12 / 25", `canExpand` true
- **Closest omitted** when every locked fraction is 0.
- **Rule 1** (someone else with one earned): `trio[2]` toEqual `{value:"1",label:"achievement",spoken:null}`, `notYetGroups` null, `closest` null, and no `trio` value contains "/".

**`src/app/u/[id]/level-card.test.tsx`:**
- **Heading extractor** that strips inner tags: ``[...html.matchAll(/<(h\d)[^>]*>([\s\S]*?)<\/h\d>/g)].map(m => `${m[1]} ${m[2].replace(/<[^>]+>/g, "")}`)``.
- **`LevelCardDetails`,** using today's fixture (first_bottle, first_note backfilled, locked notes_25 3/25 +75):
  - the outline is `["h3 Earned","h4 Cellar","h4 Notes","h3 Not yet","h4 Notes"]`
  - no `<h2` and no `<h5`
  - it still matches `/^<div id="panel"/`
  - it contains `"+75 XP"`, `"3 / 25"`, `"Earned: "` and `"Before levels"`
- **The full `LevelCard`** (`renderToStaticMarkup`; `useState`, `useId` and `useSyncExternalStore` render on the server):
  - the first heading is `"h2 Level &amp; achievements"`, and the section's `aria-labelledby` equals that h2's `id`
  - the button has `aria-expanded="false"` and a non-empty `aria-controls`
  - the markup does not contain `">Earned<"` while collapsed
  - it renders the same with `liveUserId` set (server snapshot, so the server props are used)
- **Rule 1** (someone else, `earned: []`, `locked: null`):
  - no `<button`
  - contains "No achievements yet."
  - does not match `/\d\/\d/` and does not contain "Not yet", "Closest" or `sr-only">0 of`
  - a comment states that "none earned" and "all hidden" are the same input, so the markup is the same
- **Own profile with nothing earned:** the button is present ("All achievements"), plus the italic empty line and "Closest" when there is progress.
- **Token hygiene,** over both the collapsed and the details markup: no `/#[0-9a-f]{3,8}\b/i`, no `dark:`, no `/80`, no `bg-secondary`.
- Do not snapshot `useId` values; compare ids to each other.

**`src/lib/levels/copy.test.ts`:** add pins for `toLevel(13)`, `xpOfSpan(2775, 2900)` ("2,775 / 2,900 XP"), `achievementsLabel(1, null)` / `(1, 20)` / `(0, null)`, `earnedOfTotal(7, 20)`, `earnedOfTotalSpoken(7, 20)` and `cardFact`. The existing pins are unaffected.

**`stat-card.test.tsx` and `accuracy-rows.test.tsx`** (new, from §9 steps 1–2), extended after the change:
- `headingId` gives `<section aria-labelledby="t"` and `<h2 id="t" class="leading-none">`
- `action` renders inside the `flex items-center gap-2.5` row with `ml-auto`
- `labelClassName` merges
- `tone: "level"` gives `bg-gold-deep`
- the default pins still pass unchanged

**Not changed:** `snapshot.test.ts`, `level-ring.test.tsx`, `ring.test.ts`, `level-pill.test.tsx`.

**Commands:**
- `npx vitest run src/lib/levels src/app/u src/app/profile/numbers src/components/overview`
- `npx tsc --noEmit`
- eslint on the changed files
- **Never** `scripts/levels.test.mjs`.

## 11. Browser checklist

This extends levels spec §10.3.

**Setup:**
- Sign in with demo sessions minted by `.superpowers/demo-session.mjs` (magic link plus `verifyOtp`, never a typed password).
- Front the Browser pane, because a hidden pane stalls on `loading.tsx`.
- Switch dark mode from the theme menu (the OS preference is ignored).

**Widths:**
- [ ] **1675×865 desktop, own profile, collapsed:**
  - one row (trio | level row | Latest/Closest), about 115px tall
  - the toggle at the header's right, with no wrap
  - the footer has no top rule
- [ ] **1675×865, expanded:**
  - Earned and Not yet each under an Eyebrow and hairline
  - categories in 3 balanced columns, with no group split across columns and no empty column
  - opening and closing moves neither the toggle nor the scroll position
- [ ] **1024px** (two columns): trio | level row, with the footer across both under its rule.
- [ ] **1100px and 1099px:** the switch from 3 to 2 columns has no overlap.
- [ ] **375px iPhone** (the owner's Safari and Chrome):
  - the header fits on one line
  - the trio is in 3 equal columns
  - the level row fits
  - the footer truncates cleanly
  - no horizontal scroll (`document.documentElement.scrollWidth <= 375`)
  - collapsed height about 190px
- [ ] **375px, expanded:** one column, the items readable, "Show fewer"/"Fewer" at the top.
- [ ] **320px:** the header and level row still fit, with no horizontal scroll.

**Profiles:**
- [ ] **Own profile:**
  - "7/20" visible; VoiceOver reads "7 of 20 achievements"
  - Closest present when anything has progress
  - Not yet grouped, with the 6px gold-deep bars
- [ ] **Own profile, live:** earn XP in another tab or flow, return, and the card's level and XP match the ring badge, with no mismatch after a back navigation.
- [ ] **Someone else's profile:**
  - a plain count, singular at 1
  - Latest only; no Closest, no Not yet, no "/" anywhere in the trio
- [ ] **Someone with no achievements:** "No achievements yet.", no toggle, the level row with an empty or partial track.
- [ ] **Own profile with no achievements:** the toggle opens all 20 under Not yet.
- [ ] **A PRIVATE-cellar owner seen by a non-friend:** no Cellar group, and a count that does not include the hidden cellar achievements; the same person seen by a friend shows them.
- [ ] **Top-level account** (if one exists; otherwise the unit test covers it): "Top level … Level 60" with a full track.

**Dark mode** (1675 and 375):
- [ ] the card, track, fill, rules and toggle use dark tokens
- [ ] toggle hover shows only an underline
- [ ] the gold-deep fill is clearly visible on the dark track

**Accessibility:**
- [ ] keyboard: Tab reaches the toggle with a visible focus ring; Enter and Space toggle; focus stays on it
- [ ] the touch target is 44px or more (check `document.elementFromPoint` 20px above and below the label on a touch-emulated phone)

**Regressions:**
- [ ] the `/profile/numbers` cards and `/u/[id]` ProfileStatCards look unchanged in both themes
- [ ] the bordeaux, gold and rose `AccuracyRows` rows are unchanged

**Next to the page:**
- [ ] the card's trio above the page's bare tastings trio does not read as one repeated block (1675 and 375); if it does, take O6

## 12. Owner decisions needed

The owner must approve before merge:
1. The chips leave the collapsed card; "Latest" names the newest achievement.
2. The new PROVISIONAL strings: "level", "XP in all" as a label, "achievement(s)", "7/20", "To level N", "N / M XP", "Latest", "Closest", and the "name · detail" form.
3. The toggle moves to the header row with a chevron.
4. The bar track changes from `bg-secondary` to `bg-muted` (the gold-deep fill stays), and Not yet bars grow from 4px to 6px.

**Options, not in the base design:**
- **O1 — Keep a chip row.** Use the Overview neutral info chip (`invitation-card.tsx`): `inline-flex items-center gap-[5px] rounded-full border border-border bg-background px-[10px] py-[4px] text-[11px] font-semibold whitespace-nowrap text-foreground`, with a `size-3 text-gold-dark` icon, in a `<ul aria-label="Earned">`, newest first, at most 6, as a row under the summary grid.
  - Cost: the laptop card becomes two rows again, and the phone card gets about 60–90px taller.
  - Never add a "+N" overflow chip.
- **O2 — "Fewer" → "Show fewer".** Recommended.
- **O3 — "Closest" or "Nearly there".**
- **O4 — Latest tie-break** for a person whose achievements are all backfilled: catalogue order ("First bottle · Before levels"), or the achievement that is highest up its ladder.
- **O5 — Phone cap on Not yet:** show about 6, closest first, with "Show {n} more" (provisional). This is a view-model change.
- **O6 — Two trios.** If the card's trio and the page's trio read as repetitive, reduce the card's to level plus achievements. XP stays stated in the level row value ("210 / 600 XP"), which still satisfies L30.

## 13. Residual risks

- **Spec deviation.** Levels §8.4 and L32 were owner-approved with the chips, the `bg-secondary` track and the old toggle. This must not ship without §12 sign-off and the §9 step 9 amendment.
- **Thinner collapsed card for others.** Without chips, someone else's collapsed card names one achievement ("Latest") plus a count. O1 is the ready fallback.
- **The level is now much bigger.** A 27px numeral under the ring makes any mismatch visible. A16 aligns the XP source.
  - Two gaps remain. `profile_levels.level` could drift from `curve.ts` only if the database's curve changed without `curve.json`.
  - And the live XP can move before a newly earned achievement appears in the count, which only updates on the next server render.
- **Every size is estimated from classes:** the one-row fit at 1100px and up, the 309px phone header, column balance and the expanded heights. §11 must confirm them on the owner's devices.
- **CSS columns.** Balancing with `break-inside-avoid` can leave an uneven or empty column in some browsers. The block child copies the aroma-picker precedent; check iPhone Safari especially.
- **Low-contrast fill.** Gold-deep on `bg-muted` is 2.39:1 in light mode. That is acceptable only as a supplementary mark; the numbers must always be stated in text beside it (L30). Keep the value visible if the layout ever changes.
- **Pre-existing, out of scope:** bordeaux `AccuracyRows` fills on dark `--muted` are about 1.2:1, so the existing Accuracy card bars are nearly invisible in dark mode. This is a follow-up candidate, not part of this change.
- **Shared primitive props** (`StatCard`, `StatFooterRow`, `BarTone`). They are additive and pinned by new tests written before the change. Still, check Your numbers once visually. A new `BarTone` value invites misuse on hit-rate charts; the comment and CLAUDE.md sentence guard against that.
- **Rule 1.** Someone else's count legitimately differs by viewer (a friend may see cellar achievements a stranger does not). The card must never add a total, a per-category count, a locked slot or a placeholder for another viewer. The tests in §10 pin a null `closest`, no "/", no Not yet, and identical output for "none earned" and "all hidden".
- **Tap pad.** The toggle's `::after` pad reaches about 2px into the trio below on phones. That is harmless, since the trio is not interactive, but a future interactive element placed there would conflict.
- **`aria-controls`** points at a panel that is not rendered while collapsed. The pattern is unchanged from today; switch to `hidden` if an audit flags it.
- **The toggle is at the top only,** so after reading a long expanded list on a phone you scroll back up. This was chosen over a bottom toggle, which jumps on iOS Safari.
- **Production is live.** This is UI-only, with no migration and no RLS change. Deploy through the usual staged push with a live smoke check of `/u/[id]` (own profile, someone else's, dark mode), and revert if it looks wrong. Never run `scripts/levels.test.mjs`.