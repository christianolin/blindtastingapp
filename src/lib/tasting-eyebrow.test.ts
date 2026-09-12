import { describe, expect, it } from "vitest";
import {
  flowWord,
  glassesSoFarPhrase,
  joinEyebrow,
  modeWord,
  participantsPhrase,
  statusWord,
  timingWord,
  type ParticipantStatus,
} from "./tasting-eyebrow";

const rows = (...statuses: ParticipantStatus[]) => statuses.map((status) => ({ status }));

describe("statusWord", () => {
  it("names a draft 'Draft', as the S4 eyebrow draws it", () => {
    expect(statusWord("DRAFT", "LIVE")).toBe("Draft");
    expect(statusWord("DRAFT", "ASYNC")).toBe("Draft");
  });

  it("calls a running tasting 'Live' when it is live and 'In progress' when self-paced", () => {
    expect(statusWord("IN_PROGRESS", "LIVE")).toBe("Live");
    expect(statusWord("IN_PROGRESS", "ASYNC")).toBe("In progress");
  });

  it("names a closed tasting 'Finished' and a legacy open one 'Open'", () => {
    expect(statusWord("CLOSED", "LIVE")).toBe("Finished");
    expect(statusWord("CLOSED", "ASYNC")).toBe("Finished");
    expect(statusWord("OPEN", "LIVE")).toBe("Open");
    expect(statusWord("OPEN", "ASYNC")).toBe("Open");
  });
});

describe("modeWord", () => {
  it("writes the reveal mode in lower case", () => {
    expect(modeWord("BLIND")).toBe("blind");
    expect(modeWord("SEMI_BLIND")).toBe("semi-blind");
  });

  it("writes nothing for the not-yet-offered open mode, so the eyebrow skips it", () => {
    expect(modeWord("OPEN")).toBe("");
  });
});

describe("timingWord", () => {
  it("writes live or self-paced", () => {
    expect(timingWord("LIVE")).toBe("live");
    expect(timingWord("ASYNC")).toBe("self-paced");
  });
});

describe("flowWord", () => {
  it("is 'Guided' only for a blind, live tasting with one-glass-at-a-time pacing", () => {
    expect(flowWord({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: true })).toBe(
      "Guided",
    );
  });

  it("is 'Self-paced' for any self-paced tasting, whatever the other settings", () => {
    expect(flowWord({ revealMode: "BLIND", timingMode: "ASYNC", sequentialGuessing: true })).toBe(
      "Self-paced",
    );
    expect(flowWord({ revealMode: "BLIND", timingMode: "ASYNC", sequentialGuessing: false })).toBe(
      "Self-paced",
    );
    expect(
      flowWord({ revealMode: "SEMI_BLIND", timingMode: "ASYNC", sequentialGuessing: false }),
    ).toBe("Self-paced");
  });

  it("is 'Free order' for every other live tasting", () => {
    expect(flowWord({ revealMode: "BLIND", timingMode: "LIVE", sequentialGuessing: false })).toBe(
      "Free order",
    );
    expect(
      flowWord({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: true }),
    ).toBe("Free order");
    expect(
      flowWord({ revealMode: "SEMI_BLIND", timingMode: "LIVE", sequentialGuessing: false }),
    ).toBe("Free order");
    expect(flowWord({ revealMode: "OPEN", timingMode: "LIVE", sequentialGuessing: true })).toBe(
      "Free order",
    );
  });
});

describe("participantsPhrase", () => {
  it("counts joined and invited people, not declined ones", () => {
    expect(
      participantsPhrase(
        rows("JOINED", "JOINED", "JOINED", "JOINED", "INVITED", "INVITED", "INVITED", "DECLINED", "DECLINED"),
      ),
    ).toBe("7 participants");
  });

  it("uses the singular for exactly one", () => {
    expect(participantsPhrase(rows("JOINED"))).toBe("1 participant");
    expect(participantsPhrase(rows("INVITED", "DECLINED"))).toBe("1 participant");
  });

  it("uses the plural for none", () => {
    expect(participantsPhrase([])).toBe("0 participants");
    expect(participantsPhrase(rows("DECLINED", "DECLINED"))).toBe("0 participants");
  });
});

describe("glassesSoFarPhrase", () => {
  it("says there are no glasses yet for an empty flight", () => {
    expect(glassesSoFarPhrase(0)).toBe("No glasses yet");
  });

  it("counts the glasses poured so far, never against a planned total", () => {
    expect(glassesSoFarPhrase(1)).toBe("1 glass so far");
    expect(glassesSoFarPhrase(4)).toBe("4 glasses so far");
    expect(glassesSoFarPhrase(12)).toBe("12 glasses so far");
  });

  it("treats a nonsense count as an empty flight", () => {
    expect(glassesSoFarPhrase(-1)).toBe("No glasses yet");
    expect(glassesSoFarPhrase(Number.NaN)).toBe("No glasses yet");
  });
});

describe("joinEyebrow", () => {
  it("joins parts with a spaced middle dot", () => {
    expect(joinEyebrow(["Draft", "blind", "live"])).toBe("Draft · blind · live");
  });

  it("skips empty, blank, null and undefined parts", () => {
    expect(joinEyebrow(["Draft", "", "blind", null, "  ", undefined, "7 participants"])).toBe(
      "Draft · blind · 7 participants",
    );
  });

  it("trims each part", () => {
    expect(joinEyebrow([" Draft ", "blind "])).toBe("Draft · blind");
  });

  it("is empty when every part is", () => {
    expect(joinEyebrow([])).toBe("");
    expect(joinEyebrow(["", null, undefined])).toBe("");
  });

  it("builds S4's desktop eyebrow from the helpers and a caller-formatted date", () => {
    const participants = rows("JOINED", "JOINED", "JOINED", "JOINED", "INVITED", "INVITED", "INVITED", "DECLINED");
    expect(
      joinEyebrow([
        statusWord("DRAFT", "LIVE"),
        modeWord("BLIND"),
        timingWord("LIVE"),
        "Thursday 11 Sep 19:00",
        participantsPhrase(participants),
      ]),
    ).toBe("Draft · blind · live · Thursday 11 Sep 19:00 · 7 participants");
  });

  it("drops the date while it is unscheduled or not yet formatted on the client", () => {
    expect(
      joinEyebrow([
        statusWord("DRAFT", "ASYNC"),
        modeWord("SEMI_BLIND"),
        timingWord("ASYNC"),
        "",
        participantsPhrase(rows("JOINED")),
      ]),
    ).toBe("Draft · semi-blind · self-paced · 1 participant");
  });
});
