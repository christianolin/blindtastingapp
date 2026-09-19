// Pure logic for /community (spec docs/superpowers/specs/2026-09-19-community-redesign.md
// §4.1). No imports on purpose — vitest (node env, no `@/` alias configured)
// loads this directly, and nothing here needs anything beyond the language.

export type CommunityView = "everyone" | "friends";
export type CommunitySort = "active" | "name" | "joined";
export type CommunityParams = {
  view: CommunityView;
  q: string;
  sort: CommunitySort | null;
  page: number;
};

export const COMMUNITY_PAGE = 25;
export const SEARCH_PLACEHOLDER = "Name, place or bio";

// R5: each view's own default when `?sort` is absent.
export const DEFAULT_SORT: Record<CommunityView, CommunitySort> = {
  everyone: "active",
  friends: "name",
};

export const SORT_OPTIONS: readonly { value: CommunitySort; label: string }[] = [
  { value: "active", label: "Last active" },
  { value: "name", label: "Name A–Z" },
  { value: "joined", label: "Joined (newest)" },
];

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parsePage(raw: string): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function parseCommunityParams(
  sp: Record<string, string | string[] | undefined>,
): CommunityParams {
  const view: CommunityView = firstParam(sp.tab) === "friends" ? "friends" : "everyone";
  const q = (firstParam(sp.q) ?? "").trim();
  const sortRaw = firstParam(sp.sort);
  const sort: CommunitySort | null =
    sortRaw === "active" || sortRaw === "name" || sortRaw === "joined" ? sortRaw : null;
  const pageRaw = firstParam(sp.page);
  const page = pageRaw === undefined ? 1 : parsePage(pageRaw);
  return { view, q, sort, page };
}

export function effectiveSort(
  view: CommunityView,
  sort: CommunitySort | null,
): CommunitySort {
  return sort ?? DEFAULT_SORT[view];
}

// R5: `sort` is passed through unchanged (null included), so a caller that
// hands back the raw `?sort` (rather than the effective one) keeps a pill
// switch on a view's own default instead of forcing an explicit value.
export function communityHref(p: {
  view: CommunityView;
  q?: string;
  sort?: CommunitySort | null;
  page?: number;
}): string {
  const sp = new URLSearchParams();
  if (p.view === "friends") sp.set("tab", "friends");
  const q = p.q?.trim();
  if (q) sp.set("q", q);
  if (p.sort) sp.set("sort", p.sort);
  if (p.page && p.page > 1) sp.set("page", String(p.page));
  const qs = sp.toString();
  return qs ? `/community?${qs}` : "/community";
}

// R6: quoting a search value for PostgREST's `or` filter. Each column's
// pattern is wrapped in double quotes so a comma or parenthesis in the value
// can't be read as the `or` filter's own syntax; backslashes and quotes
// inside the value are escaped so the quoting itself can't be broken out of.
function escapeForOr(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function peopleSearchOr(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed) return null;
  const pattern = `"%${escapeForOr(trimmed)}%"`;
  return ["display_name", "bio", "location"]
    .map((col) => `${col}.ilike.${pattern}`)
    .join(",");
}

const DAY_MS = 86_400_000;

export function activeSinceIso(nowMs: number): string {
  return new Date(nowMs - 7 * DAY_MS).toISOString();
}

export function pageCount(total: number, per: number): number {
  return Math.max(1, Math.ceil(total / per));
}

export function sortedByWord(sort: CommunitySort): string {
  if (sort === "active") return "last active";
  if (sort === "name") return "name";
  return "newest joined";
}

export function communityPageLine(
  page: number,
  per: number,
  total: number,
  sort: CommunitySort,
): string {
  const from = (page - 1) * per + 1;
  const to = Math.min(page * per, total);
  return (
    `${from.toLocaleString("en-US")}–${to.toLocaleString("en-US")} of ` +
    `${total.toLocaleString("en-US")} · sorted by ${sortedByWord(sort)}`
  );
}

function peopleWord(n: number): string {
  return n === 1 ? "person" : "people";
}
function friendWord(n: number): string {
  return n === 1 ? "friend" : "friends";
}

