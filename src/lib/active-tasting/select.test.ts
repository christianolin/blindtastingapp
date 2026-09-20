import { describe, expect, it } from "vitest";
import {
  EMPTY_SNAPSHOT,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  activeHref,
  activeState,
  bannerView,
  candidateFromRow,
  isBannerFreePath,
  isOnTastingPath,
  newerSnapshot,
  overviewSlot,
  pollIntervalMs,
  selectActiveTastings,
  shouldPoll,
  type ActiveTastingCandidate,
  type ActiveTastingItem,
  type ActiveTastingSnapshot,
} from "./select";

const NOW = new Date("2026-09-19T18:00:00.000Z");
const HOUR = 3_600_000;
const MINUTE = 60_000;
/** The ISO string for NOW + n hours (negative = in the past). */
const h = (n: number) => new Date(NOW.getTime() + n * HOUR).toISOString();
/** The ISO string for NOW + n hours + m minutes. */
const hm = (n: number, m: number) =>
  new Date(NOW.getTime() + n * HOUR + m * MINUTE).toISOString();

const VIEWER = "me";

function row(overrides: Partial<ActiveTastingCandidate> = {}): ActiveTastingCandidate {
  return {
    id: "t1",
    name: "Friday flight",
    hostId: "host",
    status: "IN_PROGRESS",
    timingMode: "LIVE",
    revealMode: "BLIND",
    wineSource: "HOST_PROVIDES",
    startedAt: h(-1),
    pausedAt: null,
    scheduledAt: null,
    createdAt: h(-2),
    myStatus: "JOINED",
    ...overrides,
  };
}

const state = (overrides: Partial<ActiveTastingCandidate> = {}) =>
  activeState(row(overrides), NOW);

const ids = (items: ActiveTastingItem[]) => items.map((i) => i.tastingId);

const item = (tastingId: string): ActiveTastingItem => ({
  tastingId,
  name: tastingId,
  state: "live",
  href: `/tastings/${tastingId}`,
});

describe("activeState windows (D1, D2)", () => {
  it("1. a LIVE tasting started an hour ago is live; paused when paused_at is set", () => {
    expect(state()).toBe("live");
    expect(state({ pausedAt: h(-0.5) })).toBe("paused");
  });

  it("2. LIVE shows through exactly 24 h after its start, not a minute more", () => {
    expect(state({ startedAt: h(-24) })).toBe("live");
    expect(state({ startedAt: hm(-24, -1) })).toBeNull();
  });

  it("3. a LIVE legacy row with no started_at falls back to scheduled_at, then created_at", () => {
    expect(state({ startedAt: null, scheduledAt: h(-2) })).toBe("live");
    expect(state({ startedAt: null, scheduledAt: h(-25) })).toBeNull();
    expect(state({ startedAt: null, scheduledAt: null, createdAt: h(-3) })).toBe("live");
    expect(state({ startedAt: null, scheduledAt: null, createdAt: h(-30) })).toBeNull();
    // A legacy early start: the schedule is still ahead.
    expect(state({ startedAt: null, scheduledAt: h(3) })).toBe("live");
  });

  it("4. started_at wins over the fallbacks", () => {
    expect(state({ startedAt: h(-1), scheduledAt: h(-72) })).toBe("live");
    expect(state({ startedAt: h(-30), scheduledAt: h(-1) })).toBeNull();
  });

  it("5. ASYNC is always in progress, and ignores paused_at", () => {
    expect(state({ timingMode: "ASYNC", startedAt: h(-24 * 30) })).toBe("in-progress");
    expect(state({ timingMode: "ASYNC", pausedAt: h(-1) })).toBe("in-progress");
  });

  it("6. a DRAFT shows from 6 h before its schedule, inclusive", () => {
    const draft = { status: "DRAFT" as const, startedAt: null };
    expect(state({ ...draft, scheduledAt: h(5) })).toBe("waiting");
    expect(state({ ...draft, scheduledAt: h(6) })).toBe("waiting");
    expect(state({ ...draft, scheduledAt: hm(6, 1) })).toBeNull();
  });

  it("7. a DRAFT shows until 12 h after its schedule, inclusive", () => {
    const draft = { status: "DRAFT" as const, startedAt: null };
    expect(state({ ...draft, scheduledAt: h(-11) })).toBe("waiting");
    expect(state({ ...draft, scheduledAt: h(-12) })).toBe("waiting");
    expect(state({ ...draft, scheduledAt: hm(-12, -1) })).toBeNull();
  });

  it("8. an unscheduled DRAFT shows for 12 h after it was created; a schedule decides otherwise", () => {
    const draft = { status: "DRAFT" as const, startedAt: null };
    expect(state({ ...draft, scheduledAt: null, createdAt: h(-2) })).toBe("waiting");
    expect(state({ ...draft, scheduledAt: null, createdAt: hm(-12, -1) })).toBeNull();
    expect(state({ ...draft, scheduledAt: h(72), createdAt: h(-1) })).toBeNull();
  });

  it("9. never shown: CLOSED, legacy OPEN, INVITED, DECLINED, a host whose own row is INVITED", () => {
    expect(state({ status: "CLOSED" })).toBeNull();
    expect(state({ status: "OPEN" })).toBeNull();
    expect(state({ myStatus: "INVITED" })).toBeNull();
    expect(state({ myStatus: "DECLINED" })).toBeNull();
    expect(state({ hostId: VIEWER, myStatus: "INVITED" })).toBeNull();
  });

  it("10. an unparseable timestamp makes the row ineligible", () => {
    expect(state({ startedAt: "not a date" })).toBeNull();
    expect(state({ status: "DRAFT", startedAt: null, scheduledAt: "soon" })).toBeNull();
  });
});

