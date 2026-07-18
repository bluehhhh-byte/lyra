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

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base sm:text-sm outline-none focus:border-accent";
const btn =
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40";

// half-star picker, 0.5–5.0 — click the left/right half of a star
function StarInput({ value, onChange }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative inline-block text-2xl leading-none">
          <span className="text-muted/30">★</span>
          <span
            className="absolute inset-0 overflow-hidden text-accent"
            style={{ width: value >= n ? "100%" : value >= n - 0.5 ? "50%" : "0%" }}
          >
            ★
          </span>
          {/* two invisible hit zones per star = half-step precision */}
          <button
            type="button"
            aria-label={`${n - 0.5}점`}
            onClick={() => onChange(n - 0.5)}
            className="absolute inset-y-0 left-0 w-1/2"
          />
          <button
            type="button"
            aria-label={`${n}점`}
            onClick={() => onChange(n)}
            className="absolute inset-y-0 right-0 w-1/2"
          />
        </span>
      ))}
      <span className="ml-2 text-sm text-muted">{value ? value.toFixed(1) : "—"}</span>
    </div>
  );
}

export default function MovieForm() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [movie, setMovie] = useState(null); // picked detail
  const [synopsis, setSynopsis] = useState(""); // TMDB overview, auto-loaded on pick
  const [polished, setPolished] = useState(""); // Gemini-tidied 줄거리
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [savedSlug, setSavedSlug] = useState("");

  const run = (label, fn) => async () => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const search = run("search", async () => {
    const { results } = await api("movieSearch", { query });
    setResults(results);
    setMovie(null);
  });

  const pick = (r) =>
    run("detail", async () => {
      const detail = await api("movieDetail", { tmdbId: r.tmdbId, mediaType: r.mediaType });
      setMovie(detail);
      setSynopsis(detail.overview || ""); // auto-load TMDB synopsis
      setPolished("");
      setComment("");
      setTags([detail.country, detail.genre, detail.year].filter(Boolean).join(", "));
    })();

  const genMeta = run("meta", async () => {
    const { polished, comment, tags: autoTags } = await api("movieMeta", {
      title: movie.title,
      director: movie.director,
      mediaType: movie.mediaType,
      synopsis,
      country: movie.country,
      genre: movie.genre,
      year: movie.year,
      rating,
    });
    setPolished(polished || synopsis);
    if (comment) setComment(comment);
    if (autoTags) setTags(autoTags);
  });

  const save = run("save", async () => {
    const { slug } = await api("movieSave", {
      title: movie.title,
      titleKo: movie.title, // TMDB의 title이 이미 한국어
      mediaType: movie.mediaType,
      director: movie.director,
      directorKo: movie.director, // TMDB 감독명도 한국어로 옴
      cast: movie.cast,
      year: movie.year,
      runtime: movie.runtime,
      rating,
      genre: movie.genre,
      poster: movie.poster,
      backdrop: movie.backdrop,
      tmdbId: movie.tmdbId,
      tags,
      comment,
      synopsis: polished || synopsis,
    });
    setSavedSlug(slug);
  });

  return (
    <div className="max-w-2xl space-y-8">
      {/* 1. search */}
      <section>
        <Step n="1" label="영화/드라마 검색 (TMDB)" />
        <div className="flex flex-wrap gap-2">
          <input
            className={input + " flex-1 basis-48"}
            placeholder="영화·드라마 제목 (예: 이터널 선샤인, 기생충, moving)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className={btn} disabled={!query || busy} onClick={search}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
        {results.length > 0 && (
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {results.map((r) => (
              <li key={r.tmdbId}>
                <button
                  onClick={() => pick(r)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-surface ${
                    movie?.tmdbId === r.tmdbId ? "bg-surface text-accent" : ""
                  }`}
                >
                  {r.thumb ? (
                    <img src={r.thumb} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-line text-xs text-muted">
                      ?
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="font-medium">{r.title}</span>
                    <span className="ml-2 rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">
                      {r.kind}
                    </span>
                    <span className="text-muted"> · {r.year}</span>
                    {r.originalTitle !== r.title && (
                      <span className="block truncate text-xs text-muted">{r.originalTitle}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 2. synopsis + meta */}
      {movie && (
        <section>
          <Step n="2" label="시놉시스 자동 로딩 → Gemini 정돈" />
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
            <img src={movie.poster} alt="" className="h-16 w-11 shrink-0 rounded object-cover" />
            <div className="min-w-0 text-xs text-muted">
              <p className="text-sm font-medium text-ink">{movie.title}</p>
              <p className="truncate">
                {[movie.kind, movie.director, movie.year, movie.runtime && `${movie.runtime}분`].filter(Boolean).join(" · ")}
              </p>
              <p className="truncate">{movie.cast}</p>
            </div>
          </div>
          <p className="mb-1 text-xs text-muted">TMDB 시놉시스가 자동 로딩됨. 필요하면 손봐도 됨.</p>
          <textarea
            className={input + " h-32 text-sm"}
            placeholder={movie.overview ? "" : "TMDB에 줄거리가 없습니다 — 직접 입력하거나 비워두세요"}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
          />
          <div className="mt-3">
            <p className="mb-1 text-xs text-muted">별점</p>
            <StarInput value={rating} onChange={setRating} />
          </div>
          <button className={btn + " mt-2"} disabled={busy} onClick={genMeta}>
            {busy === "meta" ? "정돈 중…" : "Gemini 줄거리 정돈 + 코멘트 생성"}
          </button>
        </section>
      )}

      {/* 3. review + save */}
      {movie && (
        <section>
          <Step n="3" label="검수 · 저장" />
          <p className="mb-2 text-xs text-muted">줄거리 직접 수정 가능.</p>
          <textarea
            className={input + " h-40 text-sm"}
            value={polished || synopsis}
            onChange={(e) => setPolished(e.target.value)}
          />
          <div className="mt-3 space-y-3">
            <input className={input} placeholder="태그 (국가·장르·연도)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <textarea className={input + " h-20"} placeholder="감상 코멘트 (자동생성됨, 수정 가능)" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <button className={btn + " mt-3"} disabled={busy} onClick={save}>
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
          {savedSlug && (
            <span className="ml-3 text-sm text-muted">
              저장됨 ✓{" "}
              <a href={`/movies/${savedSlug}`} className="text-accent underline">
                페이지 보기
              </a>
              <span className="block text-xs">온라인 배포본은 재배포(약 1분) 후 반영됩니다.</span>
            </span>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function Step({ n, label }) {
  return (
    <h2 className="mb-3 text-sm font-semibold">
      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg">
        {n}
      </span>
      {label}
    </h2>
  );
}
