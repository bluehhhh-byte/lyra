// E2E smoke — 빌드 산출물을 실제로 띄워 주요 페이지가 열리는지 본다.
// 로직 테스트·빌드가 통과해도 "페이지가 하얗게 뜨는" 사고는 여기서만 잡힌다.
//   pnpm build && pnpm smoke   (pnpm check가 이 순서로 돈다)
// dev 모드 아님 — next start로 프로덕션 번들을 검사한다.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
const SMOKE_ADMIN_PASSWORD = "lyra-smoke-admin-render-check";

// 곡·태그 slug는 파일에서 하나 집어온다 — 하드코딩하면 곡 지울 때 깨진다
const firstSong = fs.readdirSync("songs").find((f) => f.endsWith(".md"))?.replace(/\.md$/, "");
const firstMovie = fs.readdirSync("movies").find((f) => f.endsWith(".md"))?.replace(/\.md$/, "");

const CHECKS = [
  { url: "/", expect: "음악 컬렉션" },
  { url: `/songs/${firstSong}`, expect: "기록" },
  { url: "/movies", expect: null },
  { url: `/movies/${firstMovie}`, expect: null },
  { url: "/songs/taste", expect: "음악 취향" },
  { url: "/songs/motifs", expect: "번역 가사에 반복된 이미지 어휘" },
  { url: "/recommendations/music", expect: "추천 곡" },
  { url: "/recommendations", expect: null },
  { url: "/watched", expect: "평가한 영화" },
  { url: "/watched/taste", expect: null },
  { url: "/stats", expect: null },
  { url: "/diary", expect: null },
  { url: "/archive", expect: null },
  { url: "/tags", expect: null },
  { url: "/recap", expect: null },
  { url: "/moments", expect: "문화 장면" },
  { url: "/people", expect: null },
  { url: `/api/search?q=${encodeURIComponent("a")}`, expect: '"groups"' },
  { url: "/api/search/lyrics?q=%EC%82%AC%EB%9E%91", expect: '"hits"' },
  { url: `/api/search/lyrics?q=${encodeURIComponent("세상이")}`, expect: "yuuri-the-world-has-ended" },
  // 배포 완료 판정이 이 값에 걸려 있다 — 사라지면 관리자 배포가 영원히 "빌드 중"이 된다
  { url: "/api/version", expect: '"sha"' },
  { url: "/api/songs/meta", expect: '"songs"' },
];

if (!fs.existsSync(path.join(".next", "BUILD_ID"))) {
  console.error("✗ .next 빌드가 없습니다 — pnpm build 먼저");
  process.exit(1);
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ADMIN_PASSWORD: SMOKE_ADMIN_PASSWORD },
  }
);

const kill = () => { try { server.kill(); } catch {} };
process.on("exit", kill);

// 서버 준비 대기 — 홈이 응답할 때까지 폴링
let up = false;
for (let i = 0; i < 60 && !up; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    up = (await fetch(BASE, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {}
}
if (!up) {
  console.error("✗ next start가 30초 안에 응답하지 않음");
  kill();
  process.exit(1);
}

let failed = 0;
for (const { url, expect } of CHECKS) {
  try {
    const res = await fetch(BASE + url, { signal: AbortSignal.timeout(10000) });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (expect && !body.includes(expect)) throw new Error(`본문에 "${expect}" 없음`);
    console.log(`  ✓ ${url}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${url} — ${e.message}`);
  }
}

// 인증 경계 — next start는 production이라 middleware가 살아 있다.
// admin이 잠겨 있지 않으면 그게 최악의 회귀라 smoke에서 같이 잡는다.
const AUTH_CHECKS = [
  ...["/admin", "/admin/tools", "/admin/movie", "/admin/moments", "/admin/usage", "/admin/publish-queue", "/admin/cyno-carousel"].map((url) => ({
    url,
    ok: (response) => response.status === 307 && response.headers.get("location")?.includes("/admin/login"),
    desc: `비로그인 ${url} → 307 로그인 이동`,
  })),
  { url: "/api/admin", ok: (r) => r.status === 401, desc: "비로그인 /api/admin → 401" },
  { url: "/api/admin/deploy", ok: (r) => r.status === 401, desc: "비로그인 배포 요청 → 401" },
  { url: "/admin/login", ok: (r) => r.status === 200, desc: "/admin/login 열림" },
];
const AUTHENTICATED_PAGES = [
  { url: "/admin", expect: "곡 추가" },
  { url: "/admin/tools", expect: "관리 도구" },
  { url: "/admin/movie", expect: "영화 관리" },
  { url: "/admin/moments", expect: "장면" },
  { url: "/admin/usage", expect: "무료 사용량" },
  { url: "/admin/publish-queue", expect: "오늘의 발행 후보" },
  { url: "/admin/cyno-carousel", expect: "Cyno 캐러셀 제작실" },
];
for (const { url, ok, desc } of AUTH_CHECKS) {
  try {
    const res = await fetch(BASE + url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (!ok(res)) throw new Error(`HTTP ${res.status}`);
    console.log(`  ✓ ${url} (${desc})`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${url} — ${desc}: ${e.message}`);
  }
}

// 인증 redirect만 확인하면 관리자 Server Component가 실제로 렌더링되는지 알 수 없다.
// 로그인 쿠키로 /admin 본문까지 요청해, 누락 import 같은 운영 전용 런타임 오류를 잡는다.
try {
  const login = await fetch(BASE + "/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: SMOKE_ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(10000),
  });
  if (!login.ok) throw new Error(`로그인 HTTP ${login.status}`);
  const authCookie = login.headers.get("set-cookie")?.match(/lyra_auth=[^;]+/)?.[0];
  if (!authCookie) throw new Error("인증 쿠키 없음");

  for (const page of AUTHENTICATED_PAGES) {
    const response = await fetch(BASE + page.url, {
      headers: { cookie: authCookie },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`${page.url} HTTP ${response.status}`);
    if (!body.includes(page.expect)) throw new Error(`${page.url} 본문에 "${page.expect}" 없음`);
    if (body.includes("An error occurred in the Server Components render")) {
      throw new Error(`${page.url} Server Component 렌더링 오류`);
    }
    console.log(`  ✓ ${page.url} (로그인 후 Server Component 렌더링)`);
  }

  const deployHealth = await fetch(BASE + "/api/admin/deploy", {
    headers: { cookie: authCookie },
    signal: AbortSignal.timeout(10000),
  });
  if (!deployHealth.ok) throw new Error(`배포 API HTTP ${deployHealth.status}`);
  const deployBody = await deployHealth.json();
  if (!deployBody?.status) throw new Error("배포 API 상태 진단 없음");
  console.log("  ✓ /api/admin/deploy (로그인 후 서버 청크 로드)");
} catch (e) {
  failed++;
  console.log(`  ✗ /admin — 로그인 후 렌더링: ${e.message}`);
}

kill();
console.log(failed ? `\n${failed}개 실패` : `\n전체 ${CHECKS.length + AUTH_CHECKS.length + AUTHENTICATED_PAGES.length + 1}개 통과`);
process.exit(failed ? 1 : 0);
