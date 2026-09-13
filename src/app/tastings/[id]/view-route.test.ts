import { describe, expect, it } from "vitest";
import { routeTastingView } from "./view-route";

describe("routeTastingView (B2 one running page, B3, B5)", () => {
  it.each([
    [{ revealMode: "OPEN", status: "IN_PROGRESS", viewerStatus: "JOINED", isHost: false }, "open-board"],
    [{ revealMode: "BLIND", status: "CLOSED", viewerStatus: "INVITED", isHost: false }, "finished"],
    [{ revealMode: "BLIND", status: "CLOSED", viewerStatus: "JOINED", isHost: false }, "finished"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "INVITED", isHost: false }, "invitation"],
    [{ revealMode: "SEMI_BLIND", status: "IN_PROGRESS", viewerStatus: "INVITED", isHost: false }, "invitation"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "JOINED", isHost: false }, "guest-lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "JOINED", isHost: true }, "lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: "DECLINED", isHost: false }, "lobby"],
    [{ revealMode: "BLIND", status: "DRAFT", viewerStatus: null, isHost: true }, "lobby"],
    [{ revealMode: "BLIND", status: "IN_PROGRESS", viewerStatus: "JOINED", isHost: false }, "running"],
    [{ revealMode: "BLIND", status: "OPEN", viewerStatus: null, isHost: false }, "running"],
    // BT-A0: a DRAFT OPEN tasting gets the lobby, not open-board (S7 gates
    // OpenBoard on `running && isOpen`, page.tsx:721).
    [{ revealMode: "OPEN", status: "DRAFT", viewerStatus: "JOINED", isHost: true }, "lobby"],
  ] as const)("%j → %s", (input, view) => expect(routeTastingView(input)).toBe(view));
});
