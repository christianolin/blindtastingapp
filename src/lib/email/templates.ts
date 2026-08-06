// Transactional email templates.
//
// Inline styles only, and no <style> block: most mail clients strip or ignore
// stylesheets, so anything that must survive has to live on the element.
// Colours match the app's own palette (#7E1B26 primary, #2b0f18 ink).

// Escape anything interpolated into the HTML. These strings come from user
// input (display names, tasting names), so this is XSS prevention, not tidiness.
const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function wrap(
  heading: string,
  body: string,
  cta: { url: string; label: string },
) {
  return `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#2b0f18">
  <h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">${heading}</h1>
  <p style="font-size:14px;line-height:1.6;color:#5b4a50;margin:0">${body}</p>
  <p style="margin:24px 0">
    <a href="${esc(cta.url)}" style="background:#7E1B26;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block">${esc(cta.label)}</a>
  </p>
  <p style="font-size:12px;line-height:1.5;color:#8a7a80;margin:0">
    If the button does not work, paste this into your browser:<br>${esc(cta.url)}
  </p>
</div>`.trim();
}

export function verifyEmailTemplate(url: string) {
  return {
    subject: "Confirm your email address",
    html: wrap(
      "Confirm your email",
      "Confirm this address so we can send you password resets and tasting invites. Your account already works — this just unlocks those.",
      { url, label: "Confirm email" },
    ),
  };
}

export function resetPasswordTemplate(url: string) {
  return {
    subject: "Reset your password",
    html: wrap(
      "Reset your password",
      "This link expires in 60 minutes and can be used once. If you did not ask for it, ignore this email — your password will not change.",
      { url, label: "Choose a new password" },
    ),
  };
}

export function inviteTemplate(
  url: string,
  hostName: string,
  tastingName: string,
) {
  return {
    subject: `${hostName} invited you to ${tastingName}`,
    html: wrap(
      "You have been invited to a tasting",
      `<strong>${esc(hostName)}</strong> invited you to <strong>${esc(tastingName)}</strong> on Blindr. Set a password to join.`,
      { url, label: "Join the tasting" },
    ),
  };
}
