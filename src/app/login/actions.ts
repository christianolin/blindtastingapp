"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authPool } from "@/lib/auth/db";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  createSession,
} from "@/lib/auth/session";

export type AuthFormState = { error: string } | null;

// One message for every failure mode. Distinguishing "no such account" from
// "wrong password" would let anyone enumerate who has registered.
const GENERIC = "Incorrect email or password.";

// A real argon2id digest of a random value nobody holds. When the address does
// not exist we verify against this instead of returning early, so a miss costs
// the same time as a hit and the response cannot be used to probe for accounts.
// It must be a genuine digest: a malformed one fails to parse almost instantly
// and would reintroduce the timing signal it exists to remove.
const TIMING_EQUALISER =
  "$argon2id$v=19$m=19456,t=2,p=1$BLFzv5v9lMlgvlO4ukBkWg$23Dn4In+vEmdPjoJR9Gkx3KHG4/kgTLuWgOh8IiQuw8";

export async function signIn(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: GENERIC };

  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  // Two limits: per-account (stops one account being ground down) and per-IP
  // (stops one attacker spraying many accounts).
  const okAccount = await checkRateLimit(`login:${email.toLowerCase()}`, 10, 900);
  const okIp = ip ? await checkRateLimit(`login-ip:${ip}`, 30, 900) : true;
  if (!okAccount || !okIp) {
    return { error: "Too many attempts. Please try again in a few minutes." };
  }

  const { rows } = await authPool().query(
    `select user_id, password_hash from auth_credentials
      where lower(email) = lower($1)`,
    [email],
  );

  const stored = rows[0]?.password_hash ?? TIMING_EQUALISER;
  const ok = await verifyPassword(password, stored);
  if (rows.length === 0 || !ok) return { error: GENERIC };

  const userId = rows[0].user_id as string;

  // Migrated Supabase users carry bcrypt $2a$10$. Upgrade them to argon2id now
  // that we hold the plaintext — silently, once, on their next login.
  if (needsRehash(stored)) {
    const upgraded = await hashPassword(password);
    await authPool().query(
      `update auth_credentials
          set password_hash = $2, updated_at = now()
        where user_id = $1`,
      [userId, upgraded],
    );
  }

  const token = await createSession(userId, {
    userAgent: headerList.get("user-agent") ?? undefined,
    ip: ip || undefined,
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  redirect("/taste");
}
