import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ParticipantStatus } from "../../lib/tasting-eyebrow";
import { makeT, uiStrings } from "../../lib/wset/i18n";
import {
  PAGE_SIZE,
  archiveCounts,
  archiveStats,
  countTasters,
  emptyLineKey,
  filterHref,
  firstPagePlacementIds,
  glassesPhrase,
  hasLivePoll,
  hostNameOf,
  invitationWhen,
  invitationsOf,
  isCompetitor,
  listRows,
  matchesFilter,
  missingPlacementIds,
  parseFilter,
  placementCopy,
  placementFrom,
  rowCopy,
  shortDate,
  showMoreCount,
  statsLine,
  wantsPlacement,
  type ArchiveTasting,
} from "./taste-archive-math";

const t = makeT("en");
const tDa = makeT("da");

function tasting(over: Partial<ArchiveTasting> = {}): ArchiveTasting {
  return {
    id: "t1",
    name: "Loire whites, six ways",
    hostId: "host",
    hostName: "Sofie",
    hostAvatarUrl: null,
    hosting: false,
    myStatus: "JOINED",
    myParticipantId: "p1",
    status: "CLOSED",
    timingMode: "LIVE",
    revealMode: "BLIND",
    wineSource: "HOST_PROVIDES",
    scheduledAt: null,
    createdAt: "2026-09-01T10:00:00Z",
    imageUrl: null,
    glassCount: 6,
    currentGlass: 6,
    tasterCount: 7,
    guessableCount: 6,
    guessedCount: 6,
    activityAt: "2026-09-04T21:00:00Z",
    ...over,
  };
}

// Every key the All tastings page reads from makeT's dictionaries.
const ARCHIVE_KEYS = [
  "all_tastings", "start_a_tasting", "start", "taste_blind", "taste_and_rate", "training_room",
  "soon", "loading_tastings", "tastings_one", "tastings_many", "finished_count",
  "glasses_guessed_one", "glasses_guessed_many", "waiting_on_you_one", "waiting_on_you_many",
  "waiting_on_you_short", "invitations_close", "accept", "decline", "date_to_be_set",
  "filter_all", "filter_hosting", "filter_attending", "filter_finished", "newest_first",
  "show_n_more", "empty_all", "empty_all_invited", "empty_hosting", "empty_attending",
  "empty_finished", "no_tastings_yet", "no_tastings_hint", "you_are_hosting", "host_is_hosting",
  "hosting", "hosted_by", "glass_n_of_m_so_far", "glass_n_of_m", "k_of_n_guessed", "n_tasting",
  "no_glasses_yet_mid", "back_to_the_table", "back", "continue_guessing", "continue",
  "open_the_tasting", "open", "you_hosted", "host_hosted", "you", "tasters_one", "tasters_many",
  "you_hosted_cap", "n_pts", "k_of_n_matched", "k_of_n", "someone",
];

// The page's own files: every literal t("…") in them must be a real key,
// because makeT prints a missing key verbatim instead of failing.
const PAGE_FILES = [
  "./page.tsx",
  "./loading.tsx",
  "./tastings-tabs.tsx",
  "./start-tasting-menu.tsx",
  "./invitations-band.tsx",
  "./tasting-row.tsx",
  "./taste-archive-math.ts",
];

const placeholders = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort();

