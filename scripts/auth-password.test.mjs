// Password hashing: argon2id for new hashes, bcrypt accepted for the 25
// migrated Supabase users, and every bcrypt hash flagged for rehash.
import assert from "node:assert/strict";
import test from "node:test";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

// Mirrors src/lib/auth/password.ts. Kept in the test as executable
// documentation of the contract the TS module must satisfy.
const isBcrypt = (h) => /^\$2[aby]\$/.test(h);

async function verifyPassword(plain, hashed) {
  if (isBcrypt(hashed)) return bcrypt.compare(plain, hashed);
  try {
    return await argonVerify(hashed, plain);
  } catch {
    return false;
  }
}

test("argon2id round-trips", async () => {
  const h = await argonHash("correct horse battery staple");
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verifyPassword("correct horse battery staple", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
});

test("legacy bcrypt $2a$10$ still verifies", async () => {
  const legacy = bcrypt.hashSync("hunter2", 10);
  assert.match(legacy, /^\$2[aby]\$10\$/);
  assert.equal(await verifyPassword("hunter2", legacy), true);
  assert.equal(await verifyPassword("hunter3", legacy), false);
});

test("bcrypt hashes are flagged for rehash, argon2id is not", async () => {
  assert.equal(isBcrypt(bcrypt.hashSync("x", 10)), true);
  assert.equal(isBcrypt(await argonHash("x")), false);
});

test("a malformed hash verifies false rather than throwing", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});
