import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/dal";
import { mintSupabaseToken } from "@/lib/auth/jwt";

// Phase 1 bridge. A handful of browser components still query Supabase
// directly, where RLS is their only guard — so they need a token PostgREST
// accepts. Deliberately short-lived, and retired in Phase 2 when those calls
// move server-side.
//
// The session cookie stays httpOnly: this hands out a derived, expiring
// credential, never the session token itself.
const TTL_SECONDS = 600;

export async function GET() {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      token: await mintSupabaseToken(user.id, TTL_SECONDS),
      expiresIn: TTL_SECONDS,
      // Saves the browser a second round-trip: every consumer that needs a
      // token also needs to know who it belongs to.
      userId: user.id,
    },
    // Never cache a credential — not in the browser, not at the CDN.
    { headers: { "Cache-Control": "no-store, private" } },
  );
}
