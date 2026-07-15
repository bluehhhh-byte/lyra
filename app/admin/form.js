"use client";
import { useState } from "react";
import { usePlayer } from "../player";

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

// text-base(16px) on mobile stops iOS focus-zoom; text-sm on ≥sm keeps the compact look
const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-base sm:text-sm outline-none focus:border-accent";
const btn =
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40";

// Dominant script wins — one Japanese bridge in a Korean song must not flip the
// whole song to `ja`. This only drives the country tag and the hero display;
// translation itself is line-aware server-side. Kanji alone is ambiguous, so
// only kana counts toward Japanese; ties keep the ja > ko > en priority.
const detectLang = (text) => {
  const n = (re) => (text.match(re) || []).length;
  const ko = n(/[가-힣]/g);
  const ja = n(/[぀-ヿ]/g);
  const en = n(/[a-z]/gi);
  if (ja && ja >= ko && ja >= en) return "ja";
  if (ko && ko >= en) return "ko";
  return "en";
};

export default function AdminForm() {
  const { track, setTrack } = usePlayer(); // 검색 결과 미리듣기 — 전역 플레이어 재사용
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [more, setMore] = useState(null); // {hasMore, nextOffset}
  const [song, setSong] = useState(null); // picked candidate
  const [lang, setLang] = useState("en");
  const [lyrics, setLyrics] = useState("");
  const [translated, setTranslated] = useState("");
  const [tags, setTags] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [searchLinks, setSearchLinks] = useState(null); // shown when lyrics aren't found

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

  const search = (offset = 0) =>
    run("search", async () => {
      const { results, hasMore, nextOffset } = await api("search", { query, offset });
      setCandidates((prev) => {
        const base = offset === 0 ? [] : prev;
        const seen = new Set(base.map((c) => `${c.title}|${c.artist}`.toLowerCase()));
        return [...base, ...results.filter((c) => !seen.has(`${c.title}|${c.artist}`.toLowerCase()))];
      });
      setMore({ hasMore, nextOffset });
      if (offset === 0) setSong(null);
    })();

  const [titleKo, setTitleKo] = useState("");
  const [artistKo, setArtistKo] = useState("");

  // country + genre + year — deterministic, always present even if Gemini is
  // unavailable. Country follows the ARTIST's nationality (store genre, then
  // name script, then lyric language), not the lyric language — the server's
  // autotag mirrors this and can further correct it via Gemini.
  // The store genre is a coarse placeholder ("K-Pop" for a heavy-metal band) —
  // the server's autotag swaps in a specific subgenre from its vocabulary.
  const capGenre = (g) => g.trim().replace(/^./, (x) => x.toUpperCase());
  const baseTags = (c, lg) => {
    const g = (c?.genre || "").toLowerCase();
    const country = g.includes("k-pop")
      ? "한국"
      : g.includes("j-pop") || g.includes("enka") || g.includes("anime")
        ? "일본"
        : /[가-힣]/.test(c?.artist || "")
          ? "한국"
          : /[぀-ヿ㐀-鿿]/.test(c?.artist || "")
            ? "일본"
            : { ko: "한국", ja: "일본", en: "영미" }[lg] || "기타";
    const t = [country];
    let genreTag = c?.genre ? capGenre(c.genre) : "";
    if (country === "한국" && genreTag === "J-Pop") genreTag = "K-Pop";
    if (country === "일본" && genreTag === "K-Pop") genreTag = "J-Pop";
    if (genreTag) t.push(genreTag);
    if (c?.year) t.push(String(c.year)); // exact release year, not the decade
    return t;
  };

  // set country/year tags immediately, then let Gemini append moods + title + comment
  const autotag = async (c, lyricsText, lg = lang) => {
    setTags(baseTags(c, lg).join(", ")); // guaranteed baseline
    try {
      const { tags: auto, titleKo: tko, artistKo: ako, comment: cm } = await api("autotag", {
        ...c,
        lang: lg,
        lyrics: lyricsText,
      });
      if (auto?.length) setTags(auto.join(", ")); // server merges base + genre + moods
      if (tko) setTitleKo(tko);
      if (ako) setArtistKo(ako);
      if (cm) setComment(cm);
    } catch {} // Gemini 실패해도 국가·연도 태그는 이미 세팅됨
  };

  const pick = (c) =>
    run("lyrics", async () => {
      setSong(c);
      setLyrics("");
      setTitleKo("");
      setArtistKo("");
      setSearchLinks(null);
      setTags(baseTags(c, lang).join(", ")); // country/year show up the moment a song is picked
      const { lyrics: found, searchLinks: links } = await api("lyrics", c);
      if (found) {
        const lg = detectLang(found); // script of the lyrics decides the translation mode
        setLang(lg);
        setLyrics(found);
        autotag(c, found, lg); // tags + comment from lyrics, no translation needed
      } else {
        setSearchLinks(links || []); // not on lrclib — offer source links to paste from
      }
    })();

  const translate = run("translate", async () => {
    const { text } = await api("translate", {
      title: song.title,
      artist: song.artist,
      lang,
      lyrics,
    });
    setTranslated(text);
    autotag(song, lyrics);
  });

  const save = run("save", async () => {
    const { slug } = await api("save", {
      ...song,
      titleKo,
      artistKo,
      lang,
      tags,
      comment,
      lyrics: translated,
    });
    setSavedSlug(slug);
  });

  return (
    <div className="max-w-2xl space-y-8">
      {/* 1. search */}
      <section>
        <Step n="1" label="곡 검색" />
        <div className="flex flex-wrap gap-2">
          <input
            className={input + " flex-1 basis-48"}
            placeholder="곡명·가수 무엇이든 (예: lemon 米津玄師)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className={btn} disabled={!query || busy} onClick={() => search()}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
        {more && candidates.length === 0 && (
          <p className="mt-3 text-sm text-muted">결과 없음 — 검색어를 바꿔보세요</p>
        )}
        {candidates.length > 0 && (
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {candidates.map((c, i) => {
              // candidates have no slug yet — the playing row is matched by preview URL
              const playing = !!c.preview && track?.preview === c.preview;
              return (
                <li key={i} className={`flex items-center ${song === c ? "bg-surface" : ""}`}>
                  <button
                    onClick={() => pick(c)}
                    className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface ${
                      song === c ? "text-accent" : ""
                    }`}
                  >
                    <img src={c.thumb} alt="" className="h-10 w-10 rounded" />
                    <span className="min-w-0">
                      <span className="font-medium">{c.title}</span>
                      <span className="text-muted"> — {c.artist} · {c.album}</span>
                    </span>
                  </button>
                  {c.preview && (
                    <button
                      onClick={() =>
                        setTrack(
                          playing
                            ? null
                            : { slug: "", title: c.title, artist: c.artist, artwork: c.artwork || c.thumb, preview: c.preview }
                        )
                      }
                      aria-label={playing ? "정지" : "미리듣기"}
                      className={`mx-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs transition ${
                        playing
                          ? "border-accent bg-accent text-bg"
                          : "border-line text-muted hover:border-accent hover:text-accent"
                      }`}
                    >
                      {playing ? "■" : "▶"}
                    </button>
                  )}
                </li>
              );
            })}
            {more?.hasMore && (
              <li>
                <button
                  onClick={() => search(more.nextOffset)}
                  disabled={!!busy}
                  className="w-full px-3 py-2.5 text-center text-sm text-accent hover:bg-surface disabled:opacity-40"
                >
                  {busy === "search" ? "불러오는 중…" : "더 보기 ↓"}
                </button>
              </li>
            )}
          </ul>
        )}
      </section>

      {/* 2. lyrics + translate */}
      {song && (
        <section>
          <Step n="2" label="가사 확인 → Gemini 번역" />
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span>가사 언어 (자동 감지, 틀리면 바꾸세요)</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="en">영어</option>
              <option value="ja">일본어</option>
              <option value="ko">한국어</option>
            </select>
          </div>
          {searchLinks && (
            <div className="mb-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
              <span className="text-muted">가사 DB에 없는 곡입니다. 원문을 찾아 아래에 붙여넣으세요:</span>{" "}
              {searchLinks.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-accent hover:underline"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}
          <textarea
            className={input + " h-56 font-mono text-xs"}
            placeholder={
              busy === "lyrics" ? "가사 불러오는 중…" : "가사를 못 찾으면 직접 붙여넣으세요"
            }
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} disabled={!lyrics.trim() || busy} onClick={translate}>
              {busy === "translate" ? "번역 중…" : "Gemini 번역 생성"}
            </button>
            {lang === "ko" && (
              <button
                className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
                disabled={!lyrics.trim() || busy}
                onClick={() => {
                  setTranslated(lyrics);
                  autotag(song, lyrics);
                }}
              >
                이대로 사용 (번역 없음)
              </button>
            )}
            <button
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
              disabled={!lyrics.trim() || busy}
              onClick={() => run("autotag", () => autotag(song, lyrics))()}
            >
              {busy === "autotag" ? "생성 중…" : "태그·코멘트 자동생성"}
            </button>
          </div>
        </section>
      )}

      {/* 3. review + save */}
      {translated && (
        <section>
          <Step n="3" label="검수 · 노트 추가 · 저장" />
          <p className="mb-2 text-xs text-muted">
            번역 직접 수정 가능. 절 아래 <code>// 해설</code> 줄을 넣으면 분석 노트로 표시됨.
          </p>
          <textarea
            className={input + " h-72 font-mono text-xs"}
            value={translated}
            onChange={(e) => setTranslated(e.target.value)}
          />
          <div className="mt-2 space-y-2">
            <input className={input} placeholder="한글 제목 (예: 예스터데이)" value={titleKo} onChange={(e) => setTitleKo(e.target.value)} />
            <input className={input} placeholder="가수 한글 독음 (일본 아티스트만, 예: 요네즈 켄시)" value={artistKo} onChange={(e) => setArtistKo(e.target.value)} />
            <input className={input} placeholder="태그 (국적·장르·년도, 예: 영미, Rock, 2018)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <textarea className={input + " h-20"} placeholder="곡 코멘트 (자동생성됨, 수정 가능)" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          <button className={btn + " mt-3"} disabled={busy} onClick={save}>
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
          {savedSlug && (
            <span className="ml-3 text-sm text-muted">
              저장됨 ✓{" "}
              <a href={`/songs/${savedSlug}`} className="text-accent underline">
                페이지 보기
              </a>
              <span className="block text-xs">
                온라인 배포본은 재배포(약 1분) 후 반영됩니다.
              </span>
            </span>
          )}
        </section>
      )}

      {/* red-400 only clears WCAG AA on the dark background */}
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
