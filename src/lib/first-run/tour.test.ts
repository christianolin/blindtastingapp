import { describe, expect, it } from "vitest";
import {
  FRIEND_REQUESTS_LIVE,
  TOUR_COPY,
  TOUR_REPLAY_HREF,
  TOUR_SETUP_HREF,
  TOUR_STEP_IDS,
  clampStep,
  isProfileBare,
  tourFooter,
  tourSeenFromProfile,
  tourShouldOpen,
  tourStepLabel,
  tourSteps,
  tourVisibleOn,
  type TourStep,
  type TourVisit,
} from "./tour";

const BASE = { canScan: false, profileBare: false, friendRequestsLive: false };
const paragraphsOf = (steps: TourStep[], id: string) => steps.find((s) => s.id === id)?.paragraphs;

describe("tourSteps (spec D5)", () => {
  it("five steps in order for a filled-in profile", () => {
    expect(tourSteps(BASE).map((s) => s.id)).toEqual(["welcome", "taste", "cellar", "learn", "community"]);
  });

  it("adds Make it yours last, and only for a bare profile", () => {
    const steps = tourSteps({ ...BASE, profileBare: true });
    expect(steps.map((s) => s.id)).toEqual([...TOUR_STEP_IDS]);
    expect(steps[5]).toEqual({
      id: "profile",
      title: "Make it yours",
      paragraphs: ["Add a photo and your city so friends recognise you; pick your favourite regions."],
    });
  });

  it("keeps the titles and copy word for word", () => {
    const steps = tourSteps(BASE);
    expect(steps.map((s) => s.title)).toEqual(["Welcome to Blindr", "Taste", "Cellar & Catalog", "Learn", "Community"]);
    expect(paragraphsOf(steps, "welcome")).toEqual([
      "Blind tastings with friends, scored the way the Danish championship scores them; notes on every wine you drink; your cellar; and a map of the wine world. This takes a minute.",
    ]);
    expect(paragraphsOf(steps, "taste")).toEqual([
      "Taste Blind: start a tasting, live around one table or self-paced, invite friends, everyone guesses country, region, grape, producer and vintage, the host reveals glass by glass, points per category.",
      "Taste & Rate: a WSET-style note on any wine, no game.",
    ]);
    expect(paragraphsOf(steps, "learn")).toEqual([
      "The wine map: pinch into a country for its regions and appellations; the Library explains designations and grapes.",
    ]);
  });

  it("names the header camera only where canScan is true", () => {
    expect(paragraphsOf(tourSteps({ ...BASE, canScan: true }), "cellar")).toEqual([
      "Add bottles by scanning a label with the camera at the top — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
    ]);
    expect(paragraphsOf(tourSteps({ ...BASE, canScan: false }), "cellar")).toEqual([
      "Add bottles by searching the shared catalog — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.",
    ]);
  });

  it("says add friends until friend requests ship, then send a friend request", () => {
    expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: false }), "community")).toEqual([
      "Find people, add friends, share your invite link. Friends can see each other's cellars when you allow it.",
    ]);
    expect(paragraphsOf(tourSteps({ ...BASE, friendRequestsLive: true }), "community")).toEqual([
      "Find people, send a friend request, share your invite link. Friends can see each other's cellars when you allow it.",
    ]);
  });

  it("the camera and friend variants never change the step count", () => {
    for (const canScan of [true, false]) {
      for (const friendRequestsLive of [true, false]) {
        expect(tourSteps({ canScan, profileBare: false, friendRequestsLive })).toHaveLength(5);
        expect(tourSteps({ canScan, profileBare: true, friendRequestsLive })).toHaveLength(6);
      }
    }
  });

  it("friend requests are not live in this release", () => {
    // The main session flips this together with FRIEND_REQUESTS_LIVE in the
    // friend-requests deploy (first-run tour plan Task 14).
    expect(FRIEND_REQUESTS_LIVE).toBe(false);
  });
});

describe("tourVisibleOn (spec D4)", () => {
  it.each([
    "/",
    "/overview",
    "/overview/",
    "/taste",
    "/taste/notes",
    "/catalog",
    "/cellar",
    "/cellar/history",
    "/knowledge/map",
    "/knowledge/designations",
    "/community",
    "/about",
    "/rules",
    "/profile/numbers",
    "/u/abc",
    "/u/abc/tastings/def",
  ])("shows on %s", (path) => {
    expect(tourVisibleOn(path)).toBe(true);
  });

  it.each([
    "/auth",
    "/auth/set-password",
    "/auth/confirm-hash",
    "/auth/callback",
    "/login",
    "/login/forgot",
    "/signup",
    "/invite/ABCDEFGHJK",
    "/invite/ABCDEFGHJK/accept",
    "/j/ABCDEF2345",
    "/tastings",
    "/tastings/new",
    "/tastings/abc",
    "/tastings/abc/host",
    "/tastings/abc/play",
    "/tastings/abc/results",
    "/profile/edit",
    "/profile/edit/",
  ])("never on %s", (path) => {
    expect(tourVisibleOn(path)).toBe(false);
  });

  it("ignores a query or a hash", () => {
    expect(tourVisibleOn("/overview?range=year")).toBe(true);
    expect(tourVisibleOn("/tastings/abc?addWine=byhand")).toBe(false);
    expect(tourVisibleOn("/profile/edit#top")).toBe(false);
  });

  it("no path, no tour", () => {
    expect(tourVisibleOn(null)).toBe(false);
    expect(tourVisibleOn(undefined)).toBe(false);
    expect(tourVisibleOn("")).toBe(false);
  });
});

