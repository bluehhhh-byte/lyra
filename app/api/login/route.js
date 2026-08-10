import { cookies } from "next/headers";
import { makeToken } from "../../../lib/auth-token";

export async function POST(req) {
  const { password } = await req.json();
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass || password !== pass) {
    return Response.json({ error: "비밀번호가 틀렸습니다" }, { status: 401 });
  }
  // 쿠키에는 비밀번호 대신 서명된 만료 토큰 — 쿠키가 새어도 비밀번호는 안 샌다
  const jar = await cookies();
  jar.set("lyra_auth", await makeToken(pass), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // UI-only hint: the real cookie is httpOnly, so a public (static) song page has
  // no way to ask "is the owner reading this?" — this one is readable by JS and
  // just reveals the note-edit affordance. Forging it grants nothing; the API is
  // still gated by the httpOnly cookie in middleware.
  jar.set("lyra_admin", "1", { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true });
}
