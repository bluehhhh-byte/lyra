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
      if (dead || !analyser) return;
      raf = requestAnimationFrame(draw);
      const { clientWidth: w, clientHeight: h } = canvas;
      const buf = new Uint8Array(analyser.fftSize);
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
    const tap = async () => {
      if (dead || analyser) return;
      try {
        const tapped = await tapAudio(audio, { fftSize: 1024, smoothing: 0.6 });
        if (dead || !tapped) {
          tapped?.release();
          return;
        }
        analyser = tapped.analyser;
        releaseTap = tapped.release;
        if (!reduce) draw();
      } catch {
        // no Web Audio (or element already tapped) → plain playback, no scope
      }
    };

    flatline();
    audio.addEventListener("play", tap);
    if (!audio.paused) tap(); // autoplay may have fired before this effect ran

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
      window.removeEventListener("resize", fit);
      audio.removeEventListener("play", tap);
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
