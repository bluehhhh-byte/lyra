// 개인 사이트 크롤링 정책 — 셋이 한 벌이라 하나만 풀려도 표면이 다시 열린다.
//   1) robots.txt 전면 disallow
//   2) 콘텐츠 URL을 열거하는 sitemap 없음
//   3) 모든 응답에 noindex (메타 태그 + X-Robots-Tag 헤더)
//
// 크롤러가 4,091개 동적 URL을 순회하면 사람의 사용량과 무관하게 Vercel 함수가
// 4,000번 깨어난다. 무료 한도에서 먼저 닳는 것은 전송량이 아니라 Active CPU다.
//   node lib/crawl-policy.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

// 1) robots — 전면 차단이고, sitemap을 광고하지 않는다
{
  const { default: robots } = await load("app/robots.js");
  const result = robots();
  const rules = [].concat(result.rules);
  assert.equal(rules.length, 1, "규칙이 하나여야 예외가 숨어들 자리가 없다");

  const rule = rules[0];
  assert.equal(rule.userAgent, "*");
  const disallow = [].concat(rule.disallow);
  assert.ok(disallow.includes("/"), `전체 경로를 막아야 한다 (실제: ${JSON.stringify(rule.disallow)})`);
  assert.ok(!rule.allow, "allow가 남아 있으면 그 경로만 크롤링이 열린다");

  // sitemap을 가리키면 차단해 놓고 목록을 건네주는 셈이다
  assert.ok(!result.sitemap, "robots가 sitemap을 광고하면 안 된다");
}

// 2) sitemap 라우트가 콘텐츠를 열거하지 않는다
{
  const sitemapPath = path.join(root, "app/sitemap.js");
  if (fs.existsSync(sitemapPath)) {
    const src = fs.readFileSync(sitemapPath, "utf8");
    for (const symbol of ["getAllSongsRuntime", "getAllMoviesRuntime", "getAllPeopleRuntime", "buildArchiveRuntime", "getAllMomentsRuntime"]) {
      assert.ok(!src.includes(symbol), `sitemap이 ${symbol}로 개인 콘텐츠를 열거하면 안 된다`);
    }
  }
  // 파일이 없는 것이 기본 상태다 — 전면 차단 상태에서 sitemap은 쓸모가 없고,
  // 빌드 때 전곡을 읽던 의존성도 함께 사라진다(Neon 장애 때 빌드를 깨뜨린 경로).
}

// 3) noindex — 메타 태그와 헤더 양쪽
{
  // 메타: layout.js는 JSX라 import할 수 없어 소스로 확인한다
  const layout = read("app/layout.js");
  assert.match(layout, /robots:\s*\{[^}]*index:\s*false/, "layout metadata에 robots.index=false가 있어야 한다");
  assert.match(layout, /robots:\s*\{[^}]*follow:\s*false/, "follow도 꺼야 링크를 타고 들어가지 않는다");

  // 헤더: 메타 태그는 HTML을 파싱한 봇에만 닿는다. 이미지·JSON 응답까지 덮으려면 헤더가 필요하다.
  const { default: config } = await load("next.config.mjs");
  assert.equal(typeof config.headers, "function", "next.config에 headers()가 있어야 한다");
  const groups = await config.headers();
  const wildcard = groups.find((g) => g.source === "/:path*");
  assert.ok(wildcard, "모든 경로를 덮는 규칙이 있어야 한다");
  const tag = wildcard.headers.find((h) => h.key === "X-Robots-Tag");
  assert.ok(tag, "X-Robots-Tag가 있어야 한다");
  assert.match(tag.value, /noindex/);
  assert.match(tag.value, /nofollow/);
}

console.log("✓ 크롤링 정책 — robots 전면 차단 · sitemap 미열거 · noindex 이중 적용");
