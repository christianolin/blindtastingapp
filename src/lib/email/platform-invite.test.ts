import { describe, expect, it } from "vitest";
import { ABOUT_LINES } from "../invites/copy";
import { SUPABASE_INVITE_SUBJECT, mailtoHref, platformInviteEmail, supabaseInviteTemplateHtml } from "./platform-invite";

const URL = "https://blindr.example/invite/NEB7K2QX4M";
describe("platform invite email (spec §7, D3)", () => {
  const m = platformInviteEmail({ inviterName: "Isabelle Moreau", inviteeName: "Anna", url: URL });
  it("subject and preheader", () => {
    expect(m.subject).toBe("Isabelle Moreau invited you to Blindr");
    expect(m.preheader).toBe(ABOUT_LINES[0]);
    expect(m.buttonUrl).toBe(URL);
  });
  it("text carries the salutation, the inviter, the three lines and the link", () => {
    expect(m.text.startsWith("Hi Anna,")).toBe(true);
    expect(m.text).toContain("Isabelle Moreau invited you to Blindr.");
    for (const line of ABOUT_LINES) expect(m.text).toContain(line);
    expect(m.text).toContain(`Join Blindr: ${URL}`);
    expect(platformInviteEmail({ inviterName: "I", inviteeName: null, url: URL }).text.startsWith("Hi,")).toBe(true);
  });
  it("html carries the same, escaped, with the button", () => {
    const h = platformInviteEmail({ inviterName: 'Tom & "Jerry" <x>', inviteeName: null, url: URL }).html;
    expect(h).toContain("Tom &amp; &quot;Jerry&quot; &lt;x&gt; invited you to Blindr");
    expect(h).toContain(`href="${URL}"`);
    expect(h).toContain(">Join Blindr<");
    for (const line of ABOUT_LINES) expect(h).toContain(line);
  });
  it("mailto", () => {
    const href = mailtoHref("anna@example.com", m);
    expect(href.startsWith("mailto:anna%40example.com?subject=")).toBe(true);
    expect(href).toContain(encodeURIComponent(m.subject));
    expect(href).toContain("%0D%0A");
    expect(mailtoHref(null, m).startsWith("mailto:?subject=")).toBe(true);
  });
  it("the dashboard variant uses Go placeholders and keeps a generic branch", () => {
    const t = supabaseInviteTemplateHtml();
    expect(t).toContain("{{ if .Data.platform_invite_code }}");
    expect(t).toContain("{{ .Data.platform_inviter_name }} invited you to Blindr");
    expect(t).toContain('href="{{ .ConfirmationURL }}"');
    expect(t).toContain("{{ else }}");
    expect(t).toContain("Accept the invite");
    expect(t.trim().endsWith("{{ end }}")).toBe(true);
    expect(SUPABASE_INVITE_SUBJECT).toBe("{{ if .Data.platform_inviter_name }}{{ .Data.platform_inviter_name }} invited you to Blindr{{ else }}You've been invited to Blindr{{ end }}");
  });
});
