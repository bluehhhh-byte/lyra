import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_EXPIRED_CODE,
  ADMIN_SESSION_EXPIRED_MESSAGE,
  verifyToken,
} from "./lib/auth-token";
import { guardedPath, looksLikeBot } from "./lib/bot-guard";

// Password-gate the admin UI and its API online. Local dev is always open.
// 쿠키는 HMAC 서명 토큰(lib/auth-token.js) — 비밀번호 원문을 담지 않는다.
export async function middleware(req) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const { pathname } = req.nextUrl;

  // 인물 페이지는 관리자 게이트와 무관하다 — 봇만 걸러 내고 사람은 그대로 보낸다.
  // 여기서 막으면 Neon 읽기가 아예 일어나지 않는다(lib/bot-guard.js 참조).
  if (guardedPath(pathname)) {
    if (!looksLikeBot(req.headers.get("user-agent"))) return NextResponse.next();
    // 왜 403인지 헤더로 말한다. curl(UA가 `curl/`)도 봇으로 걸리는데, 상태 코드만
    // 보면 페이지가 고장난 것처럼 읽힌다 — 실제로 /people 캐시를 curl로 재다가
    // "ISR이 안 먹는다"고 잘못 짚었다. 진단하는 사람이 바로 알아야 한다.
    return new NextResponse("Disallowed by /robots.txt — set a browser User-Agent to view this page.\n", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Lyra-Guard": "bot-user-agent",
      },
    });
  }

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
  matcher: ["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*", "/people", "/people/:path*"],
};
