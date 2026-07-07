"use client";
import { useMemo, useState } from "react";
import Link from "next/link";

const GROUPS = [
  { key: "none", label: "전체" },
  { key: "country", label: "국가별" },
  { key: "decade", label: "연대별" },
  { key: "artist", label: "가수별" },
];

export default function Browse({ songs }) {
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("none");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? songs.filter((s) => s.search.includes(needle)) : songs;
  }, [q, songs]);

  const groups = useMemo(() => {
    if (group === "none") return [["", filtered]];
    const map = new Map();
    for (const s of filtered) {
      const k = s[group] || "기타";
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(s);
    }
    // decade: newest first; others: by size then name
    const entries = [...map.entries()];
    entries.sort((a, b) =>
      group === "decade" ? b[0].localeCompare(a[0]) : b[1].length - a[1].length
    );
    return entries;
  }, [filtered, group]);

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="곡·가수·가사 검색"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:max-w-xs sm:text-sm"
        />
        <div className="flex gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                group === g.key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="py-20 text-center text-sm text-muted">
          {songs.length === 0 ? "아직 곡이 없습니다." : `"${q}" 검색 결과 없음`}
        </p>
      )}

      {groups.map(([name, list]) => (
        <section key={name || "all"} className="mb-10">
          {name && (
            <h2 className="mb-4 text-sm font-semibold text-muted">
              {name} <span className="text-xs">({list.length})</span>
            </h2>
          )}
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((s) => (
              <Link key={s.slug} href={`/songs/${s.slug}`} className="group">
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <img
                    src={s.artwork}
                    alt={`${s.title} album art`}
                    className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-snug group-hover:text-accent">
                  {s.title}
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  {s.artist}
                  {s.year ? ` · ${s.year}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
