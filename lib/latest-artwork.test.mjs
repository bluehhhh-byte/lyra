import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { ARTWORK_COMPOSITIONS, ARTWORK_PATTERN_COUNT, artworkPatternCatalog, hashLatest, latestArtworkPlan } from "./latest-artwork.js";

const base = {
  day: "2026-08-24",
  text: "음악 8곡이 남았고 그리움과 몽환·분노가 함께 나타났다.",
  music: 8,
  movies: 0,
  emotions: [["그리움", 4], ["몽환", 2], ["분노", 2]],
  dominant: "그리움",
  center: { v: 0, a: 0.4, n: 8 },
  entropy: 0.87,
  keywords: [["사랑", 3], ["마음", 2]],
  themes: [],
  repSong: { slug: "yuuri-the-world-has-ended" },
};

test("같은 최신 기록은 같은 정적 별자리를 만든다", () => {
  assert.deepEqual(latestArtworkPlan(base), latestArtworkPlan(base));
  assert.equal(typeof hashLatest(base.text), "number");
});

test("11개 지시문과 20개 조형 문법이 220개 고유 패턴을 만든다", () => {
  const catalog = artworkPatternCatalog();
  assert.equal(ARTWORK_COMPOSITIONS.length, 20);
  assert.equal(ARTWORK_PATTERN_COUNT, 220);
  assert.equal(catalog.length, 220);
  assert.equal(new Set(catalog).size, 220);
  assert.ok(ARTWORK_COMPOSITIONS.every((composition) => Number.isFinite(composition.angle) && composition.id.includes("-")));
});

test("새 업로드 날짜와 감정이 바뀌면 장면도 바뀐다", () => {
  const next = {
    ...base,
    day: "2026-08-25",
    dominant: "희망",
    emotions: [["희망", 5], ["위로", 2]],
    center: { v: 2, a: -0.5, n: 7 },
    repSong: { slug: "next-song" },
  };
  assert.notDeepEqual(latestArtworkPlan(base), latestArtworkPlan(next));
  assert.notEqual(latestArtworkPlan(base).seed, latestArtworkPlan(next).seed);
});

test("감정은 좌표와 색을 가진 최대 다섯 개 노드가 된다", () => {
  const plan = latestArtworkPlan(base);
  assert.equal(plan.nodes.length, 3);
  assert.equal(plan.nodes[0].color, "SLATE");
  assert.ok(plan.nodes.every((node) => node.x >= 0 && node.x <= 100 && node.y >= 0 && node.y <= 100));
});

test("최신 기록 카드만 홈 아트워크를 소유한다", async () => {
  const [scenes, home] = await Promise.all([
    readFile(new URL("../app/fable-scenes.js", import.meta.url), "utf8"),
    readFile(new URL("../app/home-intro.js", import.meta.url), "utf8"),
  ]);
  assert.match(scenes, /latestArtworkPlan\(latest\)/);
  assert.match(scenes, /data-latest-day-seed=\{plan\.seed\}/);
  assert.match(scenes, /data-latest-day-pattern=\{plan\.patternId\}/);
  assert.match(home, /<LatestDayScene latest=\{latest\}/);
  assert.doesNotMatch(home, /FableHomeScene|AI report/i);
});

// ── 지시문 그림 ─────────────────────────────────────────────────────────────
import { withParticle, koCount } from "./latest-artwork.js";

const SCORE_IDS = ["constellation", "repeat", "solo", "pair", "strata", "grid", "rain", "burst", "growth", "letters", "thread"];

test("자격 있는 지시문 가운데 시드가 하나를 고른다 — 같은 기록엔 같은 지시문", () => {
  const plan = latestArtworkPlan(base);
  assert.ok(SCORE_IDS.includes(plan.score));
  assert.equal(latestArtworkPlan(base).score, plan.score);
  // 기록 1건이어도 최근 작품을 피할 수 있도록 기본 지시문이 여럿 남는다
  const one = { ...base, music: 1, emotions: [["불안", 1]], keywords: [], center: { v: 0, a: 0, n: 1 } };
  assert.ok(["solo", "strata", "grid", "letters", "thread"].includes(latestArtworkPlan(one).score));
  // 감정 3종 미만이면 별자리는 나오지 않는다
  const two = { ...base, music: 3, emotions: [["사랑", 2], ["슬픔", 1]] };
  assert.notEqual(latestArtworkPlan(two).score, "constellation");
});

