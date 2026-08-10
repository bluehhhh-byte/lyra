// admin 인증 쿠키 토큰 — 쿠키에 비밀번호 원문 대신 서명된 만료 토큰을 담는다.
// 쿠키가 새어도 비밀번호는 안 새고, 30일 뒤 저절로 죽는다.
// 형식: "<만료 epoch ms>.<HMAC-SHA256(ADMIN_PASSWORD, "lyra:"+만료)>"
// Web Crypto만 사용 — 로그인 라우트(Node)와 middleware(Edge) 양쪽에서 돈다.

const enc = new TextEncoder();

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
  return sig === (await hmac(secret, `lyra:${exp}`));
}
