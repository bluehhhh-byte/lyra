import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { parseLyrics } from "./songs.js";
import { songNeeds, summarizeNeeds } from "./admin/needs.js";

// AI 예산이 소진된 날 "AI 보류로 저장"한 곡 — 번역·독음·키워드·감정이 비어
// 있다. 그런 곡도 공개 페이지에서 오류 없이 읽혀야 하고, 다음 날 채울 수 있게
// 결손 대기열에는 잡혀야 한다.
const bareSong = {
  slug: "pending-song",
  title: "Pending",
  artist: "Someone",
  lang: "en",
  keywords: [],
  emotion: "",
  stanzas: parseLyrics("Line one\nLine two\n\nLine three"),
};

test("a song saved without AI parses into readable stanzas", () => {
  assert.equal(bareSong.stanzas.length, 2);
  assert.equal(bareSong.stanzas[0].lines.length, 2);
  assert.equal(bareSong.stanzas[0].lines[0].en, "Line one");
  // 번역·독음이 없는 줄은 그 칸이 아예 없다(undefined). 화면이 `line.ko &&`로
  // 검사하므로 안전하다 — 빈 문자열로 바꿀 이유가 없고, 여기서는 "값이 없다"는
  // 사실만 못박는다. 이 줄이 깨지면 가사 화면이 빈 칸을 그리기 시작한다.
  assert.ok(!bareSong.stanzas[0].lines[0].ko);
  assert.ok(!bareSong.stanzas[0].lines[0].reading);
});

test("the lyric view renders nothing for an empty translation", () => {
  const view = fs.readFileSync(new URL("../app/songs/[slug]/lyrics-view.js", import.meta.url), "utf8");
  // 빈 번역은 아예 출력하지 않는다 — 빈 칸이 줄줄이 남으면 미완성이 아니라
  // 고장으로 읽힌다.
  assert.match(view, /mode !== "orig" &&\s*line\.ko &&/, "번역 줄은 값이 있을 때만 그린다");
  assert.match(view, /mode === "trans" && !line\.ko \? null/, "번역만 보기에서는 빈 줄을 건너뛴다");
});

test("an AI-deferred song lands in the needs queue so it can be finished later", () => {
  const needs = songNeeds(bareSong);
  assert.ok(needs.keywords > 0, "키워드 없음이 결손으로 잡혀야 한다");
  assert.ok(needs.emotion > 0, "감정 없음이 결손으로 잡혀야 한다");
  const summary = summarizeNeeds(bareSong);
  assert.ok(summary.includes("키워드 없음"), summary.join(", "));
  assert.ok(summary.includes("감정 없음"), summary.join(", "));
});

test("instrumental and lyrics_none songs stay out of the queue", () => {
  // 채울 수 없는 항목으로 영원히 남지 않게 하는 기존 규칙이 그대로여야 한다
  const instrumental = { ...bareSong, instrumental: true };
  assert.equal(songNeeds(instrumental).translation, 0);
  assert.equal(songNeeds(instrumental).keywords, 0);
});

test("the save route can skip every Gemini call it would otherwise make", () => {
  const route = fs.readFileSync(new URL("../app/api/admin/songs.js", import.meta.url), "utf8");
  assert.match(route, /const skipAi = body\.skipAi === true/, "저장이 AI 생략 요청을 받아야 한다");
  assert.match(route, /geminiKey && !skipAi/, "생략 요청이면 연 나누기 호출을 건너뛴다");

  const form = fs.readFileSync(new URL("../app/admin/form.js", import.meta.url), "utf8");
  assert.match(form, /saveWith\(\{ skipAi: true \}\)/, "폼에 AI 없는 저장 경로가 있어야 한다");
  assert.match(form, /AI 보류로 저장/, "그 경로가 화면에 버튼으로 드러나야 한다");
});
