"use client";
import { useEffect, useState } from "react";

const MODES = [
  { key: "both", label: "둘 다" },
  { key: "orig", label: "원문만" },
  { key: "trans", label: "번역만" },
];

export default function LyricsView({ stanzas, lang }) {
  const [mode, setMode] = useState("both");
  const [copied, setCopied] = useState(-1);
  const [active, setActive] = useState(-1); // stanza highlighted from #hash

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

  const copyLink = (i) => {
    const url = `${location.origin}${location.pathname}#v${i}`;
    navigator.clipboard?.writeText(url);
    history.replaceState(null, "", `#v${i}`);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? -1 : c)), 1500);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex justify-center gap-1.5">
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

      <div className="space-y-10">
        {stanzas.map((stanza, i) => (
          <section
            key={i}
            id={`v${i}`}
            className={`group relative scroll-mt-24 rounded-lg transition-colors duration-1000 ${
              active === i ? "bg-accent/10" : ""
            }`}
          >
            {/* deep-link / copy button — appears on hover, sits in the left gutter */}
            <button
              onClick={() => copyLink(i)}
              aria-label="이 구절 링크 복사"
              title={copied === i ? "복사됨" : "이 구절 링크 복사"}
              className="absolute -left-7 top-1 text-xs text-muted/40 opacity-0 transition group-hover:opacity-100 hover:text-accent focus:opacity-100"
            >
              {copied === i ? "✓" : "🔗"}
            </button>

            {stanza.section && (
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
                {stanza.section}
              </p>
            )}
            <div className="space-y-4">
              {stanza.lines.map((line, j) => (
                <div key={j}>
                  {mode !== "trans" && (
                    <p lang={lang || "en"} className="font-serif text-lg leading-snug">
                      {line.en}
                    </p>
                  )}
                  {mode !== "trans" && line.reading && (
                    <p className="mt-0.5 text-xs text-muted/70">{line.reading}</p>
                  )}
                  {mode !== "orig" && line.ko && (
                    <p className={`text-sm text-muted ${mode === "both" ? "mt-0.5" : ""}`}>
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
