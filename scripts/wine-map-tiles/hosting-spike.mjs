// Supabase Storage hosting acceptance test for PMTiles-style access:
// HTTP range requests, CORS toward the app origin, and cache-header
// round-trip on the public bucket. Re-runnable; cleans up after itself.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY is required");
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://eqzwmkpeysqiihuojmuj.supabase.co";
const BUCKET = "wine-map-tiles";
const APP_ORIGIN = "https://blindrapp.vercel.app";

// 1 MiB deterministic pseudo-random buffer (sha256 chain, seed "blindr-spike").
function fixtureBuffer() {
  const chunks = [];
  let block = createHash("sha256").update("blindr-spike").digest();
  for (let i = 0; i < 32768; i += 1) {
    chunks.push(block);
    block = createHash("sha256").update(block).digest();
  }
  return Buffer.concat(chunks); // 32768 * 32 bytes = 1 MiB
}

const storage = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage.from(BUCKET);

const objectPath = `tiles/spike/${Date.now()}.bin`;
const fixture = fixtureBuffer();
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

const upload = await storage.upload(objectPath, fixture, {
  contentType: "application/octet-stream",
  cacheControl: "31536000",
  upsert: false,
});
assert.equal(upload.error, null, `upload failed: ${upload.error?.message}`);

try {
  const full = await fetch(publicUrl);
  const fullBody = Buffer.from(await full.arrayBuffer());
  record(
    "full GET",
    full.status === 200 && fullBody.equals(fixture),
    `status ${full.status}, ${fullBody.byteLength} bytes`,
  );
  const cacheControl = full.headers.get("cache-control") ?? "";
  record(
    "cache-control round-trip",
    cacheControl.includes("max-age=31536000"),
    cacheControl || "(missing)",
  );

  const ranged = await fetch(publicUrl, {
    headers: { Range: "bytes=100000-100999", Origin: APP_ORIGIN },
  });
  const rangedBody = Buffer.from(await ranged.arrayBuffer());
  record(
    "range request 206",
    ranged.status === 206 &&
      rangedBody.byteLength === 1000 &&
      rangedBody.equals(fixture.subarray(100000, 101000)),
    `status ${ranged.status}, ${rangedBody.byteLength} bytes, content-range ${ranged.headers.get("content-range")}`,
  );
  const acao = ranged.headers.get("access-control-allow-origin");
  record("CORS allow-origin", acao === "*" || acao === APP_ORIGIN, acao ?? "(missing)");

  const tail = await fetch(publicUrl, {
    headers: { Range: `bytes=${fixture.length - 16384}-${fixture.length - 1}` },
  });
  const tailBody = Buffer.from(await tail.arrayBuffer());
  record(
    "tail range (pmtiles directory reads)",
    tail.status === 206 && tailBody.equals(fixture.subarray(fixture.length - 16384)),
    `status ${tail.status}, ${tailBody.byteLength} bytes`,
  );
} finally {
  const removal = await storage.remove([objectPath]);
  if (removal.error) console.error(`cleanup failed: ${removal.error.message}`);
}

const failed = results.filter(({ pass }) => !pass);
if (failed.length > 0) {
  console.error(`Hosting spike FAILED ${failed.length}/${results.length} checks.`);
  process.exit(1);
}
console.log(`Hosting spike passed all ${results.length} checks.`);
