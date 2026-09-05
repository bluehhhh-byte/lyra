"use client";
import { useState } from "react";
import { usePlayer } from "../player";
import AdminErrorMessage from "./error-message";
import SongAppearanceEditor from "./song-appearance-editor";
import SongAppearanceDraft, { emptyAppearanceDraft } from "./song-appearance-draft";

async function api(action, body, { timeoutMs = 0 } = {}) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("AI 요청이 60초를 넘어 중단됐습니다. 잠시 후 다시 시도해 주세요");
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) {
    const error = new Error(data.error || `HTTP ${res.status}`);
    error.status = res.status;
    error.details = data;
    throw error;
  }
  return data;
}

// text-base(16px) on mobile stops iOS focus-zoom; text-sm on ≥sm keeps the compact look
const input =
  "w-full  border border-line bg-surface px-3 py-2 text-base sm:text-sm outline-none focus:border-accent";
const btn =
  " ink-action px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.98] disabled:opacity-40";

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
  const [more, setMore] = useState(null); // {hasMore, nextCursor}
  const [searchSources, setSearchSources] = useState([]);
  const [searchSourceStatus, setSearchSourceStatus] = useState([]);
  const [searchQueries, setSearchQueries] = useState([]);
  const [song, setSong] = useState(null); // picked candidate
  const [lang, setLang] = useState("en");
  const [lyrics, setLyrics] = useState("");
  const [translated, setTranslated] = useState("");
  const [tags, setTags] = useState("");
  const [comment, setComment] = useState("");
  const [commentBasis, setCommentBasis] = useState("manual");
  const [commentSources, setCommentSources] = useState([]);
  const [keywords, setKeywords] = useState([]); // 번역 가사 핵심 단어 — autotag가 채움
  const [emotion, setEmotion] = useState(""); // 감정 한 단어 — autotag가 채움
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState(null);
  const [searchLinks, setSearchLinks] = useState(null); // shown when lyrics aren't found
  // 어디에도 원문이 공개돼 있지 않은 곡. 이 표시가 있으면 needs.js가 번역·독음·
  // 키워드 대기열에서 빼 준다 — 채울 수 없는 항목으로 영원히 남지 않게.
  const [lyricsNone, setLyricsNone] = useState(false);
  const [instrumental, setInstrumental] = useState(false);
  const [lyricsNote, setLyricsNote] = useState("");
  const [appearance, setAppearance] = useState(emptyAppearanceDraft);
  const [appearanceSearchState, setAppearanceSearchState] = useState("idle");
  const [researchWarning, setResearchWarning] = useState("");

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

  const search = (cursor = null, { append = false } = {}) =>
    run("search", async () => {
      if (!append) {
        setCandidates([]);
        setMore(null);
        setSearchSources([]);
        setSearchSourceStatus([]);
        setSearchQueries([]);
      }
      const { results, hasMore, nextCursor, sources = [], sourceStatus = [], searchQueries: usedQueries = [] } =
        await api("search", { query, cursor });
      setCandidates((prev) => {
        const base = append ? prev : [];
        const seen = new Set(base.map((c) => `${c.title}|${c.artist}`.toLowerCase()));
        return [...base, ...results.filter((c) => !seen.has(`${c.title}|${c.artist}`.toLowerCase()))];
      });
      setMore({ hasMore, nextCursor });
      setSearchSources((previous) => append ? [...new Set([...previous, ...sources])] : sources);
      setSearchSourceStatus(sourceStatus);
      setSearchQueries(usedQueries);
      if (!append) setSong(null);
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

  // Set the deterministic tags first. Metadata classification runs before the
  // grounded research so its provisional comment can be passed as a *search
  // hint*, never as evidence. This closes the old race where the comment knew a
  // film name but the parallel appearance lookup never saw it.
  const autotag = async (c, lyricsText, lg = lang) => {
    setTags(baseTags(c, lg).join(", ")); // guaranteed baseline
    let commentHint = "";
    try {
      const { tags: auto, titleKo: tko, artistKo: ako, comment: cm, keywords: kw, emotion: em } =
        await api("autotag", { ...c, lang: lg, lyrics: lyricsText }, { timeoutMs: 60_000 });
      if (auto?.length) setTags(auto.join(", ")); // server merges base + genre + moods
      if (tko) setTitleKo(tko);
      if (ako) setArtistKo(ako);
      if (cm) setComment(cm);
      if (cm) setCommentBasis("lyrics_only");
      setCommentSources([]);
      commentHint = cm || "";
      // ride along invisibly — the save posts them; no review UI, the regen
      // tool can always redo them later
      if (kw?.length) setKeywords(kw);
      if (em) setEmotion(em);
    } catch {
      // Country/year and store genre remain usable when metadata generation is
      // rate-limited. The grounded research below can still produce a comment.
    }

    setAppearanceSearchState("searching");
    try {
      const { suggestion, researchComment, commentBasis: basis, commentSources: sources, appearanceState, researchWarning: warning } = await api(
        "appearanceSuggest",
        { ...c, lang: lg, lyrics: lyricsText, commentHint },
        { timeoutMs: 60_000 }
      );
      if (researchComment) {
        setComment(researchComment);
        setCommentBasis(basis || "lyrics_only");
        setCommentSources(sources || []);
      }
      setResearchWarning(warning || "");
      setAppearance(suggestion ? { ...emptyAppearanceDraft(), ...suggestion } : emptyAppearanceDraft());
      setAppearanceSearchState(suggestion ? "found" : appearanceState === "needs_review" ? "needs_review" : "empty");
    } catch (reason) {
      setAppearanceSearchState("error");
      setError(`작품 정보 자동 검색 실패: ${reason.message}`);
    }
    // Research failure does not block registration, but it is no longer lied
    // about as a confirmed "not found" result.
  };

  const pick = (c) =>
    run("lyrics", async () => {
      setSong(c);
      setSavedSlug("");
      setDuplicateMatch(null);
      setLyrics("");
      setTitleKo("");
      setArtistKo("");
      setComment("");
      setCommentBasis("manual");
      setCommentSources([]);
      setTranslated("");
      setLyricsNone(false);
      setInstrumental(false);
      setAppearance(emptyAppearanceDraft());
      setAppearanceSearchState("idle");
      setResearchWarning("");
      setSearchLinks(null);
      setTags(baseTags(c, lang).join(", ")); // country/year show up the moment a song is picked
      const { lyrics: found, searchLinks: links } = await api("lyrics", c);
      if (found) {
        const lg = detectLang(found); // script of the lyrics decides the translation mode
        setLang(lg);
        setLyrics(found);
        // 메타 생성은 번역 버튼에서 한 번만 한다. 곡을 고르는 순간 먼저 호출하면
        // 같은 가사로 Gemini를 다시 부르게 되고, 사용자가 가사를 고쳐도 첫 결과가
        // 뒤늦게 도착해 수정본을 덮을 수 있다.
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
    }, { timeoutMs: 60_000 });
    setTranslated(text);
    await autotag(song, lyrics);
  });

  const save = run("save", async () => {
    if (appearance.workTitle.trim() && (!appearance.workType || !appearance.role)) {
      throw new Error("작품 정보를 저장하려면 작품 종류와 사용 방식을 선택해 주세요");
    }
    setDuplicateMatch(null);
    let slug;
    try {
      ({ slug } = await api("save", {
        ...song,
        titleKo,
        artistKo,
        lang,
        tags,
        comment,
        commentBasis,
        commentSources: commentSources.map((source) => source.uri),
        keywords,
        emotion,
        lyrics: translated,
        lyricsNone,
        instrumental,
        lyricsNote,
      }));
    } catch (reason) {
      if (reason.details?.duplicate) setDuplicateMatch(reason.details.duplicate);
      throw reason;
    }
    let appearanceError = "";
    if (appearance.workTitle.trim()) {
      try {
        await api("appearanceSave", { songSlug: slug, ...appearance });
      } catch (reason) {
        appearanceError = reason.message;
      }
    }
    setSavedSlug(slug);
    if (appearanceError) setError(`곡은 저장됐지만 작품 정보는 저장하지 못했습니다: ${appearanceError}`);
  });

  const searchAppearance = run("appearance", async () => {
    setAppearanceSearchState("searching");
    try {
      const { suggestion, researchComment, commentBasis: basis, commentSources: sources, appearanceState, researchWarning: warning } = await api(
        "appearanceSuggest",
        { ...(song || {}), lyrics, commentHint: comment },
        { timeoutMs: 60_000 }
      );
      if (researchComment) {
        setComment(researchComment);
        setCommentBasis(basis || "lyrics_only");
        setCommentSources(sources || []);
      }
      setResearchWarning(warning || "");
      setAppearance(suggestion ? { ...emptyAppearanceDraft(), ...suggestion } : emptyAppearanceDraft());
      setAppearanceSearchState(suggestion ? "found" : appearanceState === "needs_review" ? "needs_review" : "empty");
    } catch (reason) {
      setAppearanceSearchState("error");
      throw reason;
    }
  });

  return (
    <div className="max-w-2xl space-y-8">
      {/* 1. search */}
      <section>
        <Step label="곡검색" />
        <div className="flex flex-wrap gap-2">
          <input
            className={input + " flex-1 basis-48"}
            placeholder="곡명·가수 무엇이든 (예: lemon 米津玄師)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && search()}
          />
          <button className={btn} disabled={!query || busy} onClick={() => search()}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Apple Music 3개 스토어를 함께 검색합니다. 19금·독립·구작 음원도 포함합니다.
        </p>
        {searchQueries.length > 1 && (
          <p className="mt-1 text-xs text-muted" role="status">
            등록된 번역·표기 정보를 적용해 <span className="text-accent">{searchQueries.at(-1)}</span>로도 찾았습니다.
          </p>
        )}
        {searchSourceStatus.some((source) => !source.ok || source.partial) && (
          <div className="mt-3 flex items-center justify-between gap-3 border border-line bg-surface px-3 py-2 text-xs">
            <span className="text-muted">
              {searchSourceStatus.filter((source) => !source.ok || source.partial).map((source) => `${source.label}: ${source.error || "응답 실패"}`).join(" · ")}
              {candidates.length ? " — 다른 검색 결과는 정상 표시했습니다." : ""}
            </span>
            <button type="button" className="shrink-0 text-accent hover:underline" disabled={!!busy} onClick={() => search()}>
              전체 재시도
            </button>
          </div>
        )}
        {/* skeleton rows while the first page of a search is in flight */}
        {busy === "search" && candidates.length === 0 && (
          <ul className="mt-3 divide-y divide-line overflow-hidden  border border-line" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <div className="h-10 w-10 shrink-0 animate-pulse  bg-surface" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-3.5 w-2/5 animate-pulse  bg-surface" />
                  <div className="h-3 w-3/5 animate-pulse  bg-surface" />
                </div>
              </li>
            ))}
          </ul>
        )}
        {busy !== "search" && more && candidates.length === 0 && (
          <p className="mt-3 text-sm text-muted" role="status">결과 없음 — 검색어를 바꿔보세요</p>
        )}
        {/* announce the result count to screen readers without a visual change */}
        {candidates.length > 0 && (
          <p className="mt-2 text-xs text-muted" role="status" aria-live="polite">
            검색 결과 {candidates.length}곡{searchSources.length ? ` · ${searchSources.join(" + ")}` : ""}
          </p>
        )}
        {candidates.length > 0 && (
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto  border border-line">
            {candidates.map((c, i) => {
              // candidates have no slug yet — the playing row is matched by preview URL
              const playing = !!c.preview && track?.preview === c.preview;
              return (
                <li key={i} className={`flex items-center ${song === c ? "bg-surface" : ""}`}>
                  <button
                    onClick={() => pick(c)}
                    disabled={!!c.registered}
                    className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface ${
                      song === c ? "text-accent" : ""
                    }`}
                  >
                    {c.thumb ? (
                      <img src={c.thumb} alt="" className="h-10 w-10 " />
                    ) : (
                      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center bg-line text-[9px] text-muted">NO ART</span>
                    )}
                    <span className="min-w-0">
                      <span className="font-medium">{c.title}</span>
                      <span className="text-muted"> — {c.artist}{c.album ? ` · ${c.album}` : ""}</span>
                      <span className="ml-2 text-[10px] text-muted">{c.sourceLabel || "Apple Music"}</span>
                      {c.registered && <span className="ml-2 text-[10px] font-semibold text-accent">등록됨</span>}
                    </span>
                  </button>
                  {c.registered && (
                    <a href={`/songs/${c.registered.slug}`} className="mr-3 shrink-0 text-xs text-accent hover:underline">
                      페이지 보기
                    </a>
                  )}
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
                      className={`mx-2 flex h-8 w-8 shrink-0 items-center justify-center  border text-xs transition ${
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
                  onClick={() => search(more.nextCursor, { append: true })}
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
          <Step label="가사 확인 → Gemini 번역" />
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <span>가사 언어 (자동 감지, 틀리면 바꾸세요)</span>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              className=" border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="en">영어</option>
              <option value="ja">일본어</option>
              <option value="ko">한국어</option>
            </select>
          </div>
          {searchLinks && (
            <div className="mb-2  border border-line bg-surface px-3 py-2 text-xs">
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
                className=" border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
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
              className=" border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
              disabled={!lyrics.trim() || busy}
              onClick={() => run("autotag", () => autotag(song, lyrics))()}
            >
              {busy === "autotag" ? "생성 중…" : "태그·코멘트 자동생성"}
            </button>
          </div>
          {/* 가사를 못 구한 곡의 유일한 출구. 위 버튼들은 모두 가사가 있어야 눌리고,
              3단계는 그 버튼들이 채우는 값이 있어야 나타난다. 그래서 원문이 없는 곡은
              등록 자체가 불가능했다. 이 버튼만 가사를 요구하지 않는다. */}
          {!lyrics.trim() && !lyricsNone && !instrumental && (
            <div className="mt-3  border border-line px-3 py-3">
              <p className="text-xs text-muted">
                연주곡은 음악적 특징을 바탕으로 코멘트와 한글 제목을 자동 생성합니다. 가사가
                공개되지 않은 보컬곡도 원문 없이 등록할 수 있습니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className=" border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
                  disabled={busy}
                  onClick={run("autotag", async () => {
                    setInstrumental(true);
                    setLyricsNone(false);
                    await autotag({ ...song, instrumental: true }, "");
                  })}
                >
                  {busy === "autotag" ? "메타 생성 중…" : "연주곡으로 등록"}
                </button>
                <button
                  className=" border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40"
                  disabled={busy}
                  onClick={run("autotag", async () => {
                    setLyricsNone(true);
                    setInstrumental(false);
                    await autotag(song, "");
                  })}
                >
                  가사 원문 없이 등록
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 3. review + save */}
      {(translated || lyricsNone || instrumental) && (
        <section>
          <Step label="검수 · 노트 추가 · 저장" />
          {lyricsNone || instrumental ? (
            <div className="mb-2  border border-accent/30 bg-accent/5 px-3 py-3">
              <p className="text-xs">
                <b>{instrumental ? "연주곡" : "가사 원문 없이 등록"}</b> — 원문 자리는 비워
                두며, 자동 생성된 코멘트와 한글 제목은 아래에서 수정할 수 있습니다.
              </p>
              <input
                className={input + " mt-2"}
                placeholder={instrumental ? "선택 메모 (예: 피아노 연주곡)" : "원문이 없는 이유 (예: 어디에도 가사가 공개되지 않음)"}
                value={lyricsNote}
                onChange={(e) => setLyricsNote(e.target.value)}
              />
              <button
                className="mt-2 text-xs text-muted underline hover:text-accent"
                onClick={() => {
                  setLyricsNone(false);
                  setInstrumental(false);
                }}
              >
                취소하고 가사를 붙여넣기
              </button>
            </div>
          ) : (
            <p className="mb-2 text-xs text-muted">
              번역 직접 수정 가능. 절 아래 <code>// 해설</code> 줄을 넣으면 분석 노트로 표시됨.
            </p>
          )}
          <textarea
            className={input + " h-72 font-mono text-xs"}
            placeholder={lyricsNone || instrumental ? "비워 두거나, 이 곡에 대한 해설을 적으세요" : ""}
            value={translated}
            onChange={(e) => setTranslated(e.target.value)}
          />
          <div className="mt-2 space-y-2">
            <label className="block text-xs text-muted">
              한글 번역 제목
              <input className={input + " mt-1"} placeholder="뜻을 번역해 입력 (예: Yesterday → 어제)" value={titleKo} onChange={(e) => setTitleKo(e.target.value)} />
              <span className="mt-1 block text-[11px] text-muted">영어·일본어 제목의 발음 표기가 아니라 의미를 자연스럽게 번역한 제목입니다.</span>
            </label>
            <SongAppearanceDraft
              value={appearance}
              onChange={setAppearance}
              onAiSearch={searchAppearance}
              busy={busy === "appearance" || busy === "autotag" || busy === "translate"}
              searchState={appearanceSearchState}
              warning={researchWarning}
            />
            <input className={input} placeholder="가수 한글 독음 (일본 아티스트만, 예: 요네즈 켄시)" value={artistKo} onChange={(e) => setArtistKo(e.target.value)} />
            <input className={input} placeholder="태그 (국적·장르·년도, 예: 영미, Rock, 2018)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <textarea className={input + " h-20"} placeholder="곡 코멘트 (자동생성됨, 수정 가능)" value={comment} onChange={(e) => {
              setComment(e.target.value);
              setCommentBasis("manual");
              setCommentSources([]);
            }} />
            {commentSources.length > 0 && (
              <p className="text-[11px] leading-relaxed text-muted" data-comment-source-preview>
                웹 근거: {commentSources.map((source, index) => (
                  <span key={source.uri}>
                    {index > 0 && " · "}
                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {source.title || new URL(source.uri).hostname} ↗
                    </a>
                  </span>
                ))}
                <span className="ml-2">코멘트를 직접 수정하면 근거 연결은 해제됩니다.</span>
              </p>
            )}
          </div>
          <button className={btn + " mt-3"} disabled={busy} onClick={save}>
            {busy === "save" ? "저장 중…" : "저장"}
          </button>
          {duplicateMatch && (
            <div className="mt-3 border border-accent/50 bg-surface px-3 py-2 text-sm" role="alert">
              <span className="font-semibold">이미 등록된 곡입니다.</span>{" "}
              <a href={`/songs/${duplicateMatch.slug}`} className="text-accent underline">기존 곡 페이지 보기</a>
              <span className="mx-2 text-muted">·</span>
              <a href={`/admin/edit/${duplicateMatch.slug}`} className="text-accent underline">기존 기록 수정</a>
            </div>
          )}
          {savedSlug && (
            <span className="ml-3 text-sm text-muted">
              저장됨 ✓{" "}
              <a href={`/songs/${savedSlug}`} className="text-accent underline">
                페이지 보기
              </a>
              <span className="block text-xs">
                저장이 완료되었습니다.
              </span>
            </span>
          )}
        </section>
      )}

      {savedSlug && <SongAppearanceEditor songSlug={savedSlug} />}

      <AdminErrorMessage message={error} />
    </div>
  );
}

function Step({ label }) {
  return (
    <h2 className="mb-3 text-sm font-semibold">{label}</h2>
  );
}
