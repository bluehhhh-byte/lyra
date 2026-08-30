"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createWall } from "../lib/fable/wall";
import { createHand } from "../lib/fable/primitives";
import { hashSeed, PALETTE, rd, shade, stream } from "../lib/fable/core";

const WIDTH_UNITS = 1600;
const SCRATCH_COLORS = [PALETTE.OCHRE, PALETTE.ROSE, PALETTE.TEAL, PALETTE.SLATE, PALETTE.SAGE];

function drawGround(wall, pathname) {
  const hand = createHand(wall);
  const random = stream(hashSeed(`wall:${pathname}`));
  const dark = document.documentElement.dataset.theme !== "light";
  const cssScale = wall.cssScale();
  const main = document.querySelector("main");
  const rect = main?.getBoundingClientRect();
  const left = rect ? Math.max(20, (rect.left - 14) / cssScale) : 140;
  const right = rect ? Math.min(WIDTH_UNITS - 20, (rect.right + 14) / cssScale) : 1460;
  const top = rect ? Math.max(70, (rect.top + scrollY - 18) / cssScale) : 90;
  const bottom = wall.heightUnits + 28;

  if (!dark) {
    wall.generate([
      () => hand.sheet(random, left, top, right, bottom, PALETTE.CREAM, { rough: 14 }),
      () => hand.drip(random, left * 0.55, top - 10, rd(random, 45, 90), shade(PALETTE.CREAM, 0.3), 0.62, 2.2),
      () => hand.drip(random, right + (WIDTH_UNITS - right) * 0.55, top - 10, rd(random, 30, 65), PALETTE.CINK, 0.28, 1.6),
      () => hand.spatter(random, Math.max(35, left * 0.45), top + 420, 72, 18, PALETTE.CLAY, 0.3),
      () => hand.spatter(random, Math.min(WIDTH_UNITS - 35, right + (WIDTH_UNITS - right) * 0.48), top + 980, 58, 14, PALETTE.GOLD, 0.26),
      () => hand.whispers(random, top + 60, Math.max(top + 120, bottom - 80), true, Math.min(12, Math.max(3, Math.round(wall.heightUnits / 1500)))),
    ]);
    return;
  }

  wall.generate([
    () => hand.sheet(random, left, top, right, bottom, PALETTE.VOID, { rough: 14, noCore: true }),
    () => hand.whispers(random, top + 60, Math.max(top + 120, bottom - 80), true, Math.min(10, Math.max(3, Math.round(wall.heightUnits / 1700)))),
  ]);
}