describe("copy — through makeT", () => {
  const en = uiStrings("en");
  const da = uiStrings("da");

  it("every key the page uses has a non-empty English and Danish entry with the same placeholders", () => {
    for (const key of ARCHIVE_KEYS) {
      expect(en[key]?.trim(), key).toBeTruthy();
      expect(da[key]?.trim(), key).toBeTruthy();
      expect(placeholders(da[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("the English and Danish dictionaries have identical key sets and no empty strings", () => {
    expect(Object.keys(da).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of [...Object.entries(en), ...Object.entries(da)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("every literal t(\"…\") in the page's files is a key in both dictionaries", () => {
    let checked = 0;
    for (const file of PAGE_FILES) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      const keys = [...source.matchAll(/\bt\(\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
      checked += keys.length;
      for (const key of keys) {
        expect(en[key], `${file}: ${key}`).toBeTruthy();
        expect(da[key], `${file}: ${key}`).toBeTruthy();
      }
    }
    // A file may only hand `t` on (tasting-row.tsx does), but the scan as a
    // whole must find the page's calls, or the pattern itself has broken.
    expect(checked).toBeGreaterThan(20);
  });

  it("fills placeholders, falls back to the key, and reads naturally in Danish", () => {
    expect(t("show_n_more", { n: 8 })).toBe("Show 8 more");
    expect(tDa("show_n_more", { n: 8 })).toBe("Vis 8 flere");
    expect(t("no_such_key")).toBe("no_such_key");
    expect(tDa("n_tasting", { n: 7 })).toBe("7 smager med");
    expect(tDa("filter_attending")).toBe("Deltager i");
  });

  it("the no-tastings hint names no button label (phones call the button 'Start')", () => {
    expect(t("no_tastings_hint")).not.toContain(t("start_a_tasting"));
    expect(tDa("no_tastings_hint")).not.toContain(tDa("start_a_tasting"));
  });
});

describe("hostNameOf — a host without a readable profile", () => {
  it("prints the host's name, or the dictionary's 'Someone' / 'Nogen' when there is none", () => {
    expect(hostNameOf(t, tasting())).toBe("Sofie");
    expect(hostNameOf(t, tasting({ hostName: null }))).toBe("Someone");
    expect(hostNameOf(tDa, tasting({ hostName: null }))).toBe("Nogen");
  });

  it("every row form falls back to it, desktop and phone", () => {
    const running = rowCopy(t, tasting({ hostName: null, status: "IN_PROGRESS" }));
    expect(running.meta[0]).toBe("Someone is hosting");
    expect(running.phoneMeta[0]).toBe("Someone");
    const finished = rowCopy(t, tasting({ hostName: null }));
    expect(finished.meta).toContain("Someone hosted");
    expect(finished.phoneMeta).toContain("Someone");
    const draft = rowCopy(t, tasting({ hostName: null, status: "DRAFT" }));
    expect(draft.meta[0]).toBe("Hosted by Someone");
    expect(draft.phoneMeta[0]).toBe("Someone");
  });
});

describe("glassesPhrase — the flight so far, mid-line", () => {
  it("is lower-case when nothing is poured, since it never opens a meta line", () => {
    expect(glassesPhrase(t, 0)).toBe("no glasses yet");
    expect(glassesPhrase(tDa, 0)).toBe("ingen glas endnu");
    expect(glassesPhrase(t, 1)).toBe("1 glass so far");
    expect(glassesPhrase(t, 6)).toBe("6 glasses so far");
  });
});

describe("parseFilter / filterHref", () => {
  it("maps ?tab= values, with history as an alias of Finished", () => {
    expect(parseFilter(null)).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(parseFilter("")).toBe("all");
    expect(parseFilter("hosting")).toBe("hosting");
    expect(parseFilter("attending")).toBe("attending");
    expect(parseFilter("finished")).toBe("finished");
    expect(parseFilter("history")).toBe("finished");
    expect(parseFilter("invited")).toBe("all");
    expect(parseFilter("nonsense")).toBe("all");
  });

  it("keeps All as the bare /taste URL and the rest under ?tab=", () => {
    expect(filterHref("all")).toBe("/taste");
    expect(filterHref("hosting")).toBe("/taste?tab=hosting");
    expect(filterHref("attending")).toBe("/taste?tab=attending");
    expect(filterHref("finished")).toBe("/taste?tab=finished");
  });

  it("round-trips: the pills that link /taste?tab=history land on the Finished chip", () => {
    const tab = new URL("https://x.test/taste?tab=history").searchParams.get("tab");
    expect(parseFilter(tab)).toBe("finished");
    for (const filter of ["all", "hosting", "attending", "finished"] as const) {
      const back = new URL(`https://x.test${filterHref(filter)}`).searchParams.get("tab");
      expect(parseFilter(back)).toBe(filter);
    }
  });
});

describe("matchesFilter / archiveCounts", () => {
  const hostedFinished = tasting({ id: "a", hosting: true, hostId: "me", status: "CLOSED" });
  const hostedDraft = tasting({ id: "b", hosting: true, hostId: "me", status: "DRAFT" });
  const attendedFinished = tasting({ id: "c", status: "CLOSED" });
  const attendedLive = tasting({ id: "d", status: "IN_PROGRESS" });
  const invite = tasting({ id: "e", status: "DRAFT", myStatus: "INVITED" });
  const all = [hostedFinished, hostedDraft, attendedFinished, attendedLive, invite];

  it("All is every membership, Hosting = host is me (any status), Attending = joined and not host, Finished = closed either role", () => {
    expect(all.filter((x) => matchesFilter(x, "all")).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(all.filter((x) => matchesFilter(x, "hosting")).map((x) => x.id)).toEqual(["a", "b"]);
    expect(all.filter((x) => matchesFilter(x, "attending")).map((x) => x.id)).toEqual(["c", "d"]);
    expect(all.filter((x) => matchesFilter(x, "finished")).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("counts overlap (a finished hosted tasting is both Hosting and Finished) and invitations count in All", () => {
    expect(archiveCounts(all)).toEqual({ all: 5, hosting: 2, attending: 2, finished: 2 });
  });
});

describe("emptyLineKey — the line under an empty chip", () => {
  it("points at the band when All is empty only because the invitations sit above it", () => {
    expect(emptyLineKey("all", 2)).toBe("empty_all_invited");
    expect(t(emptyLineKey("all", 1))).toBe("Nothing else yet — your invitations are above.");
    expect(emptyLineKey("all", 0)).toBe("empty_all");
  });

  it("keeps each other chip's own line, since an invitation is never hosting, attending or finished", () => {
    expect(emptyLineKey("hosting", 2)).toBe("empty_hosting");
    expect(emptyLineKey("attending", 1)).toBe("empty_attending");
    expect(emptyLineKey("finished", 3)).toBe("empty_finished");
  });
});

describe("archiveStats", () => {
  it("is every membership, the finished ones, and my scored guesses", () => {
    const rows = [
      tasting({ id: "a", status: "CLOSED" }),
      tasting({ id: "b", status: "DRAFT", hosting: true, hostId: "me" }),
      tasting({ id: "c", status: "IN_PROGRESS" }),
      tasting({ id: "d", status: "DRAFT", myStatus: "INVITED" }),
      tasting({ id: "e", status: "CLOSED", hosting: true, hostId: "me" }),
    ];
    expect(archiveStats(rows, 248)).toEqual({ tastings: 5, finished: 2, glasses: 248 });
    expect(archiveStats([], 0)).toEqual({ tastings: 0, finished: 0, glasses: 0 });
  });
});

describe("countTasters / isCompetitor", () => {
  const people = [
    { userId: "host", status: "JOINED" as const },
    { userId: "a", status: "JOINED" as const },
    { userId: "b", status: "JOINED" as const },
    { userId: "c", status: "INVITED" as const },
    { userId: "d", status: "DECLINED" as const },
  ];

  it("counts JOINED people, leaving out a host who provided the wines (they set the answers)", () => {
    expect(countTasters(people, "host", "HOST_PROVIDES")).toBe(2);
  });

  it("keeps a bring-your-own host, who guesses the other bottles", () => {
    expect(countTasters(people, "host", "PARTICIPANT_CONTRIBUTED")).toBe(3);
  });

  it("is zero for nobody", () => {
    expect(countTasters([], "host", "HOST_PROVIDES")).toBe(0);
  });

  it("counts exactly the people isCompetitor admits, so the taster count matches the placing's field", () => {
    for (const source of ["HOST_PROVIDES", "PARTICIPANT_CONTRIBUTED"] as const) {
      expect(countTasters(people, "host", source)).toBe(
        people.filter((p) => isCompetitor(p, "host", source)).length,
      );
    }
    expect(isCompetitor({ userId: "x", status: undefined }, "host", "HOST_PROVIDES")).toBe(false);
  });
});

describe("placementFrom — my placing from the leaderboard", () => {
  const board = [
    { participantId: "p-host", userId: "host", total: 30, totalWines: 6 },
    { participantId: "p-me", userId: "me", total: 21, totalWines: 6 },
    { participantId: "p-a", userId: "a", total: 25, totalWines: 6 },
    { participantId: "p-b", userId: "b", total: 21, totalWines: 6 },
    { participantId: "p-gone", userId: "gone", total: 40, totalWines: 6 },
  ];
  const statuses = new Map<string, ParticipantStatus>([
    ["p-host", "JOINED"],
    ["p-me", "JOINED"],
    ["p-a", "JOINED"],
    ["p-b", "JOINED"],
    ["p-gone", "DECLINED"],
  ]);

  it("ranks me densely among JOINED competitors, leaving out a host who provided the wines", () => {
    expect(
      placementFrom(board, statuses, { hostId: "host", wineSource: "HOST_PROVIDES", revealMode: "BLIND" }, "me"),
    ).toEqual({ rank: 2, competitors: 3, points: 21 });
  });

  it("a bring-your-own host competes", () => {
    expect(
      placementFrom(board, statuses, { hostId: "host", wineSource: "PARTICIPANT_CONTRIBUTED", revealMode: "BLIND" }, "me"),
    ).toEqual({ rank: 3, competitors: 4, points: 21 });
  });

  it("a semi-blind placing carries the glasses I could match", () => {
    const semi = [
      { participantId: "p-me", userId: "me", total: 4, totalWines: 4 },
      { participantId: "p-a", userId: "a", total: 3, totalWines: 5 },
    ];
    expect(
      placementFrom(semi, statuses, { hostId: "host", wineSource: "PARTICIPANT_CONTRIBUTED", revealMode: "SEMI_BLIND" }, "me"),
    ).toEqual({ rank: 1, competitors: 2, points: 4, matchedOf: 4 });
  });

  it("is null when I did not compete, or the tasting has no leaderboard", () => {
    expect(
      placementFrom(board, statuses, { hostId: "me", wineSource: "HOST_PROVIDES", revealMode: "BLIND" }, "me"),
    ).toBeNull();
    expect(
      placementFrom(board, statuses, { hostId: "host", wineSource: "HOST_PROVIDES", revealMode: "OPEN" }, "me"),
    ).toBeNull();
    expect(
      placementFrom(board, statuses, { hostId: "host", wineSource: "HOST_PROVIDES", revealMode: "BLIND" }, "stranger"),
    ).toBeNull();
  });
});

describe("invitationsOf", () => {
  it("is the INVITED memberships, soonest schedule first, unscheduled after by newest created", () => {
    const rows = [
      tasting({ id: "joined", myStatus: "JOINED", status: "DRAFT" }),
      tasting({ id: "unscheduled-old", myStatus: "INVITED", status: "DRAFT", createdAt: "2026-09-01T00:00:00Z" }),
      tasting({ id: "later", myStatus: "INVITED", status: "DRAFT", scheduledAt: "2026-09-24T18:00:00Z" }),
      tasting({ id: "unscheduled-new", myStatus: "INVITED", status: "DRAFT", createdAt: "2026-09-09T00:00:00Z" }),
      tasting({ id: "soon", myStatus: "INVITED", status: "DRAFT", scheduledAt: "2026-09-18T18:00:00Z" }),
    ];
    expect(invitationsOf(rows).map((r) => r.id)).toEqual([
      "soon",
      "later",
      "unscheduled-new",
      "unscheduled-old",
    ]);
  });
});

describe("listRows", () => {
  it("leaves invitations to the band, pins running joined tastings first (LIVE before ASYNC, newest first) and orders the rest newest first", () => {
    const rows = [
      tasting({ id: "old-finished", activityAt: "2026-07-01T00:00:00Z" }),
      tasting({ id: "invite", myStatus: "INVITED", status: "DRAFT" }),
      tasting({ id: "async-running", status: "IN_PROGRESS", timingMode: "ASYNC", createdAt: "2026-09-10T00:00:00Z", activityAt: "2026-09-10T00:00:00Z" }),
      tasting({ id: "new-finished", activityAt: "2026-09-04T00:00:00Z" }),
      tasting({ id: "live-old", status: "IN_PROGRESS", timingMode: "LIVE", createdAt: "2026-09-01T00:00:00Z", activityAt: "2026-09-01T00:00:00Z" }),
      tasting({ id: "live-new", status: "IN_PROGRESS", timingMode: "LIVE", createdAt: "2026-09-08T00:00:00Z", activityAt: "2026-09-08T00:00:00Z" }),
      tasting({ id: "draft", status: "DRAFT", scheduledAt: "2026-09-20T18:00:00Z", activityAt: "2026-09-20T18:00:00Z" }),
    ];
    expect(listRows(rows, "all").map((r) => r.id)).toEqual([
      "live-new",
      "live-old",
      "async-running",
      "draft",
      "new-finished",
      "old-finished",
    ]);
  });

  it("applies the filter before ordering, so Finished never pins a running row", () => {
    const rows = [
      tasting({ id: "live", status: "IN_PROGRESS" }),
      tasting({ id: "finished", status: "CLOSED" }),
    ];
    expect(listRows(rows, "finished").map((r) => r.id)).toEqual(["finished"]);
  });

  it("treats a legacy OPEN tasting as running", () => {
    const rows = [
      tasting({ id: "finished", activityAt: "2026-09-09T00:00:00Z" }),
      tasting({ id: "legacy", status: "OPEN", activityAt: "2026-01-01T00:00:00Z" }),
    ];
    expect(listRows(rows, "all").map((r) => r.id)).toEqual(["legacy", "finished"]);
  });
});

describe("hasLivePoll — when the page refreshes itself", () => {
  it("only while a live tasting I have joined is in progress (the one row that moves without me)", () => {
    expect(hasLivePoll([tasting({ status: "IN_PROGRESS", timingMode: "LIVE" })])).toBe(true);
    expect(
      hasLivePoll([
        tasting({ status: "CLOSED" }),
        tasting({ status: "IN_PROGRESS", timingMode: "LIVE", hosting: true, hostId: "me" }),
      ]),
    ).toBe(true);
  });

  it("never for a self-paced run, an invitation, a draft, a finished or a legacy OPEN tasting", () => {
    expect(hasLivePoll([tasting({ status: "IN_PROGRESS", timingMode: "ASYNC" })])).toBe(false);
    expect(hasLivePoll([tasting({ status: "IN_PROGRESS", timingMode: "LIVE", myStatus: "INVITED" })])).toBe(false);
    expect(hasLivePoll([tasting({ status: "DRAFT" }), tasting({ status: "CLOSED" })])).toBe(false);
    expect(hasLivePoll([tasting({ status: "OPEN", timingMode: "LIVE" })])).toBe(false);
    expect(hasLivePoll([])).toBe(false);
  });
});

describe("statsLine", () => {
  it("reads '{n} tastings · {f} finished · {g} glasses guessed'", () => {
    expect(statsLine(t, { tastings: 14, finished: 12, glasses: 248 })).toBe(
      "14 tastings · 12 finished · 248 glasses guessed",
    );
  });

  it("uses singulars", () => {
    expect(statsLine(t, { tastings: 1, finished: 0, glasses: 1 })).toBe(
      "1 tasting · 0 finished · 1 glass guessed",
    );
  });
});

describe("showMoreCount", () => {
  it("is the next page or whatever is left, zero when everything shows", () => {
    expect(PAGE_SIZE).toBe(8);
    expect(showMoreCount(20, 8)).toBe(8);
    expect(showMoreCount(12, 8)).toBe(4);
    expect(showMoreCount(8, 8)).toBe(0);
    expect(showMoreCount(3, 8)).toBe(0);
  });
});

describe("missingPlacementIds", () => {
  const finished = (id: string) => tasting({ id, status: "CLOSED" });

  it("is the visible rows that want a placing and have neither one nor a request in flight, in list order", () => {
    const rows = [
      tasting({ id: "live", status: "IN_PROGRESS" }),
      finished("a"),
      tasting({ id: "hosted", status: "CLOSED", hosting: true, hostId: "me" }),
      finished("b"),
      finished("c"),
      finished("d"),
    ];
    const known = { a: { rank: 1, competitors: 3, points: 9 }, c: null };
    expect(missingPlacementIds(rows, known, new Set(["d"]))).toEqual(["b"]);
  });

  it("asks for at most one page at a time", () => {
    const rows = Array.from({ length: PAGE_SIZE + 3 }, (_, i) => finished(`f${i}`));
    const ids = missingPlacementIds(rows, {}, new Set());
    expect(ids).toHaveLength(PAGE_SIZE);
    expect(ids[0]).toBe("f0");
  });

  it("is empty when everything is known", () => {
    expect(missingPlacementIds([finished("a")], { a: null }, new Set())).toEqual([]);
  });
});

describe("firstPagePlacementIds — the placings the server loads", () => {
  const rows = [
    tasting({ id: "live", status: "IN_PROGRESS" }),
    ...[0, 1, 2, 3, 4].map((i) =>
      tasting({ id: `draft${i}`, status: "DRAFT", activityAt: `2026-09-2${i}T00:00:00Z` }),
    ),
    ...[1, 2, 3, 4, 5].map((i) => tasting({ id: `fin${i}`, activityAt: `2026-08-0${i}T00:00:00Z` })),
  ];

  it("covers only the finished rows on the first visible page, not the first eight anywhere", () => {
    expect(firstPagePlacementIds(rows, "all")).toEqual(["fin5", "fin4"]);
  });

  it("follows the chip the URL names", () => {
    expect(firstPagePlacementIds(rows, "finished")).toEqual(["fin5", "fin4", "fin3", "fin2", "fin1"]);
    expect(firstPagePlacementIds(rows, "hosting")).toEqual([]);
  });
});

describe("shortDate", () => {
  it("renders the UTC day and short month, like the Overview's finished rows", () => {
    expect(shortDate("2026-09-04T21:00:00Z")).toBe("4 Sep");
    expect(shortDate("2026-12-31T23:30:00Z")).toBe("31 Dec");
  });
});

describe("rowCopy — running", () => {
  it("host of a live blind host-provides tasting: Live chip, hosting meta, Back to the table → the console", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", timingMode: "LIVE",
      glassCount: 6, currentGlass: 3, tasterCount: 7,
    }));
    expect(copy.kind).toBe("running");
    expect(copy.chip).toBe("Live");
    expect(copy.phoneChip).toBe("Live");
    expect(copy.meta).toEqual(["You are hosting", "blind", "glass 3 of 6 so far", "7 tasting"]);
    expect(copy.phoneMeta).toEqual(["Hosting", "glass 3 of 6"]);
    expect(copy.action).toEqual({ label: "Back to the table", phoneLabel: "Back" });
    expect(copy.href).toBe("/tastings/t1/host");
  });

  it("a bring-your-own host lands on the lobby, not the console", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", wineSource: "PARTICIPANT_CONTRIBUTED",
    }));
    expect(copy.href).toBe("/tastings/t1");
  });

  it("a live semi-blind host-provides host lands on the console too (B6)", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", revealMode: "SEMI_BLIND",
    }));
    expect(copy.href).toBe("/tastings/t1/host");
  });

  it("a guest reads '{host} is hosting' and goes to the lobby", () => {
    const copy = rowCopy(t, tasting({
      status: "IN_PROGRESS", revealMode: "SEMI_BLIND", glassCount: 5, currentGlass: 2, tasterCount: 5,
    }));
    expect(copy.chip).toBe("Live");
    expect(copy.meta).toEqual(["Sofie is hosting", "semi-blind", "glass 2 of 5 so far", "5 tasting"]);
    expect(copy.phoneMeta).toEqual(["Sofie", "glass 2 of 5"]);
    expect(copy.href).toBe("/tastings/t1");
  });

  it("a live tasting with no glass poured yet says so, lower-case mid-line, instead of 'glass 0 of 0'", () => {
    const copy = rowCopy(t, tasting({ status: "IN_PROGRESS", glassCount: 0, currentGlass: 0 }));
    expect(copy.meta).toEqual(["Sofie is hosting", "blind", "no glasses yet", "7 tasting"]);
    expect(copy.phoneMeta).toEqual(["Sofie", "no glasses yet"]);
  });

  it("a self-paced tasting: 'In progress · self-paced' status (phone 'In progress'), k of n guessed, Continue guessing", () => {
    const copy = rowCopy(t, tasting({
      status: "IN_PROGRESS", timingMode: "ASYNC", guessableCount: 6, guessedCount: 2, tasterCount: 4,
    }));
    expect(copy.chip).toBe("In progress · self-paced");
    expect(copy.phoneChip).toBe("In progress");
    expect(copy.meta).toEqual(["Sofie is hosting", "blind", "2 of 6 guessed", "4 tasting"]);
    expect(copy.phoneMeta).toEqual(["Sofie", "2 of 6 guessed"]);
    expect(copy.action).toEqual({ label: "Continue guessing", phoneLabel: "Continue" });
    expect(copy.href).toBe("/tastings/t1");
  });

  it("a self-paced host who provides the wines does not guess: the flight so far, and Open the tasting", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", timingMode: "ASYNC", glassCount: 6,
    }));
    expect(copy.meta).toEqual(["You are hosting", "blind", "6 glasses so far", "7 tasting"]);
    expect(copy.action).toEqual({ label: "Open the tasting", phoneLabel: "Open" });
    expect(copy.href).toBe("/tastings/t1");
    const empty = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", timingMode: "ASYNC", glassCount: 0,
    }));
    expect(empty.meta).toEqual(["You are hosting", "blind", "no glasses yet", "7 tasting"]);
  });

  it("a self-paced bring-your-own host still guesses the other bottles", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "IN_PROGRESS", timingMode: "ASYNC",
      wineSource: "PARTICIPANT_CONTRIBUTED", guessableCount: 4, guessedCount: 1,
    }));
    expect(copy.meta).toContain("1 of 4 guessed");
    expect(copy.action).toEqual({ label: "Continue guessing", phoneLabel: "Continue" });
  });
});

