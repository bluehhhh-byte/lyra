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

  const updateRating = async (slug, rating) => {
    set(slug, { busy: "rating", err: "", msg: "" });
    try {
      const { rating: saved } = await api("movieUpdateRating", { slug, rating });
      set(slug, { rating: saved, msg: `별점 ${saved ? saved.toFixed(1) : "—"} 저장됨` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

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
        const rating = st.rating ?? m.rating;
        return (
          <li key={m.slug} className={`px-3 py-2 text-sm ${st.gone ? "opacity-40" : ""}`}>
            <div className="flex items-center gap-3">
              <img src={m.poster} alt="" loading="lazy" className="h-12 w-8 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{m.title}</span>
                <span className="text-muted"> — {m.director}</span>
                {m.media === "tv" && <span className="ml-2 text-xs text-muted">드라마</span>}
                {rating != null && <span className="ml-2 text-xs text-accent">★ {rating.toFixed(1)}</span>}
              </span>
              <button
                onClick={() => set(m.slug, { ratingOpen: !st.ratingOpen, err: "", msg: "" })}
                disabled={st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                별점
              </button>
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
            {st.ratingOpen && (
              <div className="mt-2 flex items-center gap-2 pl-11 text-xs text-muted">
                <span>별점 수정</span>
                <StarInput
                  value={rating || 0}
                  disabled={!!st.busy}
                  onChange={(next) => updateRating(m.slug, next)}
                />
                <button
                  onClick={() => updateRating(m.slug, 0)}
                  disabled={!!st.busy}
                  className="text-muted hover:text-accent disabled:opacity-40"
                >
                  지우기
                </button>
              </div>
            )}
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

function StarInput({ value, onChange, disabled }) {
  const step = (delta) => {
    const next = Math.min(5, Math.max(0.5, Math.round((value + delta) * 2) / 2));
    onChange(next);
  };

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="별점 수정">
      <button
        type="button"
        disabled={disabled || value <= 0.5}
        onClick={() => step(-0.5)}
        className="h-7 w-7 rounded-full border border-line text-sm text-muted hover:text-accent disabled:opacity-30"
        aria-label="별점 0.5점 낮추기"
      >
        -
      </button>
      <span className="min-w-12 rounded-full border border-line px-2 py-1 text-center text-xs font-semibold text-accent">
        ★ {value ? value.toFixed(1) : "—"}
      </span>
      <button
        type="button"
        disabled={disabled || value >= 5}
        onClick={() => step(0.5)}
        className="h-7 w-7 rounded-full border border-line text-sm text-muted hover:text-accent disabled:opacity-30"
        aria-label="별점 0.5점 높이기"
      >
        +
      </button>
      <div className="ml-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-7 w-7 rounded-full border text-xs transition disabled:opacity-40 ${
              value === n
                ? "border-accent bg-accent font-semibold text-bg"
                : "border-line text-muted hover:text-accent"
            }`}
            aria-label={`${n}점으로 수정`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
