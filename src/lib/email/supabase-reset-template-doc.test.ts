import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUPABASE_RESET_SUBJECT, supabaseResetTemplateHtml } from "./password-reset";

// Pins docs/email/supabase-reset-password-template.md to password-reset.ts
// (spec part D), the same way supabase-template-doc.test.ts pins the invite
// template doc to platform-invite.ts. Regenerate the doc the same way: run
// this test (it fails with the mismatch), copy the new
// supabaseResetTemplateHtml() output and SUPABASE_RESET_SUBJECT into the
// doc's fenced blocks, run it again.

const DOC_PATH = "docs/email/supabase-reset-password-template.md";

function fencedBlock(doc: string, lang: "html" | "text"): string {
  const match = doc.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```"));
  if (!match) throw new Error(`${DOC_PATH}: no fenced \`${lang}\` block found`);
  return match[1];
}

describe("supabase-reset-password-template.md pins password-reset.ts (spec part D)", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches the same fences.
  const doc = readFileSync(DOC_PATH, "utf8").replace(/\r\n/g, "\n");

  it("the fenced text block equals SUPABASE_RESET_SUBJECT", () => {
    expect(fencedBlock(doc, "text")).toBe(SUPABASE_RESET_SUBJECT);
  });

  it("the fenced html block equals supabaseResetTemplateHtml()", () => {
    expect(fencedBlock(doc, "html")).toBe(supabaseResetTemplateHtml());
  });
});
