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
