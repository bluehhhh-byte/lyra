"use client";
import { useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export default function MovieTools({ movies }) {
  const [state, setState] = useState({}); // slug -> { busy, err, msg, comment }
  const set = (slug, patch) => setState((s) => ({ ...s, [slug]: { ...s[slug], ...patch } }));

  const regenMeta = async (slug) => {
    set(slug, { busy: "meta", err: "", msg: "" });
    try {
      const { updated } = await api("movieRegenMeta", { slug });
      set(slug, { msg: updated?.length ? `갱신: ${updated.join(", ")}` : "변경 없음" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const regenComment = async (slug) => {
    set(slug, { busy: "comment", err: "", msg: "" });
    try {
      const { comment } = await api("movieRegenComment", { slug });
      set(slug, { comment });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const del = async (slug, title) => {
    if (!confirm(`"${title}" 삭제?`)) return;
    set(slug, { busy: "delete", err: "", msg: "" });
    try {
      await api("movieDelete", { slug });
      set(slug, { gone: true });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  return (
    <ul className="max-w-2xl divide-y divide-line rounded-lg border border-line">
      {movies.map((m) => {
        const st = state[m.slug] || {};
        return (
          <li key={m.slug} className={`px-3 py-2 text-sm ${st.gone ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-3">
              <img src={m.poster} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{m.title}</span>
                <span className="text-muted"> — {m.director}</span>
                {m.media === "tv" && <span className="ml-2 text-xs text-muted">드라마</span>}
                {m.rating != null && <span className="ml-2 text-xs text-accent">★ {m.rating.toFixed(1)}</span>}
              </span>
              <button
                onClick={() => regenMeta(m.slug)}
                disabled={st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "meta" ? "생성 중…" : "메타 재생성"}
              </button>
              <button
                onClick={() => regenComment(m.slug)}
                disabled={st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "comment" ? "생성 중…" : "코멘트"}
              </button>
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
                  {st.busy === "delete" ? "삭제 중…" : "삭제"}
                </button>
              )}
            </div>
            <p className="mt-1 pl-11 text-xs text-muted">
              {st.err ? (
                <span className="text-red-400">{st.err}</span>
              ) : st.msg ? (
                <span className="text-accent">{st.msg}</span>
              ) : (
                st.comment ?? m.comment ?? "(코멘트 없음)"
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
