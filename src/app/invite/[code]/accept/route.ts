import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  INVITE_INTENT_COOKIE,
  isCodeShape,
  landingPath,
  loginHref,
  normaliseCode,
} from "@/lib/invites/links";

// /invite/[code]/accept — the first-sign-in landing (spec §3; D11a, D12, D13;
// plan refinements 3–4). Reached as the `next` of a fresh signup (through
// /auth/callback), of a sign-in (/login) and of the emailed invite (through
// /auth/confirm-hash) — each `next` built by `acceptPath` in links.ts. A route
// handler, not a page: it has to read and delete a cookie and then redirect.
//
// D12 — no friendship without this browser's intent. A friendship in either
// direction opens a FRIENDS-visibility cellar, so a crafted accept link
// opened by a signed-in person must not add a friend on its own. The RPC
// runs only when the `blindr-invite-intent` cookie — set by `beginJoin`
// after the person's own tap on the landing page — carries this very code;
// otherwise the visitor is sent to `/invite/<code>` for the explicit tap of
// D11(b). The cookie is deleted on every evaluated outcome (a mismatch, a
// refusal, a success). The signed-out branch never looks at it and leaves it
// in place: the cookie exists to outlive the sign-in it redirects into.
//
// Every redirect is a `links.ts` path resolved against the request's own
// origin (`new URL(path, request.url)`): nothing in the request's query or
// the code segment can pick another host.

// Must match the `path` `beginJoin` sets the cookie with, or the browser
// keeps it (src/app/invite/actions.ts).
const INTENT_COOKIE_PATH = "/invite";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code: raw } = await params;
  const code = normaliseCode(raw);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL(loginHref(code), request.url));
  }

  const redirectAndClear = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete({ name: INVITE_INTENT_COOKIE, path: INTENT_COOKIE_PATH });
    return response;
  };
  // A code outside the shape can never match a cookie `beginJoin` wrote; it
  // is percent-encoded so the landing page sees it as one opaque segment.
  const landing = landingPath(isCodeShape(code) ? code : encodeURIComponent(code));

  const intent = request.cookies.get(INVITE_INTENT_COOKIE)?.value;
  if (intent !== code) return redirectAndClear(landing);

  const { data: inviterId, error } = await supabase.rpc("accept_platform_invite", {
    p_code: code,
  });
  // A refusal (expired, used up, own link, unknown): the landing page shows
  // the matching state copy.
  if (error || !inviterId) return redirectAndClear(landing);

  revalidatePath("/community");
  revalidatePath(`/u/${inviterId}`);
  return redirectAndClear("/overview");
}
