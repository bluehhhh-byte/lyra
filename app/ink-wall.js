"use client";

import { useEffect, useRef } from "react";
import { audioFeatures, composition, hashSlug, strokePoints } from "../lib/ink";
import { tapAudio } from "./audio-tap";

const DRY_TIME = 1000;
const ONSET_THRESHOLD = 0.035;
const SILENCE_THRESHOLD = 0.012;
const WALL_ALPHA = 0.34;

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(`--color-${name}`).trim() || fallback;
  return {
    ink: read("ink", "#f6f1e4"),
    accent: read("accent", "#ce7250"),
    muted: read("muted", "#a89f8d"),
    bg: read("bg", "#181410"),
  };
}

function fitCanvas(canvas) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextWidth = Math.round(width * dpr);
  const nextHeight = Math.round(height * dpr);
  if (canvas.width === nextWidth && canvas.height === nextHeight) return;

  // Resize clears a canvas. Preserve its pixels in an offscreen canvas and
  // scale them back once instead of throwing away the wall on orientation change.
  const saved = document.createElement("canvas");
  saved.width = canvas.width;
  saved.height = canvas.height;
  if (saved.width && saved.height) saved.getContext("2d").drawImage(canvas, 0, 0);
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (saved.width && saved.height)
    context.drawImage(saved, 0, 0, saved.width, saved.height, 0, 0, width, height);
}

function visibleStrokes(plan, width, height) {
  const areaRatio = Math.min(1, (width * height) / (900 * 700));
  const limit = Math.max(3, Math.round(plan.strokes.length * Math.max(0.42, areaRatio)));
  if (limit >= plan.strokes.length) return plan.strokes;
  const required = plan.strokes.filter((stroke) => stroke.kind === "circle" || stroke.kind === "dot");
  const rest = plan.strokes.filter((stroke) => stroke.kind !== "circle" && stroke.kind !== "dot");
  const picked = [...required];
  const slots = Math.max(0, limit - picked.length);
  for (let i = 0; i < slots; i++) picked.push(rest[Math.floor((i / slots) * rest.length)]);
  return picked;
}

function preparedPlan(track, width, height) {
  const plan = composition(hashSlug(track.slug), track);
  return {
    ...plan,
    strokes: visibleStrokes(plan, width, height).map((stroke, index) => ({
      stroke,
      points: strokePoints(stroke, plan.noiseSeed + index * 17, 1),
      progress: 0,
      drawn: 0,
    })),
  };
}

function pseudoSpectrum(target, time, seed) {
  const beat = Math.max(0, Math.sin(time * 6.4 + (seed % 31))) ** 8;
  for (let i = 0; i < target.length; i++) {
    const band = i / target.length;
    const drift = Math.sin(time * (1.3 + band * 2.7) + i * 0.19 + seed * 0.001);
    const lowBoost = band < 0.12 ? beat * 115 : 0;
    target[i] = Math.max(0, Math.min(255, 34 + drift * 24 + lowBoost + (1 - band) * 28));
  }
}

function drawDot(context, item, features, colors, width, height) {
  const point = item.points[0];
  if (!point || item.drawn) return;
  const color = colors[item.stroke.palette] || colors.ink;
  const size = Math.min(width, height);
  context.save();
  context.globalAlpha = Math.min(0.25, 0.08 + features.rms * 0.17);
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = features.treble * 4;
  context.beginPath();
  context.arc(point.x * width, point.y * height, point.radius * size * (0.75 + features.bass), 0, Math.PI * 2);
  context.fill();
  context.restore();
  item.drawn = 1;
}

function drawIncrement(context, item, features, colors, width, height) {
  if (item.stroke.kind === "dot") {
    drawDot(context, item, features, colors, width, height);
    return;
  }
  const next = Math.min(item.points.length - 1, Math.ceil(item.progress * (item.points.length - 1)));
  if (next <= item.drawn || item.points.length < 2) return;
  const color = colors[item.stroke.palette] || colors.ink;
  context.save();
  context.globalAlpha = Math.min(0.25, 0.045 + features.rms * 0.205);
  context.strokeStyle = color;
  context.lineWidth = item.stroke.width * (0.7 + features.bass * 1.65);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = color;
  context.shadowBlur = features.treble * 3;
  context.beginPath();
  const previous = item.points[Math.max(0, item.drawn)];
  context.moveTo(previous.x * width, previous.y * height);
  for (let i = Math.max(1, item.drawn + 1); i <= next; i++)
    context.lineTo(item.points[i].x * width, item.points[i].y * height);
  context.stroke();
  context.restore();
  item.drawn = next;
}

