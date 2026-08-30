"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import CoverImage from "./cover-image";
import { groupSongs } from "../lib/browse-group";
import { parseBrowseFilters, serializeBrowseFilters } from "../lib/browse-query";
import { sortSearchResults } from "../lib/search-rank";

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

export default function Browse({ songs: initialSongs, totalSongs = initialSongs.length, availableTags = [] }) {
  const searchParams = useSearchParams();
  const initialFilters = parseBrowseFilters(searchParams);
  const [rawSongs, setRawSongs] = useState(initialSongs);
  const [loadState, setLoadState] = useState("idle");
  const loadPromise = useRef(null);
  const allLoaded = rawSongs.length >= totalSongs;

  const loadAllSongs = useCallback(() => {
    if (allLoaded) return Promise.resolve();
    if (loadPromise.current) return loadPromise.current;
    setLoadState("loading");
    loadPromise.current = fetch("/api/songs/meta")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(({ songs }) => {
        if (!Array.isArray(songs)) throw new Error("곡 목록 응답 형식이 올바르지 않습니다");
        setRawSongs(songs);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"))
      .finally(() => {
        loadPromise.current = null;
      });
    return loadPromise.current;
  }, [allLoaded]);

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
  const [q, setQ] = useState(initialFilters.q);
  const [tag, setTag] = useState(initialFilters.tag);
  const [tagDraft, setTagDraft] = useState(initialFilters.tag);
  const [emotion, setEmotion] = useState(initialFilters.emotion); // 취향 페이지 감정 막대에서 온다
  const [decade, setDecade] = useState(initialFilters.decade); // 취향·곡 페이지 연대 링크에서 온다 (예: 2010s)
  const [group, setGroup] = useState(initialFilters.group);
  const [sort, setSort] = useState(initialFilters.sort);
  const [seed, setSeed] = useState(0); // bump to reshuffle random picks
  // 가사 검색은 서버에 맡긴다 — 예전에는 첫 검색 때 전곡 가사(gzip 757KB)를
  // 통째로 내려받았다. lyricHits는 {q, map: slug → 맞은 줄}이고, 응답의 q가
  // 현재 검색어와 일치할 때만 결과에 반영한다(늦게 도착한 이전 응답 무시).
  const [lyricHits, setLyricHits] = useState({ q: "", map: null });
  // 처음부터 919곡 카드를 전부 렌더하지 않는다 — 서버가 그 전부를 HTML로 그려
  // 홈 응답의 3분의 2(약 900KB)를 차지했다. 화면에 들어올 만큼만 그리고,
  // 아래는 버튼으로 이어서 그린다. 데이터는 이미 다 갖고 있으므로 추가 요청은 없다.
  const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER);

  // 초기 응답은 첫 72곡만 담는다. 전체 목록이 필요한 순간에만 나머지 메타를
  // 가져와 홈 HTML/RSC의 크기와 첫 응답 시간을 줄인다.
  useEffect(() => {
    if (q.trim() || tag || emotion || decade || group !== "none" || sort !== "relevance") void loadAllSongs();
  }, [q, tag, emotion, decade, group, sort, loadAllSongs]);

  // Mirror the filters into the URL so a refresh or a shared link lands on the
  // same view. replaceState, not pushState — one history entry per keystroke
  // would make the back button useless.
  // ponytail: back/forward doesn't step through filter states. Switch to
  // router.push + a debounce if that ever matters.
  useEffect(() => {
    const qs = serializeBrowseFilters({ q, tag, emotion, decade, group, sort });
    history.replaceState(null, "", qs ? `/?${qs}` : "/");
  }, [q, tag, group, emotion, decade, sort]);

  const needle = q.trim().toLowerCase();

  // 가사 검색 — 두 글자부터, 300ms 멈춘 뒤에만 서버를 부른다. 한 글자마다
  // 호출하면 타이핑 한 번에 요청이 대여섯 개다. 새 입력이 오면 타이머와
  // 진행 중인 요청을 함께 취소한다.
  useEffect(() => {
    if (needle.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/lyrics?q=${encodeURIComponent(needle)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then(({ q: served, hits }) =>
          setLyricHits({ q: served, map: Object.fromEntries(hits.map((h) => [h.slug, h.line])) })
        )
        .catch(() => {}); // 취소 포함 — 취소는 오류가 아니다
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle]);

  // 현재 검색어에 대한 서버 응답이 도착했을 때만 가사 매치를 켠다
  const lyricMap = lyricHits.q === needle ? lyricHits.map : null;

  const filtered = useMemo(() => {
    return songs.filter(
      (s) =>
        (!tag || s.tags.includes(tag)) &&
        (!emotion || s.emotion === emotion) &&
        (!decade || s.decade === decade) &&
        (!needle || s.metaSearch.includes(needle) || Boolean(lyricMap?.[s.slug]))
    );
  }, [needle, tag, emotion, decade, songs, lyricMap]);
  const sorted = useMemo(() => sortSearchResults(filtered, needle, sort), [filtered, needle, sort]);

  // random picks — computed client-side (post-hydration, so no SSR mismatch)
  const randomList = useMemo(() => {
    const a = [...sorted];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, RANDOM_PICKS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, seed]);

  // 필터·검색이 바뀌면 캡을 처음으로 되돌린다 — 이전 화면에서 늘려 둔 상한이
  // 새 결과에 그대로 남으면 화면마다 초기 크기가 달라진다.
  useEffect(() => {
    setVisibleCount(INITIAL_RENDER);
  }, [needle, tag, emotion, decade, group, sort]);

  // 렌더 캡은 "전체" 보기에만 적용한다. 초기 SSR이 그리는 것이 바로 이 보기라
  // 페이로드가 걸린 곳이고, 그룹 보기는 클릭 후 클라이언트 렌더라 비용이 다르다.
  // 그룹을 캡 이후에 나누면 헤더 수가 실제 그룹 크기와 달라지고 뒤쪽 그룹이
  // 통째로 사라진다 — 그룹 나누기는 언제나 필터된 전체로 한다.
  const capped = group === "none";
  const visible = useMemo(
    () => (capped ? sorted.slice(0, visibleCount) : sorted),
    [capped, sorted, visibleCount]
  );
  const hiddenCount = (allLoaded ? filtered.length : totalSongs) - visible.length;

  const groups = useMemo(() => groupSongs(visible, group), [visible, group]);
  const clearFilters = () => {
    setQ("");
    setTag("");
    setTagDraft("");
    setEmotion("");
    setDecade("");
    setGroup("none");
    setSort("relevance");
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="곡·가수·가사 검색"
          className="w-full  border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent sm:max-w-xs sm:text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <label className="sr-only" htmlFor="song-tag-filter">태그 필터</label>
          <input
            id="song-tag-filter"
            list="song-tag-options"
            value={tagDraft}
            onChange={(event) => {
              const value = event.target.value;
              setTagDraft(value);
              if (!value || availableTags.includes(value)) setTag(value);
            }}
            placeholder="태그 필터"
            className="w-28  border border-line bg-bg px-3 py-1 text-xs text-ink outline-none focus:border-accent"
          />
          <datalist id="song-tag-options">
            {availableTags.map((value) => <option key={value} value={value} />)}
          </datalist>
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => setGroup(g.key)}
              className={` border px-3 py-1 text-xs transition active:scale-[0.97] ${
                group === g.key
                  ? "border-accent bg-accent font-semibold text-bg"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </button>
          ))}
          <span className=" border border-line px-3 py-1 text-xs text-muted">
            총 {totalSongs}곡
          </span>
          <label className="sr-only" htmlFor="song-sort">결과 정렬</label>
          <select id="song-sort" value={sort} onChange={(event) => setSort(event.target.value)} className=" border border-line bg-bg px-3 py-1 text-xs text-muted">
            <option value="relevance">관련도순</option>
            <option value="recent">최신 기록순</option>
            <option value="year">발매 연도순</option>
          </select>
        </div>
      </div>

      {(tag || emotion || decade) && (
        <div className="mb-6 flex items-center gap-2 text-sm">
          <span className="text-muted">{tag ? "태그" : emotion ? "감정" : "연대"}</span>
          {tag && (
            <button
              onClick={() => { setTag(""); setTagDraft(""); }}
              className=" border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {tag} ✕
            </button>
          )}
          {emotion && (
            <button
              onClick={() => setEmotion("")}
              className=" border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {emotion} ✕
            </button>
          )}
          {decade && (
            <button
              onClick={() => setDecade("")}
              className=" border border-accent bg-accent px-3 py-1 text-xs font-semibold text-bg"
            >
              {decade} ✕
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="py-20 text-center text-sm text-muted">
          <p>{totalSongs === 0
            ? "아직 곡이 없습니다."
            : q
              ? `"${q}" 검색 결과 없음`
              : `'${tag || emotion || decade}' 곡 없음`}</p>
          {totalSongs > 0 && (
            <>
              <p className="mt-1 text-xs">검색어를 줄이거나 현재 필터를 지우고 다시 찾아보세요.</p>
              <button onClick={clearFilters} className="mt-4  border border-line px-4 py-1.5 text-xs hover:border-accent hover:text-accent">검색·필터 초기화</button>
            </>
          )}
        </div>
      )}

      {group === "random" && filtered.length > 0 ? (
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-muted">랜덤 추천</h2>
            <button
              onClick={() => setSeed((n) => n + 1)}
              className=" border border-line px-3 py-1 text-xs text-muted hover:text-accent"
            >
              다시 섞기 ↻
            </button>
          </div>
          <Grid list={randomList} needle={needle} lyrics={lyricMap} />
        </section>
      ) : (
        groups.map(([name, list]) => (
          <section key={name || "all"} className="mb-10">
            {name && (
              <h2 className="mb-4 text-sm font-semibold text-muted">
                {name} <span className="text-xs">({list.length})</span>
              </h2>
            )}
            <Grid list={list} needle={needle} lyrics={lyricMap} />
          </section>
        ))
      )}

      {loadState === "loading" && !allLoaded && (
        <p className="mb-6 text-center text-xs text-muted">전체 곡 목록을 불러오는 중…</p>
      )}
      {loadState === "error" && !allLoaded && (
        <p className="mb-6 text-center text-xs text-muted">
          전체 목록을 불러오지 못했습니다.{" "}
          <button className="text-accent hover:underline" onClick={() => void loadAllSongs()}>다시 시도</button>
        </p>
      )}

      {capped && hiddenCount > 0 && (
        <div className="mb-10 flex justify-center">
          <button
            disabled={loadState === "loading"}
            onClick={async () => {
              await loadAllSongs();
              setVisibleCount((n) => n + RENDER_STEP);
            }}
            className=" border border-line px-5 py-2 text-sm text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
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
  const line = lyrics?.[song.slug] || "";
  if (!line.toLowerCase().includes(needle)) return null;
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
          <div className="spot overflow-hidden  border border-line bg-surface transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-accent/15">
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
