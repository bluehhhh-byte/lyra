// 상태를 바꾸는 admin POST의 출처 검증 — 두 라우트(/api/admin, /api/admin/deploy)가
// 같은 판정을 쓴다. 갈라지면 한쪽만 고쳐지는 사고가 난다.
//
// 인증은 middleware의 HMAC 쿠키가 하지만, 쿠키는 브라우저가 어디서든 실어 보낸다 —
// 다른 사이트에 심긴 폼 한 줄이 저장·삭제·배포를 부르면 안 된다.
//
// Origin이 없는 요청도 거부한다. 이 API를 부르는 정당한 클라이언트는 admin 화면의
// fetch뿐이고, 브라우저는 POST에 Origin을 항상 붙인다. 없다는 것은 브라우저가
// 아니라는 뜻인데, 브라우저가 아니면 인증 쿠키를 얻을 정당한 경로도 없다.
// 비교는 스킴까지 포함한 origin 전체다 — host만 견주면 http↔https가 섞인다.
export function sameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

export const forbiddenOrigin = () =>
  Response.json({ error: "허용되지 않은 출처입니다" }, { status: 403 });
