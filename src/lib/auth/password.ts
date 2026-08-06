import "server-only";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// The 25 users migrated from Supabase carry bcrypt $2a$10$ hashes. Cost 10 is
// below current guidance, so we accept them on login and transparently upgrade
// to argon2id — nobody has to reset a password, and the weak hashes drain away
// as people return.
const BCRYPT = /^\$2[aby]\$/;

export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain);
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  if (BCRYPT.test(hashed)) return bcrypt.compare(plain, hashed);
  try {
    return await argonVerify(hashed, plain);
  } catch {
    // A corrupt or truncated hash must fail closed, not throw.
    return false;
  }
}

export function needsRehash(hashed: string): boolean {
  return BCRYPT.test(hashed);
}
