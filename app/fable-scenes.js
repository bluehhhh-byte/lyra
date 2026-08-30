"use client";

import { useEffect, useRef } from "react";
import { createCanvasSurface } from "../lib/fable/wall";
import { createHand } from "../lib/fable/primitives";
import { hashSeed, PALETTE, rd, stream } from "../lib/fable/core";
import { reportArtworkPlan } from "../lib/report-artwork";

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
    return () => {
      clearTimeout(resizeTimer);
      cancelTasks();
      observer.disconnect();
    };
  }, dependencies);
}

export function FableHomeScene({ insights, className = "" }) {
  const ref = useRef(null);
  const seed = reportArtworkPlan(insights).seed;
  useCanvasScene(ref, (canvas) => {
    const rect = canvas.getBoundingClientRect();
    const heightUnits = 780;
    const widthUnits = heightUnits * (rect.width / Math.max(1, rect.height));
    const centerX = widthUnits / 2;
    const surface = createCanvasSurface(canvas, { widthUnits, heightUnits });
    const hand = createHand(surface);
    const random = stream(seed);
    const tasks = [
      () => hand.enso(random, centerX, 210, 138, 0.88, PALETTE.INK, { w: 9, a: 0.78 }),
      () => hand.spark(random, centerX, 218, 27, { col: PALETTE.CLAY, a: 0.96, w: 2.2, nR: 7 }),
    ];
    for (let y = 390; y < 650; y += rd(random, 31, 47)) {
      const yy = y;
      tasks.push(() => hand.dotF(random, centerX + 4 + Math.sin(yy * 0.012) * 8 + rd(random, -3, 3), yy, rd(random, 1.8, 3), rd(random, 0.45, 0.7), PALETTE.INK));
    }
    tasks.push(
      () => hand.arrowHead(random, centerX + 6, 682, Math.PI / 2, 18, 0.62, PALETTE.INK, 1.7),
      () => hand.write(random, "songs i keep", 22, 750, 24, { col: PALETTE.INK, a: 0.76 }),
    );
    return { tasks, reducedMotion: surface.reducedMotion };
  }, [seed]);
  return <canvas ref={ref} data-fable-home-scene className={className} aria-hidden />;
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
    const tasks = [];
    for (let y = 42; y < heightUnits - 18; y += 23 + rd(random, -1.5, 1.5)) {
      const yy = y;
      const color = Math.round(y) % 7 === 0 ? PALETTE.SLATE : Math.round(y) % 11 === 0 ? PALETTE.CLAY : PALETTE.INK;
      if (yy < silence.top || yy > silence.bottom) {
        tasks.push(() => hand.atext(random, 24, widthUnits - 24, yy, 15, { col: color, a: rd(random, 0.2, 0.4), w: 1.1 }));
      } else {
        if (silence.left > 48) tasks.push(() => hand.atext(random, 24, silence.left, yy, 15, { col: color, a: rd(random, 0.24, 0.46), w: 1.1 }));
        if (silence.right < widthUnits - 48) tasks.push(() => hand.atext(random, silence.right, widthUnits - 24, yy, 15, { col: color, a: rd(random, 0.24, 0.46), w: 1.1 }));
      }
    }
    tasks.push(() => hand.spark(random, (silence.left + silence.right) / 2, (silence.top + silence.bottom) / 2, 28, { col: PALETTE.CLAY, a: 0.8, w: 2.1, nR: 8 }));
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
    return {
      reducedMotion: true,
      tasks: [
        () => hand.enso(random, 50, 50, 34, 0.88, PALETTE.INK, { w: 5.4, a: 0.84 }),
        () => hand.spark(random, 50, 50, 9, { col: PALETTE.CLAY, a: 0.96, w: 1.8, nR: 7 }),
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
    return {
      reducedMotion: true,
      tasks: [() => hand.write(random, text, 8, 58, 34, { col: PALETTE.INK, a: 0.72 })],
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
    const x = Math.max(5, Math.min(16, widthUnits * 0.025));
    const tasks = [];
    if (anchors.length) {
      tasks.push(() => hand.threadSeg(random, Math.max(0, anchors[0] - 22), Math.min(heightUnits, anchors.at(-1) + 36), PALETTE.GOLD, 0.72, { x: (y) => x + Math.sin(y * 0.009) * 4, w: 1.35 }));
      for (const y of anchors) tasks.push(() => hand.dotF(random, x + Math.sin(y * 0.009) * 4, y, 3.2, 0.88, PALETTE.CLAY));
    }
    return { tasks, reducedMotion: surface.reducedMotion };
  }, [seed]);
  return <canvas ref={ref} data-fable-lyric-thread className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden />;
}
