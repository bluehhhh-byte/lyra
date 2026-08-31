// 벽 타일은 뷰포트 주변 창에만 비트맵을 잡는다 — 모바일에서 "더 보기"를 누르면
// 벽이 문서 높이만큼 다시 지어지며 수백 MB를 잡아 Safari가 탭을 재로드했다.
//   node --test lib/fable-wall-window.test.mjs
import assert from "node:assert/strict";

// createWall이 만지는 최소한의 브라우저 표면만 흉내 낸다.
const listeners = {};
const ctx = () => ({ setTransform() {}, lineCap: "", lineJoin: "" });
globalThis.window = {
  innerWidth: 390, innerHeight: 844, scrollY: 0, devicePixelRatio: 3,
  addEventListener: (type, fn) => { listeners[type] = fn; },
  removeEventListener() {},
  setTimeout: (fn) => setTimeout(fn, 0),
};
globalThis.matchMedia = () => ({ matches: true }); // reduced motion → fast 경로, 타이밍 무관
Object.defineProperty(globalThis, "navigator", { value: { deviceMemory: 4 }, configurable: true }); // Node 21+는 navigator가 getter 전용
globalThis.requestAnimationFrame = () => 1; // tick은 돌리지 않는다 — 창 계산만 본다
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = { now: () => 0 };
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, setAttribute() {}, getContext: ctx }),
};
const container = { style: {}, children: [], replaceChildren() { this.children = []; }, appendChild(c) { this.children.push(c); } };

const { createWall } = await import("./fable/wall.js");
// 390px 폰의 긴 홈: 유닛 높이 24000 → 1200짜리 타일 20개
const wall = createWall(container, { widthUnits: 1600, heightUnits: 24000 });
const scroll = listeners.scroll;
assert.equal(typeof scroll, "function", "스크롤 리스너가 창을 갱신해야 한다");

// 1) 타일 픽셀 폭은 화면 픽셀(390×2 — DPR은 2에서 캡)을 넘지 않는다
const first = wall.tiles[0];
assert.ok(first.canvas.width <= 780, `타일 폭 ${first.canvas.width}px > 화면 780px`);

// 2) 첫 화면에서는 위쪽 타일만 할당된다 — 20개 전부가 아니다
const allocated = () => wall.tiles.filter((t) => t.allocated).length;
assert.ok(allocated() < wall.tiles.length / 2, `첫 화면에 타일 ${allocated()}개 할당 — 너무 많다`);

// 3) 아래로 멀리 스크롤하면 위쪽 타일은 비트맵을 돌려준다
wall.emit(0, 24000, () => {}); // 모든 타일에 그리기 큐 하나씩
window.scrollY = 5000; // 유닛으로 약 20500 → 맨 아래 근처
scroll();
assert.equal(first.allocated, false, "창 밖으로 나간 첫 타일은 해제돼야 한다");
assert.equal(first.canvas.width, 1, "해제된 타일의 비트맵은 1×1이어야 한다");
assert.ok(Array.isArray(first.queue) && first.queue.length === 1, "해제해도 그리기 큐는 남아야 다시 그릴 수 있다");
// 창 = 위 1화면 + 아래 1.2화면(390px 폰에서 ≈7,600유닛) → 1200짜리 타일 최대 7개
assert.ok(allocated() <= 7, `아래쪽에서도 창 안 타일만 할당 — 지금 ${allocated()}개`);

// 4) 다시 위로 올라오면 같은 타일이 재할당되고 처음부터 다시 그린다
window.scrollY = 0;
scroll();
assert.equal(first.allocated, true, "창으로 돌아온 타일은 재할당돼야 한다");
assert.equal(first.cursor, 0, "재할당된 타일은 큐를 처음부터 다시 그려야 한다");

console.log("✓ 벽 타일 창 — 화면 픽셀 상한 · 창 밖 타일 해제 · 재진입 시 재그리기");
console.log("all passed");
