# Profile view redesign — design

Date 2026-09-19. Owner: "the profile view of someone also needs to be updated visually according to the new design". Scope: `/u/[id]` (`src/app/u/[id]/page.tsx` and what it renders). `/u/[id]/cellar` (already the redesigned read-only cellar) and `/u/[id]/tastings/[tastingId]` stay unchanged. The drill-down's "← Back to {name}'s profile" is a back link, not an action, so it can stay a text link.

Visual references:
- the catalog list (`src/app/catalog/page.tsx`, `catalog-list.tsx`): serif title, one-line subtitle, serif-numeral stat line, bordered table, phone cards;
- the cellar (`src/app/cellar/**`);
- Community (`src/app/community/**`, `docs/superpowers/specs/2026-09-19-community-redesign.md`);
- the Overview primitives in `src/components/overview/*`;
- Your numbers (`src/app/profile/numbers/**`), which already shows a person's own stats in the new style.

Standing owner feedback applied:
- actions are real buttons, never text links styled as actions;
- a hover action never overlaps content (this page has none, R8);
- one entry point per action.

## 1. Decisions

Given:
- **D1 Header.** The avatar, the name in the heading serif, a meta line (place · favourite wine type · joined month), the bio, and the actions as real buttons.
  - Another person: the friend action (Add friend, or a quiet Friends state that can remove, with the same component and two-tap rule as Community) and Cellar where their cellar is visible.
  - Your own profile: Edit profile and Invite someone (the existing `InvitePeopleButton`).
- **D2** A serif-numeral stat line: tastings, wines guessed, average points.
- **D3** Sections with Eyebrow labels, built from the Overview and Your numbers primitives:
  - per-category accuracy (`AccuracyRows`, with the MIN_SAMPLE rule);
  - what they have tasted most (top countries, regions and grapes);
  - their tastings as a catalog-style list (a laptop table, phone cards), linking to `/u/<id>/tastings/<tastingId>`, newest first, with a date.
- **D4** Empty states for a person with no tastings yet, in the catalog's voice.
- **D5** No migrations. No new queries unless justified here (R2 adds exactly one).
- **D6** A deleted profile keeps its minimal "Deleted user" page exactly as it is now.

Refined here:
- **R1 One friend control, two taps to remove.** `/u/[id]` uses the same `FriendButton` two-tap as Community's rows: "Add friend" → "Friends" (outline, `Check`), then "Tap again to remove" (destructive) for `TWO_TAP_WINDOW_MS`.
  - A new `variant="header"` differs from `"row"` only in size, so it matches the other header buttons.
  - The single-tap `"profile"` variant loses its last mount and is deleted.
  - This supersedes Community R2's "`/u/[id]` keeps its one-tap Remove friend".
- **R2 Cellar shows only when the viewer can open it.** Today "View cellar" is always shown, and for a PRIVATE cellar (or a FRIENDS cellar with no friendship either way) it lands on "This cellar is private".
  - The page calls `can_view_cellar(p_owner)`, the exact gate `/u/[id]/cellar` itself uses. This is one boolean RPC, run in parallel with the friendship read.
  - It is the one new query. It is justified because the profile cannot see a friendship in the other direction (`friendships read own`), so `cellar_visibility` alone would either show a dead end or hide a real entry.
  - After Add/Remove friend, `revalidatePath("/u/{id}")` re-runs it, so a FRIENDS cellar's button appears and disappears with the friendship.
  - Your own profile has no Cellar button: the nav's Cellar pillar is its one entry point (D1 lists only Edit profile and Invite someone).
- **R3 Accuracy rows follow Your numbers.**
  - The same labels and order as `your-numbers-math.ts`'s `ACCURACY_ROWS` (Country, Region, Appellation, Grape, Vintage ±1, Producer), then this page's two extra scored categories (Second grape, Designation). "Vintage ±1" counts an off-by-one year as a hit (`correct + vintagePartialCredit`), as on Your numbers. This replaces today's "(+N off by 1yr)" suffix.
  - A category with 0 applicable wines is omitted (as today).
  - A category with 1–2 wines (below `MIN_SAMPLE = 3`) shows "—" and an empty track, so a single lucky guess never reads as a rate.
  - The "Strongest" line is computed from these same rows, so it can never disagree with a row: exact vintage vs ±1 would otherwise differ.
  - `getProfileStats`'s `bestCategory` (its only reader was this page) is removed.
  - Semi-blind guesses never enter these rows: `tallyGuess` already skips every null category column.
