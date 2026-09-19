import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authRedirect } from "@/lib/safe-next";
import { confirmFailedUrl, parseConfirmParams } from "@/lib/auth/confirm-params";

// Token-hash email links (the custom Reset Password template,
// docs/email/supabase-reset-password-template.md) land here:
//   /auth/confirm?token_hash=…&type=recovery&next=/auth/set-password?reason=reset
// verifyOtp works on any device, unlike /auth/callback's PKCE `?code=`, which
// only the browser that asked can exchange. The session cookies it sets ride
// on the redirect below, the same way /auth/callback's do.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const params = parseConfirmParams(searchParams);

  if (params) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type: params.type,
      token_hash: params.tokenHash,
    });
    if (!error) {
      // `next` is attacker-controllable and the session now exists, so it
      // goes through authRedirect (safeNext) — parseConfirmParams has
      // already checked it with sameSiteNext, which also refuses the
      // control characters a URL parser strips.
      return NextResponse.redirect(authRedirect(origin, params.next));
    }
  }

  return NextResponse.redirect(confirmFailedUrl(origin));
}
