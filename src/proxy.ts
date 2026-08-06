import { NextResponse, type NextRequest } from "next/server";

// Optimistic only: does a session cookie exist? No database call, no crypto —
// this runs on the Edge runtime for nearly every request, so it has to stay
// this cheap. It previously round-tripped to GoTrue on every page load.
//
// This is NOT a security boundary. Anyone can present a bogus cookie and get
// past it; they then hit getOptionalUser()/requireUser() in the DAL, which does
// the real check. See docs/superpowers/specs/2026-08-06-own-authentication-design.md.
//
// The cookie name is written out rather than imported from lib/auth/session.ts
// on purpose: that module pulls in node:crypto and pg, neither of which exists
// on the Edge runtime. Keep them in sync by hand — auth-dal.test.mjs pins the
// constant, and there is only the one literal here.
const PUBLIC_PREFIXES = ["/login", "/signup", "/auth", "/rules"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.get("session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
