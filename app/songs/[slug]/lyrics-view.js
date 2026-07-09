"use client";
import { useEffect, useState } from "react";

const MODES = [
  { key: "both", label: "둘 다" },
  { key: "orig", label: "원문만" },
  { key: "trans", label: "번역만" },
];

// one scale step per size — original stays a notch above the translation
const SIZES = {
  s: { orig: "text-base", reading: "text-[11px]", trans: "text-xs", gap: "space-y-3" },
  m: { orig: "text-lg", reading: "text-xs", trans: "text-sm", gap: "space-y-4" },
  l: { orig: "text-2xl", reading: "text-sm", trans: "text-base", gap: "space-y-5" },
};
const SIZE_KEYS = ["s", "m", "l"];

const STORE_KEY = "lyra_read"; // { mode, size } — survives navigation between songs

export default function LyricsView({ stanzas, lang }) {
  const [mode, setMode] = useState("both");
  const [size, setSize] = useState("m");
  const [active, setActive] = useState(-1); // stanza highlighted from #hash
  const [progress, setProgress] = useState(0);

  // restore prefs after mount — reading localStorage during render breaks hydration
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (MODES.some((m) => m.key === saved.mode)) setMode(saved.mode);
      if (SIZES[saved.size]) setSize(saved.size);
    } catch {} // corrupt value — fall back to defaults
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ mode, size }));
  }, [mode, size]);

  // reading progress across the whole page
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // on load / hash change: scroll to the linked stanza and flash it
  useEffect(() => {
    const jump = () => {
      const m = location.hash.match(/^#v(\d+)$/);
      if (!m) return;
      const i = +m[1];
      setActive(i);
      document.getElementById(`v${i}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, []);

  const s = SIZES[size];

  return (
    <div className="mx-auto max-w-2xl">
      {/* toolbar sticks so mode/size stay reachable deep into a long song */}
      <div className="sticky top-0 z-20 mb-8 border-b border-line bg-bg/85 py-3 backdrop-blur">
        <div className="mb-2.5 h-0.5 w-full rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-150"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  mode === m.key
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {SIZE_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setSize(k)}
                aria-label={`글자 크기 ${k}`}
                aria-pressed={size === k}
                className={`rounded-full border px-2 py-1 leading-none transition ${
                  k === "s" ? "text-[10px]" : k === "m" ? "text-xs" : "text-sm"
                } ${
                  size === k
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                가
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {stanzas.map((stanza, i) => (
          <section
            key={i}
            id={`v${i}`}
            className={`scroll-mt-24 rounded-lg transition-colors duration-1000 ${
              active === i ? "bg-accent/10" : ""
            }`}
          >
            {stanza.section && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
                {stanza.section}
              </p>
            )}
            <div className={s.gap}>
              {stanza.lines.map((line, j) => (
                <div key={j}>
                  {mode !== "trans" && (
                    <p lang={lang || "en"} className={`font-serif leading-snug ${s.orig}`}>
                      {line.en}
                    </p>
                  )}
                  {mode !== "trans" && line.reading && (
                    <p className={`mt-0.5 text-muted/70 ${s.reading}`}>{line.reading}</p>
                  )}
                  {mode !== "orig" && line.ko && (
                    <p
                      lang="ko"
                      className={`font-batang text-muted ${s.trans} ${mode === "both" ? "mt-0.5" : ""}`}
                    >
                      {line.ko}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {stanza.note && (
              <p className="mt-4 rounded-lg bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
                <span className="mr-1.5 font-semibold text-accent">노트</span>
                {stanza.note}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
