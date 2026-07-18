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

export default function MovieBrowse({ movies, initialQ = "", initialGroup = "none" }) {
  const [q, setQ] = useState(initialQ);
  const [group, setGroup] = useState(GROUPS.some((g) => g.key === initialGroup) ? initialGroup : "none");

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (group !== "none") p.set("group", group);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `/movies?${qs}` : "/movies");
  }, [q, group]);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return movies;
    return movies.filter((m) => m.search.includes(needle));
  }, [needle, movies]);

  const groups = useMemo(() => {
    if (group === "none") return [["", filtered]];
    const map = new Map();
    for (const m of filtered) {
      const k = groupValue(m, group);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    }
    const entries = [...map.entries()];
    entries.sort((a, b) => {
      if (group === "year" || group === "rating") return b[0].localeCompare(a[0]);
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    return entries;
  }, [filtered, group]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="영화·감독·배우·줄거리 검색"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:max-w-xs sm:text-sm"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition active:scale-[0.97] ${
                group === g.key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
          <span className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted">
            총 {movies.length}편
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-20 text-center text-sm text-muted">
          {movies.length === 0 ? "아직 영화가 없습니다." : `"${q}" 검색 결과 없음`}
        </p>
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

function groupValue(movie, group) {
  if (group === "director") return movie.director_ko || movie.director || "미상";
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
  const text = movie.synopsis.find((p) => p.toLowerCase().includes(needle)) || "";
  if (!text) return null;
  const i = text.toLowerCase().indexOf(needle);
  return (
    <p className="mt-1 line-clamp-2 text-xs text-muted/80">
      “{text.slice(0, i)}
      <span className="font-semibold text-accent">{text.slice(i, i + needle.length)}</span>
      {text.slice(i + needle.length)}”
    </p>
  );
}

function Grid({ list, needle }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((m) => (
        <Link key={m.slug} href={`/movies/${m.slug}`} className="group block transition active:scale-[0.98]">
          <div className="overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-accent/15">
            <img
              src={m.poster}
              alt={`${m.title} 포스터`}
              loading="lazy"
              decoding="async"
              className="aspect-[2/3] w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
            />
          </div>
          <h3 className="mt-3 truncate text-sm font-semibold leading-snug group-hover:text-accent">
            {m.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {m.director}
            {m.year ? ` · ${m.year}` : ""}
          </p>
          {m.rating != null && (
            <div className="mt-1">
              <Stars value={m.rating} />
            </div>
          )}
          <Snippet movie={m} needle={needle} />
        </Link>
      ))}
    </div>
  );
}
