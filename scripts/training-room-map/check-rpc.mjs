// The pre-deploy check for R1a (training-room-map spec §4.5, acceptance
// R1-9): calls training_archetype_places THROUGH POSTGREST as a signed-in demo
// person, so a schema cache that has not reloaded shows up here and not on
// production, and checks anon is refused. Main session only, after the R1a
// apply and before the app deploy. Signs in with a magic link + verifyOtp
// (CLAUDE.md's demo-session recipe), never a password. Writes nothing.
//
//   node --env-file=.env.local scripts/training-room-map/check-rpc.mjs [demo.name@blindr.invalid]
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

const { data: archetypes, error: archErr } = await admin.from("wine_archetypes").select("id, wine_place_id");
if (archErr) throw archErr;
const placed = archetypes.filter((a) => a.wine_place_id).length;

const t0 = Date.now();
const { data: rows, error: rpcErr } = await reader.rpc("training_archetype_places");
const ms = Date.now() - t0;
if (rpcErr) throw new Error(`the RPC through PostgREST failed: ${rpcErr.message}`);
const count = (keep) => rows.filter(keep).length;
const got = {
  rows: rows.length,
  withKey: count((r) => r.place_key !== null),
  withRegion: count((r) => r.region_key !== null),
  withPoint: count((r) => r.point_lon !== null && r.point_lat !== null),
  ancestorPoints: count((r) => r.point_key !== null && r.point_key !== r.place_key),
};
console.log(JSON.stringify({ ...got, archetypes: archetypes.length, placed, ms }));
assert.deepEqual(got, { rows: archetypes.length, withKey: placed, withRegion: placed, withPoint: placed, ancestorPoints: 1 });

const { error: anonErr } = await createClient(url, anonKey, opts).rpc("training_archetype_places");
assert.ok(anonErr, "anon must be refused");
console.log("OK: PostgREST serves training_archetype_places to a signed-in reader and refuses anon");