describe("rowCopy — finished", () => {
  it("reads '{d Mon} · {mode} · {host} hosted · {k} tasters' and '{d Mon} · {host} · {mode}' on phones", () => {
    const copy = rowCopy(t, tasting({ activityAt: "2026-09-04T21:00:00Z" }));
    expect(copy.kind).toBe("finished");
    expect(copy.chip).toBeUndefined();
    expect(copy.phoneChip).toBeUndefined();
    expect(copy.meta).toEqual(["4 Sep", "blind", "Sofie hosted", "7 tasters"]);
    expect(copy.phoneMeta).toEqual(["4 Sep", "Sofie", "blind"]);
    expect(copy.action).toBeUndefined();
    expect(copy.href).toBe("/tastings/t1");
  });

  it("a bring-your-own host who competed reads 'you hosted' / 'you', with the singular taster", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", wineSource: "PARTICIPANT_CONTRIBUTED",
      activityAt: "2026-08-21T20:00:00Z", tasterCount: 1,
    }));
    expect(copy.meta).toEqual(["21 Aug", "blind", "you hosted", "1 taster"]);
    expect(copy.phoneMeta).toEqual(["21 Aug", "you", "blind"]);
  });

  it("a host who provided the wines is not told twice: the value says 'You hosted', so the meta drops it", () => {
    const row = tasting({ hosting: true, hostId: "me", activityAt: "2026-08-21T20:00:00Z", tasterCount: 6 });
    const copy = rowCopy(t, row);
    expect(copy.meta).toEqual(["21 Aug", "blind", "6 tasters"]);
    expect(copy.phoneMeta).toEqual(["21 Aug", "you", "blind"]);
    const value = placementCopy(t, row, null)?.rank ?? "";
    expect(value).toBe("You hosted");
    expect([...copy.meta, value].join(" ").toLowerCase().split("hosted")).toHaveLength(2);
  });
});

