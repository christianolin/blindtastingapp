import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authRedirect } from "@/lib/safe-next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `next` is attacker-controllable and this runs with the session already
      // set, so it goes through safeNext (safe-next.test.ts covers the shapes).
      return NextResponse.redirect(authRedirect(origin, searchParams.get("next")));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
