import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PALETTE, stream } from "./core.js";
import { createHand } from "./primitives.js";

function renderLog(seed) {
  const queue = [];
  const surface = {
    widthUnits: 1600,
    emit: (y0, y1, draw) => queue.push({ y0, y1, draw }),
  };
  const hand = createHand(surface);
  const random = stream(seed);
  hand.enso(random, 800, 240, 120, 0.88, PALETTE.INK);
  hand.spark(random, 800, 240, 22, { col: PALETTE.CLAY, nR: 7 });
  hand.atext(random, 120, 720, 490, 16, { col: PALETTE.INK });
  hand.threadSeg(random, 600, 980, PALETTE.GOLD, 0.6);

  const log = [];
  const context = new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = (...args) => log.push([String(key), ...args.map((value) => Number.isFinite(value) ? +value.toFixed(4) : value)]);
      return target[key];
    },
    set(target, key, value) {
      log.push([`set:${String(key)}`, value]);
      target[key] = value;
      return true;
    },
  });
  for (const item of queue) item.draw(context);
  return { bounds: queue.map(({ y0, y1 }) => [y0, y1]), log };
}

test("손그림 프리미티브는 같은 시드에서 같은 렌더 명령을 만든다", () => {
  assert.deepEqual(renderLog(91), renderLog(91));
  assert.notDeepEqual(renderLog(91), renderLog(92));
});

test("벽 엔진은 타일 큐·24ms 생성 예산·완전한 cleanup을 갖는다", async () => {
  const wall = await readFile(new URL("./wall.js", import.meta.url), "utf8");
  assert.match(wall, /tileHeight = options\.tileHeight \|\| DEFAULT_TILE_HEIGHT/);
  assert.match(wall, /performance\.now\(\) - started < 24/);
  assert.match(wall, /navigator\.deviceMemory/);
  assert.match(wall, /prefers-reduced-motion: reduce/);
  assert.match(wall, /cancelAnimationFrame\(frame\)/);
  assert.match(wall, /removeEventListener\("scroll", syncScroll\)/);
  assert.match(wall, /container\.replaceChildren\(\)/);
});
