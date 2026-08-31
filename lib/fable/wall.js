// drawing engine adapted from https://www.kengoworks.com/fable (Kevin Ngo / Fable 5)

import { clamp } from "./core.js";

const DEFAULT_WIDTH = 1600;
const DEFAULT_TILE_HEIGHT = 1200;

function renderScale() {
  let scale = Math.min(1.35, Math.max(1, window.devicePixelRatio || 1));
  if (navigator.deviceMemory && navigator.deviceMemory < 8) scale = 1.1;
  return scale;
}

export function createWall(container, options = {}) {
  if (!container) throw new Error("createWall requires a container");
  const widthUnits = options.widthUnits || DEFAULT_WIDTH;
  const heightUnits = Math.max(1, options.heightUnits || 1600);
  const tileHeight = options.tileHeight || DEFAULT_TILE_HEIGHT;
  const reducedMotion = options.reducedMotion ?? matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fast = Boolean(options.fast || reducedMotion);
  // 타일 픽셀 폭은 실제 화면 픽셀(폭 × DPR, 최대 2배)을 넘지 않는다. 예전에는
  // 1600유닛 × 1.1을 고정으로 써서 390px 폰에서 타일 하나가 1760×1320(9MB)이었다 —
  // 화면 폭의 4.5배 오버샘플. 지금은 390px·3x 폰이 780px, 1366px·1x 모니터가 1:1.
  const screenScale = (window.innerWidth * Math.min(2, window.devicePixelRatio || 1)) / widthUnits;
  const pixelScale = Math.min(renderScale(), screenScale);
  const tileCount = Math.ceil(heightUnits / tileHeight);
  const tiles = [];
  let dead = false;
  let generationDone = false;
  let frame = 0;
  let generationTimer = 0;
  let generationIndex = 0;
  let generationTasks = [];

  container.replaceChildren();
  container.style.width = "100vw";
  container.style.height = `${(heightUnits / widthUnits) * 100}vw`;
  container.style.transformOrigin = "top left";

  for (let index = 0; index < tileCount; index++) {
    const y0 = index * tileHeight;
    const height = Math.min(tileHeight + 2, heightUnits - y0);
    const active = index === 0;
    const canvas = document.createElement("canvas");
    // Keep the tile map up front, but do not reserve a full bitmap for content
    // several screens away. Mobile home pages can be tens of logical tiles tall.
    canvas.width = active ? Math.round(widthUnits * pixelScale) : 1;
    canvas.height = active ? Math.max(1, Math.round(height * pixelScale)) : 1;
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = `${(y0 / widthUnits) * 100}vw`;
    canvas.style.width = "100vw";
    canvas.style.height = `${(height / widthUnits) * 100}vw`;
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    const context = canvas.getContext("2d", { alpha: true });
    context.lineCap = "round";
    context.lineJoin = "round";
    tiles.push({ canvas, context, y0, height, queue: [], cursor: 0, done: false, active, allocated: active });
  }

  const cssScale = () => window.innerWidth / widthUnits;
  const toLogicalY = (cssY) => cssY / cssScale();

  function setTileTransform(tile) {
    tile.context.setTransform(pixelScale, 0, 0, pixelScale, 0, -tile.y0 * pixelScale);
  }

  function allocateTile(tile) {
    if (tile.allocated) return;
    tile.canvas.width = Math.round(widthUnits * pixelScale);
    tile.canvas.height = Math.max(1, Math.round(tile.height * pixelScale));
    tile.context.lineCap = "round";
    tile.context.lineJoin = "round";
    tile.allocated = true;
  }

  function emit(y0, y1, draw) {
    if (dead) return;
    const first = clamp(Math.floor((y0 - 60) / tileHeight), 0, tileCount - 1);
    const last = clamp(Math.floor((y1 + 60) / tileHeight), 0, tileCount - 1);
    for (let index = first; index <= last; index++) tiles[index].queue.push(draw);
  }

  // 활성 타일은 뷰포트 주변 창(위 1화면 · 아래 lookahead)으로 제한한다. 예전에는
  // 한 번 활성화된 타일이 끝까지 남았고, 페이지가 길어져 벽을 다시 지을 때는
  // 스크롤 위치 위쪽 타일이 전부 즉시 할당됐다 — 모바일에서 "더 보기"를 누르면
  // 수백 MB가 한 번에 잡혀 Safari가 탭을 재로드하던 원인. 창 밖으로 나간 타일은
  // 비트맵을 1×1로 돌려주고, 다시 들어오면 같은 큐를 처음부터 다시 그린다.
  function releaseTile(tile) {
    if (!tile.allocated) return;
    tile.canvas.width = 1;
    tile.canvas.height = 1;
    tile.allocated = false;
    tile.active = false;
    tile.cursor = 0;
    tile.done = false;
  }

  function activateVisibleTiles() {
    const top = toLogicalY(window.scrollY);
    const view = toLogicalY(window.innerHeight);
    const lookahead = window.innerWidth < 640 ? 1.2 : 1.8;
    const windowTop = top - view;
    const windowBottom = top + view * lookahead;
    for (const tile of tiles) {
      const inWindow = tile.y0 + tile.height > windowTop && tile.y0 < windowBottom;
      if (inWindow && !tile.active) {
        tile.active = true;
        allocateTile(tile);
      } else if (!inWindow && tile.allocated) {
        releaseTile(tile);
      }
    }
  }

  function syncScroll() {
    container.style.transform = `translate3d(0, ${-window.scrollY}px, 0)`;
    activateVisibleTiles();
  }

  function tick() {
    if (dead) return;
    activateVisibleTiles();
    const budget = fast ? 200 : 7;
    const started = performance.now();
    for (const tile of tiles) {
      if (!tile.active || tile.done) continue;
      setTileTransform(tile);
      while (tile.cursor < tile.queue.length) {
        try {
          tile.queue[tile.cursor++](tile.context);
        } catch (error) {
          options.onError?.(error);
        }
        setTileTransform(tile);
        if (performance.now() - started > budget) break;
      }
      // 큐는 버리지 않는다 — 창 밖으로 나갔다 돌아온 타일이 다시 그려야 한다.
      // 큐는 그리기 클로저 배열이라 비트맵에 비하면 무시할 크기다.
      if (generationDone && tile.cursor >= tile.queue.length) tile.done = true;
      if (performance.now() - started > budget) break;
    }
    frame = requestAnimationFrame(tick);
  }

  function generationStep() {
    if (dead) return;
    const started = performance.now();
    while (generationIndex < generationTasks.length && performance.now() - started < 24) {
      generationTasks[generationIndex++]();
    }
    if (generationIndex < generationTasks.length) generationTimer = window.setTimeout(generationStep, 0);
    else generationDone = true;
  }

  function generate(tasks) {
    generationTasks = [...tasks];
    generationIndex = 0;
    generationDone = false;
    clearTimeout(generationTimer);
    generationStep();
  }

  function flush() {
    generationDone = true;
    for (const tile of tiles) {
      allocateTile(tile);
      setTileTransform(tile);
      while (tile.cursor < tile.queue.length) tile.queue[tile.cursor++](tile.context);
      tile.done = true;
    }
  }

  function destroy() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(frame);
    clearTimeout(generationTimer);
    window.removeEventListener("scroll", syncScroll);
    container.replaceChildren();
    container.style.transform = "";
  }

  window.addEventListener("scroll", syncScroll, { passive: true });
  syncScroll();
  frame = requestAnimationFrame(tick);

  return {
    container,
    widthUnits,
    heightUnits,
    tileHeight,
    pixelScale,
    reducedMotion,
    tiles,
    emit,
    generate,
    flush,
    cssScale,
    toLogicalY,
    destroy,
  };
}

export function createCanvasSurface(canvas, { widthUnits = 100, heightUnits = 100, maxPixelRatio = 2 } = {}) {
  if (!canvas) throw new Error("createCanvasSurface requires a canvas");
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(maxPixelRatio, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
  canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
  const context = canvas.getContext("2d", { alpha: true });
  const scaleX = canvas.width / widthUnits;
  const scaleY = canvas.height / heightUnits;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.lineCap = "round";
  context.lineJoin = "round";
  return {
    widthUnits,
    heightUnits,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    emit(_y0, _y1, draw) {
      draw(context);
    },
    clear() {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    },
  };
}
