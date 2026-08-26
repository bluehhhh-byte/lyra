// admin 인증 쿠키 토큰 — 쿠키에 비밀번호 원문 대신 서명된 만료 토큰을 담는다.
// 쿠키가 새어도 비밀번호는 안 새고, 30일 뒤 저절로 죽는다.
// 형식: "<만료 epoch ms>.<HMAC-SHA256(ADMIN_PASSWORD, "lyra:"+만료)>"
// Web Crypto만 사용 — 로그인 라우트(Node)와 middleware(Edge) 양쪽에서 돈다.

const enc = new TextEncoder();

export const ADMIN_SESSION_EXPIRED_CODE = "ADMIN_SESSION_EXPIRED";
export const ADMIN_SESSION_EXPIRED_MESSAGE = "로그인 세션이 만료되었습니다. 다시 로그인한 뒤 작업을 계속해 주세요.";

export function safeAdminNext(nextPath = "/admin") {
  const value = String(nextPath || "/admin");
  return value === "/admin" || value.startsWith("/admin/") ? value : "/admin";
}

export function adminLoginUrl(nextPath = "/admin") {
  return `/admin/login?next=${encodeURIComponent(safeAdminNext(nextPath))}`;
}

export function adminSessionExpiry(status, payload = {}, nextPath = "/admin") {
  if (status !== 401 && payload?.code !== ADMIN_SESSION_EXPIRED_CODE) return null;
  return {
    message: payload?.error || ADMIN_SESSION_EXPIRED_MESSAGE,
    loginUrl: adminLoginUrl(nextPath),
  };
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeToken(secret, days = 30) {
  const exp = Date.now() + days * 86400_000;
  return `${exp}.${await hmac(secret, `lyra:${exp}`)}`;
}

export async function verifyToken(secret, token) {
  const [exp, sig] = String(token || "").split(".");
  if (!secret || !exp || !sig || +exp < Date.now()) return false;
  const expected = await hmac(secret, `lyra:${exp}`);
  // constant-time 비교 — === 는 첫 불일치 바이트에서 끊겨 타이밍이 샌다
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
