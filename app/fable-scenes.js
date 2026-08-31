"use client";

import { useEffect, useRef } from "react";
import { createCanvasSurface } from "../lib/fable/wall";
import { createHand } from "../lib/fable/primitives";
import { hashSeed, PALETTE, rd, stream } from "../lib/fable/core";
import { latestArtworkPlan } from "../lib/latest-artwork";

function runScene(tasks, reducedMotion) {
  let index = 0;
  let timer = 0;
  let dead = false;
  const step = () => {
    if (dead) return;
    const started = performance.now();
    while (index < tasks.length && (reducedMotion || performance.now() - started < 24)) tasks[index++]();
    if (!dead && index < tasks.length) timer = window.setTimeout(step, 0);
  };
  step();
  return () => {
    dead = true;
    clearTimeout(timer);
  };
}

function useCanvasScene(ref, draw, dependencies) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelTasks = () => {};
    let resizeTimer = 0;
    const render = () => {
      cancelTasks();
      const setup = draw(canvas);
      cancelTasks = runScene(setup.tasks, setup.reducedMotion);
    };
    const schedule = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 80);
    };
    render();
    document.fonts?.ready.then(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      clearTimeout(resizeTimer);
      cancelTasks();
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, dependencies);
}

export function LatestDayScene({ latest, className = "" }) {
  const ref = useRef(null);
  const plan = latestArtworkPlan(latest);
  useCanvasScene(ref, (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const H = 360;
    const W = H * (rect.width / Math.max(1, rect.height));
    const surface = createCanvasSurface(canvas, { widthUnits: W, heightUnits: H });
    const hand = createHand(surface);
    const random = stream(plan.seed);
    const dark = document.documentElement.dataset.theme !== "light";
    const ink = dark ? PALETTE.CINK : PALETTE.INK;
    const paint = (name) => PALETTE[name] || PALETTE.SLATE;
    const M = 20;
    const sheet = [[M, M], [W - M, M], [W - M, H - M], [M, H - M]];
    const at = (node) => ({ x: M + 8 + (node.x / 100) * (W - 2 * M - 16), y: M + 6 + (node.y / 100) * (H - 2 * M - 12) });
    const tasks = [];

    // 지시문마다 다른 그림. 어느 지시문인지는 lib/latest-artwork.js가 그날 기록으로 정한다.
    if (plan.score === "constellation") {
      const nodes = plan.nodes.map((node) => ({ ...node, ...at(node) }));
      const middle = at(plan.center);
      tasks.push(() => hand.hatchFill(random, sheet, 18, plan.angle, 0.07, { col: ink }));
      const path = nodes.map((node) => [node.x, node.y]);
      if (nodes.length > 1) {
        tasks.push(() => hand.sk(random, path, { col: ink, w: 2, a: 0.5, amp: 1.2 }));
        tasks.push(() => hand.sk(random, [...path].reverse(), { col: PALETTE.PLUM, w: 1, a: 0.3, amp: 2, gap: 0.2 }));
      }
      nodes.forEach((node) => {
        const color = paint(node.color);
        const radius = node.radius * 1.4;
        tasks.push(() => hand.ellipse(random, node.x, node.y, radius * 1.5, radius, { col: color, w: 1.8 + node.count * 0.2, a: 0.8, amp: 0.8 }));
        if (node.energy >= 0.55) tasks.push(() => hand.spark(random, node.x, node.y, radius * 2.4, { col: color, a: 0.8, w: 1.4, nR: 5 + Math.min(5, node.count), noCenter: true }));
        else tasks.push(() => hand.dotF(random, node.x, node.y, Math.max(2.6, radius * 0.36), 0.86, color));
      });
      tasks.push(
        () => hand.ellipse(random, middle.x, middle.y, 14 + plan.entropy * 12, 9 + plan.entropy * 7, { col: ink, w: 1.2, a: 0.5, amp: 0.8, gap: 0.16 }),
        () => hand.dotF(random, middle.x, middle.y, 2.6, 0.8, PALETTE.VIOLET),
      );
    } else if (plan.score === "solo") {
      const lead = plan.nodes[0];
      const color = lead?.emotion ? paint(lead.color) : ink;
      const radius = Math.min(W, H) * 0.3;
      tasks.push(() => hand.hatchFill(random, sheet, 16, plan.angle, 0.06, { col: ink }));
      tasks.push(() => hand.enso(random, W / 2, H / 2, radius, plan.params.fraction, color, { w: 7 + Math.min(3, plan.keywordCount), a: 0.82 }));
      if (plan.params.energy >= 0.55) tasks.push(() => hand.spark(random, W / 2, H / 2, radius * 0.35, { col: color, a: 0.7, w: 1.4, nR: 6, noCenter: true }));
      else tasks.push(() => hand.dotF(random, W / 2, H / 2, 4, 0.8, color));
      for (let index = 0; index < plan.keywordCount; index++) {
        tasks.push(() => hand.dotF(random, W / 2 + rd(random, -radius * 0.5, radius * 0.5), H / 2 + rd(random, -radius * 0.4, radius * 0.4), 1.8, 0.6, PALETTE.VIOLET));
      }
    } else if (plan.score === "repeat") {
      const color = paint(plan.nodes[0].color);
      const rows = plan.params.rows;
      const gapY = (H - 2 * M - 20) / Math.max(1, rows - 1);
      const step = 20 + plan.variant * 5;
      for (let row = 0; row < rows; row++) {
        const y = M + 10 + (rows === 1 ? (H - 2 * M - 20) / 2 : row * gapY);
        tasks.push(() => hand.sk(random, [[M, y + 9], [W - M, y + 9]], { col: ink, w: 0.9, a: 0.2, amp: 0.8, gap: 0.1 }));
        for (let x = M + 12; x < W - M - 6; x += step) {
          const px = x;
          if (plan.params.markKind === "spark") tasks.push(() => hand.spark(random, px + rd(random, -2, 2), y + rd(random, -2, 2), 8, { col: color, a: 0.75, w: 1.2, nR: 5, noCenter: true }));
          else if (plan.params.markKind === "ring") tasks.push(() => hand.ellipse(random, px, y, 7, 5, { col: color, w: 1.5, a: 0.75, amp: 0.7 }));
          else tasks.push(() => hand.sk(random, [[px, y - 7], [px + rd(random, -2, 2), y + 7]], { col: color, w: 2.2, a: 0.7, taper: "out", amp: 0.5 }));
        }
      }
    } else {
      const { left, right, seam } = plan.params;
      const seamX = M + seam * (W - 2 * M);
      const seamPoints = [];
      for (let y = M; y <= H - M; y += 12) seamPoints.push([seamX + Math.sin(y * 0.05 + plan.variant) * 6 + rd(random, -3, 3), y]);
      const leftPolygon = [[M, M], ...seamPoints, [M, H - M]];
      const rightPolygon = [[W - M, M], ...seamPoints, [W - M, H - M]];
      tasks.push(() => hand.hatchFill(random, leftPolygon, left.spacing, left.angle, 0.55, { col: paint(left.color) }));
      tasks.push(() => hand.hatchFill(random, rightPolygon, right.spacing, right.angle, 0.55, { col: paint(right.color) }));
      tasks.push(() => hand.sk(random, seamPoints, { col: ink, w: 1.8, a: 0.7, amp: 1.5 }));
      tasks.push(() => hand.spatter(random, seamX, H / 2, 26, 40, ink, 0.35));
    }

    // 날씨 — 그날 감정 중심이 마지막에 덧입히는 층
    if (plan.weather === "rain") {
      for (let index = 0; index < plan.weatherCount; index++) tasks.push(() => hand.drip(random, rd(random, M + 6, W - M - 6), M + rd(random, 0, 20), rd(random, 50, H * 0.6), ink, 0.38, 2));
    } else if (plan.weather === "spatter") {
      const color = paint(plan.nodes[0]?.color);
      for (let index = 0; index < 3; index++) tasks.push(() => hand.spatter(random, rd(random, W * 0.25, W * 0.75), rd(random, H * 0.25, H * 0.75), 40, 70, color, 0.5));
    } else if (plan.weather === "growth") {
      for (let index = 0; index < plan.weatherCount; index++) tasks.push(() => hand.fern(random, rd(random, M + 10, W - M - 10), H - M - 2, rd(random, 40, 85), PALETTE.SAGE));
    }

    return { tasks, reducedMotion: surface.reducedMotion };
  }, [plan.seed]);
  return <canvas ref={ref} data-latest-day-scene data-latest-day-seed={plan.seed} data-latest-day-score={plan.score} className={className} aria-hidden />;
}

