import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { getNextAuthSecret } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = getNextAuthSecret();

  // Only protect /admin routes (except login)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = await getToken({ req: request, secret });

    if (!token) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Protect admin API routes
  if (
    pathname.startsWith("/api/services") && request.method !== "GET" ||
    pathname.startsWith("/api/schedule") && request.method !== "GET" ||
    pathname.startsWith("/api/bookings") && (request.method === "PATCH" || request.method === "DELETE")
  ) {
    const token = await getToken({ req: request, secret });

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/services/:path*", "/api/schedule/:path*", "/api/bookings/:path*"],
};
