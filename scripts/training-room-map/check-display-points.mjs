// The pre-deploy check for R2 (training-room-map spec §4.3, §4.5): reads the
// curated display points THROUGH POSTGREST as a signed-in demo person, with
// the room's own select, so a schema cache that has not reloaded shows up here
// and not on production. Main session only, after the R2 apply and before the
// app deploy. Signs in with a magic link + verifyOtp (CLAUDE.md's demo-session
// recipe), never a password. Writes nothing.
//
//   node --env-file=.env.local scripts/training-room-map/check-display-points.mjs [demo.name@blindr.invalid]
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const email = process.argv[2] ?? "demo.isabelle@blindr.invalid";
if (!/^demo\.[a-z]+@blindr\.invalid$/.test(email)) throw new Error("demo accounts only");

const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkErr) throw linkErr;
const reader = createClient(url, anonKey, opts);
const { error: otpErr } = await reader.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (otpErr) throw otpErr;

// The room's own read (src/lib/training/pool.ts, readDisplayPoints).
const t0 = Date.now();
const { data: points, error: readErr } = await reader
  .from("wine_archetypes")
  .select("id, display_lon, display_lat")
  .not("display_lon", "is", null);
const ms = Date.now() - t0;
if (readErr) throw new Error(`the display-point read through PostgREST failed: ${readErr.message}`);

const { data: all, error: allErr } = await admin.from("wine_archetypes").select("id, name, wine_place_id, display_lon");
if (allErr) throw allErr;
const byId = new Map(all.map((a) => [a.id, a]));
const got = {
  withPoint: points.length,
  placedWithPoint: points.filter((p) => byId.get(p.id)?.wine_place_id).length,
  halfSet: points.filter((p) => p.display_lat === null).length,
  wachauShared:
    new Set(
      points
        .filter((p) => /Wachau/.test(byId.get(p.id)?.name ?? ""))
        .map((p) => `${p.display_lon},${p.display_lat}`),
    ).size === 1,
};
console.log(JSON.stringify({ ...got, archetypes: all.length, ms }));
// 18 before the USA wave places Napa, Sonoma and Willamette; 15 after.
assert.ok([15, 18].includes(got.withPoint), `withPoint = ${got.withPoint}`);
assert.deepEqual({ placedWithPoint: got.placedWithPoint, halfSet: got.halfSet, wachauShared: got.wachauShared }, {
  placedWithPoint: 0,
  halfSet: 0,
  wachauShared: true,
});
console.log("OK: PostgREST serves the curated display points to a signed-in reader");
