"use client";
import { useState } from "react";

// Minimal movie roster: view registered films, delete one. (Meta regen etc. can
// come later — for now the add flow is the main surface.)
export default function MovieTools({ movies }) {
  const [state, setState] = useState({}); // slug -> { busy, err }

  const del = async (slug, title) => {
    if (!confirm(`"${title}" 삭제?`)) return;
    setState((s) => ({ ...s, [slug]: { busy: true } }));
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "movieDelete", slug }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState((s) => ({ ...s, [slug]: { gone: true } }));
    } catch (e) {
      setState((s) => ({ ...s, [slug]: { err: e.message } }));
    }
  };

  return (
    <ul className="max-w-2xl divide-y divide-line rounded-lg border border-line">
      {movies.map((m) => {
        const st = state[m.slug] || {};
        return (
          <li key={m.slug} className={`flex items-center gap-3 px-3 py-2 text-sm ${st.gone ? "opacity-40" : ""}`}>
            <img src={m.poster} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{m.title}</span>
              <span className="text-muted"> — {m.director}</span>
              {m.rating != null && <span className="ml-2 text-xs text-accent">★ {m.rating.toFixed(1)}</span>}
            </span>
            <a href={`/movies/${m.slug}`} className="shrink-0 text-xs text-muted transition hover:text-accent">
              보기
            </a>
            {st.gone ? (
              <span className="shrink-0 text-xs text-muted">삭제됨 (재배포 후 반영)</span>
            ) : (
              <button
                onClick={() => del(m.slug, m.title)}
                disabled={st.busy}
                className="shrink-0 text-xs text-red-400 transition hover:underline disabled:opacity-40"
              >
                {st.busy ? "삭제 중…" : "삭제"}
              </button>
            )}
            {st.err && <span className="shrink-0 text-xs text-red-400">{st.err}</span>}
          </li>
        );
      })}
    </ul>
  );
}
