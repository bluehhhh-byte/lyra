"use client";
import { useState } from "react";

const MODES = [
  { key: "both", label: "둘 다" },
  { key: "orig", label: "원문만" },
  { key: "trans", label: "번역만" },
];

export default function LyricsView({ stanzas, lang }) {
  const [mode, setMode] = useState("both");

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
          <section key={i}>
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
