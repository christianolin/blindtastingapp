import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { passwordStepRedirect } from "@/lib/auth/password-gate";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  // The no-store headers @supabase/ssr hands over whenever it writes auth
  // cookies, so no CDN caches one user's session for another.
  let cacheHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          cacheHeaders = headers ?? {};
          Object.entries(cacheHeaders).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Touching getUser() refreshes the session cookie if it's expired — do not
  // remove it. It asks the Auth server, not the cookie, so a `password_set`
  // flag written a moment ago by the set-password action is already seen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The password step (src/lib/auth/password-gate.ts): an account created
  // by an email invite has no password until it picks one, so every page it
  // opens goes to the set-password page first, with this request as `next`.
  const target = passwordStepRedirect(user, {
    method: request.method,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
  });
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target.pathname;
    url.search = target.search;
    const redirect = NextResponse.redirect(url);
    // A refreshed session must survive the redirect, or the browser keeps
    // the old tokens and the next request signs the user out.
    supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value));
    return redirect;
  }

  return supabaseResponse;
}
