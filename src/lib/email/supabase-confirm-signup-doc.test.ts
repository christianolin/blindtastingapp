import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SUPABASE_CONFIRM_SIGNUP_SUBJECT,
  supabaseConfirmSignupTemplateHtml,
} from "./signup-confirmation";

// Pins docs/email/supabase-confirm-signup-template.md to
// signup-confirmation.ts, the same way supabase-template-doc.test.ts pins the
// invite template: the doc is what gets pasted into the Supabase dashboard by
// hand, so this fails the moment the doc and the module disagree.

const DOC_PATH = "docs/email/supabase-confirm-signup-template.md";

function fencedBlock(doc: string, lang: "html" | "text"): string {
  const match = doc.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```"));
  if (!match) throw new Error(`${DOC_PATH}: no fenced \`${lang}\` block found`);
  return match[1];
}

describe("supabase-confirm-signup-template.md pins signup-confirmation.ts", () => {
  // Normalised so a CRLF checkout (Windows autocrlf) matches the same fences.
  const doc = readFileSync(DOC_PATH, "utf8").replace(/\r\n/g, "\n");

  it("the fenced text block equals SUPABASE_CONFIRM_SIGNUP_SUBJECT", () => {
    expect(fencedBlock(doc, "text")).toBe(SUPABASE_CONFIRM_SIGNUP_SUBJECT);
  });

  it("the fenced html block equals supabaseConfirmSignupTemplateHtml()", () => {
    expect(fencedBlock(doc, "html")).toBe(supabaseConfirmSignupTemplateHtml());
  });
});
