// robots.txt를 무시하는 봇을 인물 페이지에서 막는다.
//
// 왜 여기까지 왔는가: 2026-09-14 측정에서 Neon 전송량이 하루 335.9MB, 월 환산
// 10.08GB였다. 무료 한도는 5GB고, 넘기면 컴퓨트가 멈춘다(402). Vercel 로그에서
// 58분간 23건 중 17건이 /people 이었고 전부 캐시 MISS였다. 인물 페이지 콜드
// 렌더 한 번이 Neon 읽기 6~9회 · 1.2~1.8MB다 — 한 명을 보여 주려고 영화 전집과
// Watcha 기록을 읽어 그 사람 것만 걸러 내기 때문이다. 인물은 2,545명이라 봇이
// 한 바퀴 돌면 3GB다.
//
// app/robots.js는 이미 모든 에이전트에게 Disallow: / 를 준다. 그런데 로그를 보면
// 그 봇은 /robots.txt를 받아 가고도 2분 45초 간격으로 계속 긁었다. 그래서 이건
// 새 정책이 아니라 이미 선언해 둔 정책의 집행이다.
//
// 미들웨어는 Edge에서 돌고 DB를 열지 않는다. 여기서 막으면 읽기 6~9회가 0이 된다.
//
// 한계: UA는 얼마든지 속일 수 있다. 브라우저를 사칭하는 봇은 이걸로 못 잡는다.
// 그때는 Vercel 로그에 다시 잡힐 테니 그때 좁힌다. Sec-Fetch-* 유무로 판별하는
// 방법도 있지만 Safari 16.4 미만이 그 헤더를 안 보내 사람을 막을 수 있어 쓰지 않는다.
// 사람을 막느니 봇을 놓친다.
const BOT_UA = /bot\b|crawl|spider|slurp|scrap|curl\/|wget\/|python-requests|httpx|okhttp|java\/|go-http-client|headless|phantomjs|facebookexternalhit|bytespider|petalbot|dataforseo|semrush|ahrefs|mj12|dotbot|serpstat|megaindex|zoominfo/i;

// UA가 아예 없는 요청도 막는다. 브라우저는 언제나 보낸다.
export function looksLikeBot(userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua) return true;
  return BOT_UA.test(ua);
}

// 막을 가치가 있는 경로만 고른다. 값이 비싼 곳은 측정된 /people 하나다 —
// 나머지는 정적이거나 이미 캐시에 걸려 봇이 와도 DB를 깨우지 않는다.
export function guardedPath(pathname) {
  return pathname === "/people" || pathname.startsWith("/people/");
}
