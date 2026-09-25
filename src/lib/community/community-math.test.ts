import { describe, expect, it } from "vitest";
import {
  COMMUNITY_PAGE,
  DEFAULT_SORT,
  SORT_OPTIONS,
  activeSinceIso,
  cellarLinkShown,
  communityBand,
  communityHref,
  communityPageLine,
  effectiveSort,
  emptyCopy,
  filterLabel,
  friendButtonLabel,
  joinedLabel,
  lastActive,
  orderByIds,
  pageCount,
  parseCommunityParams,
  peopleSearchOr,
  phoneMeta,
  sortedByWord,
  statCells,
} from "./community-math";

describe("parseCommunityParams", () => {
  it("defaults with no params", () => {
    expect(parseCommunityParams({})).toEqual({ view: "everyone", q: "", sort: null, page: 1 });
  });

  it("tab", () => {
    expect(parseCommunityParams({ tab: "friends" }).view).toBe("friends");
    expect(parseCommunityParams({ tab: "requests" }).view).toBe("requests");
    expect(parseCommunityParams({ tab: ["requests", "friends"] }).view).toBe("requests");
    expect(parseCommunityParams({ tab: "people" }).view).toBe("everyone");
    expect(parseCommunityParams({ tab: "bogus" }).view).toBe("everyone");
  });

  it("q trims, and takes the first of an array", () => {
    expect(parseCommunityParams({ q: "  anna " }).q).toBe("anna");
    expect(parseCommunityParams({ q: ["a", "b"] }).q).toBe("a");
  });

  it("sort", () => {
    expect(parseCommunityParams({ sort: "active" }).sort).toBe("active");
    expect(parseCommunityParams({ sort: "name" }).sort).toBe("name");
    expect(parseCommunityParams({ sort: "joined" }).sort).toBe("joined");
    expect(parseCommunityParams({ sort: "bogus" }).sort).toBeNull();
  });

  it("page", () => {
    expect(parseCommunityParams({ page: "abc" }).page).toBe(1);
    expect(parseCommunityParams({ page: "0" }).page).toBe(1);
    expect(parseCommunityParams({ page: "-2" }).page).toBe(1);
    expect(parseCommunityParams({ page: "2.7" }).page).toBe(2);
    expect(parseCommunityParams({ page: "3" }).page).toBe(3);
  });
});

describe("effectiveSort", () => {
  it("falls back to each view's default", () => {
    expect(effectiveSort("everyone", null)).toBe("active");
    expect(effectiveSort("friends", null)).toBe("name");
  });
  it("an explicit sort wins in both views", () => {
    expect(effectiveSort("everyone", "joined")).toBe("joined");
    expect(effectiveSort("friends", "active")).toBe("active");
  });
  it("DEFAULT_SORT matches", () => {
    expect(DEFAULT_SORT).toEqual({ everyone: "active", friends: "name", requests: "name" });
  });
});

describe("communityHref", () => {
  it("everyone with no params", () => {
    expect(communityHref({ view: "everyone" })).toBe("/community");
  });
  it("friends with no other params", () => {
    expect(communityHref({ view: "friends" })).toBe("/community?tab=friends");
  });
  it("requests keeps the same parameter order", () => {
    expect(communityHref({ view: "requests" })).toBe("/community?tab=requests");
    expect(communityHref({ view: "requests", q: "anna", page: 2 })).toBe(
      "/community?tab=requests&q=anna&page=2",
    );
  });
  it("q is encoded", () => {
    expect(communityHref({ view: "everyone", q: "anna b&c" })).toBe("/community?q=anna+b%26c");
  });
  it("sort appears only when given", () => {
    expect(communityHref({ view: "everyone" })).toBe("/community");
    expect(communityHref({ view: "everyone", sort: "name" })).toBe("/community?sort=name");
    expect(communityHref({ view: "everyone", sort: null })).toBe("/community");
  });
  it("page 1 is omitted, page 3 is included", () => {
    expect(communityHref({ view: "everyone", page: 1 })).toBe("/community");
    expect(communityHref({ view: "everyone", page: 3 })).toBe("/community?page=3");
  });
  it("parameters come in the order tab, q, sort, page", () => {
    expect(
      communityHref({ view: "friends", q: "anna", sort: "joined", page: 3 }),
    ).toBe("/community?tab=friends&q=anna&sort=joined&page=3");
  });
});

