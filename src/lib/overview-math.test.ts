import { describe, expect, it } from "vitest";
import type { TastingRow } from "./overview-types";
import {
  bannerStage,
  isRunningStatus,
  orderTastingRows,
  pickLiveTasting,
  pickNextTasting,
} from "./overview-math";

describe("pickLiveTasting", () => {
  const base = {
    status: "IN_PROGRESS",
    myStatus: "JOINED",
    created_at: "2026-09-01T10:00:00Z",
  } as const;

  it("returns null when nothing is in progress for me", () => {
    expect(pickLiveTasting([])).toBeNull();
    expect(
      pickLiveTasting([
        { id: "a", timing_mode: "LIVE", status: "DRAFT", myStatus: "JOINED", created_at: base.created_at },
        { id: "b", timing_mode: "LIVE", status: "CLOSED", myStatus: "JOINED", created_at: base.created_at },
        { id: "c", timing_mode: "LIVE", status: "IN_PROGRESS", myStatus: "INVITED", created_at: base.created_at },
        { id: "d", timing_mode: "LIVE", status: "IN_PROGRESS", myStatus: "DECLINED", created_at: base.created_at },
      ]),
    ).toBeNull();
  });

  it("prefers a LIVE tasting over a newer ASYNC one", () => {
    const rows = [
      { ...base, id: "async", timing_mode: "ASYNC", created_at: "2026-09-10T10:00:00Z" },
      { ...base, id: "live", timing_mode: "LIVE", created_at: "2026-09-01T10:00:00Z" },
    ];
    expect(pickLiveTasting(rows)?.id).toBe("live");
  });

  it("falls back to an ASYNC tasting when no LIVE one is running", () => {
    const rows = [{ ...base, id: "async", timing_mode: "ASYNC" }];
    expect(pickLiveTasting(rows)?.id).toBe("async");
  });

  it("breaks ties on the most recently created", () => {
    const rows = [
      { ...base, id: "older", timing_mode: "LIVE", created_at: "2026-09-01T10:00:00Z" },
      { ...base, id: "newer", timing_mode: "LIVE", created_at: "2026-09-09T10:00:00Z" },
      { ...base, id: "middle", timing_mode: "LIVE", created_at: "2026-09-05T10:00:00Z" },
    ];
    expect(pickLiveTasting(rows)?.id).toBe("newer");
  });

  it("returns the original row object", () => {
    const row = { ...base, id: "x", timing_mode: "LIVE", extra: 42 };
    expect(pickLiveTasting([row])).toBe(row);
  });

  it("treats a legacy OPEN tasting as running when I have joined it", () => {
    const rows = [{ ...base, id: "legacy", timing_mode: "LIVE", status: "OPEN" }];
    expect(pickLiveTasting(rows)?.id).toBe("legacy");
  });

  it("ignores a legacy OPEN tasting I have only been invited to", () => {
    const rows = [
      { ...base, id: "legacy", timing_mode: "LIVE", status: "OPEN", myStatus: "INVITED" },
    ];
    expect(pickLiveTasting(rows)).toBeNull();
  });
});

describe("isRunningStatus", () => {
  it("is true for IN_PROGRESS and the legacy OPEN status", () => {
    expect(isRunningStatus("IN_PROGRESS")).toBe(true);
    expect(isRunningStatus("OPEN")).toBe(true);
  });

  it("is false for DRAFT and CLOSED", () => {
    expect(isRunningStatus("DRAFT")).toBe(false);
    expect(isRunningStatus("CLOSED")).toBe(false);
  });
});

describe("pickNextTasting", () => {
  const now = new Date("2026-09-11T12:00:00Z");
  const me = "me";
  const base = {
    status: "DRAFT",
    myStatus: "JOINED",
    hostId: "someone-else",
    myId: me,
    scheduled_at: null as string | null,
    created_at: "2026-09-01T10:00:00Z",
  };

  it("returns null when there is no draft I host or have joined", () => {
    expect(pickNextTasting([], now)).toBeNull();
    expect(
      pickNextTasting(
        [
          { ...base, id: "a", status: "IN_PROGRESS" },
          { ...base, id: "b", status: "CLOSED" },
          { ...base, id: "c", myStatus: "INVITED" },
          { ...base, id: "d", myStatus: "DECLINED" },
        ],
        now,
      ),
    ).toBeNull();
  });

  it("counts a draft I host even when my participant status is not JOINED", () => {
    const rows = [{ ...base, id: "hosted", hostId: me, myStatus: "INVITED" }];
    expect(pickNextTasting(rows, now)?.id).toBe("hosted");
  });

  it("picks the soonest future schedule ahead of unscheduled and later drafts", () => {
    const rows = [
      { ...base, id: "unscheduled", created_at: "2026-09-10T10:00:00Z" },
      { ...base, id: "later", scheduled_at: "2026-09-20T18:00:00Z" },
      { ...base, id: "soon", scheduled_at: "2026-09-12T18:00:00Z" },
      { ...base, id: "past", scheduled_at: "2026-09-01T18:00:00Z", created_at: "2026-09-11T10:00:00Z" },
    ];
    expect(pickNextTasting(rows, now)?.id).toBe("soon");
  });

  it("treats a schedule at exactly now as upcoming", () => {
    const rows = [
      { ...base, id: "exact", scheduled_at: "2026-09-11T12:00:00Z" },
      { ...base, id: "unscheduled" },
    ];
    expect(pickNextTasting(rows, now)?.id).toBe("exact");
  });

  it("falls back to the newest unscheduled draft when nothing is upcoming", () => {
    const rows = [
      { ...base, id: "past", scheduled_at: "2026-09-01T18:00:00Z", created_at: "2026-09-11T10:00:00Z" },
      { ...base, id: "old-unscheduled", created_at: "2026-08-01T10:00:00Z" },
      { ...base, id: "new-unscheduled", created_at: "2026-09-05T10:00:00Z" },
    ];
    expect(pickNextTasting(rows, now)?.id).toBe("new-unscheduled");
  });

  it("falls back to the most recently created draft when every schedule is in the past", () => {
    const rows = [
      { ...base, id: "older", scheduled_at: "2026-09-02T18:00:00Z", created_at: "2026-08-20T10:00:00Z" },
      { ...base, id: "newer", scheduled_at: "2026-09-01T18:00:00Z", created_at: "2026-09-03T10:00:00Z" },
    ];
    expect(pickNextTasting(rows, now)?.id).toBe("newer");
  });

  it("returns the original row object", () => {
    const row = { ...base, id: "x", extra: "kept" };
    expect(pickNextTasting([row], now)).toBe(row);
  });
});