function renderStatic(context, plan, colors, width, height) {
  const features = { bass: 0.35, mid: 0.4, treble: 0.12, rms: 0.42, flux: 0 };
  for (const item of plan.strokes) {
    item.progress = 1;
    drawIncrement(context, item, features, colors, width, height);
  }
}

export default function InkWall({ audioRef, track, playing }) {
  const wallRef = useRef(null);
  const activeRef = useRef(null);
  const rootRef = useRef(null);
  const hasActiveInk = useRef(false);
  const controls = useRef({ start() {}, stop() {} });

  useEffect(() => {
    const wall = wallRef.current;
    const active = activeRef.current;
    if (!wall || !active) return;
    const fit = () => {
      fitCanvas(wall);
      fitCanvas(active);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (playing) controls.current.start();
    else controls.current.stop("paused");
  }, [playing]);

  useEffect(() => {
    const wall = wallRef.current;
    const active = activeRef.current;
    const root = rootRef.current;
    if (!wall || !active || !root) return;
    const wallContext = wall.getContext("2d");
    const activeContext = active.getContext("2d");
    const audio = audioRef.current;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let colors = themeColors();
    let dead = false;
    let ready = false;
    let wantsPlay = Boolean(playing || (audio && !audio.paused));
    let raf = 0;
    let timer = 0;
    let releaseTap = null;
    let analyser = null;
    let tapTask = null;
    let frequencyData = null;
    let previousFeatures = null;
    let lastFrame = 0;
    let lastOnset = 0;
    let zeroSince = 0;
    let silentSince = 0;
    let pseudo = false;
    let plan = null;
    let nextStroke = 0;
    let activeStrokes = [];

    const setState = (state) => {
      root.dataset.inkState = state;
      root.dataset.inkPseudo = pseudo ? "true" : "false";
    };

    const stop = (state = "paused") => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (!dead) setState(state);
    };

    const clearActive = () => {
      activeContext.save();
      activeContext.setTransform(1, 0, 0, 1, 0, 0);
      activeContext.clearRect(0, 0, active.width, active.height);
      activeContext.restore();
      hasActiveInk.current = false;
    };

    const commitActive = () => {
      if (!hasActiveInk.current) return;
      wallContext.save();
      wallContext.setTransform(1, 0, 0, 1, 0, 0);
      wallContext.globalAlpha = WALL_ALPHA;
      wallContext.drawImage(active, 0, 0);
      wallContext.restore();
      clearActive();
    };

    const dryPrevious = () => new Promise((resolve) => {
      if (!hasActiveInk.current || reduce) {
        if (reduce) clearActive();
        resolve();
        return;
      }
      setState("drying");
      active.style.transition = `opacity ${DRY_TIME}ms cubic-bezier(0.23, 1, 0.32, 1), filter ${DRY_TIME}ms ease`;
      active.style.opacity = "0.18";
      active.style.filter = "saturate(0.35)";
      timer = window.setTimeout(() => {
        if (dead) return;
        commitActive();
        active.style.transition = "none";
        active.style.opacity = "1";
        active.style.filter = "none";
        requestAnimationFrame(() => {
          active.style.transition = "filter 1200ms ease";
        });
        resolve();
      }, DRY_TIME);
    });

    const launchStroke = () => {
      if (!plan || nextStroke >= plan.strokes.length) return false;
      activeStrokes.push(plan.strokes[nextStroke++]);
      return true;
    };

    const schedule = (frame) => {
      if (!raf && !dead && ready && wantsPlay && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const frame = (now) => {
      raf = 0;
      if (dead || !ready || !wantsPlay || document.hidden || audio?.paused) return;
      const delta = Math.min(50, lastFrame ? now - lastFrame : 16.7) / 1000;
      lastFrame = now;

      if (analyser) {
        frequencyData ||= new Uint8Array(analyser.frequencyBinCount);
        frequencyData.fill(0);
        analyser.getByteFrequencyData(frequencyData);
        const allZero = frequencyData.every((value) => value === 0);
        if (allZero) {
          zeroSince ||= now;
          if (now - zeroSince > 1000) pseudo = true;
        } else {
          zeroSince = 0;
          pseudo = false;
        }
      } else {
        frequencyData ||= new Uint8Array(512);
        pseudo = true;
      }
      if (pseudo) pseudoSpectrum(frequencyData, audio?.currentTime || now / 1000, plan.seed);

      const features = audioFeatures(frequencyData, previousFeatures);
      previousFeatures = features;
      setState("drawing");
      if (features.rms < SILENCE_THRESHOLD) {
        silentSince ||= now;
        if (now - silentSince > 2000) {
          active.style.filter = "saturate(0.35)";
          setState("dry");
          schedule(frame);
          return;
        }
      } else {
        silentSince = 0;
        active.style.filter = "none";
      }

      if (!activeStrokes.length) launchStroke();
      if (features.flux > ONSET_THRESHOLD && now - lastOnset > 140) {
        launchStroke();
        lastOnset = now;
      }
      const width = window.innerWidth;
      const height = window.innerHeight;
      for (const item of activeStrokes) {
        item.progress = Math.min(1, item.progress + delta * item.stroke.speed * (0.08 + features.mid * 0.55));
        drawIncrement(activeContext, item, features, colors, width, height);
        hasActiveInk.current = true;
      }
      activeStrokes = activeStrokes.filter((item) => item.progress < 1);
      if (!activeStrokes.length && nextStroke >= plan.strokes.length) {
        stop("complete");
        return;
      }
      schedule(frame);
    };

    const start = async () => {
      wantsPlay = true;
      if (!ready || reduce || document.hidden || audio?.paused || raf) return;
      if (!tapTask) {
        tapTask = tapAudio(audio, { fftSize: 1024, smoothing: 0.72 })
          .catch(() => null);
      }
      const tapped = await tapTask;
      if (dead) {
        tapped?.release();
        return;
      }
      if (!wantsPlay) return;
      if (tapped && !analyser) {
        analyser = tapped.analyser;
        releaseTap = tapped.release;
      }
      schedule(frame);
    };

    const onPlay = () => {
      wantsPlay = true;
      void start();
    };
    const onPause = () => {
      wantsPlay = false;
      stop("paused");
    };
    const onVisibility = () => {
      if (document.hidden) stop("hidden");
      else if (wantsPlay) void start();
    };
    const themeWatch = new MutationObserver(() => {
      colors = themeColors();
    });
    themeWatch.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    audio?.addEventListener("play", onPlay);
    audio?.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onVisibility);
    controls.current = { start: onPlay, stop: onPause };

    const prepare = async () => {
      await dryPrevious();
      if (dead || !track) {
        setState("idle");
        return;
      }
      plan = preparedPlan(track, window.innerWidth, window.innerHeight);
      ready = true;
      if (reduce) {
        clearActive();
        renderStatic(activeContext, plan, colors, window.innerWidth, window.innerHeight);
        hasActiveInk.current = true;
        setState("static");
        return;
      }
      setState(wantsPlay ? "waiting" : "paused");
      if (wantsPlay) void start();
    };
    void prepare();

    return () => {
      dead = true;
      if (raf) cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
      releaseTap?.();
      themeWatch.disconnect();
      audio?.removeEventListener("play", onPlay);
      audio?.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onVisibility);
      controls.current = { start() {}, stop() {} };
    };
  }, [audioRef, track?.slug, track?.preview]);

  return (
    <div
      ref={rootRef}
      data-ink-wall
      data-ink-state={track ? "waiting" : "idle"}
      data-ink-pseudo="false"
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <canvas ref={wallRef} data-ink-layer="wall" className="absolute inset-0 h-full w-full" />
      <canvas ref={activeRef} data-ink-layer="active" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
