import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPABASE_INVITE_SUBJECT, supabaseInviteTemplateHtml } from "./platform-invite";

// Pins docs/email/supabase-invite-template.md to platform-invite.ts (D17;
// plan refinement 10). The doc is what gets pasted into the Supabase
// dashboard's "Invite user" template by hand (PI-V3) — this test fails the
// moment the pasted text and the module it was derived from disagree, so a
// future change to the template never drifts from what is actually live.
// To regenerate the doc after a template change: run this test (it fails
// with the mismatch), copy the new `supabaseInviteTemplateHtml()` output and
// `SUPABASE_INVITE_SUBJECT` into the doc's fenced blocks, run it again.

const DOC_PATH = "docs/email/supabase-invite-template.md";

function fencedBlock(doc: string, lang: "html" | "text"): string {
  const match = doc.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```"));
  if (!match) throw new Error(`${DOC_PATH}: no fenced \`${lang}\` block found`);
  return match[1];
}

describe("supabase-invite-template.md pins platform-invite.ts (D17)", () => {
  const doc = readFileSync(DOC_PATH, "utf8");

  it("the fenced text block equals SUPABASE_INVITE_SUBJECT", () => {
    expect(fencedBlock(doc, "text")).toBe(SUPABASE_INVITE_SUBJECT);
  });

  it("the fenced html block equals supabaseInviteTemplateHtml()", () => {
    expect(fencedBlock(doc, "html")).toBe(supabaseInviteTemplateHtml());
  });
});
