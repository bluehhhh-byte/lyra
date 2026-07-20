"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    return songs.filter(
      (s) =>
        (!tag || s.tags.includes(tag)) &&
        (!needle ||
          s.metaSearch.includes(needle) ||
          s.lines.some((l) => l.toLowerCase().includes(needle)))
    );
  }, [needle, tag, songs]);

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
              className={`rounded-full border px-3 py-1 text-xs transition active:scale-[0.97] ${
                group === g.key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
          <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">
            총 {songs.length}곡
          </span>
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
          <Grid list={randomList} needle={needle} />
        </section>
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

// why did this card match? — when the hit is in the lyrics (not title/artist),
// show the matching line with the query highlighted
function Snippet({ song, needle }) {
  if (!needle || song.metaSearch.includes(needle)) return null;
  const line = song.lines.find((l) => l.toLowerCase().includes(needle));
  if (!line) return null;
  const i = line.toLowerCase().indexOf(needle);
  return (
    <p className="mt-1 line-clamp-2 text-xs italic text-muted/80">
      “{line.slice(0, i)}
      <span className="not-italic font-semibold text-accent">
        {line.slice(i, i + needle.length)}
      </span>
      {line.slice(i + needle.length)}”
    </p>
  );
}

// one delegated handler feeds every card's spotlight position via CSS vars
function trackSpot(e) {
  const card = e.target.closest?.(".spot");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - r.left}px`);
  card.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function Grid({ list, needle }) {
  return (
    <div
      onPointerMove={trackSpot}
      className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4"
    >
      {list.map((s, i) => (
        <Link
          key={s.slug}
          href={`/songs/${s.slug}`}
          style={{ "--i": i }}
          className="group card-in transition-transform duration-300 ease-out hover:-translate-y-1"
        >
          <div className="spot overflow-hidden rounded-xl border border-line bg-surface transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-accent/15">
            <img
              // grid cells render ≤ ~300px — 300px for 1x, the 600px original for retina
              src={s.artwork.replace("600x600bb", "300x300bb")}
              srcSet={`${s.artwork.replace("600x600bb", "300x300bb")} 1x, ${s.artwork} 2x`}
              alt={`${s.title} album art`}
              loading="lazy"
              decoding="async"
              className="aspect-square w-full object-cover transition duration-200 ease-out group-hover:scale-[1.03]"
            />
          </div>
          <h3 className="mt-3 text-sm font-semibold leading-snug group-hover:text-accent">
            {s.title}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {s.artist}
            {s.year ? ` · ${s.year}` : ""}
          </p>
          <Snippet song={s} needle={needle} />
        </Link>
      ))}
    </div>
  );
}
