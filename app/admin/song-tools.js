"use client";
import { useState } from "react";
import { EMOTIONS } from "../../lib/keywords";

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

// Space bulk Gemini calls out — the free tier's per-minute limit (~10 RPM) is
// the usual cause of empty responses: back-to-back calls burst past it.
// 4s/song proved too tight in practice (15/min → 429 storms mid-run); 7s keeps
// a whole-collection run at ~8.5/min, under the limit with headroom.
const BULK_GAP_MS = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Per-song maintenance: regenerate the comment (음슴체), or add a translation to a
// song that has none (used to give Korean songs the bilingual two-line layout).
export default function SongTools({ songs }) {
  const [state, setState] = useState({}); // slug -> { busy, comment, msg, err }
  const [bulk, setBulk] = useState(null); // {done, total} while regenerating all

  const set = (slug, patch) => setState((s) => ({ ...s, [slug]: { ...s[slug], ...patch } }));

  const regenMeta = async (slug) => {
    set(slug, { busy: "meta", err: "", msg: "" });
    try {
      const { updated } = await api("regenMeta", { slug });
      set(slug, { msg: updated?.length ? `갱신: ${updated.join(", ")}` : "변경 없음" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  // one song per request (timeout-safe), sequential to respect the Gemini rate limit
  const regenAll = async () => {
    // 곡당 1회 호출 × 전곡 — 무료 일일 한도를 크게 먹는다. 실수 클릭 방지.
    if (!confirm(`전체 ${songs.length}곡 = Gemini ${songs.length}회 호출 (약 ${Math.ceil((songs.length * 7) / 60)}분).\n태그·코멘트·독음을 전부 덮어씁니다. 계속할까요?`)) return;
    for (let i = 0; i < songs.length; i++) {
      setBulk({ done: i, total: songs.length });
      await regenMeta(songs[i].slug);
      if (i < songs.length - 1) await sleep(BULK_GAP_MS); // stay under the RPM limit
    }
    setBulk({ done: songs.length, total: songs.length });
    setTimeout(() => setBulk(null), 4000);
  };

  // keywords+emotion only — regenAll would also clobber comments/tags.
  // Sequential: parallel calls trip the Gemini free-tier rate limit.
  const keywordsAll = async () => {
    if (!confirm(`전체 ${songs.length}곡 = Gemini ${songs.length}회 호출 (약 ${Math.ceil((songs.length * 7) / 60)}분).\nkeywords·emotion만 채웁니다(코멘트·태그 보존). 계속할까요?`)) return;
    for (let i = 0; i < songs.length; i++) {
      setBulk({ done: i, total: songs.length });
      const slug = songs[i].slug;
      set(slug, { busy: "keywords", err: "", msg: "" });
      try {
        const { keywords, emotion } = await api("regenKeywords", { slug });
        set(slug, { msg: `#${keywords.join(" #")}${emotion ? ` · ${emotion}` : ""}` });
      } catch (e) {
        set(slug, { err: e.message });
      } finally {
        set(slug, { busy: "" });
      }
      if (i < songs.length - 1) await sleep(BULK_GAP_MS); // stay under the RPM limit
    }
    setBulk({ done: songs.length, total: songs.length });
    setTimeout(() => setBulk(null), 4000);
  };

  const regen = async (slug) => {
    set(slug, { busy: "comment", err: "", msg: "" });
    try {
      const { comment } = await api("regenComment", { slug });
      set(slug, { comment });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const notes = async (slug) => {
    set(slug, { busy: "notes", err: "", msg: "" });
    try {
      const { notes: n } = await api("regenNotes", { slug });
      set(slug, { msg: `해설 ${n}개 생성 (재배포 후 반영)` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  const restanza = async (slug) => {
    set(slug, { busy: "stanza", err: "", msg: "" });
    try {
      const { stanzas } = await api("restanza", { slug });
      set(slug, { msg: `연 ${stanzas}개로 재구성 (재배포 후 반영)` });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  // 추천 곡 생성 — Gemini 1회 + iTunes 매칭. /recommendations/music에 회차로 쌓인다.
  const [recsBusy, setRecsBusy] = useState("");
  const [recMode, setRecMode] = useState("balance");
  const [recEmotion, setRecEmotion] = useState("고독");
  const songRecs = async () => {
    setRecsBusy("추천 생성 중…");
    try {
      const { added, total, mode } = await api("songRecs", { mode: recMode, emotion: recEmotion });
      setRecsBusy(`추천 +${added}곡 (${mode}, 누적 ${total}) — 재배포 후 반영`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  // 취향 리포트 생성 — Gemini 1회. /songs/taste 상단에 표시되고 추천 프롬프트에도 반영.
  const musicReport = async () => {
    setRecsBusy("리포트 생성 중…");
    try {
      const { count } = await api("musicReport", {});
      setRecsBusy(`리포트 생성됨 (${count}곡 기준) — 재배포 후 반영`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  // 가사 모티프 생성 — 전곡 가사를 Gemini 1회로 클러스터. /songs/motifs 반영.
  const motifs = async () => {
    setRecsBusy("모티프 분석 중…");
    try {
      const { motifs: n } = await api("motifs", {});
      setRecsBusy(`모티프 ${n}개 생성됨 — 재배포 후 반영`);
    } catch (e) {
      setRecsBusy(`실패: ${e.message}`);
    }
  };

  const addTrans = async (slug) => {
    set(slug, { busy: "trans", err: "", msg: "" });
    try {
      await api("addTranslation", { slug });
      set(slug, { msg: "번역 추가됨 (재배포 후 반영)" });
    } catch (e) {
      set(slug, { err: e.message });
    } finally {
      set(slug, { busy: "" });
    }
  };

  return (
    <div className="max-w-2xl">
      {/* 모바일: 2×2 그리드(버튼 3 + 설명), 데스크톱: 한 줄 — 버튼 3개가
          min-w 고정 flex라 좁은 화면을 뚫고 나가던 것 */}
      <div className="mb-3 grid grid-cols-2 items-center gap-2 sm:flex sm:gap-3">
        <button
          onClick={regenAll}
          disabled={!!bulk}
          className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-semibold leading-tight tabular-nums text-bg disabled:opacity-40 sm:min-w-32"
        >
          {/* two lines in both states so the button keeps its size while running */}
          전체 메타
          <br />
          {bulk ? `재생성 중… ${bulk.done}/${bulk.total}` : "AI 재생성"}
        </button>
        <button
          onClick={keywordsAll}
          disabled={!!bulk}
          className="rounded-lg border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight tabular-nums text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          키워드·감정
          <br />
          {bulk ? `추출 중… ${bulk.done}/${bulk.total}` : "일괄 추출"}
        </button>
        <div className="flex flex-col gap-1 sm:min-w-32">
          <div className="flex gap-1">
            <select
              value={recMode}
              onChange={(e) => setRecMode(e.target.value)}
              aria-label="추천 방향"
              className="w-full rounded-lg border border-line bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
            >
              <option value="balance">균형</option>
              <option value="deep">깊게</option>
              <option value="wide">넓게</option>
              <option value="mood">분위기</option>
            </select>
            {recMode === "mood" && (
              <select
                value={recEmotion}
                onChange={(e) => setRecEmotion(e.target.value)}
                aria-label="감정"
                className="w-full rounded-lg border border-line bg-surface px-1.5 py-1 text-xs outline-none focus:border-accent"
              >
                {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            )}
          </div>
          <button
            onClick={songRecs}
            disabled={recsBusy.endsWith("중…")}
            className="rounded-lg border border-accent px-4 py-1.5 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40"
          >
            추천 곡 생성
          </button>
        </div>
        <button
          onClick={musicReport}
          disabled={recsBusy.endsWith("중…")}
          className="rounded-lg border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          취향 리포트
          <br />
          생성
        </button>
        <button
          onClick={motifs}
          disabled={recsBusy.endsWith("중…")}
          className="rounded-lg border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          모티프
          <br />
          생성
        </button>
        <button
          onClick={async () => {
            setRecsBusy("흐름 분석 중…");
            try {
              const { links, songs: n } = await api("songThread", {});
              setRecsBusy(`흐름 분석됨 — 최근 ${n}곡, 연결 ${links}개 (재배포 후 반영)`);
            } catch (e) {
              setRecsBusy(`실패: ${e.message}`);
            }
          }}
          disabled={recsBusy.endsWith("중…")}
          className="rounded-lg border border-accent px-4 py-2 text-center text-sm font-semibold leading-tight text-accent hover:bg-accent hover:text-bg disabled:opacity-40 sm:min-w-32"
        >
          흐름
          <br />
          분석
        </button>
        <span className="col-span-2 text-xs text-muted sm:col-span-1">
          {recsBusy || "메타 재생성은 태그·코멘트까지 덮어씀 · 키워드 추출은 keywords/emotion만 채움"}
        </span>
      </div>
      <ul className="divide-y divide-line rounded-lg border border-line">
      {songs.map((s) => {
        const st = state[s.slug] || {};
        return (
          <li key={s.slug} className="px-3 py-2 text-sm">
            {/* title on its own line, actions underneath — the row ran out of
                width once there were five of them */}
            <div className="flex items-start gap-3">
              <img
                src={s.artwork.replace("600x600bb", "100x100bb")} // 36px slot needs no 600px source
                alt=""
                loading="lazy"
                className="h-9 w-9 shrink-0 rounded"
              />
              <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted"> — {s.artist}</span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                onClick={() => regenMeta(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "meta" ? "생성 중…" : "메타 재생성"}
              </button>
              <button
                onClick={() => regen(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "comment" ? "생성 중…" : "코멘트"}
              </button>
              <button
                onClick={() => notes(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "notes" ? "생성 중…" : "해설"}
              </button>
              <button
                onClick={() => restanza(s.slug)}
                disabled={!!st.busy}
                className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
              >
                {st.busy === "stanza" ? "정리 중…" : "연 정리"}
              </button>
              {!s.hasTranslation && (
                <button
                  onClick={() => addTrans(s.slug)}
                  disabled={!!st.busy}
                  className="shrink-0 text-xs text-accent hover:underline disabled:opacity-40"
                >
                  {st.busy === "trans" ? "번역 중…" : "번역 추가"}
                </button>
              )}
              <a href={`/admin/edit/${s.slug}`} className="shrink-0 text-xs text-muted hover:text-accent">
                수정
              </a>
              </div>
              </div>
            </div>
            <p className="mt-1 pl-12 text-xs text-muted">
              {st.err ? (
                <span className="text-red-400">{st.err}</span>
              ) : st.msg ? (
                <span className="text-accent">{st.msg}</span>
              ) : (
                st.comment ?? s.comment ?? "(코멘트 없음)"
              )}
            </p>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
