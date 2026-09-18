"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OWN_LINK_LINES, inviteState, stateCopy } from "@/lib/invites/copy";
import {
  INVITE_INTENT_COOKIE,
  inviteUrl,
  isCodeShape,
  landingPath,
  loginHref,
  normaliseCode,
  signupHref,
} from "@/lib/invites/links";
import { platformInviteEmail } from "@/lib/email/platform-invite";
import { sendPlatformInviteEmail, type SendResult } from "@/lib/email/sender";
import type { CreatedInvite } from "@/lib/invites/types";

// Platform invites — the server writes (spec §2 D2, D7, D10–D15; §3; plan
// refinements 3–7). `createPlatformInvite` and `sendPlatformInvite` sit
// behind the inviter's dialog; `beginJoin` behind the landing page's two
// forms ("Join Blindr" / "Sign in"); `acceptInvite` behind its signed-in
// button. The first-sign-in landing, `/invite/[code]/accept`, is the route
// handler beside this file — it must read and delete a cookie and redirect,
// which a server component cannot do.
//
// Privacy: `invitee_email` is written here, once, on create — and never read
// back. No RPC returns it, no page or prop carries it, and
// `sendPlatformInvite` mails the address typed at send time (D14), which it
// never stores. Every path and every `next` comes from
// `src/lib/invites/links.ts`; the service role is touched only inside
// `src/lib/email/sender.ts`.


const MAX_INVITEE_NAME_LENGTH = 80; // D8: platform_invites_invitee_name_len
// A shape check only; the provider validates the address for real (D15).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// D7 / refinement 5: a 23505 on insert is a code collision (~1 in 10^15).
const CODE_COLLISION_RETRIES = 2;

// D12 / refinement 3: the intent cookie — httpOnly, Lax, secure outside
// development, scoped to /invite, 24 h so a slow confirmation email still
// counts. The accept route (`[code]/accept/route.ts`) deletes it with the
// same name and path.
const INTENT_COOKIE_PATH = "/invite";
const INTENT_COOKIE_MAX_AGE = 60 * 60 * 24;

// (plan copy) D14: the Supabase branch cannot mail an existing account.
const EXISTING_ACCOUNT_LINE =
  "Someone with that address is already on Blindr — send them the link instead.";