describe("rowCopy — draft", () => {
  it("hosted draft: 'Hosting · {date} · {n} glasses so far'", () => {
    const copy = rowCopy(t, tasting({
      hosting: true, hostId: "me", status: "DRAFT", scheduledAt: "2026-09-18T18:00:00Z", glassCount: 4,
    }));
    expect(copy.kind).toBe("draft");
    expect(copy.chip).toBeUndefined();
    expect(copy.meta).toEqual(["Hosting", { date: "2026-09-18T18:00:00Z" }, "4 glasses so far"]);
    expect(copy.phoneMeta).toEqual(["Hosting", { date: "2026-09-18T18:00:00Z" }]);
    expect(copy.href).toBe("/tastings/t1");
  });

  it("joined draft: 'Hosted by {host} · no glasses yet' when none are in and it is unscheduled", () => {
    const copy = rowCopy(t, tasting({ status: "DRAFT", glassCount: 0 }));
    expect(copy.meta).toEqual(["Hosted by Sofie", "no glasses yet"]);
    expect(copy.phoneMeta).toEqual(["Sofie"]);
  });
});

describe("wantsPlacement", () => {
  it("only finished tastings with a leaderboard where I competed need a placing fetched", () => {
    expect(wantsPlacement(tasting())).toBe(true);
    expect(wantsPlacement(tasting({ hosting: true, hostId: "me", wineSource: "PARTICIPANT_CONTRIBUTED" }))).toBe(true);
    expect(wantsPlacement(tasting({ hosting: true, hostId: "me" }))).toBe(false);
    expect(wantsPlacement(tasting({ status: "IN_PROGRESS" }))).toBe(false);
    expect(wantsPlacement(tasting({ status: "DRAFT" }))).toBe(false);
    expect(wantsPlacement(tasting({ revealMode: "OPEN" }))).toBe(false);
  });
});

