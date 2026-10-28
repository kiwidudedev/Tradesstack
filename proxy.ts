import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const AUTH_PAGES = new Set(["/login", "/register"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, projectSlugRedirect } = await updateSession(request);

  // The application root is an entry gate, not a marketing page. Redirecting
  // here keeps the public landing page and intermediate loading states out of
  // the customer application entirely.
  if (pathname === "/") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = user ? "/app/dashboard" : "/login";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  if (AUTH_PAGES.has(pathname) && user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app/dashboard";
    redirectUrl.searchParams.delete("next");
    return NextResponse.redirect(redirectUrl);
  }

  if (projectSlugRedirect) {
    const redirectUrl = request.nextUrl.clone();
    const segments = redirectUrl.pathname.split("/");
    segments[3] = encodeURIComponent(projectSlugRedirect);
    redirectUrl.pathname = segments.join("/");
    const redirectResponse = NextResponse.redirect(redirectUrl, 308);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/", "/login", "/register", "/app/:path*"],
};
