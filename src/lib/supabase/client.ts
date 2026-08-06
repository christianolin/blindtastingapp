import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";

// The browser no longer holds a Supabase session — identity lives in an
// httpOnly cookie the page cannot read. So the client asks the server for a
// short-lived token instead, which PostgREST accepts and RLS scopes exactly as
// before.
//
// Cached across calls and refreshed a little before expiry, so a page doing
// several queries makes one token request, not one per query.
type Minted = { token: string; expiresAt: number; userId: string };
let cached: Minted | null = null;
let inFlight: Promise<Minted | null> | null = null;

const FRESH_MARGIN_MS = 30_000;

async function mint(): Promise<Minted | null> {
  const res = await fetch("/api/auth/token", { cache: "no-store" });
  if (!res.ok) return null;
  const { token, expiresIn, userId } = await res.json();
  return { token, userId, expiresAt: Date.now() + expiresIn * 1000 };
}

async function currentToken(): Promise<Minted | null> {
  if (cached && cached.expiresAt > Date.now() + FRESH_MARGIN_MS) return cached;
  // Collapse concurrent callers onto one request — several components mounting
  // at once would otherwise each mint their own token.
  inFlight ??= mint().finally(() => {
    inFlight = null;
  });
  cached = await inFlight;
  return cached;
}

/** The signed-in user's id, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  return (await currentToken())?.userId ?? null;
}

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Verified against supabase-js 2.110.2 with a compiler probe rather than
    // assumed: this option exists and typechecks.
    { accessToken: async () => (await currentToken())?.token ?? "" },
  );
}
