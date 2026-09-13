import { describe, expect, it } from "vitest";
import {
  HAND_HOSTING_ROW,
  INVITES_CLOSE_WHEN_ENDED,
  LINK_WORKS_UNTIL_END,
  MANAGE_INVITATIONS,
  MODE_STILL_CHANGEABLE,
  ONLY_ONCE_EXISTS,
  PARTICIPANTS_FOOTER,
  SETTINGS_FOOTER_DRAFT,
  SETTINGS_FOOTER_STARTED,
  START_CAPTION,
  bringsWineLine,
  deleteTastingLabel,
  handHostingCopy,
  handHostingRefusal,
  lobbyEyebrowParts,
  participantsSummary,
  removalImpactLine,
  settingsEyebrow,
  swapCopy,
  winesCaption,
} from "./lobby-copy";
import { participantsPhrase } from "./tasting-eyebrow";

const people = (joined: number, invited: number, declined: number) => [
  ...Array.from({ length: joined }, () => ({ status: "JOINED" as const })),
  ...Array.from({ length: invited }, () => ({ status: "INVITED" as const })),
  ...Array.from({ length: declined }, () => ({ status: "DECLINED" as const })),
];

describe("participants (LOBBY-17)", () => {
  it("counts exactly what tasting-eyebrow's participantsPhrase counts", () => {
    for (const rows of [people(5, 2, 2), people(1, 0, 1), people(0, 3, 0)]) {
      const { count } = participantsSummary(rows);
      expect(participantsPhrase(rows)).toBe(`${count} ${count === 1 ? "participant" : "participants"}`);
    }
  });
  it("counts Joined and Invited, collapses Declined", () => {
    expect(participantsSummary(people(5, 2, 2))).toEqual({ count: 7, declined: 2, declinedLine: "2 declined" });
    expect(participantsSummary(people(1, 0, 1)).declinedLine).toBe("1 declined");
    expect(participantsSummary(people(1, 0, 0))).toEqual({ count: 1, declined: 0, declinedLine: null });
  });
});

describe("lobby eyebrow (LOBBY-01, LOBBY-23)", () => {
  const t = { status: "DRAFT", timingMode: "LIVE", revealMode: "BLIND" } as const;
  it("laptop: status · mode · timing, the date slot, participants", () => {
    expect(lobbyEyebrowParts({ ...t, participants: people(5, 2, 1) }, { phone: false }))
      .toEqual({ before: ["Draft", "blind", "live"], after: ["7 participants"] });
  });
  it("phone: status · mode, then the date slot", () => {
    expect(lobbyEyebrowParts({ ...t, participants: people(5, 2, 1) }, { phone: true }))
      .toEqual({ before: ["Draft", "blind"], after: [] });
  });
  it("a running live tasting drops the timing word next to Live", () => {
    expect(lobbyEyebrowParts({ ...t, status: "IN_PROGRESS", participants: people(2, 0, 0) }, { phone: false }).before)
      .toEqual(["Live", "blind"]);
  });
});

describe("removalImpactLine (S4c)", () => {
  it.each([
    [0, 0, null],
    [1, 0, "1 guess on this glass goes with it"],
    [3, 0, "3 guesses on this glass go with it"],
    [3, 2, "3 guesses and 2 private notes on this glass go with it"],
    [1, 1, "1 guess and 1 private note on this glass go with it"],
    [0, 1, "1 private note on this glass goes with it"],
    [0, 2, "2 private notes on this glass go with it"],
  ] as const)("%d guesses, %d notes → %s", (g, n, line) => expect(removalImpactLine(g, n)).toBe(line));
});

describe("lobby lines (S4, S4b)", () => {
  it("captions, Start, footer, brings wine", () => {
    expect(winesCaption(3, { phone: false })).toBe("3 so far · only you can see them");
    expect(winesCaption(3, { phone: true })).toBe("3 so far · hidden");
    expect(START_CAPTION).toBe(
      "Starting opens guessing for everyone. You can keep adding wines after it starts — the flight grows as you pour.",
    );
    expect(PARTICIPANTS_FOOTER).toBe("More invites live in Tasting settings.");
    expect(bringsWineLine(4)).toBe("brings wine 4");
    expect(bringsWineLine(null)).toBeNull();
  });
  it("swap copy", () => {
    expect(swapCopy(3)).toEqual({
      row: "Swap for another bottle",
      rowSub: "Keeps position 3 and any guesses already made",
      header: "Swap glass 3",
      primary: "Swap into glass 3",
      remove: "Remove from the flight",
    });
  });
});

describe("settings sheet copy (S4d)", () => {
  it("eyebrow, footers, delete two-tap", () => {
    expect(settingsEyebrow("DRAFT")).toBe("Host controls · not started yet");
    expect(settingsEyebrow("IN_PROGRESS")).toBe("Host controls · started");
    expect(settingsEyebrow("CLOSED")).toBe("Host controls · started");
    expect(SETTINGS_FOOTER_DRAFT).toBe("Once the first glass is poured, mode and scoring lock. Everything else stays editable.");
    expect(SETTINGS_FOOTER_STARTED).toBe(
      "The tasting has started — mode, timing, rules and who brings the wines are locked. Name, description, photo, time and place stay editable.",
    );
    expect(MODE_STILL_CHANGEABLE).toBe("still changeable — nothing has been poured");
    expect(ONLY_ONCE_EXISTS).toBe("Only once a tasting exists");
    expect(MANAGE_INVITATIONS).toBe("Manage invitations");
    expect(deleteTastingLabel("idle")).toBe("Delete the tasting");
    expect(deleteTastingLabel("armed")).toBe("Tap again to delete it for everyone");
  });
  it("invites and the link stay open until the end (B4)", () => {
    expect(INVITES_CLOSE_WHEN_ENDED).toBe("Invites close when the tasting ends.");
    expect(LINK_WORKS_UNTIL_END).toBe("Works until the tasting ends.");
  });
});

describe("hand hosting (B11)", () => {
  it("copy", () => {
    expect(HAND_HOSTING_ROW).toBe("Hand hosting to someone");
    expect(handHostingCopy("Maja")).toEqual({
      title: "Choose who hosts",
      line: "Maja becomes the host. You stay at the table as a guest.",
      button: "Make Maja host",
    });
  });
  it.each([
    ["only the host can hand hosting over", "Only the host can hand hosting over."],
    ["hosting can only change before the tasting starts", "Hosting can only change before the tasting starts."],
    ["only someone who has joined can host", "Only someone who has joined can host."],
    ["remove the glasses you added first", "Remove the glasses you added first — the new host would inherit their answers."],
    ["finish or remove your unfinished glasses and cellar bottles first", "Finish or remove your unfinished glasses and cellar bottles first."],
    ["permission denied for function transfer_tasting_host", "Hosting could not be handed over."],
  ])("%s", (message, sentence) => expect(handHostingRefusal(message)).toBe(sentence));
});
