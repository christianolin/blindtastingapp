import "server-only";
import { createHash, randomBytes } from "node:crypto";
// Extension-ful on purpose: scripts/auth-session.test.mjs loads this module
// under `node --experimental-strip-types`, and Node's ESM resolver does not
// guess extensions the way a bundler does.
import { authPool } from "./db.ts";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_DAYS = 30;
// Bump last_seen_at at most this often, so reading a session does not turn
// into a write on every single request.
const SLIDE_AFTER = "1 hour";

// Only the hash is stored. A database leak therefore yields no live sessions.
// Exported because auth_tokens (Task 7) needs exactly the same primitives:
// one source of truth for how a token is generated and hashed.
export const randomToken = () => randomBytes(32).toString("base64url");
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export async function createSession(
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<string> {
  const token = randomToken();
  await authPool().query(
    `insert into auth_sessions (user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)`,
    [
      userId,
      sha256(token),
      String(SESSION_TTL_DAYS),
      meta.userAgent ?? null,
      meta.ip ?? null,
    ],
  );
  return token;
}

export async function resolveSession(
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  const hashed = sha256(token);
  const { rows } = await authPool().query(
    `select id, user_id from auth_sessions
      where token_hash = $1 and revoked_at is null and expires_at > now()`,
    [hashed],
  );
  if (rows.length === 0) return null;

  // Sliding expiry, throttled. Fire-and-forget: a failed slide must never fail
  // the request the user is actually making. The liveness predicates are
  // repeated here because a session can be revoked between the two queries,
  // and a slide must never bring a dead one back.
  authPool()
    .query(
      `update auth_sessions
          set last_seen_at = now(),
              expires_at = now() + ($2 || ' days')::interval
        where token_hash = $1
          and revoked_at is null
          and expires_at > now()
          and last_seen_at < now() - $3::interval`,
      [hashed, String(SESSION_TTL_DAYS), SLIDE_AFTER],
    )
    .catch(() => {});

  return { userId: rows[0].user_id as string, sessionId: rows[0].id as string };
}

export async function revokeSession(token: string): Promise<void> {
  await authPool().query(
    `update auth_sessions set revoked_at = now()
      where token_hash = $1 and revoked_at is null`,
    [sha256(token)],
  );
}

// Used after a password change: every other device is signed out.
export async function revokeAllSessions(userId: string): Promise<void> {
  await authPool().query(
    `update auth_sessions set revoked_at = now()
      where user_id = $1 and revoked_at is null`,
    [userId],
  );
}
