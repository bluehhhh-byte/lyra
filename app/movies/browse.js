"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const GROUPS = [
  { key: "none", label: "전체" },
  { key: "director", label: "감독별" },
  { key: "year", label: "연도별" },
  { key: "genre", label: "장르별" },
  { key: "rating", label: "별점별" },
];

const SORTS = [
  { key: "recorded", label: "최근 기록순" },
  { key: "year-desc", label: "개봉연도 최신순" },
  { key: "rating-desc", label: "별점 높은순" },
  { key: "title", label: "제목순" },
  { key: "random", label: "랜덤" },
];

const valid = (items, value, fallback) => items.some((item) => item.key === value) ? value : fallback;

export default function MovieBrowse({ movies, initial = {} }) {
  const [q, setQ] = useState(initial.q || "");
  const [group, setGroup] = useState(valid(GROUPS, initial.group, "none"));
  const [media, setMedia] = useState(["all", "movie", "tv"].includes(initial.media) ? initial.media : "all");
  const [country, setCountry] = useState(initial.country || "all");
  const [genre, setGenre] = useState(initial.genre || "all");
  const [rating, setRating] = useState(Number(initial.rating) || 0);
  const [sort, setSort] = useState(valid(SORTS, initial.sort, "recorded"));
  const [status, setStatus] = useState(
    ["all", "wishlist", "watching", "watched", "dropped"].includes(initial.status)
      ? initial.status
      : "all"
  );
  const [seed, setSeed] = useState(0);

  const countries = useMemo(
    () => [...new Set(movies.map((movie) => movie.country).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [movies]
  );
  const genres = useMemo(
    () => [...new Set(movies.map((movie) => movie.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [movies]
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (group !== "none") params.set("group", group);
    if (media !== "all") params.set("media", media);
    if (country !== "all") params.set("country", country);
    if (genre !== "all") params.set("genre", genre);
    if (rating) params.set("rating", String(rating));
    if (sort !== "recorded") params.set("sort", sort);
    if (status !== "all") params.set("status", status);
    const query = params.toString();
    history.replaceState(null, "", query ? `/movies?${query}` : "/movies");
  }, [q, group, media, country, genre, rating, sort, status]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      movies.filter(
        (movie) =>
          (!needle || movie.search.includes(needle)) &&
          (media === "all" || movie.media === media) &&
          (country === "all" || movie.country === country) &&
          (genre === "all" || movie.genre === genre) &&
          (!rating || (movie.rating || 0) >= rating)
          && (status === "all" || movie.watchStatus === status)
      ),
    [needle, movies, media, country, genre, rating, status]
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sort === "random") {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }
    return list.sort((a, b) => {
      if (sort === "year-desc")
        return String(b.year).localeCompare(String(a.year), undefined, { numeric: true }) ||
          a.title.localeCompare(b.title);
      if (sort === "rating-desc")
        return (b.rating ?? -1) - (a.rating ?? -1) || b.recorded.localeCompare(a.recorded);
      if (sort === "title") return a.title.localeCompare(b.title);
      return b.recorded.localeCompare(a.recorded);
    });
  }, [filtered, sort, seed]);

  const groups = useMemo(() => {
    if (group === "none") return [["", sorted]];
    const map = new Map();
    for (const movie of sorted) {
      const key = groupValue(movie, group);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(movie);
    }
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      if (group === "year" || group === "rating") return b[0].localeCompare(a[0]);
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    return entries;
  }, [sorted, group]);

  const reset = () => {
    setQ("");
    setGroup("none");
    setMedia("all");
    setCountry("all");
    setGenre("all");
    setRating(0);
    setSort("recorded");
    setStatus("all");
  };
  const hasFilters = q || group !== "none" || media !== "all" || country !== "all" ||
    genre !== "all" || rating || sort !== "recorded" || status !== "all";

  return (
    <>
      <div className="mb-8 border-y border-line py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="영화·감독·배우·줄거리 검색"
            aria-label="작품 검색"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent lg:max-w-xs lg:text-sm"
          />
          <div className="flex gap-1 rounded-lg border border-line p-1">
            {[
              ["all", "전체"],
              ["movie", "영화"],
              ["tv", "드라마"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMedia(key)}
                className={`min-w-14 rounded px-2.5 py-1.5 text-xs transition ${
                  media === key ? "bg-accent font-semibold text-bg" : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <FilterSelect label="국가" value={country} onChange={setCountry} options={countries} />
          <FilterSelect label="장르" value={genre} onChange={setGenre} options={genres} />
          <select
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            aria-label="최소 별점"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          >
            <option value="0">별점 전체</option>
            {[4.5, 4, 3.5, 3, 2.5].map((value) => (
              <option key={value} value={value}>★ {value} 이상</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="감상 상태"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
          >
            <option value="all">상태 전체</option>
            <option value="wishlist">보고 싶음</option>
            <option value="watching">보는 중</option>
            <option value="watched">감상 완료</option>
            <option value="dropped">중단</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 overflow-x-auto">
            {GROUPS.map((item) => (
              <button
                key={item.key}
                onClick={() => setGroup(item.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs transition active:scale-[0.97] ${
                  group === item.key
                    ? "border-accent bg-accent font-semibold text-bg"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="정렬"
            className="ml-auto rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
          >
            {SORTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          {sort === "random" && (
            <button
              onClick={() => setSeed((value) => value + 1)}
              title="다시 섞기"
              aria-label="작품 다시 섞기"
              className="h-8 w-8 rounded-lg border border-line text-sm text-muted hover:text-accent"
            >
              ↻
            </button>
          )}
          {hasFilters && (
            <button onClick={reset} className="text-xs text-muted hover:text-accent">초기화</button>
          )}
          <span className="text-xs tabular-nums text-muted">{filtered.length}/{movies.length}편</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 작품이 없습니다.</p>
      ) : (
        groups.map(([name, list]) => (
          <section key={name || "all"} className="mb-10">
            {name && (
              <h2 className="mb-4 text-sm font-semibold text-muted">
                {name} <span className="text-xs">({list.length})</span>
              </h2>
            )}
            <Grid list={list} needle={needle} />
          </section>
        ))
      )}
    </>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={`${label} 필터`}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
    >
      <option value="all">{label} 전체</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function groupValue(movie, group) {
  if (group === "director") return movie.director || "미상";
  if (group === "year") return movie.year || "미상";
  if (group === "genre") return movie.genre || "기타";
  if (group === "rating") return movie.rating != null ? `★ ${movie.rating}` : "미평가";
  return "전체";
}

function Stars({ value }) {
  if (value == null) return null;
  return (
    <span className="relative inline-block align-middle text-xs leading-none" aria-label={`별점 ${value}/5`}>
      <span className="text-muted/30">★★★★★</span>
      <span className="absolute inset-0 overflow-hidden text-accent" style={{ width: `${(value / 5) * 100}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function Snippet({ movie, needle }) {
  if (!needle || movie.metaSearch.includes(needle)) return null;
  const text = movie.synopsis.find((paragraph) => paragraph.toLowerCase().includes(needle)) || "";
  if (!text) return null;
  const index = text.toLowerCase().indexOf(needle);
  return (
    <p className="mt-1 line-clamp-2 text-xs text-muted/80">
      “{text.slice(0, index)}
      <span className="font-semibold text-accent">{text.slice(index, index + needle.length)}</span>
      {text.slice(index + needle.length)}”
    </p>
  );
}

function Grid({ list, needle }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((movie) => (
        <Link key={movie.slug} href={`/movies/${movie.slug}`} className="group block transition active:scale-[0.98]">
          <div className="overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-accent/15">
            <img
              src={movie.poster}
              alt={`${movie.title} 포스터`}
              loading="lazy"
              decoding="async"
              className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
            />
          </div>
          <div className="mt-3 flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug group-hover:text-accent">
              {movie.title}
            </h3>
            {movie.media === "tv" && <span className="shrink-0 text-[10px] text-muted">DRAMA</span>}
          </div>
          {movie.watchStatus !== "watched" && (
            <p className="mt-1 text-[10px] text-accent">
              {movie.watchStatus === "wishlist" && "보고 싶음"}
              {movie.watchStatus === "watching" && `보는 중${movie.episode ? ` · ${movie.episode}화` : ""}`}
              {movie.watchStatus === "dropped" && "중단"}
              {movie.platform ? ` · ${movie.platform}` : ""}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted">
            {movie.director}
            {movie.year ? ` · ${movie.year}` : ""}
          </p>
          {movie.rating != null && <div className="mt-1"><Stars value={movie.rating} /></div>}
          <Snippet movie={movie} needle={needle} />
        </Link>
      ))}
    </div>
  );
}
