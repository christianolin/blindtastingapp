import { redirect } from "next/navigation";
import { PageHeader } from "@/components/patterns/page-header";
import { InvitePeopleButton } from "@/components/invite/invite-people-button";
import { createClient } from "@/lib/supabase/server";
import { getBulkProfileSummaries } from "@/lib/profile-stats";
import { relationship } from "@/lib/friends/relationship";
import {
  COMMUNITY_PAGE,
  activeSinceIso,
  cellarLinkShown,
  communityBand,
  communityHref,
  effectiveSort,
  joinedLabel,
  lastActive,
  orderByIds,
  pageCount as computePageCount,
  parseCommunityParams,
  peopleSearchOr,
  statCells,
} from "@/lib/community/community-math";
import { CommunityList, type CommunityRow } from "./community-list";

// A helper (not inline in the component body) keeps the `Date.now()` read
// out of render's own purity check — the same pattern record-view.tsx's
// `finishedRecently` uses.
function nowMs(): number {
  return Date.now();
}

type ProfileRow = {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  created_at: string;
  last_seen_at: string | null;
  cellar_visibility: string;
};

// Community — the redesigned directory of every profile ("Everyone") plus
// the ones you've added ("Friends"), aligned to the same toolbar/table/card
// pattern as Catalog and Cellar (spec
// docs/superpowers/specs/2026-09-19-community-redesign.md). /people and
// /friends redirect here (next.config.ts, friends/page.tsx).
export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = parseCommunityParams(await searchParams);
  const now = nowMs();
  const sort = effectiveSort(params.view, params.sort);

  // Friend-requests §3.4: accepted friends (own friendships rows), the
  // requests the viewer sent and the ones waiting on them — one query each,
  // all readable as the viewer ("friend_requests read own"). A failed request
  // read just shows no pending state.
  const [
    { data: meRow },
    { data: friendRows },
    { data: outgoingRows },
    { data: incomingRows },
    { count: peopleCount },
    { count: activeCount },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("friendships").select("friend_id").eq("user_id", user.id),
    supabase.from("friend_requests").select("recipient_id").eq("requester_id", user.id),
    supabase
      .from("friend_requests")
      .select("requester_id")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .order("requester_id", { ascending: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .gte("last_seen_at", activeSinceIso(now)),
  ]);

  const inviterName = meRow?.display_name ?? user.email ?? "";
  const friendIds = new Set((friendRows ?? []).map((f) => f.friend_id));
  const outgoingIds = new Set((outgoingRows ?? []).map((r) => r.recipient_id));
  // Newest request first: the Requests view's order.
  const requestOrder = (incomingRows ?? []).map((r) => r.requester_id);
  const incomingIds = new Set(requestOrder);

  let listQuery = supabase
    .from("profiles")
    .select(
      "id, display_name, bio, avatar_url, location, created_at, last_seen_at, cellar_visibility",
      { count: "exact" },
    )
    // A deleted account is scrubbed to "Deleted user" and stays for others'
    // records, but never appears in the directory (account-deletion §5.6).
    .is("deleted_at", null);
  if (params.view === "friends") {
    listQuery = listQuery.in("id", [...friendIds]);
  } else if (params.view === "requests") {
    listQuery = listQuery.in("id", requestOrder);
  }
  const or = peopleSearchOr(params.q);
  if (or) listQuery = listQuery.or(or);
  // §3.3's tiebreakers keep every sort's page boundaries stable even when
  // many rows share the leading key (several profiles with a null
  // last_seen_at, the same joined month, or — in principle — the same name).
  listQuery =
    sort === "name"
      ? listQuery.order("display_name", { ascending: true }).order("id", { ascending: true })
      : sort === "joined"
        ? listQuery.order("created_at", { ascending: false }).order("id", { ascending: true })
        : listQuery
            .order("last_seen_at", { ascending: false, nullsFirst: false })
            .order("display_name", { ascending: true })
            .order("id", { ascending: true });

  const from = (params.page - 1) * COMMUNITY_PAGE;
  const to = from + COMMUNITY_PAGE - 1;

  let rows: ProfileRow[] = [];
  let total = 0;
  let queryError: string | null = null;

  // Friends with no friends at all (or Requests with none waiting) skips the
  // query outright (§3.3) — an empty `.in("id", [])` isn't wrong, it's just a
  // round trip for a result CommunityList already renders as its own empty
  // state.
  const skipQuery =
    (params.view === "friends" && friendIds.size === 0) ||
    (params.view === "requests" && incomingIds.size === 0);
  if (!skipQuery && params.view === "requests") {
    // Newest request first (friend-requests §3.4): an order no profile column
    // holds, so every requester comes back at once and is ordered and paged
    // here. Someone's pending requests are few; the sort above is unused.
    const { data, error } = await listQuery;
    if (error) {
      queryError = error.message;
    } else {
      const ordered = orderByIds(data ?? [], requestOrder);
      total = ordered.length;
      rows = ordered.slice(from, to + 1);
      if (rows.length === 0 && params.page > 1) {
        redirect(communityHref({ view: params.view, q: params.q, sort: params.sort, page: 1 }));
      }
    }
  } else if (!skipQuery) {
    const { data, count, error } = await listQuery.range(from, to);
    if (error) {
      // R11: a page requested past the end (PostgREST's 416/PGRST103 range
      // error) redirects to page 1 of the same view, search and sort.
      if (error.code === "PGRST103" && params.page > 1) {
        redirect(communityHref({ view: params.view, q: params.q, sort: params.sort, page: 1 }));
      }
      // R12: any other query failure is shown, not hidden behind an empty list.
      queryError = error.message;
    } else {
      rows = data ?? [];
      total = count ?? 0;
      // R11's other case: a valid but empty page past the first.
      if (rows.length === 0 && params.page > 1) {
        redirect(communityHref({ view: params.view, q: params.q, sort: params.sort, page: 1 }));
      }
    }
  }

  // Batched once for the whole page (CLAUDE.md's People/profile rule): never
  // fetch one profile's stats at a time in a loop.
  const summaries = await getBulkProfileSummaries(rows.map((r) => r.id));

  const communityRows: CommunityRow[] = rows.map((p) => {
    const isMe = p.id === user.id;
    return {
      id: p.id,
      name: p.display_name,
      avatarUrl: p.avatar_url,
      bio: p.bio,
      location: p.location,
      isMe,
      relationship: isMe
        ? "none"
        : relationship({
            friend: friendIds.has(p.id),
            outgoing: outgoingIds.has(p.id),
            incoming: incomingIds.has(p.id),
          }),
      showCellar: cellarLinkShown(p.cellar_visibility, isMe),
      lastActive: lastActive(p.last_seen_at, now),
      joined: joinedLabel(p.created_at),
      stats: statCells(summaries.get(p.id)),
    };
  });

  const band = communityBand({
    people: peopleCount ?? 0,
    friends: friendIds.size,
    active: activeCount ?? 0,
  });
  const pc = computePageCount(total, COMMUNITY_PAGE);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Community"
        subtitle="Everyone tasting on Blindr, and the friends you keep"
        actions={<InvitePeopleButton inviterName={inviterName} emphasis="primary" />}
      />

      <div className="hidden flex-wrap items-baseline gap-x-6 gap-y-2 md:flex">
        {band.parts.map((part) => (
          <p key={part.label} className="flex items-baseline gap-1.5">
            <span className="font-heading text-2xl font-semibold tabular-nums">{part.value}</span>
            <span className="text-sm text-muted-foreground">{part.label}</span>
          </p>
        ))}
      </div>
      <p className="text-sm text-muted-foreground md:hidden">{band.phone}</p>

      <CommunityList
        rows={communityRows}
        view={params.view}
        q={params.q}
        sort={sort}
        sortParam={params.sort}
        page={params.page}
        pageCount={pc}
        total={total}
        counts={{ everyone: peopleCount ?? 0, friends: friendIds.size, requests: incomingIds.size }}
        inviterName={inviterName}
        error={queryError}
      />
    </div>
  );
}