describe("peopleSearchOr", () => {
  it("blank gives null", () => {
    expect(peopleSearchOr("")).toBeNull();
    expect(peopleSearchOr("   ")).toBeNull();
  });
  it("quotes each pattern", () => {
    expect(peopleSearchOr("anna")).toBe(
      'display_name.ilike."%anna%",bio.ilike."%anna%",location.ilike."%anna%"',
    );
  });
  it("keeps a comma inside the quotes", () => {
    expect(peopleSearchOr("Copenhagen, Denmark")).toBe(
      'display_name.ilike."%Copenhagen, Denmark%",bio.ilike."%Copenhagen, Denmark%",location.ilike."%Copenhagen, Denmark%"',
    );
  });
  it("keeps parentheses inside the quotes", () => {
    expect(peopleSearchOr("(x)")).toBe(
      'display_name.ilike."%(x)%",bio.ilike."%(x)%",location.ilike."%(x)%"',
    );
  });
  it("escapes quotes as \\\"", () => {
    expect(peopleSearchOr('say "hi"')).toBe(
      'display_name.ilike."%say \\"hi\\"%",bio.ilike."%say \\"hi\\"%",location.ilike."%say \\"hi\\"%"',
    );
  });
  it("escapes a literal backslash as \\\\", () => {
    expect(peopleSearchOr("a\\b")).toBe(
      'display_name.ilike."%a\\\\b%",bio.ilike."%a\\\\b%",location.ilike."%a\\\\b%"',
    );
  });
});

describe("activeSinceIso", () => {
  it("is seven days before now", () => {
    const now = Date.parse("2026-09-19T12:00:00Z");
    expect(activeSinceIso(now)).toBe(new Date(now - 7 * 86_400_000).toISOString());
  });
});

describe("paging and the footer line", () => {
  it("pageCount", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(25, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });
  it("sortedByWord", () => {
    expect(sortedByWord("active")).toBe("last active");
    expect(sortedByWord("name")).toBe("name");
    expect(sortedByWord("joined")).toBe("newest joined");
  });
  it("communityPageLine", () => {
    expect(communityPageLine(1, 25, 32, "active")).toBe("1–25 of 32 · sorted by last active");
    expect(communityPageLine(2, 25, 32, "name")).toBe("26–32 of 32 · sorted by name");
  });
  it("communityPageLine leaves the sort off for Requests (sort null)", () => {
    expect(communityPageLine(1, 25, 3, null)).toBe("1–3 of 3");
    expect(communityPageLine(2, 25, 30, null)).toBe("26–30 of 30");
  });
  it("communityPageLine groups large numbers", () => {
    expect(communityPageLine(1, 25, 1234, "joined")).toBe(
      "1–25 of 1,234 · sorted by newest joined",
    );
  });
  it("SORT_OPTIONS labels", () => {
    expect(SORT_OPTIONS.map((o) => o.label)).toEqual([
      "Last active",
      "Name A–Z",
      "Joined (newest)",
    ]);
  });
  it("COMMUNITY_PAGE is 25", () => {
    expect(COMMUNITY_PAGE).toBe(25);
  });
});

describe("communityBand", () => {
  it("plurals", () => {
    expect(communityBand({ people: 32, friends: 5, active: 7 })).toEqual({
      parts: [
        { value: "32", label: "people" },
        { value: "5", label: "friends" },
        { value: "7", label: "active this week" },
      ],
      phone: "32 people · 5 friends · 7 active this week",
    });
  });
  it("singulars", () => {
    expect(communityBand({ people: 1, friends: 1, active: 0 })).toEqual({
      parts: [
        { value: "1", label: "person" },
        { value: "1", label: "friend" },
        { value: "0", label: "active this week" },
      ],
      phone: "1 person · 1 friend · 0 active this week",
    });
  });
  it("groups large numbers", () => {
    expect(communityBand({ people: 1234, friends: 0, active: 0 }).parts[0]).toEqual({
      value: "1,234",
      label: "people",
    });
  });
});

