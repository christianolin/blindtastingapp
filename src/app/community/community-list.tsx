"use client";

// The Community page's toolbar, laptop table, phone/tablet cards, footer and
// pager, plus the empty and error states (spec
// docs/superpowers/specs/2026-09-19-community-redesign.md §2.3–2.8). The URL
// is the source of truth for view/search/sort/page — every discrete control
// (a pill, the sort select, the pager) pushes a new `communityHref` and lets
// the server re-render `page.tsx` with fresh rows; only the search box keeps
// its own live-typed state, since a 300ms-debounced round trip per keystroke
// would otherwise fight the user's typing.
import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { FriendButton } from "@/components/friend-button";
import { InvitePeopleButton } from "@/components/invite/invite-people-button";
import type { Relationship } from "@/lib/friends/relationship";
import { cn } from "@/lib/utils";
import {
  COMMUNITY_PAGE,
  SEARCH_PLACEHOLDER,
  SORT_OPTIONS,
  communityHref,
  communityPageLine,
  emptyCopy,
  filterLabel,
  phoneMeta,
  type CommunitySort,
  type CommunityView,
} from "@/lib/community/community-math";

export type CommunityRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  isMe: boolean;
  /** The viewer's relationship to this person ("none" on the viewer's own row). */
  relationship: Relationship;
  showCellar: boolean;
  lastActive: { column: string; phrase: string; fresh: boolean } | null;
  joined: string;
  stats: { tastings: string; wines: string | null; avg: string; phoneBottom: string };
};

const SEARCH_DEBOUNCE_MS = 300;

const selectCls =
  "h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground md:pointer-fine:h-9";

// R3: fades a row action in on hover/focus, only on a fine pointer, so a
// touch device at xl width (a tablet in landscape) always sees it. Applied
// to "Add friend" and "Cellar"; "Friends" and "Requested" are states, not
// actions, and the Accept / Decline pair is waiting on the viewer, so R1 and
// friend-requests §3.3 keep all three visible at rest.
const REVEAL =
  "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100";

const pageButtonCls =
  "inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-40 md:pointer-fine:size-8";

