import "server-only";
import { SignJWT } from "jose";

// The project uses legacy HS256 symmetric keys, so PostgREST, Storage and
// Realtime all validate against one shared secret. Signing our own token with
// `sub` and `role: authenticated` therefore keeps all 113 RLS policies working
// unchanged — auth.uid() simply reads `sub`. Proven by scripts/auth-jwt.test.mjs.
//
// Rotating this secret invalidates our tokens AND the anon key at the same
// time. Do not rotate casually.
//
// The secret is the raw UTF-8 string, NOT a base64 decode of it. Decoding first
// looks plausible and produces tokens that 401 against PostgREST; the encoding
// is pinned by a test in scripts/auth-dal.test.mjs.
function secret(): Uint8Array {
  const value = process.env.SUPABASE_JWT_SECRET;
  if (!value) throw new Error("SUPABASE_JWT_SECRET is required");
  return new TextEncoder().encode(value);
}

export async function mintSupabaseToken(
  userId: string,
  ttlSeconds = 600,
): Promise<string> {
  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuer("supabase")
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret());
}