export function FableSongScene({ slug, className = "" }) {
  const ref = useRef(null);
  useCanvasScene(ref, (canvas) => {
    const parent = canvas.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const artworkRect = parent.querySelector("[data-song-artwork]")?.getBoundingClientRect();
    const heightUnits = 620;
    const widthUnits = heightUnits * (parentRect.width / Math.max(1, parentRect.height));
    const scaleX = widthUnits / Math.max(1, parentRect.width);
    const scaleY = heightUnits / Math.max(1, parentRect.height);
    const silence = artworkRect ? {
      left: (artworkRect.left - parentRect.left) * scaleX - 24,
      right: (artworkRect.right - parentRect.left) * scaleX + 24,
      top: (artworkRect.top - parentRect.top) * scaleY - 20,
      bottom: (artworkRect.bottom - parentRect.top) * scaleY + 20,
    } : { left: 90, right: 470, top: 90, bottom: 530 };
    const surface = createCanvasSurface(canvas, { widthUnits, heightUnits });
    const hand = createHand(surface);
    const random = stream(hashSeed(`song-scene:${slug}`));
    const dark = document.documentElement.dataset.theme !== "light";
    const baseInk = dark ? PALETTE.CINK : PALETTE.INK;
    const tasks = [];
    for (let y = 42; y < heightUnits - 18; y += 23 + rd(random, -1.5, 1.5)) {
      const yy = y;
      const color = Math.round(y) % 7 === 0 ? PALETTE.SLATE : Math.round(y) % 11 === 0 ? PALETTE.VIOLET : baseInk;
      if (yy < silence.top || yy > silence.bottom) {
        tasks.push(() => hand.atext(random, 24, widthUnits - 24, yy, 15, { col: color, a: rd(random, 0.2, 0.4), w: 1.1 }));
      } else {
        if (silence.left > 48) tasks.push(() => hand.atext(random, 24, silence.left, yy, 15, { col: color, a: rd(random, 0.24, 0.46), w: 1.1 }));
        if (silence.right < widthUnits - 48) tasks.push(() => hand.atext(random, silence.right, widthUnits - 24, yy, 15, { col: color, a: rd(random, 0.24, 0.46), w: 1.1 }));
      }
    }
    tasks.push(() => hand.spark(random, (silence.left + silence.right) / 2, (silence.top + silence.bottom) / 2, 28, { col: PALETTE.VIOLET, a: 0.8, w: 2.1, nR: 8 }));
    return { tasks, reducedMotion: surface.reducedMotion };
  }, [slug]);
  return <canvas ref={ref} data-fable-song-scene className={className} aria-hidden />;
}

