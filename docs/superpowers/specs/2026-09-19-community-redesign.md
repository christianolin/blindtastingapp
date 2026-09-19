# Community redesign — design

Date 2026-09-19. Owner: "We also to need to align the community tab with the same design philosophy as all the re-designed pages." Visual reference: the catalog list (`src/app/catalog/page.tsx`, `catalog-list.tsx`; hand-off screens W1/W1b in `.superpowers/cellar-catalog/handoff-screens.md`) and the cellar list (`cellar-toolbar.tsx`, `bottle-list.tsx`, `row-actions.tsx`). Standing owner feedback applied: actions are real buttons, never text links styled as actions; a row action never overlaps another column; one entry point per action in a row.

## 1. Decisions

Given:
- **D1** Title "Community" (the nav item's name) with a one-line subtitle; "Invite someone" is the primary header action, placed and styled like "Add a bottle" on `/cellar` (the existing `InvitePeopleButton` and its dialog).
- **D2** A stat line under the title in the catalog band's style.
- **D3** A catalog-style toolbar: search, the sort as a select, and pills "Everyone N" / "Friends K" replacing the People/Friends tabs. The URL contract stays.
- **D4** Laptop (xl): a bordered table — Person, place, tastings, average points, last active, and a last column of its own for row actions revealed on hover/focus. One primary action per row. "Cellar" only where the cellar is visible today. No "Go to profile".
- **D5** Phone: cards like the catalog's phone rows, with the friend action as a real 44 px button.
- **D6** The Friends view uses the same rows. Its empty state explains how to add friends and offers "Invite someone".
- **D7** Every existing behaviour is kept (§6).

Refined here:
- **R1 The state is visible at rest, and the actions show on hover.** A friend's quiet "Friends" button (outline, `Check` icon) is always visible in the actions column, because it shows the state. "Add friend" and "Cellar" fade in on row hover or focus-within. Only opacity changes and the column's width is always reserved, so nothing overlaps another column or shifts (unlike the catalog's absolutely positioned hover strip).
- **R2 Removing a friend takes two taps.** The first tap on "Friends" relabels it "Tap again to remove" (`variant="destructive"`) for `TWO_TAP_WINDOW_MS` (5 s), using the app's existing inline confirm (`twoTapState`, `src/lib/console-copy.ts`). A second tap inside that window removes. A button that shows a state should not destroy anything on a single tap. `/u/[id]` keeps its one-tap "Remove friend".
- **R3 Actions only hide on fine pointers.** The reveal classes are `pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100`, on `tr.group`. A touch device at xl width (a tablet in landscape) always sees the actions, and so never taps an invisible button.
- **R4 25 people a page** (was 10), the catalog's page size and footer line.
- **R5 Each view has its own default sort** when `?sort` is absent. Everyone sorts by last active, today's People default. Friends sorts by name, today's Friends order. An explicit `?sort` wins in both views and is kept when you switch pills.
- **R6 Search values are quoted.** Today `q` goes into the PostgREST `or` filter unescaped (`display_name.ilike.%${q}%,…`). A comma or parenthesis in it ("Copenhagen, Denmark") breaks the filter, and the page silently shows "No one found". `peopleSearchOr` double-quotes each value and backslash-escapes `\` and `"`. Search now works in the Friends view as well.
- **R7 The "{n} mutual" line is dropped, along with its query.** `friendships` has exactly one SELECT policy, `friendships read own` (`user_id = auth.uid()`, the only one in `supabase/migrations`). The `.in("user_id", pageIds)` read therefore returns only your own rows, and the count is 0 for everyone else — it has never rendered. Real mutual counts would need a SECURITY DEFINER RPC, which is out of scope (no migrations).
- **R8 A layout for the nav.** `src/app/community/layout.tsx` renders `<AppHeader />`, as the catalog and cellar layouts do, so `loading.tsx` renders under the nav.
- **R9 Time and locale labels come from the server.** The list is a client component. Computing "Now"/"Today" or a locale date on both the server and the client risks a hydration mismatch. So the server works out every such label ("last active", the joined month) once, with a single `now`, and passes strings.
- **R10 The "active" dot uses `bg-success`.** It was `bg-green-600`, a raw palette class.
- **R11 A page past the end redirects.** When `?page` is past the end (no rows, or PostgREST's `PGRST103` range error) and `page > 1`, the page redirects to page 1 of the same view, search and sort.
- **R12 A query error is shown, not hidden.** A list query error renders its message (`role="alert"`) instead of posing as an empty result.

## 2. The page, top to bottom

Container: `mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6`, the cellar's, which gives a 16 px gutter on phones. Every quoted string below is the exact copy. Numbers use `toLocaleString("en-US")`. A missing value is "—".

### 2.1 Header
`PageHeader`:
- title "Community"
- subtitle "Everyone tasting on Blindr, and the friends you keep"
- action: `<InvitePeopleButton emphasis="primary">`, a `UserPlus` icon followed by "Invite someone". It uses the default (bordeaux) variant with `min-h-11 gap-1.5 px-4 md:pointer-fine:min-h-9`, the same classes as `/cellar`'s "Add a bottle".

### 2.2 Stat line
- md and up: the catalog band's markup (`hidden flex-wrap items-baseline gap-x-6 gap-y-2 md:flex`; numeral `font-heading text-2xl font-semibold tabular-nums`, label `text-sm text-muted-foreground`). It reads: **32** people · **5** friends · **7** active this week.
- Phone (`md:hidden text-sm text-muted-foreground`), one line: "32 people · 5 friends · 7 active this week".
- Singulars are "1 person" and "1 friend". "active this week" never changes.

### 2.3 Toolbar
One `flex flex-wrap items-center gap-2` row. On phones it wraps onto two or three lines.
- Search: `Input type="search"`, a leading `Search` icon, placeholder "Name, place or bio", aria-label "Search people", `min-h-11 md:pointer-fine:min-h-9`, inside `relative min-w-56 flex-1`. It is controlled. Typing navigates after 300 ms with `router.replace(…, { scroll: false })`, and Enter navigates at once. Both reset to page 1.
- Sort: a "Sort" label (md and up) and a native select with the cellar's `selectCls` (44 px on phones). Options are "Last active" (`active`), "Name A–Z" (`name`) and "Joined (newest)" (`joined`). Choosing one calls `router.push` and resets to page 1.
- Filter: a "Filter" label (md and up) and two pill `<button>`s with the catalog's classes (`min-h-11 rounded-full border px-3 text-sm md:pointer-fine:min-h-8`; the active pill is `border-primary bg-primary text-primary-foreground`; `aria-pressed`). They read "Everyone 32" and "Friends 5". Switching keeps `q` and an explicit `sort`, and resets the page.
- Every navigation goes through `useTransition`. While one is pending, the list gets `opacity-60` and `aria-busy`.
- After a navigation the search box keeps what the user is typing. It takes the URL's `q` only when that `q` changed by some other route (back/forward), not when it matches the last value the box sent (a `lastSent` ref). This uses the render-phase "adjust state when a prop changes" pattern from `cellar-bottles.tsx`, not an effect.

### 2.4 Laptop table (xl and up)
The wrapper is `hidden overflow-hidden rounded-xl border border-border xl:block`, holding a `table-fixed text-sm` table. The header row is `border-b border-border text-left text-xs tracking-wide text-muted-foreground`. Each row is `group border-b border-border last:border-0 hover:bg-muted/30`.

| Column | Width | Header | Cell |
|---|---|---|---|
| Person | rest (~270 px at 1280 with the 240 px sidebar) | "Person" | One `Link` to `/u/{id}`: `Avatar` (`size-10`), then the name (`font-medium`, truncated) with a "You" `Badge variant="secondary"` on your own row. The bio sits under it, `line-clamp-1 text-xs text-muted-foreground`. |
| Where | 10rem | "Where" | location, truncated |
| Tastings | 6rem | "Tastings" (right-aligned) | the count, with "{w} wines" (xs, muted) below |
| Avg points | 6rem | "Avg points" (right-aligned) | "18.6", semibold, tabular |
| Last active | 8rem | "Last active" | A dot (`bg-success` when fresh, else `bg-muted-foreground/40`), then "Now", "Today" or "3 days ago". "joined Sep 2026" (xs, muted) sits below. |
| actions | 15rem | sr-only "Actions" | `flex justify-end gap-1.5`: "Cellar" when shown (outline `size="sm"`, `render={<Link href="/u/{id}/cellar" />}` with `nativeButton={false}`), then the friend button (§2.6). Your own row is empty. |

### 2.5 Phone and tablet cards (below xl)
`flex flex-col gap-2 xl:hidden`. Each card is `flex flex-col gap-2 rounded-xl border border-border p-3`.
- **Top:** one `Link` to `/u/{id}` (`flex min-h-11 items-start gap-3`). It holds:
  - the `Avatar` (`size-11`);
  - the name with the "You" badge (truncated);
  - a meta line (`text-xs text-muted-foreground`, truncated), e.g. "Copenhagen · active today · joined Sep 2026";
  - the bio (`line-clamp-1 text-xs`), when there is one;
  - the stats on the right (shrink-0, right-aligned): "18.6" (semibold, tabular) with an xs muted " avg", and "12 tastings" under it. Someone with no scored guesses shows "—" and "No tastings yet".
- **Footer**, on every card but your own: `flex justify-end gap-2`, with "Cellar" (outline) when shown and then the friend button. Both are `min-h-11`. The footer sits outside the link, so no button is nested inside an `<a>`.

### 2.6 Friend button (row variant)
- Not a friend: "Add friend" (default variant). While pending it shows "Adding…" with `WineGlassLoader`.
- A friend: "Friends" (outline, `Check` icon). The first tap arms it as "Tap again to remove" (R2). The second tap shows "Removing…".
- A refused write shows the error verbatim under the button (`text-sm text-destructive`), as today.
- Size is `size="sm"` plus `min-h-11 md:pointer-fine:min-h-8`. In the table, "Add friend" and "Cellar" carry R3's reveal classes (passed through `className`), and "Friends" does not.

### 2.7 Footer
When there are rows, a `flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground` line reads "1–25 of 32 · sorted by last active". The sort words are "last active", "name" and "newest joined". When there is more than one page it adds the catalog's pager: two `<button>`s (`size-11 md:pointer-fine:size-8`, aria-labels "Previous page" and "Next page") with "Page 1 of 2" between them, navigating with `router.push`.

### 2.8 Empty and error states (`EmptyState`)
- **Friends view, no friends at all:** "No friends yet", then "Tap Add friend on anyone under Everyone to keep them here. Adding a friend is one-way: nobody is asked or notified." Two buttons: "Show everyone" (outline, switches to Everyone) and "Invite someone" (`InvitePeopleButton emphasis="primary"`).
- **Friends view, the search matched none:** "None of your friends match “{q}”", with a "Clear search" button (outline).
- **Everyone view, the search matched none:** "Nobody matches “{q}”", with "Clear search".
- **Everyone view, no search, no rows** (defensive — you are always listed): "No one here yet", with "Invite someone".
- **The list query failed:** `<p role="alert" class="text-sm text-destructive">` reading "Could not load the list: {message}".
- `loading.tsx` stays unchanged ("Gathering the tasters…").

## 3. Data (no migration, no new table, view or RPC)

All of this lives in `page.tsx`, with the server client under the viewer's RLS.
1. `auth.getUser()`, redirecting to `/login` when there is no user. `parseCommunityParams(await searchParams)`, and `now = Date.now()` once.
2. In parallel:
   - **me:** `profiles.select("display_name").eq("id", user.id).maybeSingle()` gives the inviter's name, falling back to `user.email`.
   - **friends:** `friendships.select("friend_id").eq("user_id", user.id)` gives the `friendIds` set. It feeds "Friends K" and `isFriend`, and is the Friends view's id list.
   - **people:** `profiles.select("id", { count: "exact", head: true })` gives "N people" and "Everyone N".
   - **active:** the same count with `.gte("last_seen_at", activeSinceIso(now))` (a rolling 7 days) gives "active this week". `last_seen_at` is bumped by `touchLastSeen` from `AppHeader`, at most every 5 minutes.
3. **The list:** `profiles.select("id, display_name, bio, avatar_url, location, created_at, last_seen_at, cellar_visibility", { count: "exact" })`.
   - The Friends view adds `.in("id", [...friendIds])`. With no friends it skips the query and shows the empty state.
   - `.or(peopleSearchOr(q))` is added when that returns a string.
   - The order depends on the effective sort, with tiebreakers so pages stay stable:
     - `active`: `last_seen_at desc nulls last`, then `display_name`, then `id`;
     - `name`: `display_name`, then `id`;
     - `joined`: `created_at desc`, then `id`.
   - `.range((page−1)·25, page·25−1)`. `count` gives the footer total and the page count.
4. `getBulkProfileSummaries(pageIds)`, called once for this page's ids. Never call `getProfileStats` in a loop.
5. The server builds each row (R9): `{ id, name, avatarUrl, bio, location, isMe, isFriend, showCellar: cellarLinkShown(cellar_visibility, isMe), lastActive: lastActive(last_seen_at, now), joined: joinedLabel(created_at), stats: statCells(summary) }`.

`phone` and `email` are never selected. `favorite_wine_type` is not read (see §7).

## 4. Files

New:
- `src/app/community/layout.tsx` — `<div className="flex flex-1 flex-col"><AppHeader />{children}</div>`, as in `catalog/layout.tsx`.
- `src/lib/community/community-math.ts` — pure, with no imports, so vitest loads it without the `@/` alias. It holds everything in §4.1.
- `src/lib/community/community-math.test.ts` — the §4.2 cases. Write it first.
- `src/app/community/community-list.tsx` (`"use client"`) — the toolbar, laptop table, phone cards, footer and pager, and the empty/error states. It uses `useRouter` and `useTransition`, and never reads `localStorage`. Props:

  ```ts
  { rows, view, q, sort, sortParam, page, pageCount, total,
    counts: { everyone, friends }, inviterName, error }
  ```

Changed:
- `src/app/community/page.tsx` — rewritten: §3's reads, the `PageHeader`, the stat line and `<CommunityList>`. It drops `AppHeader`, `Tabs` and the `me.avatar_url` read, and calls `redirect()` for R11.
- `src/components/friend-button.tsx` — adds `variant?: "profile" | "row"` and a `className?` on the wrapper. The default `"profile"` renders exactly as today. `"row"` implements §2.6, with labels from `friendButtonLabel` and the two-tap from `twoTapState`/`TWO_TAP_WINDOW_MS`. The same `addFriend`/`removeFriend` actions serve both variants.
- `src/components/invite/invite-people-button.tsx` — adds `emphasis?: "outline" | "primary"`. The default `"outline"` leaves `/u/[id]` as it is today; `"primary"` is §2.1's styling. The header comment lists its three mounts: the `/community` header, the `/community` Friends empty state, and your own `/u/[id]`.
- `src/app/friends/page.tsx` — comment only: "People & Friends page" becomes "Community".
- `CLAUDE.md` — one short bullet next to the People/profile rules:
  - `/community`'s URL contract (`?tab=friends`, `?q`, `?sort`, `?page`);
  - status at rest and actions on hover;
  - removing a friend takes two taps;
  - why there is no mutual count (R7).

Deleted: `src/app/community/people-list.tsx`, `friends-list.tsx`, `people-sort.tsx`. After this, `src/components/ui/pagination.tsx` and `ui/tabs.tsx` have no importers left. They stay, as design-system primitives, and are listed for a later cleanup.

Unchanged: `loading.tsx`, `src/app/friends/actions.ts`, `invite-people-dialog.tsx`, `nav-links.ts` (it is already "Community"), and the `/people` → `/community` redirects in `next.config.ts`.

### 4.1 `community-math.ts` exports

```ts
export type CommunityView = "everyone" | "friends";
export type CommunitySort = "active" | "name" | "joined";
export type CommunityParams = { view: CommunityView; q: string; sort: CommunitySort | null; page: number };
export const COMMUNITY_PAGE = 25;
export const SEARCH_PLACEHOLDER = "Name, place or bio";
export const DEFAULT_SORT: Record<CommunityView, CommunitySort>; // everyone → active, friends → name
export const SORT_OPTIONS: readonly { value: CommunitySort; label: string }[];
export function parseCommunityParams(sp: Record<string, string | string[] | undefined>): CommunityParams;
export function effectiveSort(view: CommunityView, sort: CommunitySort | null): CommunitySort;
export function communityHref(p: { view: CommunityView; q?: string; sort?: CommunitySort | null; page?: number }): string;
export function peopleSearchOr(q: string): string | null;
export function activeSinceIso(nowMs: number): string;
export function pageCount(total: number, per: number): number;
export function sortedByWord(sort: CommunitySort): string;
export function communityPageLine(page: number, per: number, total: number, sort: CommunitySort): string;
export function communityBand(b: { people: number; friends: number; active: number }):
  { parts: { value: string; label: string }[]; phone: string };
export function filterLabel(view: CommunityView, count: number): string;
export function lastActive(iso: string | null, nowMs: number):
  { column: string; phrase: string; fresh: boolean } | null;
export function joinedLabel(iso: string): string; // "Sep 2026", UTC
export function statCells(s: { tastingsAttended: number; winesGuessed: number; averagePoints: number } | undefined):
  { tastings: string; wines: string | null; avg: string; phoneBottom: string };
export function phoneMeta(p: { location: string | null; activePhrase: string | null; joined: string }): string;
export function cellarLinkShown(visibility: string | null, isMe: boolean): boolean;
export function friendButtonLabel(s: { isFriend: boolean; pending: boolean; armed: boolean }): string;
export function emptyCopy(view: CommunityView, q: string, friendsCount: number):
  { title: string; body: string | null; actions: ("clear" | "everyone" | "invite")[] };
```

### 4.2 Vitest cases (write first)

1. **`parseCommunityParams`**
   - `{}` gives `{ view: "everyone", q: "", sort: null, page: 1 }`.
   - `tab=friends` gives the friends view; `tab=people` or garbage gives everyone.
   - `q: "  anna "` gives `"anna"`; `q: ["a","b"]` gives `"a"`.
   - `sort` accepts `active`/`name`/`joined`; `"bogus"` gives `null`.
   - `page` of `"abc"`, `"0"` or `"-2"` gives 1; `"2.7"` gives 2; `"3"` gives 3.
2. **`effectiveSort`**: `(everyone, null)` gives `active`; `(friends, null)` gives `name`; an explicit sort wins in both.
3. **`communityHref`**
   - everyone with no params gives `/community`; friends gives `/community?tab=friends`.
   - `q "anna b&c"` gives `?q=anna+b%26c`.
   - `sort` appears only when given; page 1 is omitted, page 3 is included.
   - Parameters come in the order tab, q, sort, page.
4. **`peopleSearchOr`**
   - `""` and `"   "` give `null`.
   - `"anna"` gives `display_name.ilike."%anna%",bio.ilike."%anna%",location.ilike."%anna%"`.
   - `"Copenhagen, Denmark"` keeps its comma inside the quotes, and `"(x)"` its parentheses.
   - `say "hi"` escapes the quotes as `\"`; a backslash becomes `\\`.
5. **`activeSinceIso`**: `now − 7·86 400 000` as an ISO string.
6. **Paging and the footer line**
   - `pageCount` gives 1 for 0 and for 25, and 2 for 26.
   - `sortedByWord` gives "last active" / "name" / "newest joined".
   - `communityPageLine(1,25,32,"active")` gives "1–25 of 32 · sorted by last active"; `(2,25,32,"name")` gives "26–32 of 32 · sorted by name"; 1,234 is grouped.
   - `SORT_OPTIONS` labels are "Last active" / "Name A–Z" / "Joined (newest)".
7. **`communityBand`**
   - `{32,5,7}` gives the parts 32/"people", 5/"friends", 7/"active this week", and the phone line "32 people · 5 friends · 7 active this week".
   - `{1,1,0}` gives "1 person · 1 friend · 0 active this week".
   - 1234 gives "1,234".
8. **`filterLabel`**: "Everyone 32", "Friends 0".
9. **`lastActive`**
   - `null` gives `null`.
   - 10 min ago gives Now / "active now" / fresh; 5 h ago gives Today / "active today" / fresh.
   - Exactly 24 h ago gives "1 day ago" / "active 1 day ago" / not fresh; 3 days ago gives "3 days ago".
   - A future timestamp gives Now.
10. **`joinedLabel`**: `2026-09-01T00:30:00Z` gives "Sep 2026"; `2026-08-31T23:30:00Z` gives "Aug 2026".
11. **`statCells`**
    - `undefined`, or 0 wines guessed, gives "—", `null`, "—" and "No tastings yet".
    - `{12,48,18.64}` gives "12", "48 wines", "18.6" and "12 tastings".
    - Singulars are "1 wine" and "1 tasting".
12. **`phoneMeta`**: all parts give "Copenhagen · active today · joined Sep 2026"; with no location and no activity it gives "joined Sep 2026".
13. **`cellarLinkShown`**: `PRIVATE` or `null` gives false; `FRIENDS`/`PUBLIC` give true; `isMe` gives false whatever the visibility.
14. **`friendButtonLabel`**: "Add friend", "Adding…", "Friends", "Tap again to remove", "Removing…".
15. **`emptyCopy`**
    - friends with 0 friends gives "No friends yet", §2.8's body, and `["everyone","invite"]`, whether or not `q` is set.
    - friends with `q "x"` and some friends gives "None of your friends match “x”" and `["clear"]`.
    - everyone with `q "x"` gives "Nobody matches “x”" and `["clear"]`.
    - everyone with no `q` gives "No one here yet" and `["invite"]`.

If the live check in §8 shows PostgREST rejecting the quoted `or` values, switch `peopleSearchOr` to stripping `,()"\` from `q`, and flip case 4 to match.

## 5. Theme and layout rules
- Theme tokens only: `bg-primary`, `bg-success`, `bg-muted-foreground/40`, `text-destructive`, `border-border`, `hover:bg-muted/30`, `text-muted-foreground`. No hex values and no raw palette classes. Check both themes.
- At 375 px nothing scrolls sideways: the table exists only at xl, and every card line truncates or clamps. Tap targets are `min-h-11` below `md:pointer-fine`.
- Base UI: "Cellar" is `Button` with `render={<Link/>}` and `nativeButton={false}`. The friend, invite, pill and pager controls are native `<button>`s. There is no `asChild`.
- Inputs are controlled, and nothing reads `localStorage`.

## 6. Existing behaviour, and how it is kept

| Today | Kept by |
|---|---|
| Add friend (inserts your own `friendships` row; 23505 counts as success) | the same `addFriend`, through `FriendButton variant="row"`; "Adding…" while pending; a refusal shown verbatim |
| Remove friend | the same `removeFriend`, now a two-tap on the row (R2); `/u/[id]` keeps one tap |
| Refresh after a change | the actions still `revalidatePath("/community")` and `/u/{id}`; a removed friend leaves the Friends view, and both counts update |
| One-way friendships, nobody notified | unchanged; the Friends empty state says so |
| Open directory including yourself, with a "You" badge | Everyone lists every profile including you, with the "You" badge on both widths; your row has no friend or cellar action |
| Profile link | the avatar and name link to `/u/{id}` on both widths; "Go to profile" goes (D4) |
| Cellar link | the same rule, `!isMe && cellar_visibility !== "PRIVATE"`, and the same target `/u/{id}/cellar`, which still gates on `can_view_cellar`. A FRIENDS cellar with no friendship in either direction still lands on "This cellar is private", as today. |
| Phone number private | never selected |
| Search on name, bio and location, case-insensitive | the same three columns with `ilike`, now quoted (R6), and in the Friends view too |
| Sort by active/name/joined via `?sort` | the same keys and URL values, with new labels; last active keeps nulls last; tiebreakers added; Friends defaults to name (R5) |
| Pagination via `?page` | kept, at 25 a page (R4); a prev/next pager; a page past the end redirects (R11) |
| `?tab=friends` | opens the Friends pill; any other value, or none, gives Everyone; the `/friends` and `/people` redirects are untouched |
| Per-person stats | `getBulkProfileSummaries` once per page, shown as the Tastings and Avg points columns (the phone's right-hand column); "hidden when zero" becomes "—" / "No tastings yet" |
| Last active with a fresh dot; the joined month | the same thresholds (under 1 h is now, under 24 h is today, then days); the dot is `bg-success`; "joined Sep 2026" |
| Location and bio | the Where column or the phone meta line; the bio on one line |
| "Showing N people" | replaced by the footer line and the stat line |
| "{n} mutual" | removed: it has never shown a non-zero value (R7) |
| Loading state | `loading.tsx` unchanged, now under the nav (R8); navigations inside the page dim the list |
| Invite someone and its dialog | the same component and dialog, with primary emphasis here; `/u/[id]` stays outline |

## 7. Open for the owner
- CLAUDE.md says the directory shows `favorite_wine_type`, but today's list doesn't, and D4's columns have no place for it. This note leaves it out. If it is wanted, it would be a second line under Where (e.g. "Likes Rosé").
- Mutual friends would need a SECURITY DEFINER count RPC (a migration). It is not built here (R7).

## 8. Verification
1. Run `npx tsc --noEmit`, `npm run lint -- --max-warnings=0`, `npm test` and `npm run build`.
2. Do a browser pass as a demo account (`.superpowers/demo-session.mjs`), at 375 px and 1280 px, in light and dark. Check:
   - no horizontal scroll at 375;
   - Everyone and Friends, `/community?tab=friends`, `/friends`;
   - a search for "Copenhagen, Denmark" and for a bio word;
   - each sort;
   - the pager, and `?page=99`, which redirects;
   - adding a friend, then removing one with two taps (and a single tap that times out after 5 s);
   - Cellar shown only on non-private rows;
   - your "You" row;
   - all three empty states;
   - Tab from the search box into a table row, which reveals that row's actions;
   - hovering a row never moves or covers another column;
   - "Invite someone" opens the dialog.
3. Grep gates under `src/app/community`: no `bg-green`, `Tabs`, `Go to profile`, `getProfileStats` or `mutual`.
