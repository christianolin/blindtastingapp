import "server-only";
import { Pool } from "pg";

// Auth reads the session on every request, so it talks to Postgres directly
// rather than through PostgREST — a TCP query instead of an HTTP hop. It is
// also the groundwork for Phase 3, when Supabase's API layer goes away.
//
// It has to be a direct connection in any case: service_role was revoked from
// the four auth tables, so a PostgREST call gets 42501 on every one of them.
//
// Cached on globalThis so Next's dev-mode module reloading does not open a new
// pool per edit and exhaust the connection limit.
const globalForPool = globalThis as unknown as { authPool?: Pool };

export function authPool(): Pool {
  if (!globalForPool.authPool) {
    globalForPool.authPool = new Pool({
      host: process.env.DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com",
      port: Number(process.env.DB_PORT ?? 6543),
      user: process.env.DB_USER ?? "postgres.eqzwmkpeysqiihuojmuj",
      database: process.env.DB_NAME ?? "postgres",
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPool.authPool;
}

// Every auth call site wants rows, never the full pg Result. Returning the
// array directly keeps ~55 call sites free of `.rows` noise.
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await authPool().query(sql, params);
  return rows as T[];
}
