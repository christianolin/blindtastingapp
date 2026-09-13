import { expect, it } from "vitest";
import { collectInviteEmails } from "./invite-emails";

it("dedupes friend chips and typed addresses, drops blanks and the host (create-7)", () =>
  expect(collectInviteEmails(["A@x.com"], [" a@x.com ", "b@y.com", "", "host@z.com"], "HOST@z.com")).toEqual(["a@x.com", "b@y.com"]));
it("works without a host address", () => expect(collectInviteEmails([], ["c@d.com"], null)).toEqual(["c@d.com"]));
