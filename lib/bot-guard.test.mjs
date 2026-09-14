// 사람을 막으면 안 된다. 봇을 놓치는 건 로그를 보고 좁히면 되지만, 사람이
// 403을 받으면 그 사람은 다시 오지 않는다. 그래서 이 검사는 양쪽을 다 본다.
//   node --test lib/bot-guard.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { guardedPath, looksLikeBot } from "./bot-guard.js";

test("real browsers get through", () => {
  const humans = [
    // 데스크톱
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
    // 모바일 — 이 사이트는 인스타그램 프로필 링크로 들어오는 사람이 많다
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.19.107",
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
    // 삼성·네이버 인앱 브라우저
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.9.0)",
  ];
  for (const ua of humans) assert.equal(looksLikeBot(ua), false, `사람을 막았다: ${ua.slice(0, 60)}`);
});

test("the crawlers that ignore robots.txt are stopped", () => {
  const bots = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
    "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 (compatible; CCBot/2.0; https://commoncrawl.org/faq/)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)",
    "python-requests/2.32.3",
    "curl/8.7.1",
    "Go-http-client/2.0",
    "Scrapy/2.11.0 (+https://scrapy.org)",
    "HeadlessChrome/140.0.0.0",
  ];
  for (const ua of bots) assert.equal(looksLikeBot(ua), true, `봇을 놓쳤다: ${ua.slice(0, 60)}`);
});

test("a request with no user agent is not a browser", () => {
  for (const value of ["", "   ", null, undefined]) assert.equal(looksLikeBot(value), true);
});

test("only the measured-expensive route is guarded", () => {
  // 인물 한 건이 영화 전집과 Watcha 기록을 읽는다 — 읽기 6~9회, 1.2~1.8MB.
  for (const p of ["/people", "/people/", "/people/%EB%B4%89%EC%A4%80%ED%98%B8"])
    assert.equal(guardedPath(p), true, p);
  // 나머지는 정적이거나 이미 캐시에 걸린다. 넓게 막으면 사람이 다칠 자리만 넓어진다.
  for (const p of ["/", "/songs/abc", "/movies", "/peoplewatch", "/api/search", "/admin"])
    assert.equal(guardedPath(p), false, p);
});

test("the middleware actually runs on the guarded route", () => {
  // matcher에 넣지 않으면 이 파일 전체가 죽은 코드가 된다 — 조용히.
  const source = fs.readFileSync(new URL("../middleware.js", import.meta.url), "utf8");
  assert.match(source, /"\/people", "\/people\/:path\*"/, "matcher에 /people이 없다");
  assert.match(source, /guardedPath\(pathname\)/);
  // 관리자 게이트보다 앞에 있어야 인물 요청이 로그인으로 튕기지 않는다
  assert.ok(
    source.indexOf("guardedPath(pathname)") < source.indexOf('pathname === "/admin/login"'),
    "봇 가드가 관리자 게이트보다 뒤에 있다",
  );
});