describe("selectActiveTastings order (D3, D10)", () => {
  it("11. live, paused, in-progress, waiting — whatever the input order", () => {
    const rows = [
      row({ id: "waiting", status: "DRAFT", startedAt: null, scheduledAt: h(1) }),
      row({ id: "async", timingMode: "ASYNC" }),
      row({ id: "paused", pausedAt: h(-0.5) }),
      row({ id: "live" }),
    ];
    const items = selectActiveTastings(rows, VIEWER, NOW);
    expect(ids(items)).toEqual(["live", "paused", "async", "waiting"]);
    expect(items.map((i) => i.state)).toEqual(["live", "paused", "in-progress", "waiting"]);
  });

  it("12. newer anchor first among live; newer started_at ?? created_at first among in-progress", () => {
    expect(
      ids(
        selectActiveTastings(
          [row({ id: "older", startedAt: h(-5) }), row({ id: "newer", startedAt: h(-1) })],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["newer", "older"]);
    expect(
      ids(
        selectActiveTastings(
          [
            row({ id: "older", timingMode: "ASYNC", startedAt: null, createdAt: h(-100) }),
            row({ id: "newer", timingMode: "ASYNC", startedAt: h(-50), createdAt: h(-200) }),
          ],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["newer", "older"]);
  });

  it("13. drafts: nearest schedule, then the earlier one, scheduled before unscheduled, newest unscheduled first", () => {
    const draft = (id: string, o: Partial<ActiveTastingCandidate>) =>
      row({ id, status: "DRAFT", startedAt: null, ...o });
    expect(
      ids(
        selectActiveTastings(
          [draft("ahead3", { scheduledAt: h(3) }), draft("ago1", { scheduledAt: h(-1) })],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["ago1", "ahead3"]);
    expect(
      ids(
        selectActiveTastings(
          [draft("plus2", { scheduledAt: h(2) }), draft("minus2", { scheduledAt: h(-2) })],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["minus2", "plus2"]);
    expect(
      ids(
        selectActiveTastings(
          [
            draft("unscheduled", { scheduledAt: null, createdAt: h(-0.1) }),
            draft("scheduled", { scheduledAt: h(5) }),
          ],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["scheduled", "unscheduled"]);
    expect(
      ids(
        selectActiveTastings(
          [
            draft("old", { scheduledAt: null, createdAt: h(-6) }),
            draft("new", { scheduledAt: null, createdAt: h(-1) }),
          ],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["new", "old"]);
  });

  it("14. a full tie is broken by id ascending", () => {
    expect(
      ids(selectActiveTastings([row({ id: "b" }), row({ id: "a" }), row({ id: "c" })], VIEWER, NOW)),
    ).toEqual(["a", "b", "c"]);
  });

  it("15. ineligible rows are dropped; nothing in, nothing out", () => {
    expect(
      ids(
        selectActiveTastings(
          [row({ id: "closed", status: "CLOSED" }), row({ id: "ok" }), row({ id: "inv", myStatus: "INVITED" })],
          VIEWER,
          NOW,
        ),
      ),
    ).toEqual(["ok"]);
    expect(selectActiveTastings([], VIEWER, NOW)).toEqual([]);
  });

  it("carries the name, state and href onto each item", () => {
    expect(selectActiveTastings([row({ hostId: VIEWER })], VIEWER, NOW)).toEqual([
      { tastingId: "t1", name: "Friday flight", state: "live", href: "/tastings/t1/host" },
    ]);
  });
});

describe("activeHref (D5)", () => {
  const host = { hostId: VIEWER };
  it("16. the host of a running LIVE host-provides blind or semi-blind tasting goes to the console", () => {
    expect(activeHref(row(host), VIEWER)).toBe("/tastings/t1/host");
    expect(activeHref(row({ ...host, revealMode: "SEMI_BLIND" }), VIEWER)).toBe("/tastings/t1/host");
    expect(activeHref(row({ ...host, pausedAt: h(-0.5) }), VIEWER)).toBe("/tastings/t1/host");
  });

  it("17. the same host while the tasting is still a DRAFT goes to the lobby", () => {
    expect(activeHref(row({ ...host, status: "DRAFT", startedAt: null }), VIEWER)).toBe("/tastings/t1");
  });

  it("18. bring-your-own, ASYNC and Taste & Rate hosts go to the tasting page", () => {
    expect(activeHref(row({ ...host, wineSource: "PARTICIPANT_CONTRIBUTED" }), VIEWER)).toBe("/tastings/t1");
    expect(activeHref(row({ ...host, timingMode: "ASYNC" }), VIEWER)).toBe("/tastings/t1");
    expect(activeHref(row({ ...host, revealMode: "OPEN" }), VIEWER)).toBe("/tastings/t1");
  });

  it("19. a guest of a console tasting goes to the tasting page", () => {
    expect(activeHref(row(), VIEWER)).toBe("/tastings/t1");
  });
});

describe("paths and the banner view (D6, D11, D12)", () => {
  const one = [item("t1")];

  it("20. hidden on the shown tasting's own pages", () => {
    for (const p of [
      "/tastings/t1",
      "/tastings/t1/",
      "/tastings/t1/host",
      "/tastings/t1/play",
      "/tastings/t1/results/2",
    ]) {
      expect(isOnTastingPath(p, "t1")).toBe(true);
      expect(bannerView(one, p)).toBeNull();
    }
  });

  it("21. shown everywhere else, other tastings' pages included", () => {
    for (const p of [
      "/tastings/t10",
      "/tastings/t2",
      "/tastings/new",
      "/u/u1/tastings/t1",
      "/overview",
      "/knowledge/map",
    ]) {
      expect(isOnTastingPath(p, "t1")).toBe(false);
      expect(bannerView(one, p)).toEqual({ item: one[0], more: 0 });
    }
  });

  it("22. never on the sign-in, auth and invite pages (segment boundary)", () => {
    for (const p of ["/login", "/signup", "/auth/confirm-hash", "/invite/ABC", "/invite/ABC/accept"]) {
      expect(isBannerFreePath(p)).toBe(true);
      expect(bannerView(one, p)).toBeNull();
    }
    expect(isBannerFreePath("/authority")).toBe(false);
    expect(bannerView(one, "/authority")).toEqual({ item: one[0], more: 0 });
  });

  it("23. no items, no banner", () => {
    expect(bannerView([], "/overview")).toBeNull();
  });

  it("24. +N counts the rest, minus the tasting whose page you are on", () => {
    const three = [item("t1"), item("t2"), item("t3")];
    expect(bannerView(three, "/overview")).toEqual({ item: three[0], more: 2 });
    expect(bannerView(three, "/tastings/t2")).toEqual({ item: three[0], more: 1 });
    expect(bannerView(three, "/tastings/t1")).toBeNull();
  });

  it("25. polling pauses only on the first item's own pages and the banner-free paths", () => {
    const two = [item("t1"), item("t2")];
    expect(shouldPoll(two, "/tastings/t1")).toBe(false);
    expect(shouldPoll(two, "/tastings/t1/host")).toBe(false);
    expect(shouldPoll(two, "/login")).toBe(false);
    expect(shouldPoll(two, "/invite/ABC")).toBe(false);
    expect(shouldPoll([], "/overview")).toBe(true);
    expect(shouldPoll([], "/tastings/t1")).toBe(true);
    expect(shouldPoll(two, "/tastings/t2")).toBe(true);
    expect(shouldPoll(two, "/overview")).toBe(true);
  });
});

describe("pollIntervalMs (D12b)", () => {
  it("25b. stays live with a tasting to return to, backs off with none", () => {
    // pollActiveTastings costs ~788 ms of server time per call; paying that
    // every 20 s on a page left open with nothing active was 32 POSTs in one
    // measured session. Nothing about the live cadence changes.
    expect(pollIntervalMs([])).toBe(POLL_IDLE_MS);
    expect(pollIntervalMs([item("t1")])).toBe(POLL_ACTIVE_MS);
    expect(pollIntervalMs([item("t1"), item("t2"), item("t3")])).toBe(POLL_ACTIVE_MS);
    expect(POLL_ACTIVE_MS).toBe(20_000);
    expect(POLL_IDLE_MS).toBeGreaterThan(POLL_ACTIVE_MS);
  });
});

describe("newerSnapshot (D14)", () => {
  const snap = (checkedAt: string): ActiveTastingSnapshot => ({ items: [item(checkedAt)], checkedAt });

  it("26. the newer checkedAt wins; a tie goes to the server render", () => {
    const server = snap(h(0));
    expect(newerSnapshot(server, null)).toBe(server);
    const newer = snap(h(0.01));
    expect(newerSnapshot(server, newer)).toBe(newer);
    expect(newerSnapshot(server, snap(h(-0.01)))).toBe(server);
    expect(newerSnapshot(server, snap(h(0)))).toBe(server);
    const polled = snap(h(-100));
    expect(newerSnapshot(EMPTY_SNAPSHOT, polled)).toBe(polled);
  });
});

describe("candidateFromRow (§5)", () => {
  const tasting = {
    id: "t1",
    name: "Friday flight",
    host_id: "host",
    status: "IN_PROGRESS",
    timing_mode: "LIVE",
    reveal_mode: "BLIND",
    wine_source: "HOST_PROVIDES",
    started_at: h(-1),
    paused_at: null,
    scheduled_at: null,
    created_at: h(-2),
  };

  it("27. maps an object or one-element array embed; refuses a null embed or a missing key field", () => {
    expect(candidateFromRow({ status: "JOINED", tastings: tasting })).toEqual(row());
    expect(candidateFromRow({ status: "JOINED", tastings: [tasting] })).toEqual(row());
    expect(candidateFromRow({ status: "JOINED", tastings: null })).toBeNull();
    for (const key of ["id", "name", "created_at"] as const) {
      const rest: Record<string, unknown> = { ...tasting };
      delete rest[key];
      expect(candidateFromRow({ status: "JOINED", tastings: rest })).toBeNull();
    }
  });

  it("refuses rows that are not objects", () => {
    expect(candidateFromRow(null)).toBeNull();
    expect(candidateFromRow("row")).toBeNull();
  });
});

describe("overviewSlot (D8, §7)", () => {
  const two = [item("t1"), item("t2")];

  it("28. the header's tasting leaves only the registrar; anything else keeps the Overview banner", () => {
    expect(overviewSlot("t1", two)).toBe("registrar-only");
    expect(overviewSlot("t9", two)).toBe("banner");
    expect(overviewSlot("t2", two)).toBe("banner");
    expect(overviewSlot("t1", [])).toBe("banner");
    expect(overviewSlot(null, [])).toBe("start-row");
    expect(overviewSlot(null, two)).toBe("start-row");
    // A live or next banner (a tasting id) never maps to the start row, so
    // the Taste-blind tile's gold rule is untouched.
    for (const id of ["t1", "t2", "t9"]) {
      expect(overviewSlot(id, two)).not.toBe("start-row");
      expect(overviewSlot(id, [])).not.toBe("start-row");
    }
  });
});
