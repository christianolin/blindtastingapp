// First-run tour (spec docs/superpowers/specs/2026-09-25-first-run-tour-design.md).
// Everything the tour decides, as pure functions and constants: the steps and
// their copy (D5), where it may open (D4), whether it is open in this visit
// (D2, D7), the footer each step gets (D3), and the two facts AppShell derives
// from the profile row (D1, D5 step 6). The components under
// src/components/first-run/ only wire these; the per-account flag is
// profiles.tour_seen_at (20260925010000), written by ./actions.ts.
//
// A plain module, no "use client": AppShell (a server component) imports
// `tourSeenFromProfile` and `isProfileBare`, and a value imported from a
// client module across the server boundary becomes a client reference.

/** Step 5's friend sentence. False until the friend-requests release ships;
    the main session flips it to true in that release's deploy (spec D5). */
export const FRIEND_REQUESTS_LIVE = false;

export const TOUR_STEP_IDS = ["welcome", "taste", "cellar", "learn", "community", "profile"] as const;
export type TourStepId = (typeof TOUR_STEP_IDS)[number];

export type TourStep = {
  id: TourStepId;
  title: string;
  /** One or two paragraphs, rendered in order. */
  paragraphs: readonly string[];
};

/** Every other user-visible string of the tour and of its reset card. */
export const TOUR_COPY = {
  back: "Back",
  next: "Next",
  done: "Done",
  skip: "Skip tour",
  setUp: "Set up my profile",
  later: "Later",
  cardTitle: "Getting started",
  showAgain: "Show the tour again",
} as const;

/** Where "Set up my profile" goes (D5 step 6). */
export const TOUR_SETUP_HREF = "/profile/edit";
/** Where "Show the tour again" sends the person, and the tour opens (D2). */
export const TOUR_REPLAY_HREF = "/overview";

/** The screen-reader position line under the dots. */
export function tourStepLabel(position: number, total: number): string {
  return `Step ${position} of ${total}`;
}

/** The steps, in order (D5). The camera clause only where the device can
    scan (coarse pointer AND a camera, `useCanScan`); "Make it yours" only for
    a bare profile; the friend sentence follows FRIEND_REQUESTS_LIVE. */
export function tourSteps(opts: {
  canScan: boolean;
  profileBare: boolean;
  friendRequestsLive: boolean;
}): TourStep[] {
  const addBy = opts.canScan
    ? "scanning a label with the camera at the top"
    : "searching the shared catalog";
  const befriend = opts.friendRequestsLive ? "send a friend request" : "add friends";
  const steps: TourStep[] = [
    {
      id: "welcome",
      title: "Welcome to Blindr",
      paragraphs: [
        "Blind tastings with friends, scored the way the Danish championship scores them; notes on every wine you drink; your cellar; and a map of the wine world. This takes a minute.",
      ],
    },
    {
      id: "taste",
      title: "Taste",
      paragraphs: [
        "Taste Blind: start a tasting, live around one table or self-paced, invite friends, everyone guesses country, region, grape, producer and vintage, the host reveals glass by glass, points per category.",
        "Taste & Rate: a WSET-style note on any wine, no game.",
      ],
    },
    {
      id: "cellar",
      title: "Cellar & Catalog",
      paragraphs: [
        `Add bottles by ${addBy} — the catalog is everyone's reference, your cellar is yours and private unless you say otherwise.`,
      ],
    },
    {
      id: "learn",
      title: "Learn",
      paragraphs: [
        "The wine map: pinch into a country for its regions and appellations; the Library explains designations and grapes.",
      ],
    },
    {
      id: "community",
      title: "Community",
      paragraphs: [
        `Find people, ${befriend}, share your invite link. Friends can see each other's cellars when you allow it.`,
      ],
    },
  ];
  if (opts.profileBare) {
    steps.push({
      id: "profile",
      title: "Make it yours",
      paragraphs: ["Add a photo and your city so friends recognise you; pick your favourite regions."],
    });
  }
  return steps;
}

// D4: never on the sign-in paths, an invite or join link, anywhere inside a
// tasting (a join-link newcomer sees it on their first page after it), or on
// /profile/edit while the person is already there. First path segment only.
const EXCLUDED_SEGMENTS = new Set(["auth", "invite", "j", "tastings"]);
const EXCLUDED_PREFIXES = ["login", "signup"];

export function tourVisibleOn(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split(/[?#]/, 1)[0];
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  if (EXCLUDED_SEGMENTS.has(first)) return false;
  if (EXCLUDED_PREFIXES.some((prefix) => first.startsWith(prefix))) return false;
  if (first === "profile" && segments[1] === "edit") return false;
  return true;
}

/** This visit's tour state, held by TourProvider: "fresh" until something
    happens; "dismissed" once any dismissal ran (whatever its write did);
    "replay" once "Show the tour again" asked for it. */
export type TourVisit = "fresh" | "dismissed" | "replay";

/** Whether the sheet is open. The server's `tourSeen` is the value at the
    last full render of the root layout, which a soft navigation does not
    re-render — so this decides on the client, from that prop, the visit and
    the current path. Nothing before hydration (D7). */
export function tourShouldOpen(input: {
  hydrated: boolean;
  tourSeen: boolean;
  visit: TourVisit;
  pathname: string | null | undefined;
}): boolean {
  if (!input.hydrated || input.visit === "dismissed") return false;
  if (!tourVisibleOn(input.pathname)) return false;
  return input.visit === "replay" || !input.tourSeen;
}

/** Keeps a step index inside a list that may have shrunk under it. */
export function clampStep(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

export type TourFooter = { back: boolean; skip: boolean; primary: "next" | "done" | "profile" };

/** The footer of the step at `index` (D3, D5). Skip tour on every step but
    the last, where Done — or Later / Set up my profile — already ends it. */
export function tourFooter(steps: readonly TourStep[], index: number): TourFooter {
  const at = clampStep(index, steps.length);
  const last = at === steps.length - 1;
  if (!last) return { back: at > 0, skip: true, primary: "next" };
  return { back: at > 0, skip: false, primary: steps[at]?.id === "profile" ? "profile" : "done" };
}

/** D5 step 6: a profile is bare with no photo AND no location (blank counts as none). */
export function isProfileBare(profile: { avatarUrl: string | null; location: string | null }): boolean {
  return !profile.avatarUrl?.trim() && !profile.location?.trim();
}

/** D1: null = show the tour. A missing or failed profile read counts as seen,
    so an error never shows the tour again to someone who dismissed it. */
export function tourSeenFromProfile(profile: { tour_seen_at: string | null } | null | undefined): boolean {
  return profile ? profile.tour_seen_at !== null : true;
}