export function FableMark({ seed = "lyra", className = "" }) {
  const ref = useRef(null);
  useCanvasScene(ref, (canvas) => {
    const surface = createCanvasSurface(canvas, { widthUnits: 100, heightUnits: 100 });
    const hand = createHand(surface);
    const random = stream(hashSeed(`mark:${seed}`));
    const dark = document.documentElement.dataset.theme !== "light";
    return {
      reducedMotion: true,
      tasks: [
        () => hand.enso(random, 50, 50, 34, 0.88, dark ? PALETTE.CINK : PALETTE.INK, { w: 5.4, a: 0.84 }),
        () => hand.spark(random, 50, 50, 9, { col: PALETTE.VIOLET, a: 0.96, w: 1.8, nR: 7 }),
      ],
    };
  }, [seed]);
  return <canvas ref={ref} className={className} data-fable-mark aria-hidden />;
}

export function FableCaption({ text, className = "h-8 w-36", seed = "caption" }) {
  const ref = useRef(null);
  useCanvasScene(ref, (canvas) => {
    const surface = createCanvasSurface(canvas, { widthUnits: 360, heightUnits: 72 });
    const hand = createHand(surface);
    const random = stream(hashSeed(`${seed}:${text}`));
    const dark = document.documentElement.dataset.theme !== "light";
    return {
      reducedMotion: true,
      tasks: [() => hand.write(random, text, 8, 58, 34, { col: dark ? PALETTE.CINK : PALETTE.INK, a: 0.72 })],
    };
  }, [seed, text]);
  return <canvas ref={ref} className={className} data-fable-caption aria-hidden />;
}

export function LyricThread({ seed }) {
  const ref = useRef(null);
  useCanvasScene(ref, (canvas) => {
    const parent = canvas.parentElement;
    const parentRect = parent.getBoundingClientRect();
    const widthUnits = Math.max(1, parentRect.width);
    const heightUnits = Math.max(1, parentRect.height);
    const surface = createCanvasSurface(canvas, { widthUnits, heightUnits, maxPixelRatio: 1 });
    const hand = createHand(surface);
    const random = stream(hashSeed(`lyrics:${seed}`));
    const stanzaRects = [...parent.querySelectorAll("[data-fable-stanza]")].map((element) => element.getBoundingClientRect());
    const anchors = stanzaRects.map((rect) => rect.top - parentRect.top + 12);
    // 가사 왼쪽에 두면 세로로 긴 원문·독음과 겹친다. LyricsView가 비워 둔
    // 오른쪽 padding 안에 실을 놓아 본문 옆 여백만 따라 내려가게 한다.
    const gutter = widthUnits < 480 ? 10 : 15;
    const x = Math.max(5, widthUnits - gutter);
    const tasks = [];
    if (anchors.length) {
      const threadEnd = Math.min(heightUnits - 1, stanzaRects.at(-1).bottom - parentRect.top + 10);
      tasks.push(() => hand.threadSeg(random, Math.max(0, anchors[0] - 22), threadEnd, PALETTE.GOLD, 0.72, { x: (y) => x + Math.sin(y * 0.009) * 4, w: 1.35 }));
      for (const y of anchors) tasks.push(() => hand.dotF(random, x + Math.sin(y * 0.009) * 4, y, 3.2, 0.88, PALETTE.VIOLET));
    }
    return { tasks, reducedMotion: surface.reducedMotion };
  }, [seed]);
  return <canvas ref={ref} data-fable-lyric-thread className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden />;
}
