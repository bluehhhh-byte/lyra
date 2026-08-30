import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { hashReport, reportArtworkPlan } from "./report-artwork.js";

const base = {
  report: { text: "밤과 눈물, 얼터너티브 록이 서늘한 평형을 이룬다." },
  latest: { text: "그리움과 불안이 남았다.", dominant: "그리움", center: { v: -0.8, a: 0.4 }, entropy: 0.72 },
  shift: { valenceRecent: -0.1, valenceAll: -0.4, genre: { name: "힙합" }, emotion: { name: "그리움" } },
  taste: { decade: [["1990년대", 10]] },
};

test("같은 AI 리포트는 같은 정적 구도를 만든다", () => {
  assert.deepEqual(reportArtworkPlan(base), reportArtworkPlan(base));
  assert.equal(reportArtworkPlan(base).seed, hashReport([
    base.report.text,
    base.latest.text,
    base.latest.dominant,
    base.shift.genre.name,
    base.shift.emotion.name,
    base.taste.decade[0][0],
  ].join(" | ")));
});

test("리포트 내용이 달라지면 구도도 달라진다", () => {
  const changed = { ...base, report: { text: "빛과 봄, 고요한 포크가 밝은 위로를 만든다." } };
  assert.notDeepEqual(reportArtworkPlan(base), reportArtworkPlan(changed));
  assert.ok(reportArtworkPlan(changed).metrics.valence > reportArtworkPlan(base).metrics.valence);
});

test("아트워크는 배경을 어지럽히지 않도록 최대 다섯 획만 쓴다", () => {
  const plan = reportArtworkPlan({
    ...base,
    report: { text: "록 힙합 저항 격정 리듬 펑크 메탈 댄스" },
    latest: { ...base.latest, center: { v: 0, a: 3 }, entropy: 1 },
  });
  assert.ok(plan.strokes.length >= 3);
  assert.ok(plan.strokes.length <= 5);
  assert.ok(plan.strokes.every((stroke) => !stroke.d.includes("NaN")));
});

test("홈 아트워크는 오디오와 분리되고 AI 리포트 시드를 사용한다", async () => {
  const [component, home, page, player] = await Promise.all([
    readFile(new URL("../app/fable-scenes.js", import.meta.url), "utf8"),
    readFile(new URL("../app/home-intro.js", import.meta.url), "utf8"),
    readFile(new URL("../app/page.js", import.meta.url), "utf8"),
    readFile(new URL("../app/player.js", import.meta.url), "utf8"),
  ]);
  assert.match(component, /reportArtworkPlan\(insights\)\.seed/);
  assert.match(component, /<canvas/);
  assert.ok(!/AnalyserNode|audioRef/.test(component));
  assert.match(home, /<FableHomeScene/);
  assert.match(page, /readRuntimeData\("music-report\.json"/);
  assert.ok(!/InkWall|ink-wall/.test(player));
});