- **R4 Tasted-most uses share-of-top rows, not `DistributionBar`.**
  - `getProfileStats` returns only the top 5 of each list, so a share-of-whole bar with "Other" would misstate the whole.
  - The rows are `AccuracyRows` with widths relative to the top entry and `toneForShare`, exactly like Your numbers' top-grape rows.
  - Rows with the same display name are merged (for example two countries' sentinel "None" regions), which also keeps `AccuracyRows`' `key={label}` unique.
- **R5 The tastings list runs newest first, by this person's latest scored glass in each tasting.**
  - The date is `max(guesses.scored_at)` over the counted (fully revealed) guesses. It exists for every listed tasting by construction. Your numbers dates tastings the same way (`pointsPerTasting`).
  - `finished_at`/`started_at` are null on legacy rows (M3, no backfill), so neither can order the list.
  - The date is a server string in UTC ("12 Sep 2026"): day granularity, rendered by a server component, so it cannot mismatch on hydration. This is the Overview's `shortDate` rule plus the year. `LocalDateTime` is not used: its first paint reads "Scheduled", which is wrong copy for a past tasting.
- **R6 No tasting cover photos in the list.** The join preview deliberately never shows the cover photo to non-members (`get_join_preview`), and this page is visible to every signed-in user, so the list stays text-only. The tasting description and place are never read either.
- **R7 Semi-blind rows read "{m} of {n} matched", never points.** This reuses the result screen's copy (blind-tasting v3 spec, "{matches} of {revealed glasses} matched"). It needs `tastings.reveal_mode`, one more column on a query the page already runs.
- **R8 No hover-revealed actions.** A tasting row's only control is its name link (the whole card on phones), so nothing appears on hover and nothing can overlap.
- **R9 The new parts are server components.** Only `FriendButton` and `InvitePeopleButton` (already client components) run on the client. Every string is computed once on the server, and nothing reads `localStorage`.
- **R10 No `layout.tsx` under `/u/[id]`.** The cellar and drill-down children render their own `AppHeader`, so a layout would double the nav. The page keeps rendering `AppHeader` with props, as today, and `loading.tsx` is unchanged.
- **R11 The joined month is UTC**, Community's `joinedLabel` ("Sep 2026"). Today it is formatted in the server's locale and timezone (`toLocaleDateString(undefined, …)`).
- **R12 The average is unchanged.** "avg points" stays `summary.averagePoints` (semi-blind 0/1 guesses included). Community (`getBulkProfileSummaries`), the Overview card and Your numbers all average the same way, so a person's number agrees on every page. See §7.
- **R13 No notes count.** It is not already loaded; it would be a new query (D2 allows it only "if already available cheaply").

## 2. The page, top to bottom

Container: `mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 p-4 md:p-6`, the cellar/community width with a 16 px phone gutter. Above it is `AppHeader` with the viewer's props, as today.

Every quoted string below is the exact copy. Numbers use `toLocaleString("en-US")`. A missing value is "—". An apostrophe in copy is the typographic `’`, as in the read-only cellar's "{name}’s cellar".

### 2.1 Wireframes

Laptop (1280 px, 240 px sidebar, content ≈ 990 px):

```
(avatar 80) Anna Jensen                                  [ Cellar ] [ Add friend ]
            Copenhagen · Favorite: Red · Joined Sep 2026
            Bio text, up to prose width, wrapping …

12          48              18.6
tastings    wines guessed   avg points

┌ ACCURACY BY CATEGORY ─────┐ ┌ ORIGINS TASTED MOST ──────┐ ┌ GRAPES TASTED MOST ───────┐
│ Country    ██████░░  78%  │ │ Countries                 │ │ Pinot Noir  ████████  9   │
│ Region     ████░░░░  56%  │ │ France      ████████  14  │ │ Nebbiolo    █████░░░  6   │
│ …                         │ │ Italy       ████░░░░   7  │ │ …                         │
│ Second grape ░░░░░░░   —  │ │ Regions                   │ │                           │
│ ───────────────────────── │ │ Bourgogne   ████████   6  │ │                           │
│ Strongest  Country · 78%… │ │ …                         │ │                           │
│ A category shows a rate … │ │                           │ │                           │
└───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘

TASTINGS
┌──────────────────────────────┬───────────┬─────────────┬───────┬────────────────┐
│ Tasting                      │ Host      │ Date        │ Wines │         Result │
├──────────────────────────────┼───────────┼─────────────┼───────┼────────────────┤
│ Burgundy night               │ You       │ 12 Sep 2026 │     6 │         42 pts │
│ Friday flight                │ Gustav    │ 3 Sep 2026  │     4 │ 3 of 4 matched │
│ Semi-blind                   │           │             │       │                │
└──────────────────────────────┴───────────┴─────────────┴───────┴────────────────┘
12 tastings · newest first
```

Phone (375 px):

```
(avatar 64) Anna Jensen
            Copenhagen · Favorite: Red ·
            Joined Sep 2026
            Bio text …
[ Cellar ] [ Add friend ]

12          48              18.6
tastings    wines guessed   avg points

[ ACCURACY BY CATEGORY card ]
[ ORIGINS TASTED MOST card  ]
[ GRAPES TASTED MOST card   ]

TASTINGS
┌──────────────────────────────────────────┐
│ Burgundy night                    42 pts │
│ hosted by you · 12 Sep 2026       6 wines│
└──────────────────────────────────────────┘
12 tastings · newest first
```

Tablet (768–1279 px) uses the phone's tasting cards (`xl:hidden`). The stat cards follow `StatCardGrid`'s own breakpoints: one column below 820 px, two up to 1099 px, three from 1100 px.

### 2.2 Header (`ProfileHeader`)

`<header className="flex flex-wrap items-start gap-x-4 gap-y-3">` holds:

1. **Avatar.** `<Avatar src={avatar_url} name={display_name} size="lg" className="size-20 text-3xl max-md:size-16 max-md:text-2xl" />`, with the component's own initial fallback and `alt=""` (the name sits beside it).
2. **Identity column** `min-w-0 flex-1`:
   - `flex flex-wrap items-center gap-x-2 gap-y-1`, holding `<h1 className="font-heading text-3xl font-semibold tracking-tight break-words">{display_name}</h1>` (PageHeader's h1 classes). On your own profile it is followed by `<Badge variant="secondary">You</Badge>`, as on Community's rows.
   - The meta line: `<p className="mt-1 text-sm text-muted-foreground">{profileMeta(…)}</p>`. For example "Copenhagen · Favorite: Red · Joined Sep 2026". The parts, in order and each only when set:
     - the trimmed `location`;
     - "Favorite: {label}", where the label comes from `FAVORITE_WINE_TYPE_ITEMS`, falling back to the raw value ("Favorite" matches `/profile/edit`'s "Favorite wine type");
     - "Joined {Mon YYYY}", which is always present.
   - The bio, when set: `<p className="mt-2 max-w-prose text-sm break-words">{bio}</p>`.
3. **Actions** `flex flex-wrap items-start gap-2 max-md:w-full md:justify-end`. Below `md` they wrap onto their own full-width row, left-aligned.
   - **Another person:**
     - "Cellar", only when `canViewCellar` (R2): `<Button variant="outline" nativeButton={false} render={<Link href="/u/{id}/cellar" />} className="min-h-11 md:pointer-fine:min-h-9">`.
     - Then `<FriendButton friendId isFriend variant="header" />`, whose labels are "Add friend" / "Adding…" / "Friends" / "Tap again to remove" / "Removing…" (`friendButtonLabel`). A refused write shows its error verbatim under the button (`text-sm text-destructive`), as today.
   - **Your own profile:**
     - "Edit profile": `<Button variant="outline" nativeButton={false} render={<Link href="/profile/edit" />} className="min-h-11 md:pointer-fine:min-h-9">`.
     - Then `<InvitePeopleButton inviterName={…} />`, unchanged ("Invite someone", outline emphasis, `min-h-11 md:pointer-fine:min-h-9`).

The phone number is never selected, so it can never render (CLAUDE.md: phone is private).

### 2.3 Stat line

Rendered only when `summary.winesGuessed > 0`: `<StatTrio stats={profileStatTrio(summary)} />`. On laptops it is a left-packed row of 27 px Cormorant numerals; on phones, three equal columns with 21 px numerals (the primitive's own responsive rules).

| value | label |
|---|---|
| `tastingsAttended` | "tastings" / "tasting" |
| `winesGuessed` | "wines guessed" / "wine guessed" |
| `averagePoints.toFixed(1)` | "avg points" |

### 2.4 Stat cards

Rendered only when `summary.winesGuessed > 0`, in `<StatCardGrid>`. `StatCard`, `StatCardGrid`, `StatFooter`, `StatFooterRow` and `toneForShare` are imported from `@/app/profile/numbers/stat-card`, following the precedent of `u/[id]/cellar` importing `@/app/cellar/cellar-bottles`. Each card's title is the primitive's mono Eyebrow.

**Card 1 — "Accuracy by category"** (`accuracyView(summary)`):
- If `empty` is set, the card shows only "Semi-blind glasses score a plain match, so there is no category breakdown yet." This happens when every counted guess is semi-blind (all eight `applicable` are 0).
- Otherwise it shows `<AccuracyRows rows={rows} labelWidth={84} />`, toned by the default hit-rate rule (`toneForPct`, as in Your numbers' "What you get right"). The rows, in this order, are shown only when `applicable ≥ 1`:

| label | hits / applicable |
|---|---|
| "Country" | `country` |
| "Region" | `region` |
| "Appellation" | `appellation` |
| "Grape" | `primary_grape` |
| "Vintage ±1" | `vintage.correct + vintagePartialCredit` / `vintage.applicable` |
| "Producer" | `producer` |
| "Second grape" | `secondary_grape` |
| "Designation" | `type_designation` |

  The value is "{pct}%" when `applicable ≥ 3`, where `pct = percent(hits, applicable)` (the rounded integer from `stats-math.ts`). Below 3 it is "—" with `pct` 0 (an empty track).
- A `StatFooter` follows when either of these lines exists:
  - `<StatFooterRow label="Strongest" value={strongest} />`, for example "Country · 78% of 9 wines". The winner is the qualifying row (`applicable ≥ 3`) with the highest rate. Ties go to more wines, then to the earlier row. There is no line when no row qualifies or the best has 0 hits.
  - The footnote `<p className="text-[11.5px] text-muted-foreground">A category shows a rate once it covers 3 wines.</p>`, when any shown row is below 3.

**Card 2 — "Origins tasted most"**. Two groups, each only when non-empty:
- `<span className="text-[11.5px] font-semibold">Countries</span>`, then `<AccuracyRows rows={shareRows(topCountries) with tone toneForShare(pct)} trackHeight={6} labelWidth={96} valueWidth={28} className="gap-1.5" />`.
- The same again for "Regions".

When both are empty, the card shows "Nothing to show yet". The lists count the true answer of every counted glass, semi-blind included: tasting a glass is exposure whether or not the guess was right. This is today's rule.

**Card 3 — "Grapes tasted most"**: the same rows for `topGrapes`, or "Nothing to show yet".

No stacked series or legend is drawn here: `DistributionBar`/`ColumnChart` are not used (R4), so the fixed series order and legend rule are not in play.

### 2.5 Tastings

Rendered when `summary.winesGuessed > 0` and there is at least one row. The section is `<section aria-labelledby="profile-tastings" className="flex flex-col gap-3">`, headed by `<h2 id="profile-tastings"><Eyebrow size="lg">Tastings</Eyebrow></h2>`.

**Laptop table (xl and up).** The wrapper is `hidden overflow-hidden rounded-xl border border-border xl:block`, holding a `w-full table-fixed text-sm` table with `<caption className="sr-only">Tastings, newest first</caption>`. The header row is `border-b border-border text-left text-xs tracking-wide text-muted-foreground`, with `th` at `px-4 py-3 font-medium`. Each body row is `border-b border-border last:border-0 hover:bg-muted/30`, with `td` at `px-4 py-2`.

| Column | Width | Header | Cell |
|---|---|---|---|
| Tasting | rest | "Tasting" | The single link, `<Link href={row.href} className="flex min-h-11 min-w-0 flex-col justify-center">`. Inside it, the name (`block truncate font-medium`) and, when `modeNote`, a `block truncate text-xs text-muted-foreground` line ("Semi-blind" / "Open"). |
| Host | 11rem | "Host" | `truncate text-muted-foreground`: "You" when the viewer hosted, else the host's name |
| Date | 8rem | "Date" | `whitespace-nowrap text-muted-foreground tabular-nums`: "12 Sep 2026" |
| Wines | 5rem | "Wines" (right) | `text-right tabular-nums`: "6" |
| Result | 9rem | "Result" (right) | `text-right font-semibold tabular-nums`: "42 pts" / "1 pt" / "3 of 4 matched" |

**Phone and tablet cards (below xl).** `flex flex-col gap-2 xl:hidden`. Each card is one `<Link href={row.href} className="flex min-h-11 items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-muted/30">` holding:
- `min-w-0 flex-1`: the name (`block truncate font-medium`) and `phoneMeta` (`block truncate text-xs text-muted-foreground`), for example "hosted by you · 12 Sep 2026" or "hosted by Gustav · 3 Sep 2026";
- `shrink-0 text-right text-sm`: `result` (`font-semibold tabular-nums`) over `phoneBottom` (`block text-xs text-muted-foreground`), which is "6 wines" / "1 wine", or the mode note ("Semi-blind" / "Open") when there is one.

**Footer:** `<p className="text-sm text-muted-foreground">{tastingsFooter(n)}</p>`, reading "12 tastings · newest first" or "1 tasting · newest first". There is no pager: a person's tastings grow slowly, and today's list is uncapped too.

### 2.6 Empty state (no scored guesses on a revealed glass)

When `summary.winesGuessed === 0`, the header is followed only by `<EmptyState title=… description=… />`. There is no stat line, no cards, no tastings section and no action.
- Title: "No tastings yet".
- Your own profile: "Your numbers and tastings show up here once a glass you guessed has been revealed."
- Another person: "{display_name}’s numbers and tastings show up here once a glass they guessed has been revealed."

### 2.7 Deleted profile

`view === "deleted"` returns today's JSX byte for byte: `AppHeader`, a `max-w-lg` `Card` with the grey circle, "Deleted user" and "This account has been deleted.". It has no friend button, cellar link, stats or `can_view_cellar` call, and it is returned before any of the reads in §3 step 4.

## 3. Data

All reads run in `page.tsx` with the server client under the viewer's RLS. No migration, table, view or new RPC is added.

1. `auth.getUser()`; no user → `redirect("/login")`. (unchanged)
2. In parallel (today these run in sequence):
   - **me:** `profiles.select("display_name, avatar_url").eq("id", user.id).single()`, for `AppHeader` and `inviterName = me?.display_name ?? user.email ?? ""` (unchanged);
   - **profile:** `profiles.select("id, display_name, bio, avatar_url, location, favorite_wine_type, created_at, deleted_at").eq("id", id).maybeSingle()`. The columns are unchanged and `phone` is never selected. No row → `notFound()`.
3. `profilePageView(...)`: `"deleted"` → §2.7, `"own"` / `"other"`.
4. In parallel:
   - **friendship** (other only): `friendships.select("id").eq("user_id", user.id).eq("friend_id", profile.id).maybeSingle()` → `isFriend` (unchanged);
   - **cellar gate** (other only, **new**, R2): `supabase.rpc("can_view_cellar", { p_owner: profile.id })` → `canViewCellar = data === true` (an error hides the button);
   - **stats:** `getProfileStats(profile.id)` (unchanged call; its internals change as listed below).
5. The server builds every string through `profile-view-math.ts` (§4.1): `meta`, `trio`, `accuracy`, `countries`/`regions`/`grapes`, `rows`, `footer`, `empty`.

`getProfileStats` changes (`src/lib/profile-stats.ts`). There are no new queries, only extra columns on existing ones:
- The `guesses` select adds `scored_at`; a `lastScoredAtByTastingId` map keeps the latest per tasting, the same loop that already sums points and wines. `scored_at` is inside `authenticated`'s 27-column `guesses` grant (only `guessed_wine_id` is excluded).
- The `tastings` select becomes `"id, name, host_id, reveal_mode"`.
- `TastingHistoryEntry` gains `hostId: string`, `revealMode: RevealMode` (`import type` from `database.types`) and `lastScoredAt: string`.
- The trailing `.sort(... localeCompare)` by name goes; order is the view's job (`profileTastingRows`).
- `bestCategory`, `CategoryStrength` and the `MIN_SAMPLE` loop go (R3). `MIN_SAMPLE` now lives in `profile-view-math.ts`. The summary's comment is updated. The Overview reads only `tastingsAttended`, `averagePoints` and `categoryAccuracy.region`, so it is unaffected.
- The fully-revealed-wines scoping is untouched. Every figure is still the same for every viewer, and nothing about a hidden glass reaches the page (rule 1). The new columns concern only revealed glasses (`scored_at` on a revealed glass's guess) or the tasting row (`reveal_mode`, public once any of its wines is revealed).

## 4. Files

New:
- `src/lib/profile/profile-view-math.ts`: pure. Its runtime imports are relative only (vitest has no `@/` alias): `../community/community-math` (`joinedLabel`), `../wine-types` (`FAVORITE_WINE_TYPE_ITEMS`) and `../stats-math` (`percent`; its only `@/` import is type-only and erased). Types come from `../profile-stats` via `import type`.
- `src/lib/profile/profile-view-math.test.ts`: the §4.2 cases. Write it first.
- `src/app/u/[id]/profile-header.tsx`: a server component, `ProfileHeader({ name, avatarUrl, isOwn, meta, bio, actions }: { name: string; avatarUrl: string | null; isOwn: boolean; meta: string; bio: string | null; actions: ReactNode })`, as in §2.2. The page builds `actions` (the client buttons).
- `src/app/u/[id]/profile-stat-cards.tsx`: a server component, `ProfileStatCards({ accuracy, countries, regions, grapes })`, as in §2.4. It applies `toneForShare(pct)` to the share rows (the tone helper lives in a component file, so it stays out of the pure module).
- `src/app/u/[id]/profile-tastings.tsx`: a server component, `ProfileTastings({ rows, footer })`, as in §2.5.

Changed:
- `src/app/u/[id]/page.tsx`: the non-deleted branch is rewritten per §2/§3. It drops `MapPin`, `WineIcon`, `CATEGORY_LABELS`, the inline tables and the `toLocaleDateString` call. It keeps the deleted branch and its `Card` imports as they are.
- `src/lib/profile-stats.ts`: per §3.
- `src/components/friend-button.tsx`:
  - `variant?: "row" | "header"`, defaulting to `"row"`; the single-tap `"profile"` branch is deleted (R1).
  - Both variants share today's two-tap logic and labels.
  - `"row"`: exactly as today (`size="sm"`, `min-h-11 gap-1.5 md:pointer-fine:min-h-8`, wrapper `flex flex-col items-end gap-1`).
  - `"header"`: `size="default"`, `min-h-11 gap-1.5 md:pointer-fine:min-h-9`, wrapper `flex flex-col items-start gap-1 md:items-end`.
  - The header comment is updated. `community-list.tsx` already passes `variant="row"` and needs no edit.
- `src/app/invite/actions.ts`: comment only. "shows 'Remove friend' as the visible confirmation" becomes "shows the 'Friends' state as the visible confirmation".
- `CLAUDE.md`:
  - In the `getProfileStats` bullet, replace the `bestCategory` sentence. The strongest category on `/u/[id]` now comes from `accuracyView` (`src/lib/profile/profile-view-math.ts`), computed over the displayed rows (Your numbers' labels, "Vintage ±1", `MIN_SAMPLE = 3`); `getProfileStats` no longer returns `bestCategory`.
  - Add one short bullet by the profile rules covering:
    - the `/u/[id]` layout (header, `StatTrio`, three `StatCard`s, tastings table/cards);
    - Cellar gated by `can_view_cellar`;
    - the two-tap `FriendButton variant="header"`;
    - no tasting cover photos on the list (join-preview parity, R6);
    - UTC server dates;
    - the unchanged mixed average (R12).

Unchanged: the deleted branch, `loading.tsx` ("Loading profile…"), `/u/[id]/cellar`, `/u/[id]/tastings/[tastingId]`, `src/app/friends/actions.ts`, `InvitePeopleButton` and its dialog, `community-list.tsx`, and the Overview primitives (used as they are).

### 4.1 `profile-view-math.ts` exports

```ts
import type { OriginStat, ProfileStatsSummary, TastingHistoryEntry } from "../profile-stats";

export const MIN_SAMPLE = 3;
export const NOTHING_YET = "Nothing to show yet";
export const MIN_SAMPLE_FOOTNOTE = "A category shows a rate once it covers 3 wines.";
export const SEMI_BLIND_ONLY =
  "Semi-blind glasses score a plain match, so there is no category breakdown yet.";

export function favoriteWineLabel(code: string | null): string | null;
export function profileMeta(p: {
  location: string | null;
  favoriteWineType: string | null;
  createdAt: string;
}): string;
export function profileStatTrio(
  s: Pick<ProfileStatsSummary, "tastingsAttended" | "winesGuessed" | "averagePoints">,
): { value: string; label: string }[] | null;

export type AccuracyView = {
  rows: { label: string; pct: number; value: string }[];
  strongest: string | null;
  footnote: string | null;
  empty: string | null;
};
export function accuracyView(
  s: Pick<ProfileStatsSummary, "winesGuessed" | "categoryAccuracy" | "vintagePartialCredit">,
): AccuracyView;

export type ShareRow = { label: string; pct: number; value: string };
export function shareRows(items: OriginStat[]): ShareRow[]; // merge same names, count desc then name, max 5

export type ProfileTastingRow = {
  id: string;             // tasting id (React key)
  href: string;           // `/u/${profileId}/tastings/${tastingId}`
  name: string;
  modeNote: string | null; // null for BLIND, "Semi-blind", "Open"
  host: string;           // "You" when hostId === viewerId, else hostName
  date: string;           // "12 Sep 2026", UTC, from lastScoredAt
  wines: string;          // "6"
  result: string;         // "42 pts" | "1 pt" | "3 of 4 matched"
  phoneMeta: string;      // "hosted by you · 12 Sep 2026"
  phoneBottom: string;    // modeNote ?? "6 wines" / "1 wine"
};
export function profileTastingRows(
  entries: TastingHistoryEntry[],
  ctx: { profileId: string; viewerId: string },
): ProfileTastingRow[]; // lastScoredAt desc, then name (localeCompare), then id
export function tastingsFooter(count: number): string;
export function emptyProfileCopy(p: { isOwn: boolean; name: string }): { title: string; body: string };
```

### 4.2 Vitest cases (write first)

1. **`favoriteWineLabel`**: "RED" → "Red"; "DESSERT" → "Dessert / sweet"; an unknown "Natural" → "Natural"; `null` and `""` → `null`.
2. **`profileMeta`**
   - `{ "Copenhagen", "RED", "2026-09-12T10:00:00Z" }` gives "Copenhagen · Favorite: Red · Joined Sep 2026".
   - No location and no favourite gives "Joined Sep 2026". A location of "   " is skipped.
   - `createdAt` "2026-08-31T23:30:00Z" gives "Joined Aug 2026" (UTC, not local).
3. **`profileStatTrio`**
   - `winesGuessed: 0` gives `null`.
   - `{12, 48, 18.64}` gives `[{"12","tastings"},{"48","wines guessed"},{"18.6","avg points"}]`.
   - `{1, 1, 5}` gives "tasting" and "wine guessed".
   - 1234 gives "1,234".
4. **`accuracyView`**
   - Row order and omission: with country 7/9, region 5/9, appellation 0/0, grape 4/9, vintage 2/9 plus partial 3, producer 1/9, secondary grape 1/2 and designation 0/0, the labels are exactly Country, Region, Grape, Vintage ±1, Producer, Second grape.
   - Values: Country "78%" (pct 78); Vintage ±1 "56%" (5 of 9); Second grape "—" (pct 0).
   - The threshold: 3 applicable gives a rate, 2 gives "—". 2/3 gives "67%".
   - Strongest:
     - the example above gives "Country · 78% of 9 wines";
     - Country 6/8 against Region 9/12 (a rate tie) gives Region (more wines);
     - Country 7/9 against Region 7/9 gives Country (the earlier row);
     - Second grape at 2/2 = 100% never wins (below 3);
     - every qualifying row at 0 hits gives `null`;
     - Vintage wins on ±1 hits: vintage 1 exact plus 8 partial out of 9, all else at 50%, gives "Vintage ±1 · 100% of 9 wines".
   - The footnote is present when any shown row is below 3, and `null` when all are at 3 or more.
   - Semi-blind only: `winesGuessed: 4` with every `applicable` at 0 gives `rows: []`, `strongest: null`, `footnote: null` and `empty: SEMI_BLIND_ONLY`.
   - `winesGuessed: 0` gives `rows: []` and `empty: null` (the page shows the empty state instead).
5. **`shareRows`**
   - France 6, Italy 3 gives `{France, 100, "6"}` and `{Italy, 50, "3"}`.
   - Two "None" entries (2 and 1) merge into `{None, …, "3"}` and re-sort.
   - More than 5 entries after merging are capped at 5. An equal count sorts by name. `[]` gives `[]`.
6. **`profileTastingRows`** (`profileId "p"`, `viewerId "v"`)
   - Order: `lastScoredAt` newest first. A tie sorts by name, then by id.
   - Date: "2026-09-12T19:40:00Z" gives "12 Sep 2026"; "2026-01-01T00:30:00+01:00" gives "31 Dec 2025".
   - Blind:
     - points 42 over 6 wines gives result "42 pts", wines "6", phoneBottom "6 wines" and modeNote `null`;
     - points 1 gives "1 pt" and points 0 gives "0 pts";
     - 1 wine gives "1 wine".
   - `SEMI_BLIND`, points 3 over 4 wines, gives result "3 of 4 matched", modeNote "Semi-blind" and phoneBottom "Semi-blind". `OPEN` gives modeNote "Open" with a points result.
   - Host:
     - `hostId === "v"` gives host "You" and phoneMeta "hosted by you · 12 Sep 2026";
     - otherwise it gives the host name and "hosted by Gustav · 12 Sep 2026";
     - a profile that hosted its own tasting, seen by someone else, shows that person's name.
   - href is `/u/p/tastings/{tastingId}`.
7. **`tastingsFooter`**: 1 gives "1 tasting · newest first"; 12 gives "12 tastings · newest first"; 1234 gives "1,234 tastings · newest first".
8. **`emptyProfileCopy`**: own gives "No tastings yet" with the §2.6 own body; `{ isOwn: false, name: "Anna" }` gives "Anna’s numbers and tastings show up here once a glass they guessed has been revealed." (with a typographic apostrophe).

## 5. Theme and layout rules

- **Theme tokens only.** This covers `text-muted-foreground`, `border-border`, `hover:bg-muted/30`, `text-destructive`, and the primitives' own `bg-primary`/`bg-gold`/`bg-rose`/`bg-muted`/`bg-card`/`border-border-strong`. There are no hex values and no raw palette classes. Check both themes: the app is light by default and dark only by choice.
- **375 px has no horizontal scroll.**
  - The header wraps; the name and bio use `break-words`; the actions take their own row below `md`.
  - `StatTrio` uses three equal columns.
  - The cards stack one-up.
  - `AccuracyRows` has fixed label and value widths with a flexible track.
  - The table exists only at xl; the phone cards truncate their text lines.
- **Tap targets are `min-h-11`** below `md:pointer-fine`: the header buttons, both `FriendButton` variants, the phone cards, and the table's name links (also `min-h-11`, for a touch device at xl width).
- **Base UI.** "Cellar" and "Edit profile" are `Button` with `render={<Link/>}` and `nativeButton={false}`. The friend and invite controls are native `<button>`s. There is no `asChild`.
- **No hydration-sensitive strings** (R9): the dates and months are UTC server strings from server components. There is no `localStorage` and there are no inputs.

## 6. Existing behaviour, and how it is kept

| Today | Kept by |
|---|---|
| Signed out → `/login` | unchanged |
| Unknown id → 404 | unchanged (`notFound()` on no profile row) |
| Deleted profile → the minimal "Deleted user" page with no photo, stats, list, joined date, friend or cellar | the same JSX, returned before every other read (§2.7) |
| `AppHeader` with the viewer's name and avatar (email fallback) | unchanged props and fallback; `me` now reads in parallel with `profile` |
| Any signed-in user can open any profile (open directory) | unchanged; the RLS and reads are the same |
| Phone number private | never selected, so never rendered |
| Avatar image, or its initial fallback | `Avatar` (same `src`-presence rule and initial), larger header placement |
| Name in the heading serif | `h1` in `font-heading text-3xl` (PageHeader's classes); "You" badge on your own |
| Bio when set | under the meta line, `max-w-prose` |
| Location badge (`MapPin`) | first part of the meta line |
| Favourite wine type badge via `FAVORITE_WINE_TYPE_ITEMS`, raw fallback | "Favorite: {label}" in the meta line, same lookup and fallback (`favoriteWineLabel`) |
| "Joined {Month YYYY}" in the server's locale | "Joined {Mon YYYY}" in UTC (`joinedLabel`, R11) |
| Own: "Edit profile" → `/profile/edit` | the same Button-rendered link, header styling |
| Own: "Invite someone" (outline) → the invite dialog | the same `InvitePeopleButton`, unchanged |
| Own: "View cellar" → `/cellar` | dropped: the nav's Cellar pillar is the one entry point (D1) |
| Other: "View cellar" → `/u/{id}/cellar`, always shown | "Cellar", shown only when `can_view_cellar` is true (R2); same target |
| Other: Add friend / one-tap Remove friend, "Adding…"/"Removing…", error verbatim | `FriendButton variant="header"`: Add friend, then a "Friends" state with a two-tap remove (R1); same actions, pending labels and verbatim error |
| Friend change refreshes the page | `addFriend`/`removeFriend` still `revalidatePath("/u/{id}")`; the Cellar gate re-evaluates with it |
| Invite accept (`/invite/<code>` → `/u/<inviterId>`) shows the friendship | shows "Friends" (outline, check), where it showed "Remove friend"; comment updated in `invite/actions.ts` |
| Profile edit saves → `/u/{me}` | unchanged; shows the new header |
| Stats only when `winesGuessed > 0`: Tastings / Wines guessed / Avg pts per wine | `StatTrio`: tastings / wines guessed / avg points, same numbers, same gate |
| "Strongest at: {category} ({pct}% — c/a)", MIN_SAMPLE 3 | the card's "Strongest" footer row, computed from the displayed rows, same MIN_SAMPLE and tie rule, vintage as ±1 (R3) |
| "Accuracy by category", eight categories, 0-applicable rows hidden, "c/a (pct%)", vintage "(+N off by 1yr)" | `AccuracyRows` with the same eight categories and the same hiding; the rate as "{pct}%" from 3 wines, "—" below; Vintage ±1 folds in the off-by-one credit |
| Semi-blind guesses never counted as wrong in categories | unchanged (`tallyGuess` skips nulls); a semi-blind-only person gets the card's own note |
| Top countries / regions / grapes, top 5 with counts | share-of-top rows in "Origins tasted most" and "Grapes tasted most", same top 5 and counts (same-name entries merged) |
| "Tastings attended": each linking to `/u/{id}/tastings/{tid}`, name, "— hosted by {host}", "{n} wine(s)", "{p} pts", sorted by name | table (xl) / cards: same link target, name, host ("You" when it was you), wines, points (semi-blind "m of n matched", R7); newest first with a date (R5) |
| Only fully revealed glasses count; same figures for every viewer | unchanged scoping in `getProfileStats` |
| Tasting cover photos never shown | still never shown (R6) |
| `loading.tsx` "Loading profile…" | unchanged |
| Drill-down page and read-only cellar | unchanged |

## 7. Open for the owner

- **Average points mixes semi-blind 0/1 guesses** with blind 0–30 totals. It does so on this page, Community, the Overview card and Your numbers alike, so it is left alone here (R12). Excluding them would be one change across all four surfaces.
- **Community still shows "Cellar" by `cellar_visibility`** (`cellarLinkShown`). A FRIENDS cellar with no friendship therefore shows a button there that this page hides (R2). Aligning Community would need one `can_view_cellar` call per row, or a batched helper.
- **A notes count** ("{n} notes written") would be one head-count query on `wset_notes` (resolved notes are readable by everyone). It is left out (R13).
- **A "Points per tasting" `ColumnChart`** could be drawn from the existing per-tasting points. It is not in D3, so it is not built.

## 8. Verification

1. `npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test`, `npm run build`.
2. Grep gates:
   - no `bestCategory` or `CategoryStrength` anywhere in `src`;
   - no `variant="profile"` or `"Remove friend"` in `src`;
   - no `toLocaleDateString`, `MapPin` or `image_url` under `src/app/u/[id]/page.tsx` and the three new components;
   - no raw palette classes (`bg-green`, `text-red`, …) in them;
   - no `phone` in any `select(` string under `src/app/u/[id]`.
3. The browser pass (done by the main session, not the implementer) as demo accounts (`.superpowers/demo-session.mjs`), at 375 px and 1280 px, in light and dark:
   - own profile: "You" badge, Edit profile, Invite someone opens the dialog, no Cellar;
   - another person, not a friend: Add friend → "Friends" → one tap arms "Tap again to remove" → the second tap removes; a single tap times out after 5 s;
   - Cellar with PUBLIC, FRIENDS with and without a friendship, and PRIVATE: shown only when `/u/{id}/cellar` would open;
   - a person with only semi-blind guesses (the accuracy card note, "m of n matched" rows);
   - a person with no tastings (the empty state, no trio or cards);
   - a deleted profile (unchanged minimal page);
   - a tasting row opens `/u/{id}/tastings/{tid}`;
   - no horizontal scroll at 375;
   - nothing moves or appears on hover.
