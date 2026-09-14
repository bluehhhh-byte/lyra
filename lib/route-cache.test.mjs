// 공개 상세 라우트는 모두 ISR 시한을 가져야 한다.
//
// /people/[name]에 revalidate가 없어 그 라우트만 ƒ(요청마다 새로 렌더)였다.
// 인물 한 명을 보여 주려고 영화 전집과 Watcha 기록을 읽는데, 캐시가 없으니 그
// 읽기가 요청마다 일어났다. robots.txt를 무시하는 크롤러가 2,545명을 계속 훑는
// 동안 그 비용이 그대로 Neon 전송량이 됐다 — 하루 335.9MB, 월 환산 10.08GB로
// 무료 한도(5GB)의 두 배였다.
//
// 같은 이유로 /tags/[tag]와 /moments/[slug]도 빠져 있었다. /tags 쪽은 주석에
// "빌드에 굽는다"고 적혀 있기까지 했다 — 주석은 사실이 아니었다.
//   node --test lib/route-cache.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = path.join(ROOT, "app");

function dynamicPages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // 관리자와 API는 늘 최신이어야 한다 — 캐시하면 방금 저장한 것이 안 보인다
      if (entry.name === "admin" || entry.name === "api") return [];
      return dynamicPages(full);
    }
    if (entry.name !== "page.js") return [];
    return path.dirname(full).includes("[") ? [full] : [];
  });
}

test("every public detail route caches its render", () => {
  const missing = [];
  for (const file of dynamicPages(APP)) {
    const source = fs.readFileSync(file, "utf8");
    // force-dynamic을 일부러 고른 라우트는 그 선언이 곧 판단이다
    if (/export const dynamic = "force-dynamic"/.test(source)) continue;
    if (!/export const revalidate = \d+/.test(source))
      missing.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  }
  assert.deepEqual(missing, [], `ISR 시한이 없는 상세 라우트:\n  ${missing.join("\n  ")}`);
});

test("revalidate alone is not enough — the route needs generateStaticParams", () => {
  // 이게 이 작업의 핵심이다. revalidate만 붙였을 때 빌드 출력은 여전히 ƒ였고,
  // generateStaticParams(빈 배열)을 더하자 ●로 바뀌었다. 빈 배열이라 빌드에서
  // 굽는 것은 없고, 처음 열린 경로만 캐시된다.
  for (const route of ["people/[name]", "tags/[tag]"]) {
    const source = fs.readFileSync(path.join(APP, route, "page.js"), "utf8");
    assert.match(source, /export const revalidate = 21600/, `${route}: 시한이 다른 상세 라우트와 다르다`);
    assert.match(source, /export async function generateStaticParams/, `${route}: 이게 없으면 ƒ로 남는다`);
  }
});

test("moments stays deliberately uncached", () => {
  // 장면은 관리자가 고치는 대로 바로 보여야 한다 — force-dynamic이 그 판단이다.
  // 위 검사가 이 라우트를 건너뛰는 근거이기도 하다.
  const source = fs.readFileSync(path.join(APP, "moments/[slug]/page.js"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.ok(!/export const revalidate/.test(source), "force-dynamic과 revalidate를 함께 두면 뜻이 갈린다");
});

test("the shared TTL is not quietly shortened", () => {
  // 6시간은 2026-08-22에 5분이 월 20GB를 태운 뒤 정한 값이다. 줄이지 말 것.
  const contentDb = fs.readFileSync(path.join(ROOT, "lib", "content-db.js"), "utf8");
  assert.match(contentDb, /const CACHE_TTL_SECONDS = 6 \* 60 \* 60/);
});