describe("filterLabel", () => {
  it("reads Everyone/Friends plus the count", () => {
    expect(filterLabel("everyone", 32)).toBe("Everyone 32");
    expect(filterLabel("friends", 0)).toBe("Friends 0");
  });
  it("shows the Requests count only when something is waiting", () => {
    expect(filterLabel("requests", 0)).toBe("Requests");
    expect(filterLabel("requests", 3)).toBe("Requests 3");
    expect(filterLabel("requests", 1234)).toBe("Requests 1,234");
  });
});

describe("orderByIds", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("puts rows in the order of ids (newest request first)", () => {
    expect(orderByIds(rows, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
  it("drops a row whose id is not listed, and ignores an id with no row", () => {
    expect(orderByIds(rows, ["b", "x", "a"]).map((r) => r.id)).toEqual(["b", "a"]);
  });
  it("keeps the first place of a repeated id", () => {
    expect(orderByIds(rows, ["a", "b", "a", "c"]).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
  it("does not change its input", () => {
    const input = [{ id: "b" }, { id: "a" }];
    orderByIds(input, ["a", "b"]);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("lastActive", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  it("null", () => {
    expect(lastActive(null, now)).toBeNull();
  });
  it("10 minutes ago is Now, fresh", () => {
    expect(lastActive(new Date(now - 10 * 60_000).toISOString(), now)).toEqual({
      column: "Now",
      phrase: "active now",
      fresh: true,
    });
  });
  it("5 hours ago is Today, fresh", () => {
    expect(lastActive(new Date(now - 5 * 3_600_000).toISOString(), now)).toEqual({
      column: "Today",
      phrase: "active today",
      fresh: true,
    });
  });
  it("exactly 24 hours ago is 1 day ago, not fresh", () => {
    expect(lastActive(new Date(now - 86_400_000).toISOString(), now)).toEqual({
      column: "1 day ago",
      phrase: "active 1 day ago",
      fresh: false,
    });
  });
  it("3 days ago", () => {
    expect(lastActive(new Date(now - 3 * 86_400_000).toISOString(), now)).toEqual({
      column: "3 days ago",
      phrase: "active 3 days ago",
      fresh: false,
    });
  });
  it("a future timestamp is Now", () => {
    expect(lastActive(new Date(now + 60_000).toISOString(), now)).toEqual({
      column: "Now",
      phrase: "active now",
      fresh: true,
    });
  });
});

describe("joinedLabel", () => {
  it("is UTC, not local", () => {
    expect(joinedLabel("2026-09-01T00:30:00Z")).toBe("Sep 2026");
    expect(joinedLabel("2026-08-31T23:30:00Z")).toBe("Aug 2026");
  });
});

describe("statCells", () => {
  it("undefined", () => {
    expect(statCells(undefined)).toEqual({
      tastings: "—",
      wines: null,
      avg: "—",
      phoneBottom: "No tastings yet",
    });
  });
  it("0 wines guessed", () => {
    expect(statCells({ tastingsAttended: 0, winesGuessed: 0, averagePoints: 0 })).toEqual({
      tastings: "—",
      wines: null,
      avg: "—",
      phoneBottom: "No tastings yet",
    });
  });
  it("plurals", () => {
    expect(statCells({ tastingsAttended: 12, winesGuessed: 48, averagePoints: 18.64 })).toEqual({
      tastings: "12",
      wines: "48 wines",
      avg: "18.6",
      phoneBottom: "12 tastings",
    });
  });
  it("singulars", () => {
    expect(statCells({ tastingsAttended: 1, winesGuessed: 1, averagePoints: 20 })).toEqual({
      tastings: "1",
      wines: "1 wine",
      avg: "20.0",
      phoneBottom: "1 tasting",
    });
  });
});

describe("phoneMeta", () => {
  it("joins every part given", () => {
    expect(
      phoneMeta({ location: "Copenhagen", activePhrase: "active today", joined: "Sep 2026" }),
    ).toBe("Copenhagen · active today · joined Sep 2026");
  });
  it("with no location and no activity", () => {
    expect(phoneMeta({ location: null, activePhrase: null, joined: "Sep 2026" })).toBe(
      "joined Sep 2026",
    );
  });
});

describe("cellarLinkShown", () => {
  it("PRIVATE or null is hidden", () => {
    expect(cellarLinkShown("PRIVATE", false)).toBe(false);
    expect(cellarLinkShown(null, false)).toBe(false);
  });
  it("FRIENDS/PUBLIC are shown", () => {
    expect(cellarLinkShown("FRIENDS", false)).toBe(true);
    expect(cellarLinkShown("PUBLIC", false)).toBe(true);
  });
  it("isMe is always hidden", () => {
    expect(cellarLinkShown("PUBLIC", true)).toBe(false);
    expect(cellarLinkShown("FRIENDS", true)).toBe(false);
    expect(cellarLinkShown("PRIVATE", true)).toBe(false);
  });
});

describe("friendButtonLabel", () => {
  it("none: Add friend, then Sending…", () => {
    expect(friendButtonLabel({ relationship: "none", pending: false, armed: false })).toBe("Add friend");
    expect(friendButtonLabel({ relationship: "none", pending: true, armed: false })).toBe("Sending…");
  });

  it("requested: Requested, a two-tap cancel, then Cancelling…", () => {
    expect(friendButtonLabel({ relationship: "requested", pending: false, armed: false })).toBe(
      "Requested",
    );
    expect(friendButtonLabel({ relationship: "requested", pending: false, armed: true })).toBe(
      "Tap again to cancel",
    );
    expect(friendButtonLabel({ relationship: "requested", pending: true, armed: true })).toBe(
      "Cancelling…",
    );
  });

  it("incoming: the Accept / Decline pair and their pending labels", () => {
    expect(
      friendButtonLabel({ relationship: "incoming", control: "accept", pending: false, armed: false }),
    ).toBe("Accept");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "accept", pending: true, armed: false }),
    ).toBe("Accepting…");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "decline", pending: false, armed: false }),
    ).toBe("Decline");
    expect(
      friendButtonLabel({ relationship: "incoming", control: "decline", pending: true, armed: false }),
    ).toBe("Declining…");
    expect(friendButtonLabel({ relationship: "incoming", pending: false, armed: false })).toBe("Accept");
  });

  it("friends: Friends, a two-tap remove, then Removing…", () => {
    expect(friendButtonLabel({ relationship: "friends", pending: false, armed: false })).toBe("Friends");
    expect(friendButtonLabel({ relationship: "friends", pending: false, armed: true })).toBe(
      "Tap again to remove",
    );
    expect(friendButtonLabel({ relationship: "friends", pending: true, armed: true })).toBe("Removing…");
  });
});

describe("emptyCopy", () => {
  const none = { friends: 0, requests: 0 };
  it("friends with 0 friends, regardless of q", () => {
    expect(emptyCopy("friends", "", none)).toEqual({
      title: "No friends yet",
      body:
        "Tap Add friend on anyone under Everyone. They'll be asked, and you're friends once they accept.",
      actions: ["everyone", "invite"],
    });
    expect(emptyCopy("friends", "x", none).title).toBe("No friends yet");
    expect(emptyCopy("friends", "x", none).actions).toEqual(["everyone", "invite"]);
  });
  it("friends with a search and some friends", () => {
    expect(emptyCopy("friends", "x", { friends: 5, requests: 0 })).toEqual({
      title: "None of your friends match “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with a search", () => {
    expect(emptyCopy("everyone", "x", none)).toEqual({
      title: "Nobody matches “x”",
      body: null,
      actions: ["clear"],
    });
  });
  it("everyone with no search", () => {
    expect(emptyCopy("everyone", "", none)).toEqual({
      title: "No one here yet",
      body: null,
      actions: ["invite"],
    });
  });
  it("requests with nothing waiting, regardless of q", () => {
    const expected = { title: "No requests right now.", body: null, actions: ["everyone"] };
    expect(emptyCopy("requests", "", none)).toEqual(expected);
    expect(emptyCopy("requests", "x", none)).toEqual(expected);
  });
  it("requests waiting but none on screen and no search", () => {
    expect(emptyCopy("requests", "  ", { friends: 0, requests: 2 })).toEqual({
      title: "No requests right now.",
      body: null,
      actions: ["everyone"],
    });
  });
  it("requests waiting and a search that misses them all", () => {
    expect(emptyCopy("requests", "x", { friends: 0, requests: 2 })).toEqual({
      title: "Nobody matches “x”",
      body: null,
      actions: ["clear"],
    });
  });
});
