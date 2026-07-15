import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Route protection is a UX courtesy here, not the security boundary — RLS
 * and the RPC permission checks in the database are what actually enforce
 * access. This just keeps the session cookie fresh and redirects a signed-
 * out visitor to /login before they see a flash of protected UI.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const isAccessDeniedRoute = request.nextUrl.pathname.startsWith("/access-denied");

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Item 1 fix: an authenticated user with no profile (or an inactive one)
  // gets redirected here by app/(app)/layout.tsx — this route must ALWAYS
  // be reachable for them, or they'd bounce straight back into the
  // authenticated layout, which redirects to /access-denied again, which
  // this proxy would otherwise treat as just another authenticated page
  // and let through anyway... except the OLD logic also had no case at all
  // for "authenticated + not on /login" other than falling through, so the
  // actual loop was: layout -> /login?error=no-profile -> proxy sees
  // authenticated user on an /login-prefixed path -> redirects to
  // /dashboard -> layout -> back to /login?error=no-profile. Fixed by (a)
  // using a dedicated /access-denied route the layout now targets instead
  // of /login, and (b) explicitly exempting it from the auth-route
  // redirect-to-dashboard rule below.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAccessDeniedRoute) {
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization files,
     * so the session gets refreshed on every real navigation.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