function mountTrail(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const context = canvas.getContext("2d");
  let points = [];
  let frame = 0;
  let dead = false;
  let traveled = 0;
  let touchStroke = 0;

  const resize = () => {
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = "round";
  };

  const draw = (now) => {
    frame = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
    if (dead || reduce.matches) {
      points = [];
      return;
    }
    const mainRect = document.querySelector("main")?.getBoundingClientRect();
    const life = 3200;
    while (points.length && now - points[0].time > life) points.shift();
    for (let index = 1; index < points.length; index++) {
      const before = points[index - 1];
      const point = points[index];
      if (point.stroke !== before.stroke || point.time - before.time > 110) continue;
      const age = (now - point.time) / life;
      const strength = 1 - age;
      if (strength <= 0) continue;
      const onPaper = mainRect && point.x >= mainRect.left - 14 && point.x <= mainRect.right + 14;
      const dark = document.documentElement.dataset.theme !== "light";
      const color = dark ? SCRATCH_COLORS[point.colorIndex % SCRATCH_COLORS.length] : (onPaper ? PALETTE.INK : PALETTE.CINK);
      const wobbleX = Math.sin(now * 0.0011 + index * 0.7) * 1.3 * age;
      const wobbleY = Math.cos(now * 0.0009 + index * 1.1) * 1.3 * age;
      const dx = point.x - before.x;
      const dy = point.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const passes = dark ? [-1.35, 0, 1.15] : [0];
      for (const offset of passes) {
        const passStrength = offset ? 0.5 : 1;
        context.strokeStyle = `rgba(${color.join(",")},${0.28 * passStrength * strength * strength})`;
        context.lineWidth = (offset ? 0.72 : 1.05) + 1.35 * strength;
        context.beginPath();
        context.moveTo(before.x + wobbleX + nx * offset, before.y + wobbleY + ny * offset);
        context.lineTo(point.x + wobbleX + nx * offset, point.y + wobbleY + ny * offset);
        context.stroke();
      }
    }
    if (points.length) frame = requestAnimationFrame(draw);
  };

  const appendPoint = (x, y, stroke) => {
    if (reduce.matches) return;
    const last = points.at(-1);
    const sameStroke = last?.stroke === stroke;
    const distance = sameStroke ? Math.hypot(x - last.x, y - last.y) : 0;
    if (sameStroke && distance < 3) return;
    traveled += distance;
    points.push({ x, y, time: performance.now(), colorIndex: Math.floor(traveled / 42), stroke });
    if (points.length > 400) points.shift();
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const move = (event) => {
    // 터치는 아래 touchmove에서 받는다. pointermove까지 함께 받으면 같은 좌표가
    // 두 번 들어오고, 모바일 스크롤이 pointercancel을 보낼 때 선이 끊어진다.
    if (event.pointerType === "touch") return;
    if (event.pointerType !== "pen" && !finePointer.matches) return;
    appendPoint(event.clientX, event.clientY, event.pointerType === "pen" ? `pen:${event.pointerId}` : "mouse");
  };

  // passive touchmove라 손가락을 따라 그리면서도 페이지의 세로 스크롤을 막지 않는다.
  // 한 번 뗐다 다시 누르면 stroke가 달라져 두 손동작 사이에 직선이 생기지 않는다.
  const touchStart = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchStroke += 1;
    appendPoint(touch.clientX, touch.clientY, `touch:${touch.identifier}:${touchStroke}`);
  };
  const touchMove = (event) => {
    const touch = event.touches[0];
    if (!touch) return;
    appendPoint(touch.clientX, touch.clientY, `touch:${touch.identifier}:${touchStroke}`);
  };

  const clear = () => {
    points = [];
    traveled = 0;
    context.clearRect(0, 0, innerWidth, innerHeight);
  };
  resize();
  addEventListener("resize", resize);
  addEventListener("pointermove", move, { passive: true });
  addEventListener("touchstart", touchStart, { passive: true });
  addEventListener("touchmove", touchMove, { passive: true });
  reduce.addEventListener("change", clear);
  finePointer.addEventListener("change", clear);
  return () => {
    dead = true;
    cancelAnimationFrame(frame);
    removeEventListener("resize", resize);
    removeEventListener("pointermove", move);
    removeEventListener("touchstart", touchStart);
    removeEventListener("touchmove", touchMove);
    reduce.removeEventListener("change", clear);
    finePointer.removeEventListener("change", clear);
    clear();
  };
}

export default function FableEnvironment() {
  const pathname = usePathname();
  const wallRef = useRef(null);
  const trailRef = useRef(null);

  useEffect(() => {
    const container = wallRef.current;
    if (!container) return;
    let wall = null;
    let resizeTimer = 0;
    let dead = false;

    const build = () => {
      if (dead) return;
      wall?.destroy();
      const cssScale = innerWidth / WIDTH_UNITS;
      const heightUnits = Math.max(1600, Math.ceil(document.documentElement.scrollHeight / cssScale) + 80);
      wall = createWall(container, { widthUnits: WIDTH_UNITS, heightUnits, onError: (error) => console.error("fable mark", error) });
      drawGround(wall, pathname);
    };
    const schedule = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(build, 180);
    };

    build();
    document.fonts?.ready.then(schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    const themeObserver = new MutationObserver(schedule);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    addEventListener("resize", schedule);
    return () => {
      dead = true;
      clearTimeout(resizeTimer);
      observer.disconnect();
      themeObserver.disconnect();
      removeEventListener("resize", schedule);
      wall?.destroy();
    };
  }, [pathname]);

  useEffect(() => {
    if (!trailRef.current) return;
    return mountTrail(trailRef.current);
  }, []);

  return (
    <>
      <div data-fable-wall className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div ref={wallRef} className="absolute left-0 top-0" />
      </div>
      <canvas ref={trailRef} data-fable-trail className="pointer-events-none fixed inset-0 z-20" aria-hidden />
    </>
  );
}