describe("invitationWhen", () => {
  it("uses invitationDayPhrase for the week either side of today, with the time only for yesterday, today and tomorrow", () => {
    expect(invitationWhen(0)).toEqual({ form: "relative", withTime: true });
    expect(invitationWhen(1)).toEqual({ form: "relative", withTime: true });
    expect(invitationWhen(-1)).toEqual({ form: "relative", withTime: true });
    expect(invitationWhen(2)).toEqual({ form: "relative", withTime: false });
    expect(invitationWhen(6)).toEqual({ form: "relative", withTime: false });
    expect(invitationWhen(-6)).toEqual({ form: "relative", withTime: false });
  });

  it("falls back to LocalDateTime further out, and for an unreadable date", () => {
    expect(invitationWhen(7)).toEqual({ form: "full", withTime: false });
    expect(invitationWhen(-7)).toEqual({ form: "full", withTime: false });
    expect(invitationWhen(Number.NaN)).toEqual({ form: "full", withTime: false });
  });
});

describe("placementCopy", () => {
  it("blind: '{ordinal}' over '{points} pts', in bordeaux below first place", () => {
    expect(placementCopy(t, tasting(), { rank: 2, competitors: 7, points: 21 })).toEqual({
      rank: "2nd",
      detail: "21 pts",
      phoneDetail: "21 pts",
      tone: "placed",
    });
  });

  it("semi-blind: '{ordinal}' over '{k} of {n} matched' / phone '{k} of {n}'; first place is gold", () => {
    expect(
      placementCopy(t, tasting({ revealMode: "SEMI_BLIND" }), { rank: 1, competitors: 5, points: 4, matchedOf: 4 }),
    ).toEqual({ rank: "1st", detail: "4 of 4 matched", phoneDetail: "4 of 4", tone: "first" });
  });

  it("a host who provided the wines has no placing and reads 'You hosted'", () => {
    expect(placementCopy(t, tasting({ hosting: true, hostId: "me" }), null)).toEqual({
      rank: "You hosted",
      tone: "hosted",
    });
    expect(placementCopy(t, tasting({ hosting: true, hostId: "me" }), { rank: 1, competitors: 3, points: 9 })).toEqual({
      rank: "You hosted",
      tone: "hosted",
    });
  });

  it("a bring-your-own host competes like anyone else", () => {
    expect(
      placementCopy(t, tasting({ hosting: true, hostId: "me", wineSource: "PARTICIPANT_CONTRIBUTED" }), {
        rank: 4, competitors: 6, points: 16,
      }),
    ).toEqual({ rank: "4th", detail: "16 pts", phoneDetail: "16 pts", tone: "placed" });
  });

  it("nothing when the viewer was not a competitor", () => {
    expect(placementCopy(t, tasting(), null)).toBeNull();
  });
});
