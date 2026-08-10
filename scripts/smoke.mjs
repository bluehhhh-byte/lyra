// E2E smoke — 빌드 산출물을 실제로 띄워 주요 페이지가 열리는지 본다.
// 로직 테스트·빌드가 통과해도 "페이지가 하얗게 뜨는" 사고는 여기서만 잡힌다.
//   pnpm build && pnpm smoke   (pnpm check가 이 순서로 돈다)
// dev 모드 아님 — next start로 프로덕션 번들을 검사한다.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;

// 곡·태그 slug는 파일에서 하나 집어온다 — 하드코딩하면 곡 지울 때 깨진다
const firstSong = fs.readdirSync("songs").find((f) => f.endsWith(".md"))?.replace(/\.md$/, "");
const firstMovie = fs.readdirSync("movies").find((f) => f.endsWith(".md"))?.replace(/\.md$/, "");

const CHECKS = [
  { url: "/", expect: "곡·가수·가사 검색" },
  { url: `/songs/${firstSong}`, expect: "기록" },
  { url: "/movies", expect: null },
  { url: `/movies/${firstMovie}`, expect: null },
  { url: "/watched", expect: "평가한 영화" },
  { url: "/watched/taste", expect: null },
  { url: "/stats", expect: null },
  { url: "/diary", expect: null },
  { url: "/archive", expect: null },
  { url: "/people", expect: null },
  { url: `/api/search?q=${encodeURIComponent("a")}`, expect: '"groups"' },
  { url: "/api/lyrics-index", expect: '"slug"' },
];

if (!fs.existsSync(path.join(".next", "BUILD_ID"))) {
  console.error("✗ .next 빌드가 없습니다 — pnpm build 먼저");
  process.exit(1);
}

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  { stdio: ["ignore", "pipe", "pipe"] }
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
  { url: "/admin", ok: (r) => r.status >= 300 && r.status < 400 && r.headers.get("location")?.includes("/admin/login"), desc: "비로그인 /admin → 로그인으로 redirect" },
  { url: "/api/admin", ok: (r) => r.status === 401, desc: "비로그인 /api/admin → 401" },
  { url: "/admin/login", ok: (r) => r.status === 200, desc: "/admin/login 열림" },
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

kill();
console.log(failed ? `\n${failed}개 실패` : `\n전체 ${CHECKS.length + AUTH_CHECKS.length}개 통과`);
process.exit(failed ? 1 : 0);
