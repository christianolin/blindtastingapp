import { NextResponse } from "next/server";
import { query } from "@/lib/auth/db";
import { consumeToken } from "@/lib/auth/tokens";

// Redeeming the emailed link proves control of the mailbox. The token is
// single-use and expires after 24h; consumeToken enforces both, so this handler
// only has to record the outcome.
//
// It never signs anyone in: the user is already signed in from signup, and a
// verification link that also granted a session would be a session-fixation
// vector if the mail were forwarded.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.redirect(`${origin}/taste?verify=invalid`);

  const claim = await consumeToken("EMAIL_VERIFY", token);
  if (!claim?.userId) {
    return NextResponse.redirect(`${origin}/taste?verify=expired`);
  }

  await query(
    `update auth_credentials
        set email_verified_at = coalesce(email_verified_at, now()),
            updated_at = now()
      where user_id = $1`,
    [claim.userId],
  );
  return NextResponse.redirect(`${origin}/taste?verify=ok`);
}
