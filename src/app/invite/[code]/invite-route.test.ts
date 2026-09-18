import { describe, expect, it } from "vitest";
import { inviteView } from "./invite-route";

describe("inviteView (spec D19)", () => {
  it.each([
    [{ state: "unknown", signedIn: false, isInviter: false }, "unknown"],
    [{ state: "unknown", signedIn: true, isInviter: false }, "unknown"],
    [{ state: "expired", signedIn: true, isInviter: true }, "expired"],   // the state beats own-link
    [{ state: "exhausted", signedIn: false, isInviter: false }, "exhausted"],
    [{ state: "ok", signedIn: true, isInviter: true }, "own-link"],
    [{ state: "ok", signedIn: false, isInviter: false }, "join"],
    [{ state: "ok", signedIn: true, isInviter: false }, "add-friend"],
    [{ state: "ok", signedIn: false, isInviter: true }, "join"],          // isInviter is meaningless signed out
  ] as const)("%j → %s", (input, view) => expect(inviteView(input)).toBe(view));
});
