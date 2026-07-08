"use client";
import { useState } from "react";

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
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40";

const FIELDS = [
  { key: "artist", label: "가수명", placeholder: "가수명 (예: 米津玄師)" },
  { key: "title", label: "제목", placeholder: "곡 제목 (예: lemon)" },
  { key: "all", label: "전체", placeholder: "곡명 아티스트 (예: lemon 米津玄師)" },
];

export default function AdminForm() {
  const [query, setQuery] = useState("");
  const [field, setField] = useState("artist");
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
      const { results, hasMore, nextOffset } = await api("search", { query, field, offset });
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

  // country + decade — deterministic, always present even if Gemini is unavailable
  const baseTags = (c) => {
    const t = [{ ko: "한국", ja: "일본", en: "영미" }[lang] || "기타"];
    if (c?.year) t.push(`${Math.floor(+c.year / 10) * 10}s`);
    return t;
  };

  // set country/year tags immediately, then let Gemini append moods + title + comment
  const autotag = async (c, lyricsText) => {
    setTags(baseTags(c).join(", ")); // guaranteed baseline
    try {
      const { tags: auto, titleKo: tko, artistKo: ako, comment: cm } = await api("autotag", {
        ...c,
        lang,
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
      setTags(baseTags(c).join(", ")); // country/year show up the moment a song is picked
      const { lyrics: found } = await api("lyrics", c);
      if (found) {
        setLyrics(found);
        autotag(c, found); // tags + comment from lyrics, no translation needed
      } else {
        setError("가사를 못 찾음 — 직접 붙여넣은 뒤 '자동 생성'을 누르세요");
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
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={input + " w-28"}>
            <option value="en">영어</option>
            <option value="ja">일본어</option>
            <option value="ko">한국어</option>
          </select>
          <select
            value={field}
            onChange={(e) => {
              setField(e.target.value);
              setCandidates([]); // stale results would mix with the next field's page
              setMore(null);
            }}
            className={input + " w-28"}
          >
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
          <input
            className={input + " flex-1 basis-48"}
            placeholder={FIELDS.find((f) => f.key === field).placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className={btn} disabled={!query || busy} onClick={() => search()}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
        {more && candidates.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            결과 없음 — 검색 필드를 바꿔보세요
          </p>
        )}
        {candidates.length > 0 && (
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {candidates.map((c, i) => (
              <li key={i}>
                <button
                  onClick={() => pick(c)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface ${
                    song === c ? "bg-surface text-accent" : ""
                  }`}
                >
                  <img src={c.thumb} alt="" className="h-10 w-10 rounded" />
                  <span>
                    <span className="font-medium">{c.title}</span>
                    <span className="text-muted"> — {c.artist} · {c.album}</span>
                  </span>
                </button>
              </li>
            ))}
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
          <Step n="2" label={lang === "ko" ? "가사 확인" : "가사 확인 → Gemini 번역"} />
          <textarea
            className={input + " h-56 font-mono text-xs"}
            placeholder={busy === "lyrics" ? "가사 불러오는 중…" : "가사를 못 찾으면 직접 붙여넣으세요"}
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {lang === "ko" ? (
              <>
                {/[a-zA-Z]/.test(lyrics) && (
                  <button className={btn} disabled={!lyrics.trim() || busy} onClick={translate}>
                    {busy === "translate" ? "번역 중…" : "영어 부분 번역"}
                  </button>
                )}
                <button
                  className={/[a-zA-Z]/.test(lyrics) ? "rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-accent disabled:opacity-40" : btn}
                  disabled={!lyrics.trim() || busy}
                  onClick={() => {
                    setTranslated(lyrics);
                    autotag(song, lyrics);
                  }}
                >
                  이대로 사용 (번역 없음)
                </button>
              </>
            ) : (
              <button className={btn} disabled={!lyrics.trim() || busy} onClick={translate}>
                {busy === "translate" ? "번역 중…" : "Gemini 번역 생성"}
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
            <input className={input} placeholder="태그 (쉼표 구분: 영미, 2010s, rock, 새벽감성)" value={tags} onChange={(e) => setTags(e.target.value)} />
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

      {error && <p className="text-sm text-red-400">{error}</p>}
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
