"use client";

import { useEffect, useMemo, useState } from "react";
import { tmdbUrl } from "../../lib/tmdb-link";
import CoverImage from "../cover-image";

const KEY = "cyno_recommendation_feedback_v1";

export default function MovieRecs({ items }) {
  const [feedback, setFeedback] = useState({});
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    try { setFeedback(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { setFeedback({}); }
  }, []);

  const update = (id, status) => {
    const next = { ...feedback };
    if (next[id] === status) delete next[id];
    else next[id] = status;
    setFeedback(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 불가 환경에서도 현재 화면 상태는 유지 */ }
  };

  const visible = useMemo(
    () => items.filter((movie) => {
      const status = feedback[String(movie.tmdbId)];
      if (status === "dismissed" || status === "seen") return false;
      return !savedOnly || status === "saved";
    }),
    [items, feedback, savedOnly]
  );
  const saved = items.filter((movie) => feedback[String(movie.tmdbId)] === "saved").length;

  return (
    <div>
      {saved > 0 && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setSavedOnly((value) => !value)} aria-pressed={savedOnly} className={` border px-3 py-1 text-xs ${savedOnly ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-accent"}`}>
            보고 싶음 {saved}편{savedOnly ? " · 전체 보기" : ""}
          </button>
        </div>
      )}
      {visible.length ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((movie) => {
            const id = String(movie.tmdbId);
            const isSaved = feedback[id] === "saved";
            return (
              <article key={id} className="group">
                <a href={tmdbUrl(movie.tmdbId, movie.media)} target="_blank" rel="noopener noreferrer">
                  <div className="overflow-hidden  border border-line bg-surface">
                    <CoverImage src={movie.poster} alt={movie.title} label={movie.title} loading="lazy" className="aspect-[2/3] w-full object-cover transition group-hover:opacity-90" />
                  </div>
                  <p className="mt-1.5 truncate text-xs font-medium group-hover:text-accent">{movie.title}{movie.year ? <span className="text-muted"> · {movie.year}</span> : null}</p>
                  {movie.why && <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-muted">{movie.why}</p>}
                </a>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => update(id, "saved")} aria-pressed={isSaved} className={` border px-2 py-1 text-[10px] ${isSaved ? "border-accent bg-accent text-bg" : "border-line text-muted hover:text-accent"}`}>보고 싶음</button>
                  <button onClick={() => update(id, "seen")} className=" border border-line px-2 py-1 text-[10px] text-muted hover:text-accent">이미 봄</button>
                  <button onClick={() => update(id, "dismissed")} className=" border border-line px-2 py-1 text-[10px] text-muted hover:text-accent">관심 없음</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className=" border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{savedOnly ? "저장한 추천이 없습니다." : "이 회차의 추천을 모두 분류했습니다."}</p>
      )}
    </div>
  );
}
