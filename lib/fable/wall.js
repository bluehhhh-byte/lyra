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
  const pixelScale = renderScale();
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

  function activateVisibleTiles() {
    const top = toLogicalY(window.scrollY);
    const view = toLogicalY(window.innerHeight);
    const lookahead = window.innerWidth < 640 ? 1.2 : 1.8;
    for (const tile of tiles) {
      if (!tile.active && tile.y0 < top + view * lookahead) {
        tile.active = true;
        allocateTile(tile);
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
      if (generationDone && tile.cursor >= tile.queue.length) {
        tile.done = true;
        tile.queue = null;
      }
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
      tile.queue = null;
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