describe("tourShouldOpen (spec D2, D4, D7)", () => {
  const open = (visit: TourVisit, tourSeen: boolean, pathname: string, hydrated = true) =>
    tourShouldOpen({ hydrated, tourSeen, visit, pathname });

  it("never before hydration (no server render, no flash)", () => {
    expect(open("fresh", false, "/overview", false)).toBe(false);
    expect(open("replay", true, "/overview", false)).toBe(false);
  });

  it("opens for an account that has not seen it, on an allowed page", () => {
    expect(open("fresh", false, "/overview")).toBe(true);
    expect(open("fresh", false, "/taste")).toBe(true);
  });

  it("stays shut for an account that has seen it", () => {
    expect(open("fresh", true, "/overview")).toBe(false);
  });

  it("waits out the join link and the tasting, then opens on the next allowed page", () => {
    expect(open("fresh", false, "/j/ABCDEF2345")).toBe(false);
    expect(open("fresh", false, "/tastings/abc")).toBe(false);
    expect(open("fresh", false, "/overview")).toBe(true);
  });

  it("once dismissed, stays shut for the visit whatever the write did", () => {
    for (const path of ["/overview", "/taste", "/catalog"]) {
      expect(open("dismissed", false, path)).toBe(false);
      expect(open("dismissed", true, path)).toBe(false);
    }
  });

  it("a replay waits until /profile/edit is left, then opens even for a seen account", () => {
    expect(open("replay", true, "/profile/edit")).toBe(false);
    expect(open("replay", true, "/overview")).toBe(true);
    expect(open("replay", false, "/overview")).toBe(true);
    expect(open("replay", true, "/tastings/abc")).toBe(false);
  });

  it("no path, no tour", () => {
    expect(tourShouldOpen({ hydrated: true, tourSeen: false, visit: "fresh", pathname: null })).toBe(false);
  });
});

describe("tourFooter and clampStep (spec D3, D5)", () => {
  const five = tourSteps(BASE);
  const six = tourSteps({ ...BASE, profileBare: true });

  it("first step: Next and Skip tour, no Back", () => {
    expect(tourFooter(five, 0)).toEqual({ back: false, skip: true, primary: "next" });
  });

  it("a middle step: Back, Next and Skip tour", () => {
    expect(tourFooter(five, 2)).toEqual({ back: true, skip: true, primary: "next" });
  });

  it("last step of five: Back and Done, no Skip tour", () => {
    expect(tourFooter(five, 4)).toEqual({ back: true, skip: false, primary: "done" });
  });

  it("last step of six (Make it yours): Back and the profile pair, no Skip tour", () => {
    expect(tourFooter(six, 5)).toEqual({ back: true, skip: false, primary: "profile" });
    expect(tourFooter(six, 4)).toEqual({ back: true, skip: true, primary: "next" });
  });

  it("an index past a shrunken list lands on its last step", () => {
    expect(tourFooter(five, 5)).toEqual({ back: true, skip: false, primary: "done" });
  });

  it("clampStep keeps the index inside the list", () => {
    expect(clampStep(0, 5)).toBe(0);
    expect(clampStep(2, 5)).toBe(2);
    expect(clampStep(5, 5)).toBe(4);
    expect(clampStep(9, 6)).toBe(5);
    expect(clampStep(-1, 5)).toBe(0);
    expect(clampStep(3, 0)).toBe(0);
  });
});

describe("isProfileBare (spec D5 step 6)", () => {
  it("bare only with neither a photo nor a location", () => {
    expect(isProfileBare({ avatarUrl: null, location: null })).toBe(true);
    expect(isProfileBare({ avatarUrl: "https://x/a.jpg", location: null })).toBe(false);
    expect(isProfileBare({ avatarUrl: null, location: "Copenhagen" })).toBe(false);
    expect(isProfileBare({ avatarUrl: "https://x/a.jpg", location: "Copenhagen" })).toBe(false);
  });

  it("blank strings count as missing", () => {
    expect(isProfileBare({ avatarUrl: "", location: "  " })).toBe(true);
  });
});

describe("tourSeenFromProfile (spec D1)", () => {
  it("null stamp means not seen", () => {
    expect(tourSeenFromProfile({ tour_seen_at: null })).toBe(false);
  });

  it("any stamp means seen", () => {
    expect(tourSeenFromProfile({ tour_seen_at: "2026-09-25T08:00:00+00:00" })).toBe(true);
  });

  it("a missing or failed profile read counts as seen, never as a reason to show it", () => {
    expect(tourSeenFromProfile(null)).toBe(true);
    expect(tourSeenFromProfile(undefined)).toBe(true);
  });
});

describe("copy constants", () => {
  it("buttons, links and the step label, exactly", () => {
    expect(TOUR_COPY).toEqual({
      back: "Back",
      next: "Next",
      done: "Done",
      skip: "Skip tour",
      setUp: "Set up my profile",
      later: "Later",
      cardTitle: "Getting started",
      showAgain: "Show the tour again",
    });
    expect(TOUR_SETUP_HREF).toBe("/profile/edit");
    expect(TOUR_REPLAY_HREF).toBe("/overview");
    expect(tourStepLabel(2, 6)).toBe("Step 2 of 6");
  });
});
