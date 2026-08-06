// Password hashing: argon2id for new hashes, bcrypt accepted for the 25
// migrated Supabase users, and every bcrypt hash flagged for rehash.
//
// Run with:
//   node --experimental-strip-types --conditions=react-server --test scripts/auth-password.test.mjs
//
// The extra flags exist because this file imports the real TypeScript module:
// --experimental-strip-types lets Node load password.ts directly, and
// --conditions=react-server resolves its "server-only" import to a usable stub.
// Node prints an ExperimentalWarning about type stripping on stderr; expected.
import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import {
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../src/lib/auth/password.ts";

// Shape checks use assert.ok rather than assert.match so a failure reports the
// message instead of dumping a password hash into the test log.

test("argon2id round-trips", async () => {
  const h = await hashPassword("correct horse battery staple");
  assert.ok(/^\$argon2id\$/.test(h), "hashPassword must produce argon2id");
  assert.equal(await verifyPassword("correct horse battery staple", h), true);
  assert.equal(await verifyPassword("wrong", h), false);
});

test("legacy bcrypt $2a$10$ still verifies", async () => {
  const legacy = bcrypt.hashSync("hunter2", 10);
  assert.ok(/^\$2[aby]\$10\$/.test(legacy), "fixture must be cost-10 bcrypt");
  assert.equal(await verifyPassword("hunter2", legacy), true);
  assert.equal(await verifyPassword("hunter3", legacy), false);
});

test("bcrypt hashes are flagged for rehash, argon2id is not", async () => {
  assert.equal(needsRehash(bcrypt.hashSync("x", 10)), true);
  assert.equal(needsRehash(await hashPassword("x")), false);
});

test("a malformed hash verifies false rather than throwing", async () => {
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});
