"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CoverImage from "../cover-image";

// 필터를 검색·매체·정렬 필로 줄였다 — 국가·장르·별점·그룹 필터와 정렬
// 드롭다운은 49편 규모에 과했다. 정렬은 별점순·랜덤 두 필만: 켜면 적용,
// 다시 누르면 기본(최근 기록순)으로. 국가·장르 탐색은 /tags가 담당.
export default function MovieBrowse({ movies }) {
  const searchParams = useSearchParams();
  const initialMedia = searchParams.get("media") || "all";
  const initialSort = searchParams.get("sort") || "recorded";
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [media, setMedia] = useState(() => ["all", "movie", "tv"].includes(initialMedia) ? initialMedia : "all");
  const [sort, setSort] = useState(() => ["rating-desc", "random"].includes(initialSort) ? initialSort : "recorded");
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (media !== "all") params.set("media", media);
    if (sort !== "recorded") params.set("sort", sort);
    const query = params.toString();
    history.replaceState(null, "", query ? `/movies?${query}` : "/movies");
  }, [q, media, sort]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      movies.filter(
        (movie) =>
          (!needle || movie.search.includes(needle)) &&
          (media === "all" || movie.media === media)
      ),
    [needle, movies, media]
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
    return list.sort((a, b) =>
      sort === "rating-desc"
        ? (b.rating ?? -1) - (a.rating ?? -1) || b.recorded.localeCompare(a.recorded)
        : b.recorded.localeCompare(a.recorded)
    );
  }, [filtered, sort, seed]);

  const reset = () => {
    setQ("");
    setMedia("all");
    setSort("recorded");
  };
  const hasFilters = q || media !== "all" || sort !== "recorded";

  return (
    <>
      {/* 홈(Lyra)의 상단과 같은 문법 — 검색 인풋 + 라운드 필 + 카운트 칩 */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="영화·감독·배우·줄거리 검색"
          aria-label="작품 검색"
          className="w-full  border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:max-w-xs sm:text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            ["all", "전체"],
            ["movie", "영화"],
            ["tv", "드라마"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMedia(key)}
              className={` border px-3 py-1 text-xs transition active:scale-[0.97] ${
                media === key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
          {[
            ["rating-desc", "별점순"],
            ["random", "랜덤"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(sort === key ? "recorded" : key)}
              className={` border px-3 py-1 text-xs transition active:scale-[0.97] ${
                sort === key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
          {sort === "random" && (
            <button
              onClick={() => setSeed((value) => value + 1)}
              title="다시 섞기"
              aria-label="작품 다시 섞기"
              className=" border border-line px-2.5 py-1 text-xs text-muted hover:text-accent"
            >
              ↻
            </button>
          )}
          {hasFilters && (
            <button onClick={reset} className="text-xs text-muted hover:text-accent">초기화</button>
          )}
          <span className=" border border-line px-3 py-1 text-xs tabular-nums text-muted">
            총 {movies.length}편{filtered.length !== movies.length && ` · ${filtered.length}편 표시`}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">조건에 맞는 작품이 없습니다.</p>
      ) : (
        <Grid list={sorted} needle={needle} />
      )}
    </>
  );
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
    <p className="mt-1 line-clamp-2 text-xs text-muted">
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
          <div className="spot overflow-hidden border border-line bg-surface transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-accent/15">
            <CoverImage
              src={movie.poster}
              alt={`${movie.title} 포스터`}
              label={movie.title}
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