export function communityBand(b: { people: number; friends: number; active: number }): {
  parts: { value: string; label: string }[];
  phone: string;
} {
  const peopleVal = b.people.toLocaleString("en-US");
  const friendsVal = b.friends.toLocaleString("en-US");
  const activeVal = b.active.toLocaleString("en-US");
  const parts = [
    { value: peopleVal, label: peopleWord(b.people) },
    { value: friendsVal, label: friendWord(b.friends) },
    { value: activeVal, label: "active this week" },
  ];
  const phone =
    `${peopleVal} ${peopleWord(b.people)} · ${friendsVal} ${friendWord(b.friends)} ` +
    `· ${activeVal} active this week`;
  return { parts, phone };
}

export function filterLabel(view: CommunityView, count: number): string {
  const word = view === "everyone" ? "Everyone" : "Friends";
  return `${word} ${count.toLocaleString("en-US")}`;
}

const HOUR_MS = 3_600_000;

export function lastActive(
  iso: string | null,
  nowMs: number,
): { column: string; phrase: string; fresh: boolean } | null {
  if (!iso) return null;
  const elapsed = nowMs - new Date(iso).getTime();
  if (elapsed < HOUR_MS) {
    return { column: "Now", phrase: "active now", fresh: true };
  }
  if (elapsed < DAY_MS) {
    return { column: "Today", phrase: "active today", fresh: true };
  }
  const days = Math.floor(elapsed / DAY_MS);
  const unit = days === 1 ? "day" : "days";
  return { column: `${days} ${unit} ago`, phrase: `active ${days} ${unit} ago`, fresh: false };
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// UTC, not local — R9: this runs server-side, once, with a fixed `now`, and
// must render the same string a client's hydration pass would compute from
// the same prop, so the local timezone can never enter into it.
export function joinedLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function statCells(
  s: { tastingsAttended: number; winesGuessed: number; averagePoints: number } | undefined,
): { tastings: string; wines: string | null; avg: string; phoneBottom: string } {
  if (!s || s.winesGuessed === 0) {
    return { tastings: "—", wines: null, avg: "—", phoneBottom: "No tastings yet" };
  }
  const tastingsWord = s.tastingsAttended === 1 ? "tasting" : "tastings";
  const winesWord = s.winesGuessed === 1 ? "wine" : "wines";
  return {
    tastings: s.tastingsAttended.toLocaleString("en-US"),
    wines: `${s.winesGuessed.toLocaleString("en-US")} ${winesWord}`,
    avg: s.averagePoints.toFixed(1),
    phoneBottom: `${s.tastingsAttended.toLocaleString("en-US")} ${tastingsWord}`,
  };
}

export function phoneMeta(p: {
  location: string | null;
  activePhrase: string | null;
  joined: string;
}): string {
  const parts: string[] = [];
  if (p.location) parts.push(p.location);
  if (p.activePhrase) parts.push(p.activePhrase);
  parts.push(`joined ${p.joined}`);
  return parts.join(" · ");
}

export function cellarLinkShown(visibility: string | null, isMe: boolean): boolean {
  if (isMe) return false;
  return visibility === "FRIENDS" || visibility === "PUBLIC";
}

export function friendButtonLabel(s: {
  isFriend: boolean;
  pending: boolean;
  armed: boolean;
}): string {
  if (!s.isFriend) return s.pending ? "Adding…" : "Add friend";
  if (s.pending) return "Removing…";
  return s.armed ? "Tap again to remove" : "Friends";
}

const FRIENDS_EMPTY_BODY =
  "Tap Add friend on anyone under Everyone to keep them here. Adding a friend is one-way: nobody is asked or notified.";

export function emptyCopy(
  view: CommunityView,
  q: string,
  friendsCount: number,
): { title: string; body: string | null; actions: ("clear" | "everyone" | "invite")[] } {
  if (view === "friends" && friendsCount === 0) {
    return { title: "No friends yet", body: FRIENDS_EMPTY_BODY, actions: ["everyone", "invite"] };
  }
  const trimmed = q.trim();
  if (trimmed) {
    const title =
      view === "friends"
        ? `None of your friends match “${trimmed}”`
        : `Nobody matches “${trimmed}”`;
    return { title, body: null, actions: ["clear"] };
  }
  return { title: "No one here yet", body: null, actions: ["invite"] };
}
