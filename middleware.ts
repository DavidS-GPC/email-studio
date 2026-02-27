import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

function isPublicAssetPath(pathname: string) {
  if (pathname.startsWith("/_next/")) {
    return true;
  }

  return pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml";
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicAssetPath(pathname)) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api/");
  const isAuthRoute = pathname === "/signin" || pathname.startsWith("/api/auth/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAuthRoute) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const hasAppIdentity =
    typeof token?.authSource === "string" &&
    typeof token?.appRole === "string" &&
    typeof token?.username === "string";

  if (token?.accessDenied) {
    if (isApiRoute) {
      return NextResponse.json({ error: "No matching user account found" }, { status: 403 });
    }

    const deniedUrl = new URL("/signin", request.url);
    deniedUrl.searchParams.set("error", "no_matching_user_account_found");
    deniedUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(deniedUrl);
  }

  if (token && hasAppIdentity) {
    if (isAdminRoute && token.appRole !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (isApiRoute) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/:path*"],
};
