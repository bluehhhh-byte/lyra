import assert from "node:assert/strict";
import fs from "node:fs";
import { buildHomeInsights, shiftSentence } from "./home-insights.js";

const songs = Array.from({ length: 16 }, (_, index) => ({
  slug: `song-${index}`,
  title: `Song ${index}`,
  artist: `Artist ${index}`,
  artwork: `https://example.com/${index}.jpg`,
  published: `2026-08-${String(16 - index).padStart(2, "0")}T00:00:00Z`,
  year: 2020,
  tags: ["영미", "Rock"],
  emotion: index < 10 ? "고독" : "희망",
  keywords: [],
}));
const movies = Array.from({ length: 16 }, (_, index) => ({
  slug: `movie-${index}`,
  title: `Movie ${index}`,
  director: `Director ${index}`,
  poster: `https://example.com/poster-${index}.jpg`,
  published: `2026-07-${String(16 - index).padStart(2, "0")}T00:00:00Z`,
}));

const report = { text: "밤과 록이 겹치는 서늘한 기록", count: 16, at: "2026-08-16T00:00:00Z" };
const result = buildHomeInsights(songs, movies, report);
assert.equal(result.recent.filter((item) => item.kind === "music").length, 4);
assert.equal(result.recent.filter((item) => item.kind === "movie").length, 2);
assert.match(result.portrait, /컬렉션/);
assert.equal(result.report, report, "저장된 AI 리포트가 홈 아트워크 입력으로 전달되지 않는다");
assert.match(shiftSentence(result.shift), /최근 10곡/);

// '다시 꺼내 본 기록'은 홈에서 뺐다 — 계산도 함께 사라져야 한다.
// 남겨 두면 쓰지 않는 값을 매 빌드마다 만들고, 다음 사람이 화면 어딘가에 있다고 오해한다.
{
  assert.equal(result.revisit, undefined, "revisit이 아직 계산된다");
  const lib = fs.readFileSync(new URL("./home-insights.js", import.meta.url), "utf8");
  assert.ok(!/revisit|spread\(|olderSongs|olderMovies/.test(lib), "home-insights에 revisit 잔재가 남아 있다");
  const intro = fs.readFileSync(new URL("../app/home-intro.js", import.meta.url), "utf8");
  assert.ok(!/revisit|다시 꺼내 본 기록|compact/.test(intro), "홈에 revisit 렌더링이 남아 있다");
}

// 제목 아래 고정 소개문 뒤에 취향 문장(portrait)이 이어 붙지 않는다
{
  const intro = fs.readFileSync(new URL("../app/home-intro.js", import.meta.url), "utf8");
  const para = intro.match(/모은 기록이다\.[\s\S]{0,80}/)?.[0] || "";
  assert.ok(para, "고정 소개문을 찾지 못했다");
  assert.ok(!/\{portrait/.test(para), "소개문 뒤에 portrait가 이어 붙는다");
}

// 최신 기록 날짜 분석이 홈 인사이트에 함께 실린다
assert.ok(result.latest, "latest가 없다");
assert.equal(result.latest.day, "2026-08-16", "최신 KST 날짜");

console.log("✓ 홈 인사이트 — revisit 제거 · 소개문 고정 · 최신 날짜 분석");
console.log("all passed");
