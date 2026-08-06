import "server-only";
import { query } from "./db.ts";
import { randomToken, sha256 } from "./session.ts";

export type TokenPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET" | "INVITE";

// Returns the PLAINTEXT token for the email link. Only its sha256 is persisted,
// so a database leak yields no usable verification or reset links — the same
// discipline as session tokens, reusing their primitives so there is one
// definition of how a token is made and hashed.
export async function issueToken({
  purpose,
  userId,
  email,
  ttlMinutes,
  payload = {},
}: {
  purpose: TokenPurpose;
  userId?: string;
  email?: string;
  ttlMinutes: number;
  payload?: Record<string, unknown>;
}): Promise<string> {
  const token = randomToken();
  await query(
    `insert into auth_tokens (user_id, email, purpose, token_hash, payload, expires_at)
     values ($1, $2, $3, $4, $5::jsonb, now() + ($6 || ' minutes')::interval)`,
    [
      userId ?? null,
      email ?? null,
      purpose,
      sha256(token),
      JSON.stringify(payload),
      String(ttlMinutes),
    ],
  );
  return token;
}

// Single-use by construction: `consumed_at is null` lives in the WHERE clause of
// the UPDATE itself, so two concurrent redemptions cannot both match — the
// second updates zero rows. Checking-then-updating would race.
export async function consumeToken(
  purpose: TokenPurpose,
  token: string,
): Promise<{
  userId: string | null;
  email: string | null;
  payload: Record<string, unknown>;
} | null> {
  const rows = await query<{
    user_id: string | null;
    email: string | null;
    payload: Record<string, unknown>;
  }>(
    `update auth_tokens set consumed_at = now()
      where purpose = $1 and token_hash = $2
        and consumed_at is null and expires_at > now()
      returning user_id, email, payload`,
    [purpose, sha256(token)],
  );
  if (rows.length === 0) return null;
  return {
    userId: rows[0].user_id,
    email: rows[0].email,
    payload: rows[0].payload,
  };
}
