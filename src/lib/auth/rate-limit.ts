import "server-only";
// Extension-ful: scripts/auth-rate-limit.test.mjs loads this module under
// `node --experimental-strip-types`, and Node's ESM resolver does not guess
// extensions the way a bundler does.
import { authPool } from "./db.ts";

// Postgres-backed fixed window. Adequate at this scale and it adds no external
// service; revisit if traffic grows. Returns true when the caller is still
// under the limit.
//
// The whole decision is one statement so it is atomic: read-then-write would
// let two concurrent requests both observe count = limit - 1 and both proceed.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { rows } = await authPool().query(
    `insert into auth_rate_limits (key, count, window_start)
     values ($1, 1, now())
     on conflict (key) do update
       set count = case
             when auth_rate_limits.window_start < now() - ($2 || ' seconds')::interval
             then 1
             else auth_rate_limits.count + 1
           end,
           window_start = case
             when auth_rate_limits.window_start < now() - ($2 || ' seconds')::interval
             then now()
             else auth_rate_limits.window_start
           end
     returning count`,
    [key, String(windowSeconds)],
  );
  return Number(rows[0].count) <= limit;
}
