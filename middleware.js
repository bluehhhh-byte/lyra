import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_EXPIRED_CODE,
  ADMIN_SESSION_EXPIRED_MESSAGE,
  verifyToken,
} from "./lib/auth-token";

// Password-gate the admin UI and its API online. Local dev is always open.
// 쿠키는 HMAC 서명 토큰(lib/auth-token.js) — 비밀번호 원문을 담지 않는다.
export async function middleware(req) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();

  const pass = process.env.ADMIN_PASSWORD;
  const authed = pass && (await verifyToken(pass, req.cookies.get("lyra_auth")?.value));
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({
      error: ADMIN_SESSION_EXPIRED_MESSAGE,
      code: ADMIN_SESSION_EXPIRED_CODE,
      loginUrl: "/admin/login",
    }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"],
};
