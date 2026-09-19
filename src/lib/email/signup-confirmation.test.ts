import { describe, expect, it } from "vitest";
import { ABOUT_LINES } from "../invites/copy";
import {
  SUPABASE_CONFIRM_SIGNUP_SUBJECT,
  supabaseConfirmSignupTemplateHtml,
} from "./signup-confirmation";

describe("Supabase 'Confirm signup' template", () => {
  const html = supabaseConfirmSignupTemplateHtml();

  it("has a plain subject with no placeholders", () => {
    expect(SUPABASE_CONFIRM_SIGNUP_SUBJECT).toBe("Confirm your email for Blindr");
    expect(SUPABASE_CONFIRM_SIGNUP_SUBJECT).not.toContain("{{");
  });

  it("keeps Supabase's own confirmation link, so the sign-up next survives", () => {
    expect(html).toContain('href="{{ .ConfirmationURL }}"');
    expect(html).not.toContain(".TokenHash");
  });

  it("greets by the sign-up name when there is one", () => {
    expect(html).toContain(
      "{{ if .Data.display_name }}Hi {{ .Data.display_name }},{{ else }}Hi,{{ end }}",
    );
  });

  it("carries the heading, the first About line, the button and the sign-off", () => {
    expect(html).toContain(">Welcome to Blindr</h1>");
    expect(html).toContain(ABOUT_LINES[0]);
    expect(html).toContain(">Confirm my email</a>");
    expect(html).toContain("If you didn't sign up for Blindr, you can ignore this email.");
  });

  it("uses the brand colours inline and no script", () => {
    expect(html).toContain("#5C1A2B");
    expect(html).toContain("#F5EFE3");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("is stable", () => {
    expect(supabaseConfirmSignupTemplateHtml()).toBe(html);
  });
});
