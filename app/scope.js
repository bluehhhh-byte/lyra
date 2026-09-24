"use client";
import { useEffect, useRef } from "react";
import { tapAudio } from "./audio-tap";

function accentColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() ||
    "#c8b6ff"
  );
}

export default function Scope({ audioRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    const ctx2d = canvas.getContext("2d");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let analyser = null;
    let buffer = null;
    let releaseTap = null;
    let raf = 0;
    let color = accentColor();
    let dead = false;

    // the accent flips with the theme; re-read only when it actually changes
    const themeWatch = new MutationObserver(() => (color = accentColor()));
    themeWatch.observe(document.documentElement, { attributeFilter: ["data-theme"] });

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    window.addEventListener("resize", fit);

    const flatline = () => {
      const { clientWidth: w, clientHeight: h } = canvas;
      ctx2d.clearRect(0, 0, w, h);
      ctx2d.strokeStyle = color;
      ctx2d.globalAlpha = 0.35;
      ctx2d.beginPath();
      ctx2d.moveTo(0, h / 2);
      ctx2d.lineTo(w, h / 2);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;
    };

    const draw = () => {
      if (dead || !analyser) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(draw);
      const { clientWidth: w, clientHeight: h } = canvas;
      const buf = buffer;
      analyser.getByteTimeDomainData(buf); // 128 = silence

      ctx2d.clearRect(0, 0, w, h);
      ctx2d.lineWidth = 1.5;
      ctx2d.strokeStyle = color;
      ctx2d.beginPath();
      const step = w / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const y = h / 2 + ((buf[i] - 128) / 128) * (h / 2) * 0.9;
        i ? ctx2d.lineTo(i * step, y) : ctx2d.moveTo(0, y);
      }
      ctx2d.stroke();
    };

    // A MediaElementSource routes the element's audio *through* the graph. If the
    // context is suspended, that route is silent — so never tap the element until
    // we know the context is running. Any failure here leaves playback untouched.
    // audio.paused 를 반드시 본다: 첫 tap 은 await 중이라, 그 사이 사용자가 멈추면
    // halt() 가 먼저 지나가고 뒤늦게 resolve 된 tap 이 정지 상태에서 루프를 켠다.
    // 이미 멈춘 뒤라 pause 이벤트가 다시 오지 않으므로 그대로 영구 가동이 된다.
    const start = () => {
      if (!dead && !reduce && analyser && !raf && !audio.paused) draw();
    };

    // 일시정지·종료 후에도 rAF 가 계속 돌면 아무것도 그리지 않으면서 60fps 를 먹는다.
    const halt = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      flatline();
    };

    const tap = async () => {
      if (dead) return;
      if (analyser) {
        start(); // 두 번째 재생 — 탭은 이미 있고 루프만 다시 돌리면 된다
        return;
      }
      try {
        const tapped = await tapAudio(audio, { fftSize: 1024, smoothing: 0.6 });
        if (dead || !tapped) {
          tapped?.release();
          return;
        }
        analyser = tapped.analyser;
        buffer = new Uint8Array(analyser.fftSize);
        releaseTap = tapped.release;
        start();
      } catch {
        // no Web Audio (or element already tapped) → plain playback, no scope
      }
    };

    flatline();
    audio.addEventListener("play", tap);
    audio.addEventListener("pause", halt);
    audio.addEventListener("ended", halt);
    if (!audio.paused) tap(); // autoplay may have fired before this effect ran

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener("resize", fit);
      audio.removeEventListener("play", tap);
      audio.removeEventListener("pause", halt);
      audio.removeEventListener("ended", halt);
      releaseTap?.();
    };
  }, [audioRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="hidden h-9 w-24 shrink-0 sm:block lg:w-40"
    />
  );
}
