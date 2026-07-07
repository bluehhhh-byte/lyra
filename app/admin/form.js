"use client";
import { useState } from "react";

async function api(action, body) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const btn =
  "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40";

export default function AdminForm() {
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

  const pick = (c) =>
    run("lyrics", async () => {
      setSong(c);
      setLyrics("");
      const { lyrics: found } = await api("lyrics", c);
      if (found) setLyrics(found);
      else setError("가사를 못 찾음 — 직접 붙여넣으세요");
    })();

  const [titleKo, setTitleKo] = useState("");

  const autotag = async () => {
    try {
      const { tags: auto, titleKo: tko } = await api("autotag", { ...song, lang, lyrics });
      setTags(auto.join(", "));
      if (tko) setTitleKo(tko);
    } catch {} // 태그·제목 자동생성 실패는 치명적이지 않음 — 직접 입력하면 됨
  };

  const translate = run("translate", async () => {
    const { text } = await api("translate", {
      title: song.title,
      artist: song.artist,
      lang,
      lyrics,
    });
    setTranslated(text);
    autotag();
  });

  const save = run("save", async () => {
    const { slug } = await api("save", {
      ...song,
      titleKo,
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
        <div className="flex gap-2">
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={input + " w-28"}>
            <option value="en">영어</option>
            <option value="ja">일본어</option>
            <option value="ko">한국어</option>
          </select>
          <input
            className={input}
            placeholder="곡명 아티스트 (예: lemon 米津玄師)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className={btn} disabled={!query || busy} onClick={() => search()}>
            {busy === "search" ? "…" : "검색"}
          </button>
        </div>
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
          {lang === "ko" ? (
            <button
              className={btn + " mt-2"}
              disabled={!lyrics.trim() || busy}
              onClick={() => {
                setTranslated(lyrics);
                autotag();
              }}
            >
              이대로 사용 (번역 없음)
            </button>
          ) : (
            <button className={btn + " mt-2"} disabled={!lyrics.trim() || busy} onClick={translate}>
              {busy === "translate" ? "번역 중…" : "Gemini 번역 생성"}
            </button>
          )}
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
            <input className={input} placeholder="태그 (쉼표 구분: rock, 새벽감성)" value={tags} onChange={(e) => setTags(e.target.value)} />
            <input className={input} placeholder="곡 코멘트 한 줄" value={comment} onChange={(e) => setComment(e.target.value)} />
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
