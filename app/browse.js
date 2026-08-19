"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CoverImage from "./cover-image";

const GROUPS = [
  { key: "none", label: "전체" },
  { key: "country", label: "국가" },
  { key: "decade", label: "연대" },
  { key: "artist", label: "가수" },
  { key: "random", label: "랜덤" },
];

const RANDOM_PICKS = 6;
const INITIAL_RENDER = 72; // 첫 화면 + 두어 스크롤 분량
const RENDER_STEP = 240;

export default function Browse({ songs: rawSongs, initialTag = "", initialQ = "", initialGroup = "none", initialEmotion = "", initialDecade = "" }) {
  // 검색용 소문자 문자열은 여기서 만든다 — 서버가 만들어 보내면 같은 내용이
  // 919곡 × 두 번(HTML + RSC 페이로드) 실려 초기 응답만 커진다.
  const songs = useMemo(
    () =>
      rawSongs.map((s) => ({
        ...s,
        metaSearch: [s.title, s.title_ko, s.artist, s.artist_ko, s.album, s.tags.join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [rawSongs]
  );
  const [q, setQ] = useState(initialQ);
  const [tag, setTag] = useState(initialTag);
  const [emotion, setEmotion] = useState(initialEmotion); // 취향 페이지 감정 막대에서 온다
  const [decade, setDecade] = useState(initialDecade); // 취향·곡 페이지 연대 링크에서 온다 (예: 2010s)
  const [group, setGroup] = useState(GROUPS.some((g) => g.key === initialGroup) ? initialGroup : "none");
  const [seed, setSeed] = useState(0); // bump to reshuffle random picks
  // slug → lyric lines, fetched once from /api/lyrics-index the first time the
  // user searches. null until then; meta search works without it.
  const [lyrics, setLyrics] = useState(null);
  // 처음부터 919곡 카드를 전부 렌더하지 않는다 — 서버가 그 전부를 HTML로 그려
  // 홈 응답의 3분의 2(약 900KB)를 차지했다. 화면에 들어올 만큼만 그리고,
  // 아래는 버튼으로 이어서 그린다. 데이터는 이미 다 갖고 있으므로 추가 요청은 없다.
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER);

  // Mirror the filters into the URL so a refresh or a shared link lands on the
  // same view. replaceState, not pushState — one history entry per keystroke
  // would make the back button useless.
  // ponytail: back/forward doesn't step through filter states. Switch to
  // router.push + a debounce if that ever matters.
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (tag) p.set("tag", tag);
    if (emotion) p.set("emotion", emotion);
    if (decade) p.set("decade", decade);
    if (group !== "none") p.set("group", group);
    const qs = p.toString();
    history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [q, tag, group, emotion, decade]);

  const needle = q.trim().toLowerCase();

  // load the lyric index once, on the first search — lands a lyric match a beat
  // after typing (or on mount when arriving via a shared ?q= link)
  useEffect(() => {
    if (!needle || lyrics) return;
    let alive = true;
    fetch("/api/lyrics-index")
      .then((r) => r.json())
      .then((arr) => alive && setLyrics(Object.fromEntries(arr.map((x) => [x.slug, x.lines]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [needle, lyrics]);

  const filtered = useMemo(() => {
    return songs.filter(
      (s) =>
        (!tag || s.tags.includes(tag)) &&
        (!emotion || s.emotion === emotion) &&
        (!decade || s.decade === decade) &&
        (!needle ||
          s.metaSearch.includes(needle) ||
          (lyrics?.[s.slug] || []).some((l) => l.toLowerCase().includes(needle)))
    );
  }, [needle, tag, emotion, decade, songs, lyrics]);

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

  // 필터·검색이 바뀌면 캡을 처음으로 되돌린다 — 이전 화면에서 늘려 둔 상한이
  // 새 결과에 그대로 남으면 화면마다 초기 크기가 달라진다.
  useEffect(() => {
    setVisibleCount(INITIAL_RENDER);
  }, [needle, tag, emotion, decade, group]);

  // 캡 적용 — 그룹 나누기 전에 앞에서 자른다. 그룹 화면에서도 상한은 같다.
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hiddenCount = filtered.length - visible.length;

  const groups = useMemo(() => {
    if (group === "none" || group === "random") return [["", visible]];
    const map = new Map();
    for (const s of visible) {
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
  }, [visible, group]);

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

      {(tag || emotion || decade) && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="text-muted">{tag ? "태그" : emotion ? "감정" : "연대"}</span>
          {tag && (
            <button
              onClick={() => setTag("")}
              className="rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {tag} ✕
            </button>
          )}
          {emotion && (
            <button
              onClick={() => setEmotion("")}
              className="rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {emotion} ✕
            </button>
          )}
          {decade && (
            <button
              onClick={() => setDecade("")}
              className="rounded-full border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {decade} ✕
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="py-20 text-center text-sm text-muted">
          {songs.length === 0
            ? "아직 곡이 없습니다."
            : q
              ? `"${q}" 검색 결과 없음`
              : `'${tag || emotion || decade}' 곡 없음`}
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
          <Grid list={randomList} needle={needle} lyrics={lyrics} />
        </section>
      ) : (
        groups.map(([name, list]) => (
          <section key={name || "all"} className="mb-10">
            {name && (
              <h2 className="mb-4 text-sm font-semibold text-muted">
                {name} <span className="text-xs">({list.length})</span>
              </h2>
            )}
            <Grid list={list} needle={needle} lyrics={lyrics} />
          </section>
        ))
      )}

      {group !== "random" && hiddenCount > 0 && (
        <div className="mb-10 flex justify-center">
          <button
            onClick={() => setVisibleCount((n) => n + RENDER_STEP)}
            className="rounded-full border border-line px-5 py-2 text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            나머지 {hiddenCount}곡 더 보기
          </button>
        </div>
      )}
    </>
  );
}

// why did this card match? — when the hit is in the lyrics (not title/artist),
// show the matching line with the query highlighted
function Snippet({ song, needle, lyrics }) {
  if (!needle || song.metaSearch.includes(needle)) return null;
  const line = (lyrics?.[song.slug] || []).find((l) => l.toLowerCase().includes(needle));
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

function Grid({ list, needle, lyrics }) {
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
            <CoverImage
              // grid cells render ≤ ~300px — 300px for 1x, the 600px original for retina
              src={s.artwork.replace("600x600bb", "300x300bb")}
              srcSet={`${s.artwork.replace("600x600bb", "300x300bb")} 1x, ${s.artwork} 2x`}
              alt={`${s.title} album art`}
              label={s.title}
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
          <Snippet song={s} needle={needle} lyrics={lyrics} />
        </Link>
      ))}
    </div>
  );
}
