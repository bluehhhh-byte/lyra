// 열한 가지 지시문이 전부 캔버스 없이 오류 없이 그려지고, 붓질이 종이 안에 머무는지 확인한다.
// 그림 코드가 "use client" 장면 안에 있으면 브라우저를 띄우기 전엔 깨진 걸 알 수 없다 —
// 그래서 붓질 목록을 lib로 빼고 여기서 가짜 2D 컨텍스트로 돌린다.
import assert from "node:assert/strict";
import test from "node:test";
import { createHand } from "./fable/primitives.js";
import { stream } from "./fable/core.js";
import { latestArtworkPlan } from "./latest-artwork.js";
import { latestArtworkTasks } from "./latest-artwork-draw.js";

const W = 450;
const H = 360;

function recordingContext() {
  const marks = [];
  let points = [];
  let clipped = false;
  const context = {
    lineCap: "", lineJoin: "", lineWidth: 1, strokeStyle: "", fillStyle: "",
    beginPath() { points = []; },
    moveTo(x, y) { points.push([x, y]); },
    lineTo(x, y) { points.push([x, y]); },
    quadraticCurveTo(_cx, _cy, x, y) { points.push([x, y]); },
    arc(x, y) { points.push([x, y]); },
    closePath() {},
    clip() { clipped = true; },
    stroke() { marks.push({ points: [...points], clipped }); },
    fill() { marks.push({ points: [...points], clipped }); },
    fillRect(x, y) { marks.push({ points: [[x, y]], clipped }); },
    save() {}, restore() { clipped = false; },
    setTransform() {}, clearRect() {}, translate() {}, rotate() {}, scale() {},
  };
  return { context, marks };
}

const base = {
  day: "2026-08-24", text: "t", music: 8, movies: 0,
  emotions: [["그리움", 4], ["몽환", 2], ["분노", 2]], dominant: "그리움",
  center: { v: 0, a: 0.4, n: 8 }, entropy: 0.87, keywords: [["사랑", 3], ["마음", 2], ["거리", 1]], themes: [],
};

// 지시문마다 자격을 만족하는 날을 하나씩 만들고, 시드가 그 지시문을 고를 때까지 날짜를 민다
function dayFor(score, shape) {
  for (let day = 1; day <= 60; day++) {
    const latest = { ...base, ...shape, day: `2026-0${1 + (day % 6)}-${String(1 + (day % 28)).padStart(2, "0")}` };
    const plan = latestArtworkPlan(latest);
    if (plan.score === score) return plan;
  }
  return null;
}

const SHAPES = {
  constellation: {},
  repeat: { music: 3, emotions: [["불안", 3]], center: { v: 0, a: 0.5, n: 3 } },
  solo: { music: 1, emotions: [["체념", 1]], keywords: [], center: { v: 0, a: 0, n: 1 } },
  pair: { music: 3, emotions: [["사랑", 2], ["슬픔", 1]], center: { v: 0, a: 0.5, n: 3 } },
  strata: { music: 6, emotions: [["희망", 3], ["위로", 2], ["기쁨", 1]], center: { v: 0.5, a: 0.7, n: 6 } },
  grid: { music: 5, emotions: [["고독", 3], ["회상", 2]], center: { v: 0, a: 0.5, n: 5 } },
  rain: { music: 2, emotions: [["슬픔", 2]], center: { v: -2.2, a: -0.5, n: 2 } },
  burst: { music: 2, emotions: [["분노", 2]], center: { v: -0.5, a: 2.2, n: 2 } },
  growth: { music: 2, emotions: [["희망", 2]], center: { v: 2, a: -0.5, n: 2 } },
  letters: { music: 1, emotions: [["회상", 1]], keywords: [["a", 1], ["b", 1], ["c", 1], ["d", 1]], center: { v: 0.5, a: 0, n: 1 } },
  thread: { music: 4, emotions: [["설렘", 2], ["위로", 2]], center: { v: 0.5, a: 0.5, n: 4 } },
};

for (const [score, shape] of Object.entries(SHAPES)) {
  test(`${score} — 오류 없이 그려지고 붓질이 종이 안에 머문다`, () => {
    const plan = dayFor(score, shape);
    assert.ok(plan, `${score}를 고르는 날을 60일 안에 찾지 못했다`);
    const { context, marks } = recordingContext();
    const surface = { widthUnits: W, heightUnits: H, reducedMotion: true, emit: (_a, _b, draw) => draw(context), clear() {} };
    const hand = createHand(surface);
    const tasks = latestArtworkTasks({ hand, plan, W, H, random: stream(plan.seed) });
    assert.ok(tasks.length >= 4, "바탕·형상·마감이 있어야 한다");
    // 바탕 두 붓질(찢긴 종이·물감 자국)은 일부러 가장자리를 넘긴다 — 형상·마감만 범위를 잰다
    tasks[0]();
    tasks[1]();
    const groundMarks = marks.length;
    for (const task of tasks.slice(2)) task();
    const figure = marks.slice(groundMarks);
    assert.ok(figure.length > 30, `${score}의 형상 붓질이 ${figure.length}번뿐이다 — 너무 성글다`);
    // 클리핑되지 않은 획만 종이 범위를 검사한다(빗금은 다각형에 잘리므로 원래 길게 긋는다)
    const free = figure.filter((mark) => !mark.clipped).flatMap((mark) => mark.points);
    const outside = free.filter(([x, y]) => x < 0 || x > W || y < 0 || y > H).length;
    assert.ok(outside / Math.max(1, free.length) < 0.01, `${score}: 종이 밖 점 ${outside}/${free.length}`);
  });
}

test("같은 plan은 같은 붓질을 만든다", () => {
  const plan = latestArtworkPlan(base);
  const run = () => {
    const { context, marks } = recordingContext();
    const hand = createHand({ widthUnits: W, heightUnits: H, reducedMotion: true, emit: (_a, _b, draw) => draw(context), clear() {} });
    for (const task of latestArtworkTasks({ hand, plan, W, H, random: stream(plan.seed) })) task();
    return JSON.stringify(marks.map((mark) => mark.points.length));
  };
  assert.equal(run(), run());
});
