"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { tmdbUrl } from "../../lib/tmdb-link";
import { filterWatched, prepareWatched } from "../../lib/watched-filter";
import CoverImage from "../cover-image";

const INITIAL = 120;
const STEP = 180;
const values = (items, key) => [...new Set(items.flatMap((item) => [].concat(item[key] || [])).filter(Boolean))].sort();

export default function WatchedGrid({ rated, initial = {} }) {
  const items = useMemo(() => prepareWatched(rated), [rated]);
  const [q, setQ] = useState(initial.q || "");
  const [rating, setRating] = useState(initial.rating || "");
  const [country, setCountry] = useState(initial.country || "");
  const [genre, setGenre] = useState(initial.genre || "");
  const [decade, setDecade] = useState(initial.decade || "");
  const [visible, setVisible] = useState(INITIAL);

  const countries = useMemo(() => values(items, "country"), [items]);
  const genres = useMemo(() => values(items, "genre"), [items]);
  const decades = useMemo(() => values(items, "decade").sort().reverse(), [items]);
  const shown = useMemo(
    () => filterWatched(items, { q, rating, country, genre, decade }),
    [items, q, rating, country, genre, decade]
  );

  const dist = useMemo(() => {
    const map = new Map();
    for (const movie of items) map.set(movie.rating, (map.get(movie.rating) || 0) + 1);
    return map;
  }, [items]);
  const max = Math.max(...dist.values(), 1);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (rating) params.set("rating", rating);
    if (country) params.set("country", country);
    if (genre) params.set("genre", genre);
    if (decade) params.set("decade", decade);
    const query = params.toString();
    history.replaceState(null, "", query ? `/watched?${query}` : "/watched");
    setVisible(INITIAL);
  }, [q, rating, country, genre, decade]);

  const reset = () => {
    setQ("");
    setRating("");
    setCountry("");
    setGenre("");
    setDecade("");
  };
  const filtered = Boolean(q || rating || country || genre || decade);

  return (
    <>
      <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="제목·감독·배우 검색" aria-label="평가한 영화 검색" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent lg:col-span-2" />
        <Select label="국가" value={country} onChange={setCountry} options={countries} />
        <Select label="장르" value={genre} onChange={setGenre} options={genres} />
        <Select label="연대" value={decade} onChange={setDecade} options={decades} />
      </div>

      <div className="mb-3 flex items-end gap-1.5">
        {Array.from({ length: 10 }, (_, index) => +(5 - index * 0.5).toFixed(1)).map((score) => {
          const count = dist.get(score) || 0;
          const active = Number(rating) === score;
          return (
            <button key={score} onClick={() => setRating(active ? "" : String(score))} disabled={!count} aria-pressed={active} className="flex flex-1 flex-col items-center gap-1 disabled:cursor-default" title={count ? `★${score} ${count}편` : `★${score} 없음`}>
              <span className="text-[10px] tabular-nums text-muted">{count || ""}</span>
              <span className={`w-full rounded-t transition-colors ${active ? "bg-accent" : count ? "bg-accent/50 hover:bg-accent/80" : "bg-line"}`} style={{ height: `${Math.max(2, (count / max) * 80)}px` }} />
              <span className={`text-[10px] tabular-nums ${active ? "font-bold text-accent" : "text-muted"}`}>{score}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-8 flex h-5 items-center justify-between text-xs text-muted">
        <span>{shown.length.toLocaleString("ko-KR")}편 표시</span>
        {filtered && <button onClick={reset} className="text-accent hover:underline">모든 조건 초기화</button>}
      </div>

      {shown.length ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
          {shown.slice(0, visible).map((movie) => <MovieCard key={movie.code} movie={movie} />)}
        </div>
      ) : (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 영화가 없습니다.</p>
      )}

      {visible < shown.length && (
        <div className="mt-10 flex justify-center">
          <button onClick={() => setVisible((count) => count + STEP)} className="rounded-full border border-line px-5 py-2 text-sm text-muted hover:border-accent hover:text-accent">나머지 {(shown.length - visible).toLocaleString("ko-KR")}편 더 보기</button>
        </div>
      )}
    </>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="sr-only">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="not-sr-only w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent">
        <option value="">{label} 전체</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function MovieCard({ movie }) {
  const external = tmdbUrl(movie.tmdbId, movie.media);
  const inner = (
    <>
      <div className="relative overflow-hidden rounded-lg border border-line bg-surface">
        <CoverImage src={movie.poster} alt={movie.title_ko || movie.title} label={movie.title_ko || movie.title} loading="lazy" className="aspect-[2/3] w-full object-cover transition group-hover:opacity-90" />
        <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">★{movie.rating}</span>
        {movie.internalHref && <span className="absolute bottom-1 left-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-bg">Cyno 기록</span>}
      </div>
      <p className="mt-1.5 truncate text-xs font-medium group-hover:text-accent">{movie.title_ko || movie.title}</p>
      <p className="truncate text-[11px] text-muted">{[movie.country, movie.year].filter(Boolean).join(" · ")}</p>
    </>
  );
  if (movie.internalHref) return <Link href={movie.internalHref} className="group">{inner}</Link>;
  if (external) return <a href={external} target="_blank" rel="noopener noreferrer" className="group">{inner}</a>;
  return <div className="group">{inner}</div>;
}
