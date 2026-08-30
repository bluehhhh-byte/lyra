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
    const heightUnits = 360;
    const widthUnits = heightUnits * (rect.width / Math.max(1, rect.height));
    const surface = createCanvasSurface(canvas, { widthUnits, heightUnits });
    const hand = createHand(surface);
    const random = stream(plan.seed);
    const dark = document.documentElement.dataset.theme !== "light";
    const inkColor = dark ? PALETTE.CINK : PALETTE.INK;
    const mapNode = (node) => ({
      ...node,
      px: 28 + (node.x / 100) * (widthUnits - 56),
      py: 26 + (node.y / 100) * (heightUnits - 92),
    });
    const nodes = plan.nodes.map(mapNode);
    const center = {
      x: 28 + (plan.center.x / 100) * (widthUnits - 56),
      y: 26 + (plan.center.y / 100) * (heightUnits - 92),
    };
    const tasks = [];

    if (nodes.length > 1) {
      const path = nodes.map((node) => [node.px, node.py]);
      tasks.push(() => hand.sk(random, path, { col: inkColor, w: 1.2, a: 0.28, amp: 1.4, gap: 0.12 }));
      tasks.push(() => hand.sk(random, [...path].reverse(), { col: PALETTE.PLUM, w: 0.8, a: 0.22, amp: 2.1, gap: 0.22 }));
    }

    nodes.forEach((node, index) => {
      const color = PALETTE[node.color] || PALETTE.SLATE;
      tasks.push(() => hand.ellipse(random, node.px, node.py, node.radius * 1.5, node.radius, { col: color, w: 1.4 + node.count * 0.14, a: 0.72, amp: 0.8 }));
      if (node.energy >= 0.55) {
        tasks.push(() => hand.spark(random, node.px, node.py, node.radius * 2.2, { col: color, a: 0.76, w: 1.3, nR: 4 + Math.min(5, node.count), noCenter: true }));
      } else {
        tasks.push(() => hand.dotF(random, node.px, node.py, Math.max(2.2, node.radius * 0.34), 0.84, color));
      }
      if (index) tasks.push(() => hand.dotF(random, node.px + rd(random, -5, 5), node.py + rd(random, -5, 5), 1.2, 0.48, inkColor));
    });

    tasks.push(
      () => hand.ellipse(random, center.x, center.y, 13 + plan.entropy * 10, 8 + plan.entropy * 6, { col: inkColor, w: 1.1, a: 0.46, amp: 0.8, gap: 0.16 }),
      () => hand.dotF(random, center.x, center.y, 2.4, 0.72, PALETTE.VIOLET),
    );

    const tallyGap = Math.min(18, (widthUnits - 64) / Math.max(1, plan.tallyCount));
    for (let index = 0; index < plan.tallyCount; index++) {
      const x = 32 + index * tallyGap;
      const color = PALETTE[nodes[index % nodes.length].color] || PALETTE.SLATE;
      tasks.push(() => hand.sk(random, [[x, heightUnits - 28], [x + rd(random, 3, 8), heightUnits - 40 - rd(random, 0, 12)]], { col: color, w: 1.8, a: 0.62, taper: "out", amp: 0.4 }));
    }
    for (let index = 0; index < plan.keywordCount; index++) {
      const color = PALETTE[nodes[(index + 1) % nodes.length].color] || PALETTE.PLUM;
      tasks.push(() => hand.aword(random, Math.max(28, widthUnits - 122), heightUnits - 26 - index * 17, 10, 2 + index, { col: color, a: 0.5, w: 0.9 }));
    }

    return { tasks, reducedMotion: surface.reducedMotion };
  }, [plan.seed]);
  return <canvas ref={ref} data-latest-day-scene data-latest-day-seed={plan.seed} className={className} aria-hidden />;
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
    const anchors = [...parent.querySelectorAll("[data-fable-stanza]")].map((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top - parentRect.top + 12;
    });
    // 가사 왼쪽에 두면 세로로 긴 원문·독음과 겹친다. LyricsView가 비워 둔
    // 오른쪽 padding 안에 실을 놓아 본문 옆 여백만 따라 내려가게 한다.
    const gutter = widthUnits < 480 ? 10 : 15;
    const x = Math.max(5, widthUnits - gutter);
    const tasks = [];
    if (anchors.length) {
      tasks.push(() => hand.threadSeg(random, Math.max(0, anchors[0] - 22), Math.min(heightUnits, anchors.at(-1) + 36), PALETTE.GOLD, 0.72, { x: (y) => x + Math.sin(y * 0.009) * 4, w: 1.35 }));
      for (const y of anchors) tasks.push(() => hand.dotF(random, x + Math.sin(y * 0.009) * 4, y, 3.2, 0.88, PALETTE.VIOLET));
    }
    return { tasks, reducedMotion: surface.reducedMotion };
  }, [seed]);
  return <canvas ref={ref} data-fable-lyric-thread className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden />;
}