describe("bannerStage", () => {
  it("reads all revealed once every wine is revealed", () => {
    expect(bannerStage(["country", "region"], true, "BLIND")).toBe("all revealed");
    expect(bannerStage([], true, "SEMI_BLIND")).toBe("all revealed");
  });

  it("is empty for an OPEN (Taste & Rate) tasting", () => {
    expect(bannerStage([], false, "OPEN")).toBe("");
    expect(bannerStage(["country"], false, "OPEN")).toBe("");
    expect(bannerStage([], true, "OPEN")).toBe("");
  });

  it("reads guessing open before the first reveal step", () => {
    expect(bannerStage([], false, "BLIND")).toBe("guessing open");
    expect(bannerStage([], false, "SEMI_BLIND")).toBe("guessing open");
  });

  it("names the LAST revealed category", () => {
    expect(bannerStage(["country"], false, "BLIND")).toBe("country revealed");
    expect(bannerStage(["country", "region"], false, "BLIND")).toBe("region revealed");
    expect(bannerStage(["country", "region", "appellation"], false, "BLIND")).toBe(
      "appellation revealed",
    );
    expect(bannerStage(["country", "region", "appellation", "grapes"], false, "BLIND")).toBe(
      "grapes revealed",
    );
    expect(bannerStage(["grapes", "producer"], false, "BLIND")).toBe("producer revealed");
    expect(bannerStage(["producer", "type_designation"], false, "BLIND")).toBe(
      "designation revealed",
    );
    expect(bannerStage(["type_designation", "vintage"], false, "BLIND")).toBe(
      "vintage revealed",
    );
  });

  it("falls back to the raw key for an unknown category", () => {
    expect(bannerStage(["mystery"], false, "BLIND")).toBe("mystery revealed");
  });
});

describe("orderTastingRows", () => {
  const invite = (id: string): TastingRow => ({
    kind: "invite",
    tastingId: id,
    name: id,
    hostName: "Maja",
    scheduledAt: null,
  });
  const hosting = (id: string): TastingRow => ({
    kind: "hosting",
    tastingId: id,
    name: id,
    scheduledAt: null,
    detail: "3 wines set",
  });
  const selfPaced = (id: string): TastingRow => ({
    kind: "self-paced",
    tastingId: id,
    name: id,
    detail: "Self-paced · 1 of 4 wines guessed",
  });
  const finished = (id: string): TastingRow => ({
    kind: "finished",
    tastingId: id,
    name: id,
    finishedAt: "2026-09-04T20:00:00Z",
    placement: { rank: 2, points: 21 },
  });

  it("concatenates invites, hosting, self-paced, finished in that order", () => {
    const rows = orderTastingRows(
      [invite("i1")],
      [hosting("h1")],
      [selfPaced("s1")],
      [finished("f1")],
    );
    expect(rows.map((r) => r.tastingId)).toEqual(["i1", "h1", "s1", "f1"]);
  });

  it("caps at five by default, dropping from the tail", () => {
    const rows = orderTastingRows(
      [invite("i1"), invite("i2")],
      [hosting("h1")],
      [selfPaced("s1")],
      [finished("f1"), finished("f2"), finished("f3")],
    );
    expect(rows.map((r) => r.tastingId)).toEqual(["i1", "i2", "h1", "s1", "f1"]);
  });

  it("honours a custom cap", () => {
    const rows = orderTastingRows(
      [invite("i1"), invite("i2"), invite("i3")],
      [hosting("h1")],
      [],
      [finished("f1")],
      2,
    );
    expect(rows.map((r) => r.tastingId)).toEqual(["i1", "i2"]);
  });

  it("returns an empty list when every group is empty", () => {
    expect(orderTastingRows([], [], [], [])).toEqual([]);
  });
});
