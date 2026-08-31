import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { hashLatest, latestArtworkPlan } from "./latest-artwork.js";

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
  assert.match(home, /<LatestDayScene latest=\{latest\}/);
  assert.doesNotMatch(home, /FableHomeScene|AI report/i);
});

// ── 지시문 그림 ─────────────────────────────────────────────────────────────
import { withParticle } from "./latest-artwork.js";

test("기록의 모양이 지시문을 고른다", () => {
  assert.equal(latestArtworkPlan(base).score, "constellation");
  const one = { ...base, music: 1, emotions: [["불안", 1]], center: { v: -1, a: 1, n: 1 } };
  assert.equal(latestArtworkPlan(one).score, "solo");
  assert.match(latestArtworkPlan(one).title, /원 하나 — 불안/);
  const same = { ...base, music: 2, emotions: [["불안", 2]], center: { v: -1, a: 1, n: 2 } };
  assert.equal(latestArtworkPlan(same).score, "repeat");
  assert.match(latestArtworkPlan(same).title, /불안, 2줄/);
  const two = { ...base, music: 3, emotions: [["사랑", 2], ["슬픔", 1]] };
  assert.equal(latestArtworkPlan(two).score, "pair");
  assert.match(latestArtworkPlan(two).title, /사랑과 슬픔/);
  assert.ok(latestArtworkPlan(two).params.seam > 0.5, "기록이 많은 쪽이 더 넓다");
});

test("제목·지시문·해설은 기록을 주어로 쓰고 사람을 판정하지 않는다", () => {
  const plans = [
    base,
    { ...base, music: 1, emotions: [["체념", 1]] },
    { ...base, music: 4, emotions: [["희망", 4]] },
    { ...base, music: 2, emotions: [["고독", 1], ["기쁨", 1]] },
  ].map(latestArtworkPlan);
  for (const plan of plans) {
    assert.ok(plan.title && plan.instruction && plan.caption, `${plan.score}에 제목·지시문·해설이 있어야 한다`);
    assert.doesNotMatch(plan.title + plan.instruction + plan.caption, /당신|너는|우울증|불안장애/);
    assert.match(plan.caption, /2026-08-24/);
  }
  assert.equal(new Set(plans.map((plan) => plan.score)).size, 4, "네 지시문이 전부 다른 그림이어야 한다");
});

test("그날 감정 중심이 날씨 층을 덧입힌다", () => {
  const dark = { ...base, center: { v: -2, a: 0, n: 8 } };
  assert.equal(latestArtworkPlan(dark).weather, "rain");
  assert.match(latestArtworkPlan(dark).instruction, /흘려보낸다/);
  const loud = { ...base, center: { v: 0, a: 2, n: 8 } };
  assert.equal(latestArtworkPlan(loud).weather, "spatter");
  const calm = { ...base, center: { v: 2, a: -0.5, n: 8 } };
  assert.equal(latestArtworkPlan(calm).weather, "growth");
  assert.equal(latestArtworkPlan(base).weather, null);
});

test("조사는 받침을 따른다", () => {
  assert.equal(withParticle("사랑", "과", "와"), "사랑과");
  assert.equal(withParticle("분노", "과", "와"), "분노와");
  assert.equal(withParticle("슬픔", "이", "가"), "슬픔이");
  assert.equal(withParticle("불안", "을", "를"), "불안을");
});

test("카드는 그림 아래에 제목과 해설을 붙인다", async () => {
  const [home, card, caption] = await Promise.all([
    readFile(new URL("../app/home-intro.js", import.meta.url), "utf8"),
    readFile(new URL("../app/day-report-card.js", import.meta.url), "utf8"),
    readFile(new URL("../app/day-artwork-caption.js", import.meta.url), "utf8"),
  ]);
  assert.match(home, /<DayArtworkCaption latest=\{latest\}/);
  assert.match(card, /<DayArtworkCaption latest=\{insight\}/);
  assert.doesNotMatch(home + card, /day constellation/);
  assert.match(caption, /plan\.title/);
  assert.match(caption, /plan\.instruction/);
  assert.match(caption, /plan\.caption/);
});