test("날마다 다른 지시문이 나온다 — 비슷한 모양의 날 30일에 최소 다섯 가지", () => {
  const seen = new Set();
  for (let day = 1; day <= 30; day++) {
    const latest = { ...base, day: `2026-07-${String(day).padStart(2, "0")}`, music: 2 + (day % 4), emotions: [["불안", 2 + (day % 4)]], center: { v: -1.5 + (day % 3), a: -1 + (day % 4), n: 2 } };
    seen.add(latestArtworkPlan(latest).score);
  }
  assert.ok(seen.size >= 5, `지시문이 ${seen.size}종뿐이다: ${[...seen].join(", ")}`);
});

test("최근 세 기록일의 작품 패턴은 되풀이하지 않는다", async () => {
  const { dayInsights } = await import("./latest-day.js");
  const songs = Array.from({ length: 10 }, (_, index) => ({
    slug: `sequence-${index}`,
    title: `곡 ${index}`,
    artist: "A",
    published: `2026-07-${String(index + 1).padStart(2, "0")}T01:00:00Z`,
    emotion: "그리움",
    genre: "Indie Pop",
    keywords: ["밤", "기억", `흔적${index}`],
    stanzas: [],
  }));
  const plans = dayInsights(songs, []).map(latestArtworkPlan);
  for (let index = 0; index < plans.length; index++) {
    const recent = plans.slice(Math.max(0, index - 3), index).map((plan) => plan.score);
    assert.ok(!recent.includes(plans[index].score), `${index + 1}번째 ${plans[index].score}가 최근 ${recent.join(", ")}와 겹친다`);
  }
});

test("최근 40개 조형 조합은 다시 선택하지 않는다", async () => {
  const { dayInsights } = await import("./latest-day.js");
  const songs = Array.from({ length: 90 }, (_, index) => ({
    slug: `long-sequence-${index}`,
    title: `긴 순서 ${index}`,
    artist: "A",
    published: new Date(Date.UTC(2026, 0, index + 1, 1)).toISOString(),
    emotion: ["그리움", "몽환", "분노", "희망"][index % 4],
    genre: "Indie Pop",
    keywords: ["밤", "기억", `흔적${index}`],
    stanzas: [],
  }));
  const plans = dayInsights(songs, []).map(latestArtworkPlan);
  for (let index = 0; index < plans.length; index++) {
    const recent = plans.slice(Math.max(0, index - 40), index).map((plan) => plan.patternId);
    assert.ok(!recent.includes(plans[index].patternId), `${index + 1}번째 ${plans[index].patternId}가 최근 40개 안에서 겹친다`);
  }
});

test("같은 지시문도 실제 이미지 어휘에 따라 다른 작품이 된다", () => {
  const forceLetters = SCORE_IDS.filter((score) => score !== "letters");
  const first = latestArtworkPlan({ ...base, artworkAvoid: forceLetters, keywords: [["밤", 3], ["기억", 2]] });
  const second = latestArtworkPlan({ ...base, artworkAvoid: forceLetters, keywords: [["바다", 3], ["파도", 2]], repSong: { slug: "sea", title: "파도의 끝" } });
  assert.equal(first.score, "letters");
  assert.equal(second.score, "letters");
  assert.notEqual(first.title, second.title);
  assert.notEqual(first.body, second.body);
  assert.match(first.title + first.body, /밤|기억/);
  assert.match(second.title + second.body, /바다|파도/);
});

test("작품 제목은 이미 들어간 정서를 반복하지 않는다", () => {
  const forceSolo = SCORE_IDS.filter((score) => score !== "solo");
  const plan = latestArtworkPlan({ ...base, artworkAvoid: forceSolo, keywords: [["달", 2], ["목소리", 1]], emotions: [["몽환", 8]], dominant: "몽환" });
  assert.equal(plan.score, "solo");
  assert.equal((plan.title.match(/몽환/g) || []).length, 1);
  assert.match(plan.title, /몽환 · 달·목소리/);
});

