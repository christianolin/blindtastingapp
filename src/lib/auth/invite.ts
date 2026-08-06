import "server-only";
import { randomUUID } from "node:crypto";
import { query } from "./db.ts";
import { issueToken } from "./tokens.ts";
import { sendEmail } from "@/lib/email/client";
import { inviteTemplate } from "@/lib/email/templates";

// Replaces admin.auth.admin.inviteUserByEmail, which was called from two places
// with subtly different redirects. One implementation, so the two entry points
// cannot drift.
//
// Returns the participant's user id, or null if the invite could not be sent —
// callers skip that address and carry on with the rest.
export async function inviteToTasting({
  email,
  tastingId,
  tastingName,
  hostName,
}: {
  email: string;
  tastingId: string;
  tastingName: string;
  hostName: string;
}): Promise<string | null> {
  const address = email.trim();
  if (!address) return null;

  // Already known? Then this is just an invitation to an existing account —
  // no credential, no email, they will see it when they next sign in.
  const existing = await query<{ user_id: string }>(
    `select user_id from auth_credentials where lower(email) = lower($1)`,
    [address],
  );
  if (existing.length > 0) return existing[0].user_id;

  // A profile may exist without a credential (migrated data, or a prior invite
  // that predates this code). Reuse it rather than colliding on profiles.email.
  const orphanProfile = await query<{ id: string }>(
    `select id from profiles where lower(email) = lower($1)`,
    [address],
  );

  let userId: string;
  if (orphanProfile.length > 0) {
    userId = orphanProfile[0].id;
  } else {
    userId = randomUUID();
    await query(
      `insert into profiles (id, display_name, email) values ($1, $2, $3)`,
      [userId, address.split("@")[0], address],
    );
  }

  // '!' is not a valid argon2id or bcrypt hash, so verifyPassword can never
  // return true for it: the account is unreachable until the invite link sets a
  // real password. Cheaper and clearer than a nullable column.
  await query(
    `insert into auth_credentials (user_id, email, password_hash)
     values ($1, $2, '!')
     on conflict (user_id) do nothing`,
    [userId, address],
  );

  const token = await issueToken({
    purpose: "INVITE",
    userId,
    email: address,
    ttlMinutes: 60 * 24 * 7,
    payload: { tastingId },
  });
  const { subject, html } = inviteTemplate(
    `${process.env.NEXT_PUBLIC_SITE_URL}/auth/set-password?token=${token}`,
    hostName,
    tastingName,
  );
  await sendEmail({ to: address, subject, html });
  return userId;
}