// (plan copy) — the three lines below are NOT in the plan's copy table; the
// task asked for the name-length and email-shape checks and the /j-style
// fallback without supplying their words. Reported to the orchestrator.
const NAME_TOO_LONG = "Their name can be 80 characters at most.";
const EMAIL_SHAPE_ERROR = "That email address doesn't look right.";
const ACCEPT_FALLBACK = "The link didn't work. Ask whoever sent it for a fresh one.";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function siteUrl(): string {
  // `inviteUrl` / `confirmHashRedirect` strip a trailing slash themselves.
  return process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

// Only the three client columns: id, code, uses, expires_at and created_at
// come from the defaults, and the INSERT grant is column-limited so no client
// could choose a code (D7). The returning select reads back under the
// "read own" policy.
function insertInvite(
  supabase: Supabase,
  row: { inviter_id: string; invitee_name: string | null; invitee_email: string | null },
) {
  return supabase
    .from("platform_invites")
    .insert(row)
    .select("code, expires_at, max_uses")
    .single();
}

export async function createPlatformInvite(input: {
  inviteeName: string;
  inviteeEmail: string;
}): Promise<CreatedInvite | { error: string }> {
  const { supabase, user } = await requireUser();
  const inviteeName = input.inviteeName.trim();
  const inviteeEmail = input.inviteeEmail.trim().toLowerCase();
  if (inviteeName.length > MAX_INVITEE_NAME_LENGTH) return { error: NAME_TOO_LONG };
  if (inviteeEmail && !EMAIL_SHAPE.test(inviteeEmail)) return { error: EMAIL_SHAPE_ERROR };

  const row = {
    inviter_id: user.id,
    invitee_name: inviteeName || null,
    invitee_email: inviteeEmail || null,
  };
  let result = await insertInvite(supabase, row);
  // A unique-key collision on `code`: mint again, twice (refinement 5).
  for (let retry = 0; retry < CODE_COLLISION_RETRIES && result.error?.code === "23505"; retry++) {
    result = await insertInvite(supabase, row);
  }
  if (result.error) return { error: result.error.message };

  return {
    code: result.data.code,
    url: inviteUrl(siteUrl(), result.data.code),
    expiresAt: result.data.expires_at,
    maxUses: result.data.max_uses,
  };
}

// Refinement 6: the caller's own row through RLS (a foreign code reads as no
// such link), a non-ok state answered with its own line, an existing account
// answered without touching the provider (D14), otherwise the message goes
// to the sender seam. The email address is used, not stored.
export async function sendPlatformInvite(code: string, email: string): Promise<SendResult> {
  const { supabase, user } = await requireUser();
  const to = email.trim().toLowerCase();

  const { data: invite, error: inviteError } = await supabase
    .from("platform_invites")
    .select("code, expires_at, uses, max_uses, invitee_name")
    .eq("code", normaliseCode(code))
    .maybeSingle();
  if (inviteError) return { ok: false, reason: "provider", message: inviteError.message };
  if (!invite) {
    return { ok: false, reason: "provider", message: stateCopy("unknown", null).lines[0] };
  }
  const state = inviteState(
    { expiresAt: invite.expires_at, uses: invite.uses, maxUses: invite.max_uses },
    new Date(),
  );
  if (state !== "ok") {
    return { ok: false, reason: "provider", message: stateCopy(state, null).lines[0] };
  }

  // D14, the `inviteToTasting` lookup: Auth cannot mail an account that
  // already exists, so say so and let the dialog keep its mailto link.
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", to)
    .maybeSingle();
  if (existing) return { ok: false, reason: "existing-account", message: EXISTING_ACCOUNT_LINE };

  const { data: me, error: meError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();
  if (meError) return { ok: false, reason: "provider", message: meError.message };

  const inviterName = me.display_name;
  const message = platformInviteEmail({
    inviterName,
    inviteeName: invite.invitee_name,
    url: inviteUrl(siteUrl(), invite.code),
  });
  return sendPlatformInviteEmail(to, message, {
    code: invite.code,
    inviterName,
    inviteeName: invite.invitee_name,
  });
}

// D12: "Join Blindr" and "Sign in" on the landing page both post here, so the
// intent cookie is set on either path (refinement 11). The preview must say
// `ok` before the cookie is written; anything else goes back to the landing
// page, which shows the matching state copy. Used as a form action bound to
// its two arguments; the FormData React appends is ignored.
export async function beginJoin(code: string, target: "signup" | "login"): Promise<void> {
  const normalised = normaliseCode(code);
  if (!isCodeShape(normalised)) redirect(landingPath(encodeURIComponent(normalised)));

  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("get_platform_invite_preview", {
    p_code: normalised,
  });
  if (rows?.[0]?.state !== "ok") redirect(landingPath(normalised));

  (await cookies()).set(INVITE_INTENT_COOKIE, normalised, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV !== "development",
    path: INTENT_COOKIE_PATH,
    maxAge: INTENT_COOKIE_MAX_AGE,
  });
  redirect(target === "login" ? loginHref(normalised) : signupHref(normalised));
}

// D11(b): the landing page's own tap, "Add {inviter} as a friend". The RPC
// writes both friendship rows (idempotently, D10) and returns the inviter,
// whose profile then shows "Remove friend" as the visible confirmation. A
// refusal comes back as `{ error }` for the button to show inline; the
// success redirects from inside the action, like `/j`'s joinByCode.
export async function acceptInvite(code: string): Promise<{ error: string }> {
  const normalised = normaliseCode(code);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(loginHref(normalised));

  const { data: inviterId, error } = await supabase.rpc("accept_platform_invite", {
    p_code: normalised,
  });
  if (error || !inviterId) return { error: friendlyAcceptError(error?.message ?? null) };

  revalidatePath("/community");
  revalidatePath(`/u/${inviterId}`);
  redirect(`/u/${inviterId}`);
}

// The RPC raises short lower-case reasons (spec D10, the plan-copy set); turn
// each into the landing page's own sentence, and anything else into a
// capitalised one — the `/j` friendlyJoinError shape.
function friendlyAcceptError(raw: string | null): string {
  if (!raw) return ACCEPT_FALLBACK;
  if (raw.includes("no invite has that code")) return stateCopy("unknown", null).lines[0];
  if (raw.includes("that is your own invite link")) return OWN_LINK_LINES[0];
  if (raw.includes("that invite link has expired")) return stateCopy("expired", null).lines[0];
  if (raw.includes("that invite link has been used up")) {
    return stateCopy("exhausted", null).lines[0];
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1) + (raw.endsWith(".") ? "" : ".");
}