test("라벨은 개념미술 평론처럼 — 수치나 제작 규칙 대신 형상과 의미를 읽는다", () => {
  const plans = [
    base,
    { ...base, music: 1, emotions: [["체념", 1]], keywords: [] },
    { ...base, music: 4, emotions: [["희망", 4]] },
    { ...base, music: 2, emotions: [["고독", 1], ["기쁨", 1]] },
    { ...base, center: { v: -2.5, a: 0, n: 8 } },
    { ...base, center: { v: 0, a: 2.4, n: 8 } },
  ].map(latestArtworkPlan);
  for (const plan of plans) {
    assert.ok(plan.title.startsWith("《") && plan.title.endsWith("》"), `제목은 《》로 감싼다: ${plan.title}`);
    assert.equal(plan.year, "2026");
    assert.match(plan.medium, /종이에 잉크/);
    assert.match(plan.medium, /2026년 8월 24일/);
    assert.ok(plan.body.length > 40, `${plan.score} 해설이 너무 짧다`);
    assert.doesNotMatch(plan.title + plan.body, /당신|너는|우울증|불안장애|성격/);
    assert.doesNotMatch(plan.body, /밝기|고조|척도|비례|기록 \d+건|\d+ 대 \d+|\d+°|긋는다\.|되풀이한다\.$/, "해설은 수치 분석이나 제작 지시가 아니라 미술 평론이어야 한다");
    assert.doesNotMatch(plan.medium, /기록 \d+건/);
  }
});

test("날씨 층은 날씨 지시문이 아닐 때만 덧입힌다", () => {
  const dark = latestArtworkPlan({ ...base, music: 1, emotions: [["체념", 1]], keywords: [], center: { v: -2, a: 0, n: 1 } });
  if (dark.score === "rain") {
    assert.equal(dark.score, "rain");
    assert.equal(dark.weather, null);
  } else {
    assert.equal(dark.weather, "rain");
    assert.match(dark.body, /흘러내린 잉크/);
  }
});

test("수사와 조사", () => {
  assert.equal(koCount(2, "번"), "두 번");
  assert.equal(koCount(8, "겹"), "여덟 겹");
  assert.equal(koCount(12, "줄"), "12줄");
  assert.equal(withParticle("사랑", "과", "와"), "사랑과");
  assert.equal(withParticle("분노", "과", "와"), "분노와");
  assert.equal(withParticle("슬픔", "이", "가"), "슬픔이");
});

test("카드는 그림 아래에 벽면 라벨을 붙인다", async () => {
  const [home, card, caption, scenes, draw] = await Promise.all([
    readFile(new URL("../app/home-intro.js", import.meta.url), "utf8"),
    readFile(new URL("../app/day-report-card.js", import.meta.url), "utf8"),
    readFile(new URL("../app/day-artwork-caption.js", import.meta.url), "utf8"),
    readFile(new URL("../app/fable-scenes.js", import.meta.url), "utf8"),
    readFile(new URL("./latest-artwork-draw.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<DayArtworkCaption latest=\{latest\}/);
  assert.match(card, /<DayArtworkCaption latest=\{insight\}/);
  assert.doesNotMatch(home + card, /day constellation/);
  assert.match(caption, /plan\.title/);
  assert.match(caption, /plan\.medium/);
  assert.match(caption, /plan\.body/);
  // 붓질은 lib에 있고 장면은 그것을 부르기만 한다 — 그래야 브라우저 없이 그림을 검사한다
  assert.match(scenes, /latestArtworkTasks\(\{ hand, plan, W, H, random \}\)/);
  for (const id of SCORE_IDS.filter((score) => score !== "thread")) assert.match(draw, new RegExp(`score === "${id}"`), `붓질 목록에 ${id} 분기가 있어야 한다`);
  assert.match(draw, /hand\.sheet\(/, "모든 작품은 종이 한 장 위에 그린다");
});
