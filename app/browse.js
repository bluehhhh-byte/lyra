"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePlayer } from "./player";

const GROUPS = [
  { key: "none", label: "전체" },
  { key: "country", label: "국가별" },
  { key: "decade", label: "연대별" },
  { key: "artist", label: "가수별" },
  { key: "random", label: "랜덤" },
];

const RANDOM_PICKS = 6;

export default function Browse({ songs, initialTag = "", initialQ = "", initialGroup = "none" }) {
  const [q, setQ] = useState(initialQ);
  const [tag, setTag] = useState(initialTag);
  const [group, setGroup] = useState(GROUPS.some((g) => g.key === initialGroup) ? initialGroup : "none");
  const [seed, setSeed] = useState(0); // bump to reshuffle random picks
  const { playlist, setTrack, setShuffle } = usePlayer();

  // radio mode — random starting track, player keeps advancing randomly
  const startShuffle = () => {
    if (!playlist.length) return;
    setShuffle(true);
    setTrack(playlist[Math.floor(Math.random() * playlist.length)]);
  };

  // Mirror the filters into the URL so a refresh or a shared link lands on the
  // same view. replaceState, not pushState — one history entry per keystroke
  // would make the back button useless.
  // ponytail: back/forward doesn't step through filter states. Switch to
  // router.push + a debounce if that ever matters.
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tag) p.set("tag", tag);
    if (group !== "none") p.set("group", group);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [q, tag, group]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return songs.filter(
      (s) => (!tag || s.tags.includes(tag)) && (!needle || s.search.includes(needle))
    );
  }, [q, tag, songs]);

  // random picks — computed client-side (post-hydration, so no SSR mismatch)
  const randomList = useMemo(() => {
    const a = [...filtered];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, RANDOM_PICKS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, seed]);

  const groups = useMemo(() => {
    if (group === "none" || group === "random") return [["", filtered]];
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
        <div className="flex flex-wrap gap-1.5">
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
          {playlist.length > 1 && (
            <button
              onClick={startShuffle}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent"
            >
              🔀 셔플 듣기
            </button>
          )}
        </div>
      </div>

      {tag && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="text-muted">태그</span>
          <button
            onClick={() => setTag("")}
            className="rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
          >
            {tag} ✕
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-20 text-center text-sm text-muted">
          {songs.length === 0
            ? "아직 곡이 없습니다."
            : q
              ? `"${q}" 검색 결과 없음`
              : `'${tag}' 태그 곡 없음`}
        </p>
      )}

      {group === "random" && filtered.length > 0 ? (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-muted">랜덤 추천</h2>
            <button
              onClick={() => setSeed((n) => n + 1)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:text-accent"
            >
              다시 섞기 ↻
            </button>
          </div>
          <Grid list={randomList} />
        </section>
      ) : (
        groups.map(([name, list]) => (
          <section key={name || "all"} className="mb-10">
            {name && (
              <h2 className="mb-4 text-sm font-semibold text-muted">
                {name} <span className="text-xs">({list.length})</span>
              </h2>
            )}
            <Grid list={list} />
          </section>
        ))
      )}
    </>
  );
}

function Grid({ list }) {
  return (
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
  );
}
