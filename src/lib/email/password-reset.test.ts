import { describe, expect, it } from "vitest";
import { RESET_NEXT } from "../auth/paths";
import { SUPABASE_RESET_SUBJECT, supabaseResetTemplateHtml } from "./password-reset";

// spec part D: the Supabase dashboard's "Reset Password" email template,
// derived the same way `platform-invite.ts`'s invite template is (pure
// module, no framework/environment import).

describe("supabase reset-password email template (spec part D)", () => {
  it("subject", () => {
    expect(SUPABASE_RESET_SUBJECT).toBe("Choose a new Blindr password");
  });

  it("the button href hits /auth/confirm with a recovery token hash and RESET_NEXT", () => {
    const html = supabaseResetTemplateHtml();
    expect(html).toContain("/auth/confirm?token_hash={{ .TokenHash }}");
    expect(html).toContain("type=recovery");
    const match = html.match(/next=([^"\s]+)/);
    expect(match).not.toBeNull();
    expect(decodeURIComponent(match![1])).toBe(RESET_NEXT);
  });

  it("carries the heading, body copy, button label and footer verbatim", () => {
    const html = supabaseResetTemplateHtml();
    expect(html).toContain(">Choose a new password<");
    expect(html).toContain(
      "Someone asked to reset the password for your Blindr account. Use the button to choose a new one. The link works once.",
    );
    expect(html).toContain("If you didn't ask for this, you can ignore this email. Your password stays the same.");
  });

  it("is a plain table layout in the brand colors (no CSS variables — mail clients don't read them)", () => {
    const html = supabaseResetTemplateHtml();
    expect(html).toContain("#5C1A2B");
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("<table");
    expect(html).not.toContain("var(--");
  });
});