function pillCls(active: boolean): string {
  return cn(
    "min-h-11 rounded-full border px-3 text-sm transition-colors md:pointer-fine:min-h-8",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

export function CommunityList({
  rows,
  view,
  q,
  sort,
  sortParam,
  page,
  pageCount,
  total,
  counts,
  inviterName,
  error,
}: {
  rows: CommunityRow[];
  view: CommunityView;
  q: string;
  /** The effective sort (a view's own default when no `?sort` is given). */
  sort: CommunitySort;
  /** The raw `?sort`, or null — R5: carried forward as-is so a pill switch
   *  keeps an explicit sort but lets an unset one fall back to the new
   *  view's own default. */
  sortParam: CommunitySort | null;
  page: number;
  pageCount: number;
  total: number;
  /** The pill counts; `requests` is the requests waiting on the viewer. */
  counts: { everyone: number; friends: number; requests: number };
  inviterName: string;
  error: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // The search box's live value: it takes the URL's `q` only when that
  // changed via some other route (back/forward), never when it matches the
  // last value this box itself sent. A render-phase state adjustment — the
  // `queryKey`/`handledQueryKey` pattern cellar-bottles.tsx uses, all in
  // useState (a ref can't be read or written during render).
  const [committedQ, setCommittedQ] = useState(q);
  const [localQ, setLocalQ] = useState(q);
  const [lastSentQ, setLastSentQ] = useState(q);
  if (q !== committedQ) {
    setCommittedQ(q);
    if (q !== lastSentQ) {
      setLocalQ(q);
    }
  }

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function sendSearch(value: string) {
    // communityHref trims the value too; matching that here keeps
    // `lastSentQ` equal to the `q` the server will actually echo back, so a
    // trailing space the user is still typing through never gets silently
    // stripped out from under them.
    setLastSentQ(value.trim());
    startTransition(() => {
      router.replace(communityHref({ view, q: value, sort: sortParam, page: 1 }), {
        scroll: false,
      });
    });
  }

  function handleSearchChange(value: string) {
    setLocalQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sendSearch(value), SEARCH_DEBOUNCE_MS);
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    sendSearch(localQ);
  }

  function clearSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalQ("");
    setLastSentQ("");
    startTransition(() => {
      router.push(communityHref({ view, q: "", sort: sortParam, page: 1 }));
    });
  }

  function switchView(next: CommunityView) {
    if (next === view) return;
    startTransition(() => {
      router.push(communityHref({ view: next, q, sort: sortParam, page: 1 }));
    });
  }

  function changeSort(next: CommunitySort) {
    startTransition(() => {
      router.push(communityHref({ view, q, sort: next, page: 1 }));
    });
  }

  function goToPage(next: number) {
    startTransition(() => {
      router.push(communityHref({ view, q, sort: sortParam, page: next }));
    });
  }

  const empty = rows.length === 0 && !error ? emptyCopy(view, q, counts) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search people"
            value={localQ}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={SEARCH_PLACEHOLDER}
            className="min-h-11 w-full pl-9 md:pointer-fine:min-h-9"
          />
        </div>

        {/* Requests is always newest request first (friend-requests §3.4),
            an order none of the three sorts holds, so it has no Sort control. */}
        {view !== "requests" ? (
          <div className="flex items-center gap-1.5">
            <label htmlFor="community-sort" className="hidden text-sm text-muted-foreground md:inline">
              Sort
            </label>
            <select
              id="community-sort"
              aria-label="Sort"
              className={selectCls}
              value={sort}
              onChange={(e) => changeSort(e.target.value as CommunitySort)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">Filter</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={view === "everyone"}
              onClick={() => switchView("everyone")}
              className={pillCls(view === "everyone")}
            >
              {filterLabel("everyone", counts.everyone)}
            </button>
            <button
              type="button"
              aria-pressed={view === "friends"}
              onClick={() => switchView("friends")}
              className={pillCls(view === "friends")}
            >
              {filterLabel("friends", counts.friends)}
            </button>
            <button
              type="button"
              aria-pressed={view === "requests"}
              onClick={() => switchView("requests")}
              className={pillCls(view === "requests")}
            >
              {filterLabel("requests", counts.requests)}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the list: {error}
        </p>
      ) : empty ? (
        <EmptyState
          title={empty.title}
          description={empty.body ?? undefined}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {empty.actions.includes("clear") ? (
                <Button
                  variant="outline"
                  className="min-h-11 md:pointer-fine:min-h-9"
                  onClick={clearSearch}
                >
                  Clear search
                </Button>
              ) : null}
              {empty.actions.includes("everyone") ? (
                <Button
                  variant="outline"
                  className="min-h-11 md:pointer-fine:min-h-9"
                  onClick={() => switchView("everyone")}
                >
                  Show everyone
                </Button>
              ) : null}
              {empty.actions.includes("invite") ? (
                <InvitePeopleButton inviterName={inviterName} emphasis="primary" />
              ) : null}
            </div>
          }
        />
      ) : (
        <div aria-busy={isPending} className={cn(isPending && "opacity-60")}>
          {/* Phone and tablet cards (below xl) */}
          <div className="flex flex-col gap-2 xl:hidden">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <Link href={`/u/${r.id}`} className="flex min-h-11 items-start gap-3">
                  <Avatar src={r.avatarUrl} name={r.name} className="size-11" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {phoneMeta({
                        location: r.location,
                        activePhrase: r.lastActive?.phrase ?? null,
                        joined: r.joined,
                      })}
                    </span>
                    {r.bio ? (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {r.bio}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right text-sm">
                    <span className="font-semibold tabular-nums">{r.stats.avg}</span>
                    <span className="text-xs text-muted-foreground"> avg</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.stats.phoneBottom}
                    </span>
                  </span>
                </Link>
                {!r.isMe ? (
                  <div className="flex justify-end gap-2">
                    {r.showCellar ? (
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href={`/u/${r.id}/cellar`} />}
                        className="min-h-11"
                      >
                        Cellar
                      </Button>
                    ) : null}
                    <FriendButton
                      key={r.relationship}
                      personId={r.id}
                      relationship={r.relationship}
                      variant="row"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Laptop table (xl and up) */}
          <div className="hidden overflow-hidden rounded-xl border border-border xl:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[10rem]" />
                <col className="w-[6rem]" />
                <col className="w-[6rem]" />
                <col className="w-[8rem]" />
                <col className="w-[15rem]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Person</th>
                  <th className="px-4 py-3 font-medium">Where</th>
                  <th className="px-4 py-3 text-right font-medium">Tastings</th>
                  <th className="px-4 py-3 text-right font-medium">Avg points</th>
                  <th className="px-4 py-3 font-medium">Last active</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/u/${r.id}`} className="flex min-w-0 items-center gap-3">
                        <Avatar src={r.avatarUrl} name={r.name} className="size-10" />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium">{r.name}</span>
                            {r.isMe ? <Badge variant="secondary">You</Badge> : null}
                          </span>
                          {r.bio ? (
                            <span className="line-clamp-1 text-xs text-muted-foreground">
                              {r.bio}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </td>
                    <td className="truncate px-4 py-3 text-muted-foreground">
                      {r.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums">{r.stats.tastings}</span>
                      {r.stats.wines ? (
                        <span className="block text-xs text-muted-foreground">{r.stats.wines}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {r.stats.avg}
                    </td>
                    <td className="px-4 py-3">
                      {r.lastActive ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              r.lastActive.fresh ? "bg-success" : "bg-muted-foreground/40",
                            )}
                          />
                          {r.lastActive.column}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span className="block text-xs text-muted-foreground">joined {r.joined}</span>
                    </td>
                    <td className="px-4 py-3">
                      {r.isMe ? null : (
                        <div className="flex justify-end gap-1.5">
                          {r.showCellar ? (
                            <Button
                              size="sm"
                              variant="outline"
                              nativeButton={false}
                              render={<Link href={`/u/${r.id}/cellar`} />}
                              className={cn("min-h-11 md:pointer-fine:min-h-8", REVEAL)}
                            >
                              Cellar
                            </Button>
                          ) : null}
                          <FriendButton
                            key={r.relationship}
                            personId={r.id}
                            relationship={r.relationship}
                            variant="row"
                            className={r.relationship === "none" ? REVEAL : undefined}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {communityPageLine(page, COMMUNITY_PAGE, total, view === "requests" ? null : sort)}
          </span>
          {pageCount > 1 ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                className={pageButtonCls}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span>
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pageCount}
                onClick={() => goToPage(page + 1)}
                className={pageButtonCls}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
