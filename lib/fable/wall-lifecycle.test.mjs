// 타일 생명주기 회귀 — 비트맵 해제와 rAF 정지는 순수 로직이라 브라우저 없이 검증한다.
// 예전에는 타일이 한 번 할당되면 영영 남고(모바일에서 수백 MB) tick 이 영원히
// 재예약돼 유휴 상태에서도 60fps 를 점유했다. 두 회귀 모두 여기서 잡힌다.
import assert from "node:assert/strict";
import test from "node:test";

function makeCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    style: {},
    setAttribute() {},
    getContext: () => ({ setTransform() {}, lineCap: "", lineJoin: "" }),
  };
  return canvas;
}

/** createWall 이 기대하는 전역만 최소로 세운다. */
function installDom({ innerHeight = 800, innerWidth = 1280 } = {}) {
  const frames = [];
  const listeners = {};
  const container = {
    style: {},
    children: [],
    replaceChildren() {
      this.children = [];
    },
    appendChild(node) {
      this.children.push(node);
    },
  };

  globalThis.document = { createElement: () => makeCanvas() };
  // Node 의 navigator 는 getter-only 라 대입이 아니라 재정의가 필요하다.
  Object.defineProperty(globalThis, "navigator", { value: { deviceMemory: 8 }, configurable: true, writable: true });
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.window = {
    scrollY: 0,
    innerWidth,
    innerHeight,
    devicePixelRatio: 1,
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
    setTimeout: (fn) => { fn(); return 0; },
  };
  globalThis.requestAnimationFrame = (fn) => frames.push(fn);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.clearTimeout = () => {};

  return {
    container,
    listeners,
    // 예약된 프레임을 한 번에 소진한다. 반환값은 이번에 실행된 프레임 수.
    pump() {
      const due = frames.splice(0, frames.length);
      for (const fn of due) fn();
      return due.length;
    },
    pending: () => frames.length,
    scrollTo(y) {
      globalThis.window.scrollY = y;
      listeners.scroll?.();
    },
  };
}

async function loadWall() {
  return (await import("./wall.js")).createWall;
}

test("먼 타일은 비트맵을 잡지 않고, 가까워지면 할당된다", async () => {
  const dom = installDom();
  const createWall = await loadWall();
  const wall = createWall(dom.container, { heightUnits: 12000, tileHeight: 1200 });

  const allocated = () => wall.tiles.filter((t) => t.canvas.width > 1).length;
  assert.equal(wall.tiles.length, 10);
  const atTop = allocated();
  assert.ok(atTop >= 1, "첫 화면 타일은 할당돼야 한다");
  assert.ok(atTop < wall.tiles.length, "전체를 한 번에 잡으면 안 된다");
  wall.destroy();
});

test("멀어진 타일은 비트맵을 반납하고, 돌아오면 큐를 다시 그린다", async () => {
  const dom = installDom();
  const createWall = await loadWall();
  const wall = createWall(dom.container, { heightUnits: 40000, tileHeight: 1200 });

  let drawn = 0;
  wall.emit(0, 400, () => drawn++);
  wall.generate([]); // 생성 종료 표시
  dom.pump();
  dom.pump();

  const first = wall.tiles[0];
  assert.ok(first.canvas.width > 1, "맨 위 타일이 할당돼 있어야 한다");
  const afterFirstPass = drawn;
  assert.ok(afterFirstPass > 0, "큐가 한 번은 실행돼야 한다");

  // 멀리 스크롤 — 맨 위 타일은 보관 범위를 벗어난다.
  dom.scrollTo(30000);
  dom.pump();
  assert.equal(first.canvas.width, 1, "멀어진 타일은 비트맵을 반납해야 한다");
  assert.equal(first.allocated, false);

  // 되돌아오면 다시 할당되고 큐가 재생된다 — 큐를 null 로 비우면 여기서 깨진다.
  dom.scrollTo(0);
  dom.pump();
  dom.pump();
  assert.ok(first.canvas.width > 1, "돌아온 타일은 다시 할당돼야 한다");
  assert.ok(drawn > afterFirstPass, "돌아온 타일은 큐를 다시 그려야 한다");
  wall.destroy();
});

test("그릴 게 없으면 rAF 루프가 멈추고, 스크롤이 깨운다", async () => {
  const dom = installDom();
  const createWall = await loadWall();
  const wall = createWall(dom.container, { heightUnits: 40000, tileHeight: 1200 });

  wall.emit(0, 400, () => {});
  wall.generate([]);
  for (let i = 0; i < 12 && dom.pending(); i++) dom.pump();

  assert.equal(dom.pending(), 0, "유휴 상태에서 다음 프레임을 예약하면 안 된다");

  dom.scrollTo(20000); // 새 타일이 보이는 곳으로
  assert.ok(dom.pending() > 0, "스크롤이 루프를 다시 깨워야 한다");
  wall.destroy();
});
