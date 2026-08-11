import { cookies } from "next/headers";
import { makeToken } from "../../../lib/auth-token";

// 무차별 대입 방어 — 인스턴스 메모리의 IP별 실패 카운터. 서버리스라 인스턴스가
// 갈리면 리셋되지만, 개인 사이트 기준 자동화 대입을 충분히 늦춘다.
// ponytail: 인스턴스 간 공유가 필요해지면 Upstash 같은 외부 KV로.
const attempts = new Map(); // ip -> { n, until }
const MAX_TRIES = 5;
const LOCK_MS = 10 * 60_000;

export async function POST(req) {
  const ip = (req.headers.get("x-forwarded-for") || "?").split(",")[0].trim();
  const rec = attempts.get(ip);
  if (rec?.until > Date.now()) {
    return Response.json(
      { error: `시도 횟수 초과 — ${Math.ceil((rec.until - Date.now()) / 60000)}분 후에 다시` },
      { status: 429 }
    );
  }

  const { password } = await req.json();
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || password !== pass) {
    const n = (rec?.n || 0) + 1;
    attempts.set(ip, { n, until: n >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
    // 고정 지연 — 타이밍으로 아무것도 못 읽게 하고 자동 대입 속도를 깎는다
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "비밀번호가 틀렸습니다" }, { status: 401 });
  }
  attempts.delete(ip);

  // 쿠키에는 비밀번호 대신 서명된 만료 토큰 — 쿠키가 새어도 비밀번호는 안 샌다
  const secure = process.env.NODE_ENV === "production";
  const jar = await cookies();
  jar.set("lyra_auth", await makeToken(pass), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // UI-only hint: the real cookie is httpOnly, so a public (static) song page has
  // no way to ask "is the owner reading this?" — this one is readable by JS and
  // just reveals the note-edit affordance. Forging it grants nothing; the API is
  // still gated by the httpOnly cookie in middleware.
  jar.set("lyra_admin", "1", { sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true });
}
