import { describe, expect, it } from "vitest";
import { routeTastingView, viewerCanSeeStandings } from "./view-route";

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

describe("viewerCanSeeStandings (upstream 1c6e738)", () => {
  it.each([
    [{ isHost: true, viewer: null }, true],
    [{ isHost: true, viewer: { status: "JOINED" } }, true],
    [{ isHost: false, viewer: { status: "JOINED" } }, true],
    // Any participant row, whatever its status: is_tasting_participant's own
    // rule, so the RPC returns real standings to these viewers too.
    [{ isHost: false, viewer: { status: "INVITED" } }, true],
    [{ isHost: false, viewer: { status: "DECLINED" } }, true],
    // A signed-in outsider on the link: the RPC returns no rows, so no board.
    [{ isHost: false, viewer: null }, false],
  ] as const)("%j → %s", (input, expected) =>
    expect(viewerCanSeeStandings(input)).toBe(expected),
  );
});
