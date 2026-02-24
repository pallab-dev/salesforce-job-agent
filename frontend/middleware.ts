import { NextRequest, NextResponse } from "next/server";

const LANDING_COOKIE = "job_agent_landing_seen";

function isProtectedPath(pathname: string): boolean {
  return (
    pathname === "/auth" ||
    pathname === "/dashboard" ||
    pathname === "/onboarding" ||
    pathname === "/admin"
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/") {
    const response = NextResponse.next();
    response.cookies.set(LANDING_COOKIE, "1", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30
    });
    return response;
  }

  if (isProtectedPath(pathname)) {
    const hasSeenLanding = request.cookies.get(LANDING_COOKIE)?.value === "1";
    if (!hasSeenLanding) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/auth", "/dashboard", "/onboarding", "/admin"]
};
